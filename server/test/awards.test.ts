/**
 * מבחן מנוע התארים.
 * הכלל שנבדק כאן הוא הכלל שמייצר את השיתופים: לכל שחקן תואר, ואף תואר לא חוזר פעמיים.
 * הרצה: npx tsx test/awards.test.ts
 */
import assert from "node:assert";
import { computeAwards, mergeFacts } from "../src/awards";
import type { PlayerFacts } from "../../shared/protocol";

let passed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); process.exitCode = 1; }
}

console.log("מנוע התארים:");

test("כל שחקן מקבל תואר, ואף תואר לא ניתן פעמיים", () => {
  const facts: Record<string, PlayerFacts> = {
    a: { games: 3, wins: 2, points: 8, bestStreak: 2, wonGames: 2 },
    b: { games: 3, wins: 1, points: 5, bestReactionMs: 410, taps: 12 },
    c: { games: 3, wins: 0, clown: 2, points: 2 },
    d: { games: 3, wins: 0, points: 4, correct: 6, wrong: 1 },
    e: { games: 3, wins: 0, points: 4, peeks: 2 },
    f: { games: 3, wins: 0, points: 3, impostorRounds: 2 },
  };
  const out = computeAwards(facts);
  assert.equal(Object.keys(out).length, 6, "כל שחקן חייב לקבל תואר");
  const ids = Object.values(out).map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, `תואר כפול: ${ids.join(", ")}`);
});

test("התארים המדידים הולכים למי שבאמת הכי טוב", () => {
  const out = computeAwards({
    a: { games: 2, wins: 2, points: 6, bestStreak: 2, wonGames: 2 },
    b: { games: 2, wins: 0, points: 2, bestReactionMs: 380 },
    c: { games: 2, wins: 0, points: 2, bestReactionMs: 900, clown: 1 },
  });
  assert.equal(out.a.id, "king");
  assert.equal(out.b.id, "fastest");
  assert.equal(out.b.detail, "0.38 שניות");
  assert.equal(out.c.id, "clown");
});

test("יותר שחקנים מתארים — אף אחד לא נשאר בלי כרטיס", () => {
  const facts: Record<string, PlayerFacts> = {};
  for (let i = 0; i < 30; i++) facts[`p${i}`] = { games: 1 };
  const out = computeAwards(facts);
  assert.equal(Object.keys(out).length, 30);
  for (const a of Object.values(out)) assert.ok(a.title.length > 0);
});

test("דטרמיניסטי — אותן עובדות מחזירות בדיוק אותם תארים", () => {
  const facts: Record<string, PlayerFacts> = {
    x: { games: 2, wins: 1, points: 4, taps: 9 },
    y: { games: 2, wins: 1, points: 4, taps: 9 },
    z: { games: 2, wins: 0, points: 2, survivedLast: 1 },
  };
  const a = JSON.stringify(computeAwards(facts));
  const b = JSON.stringify(computeAwards(facts));
  assert.equal(a, b);
});

test("חדר ריק לא מפיל את המנוע", () => {
  assert.deepEqual(computeAwards({}), {});
});

test("מיזוג עובדות: זמנים לוקחים מינימום, השאר מצטבר", () => {
  const f: PlayerFacts = {};
  mergeFacts(f, { taps: 3, bestReactionMs: 700, bestStreak: 1 });
  mergeFacts(f, { taps: 4, bestReactionMs: 520, bestStreak: 3 });
  assert.equal(f.taps, 7, "נגיעות מצטברות");
  assert.equal(f.bestReactionMs, 520, "זמן תגובה = הטוב ביותר");
  assert.equal(f.bestStreak, 3, "רצף = הגבוה ביותר");
});

test("ערכים לא תקינים לא נכנסים לעובדות", () => {
  const f: PlayerFacts = { taps: 2 };
  mergeFacts(f, { taps: NaN as number, bestReactionMs: Infinity });
  assert.equal(f.taps, 2);
  assert.equal(f.bestReactionMs, undefined);
});

console.log(`\n${passed}/7 עברו`);
