/**
 * התותחים 💥 — הליבה הדטרמיניסטית המשותפת לשרת וללקוח.
 *
 * "כולם יורים באותה שנייה": כל שחקן מכוון במקביל; השרת אוסף את כל הקלטים, מריץ את הסלבו
 * (הסימולציה כאן) ומשדר את *הקלטים* כ-cue. כל טלפון מריץ את אותה סימולציה בזמן אמת
 * ומצייר, ובסוף מקבל מהשרת את המצב הסמכותי (HP, מיקומים, מפת הגבהים) ומתיישר.
 *
 * העולם: רוחב 720, ציר y למעלה. ההר = מפת גבהים של 360 עמודות (2px כל אחת) — מכתש מוריד אדמה,
 * כדור אדמה מוסיף, טנקים נופלים עם ההר. 60 טיקים בשנייה.
 *
 * ⚠️ מתקמפל גם תחת ה-TS הקפדני של הלקוח: בלי enum, בלי namespaces, import type בלבד.
 */

/* ---------- קבועים ---------- */
export const TK = {
  W: 720, COLS: 360, COL: 2,
  TICK_MS: 1000 / 60,
  GRAV: 0.26,                 // px/טיק² — עוצמה מלאה חוצה את כל ההר
  WIND_K: 0.0035,             // תאוצה אופקית לכל יחידת רוח
  WIND_MAX: 10,
  VMAX: 22,                   // מהירות המראה מקסימלית (px/טיק) בעוצמה 1
  TANK_R: 15,                 // רדיוס פגיעה של הטנק
  TANK_H: 12,                 // גובה מרכז הטנק מעל הקרקע
  HP: 100,
  MAX_TICKS: 600,             // 10 שניות לסלבו לכל היותר
  FIRE_STAGGER: 5,            // טיקים בין ירייה לירייה (גל של המראות — עדיין "אותה שנייה")
  SHELL_R: 4,
  DMG_SELF: 0.5,              // נזק עצמי — חצי (כמו במקור: כן, אפשר לפוצץ את עצמך)
  FALL_FREE: 40, FALL_DIV: 3, // נזק נפילה: (נפילה−40)/3
  WATER_DMG: 12,
  FIRE_DMG: 10,
  MOVE_STEP: 30,
  METEOR_DMG: 55, METEOR_R: 55,
  MAX_SALVOS: 8, SUDDEN_FROM: 6,
  GOLD_START: 120, GOLD_KILL: 80, GOLD_SURVIVE: 15, GOLD_BATTLE: 150, GOLD_BOUNTY: 40,
  /** 8 הדמויות = טנק אחד ב-8 צבעים (client/src/games/tanksSprites.ts). האימוג'י — לטקסט בלבד. */
  CHARS: ["🟣", "🟠", "🔵", "🔴", "🟡", "🌸", "🟢", "💎"],
  CHAR_NAMES: ["הסגול", "הכתום", "הכחול", "האדום", "הצהוב", "הוורוד", "הירוק", "הטורקיז"],
  CHAR_COLORS: ["#9B4DFF", "#FF8A2B", "#2F7BFF", "#FF3B3B", "#FFD21F", "#FF5FB0", "#5FD44A", "#2EDCE6"],
  THEMES: ["day", "sunset", "night", "space"],
} as const;

/* ---------- RNG (FNV-1a → mulberry32) ---------- */
export function tkRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- ההר ---------- */
export type TkTheme = "day" | "sunset" | "night" | "space";
export interface TkWorld {
  h: number[];            // גובה הקרקע לכל עמודה (px, y למעלה)
  water: number;          // מפלס המים (0 = אין)
  gravK: number;          // מכפיל כבידה (קלפי עולם)
  windK: number;          // מכפיל רוח
  walls: boolean;         // הפגזים חוזרים מהקצוות
  night: boolean;         // בלי תחזית לאף אחד
  fires: { x: number; r: number; until: number }[];  // כתמי נפאלם (until = מספר הסלבו האחרון)
  theme: TkTheme;
}

/** יצירת הר דטרמיניסטי מזרע — 4 סגנונות */
export function tkGenTerrain(seed: string): number[] {
  const r = tkRng("terrain:" + seed);
  const style = Math.floor(r() * 4);          // 0 גבעות · 1 הרים · 2 מישור עם שיא · 3 עמק
  const h: number[] = new Array(TK.COLS).fill(0);
  const base = 150 + r() * 80;
  const waves: { a: number; f: number; p: number }[] = [];
  const nW = style === 1 ? 6 : 4;
  for (let i = 0; i < nW; i++) waves.push({ a: (style === 1 ? 70 : style === 2 ? 25 : 45) / (i * 0.6 + 1), f: (i + 1) * (0.6 + r() * 0.8), p: r() * Math.PI * 2 });
  for (let c = 0; c < TK.COLS; c++) {
    const u = c / TK.COLS;
    let y = base;
    for (const w of waves) y += w.a * Math.sin(u * Math.PI * 2 * w.f + w.p);
    if (style === 2) y += 220 * Math.exp(-Math.pow((u - 0.5) / 0.09, 2));          // שיא באמצע
    if (style === 3) y += 160 * Math.pow(Math.abs(u - 0.5) * 2, 1.6);             // עמק — גבוה בקצוות
    if (style === 1) y += 60 * Math.sin(u * Math.PI * 6 + waves[0].p) * Math.sin(u * Math.PI * 2.3);
    h[c] = y;
  }
  // החלקה קלה + תיחום
  for (let pass = 0; pass < 2; pass++) for (let c = 1; c < TK.COLS - 1; c++) h[c] = (h[c - 1] + h[c] * 2 + h[c + 1]) / 4;
  for (let c = 0; c < TK.COLS; c++) h[c] = Math.round(Math.max(60, Math.min(560, h[c])));
  return h;
}
export const tkNewWorld = (seed: string, theme: TkTheme = "day"): TkWorld => ({ h: tkGenTerrain(seed), water: 0, gravK: theme === "space" ? 0.55 : 1, windK: 1, walls: false, night: false, fires: [], theme });

/** גובה הקרקע ב-x (אינטרפולציה בין עמודות) */
export function tkGround(h: number[], x: number): number {
  const c = x / TK.COL;
  const i = Math.floor(c);
  if (i < 0) return h[0];
  if (i >= TK.COLS - 1) return h[TK.COLS - 1];
  const f = c - i;
  return h[i] * (1 - f) + h[i + 1] * f;
}
/** מכתש: מסיר את החומר של העיגול מכל עמודה (העמודה "קורסת") */
export function tkCrater(h: number[], cx: number, cy: number, r: number) {
  const c0 = Math.max(0, Math.floor((cx - r) / TK.COL)), c1 = Math.min(TK.COLS - 1, Math.ceil((cx + r) / TK.COL));
  for (let c = c0; c <= c1; c++) {
    const dx = c * TK.COL - cx;
    const dy = Math.sqrt(Math.max(0, r * r - dx * dx));
    if (dy <= 0) continue;
    const top = Math.min(h[c], cy + dy), bot = Math.max(0, cy - dy);
    if (top > bot) h[c] = Math.max(0, Math.round(h[c] - (top - bot)));
  }
}
/** תל: מוסיף אדמה בצורת חצי-עיגול */
export function tkMound(h: number[], cx: number, cy: number, r: number) {
  const c0 = Math.max(0, Math.floor((cx - r) / TK.COL)), c1 = Math.min(TK.COLS - 1, Math.ceil((cx + r) / TK.COL));
  for (let c = c0; c <= c1; c++) {
    const dx = c * TK.COL - cx;
    const dy = Math.sqrt(Math.max(0, r * r - dx * dx));
    h[c] = Math.min(640, Math.max(h[c], Math.round(cy + dy)));
  }
}
/** רעידת אדמה: ההר יורד באקראי (מוחלק) — טנקים נופלים */
export function tkQuake(h: number[], rng: () => number, cx = -1, span = 0) {
  const d: number[] = new Array(TK.COLS);
  for (let c = 0; c < TK.COLS; c++) d[c] = rng() * 50;
  for (let p = 0; p < 6; p++) for (let c = 1; c < TK.COLS - 1; c++) d[c] = (d[c - 1] + d[c] + d[c + 1]) / 3;
  for (let c = 0; c < TK.COLS; c++) {
    const x = c * TK.COL;
    const w = cx < 0 ? 1 : Math.max(0, 1 - Math.abs(x - cx) / span);
    h[c] = Math.max(30, Math.round(h[c] - d[c] * w));
  }
}
/** מיקומי הטנקים: פרוסים לרוחב, מסודרים אקראית מהזרע, הקרקע משוטחת מתחתיהם */
export function tkPlaceTanks(seed: string, h: number[], n: number): number[] {
  const r = tkRng("place:" + seed);
  const slots = Math.max(n, 2);
  const xs: number[] = [];
  for (let i = 0; i < slots; i++) xs.push(Math.round(50 + (TK.W - 100) * (i + 0.5) / slots + (r() - 0.5) * 30));
  for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
  const out = xs.slice(0, n);
  for (const x of out) {
    const c = Math.round(x / TK.COL);
    const g = h[Math.max(0, Math.min(TK.COLS - 1, c))];
    for (let k = -6; k <= 6; k++) { const cc = c + k; if (cc >= 0 && cc < TK.COLS) h[cc] = Math.round(g + (h[cc] - g) * Math.min(1, Math.abs(k) / 6) * 0.3); }
  }
  return out;
}

