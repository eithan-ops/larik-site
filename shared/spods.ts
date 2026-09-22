/**
 * ספורט פודים 🏃 — הליבה המשותפת (לקוח ↔ שרת).
 *
 * המודל: טלפון אחד (המארח) הוא "השלט" של המאמן; כל שאר הטלפונים הם פודים של אור
 * מפוזרים בחצר/באולם. לכל ספורטאי צבע — הפוד יודע מי נגע כי רק ספורטאי אחד אמור לגעת בצבע הזה.
 * עשרה משחקים על מנוע אחד: אותן הודעות, אותו מסך פוד, אותו שלט — רק התוכנית שונה.
 *
 * הזמנים הם זמן-שרת במילישניות. הדלקה = cue מתוזמן (כל הפודים באותה מילישנייה),
 * נגיעה נשלחת עם זמן-שרת, וזמן התגובה נמדד מול זמן ההדלקה — הרשת לא משפיעה על המדידה.
 */

import type { LText } from "./protocol";

export type SpGame = "colors" | "duel" | "star" | "beep" | "steal" | "survive" | "relay" | "stations" | "statue" | "pacer";
export const SP_GAME_IDS: SpGame[] = ["colors", "duel", "star", "beep", "steal", "survive", "relay", "stations", "statue", "pacer"];
/** מזהה הקטלוג = "sp_" + המשחק */
export const spGameOf = (gameId: string): SpGame | null => {
  const g = gameId.startsWith("sp_") ? gameId.slice(3) : "";
  return (SP_GAME_IDS as string[]).includes(g) ? (g as SpGame) : null;
};

/* ---------- צבעי ספורטאים — רוויים, נראים מ-10 מטר ---------- */
/** שם הצבע: locales/<lang>/spods.json → spods.color.<i> / spods.color.shared */
export interface SpColor { hex: string; ink: string }
export const SP_COLORS: SpColor[] = [
  { hex: "#FF3B3B", ink: "#FFFFFF" },
  { hex: "#2F7BFF", ink: "#FFFFFF" },
  { hex: "#3DDC3D", ink: "#08150A" },
  { hex: "#FFD21F", ink: "#1A1400" },
  { hex: "#B04DFF", ink: "#FFFFFF" },
  { hex: "#FF8A2B", ink: "#1A0E00" },
  { hex: "#FF5FB0", ink: "#FFFFFF" },
  { hex: "#2EDCE6", ink: "#06191B" },
];
export const SP_SHARED = { hex: "#FFF3DC", ink: "#0C0906" }; // אור משותף (גניבת הסבב)
export const spColor = (c: number): SpColor => (c >= 0 && c < SP_COLORS.length ? SP_COLORS[c] : SP_SHARED);

/* ---------- הגדרות שהמאמן מכוונן ---------- */
export interface SpSetting { key: string; label: string; values: { v: number; label: string }[] }
export type SpCfg = Record<string, number>;

/* ---------- תרגילים ותנוחות ---------- */
/** תרגיל/תנוחה — הטקסט: spods.move.<id> (+ .sub) / spods.pose.<id> */
export interface SpMove { ic: string; id: string; sub?: boolean }
export const SP_KITS: Record<string, { moves: SpMove[] }> = {
  warm: { moves: [
    { ic: "🦘", id: "jumps10" }, { ic: "🏃", id: "run_place", sub: true }, { ic: "🙆", id: "jj10" },
    { ic: "🔄", id: "spins3" }, { ic: "🦵", id: "knees10" }, { ic: "🤸", id: "star5" },
  ] },
  power: { moves: [
    { ic: "🏋️", id: "squats8" }, { ic: "🧘", id: "plank", sub: true }, { ic: "💪", id: "pushups5" },
    { ic: "🦵", id: "lunges6" }, { ic: "🐸", id: "frog5" }, { ic: "🪑", id: "wallsit", sub: true },
  ] },
  fun: { moves: [
    { ic: "🐻", id: "bear", sub: true }, { ic: "🦀", id: "crab" }, { ic: "🐰", id: "bunny5" },
    { ic: "🕺", id: "dance", sub: true }, { ic: "🦩", id: "oneleg", sub: true }, { ic: "🌪️", id: "tornado" },
  ] },
};
export const SP_KIT_IDS = ["warm", "power", "fun"];
export const SP_POSES: SpMove[] = [
  { ic: "🧘", id: "plank" }, { ic: "🏋️", id: "squat" }, { ic: "🦩", id: "oneleg" }, { ic: "🛌", id: "onback" },
  { ic: "🧎", id: "oneknee" }, { ic: "🙌", id: "handsup" },
];

