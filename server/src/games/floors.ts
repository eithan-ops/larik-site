/**
 * הקומות 🏢 — שרת. "הטלפון בעלים של הריצה, השרת בעלים של השעון."
 *
 * הלקוח מסמלץ את הדמות שלו (shared/floors.ts) ומדווח ב-10Hz; השרת סמכותי על ציר הזמן
 * (דקות ועצירות כ-cues), קו המוות, החיים והתחייה, הפגיעות (מגע/קליע/מלכודת), הניקוד,
 * הדראפט (6 קלפים לשחקן, שיעור לפי מיקום) והסיום.
 *
 * ציר הזמן: בחירת דמות → ספירה → [דקה → עצירה (הקפאה 3ש' · דראפט 10ש' · חשיפה 2ש')] × cycles → ספרינט 30ש' → סיום.
 * הכול נגזר מ-startAt + הקונפיג, כך שכל טלפון יודע לבד מתי הוא קופא.
 */
import type { GameCtx, GameInstance } from "../engine";
import type { GameClientMsg, GameServerMsg } from "../../../shared/protocol";
import {
  FL, FL_CARDS, FL_RARITY_W, flCard, flConfig, flMods, flRunStart, flRunEnd, flPauseMs, flKillRate, flFloorAt, flFloorY, flShout,
} from "../../../shared/floors";
import type { FlConfig, FlMods, FlCard, FlCardWire, FlPosWire, FloorsServerMsg } from "../../../shared/floors";

type Phase = "pick" | "intro" | "run" | "freeze" | "draft" | "reveal" | "over";

interface P {
  pid: string; c: number;
  x: number; y: number; dx: number; st: number; floor: number; combo: number;
  maxFloor: number; comboBonus: number; extra: number; scoreAtRun: number;
  lives: number; out: boolean; respawnAt: number; invulnUntil: number; lastReport: number; belowSince: number;
  cards: string[]; mods: FlMods;
  bestCombo: number; kills: number; falls: number;
  attackReadyAt: number; shieldReadyAt: number; propUsed: boolean;
}

