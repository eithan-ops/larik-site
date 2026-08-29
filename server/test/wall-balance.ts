/**
 * סימולטור המאזן של "החומה" — מריץ את *נוסחאות השרת האמיתיות* מול שחקן ממודל,
 * ומדפיס באיזה גל כל גודל קבוצה מת.
 *
 *   npx tsx test/wall-balance.ts
 *
 * למה זה קיים: את המקדמים אי אפשר לנחש. שתי לולאות משוב מבטלות כל שינוי תמים —
 *   (א) XP שמוכפל בחיי האויב מחזיר לשחקן ~79% מכל חיזוק שנתת לאויב;
 *   (ב) מגברים כפליים בלי תקרה הופכים את ה-DPS לחוק-חזקה מול חיים פולינומיים.
 * הסימולטור מודד את Φ(w) — כמה הכפלות כוח הגל דורש פחות כמה השחקן מייצר.
 * Φ שיורד עם הגל = המשחק נעשה *קל* יותר. זה מה שהיה כאן קודם.
 */

/* ---- הנוסחאות, בדיוק כמו ב-src/games/wall.ts ---- */
const DIFF = 1;
const hpScale = (w: number) => Math.pow(1 + 0.22 * (w - 1), 1.7) * DIFF;
const waveCount = (w: number, n: number) => Math.round((8 + 6 * w) * Math.sqrt(n / 2) * DIFF);
const waveDuration = (w: number) => Math.min(45_000, 28_000 + w * 2500);
const tierOf = (level: number) => 1 + Math.floor(level / 3);
const tierMult = (tier: number) => 1 + 0.45 * (tier - 1);
const xpNeed = (lvl: number) => Math.round(10 * Math.pow(1.16, lvl - 1));
const xpPerKill = (baseXp: number, w: number, n: number) =>
  baseXp * (1 + 0.12 * (w - 1)) * Math.sqrt(n / 2);
const wallMaxOf = (n: number) => 600 + 190 * n;
const WAVE_HEAL = 0.10;
/* ---- כפתורי הכיול. TUNE=1 מריץ סריקה על השניים הראשונים ---- */
const K_DIV = Number(process.env.K_DIV ?? 2.5);          // כל כמה גלים נוספת דחיפה
const PUSH_CAP = Number(process.env.PUSH_CAP ?? 0.20); // חלק מהחומה שדחיפה שהוחמצה מורידה
const PER_PLAYER_CAP = 1.15;                           // כמה דחיפות שחקן יחיד יכול להחזיק
const pushesOf = (w: number) => Math.min(14, 1 + Math.floor((w - 2) / K_DIV));
const waveDurationNew = (w: number) => 6000 + Number(process.env.DUR ?? 4200) * pushesOf(w);
const firstWaveOf = (n: number) => 1 + Math.floor(2.4 * Math.log(Math.max(1, n)));

/** השקית הקפואה מגל 6 — ממוצעי חיים / נזק-לחומה / XP */
const BAG = [
  { hp: 18, wallDps: 4, xp: 2 },   // swarm
  { hp: 18, wallDps: 4, xp: 2 },
  { hp: 18, wallDps: 4, xp: 2 },
  { hp: 30, wallDps: 6, xp: 3 },   // runner
  { hp: 30, wallDps: 6, xp: 3 },
  { hp: 45, wallDps: 0, xp: 5 },   // bomber (55 חד-פעמי, מטופל בנפרד)
  { hp: 170, wallDps: 14, xp: 8 }, // armored
  { hp: 170, wallDps: 14, xp: 8 },
  { hp: 55, wallDps: 0, xp: 10 },  // sniper
  { hp: 60, wallDps: 8, xp: 6 },   // digger
];
const avg = (f: (b: typeof BAG[0]) => number) => BAG.reduce((a, b) => a + f(b), 0) / BAG.length;
const AVG_HP = avg((b) => b.hp), AVG_WDPS = avg((b) => b.wallDps), AVG_XP = avg((b) => b.xp);

/** מודל שחקן: DPS בסיס לפי תפקיד, כפול דרגה, כפול מגברים עם תשואה פוחתת. */
const ROLE_DPS = { heli: 65, archer: 40, cannon: 26, mg: 46 };   // ההליקופטר הוא AoE — 52 לפצצה כל 620ms, ומכה כמה אויבים
type Role = keyof typeof ROLE_DPS;

/** בחירה חמדנית: כל בחירה הולכת ל"נזק", עם תשואה פוחתת 0.88 כמו בשרת */
function dmgMulAfter(picks: number, power = 1) {
  let m = 1;
  for (let k = 1; k <= picks; k++) m *= 1 + 0.18 * Math.pow(0.88, k - 1) * power;
  return m;
}

interface Sim { deathWave: number; levelAt: Record<number, number>; phi: Record<number, number> }

