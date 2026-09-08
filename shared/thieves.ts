/**
 * הגנבים 🥷 — סבב 5: העצירה, הקלפים והמודים (משותף לשרת וללקוח).
 *
 * הלולאה: 6 × (58 שנ' משחק + 12 שנ' עצירה) + דקת האזעקה = 8:00. בעצירה כולם קופאים (cue),
 * כל אחד מקבל מדף אישי של 4 קלפים עם מחיר — 🦝 השחקן · 🏠 הבית · המסלול שלך (אבולוציה כשיש) · ג'וקר —
 * וקונה אחד לכל היותר. המחיר יורד מהניקוד (מטבע אחד) ונגזר מהזהב החציוני בחדר, כך שתמיד יש מה לקנות.
 * הקלפים הם מודים על `ThMods`; הקוד בשרת ובלקוח קורא את המודים, לא את הקלפים.
 *
 * ההודעות של הסבב הזה חיות כאן (לא ב-protocol.ts — הכלל מ-4.9); הישנות (th_pos, th_grab…) נשארות שם.
 */

export type ThTrack = "p" | "h" | "j";                         // 🦝 שחקן · 🏠 בית · 🃏 ג'וקר
export type ThRarity = "c" | "u" | "r" | "x" | "e";            // רגיל · לא-שכיח · נדיר · כאוס/מקולל · אבולוציה
export type ThKind = "passive" | "button" | "instant";

export interface ThCard {
  id: string; ic: string; t: string; d: string;                // אימוג'י · שם (2 מילים) · הסבר (≤8 מילים)
  track: ThTrack; rarity: ThRarity; kind: ThKind;
  stack?: number;                                              // כמה פעמים אפשר לקחת (ברירת מחדל 1)
  needs?: string[];                                            // דורש קלפים (דרגה)
  evo?: [string, string];                                      // אבולוציה: שני המרכיבים
  cd?: number;                                                 // קולדאון לכפתור (ms)
  pos?: "low" | "high";                                        // שיעור לפי מיקום: מוצע יותר לשליש התחתון / למוביל
  sheet?: number;                                              // אינדקס האייקון בגיליון (client/public/thieves/cards.webp)
}

export interface ThMods {
  speed: number;            // מכפיל מהירות
  carryCap: number;         // צ'אנקים ביד
  stolenSlow: number;       // המכפיל כשסוחבים שלל (0.74 בסיס; קל רגליים מעלה)
  mineMs: number;           // זמן צ'אנק
  pickR: number;            // רדיוס הרמה (מגנט)
  rageMul: number; rageSecs: number;
  stretch: boolean;         // ישורת הבית
  ladder: boolean;          // מתעלם מגדרות
  banana: boolean; soft: boolean; wrench: boolean; circus: boolean;
  dash: boolean; bubble: boolean; pie: boolean; ghost: boolean;
  towerLvl: number;         // 1–3
  rear: boolean;            // מגדל אחורי — אין שטח מת
  fence: number;            // 0 · 1 גדר (×0.5) · 2 חומה (×0.35)
  honey: boolean; bell: boolean; vault: boolean; mine: boolean; fort: boolean;
  ripenMul: number;         // זמן הבשלה (0.7 לדשן)
  incomeMul: number;
}

export const TH_BASE_MODS: ThMods = {
  speed: 1, carryCap: 3, stolenSlow: 0.74, mineMs: 2500, pickR: 0.9, rageMul: 1.4, rageSecs: 15,
  stretch: false, ladder: false, banana: false, soft: false, wrench: false, circus: false,
  dash: false, bubble: false, pie: false, ghost: false,
  towerLvl: 1, rear: false, fence: 0, honey: false, bell: false, vault: false, mine: false, fort: false,
  ripenMul: 1, incomeMul: 1,
};

