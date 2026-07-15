/**
 * "טריוויה" — כולם עונים בו-זמנית; ניקוד לפי נכונות + מהירות.
 */
import type { GameCtx, GameInstance } from "../engine";
import type { TriviaClientMsg, GameClientMsg } from "../../../shared/protocol";
import { pickTrivia, TriviaQ } from "../decks";

const Q_COUNT = 8;
const ANSWER_MS = 12_000;
const MAX_POINTS = 1000;

interface Config { cat?: string }

export function createTrivia(ctx: GameCtx): GameInstance {
  const cat = ((ctx.config ?? {}) as Config).cat || "mix";
  const qs: TriviaQ[] = pickTrivia(cat, Q_COUNT);
  const players = ctx.connectedPlayers().map((p) => p.id);
  const scores: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  let qIdx = -1;
  let current: { id: number; correct: number; at: number; deadline: number } | null = null;
  const answers = new Map<string, { choice: number; atServer: number }>();
  let over = false;

  function nextQ() {
    if (over) return;
    qIdx += 1;
    if (qIdx >= qs.length) return finish();
    const q = qs[qIdx];
    answers.clear();
    const qId = qIdx + 1;
    const at = ctx.cue(900, { a: "tv_q", qId, q: q.q, options: q.options, index: qIdx, total: qs.length, at: 0, until: 0 } as never);
    current = { id: qId, correct: q.correct, at, deadline: at + ANSWER_MS };
    ctx.timer(at + ANSWER_MS - ctx.now(), () => reveal(qId));
  }

  function reveal(id: number) {
    if (over || !current || current.id !== id) return;
    const correct = current.correct;
    const tally = [0, 0, 0, 0];
    const gained: Record<string, number> = {};
    for (const [pid, ans] of answers) {
      if (ans.choice >= 0 && ans.choice < 4) tally[ans.choice] += 1;
      if (ans.choice === correct) {
        const elapsed = Math.max(0, ans.atServer - current.at);
        const frac = Math.max(0, 1 - elapsed / ANSWER_MS);
        const pts = Math.round(300 + (MAX_POINTS - 300) * frac);
        scores[pid] = (scores[pid] ?? 0) + pts;
        gained[pid] = pts;
      }
    }
    current = null;
    ctx.broadcast({ a: "tv_reveal", qId: id, correct, tally, scores: { ...scores }, gained });
    ctx.timer(4500, nextQ);
  }

  function finish() {
    if (over) return;
    over = true;
    const ranked = [...players].sort((a, b) => scores[b] - scores[a]);
    ctx.end({ title: "טריוויה 🧠", winnerId: ranked[0], loserId: ranked.length > 1 ? ranked[ranked.length - 1] : undefined, scores: { ...scores } });
  }

  return {
    onStart() { ctx.broadcast({ a: "tv_begin", total: qs.length }); ctx.timer(2000, nextQ); },
    onMessage(pid: string, d: GameClientMsg) {
      const m = d as TriviaClientMsg;
      if (m.a !== "tv_answer" || over || !current || m.qId !== current.id) return;
      if (answers.has(pid)) return;
      answers.set(pid, { choice: m.choice, atServer: m.atServer });
      ctx.broadcast({ a: "tv_answered", count: answers.size, total: ctx.connectedPlayers().length });
      if (answers.size >= ctx.connectedPlayers().length) reveal(current.id);
    },
    dispose() { over = true; },
  };
}
