/**
 * מטרונובול 🎾 — שרת. "כל הכדורים נוחתים יחד."
 *
 * ציר הזמן: בחירת צבע → [סבב: הקובע מכוון 10 שנ' (כולם שומעים) → 3-2-1 → השוואה 30 שנ' → טבלה 6 שנ'] × (שחקנים × סבבים) → סיום.
 * סולו: אין קובע — השרת מגריל רמה, 5 שנ' הקשבה, ואז 30 שנ' הקשות; רמה חדשה כל סבב.
 * השרת סמכותי על הניקוד: מקבל הקשות בזמן-שרת, מריץ את אותו מודל טאפ-טמפו כמו הלקוח (shared/metro.ts),
 * ושופט כל פעימה של המנהיג 260ms אחרי שהיא קרתה.
 */
import type { GameCtx, GameInstance } from "../engine";
import type { GameClientMsg, GameServerMsg } from "../../../shared/protocol";
import { MB, MB_FLOORS, mbBpm, mbPeriod, mbConfig, mbNewBall, mbFeedTap, mbBeatScore, mbTempoClose, mbRoundScore } from "../../../shared/metro";
import type { MbBall, MbConfig, MbPhase, MbProgRow, MbResultRow, MetroServerMsg } from "../../../shared/metro";

interface RoundStat { pts: number; beats: number; streak: number; locked: boolean; lockAt: number; bonus: number; lockCounted: boolean }
interface P { pid: string; c: number; total: number; ball: MbBall; rs: RoundStat; lastTapAt: number; taps: number; bestLockMs: number; accSum: number; accN: number; locks: number; leadLocks: number }
const newRs = (): RoundStat => ({ pts: 0, beats: 0, streak: 0, locked: false, lockAt: 0, bonus: 0, lockCounted: false });

