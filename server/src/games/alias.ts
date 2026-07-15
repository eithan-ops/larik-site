/**
 * "על הלשון" — אליאס בתורות.
 */
import type { GameCtx, GameInstance } from "../engine";
import type { AliasClientMsg, GameClientMsg } from "../../../shared/protocol";
import { DECKS } from "../decks";

const TURN_MS = 45_000;
const ROUNDS_PER_PLAYER = 2;

interface Config { deck?: string }

export function createAlias(ctx: GameCtx): GameInstance {
  const cfg = (ctx.config ?? {}) as Config;
  const deckName = cfg.deck && DECKS[cfg.deck] ? cfg.deck : "animals";
  const deck = [...DECKS[deckName].cards].sort(() => Math.random() - 0.5);
  let deckPos = 0;
  const players = ctx.connectedPlayers().map((p) => p.id);
  const order = [...players].sort(() => Math.random() - 0.5);
  const scores: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  let turnIdx = -1;
  let turnsPlayed = 0;
  let describer = "";
  let turnTimer: NodeJS.Timeout | undefined;
  let over = false;

  function nextWord() { const w = deck[deckPos % deck.length]; deckPos += 1; ctx.sendTo(describer, { a: "al_word", word: w }); }

  function nextTurn() {
    if (over) return;
    clearTimeout(turnTimer!);
    if (turnsPlayed >= order.length * ROUNDS_PER_PLAYER) return finish();
    turnIdx = (turnIdx + 1) % order.length;
    describer = order[turnIdx];
    turnsPlayed += 1;
    ctx.broadcast({ a: "al_turn", pid: describer, deckName: DECKS[deckName].name, until: ctx.now() + TURN_MS });
    nextWord();
    turnTimer = ctx.timer(TURN_MS, () => { ctx.broadcast({ a: "al_turnend", pid: describer, got: 0 }); ctx.timer(2500, nextTurn); });
  }

  function finish() {
    if (over) return;
    over = true;
    const ranked = [...players].sort((a, b) => scores[b] - scores[a]);
    ctx.end({ title: "על הלשון 👅", winnerId: ranked[0], loserId: ranked.length > 1 && scores[ranked[ranked.length - 1]] < scores[ranked[0]] ? ranked[ranked.length - 1] : undefined, scores: { ...scores } });
  }

  return {
    onStart() { ctx.timer(1500, nextTurn); },
    onMessage(pid: string, d: GameClientMsg) {
      if (over || pid !== describer) return;
      const m = d as AliasClientMsg;
      if (m.a === "al_correct") { scores[describer] = (scores[describer] ?? 0) + 1; ctx.broadcast({ a: "al_scored", pid: describer, total: scores[describer] }); nextWord(); }
      else if (m.a === "al_skip") { ctx.broadcast({ a: "al_skipped", pid: describer }); nextWord(); }
    },
    onLeave(pid: string) { if (pid === describer) nextTurn(); },
    dispose() { clearTimeout(turnTimer!); over = true; },
  };
}
