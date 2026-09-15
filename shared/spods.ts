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

export type SpGame = "colors" | "duel" | "star" | "beep" | "steal" | "survive" | "relay" | "stations" | "statue" | "pacer";
export const SP_GAME_IDS: SpGame[] = ["colors", "duel", "star", "beep", "steal", "survive", "relay", "stations", "statue", "pacer"];
/** מזהה הקטלוג = "sp_" + המשחק */
export const spGameOf = (gameId: string): SpGame | null => {
  const g = gameId.startsWith("sp_") ? gameId.slice(3) : "";
  return (SP_GAME_IDS as string[]).includes(g) ? (g as SpGame) : null;
};

/* ---------- צבעי ספורטאים — רוויים, נראים מ-10 מטר ---------- */
export interface SpColor { hex: string; name: string; ink: string }
export const SP_COLORS: SpColor[] = [
  { hex: "#FF3B3B", name: "אדום", ink: "#FFFFFF" },
  { hex: "#2F7BFF", name: "כחול", ink: "#FFFFFF" },
  { hex: "#3DDC3D", name: "ירוק", ink: "#08150A" },
  { hex: "#FFD21F", name: "צהוב", ink: "#1A1400" },
  { hex: "#B04DFF", name: "סגול", ink: "#FFFFFF" },
  { hex: "#FF8A2B", name: "כתום", ink: "#1A0E00" },
  { hex: "#FF5FB0", name: "ורוד", ink: "#FFFFFF" },
  { hex: "#2EDCE6", name: "טורקיז", ink: "#06191B" },
];
export const SP_SHARED = { hex: "#FFF3DC", name: "לבן", ink: "#0C0906" }; // אור משותף (גניבת הסבב)
export const spColor = (c: number): SpColor => (c >= 0 && c < SP_COLORS.length ? SP_COLORS[c] : SP_SHARED);

/* ---------- הגדרות שהמאמן מכוונן ---------- */
export interface SpSetting { key: string; label: string; values: { v: number; label: string }[] }
export type SpCfg = Record<string, number>;

/* ---------- תרגילים ותנוחות ---------- */
export interface SpMove { ic: string; t: string; sub?: string }
export const SP_KITS: Record<string, { name: string; moves: SpMove[] }> = {
  warm: { name: "חימום", moves: [
    { ic: "🦘", t: "10 קפיצות" }, { ic: "🏃", t: "ריצה במקום", sub: "10 שניות" }, { ic: "🙆", t: "10 ג'אמפינג ג'ק" },
    { ic: "🔄", t: "3 סיבובים" }, { ic: "🦵", t: "10 ברכיים למעלה" }, { ic: "🤸", t: "5 קפיצות כוכב" },
  ] },
  power: { name: "כוח", moves: [
    { ic: "🏋️", t: "8 סקוואטים" }, { ic: "🧘", t: "פלאנק", sub: "10 שניות" }, { ic: "💪", t: "5 שכיבות סמיכה" },
    { ic: "🦵", t: "6 לאנג'ים" }, { ic: "🐸", t: "5 קפיצות צפרדע" }, { ic: "🪑", t: "כיסא על הקיר", sub: "10 שניות" },
  ] },
  fun: { name: "כיף", moves: [
    { ic: "🐻", t: "הליכת דוב", sub: "עד הפוד וחזרה" }, { ic: "🦀", t: "הליכת סרטן" }, { ic: "🐰", t: "5 קפיצות ארנב" },
    { ic: "🕺", t: "ריקוד", sub: "5 שניות" }, { ic: "🦩", t: "רגל אחת", sub: "5 שניות" }, { ic: "🌪️", t: "סיבוב טורנדו" },
  ] },
};
export const SP_KIT_IDS = ["warm", "power", "fun"];
export const SP_POSES: SpMove[] = [
  { ic: "🧘", t: "פלאנק" }, { ic: "🏋️", t: "סקוואט" }, { ic: "🦩", t: "רגל אחת" }, { ic: "🛌", t: "שכיבה על הגב" },
  { ic: "🧎", t: "ברך אחת" }, { ic: "🙌", t: "ידיים למעלה" },
];