/* ---------- נשקים ---------- */
export interface TkWeapon {
  dmg: number; r: number;      // נזק בפגיעה ישירה · רדיוס המכתש
  n: number; spread: number;   // כמה פגזים במניפה · זווית ביניהם (רדיאנים)
  mirv: number;                // התפצלות בשיא
  burst: number;               // התפצלות בפגיעה (מצרר)
  bounce: number;              // קפיצות
  roll: boolean;               // מתגלגל על ההר
  dig: number;                 // px של חפירה לפני הפיצוץ
  fire: number;                // סלבואים של נפאלם
  homing: number;              // עוצמת ההתבייתות
  windK: number; gravK: number; spd: number;
  shock: number;               // הדף (px)
  freeze: boolean; emp: boolean;
  dirt: boolean;               // בונה במקום להרוס
  hole: number;                // חור שחור: משיכה (px)
  tele: boolean;               // היורה עובר לנקודת הפגיעה
  chain: number;               // פיצוצים נוספים
  ghost: boolean;              // עובר דרך ההר פעם אחת
  laser: boolean;
  heal: number;                // מרפא במקום להזיק
  quake: boolean;              // רעידה מקומית
  confetti: boolean;
  lift: boolean;               // תל מתחת לנפגע
  meteor: boolean;             // קורא למטאור לנקודה
}
export const tkBaseWeapon = (): TkWeapon => ({
  dmg: 35, r: 34, n: 1, spread: 0, mirv: 0, burst: 0, bounce: 0, roll: false, dig: 0, fire: 0, homing: 0,
  windK: 1, gravK: 1, spd: 1, shock: 0, freeze: false, emp: false, dirt: false, hole: 0, tele: false, chain: 0,
  ghost: false, laser: false, heal: 0, quake: false, confetti: false, lift: false, meteor: false,
});

/* ---------- מודים (מה הקלפים הפסיביים משנים) ---------- */
export interface TkMods {
  hpMax: number; armor: number; shield: number; reflect: boolean; repair: number;
  chute: boolean; dodge: number; heavy: boolean; fireproof: boolean; faraday: boolean; lastStand: boolean; hover: boolean;
  fuel: number; moveStep: number; preview: number; windPreview: boolean; power: number; dbl: boolean; windK: number; stabilizer: boolean; sight: boolean;
  gold: number; luck: number; discount: number; interest: number; killBonus: number; surviveMul: number; offerN: number;
  revenge: boolean; hunter: boolean; betray: boolean;
}
export const tkBaseMods = (): TkMods => ({
  hpMax: TK.HP, armor: 0, shield: 0, reflect: false, repair: 0,
  chute: false, dodge: 0, heavy: false, fireproof: false, faraday: false, lastStand: false, hover: false,
  fuel: 0, moveStep: TK.MOVE_STEP, preview: 40, windPreview: false, power: 1, dbl: false, windK: 1, stabilizer: false, sight: false,
  gold: 1, luck: 0, discount: 0, interest: 0, killBonus: 0, surviveMul: 1, offerN: 6,
  revenge: false, hunter: false, betray: false,
});

/* ---------- הקלפים ---------- */
export type TkCat = "W" | "D" | "T" | "S" | "X" | "E" | "K";   // תחמושת · הגנה · טנק · חברתי · עולם · כלכלה · שמיים
export type TkRarity = "c" | "u" | "r" | "e";               // רגיל · נדיר · אגדי · אבולוציה
export type TkKind = "ammo" | "passive" | "instant" | "sky";
export type TkTargetKind = "none" | "player" | "x";
export interface TkCard {
  id: string; ic: string; t: string; d: string;
  cat: TkCat; r: TkRarity; price: number; kind: TkKind;
  n?: number;                 // תחמושת: שימושים · פסיבי: מקסימום ערימה
  w?: Partial<TkWeapon>;      // הגדרת הנשק (תחמושת)
  m?: (m: TkMods) => void;    // פסיבי: מה משתנה
  fx?: string;                // מיידי/שמיים: מזהה האפקט
  tg?: TkTargetKind;          // מיידי: צריך מטרה?
  req?: string[];             // אבולוציה: דורש בעלות על
}
const W = (id: string, ic: string, t: string, d: string, r: TkRarity, price: number, n: number, w: Partial<TkWeapon>, req?: string[]): TkCard => ({ id, ic, t, d, cat: "W", r, price, kind: "ammo", n, w, req });
const P = (id: string, ic: string, t: string, d: string, cat: TkCat, r: TkRarity, price: number, n: number, m: (m: TkMods) => void, req?: string[]): TkCard => ({ id, ic, t, d, cat, r, price, kind: "passive", n, m, req });
const I = (id: string, ic: string, t: string, d: string, cat: TkCat, r: TkRarity, price: number, fx: string, tg: TkTargetKind = "none", req?: string[]): TkCard => ({ id, ic, t, d, cat, r, price, kind: "instant", fx, tg, req });
const K = (id: string, ic: string, t: string, d: string, fx: string, tg: TkTargetKind = "none"): TkCard => ({ id, ic, t, d, cat: "K", r: "c", price: 0, kind: "sky", fx, tg });