/** הבנק — עולם 1, v1 (32). `sheet` = תא בגיליון האייקונים: 4 גיליונות × 8 (2 שורות × 4) */
export const TH_CARDS: ThCard[] = [
  /* 🦝 השחקן */
  { id: "sole", ic: "🏃", t: "סוליות רוח", d: "רץ 10% מהר יותר. נערם.", track: "p", rarity: "c", kind: "passive", stack: 3, sheet: 0 },
  { id: "sack", ic: "🎒", t: "שק גדול", d: "סוחב צ'אנק אחד יותר. נערם עד 5.", track: "p", rarity: "c", kind: "passive", stack: 2, sheet: 1 },
  { id: "dash", ic: "💨", t: "דאש", d: "כפתור: זינוק קדימה. חלוקים מפספסים.", track: "p", rarity: "u", kind: "button", cd: 6000, sheet: 2 },
  { id: "feather", ic: "🪶", t: "קל רגליים", d: "שלל גנוב מאט אותך פחות. נערם.", track: "p", rarity: "c", kind: "passive", stack: 2, sheet: 3 },
  { id: "pick", ic: "⛏️", t: "מכוש כבד", d: "חוצב מהר יותר. נערם.", track: "p", rarity: "c", kind: "passive", stack: 2, sheet: 4 },
  { id: "magnet", ic: "🧲", t: "מגנט", d: "מרים שלל שנפל מרחוק.", track: "p", rarity: "u", kind: "passive", sheet: 5 },
  { id: "bubble", ic: "🫧", t: "בועה", d: "כפתור: 2 שנ' אי אפשר להפיל אותך.", track: "p", rarity: "u", kind: "button", cd: 20000, sheet: 6 },
  { id: "pie", ic: "🥧", t: "עוגה", d: "כפתור: זורק עוגה. פגיעה = מהומם שנייה.", track: "p", rarity: "u", kind: "button", cd: 8000, sheet: 7 },
  { id: "wrench", ic: "🔧", t: "מפתח שוודי", d: "נגיעה במגדל זר מכבה אותו ל-8 שנ'.", track: "p", rarity: "u", kind: "passive", cd: 20000, sheet: 8 },
  { id: "rage", ic: "🔥", t: "זעם ארוך", d: "הזעם נמשך 25 שנ' וחזק יותר.", track: "p", rarity: "u", kind: "passive", sheet: 9 },
  { id: "soft", ic: "🐢", t: "נפילה רכה", d: "כשמפילים אותך השלל נופל לידך.", track: "p", rarity: "c", kind: "passive", sheet: 10 },
  { id: "stretch", ic: "🏡", t: "ישורת הבית", d: "+30% מהירות ליד הבית עם שלל.", track: "p", rarity: "c", kind: "passive", sheet: 11 },
  { id: "ladder", ic: "🪜", t: "סולם", d: "גדרות וחומות לא מאטות אותך.", track: "p", rarity: "u", kind: "passive", pos: "low", sheet: 12 },
  { id: "banana", ic: "🍌", t: "בננה", d: "עם שלל ביד אתה משאיר בננות. דורך = מחליק.", track: "p", rarity: "u", kind: "passive", sheet: 13 },
  /* 🏠 הבית */
  { id: "t2", ic: "🗼", t: "מגדל 2", d: "המגדל יורה כל שנייה וטווח גדול יותר.", track: "h", rarity: "c", kind: "passive", sheet: 16 },
  { id: "t3", ic: "🗼", t: "מגדל 3", d: "חלוקים דביקים: ‎-50% מהירות ל-3 שנ'.", track: "h", rarity: "u", kind: "passive", needs: ["t2"], sheet: 17 },
  { id: "rear", ic: "🏯", t: "מגדל אחורי", d: "מגדל קטן בגב — אין יותר שטח מת.", track: "h", rarity: "r", kind: "passive", needs: ["t2"], sheet: 18 },
  { id: "fence", ic: "🧱", t: "גדר", d: "זרים זזים בחצי מהירות במאורה שלך.", track: "h", rarity: "c", kind: "passive", sheet: 19 },
  { id: "wall", ic: "🏰", t: "חומה", d: "זרים כמעט לא זזים במאורה שלך.", track: "h", rarity: "u", kind: "passive", needs: ["fence"], sheet: 19 },
  { id: "honey", ic: "🍯", t: "מלכודת דבש", d: "פולש נדבק שנייה בכניסה.", track: "h", rarity: "c", kind: "passive", sheet: 20 },
  { id: "bell", ic: "🔔", t: "פעמון מוקדם", d: "התרעה ברגע שמישהו מתקרב לבית.", track: "h", rarity: "c", kind: "passive", sheet: 21 },
  { id: "vault", ic: "🔒", t: "כספת", d: "הגביש הכי בשל חסין לגניבה, מייצר חצי.", track: "h", rarity: "u", kind: "passive", sheet: 22 },
  { id: "fert", ic: "🌱", t: "דשן", d: "גבישים מבשילים 30% מהר יותר. נערם.", track: "h", rarity: "c", kind: "passive", stack: 2, sheet: 23 },
  { id: "shelf", ic: "📦", t: "מדף", d: "הכנסת המאורה ‎+15%. נערם.", track: "h", rarity: "c", kind: "passive", stack: 3, sheet: 30 },
  { id: "mine", ic: "🧨", t: "מוקש", d: "הפולש הראשון עף ומהומם. נטען בכל עצירה.", track: "h", rarity: "u", kind: "passive", sheet: 23 },
  /* 🃏 ג'וקרים */
  { id: "rain", ic: "🌀", t: "גשם זהב", d: "עכשיו: 10 צ'אנקים נופלים בכל המפה.", track: "j", rarity: "x", kind: "instant", sheet: 24 },
  { id: "bull", ic: "🐂", t: "ריצת פרים", d: "15 שנ' כולם פי 1.5 מהר.", track: "j", rarity: "x", kind: "instant", sheet: 25 },
  { id: "dark", ic: "🌙", t: "חושך", d: "20 שנ' בלי מיני-מפה לאף אחד.", track: "j", rarity: "x", kind: "instant", sheet: 31 },
  { id: "bighead", ic: "💀", t: "ראש גדול", d: "ההכנסה ‎+25%. אתה 15% איטי.", track: "j", rarity: "x", kind: "passive", pos: "high", sheet: 29 },
  /* ⭐ אבולוציות — מוצעות אוטומטית כשיש שני המרכיבים */
  { id: "ghost", ic: "🌪️", t: "רוח הרפאים", d: "כפתור: 5 שנ' מהירות מלאה עם שלל.", track: "p", rarity: "e", kind: "button", cd: 45000, evo: ["dash", "sole"], sheet: 26 },
  { id: "fort", ic: "🛡️", t: "מצודה", d: "המגדל יורה כפול על מי שסוחב גביש שלך.", track: "h", rarity: "e", kind: "passive", evo: ["t2", "bell"], sheet: 27 },
  { id: "circus", ic: "🎪", t: "קרקס", d: "כל הפלה שלך מהממת ומשאירה בננה.", track: "p", rarity: "e", kind: "passive", evo: ["pie", "banana"], sheet: 28 },
];
export const thCard = (id: string) => TH_CARDS.find((c) => c.id === id);

