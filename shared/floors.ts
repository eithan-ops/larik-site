/**
 * הקומות 🏢 — הליבה הדטרמיניסטית המשותפת לשרת וללקוח.
 *
 * הפיזיקה היא פורט של מנוע Icy Tower 1.3.1 (physics.c בשחזור royeldar/icytower):
 * 50 טיקים בשנייה, יחידות = פיקסלים לטיק. הבדל אחד: ציר y כאן פונה *למעלה*
 * (קומה i יושבת ב-y = i·FLOOR_H), ורוחב המגדל הוצר ל-480px כדי להתאים לטלפון אנכי.
 *
 * "הטלפון בעלים של הריצה, השרת בעלים של השעון": כל טלפון מסמלץ את הדמות שלו מהמגדל
 * המשותף (seed לחדר) ומדווח; השרת סמכותי על קו המוות, החיים, הניקוד, הפגיעות והדראפט.
 *
 * ⚠️ מתקמפל גם תחת ה-TS הקפדני של הלקוח: בלי enum, בלי namespaces, import type בלבד.
 */

/* ---------- קבועים ---------- */
export const FL = {
  TICK_MS: 20,               // 50Hz
  W: 480,                    // רוחב העולם בפיקסלים
  TILE: 16,
  TILE0: 4, TILES: 22,       // אריחי הרצפה: 4..25 → px 64..416
  BODY_HW: 11,               // חצי רוחב הגוף (22px)
  BODY_H: 40,
  WALL_L: 75, WALL_R: 405,   // גבולות מרכז הגוף (64+11, 416−11)
  FLOOR_H: 80,               // מרווח בין קומות
  ACC: 0.3, TURN: 0.7, FRICTION: 0.9,
  VMAX: 12.2,
  JUMP_MIN: 12.2, JUMP_K: 2, // dy = max(12.2, 2·|dx|)
  GRAV: 0.8, VFALL: 12.2,
  WALL_KEEP: 0.9,
  SPIN_V: 11.1,              // מעל זה — סיבוב + קול "קפיצה גבוהה"
  COMBO_TICKS: 100,          // 2 שנ'
  DEATH_BELOW: 60,           // px מתחת לקו המוות
  LIVES: 5, LIVES_MAX: 7,
  RESPAWN_MS: 3000, RESPAWN_ABOVE: 2, INVULN_MS: 3000,
  GRACE_MS: 5000,            // חסד אחרי עצירה
  ATTACK_CD_MS: 5000,        // קולדאון גלובלי לתקיפות
  REPORT_MS: 100,
  HAMMER_R: 34, HAMMER_FLING: 7, HAMMER_DROP: 6,
  SHOT_V: 9, SHOT_LIFE: 60, SHOT_R: 14, SHOT_SLOW_MS: 2000,
  BANANA_MS: 8000,
  /** 8 הדמויות = יצור ג'לי אחד ב-8 צבעים (client/src/games/floorsSprites.ts). האימוג'י — לטקסט בלבד (פיד/רשימות). */
  CHARS: ["🟣", "🟠", "🔵", "🔴", "🟡", "🌸", "🟢", "💎"],
  CHAR_NAMES: ["הסגול", "הכתום", "הכחול", "האדום", "הצהוב", "הוורוד", "הירוק", "הטורקיז"],
  CHAR_COLORS: ["#9B4DFF", "#FF8A2B", "#2F7BFF", "#FF3B3B", "#FFD21F", "#FF5FB0", "#5FD44A", "#2EDCE6"],
} as const;

/** סולם הקריאות — לפי סך הקומות בקומבו (הספים המקוריים) */
export const FL_SHOUTS: [number, string][] = [
  [200, "אין מצב!"], [140, "אגדי!"], [100, "פנטסטי!"], [70, "קיצוני!"], [50, "מדהים!"],
  [35, "וואו!"], [25, "סופר!"], [15, "ענק!"], [7, "מתוק!"], [4, "יפה!"],
];
export const flShout = (floors: number): string | null => { for (const [n, s] of FL_SHOUTS) if (floors >= n) return s; return null; };

