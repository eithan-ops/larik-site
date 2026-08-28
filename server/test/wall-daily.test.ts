/**
 * האתגר היומי של החומה: זרע דטרמיניסטי, חדר שמתחיל לבד, וטבלה שהניקוד
 * בה מגיע מהשרת. הרצה: npx tsx test/wall-daily.test.ts
 */
import assert from "node:assert";
import { Room, Transport, GameCtx, GameInstance } from "../src/engine";
import { WallDaily, dailySeed, dailyDate } from "../src/wallDaily";
import { makeMemoryStore } from "../src/store";
import { createWall, makeRng } from "../src/games/wall";
import type { ServerMsg, RoomSnapshot } from "../../shared/protocol";

let passed = 0, total = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  total++;
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); process.exitCode = 1; }
}
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

console.log("האתגר היומי:");

await test("אותו יום נותן אותו זרע, ימים שונים נותנים זרעים שונים", () => {
  assert.equal(dailySeed("2026-09-01"), dailySeed("2026-09-01"));
  assert.notEqual(dailySeed("2026-09-01"), dailySeed("2026-09-02"));
  assert.match(dailyDate(), /^\d{4}-\d{2}-\d{2}$/);
});

await test("אותו זרע מייצר בדיוק את אותה סדרה אקראית", () => {
  // זו התכונה שכל האתגר היומי עומד עליה: אם המחולל לא דטרמיניסטי,
  // כל שחקן מקבל גלים אחרים והטבלה לא אומרת כלום.
  const seq = (seed?: string) => { const r = makeRng(seed); return Array.from({ length: 12 }, () => r()); };
  assert.deepEqual(seq("wall:2026-09-01"), seq("wall:2026-09-01"), "אותו זרע נתן סדרות שונות");
  assert.notDeepEqual(seq("wall:2026-09-01"), seq("wall:2026-09-02"), "זרע אחר נתן בדיוק אותה סדרה");
});

await test("בלי זרע — אקראיות אמיתית, כמו במשחק קבוצתי רגיל", () => {
  const a = Array.from({ length: 12 }, makeRng());
  const b = Array.from({ length: 12 }, makeRng());
  assert.notDeepEqual(a, b);
});

await test("הסדרה מתפרסת על כל התחום ולא נתקעת בקצה", () => {
  const r = makeRng("wall:2026-09-01");
  const v = Array.from({ length: 500 }, () => r());
  assert.ok(Math.min(...v) < 0.1 && Math.max(...v) > 0.9, "המחולל לא מכסה את התחום");
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  assert.ok(Math.abs(avg - 0.5) < 0.06, `הממוצע מוטה: ${avg.toFixed(3)}`);
});

await test("חדר יומי מתחיל מעצמו עם השחקן היחיד, בלי מינימום שחקנים", async () => {
  const inbox: ServerMsg[] = [];
  const transport: Transport = { send: (_p, m) => inbox.push(m) };
  let started = false;
  const fake = (ctx: GameCtx): GameInstance => ({
    onStart() { started = true; ctx.end({ title: "החומה", scores: { solo: 120 }, daily: { seed: "wall:x", wave: 4 } }); },
    onMessage() {}, dispose() {},
  });
  const room = new Room("DAIL", transport, { wall: fake });
  room.armSoloDaily("wall", { seed: "wall:x", solo: true });
  room.join("solo", "בודק", "🧪");
  await settle(600);
  assert.ok(started, "המשחק לא התחיל לבד");
  const err = inbox.find((m) => m.t === "error");
  assert.ok(!err, `נחסם: ${JSON.stringify(err)}`);
});

await test("ריצה יומית מדווחת עם הניקוד מהשרת", async () => {
  const transport: Transport = { send: () => {} };
  const runs: { seed: string; wave: number; players: { name: string; score: number }[] }[] = [];
  const fake = (ctx: GameCtx): GameInstance => ({
    onStart() { ctx.end({ title: "החומה", scores: { solo: 340 }, daily: { seed: "wall:2026-09-01", wave: 7 } }); },
    onMessage() {}, dispose() {},
  });
  const room = new Room("DAIL", transport, { wall: fake }, undefined, { dailyRun: (r) => runs.push(r) });
  room.armSoloDaily("wall", { seed: "wall:2026-09-01", solo: true });
  room.join("solo", "דניאל", "🦊");
  await settle(600);
  assert.equal(runs.length, 1, "הריצה לא דווחה");
  assert.equal(runs[0].wave, 7);
  assert.equal(runs[0].players[0].score, 340, "הניקוד לא הגיע מהשרת");
});

console.log("\nטבלה יומית:");