export function createFloors(ctx: GameCtx): GameInstance {
  // FL_FAST=1 — פלייטסט מהיר (דקות של 12 שנ') לצילומי מסך ובוטים; לא משפיע על פרודקשן
  const fast = process.env.FL_FAST ? { cycles: 2, runMs: 12000, freezeMs: 2000, draftMs: 5000, revealMs: 1500, sprintMs: 8000, introMs: 2500, pickMs: 5000 } : {};
  const cfg: FlConfig = flConfig({ ...((ctx.config as object) ?? {}), ...fast });
  const ps = new Map<string, P>();
  let phase: Phase = "pick";
  let seed = "";
  let startAt = 0;
  let k = 0;                         // הדקה הנוכחית (cycles = ספרינט)
  let killY = -3 * FL.FLOOR_H;
  let level = 0;
  let graceUntil = 0;
  let loop: NodeJS.Timeout | null = null;
  let lastTick = 0;
  let token = 0;
  const drafts = new Map<string, string[]>();
  const picks = new Map<string, string>();
  const shots = new Map<number, { id: number; by: string; x: number; y: number; dx: number; at: number; hit: Set<string> }>();
  let nextShot = 1, nextTrap = 1;
  const pend = new Set<NodeJS.Timeout>();
  const now = () => ctx.now();
  // ההודעות של הקומות חיות ב-shared/floors.ts (לא באיחוד של protocol.ts) — לכן ההמרה כאן
  const bc = (d: FloorsServerMsg) => ctx.broadcast(d as unknown as GameServerMsg);
  const to = (pid: string, d: FloorsServerMsg) => ctx.sendTo(pid, d as unknown as GameServerMsg);
  const cue = (ms: number, d: FloorsServerMsg) => ctx.cue(ms, d as unknown as GameServerMsg);
  function later(ms: number, fn: () => void) { const t = ctx.timer(Math.max(0, ms), () => { pend.delete(t); fn(); }); pend.add(t); return t; }
  function at(target: number, fn: () => void) { const tk = token; later(target - now(), () => { if (token === tk) fn(); }); }
  const nameOf = (pid: string) => ctx.players().find((p) => p.id === pid)?.name ?? "?";
  const connected = (pid: string) => ctx.players().find((p) => p.id === pid)?.connected ?? false;
  const alive = () => [...ps.values()].filter((p) => !p.out);
  const score = (p: P) => p.maxFloor * 10 + p.comboBonus + p.extra;
  const timing = () => ({ cycles: cfg.cycles, runMs: cfg.runMs, freezeMs: cfg.freezeMs, draftMs: cfg.draftMs, revealMs: cfg.revealMs, sprintMs: cfg.sprintMs, introMs: cfg.introMs, pickMs: cfg.pickMs });
  const wire = (id: string): FlCardWire => { const c = flCard(id)!; return { id: c.id, ic: c.ic, t: c.t, d: c.d, r: c.rarity, k: c.kind }; };
  const ranked = () => [...ps.values()].sort((a, b) => score(b) - score(a) || b.maxFloor - a.maxFloor);
  const rankOf = (pid: string) => ranked().findIndex((p) => p.pid === pid);
  const third = () => Math.max(1, Math.ceil(ps.size / 3));

  function newP(pid: string, c: number): P {
    return {
      pid, c, x: FL.W / 2, y: 0, dx: 0, st: 0, floor: 0, combo: 0, maxFloor: 0, comboBonus: 0, extra: 0, scoreAtRun: 0,
      lives: FL.LIVES, out: false, respawnAt: 0, invulnUntil: 0, lastReport: 0, belowSince: 0,
      cards: [], mods: flMods([]), bestCombo: 0, kills: 0, falls: 0, attackReadyAt: 0, shieldReadyAt: 0, propUsed: false,
    };
  }

  /* ---------- בחירת דמות ---------- */
  const taken = (): Record<string, number> => Object.fromEntries([...ps.values()].filter((p) => p.c >= 0).map((p) => [p.pid, p.c]));
  function pickPhase() {
    phase = "pick";
    const until = now() + cfg.pickMs;
    bc({ a: "fl_pickphase", taken: taken(), until });
    later(cfg.pickMs, begin);
  }
  function autoAssign() {
    const used = new Set([...ps.values()].filter((p) => p.c >= 0).map((p) => p.c));
    for (const p of ps.values()) if (p.c < 0) { let c = 0; while (used.has(c) && c < 7) c++; used.add(c); p.c = c; }
  }

  /* ---------- התחלה וציר הזמן ---------- */
  function begin() {
    if (phase !== "pick") return;
    autoAssign();
    seed = cfg.seed ?? Math.random().toString(36).slice(2, 10);
    startAt = now() + cfg.introMs;
    k = 0; killY = -3 * FL.FLOOR_H; level = 0;
    phase = "intro";
    bc({ a: "fl_go", seed, startAt, cfg: timing(), chars: taken(), lives: Object.fromEntries([...ps.values()].map((p) => [p.pid, p.lives])) });
    at(startAt, () => startRun(0));
    lastTick = now();
    loop = ctx.timer(100, tick);
  }
  function startRun(kk: number) {
    k = kk; phase = "run";
    graceUntil = now() + FL.GRACE_MS;
    for (const p of ps.values()) p.scoreAtRun = score(p);
    if (kk > 0) {
      // הקלה אחרי העצירה: הקו מתחיל 6 קומות מתחת לאמצע החבורה
      killY = Math.min(killY, medianY() - 6 * FL.FLOOR_H);
    }
    const end = flRunEnd(cfg, startAt, kk);
    if (kk >= cfg.cycles) { at(end, finish); return; }
    // cue ההקפאה — כולם קופאים באותה מילישנייה
    at(end - 400, () => {
      const rank = ranked().map((p) => p.pid);
      cue(400, { a: "fl_freeze", k: kk, rank, scores: Object.fromEntries([...ps.values()].map((p) => [p.pid, score(p)])) });
    });
    at(end, () => { phase = "freeze"; underdogBonus(); });
    at(end + cfg.freezeMs, openDraft);
    at(end + cfg.freezeMs + cfg.draftMs - 400, () => {
      for (const pid of drafts.keys()) if (!picks.has(pid)) choose(pid, drafts.get(pid)![0], true);
      const resumeAt = end + flPauseMs(cfg);
      cue(400, { a: "fl_reveal", k: kk, picks: Object.fromEntries([...ps.keys()].map((pid) => [pid, picks.has(pid) ? wire(picks.get(pid)!) : null])), resumeAt });
    });
    at(end + cfg.freezeMs + cfg.draftMs, () => { phase = "reveal"; });
    at(end + flPauseMs(cfg), () => startRun(kk + 1));
  }
  function medianY(): number {
    const ys = alive().filter((p) => connected(p.pid)).map((p) => p.y).sort((a, b) => a - b);
    if (!ys.length) return killY + 6 * FL.FLOOR_H;
    return ys[Math.floor(ys.length / 2)];
  }
  function tick() {
    const t = now();
    const dt = Math.min(0.5, (t - lastTick) / 1000); lastTick = t;
    if (phase === "run") {
      const tin = t - flRunStart(cfg, startAt, k);
      const { rate, level: lv } = flKillRate(cfg, k, tin);
      level = lv;
      killY += rate * dt;
      // "כולם רואים את כולם": הקו לא נשאר יותר מ-9 קומות מתחת לאמצע החבורה
      killY = Math.max(killY, medianY() - 9 * FL.FLOOR_H);
      // רשת ביטחון: מי שמדווח מתחת לקו ולא שלח fl_fell — נופל בכל זאת
      for (const p of alive()) {
        if (p.respawnAt > t || !connected(p.pid)) continue;
        if (p.y < killY - FL.DEATH_BELOW - 120) { if (!p.belowSince) p.belowSince = t; else if (t - p.belowSince > 1500) fell(p); }
        else p.belowSince = 0;
      }
      for (const [id, s] of shots) if (t - s.at > FL.SHOT_LIFE * FL.TICK_MS + 2000) shots.delete(id);
    }
    const wire: FlPosWire[] = [...ps.values()].filter((p) => !p.out).map((p) => [p.pid, Math.round(p.x), Math.round(p.y), Math.round(p.dx * 10) / 10, p.st, p.floor, p.combo]);
    bc({ a: "fl_pos", ps: wire, kill: Math.round(killY), lvl: level, k });
    loop = ctx.timer(100, tick);
  }

  /* ---------- נפילה ותחייה ---------- */
  function fell(p: P) {
    if (p.out || p.respawnAt > now()) return;
    p.lives--; p.falls++; p.belowSince = 0; p.combo = 0;
    const floor = flFloorAt(killY) + FL.RESPAWN_ABOVE + 1;
    if (p.lives <= 0) {
      p.out = true;
      bc({ a: "fl_fell", pid: p.pid, lives: 0, respawnAt: 0, floor });
      bc({ a: "fl_out", pid: p.pid });
      return;
    }
    p.respawnAt = now() + FL.RESPAWN_MS;
    p.invulnUntil = p.respawnAt + FL.INVULN_MS;
    p.y = flFloorY(floor); p.floor = floor; p.st = 0; p.dx = 0;
    bc({ a: "fl_fell", pid: p.pid, lives: p.lives, respawnAt: p.respawnAt, floor });
  }

  /* ---------- פגיעות ---------- */
  function shieldAbsorbs(t: P): boolean {
    if (!t.mods.shield || now() < t.shieldReadyAt) return false;
    t.shieldReadyAt = now() + 20000;
    return true;
  }
  function hunterBonus(by: P, victim: P) {
    if (!by.mods.hunter) return;
    const r = rankOf(victim.pid);
    const mul = r === 0 ? 3 : r >= ps.size - third() ? 0 : 1;
    const amt = 50 * mul;
    if (amt > 0) { by.extra += amt; bc({ a: "fl_bonus", pid: by.pid, kind: "hunter", amount: amt }); }
  }
  function canAttack(by: P): boolean {
    const t = now();
    return phase === "run" && t >= graceUntil && t >= by.attackReadyAt && !by.out && by.respawnAt <= t;
  }
  function targetable(t: P): boolean { return !t.out && t.respawnAt <= now() && now() >= t.invulnUntil; }
  function hammer(by: P, target: P) {
    if (!by.mods.hammer || !canAttack(by) || !targetable(target) || target.pid === by.pid) return;
    const d = Math.hypot(by.x - target.x, by.y - target.y);
    if (d > FL.HAMMER_R + 90) return;
    by.attackReadyAt = now() + FL.ATTACK_CD_MS;
    if (shieldAbsorbs(target)) { bc({ a: "fl_shothit", id: 0, pid: target.pid, by: by.pid, shielded: true }); return; }
    by.kills++;
    target.invulnUntil = now() + 1500;
    bc({ a: "fl_hit", by: by.pid, target: target.pid, kind: "hammer", dir: Math.sign(target.x - by.x) || 1 });
    hunterBonus(by, target);
  }
  function shoot(by: P, x: number, y: number, dx: number) {
    if (!by.mods.snowball || !canAttack(by)) return;
    by.attackReadyAt = now() + Math.min(FL.ATTACK_CD_MS, flCard("snow")!.cd ?? 4000);
    const id = nextShot++;
    const s = { id, by: by.pid, x, y, dx: Math.sign(dx) * FL.SHOT_V || FL.SHOT_V, at: now(), hit: new Set<string>() };
    shots.set(id, s);
    bc({ a: "fl_shot", id, by: by.pid, x: s.x, y: s.y, dx: s.dx, at: s.at });
  }
  function shotHit(victim: P, id: number) {
    const s = shots.get(id);
    if (!s || s.by === victim.pid || s.hit.has(victim.pid) || !targetable(victim)) return;
    s.hit.add(victim.pid);
    const by = ps.get(s.by);
    if (shieldAbsorbs(victim)) { bc({ a: "fl_shothit", id, pid: victim.pid, by: s.by, shielded: true }); return; }
    bc({ a: "fl_shothit", id, pid: victim.pid, by: s.by, shielded: false });
    if (by) { by.kills++; hunterBonus(by, victim); }
  }
  function trap(by: P, floor: number) {
    if (!by.mods.banana || phase !== "run" || by.out) return;
    if (Math.abs(floor - by.floor) > 3) return;
    const until = now() + FL.BANANA_MS;
    bc({ a: "fl_trap", id: nextTrap++, by: by.pid, floor, until });
  }

  /* ---------- דראפט ---------- */
  function offer(p: P): string[] {
    const owned = new Set(p.cards);
    const r = rankOf(p.pid), n = ps.size;
    const low = r >= n - third(), high = r === 0 && n > 1;
    const pool = FL_CARDS.filter((c) => c.stack || !owned.has(c.id));
    const weight = (c: FlCard) => {
      let w = FL_RARITY_W[c.rarity];
      if (c.rarity === "r" && k < 2) w = 0;
      if (c.pos === "low") w *= low ? 3 : high ? 0.3 : 1;
      if (c.pos === "high") w *= high ? 3 : low ? 0.3 : 1;
      if (c.id === "life" && p.lives >= FL.LIVES_MAX) w = 0;
      return w;
    };
    // כיסוי קטגוריות: תנועה, תנועה/קפיצה, תקיפה/מלכודת, הגנה/קומבו, חופשי, חופשי
    const buckets: string[][] = [["A"], ["B"], ["C", "D", "E"], ["F", "G"], [], []];
    const out: string[] = [];
    for (const cats of buckets) {
      const cand = pool.filter((c) => !out.includes(c.id) && (cats.length === 0 || cats.includes(c.cat)) && weight(c) > 0);
      const list = cand.length ? cand : pool.filter((c) => !out.includes(c.id) && weight(c) > 0);
      if (!list.length) break;
      let tot = 0; for (const c of list) tot += weight(c);
      let x = Math.random() * tot;
      let chosen = list[list.length - 1];
      for (const c of list) { x -= weight(c); if (x <= 0) { chosen = c; break; } }
      out.push(chosen.id);
    }
    return out;
  }
  function openDraft() {
    phase = "draft";
    drafts.clear(); picks.clear();
    const until = now() + cfg.draftMs;
    for (const p of ps.values()) {
      if (!connected(p.pid)) continue;
      const cards = offer(p);
      drafts.set(p.pid, cards);
      to(p.pid, { a: "fl_draft", k, cards: cards.map(wire), until });
    }
  }
  function choose(pid: string, id: string, auto = false) {
    const p = ps.get(pid);
    if (!p || phase !== "draft" || !drafts.has(pid) || picks.has(pid)) return;
    if (!drafts.get(pid)!.includes(id)) return;
    picks.set(pid, id);
    p.cards.push(id);
    p.mods = flMods(p.cards);
    if (id === "life") p.lives = Math.min(FL.LIVES_MAX, p.lives + 1);
    if (!auto) bc({ a: "fl_took", pid, card: wire(id) });
  }
  function underdogBonus() {
    const r = ranked();
    const n = r.length;
    r.forEach((p, i) => {
      if (!p.mods.underdog || i < n - third()) return;
      const gained = Math.max(0, score(p) - p.scoreAtRun);
      const amt = Math.round(gained * 0.5);
      if (amt > 0) { p.extra += amt; bc({ a: "fl_bonus", pid: p.pid, kind: "underdog", amount: amt }); }
    });
  }

  /* ---------- סיום ---------- */
  function finish() {
    if (phase === "over") return;
    phase = "over"; token++;
    if (loop) { clearTimeout(loop); loop = null; }
    const rows = ranked().map((p) => ({ pid: p.pid, score: score(p), maxFloor: p.maxFloor, bestCombo: p.bestCombo, kills: p.kills, falls: p.falls, c: p.c, cards: [...p.cards] }));
    const titles: { pid: string; ic: string; t: string }[] = [];
    const by = <T>(f: (p: P) => number, ic: string, t: string, min = 1) => { const b = [...ps.values()].sort((a, c) => f(c) - f(a))[0]; if (b && f(b) >= min && !titles.some((x) => x.pid === b.pid)) titles.push({ pid: b.pid, ic, t }); };
    by((p) => p.maxFloor, "🏔️", "הכי גבוה");
    by((p) => p.bestCombo, "🔗", "הקומבו הארוך", 4);
    by((p) => p.kills, "🎯", "הצייד", 1);
    by((p) => p.falls, "🤡", "הליצן", 2);
    bc({ a: "fl_over", rows, titles });
    // מסך התוצאות של המשחק נשאר 7 שניות (לצלם/לצעוק) ורק אז הטקס של החדר
    later(cfg.runMs < 20000 ? 1500 : 7000, () => endRoom(rows, titles));
  }
  function endRoom(rows: { pid: string; score: number; maxFloor: number }[], titles: { pid: string; ic: string; t: string }[]) {
    const facts: Record<string, Record<string, number>> = {};
    for (const p of ps.values()) facts[p.pid] = { flFloor: p.maxFloor, flCombo: p.bestCombo, flKills: p.kills, flFalls: p.falls };
    const w = rows[0];
    const clown = titles.find((t) => t.ic === "🤡");
    ctx.end({
      title: w ? `🏢 הקומות — ${nameOf(w.pid)} הגיע לקומה ${w.maxFloor}` : "🏢 הקומות",
      winnerId: w?.pid, loserId: clown?.pid,
      scores: Object.fromEntries(rows.map((r) => [r.pid, r.score])),
      facts: facts as any,
    });
  }

  function sync(pid: string) {
    const p = ps.get(pid);
    to(pid, {
      a: "fl_sync", phase, seed, startAt, cfg: timing(), chars: taken(),
      lives: Object.fromEntries([...ps.values()].map((q) => [q.pid, q.lives])),
      cards: Object.fromEntries([...ps.values()].map((q) => [q.pid, [...q.cards]])),
      k, you: { floor: p ? Math.max(p.floor, flFloorAt(killY) + 3) : 0, out: p?.out ?? true },
    });
  }

  return {
    onStart() {
      for (const p of ctx.participants()) if (p.connected) ps.set(p.id, newP(p.id, -1));
      pickPhase();
    },
    onMessage(pid, d0: GameClientMsg) {
      const d = d0 as any;
      if (typeof d?.a !== "string" || !d.a.startsWith("fl_")) return;
      const p = ps.get(pid);
      if (!p) return;
      switch (d.a) {
        case "fl_char": {
          if (phase !== "pick") return;
          const c = Number(d.c);
          if (!Number.isInteger(c) || c < 0 || c > 7) return;
          if ([...ps.values()].some((q) => q.pid !== pid && q.c === c)) return;
          p.c = c;
          bc({ a: "fl_pickphase", taken: taken(), until: 0 });
          if ([...ps.values()].every((q) => q.c >= 0 || !connected(q.pid))) later(800, begin);
          return;
        }
        case "fl_state": {
          if (p.out) return;
          const t = now();
          p.x = Number(d.x) || 0; p.y = Number(d.y) || 0; p.dx = Number(d.dx) || 0; p.st = Number(d.st) || 0;
          p.floor = Math.max(0, Number(d.fl) || 0); p.combo = Math.max(0, Number(d.c) || 0);
          const mf = Math.min(Number(d.mf) || 0, flFloorAt(p.y) + 1);
          if (mf > p.maxFloor) p.maxFloor = mf;
          p.lastReport = t;
          return;
        }
        case "fl_combo": {
          const n = Math.floor(Number(d.n) || 0);
          if (n < 2 || n > 120) return;
          const expect = Math.round(n * n * p.mods.comboMul);
          const bonus = Math.min(Number(d.bonus) || 0, expect);
          p.comboBonus += bonus;
          if (n > p.bestCombo) p.bestCombo = n;
          const text = flShout(n);
          if (text) bc({ a: "fl_shout", pid, n, bonus, text });
          return;
        }
        case "fl_fell": fell(p); return;
        case "fl_prop": { if (p.mods.propeller && !p.propUsed) p.propUsed = true; return; }
        case "fl_hit": { const t = ps.get(String(d.target)); if (t && d.kind === "hammer") hammer(p, t); return; }
        case "fl_shot": shoot(p, Number(d.x) || p.x, Number(d.y) || p.y, Number(d.dx) || 1); return;
        case "fl_hitme": shotHit(p, Number(d.shot)); return;
        case "fl_trap": trap(p, Math.floor(Number(d.floor) || 0)); return;
        case "fl_pick": choose(pid, String(d.card)); return;
      }
    },
    onLeave(pid, permanent) {
      const p = ps.get(pid);
      if (!p || !permanent) return;
      p.out = true;
      bc({ a: "fl_out", pid });
    },
    onRejoin(pid) { sync(pid); },
    dispose() { token++; if (loop) clearTimeout(loop); for (const t of pend) clearTimeout(t); pend.clear(); },
  };
}
