/**
 * מטרונובול 🎾 — הליבה המשותפת (לקוח ↔ שרת).
 *
 * כל טלפון הוא מטרונום שנראה כמו כדור קופץ: הכדור נוחת בכל פעימה, והנחיתה היא הצליל.
 * אחד קובע קצב (רמה 1–50, בלי שהאחרים רואים את המספר) — כולם מקישים בקצב ששומעים,
 * הכדור של כל אחד קופץ בקצב ההקשות שלו (טאפ-טמפו), והמטרה: שכל הכדורים על המסך ינחתו יחד.
 *
 * הזמנים כאן הם זמן-שרת במילישניות. מודל ההקשות (`mbFeedTap`) רץ גם בלקוח (תגובה מיידית)
 * וגם בשרת (סמכותי לניקוד) — אותה פונקציה, אותו כדור בכל הטלפונים.
 */

export const MB = {
  LEVELS: 50,
  /** רמה → BPM: רמה 1 = 51 (איטי וגבוה), רמה 50 = 198 (רפרוף נמוך) */
  BPM_BASE: 48, BPM_STEP: 3,
  BPM_MIN: 40, BPM_MAX: 240,
  PICK_MS: 8000,
  SET_MS: 10000,       // זמן הכיוון של הקובע
  COUNT_MS: 3000,      // 3-2-1 לפני ההשוואה
  MATCH_MS: 30000,     // ההשוואה
  RESULT_MS: 6000,     // טבלת הסבב
  END_MS: 7000,
  SLEEP_MS: 2500,      // בלי הקשה — הכדור נרדם על הרצפה
  TAP_RESET_MS: 2500,  // הפסקה ארוכה = מתחילים למדוד מחדש
  MAX_TAPS: 4,         // כמה הקשות אחרונות קובעות את הקצב (3 מרווחים)
  BEAT_EVAL_DELAY: 260, // כמה אחרי הפעימה השרת שופט אותה (מקום להקשה מאוחרת-מעט להגיע)
  /** שיפוט פעימה: הפער בין הנחיתה שלך לנחיתת המנהיג */
  PERFECT_MS: 40, GOOD_MS: 90, OK_MS: 150,
  TEMPO_TOL: 0.08,     // קצב רחוק מזה = הפעימה לא נספרת
  LOCK_TOL: 0.04,      // נעילה דורשת קצב קרוב מזה…
  LOCK_BEATS: 4,       // …במשך 4 פעימות טובות ברצף
  ACC_MAX: 500, SPEED_MAX: 500, SPEED_WINDOW_MS: 25000,
  UNISON_BONUS: 100, LEADER_PER_LOCK: 20,
  CHAR_NAMES: ["הסגול", "הכתום", "הכחול", "האדום", "הצהוב", "הוורוד", "הירוק", "הטורקיז"],
  CHAR_COLORS: ["#9B4DFF", "#FF8A2B", "#2F7BFF", "#FF3B3B", "#FFD21F", "#FF5FB0", "#5FD44A", "#2EDCE6"],
  CHAR_HUES: [270, 25, 220, 0, 48, 325, 110, 185],
} as const;

export const mbBpm = (level: number) => MB.BPM_BASE + MB.BPM_STEP * Math.max(1, Math.min(MB.LEVELS, Math.round(level)));
export const mbPeriod = (bpm: number) => 60000 / Math.max(MB.BPM_MIN, Math.min(MB.BPM_MAX, bpm));
export const mbLevelOf = (bpm: number) => Math.max(1, Math.min(MB.LEVELS, Math.round((bpm - MB.BPM_BASE) / MB.BPM_STEP)));