await test("הטבלה ממוינת, והתוצאה הטובה של שחקן נשמרת ולא האחרונה", async () => {
  const d = new WallDaily(makeMemoryStore());
  await d.submit({ name: "דניאל", emoji: "🦊", score: 300, wave: 5 }, "2026-09-01");
  await d.submit({ name: "שירה", emoji: "🤡", score: 500, wave: 8 }, "2026-09-01");
  await d.submit({ name: "דניאל", emoji: "🦊", score: 120, wave: 2 }, "2026-09-01"); // ריצה גרועה
  const b = await d.board("2026-09-01");
  assert.deepEqual(b.entries.map((e) => e.name), ["שירה", "דניאל"]);
  assert.equal(b.entries[1].score, 300, "ריצה גרועה מחקה תוצאה טובה");
  assert.equal(b.runs, 3, "מונה הריצות לא ספר את כולן");
});

await test("שיפור עצמי כן מעדכן", async () => {
  const d = new WallDaily(makeMemoryStore());
  await d.submit({ name: "דניאל", emoji: "🦊", score: 300, wave: 5 }, "2026-09-01");
  await d.submit({ name: "דניאל", emoji: "🦊", score: 800, wave: 9 }, "2026-09-01");
  const b = await d.board("2026-09-01");
  assert.equal(b.entries.length, 1, "אותו שחקן הופיע פעמיים");
  assert.equal(b.entries[0].score, 800);
});

await test("ימים נפרדים לא מתערבבים", async () => {
  const d = new WallDaily(makeMemoryStore());
  await d.submit({ name: "א", emoji: "🙂", score: 100, wave: 2 }, "2026-09-01");
  assert.equal((await d.board("2026-09-02")).entries.length, 0);
});

await test("מסד שנפל מחזיר טבלה ריקה ולא מפיל את המשחק", async () => {
  const broken = { get: async () => { throw new Error("נפל"); }, put: async () => { throw new Error("נפל"); },
                   list: async () => { throw new Error("נפל"); }, probe: async () => false, kind: "memory" as const };
  const d = new WallDaily(broken);
  const b = await d.board("2026-09-01");
  assert.equal(b.entries.length, 0);
  await assert.doesNotReject(() => d.submit({ name: "א", emoji: "🙂", score: 1, wave: 1 }, "2026-09-01"));
});


/* ---------------------------------------------------------------------------
 * 28.8, מול הלייב: הריצה נגמרה (wl_over, גל 1) — והטבלה נשארה על runs:0.
 * הסיבה: `finish()` רץ רק כשהמארח לוחץ "סיימנו" ממסך הסיום. בערב קבוצתי
 * מישהו באמת לוחץ; בסולו השחקן פשוט סוגר את הלשונית, ודווקא ההתנהגות
 * הרגילה של שחקן מזדמן לא נספרה. הריצה נרשמת עכשיו ברגע שהיא נגמרת.
 * ------------------------------------------------------------------------- */
import { Room as Room2, type Transport as T2, type GameCtx as C2, type GameInstance as I2 } from "../src/engine";

await test("ריצה יומית נרשמת בלי שאף אחד לחץ 'סיימנו'", async () => {
  const runs: { seed: string; wave: number }[] = [];
  const transport: T2 = { send() {} };
  // משחק שרק "נגמרה בו ריצה" — בלי ctx.end, בדיוק כמו החומה אחרי מוות
  const game = (ctx: C2): I2 => ({
    onStart() { ctx.reportDaily({ seed: "wall:2026-08-28", wave: 4, scores: {} }); },
    onMessage() {}, dispose() {},
  });
  const room = new Room2("SOLO", transport, { wall: game }, undefined,
    { dailyRun: (r) => runs.push({ seed: r.seed, wave: r.wave }) });
  room.armSoloDaily("wall", { solo: true, seed: "wall:2026-08-28" });
  room.join("p1", "לבד", "🙂", "dev-1");
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(runs.length, 1, "הריצה לא נרשמה בלי לחיצה על 'סיימנו'");
  assert.equal(runs[0].wave, 4);
});

await test("אותה ריצה לא נספרת פעמיים גם אם המארח כן לחץ 'סיימנו'", async () => {
  const runs: { wave: number }[] = [];
  const transport: T2 = { send() {} };
  const game = (ctx: C2): I2 => ({
    onStart() {
      ctx.reportDaily({ seed: "wall:2026-08-28", wave: 4, scores: {} });   // סוף הריצה
      ctx.end({ title: "החומה", scores: {}, daily: { seed: "wall:2026-08-28", wave: 4 } }); // "סיימנו"
    },
    onMessage() {}, dispose() {},
  });
  const room = new Room2("SOLO", transport, { wall: game }, undefined,
    { dailyRun: (r) => runs.push({ wave: r.wave }) });
  room.armSoloDaily("wall", { solo: true, seed: "wall:2026-08-28" });
  room.join("p1", "לבד", "🙂", "dev-1");
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(runs.length, 1, `נספר ${runs.length} פעמים במקום פעם אחת`);
});

console.log(`\n${passed}/${total} עברו`);
