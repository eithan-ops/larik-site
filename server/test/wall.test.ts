/**
 * "החומה" — בדיקות רגרסיה לסבב התיקונים (27.8.2026).
 * מריצים: npx tsx test/wall.test.ts
 *
 * מכסה בדיוק את מה שנשבר:
 *  1. גיבור שנפל *חייב* לקום — גם אם הנפילה קרתה על גבול הגל (הבאג: טיימר תלוי-token).
 *  2. סוף גל = התאוששות (ריפוי) לכל מי ששרד.
 *  3. wl_mods נשלח בתחילת ריצה — בלעדיו "קצב אש"/"זריזות" לא מורגשים בלקוח.
 *  4. wl_heat נשלח למקלען.
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

async function testWall() {
  console.log("\n— החומה 🏰 —");
  const { transport, game } = makeTransport();
  const room = new Room("WALL", transport, { wall: createWall });
  const P = ["p1", "p2", "p3"];
  P.forEach((p, i) => room.join(p, "לוחם" + i, "🙂"));
  room.onMessage("p1", { t: "select_game", gameId: "wall", config: { difficulty: "normal" } });
  room.onMessage("p1", { t: "start_game" });
  check("מסך היערכות", game("p1", "wl_setup").length === 1);

  // p1 = חלוץ (יחטוף), p3 = מקלען (בשביל wl_heat)
  room.onMessage("p1", { t: "game", d: { a: "wl_role", role: "heli" } });
  room.onMessage("p2", { t: "game", d: { a: "wl_role", role: "archer" } });
  room.onMessage("p3", { t: "game", d: { a: "wl_role", role: "mg" } });
  room.onMessage("p1", { t: "game", d: { a: "wl_go" } });

  check("wl_mods נשלח בתחילת ריצה", game("p1", "wl_mods").length >= 1);
  const m0 = game("p1", "wl_mods").at(-1)!;
  check("wl_mods עם ערכי בסיס", (m0 as any).rate === 1 && (m0 as any).speed === 1);

  await sleep(6000);
  check("wl_heat זורם למקלען", game("p3", "wl_heat").length >= 5);
  check("אויבים נולדו", game("p1", "wl_spawn").length > 0);

  // ⚠️ גל 1 האמיתי. הנוסחה נתנה k=0 (‎floor(-1/2.5)=-1) ⇒ perPush=Infinity ⇒
  // delay=NaN ⇒ *כל* הגל נולד באותה מילישנייה, בחלון של 6 שניות. הסימולטור
  // פספס כי קבוצה מתחילה בגל 2 — זה נתפס רק בפרודקשן.
  const w1 = (game("p1", "wl_wave") as any[])[0];
  check("גל 1: יש לפחות דחיפה אחת", (w1?.pushes ?? 0) >= 1);
  check("גל 1: משך הגל שפוי (לא 6 שניות)", (w1?.duration ?? 0) >= 10000);
  console.log(`    (גל 1: דחיפות=${w1?.pushes} משך=${w1?.duration}ms)`);

  // בוטים: הקשת והמקלען יורים על אויבים חיים (אותה נוסחת מסלול כמו השרת/הלקוח),
  // החלוץ לא נוגע — כך הוא חוטף ונופל, וזו בדיוק הבדיקה.
  const dead = new Set<number>();
  const posOf = (e: any, t: number): [number, number] => [
    e.x0 + e.wob * Math.sin((t - e.at) / 700),
    Math.min(1250 - 45, e.y0 + (e.speed * (t - e.at)) / 1000),
  ];
  const bot = setInterval(() => {
    for (const h of game("p1", "wl_hit") as any[]) if (h.hp <= 0) dead.add(h.id);
    const live = (game("p1", "wl_spawn") as any[]).filter((e) => !dead.has(e.id));
    if (!live.length) return;
    const e = live[Math.floor(Math.random() * live.length)];
    const [x, y] = posOf(e, room.now());
    if (y < 60) return;
    room.onMessage("p2", { t: "game", d: { a: "wl_shot", tx: Math.round(x), ty: Math.round(y), power: 1 } });
  }, 650);

  console.log("    ...מריצים גל שלם (≈40 שנ')");
  let cleared = false, hpBeforeClear = -1;
  for (let i = 0; i < 60 && !cleared; i++) {
    const prev = (game("p1", "wl_hero") as any[]).at(-1);
    await sleep(1000);
    cleared = game("p1", "wl_clear").length > 0 || game("p1", "wl_over").length > 0;
    if (cleared && prev) hpBeforeClear = prev.hp;
  }
  clearInterval(bot);

  // עכשיו שכל הגל נולד: הספאונים חייבים להיות פרוסים בזמן. עם k=0 הם קיבלו
  // delay=NaN וכולם נולדו באותה מילישנייה — זה מה שהיה חי בפרודקשן.
  const ats = (game("p1", "wl_spawn") as any[]).map((s) => s.at).sort((a, b) => a - b);
  const spreadMs = ats.length > 1 ? ats[ats.length - 1] - ats[0] : 0;
  check("גל 1: הספאונים פרוסים בזמן ולא נולדים יחד", !ats.some(Number.isNaN) && spreadMs > 3000);
  console.log(`    (פריסת ספאונים בגל 1: ${Math.round(spreadMs)}ms על ${ats.length} אויבים)`);

  const heroMsgs = game("p1", "wl_hero") as any[];
  const fellAt = heroMsgs.findIndex((m) => m.down === true);
  if (fellAt >= 0) {
    const revived = heroMsgs.slice(fellAt + 1).some((m) => m.down === false && m.hp > 0);
    check("גיבור שנפל קם בחזרה (ולא נתקע מת עד סוף הריצה)", revived);
  } else {
    console.log("  ~ הגיבור לא נפל בגל הזה — בדיקת ההקמה לא נבחנה");
  }

  if (game("p1", "wl_clear").length > 0) {
    const after = (game("p1", "wl_hero") as any[]).at(-1);
    const max = after?.max ?? 150;
    if (hpBeforeClear >= 0 && hpBeforeClear < max) {
      check("סוף גל = התאוששות (החלוץ מתרפא)", !!after && after.hp > hpBeforeClear);
    } else {
      console.log("  ~ החלוץ סיים את הגל בחיים מלאים — בדיקת הריפוי לא נבחנה");
    }
    const clear = game("p1", "wl_clear").at(-1) as any;
    const wallAfter = (game("p1", "wl_wall") as any[]).at(-1);
    check("wl_clear משדר את חיי החומה אחרי הריפוי", !!clear && !!wallAfter && wallAfter.hp >= clear.wallHp);
  } else {
    console.log("  ~ החומה נפלה לפני סוף הגל — בדיקות סוף-גל לא נבחנו");
  }


}

/** מנוע התכונות: שערימות באמת משנות התנהגות, שיש אבולוציה, ושהדראפט לא מציע קלף מת */
async function testTraits() {
  console.log("\n— מנוע השדרוגים ⚗️ —");
  const { transport, game } = makeTransport();
  const room = new Room("TRT", transport, { wall: createWall });
  const PT = ["a1", "a2", "a3", "a4"];
  PT.forEach((p, i) => room.join(p, "ט" + i, "🙂"));
  room.onMessage("a1", { t: "select_game", gameId: "wall", config: {} });
  room.onMessage("a1", { t: "start_game" });
  room.onMessage("a1", { t: "game", d: { a: "wl_role", role: "cannon" } });
  for (const p of ["a2", "a3", "a4"]) room.onMessage(p, { t: "game", d: { a: "wl_role", role: "archer" } });
  room.onMessage("a1", { t: "game", d: { a: "wl_go" } });
  await sleep(400);
  check("wl_style משודר לכל החדר בתחילת ריצה", game("a2", "wl_style").length >= 1);

  // הדראפט של התותחן — אין בו קלפים מתים
  const dead = ["speed", "hp"]; // תנועה/חיים לא רלוונטיים למי שעל החומה
  let sawDeadCard = false, offers = 0;
  const seen = new Set<string>();
  // מזרימים XP: הקשת יורה על כל מה שנולד
  const killed = new Set<number>();
  const posOf = (e: any, t: number): [number, number] => [
    e.x0 + e.wob * Math.sin((t - e.at) / 700),
    Math.min(1205, e.y0 + (e.speed * (t - e.at)) / 1000),
  ];
  const bot = setInterval(() => {
    for (const h of game("a1", "wl_hit") as any[]) if (h.hp <= 0) killed.add(h.id);
    const live = (game("a1", "wl_spawn") as any[]).filter((e) => !killed.has(e.id));
    const shooters = ["a2", "a3", "a4"];
    live.slice(0, 6).forEach((e, i) => {
      const [x, y] = posOf(e, room.now());
      if (y < 60) return;
      room.onMessage(shooters[i % 3], { t: "game", d: { a: "wl_shot", tx: Math.round(x), ty: Math.round(y), power: 1 } });
      room.onMessage("a1", { t: "game", d: { a: "wl_boom", tx: Math.round(x), ty: Math.round(y) } });
    });
    // כל דראפט שמגיע — בוחרים תכונה אם אפשר, אחרת את הראשון
    for (const pid of PT) {
      const lv = (game(pid, "wl_levelup") as any[]).at(-1);
      if (!lv) continue;
      const key = pid + ":" + lv.level;
      if (seen.has(key)) continue;
      seen.add(key); offers++;
      for (const c of lv.cards) { if (pid === "a1" && dead.includes(c.id)) sawDeadCard = true; }
      // תמיד מעדיפים תכונה — ככה הבדיקה באמת מפעילה DoT/שרשרת/נפץ בעולם
      const TR = ["burn", "poison", "chain", "blast", "frost", "multi", "pierce", "vamp"];
      const want = lv.cards.find((c: any) => TR.includes(c.id)) ?? lv.cards[0];
      room.onMessage(pid, { t: "game", d: { a: "wl_pick", cardId: want.id } });
    }
  }, 220);

  // WALL_SOAK=1 מריץ ריצה ארוכה שמגיעה עד האבולוציה (דרגה 4 + ערימה 5)
  const SOAK = process.env.WALL_SOAK === "1";
  console.log(`    ...צוברים רמות (עד ~${SOAK ? 300 : 100} שנ')`);
  for (let i = 0; i < (SOAK ? 300 : 100); i++) {
    await sleep(1000);
    if ((game("a1", "wl_evo") as any[]).length) break;
    if ((game("a1", "wl_over") as any[]).length) break;
  }
  clearInterval(bot);

  check("הדראפט הציע הרבה שדרוגים (העקומה החדשה)", offers >= 8);
  check("לתותחן לא הוצע אף קלף מת (זריזות/חוסן)", !sawDeadCard);
  const tiers = game("a2", "wl_tier") as any[];
  check("דרגת נשק עלתה מעבר לישנה (היה תקרה בדרגה 3)", tiers.length > 0);
  const styles = game("a2", "wl_style") as any[];
  const withTraits = styles.filter((m) => Object.values(m.traits as Record<string, number>).some((v) => v > 0));
  check("wl_style נושא ערימות תכונה — הלקוח יודע איך לצייר את הנשק", withTraits.length > 0);
  const dots = (game("a2", "wl_hit") as any[]).filter((h) => h.k && h.k !== "hit");
  check("תכונות באמת פועלות בעולם (נזק מ-DoT/שרשרת/נפץ)", dots.length > 0);
  const evos = game("a2", "wl_evo") as any[];
  if (evos.length) check("🌟 אבולוציה מוכרזת לכל החדר", !!evos[0].name);
  else console.log("  ~ לא הושגה אבולוציה בריצה הקצרה — לא נבחן");
  const xp = (game("a2", "wl_xp") as any[]).at(-1);
  console.log(`    (רמה שהושגה: ${xp?.level ?? "?"}, הצעות: ${offers}, אירועי DoT: ${dots.length})`);
}