export const TK_CARDS: TkCard[] = [
  /* 🚀 תחמושת */
  W("heavy", "💣", "פגז כבד", "נזק 50, מכתש גדול", "c", 60, 3, { dmg: 50, r: 40 }),
  W("triple", "🔱", "שלשה", "3 פגזים במניפה", "c", 70, 3, { n: 3, spread: 0.12, dmg: 28 }),
  W("quint", "🖐️", "חמישייה", "5 פגזים במניפה", "u", 130, 3, { n: 5, spread: 0.1, dmg: 24 }, ["triple"]),
  W("mirv", "🎆", "MIRV", "מתפצל ל-5 בשיא", "u", 120, 2, { mirv: 5, dmg: 26, r: 28 }),
  W("mirv2", "🎇", "MIRV ענק", "מתפצל ל-9 בשיא", "r", 220, 2, { mirv: 9, dmg: 24, r: 28 }, ["mirv"]),
  W("napalm", "🔥", "נפאלם", "אש שנשארת על ההר 2 סיבובים", "u", 90, 3, { fire: 2, dmg: 25, r: 30 }),
  W("firestorm", "🌪️", "סופת אש", "MIRV של נפאלם", "r", 200, 2, { fire: 3, mirv: 4, dmg: 20, r: 26 }, ["napalm"]),
  W("digger", "⛏️", "מקדחה", "חופרת דרך ההר ומתפוצצת בפנים", "c", 80, 3, { dig: 160, dmg: 40, r: 38 }),
  W("sandhog", "🐹", "חפרפרת", "חופרת עמוק, פיצוץ ענק", "u", 170, 2, { dig: 320, dmg: 55, r: 46 }, ["digger"]),
  W("bouncer", "🏀", "קפצן", "3 קפיצות לפני הפיצוץ", "c", 60, 3, { bounce: 3 }),
  W("superball", "🪩", "סופר-קפצן", "7 קפיצות", "u", 120, 3, { bounce: 7, dmg: 30 }, ["bouncer"]),
  W("roller", "🎳", "מתגלגל", "מתגלגל על ההר עד שפוגע", "c", 80, 3, { roll: true, dmg: 40 }),
  W("homing", "🛰️", "מתביית", "מתעקל לטנק הקרוב", "u", 130, 2, { homing: 0.28 }),
  W("laser", "🔦", "לייזר", "קו ישר, בלי רוח וכבידה", "u", 110, 3, { laser: true, spd: 6, gravK: 0, windK: 0, dmg: 30, r: 18 }),
  W("dirtball", "🟤", "כדור אדמה", "בונה גבעה במקום להרוס", "c", 50, 3, { dirt: true, r: 50, dmg: 0 }),
  W("dirtwall", "🧱", "חומת אדמה", "בונה הר קטן", "c", 90, 2, { dirt: true, r: 90, dmg: 0 }, ["dirtball"]),
  W("shock", "💨", "הדף", "זורק טנקים 90px", "c", 70, 3, { shock: 90, dmg: 15, r: 40 }),
  W("shockwave", "🌊", "גל הדף", "זורק את כל הסביבה", "u", 140, 2, { shock: 160, r: 80, dmg: 10 }, ["shock"]),
  W("freeze", "🧊", "הקפאה", "המטרה מדלגת על הירייה הבאה", "u", 90, 2, { freeze: true, dmg: 15 }),
  W("emp", "⚡", "EMP", "מוחק מגנים ברדיוס", "c", 80, 2, { emp: true, dmg: 10, r: 60 }),
  W("icebomb", "❄️", "פצצת קרח", "הקפאה + EMP", "e", 220, 2, { freeze: true, emp: true, dmg: 20, r: 50 }, ["freeze", "emp"]),
  W("blackhole", "🕳️", "חור שחור", "מושך טנקים לנקודה", "r", 150, 2, { hole: 80, dmg: 20, r: 40 }),
  W("gravity", "🧲", "מגנט-על", "מושך מרחוק, פיצוץ", "e", 240, 2, { hole: 140, dmg: 30, r: 50 }, ["blackhole"]),
  W("chain", "⛓️", "שרשרת", "מתפוצץ שוב ב-3 מקומות", "u", 110, 2, { chain: 3, dmg: 25 }),
  W("chain2", "🔗", "שרשרת ארוכה", "6 פיצוצים נוספים", "r", 200, 2, { chain: 6, dmg: 25 }, ["chain"]),
  W("babynuke", "☢️", "אטום קטן", "נזק 60, מכתש 60", "u", 150, 2, { dmg: 60, r: 60 }),
  W("nuke", "🍄", "פצצת אטום", "נזק 90, מכתש ענק", "r", 260, 1, { dmg: 90, r: 90 }),
  W("apoc", "💀", "אפוקליפסה", "5 פצצות אטום בשיא", "e", 300, 1, { mirv: 5, dmg: 60, r: 60 }, ["nuke", "mirv"]),
  W("drillnuke", "🌋", "אטום תת-קרקעי", "חופר ואז אטום", "e", 320, 1, { dig: 300, dmg: 90, r: 90 }, ["nuke", "digger"]),
  W("homingnuke", "🚀", "אטום מתביית", "אטום קטן שמתביית", "e", 300, 1, { homing: 0.25, dmg: 70, r: 70 }, ["homing", "babynuke"]),
  W("confetti", "🎊", "קונפטי", "0 נזק. כולם צוחקים", "c", 30, 3, { confetti: true, dmg: 0, r: 60 }),
  W("cluster", "🍇", "מצרר", "מתפצל ל-6 בפגיעה", "u", 100, 2, { burst: 6, dmg: 20, r: 26 }),
  W("spikes", "🦔", "קיפוד", "מתפצל ל-10 בפגיעה", "r", 180, 2, { burst: 10, dmg: 12, r: 20 }, ["cluster"]),
  W("volcano", "🗻", "הר געש", "נפאלם שמתפצל", "e", 260, 1, { fire: 2, burst: 5, dmg: 25, r: 30 }, ["napalm", "cluster"]),
  W("ghost", "👻", "פגז רפאים", "עובר דרך ההר פעם אחת", "u", 90, 3, { ghost: true, dmg: 40 }),
  W("teleshot", "🌀", "פגז טלפורט", "אתה עובר לנקודת הפגיעה", "u", 100, 2, { tele: true, dmg: 20, r: 30 }),
  W("medic", "💊", "פגז רפואה", "מרפא 40 למי שברדיוס", "c", 60, 2, { heal: 40, dmg: 0, r: 50 }),
  W("quakeshot", "🌍", "רעידת אדמה", "ההר קורס סביב הפגיעה", "u", 120, 1, { quake: true, dmg: 20, r: 30 }),
  W("lift", "🪜", "מעלית", "מרים את הנפגע לשמיים", "c", 60, 2, { lift: true, dmg: 10, r: 30 }),
  W("heavyx", "🧨", "פגז ענק", "נזק 70", "u", 150, 2, { dmg: 70, r: 55 }, ["heavy"]),
  W("sniper", "🎯", "צלף", "מהיר, כמעט בלי רוח, נזק 45", "u", 100, 3, { spd: 1.5, windK: 0.3, dmg: 45, r: 20 }),
  W("mortar", "🪖", "מרגמה", "נופל בתלילות, נזק 45", "c", 60, 3, { gravK: 1.8, dmg: 45, r: 45 }),
  W("bouncemirv", "🪀", "MIRV קופץ", "מתפצל, וכל חלק קופץ", "r", 200, 2, { mirv: 4, bounce: 2, dmg: 24, r: 26 }, ["mirv", "bouncer"]),
  W("fireroller", "🎡", "גלגל אש", "מתגלגל ומצית", "r", 180, 2, { roll: true, fire: 2, dmg: 35 }, ["roller", "napalm"]),
  W("lasermirv", "🌟", "כוכב לייזר", "5 לייזרים במניפה", "e", 240, 2, { laser: true, spd: 6, gravK: 0, windK: 0, n: 5, spread: 0.14, dmg: 24, r: 18 }, ["laser", "mirv"]),
  W("rain", "🌧️", "גשם פגזים", "מתפצל ל-12", "e", 300, 1, { mirv: 12, dmg: 15, r: 22 }, ["mirv2"]),
  W("frog", "🐸", "צפרדע", "קופץ פעמיים ומתפצל", "c", 80, 2, { bounce: 2, burst: 3, dmg: 18, r: 24 }),
  W("minigun", "🔫", "מיניגאן", "8 פגזים קטנים", "u", 120, 2, { n: 8, spread: 0.06, dmg: 9, r: 14 }),
  W("meteorcall", "☄️", "קריאה למטאור", "מטאור נופל על נקודת הפגיעה", "r", 180, 1, { meteor: true, dmg: 10, r: 20 }),

  /* 🛡️ הגנה */
  P("armor", "🛡️", "שריון", "−15% נזק (נערם עד 3)", "D", "c", 70, 3, (m) => { m.armor = Math.round(Math.min(0.6, m.armor + 0.15) * 100) / 100; }),
  P("hp", "❤️", "שלדה מחוזקת", "+25 חיים מקסימום (ומרפא 25)", "D", "c", 60, 4, (m) => { m.hpMax += 25; }),
  P("megahp", "💗", "שלדת טיטניום", "+60 חיים מקסימום", "D", "r", 160, 1, (m) => { m.hpMax += 60; }, ["hp"]),
  P("shield", "🔵", "מגן", "30 מגן שמתחדש כל סלבו", "D", "u", 90, 3, (m) => { m.shield += 30; }),
  P("reflect", "🪞", "מגן מחזיר", "פגיעה ישירה במגן חוזרת ליורה", "D", "r", 180, 1, (m) => { m.reflect = true; }, ["shield"]),
  P("fortress", "🏰", "מבצר", "+60 מגן ו-−10% נזק", "D", "e", 240, 1, (m) => { m.shield += 60; m.armor = Math.round(Math.min(0.6, m.armor + 0.1) * 100) / 100; }, ["shield", "armor"]),
  P("autorepair", "🔧", "תיקון אוטומטי", "+8 חיים כל סלבו", "D", "c", 80, 3, (m) => { m.repair += 8; }),
  P("chute", "🪂", "מצנח", "בלי נזק נפילה", "D", "c", 40, 1, (m) => { m.chute = true; }),
  P("hover", "🛸", "ריחוף", "חסין לנפילה ולמבול", "D", "u", 120, 1, (m) => { m.hover = true; m.chute = true; }, ["chute"]),
  P("dodge", "💫", "התחמקות", "15% מהפגזים מפספסים", "D", "u", 100, 2, (m) => { m.dodge = Math.min(0.5, m.dodge + 0.15); }),
  P("laststand", "🕯️", "עמידה אחרונה", "פגיעה קטלנית משאירה 1 חיים (פעם בקרב)", "D", "u", 130, 1, (m) => { m.lastStand = true; }),
  P("heavytank", "🪨", "משקל כבד", "חסין להדף ולחור שחור", "D", "c", 60, 1, (m) => { m.heavy = true; }),
  P("fireproof", "🧯", "חסין אש", "נפאלם לא פוגע בך", "D", "c", 60, 1, (m) => { m.fireproof = true; }),
  P("faraday", "🔌", "כלוב פאראדיי", "חסין להקפאה ול-EMP", "D", "c", 70, 1, (m) => { m.faraday = true; }),
  I("repairkit", "🩹", "ערכת תיקון", "+40 חיים עכשיו", "D", "c", 50, "heal40"),
  I("fullrepair", "🏥", "תיקון מלא", "חיים מלאים עכשיו", "D", "u", 120, "healfull"),
  I("bunker", "🏗️", "בונקר", "אדמה משני הצדדים שלך", "D", "c", 60, "bunker"),
  I("digin", "🕳️", "התחפרות", "יורד 30px לתוך ההר", "D", "c", 50, "digin"),

  /* ⚙️ טנק */
  P("fuel", "⛽", "דלק", "◀ ▶ 2 צעדים בכל סיבוב", "T", "c", 60, 3, (m) => { m.fuel += 2; }),
  P("turbo", "🏎️", "טורבו", "צעד כפול", "T", "c", 80, 1, (m) => { m.moveStep = 60; }, ["fuel"]),
  P("ballistic", "🧮", "מחשב בליסטי", "רואה את כל המסלול", "T", "u", 120, 1, (m) => { m.preview = 999; }),
  P("windsensor", "🌬️", "חיישן רוח", "התחזית כוללת את הרוח", "T", "u", 90, 1, (m) => { m.windPreview = true; }),
  P("sight", "🔭", "כוונת", "מסמן את נקודת הנחיתה", "T", "c", 60, 1, (m) => { m.sight = true; }),
  P("biggun", "🔩", "תותח גדול", "+20% עוצמה מקסימלית", "T", "c", 70, 2, (m) => { m.power += 0.2; }),
  P("dbl", "🎯🎯", "קנה כפול", "כל ירייה יורה פעמיים", "T", "r", 200, 1, (m) => { m.dbl = true; }),
  P("coat", "🧥", "מעיל רוח", "הרוח משפיעה חצי", "T", "c", 80, 1, (m) => { m.windK = 0.5; }),
  P("stabilizer", "📐", "מייצב", "מניפות צפופות פי 2", "T", "c", 60, 1, (m) => { m.stabilizer = true; }),
  I("tele", "✨", "טלפורט", "קופץ למקום אקראי", "T", "u", 90, "tele"),
  I("jumpjet", "🚁", "מנוע סילון", "קפיצה קצרה לצד", "T", "c", 60, "jump"),
  I("ammobox", "📦", "ארגז תחמושת", "+1 שימוש לכל התחמושת שלך", "T", "u", 90, "ammobox"),

  /* 🪙 כלכלה */
  P("magnet", "🧲", "מגנט זהב", "+25% זהב", "E", "c", 80, 2, (m) => { m.gold += 0.25; }),
  P("loot", "💰", "שלל", "+50% זהב מנזק", "E", "r", 150, 1, (m) => { m.gold += 0.5; }, ["magnet"]),
  P("lucky", "🍀", "מזל", "יותר קלפים נדירים", "E", "u", 100, 2, (m) => { m.luck += 1; }),
  P("discount", "🏷️", "מחירון", "20% הנחה בכל המוסך", "E", "u", 90, 1, (m) => { m.discount = 0.2; }),
  P("interest", "🏦", "ריבית", "+10% זהב כל סלבו", "E", "u", 110, 1, (m) => { m.interest = 0.1; }),
  P("scavenger", "🦅", "אספן", "+60 זהב על כל הריגה", "E", "c", 80, 1, (m) => { m.killBonus += 60; }),
  P("survivor", "🌵", "שורד", "בונוס שרידות ×3", "E", "c", 70, 1, (m) => { m.surviveMul = 3; }),
  P("blueprint", "📜", "שרטוט", "8 קלפים במוסך במקום 6", "E", "c", 60, 1, (m) => { m.offerN = 8; }),
  I("briefcase", "💼", "מזוודה", "+80 זהב", "E", "c", 50, "gold80"),

  /* 🎭 חברתי */
  P("revenge", "😤", "נקמה", "נזק כפול למי שפגע בך אחרון", "S", "c", 80, 1, (m) => { m.revenge = true; }),
  P("hunter", "🏹", "צייד ראשים", "בונוס ראש-בפרס כפול", "S", "u", 90, 1, (m) => { m.hunter = true; }),
  P("betray", "🗡️", "בגידה", "מותר לפגוע בבן הברית — נזק כפול", "S", "u", 120, 1, (m) => { m.betray = true; }, ["ally"]),
  I("bounty", "🎯", "ראש בפרס", "בחר שחקן: כולם מקבלים בונוס עליו", "S", "c", 60, "bounty", "player"),
  I("steal", "🦝", "גניבה", "גונב 40 זהב משחקן", "S", "c", 70, "steal", "player"),
  I("robin", "🏹", "רובין הוד", "גונב 60 זהב מהמוביל", "S", "u", 90, "robin"),
  I("cursewind", "🌪️", "קללת רוח", "הירייה הבאה שלו — רוח אקראית", "S", "u", 80, "curse:wind", "player"),
  I("curseweak", "🐌", "קללת חולשה", "הירייה הבאה שלו — חצי עוצמה", "S", "u", 80, "curse:weak", "player"),
  I("curseblind", "🙈", "עיוורון", "הוא לא רואה תחזית בסיבוב הבא", "S", "c", 60, "curse:blind", "player"),
  I("curseconf", "🤡", "קללת קונפטי", "הירייה הבאה שלו — קונפטי", "S", "c", 70, "curse:confetti", "player"),
  I("swap", "🔀", "החלפה", "מתחלף במקום עם שחקן", "S", "u", 100, "swap", "player"),
  I("ally", "🤝", "ברית", "2 סיבובים בלי נזק הדדי, +25 זהב לסיבוב", "S", "c", 70, "ally", "player"),
  I("spy", "🕵️", "ריגול", "רואה לאן הוא מכוון בסיבוב הבא", "S", "c", 50, "spy", "player"),
  I("taunt", "😜", "התגרות", "אם תשרוד את הסלבו הבא — +100 זהב", "S", "c", 60, "taunt"),
  I("sabotage", "🔧", "חבלה", "מוריד לו את המגן ותחמושת אחת", "S", "u", 100, "sabotage", "player"),
  I("gift", "🎁", "מתנה", "נותן 60 זהב לשחקן", "S", "c", 50, "gift", "player"),

  /* 🌍 עולם */
  I("quake", "🌍", "רעידת אדמה", "כל ההר קורס קצת — כולם נופלים", "X", "u", 100, "world:quake"),
  I("flood", "🌊", "מבול", "המים עולים. מי שבמים — נפגע", "X", "u", 120, "world:flood"),
  I("lowgrav", "🌙", "כבידה נמוכה", "2 סיבובים — הפגזים עפים רחוק", "X", "u", 90, "world:lowgrav"),
  I("highgrav", "🪐", "כבידה כבדה", "2 סיבובים — הפגזים נופלים מהר", "X", "c", 70, "world:highgrav"),
  I("storm", "🌀", "סופה", "רוח ×2.5 ל-2 סיבובים", "X", "c", 80, "world:storm"),
  I("calm", "🍃", "שקט", "בלי רוח 2 סיבובים", "X", "c", 50, "world:calm"),
  I("night", "🌚", "לילה", "בסיבוב הבא — אין תחזית לאף אחד", "X", "u", 90, "world:night"),
  I("meteors", "☄️", "גשם מטאורים", "4 מטאורים בסלבו הבא", "X", "r", 130, "world:meteors"),
  I("newmap", "🗺️", "הר חדש", "ההר מתחלף — כולם נופלים עליו", "X", "r", 200, "world:newmap"),
  I("oil", "🛢️", "שמן", "כולם מחליקים במורד", "X", "c", 70, "world:oil"),
  I("walls", "🧱", "קירות", "פגזים חוזרים מהקצוות 2 סיבובים", "X", "c", 60, "world:walls"),
  I("doomsday", "🔔", "יום הדין", "בסלבו הבא כל הנזק כפול", "X", "r", 150, "world:doom"),
  I("healrain", "🌦️", "גשם מרפא", "כולם +25 חיים", "X", "c", 80, "world:healall"),
  I("shuffle", "🎲", "ערבוב", "כל הטנקים מתפזרים מחדש", "X", "r", 130, "world:shuffle"),

  /* ☁️ שמיים — למתים, חינם, אחד לסיבוב */
  K("skymeteor", "☄️", "מטאור", "בחר נקודה — מטאור נופל שם", "sky:meteor", "x"),
  K("skydirt", "🌫️", "ענן אדמה", "בחר נקודה — גבעה נוחתת שם", "sky:dirt", "x"),
  K("skybless", "😇", "ברכה", "+40 מגן לשחקן", "sky:bless", "player"),
  K("skyheal", "💚", "ריפוי", "+30 חיים לשחקן", "sky:heal", "player"),
  K("skywind", "🌬️", "רוח", "הרוח משתנה לכיוון אקראי חזק", "sky:wind"),
  K("skycurse", "😈", "קללה", "הירייה הבאה שלו — רוח אקראית", "sky:curse", "player"),
  K("skyweak", "🐌", "בוץ", "הירייה הבאה שלו — חצי עוצמה", "sky:weak", "player"),
  K("skygift", "🎁", "מענק", "+60 זהב לאחרון בטבלה", "sky:gift"),
];
const CARD_MAP = new Map(TK_CARDS.map((c) => [c.id, c]));
export const tkCard = (id: string) => CARD_MAP.get(id);
export const TK_RARITY_W: Record<TkRarity, number> = { c: 10, u: 5, r: 2, e: 6 };
export const TK_RAR_NAME: Record<TkRarity, string> = { c: "רגיל", u: "נדיר", r: "אגדי", e: "אבולוציה" };
export const TK_CAT_NAME: Record<TkCat, string> = { W: "תחמושת", D: "הגנה", T: "טנק", S: "חברתי", X: "עולם", E: "כלכלה", K: "שמיים" };
export const TK_BASIC = "basic";
/** הנשק הבסיסי — אינסופי */
export const tkWeaponOf = (id: string): TkWeapon => { const b = tkBaseWeapon(); if (id === TK_BASIC) return b; const c = tkCard(id); return c?.w ? { ...b, ...c.w } : b; };
/** המודים של שחקן = הבסיס + כל הקלפים הפסיביים (עם ערימה) */
export function tkMods(owned: Record<string, number>): TkMods {
  const m = tkBaseMods();
  for (const [id, n] of Object.entries(owned)) { const c = tkCard(id); if (!c?.m) continue; for (let i = 0; i < n; i++) c.m(m); }
  return m;
}
export const tkPrice = (c: TkCard, m: TkMods) => Math.round(c.price * (1 - m.discount));