/** המודים מרשימת הקלפים (עם כפילויות לערימה) — אותה פונקציה בשרת ובלקוח */
export function thMods(cards: string[]): ThMods {
  const m: ThMods = { ...TH_BASE_MODS };
  const n = (id: string) => cards.filter((c) => c === id).length;
  m.speed *= Math.pow(1.1, n("sole"));
  m.carryCap += n("sack");
  m.stolenSlow = Math.min(1, 0.74 + 0.11 * n("feather"));
  m.mineMs = n("pick") >= 2 ? 1600 : n("pick") === 1 ? 2000 : 2500;
  if (n("magnet")) m.pickR = 2.2;
  if (n("rage")) { m.rageMul = 1.5; m.rageSecs = 25; }
  m.stretch = n("stretch") > 0; m.ladder = n("ladder") > 0; m.banana = n("banana") > 0; m.soft = n("soft") > 0;
  m.wrench = n("wrench") > 0; m.circus = n("circus") > 0;
  m.dash = n("dash") > 0; m.bubble = n("bubble") > 0; m.pie = n("pie") > 0; m.ghost = n("ghost") > 0;
  m.towerLvl = n("t3") ? 3 : n("t2") ? 2 : 1;
  m.rear = n("rear") > 0;
  m.fence = n("wall") ? 2 : n("fence") ? 1 : 0;
  m.honey = n("honey") > 0; m.bell = n("bell") > 0; m.vault = n("vault") > 0; m.mine = n("mine") > 0; m.fort = n("fort") > 0;
  m.ripenMul = Math.pow(0.7, Math.min(2, n("fert")));
  m.incomeMul = Math.pow(1.15, Math.min(3, n("shelf"))) * (n("bighead") ? 1.25 : 1);
  if (n("bighead")) m.speed *= 0.85;
  return m;
}
/** הכפתורים הפעילים של שחקן (עד 2 — הסדר קובע את המקום על המסך) */
export const thButtons = (cards: string[]) => ["ghost", "bubble", "pie", "dash"].filter((id) => cards.includes(id)).slice(0, 2);   // רוח הרפאים מחליפה את הדאש על המסך