/* ---------- רצפות = צלילים ---------- */
/** פיזיקת הרצפה (אופציה של המארח): h = מכפיל גובה · sq = מכפיל מעיכה · sink = כמה הכדור שוקע בנחיתה (יחסית לרדיוס) · wob = נדנוד צדדי באוויר · hang = "ריחוף" בשיא (0..1) */
export interface MbPhys { h: number; sq: number; sink: number; wob: number; hang: number; hint: string }
export interface MbFloor { id: string; ic: string; name: string; sfx: string; tint: string; phys: MbPhys }
export const MB_FLOORS: MbFloor[] = [
  { id: "parquet", ic: "🪵", name: "פרקט", sfx: "wood", tint: "#B8783A", phys: { h: 1, sq: 1, sink: 0, wob: 0, hang: 0, hint: "רגיל" } },
  { id: "ceramic", ic: "🧱", name: "קרמיקה", sfx: "tile", tint: "#DDE9F0", phys: { h: 0.85, sq: 0.45, sink: 0, wob: 0, hang: 0, hint: "קשיח — קפיצה נמוכה וחדה" } },
  { id: "rubber", ic: "⬛", name: "גומי", sfx: "rubber", tint: "#3A3A44", phys: { h: 1.1, sq: 1.7, sink: 0.12, wob: 0, hang: 0, hint: "נמעך עמוק וקופץ" } },
  { id: "drum", ic: "🥁", name: "תוף", sfx: "drum", tint: "#F0E6D0", phys: { h: 1.35, sq: 1.3, sink: 0.2, wob: 0, hang: 0, hint: "טרמפולינה — הכי גבוה" } },
  { id: "water", ic: "💧", name: "מים", sfx: "water", tint: "#2FB7D8", phys: { h: 0.9, sq: 0.8, sink: 0.55, wob: 0.06, hang: 0, hint: "שוקע במים ויוצא" } },
  { id: "space", ic: "🤖", name: "חללית", sfx: "beep", tint: "#4A5566", phys: { h: 1.25, sq: 0.7, sink: 0, wob: 0.1, hang: 0.55, hint: "כבידה נמוכה — מרחף בשיא" } },
  { id: "bubble", ic: "🫧", name: "בועות", sfx: "pop", tint: "#F4B8D2", phys: { h: 0.8, sq: 1.4, sink: 0.25, wob: 0.04, hang: 0, hint: "רך ומתפוצץ" } },
  { id: "grass", ic: "🌿", name: "דשא", sfx: "thump", tint: "#4FB84A", phys: { h: 0.75, sq: 1.1, sink: 0.08, wob: 0, hang: 0, hint: "רך ונמוך" } },
];
export const MB_PHYS_OFF: MbPhys = { h: 1, sq: 1, sink: 0, wob: 0, hang: 0, hint: "" };
export const mbFloor = (id: string) => MB_FLOORS.find((f) => f.id === id) ?? MB_FLOORS[0];

/* ---------- מודל טאפ-טמפו (משותף) ---------- */
export interface MbBall {
  /** 0 = הכדור לא קופץ (ישן / עוד לא התחיל) */
  bpm: number;
  /** זמן-שרת של הנחיתה האחרונה (ההקשה האחרונה) — הפעימות הבאות: anchor + n·T */
  anchor: number;
  taps: number[];
}
export const mbNewBall = (): MbBall => ({ bpm: 0, anchor: 0, taps: [] });

/** הקשה בזמן t (זמן-שרת). מחזיר את המצב החדש. עמיד לרעש: המרווח האחרון שוקל 50%, הקודם 30%, שלפניו 20%. */
export function mbFeedTap(b: MbBall, t: number): MbBall {
  let taps = b.taps;
  const last = taps[taps.length - 1];
  if (last !== undefined && (t - last > MB.TAP_RESET_MS || t <= last)) taps = [];
  taps = [...taps, t].slice(-MB.MAX_TAPS);
  if (taps.length < 2) return { bpm: 0, anchor: t, taps };
  const iv: number[] = [];
  for (let i = 1; i < taps.length; i++) iv.push(taps[i] - taps[i - 1]);
  // דילוג על פעימה (הפסקה בדפוס "הפסקה") = מרווח כפול — מחלקים אותו כדי שהקצב לא יקפוץ
  const ref = Math.min(...iv);
  for (let i = 0; i < iv.length; i++) if (iv[i] > ref * 1.7 && iv[i] < ref * 2.5) iv[i] /= 2;
  const W = iv.length === 1 ? [1] : iv.length === 2 ? [0.35, 0.65] : [0.2, 0.3, 0.5];
  let sum = 0; for (let i = 0; i < iv.length; i++) sum += iv[i] * W[i];
  const bpm = Math.max(MB.BPM_MIN, Math.min(MB.BPM_MAX, 60000 / sum));
  return { bpm, anchor: t, taps };
}
export const mbAsleep = (b: MbBall, now: number) => b.bpm <= 0 || now - b.anchor > MB.SLEEP_MS;

