/**
 * "נגיעת המוות" — דדוקציה חברתית / פרנויה.
 */
import type { GameCtx, GameInstance } from "../engine";
import type { DeathTouchClientMsg, GameClientMsg } from "../../../shared/protocol";

const HUNT_MS = 9000;
const ACCUSE_MS = 25000;

export function createDeathTouch(ctx: GameCtx): GameInstance {
  const all = ctx.connectedPlayers().map((p) => p.id);
  const killerCount = all.length >= 8 ? 2 : 1;
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  const killers = new Set(shuffled.slice(0, killerCount));
  let alive = [...all];
  const votes = new Map<string, string>();
  let phase: "idle" | "hunt" | "accuse" = "idle";
  let phaseUntil = 0;
  let killedThisHunt = false;
  let over = false;

  const aliveKillers = () => alive.filter((p) => killers.has(p));
  const aliveCivilians = () => alive.filter((p) => !killers.has(p));

  function checkEnd(): boolean {
    if (aliveKillers().length === 0) { end(true, "האזרחים תפסו את כל הרוצחים! 🎉"); return true; }
    if (aliveCivilians().length <= aliveKillers().length) { end(false, "הרוצחים השתלטו על החדר... 🔪"); return true; }
    return false;
  }

  function end(civiliansWin: boolean, msg: string) {
    if (over) return;
    over = true;
    ctx.broadcast({ a: "dt_result", msg });
    const scores: Record<string, number> = {};
    for (const p of all) { const isKiller = killers.has(p); scores[p] = (civiliansWin ? !isKiller : isKiller) ? 3 : 0; }
    const winner = civiliansWin ? aliveCivilians()[0] : [...killers][0];
    const loser = civiliansWin ? [...killers][0] : undefined;
    ctx.timer(200, () => ctx.end({ title: "נגיעת המוות 🔪", winnerId: winner, loserId: loser, scores }));
  }

  function startHunt() {
    if (over) return;
    phase = "hunt";
    killedThisHunt = false;
    phaseUntil = ctx.now() + HUNT_MS;
    ctx.broadcast({ a: "dt_phase", phase: "hunt", until: phaseUntil });
    for (const k of aliveKillers()) ctx.sendTo(k, { a: "dt_hunt" });
    ctx.timer(HUNT_MS, () => { if (phase === "hunt") startAccuse(); });
  }

  function startAccuse() {
    if (over) return;
    if (checkEnd()) return;
    phase = "accuse";
    votes.clear();
    const until = ctx.now() + ACCUSE_MS;
    phaseUntil = until;
    ctx.broadcast({ a: "dt_phase", phase: "accuse", until });
    ctx.broadcast({ a: "dt_accuse", alive: [...alive], until });
    ctx.timer(ACCUSE_MS, resolveAccuse);
  }

  function resolveAccuse() {
    if (over || phase !== "accuse") return;
    const tally: Record<string, number> = {};
    for (const s of votes.values()) tally[s] = (tally[s] ?? 0) + 1;
    let top = "", topN = 0;
    for (const [s, n] of Object.entries(tally)) if (n > topN) { top = s; topN = n; }
    if (top && topN > alive.length / 2) {
      alive = alive.filter((p) => p !== top);
      const wasKiller = killers.has(top);
      ctx.broadcast({ a: "dt_result", suspect: top, wasKiller, msg: wasKiller ? "היה רוצח! 🎯" : "היה אזרח תמים... 😬" });
      ctx.broadcast({ a: "dt_alive", alive: [...alive] });
    } else {
      ctx.broadcast({ a: "dt_result", msg: "לא הושג רוב — אף אחד לא הודח." });
    }
    if (checkEnd()) return;
    ctx.timer(3500, startHunt);
  }

  return {
    onStart() {
      for (const p of all) ctx.sendTo(p, { a: "dt_role", role: killers.has(p) ? "killer" : "civilian", killers: killerCount });
      ctx.broadcast({ a: "dt_alive", alive: [...alive] });
      ctx.timer(4000, startHunt);
    },
    onMessage(pid: string, d: GameClientMsg) {
      const m = d as DeathTouchClientMsg;
      if (m.a === "dt_touched") {
        if (phase !== "hunt" || killedThisHunt || over) return;
        if (!alive.includes(pid) || killers.has(pid)) return;
        killedThisHunt = true;
        alive = alive.filter((p) => p !== pid);
        ctx.cue(300, { a: "dt_killed", pid });
        ctx.broadcast({ a: "dt_alive", alive: [...alive] });
        ctx.timer(2500, () => { if (phase === "hunt") startAccuse(); });
      } else if (m.a === "dt_vote") {
        if (phase !== "accuse" || !alive.includes(pid) || !alive.includes(m.suspect)) return;
        votes.set(pid, m.suspect);
        ctx.broadcast({ a: "dt_voted", count: votes.size, total: alive.length });
        if (votes.size >= alive.length) resolveAccuse();
      }
    },
    onRejoin(pid: string) {
      if (!all.includes(pid)) return;
      ctx.sendTo(pid, { a: "dt_role", role: killers.has(pid) ? "killer" : "civilian", killers: killerCount });
      ctx.sendTo(pid, { a: "dt_alive", alive: [...alive] });
      if (phase === "hunt") {
        ctx.sendTo(pid, { a: "dt_phase", phase: "hunt", until: phaseUntil });
        if (killers.has(pid) && alive.includes(pid)) ctx.sendTo(pid, { a: "dt_hunt" });
      } else if (phase === "accuse") {
        ctx.sendTo(pid, { a: "dt_phase", phase: "accuse", until: phaseUntil });
        ctx.sendTo(pid, { a: "dt_accuse", alive: [...alive], until: phaseUntil });
      }
    },
    onLeave(pid: string, permanent?: boolean) {
      // ניתוק רגעי (reload) לא הורג — הטיימרים ממשיכים בלעדיו והוא חוזר עם onRejoin
      if (!permanent) return;
      alive = alive.filter((p) => p !== pid);
      if (!over) checkEnd();
    },
    dispose() { over = true; },
  };
}