export function createMetro(ctx: GameCtx): GameInstance {
  // MB_FAST=1 — פלייטסט מהיר לבדיקות ולצילומים; לא משפיע על פרודקשן
  const fast = process.env.MB_FAST ? { pickMs: 4000, setMs: 7000, countMs: 1500, matchMs: 8000, resultMs: 1500, endMs: 800 } : {};
  const cfg: MbConfig = mbConfig({ ...((ctx.config as object) ?? {}), ...fast });
  const ps = new Map<string, P>();
  let phase: MbPhase = "pick";
  let order: string[] = [];
  let r = -1;
  let leader = "";
  let floor = MB_FLOORS[0].id;
  let level = 25;
  let bpm = mbBpm(level);
  let anchor = 0;
  let until = 0;
  let startAt = 0;
  let unison = false;
  let solo = false;
  let token = 0;
  const pend = new Set<NodeJS.Timeout>();
  const now = () => ctx.now();
  const bc = (d: MetroServerMsg) => ctx.broadcast(d as unknown as GameServerMsg);
  const to = (pid: string, d: MetroServerMsg) => ctx.sendTo(pid, d as unknown as GameServerMsg);
  const cue = (ms: number, d: MetroServerMsg) => ctx.cue(ms, d as unknown as GameServerMsg);
  function later(ms: number, fn: () => void) { const tk = token; const t = ctx.timer(Math.max(0, ms), () => { pend.delete(t); if (token === tk) fn(); }); pend.add(t); return t; }
  const nameOf = (pid: string) => (ctx.players().find((p) => p.id === pid) ?? ctx.participants().find((p) => p.id === pid))?.name ?? "?";
  const connected = (pid: string) => ctx.players().find((p) => p.id === pid)?.connected ?? false;
  const followers = () => [...ps.values()].filter((p) => p.pid !== leader);
  const taken = (): Record<string, number> => Object.fromEntries([...ps.values()].filter((p) => p.c >= 0).map((p) => [p.pid, p.c]));
  const totals = (): Record<string, number> => Object.fromEntries([...ps.values()].map((p) => [p.pid, p.total]));
  const seedRnd = (() => { let s = 0; for (const ch of (cfg.seed ?? "")) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return cfg.seed ? () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; } : Math.random; })();

  /* ---------- בחירת צבע ---------- */
  function pickPhase() {
    phase = "pick";
    bc({ a: "mb_pickphase", taken: taken(), until: now() + cfg.pickMs });
    later(cfg.pickMs, begin);
  }
  function autoAssign() {
    const used = new Set([...ps.values()].filter((p) => p.c >= 0).map((p) => p.c));
    for (const p of ps.values()) if (p.c < 0) { let c = 0; while (used.has(c) && c < 7) c++; used.add(c); p.c = c; }
  }
  function begin() {
    if (phase !== "pick") return;
    autoAssign();
    const list = [...ps.keys()];
    solo = list.length === 1;
    if (solo) order = Array.from({ length: cfg.minutes * 2 }, () => "");
    else {
      order = [];
      for (let k = 0; k < cfg.rounds; k++) { const sh = [...list]; for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(seedRnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; } order.push(...sh); }
    }
    bc({ a: "mb_go", chars: taken(), rounds: order.length, solo });
    later(900, () => startRound(0));
  }

  /* ---------- סבב ---------- */
  function startRound(rr: number) {
    r = rr; token++;
    leader = order[r];
    unison = false;
    for (const p of ps.values()) { p.rs = newRs(); p.ball = mbNewBall(); }
    floor = MB_FLOORS[(r + Math.floor(seedRnd() * 3)) % MB_FLOORS.length].id;
    // רמה: לא קרובה לקודמת (שיהיה מה לתפוס), ובטווח שנעים להקיש בו
    let lv = 6 + Math.floor(seedRnd() * 40);
    if (r > 0 && Math.abs(lv - level) < 6) lv = lv > level ? Math.min(MB.LEVELS, lv + 6) : Math.max(1, lv - 6);
    level = lv; bpm = mbBpm(level);
    if (solo) {
      phase = "set";
      anchor = now();
      bc({ a: "mb_round", r, of: order.length, leader, floor, level, anchor, until: now() });
      startCount(5000);
      return;
    }
    phase = "set";
    anchor = now();
    until = now() + cfg.setMs;
    bc({ a: "mb_round", r, of: order.length, leader, floor, level, anchor, until });
    later(cfg.setMs, () => startCount(cfg.countMs));
  }
  /** שינוי קצב תוך כדי — שומרים על רציפות הכדור: העוגן החדש = הנחיתה האחרונה בקצב הישן */
  function retime(newBpm: number) {
    const T = mbPeriod(bpm);
    const n = Math.floor((now() - anchor) / T);
    anchor = anchor + Math.max(0, n) * T;
    bpm = newBpm;
  }
  function startCount(ms: number) {
    if (phase !== "set") return;
    phase = "count"; token++;
    startAt = now() + ms;
    anchor = startAt;
    until = startAt + cfg.matchMs;
    for (const p of ps.values()) p.ball = mbNewBall();
    bc({ a: "mb_count", r, startAt, until, bpm, floor });
    later(ms, startMatch);
  }
  function startMatch() {
    phase = "match";
    const T = mbPeriod(bpm);
    let n = 1;
    const tick = () => {
      const beat = anchor + n * T;
      if (beat > until) { later(until + MB.BEAT_EVAL_DELAY + 80 - now(), endRound); return; }
      later(beat + MB.BEAT_EVAL_DELAY - now(), () => { evalBeat(beat); n++; tick(); });
    };
    tick();
    const prog = () => { if (phase !== "match") return; bc({ a: "mb_prog", rows: progRows(), unison }); later(500, prog); };
    later(500, prog);
  }
  const progRows = (): MbProgRow[] => followers().map((p) => ({ pid: p.pid, locked: p.rs.locked, streak: p.rs.streak, pts: p.rs.pts, beats: p.rs.beats, lockAt: p.rs.lockAt }));

  function evalBeat(beat: number) {
    if (phase !== "match") return;
    const fs = followers();
    const lead = leader ? ps.get(leader) : undefined;
    for (const p of fs) {
      const { pts } = mbBeatScore(p.ball, bpm, beat);
      p.rs.pts += pts; p.rs.beats++;
      if (pts >= 6 && mbTempoClose(p.ball, bpm)) {
        p.rs.streak++;
        if (p.rs.streak >= MB.LOCK_BEATS && !p.rs.locked) {
          p.rs.locked = true;
          if (!p.rs.lockAt) {
            p.rs.lockAt = beat; p.locks++;
            p.bestLockMs = Math.min(p.bestLockMs, beat - startAt);
            bc({ a: "mb_lock", pid: p.pid, at: beat });
            if (lead && !p.rs.lockCounted) { p.rs.lockCounted = true; lead.rs.bonus += MB.LEADER_PER_LOCK; lead.leadLocks++; }
          }
        }
      } else { p.rs.streak = 0; p.rs.locked = false; }
    }
    if (!unison && fs.length > 0 && fs.every((p) => p.rs.locked)) {
      unison = true;
      for (const p of ps.values()) p.rs.bonus += MB.UNISON_BONUS;
      cue(350, { a: "mb_unison", at: 0 });
    }
  }

  function endRound() {
    if (phase !== "match") return;
    phase = "result"; token++;
    const rows: MbResultRow[] = [];
    for (const p of ps.values()) {
      const isLead = p.pid === leader;
      const sc = isLead ? { acc: 0, speed: 0, total: 0 } : mbRoundScore(p.rs.pts, p.rs.beats, p.rs.lockAt, startAt);
      if (!isLead && p.rs.beats > 0) { p.accSum += sc.acc; p.accN++; }
      const round = sc.total + p.rs.bonus;
      p.total += round;
      rows.push({ pid: p.pid, c: p.c, acc: sc.acc, speed: sc.speed, bonus: p.rs.bonus, round, total: p.total, lockAt: p.rs.lockAt ? p.rs.lockAt - startAt : 0, leader: isLead });
    }
    rows.sort((a, b) => b.round - a.round || b.total - a.total);
    until = now() + cfg.resultMs;
    bc({ a: "mb_result", r, of: order.length, leader, rows, level, until });
    later(cfg.resultMs, () => { if (r + 1 < order.length) startRound(r + 1); else finish(); });
  }

  function finish() {
    phase = "over"; token++;
    const rows: MbResultRow[] = [...ps.values()].map((p) => ({ pid: p.pid, c: p.c, acc: p.accN ? Math.round(p.accSum / p.accN) : 0, speed: 0, bonus: 0, round: 0, total: p.total, lockAt: p.bestLockMs < Infinity ? p.bestLockMs : 0, leader: false }))
      .sort((a, b) => b.total - a.total);
    const titles: { pid: string; ic: string; t: string }[] = [];
    const by = (f: (p: P) => number, ic: string, t: string, ok: (v: number) => boolean) => { const best = [...ps.values()].sort((a, c) => f(c) - f(a))[0]; if (best && ok(f(best)) && !titles.some((x) => x.pid === best.pid)) titles.push({ pid: best.pid, ic, t }); };
    by((p) => (p.bestLockMs < Infinity ? -p.bestLockMs : -1e9), "⚡", "האוזן הכי מהירה", (v) => v > -1e9);
    by((p) => (p.accN ? p.accSum / p.accN : 0), "🎯", "המדויק", (v) => v >= 200);
    if (!solo) by((p) => p.leadLocks, "🎶", "הקצב שכולם תפסו", (v) => v >= 1);
    by((p) => p.taps, "🥁", "המתופף", (v) => v >= 30);
    bc({ a: "mb_over", rows, titles });
    later(cfg.endMs, () => {
      const facts: Record<string, Record<string, number>> = {};
      for (const p of ps.values()) facts[p.pid] = { mbLocks: p.locks, mbBestLockMs: p.bestLockMs < Infinity ? p.bestLockMs : 0, mbAcc: p.accN ? Math.round(p.accSum / p.accN) : 0 };
      const w = rows[0];
      ctx.end({
        title: solo ? `🎾 מטרונובול — ${w?.total ?? 0} נקודות` : w ? `🎾 מטרונובול — ${nameOf(w.pid)} עם ${w.total} נקודות` : "🎾 מטרונובול",
        winnerId: w?.pid, loserId: rows.length > 2 ? rows[rows.length - 1].pid : undefined,
        scores: Object.fromEntries(rows.map((x) => [x.pid, x.total])),
        facts: facts as any,
      });
    });
  }

  function sync(pid: string) {
    to(pid, {
      a: "mb_sync", phase, r, of: order.length, leader, floor, bpm, anchor, until, startAt, chars: taken(), solo, level,
      balls: followers().map((p) => ({ pid: p.pid, bpm: p.ball.bpm, anchor: p.ball.anchor })), totals: totals(),
    });
  }

  return {
    onStart() {
      for (const p of ctx.participants()) if (p.connected) ps.set(p.id, { pid: p.id, c: -1, total: 0, ball: mbNewBall(), rs: newRs(), lastTapAt: 0, taps: 0, bestLockMs: Infinity, accSum: 0, accN: 0, locks: 0, leadLocks: 0 });
      pickPhase();
    },
    onMessage(pid, d0: GameClientMsg) {
      const d = d0 as any;
      if (typeof d?.a !== "string" || !d.a.startsWith("mb_")) return;
      const p = ps.get(pid); if (!p) return;
      switch (d.a) {
        case "mb_char": {
          if (phase !== "pick") return;
          const c = Number(d.c);
          if (!Number.isInteger(c) || c < 0 || c > 7) return;
          if ([...ps.values()].some((q) => q.pid !== pid && q.c === c)) return;
          p.c = c;
          bc({ a: "mb_pickphase", taken: taken(), until: 0 });
          if ([...ps.values()].every((q) => q.c >= 0 || !connected(q.pid))) { token++; later(800, begin); }
          return;
        }
        case "mb_level": {
          if (phase !== "set" || pid !== leader) return;
          const lv = Math.round(Number(d.level));
          if (!Number.isFinite(lv) || lv < 1 || lv > MB.LEVELS) return;
          level = lv; retime(mbBpm(level));
          bc({ a: "mb_lead", bpm, anchor, floor });
          return;
        }
        case "mb_floor": {
          if (phase !== "set" || pid !== leader) return;
          const f = MB_FLOORS.find((x) => x.id === d.floor); if (!f) return;
          floor = f.id;
          bc({ a: "mb_lead", bpm, anchor, floor });
          return;
        }
        case "mb_setdone": {
          if (phase !== "set" || pid !== leader) return;
          startCount(cfg.countMs);
          return;
        }
        case "mb_tap": {
          if ((phase !== "count" && phase !== "match") || pid === leader) return;
          const t = Number(d.at); const nw = now();
          if (!Number.isFinite(t) || t > nw + 300 || t < nw - 2000) return;
          if (t - p.lastTapAt < 70) return; // ≤14 הקשות בשנייה — כל מה שמעבר לזה הוא רעש
          p.lastTapAt = t; p.taps++;
          p.ball = mbFeedTap(p.ball, t);
          bc({ a: "mb_ball", pid, bpm: p.ball.bpm, anchor: p.ball.anchor });
          return;
        }
      }
    },
    onLeave(pid, permanent) {
      const p = ps.get(pid); if (!p || !permanent) return;
      if (phase === "set" && pid === leader) startCount(cfg.countMs);
    },
    onRejoin(pid) { sync(pid); },
    dispose() { token++; for (const t of pend) clearTimeout(t); pend.clear(); },
  };
}