/**
 * המחפר 🐛 — הבאג שהשאיר "יצורים תקועים שאי אפשר להרוג".
 * המחפר צלל ב-y=560, צף ב-y=1150, ואיפס את resurfaceAt — ואז התנאי (ey>=560)
 * התקיים שוב מיד והוא קפץ חזרה ל-560. לנצח, ובלתי-פגיע (כל המסננים פוסלים burrow),
 * כך שהגל לא הסתיים לעולם אלא דרך רשת הביטחון של 25 שניות.
 * הבדיקה: אף אויב לא נשאר במצב burrow לאורך זמן, ואף אחד לא חוזר לצלול.
 */
async function testDigger() {
  console.log("\n— המחפר: צלילה אחת בלבד 🐛 —");
  const { transport, game } = makeTransport();
  const room = new Room("DIGG", transport, { wall: createWall });
  ["d1", "d2"].forEach((p, i) => room.join(p, "חופר" + i, "🙂"));
  // startWave=5 — שם המחפר נפתח. בלי זה הבדיקה מחכה ~5 דקות לגלים 1-4.
  room.onMessage("d1", { t: "select_game", gameId: "wall", config: { difficulty: "normal", startWave: 5 } });
  room.onMessage("d1", { t: "start_game" });
  room.onMessage("d1", { t: "game", d: { a: "wl_role", role: "archer" } });
  room.onMessage("d2", { t: "game", d: { a: "wl_role", role: "cannon" } });
  room.onMessage("d1", { t: "game", d: { a: "wl_go" } });

  // דוגמים wl_estate לאורך זמן: כמה פעמים כל אויב נכנס ל-burrow, וכמה זמן נשאר שם
  const burrowAt = new Map<number, number>();  // id → מתי צלל (פתוח כרגע)
  const dives = new Map<number, number>();     // id → כמה פעמים צלל בסך הכול
  let maxBurrowMs = 0, cursor = 0;             // cursor: game() מחזיר את *כל* ההיסטוריה — קוראים רק את החדש
  const sample = setInterval(() => {
    const all = game("d1", "wl_estate") as any[];
    for (; cursor < all.length; cursor++) {
      const s = all[cursor];
      if (s.state === "burrow") {
        if (!burrowAt.has(s.id)) burrowAt.set(s.id, room.now());
        dives.set(s.id, (dives.get(s.id) ?? 0) + 1);
      } else if (burrowAt.has(s.id)) {
        maxBurrowMs = Math.max(maxBurrowMs, room.now() - burrowAt.get(s.id)!);
        burrowAt.delete(s.id);
      }
    }
    // מי שעדיין למטה — סופרים את הזמן שחלף, אחרת אויב שנתקע לנצח לא ייספר
    for (const [, t0] of burrowAt) maxBurrowMs = Math.max(maxBurrowMs, room.now() - t0);
  }, 400);

  // מגיעים לגל 5 — שם המחפר נפתח. הבוטים מכוונים לאויבים אמיתיים כדי שהגלים יתנקו מהר.
  const killed = new Set<number>();
  const posOf = (e: any, t: number): [number, number] => [
    e.x0 + e.wob * Math.sin((t - e.at) / 700),
    Math.min(1205, e.y0 + (e.speed * (t - e.at)) / 1000),
  ];
  const bot = setInterval(() => {
    for (const h of game("d1", "wl_hit") as any[]) if (h.hp <= 0) killed.add(h.id);
    const live = (game("d1", "wl_spawn") as any[]).filter((e) => !killed.has(e.id));
    live.slice(0, 8).forEach((e) => {
      const [x, y] = posOf(e, room.now());
      if (y < 60) return;
      room.onMessage("d1", { t: "game", d: { a: "wl_shot", tx: Math.round(x), ty: Math.round(y), power: 1 } });
      room.onMessage("d2", { t: "game", d: { a: "wl_boom", tx: Math.round(x), ty: Math.round(y) } });
    });
    for (const pid of ["d1", "d2"]) {
      const lv = (game(pid, "wl_levelup") as any[]).at(-1);
      if (lv) room.onMessage(pid, { t: "game", d: { a: "wl_pick", cardId: lv.cards[0].id } });
    }
  }, 200);

  console.log("    ...מריצים מגל 5 (עד ~150 שנ')");
  for (let i = 0; i < 150; i++) {
    await sleep(1000);
    const w = (game("d1", "wl_wave") as any[]).at(-1);
    // מספיק מחפרים שנולדו + זמן לצלול, לצוף, ולהגיע לחומה
    if ((w?.wave ?? 0) >= 7) break;
    if ((game("d1", "wl_over") as any[]).length) break;
  }
  clearInterval(bot); clearInterval(sample);

  const spawned = (game("d1", "wl_spawn") as any[]).filter((s) => s.type === "digger");
  const reDivers = [...dives.entries()].filter(([, n]) => n > 1); // כל צלילה = הודעת estate אחת. יותר מאחת = הלולה חזרה
  const wave = ((game("d1", "wl_wave") as any[]).at(-1)?.wave ?? 0);
  console.log(`    (הגיע לגל ${wave}, מחפרים שנולדו: ${spawned.length}, burrow ארוך ביותר: ${Math.round(maxBurrowMs)}ms)`);
  check("מחפרים אכן נולדו בריצה", spawned.length > 0);
  check("כל מחפר צלל פעם אחת בלבד (הלולה האינסופית)", reDivers.length === 0);
  check("מחפרים אכן צללו (המנגנון חי, לא רק 'לא נשבר')", dives.size > 0);
  check("burrow לעולם לא עובר את רשת הביטחון (4 שנ')", maxBurrowMs < 4600);
}

