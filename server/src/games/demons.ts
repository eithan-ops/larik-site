/**
 * "השדים הקטנים" — סבוטאז' הדדי.
 */
import type { GameCtx, GameInstance } from "../engine";
import type { DemonsClientMsg, GameClientMsg } from "../../../shared/protocol";

const GAME_MS = 60_000;
const METER_PER_DEMON = 12;
const COLORS = ["#b26bff", "#00E676", "#ff4d9d", "#5c8aff", "#ffce3c", "#2dd4bf", "#ff9d5c", "#f4f6ff"];

export function createDemons(ctx: GameCtx): GameInstance {
  const players = ctx.connectedPlayers().map((p) => p.id);
  const colorOf: Record<string, string> = {};
  players.forEach((p, i) => (colorOf[p] = COLORS[i % COLORS.length]));
  const scores: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  const meters: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  let endsAt = 0;
  let over = false;

  function finish() {
    if (over) return;
    over = true;
    const ranked = [...players].sort((a, b) => scores[b] - scores[a]);
    const top = scores[ranked[0]] ?? 0;
    const winnerIds = ranked.filter((p) => (scores[p] ?? 0) === top);
    const low = scores[ranked[ranked.length - 1]] ?? 0;
    const lowIds = ranked.filter((p) => (scores[p] ?? 0) === low);
    const loser = lowIds.length === 1 && low < top ? lowIds[0] : undefined;
    ctx.broadcast({ a: "dm_end", scores: { ...scores } });
    ctx.timer(200, () => ctx.end({ title: "השדים הקטנים 👹", winnerId: winnerIds[0], winnerIds, loserId: loser, scores: { ...scores } }));
  }

  return {
    onStart() {
      const until = ctx.now() + GAME_MS + 3000;
      endsAt = until;
      ctx.broadcast({ a: "dm_begin", until, colors: { ...colorOf } });
      const tick = () => { if (over) return; ctx.broadcast({ a: "dm_score", scores: { ...scores }, meters: { ...meters } }); ctx.timer(700, tick); };
      ctx.timer(3000, tick);
      ctx.timer(GAME_MS + 3000, finish);
    },
    onMessage(pid: string, d: GameClientMsg) {
      if (over) return;
      const m = d as DemonsClientMsg;
      if (m.a === "dm_hit") { scores[pid] = (scores[pid] ?? 0) + 1; meters[pid] = (meters[pid] ?? 0) + 1; }
      else if (m.a === "dm_send") {
        if ((meters[pid] ?? 0) < METER_PER_DEMON) return;
        if (!players.includes(m.target) || m.target === pid) return;
        meters[pid] = 0;
        const kind = Math.floor(Math.random() * 4);
        ctx.cue(300, { a: "dm_demon", from: pid, target: m.target, kind, at: 0, dur: 3500 } as never);
      }
    },
    onRejoin(pid: string) {
      if (over) return;
      ctx.sendTo(pid, { a: "dm_begin", until: endsAt, colors: { ...colorOf } });
      ctx.sendTo(pid, { a: "dm_score", scores: { ...scores }, meters: { ...meters } });
    },
    onLeave() {},
    dispose() { over = true; },
  };
}