/* ---------- RNG (FNV-1a → mulberry32, כמו בתהום) ---------- */
export function flRng(seed: string): () => number {
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

/* ---------- המגדל ---------- */
export interface FlFloor { i: number; x0: number; x1: number; full: boolean }

/** רוחב מקסימלי באריחים לפי מספר הקומה — ההצרה המקורית, מכוילת ל-22 אריחים */
function maxTiles(i: number): number {
  if (i >= 2000) return 3;
  if (i >= 1000) return 4;
  if (i >= 200) return 5;
  return Math.max(5, 10 - Math.floor(i / 40));
}
const minTiles = (i: number) => (i >= 2000 ? 3 : i >= 1000 ? 4 : 5);

/** קומה i של המגדל — גישה אקראית, דטרמיניסטית מהזרע (כל טלפון מחשב את אותה קומה) */
export function flFloor(seed: string, i: number): FlFloor {
  const full = i === 0 || (i % 50 === 0);
  if (full) return { i, x0: FL.TILE0 * FL.TILE, x1: (FL.TILE0 + FL.TILES) * FL.TILE, full: true };
  const r = flRng(`${seed}:${i}`);
  const lo = minTiles(i), hi = maxTiles(i);
  const len = lo + Math.floor(r() * (hi - lo + 1));
  const start = FL.TILE0 + Math.floor(r() * (FL.TILES - len - 1));
  return { i, x0: start * FL.TILE, x1: (start + len + 1) * FL.TILE, full: false };
}
export const flFloorY = (i: number) => i * FL.FLOOR_H;
/** הקומה הראשונה שגובהה ≥ y */
export const flFloorAt = (y: number) => Math.max(0, Math.ceil(y / FL.FLOOR_H));

/* ---------- מודים (מה הקלפים משנים) ---------- */
export interface FlMods {
  speed: number;      // מכפיל VMAX
  accel: number;      // מכפיל ACC
  jump: number;       // מכפיל גובה הקפיצה (על dy ההתחלתי)
  grav: number;       // מכפיל כוח המשיכה
  wallKeep: number;   // כמה מהמהירות הקיר מחזיר
  turn: number;       // מקדם הפנייה (0.7 מקורי, 1 = בלי אובדן)
  comboTicks: number; // אורך טיימר הקומבו
  extraJumps: number; // קפיצות נוספות באוויר
  edge: number;       // px נוספים מעבר לקצה שעדיין נוחתים
  glide: number;      // מכפיל נפילה כשמחזיקים (1 = אין)
  lowBar: boolean;    // קפיצת קומה אחת לא שוברת קומבו
  slipstream: number; // תוספת מהירות כשיש מישהו מעליך
  comboMul: number;   // מכפיל בונוס הקומבו
  hammer: boolean; snowball: boolean; banana: boolean; shield: boolean; propeller: boolean;
  hunter: boolean; underdog: boolean; coyote: number; buffer: number;
}
export const flBaseMods = (): FlMods => ({
  speed: 1, accel: 1, jump: 1, grav: 1, wallKeep: FL.WALL_KEEP, turn: FL.TURN, comboTicks: FL.COMBO_TICKS,
  extraJumps: 0, edge: 5 /* 5.9: נוחתים גם קצת מעבר לקצה — עזרה לילדים */, glide: 1, lowBar: false, slipstream: 0, comboMul: 1,
  hammer: false, snowball: false, banana: false, shield: false, propeller: false,
  hunter: false, underdog: false, coyote: 6, buffer: 8, // 5.9: סלחני יותר לילדים (היה 4/5)
});

/* ---------- הקלפים ---------- */
export type FlRarity = "c" | "u" | "r" | "chaos" | "cursed" | "fun" | "evo";
export type FlKind = "passive" | "button" | "instant";
export interface FlCard {
  id: string; ic: string; t: string; d: string;
  cat: string; rarity: FlRarity; kind: FlKind;
  stack?: boolean;                 // אפשר לקחת שוב
  pos?: "low" | "high";            // שיעור לפי מיקום
  cd?: number;                     // קולדאון לכפתור (ms)
  apply: (m: FlMods, n: number) => void;  // n = כמה עותקים
}
export const FL_CARDS: FlCard[] = [
  { id: "sprint", ic: "🏃", t: "ספרינטר", d: "רץ 10% מהר יותר. נערם.", cat: "A", rarity: "c", kind: "passive", stack: true, apply: (m, n) => { m.speed *= 1 + 0.1 * n; } },
  { id: "hijump", ic: "⬆️", t: "קפיצה גבוהה", d: "קופץ 12% גבוה יותר. נערם.", cat: "B", rarity: "c", kind: "passive", stack: true, apply: (m, n) => { m.jump *= 1 + 0.12 * n; } },
  { id: "dbljump", ic: "🐇", t: "קפיצה כפולה", d: "טאפ באוויר = קפיצה נוספת", cat: "B", rarity: "u", kind: "passive", stack: true, apply: (m, n) => { m.extraJumps += n; } },
  { id: "turn", ic: "↩️", t: "פנייה חדה", d: "היפוך כיוון בלי לאבד מהירות", cat: "A", rarity: "c", kind: "passive", apply: (m) => { m.turn = 1; } },
  { id: "wallmag", ic: "🧲", t: "מגנט קיר", d: "הקיר מחזיר 100% ועוד קצת", cat: "A", rarity: "u", kind: "passive", apply: (m) => { m.wallKeep = 1.05; } },
  { id: "feather", ic: "🪶", t: "משקל נוצה", d: "כבידה נמוכה: קפיצות ארוכות יותר", cat: "A", rarity: "u", kind: "passive", apply: (m) => { m.grav *= 0.85; } },
  { id: "slip", ic: "🌬️", t: "סליפסטרים", d: "20% מהר יותר כשמישהו מעליך", cat: "A", rarity: "c", kind: "passive", apply: (m) => { m.slipstream = 0.2; } },
  { id: "fuse", ic: "🕯️", t: "פתיל ארוך", d: "טיימר הקומבו 3 שנ' במקום 2", cat: "G", rarity: "c", kind: "passive", apply: (m) => { m.comboTicks = 150; } },
  { id: "lowbar", ic: "🪜", t: "רף נמוך", d: "קפיצת קומה אחת לא שוברת קומבו", cat: "G", rarity: "c", kind: "passive", apply: (m) => { m.lowBar = true; } },
  { id: "greed", ic: "💰", t: "חמדנות", d: "קומבו שווה ×1.5, טיימר 1.5 שנ'", cat: "G", rarity: "r", kind: "passive", apply: (m) => { m.comboMul = 1.5; m.comboTicks = 75; } },
  { id: "wide", ic: "🦶", t: "רגליים רחבות", d: "נוחת גם קצת מעבר לקצה", cat: "A", rarity: "c", kind: "passive", apply: (m) => { m.edge = 14; } },
  { id: "glide", ic: "🪂", t: "גלישה", d: "החזק טאפ בשיא = נפילה איטית", cat: "B", rarity: "c", kind: "passive", apply: (m) => { m.glide = 0.4; } },
  { id: "hammer", ic: "🔨", t: "פטיש", d: "נגיעה מהצד מפילה שחקן קומה", cat: "C", rarity: "u", kind: "passive", apply: (m) => { m.hammer = true; } },
  { id: "snow", ic: "❄️", t: "כדור שלג", d: "כפתור: קליע לכיוון הריצה, מאט", cat: "D", rarity: "c", kind: "button", cd: 4000, apply: (m) => { m.snowball = true; } },
  { id: "banana", ic: "🍌", t: "בננה", d: "הקומה שעזבת חלקלקה 8 שנ'", cat: "E", rarity: "c", kind: "passive", apply: (m) => { m.banana = true; } },
  { id: "shield", ic: "🛡️", t: "בועת מגן", d: "סופג פגיעה אחת. נטען כל 20 שנ'", cat: "F", rarity: "c", kind: "passive", apply: (m) => { m.shield = true; } },
  { id: "life", ic: "❤️", t: "לב נוסף", d: "+1 חיים (עד 7)", cat: "F", rarity: "u", kind: "instant", stack: true, pos: "low", apply: () => {} },
  { id: "prop", ic: "🚁", t: "כובע מדחף", d: "נפלת? פעם אחת טסים 6 קומות למעלה", cat: "B", rarity: "u", kind: "instant", pos: "low", apply: (m) => { m.propeller = true; } },
  { id: "hunter", ic: "🎯", t: "צייד ראשים", d: "+50 להפלה. ×3 על המוביל", cat: "G", rarity: "u", kind: "passive", apply: (m) => { m.hunter = true; } },
  { id: "underdog", ic: "🐕", t: "אנדרדוג", d: "בשליש התחתון ניקוד ×1.5", cat: "G", rarity: "c", kind: "passive", pos: "low", apply: (m) => { m.underdog = true; } },
];
export const flCard = (id: string) => FL_CARDS.find((c) => c.id === id);
export function flMods(ids: string[]): FlMods {
  const m = flBaseMods();
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, n] of counts) flCard(id)?.apply(m, n);
  return m;
}
export const FL_RARITY_W: Record<FlRarity, number> = { c: 10, u: 5, r: 2, chaos: 2, cursed: 2, fun: 2, evo: 100 };