/** פאזת הקפיצה בזמן now: 0 = נחיתה, 0.5 = שיא. מחזיר גם את מספר הפעימה (לצליל) */
export function mbPhase(bpm: number, anchor: number, now: number): { phi: number; n: number } {
  const T = mbPeriod(bpm);
  const dt = now - anchor;
  const n = Math.floor(dt / T);
  return { phi: dt / T - n, n };
}
/** גובה הקפיצה (יחסי, 0..1): פיזיקלי — h ∝ T² — עם דחיסה כדי שגם 198 BPM יראה קופץ */
export function mbHeight(bpm: number): number {
  const T = mbPeriod(bpm) / 1000;
  const raw = T * T / (1.2 * 1.2); // 1 בדיוק ב-50 BPM
  return 0.16 + 0.84 * Math.min(1, Math.pow(raw, 0.62));
}

/* ---------- דפוסי קצב (אופציה של המארח) ---------- */
export type MbPattern = "plain" | "rest" | "accel" | "switch";
export interface MbPatternInfo { id: MbPattern; ic: string; name: string; desc: string }
export const MB_PATTERNS: MbPatternInfo[] = [
  { id: "plain", ic: "🔁", name: "רגיל", desc: "קצב אחד קבוע" },
  { id: "rest", ic: "✋", name: "הפסקה", desc: "כל פעימה רביעית — שקט! הכדור מרחף" },
  { id: "accel", ic: "🚀", name: "מאיץ", desc: "הקצב עולה לאט לאורך הסבב" },
  { id: "switch", ic: "🔀", name: "מתחלף", desc: "באמצע הסבב הקצב קופץ לקצב אחר" },
];
export const mbPattern = (id: string) => MB_PATTERNS.find((p) => p.id === id) ?? MB_PATTERNS[0];
export const MB_ACCEL = 1.25;        // מאיץ: עד ×1.25 בסוף הסבב
export const MB_REST_EVERY = 4;      // הפסקה: כל פעימה רביעית
export const MB_SWITCH_AT = 0.5;     // מתחלף: באמצע הסבב

/** לוח הנחיתות של המנהיג — הכול נגזר מכאן (ציור, סאונד, ניקוד). anchor = הנחיתה הראשונה (startAt), until = סוף הסבב */
export interface MbSched { pattern: MbPattern; bpm: number; bpm2: number; anchor: number; until: number }
export const mbPlainSched = (bpm: number, anchor: number): MbSched => ({ pattern: "plain", bpm, bpm2: bpm, anchor, until: 0 });
/** ה-BPM של המנהיג ברגע t לפי הדפוס */
export function mbBpmAt(s: MbSched, t: number): number {
  const dur = s.until > s.anchor ? s.until - s.anchor : MB.MATCH_MS;
  const f = Math.max(0, Math.min(1, (t - s.anchor) / dur));
  if (s.pattern === "accel") return s.bpm * (1 + (MB_ACCEL - 1) * f);
  if (s.pattern === "switch") return f >= MB_SWITCH_AT ? s.bpm2 : s.bpm;
  return s.bpm;
}
const schedCache = new Map<string, number[]>();
/** כל הנחיתות מ-anchor עד tEnd (כולל נחיתות "לפני" ה-anchor — מ-anchor אחורה, לספירה לאחור ולכיוון) */
export function mbLandings(s: MbSched, tEnd: number): number[] {
  const key = `${s.pattern}:${s.bpm}:${s.bpm2}:${s.anchor}:${s.until}:${Math.ceil(tEnd / 1000)}`;
  const hit = schedCache.get(key); if (hit) return hit;
  if (schedCache.size > 64) schedCache.clear();
  const out: number[] = [];
  let t = s.anchor, i = 0;
  while (t <= tEnd + 1) {
    if (!(s.pattern === "rest" && i % MB_REST_EVERY === MB_REST_EVERY - 1)) out.push(t);
    t += mbPeriod(mbBpmAt(s, t)); i++;
    if (out.length > 600) break;
  }
  schedCache.set(key, out);
  return out;
}
/** האם הזמן t (±win) הוא "הפסקה" — פעימה שקטה שאסור להקיש בה */
export function mbIsRest(s: MbSched, t: number, win: number = MB.OK_MS): boolean {
  if (s.pattern !== "rest") return false;
  const T = mbPeriod(s.bpm);
  const n = Math.round((t - s.anchor) / T);
  if (n < 0 || n % MB_REST_EVERY !== MB_REST_EVERY - 1) return false;
  return Math.abs(t - (s.anchor + n * T)) <= win;
}
/** הנחיתה הקודמת והבאה של המנהיג סביב t (לפני ה-anchor: לוח קבוע אחורה בקצב הבסיס) */
export function mbAround(s: MbSched, t: number): { prev: number; next: number } {
  if (t < s.anchor) { const T = mbPeriod(s.bpm); const k = Math.floor((t - s.anchor) / T); return { prev: s.anchor + k * T, next: s.anchor + (k + 1) * T }; }
  const L = mbLandings(s, t + 5000);
  let lo = 0, hi = L.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (L[mid] <= t) lo = mid; else hi = mid - 1; }
  const prev = L[lo] ?? s.anchor;
  const next = L[lo + 1] ?? prev + mbPeriod(mbBpmAt(s, prev));
  return { prev, next };
}
/** הנחיתה הקרובה ביותר ל-t */
export function mbNearest(s: MbSched, t: number): number { const { prev, next } = mbAround(s, t); return t - prev <= next - t ? prev : next; }

