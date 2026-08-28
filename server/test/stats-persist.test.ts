/**
 * הבדיקה שנולדה מ-28.8: ביום שבו סוף-סוף שיחקו כאן הרבה, ה-deploy של אותו
 * בוקר איפס את המונים והראיה נעלמה. כאן מוודאים שמיזוג ההיסטוריה נכון —
 * שהמספרים נצברים בין עליות, שהשיא לא מסתכם, ושערב לא נספר פעמיים.
 *
 * המיזוג נבדק ישירות (ולא דרך המודול, שנטען פעם אחת בלבד לתהליך).
 * הרצה: npx tsx test/stats-persist.test.ts
 */
import assert from "node:assert";
import type { StatsData } from "../src/stats";
import { makeMemoryStore } from "../src/store";

let passed = 0;
let total = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  total++;
  const done = () => { passed++; console.log(`  ✓ ${name}`); };
  try {
    const r = fn();
    if (r instanceof Promise) return r.then(done, (e: Error) => { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; });
    done();
  } catch (e) { console.error(`  ✗ ${name}\n    ${(e as Error).message}`); process.exitCode = 1; }
}

const KEEP_DAYS = 90;

/** עותק של המיזוג שב-stats.ts — הלוגיקה היחידה שאם תישבר, המספרים ילכו לאיבוד */
function merge(saved: StatsData, live: StatsData): StatsData {
  const out: StatsData = {
    since: saved.since < live.since ? saved.since : live.since,
    bootAt: live.bootAt,
    roomsCreated: saved.roomsCreated + live.roomsCreated,
    playersJoined: saved.playersJoined + live.playersJoined,
    gamesStarted: { ...saved.gamesStarted },
    peakConcurrent: Math.max(saved.peakConcurrent, live.peakConcurrent),
    daily: {},
  };
  for (const [id, n] of Object.entries(live.gamesStarted)) out.gamesStarted[id] = (out.gamesStarted[id] ?? 0) + n;
  for (const src of [saved.daily, live.daily]) {
    for (const [d, v] of Object.entries(src)) {
      const t = (out.daily[d] ??= { rooms: 0, players: 0, games: 0 });
      t.rooms += v.rooms || 0; t.players += v.players || 0; t.games += v.games || 0;
    }
  }
  const keep = Object.keys(out.daily).sort().slice(-KEEP_DAYS);
  out.daily = Object.fromEntries(keep.map((d) => [d, out.daily[d]]));
  return out;
}

const mk = (o: Partial<StatsData> = {}): StatsData => ({
  since: "2026-08-01T00:00:00.000Z",
  bootAt: "2026-08-28T11:02:00.000Z",
  roomsCreated: 0, playersJoined: 0, gamesStarted: {}, peakConcurrent: 0, daily: {},
  ...o,
});

console.log("שרידות סטטיסטיקות:");

await test("מונים נצברים בין עליות — deploy כבר לא מוחק", () => {
  const saved = mk({ roomsCreated: 40, playersJoined: 120, gamesStarted: { wall: 12, trivia: 5 } });
  const live = mk({ roomsCreated: 4, playersJoined: 9, gamesStarted: { wall: 1 } });
  const m = merge(saved, live);
  assert.equal(m.roomsCreated, 44);
  assert.equal(m.playersJoined, 129);
  assert.equal(m.gamesStarted.wall, 13, "משחק שקיים בשניהם לא הסתכם");
  assert.equal(m.gamesStarted.trivia, 5, "משחק שהיה רק בהיסטוריה נמחק");
});

await test("שיא מחוברים הוא מקסימום ולא סכום", () => {
  assert.equal(merge(mk({ peakConcurrent: 11 }), mk({ peakConcurrent: 3 })).peakConcurrent, 11);
  assert.equal(merge(mk({ peakConcurrent: 3 }), mk({ peakConcurrent: 11 })).peakConcurrent, 11);
});

await test("‏since נשאר התאריך המוקדם — 'מאז' לא מתאפס לזמן ה-deploy", () => {
  const saved = mk({ since: "2026-07-04T00:00:00.000Z" });
  const live = mk({ since: "2026-08-28T11:02:00.000Z" });
  assert.equal(merge(saved, live).since, "2026-07-04T00:00:00.000Z");
});

await test("יום שנחתך על ידי deploy מתאחד לשורה אחת", () => {
  const saved = mk({ daily: { "2026-08-28": { rooms: 9, players: 22, games: 7 } } });
  const live = mk({ daily: { "2026-08-28": { rooms: 4, players: 4, games: 1 } } });
  const d = merge(saved, live).daily["2026-08-28"];
  assert.deepEqual(d, { rooms: 13, players: 26, games: 8 });
  assert.equal(Object.keys(merge(saved, live).daily).length, 1, "אותו יום הופיע פעמיים");
});

await test("ימים שונים נשמרים בנפרד", () => {
  const m = merge(
    mk({ daily: { "2026-08-27": { rooms: 2, players: 5, games: 1 } } }),
    mk({ daily: { "2026-08-28": { rooms: 4, players: 4, games: 1 } } }),
  );
  assert.equal(Object.keys(m.daily).length, 2);
  assert.equal(m.daily["2026-08-27"].rooms, 2);
});

await test("הפירוט היומי נגזם ל-90 יום — המסמך לא תופח לנצח", () => {
  const daily: StatsData["daily"] = {};
  for (let i = 0; i < 200; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    daily[d] = { rooms: 1, players: 1, games: 1 };
  }
  const m = merge(mk({ daily }), mk());
  const keys = Object.keys(m.daily).sort();
  assert.equal(keys.length, KEEP_DAYS);
  assert.equal(keys[keys.length - 1], "2026-07-19", "נגזמו הימים החדשים במקום הישנים");
});

await test("מיזוג עם היסטוריה ריקה לא משנה כלום", () => {
  const live = mk({ roomsCreated: 4, playersJoined: 4, gamesStarted: { wall: 1 }, peakConcurrent: 3 });
  const m = merge(mk(), live);
  assert.equal(m.roomsCreated, 4);
  assert.equal(m.gamesStarted.wall, 1);
  assert.equal(m.peakConcurrent, 3);
});

await test("סבב מלא דרך אחסון: שלוש עליות רצופות צוברות", async () => {
  const store = makeMemoryStore();
  const KEY = "stats:v1";
  let acc = mk({ roomsCreated: 0, daily: {} });
  for (let boot = 1; boot <= 3; boot++) {
    // עלייה חדשה: המונים מתחילים מאפס, נספרים 5 חדרים, ואז נשמרים
    const live = mk({ roomsCreated: 5, daily: { "2026-08-28": { rooms: 5, players: 5, games: 2 } } });
    const saved = (await store.get<StatsData>(KEY)) ?? mk();
    acc = merge(saved, live);
    await store.put(KEY, acc);
  }
  const final = (await store.get<StatsData>(KEY))!;
  assert.equal(final.roomsCreated, 15, `אחרי 3 עליות: ${final.roomsCreated} (צפוי 15)`);
  assert.equal(final.daily["2026-08-28"].games, 6);
});

console.log(`\n${passed}/${total} עברו`);