/* ---------- קונפיג וציר הזמן ---------- */
export interface FlTiming {
  cycles: number;        // כמה דקות (עם עצירה אחרי כל אחת)
  runMs: number;         // 60,000
  freezeMs: number;      // 3,000 — "עצירה!"
  draftMs: number;       // 10,000
  revealMs: number;      // 2,000
  sprintMs: number;      // 30,000
  introMs: number;       // ספירה לאחור
  pickMs: number;        // בחירת דמות
}
export interface FlConfig extends FlTiming { seed?: string }
function num(v: unknown, def: number, min: number, max = Infinity): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
export function flConfig(raw: unknown): FlConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const minutes = num(r.minutes, 8, 1, 12);
  return {
    cycles: num(r.cycles, minutes >= 8 ? 6 : 4, 1, 12),
    runMs: num(r.runMs, 60000, 1500),
    freezeMs: num(r.freezeMs, 3000, 200),
    draftMs: num(r.draftMs, 10000, 500),
    revealMs: num(r.revealMs, 2000, 200),
    sprintMs: num(r.sprintMs, 30000, 500),
    introMs: num(r.introMs, 3200, 300),
    pickMs: num(r.pickMs, 15000, 300),
    seed: typeof r.seed === "string" ? r.seed : undefined,
  };
}
export const flPauseMs = (c: FlTiming) => c.freezeMs + c.draftMs + c.revealMs;
export const flCycleMs = (c: FlTiming) => c.runMs + flPauseMs(c);
/** תחילת דקה k (0-based) יחסית ל-startAt; הספרינט = k === cycles */
export const flRunStart = (c: FlTiming, startAt: number, k: number) => startAt + k * flCycleMs(c);
export const flRunEnd = (c: FlTiming, startAt: number, k: number) => flRunStart(c, startAt, k) + (k >= c.cycles ? c.sprintMs : c.runMs);
export const flGameEnd = (c: FlTiming, startAt: number) => flRunEnd(c, startAt, c.cycles);