/* ---------- הקטלוג הפנימי של הקטגוריה ---------- */
/** scoreLabel: locales/<lang>/spods.json → spods.score.<id>; setup — נפילה לעברית לקטלוג, בשלט: spods.setup.<id> */
export interface SpDef {
  id: SpGame;
  name: string;
  icon: string;
  tagline: string;
  howTo: string;
  /** הנחיית סידור למאמן (עברית — נפילה; הלקוח מציג spods.setup.<id>) */
  setup: string;
  minPods: number;
  minAth: number;
  maxAth: number;
  settings: SpSetting[];
  /** ניקוד נמוך = טוב (מרוץ הצבעים, בדיוק בזמן, מרוץ שליחים) */
  lowerIsBetter?: boolean;
  /** יחידת התצוגה של הניקוד */
  unit?: "n" | "ms" | "lvl";
}

export const SP_DEFS: Record<SpGame, SpDef> = {
  colors: {
    id: "colors", name: "מרוץ הצבעים", icon: "🏁",
    tagline: "צליל — כולם רצים. כל אחד רק לצבע שלו.",
    howTo: "הטלפונים בשורה במרחק 10 מטר. הילדים על קו הזינוק, לכל אחד צבע. צליל \"גו\" — כל הפודים נדלקים בצבעים מעורבבים, כל אחד רץ ונוגע רק בצבע שלו וחוזר לקו. מי שמהיר יותר לאורך הסבבים מנצח.",
    setup: "הניחו 4–6 טלפונים בשורה (מסך למעלה) במרחק ~10 מ' מקו הזינוק. הילדים בשורה על הקו.",
    minPods: 2, minAth: 1, maxAth: 8,
    settings: [
      { key: "rounds", label: "סבבים", values: [{ v: 6, label: "6" }, { v: 4, label: "4 ⚡" }, { v: 10, label: "10 🔥" }] },
      { key: "window", label: "זמן לנגיעה", values: [{ v: 10000, label: "10 שנ'" }, { v: 6000, label: "6 שנ' ⚡" }, { v: 15000, label: "15 שנ' 🧒" }] },
      { key: "delay", label: "השהיה לפני הגו", values: [{ v: 3000, label: "עד 3 שנ'" }, { v: 1500, label: "עד 1.5 שנ'" }, { v: 5000, label: "עד 5 שנ' 😈" }] },
    ],
    unit: "n",
  },
  duel: {
    id: "duel", name: "דו-קרב", icon: "⚔️",
    tagline: "שניים, ארבעה פודים, 45 שניות. אחר כך מחליפים זוגות.",
    howTo: "שני ילדים גב אל גב במרכז, הפודים מסביב. פוד נדלק בצבע של אחד מהם — הוא רץ, נוגע, וחוזר למרכז. לפעמים שניים נדלקים יחד. בסוף הזמן — ניקוד, ומיד זוג חדש. כולם נגד כולם, ובסוף אלוף הערב.",
    setup: "4 פודים בריבוע של ~3×3 מ'. שני הספורטאים גב אל גב במרכז. השלט מגריל את הזוגות.",
    minPods: 2, minAth: 2, maxAth: 8,
    settings: [
      { key: "secs", label: "זמן לדו-קרב", values: [{ v: 45, label: "45 שנ'" }, { v: 30, label: "30 שנ' ⚡" }, { v: 60, label: "60 שנ' 🔥" }] },
      { key: "window", label: "זמן לנגיעה", values: [{ v: 5000, label: "5 שנ'" }, { v: 3000, label: "3 שנ' ⚡" }, { v: 8000, label: "8 שנ' 🧒" }] },
    ],
    unit: "n",
  },
  star: {
    id: "star", name: "כוכב הזריזות", icon: "⭐",
    tagline: "ספרינט לפוד, חזרה לבית. כמה כוכבים ב-30 שניות?",
    howTo: "5 פודים במעגל ופוד-בית במרכז. בתורך: עומדים על הבית, פוד נדלק — ספרינט, נגיעה, חזרה לבית ונגיעה בבית. רק אז הבא נדלק. כמה כוכבים הספקת בזמן? שיא אישי נשמר לערב הבא.",
    setup: "פוד 1 = הבית במרכז. שאר הפודים במעגל ברדיוס 3–5 מ' סביבו. ספורטאי אחד בכל תור.",
    minPods: 2, minAth: 1, maxAth: 8,
    settings: [
      { key: "secs", label: "זמן לתור", values: [{ v: 30, label: "30 שנ'" }, { v: 20, label: "20 שנ' ⚡" }, { v: 45, label: "45 שנ' 🔥" }] },
    ],
    unit: "n",
  },
  beep: {
    id: "beep", name: "מבחן הביפ", icon: "📶",
    tagline: "רצים לפוד וחוזרים. כל דקה הזמן מתקצר.",
    howTo: "פודים בקו ישר במרחקים שונים. הפוד שלך נדלק — רצים אליו, נוגעים, וחוזרים לקו. כל 4 מעבורות עולים רמה והזמן מתקצר. שני פספוסים — בחוץ. עד איזו רמה תגיעו?",
    setup: "3–4 פודים בקו ישר במרחקים 5 / 10 / 15 / 20 מ' מקו הזינוק (פוד 1 = הקרוב). כולם על הקו.",
    minPods: 1, minAth: 1, maxAth: 8,
    settings: [
      { key: "window", label: "זמן התחלתי", values: [{ v: 8000, label: "8 שנ'" }, { v: 6000, label: "6 שנ' ⚡" }, { v: 12000, label: "12 שנ' 🧒" }] },
      { key: "elim", label: "הדחה", values: [{ v: 1, label: "2 פספוסים = בחוץ 💀" }, { v: 0, label: "בלי הדחה 🙂 (4 רמות)" }] },
    ],
    unit: "lvl",
  },
  steal: {
    id: "steal", name: "גניבת הסבב", icon: "🦝",
    tagline: "פוד נדלק — הראשון שנוגע מכבה לכולם.",
    howTo: "כולם במרכז, יד על קונוס. פוד נדלק בלבן עם פס בצבע של כל אחד — רצים, והראשון שנוגע בפס שלו גונב את הסבב. השאר נשארו עם כלום. חוזרים למרכז. ראשון ל-10 גניבות.",
    setup: "6 פודים במעגל ברדיוס 4–5 מ'. עד 4 ספורטאים במרכז עם יד על קונוס/כיסא. מעל 4 — בסבבים.",
    minPods: 1, minAth: 2, maxAth: 8,
    settings: [
      { key: "toN", label: "גניבות לניצחון", values: [{ v: 10, label: "10" }, { v: 5, label: "5 ⚡" }, { v: 15, label: "15 🔥" }] },
      { key: "delay", label: "השהיה", values: [{ v: 4000, label: "עד 4 שנ'" }, { v: 2000, label: "עד 2 שנ' ⚡" }, { v: 7000, label: "עד 7 שנ' 😈" }] },
    ],
    unit: "n",
  },
  survive: {
    id: "survive", name: "הישרדות", icon: "💀",
    tagline: "הצבע שלך נדלק — יש לך כמה שניות. אחרת נפסלת.",
    howTo: "הפודים מפוזרים בחצר. כשהצבע שלך נדלק על פוד כלשהו — רוצים ונוגעים לפני שהזמן נגמר, אחרת נפסלת. הזמן מתקצר עם כל הדלקה. האחרון ששרד מנצח.",
    setup: "6–8 פודים מפוזרים חופשי, 3–6 מ' זה מזה. כולם מוכנים באמצע.",
    minPods: 1, minAth: 2, maxAth: 8,
    settings: [
      { key: "window", label: "זמן התחלתי", values: [{ v: 6000, label: "6 שנ'" }, { v: 4000, label: "4 שנ' ⚡" }, { v: 9000, label: "9 שנ' 🧒" }] },
    ],
    unit: "n",
  },
  relay: {
    id: "relay", name: "מרוץ שליחים", icon: "🏁",
    tagline: "שתי קבוצות. הנגיעה שלך מדליקה את הרץ הבא.",
    howTo: "שתי קבוצות, לכל קבוצה פוד זינוק ופוד קצה. הפוד הרחוק נדלק — הרץ רץ, נוגע, חוזר ונוגע בפוד הזינוק — וזה מדליק את הפוד לרץ הבא. אין זינוק מוקדם. הקבוצה שסיימה את כל הרצים ראשונה מנצחת.",
    setup: "פודים 1+2 = קבוצה 🔵 (זינוק, קצה). פודים 3+4 = קבוצה 🔴. מרחק 10–15 מ' בין זינוק לקצה.",
    minPods: 2, minAth: 2, maxAth: 8,
    settings: [
      { key: "laps", label: "קטעים לרץ", values: [{ v: 1, label: "1" }, { v: 2, label: "2" }, { v: 3, label: "3 🔥" }] },
    ],
    unit: "ms", lowerIsBetter: true,
  },
  stations: {
    id: "stations", name: "תחנות אש", icon: "🔥",
    tagline: "הפוד שלך נדלק ומכריז תרגיל. מבצעים, נוגעים, הבא.",
    howTo: "הפודים הם תחנות ברחבי החצר. הפוד שלך נדלק ומראה תרגיל — 10 קפיצות, פלאנק, סקוואט. מבצעים, נוגעים — והפוד הבא שלך נדלק במקום אחר. כמה תחנות תספיקו?",
    setup: "6–8 פודים מפוזרים ברחבי החצר/האולם (על כיסאות או על הרצפה). כל ספורטאי מתחיל ליד פוד.",
    minPods: 1, minAth: 1, maxAth: 8,
    settings: [
      { key: "mins", label: "אורך", values: [{ v: 5, label: "5 דק'" }, { v: 3, label: "3 דק' ⚡" }, { v: 8, label: "8 דק' 🔥" }] },
      { key: "kit", label: "ערכה", values: [{ v: 0, label: "חימום 🦘" }, { v: 1, label: "כוח 💪" }, { v: 2, label: "כיף 🐻" }] },
    ],
    unit: "n",
  },
  statue: {
    id: "statue", name: "הפסל", icon: "🗿",
    tagline: "הצבע שנגעת בו קובע את התנוחה שמחזיקים עד האור הבא.",
    howTo: "הפודים במעגל. הפוד שלך נדלק ומראה תנוחה — רצים, נוגעים, וחוזרים למרכז להחזיק את התנוחה: פלאנק, סקוואט, רגל אחת… עד שהפוד הבא נדלק — ואף אחד לא יודע מתי. כוח וזריזות באותו משחק.",
    setup: "4–6 פודים במעגל ברדיוס ~3 מ'. הספורטאים במרכז. המאמן פוסל תנוחה שנשברה (−1).",
    minPods: 1, minAth: 1, maxAth: 8,
    settings: [
      { key: "secs", label: "אורך", values: [{ v: 60, label: "60 שנ'" }, { v: 45, label: "45 שנ' ⚡" }, { v: 90, label: "90 שנ' 🔥" }] },
      { key: "hold", label: "החזקה", values: [{ v: 6000, label: "2–6 שנ'" }, { v: 4000, label: "2–4 שנ' ⚡" }, { v: 9000, label: "2–9 שנ' 💪" }] },
    ],
    unit: "n",
  },
  pacer: {
    id: "pacer", name: "בדיוק בזמן", icon: "⏱️",
    tagline: "הפוד דועך. גע בדיוק כשהוא כבה — לא מוקדם, לא מאוחר.",
    howTo: "הפוד שלך נדלק ודועך לאט. המטרה: להגיע ולגעת בדיוק ברגע שהוא כבה. מוקדם = חפוז, מאוחר = נרדם. הפער הקטן ביותר מנצח — זה שליטה בקצב, לא מהירות. גם הקטן יכול לנצח.",
    setup: "3–4 פודים במרחקים שונים (5 / 8 / 12 מ'). כולם על קו הזינוק.",
    minPods: 1, minAth: 1, maxAth: 8,
    settings: [
      { key: "lights", label: "הדלקות", values: [{ v: 8, label: "8" }, { v: 5, label: "5 ⚡" }, { v: 12, label: "12 🔥" }] },
      { key: "fade", label: "דעיכה", values: [{ v: 5000, label: "~5 שנ'" }, { v: 3000, label: "~3 שנ' ⚡" }, { v: 8000, label: "~8 שנ' 🐢" }] },
      { key: "fake", label: "פייקים", values: [{ v: 0, label: "בלי" }, { v: 1, label: "עם 😈" }] },
    ],
    unit: "ms", lowerIsBetter: true,
  },
};

