/**
 * מאגר הטריוויה: מזהים יציבים, בחירה יומית דטרמיניסטית, סינון "כבר ראיתי",
 * וסט הביטים שמעביר את הזיכרון הזה בין המכשיר לשרת.
 * הרצה: npx tsx test/trivia-bank.test.ts
 */
import assert from "node:assert";
import { makeTriviaBank } from "../src/triviaBank";
import { makeMemoryStore } from "../src/store";
import { encodeSeen, decodeSeen } from "../../shared/bitset";

let passed = 0, total = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  total++;
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); process.exitCode = 1; }
}

console.log("מאגר הטריוויה:");

await test("לכל שאלה מזהה ייחודי ורציף", () => {
  const b = makeTriviaBank();
  const all = b.all();
  assert.ok(all.length > 0);
  all.forEach((q, i) => assert.equal(q.id, i, "המזהים חייבים להיות מיקום במערך"));
});

await test("היומית זהה לכל מי ששיחק באותו יום, ושונה בין ימים", () => {
  const b = makeTriviaBank();
  const a1 = b.daily("2026-09-01", 10).map((q) => q.id);
  const a2 = b.daily("2026-09-01", 10).map((q) => q.id);
  const b1 = b.daily("2026-09-02", 10).map((q) => q.id);
  assert.deepEqual(a1, a2, "אותו יום חייב להחזיר בדיוק אותן שאלות");
  assert.notDeepEqual(a1, b1, "יום אחר צריך להחזיר שאלות אחרות");
});

await test("שאלה שנראתה לא חוזרת בבחירה הבאה", () => {
  const b = makeTriviaBank();
  const first = b.pick(5, {});
  const exclude = new Set(first.map((q) => q.id));
  const second = b.pick(5, { exclude });
  for (const q of second) assert.ok(!exclude.has(q.id), `שאלה ${q.id} חזרה למרות שנראתה`);
});

await test("כשנגמרו השאלות — מרפים מהסינון ולא מחזירים חדר ריק", () => {
  const b = makeTriviaBank();
  const all = new Set(b.all().map((q) => q.id)); // ראינו הכול
  const picked = b.pick(8, { exclude: all });
  assert.equal(picked.length, 8, "ערב לא נעצר כי נגמרו שאלות");
});

await test("סינון לפי קטגוריה", () => {
  const b = makeTriviaBank();
  for (const q of b.pick(5, { cat: "israel" })) assert.equal(q.cat, "israel");
});

await test("מפעל השאלות מוסיף, מדלג על כפילויות, ופוסל שאלות פגומות", async () => {
  const b = makeTriviaBank(makeMemoryStore());
  const before = b.size();
  const existing = b.all()[0].q;
  const fake = async () => JSON.stringify({
    questions: [
      { q: "מהי בירת יפן?", options: ["טוקיו", "אוסקה", "קיוטו", "נגויה"], correct: 0 },
      { q: existing, options: ["א", "ב", "ג", "ד"], correct: 0 },          // כפולה
      { q: "Which city is the capital of Japan?", options: ["a", "b", "c", "d"], correct: 0 }, // לא עברית
      { q: "שאלה עם שלוש תשובות בלבד?", options: ["א", "ב", "ג"], correct: 0 },
      { q: "שאלה עם תשובה כפולה בעברית?", options: ["א", "א", "ב", "ג"], correct: 0 },
      { q: "שאלה עם אינדקס לא חוקי בעברית?", options: ["א", "ב", "ג", "ד"], correct: 9 },
    ],
  });
  const r = await b.grow(6, "world", fake);
  assert.equal(r.added, 1, `נוספו ${r.added} במקום 1`);
  assert.equal(r.skipped, 5);
  assert.equal(b.size(), before + 1);
  assert.equal(b.all()[before].q, "מהי בירת יפן?");
  assert.equal(b.all()[before].id, before, "השאלה החדשה קיבלה את המזהה הבא");
});

await test("מודל שמחזיר זבל לא מפיל ולא מזהם את המאגר", async () => {
  const b = makeTriviaBank(makeMemoryStore());
  const before = b.size();
  const r = await b.grow(5, "world", async () => "לא JSON בכלל");
  assert.equal(r.added, 0);
  assert.equal(b.size(), before);
});

console.log("\nסט הביטים:");

await test("קידוד ופענוח מחזירים בדיוק את אותה קבוצה", () => {
  const ids = [0, 1, 7, 8, 9, 63, 64, 500, 9999];
  const back = decodeSeen(encodeSeen(ids));
  assert.deepEqual([...back].sort((a, b) => a - b), ids);
});

await test("קבוצה ריקה", () => {
  assert.equal(encodeSeen([]), "");
  assert.equal(decodeSeen("").size, 0);
});

await test("קלט פגום מחזיר ריק ולא זורק", () => {
  assert.doesNotThrow(() => decodeSeen("!!!לא base64!!!"));
});

await test("3,650 שאלות (שנה של יומית) נשארות מתחת ל-2KB", () => {
  const ids = Array.from({ length: 3650 }, (_, i) => i * 2);
  const blob = encodeSeen(ids);
  assert.ok(blob.length < 2048, `הסט תפח ל-${blob.length} תווים`);
  assert.equal(decodeSeen(blob).size, 3650);
});