/* ---------- ניקוד ---------- */
export const mbOffPts = (off: number) => (off <= MB.PERFECT_MS ? 10 : off <= MB.GOOD_MS ? 6 : off <= MB.OK_MS ? 3 : 0);
/**
 * ציון פעימה אחת של עוקב מול נחיתת המנהיג בזמן b, לפי ההקשות עצמן (עובד לכל דפוס):
 * ההקשה הקרובה ביותר ל-b נותנת 10/6/3/0; הקשה "יתומה" בין הנחיתה הקודמת (prev) ל-b (רחוקה משתיהן, או בתוך הפסקה)
 * מאפסת את הפעימה — ככה קצב כפול או הקשה בזמן ההפסקה לא מרוויחים.
 */
export function mbBeatScore(taps: number[], b: number, prev: number): { pts: number; off: number; orphan: boolean } {
  let best = Infinity, orphan = false;
  for (const t of taps) {
    if (t <= prev - MB.OK_MS || t > b + MB.OK_MS) continue;
    const d1 = Math.abs(t - b), d0 = Math.abs(t - prev);
    if (d1 < best) best = d1;
    if (d1 > MB.OK_MS && d0 > MB.OK_MS) orphan = true;
  }
  if (orphan) return { pts: 0, off: best, orphan: true };
  return { pts: best === Infinity ? 0 : mbOffPts(best), off: best, orphan: false };
}
/** ההקשה מתאימה לקצב הנוכחי של המנהיג (לנעילה) */
export const mbTempoClose = (f: MbBall, leaderBpm: number) => f.bpm > 0 && Math.abs(f.bpm - leaderBpm) / leaderBpm <= MB.LOCK_TOL;

/** ציון הסבב של עוקב: דיוק (ממוצע הפעימות) + מהירות (מתי נעל לראשונה) */
export function mbRoundScore(sumPts: number, beats: number, lockAt: number, matchStart: number): { acc: number; speed: number; total: number } {
  const acc = beats > 0 ? Math.round(MB.ACC_MAX * sumPts / (10 * beats)) : 0;
  const speed = lockAt > 0 ? Math.round(MB.SPEED_MAX * Math.max(0, 1 - (lockAt - matchStart) / MB.SPEED_WINDOW_MS)) : 0;
  return { acc, speed, total: acc + speed };
}

/* ---------- קונפיג ---------- */
export interface MbConfig { rounds: number; minutes: number; patterns: boolean; phys: boolean; pickMs: number; setMs: number; countMs: number; matchMs: number; resultMs: number; endMs: number; seed?: string }
export function mbConfig(c: Partial<MbConfig> & { rounds?: unknown; minutes?: unknown; patterns?: unknown; phys?: unknown } = {}): MbConfig {
  const rounds = Number(c.rounds) === 2 ? 2 : 1;
  const m = Number(c.minutes); const minutes = m === 2 || m === 5 ? m : 3;
  const on = (v: unknown) => v === true || v === "on" || v === "1" || v === 1;
  return {
    rounds, minutes, patterns: on(c.patterns), phys: on(c.phys),
    pickMs: c.pickMs ?? MB.PICK_MS, setMs: c.setMs ?? MB.SET_MS, countMs: c.countMs ?? MB.COUNT_MS,
    matchMs: c.matchMs ?? MB.MATCH_MS, resultMs: c.resultMs ?? MB.RESULT_MS, endMs: c.endMs ?? MB.END_MS, seed: c.seed,
  };
}