/* ---------- הקטלוג הפנימי של הקטגוריה ---------- */
export interface SpDef {
  id: SpGame;
  name: string;
  icon: string;
  tagline: string;
  howTo: string;
  /** הנחיית סידור למאמן — מוצגת בשלט לפני ההתחלה */
  setup: string;
  minPods: number;
  minAth: number;
  maxAth: number;
  settings: SpSetting[];
  /** מה מודדים — התווית של עמודת הניקוד בשלט */
  scoreLabel: string;
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
      { key: "rounds", label: "סבבים", values: [{ v: 4, label: "4" }, { v: 6, label: "6" }, { v: 10, label: "10 🔥" }] },
      { key: "window", label: "זמן לנגיעה", values: [{ v: 6000, label: "6 שנ'" }, { v: 10000, label: "10 שנ'" }, { v: 15000, label: "15 שנ' 🧒" }] },
      { key: "delay", label: "השהיה לפני הגו", values: [{ v: 1500, label: "עד 1.5 שנ'" }, { v: 3000, label: "עד 3 שנ'" }, { v: 5000, label: "עד 5 שנ' 😈" }] },
    ],
    scoreLabel: "סבבים שניצח", unit: "n",
  },
  duel: {
    id: "duel", name: "דו-קרב", icon: "⚔️",
    tagline: "שניים, ארבעה פודים, 45 שניות. אחר כך מחליפים זוגות.",
    howTo: "שני ילדים גב אל גב במרכז, הפודים מסביב. פוד נדלק בצבע של אחד מהם — הוא רץ, נוגע, וחוזר למרכז. לפעמים שניים נדלקים יחד. בסוף הזמן — ניקוד, ומיד זוג חדש. כולם נגד כולם, ובסוף אלוף הערב.",
    setup: "4 פודים בריבוע של ~3×3 מ'. שני הספורטאים גב אל גב במרכז. השלט מגריל את הזוגות.",
    minPods: 2, minAth: 2, maxAth: 8,
    settings: [
      { key: "secs", label: "זמן לדו-קרב", values: [{ v: 30, label: "30 שנ'" }, { v: 45, label: "45 שנ'" }, { v: 60, label: "60 שנ' 🔥" }] },
      { key: "window", label: "זמן לנגיעה", values: [{ v: 3000, label: "3 שנ'" }, { v: 5000, label: "5 שנ'" }, { v: 8000, label: "8 שנ' 🧒" }] },
    ],
    scoreLabel: "נקודות טורניר", unit: "n",
  },
  star: {
    id: "star", name: "כוכב הזריזות", icon: "⭐",
    tagline: "ספרינט לפוד, חזרה לבית. כמה כוכבים ב-30 שניות?",
    howTo: "5 פודים במעגל ופוד-בית במרכז. בתורך: עומדים על הבית, פוד נדלק — ספרינט, נגיעה, חזרה לבית ונגיעה בבית. רק אז הבא נדלק. כמה כוכבים הספקת בזמן? שיא אישי נשמר לערב הבא.",
    setup: "פוד 1 = הבית במרכז. שאר הפודים במעגל ברדיוס 3–5 מ' סביבו. ספורטאי אחד בכל תור.",
    minPods: 2, minAth: 1, maxAth: 8,
    settings: [
      { key: "secs", label: "זמן לתור", values: [{ v: 20, label: "20 שנ'" }, { v: 30, label: "30 שנ'" }, { v: 45, label: "45 שנ' 🔥" }] },
    ],
    scoreLabel: "כוכבים", unit: "n",
  },
  beep: {
    id: "beep", name: "מבחן הביפ", icon: "📶",
    tagline: "רצים לפוד וחוזרים. כל דקה הזמן מתקצר.",
    howTo: "פודים בקו ישר במרחקים שונים. הפוד שלך נדלק — רצים אליו, נוגעים, וחוזרים לקו. כל 4 מעבורות עולים רמה והזמן מתקצר. שני פספוסים — בחוץ. עד איזו רמה תגיעו?",
    setup: "3–4 פודים בקו ישר במרחקים 5 / 10 / 15 / 20 מ' מקו הזינוק (פוד 1 = הקרוב). כולם על הקו.",
    minPods: 1, minAth: 1, maxAth: 8,
    settings: [
      { key: "window", label: "זמן התחלתי", values: [{ v: 6000, label: "6 שנ'" }, { v: 8000, label: "8 שנ'" }, { v: 12000, label: "12 שנ' 🧒" }] },
      { key: "elim", label: "הדחה", values: [{ v: 1, label: "2 פספוסים = בחוץ" }, { v: 0, label: "בלי הדחה 🙂" }] },
    ],
    scoreLabel: "רמה", unit: "lvl",
  },
  steal: {
    id: "steal", name: "גניבת הסבב", icon: "🦝",
    tagline: "פוד נדלק — הראשון שנוגע מכבה לכולם.",
    howTo: "כולם במרכז, יד על קונוס. פוד נדלק בלבן עם פס בצבע של כל אחד — רצים, והראשון שנוגע בפס שלו גונב את הסבב. השאר נשארו עם כלום. חוזרים למרכז. ראשון ל-10 גניבות.",
    setup: "6 פודים במעגל ברדיוס 4–5 מ'. עד 4 ספורטאים במרכז עם יד על קונוס/כיסא. מעל 4 — בסבבים.",
    minPods: 1, minAth: 2, maxAth: 8,
    settings: [
      { key: "toN", label: "גניבות לניצחון", values: [{ v: 5, label: "5" }, { v: 10, label: "10" }, { v: 15, label: "15 🔥" }] },
      { key: "delay", label: "השהיה", values: [{ v: 2000, label: "עד 2 שנ'" }, { v: 4000, label: "עד 4 שנ'" }, { v: 7000, label: "עד 7 שנ' 😈" }] },
    ],
    scoreLabel: "גניבות", unit: "n",
  },
  survive: {
    id: "survive", name: "הישרדות", icon: "💀",
    tagline: "הצבע שלך נדלק — יש לך כמה שניות. אחרת נפסלת.",
    howTo: "הפודים מפוזרים בחצר. כשהצבע שלך נדלק על פוד כלשהו — רוצים ונוגעים לפני שהזמן נגמר, אחרת נפסלת. הזמן מתקצר עם כל הדלקה. האחרון ששרד מנצח.",
    setup: "6–8 פודים מפוזרים חופשי, 3–6 מ' זה מזה. כולם מוכנים באמצע.",
    minPods: 1, minAth: 2, maxAth: 8,
    settings: [
      { key: "window", label: "זמן התחלתי", values: [{ v: 4000, label: "4 שנ'" }, { v: 6000, label: "6 שנ'" }, { v: 9000, label: "9 שנ' 🧒" }] },
    ],
    scoreLabel: "הדלקות ששרד", unit: "n",
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
    scoreLabel: "זמן קטע", unit: "ms", lowerIsBetter: true,
  },
  stations: {
    id: "stations", name: "תחנות אש", icon: "🔥",
    tagline: "הפוד שלך נדלק ומכריז תרגיל. מבצעים, נוגעים, הבא.",
    howTo: "הפודים הם תחנות ברחבי החצר. הפוד שלך נדלק ומראה תרגיל — 10 קפיצות, פלאנק, סקוואט. מבצעים, נוגעים — והפוד הבא שלך נדלק במקום אחר. כמה תחנות תספיקו?",
    setup: "6–8 פודים מפוזרים ברחבי החצר/האולם (על כיסאות או על הרצפה). כל ספורטאי מתחיל ליד פוד.",
    minPods: 1, minAth: 1, maxAth: 8,
    settings: [
      { key: "mins", label: "אורך", values: [{ v: 3, label: "3 דק'" }, { v: 5, label: "5 דק'" }, { v: 8, label: "8 דק' 🔥" }] },
      { key: "kit", label: "ערכה", values: [{ v: 0, label: "חימום 🦘" }, { v: 1, label: "כוח 💪" }, { v: 2, label: "כיף 🐻" }] },
    ],
    scoreLabel: "תחנות", unit: "n",
  },
  statue: {
    id: "statue", name: "הפסל", icon: "🗿",
    tagline: "הצבע שנגעת בו קובע את התנוחה שמחזיקים עד האור הבא.",
    howTo: "הפודים במעגל. הפוד שלך נדלק ומראה תנוחה — רצים, נוגעים, וחוזרים למרכז להחזיק את התנוחה: פלאנק, סקוואט, רגל אחת… עד שהפוד הבא נדלק — ואף אחד לא יודע מתי. כוח וזריזות באותו משחק.",
    setup: "4–6 פודים במעגל ברדיוס ~3 מ'. הספורטאים במרכז. המאמן פוסל תנוחה שנשברה (−1).",
    minPods: 1, minAth: 1, maxAth: 8,
    settings: [
      { key: "secs", label: "אורך", values: [{ v: 45, label: "45 שנ'" }, { v: 60, label: "60 שנ'" }, { v: 90, label: "90 שנ' 🔥" }] },
      { key: "hold", label: "החזקה", values: [{ v: 4000, label: "2–4 שנ'" }, { v: 6000, label: "2–6 שנ'" }, { v: 9000, label: "2–9 שנ' 💪" }] },
    ],
    scoreLabel: "תנוחות", unit: "n",
  },
  pacer: {
    id: "pacer", name: "בדיוק בזמן", icon: "⏱️",
    tagline: "הפוד דועך. גע בדיוק כשהוא כבה — לא מוקדם, לא מאוחר.",
    howTo: "הפוד שלך נדלק ודועך לאט. המטרה: להגיע ולגעת בדיוק ברגע שהוא כבה. מוקדם = חפוז, מאוחר = נרדם. הפער הקטן ביותר מנצח — זה שליטה בקצב, לא מהירות. גם הקטן יכול לנצח.",
    setup: "3–4 פודים במרחקים שונים (5 / 8 / 12 מ'). כולם על קו הזינוק.",
    minPods: 1, minAth: 1, maxAth: 8,
    settings: [
      { key: "lights", label: "הדלקות", values: [{ v: 5, label: "5" }, { v: 8, label: "8" }, { v: 12, label: "12 🔥" }] },
      { key: "fade", label: "דעיכה", values: [{ v: 3000, label: "~3 שנ'" }, { v: 5000, label: "~5 שנ'" }, { v: 8000, label: "~8 שנ'" }] },
      { key: "fake", label: "פייקים", values: [{ v: 0, label: "בלי" }, { v: 1, label: "עם 😈" }] },
    ],
    scoreLabel: "פער כולל", unit: "ms", lowerIsBetter: true,
  },
};