/* ---------- כללי הסינון שנולדו מהסבב הראשון מול הלייב ---------- */

console.log("\nסינון שאלות פגומות:");

const goodQ = { q: "מהי בירת צרפת?", options: ["פריז", "ליון", "מרסיי", "ניס"], correct: 0 };
const growOne = async (q: object) => {
  const b = makeTriviaBank(makeMemoryStore());
  return b.grow(1, "world", async () => JSON.stringify({ questions: [q] }));
};

await test("שאלה תקינה עוברת", async () => {
  const r = await growOne(goodQ);
  assert.equal(r.added, 1, JSON.stringify(r.rejected));
});

await test("תו משפה זרה נפסל (הבאג של 'הכայית')", async () => {
  const r = await growOne({ ...goodQ, q: "באיזו שנה התרחשה הכայית והכרזת העצמאות?" });
  assert.equal(r.added, 0);
  assert.match(r.rejected![0], /תווים זרים/);
});

await test("שתי שאלות בפריט אחד נפסלות ('נשאל אחרת')", async () => {
  const r = await growOne({ ...goodQ, q: "מהי הבצורת בימי אליהו? נשאל אחרת: מהי הנקודה הנמוכה?" });
  assert.equal(r.added, 0);
  assert.match(r.rejected![0], /שתי שאלות/);
});

await test("שאלה שעונה על עצמה נפסלת (הבאג של 'שקדייה')", async () => {
  const r = await growOne({ q: "איזה צמח מזוהה עם חג השקדייה?", options: ["שקדייה", "כלנית", "רקפת", "זית"], correct: 0 });
  assert.equal(r.added, 0);
  assert.match(r.rejected![0], /התשובה מופיעה בשאלה/);
});

await test("רמז בסוגריים נפסל", async () => {
  const r = await growOne({ ...goodQ, q: "איזה הר הוא הגבוה בגליל? (רמז: שוכן בגליל העליון)" });
  assert.equal(r.added, 0);
  assert.match(r.rejected![0], /רמז/);
});

await test("שאלה ארוכה מדי נפסלת", async () => {
  // הנוסח האמיתי שהמודל ייצר בסבב הראשון (בלי הרמז, שנתפס בכלל אחר)
  const r = await growOne({ ...goodQ, q: "איזה הר בארץ ישראל מכונה ההר האפור או ההר הקדוש בשל מיקומו ומרכזיותו ההיסטורית, והוא הגבוה בהרי הגליל העליון והסביבה?" });
  assert.equal(r.added, 0);
  assert.match(r.rejected![0], /ארוכה מדי/);
});

await test("תשובה נכונה ארוכה בהרבה מהשאר נפסלת", async () => {
  const r = await growOne({
    q: "איזה יום זיכרון חל לפני יום העצמאות?",
    options: ["יום הזיכרון לחללי מערכות ישראל ולנפגעי פעולות איבה", "יום השואה", "יום רבין", "תשעה באב"],
    correct: 0,
  });
  assert.equal(r.added, 0);
  assert.match(r.rejected![0], /ארוכה בהרבה/);
});

await test("סבב האימות פוסל שאלה שגויה עובדתית", async () => {
  const b = makeTriviaBank(makeMemoryStore());
  const r = await b.grow(2, "world", async (prompt) =>
    prompt.includes('"reject"')
      ? JSON.stringify({ reject: [0] })                       // האימות פוסל את הראשונה
      : JSON.stringify({ questions: [goodQ, { q: "מהי בירת יפן?", options: ["טוקיו", "אוסקה", "קיוטו", "נרה"], correct: 0 }] })
  );
  assert.equal(r.added, 1, JSON.stringify(r.rejected));
  assert.match(r.rejected![0], /נפסלה באימות/);
});

await test("אימות שנפל לא פוסל כלום", async () => {
  const b = makeTriviaBank(makeMemoryStore());
  const r = await b.grow(1, "world", async (prompt) =>
    prompt.includes('"reject"') ? "המודל התבלבל" : JSON.stringify({ questions: [goodQ] })
  );
  assert.equal(r.added, 1);
});

console.log("\nהוצאה משימוש:");

await test("שאלה שהוצאה משימוש לא נבחרת יותר, והמזהים לא זזים", async () => {
  const b = makeTriviaBank(makeMemoryStore());
  const before = b.size();
  const target = b.all()[3];
  await b.retire([3]);
  assert.equal(b.size(), before, "המאגר התכווץ — המזהים זזו");
  assert.equal(b.all()[3].q, target.q, "השאלה במקום 3 השתנתה");
  assert.equal(b.active(), before - 1);
  const picked = b.pick(before, {});
  assert.ok(!picked.some((q) => q.id === 3), "שאלה שהוצאה משימוש עדיין נבחרת");
});

await test("מזהה לא קיים לא מפיל ולא נספר", async () => {
  const b = makeTriviaBank(makeMemoryStore());
  const r = await b.retire([9999, -1]);
  assert.equal(r.disabled, 0);
});

console.log(`\n${passed}/${total} עברו`);