/* ---------- מצב הטנק ---------- */
export interface TkTank {
  pid: string; c: number; x: number; y: number;
  hp: number; hpMax: number; shield: number; alive: boolean;
  armor: number; dodge: number; chute: boolean; heavy: boolean; fireproof: boolean; faraday: boolean; reflect: boolean; hover: boolean;
  lastStand: boolean;      // עוד לא נוצל בקרב הזה
  frozen: boolean;         // מדלג על הירייה הבאה
  emp: number;             // סלבו שבו המגן לא מתחדש
  aim: { vx: number; vy: number } | null;   // הכיוון האחרון (לציור הקנה)
  bounty: number;          // עד סלבו מספר…
  lastHitBy: string;
}
export function tkNewTank(pid: string, c: number, x: number, h: number[], m: TkMods): TkTank {
  return {
    pid, c, x, y: tkGround(h, x), hp: m.hpMax, hpMax: m.hpMax, shield: m.shield, alive: true,
    armor: m.armor, dodge: m.dodge, chute: m.chute, heavy: m.heavy, fireproof: m.fireproof, faraday: m.faraday, reflect: m.reflect, hover: m.hover,
    lastStand: m.lastStand, frozen: false, emp: -1, aim: null, bounty: -1, lastHitBy: "",
  };
}
/** לעדכן מודים על טנק חי (אחרי קנייה) — בלי לאפס hp */
export function tkApplyMods(t: TkTank, m: TkMods) {
  const dMax = m.hpMax - t.hpMax;
  t.hpMax = m.hpMax; if (dMax > 0) t.hp = Math.min(t.hpMax, t.hp + dMax);
  t.armor = m.armor; t.dodge = m.dodge; t.chute = m.chute; t.heavy = m.heavy; t.fireproof = m.fireproof; t.faraday = m.faraday; t.reflect = m.reflect; t.hover = m.hover;
  if (m.shield > t.shield) t.shield = m.shield;
}

