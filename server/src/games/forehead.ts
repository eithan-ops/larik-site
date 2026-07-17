/**
 * "על המצח" — לוגיקת השרת
 * כולם עם קלף על המצח; שאלות כן/לא בתורות; ניחוש נשפט בהצבעת החברים.
 * האחרון שלא ניחש — הליצן.
 */
import type { GameCtx, GameInstance } from "../engine";
import type { ForeheadClientMsg, GameClientMsg } from "../../../shared/protocol";
import { DECKS } from "../decks";

const TURN_MS = 45_000;
const VOTE_MS = 12_000;

interface Config { deck?: string }

export function createForehead(ctx: GameCtx): GameInstance {
  const cfg = (ctx.config ?? {}) as Config;
  const deckName = cfg.deck && DECKS[cfg.deck] ? cfg.deck : "animals";
  const deck = [...DECKS[deckName].cards].sort(() => Math.random() - 0.5);

  const players = ctx.connectedPlayers().map((p) => p.id);
  const cards = new Map<string, string>();
  const placed = new Set<string>();
  const saved = new Set<string>();
  const votes = new Map<string, boolean>();
  let order: string[] = [...players].sort(() => Math.random() - 0.5);
  let turnIdx = -1;
  let stage: "placing" | "playing" | "voting" | "done" = "placing";
  let voterPid = ""; // מי מנחש כרגע
  let turnTimer: NodeJS.Timeout | undefined;
  let rank = 0;
  let stageUntil = 0; // דדליין השלב הנוכחי (תור/הצבעה) — ל-resync

  function dealCards() {
    players.forEach((pid, i) => {
      cards.set(pid, deck[i % deck.length]);
      ctx.sendTo(pid, { a: "fh_deal", card: deck[i % deck.length], deckName: DECKS[deckName].name });
    });
  }

  function activePlayers() { return order.filter((p) => !saved.has(p)); }

  function nextTurn() {
    if (stage === "done") return;
    stage = "playing";
    votes.clear();
    const active = activePlayers();
    if (active.length <= 1) return finish();
    // מתקדמים לתור הבא בין הפעילים
    turnIdx = (turnIdx + 1) % order.length;
    while (saved.has(order[turnIdx])) turnIdx = (turnIdx + 1) % order.length;
    const pid = order[turnIdx];
    const until = ctx.now() + TURN_MS;
    stageUntil = until;
    ctx.broadcast({ a: "fh_turn", pid, until });
    clearTimeout(turnTimer!);
    turnTimer = ctx.timer(TURN_MS, nextTurn);
  }

  function startVote(pid: string) {
    stage = "voting";
    voterPid = pid;
    votes.clear();
    clearTimeout(turnTimer!);
    const until = ctx.now() + VOTE_MS;
    stageUntil = until;
    const card = cards.get(pid)!;
    // כולם חוץ מהמנחש מקבלים את מסך ההצבעה (הם רואים את הקלף שלו)
    for (const p of ctx.connectedPlayers()) {
      if (p.id !== pid) ctx.sendTo(p.id, { a: "fh_vote_req", pid, card, until });
    }
    turnTimer = ctx.timer(VOTE_MS, resolveVote);
  }

  function resolveVote() {
    if (stage !== "voting") return;
    const yes = [...votes.values()].filter(Boolean).length;
    const no = votes.size - yes;
    const correct = yes > no;
    const pid = voterPid;
    if (correct) {
      saved.add(pid);
      rank += 1;
      ctx.broadcast({ a: "fh_saved", pid, rank, card: cards.get(pid)! });
      const active = activePlayers();
      if (active.length <= 1) return finish();
    } else {
      ctx.broadcast({ a: "fh_wrong", pid });
    }
    ctx.timer(2000, nextTurn);
  }

  function finish() {
    stage = "done";
    const loser = activePlayers()[0];
    const winner = [...saved][0]; // הראשון שניצל
    const scores: Record<string, number> = {};
    [...saved].forEach((pid, i) => (scores[pid] = saved.size - i));
    if (loser) scores[loser] = 0;
    ctx.end({ title: "על המצח 🤳", winnerId: winner, loserId: loser, scores });
  }

  return {
    onStart() {
      dealCards();
      ctx.broadcast({ a: "fh_wait_placed", placed: [], total: players.length });
    },

    onMessage(pid: string, d: GameClientMsg) {
      const m = d as ForeheadClientMsg;
      switch (m.a) {
        case "fh_placed":
          if (stage !== "placing") return;
          placed.add(pid);
          ctx.broadcast({ a: "fh_wait_placed", placed: [...placed], total: players.length });
          if (placed.size === players.length) {
            // כולם על המצח — פתיחה מסונכרנת בעוד שנייה
            ctx.cue(1000, { a: "fh_begin" });
            ctx.timer(1000, nextTurn);
          }
          return;
        case "fh_removed":
          if (stage === "placing") {
            placed.delete(pid);
            ctx.broadcast({ a: "fh_wait_placed", placed: [...placed], total: players.length });
          }
          return;
        case "fh_guess":
          // רק בעל התור, רק בשלב משחק
          if (stage === "playing" && order[turnIdx] === pid && !saved.has(pid)) startVote(pid);
          return;
        case "fh_vote":
          if (stage === "voting" && pid !== voterPid && !votes.has(pid)) {
            votes.set(pid, m.ok);
            const voters = ctx.connectedPlayers().filter((p) => p.id !== voterPid).length;
            if (votes.size >= voters) resolveVote();
          }
          return;
        case "fh_peek":
          // הג'ירו תפס הצצה — אזעקה מסונכרנת אצל כולם
          if (stage === "playing" || stage === "voting") ctx.cue(400, { a: "fh_cheater", pid });
          return;
      }
    },

    onRejoin(pid: string) {
      const card = cards.get(pid);
      if (!card) return;
      ctx.sendTo(pid, { a: "fh_deal", card, deckName: DECKS[deckName].name });
      // משחזרים את מי שכבר ניצל
      for (const s of saved) ctx.sendTo(pid, { a: "fh_saved", pid: s, rank: 0, card: cards.get(s) ?? "" });
      if (stage === "placing") {
        ctx.sendTo(pid, { a: "fh_wait_placed", placed: [...placed], total: players.length });
      } else if (stage === "playing") {
        ctx.sendTo(pid, { a: "fh_begin" });
        ctx.sendTo(pid, { a: "fh_turn", pid: order[turnIdx], until: stageUntil });
      } else if (stage === "voting" && pid !== voterPid) {
        ctx.sendTo(pid, { a: "fh_vote_req", pid: voterPid, card: cards.get(voterPid)!, until: stageUntil });
      }
    },

    onLeave(pid: string) {
      placed.delete(pid);
      if (stage === "placing") {
        ctx.broadcast({ a: "fh_wait_placed", placed: [...placed], total: players.length });
      } else if (stage === "playing" && order[turnIdx] === pid) {
        nextTurn();
      } else if (stage === "voting" && voterPid === pid) {
        stage = "playing";
        nextTurn();
      }
    },

    dispose() { clearTimeout(turnTimer!); },
  };
}
