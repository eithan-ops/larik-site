/**
 * שפות לאריק — משותף לשרת וללקוח.
 * הכלל (15.9.2026): אין מסך בחירת שפה. השפה נקבעת לפי המדינה שבה פותחים את האפליקציה:
 * ישראל → עברית תמיד · ארה"ב → אנגלית תמיד · מדינה בלי שפה נתמכת → אנגלית.
 * סדר ההכרעה המלא בלקוח: ?l= בקישור לחדר → בחירה ידנית שמורה (🌐) → מדינה לפי IP → en.
 */
export const LANGS = ["he", "en", "es", "pt", "ko", "ja", "ar"] as const;
export type Lang = (typeof LANGS)[number];

/** שם השפה בשפה עצמה — לתפריט 🌐 */
export const LANG_NAMES: Record<Lang, string> = {
  he: "עברית", en: "English", es: "Español", pt: "Português", ko: "한국어", ja: "日本語", ar: "العربية",
};

const RTL_LANGS: ReadonlySet<string> = new Set(["he", "ar"]);
export const isRtl = (l: string): boolean => RTL_LANGS.has(l);
export const dirOf = (l: string): "rtl" | "ltr" => (isRtl(l) ? "rtl" : "ltr");

export function asLang(x: unknown): Lang | null {
  return typeof x === "string" && (LANGS as readonly string[]).includes(x) ? (x as Lang) : null;
}

/** מדינה (ISO 3166-1 alpha-2) → שפה. מה שלא כאן → אנגלית. */
export const COUNTRY_TO_LANG: Readonly<Record<string, Lang>> = {
  IL: "he",
  // אנגלית — ברירת המחדל ממילא; רשומים למען הבהירות
  US: "en", GB: "en", CA: "en", AU: "en", NZ: "en", IE: "en", PH: "en", IN: "en", SG: "en", ZA: "en", NG: "en", KE: "en",
  // ספרדית ניטרלית (לטינית) — כולל ספרד
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es", EC: "es", GT: "es", CU: "es", BO: "es",
  DO: "es", HN: "es", PY: "es", SV: "es", NI: "es", CR: "es", PA: "es", UY: "es", PR: "es",
  // פורטוגזית ברזילאית — גם לפורטוגל
  BR: "pt", PT: "pt", AO: "pt", MZ: "pt",
  KR: "ko",
  JP: "ja",
  // ערבית (MSA) — המפרץ, המזרח התיכון וצפון אפריקה
  SA: "ar", AE: "ar", EG: "ar", JO: "ar", IQ: "ar", KW: "ar", QA: "ar", BH: "ar", OM: "ar",
  MA: "ar", DZ: "ar", TN: "ar", LY: "ar", LB: "ar", SY: "ar", YE: "ar", SD: "ar", PS: "ar",
};

export function langForCountry(cc: string | null | undefined): Lang {
  return COUNTRY_TO_LANG[(cc || "").toUpperCase()] ?? "en";
}
