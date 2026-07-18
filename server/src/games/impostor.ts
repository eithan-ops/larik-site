/**
 * "המתחזה" 🎭 — לוגיקת השרת.
 * כולם מקבלים את אותה מילה סודית — חוץ מאחד.
 *  - מצב "מילה דומה" (ברירת מחדל): המתחזה מקבל מילה דומה ולא יודע שהוא המתחזה 😏
 *  - מצב "קלאסי": המתחזה יודע ("אתה המתחזה") וצריך לזייף.
 * בתורות אומרים בקול מילה שקשורה למילה שקיבלו → הצבעה חשאית → חשיפה.
 * נתפס? ניחוש הצלה: אם ניחש את המילה האמיתית — גנב את הניצחון.
 * הודחתם מישהו חף מפשע? המתחזה בורח, והמואשם הוא ליצן הערב 🤡
 */
import type { GameCtx, GameInstance } from "../engine";
import type { ImpostorClientMsg, GameClientMsg } from "../../../shared/protocol";
import { pickImpostorPair } from "../decks";

const TURN_MS = 25_000;
const VOTE_MS = 35_000;
const GUESS_MS = 30_000;

interface Config { mode?: "similar" | "classic"; rounds?: string }

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, " ").replace(/[־-]/g, " ").replace(/['"״׳]/g, "");
}

export function createImpostor(ctx: GameCtx): GameInstance {
  const cfg = (ctx.config ?? {}) as Config;
  const classic = cfg.mode === "classic";
  const totalRounds = cfg.rounds === "2" ? 2 : 1;

  const [word, decoy] = pickImpostorPair();
  let players = ctx.connectedPlayers().map((p) => p.id);
  const impostor = players[Math.floor(Math.random() * players.length)];
  let order = [...players].sort(() => Math.random() - 0.5);

  let phase: "clues" | "vote" | "lastguess" | "done" = "clues";
  let round = 1;
  let turnIdx = -1;
  let turnUntil = 0;
  let voteUntil = 0;
  let guessUntil = 0;
  const votes = new Map<string, string>();
  let timer: NodeJS.Timeout | undefined;
  let over = false;

  function sendRole(pid: string) {
    if (pid === impostor) {
      ctx.sendTo(pid, classic
        ? { a: "im_role", word: "", knowsImpostor: true }
        : { a: "im_role", word: decoy, knowsImpostor: false });
    } else {
      ctx.sendTo(pid, { a: "im_role", word, knowsImpostor: false });
    }
  }

  function nextTurn() {
    if (over) return;
    clearTimeout(timer!);
    turnIdx += 1;
    if (turnIdx >= order.length) {
      turnIdx = -1;
      round += 1;
      if (round > totalRounds) return openVote();
    }
    if (turnIdx === -1) turnIdx = 0;
    const pid = order[turnIdx];
    turnUntil = ctx.now() + TURN_MS;
    ctx.broadcast({ a: "im_turn", pid, until: turnUntil, round, totalRounds, order: [...order] });
    timer = ctx.timer(TURN_MS, nextTurn);
  }

  function openVote() {
    if (over) return;
    clearTimeout(timer!);
    phase = "vote";
    votes.clear();
    voteUntil = ctx.now() + VOTE_MS;
    ctx.broadcast({ a: "im_vote_open", until: voteUntil, candidates: [...order] });
    timer = ctx.timer(VOTE_MS, resolveVote);
  }

  function resolveVote() {
    if (over || phase !== "vote") return;
    clearTimeout(timer!);
    const tally: Record<string, number> = {};
    for (const t of votes.values()) tally[t] = (tally[t] ?? 0) + 1;
    let top = "", topN = 0, tie = false;
    for (const [pid, n] of Object.entries(tally)) {
      if (n > topN) { top = pid; topN = n; tie = false; }
      else if (n === topN) tie = true;
    }
    if (!top || tie) {
      // אין הכרעה — המתחזה חומק
      ctx.broadcast({ a: "im_accused", pid: "", wasImpostor: false, tally });
      return finish(true, undefined, "");
    }
    const wasImpostor = top === impostor;
    ctx.broadcast({ a: "im_accused", pid: top, wasImpostor, tally });
    if (wasImpostor) {
      // נתפס! ניחוש ההצלה
      phase = "lastguess";
      guessUntil = ctx.now() + GUESS_MS;
      ctx.timer(2500, () => {
        if (over) return;
        ctx.broadcast({ a: "im_lastguess", pid: impostor, until: guessUntil });
        timer = ctx.timer(GUESS_MS, () => finish(false, undefined, top));
      });
    } else {
      // הודח חף מפשע — המתחזה בורח, המואשם הוא הליצן
      ctx.timer(2500, () => finish(true, undefined, top));
    }
  }

  function finish(impostorWon: boolean, guess: string | undefined, accused: string) {
    if (over) return;
    over = true;
    phase = "done";
    clearTimeout(timer!);
    ctx.broadcast({ a: "im_result", impostorWon, impostorPid: impostor, word, decoy: classic ? undefined : decoy, guess });
    // ניקוד: מתחזה שניצח 5; אזרחים שהצביעו נכון 2
    const scores: Record<string, number> = {};
    for (const p of players) scores[p] = 0;
    if (impostorWon) scores[impostor] = 5;
    for (const [voter, target] of votes) if (target === impostor && voter !== impostor) scores[voter] = (scores[voter] ?? 0) + 2;
    const civilians = players.filter((p) => p !== impostor);
    const correctVoters = civilians.filter((p) => votes.get(p) === impostor);
    ctx.timer(4500, () => ctx.end({
      title: "המתחזה 🎭",
      winnerId: impostorWon ? impostor : (correctVoters[0] ?? civilians[0]),
      winnerIds: impostorWon ? [impostor] : (correctVoters.length ? correctVoters : civilians),
      // ליצן: מתחזה שנתפס; או חף מפשע שהודח בטעות
      loserId: impostorWon ? (accused && accused !== impostor ? accused : undefined) : impostor,
      scores,
    }));
  }

  return {
    onStart() {
      for (const pid of players) sendRole(pid);
      ctx.timer(6000, nextTurn); // זמן לקרוא את המילה בסתר
    },

    onMessage(pid: string, d: GameClientMsg) {
      if (over) return;
      const m = d as ImpostorClientMsg;
      switch (m.a) {
        case "im_said":
          if (phase === "clues" && order[turnIdx] === pid) nextTurn();
          return;
        case "im_vote":
          if (phase !== "vote" || !players.includes(pid)) return;
          if (!players.includes(m.target) || m.target === pid) return;
          votes.set(pid, m.target);
          ctx.broadcast({ a: "im_votes", count: votes.size, total: players.length });
          if (votes.size >= players.length) resolveVote();
          return;
        case "im_guess":
          if (phase !== "lastguess" || pid !== impostor) return;
          {
            const guess = (m.word ?? "").slice(0, 40);
            const correct = normalize(guess) === normalize(word);
            finish(correct, guess, impostor);
          }
          return;
      }
    },

    onRejoin(pid: string) {
      if (!players.includes(pid)) return;
      sendRole(pid);
      if (phase === "clues" && turnIdx >= 0) {
        ctx.sendTo(pid, { a: "im_turn", pid: order[turnIdx], until: turnUntil, round, totalRounds, order: [...order] });
      } else if (phase === "vote") {
        ctx.sendTo(pid, { a: "im_vote_open", until: voteUntil, candidates: [...order] });
        ctx.sendTo(pid, { a: "im_votes", count: votes.size, total: players.length });
      } else if (phase === "lastguess") {
        ctx.sendTo(pid, { a: "im_lastguess", pid: impostor, until: guessUntil });
      }
    },

    onLeave(pid: string, permanent?: boolean) {
      if (over || !permanent || !players.includes(pid)) return;
      if (pid === impostor) {
        // המתחזה ברח מהמשחק — האזרחים מנצחים בהליכה
        votes.clear();
        return finish(false, undefined, impostor);
      }
      players = players.filter((p) => p !== pid);
      const wasTurn = phase === "clues" && order[turnIdx] === pid;
      const idxInOrder = order.indexOf(pid);
      order = order.filter((p) => p !== pid);
      if (players.length < 3) return finish(true, undefined, ""); // אין מספיק — מפרקים בעדינות
      if (wasTurn) { if (idxInOrder <= turnIdx) turnIdx -= 1; nextTurn(); }
      else if (idxInOrder >= 0 && idxInOrder < turnIdx) turnIdx -= 1;
      if (phase === "vote" && votes.size >= players.length) resolveVote();
    },

    dispose() { over = true; clearTimeout(timer!); },
  };
}
