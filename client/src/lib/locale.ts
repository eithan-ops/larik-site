/**
 * שכבת השפה של אפליקציית המשחקים — בלי ספריות, בלי משקל.
 *
 * • הטלפון מוריד רק את השפה שלו: locales/<lang>/common.json הוא chunk נפרד (import.meta.glob).
 * • אין מסך בחירה. סדר ההכרעה: ?l= בקישור לחדר → בחירה ידנית שמורה (🌐) → המדינה שהשרת זיהה
 *   (window.__LARIK, מוזרק ל-index.html) → en.
 * • t("key", {name, n}) — {n, plural, one {…} other {…}} דרך Intl.PluralRules (ערבית: 6 צורות, קוריאנית/יפנית: 1).
 * • החלפת שפה = reload (כמו באפליקציית המופע) — פשוט, אמין, ואפס עבודה בזמן משחק.
 * • ⚠️ הסנכרון (שעון, cue-ים, טיק) לא נוגע בקובץ הזה: t() הוא חיפוש במילון סטטי בזמן רינדור בלבד.
 */
import { asLang, dirOf, type Lang } from "../../../shared/i18n";

declare global {
  interface Window { __LARIK?: { country?: string; lang?: string } }
}

const KEY = "larik-lang";
type Dict = Record<string, string>;
let lang: Lang = "he";
let dict: Dict = {};
let rules: Intl.PluralRules | null = null;

/** מה השפה של הקישור לחדר (מארח שיתף `?l=xx`) — חייבת לנצח, כדי שכל הטלפונים בחדר יהיו באותה שפה */
function langFromUrl(): Lang | null {
  return asLang(new URLSearchParams(location.search).get("l"));
}

export function resolveInitialLang(): Lang {
  let saved: string | null = null;
  try { saved = localStorage.getItem(KEY); } catch { /* מצב פרטי */ }
  return langFromUrl() ?? asLang(saved) ?? asLang(window.__LARIK?.lang) ?? "en";
}

export const currentLang = (): Lang => lang;
export const isRtlLang = (): boolean => dirOf(lang) === "rtl";

/** ISO של המדינה שהשרת זיהה (לחפיסות תוכן לפי מדינה בעתיד) */
export const currentCountry = (): string => (window.__LARIK?.country || "").toUpperCase();

/** בחירה ידנית דרך 🌐 — נשמרת ומרעננת */
export function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* מצב פרטי */ }
  const u = new URL(location.href);
  u.searchParams.delete("l"); // הקישור לא ינצח את הבחירה הידנית
  location.replace(u.toString());
}

/** קישור לחדר שנושא את שפת החדר — כך אורח שסורק מקבל את השפה של המארח */
export function roomUrl(code: string): string {
  return `${location.origin}/r/${code}?l=${lang}`;
}

/** ה-JSON של כל שפה = chunk נפרד; רק אחד נטען. */
const loaders = import.meta.glob<{ default: Dict }>("../locales/*/common.json");

/** לקרוא פעם אחת לפני הרינדור הראשון */
export async function initLocale(): Promise<Lang> {
  lang = resolveInitialLang();
  const load = loaders[`../locales/${lang}/common.json`] ?? loaders["../locales/en/common.json"];
  try { dict = (await load()).default; } catch { dict = {}; }
  try { rules = new Intl.PluralRules(lang); } catch { rules = null; }
  document.documentElement.lang = lang;
  document.documentElement.dir = dirOf(lang);
  await loadFonts(lang);
  return lang;
}

/** פונטים לכתב של השפה בלבד — יפני לא יורד לישראלי. Suez One + Assistant (עברית+לטינית) נטענים תמיד ב-main. */
async function loadFonts(l: Lang) {
  try {
    if (l === "ar") { await Promise.all([import("@fontsource/lalezar/arabic.css"), import("@fontsource-variable/cairo")]); }
    else if (l === "ko") { await Promise.all([import("@fontsource/jua/korean.css"), import("@fontsource-variable/noto-sans-kr")]); }
    else if (l === "ja") { await Promise.all([import("@fontsource/dela-gothic-one/japanese.css"), import("@fontsource-variable/noto-sans-jp")]); }
  } catch { /* בלי פונט ייעודי — המערכת תציג את הכתב בפונט שלה */ }
}

type Params = Record<string, string | number | undefined>;

/**
 * t("lobby.connected_n", { n: 3 })
 * תבניות: {name} · {n, plural, one {מחובר} other {מחוברים}} (מותר # בתוך הענף = המספר)
 */
export function t(key: string, params?: Params): string {
  const raw = dict[key];
  if (raw === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key "${key}" for ${lang}`);
    return key;
  }
  return params ? format(raw, params) : raw;
}

export const has = (key: string): boolean => dict[key] !== undefined;

function format(s: string, p: Params): string {
  // 1. ריבוי — {n, plural, one {...} other {...}}
  s = s.replace(/\{(\w+),\s*plural,\s*((?:\w+\s*\{[^{}]*\}\s*)+)\}/g, (_m, name: string, branches: string) => {
    const n = Number(p[name] ?? 0);
    const cat = rules ? rules.select(n) : n === 1 ? "one" : "other";
    const map: Record<string, string> = {};
    for (const b of branches.matchAll(/(\w+)\s*\{([^{}]*)\}/g)) map[b[1]] = b[2];
    return (map[`=${n}`] ?? map[cat] ?? map.other ?? "").replace(/#/g, String(n));
  });
  // 2. השמה פשוטה — {name}
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (p[k] === undefined ? m : String(p[k])));
}

/** טקסט של משחק מהקטלוג: שם/טאגליין/הסבר לפי השפה, עם נפילה לעברית שבקוד */
export function gameText(g: { id: string; name: string; tagline: string; howTo?: string }) {
  return {
    name: has(`games.${g.id}.name`) ? t(`games.${g.id}.name`) : g.name,
    tagline: has(`games.${g.id}.tagline`) ? t(`games.${g.id}.tagline`) : g.tagline,
    howTo: has(`games.${g.id}.howTo`) ? t(`games.${g.id}.howTo`) : (g.howTo ?? g.tagline),
  };
}
