/**
 * "החבורה שלנו" — אחסון, עונה, שיאים, וההתנהגות כשהמסד נופל.
 * הרצה: npx tsx test/groups.test.ts
 */
import assert from "node:assert";
import { Groups } from "../src/groups";
import { makeMemoryStore, makeBrokenStore } from "../src/store";

let passed = 0;
let total = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  total++;
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); process.exitCode = 1; }
}

const P = (pid: string, points: number, won = false, clown = false) =>
  ({ pid, name: pid, emoji: "🙂", points, won, clown });

console.log("החבורה שלנו:");

await test("חבורה נוצרת עם חברי הערב ומקבלת קוד", async () => {
  const g = new Groups(makeMemoryStore());
  const group = await g.create("הרביעייה", [{ pid: "a", name: "דניאל", emoji: "🦊" }]);
  assert.match(group.id, /^[A-Z]{5}$/);
  assert.equal(group.name, "הרביעייה");
  assert.equal(group.members.a.name, "דניאל");
  assert.equal(group.evenings, 0);
});

await test("ערב אחד: נקודות נצברות, מונה הערבים עולה פעם אחת", async () => {
  const g = new Groups(makeMemoryStore());
  const { id } = await g.create("חבורה", [{ pid: "a", name: "א", emoji: "🙂" }]);
  // שלושה משחקים באותו ערב — רק הראשון סופר כערב
  await g.applyGame(id, [P("a", 3, true), P("b", 1)], {}, true);
  await g.applyGame(id, [P("a", 1), P("b", 3, true)], {}, false);
  await g.applyGame(id, [P("a", 3, true), P("b", 0, false, true)], {}, false);
  const group = (await g.get(id))!;
  assert.equal(group.evenings, 1, "ערב נספר יותר מפעם אחת");
  assert.equal(group.members.a.points, 7);
  assert.equal(group.members.a.wins, 2);
  assert.equal(group.members.a.evenings, 1);
  assert.equal(group.members.b.clown, 1);
  assert.equal(group.members.b.evenings, 1, "מצטרף חדש קיבל ערב");
});

await test("שני ערבים — הנקודות ממשיכות להצטבר", async () => {
  const g = new Groups(makeMemoryStore());
  const { id } = await g.create("חבורה", []);
  await g.applyGame(id, [P("a", 5)], {}, true);
  await g.applyGame(id, [P("a", 4)], {}, true);
  const group = (await g.get(id))!;
  assert.equal(group.evenings, 2);
  assert.equal(group.members.a.points, 9);
});

await test("שיאים: הזמן הכי טוב נשמר, זמן גרוע יותר לא דורס", async () => {
  const g = new Groups(makeMemoryStore());
  const { id } = await g.create("חבורה", []);
  await g.applyGame(id, [P("a", 1), P("b", 1)], { a: { bestReactionMs: 500 } }, true);
  await g.applyGame(id, [P("a", 1), P("b", 1)], { b: { bestReactionMs: 900 } }, false);
  await g.applyGame(id, [P("a", 1), P("b", 1)], { b: { bestReactionMs: 380 } }, false);
  const group = (await g.get(id))!;
  assert.equal(group.records.fastest.value, 380);
  assert.equal(group.records.fastest.pid, "b");
});

await test("עונה שנגמרה מתאפסת ומספרה עולה", async () => {
  let now = Date.now();
  const g = new Groups(makeMemoryStore(), () => now);
  const { id } = await g.create("חבורה", []);
  await g.applyGame(id, [P("a", 10)], {}, true);
  now += 91 * 864e5; // 91 ימים
  await g.applyGame(id, [P("a", 2)], {}, true);
  const group = (await g.get(id))!;
  assert.equal(group.seasonNo, 2, "העונה לא התחלפה");
  assert.equal(group.members.a.points, 2, "הנקודות הישנות לא התאפסו");
  assert.equal(group.evenings, 2, "מונה הערבים הכולל צריך להמשיך לספור");
});

await test("התקציר ממוין, חתוך, ובלי שדות פנימיים", async () => {
  const g = new Groups(makeMemoryStore());
  const { id } = await g.create("חבורה", []);
  await g.applyGame(id, [P("a", 3), P("b", 9), P("c", 6)], {}, true);
  const s = g.summarize((await g.get(id))!);
  assert.deepEqual(s.table.map((m) => m.pid), ["b", "c", "a"]);
  assert.equal(s.seasonNo, 1);
  assert.ok(s.daysLeftInSeason > 80 && s.daysLeftInSeason <= 90);
  assert.equal((s.table[0] as unknown as { lastSeen?: number }).lastSeen, undefined);
});

await test("שינוי שם", async () => {
  const g = new Groups(makeMemoryStore());
  const { id } = await g.create("שם ישן", []);
  await g.rename(id, "שם חדש");
  assert.equal((await g.get(id))!.name, "שם חדש");
});

await test("חבורה שלא קיימת מחזירה null ולא זורקת", async () => {
  const g = new Groups(makeMemoryStore());
  assert.equal(await g.get("ZZZZZ"), null);
  assert.equal(await g.applyGame("ZZZZZ", [P("a", 1)], {}, true), null);
});

await test("מסד שנפל: הערב ממשיך, והנתונים עדיין נקראים מהזיכרון", async () => {
  const g = new Groups(makeBrokenStore());
  const group = await g.create("חבורה", [{ pid: "a", name: "א", emoji: "🙂" }]);
  // ה-put נכשל אצל המסד אבל נשמר במטמון — הערב לא נשבר
  const after = await g.applyGame(group.id, [P("a", 4, true)], {}, true);
  assert.ok(after, "החבורה נעלמה כשהמסד נפל");
  assert.equal(after!.members.a.points, 4);
});

console.log(`\n${passed}/${total} עברו`);
