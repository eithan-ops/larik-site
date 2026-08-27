/**
 * זרימה מלאה: חדר → משחק → טקס → "שמרו את החבורה" → ערב נוסף שנזקף לאותה עונה.
 * זו הבדיקה שמכסה את החיווט בין המנוע לחבורה, ובעיקר את מה שקל לשבור:
 * שהערב לא נספר פעמיים ושהנקודות לא נזקפות כפול.
 * הרצה: npx tsx test/group-flow.test.ts
 */
import assert from "node:assert";
import { Room, Transport, GameCtx, GameInstance } from "../src/engine";
import { Groups } from "../src/groups";
import { makeMemoryStore } from "../src/store";
import type { ServerMsg, RoomSnapshot } from "../../shared/protocol";

let passed = 0;
let total = 0;
async function test(name: string, fn: () => Promise<void>) {
  total++;
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); process.exitCode = 1; }
}

/** האחסון אסינכרוני — נותנים למיקרוטאסקים להתנקז לפני שבודקים */
const settle = () => new Promise((r) => setTimeout(r, 5));

function harness(groups: Groups) {
  const inbox = new Map<string, ServerMsg[]>();
  const transport: Transport = {
    send(pid, msg) { (inbox.get(pid) ?? inbox.set(pid, []).get(pid)!).push(msg); },
  };
  // המנצח הוא הראשון שהצטרף והליצן הוא האחרון — כך אותו *מכשיר* מנצח בכל חדר,
  // וזה מה שמאפשר לבדוק צבירה של עונה בין ערבים בחדרים שונים.
  const game = (ctx: GameCtx): GameInstance => ({
    onStart() {
      const ids = ctx.participants().map((p) => p.id);
      ctx.end({
        title: "משחק",
        winnerId: ids[0],
        loserId: ids.length > 2 ? ids[ids.length - 1] : undefined,
        scores: {},
        facts: ids[1] ? { [ids[1]]: { bestReactionMs: 404 } } : {},
      });
    },
    onMessage() {},
    dispose() {},
  });
  const room = new Room("KFRT", transport, { trivia: game }, undefined, {}, groups);
  const snap = (pid: string): RoomSnapshot =>
    ([...(inbox.get(pid) ?? [])].reverse().find((m) => m.t === "room") as { room: RoomSnapshot }).room;
  return { room, snap };
}

async function playGame(room: Room, host = "p1") {
  room.onMessage(host, { t: "select_game", gameId: "trivia" });
  room.onMessage(host, { t: "start_game" });
  await settle();
}

console.log("חדר + חבורה:");

await test("שמירת חבורה בטקס יוצרת עונה וזוקפת את הערב שכבר שוחק", async () => {
  const groups = new Groups(makeMemoryStore());
  const { room, snap } = harness(groups);
  ["p1", "p2", "p3"].forEach((p, i) => room.join(p, "שחקן" + i, "🙂", "g-" + p));
  await playGame(room);

  assert.equal(snap("p1").ceremony?.group, undefined, "לפני השמירה לא אמורה להיות חבורה");
  room.onMessage("p1", { t: "save_group", name: "הרביעייה" });
  await settle();

  const g = snap("p1").group;
  assert.ok(g, "החבורה לא הופיעה בסנפשוט");
  assert.equal(g!.name, "הרביעייה");
  assert.equal(g!.evenings, 1, "הערב שכבר שוחק לא נזקף");
  assert.equal(g!.table.length, 3);
  assert.equal(g!.table[0].points, 3, "המנצח לא קיבל את נקודות הערב");
});