/** מהירות עליית קו המוות (px לשנייה) — "כל דקה היא Icy Tower קטן": 3 רמות של 20 שנ' */
export function flKillRate(c: FlTiming, k: number, tInRun: number): { rate: number; level: number } {
  if (k >= c.cycles) return { rate: 90, level: 4 };
  const level = Math.min(3, 1 + Math.floor(tInRun / (c.runMs / 3)));
  return { rate: [0, 20, 40, 60][level], level };
}

/* ---------- הסימולציה ---------- */
export interface FlSim {
  x: number; y: number; dx: number; dy: number;
  st: 0 | 1 | 2;             // 0 עומד · 1 עולה · 2 יורד/באוויר
  floor: number;             // הקומה האחרונה שנחת עליה
  maxFloor: number;
  face: 1 | -1;
  spin: boolean;
  combo: number;             // סך קומות בקומבו הנוכחי
  comboJumps: number;
  comboTicks: number;        // 0 = אין קומבו פעיל
  comboBonus: number;        // בונוס שנצבר (n² × מכפיל)
  jumpsLeft: number;         // קפיצות אוויריות שנותרו
  coyote: number;            // טיקים שנותרו לקפיצה אחרי קצה
  buffer: number;            // טיקים שנותרה בקשת קפיצה ממתינה
  slowUntil: number;         // טיק — האטה מכדור שלג
  tick: number;
  alive: boolean;
  wallHit?: boolean;
}
export const flNewSim = (x = FL.W / 2): FlSim => ({
  x, y: 0, dx: 0.001, dy: 0, st: 0, floor: 0, maxFloor: 0, face: 1, spin: false,
  combo: 0, comboJumps: 0, comboTicks: 0, comboBonus: 0, jumpsLeft: 0, coyote: 0, buffer: 0, slowUntil: 0, tick: 0, alive: true,
});
/** dir ∈ [-1,1] אנלוגי (גודל = מהירות מקסימלית יחסית, 5.9); jump = לחיצה; hold = מחזיקים קפיצה (גלישה); jumpHold = מחזיקים את אזור הקפיצה → קפיצה אוטומטית בכל נחיתה */
export interface FlInput { dir: number; jump: boolean; hold: boolean; jumpHold?: boolean }
export interface FlEvents {
  jump?(v: number, air: boolean): void;
  land?(floor: number, gained: number): void;
  wall?(v: number): void;
  comboEnd?(floors: number, bonus: number): void;
  comboBreak?(): void;
}
/** קומה "חלקה" (בננה) — הלקוח מספק */
export type FlSlippery = (floor: number) => boolean;

