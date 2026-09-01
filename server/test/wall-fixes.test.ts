/**
 * "החומה" — בדיקות רגרסיה לסבב תיקוני הבאגים (1.9.2026).
 * מריצים: npx tsx test/wall-fixes.test.ts
 *
 *  1. A1: ‎power של הקשת מאומת בשרת — לקוח עוין לא מקבל פי-50 נזק ולא *מרפא* אויבים.
 *  2. A9: קבוצה שפותחת בגל גבוה מקבלת רמות פתיחה + דראפטים (ולא רמה 1 מול אויבים ×3.5).
 *  3. A6: שער השרת רך מהלקוח — ירייה בקצב הלקוח המדויק לא נבלעת.
 */
import { Room, Transport } from "../src/engine";
import { createWall } from "../src/games/wall";
import type { ServerMsg } from "../../shared/protocol";

let failed = 0;
function check(name: string, cond: boolean) {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name);
  if (!cond) failed++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeTransport() {
  const inbox = new Map<string, ServerMsg[]>();
  const transport: Transport = {
    send(pid, msg) {
      if (!inbox.has(pid)) inbox.set(pid, []);
      inbox.get(pid)!.push(msg);
    },
  };
  const game = (pid: string, a: string) =>
    (inbox.get(pid) ?? []).filter((m: any) => (m.t === "game" || m.t === "cue") && m.d?.a === a).map((m: any) => m.d);
  return { transport, game };
}

/** A1 — clamp ל-power: יריות עם power=9 ועם power=-5 */
async function testPowerClamp() {
  console.log("\n— A1: אימות power של הקשת 🏹 —");
  const { transport, game } = makeTransport();
  const room = new Room("PWR", transport, { wall: createWall });
  ["c1", "c2"].forEach((p, i) => room.join(p, "ק" + i, "🙂"));
  room.onMessage("c1", { t: "select_game", gameId: "wall", config: { seed: "fix-power-v1" } });
  room.onMessage("c1", { t: "start_game" });
  room.onMessage("c1", { t: "game", d: { a: "wl_role", role: "archer" } });
  room.onMessage("c2", { t: "game", d: { a: "wl_role", role: "archer" } });
  room.onMessage("c1", { t: "game", d: { a: "wl_go" } });
  await sleep(400);

  const dead = new Set<number>();
  const posOf = (e: any, t: number): [number, number] => [
    e.x0 + e.wob * Math.sin((t - e.at) / 700),
    Math.min(1250 - 45, e.y0 + (e.speed * (t - e.at)) / 1000),
  ];
  let shot = 0;
  const bot = setInterval(() => {
    for (const h of game("c1", "wl_hit") as any[]) if (h.hp <= 0) dead.add(h.id);
    const live = (game("c1", "wl_spawn") as any[]).filter((e) => !dead.has(e.id));
    if (!live.length) return;
    const e = live[Math.floor(Math.random() * live.length)];
    const [x, y] = posOf(e, room.now());
    if (y < 60) return;
    // מתחלפים: ירייה "רגילה" עם power מנופח, וירייה עם power שלילי
    const power = shot++ % 2 === 0 ? 9 : -5;
    room.onMessage("c1", { t: "game", d: { a: "wl_shot", tx: Math.round(x), ty: Math.round(y), power } });
  }, 700);
  await sleep(20_000);
  clearInterval(bot);

  // תקרת הנזק התאורטית של הקשת בלי אף קלף: 26 · דרגה · קריט מקסימלי (אין — crit=0).
  // הדרגה עולה עם הרמה גם בלי בחירות, אז קוראים אותה מ-wl_tier.
  const tiers = (game("c1", "wl_tier") as any[]).filter((t) => t.pid === "c1").map((t) => t.tier);
  const maxTier = Math.max(1, ...tiers);
  const ceil = 26 * (1 + 0.45 * (maxTier - 1)) + 1;
  const myHits = (game("c1", "wl_hit") as any[]).filter((h) => h.by === "c1");
  // עוקבים אחרי ה-hp של כל אויב: הדלתא לעולם לא חורגת מהתקרה, וה-hp לעולם לא עולה
  const lastHp = new Map<number, number>();
  for (const s of game("c1", "wl_spawn") as any[]) lastHp.set(s.id, s.hp);
  let maxDelta = 0, healedUp = false;
  for (const h of myHits) {
    const prev = lastHp.get(h.id);
    if (prev !== undefined) {
      if (h.hp > prev + 0.5) healedUp = true;          // power שלילי היה *מרפא*
      maxDelta = Math.max(maxDelta, prev - h.hp);
    }
    lastHp.set(h.id, h.hp);
  }
  console.log(`    (יריות: ${shot}, פגיעות: ${myHits.length}, דלתא מרבית: ${Math.round(maxDelta)}, תקרה: ${Math.round(ceil)})`);
  check("פגיעות נרשמו (הבוט עובד)", myHits.length > 3);
  check("power מנופח לא נותן נזק מעבר לתקרה", maxDelta <= ceil);
  check("power שלילי לא מרפא אויבים", !healedUp);
}