await test("משחק שני באותו ערב לא סופר ערב נוסף ולא זוקף נקודות כפול", async () => {
  const groups = new Groups(makeMemoryStore());
  const { room, snap } = harness(groups);
  ["p1", "p2", "p3"].forEach((p, i) => room.join(p, "שחקן" + i, "🙂", "g-" + p));
  await playGame(room);
  room.onMessage("p1", { t: "save_group", name: "החבורה" });
  await settle();

  room.onMessage("p1", { t: "back_to_lobby" });
  await playGame(room);

  const g = snap("p1").group!;
  assert.equal(g.evenings, 1, "אותו ערב נספר פעמיים");
  const p1 = g.table.find((m) => m.pid === "g-p1")!;
  assert.equal(p1.points, 6, `נקודות שגויות: ${p1.points} (צפוי 6 = שני ניצחונות)`);
});

await test("ערב חדש בחדר חדש נזקף לאותה חבורה", async () => {
  const groups = new Groups(makeMemoryStore());
  const a = harness(groups);
  ["p1", "p2", "p3"].forEach((p, i) => a.room.join(p, "שחקן" + i, "🙂", "g-" + p));
  await playGame(a.room);
  a.room.onMessage("p1", { t: "save_group", name: "החבורה" });
  await settle();
  const gid = a.snap("p1").group!.id;

  // ערב אחר, חדר אחר, אותם מכשירים
  const b = harness(groups);
  await b.room.attachGroup(gid);
  ["x1", "x2", "x3"].forEach((p, i) => b.room.join(p, "שחקן" + i, "🙂", "g-p" + (i + 1)));
  await playGame(b.room, "x1");

  const g = b.snap("x1").group!;
  assert.equal(g.evenings, 2, "הערב השני לא נספר");
  const p1 = g.table.find((m) => m.pid === "g-p1")!;
  assert.equal(p1.points, 6, "העונה לא צברה בין שני הערבים");
});

await test("שיא נשמר בחבורה בין ערבים", async () => {
  const groups = new Groups(makeMemoryStore());
  const { room, snap } = harness(groups);
  ["p1", "p2", "p3"].forEach((p, i) => room.join(p, "שחקן" + i, "🙂", "g-" + p));
  await playGame(room);
  room.onMessage("p1", { t: "save_group", name: "החבורה" });
  await settle();
  const rec = snap("p1").group!.records.find((r) => r.label.includes("מהירה"));
  assert.ok(rec, "שיא האצבע המהירה לא נשמר");
  assert.equal(rec!.value, 404);
});

await test("בלי מזהה מכשיר — עדיין נשמר, לפי מזהה החדר", async () => {
  const groups = new Groups(makeMemoryStore());
  const { room, snap } = harness(groups);
  ["p1", "p2", "p3"].forEach((p, i) => room.join(p, "שחקן" + i, "🙂"));
  await playGame(room);
  room.onMessage("p1", { t: "save_group", name: "החבורה" });
  await settle();
  assert.equal(snap("p1").group!.table.length, 3);
});

await test("רק המארח יכול לשמור חבורה", async () => {
  const groups = new Groups(makeMemoryStore());
  const { room, snap } = harness(groups);
  ["p1", "p2"].forEach((p, i) => room.join(p, "שחקן" + i, "🙂", "g-" + p));
  await playGame(room);
  room.onMessage("p2", { t: "save_group", name: "חטיפה" });
  await settle();
  assert.equal(snap("p1").group, undefined);
});

await test("כרטיס הסיום מקבל את שם החבורה ואת מספר הערב", async () => {
  const groups = new Groups(makeMemoryStore());
  const { room, snap } = harness(groups);
  ["p1", "p2", "p3"].forEach((p, i) => room.join(p, "שחקן" + i, "🙂", "g-" + p));
  await playGame(room);
  room.onMessage("p1", { t: "save_group", name: "הרביעייה מהמילואים" });
  await settle();
  const c = snap("p2").ceremony!;
  assert.equal(c.group?.name, "הרביעייה מהמילואים");
  assert.equal(c.group?.evenings, 1);
  assert.ok(c.awards?.p2, "התארים נעלמו כשנוספה חבורה");
});

console.log(`\n${passed}/${total} עברו`);