/** טיק אחד של הפיזיקה — הפורט של physics.c, עם ווים לקלפים */
export function flStep(s: FlSim, inp: FlInput, m: FlMods, seed: string, ev?: FlEvents, slippery?: FlSlippery, someoneAbove = false): void {
  s.tick++;
  const air = s.st !== 0;
  const slow = s.tick < s.slowUntil ? 0.5 : 1;
  const vmax = FL.VMAX * m.speed * (someoneAbove ? 1 + m.slipstream : 1) * slow;
  const acc = FL.ACC * m.accel * slow;
  const onSlip = !air && slippery?.(s.floor);
  const fr = onSlip ? 0.985 : FL.FRICTION;
  // מקשים (לפני החיתוך — כמו במקור). 5.9: הקלט אנלוגי — גודל ה-dir קובע תקרת מהירות (אגודל קטן = הליכה, מלא = ריצה)
  const mag = Math.min(1, Math.abs(inp.dir));
  const d = mag < 0.15 ? 0 : Math.sign(inp.dir);
  if (d < 0) { if (s.dx > 0) s.dx *= m.turn; s.dx -= acc * (onSlip ? 0.5 : 1); s.face = -1; }
  else if (d > 0) { if (s.dx < 0) s.dx *= m.turn; s.dx += acc * (onSlip ? 0.5 : 1); s.face = 1; }
  else s.dx *= fr;
  const cap = d === 0 || mag >= 0.97 ? vmax : vmax * Math.max(0.4, mag);
  if (s.dx > cap) s.dx = Math.max(cap, s.dx * 0.9); if (s.dx < -cap) s.dx = Math.min(-cap, s.dx * 0.9);
  if (s.dx > vmax) s.dx = vmax; if (s.dx < -vmax) s.dx = -vmax;
  s.x += s.dx;
  // קירות
  if (s.x > FL.WALL_R) { s.x = FL.WALL_R; s.dx *= -m.wallKeep; ev?.wall?.(Math.abs(s.dx)); if (s.comboTicks > 0) s.wallHit = true; }
  if (s.x < FL.WALL_L) { s.x = FL.WALL_L; s.dx *= -m.wallKeep; ev?.wall?.(Math.abs(s.dx)); if (s.comboTicks > 0) s.wallHit = true; }
  // קפיצה
  if (inp.jump || (inp.jumpHold && s.st === 0)) s.buffer = m.buffer; // החזקה = קפיצה אוטומטית בנחיתה (כמו להחזיק רווח במקור)
  if (s.buffer > 0) {
    const canGround = s.st === 0 || s.coyote > 0;
    if (canGround) {
      const v = Math.max(FL.JUMP_MIN, FL.JUMP_K * Math.abs(s.dx)) * m.jump;
      s.dy = v; s.st = 1; s.buffer = 0; s.coyote = 0; s.jumpsLeft = m.extraJumps;
      s.spin = Math.abs(s.dx) > FL.SPIN_V;
      ev?.jump?.(v, false);
    } else if (s.jumpsLeft > 0 && !inp.hold) {
      s.jumpsLeft--; s.buffer = 0;
      s.dy = Math.max(FL.JUMP_MIN, FL.JUMP_K * Math.abs(s.dx) * 0.8) * m.jump; s.st = 1;
      ev?.jump?.(s.dy, true);
    }
  }
  if (s.buffer > 0) s.buffer--;
  if (s.coyote > 0) s.coyote--;
  // אנכי
  const py = s.y;
  s.y += s.dy;
  if (s.st !== 0) {
    let g = FL.GRAV * m.grav;
    if (s.dy < 0 && inp.hold && m.glide < 1) g *= m.glide;
    s.dy -= g;
    if (s.dy < 0 && s.st === 1) s.st = 2;
    if (s.dy < -FL.VFALL) s.dy = -FL.VFALL;
  }
  // נחיתה — רק כשיורדים; בדיקת segment של שתי הפינות מול קו הקומה
  if (s.st === 2) {
    const lo = flFloorAt(Math.min(py, s.y) - 1), hi = flFloorAt(Math.max(py, s.y) + 1);
    let landed = -1;
    for (let i = hi; i >= lo; i--) {
      const fy = flFloorY(i);
      if (!(py >= fy && s.y <= fy)) continue;
      const f = flFloor(seed, i);
      const l = s.x - FL.BODY_HW, r = s.x + FL.BODY_HW;
      if (r >= f.x0 - 2 - m.edge && l <= f.x1 + 1 + m.edge) { landed = i; break; }
    }
    if (landed >= 0) {
      s.y = flFloorY(landed); s.dy = 0; s.spin = false; s.st = 0; s.jumpsLeft = m.extraJumps;
      land(s, landed, landed - s.floor, m, ev);
    }
  }
  if (s.st === 0) {
    // עומד: אם אין קומה מתחת (קצה) — נופל
    const f = flFloor(seed, s.floor);
    if (s.x + FL.BODY_HW < f.x0 - 2 - m.edge || s.x - FL.BODY_HW > f.x1 + 1 + m.edge) { s.st = 2; s.coyote = m.coyote; s.dy = 0; }
  }
  // קומבו — הטיימר
  if (s.comboTicks > 0) {
    s.comboTicks--;
    if (s.comboTicks === 0) endCombo(s, m, ev);
  }
}
function land(s: FlSim, floor: number, gained: number, m: FlMods, ev?: FlEvents) {
  if (gained >= 2) {
    if (s.comboTicks > 0) { s.combo += gained; s.comboJumps++; } else { s.combo = gained; s.comboJumps = 1; }
    if (s.wallHit) { s.wallHit = false; }
    s.comboTicks = m.comboTicks;
  } else if (gained !== 0 && s.comboTicks > 0) {
    if (!(m.lowBar && gained === 1)) { s.comboTicks = 1; ev?.comboBreak?.(); }
  }
  s.floor = floor;
  if (floor > s.maxFloor) s.maxFloor = floor;
  ev?.land?.(floor, gained);
}
function endCombo(s: FlSim, m: FlMods, ev?: FlEvents) {
  if (s.comboJumps > 1) {
    const bonus = Math.round(s.combo * s.combo * m.comboMul);
    s.comboBonus += bonus;
    ev?.comboEnd?.(s.combo, bonus);
  }
  s.combo = 0; s.comboJumps = 0;
}
/** שבירת קומבו מבחוץ (פגיעה, נפילה) */
export function flBreakCombo(s: FlSim, m: FlMods, ev?: FlEvents) {
  if (s.comboTicks > 0) { s.comboTicks = 0; endCombo(s, m, ev); ev?.comboBreak?.(); }
}
/** הצבה על קומה (תחייה, מדחף) */
export function flPlace(s: FlSim, seed: string, floor: number) {
  const f = flFloor(seed, floor);
  s.x = (f.x0 + f.x1) / 2; s.y = flFloorY(floor); s.dx = 0.001; s.dy = 0; s.st = 0; s.floor = floor;
  s.combo = 0; s.comboJumps = 0; s.comboTicks = 0; s.spin = false; s.jumpsLeft = 0; s.coyote = 0; s.buffer = 0;
  if (floor > s.maxFloor) s.maxFloor = floor;
}
/** ניקוד: 10 × הקומה הגבוהה + בונוסי קומבו + בונוסים */
export const flScore = (maxFloor: number, comboBonus: number, extra = 0) => maxFloor * 10 + comboBonus + extra;

