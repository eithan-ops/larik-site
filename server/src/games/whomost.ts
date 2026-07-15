/**
 * "מי הכי?" — המארח כותב שאלות, כולם מצביעים חשאית מי הכי מתאים,
 * ואז המארח מגלה שאלה-שאלה — והטלפון של הנבחר נדלק בזהב (cue מסונכרן).
 *
 * שלושה שלבים:
 *  write  — המארח מקליד שאלות ומפרסם.
 *  answer — כל אחד מצביע בסתר מי מתאים לכל שאלה, ולוחץ "סיימתי".
 *  reveal — הטלפונים על השולחן; המארח קורא שאלה, מגלה → הנבחר נדלק.
 * בסוף: "כוכב הערב" = מי שנבחר הכי הרבה פעמים.
 */
import type { GameCtx, GameInstance } from "../engine";
import type { WhoMostClientMsg, GameClientMsg } from "../../../shared/protocol";

const MAX_Q = 20;

export function createWhoMost(ctx: GameCtx): GameInstance {
  const hostId = ctx.players().find((p) => p.isHost)?.id ?? ctx.players()[0]?.id ?? "";
  let phase: "write" | "answer" | "reveal" = "write";
  const questions: string[] = [];
  const votes: Map<number, Map<string, string>> = new Map(); // qIdx -> (voter -> target)
  const done = new Set<string>();
  let revealIdx = -1;
  let over = false;

  const isHost = (pid: string) => pid === hostId;
  const connectedCount = () => ctx.connectedPlayers().length;

  function tallyFor(idx: number): { tally: Record<string, number>; winners: string[]; voters: number } {
    const m = votes.get(idx) ?? new Map();
    const tally: Record<string, number> = {};
    for (const target of m.values()) tally[target] = (tally[target] ?? 0) + 1;
    let max = 0;
    for (const n of Object.values(tally)) if (n > max) max = n;
    const winners = max > 0 ? Object.keys(tally).filter((p) => tally[p] === max) : [];
    return { tally, winners, voters: m.size };
  }

  function finish() {
    if (over) return;
    over = true;
    // כוכב הערב = מי שנבחר הכי הרבה פעמים בכל השאלות
    const total: Record<string, number> = {};
    for (let i = 0; i < questions.length; i++) {
      const { tally } = tallyFor(i);
      for (const [pid, n] of Object.entries(tally)) total[pid] = (total[pid] ?? 0) + n;
    }
    const ranked = ctx.players().map((p) => p.id).sort((a, b) => (total[b] ?? 0) - (total[a] ?? 0));
    const winner = (total[ranked[0]] ?? 0) > 0 ? ranked[0] : undefined;
    ctx.end({ title: "מי הכי? 🫵 כוכב הערב!", winnerId: winner, scores: total });
  }

  return {
    onStart() {
      ctx.broadcast({ a: "wm_phase", phase: "write" });
      ctx.broadcast({ a: "wm_questions", questions: [] });
    },

    onMessage(pid: string, d: GameClientMsg) {
      if (over) return;
      const m = d as WhoMostClientMsg;
      switch (m.a) {
        case "wm_add":
          if (!isHost(pid) || phase !== "write") return;
          if (questions.length >= MAX_Q) return;
          {
            const text = (m.text ?? "").trim().slice(0, 120);
            if (!text) return;
            questions.push(text);
            ctx.broadcast({ a: "wm_questions", questions: [...questions] });
          }
          return;
        case "wm_remove":
          if (!isHost(pid) || phase !== "write") return;
          if (m.idx >= 0 && m.idx < questions.length) {
            questions.splice(m.idx, 1);
            ctx.broadcast({ a: "wm_questions", questions: [...questions] });
          }
          return;
        case "wm_publish":
          if (!isHost(pid) || phase !== "write" || questions.length < 1) return;
          phase = "answer";
          ctx.broadcast({ a: "wm_phase", phase: "answer" });
          ctx.broadcast({ a: "wm_questions", questions: [...questions] });
          ctx.broadcast({ a: "wm_progress", done: 0, total: connectedCount() });
          return;
        case "wm_vote":
          if (phase !== "answer") return;
          if (m.qIdx < 0 || m.qIdx >= questions.length) return;
          if (!ctx.connectedPlayers().some((p) => p.id === m.target)) return;
          if (!votes.has(m.qIdx)) votes.set(m.qIdx, new Map());
          votes.get(m.qIdx)!.set(pid, m.target);
          return;
        case "wm_done":
          if (phase !== "answer") return;
          done.add(pid);
          ctx.broadcast({ a: "wm_progress", done: done.size, total: connectedCount() });
          return;
        case "wm_start":
          if (!isHost(pid) || phase !== "answer") return;
          phase = "reveal";
          revealIdx = 0;
          ctx.broadcast({ a: "wm_phase", phase: "reveal" });
          ctx.broadcast({ a: "wm_reveal_q", idx: 0, total: questions.length, text: questions[0] });
          return;
        case "wm_reveal": {
          if (!isHost(pid) || phase !== "reveal" || revealIdx < 0) return;
          const { tally, winners, voters } = tallyFor(revealIdx);
          ctx.broadcast({ a: "wm_result", idx: revealIdx, winners, tally, voters });
          if (winners.length) ctx.cue(500, { a: "wm_lit", pids: winners });
          return;
        }
        case "wm_next":
          if (!isHost(pid) || phase !== "reveal") return;
          revealIdx += 1;
          if (revealIdx >= questions.length) return finish();
          ctx.broadcast({ a: "wm_reveal_q", idx: revealIdx, total: questions.length, text: questions[revealIdx] });
          return;
      }
    },

    onLeave() { /* המשחק ממשיך; המארח מוביל */ },
    dispose() { over = true; },
  };
}