/* ---------- הסלבו ---------- */
export interface TkShot { pid: string; vx: number; vy: number; w: string; dbl?: boolean; wind?: number; dmgK?: number; sk?: boolean }
export interface TkSalvoIn {
  seed: string; k: number; wind: number;
  shots: TkShot[];
  meteors: number[];                 // מיקומי x של מטאורים משמיים
  dirts?: number[];                  // ענני אדמה משמיים (קלף שמיים)
  noDmg: [string, string][];         // בריתות
  betray: string[];                  // מי שמותר לו לפגוע בבן הברית (×2)
  revenge: Record<string, string>;   // pid → במי מותר לנקום (×2)
  doom: boolean;                     // כל הנזק כפול
  stagger?: number;
}
export type TkEvent =
  | { t: "fire"; pid: string; x: number; y: number; vx: number; vy: number; w: string }
  | { t: "boom"; x: number; y: number; r: number; by: string; w: string; kind: "boom" | "dirt" | "confetti" | "heal" | "laser" | "meteor" | "fire" }
  | { t: "hit"; pid: string; by: string; dmg: number; hp: number; shield: boolean; kind: string }
  | { t: "die"; pid: string; by: string }
  | { t: "dodge"; pid: string }
  | { t: "reflect"; pid: string }
  | { t: "split"; x: number; y: number; n: number }
  | { t: "tele"; pid: string; x: number; y: number }
  | { t: "fall"; pid: string; dmg: number }
  | { t: "water"; pid: string; dmg: number }
  | { t: "burn"; pid: string; dmg: number }
  | { t: "shock"; pid: string; dx: number }
  | { t: "freeze"; pid: string }
  | { t: "emp"; pid: string }
  | { t: "laststand"; pid: string };