/** A9 — רמות פתיחה לקבוצה שפותחת בגל גבוה */
async function testStartLevels() {
  console.log("\n— A9: רמות פתיחה בגל גבוה 🎁 —");
  const { transport, game } = makeTransport();
  const room = new Room("STL", transport, { wall: createWall });
  ["s1", "s2"].forEach((p, i) => room.join(p, "ש" + i, "🙂"));
  room.onMessage("s1", { t: "select_game", gameId: "wall", config: { startWave: 6, seed: "fix-start-v1" } });
  room.onMessage("s1", { t: "start_game" });
  room.onMessage("s1", { t: "game", d: { a: "wl_role", role: "heli" } });
  room.onMessage("s2", { t: "game", d: { a: "wl_role", role: "mg" } });
  room.onMessage("s1", { t: "game", d: { a: "wl_go" } });
  await sleep(600);

  // גל פתיחה 6 ⇒ בונוס 2·(6-1)=10 רמות ⇒ רמה 11, דרגה 4, ודראפט ראשון כבר מוצע
  const xp1 = (game("s1", "wl_xp") as any[]).at(-1);
  const hand1 = game("s1", "wl_levelup") as any[];
  console.log(`    (רמת פתיחה: ${xp1?.level}, דראפטים שהוצעו: ${hand1.length})`);
  check("רמת הפתיחה תואמת את הגל (רמה 11 בגל 6)", (xp1?.level ?? 1) === 11);
  check("דראפט פתיחה הוצע מיד", hand1.length >= 1);
  check("גם השחקן השני קיבל", ((game("s2", "wl_xp") as any[]).at(-1)?.level ?? 1) === 11);
  const tier1 = (game("s1", "wl_tier") as any[]).filter((t) => t.pid === "s1").at(-1);
  check("דרגת הנשק עודכנה ושודרה", (tier1?.tier ?? 1) === 4);
  // הדראפטים משתחררים בשרשרת: בוחרים את הראשון — מיד מגיע הבא (pendingLevels)
  const c0 = hand1[0].cards[0];
  room.onMessage("s1", { t: "game", d: { a: "wl_pick", cardId: c0.id } });
  await sleep(200);
  check("בחירה משחררת את הדראפט הממתין הבא", (game("s1", "wl_levelup") as any[]).length >= 2);
}

/** A6 — שער רך: ירי בקצב הלקוח המדויק (660ms) לא נבלע גם עם ג'יטר קטן */
async function testSoftGate() {
  console.log("\n— A6: שער שרת רך 🎯 —");
  const { transport, game } = makeTransport();
  const room = new Room("GTE", transport, { wall: createWall });
  ["g1", "g2"].forEach((p, i) => room.join(p, "ג" + i, "🙂"));
  room.onMessage("g1", { t: "select_game", gameId: "wall", config: { seed: "fix-gate-v1" } });
  room.onMessage("g1", { t: "start_game" });
  room.onMessage("g1", { t: "game", d: { a: "wl_role", role: "archer" } });
  room.onMessage("g2", { t: "game", d: { a: "wl_role", role: "archer" } });
  room.onMessage("g1", { t: "game", d: { a: "wl_go" } });
  await sleep(3600); // מחכים שהגל יתחיל
  let sent = 0;
  // 12 יריות במרווח 660ms מינוס ג'יטר של עד 40ms — כמו הודעות אמיתיות ברשת
  for (let i = 0; i < 12; i++) {
    room.onMessage("g1", { t: "game", d: { a: "wl_shot", tx: 500, ty: 600, power: 1 } });
    sent++;
    await sleep(660 - Math.floor(Math.random() * 40));
  }
  const cues = (game("g2", "wl_arrow") as any[]).filter((a) => a.by === "g1");
  console.log(`    (נשלחו: ${sent}, נורו בפועל: ${cues.length})`);
  check("אף ירייה בקצב הלקוח לא נבלעת בשער השרת", cues.length === sent);
}

async function main() {
  await testPowerClamp();
  await testStartLevels();
  await testSoftGate();
  console.log(failed ? `\n${failed} בדיקות נכשלו ✗` : "\nכל בדיקות התיקונים עברו ✓");
  process.exit(failed ? 1 : 0);
}
main();