/* ---------- קליעים ומלכודות (מה שהלקוחות משדרים ומסמלצים יחד) ---------- */
export interface FlShot { id: number; by: string; x: number; y: number; dx: number; born: number; kind: "snow" }
export interface FlTrap { id: number; by: string; floor: number; kind: "banana"; until: number }

/* ---------- בוט (פלייטסט ובדיקות) — מסתכל קדימה: קופץ רק כשהסימולציה מראה נחיתה טובה ---------- */
export interface FlBot { dir: 1 | -1; skill: number; noJumpTicks: number; lastFlip: number }
export const flNewBot = (skill = 0.8): FlBot => ({ dir: Math.random() < 0.5 ? 1 : -1, skill, noJumpTicks: 0, lastFlip: 0 });
/** מדמה קפיצה עכשיו עם הכיוון הנוכחי ומחזיר על איזו קומה ננחת (או -1) */
export function flPredictLanding(s: FlSim, m: FlMods, seed: string, dir: number, maxTicks = 90): number {
  const c: FlSim = { ...s };
  const inp: FlInput = { dir, jump: true, hold: false };
  for (let i = 0; i < maxTicks; i++) {
    flStep(c, inp, m, seed, undefined, undefined, false);
    inp.jump = false;
    if (c.st === 0) return c.floor;
    if (c.y < s.y - 3 * FL.FLOOR_H) return -1;
  }
  return -1;
}
export function flBotInput(s: FlSim, m: FlMods, seed: string, b: FlBot, killY: number): FlInput {
  const inp: FlInput = { dir: b.dir, jump: false, hold: false };
  if (s.st !== 0) return inp;
  const pressed = s.y - killY < 2.5 * FL.FLOOR_H;
  const need = pressed ? 1 : Math.random() < b.skill ? 2 : 1;
  const land = flPredictLanding(s, m, seed, b.dir);
  if (land >= s.floor + need && (Math.abs(s.dx) > 6 || pressed || land >= s.floor + 2)) { inp.jump = true; b.noJumpTicks = 0; return inp; }
  b.noJumpTicks++;
  // תקוע: רץ הרבה בלי קפיצה טובה — מתהפך (או נופל מהקצה: קופץ קומה אחת)
  const f = flFloor(seed, s.floor);
  const nearEdge = b.dir > 0 ? s.x + FL.BODY_HW > f.x1 - 8 : s.x - FL.BODY_HW < f.x0 + 8;
  if (nearEdge && !f.full) { if (land >= s.floor + 1) { inp.jump = true; b.noJumpTicks = 0; return inp; } b.dir = (b.dir * -1) as 1 | -1; inp.dir = b.dir; }
  else if (b.noJumpTicks > 60 && s.tick - b.lastFlip > 40) { b.dir = (b.dir * -1) as 1 | -1; b.lastFlip = s.tick; b.noJumpTicks = 0; inp.dir = b.dir; }
  // בוט פחות מיומן טועה לפעמים
  if (Math.random() < (1 - b.skill) * 0.01) inp.jump = true;
  return inp;
}