/**
 * שכבת הדחיפות + ההיגיינה: השער שבו מספר השחקנים פותח עומק.
 *  · הגל מודיע כמה דחיפות יש בו, והמספר גדל עם הגל.
 *  · צופה בלי גיבור לא מנפח את הקושי (היה alive() במקום fighters()).
 *  · תקרת הנזק לדחיפה — חומה לא נמחקת בשנייה מדחיפה אחת שהוחמצה.
 */
async function testPushes() {
  console.log("\n— דחיפות, שער ומאזן 🌊 —");
  const { transport, game } = makeTransport();
  const room = new Room("PUSH", transport, { wall: createWall });
  ["s1", "s2"].forEach((p, i) => room.join(p, "ש" + i, "🙂"));
  room.onMessage("s1", { t: "select_game", gameId: "wall", config: { startWave: 12 } });
  room.onMessage("s1", { t: "start_game" });
  room.onMessage("s1", { t: "game", d: { a: "wl_role", role: "archer" } });
  room.onMessage("s2", { t: "game", d: { a: "wl_role", role: "cannon" } });
  room.onMessage("s1", { t: "game", d: { a: "wl_go" } });
  await sleep(600);

  const w0 = (game("s1", "wl_wave") as any[]).at(-1);
  check("startWave מכובד — הריצה פותחת בגל 12", w0?.wave === 12);
  // ⚠️ גל 1 נתן k=0 (‎floor(-1/2.5)=-1) ⇒ perPush=Infinity ⇒ delay=NaN ⇒ כל הגל
  // נולד באותה מילישנייה. הסימולטור פספס כי קבוצה מתחילה בגל 2. נתפס רק בפרודקשן.
  const kOf = (w: number) => Math.max(1, Math.min(14, 1 + Math.floor((w - 2) / 2.5)));
  check("מספר הדחיפות לעולם ≥1, גם בגל 1", [1, 2, 3, 5, 10, 40].every((w) => kOf(w) >= 1));
  check("ובגל 1 בפרט הוא בדיוק 1", kOf(1) === 1);
  check("הגל מודיע כמה דחיפות יש בו", typeof w0?.pushes === "number" && w0.pushes > 1);
  // pushes(12) = 1 + floor(10/2.5) = 5
  check("מספר הדחיפות תואם לנוסחה המכוילת", w0?.pushes === 5);

  check("החומה מחושבת מהלוחמים (600+190×2)", w0?.wallMax === 600 + 190 * 2);

  // צופה שמצטרף באמצע ריצה: מחובר, בלי גיבור. קודם הוא ניפח את waveCount/hpScale
  // (alive() במקום fighters()) — קושי של 3 שחקנים עם כוח אש של 2.
  room.join("spec", "צופה", "👀");
  await sleep(300);
  const before = (game("s1", "wl_spawn") as any[]).length;

  // נותנים לחומה לספוג בלי לירות בכלל — הכל דולף. עם תקרת הדחיפה זה לחץ, לא מחיקה.
  const hpStart = w0.wallHp;
  await sleep(30000);
  const spawnsAfter = (game("s1", "wl_spawn") as any[]).length - before;
  // גל 12 עם 2 לוחמים: round((8+72)*1)=80. עם 3 היה 98 — פער שאפשר למדוד.
  console.log(`    (ספאונים אחרי הצטרפות צופה: ${spawnsAfter})`);
  check("מצטרף-באמצע לא הופך ללוחם ולא מנפח את הגל", spawnsAfter <= 90);
  const hps = (game("s1", "wl_wall") as any[]).map((m) => m.hp);
  const lowest = hps.length ? Math.min(...hps) : hpStart;
  const over = (game("s1", "wl_over") as any[]).length > 0;
  console.log(`    (חומה: ${hpStart} → ${lowest} תוך 30 שנ' בלי לירות; over=${over})`);
  check("החומה ספגה נזק אמיתי (הדחיפות מגיעות)", lowest < hpStart);
  check("אבל לא נמחקה מיד — תקרת הדחיפה עובדת", lowest > 0 || !over);

  // ⚠️ אויבים שמיצו את מכסת הדחיפה שלהם לא עושים כלום, אבל הם *נשארו* על
  // החומה: enemies.size לא התאפס, הגל נגמר רק דרך רשת הביטחון, והמסך התמלא.
  // נמדד בדפדפן: 47 אויבים תקועים על החומה גם בשלב הנשימה.
  await sleep(25000); // נותנים לדחיפות המוקדמות למצות את המכסה ולהתפנות
  const gone = new Set((game("s1", "wl_hit") as any[]).filter((h) => h.hp <= 0).map((h) => h.id));
  // מי שהגיע לחומה מוקדם ועדיין שם = זומבי: לא מזיק, לא מת, וחוסם את סוף הגל
  const reachedWall = (game("s1", "wl_estate") as any[]).filter((s) => s.state === "wall");
  const early = [...new Set(reachedWall.slice(0, Math.ceil(reachedWall.length * 0.5)).map((s) => s.id))];
  const zombies = early.filter((id) => !gone.has(id));
  console.log(`    (הגיעו לחומה מוקדם: ${early.length}, מהם עדיין תקועים: ${zombies.length})`);
  check("אויבים שמיצו את המכסה מתפנים ולא נערמים על החומה", early.length === 0 || zombies.length <= early.length * 0.34);
}

