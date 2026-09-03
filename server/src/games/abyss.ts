/**
 * התהום 🕳️ — שרת. "הטלפון בעלים של הנפילה, השרת בעלים של המדף."
 *
 * הלקוח מסמלץ את הנפילה שלו (x, פגיעות, גבישים) ומדווח; השרת סמכותי על ציר הזמן (cues),
 * ההצבעות, המכפילים, הבנקאות, הקרן, הזריקות, הבונוסים, הדראפט והסיום.
 * כל ציר הזמן נגזר מ-startAt + קונפיג (shared/abyss.ts) — כל טלפון יודע לבד מתי הוא קופא.
 *
 * מבנה: descent (צניחה) = פלחים k=0.. שכל אחד נגמר במדף → הצבעה סודית → חשיפה מסונכרנת.
 */
import type { GameCtx, GameInstance } from "../engine";
import type { GameClientMsg, AbyssCard, AbThrowWire, AbPlayerState, PlayerFacts } from "../../../shared/protocol";
import {
  AB, abConfig, abTiming, abFreezeAt, abRevealAt, abResumeAt, abFallStart, abDepthAt, abLedgeDepth,
  abWorld, abAvailableValue, abMult, abPotBounty, AB_CARDS, abPerkMods,
} from "../../../shared/abyss";
import type { AbyssConfig, AbWorld } from "../../../shared/abyss";

type Phase = "intro" | "fall" | "ledge" | "reveal" | "results" | "draft" | "over";
type Vote = "stop" | "go";

interface Faller {
  pid: string;
  state: AbPlayerState;
  x: number; crystals: number; shield: number;
  lastReportAt: number;
  vote?: Vote;
  stoppedK: number; caughtK: number;
  bankedD: number;           // בנקאות בצניחה הנוכחית (כולל בונוסים)
  potWon: number;
  bonusD: number;            // בונוסי צייד/עזרה בצניחה הנוכחית
  helpers: Map<string, number>;   // מי שהעזרה שלו נאספה מאז המדף הקודם
  burstCredits: number;      // גבישים מפרצים — מרחיבים את תקרת הסבירות
  throwReadyAt: number; nextIntakeAt: number; queued: number;
  suspicious: number;
}