export interface TkShell {
  id: number; by: string; w: TkWeapon; wid: string;
  x: number; y: number; vx: number; vy: number; px: number; py: number;
  t: number; born: number; bounces: number; dig: number; ghost: boolean; roll: boolean; rollDir: number;
  mirved: boolean; done: boolean; wind: number; dmgK: number; delay: number; meteor: boolean; trail: number[];
  hits: number; // כמה פעמים כבר החזירו אותו (מגן מחזיר) — מונע לולאה אינסופית
  child: boolean; // פגז-בן (MIRV/מצרר/שרשרת) — בלי אירוע ירי
}
export interface TkSalvoSim {
  tick: number; done: boolean; shells: TkShell[]; events: TkEvent[];
  world: TkWorld; tanks: Map<string, TkTank>; input: TkSalvoIn;
  step(): boolean;              // טיק אחד; מחזיר true כשנגמר
  drain(): TkEvent[];           // אירועים שהצטברו מאז ה-drain הקודם
}

/** מסלול תחזית (ללקוח) — פגז בסיסי, עד maxTicks טיקים או פגיעה בקרקע */
export function tkPreview(world: TkWorld, x0: number, y0: number, vx: number, vy: number, wind: number, maxTicks: number, w: TkWeapon = tkBaseWeapon()): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  let x = x0, y = y0;
  const g = TK.GRAV * world.gravK * w.gravK, ax = wind * TK.WIND_K * world.windK * w.windK;
  vx *= w.spd; vy *= w.spd;
  for (let i = 0; i < maxTicks; i++) {
    vx += ax; vy -= g; x += vx; y += vy;
    if (i % 2 === 0) pts.push({ x, y });
    if (y <= tkGround(world.h, x) || y <= world.water) { pts.push({ x, y }); break; }
    if (x < -40 || x > TK.W + 40) break;
  }
  return pts;
}