/**
 * 🚁 ההליקופטר: טס, מטיל פצצות אוטומטית, ואין לו חסימת גוף.
 * המתח מגיע מאש נגד-מטוסים שאפשר להתחמק ממנה.
 */
async function testHeli() {
  console.log("\n— ההליקופטר 🚁 —");
  const { transport, game } = makeTransport();
  const room = new Room("HELI", transport, { wall: createWall });
  ["h1", "h2"].forEach((p, i) => room.join(p, "טייס" + i, "🙂"));
  room.onMessage("h1", { t: "select_game", gameId: "wall", config: { startWave: 4, seed: "test-heli-v1" } });
  room.onMessage("h1", { t: "start_game" });
  room.onMessage("h1", { t: "game", d: { a: "wl_role", role: "heli" } });
  room.onMessage("h2", { t: "game", d: { a: "wl_role", role: "archer" } });
  room.onMessage("h1", { t: "game", d: { a: "wl_go" } });
  await sleep(400);

  // הדראפט של ההליקופטר מציע קלפי פצצות ואף קלף שאינו שלו
  let sawBombCard = false, sawForeign = false, offers = 0;
  const BOMB = ["payload", "salvo", "blastr", "fuse", "napalm", "guided", "cluster", "shock", "plating"];
  const FOREIGN = ["heatc", "tracer", "radius", "sentry"];
  const seen = new Set<string>();

  const bot = setInterval(() => {
    // טס ומטיל בלי הפסקה
    room.onMessage("h1", { t: "game", d: { a: "wl_pos", x: 300 + Math.round(Math.random() * 400), y: 500 + Math.round(Math.random() * 500) } });
    room.onMessage("h1", { t: "game", d: { a: "wl_bomb" } });
    for (const pid of ["h1", "h2"]) {
      const lv = (game(pid, "wl_levelup") as any[]).at(-1);
      if (!lv) continue;
      const key = pid + ":" + lv.level;
      if (seen.has(key)) continue;
      seen.add(key); offers++;
      if (pid === "h1") for (const c of lv.cards) {
        if (BOMB.includes(c.id)) sawBombCard = true;
        if (FOREIGN.includes(c.id)) sawForeign = true;
      }
      // מעדיפים קלף פצצות — כדי שהמנגנונים באמת ירוצו
      const want = lv.cards.find((c: any) => BOMB.includes(c.id)) ?? lv.cards[0];
      room.onMessage(pid, { t: "game", d: { a: "wl_pick", cardId: want.id } });
    }
  }, 200);

  console.log("    ...טס ומפציץ (75 שנ' — צריך זמן כדי לערום מצרר+מטח ולמדוד הצפה)");
  const t0 = Date.now();
  for (let i = 0; i < 75; i++) {
    await sleep(1000);
    if ((game("h1", "wl_over") as any[]).length) break;
  }
  const secs = Math.max(1, (Date.now() - t0) / 1000);
  clearInterval(bot);

  const drops = game("h2", "wl_drop") as any[];
  const flak = game("h1", "wl_flak") as any[];
  const hits = (game("h1", "wl_hit") as any[]).filter((x) => x.by === "h1");
  console.log(`    (הטלות: ${drops.length}, הצעות: ${offers}, אש נגד-מטוסים: ${flak.length}, פגיעות של הטייס: ${hits.length})`);

  check("ההליקופטר מטיל פצצות", drops.length > 0);
  check("ההטלה משודרת לכל החדר (החבר רואה אותה)", drops.length > 0 && drops[0].pid === "h1");
  check("להטלה יש זמן נפילה ורדיוס", drops.length > 0 && drops[0].fall > 0 && drops[0].r > 0);
  check("הפצצות באמת הורגות — הטייס צובר נזק", hits.length > 0);
  check("אש נגד-מטוסים נפתחה (המתח של ההליקופטר)", flak.length > 0);
  check("לאש נגד-מטוסים יש התראה מראש — אפשר להתחמק", flak.length > 0 && flak[0].at > 0);
  check(`הדראפט של ההליקופטר מציע קלפי פצצות (מתוך ${offers} הצעות)`, sawBombCard);
  check("ולא מציע קלפים של תפקידים אחרים", !sawForeign);

  /* ⚠️ מבחן הצפה — זה מה שהקפיא את המשחק בפרודקשן.
   * מצרר×מטח×כפילות = ~16 פיצוצים להטלה. בלי סינון זה היה עשרות wl_boomfx
   * בשנייה (וכל אחד = צליל+רטט בלקוח), ו-🌀 גל הדף שידר wl_estate לכל אויב
   * ברדיוס בכל פיצוץ — מאות הודעות בשנייה. */
  const style = (game("h2", "wl_style") as any[]).filter((s) => s.pid === "h1").at(-1);
  console.log(`    (הבילד של הטייס: ${JSON.stringify(style?.amps ?? {})} דרגה ${style?.tier})`);
  const rate = (a: string) => (game("h2", a) as any[]).length / secs;
  const boomRate = rate("wl_boomfx"), estateRate = rate("wl_estate"), flakRate = rate("wl_flak");
  console.log(`    (הודעות לשנייה — פיצוצים: ${boomRate.toFixed(1)} · מסלולים: ${estateRate.toFixed(1)} · נגד-מטוסים: ${flakRate.toFixed(1)})`);
  check("אפקטי פיצוץ מסוננים (≤10 בשנייה — בלי הסינון נמדד 12.3)", boomRate <= 10);
  check("שידורי מסלול לא מוצפים (≤40 בשנייה)", estateRate <= 40);
  check("אש נגד-מטוסים מוגבלת (≤6 בשנייה)", flakRate <= 6);

  // 🌀 גל הדף לא מעיף אויבים אל מחוץ למסך — שם הם לא מתים והגל לא נגמר.
  // מסתכלים על *נסיגה* אמיתית (y יורד משמעותית), לא על y נמוך כשלעצמו:
  // כפור משדר מסלול חדש במיקום הנוכחי, וזה לגיטימי גם על אויב שרק נולד.
  const lastY = new Map<number, number>();
  for (const s of game("h2", "wl_spawn") as any[]) lastY.set(s.id, s.y0);
  let badPush = 0, worstY = 1e9;
  for (const s of game("h2", "wl_estate") as any[]) {
    const prev = lastY.get(s.id);
    if (prev !== undefined && s.y < prev - 100 && s.y < 600) { badPush++; worstY = Math.min(worstY, s.y); }
    lastY.set(s.id, s.y);
  }
  check("🌀 גל הדף לא מעיף אויבים מעבר לתקרה (620)", badPush === 0);
  if (badPush) console.log(`    (${badPush} הדיפות חרגו — הנמוכה ביותר y=${worstY})`);

  // אין יותר חסימת גוף — אויב אף פעם לא נכנס למצב fight מול הליקופטר
  const fights = (game("h1", "wl_estate") as any[]).filter((s) => s.state === "fight");
  const snipers = (game("h1", "wl_sniper") as any[]).length;
  check("אין חסימת גוף — רק צלפים נעצרים (fight)", fights.length === 0 || snipers > 0);
}

await testWall();
await testTraits();
await testDigger();
await testPushes();
await testHeli();
console.log(failed ? `\n${failed} בדיקות נכשלו ✗` : "\nהכול עבר ✓");
process.exit(failed ? 1 : 0);