/** ברירת המחדל = הערך הראשון בכל הגדרה (כמו שהלובי מציג) */
export const spDefaults = (g: SpGame): SpCfg => Object.fromEntries(SP_DEFS[g].settings.map((s) => [s.key, s.values[0].v]));
export function spConfig(g: SpGame, raw: unknown): SpCfg {
  const out = spDefaults(g);
  const o = (raw ?? {}) as Record<string, unknown>;
  for (const s of SP_DEFS[g].settings) {
    const v = Number(o[s.key]);
    if (s.values.some((x) => x.v === v)) out[s.key] = v;
  }
  return out;
}
export const SP_HAND_STEPS = [0, 1000, 2000, 3000]; // הנדיקפ: תוספת לחלון של ספורטאי

/* ---------- מצב שמשודר לשלט ולפודים ---------- */
export type SpPhase = "setup" | "count" | "run" | "pause" | "between" | "over";
export interface SpAth {
  pid: string;
  c: number;          // אינדקס צבע
  hand: number;       // הנדיקפ (ms תוספת לחלון)
  score: number;      // הניקוד הראשי של המשחק (ר' scoreLabel)
  hits: number;
  miss: number;
  med: number;        // חציון זמן תגובה (ms), 0 = אין עדיין
  out: boolean;
  team: number;       // מרוץ שליחים: 0/1
  strikes: number;    // מבחן הביפ
  hold?: string;      // הפסל: מזהה התנוחה שמחזיקים עכשיו
  extra?: LText;      // טקסט לשורה בשלט ("+0.3 חפוז", "רמה 4")
}
export interface SpState {
  game: SpGame;
  phase: SpPhase;
  cfg: SpCfg;
  aths: SpAth[];
  pods: string[];                 // סדר הפודים (אינדקס+1 = מספר הפוד)
  roles: Record<string, "ath" | "pod">;
  round: number; of: number;      // סבב נוכחי / כמה
  until: number;                  // סוף השלב הנוכחי (זמן-שרת), 0 = אין
  banner: LText;                  // מה קורה עכשיו — לשלט ולפודים
  sub?: LText;
  /** דו-קרב: הזוג הנוכחי · כוכב: מי בתור */
  focus?: string[];
  level?: number;                 // מבחן הביפ
  /** טורניר הערב — מצטבר בין המשחקים בחדר */
  tourn?: SpTourn;
}