export function tkNewSalvo(world: TkWorld, tanks: Map<string, TkTank>, input: TkSalvoIn): TkSalvoSim {
  const rng = tkRng(`salvo:${input.seed}:${input.k}`);
  const shells: TkShell[] = [];
  const events: TkEvent[] = [];
  let pending: TkEvent[] = [];
  let nextId = 1;
  const stagger = input.stagger ?? TK.FIRE_STAGGER;
  const allies = new Set(input.noDmg.map(([a, b]) => a + "|" + b).concat(input.noDmg.map(([a, b]) => b + "|" + a)));
  const betray = new Set(input.betray);
  const fallStart = new Map<string, number>();
  let curTick = 0;
  const push = (e: TkEvent) => { events.push(e); pending.push(e); };
  const liveTanks = () => [...tanks.values()].filter((t) => t.alive);

  function spawn(by: string, wid: string, w: TkWeapon, x: number, y: number, vx: number, vy: number, delay: number, extra: Partial<TkShell> = {}): TkShell {
    const s: TkShell = {
      id: nextId++, by, w, wid, x, y, vx, vy, px: x, py: y, t: 0, born: curTick + delay, bounces: w.bounce, dig: w.dig, ghost: w.ghost,
      roll: false, rollDir: 0, mirved: false, done: false, wind: input.wind, dmgK: 1, delay, meteor: false, trail: [], hits: 0, child: false, ...extra,
    };
    shells.push(s);
    return s;
  }
  // ירי ראשוני — גל של המראות
  input.shots.forEach((sh, i) => {
    const t = tanks.get(sh.pid);
    if (!t || !t.alive) return;
    const w = tkWeaponOf(sh.w);
    const wind = sh.wind ?? input.wind;
    const dmgK = (sh.dmgK ?? 1) * (input.doom ? 2 : 1);
    const delay = i * stagger;
    const fan = (base: number) => {
      const spread = w.spread * (sh.sk ? 0.5 : 1);
      const cnt = w.n;
      for (let j = 0; j < cnt; j++) {
        const a = Math.atan2(sh.vy, sh.vx) + (j - (cnt - 1) / 2) * spread;
        const v = Math.hypot(sh.vx, sh.vy) * w.spd;
        spawn(sh.pid, sh.w, w, t.x, t.y + TK.TANK_H, Math.cos(a) * v, Math.sin(a) * v, base, { wind, dmgK });
      }
    };
    fan(delay);
    if (sh.dbl) fan(delay + 12);
    t.aim = { vx: sh.vx, vy: sh.vy };
  });
  // מטאורים + ענני אדמה משמיים
  input.meteors.forEach((mx, i) => {
    const w = { ...tkBaseWeapon(), dmg: TK.METEOR_DMG, r: TK.METEOR_R, windK: 0 };
    spawn("", "meteor", w, mx + (rng() - 0.5) * 20, 1500, (rng() - 0.5) * 2, -7, 20 + i * 15, { meteor: true });
  });
  (input.dirts ?? []).forEach((mx, i) => {
    const w = { ...tkBaseWeapon(), dmg: 0, r: 60, windK: 0, dirt: true };
    spawn("", "dirtball", w, mx, 1400, 0, -7, 30 + i * 15, { meteor: true });
  });

  function damage(victim: TkTank, by: string, amount: number, kind: string, x: number) {
    if (!victim.alive || amount <= 0) return;
    if (by && by !== victim.pid && allies.has(by + "|" + victim.pid)) {
      if (!betray.has(by)) return;                       // ברית — בלי נזק
      amount *= 2;                                       // בגידה
    }
    if (by === victim.pid) amount *= TK.DMG_SELF;
    if (by && input.revenge[by] === victim.pid) amount *= 2;
    if (by && by !== victim.pid && victim.dodge > 0 && rng() < victim.dodge) { push({ t: "dodge", pid: victim.pid }); return; }
    amount = Math.round(amount * (1 - victim.armor));
    if (amount <= 0) return;
    let shielded = false;
    if (victim.shield > 0) {
      const s = Math.min(victim.shield, amount);
      victim.shield -= s; amount -= s; shielded = true;
    }
    if (amount > 0) {
      if (victim.hp - amount <= 0 && victim.lastStand) { victim.lastStand = false; amount = victim.hp - 1; push({ t: "laststand", pid: victim.pid }); }
      victim.hp = Math.max(0, victim.hp - amount);
    }
    if (by && by !== victim.pid) victim.lastHitBy = by;
    push({ t: "hit", pid: victim.pid, by, dmg: amount, hp: victim.hp, shield: shielded, kind });
    if (victim.hp <= 0) { victim.alive = false; push({ t: "die", pid: victim.pid, by }); }
    void x;
  }

  function explode(s: TkShell, x: number, y: number) {
    const w = s.w;
    s.done = true;
    const kind = w.confetti ? "confetti" : w.dirt ? "dirt" : w.heal ? "heal" : w.laser ? "laser" : s.meteor ? "meteor" : w.fire ? "fire" : "boom";
    push({ t: "boom", x, y, r: w.r, by: s.by, w: s.wid, kind });
    if (w.dirt) tkMound(world.h, x, y, w.r);
    else if (!w.confetti && !w.heal) tkCrater(world.h, x, y, w.r);
    if (w.quake) tkQuake(world.h, rng, x, 220);
    if (w.fire > 0) world.fires.push({ x, r: w.r * 1.2, until: input.k + w.fire });
    // נזק / ריפוי / הדף / משיכה לטנקים ברדיוס
    for (const t of liveTanks()) {
      const d = Math.hypot(t.x - x, t.y + TK.TANK_H - y);
      const reach = w.r + TK.TANK_R;
      if (d > reach * 1.15) continue;
      const f = Math.max(0, Math.min(1, 1 - (d - TK.TANK_R) / (reach * 1.15 - TK.TANK_R)));
      if (w.heal > 0) { t.hp = Math.min(t.hpMax, t.hp + Math.round(w.heal * Math.max(0.5, f))); push({ t: "hit", pid: t.pid, by: s.by, dmg: -Math.round(w.heal * Math.max(0.5, f)), hp: t.hp, shield: false, kind: "heal" }); continue; }
      if (w.emp && !t.faraday) { if (t.shield > 0 || t.emp < input.k) { t.shield = 0; t.emp = input.k + 1; push({ t: "emp", pid: t.pid }); } }
      if (w.freeze && !t.faraday && t.pid !== s.by) { t.frozen = true; push({ t: "freeze", pid: t.pid }); }
      if (w.dmg > 0 && !w.confetti) damage(t, s.by, w.dmg * s.dmgK * (f >= 0.999 ? 1 : 0.35 + 0.65 * f), s.wid, x);
      if (w.shock > 0 && !t.heavy && t.alive) { const dir = Math.sign(t.x - x) || (rng() < 0.5 ? -1 : 1); const dx = Math.round(dir * w.shock * Math.max(0.3, f)); t.x = Math.max(12, Math.min(TK.W - 12, t.x + dx)); push({ t: "shock", pid: t.pid, dx }); }
      if (w.hole > 0 && !t.heavy && t.alive) { const dir = Math.sign(x - t.x); const dx = Math.round(dir * Math.min(Math.abs(x - t.x), w.hole)); t.x = Math.max(12, Math.min(TK.W - 12, t.x + dx)); push({ t: "shock", pid: t.pid, dx }); }
      if (w.lift && t.alive) tkMound(world.h, t.x, tkGround(world.h, t.x) + 40, 34);
    }
    if (w.tele) { const me = tanks.get(s.by); if (me?.alive) { me.x = Math.max(12, Math.min(TK.W - 12, x)); push({ t: "tele", pid: me.pid, x: me.x, y: tkGround(world.h, me.x) }); } }
    // מצרר / שרשרת / מטאור
    if (w.burst > 0) {
      const sub: TkWeapon = { ...w, burst: 0, mirv: 0, chain: 0, dmg: Math.round(w.dmg * 0.7), r: Math.round(w.r * 0.7), bounce: 0, dig: 0, fire: w.fire, tele: false, quake: false, meteor: false };
      push({ t: "split", x, y, n: w.burst });
      for (let i = 0; i < w.burst; i++) spawn(s.by, s.wid, sub, x, y + 6, (rng() - 0.5) * 9, 5 + rng() * 6, 2, { wind: s.wind, dmgK: s.dmgK, child: true });
    }
    if (w.chain > 0) {
      const sub: TkWeapon = { ...w, chain: 0, mirv: 0, burst: 0, dmg: Math.round(w.dmg * 0.8), r: Math.round(w.r * 0.8) };
      for (let i = 0; i < w.chain; i++) { const cx = Math.max(10, Math.min(TK.W - 10, x + (rng() - 0.5) * 240)); spawn(s.by, s.wid, sub, cx, tkGround(world.h, cx) + 2, 0, 0, 8 + i * 7, { wind: s.wind, dmgK: s.dmgK, child: true }); }
    }
    if (w.meteor) { const mw = { ...tkBaseWeapon(), dmg: TK.METEOR_DMG, r: TK.METEOR_R, windK: 0 }; spawn(s.by, "meteor", mw, x, 1400, 0, -8, 10, { meteor: true, dmgK: s.dmgK, child: true }); }
  }

  const sim: TkSalvoSim = {
    tick: 0, done: false, shells, events, world, tanks, input,
    drain() { const p = pending; pending = []; return p; },
    step(): boolean {
      if (sim.done) return true;
      const tk = sim.tick; curTick = tk;
      // אש על ההר — פוגעת בתחילת הסלבו במי שעומד בתוכה
      if (tk === 0) {
        for (const f of world.fires) for (const t of liveTanks()) if (!t.fireproof && Math.abs(t.x - f.x) < f.r && t.y < tkGround(world.h, f.x) + 60) { damage(t, "", TK.FIRE_DMG, "fire", f.x); push({ t: "burn", pid: t.pid, dmg: TK.FIRE_DMG }); }
      }
      for (const s of shells) {
        if (s.done || tk < s.born) continue;
        if (s.t === 0 && !s.child && !s.meteor) push({ t: "fire", pid: s.by, x: s.x, y: s.y, vx: s.vx, vy: s.vy, w: s.wid });
        s.t++;
        s.px = s.x; s.py = s.y;
        const w = s.w;
        if (s.roll) {
          // מתגלגל על הקרקע
          s.x += s.rollDir * 4; s.y = tkGround(world.h, s.x) + 3;
          if (s.x < 0 || s.x > TK.W || s.y <= world.water || s.t > 400) { explode(s, s.x, s.y); continue; }
          for (const t of liveTanks()) if (t.pid !== s.by && Math.hypot(t.x - s.x, t.y + TK.TANK_H - s.y) < TK.TANK_R + 4) { explode(s, s.x, s.y); break; }
          continue;
        }
        const g = TK.GRAV * world.gravK * w.gravK;
        s.vy -= g;
        s.vx += s.wind * TK.WIND_K * world.windK * w.windK;
        if (w.homing > 0) {
          let best: TkTank | null = null, bd = 260;
          for (const t of liveTanks()) { if (t.pid === s.by) continue; const d = Math.hypot(t.x - s.x, t.y - s.y); if (d < bd) { bd = d; best = t; } }
          if (best) { const v = Math.hypot(s.vx, s.vy) || 1; const ax = (best.x - s.x) / bd, ay = (best.y + TK.TANK_H - s.y) / bd; s.vx += ax * w.homing * v * 0.08; s.vy += ay * w.homing * v * 0.08; const nv = Math.hypot(s.vx, s.vy) || 1; s.vx *= v / nv; s.vy *= v / nv; }
        }
        // MIRV — בשיא
        if (w.mirv > 0 && !s.mirved && s.vy <= 0 && s.t > 5) {
          s.mirved = true; s.done = true;
          const sub: TkWeapon = { ...w, mirv: 0 };
          push({ t: "split", x: s.x, y: s.y, n: w.mirv });
          for (let i = 0; i < w.mirv; i++) { const k = (i - (w.mirv - 1) / 2) / Math.max(1, (w.mirv - 1) / 2); spawn(s.by, s.wid, sub, s.x, s.y, s.vx + k * 2.4 + (rng() - 0.5) * 0.4, s.vy + rng() * 0.6, 0, { wind: s.wind, dmgK: s.dmgK, born: tk, child: true }); }
          continue;
        }
        // תת-צעדים לפגזים מהירים (לייזר/צלף) — שלא יעברו דרך טנק או הר בין טיק לטיק
        const spd = Math.hypot(s.vx, s.vy);
        const sub = Math.max(1, Math.ceil(spd / 6));
        let resolved = false;
        for (let k = 0; k < sub && !resolved; k++) {
          s.x += s.vx / sub; s.y += s.vy / sub;
          // קצוות
          if (s.x < -30 || s.x > TK.W + 30) {
            if (world.walls) { s.vx = -s.vx; s.x = Math.max(-29, Math.min(TK.W + 29, s.x)); }
            else { s.done = true; resolved = true; break; }
          }
          if (s.y < -50 || s.y > 3000 || (w.laser && s.y > 900)) { s.done = true; resolved = true; break; }
          // מים
          if (world.water > 0 && s.y <= world.water && !s.meteor) { explode(s, s.x, world.water); resolved = true; break; }
          // טנקים — פגיעה ישירה
          let hitTank: TkTank | null = null;
          for (const t of liveTanks()) {
            if (t.pid === s.by && s.t < 12) continue;   // לא להתפוצץ על הקנה שלך
            if (Math.hypot(t.x - s.x, t.y + TK.TANK_H - s.y) < TK.TANK_R + TK.SHELL_R) { hitTank = t; break; }
          }
          if (hitTank) {
            if (hitTank.reflect && hitTank.shield > 0 && s.hits < 2 && hitTank.pid !== s.by) { s.hits++; hitTank.shield = Math.max(0, hitTank.shield - 10); s.vx = -s.vx * 0.9; s.vy = Math.abs(s.vy) * 0.9 + 2; s.by = hitTank.pid; push({ t: "reflect", pid: hitTank.pid }); resolved = true; break; }
            explode(s, s.x, s.y); resolved = true; break;
          }
          // קרקע
          const gy = tkGround(world.h, s.x);
          if (s.y <= gy) {
            if (s.dig > 0) { s.dig -= spd / sub; if (s.dig <= 0 || s.y < 5) { explode(s, s.x, Math.max(2, s.y)); resolved = true; } continue; }
            if (s.ghost) { s.ghost = false; continue; }
            if (w.roll && !s.roll) { s.roll = true; s.rollDir = Math.sign(s.vx) || 1; s.y = gy + 3; resolved = true; break; }
            if (s.bounces > 0) {
              s.bounces--;
              const sl = (tkGround(world.h, s.x + 4) - tkGround(world.h, s.x - 4)) / 8;
              const nx = -sl, ny = 1; const nl = Math.hypot(nx, ny); const ux = nx / nl, uy = ny / nl;
              const dot = s.vx * ux + s.vy * uy;
              s.vx = (s.vx - 2 * dot * ux) * 0.65; s.vy = (s.vy - 2 * dot * uy) * 0.65;
              if (Math.abs(s.vy) < 1.5) s.vy = 1.5 * (s.vy < 0 ? -1 : 1) + 1.5;
              s.y = gy + 1;
              push({ t: "boom", x: s.x, y: s.y, r: 6, by: s.by, w: s.wid, kind: "dirt" });
              resolved = true; break;
            }
            explode(s, s.x, Math.max(s.y, gy - 2)); resolved = true; break;
          }
        }
        if (s.t > TK.MAX_TICKS) s.done = true;
        if (s.t % 2 === 0) { s.trail.push(s.x, s.y); if (s.trail.length > 40) s.trail.splice(0, 2); }
      }
      // אחרי הפיצוצים: טנקים נופלים עם ההר (נזק נפילה), מים
      for (const t of liveTanks()) {
        const gy = tkGround(world.h, t.x);
        if (t.y > gy + 0.5) {
          if (!fallStart.has(t.pid)) fallStart.set(t.pid, t.y);
          t.y = Math.max(gy, t.y - 6);
          if (t.y <= gy + 0.01) {
            const drop = (fallStart.get(t.pid) ?? t.y) - t.y; fallStart.delete(t.pid);
            if (drop > TK.FALL_FREE && !t.chute) { const dmg = Math.round((drop - TK.FALL_FREE) / TK.FALL_DIV); damage(t, "", dmg, "fall", t.x); push({ t: "fall", pid: t.pid, dmg }); }
          }
        } else if (t.y < gy) t.y = gy;   // תל מתחתיו — עולה איתו
      }
      // סיום: אין פגזים חיים ולא מחכים
      sim.tick++;
      const active = shells.some((s) => !s.done);
      const settling = liveTanks().some((t) => t.y > tkGround(world.h, t.x) + 0.5);
      if ((!active && !settling && sim.tick > 30) || sim.tick >= TK.MAX_TICKS + 120) {
        // מים בסוף הסלבו
        if (world.water > 0) for (const t of liveTanks()) if (!t.hover && t.y < world.water) { damage(t, "", TK.WATER_DMG, "water", t.x); push({ t: "water", pid: t.pid, dmg: TK.WATER_DMG }); }
        sim.done = true;
      }
      return sim.done;
    },
  };
  return sim;
}