/* ---------- הודעות הרשת (חיות כאן ולא ב-protocol.ts — כדי ששני צ'אטים לא יתנגשו על אותו קובץ; protocol.ts מחזיק רק את הקטלוג) ---------- */
export interface FlCardWire { id: string; ic: string; t: string; d: string; r: string; k: string }
/** [pid, x, y, dx, st, floor, combo] */
export type FlPosWire = [string, number, number, number, number, number, number];
export type FlTimingWire = { cycles: number; runMs: number; freezeMs: number; draftMs: number; revealMs: number; sprintMs: number; introMs: number; pickMs: number };

export type FloorsClientMsg =
  | { a: "fl_char"; c: number }                                              // בחירת דמות
  | { a: "fl_state"; x: number; y: number; dx: number; st: number; fl: number; mf: number; cb: number; c: number } // 10Hz
  | { a: "fl_combo"; n: number; bonus: number }                              // קומבו נסגר
  | { a: "fl_fell" }                                                         // נפלתי מתחת לקו
  | { a: "fl_prop" }                                                         // השתמשתי במדחף במקום ליפול
  | { a: "fl_hit"; target: string; kind: "hammer" }                          // פגעתי במגע (התוקף מדווח)
  | { a: "fl_shot"; x: number; y: number; dx: number }                       // יריתי
  | { a: "fl_hitme"; shot: number }                                          // קליע פגע בי (הנפגע מדווח)
  | { a: "fl_trap"; floor: number }                                          // השארתי בננה
  | { a: "fl_pick"; card: string };                                          // דראפט