/* ---------- טורניר הערב 🏆 ---------- */
/**
 * הטורניר חי בחדר (לא במשחק): כל משחק ספורט-פודים שנגמר מוסיף שורה — 🥇3 · 🥈2 · 🥉1 (תיקו = אותן נקודות),
 * הטבלה מצטברת בין המשחקים, ובסוף המאמן מכריז על אלוף הערב: כל הפודים נדלקים בצבע שלו והטקס של לאריק נפתח.
 * הנקודות האלה הן גם "לוח הערב" של החדר (GameEndResult.points) — כך הכרטיס לשיתוף מראה את הטורניר.
 */
export const SP_TOURN_PTS = [3, 2, 1];
export interface SpTournGame { game: SpGame; ranking: string[]; pts: Record<string, number>; at: number }
export interface SpTournRow { pid: string; pts: number; played: number; wins: number; podium: number }
export interface SpTourn { games: SpTournGame[]; rows: SpTournRow[]; champion?: string[] }
/** נקודות למשחק: לפי הדירוג, שוויון בניקוד = אותו מקום (שניהם 🥇 = 3) */
export function spTournPoints(ranked: { pid: string; score: number }[]): Record<string, number> {
  const pts: Record<string, number> = {};
  let place = 0;
  ranked.forEach((r, i) => {
    if (i === 0 || r.score !== ranked[i - 1].score) place = i;
    pts[r.pid] = SP_TOURN_PTS[place] ?? 0;
  });
  return pts;
}
/** הטבלה מתוך רשימת המשחקים — ממוינת: נקודות, ניצחונות, פודיומים */
export function spTournTable(games: SpTournGame[]): SpTournRow[] {
  const m = new Map<string, SpTournRow>();
  for (const g of games) {
    for (const [pid, p] of Object.entries(g.pts)) {
      const r = m.get(pid) ?? { pid, pts: 0, played: 0, wins: 0, podium: 0 };
      r.pts += p; r.played++; if (p === SP_TOURN_PTS[0]) r.wins++; if (p > 0) r.podium++;
      m.set(pid, r);
    }
  }
  return [...m.values()].sort((a, b) => b.pts - a.pts || b.wins - a.wins || b.podium - a.podium || a.played - b.played);
}
/** קבוצות מאוזנות לפי הטבלה (נחש: 1→🔵 2→🔴 3→🔴 4→🔵 …); מי שלא בטבלה — בסוף */
export function spBalanceTeams(pids: string[], rows: SpTournRow[]): Record<string, number> {
  const rank = new Map(rows.map((r, i) => [r.pid, i]));
  const order = [...pids].sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99));
  const out: Record<string, number> = {};
  order.forEach((pid, i) => { out[pid] = (i % 4 === 0 || i % 4 === 3) ? 0 : 1; });
  return out;
}