/* ---------- הבוט (בדיקות/פלייטסט) ---------- */
/** מחפש וקטור ירייה שמנחית פגז בסיסי הכי קרוב למטרה — 60 ניסיונות */
export function tkBotAim(world: TkWorld, me: TkTank, target: TkTank, wind: number, power = 1, rng: () => number = Math.random): { vx: number; vy: number } {
  let best = { vx: 8, vy: 12 }, bd = 1e9;
  for (let i = 0; i < 60; i++) {
    const a = 0.3 + rng() * 1.2, v = (6 + rng() * (TK.VMAX * power - 6));
    const dir = target.x >= me.x ? 1 : -1;
    const vx = Math.cos(a) * v * dir, vy = Math.sin(a) * v;
    const pts = tkPreview(world, me.x, me.y + TK.TANK_H, vx, vy, wind, 400);
    const p = pts[pts.length - 1];
    if (!p) continue;
    const d = Math.hypot(p.x - target.x, p.y - target.y);
    if (d < bd) { bd = d; best = { vx, vy }; }
  }
  return best;
}

/* ---------- ציר הזמן ---------- */
export interface TkConfig { battles: number; aimMs: number; garageMs: number; introMs: number; pickMs: number; endMs: number; maxSalvos: number; seed?: string }
export function tkConfig(raw: Partial<Record<string, unknown>>): TkConfig {
  const battles = Math.max(1, Math.min(5, Number(raw.battles) || 2));
  const aimMs = Math.max(3000, Math.min(30000, Number(raw.aimMs) || (raw.aim === "8" ? 8000 : raw.aim === "18" ? 18000 : 12000)));
  return {
    battles, aimMs,
    garageMs: Number(raw.garageMs) || 12000,
    introMs: Number(raw.introMs) || 3000,
    pickMs: Number(raw.pickMs) || 8000,
    endMs: Number(raw.endMs) || 3500,
    maxSalvos: Number(raw.maxSalvos) || TK.MAX_SALVOS,
    seed: typeof raw.seed === "string" ? raw.seed : undefined,
  };
}

/* ---------- הודעות ---------- */
export interface TkTankWire { pid: string; c: number; x: number; y: number; hp: number; hpMax: number; sh: number; alive: boolean; bounty?: boolean; frozen?: boolean }
export interface TkCardWire { id: string; ic: string; t: string; d: string; r: TkRarity; cat: TkCat; kind: TkKind; price: number; tg?: TkTargetKind; n?: number }
export interface TkWorldWire { water: number; gravK: number; windK: number; walls: boolean; night: boolean; fires: { x: number; r: number; until: number }[]; theme: TkTheme }
export type TkRow = { pid: string; c: number; score: number; kills: number; dmg: number; gold: number; wins: number; cards: string[] };

export type TanksServerMsg =
  | { a: "tk_pickphase"; taken: Record<string, number>; until: number }
  | { a: "tk_go"; chars: Record<string, number>; battles: number; cfg: { aimMs: number; garageMs: number } }
  | { a: "tk_battle"; b: number; seed: string; h: number[]; world: TkWorldWire; tanks: TkTankWire[]; wind: number; startAt: number }
  | { a: "tk_aim"; k: number; until: number; wind: number; bounty: string; sudden: boolean; meteors: number; night: boolean; doom: boolean }
  | { a: "tk_you"; gold: number; ammo: Record<string, number>; owned: Record<string, number>; fuel: number; blind: boolean; spy: string[]; curse: string }
  | { a: "tk_tank"; tank: TkTankWire }
  | { a: "tk_terrain"; h: number[]; world?: TkWorldWire }
  | { a: "tk_move"; pid: string; x: number; y: number; fuel: number }
  | { a: "tk_spy"; pid: string; vx: number; vy: number }
  | { a: "tk_salvo"; k: number; at: number; input: TkSalvoIn; ticks: number; tanks: TkTankWire[]; pre: string[] }
  | { a: "tk_result"; k: number; h: number[]; world: TkWorldWire; tanks: TkTankWire[]; gold: Record<string, number>; earned: Record<string, number>; feed: string[] }
  | { a: "tk_garage"; k: number; until: number; gold: number; cards: TkCardWire[]; sudden: boolean }
  | { a: "tk_sky"; k: number; cards: TkCardWire[] }
  | { a: "tk_bought"; pid: string; card: TkCardWire; target?: string; tx: string }
  | { a: "tk_battleover"; b: number; winner: string | null; rows: TkRow[]; last: boolean }
  | { a: "tk_over"; rows: TkRow[]; titles: { pid: string; ic: string; t: string }[] }
  | { a: "tk_feed"; tx: string }
  | { a: "tk_sync"; phase: string; b: number; k: number; chars: Record<string, number>; seed: string; h: number[]; world: TkWorldWire; tanks: TkTankWire[]; wind: number; until: number; you: { gold: number; ammo: Record<string, number>; owned: Record<string, number>; fuel: number; alive: boolean }; cfg: { aimMs: number; garageMs: number }; battles: number };

export type TanksClientMsg =
  | { a: "tk_char"; c: number }
  | { a: "tk_aimset"; vx: number; vy: number; w: string }
  | { a: "tk_movereq"; dir: number }
  | { a: "tk_ready" }
  | { a: "tk_buy"; id: string; target?: string; x?: number }
  | { a: "tk_skypick"; id: string; target?: string; x?: number };