/* ---------- ציר הזמן ---------- */
export interface ThTiming { segMs: number; pauseMs: number; freezeMs: number; draftMs: number; pauses: number; alarmMs: number }
export const TH_TIMING: ThTiming = { segMs: 58_000, pauseMs: 12_000, freezeMs: 2_000, draftMs: 8_000, pauses: 6, alarmMs: 60_000 };
/** זמן המשחק נטו (בלי העצירות): 6×58 + 60 = 6:48; עם 6×12 שניות עצירה = 8:00 */
export const thPlayMs = (t: ThTiming) => t.segMs * t.pauses + t.alarmMs;

/* ---------- מחירים ---------- */
/** אחוז מהזהב החציוני לקלף רגיל, לפי מספר העצירה (1..6) — יורד כדי שגם בדקה 7 קונים */
export const TH_PRICE_PCT = [0.3, 0.25, 0.2, 0.15, 0.12, 0.1];
export const TH_RARITY_MUL: Record<ThRarity, number> = { c: 1, u: 1.8, r: 3, x: 1.5, e: 2.5 };
export function thPrice(card: ThCard, k: number, median: number, discount: boolean): number {
  const pct = TH_PRICE_PCT[Math.max(0, Math.min(TH_PRICE_PCT.length - 1, k - 1))];
  let p = Math.max(10, median * pct * TH_RARITY_MUL[card.rarity]);
  if (discount) p *= 0.5;
  return p >= 100 ? Math.round(p / 10) * 10 : Math.round(p / 5) * 5;
}

/* ---------- הודעות ---------- */
export interface ThShelfCard { id: string; price: number }
export type ThievesClientMsg5 =
  | { a: "th_buy"; id: string }                                 // קנייה בעצירה (אחת לעצירה)
  | { a: "th_use"; id: string };                                // כפתור יכולת

export type ThievesServerMsg5 =
  | { a: "th_pause"; k: number; at: number; draftAt: number; revealAt: number; resumeAt: number; rank: string[]; gold: Record<string, number> }   // cue — כולם קופאים ב-at
  | { a: "th_shelf"; k: number; cards: ThShelfCard[]; until: number; discount: boolean }   // אישי
  | { a: "th_bought"; pid: string; id: string; price: number }  // פומבי — "מי לקח מה" נבנה מזה
  | { a: "th_reveal"; k: number; picks: Record<string, string | null>; resumeAt: number }   // cue
  | { a: "th_resume"; endsAt: number; towers: [string, string, number][]; nextPauseAt: number }   // אחרי העצירה: הטיימרים זזו
  | { a: "th_cd"; id: string; readyAt: number }                 // אישי — הכפתור מתמלא
  | { a: "th_cards"; pid: string; cards: string[] }             // הבילד של שחקן (סנכרון/הצטרפות)
  | { a: "th_fx"; k: "dash" | "bubble" | "ghost" | "boom" | "honey" | "wrench"; pid: string; x?: number; y?: number; ms?: number }   // dash: x/y = כיוון הדאש
  | { a: "th_pie"; id: number; by: string; x0: number; y0: number; x1: number; y1: number; ms: number }
  | { a: "th_stun"; pid: string; ms: number; why: "pie" | "banana" | "honey" | "mine" | "circus" }
  | { a: "th_banana"; id: number; x: number; y: number; by: string }
  | { a: "th_banana_gone"; id: number; by?: string }
  | { a: "th_rain"; items: [number, number, number, number][] } // [id, x, y, v] — צ'אנקים על הרצפה, מי שמרים סוחב
  | { a: "th_nugget"; id: number; by: string; carry: number }
  | { a: "th_bull"; ms: number }
  | { a: "th_dark"; ms: number }
  | { a: "th_warn"; pid: string }                               // 🔔 פעמון מוקדם — מישהו נכנס לטווח המגדל שלך
  | { a: "th_home_cards"; cards: Record<string, string[]> };   // סנכרון כל הבילדים