export type FloorsServerMsg =
  | { a: "fl_pickphase"; taken: Record<string, number>; until: number }
  | { a: "fl_go"; seed: string; startAt: number; cfg: FlTimingWire; chars: Record<string, number>; lives: Record<string, number> }
  | { a: "fl_pos"; ps: FlPosWire[]; kill: number; lvl: number; k: number }   // 10Hz
  | { a: "fl_freeze"; k: number; rank: string[]; scores: Record<string, number> }  // cue בסוף הדקה
  | { a: "fl_draft"; k: number; cards: FlCardWire[]; until: number }         // אישי
  | { a: "fl_took"; pid: string; card: FlCardWire }
  | { a: "fl_reveal"; k: number; picks: Record<string, FlCardWire | null>; resumeAt: number } // cue
  | { a: "fl_fell"; pid: string; lives: number; respawnAt: number; floor: number }
  | { a: "fl_out"; pid: string }
  | { a: "fl_hit"; by: string; target: string; kind: "hammer"; dir: number }
  | { a: "fl_shot"; id: number; by: string; x: number; y: number; dx: number; at: number }
  | { a: "fl_shothit"; id: number; pid: string; by: string; shielded: boolean }
  | { a: "fl_trap"; id: number; by: string; floor: number; until: number }
  | { a: "fl_shout"; pid: string; n: number; bonus: number; text: string }
  | { a: "fl_bonus"; pid: string; kind: "hunter" | "underdog"; amount: number }
  | { a: "fl_over"; rows: { pid: string; score: number; maxFloor: number; bestCombo: number; kills: number; falls: number; c: number; cards: string[] }[]; titles: { pid: string; ic: string; t: string }[] }
  | { a: "fl_sync"; phase: string; seed: string; startAt: number; cfg: FlTimingWire; chars: Record<string, number>; lives: Record<string, number>; cards: Record<string, string[]>; k: number; you: { floor: number; out: boolean } };
