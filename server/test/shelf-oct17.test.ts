/**
 * בדיקות לשינויי 17.10: משחקים מוסתרים, ומדידת "סבב שלם" במשחקים בלי סוף מובנה.
 * הרצה: npx tsx test/shelf-oct17.test.ts
 */
import assert from "node:assert";
import { Room, Transport, GameCtx, GameInstance } from "../src/engine";
import { CATALOG, HIDDEN_GAME_IDS, isListed } from "../../shared/protocol";
import { flConfig } from "../../shared/floors";
import type { ServerMsg, RoomSnapshot } from "../../shared/protocol";

let passed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); process.exitCode = 1; }
}

function harness(factories: Record<string, (ctx: GameCtx) => GameInstance>) {
  const inbox = new Map<string, ServerMsg[]>();
  const transport: Transport = {
    send(pid, msg) { (inbox.get(pid) ?? inbox.set(pid, []).get(pid)!).push(msg); },
  };
  const r = new Room("TEST", transport, factories);
  const snap = (pid: string): RoomSnapshot =>
    ([...(inbox.get(pid) ?? [])].reverse().find((m) => m.t === "room") as { room: RoomSnapshot }).room;
  const errors = (pid: string) => (inbox.get(pid) ?? []).filter((m) => m.t === "error");
  return { r, snap, errors };
}

/** משחק סבבים מדומה: כל הודעה "round" = סבב שלם */
let roundCtx: GameCtx | undefined;
const roundsGame = (ctx: GameCtx): GameInstance => {
  roundCtx = ctx;
  return { onStart() {}, onMessage() { ctx.roundDone(); }, dispose() {} };
};
const idle = (): GameInstance => ({ onStart() {}, onMessage() {}, dispose() {} });

console.log("מדף 17.10:");

test("חמשת המשחקים מוסתרים מהקטלוג, והשאר מוצגים", () => {
  for (const id of ["hofrim", "simon", "sp_duel", "deathtouch", "demons"]) {
    const g = CATALOG.find((x) => x.id === id);
    assert.ok(g, `${id} חסר בקטלוג (הקוד צריך להישאר)`);
    assert.ok(!isListed(g!), `${id} עדיין מוצג`);
    assert.ok(HIDDEN_GAME_IDS.has(id));
  }
  for (const id of ["impostor", "whomost", "undercover", "trivia", "bombs", "forehead", "floors", "sp_colors"]) {
    assert.ok(isListed(CATALOG.find((x) => x.id === id)!), `${id} הוסתר בטעות`);
  }
});

test("המתחזה ראשון במדף, ואחריו מי הכי?", () => {
  const listed = CATALOG.filter(isListed).map((g) => g.id);
  assert.deepEqual(listed.slice(0, 6), ["impostor", "whomost", "undercover", "trivia", "bombs", "forehead"]);
});

test("השרת מסרב לבחור משחק מוסתר", () => {
  const { r, snap, errors } = harness({ simon: idle, impostor: idle });
  r.join("p1", "א", "🙂"); r.join("p2", "ב", "🙂");
  r.onMessage("p1", { t: "select_game", gameId: "simon" });
  assert.notEqual(snap("p1").gameId, "simon", "משחק מוסתר נבחר");
  assert.ok(errors("p1").length >= 1, "לא נשלחה שגיאה למארח");
  r.onMessage("p1", { t: "start_game" });
  assert.notEqual(snap("p1").phase, "game", "משחק מוסתר התחיל");
});

test("סבבים שהושלמו נשמרים בתמונת החדר גם אחרי חזרה ללובי", () => {
  const { r, snap } = harness({ impostor: roundsGame });
  r.join("p1", "א", "🙂"); r.join("p2", "ב", "🙂"); r.join("p3", "ג", "🙂");
  r.onMessage("p1", { t: "select_game", gameId: "impostor" });
  r.onMessage("p1", { t: "start_game" });
  assert.equal(snap("p1").phase, "game");
  r.onMessage("p1", { t: "game", d: { a: "x" } as never });
  r.onMessage("p1", { t: "game", d: { a: "x" } as never });
  r.onMessage("p1", { t: "back_to_lobby" });
  const s = snap("p2");
  assert.equal(s.phase, "lobby");
  assert.equal(s.gameRounds, 2, "מספר הסבבים לא הגיע ללקוח");
});

test("משחק חדש מאפס את מונה הסבבים, וסבב ממשחק ישן לא נספר", () => {
  const { r, snap } = harness({ impostor: roundsGame });
  r.join("p1", "א", "🙂"); r.join("p2", "ב", "🙂"); r.join("p3", "ג", "🙂");
  r.onMessage("p1", { t: "select_game", gameId: "impostor" });
  r.onMessage("p1", { t: "start_game" });
  r.onMessage("p1", { t: "game", d: { a: "x" } as never });
  const old = roundCtx!;
  r.onMessage("p1", { t: "back_to_lobby" });
  r.onMessage("p1", { t: "start_game" });
  old.roundDone(); // ctx של המשחק הקודם
  r.onMessage("p1", { t: "back_to_lobby" });
  assert.equal(snap("p1").gameRounds, undefined, "חזרה בלי סבב שלם צריכה להיות נטישה");
});

test("הקומות: ברירת מחדל 4 דקות (3 דקות ריצה + ספרינט), 8 עדיין אפשרי", () => {
  assert.equal(flConfig({}).cycles, 3);
  assert.equal(flConfig({ minutes: "8" }).cycles, 6);
  const floors = CATALOG.find((g) => g.id === "floors")!;
  assert.equal(floors.configOptions![0].values[0].v, "4");
  assert.ok(floors.configOptions![0].values.some((v) => v.v === "8"));
});

console.log(`\n${passed} עברו`);