export function createAbyss(ctx: GameCtx): GameInstance {
  const cfg: AbyssConfig = abConfig(ctx.config);
  const timing = abTiming(cfg);
  const fallers = new Map<string, Faller>();
  const totals: Record<string, number> = {};
  const perks: Record<string, string[]> = {};
  const deepest: Record<string, number> = {};
  const best: Record<string, number> = {};
  const pots: Record<string, number> = {};
  const caughtN: Record<string, number> = {};
  const hunts: Record<string, number> = {};
  const helps: Record<string, number> = {};
  const stops: Record<string, number> = {};
  const goes: Record<string, number> = {};

  let phase: Phase = "intro";
  let d = 0;                       // אינדקס הצניחה
  let seed = "";
  let world: AbWorld | null = null;
  let startAt = 0;
  let k = 0;                       // הפלח הנוכחי
  let pot = 0, potLost = 0;
  let potRunner = "", potSeg = false;
  let token = 0;
  let loop: NodeJS.Timeout | null = null;
  const throws = new Map<number, AbThrowWire>();
  let nextThrowId = 1;
  const drafts = new Map<string, string[]>();
  const picked = new Set<string>();
  let draftTimer: NodeJS.Timeout | null = null;

  const pend = new Set<NodeJS.Timeout>();
  function later(ms: number, fn: () => void) {
    const t = ctx.timer(Math.max(0, ms), () => { pend.delete(t); fn(); });
    pend.add(t); return t;
  }
  /** טיימר שמור ב-token — אם הצניחה נגמרה/אופסה, הוא מת בשקט */
  function at(target: number, fn: () => void) {
    const tk = token;
    later(target - ctx.now(), () => { if (token === tk) fn(); });
  }
  const now = () => ctx.now();
  const nameOf = (pid: string) => ctx.players().find((p) => p.id === pid)?.name ?? "?";
  const connected = (pid: string) => ctx.players().find((p) => p.id === pid)?.connected ?? false;
  const falling = () => [...fallers.values()].filter((f) => f.state === "falling");
  const eligible = () => [...fallers.values()].filter((f) => f.state !== "out");
  const mods = (pid: string) => abPerkMods(perks[pid]);
  const freezeAt = (kk: number) => abFreezeAt(timing, startAt, kk);
  const revealAt = (kk: number) => abRevealAt(timing, startAt, kk);
  const resumeAt = (kk: number) => abResumeAt(timing, startAt, kk);

  function newFaller(pid: string, state: AbPlayerState): Faller {
    return {
      pid, state, x: 50, crystals: 0, shield: 0, lastReportAt: 0,
      stoppedK: -1, caughtK: -1, bankedD: 0, potWon: 0, bonusD: 0, helpers: new Map(), burstCredits: 0,
      throwReadyAt: 0, nextIntakeAt: 0, queued: 0, suspicious: 0,
    };
  }
  function ensure(pid: string, state: AbPlayerState): Faller {
    let f = fallers.get(pid);
    if (!f) { f = newFaller(pid, state); fallers.set(pid, f); }
    totals[pid] ??= 0; perks[pid] ??= []; deepest[pid] ??= 0; best[pid] ??= 0; pots[pid] ??= 0;
    caughtN[pid] ??= 0; hunts[pid] ??= 0; helps[pid] ??= 0; stops[pid] ??= 0; goes[pid] ??= 0;
    return f;
  }
  function bank(f: Faller, amt: number) {
    if (amt <= 0) return;
    f.bankedD += amt; totals[f.pid] = (totals[f.pid] ?? 0) + amt;
  }

  /* ---------- צניחה ---------- */
  function startDescent(idx: number) {
    d = idx; token++;
    seed = cfg.seed ? `${cfg.seed}:${idx}` : Math.random().toString(36).slice(2, 10);
    world = abWorld(seed, timing);
    for (const f of fallers.values()) {
      if (f.state === "out") continue;
      f.state = "falling";
      f.x = 50; f.crystals = 0; f.shield = mods(f.pid).shieldStart; f.vote = undefined;
      f.stoppedK = -1; f.caughtK = -1; f.bankedD = 0; f.potWon = 0; f.bonusD = 0;
      f.helpers.clear(); f.burstCredits = 0; f.nextIntakeAt = 0; f.queued = 0;
    }
    throws.clear();
    pot = 0; potLost = 0; potRunner = ""; potSeg = false; k = 0;
    startAt = now() + cfg.introMs;
    for (const f of fallers.values()) f.lastReportAt = startAt;
    phase = "intro";
    ctx.broadcast({
      a: "ab_descent", d, of: cfg.descents, seed, startAt, cfg: timing, mult: [...AB.MULT],
      players: eligible().map((f) => [f.pid, f.state === "falling" ? "fall" : "spec"] as [string, "fall" | "spec"]),
      perks: { ...perks }, totals: { ...totals },
    });
    at(startAt, () => { phase = "fall"; });
    scheduleLedge(0);
    if (loop) clearTimeout(loop);
    loop = ctx.timer(100, tick);
  }

  function scheduleLedge(kk: number) {
    const warnAt = freezeAt(kk) - cfg.warnMs;
    // ה-cue צריך ‎≥350ms קדימה כדי לצאת בדיוק ב-warnAt
    at(warnAt - 450, () => {
      ctx.cue(warnAt - now(), {
        a: "ab_ledge", k: kk, freezeAt: freezeAt(kk), voteUntil: freezeAt(kk) + cfg.voteMs,
        revealAt: revealAt(kk), resumeAt: resumeAt(kk), pot, mult: abMult(kk),
        falling: falling().map((f) => f.pid), potSeg,
      });
    });
    at(freezeAt(kk), () => { phase = "ledge"; });
    at(freezeAt(kk) + cfg.voteMs + AB.GRACE_MS + 50, () => resolveLedge(kk));
  }

  function resolveLedge(kk: number) {
    if (phase !== "ledge" && phase !== "fall") return;
    const bottom = kk >= cfg.maxLedges - 1;
    const votes: Record<string, "stop" | "go" | "caught" | "pot"> = {};
    const banked: Record<string, number> = {};
    const bonus: Record<string, number> = {};
    let potWon: { pid: string; amount: number } | undefined;
    const wasFalling = falling();

    for (const f of fallers.values()) {
      if (f.state === "caught" && f.caughtK === kk) votes[f.pid] = "caught";
    }
    for (const f of wasFalling) {
      deepest[f.pid] = Math.max(deepest[f.pid] ?? 0, kk);
      if (potSeg && f.pid === potRunner) {
        // שרד את פלח הקרן — לוקח הכול
        const amt = pot + Math.round(f.crystals * abMult(kk));
        f.potWon = pot; pots[f.pid]++;
        bank(f, amt); banked[f.pid] = amt; f.crystals = 0;
        f.state = "stopped"; f.stoppedK = kk; votes[f.pid] = "pot";
        potWon = { pid: f.pid, amount: amt };
        pot = 0;
        payHelpers(f, amt, bonus);
        continue;
      }
      // שקט = לא דיווח כלום ב-staleMs שלפני ההקפאה (בזמן ההקפאה הלקוח לא מדווח בכוונה)
      const silent = !connected(f.pid) || f.lastReportAt < freezeAt(kk) - cfg.staleMs;
      const v: Vote = f.vote ?? (silent || bottom ? "stop" : "go");
      votes[f.pid] = v;
      if (v === "stop") {
        const amt = Math.round(f.crystals * abMult(kk));
        bank(f, amt); banked[f.pid] = amt; best[f.pid] = Math.max(best[f.pid] ?? 0, amt);
        f.crystals = 0; f.state = "stopped"; f.stoppedK = kk; stops[f.pid]++;
        payHelpers(f, amt, bonus);
      } else {
        goes[f.pid]++;
      }
      f.vote = undefined;
    }
    if (!potSeg) pot += abPotBounty(kk);

    const C = falling();
    let next: "fall" | "pot" | "end";
    let swallowed: number | undefined;
    if (potSeg) {
      // פלח הקרן הסתיים — או שהרץ לקח (למעלה) או שהוא נפל לפני המדף
      next = "end";
      if (pot > 0) { swallowed = pot; potLost += pot; pot = 0; }
      potSeg = false;
    } else if (C.length === 0) {
      next = "end"; swallowed = pot; potLost += pot; pot = 0;
    } else if (C.length === 1) {
      next = "pot"; potRunner = C[0].pid; potSeg = true;
    } else {
      next = "fall";
    }
    phase = "reveal";
    ctx.cue(revealAt(kk) - now(), {
      a: "ab_reveal", k: kk, votes, banked, bonus, pot, potRunner: potSeg ? potRunner : undefined, potWon,
      next, swallowed, resumeAt: resumeAt(kk),
    });
    if (next === "end") {
      at(revealAt(kk) + cfg.revealShowMs, () => endDescent());
    } else {
      at(resumeAt(kk), () => { phase = "fall"; k = kk + 1; });
      scheduleLedge(kk + 1);
    }
  }

  function payHelpers(f: Faller, amt: number, bonus: Record<string, number>) {
    for (const [h] of f.helpers) {
      const hf = fallers.get(h); if (!hf || h === f.pid) continue;
      const b = Math.round(amt * mods(h).helpPct);
      if (b <= 0) continue;
      bank(hf, b); hf.bonusD += b; helps[h]++;
      bonus[h] = (bonus[h] ?? 0) + b;
      ctx.broadcast({ a: "ab_bonus", pid: h, kind: "help", amount: b, from: f.pid });
    }
    f.helpers.clear();
  }

  function caught(f: Faller, why: "hit" | "lost" | "left", o?: number, th?: number) {
    if (f.state !== "falling") return;
    f.state = "caught"; f.caughtK = k; caughtN[f.pid]++;
    const lost = f.crystals; f.crystals = 0;
    pot += lost;
    let by: string | undefined;
    const thrown = th !== undefined ? throws.get(th) : undefined;
    if (thrown && thrown.kind === "trap" && thrown.by !== f.pid && thrown.target === f.pid) {
      by = thrown.by;
      const hf = fallers.get(by);
      const hb = Math.round(lost * mods(by).huntPct);
      if (hf && hb > 0) {
        bank(hf, hb); hf.bonusD += hb; hunts[by]++;
        ctx.broadcast({ a: "ab_bonus", pid: by, kind: "hunter", amount: hb, from: f.pid });
      }
    }
    ctx.broadcast({ a: "ab_caught", pid: f.pid, k, lost, pot, by, th, why });
    if (phase !== "fall") return;   // במדף/חשיפה — resolveLedge יטפל בסיום
    if (potSeg && f.pid === potRunner) {
      ctx.broadcast({ a: "ab_swallow", pot, pid: f.pid });
      potLost += pot; pot = 0; potSeg = false;
      token++; later(2500, () => endDescent());
    } else if (falling().length === 0) {
      potLost += pot; pot = 0;
      token++; later(1500, () => endDescent());
    }
  }

  function tick() {
    if (phase === "results" || phase === "draft" || phase === "over") { loop = null; return; }
    const t = now();
    if (phase === "fall") {
      for (const f of falling()) {
        if (t - Math.max(f.lastReportAt, abFallStart(timing, startAt, k)) > cfg.staleMs) caught(f, "lost");
      }
    }
    const ps = falling().map((f) => [f.pid, Math.round(f.x * 10) / 10, Math.round(f.crystals), f.shield] as [string, number, number, number]);
    ctx.broadcast({ a: "ab_pos", ps });
    loop = ctx.timer(100, tick);
  }

  function endDescent() {
    if (phase === "results" || phase === "over") return;
    phase = "results"; token++;
    if (loop) { clearTimeout(loop); loop = null; }
    // at = המדף שבו יצא: עצר במדף k → k; נתפס בפלח k → k (עם caught=true)
    const rows = eligible().filter((f) => f.state !== "spectator").map((f) => ({
      pid: f.pid, banked: f.bankedD, at: f.stoppedK >= 0 ? f.stoppedK : f.caughtK, caught: f.caughtK >= 0, pot: f.potWon, bonus: f.bonusD,
    }));
    ctx.broadcast({ a: "ab_results", d, of: cfg.descents, rows, totals: { ...totals }, potLost });
    if (cfg.seed) ctx.reportDaily({ seed: cfg.seed, wave: Math.max(0, ...Object.values(deepest)) + 1, scores: { ...totals } });
    const last = d + 1 >= cfg.descents;
    later(last ? cfg.resultsMs * 2 : cfg.resultsMs, () => { if (!last) openDraft(); else finish(); });   // בסוף יש זמן לשתף את מפת הפיר
  }

  /* ---------- דראפט ---------- */
  const cardMsg = (id: string): AbyssCard => {
    const c = AB_CARDS.find((x) => x.id === id)!;
    return { id: c.id, ic: c.ic, t: c.t, d: c.d };
  };
  function offer(pid: string): string[] {
    const owned = perks[pid] ?? [];
    const pool = AB_CARDS.filter((c) => c.id === "greed" || c.id === "magnet" || !owned.includes(c.id));
    const scored = pool.map((c) => ({ c, s: Math.random() }));
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 3).map((x) => x.c.id);
  }
  function openDraft() {
    phase = "draft";
    drafts.clear(); picked.clear();
    const ids = eligible().filter((f) => connected(f.pid)).map((f) => f.pid);
    if (ids.length === 0) { later(1200, () => startDescent(d + 1)); return; }
    for (const pid of ids) {
      const cards = offer(pid);
      drafts.set(pid, cards);
      ctx.sendTo(pid, { a: "ab_draft", cards: cards.map(cardMsg), ms: cfg.draftMs });
    }
    ctx.broadcast({ a: "ab_draftopen", ids });
    draftTimer = ctx.timer(cfg.draftMs + 500, () => {
      for (const pid of drafts.keys()) if (!picked.has(pid)) choose(pid, drafts.get(pid)![0]);
    });
  }
  function choose(pid: string, id: string) {
    if (phase !== "draft" || !drafts.has(pid) || picked.has(pid)) return;
    if (!drafts.get(pid)!.includes(id)) return;
    picked.add(pid);
    perks[pid] = [...(perks[pid] ?? []), id];
    ctx.broadcast({ a: "ab_took", pid, card: cardMsg(id) });
    ctx.broadcast({ a: "ab_perks", pid, perks: perks[pid] });
    if (picked.size >= drafts.size) {
      if (draftTimer) clearTimeout(draftTimer);
      later(1600, () => startDescent(d + 1));
    }
  }

  /* ---------- סיום ---------- */
  function finish() {
    phase = "over";
    const order = Object.entries(totals).filter(([pid]) => fallers.get(pid)?.state !== "spectator").sort((a, b) => b[1] - a[1]);
    const winner = order[0];
    const zeros = order.filter(([pid, t]) => t === 0 && (caughtN[pid] ?? 0) >= 1);
    const facts: Record<string, PlayerFacts> = {};
    for (const [pid, total] of order) {
      facts[pid] = {
        points: total, abBanked: total, abBest: best[pid] ?? 0, abLedge: deepest[pid] ?? 0, abPots: pots[pid] ?? 0,
        abCaught: caughtN[pid] ?? 0, abHunts: hunts[pid] ?? 0, abHelps: helps[pid] ?? 0, abStops: stops[pid] ?? 0, abGoes: goes[pid] ?? 0,
      };
    }
    ctx.end({
      title: winner ? `🕳️ התהום — ${nameOf(winner[0])} העלה ${winner[1].toLocaleString("he-IL")} גבישים` : "🕳️ התהום",
      winnerId: winner?.[0],
      loserId: zeros.length === 1 ? zeros[0][0] : undefined,
      scores: Object.fromEntries(order),
      facts,
      daily: cfg.seed ? { seed: cfg.seed, wave: Math.max(0, ...Object.values(deepest)) + 1 } : undefined,
    });
  }

  /* ---------- זריקות ---------- */
  function inject(by: string, target: string, kind: "trap" | "shield" | "burst", id: number) {
    const ft = fallers.get(target);
    if (!ft || ft.state !== "falling" || phase !== "fall") return;
    const t = now();
    if (t > freezeAt(k) - cfg.throwBlockMs) return;
    const landAt = t + cfg.throwLeadMs;
    const dep = abDepthAt(timing, startAt, landAt).depth;
    if (dep >= abLedgeDepth(timing, k) - AB.BOTTOM_CLEAR) return;
    const obj: AbThrowWire = { id, by, target, kind, d: dep, x: ft.x, at: t };
    throws.set(id, obj);
    ctx.broadcast({ a: "ab_throw", ...obj });
  }
  function onThrow(pid: string, target: string, kind: "trap" | "shield" | "burst") {
    const f = fallers.get(pid);
    const fail = (reason: "cooldown" | "busy" | "ledge" | "target" | "falling") => ctx.sendTo(pid, { a: "ab_throwfail", reason });
    if (!f || f.state === "falling") return fail("falling");
    const ft = fallers.get(target);
    if (!ft || ft.state !== "falling" || target === pid) return fail("target");
    const t = now();
    if (t < f.throwReadyAt) return fail("cooldown");
    if (phase !== "fall" || t > freezeAt(k) - cfg.throwBlockMs) return fail("ledge");
    if (ft.queued >= AB.THROW_QUEUE_MAX) return fail("busy");
    const id = nextThrowId++;
    f.throwReadyAt = t + Math.round(cfg.throwCdMs * mods(pid).cdMul);
    ctx.sendTo(pid, { a: "ab_throwok", id, readyAt: f.throwReadyAt });
    const slot = Math.max(t, ft.nextIntakeAt);
    ft.nextIntakeAt = slot + cfg.intakeMs;
    if (slot > t) {
      ft.queued++;
      at(slot, () => { ft.queued = Math.max(0, ft.queued - 1); inject(pid, target, kind, id); });
    } else inject(pid, target, kind, id);
  }

  /* ---------- sync ---------- */
  function sync(pid: string) {
    const me = fallers.get(pid);
    const depth = abDepthAt(timing, startAt, now()).depth;
    ctx.sendTo(pid, {
      a: "ab_sync", phase, d, of: cfg.descents, seed, startAt, cfg: timing, mult: [...AB.MULT], k, pot, potRunner, potSeg,
      players: eligible().map((f) => ({ pid: f.pid, state: f.state, x: f.x, c: f.crystals, s: f.shield, banked: f.bankedD })),
      totals: { ...totals }, perks: { ...perks },
      you: me ? { state: me.state === "out" ? "spectator" : me.state, x: me.x, c: me.crystals, s: me.shield, invulnMs: me.state === "falling" ? 1000 : 0 }
              : { state: "spectator", x: 50, c: 0, s: 0, invulnMs: 0 },
      throws: [...throws.values()].filter((th) => th.d > depth - 40),
    });
  }

  return {
    allowMidJoin: true,

    onStart() {
      for (const p of ctx.participants()) if (p.connected) ensure(p.id, "falling");
      startDescent(0);
    },

    onMessage(pid, d0: GameClientMsg) {
      const m = d0 as { a: string; [key: string]: unknown };
      const f = fallers.get(pid);
      switch (m.a) {
        case "ab_state": {
          if (!f || f.state !== "falling" || !world) return;
          const x = Number(m.x), dd = Number(m.d), c = Number(m.c), s = Number(m.s);
          if (!Number.isFinite(x)) return;
          f.x = Math.max(0, Math.min(AB.W, x));
          f.lastReportAt = now();
          const expected = abDepthAt(timing, startAt, f.lastReportAt).depth;
          if (Number.isFinite(dd) && Math.abs(dd - expected) > 220) f.suspicious++;
          if (Number.isFinite(c)) {
            const maxC = Math.round(abAvailableValue(world, expected) * mods(pid).valueMul) + f.burstCredits;
            f.crystals = Math.max(0, Math.min(Math.round(c), maxC));
          }
          if (Number.isFinite(s)) f.shield = Math.max(0, Math.min(2, Math.round(s)));
          return;
        }
        case "ab_caught": {
          if (!f || f.state !== "falling" || (phase !== "fall" && phase !== "ledge")) return;
          caught(f, "hit", typeof m.o === "number" ? m.o : undefined, typeof m.th === "number" ? m.th : undefined);
          return;
        }
        case "ab_shielded": {
          if (!f || f.state !== "falling") return;
          f.shield = Math.max(0, f.shield - 1);
          ctx.broadcast({ a: "ab_shielded", pid });
          return;
        }
        case "ab_took": {
          if (!f || f.state !== "falling") return;
          const th = throws.get(Number(m.th));
          if (!th || th.target !== pid || th.kind === "trap") return;
          if (th.by !== pid) f.helpers.set(th.by, (f.helpers.get(th.by) ?? 0) + 1);
          if (th.kind === "burst") f.burstCredits += AB.BURST_N * AB.BURST_VAL;
          else f.shield = Math.min(2, f.shield + 1);
          throws.delete(th.id);
          return;
        }
        case "ab_vote": {
          if (!f || f.state !== "falling") return;
          if (m.k !== k || (m.v !== "stop" && m.v !== "go")) return;
          const t = now();
          if (t < freezeAt(k) - AB.GRACE_MS || t > freezeAt(k) + cfg.voteMs + AB.GRACE_MS) return;
          f.vote = m.v;
          const fl = falling();
          ctx.broadcast({ a: "ab_votes", n: fl.filter((x) => x.vote).length, of: fl.length });
          return;
        }
        case "ab_throw": {
          const kind = m.kind;
          if (kind !== "trap" && kind !== "shield" && kind !== "burst") return;
          if (typeof m.target !== "string") return;
          onThrow(pid, m.target, kind);
          return;
        }
        case "ab_watch": return;
        case "ab_pick": {
          if (typeof m.card === "string") choose(pid, m.card);
          return;
        }
      }
    },

    onRejoin(pid) {
      if (phase === "over") return;
      let f = fallers.get(pid);
      if (!f) {
        f = ensure(pid, "spectator");
        if (phase === "draft" && !drafts.has(pid)) {
          const cards = offer(pid); drafts.set(pid, cards);
          ctx.sendTo(pid, { a: "ab_draft", cards: cards.map(cardMsg), ms: cfg.draftMs });
        }
      } else if (f.state === "out") {
        f.state = "spectator";
      }
      if (f.state === "falling") f.lastReportAt = now();
      sync(pid);
      if (phase === "draft" && drafts.has(pid) && !picked.has(pid)) {
        ctx.sendTo(pid, { a: "ab_draft", cards: drafts.get(pid)!.map(cardMsg), ms: Math.max(1500, cfg.draftMs - 2000) });
      }
    },

    onLeave(pid, permanent) {
      const f = fallers.get(pid);
      if (!f || !permanent) return;
      if (f.state === "falling") caught(f, "left");
      f.state = "out";
      ctx.broadcast({ a: "ab_left", pid });
      if (phase === "draft" && drafts.has(pid) && !picked.has(pid)) choose(pid, drafts.get(pid)![0]);
    },

    dispose() {
      if (loop) clearTimeout(loop);
      if (draftTimer) clearTimeout(draftTimer);
      for (const t of pend) clearTimeout(t);
      pend.clear();
    },
  };
}
