/**
 * בדיקת אינטגרציה: חדר אמיתי → משחק → טקס, ומוודאים שהתארים מגיעים לכל טלפון.
 * זה מה שמכסה את החיווט במנוע (שהבדיקה של awards.ts לבדה לא נוגעת בו).
 * הרצה: npx tsx test/ceremony-awards.test.ts
 */
import assert from "node:assert";
import { Room, Transport, GameCtx, GameInstance } from "../src/engine";
import type { ServerMsg, RoomSnapshot } from "../../shared/protocol";

let passed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); process.exitCode = 1; }
}

function harness() {
  const inbox = new Map<string, ServerMsg[]>();
  const transport: Transport = {
    send(pid, msg) { (inbox.get(pid) ?? inbox.set(pid, []).get(pid)!).push(msg); },
  };
  const room = (factory: (ctx: GameCtx) => GameInstance) =>
    new Room("KFRT", transport, { trivia: factory });
  const snap = (pid: string): RoomSnapshot =>
    ([...(inbox.get(pid) ?? [])].reverse().find((m) => m.t === "room") as { room: RoomSnapshot }).room;
  return { room, snap };
}

/** משחק מדומה: נגמר מיד, מדווח עובדות אמיתיות כמו שפודים וטריוויה מדווחים */
function fakeGame(result: Parameters<GameCtx["end"]>[0]) {
  return (ctx: GameCtx): GameInstance => ({
    onStart() { ctx.end(result); },
    onMessage() {},
    dispose() {},
  });
}

console.log("טקס הסיום — תארים:");

const P = ["p1", "p2", "p3", "p4"];

test("אחרי משחק אחד — לכל שחקן יש תואר, ואף תואר לא חוזר", () => {
  const { room, snap } = harness();
  const r = room(fakeGame({
    title: "טריוויה 🧠",
    winnerId: "p1",
    loserId: "p4",
    scores: { p1: 900, p2: 600, p3: 300, p4: 0 },
    facts: {
      p2: { bestReactionMs: 412, taps: 9 },
      p3: { correct: 6, wrong: 1 },
      p4: { peeks: 2 },
    },
  }));
  P.forEach((p, i) => r.join(p, "שחקן" + i, "🙂"));
  r.onMessage("p1", { t: "select_game", gameId: "trivia" });
  r.onMessage("p1", { t: "start_game" });

  const c = snap("p1").ceremony!;
  assert.ok(c.awards, "אין awards בטקס");
  assert.equal(Object.keys(c.awards!).length, 4, "לא כל השחקנים קיבלו תואר");
  const ids = Object.values(c.awards!).map((a) => a.id);
  assert.equal(new Set(ids).size, 4, `תואר כפול: ${ids.join(", ")}`);
  assert.equal(c.gamesPlayed, 1);
  console.log("    " + P.map((p) => `${p}=${c.awards![p].emoji}${c.awards![p].title}`).join(" · "));
});

test("התארים המדידים הולכים לשחקן הנכון", () => {
  const { room, snap } = harness();
  const r = room(fakeGame({
    title: "פודים ⚡",
    winnerId: "p1",
    loserId: "p4",
    scores: {},
    facts: { p2: { bestReactionMs: 412 }, p3: { correct: 7 } },
  }));
  P.forEach((p, i) => r.join(p, "שחקן" + i, "🙂"));
  r.onMessage("p1", { t: "select_game", gameId: "trivia" });
  r.onMessage("p1", { t: "start_game" });

  const a = snap("p1").ceremony!.awards!;
  assert.equal(a.p1.id, "king", "המנצח לא קיבל מלך הערב");
  assert.equal(a.p2.id, "fastest", "המהיר לא קיבל את האצבע");
  assert.equal(a.p2.detail, "0.41 שניות");
  assert.equal(a.p3.id, "brain", "מי שענה נכון לא קיבל את המוח");
  assert.equal(a.p4.id, "clown", "הליצן לא קיבל ליצן");
});

test("שני משחקים — העובדות נצברות ורצף הניצחונות נספר", () => {
  const { room, snap } = harness();
  const r = room(fakeGame({ title: "משחק", winnerId: "p1", loserId: "p4", scores: {}, facts: { p2: { taps: 5 } } }));
  P.forEach((p, i) => r.join(p, "שחקן" + i, "🙂"));
  r.onMessage("p1", { t: "select_game", gameId: "trivia" });
  r.onMessage("p1", { t: "start_game" });
  r.onMessage("p1", { t: "back_to_lobby" });
  r.onMessage("p1", { t: "start_game" });

  const c = snap("p1").ceremony!;
  assert.equal(c.gamesPlayed, 2, "מונה המשחקים לא התקדם");
  assert.ok(["king", "streak", "versatile"].includes(c.awards!.p1.id), `p1 קיבל ${c.awards!.p1.id}`);
  assert.equal(Object.keys(c.awards!).length, 4);
});

test("משחק שלא מדווח שום עובדה — עדיין מחלק תארים לכולם", () => {
  const { room, snap } = harness();
  const r = room(fakeGame({ title: "סימון", scores: {} }));
  P.forEach((p, i) => r.join(p, "שחקן" + i, "🙂"));
  r.onMessage("p1", { t: "select_game", gameId: "trivia" });
  r.onMessage("p1", { t: "start_game" });

  const a = snap("p3").ceremony!.awards!;
  assert.equal(Object.keys(a).length, 4);
  for (const p of P) assert.ok(a[p].title.length > 0);
});

test("כל שחקן רואה את התואר של עצמו בסנפשוט שלו", () => {
  const { room, snap } = harness();
  const r = room(fakeGame({ title: "משחק", winnerId: "p1", loserId: "p4", scores: {} }));
  P.forEach((p, i) => r.join(p, "שחקן" + i, "🙂"));
  r.onMessage("p1", { t: "select_game", gameId: "trivia" });
  r.onMessage("p1", { t: "start_game" });
  for (const p of P) assert.ok(snap(p).ceremony?.awards?.[p], `${p} לא רואה תואר`);
});

console.log(`\n${passed}/5 עברו`);