/* ---------- בוט (לבדיקות ולפלייטסט אוטומטי) ---------- */
export interface MbBotOpts { jitterMs: number; startDelayMs: number; tempoErr: number; converge: number }
/**
 * בוט עוקב: אחרי startDelay מתחיל להקיש סביב פעימות המנהיג עם רעש (jitter) ושגיאת קצב שמתכנסת.
 * מחזיר את זמני ההקשות בזמן-שרת מ-start עד end.
 */
export function mbBotTaps(leaderBpm: number, anchor: number, start: number, end: number, o: MbBotOpts, rnd: () => number = Math.random, sched?: MbSched): number[] {
  const s = sched ?? { ...mbPlainSched(leaderBpm, anchor), until: end };
  const out: number[] = [];
  let err = o.tempoErr;
  let drift = 0;
  for (const t of mbLandings(s, end)) {
    if (t < start + o.startDelayMs || t >= end) continue;
    out.push(Math.round(t + drift + (rnd() * 2 - 1) * o.jitterMs));
    drift += mbPeriod(mbBpmAt(s, t)) * err;   // קצב שגוי מצטבר…
    err *= (1 - o.converge);                    // …ומתכנס
    drift *= (1 - o.converge);                  // הבוט גם מתקן פאזה
  }
  return out;
}

/* ---------- הודעות ---------- */
export interface MbBallWire { pid: string; bpm: number; anchor: number }
export interface MbProgRow { pid: string; locked: boolean; streak: number; pts: number; beats: number; lockAt: number }
export interface MbOpts { patterns: boolean; phys: boolean }
export interface MbResultRow { pid: string; c: number; acc: number; speed: number; bonus: number; round: number; total: number; lockAt: number; leader: boolean }
export type MbPhase = "pick" | "set" | "count" | "match" | "result" | "over";

export type MetroClientMsg =
  | { a: "mb_char"; c: number }                    // בחירת צבע
  | { a: "mb_level"; level: number }               // הקובע: רמה 1–50
  | { a: "mb_floor"; floor: string }               // הקובע: רצפה (=צליל)
  | { a: "mb_pattern"; pattern: MbPattern }        // הקובע: דפוס (רק כשהאופציה דלוקה)
  | { a: "mb_setdone" }                            // הקובע: "זה הקצב!" — מסיים את הכיוון מוקדם
  | { a: "mb_tap"; at: number };                   // עוקב/סולו: הקשה בזמן-שרת

export type MetroServerMsg =
  | { a: "mb_pickphase"; taken: Record<string, number>; until: number }
  | { a: "mb_go"; chars: Record<string, number>; rounds: number; solo: boolean; opts: MbOpts }
  | { a: "mb_round"; r: number; of: number; leader: string; floor: string; level: number; anchor: number; until: number; pattern: MbPattern }   // level נראה רק לקובע בזמן הכיוון (הלקוח מסתיר אותו מהאחרים)
  | { a: "mb_lead"; bpm: number; anchor: number; floor: string; pattern: MbPattern }   // הקובע שינה משהו — כולם רואים/שומעים
  | { a: "mb_count"; r: number; startAt: number; until: number; bpm: number; floor: string; sched: MbSched }  // 3-2-1 → ההשוואה מתחילה ב-startAt (הפעימה הראשונה); sched = לוח הנחיתות המלא
  | { a: "mb_oops"; pid: string; at: number }                                        // הקשה בזמן הפסקה / בין פעימות — הרצף נשבר
  | { a: "mb_ball"; pid: string; bpm: number; anchor: number }                      // כדור של עוקב השתנה (הקשה)
  | { a: "mb_prog"; rows: MbProgRow[]; unison: boolean }                            // 2Hz — מי נעול
  | { a: "mb_lock"; pid: string; at: number }                                        // נעילה ראשונה בסבב
  | { a: "mb_unison"; at: number }                                                   // cue — כולם ביחד!
  | { a: "mb_result"; r: number; of: number; leader: string; rows: MbResultRow[]; level: number; until: number; pattern: MbPattern }
  | { a: "mb_over"; rows: MbResultRow[]; titles: { pid: string; ic: string; t: string }[] }
  | { a: "mb_sync"; phase: MbPhase; r: number; of: number; leader: string; floor: string; bpm: number; anchor: number; until: number; startAt: number; chars: Record<string, number>; balls: MbBallWire[]; totals: Record<string, number>; solo: boolean; level: number; sched: MbSched; opts: MbOpts };