export const spDefaults = (g: SpGame): SpCfg => Object.fromEntries(SP_DEFS[g].settings.map((s) => [s.key, s.values[Math.min(1, s.values.length - 1)].v]));
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
  hold?: string;      // הפסל: התנוחה שמחזיקים עכשיו
  extra?: string;     // טקסט חופשי לשורה בשלט ("+0.3 חפוז", "רמה 4")
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
  banner: string;                 // מה קורה עכשיו — לשלט ולפודים
  sub?: string;
  /** דו-קרב: הזוג הנוכחי · כוכב: מי בתור */
  focus?: string[];
  level?: number;                 // מבחן הביפ
}

/* ---------- הודעות ---------- */
export type SpCtlOp = "start" | "pause" | "resume" | "stop" | "skip";
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
  txt?: string;              // טקסט גדול על הפוד (שם, תרגיל, תנוחה)
  ic?: string;               // אימוג'י גדול
  sub?: string;
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
  | { a: "sp_hit"; id: number; pid: string; pod: string; ms: number; txt?: string; good?: boolean }
  | { a: "sp_miss"; id: number; pid: string; pod: string }
  | { a: "sp_go"; at: number }                                     // cue: צליל הזינוק
  | { a: "sp_say"; t: string; k?: SpSayKind }
  | { a: "sp_flash"; pod: string }
  | { a: "sp_over"; winner?: string; scores: Record<string, number> };

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
  if (u === "lvl") return `רמה ${v}`;
  return String(v);
};