/* ---------- הודעות ---------- */
export type SpCtlOp = "start" | "pause" | "resume" | "stop" | "skip" | "champion" | "reset_tourn" | "team_auto";
export type SpSayKind = "go" | "next" | "win" | "out" | "gentle" | "line" | "info";
export type SpodsClientMsg =
  | { a: "sp_ctl"; op: SpCtlOp }
  | { a: "sp_cfg"; key: string; v: number }
  | { a: "sp_role"; pid: string; role: "ath" | "pod" }
  | { a: "sp_hand"; pid: string; ms: number }
  | { a: "sp_judge"; pid: string; d: number }
  | { a: "sp_test"; pod: string }
  | { a: "sp_order"; pods: string[] }
  | { a: "sp_team"; pid: string; team: number }
  | { a: "sp_tap"; id: number; at: number; zone?: number };

export interface SpLight {
  id: number;
  pod: string;
  c: number;                 // צבע (אינדקס), -1 = משותף
  pid?: string;              // למי מיועד
  txt?: LText;               // טקסט גדול על הפוד (שם, תרגיל, תנוחה)
  ic?: string;               // אימוג'י גדול
  sub?: LText;
  at: number;                // זמן ההדלקה (cue)
  until: number;             // סוף החלון (0 = בלי)
  fade?: number;             // בדיוק בזמן: משך הדעיכה
  fakeAt?: number;           // בדיוק בזמן: מתי הדעיכה נעצרת לשנייה (יחסית ל-at)
  zones?: number[];          // גניבת הסבב: פסי צבע (אינדקסים)
  home?: boolean;            // כוכב: פוד הבית
}
export type SpodsServerMsg =
  | { a: "sp_state"; s: SpState }
  | { a: "sp_light"; l: SpLight }                                  // cue
  | { a: "sp_off"; id: number; why: "hit" | "miss" | "stop" }
  | { a: "sp_hit"; id: number; pid: string; pod: string; ms: number; txt?: LText; good?: boolean }
  | { a: "sp_miss"; id: number; pid: string; pod: string }
  | { a: "sp_go"; at: number }                                     // cue: צליל הזינוק
  | { a: "sp_say"; t: LText; k?: SpSayKind }
  | { a: "sp_flash"; pod: string }
  | { a: "sp_over"; winner?: string; scores: Record<string, number>; tpts?: Record<string, number> }
  | { a: "sp_champion"; pids: string[]; at: number };                // cue: כל הפודים בצבע האלוף

/* ---------- עזרים משותפים ---------- */
export function spMedian(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
/** סבב-רובין (שיטת המעגל): כל זוג פעם אחת; אי-זוגי = "bye" (null) */
export function spRoundRobin(ids: string[]): [string, string][] {
  const list: (string | null)[] = [...ids];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const out: [string, string][] = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      if (a && b) out.push([a, b]);
    }
    list.splice(1, 0, list.pop()!);
  }
  return out;
}
export const spFmtMs = (ms: number) => (ms / 1000).toFixed(2);
export const spFmtScore = (g: SpGame, v: number) => {
  const u = SP_DEFS[g].unit;
  if (u === "ms") return v ? `${spFmtMs(v)}s` : "—";
  if (u === "lvl") return `${v}`;   // "רמה" נוספת בלקוח (spods.level_n)
  return String(v);
};