function simulate(n: number, roles: Role[], power = 1): Sim {
  let wallHp = wallMaxOf(n), wallMax = wallHp;
  let level = 1, xp = 0, picks = 0;
  const levelAt: Record<number, number> = {}, phi: Record<number, number> = {};

  for (let w = firstWaveOf(n); w <= 60; w++) {
    const k = pushesOf(w);
    const count = waveCount(w, n);
    const dur = waveDurationNew(w) / 1000;
    const eHp = AVG_HP * hpScale(w);
    const demandHp = count * eHp + (w % 5 === 0 ? 950 * hpScale(w) : 0);

    // כוח הצוות: סכום ה-DPS של כל התפקידים, כפול דרגה, כפול מגברים
    const teamDps = roles.reduce((a, r) => a + ROLE_DPS[r], 0) *
      tierMult(tierOf(level)) * dmgMulAfter(picks, power);
    const supplyHp = teamDps * dur;

    levelAt[w] = level;
    phi[w] = Math.log2(demandHp / Math.max(1, supplyHp));

    /* ---- השער: כמה דחיפות הצוות מסוגל לענות ----
     * שחקן מחזיק בערך דחיפה אחת; כוח עודף מעל הביקוש מוסיף כיסוי חלקי.
     * מה שנשאר בלי מענה מוריד עד PUSH_CAP מחיי החומה — חסום לכל דחיפה,
     * ולכן ההחמצה היא לחץ מתגבר ולא צוק. */
    const perPushHp = demandHp / k;
    // ⚠️ תקרת הזיכוי: שחקן לא יכול לקבל קרדיט על יותר מ-~דחיפה אחת, גם אם ה-DPS
    // שלו עצום. בלי זה צוות של 3 עם בילד חזק מכסה 6 נתיבים והשער דולף לגמרי.
    const capacity = roles.length * Math.min(PER_PLAYER_CAP, supplyHp / Math.max(1, perPushHp * roles.length));
    const answered = Math.min(k, capacity);
    const unanswered = Math.max(0, k - answered);
    // דחיפה שנענתה חלקית עולה חלק יחסי; מלאה עולה את כל המכסה
    wallHp -= unanswered * PUSH_CAP * wallMax;
    if (wallHp <= 0) return { deathWave: w, levelAt, phi };
    wallHp = Math.min(wallMax, wallHp + wallMax * WAVE_HEAL);

    // XP מההריגות בפועל
    const killFrac = Math.min(1, answered / k);
    xp += (count * killFrac * xpPerKill(AVG_XP, w, n)) / roles.length; // לשחקן
    while (xp >= xpNeed(level)) { xp -= xpNeed(level); level++; picks++; }
  }
  return { deathWave: 99, levelAt, phi };
}

/* ---- דוח ---- */
const TARGET: Record<number, number> = { 1: 8, 2: 12, 3: 15, 4: 18, 6: 25, 8: 30, 10: 35 };
const rolesFor = (n: number): Role[] => {
  const order: Role[] = ["archer", "mg", "cannon", "heli"];
  return Array.from({ length: Math.max(1, n) }, (_, i) => order[i % 4]);
};

console.log("\n=== עקומת הקושי: Φ(w) — כמה הכפלות כוח הגל דורש פחות מה שהשחקן מייצר ===");
console.log("    Φ שעולה = המשחק מתקשה. Φ שיורד = המשחק מתקל (זה מה שהיה קודם).");
const ref = simulate(4, rolesFor(4));
const marks = [5, 10, 15, 20, 25, 30, 35].filter((w) => ref.phi[w] !== undefined);
console.log("    גל   " + marks.map((w) => String(w).padStart(7)).join(""));
console.log("    Φ    " + marks.map((w) => ref.phi[w].toFixed(2).padStart(7)).join(""));
console.log("    רמה  " + marks.map((w) => String(ref.levelAt[w]).padStart(7)).join(""));
const slope = marks.length > 2
  ? (ref.phi[marks[marks.length - 1]] - ref.phi[marks[Math.floor(marks.length / 2)]]) /
    (marks[marks.length - 1] - marks[Math.floor(marks.length / 2)])
  : 0;
console.log(`    שיפוע מאוחר: ${slope >= 0 ? "+" : ""}${slope.toFixed(3)} הכפלות/גל  ${slope > 0 ? "✓ מתקשה" : "✗ מתקל"}`);

console.log("\n=== סולם העומק לפי גודל קבוצה ===");
console.log("    n    יעד   צפוי   סטייה   רמה-במוות");
let worst = 0;
for (const n of [1, 2, 3, 4, 6, 8, 10]) {
  const s = simulate(Math.max(2, n), rolesFor(n)); // clamp מינימום 2, כמו בשרת
  const d = s.deathWave - TARGET[n];
  worst = Math.max(worst, Math.abs(d));
  const flag = Math.abs(d) <= 2 ? "✓" : "✗";
  console.log(`    ${String(n).padStart(2)}  ${String(TARGET[n]).padStart(5)}  ${String(s.deathWave).padStart(5)}  ${(d >= 0 ? "+" : "") + d}`.padEnd(38) +
    `${s.levelAt[s.deathWave] ?? "?"}  ${flag}`);
}

console.log("\n=== רגישות למזל-בילד (±50% כוח שחקן) ===");
console.log("    n     חלש    ממוצע    חזק");
for (const n of [1, 2, 3, 4, 6, 8, 10]) {
  const lo = simulate(Math.max(2, n), rolesFor(n), 0.5).deathWave;
  const mid = simulate(Math.max(2, n), rolesFor(n), 1).deathWave;
  const hi = simulate(Math.max(2, n), rolesFor(n), 1.5).deathWave;
  console.log(`    ${String(n).padStart(2)}  ${String(lo).padStart(6)}  ${String(mid).padStart(7)}  ${String(hi).padStart(6)}`);
}

console.log(`\nסטייה מרבית מהיעד: ${worst} גלים ${worst <= 2 ? "✓" : "— צריך כיול (או את שכבת הדחיפות)"}\n`);
