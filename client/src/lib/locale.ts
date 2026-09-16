/**
 * שכבת השפה של אפליקציית המשחקים — בלי ספריות, בלי משקל.
 *
 * • הטלפון מוריד רק את השפה שלו: locales/<lang>/common.json הוא chunk נפרד (import.meta.glob).
 * • אין מסך בחירה. סדר ההכרעה: ?l= בקישור לחדר / דף בית בשפה (/es/) → בחירה ידנית שמורה (🌐) → המדינה שהשרת זיהה
 *   (window.__LARIK, מוזרק ל-index.html) → en.
 * • t("key", {name, n}) — {n, plural, one {…} other {…}} דרך Intl.PluralRules (ערבית: 6 צורות, קוריאנית/יפנית: 1).
 * • החלפת שפה = reload (כמו באפליקציית המופע) — פשוט, אמין, ואפס עבודה בזמן משחק.
 * • ⚠️ הסנכרון (שעון, cue-ים, טיק) לא נוגע בקובץ הזה: t() הוא חיפוש במילון סטטי בזמן רינדור בלבד.
 */
import { asLang, dirOf, type Lang } from "../../../shared/i18n";
import { langFromPath } from "../../../shared/seo";
import type { LText } from "../../../shared/protocol";

declare global {
  interface Window { __LARIK?: { country?: string; lang?: string } }
}

const KEY = "larik-lang";
type Dict = Record<string, string>;
let lang: Lang = "he";
let dict: Dict = {};
let rules: Intl.PluralRules | null = null;

/** מה השפה של הקישור: `?l=xx` (קישור לחדר — חייב לנצח, כל הטלפונים בחדר באותה שפה)
 *  או דף הבית בשפה `/es/` (כתובת ה-SEO שגוגל מציג בכל מדינה — מי שהגיע ממנה רוצה את השפה הזאת) */
function langFromUrl(): Lang | null {
  return asLang(new URLSearchParams(location.search).get("l")) ?? asLang(langFromPath(location.pathname));
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

/** קישור לחדר שנושא את שפת החדר — כך אורח שסורק מקבל את השפה של המארח.
 *  `src` = מאיפה הגיע המצטרף (qr / wa / sh) — נקרא באנליטיקה ב-room_joined. */
export function roomUrl(code: string, src?: "qr" | "wa" | "sh"): string {
  return `${location.origin}/r/${code}?l=${lang}${src ? `&s=${src}` : ""}`;
}

/**
 * כל קובץ JSON = chunk נפרד; נטען רק לשפה הנוכחית. common נטען לפני הרינדור הראשון,
 * מרחב-שמות של משחק (locales/<lang>/<game>.json) נטען כשהמשחק נבחר בלובי — כמה KB, פעם אחת.
 */
const loaders = import.meta.glob<{ default: Dict }>("../locales/*/*.json");
const loadedNs = new Set<string>();
const pendingNs = new Map<string, Promise<void>>();

/** טוען מרחב-שמות (common / metro / …) לשפה הנוכחית ומאחד למילון. אין קובץ לשפה → נופל לאנגלית → כלום. */
export function loadNs(ns: string): Promise<void> {
  if (loadedNs.has(ns)) return Promise.resolve();
  const p = pendingNs.get(ns);
  if (p) return p;
  const load = loaders[`../locales/${lang}/${ns}.json`] ?? loaders[`../locales/en/${ns}.json`];
  const run = (async () => {
    if (load) { try { dict = { ...dict, ...(await load()).default }; } catch { /* בלי תרגום — המפתחות יוצגו */ } }
    loadedNs.add(ns); pendingNs.delete(ns);
  })();
  pendingNs.set(ns, run);
  return run;
}
export const nsLoaded = (ns: string): boolean => loadedNs.has(ns);

/** לקרוא פעם אחת לפני הרינדור הראשון */
export async function initLocale(): Promise<Lang> {
  lang = resolveInitialLang();
  await loadNs("common");
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

/** טקסט מהשרת: מחרוזת (ישן) כמו שהיא, {k,p} מתורגם כאן */
export function lt(x: LText | undefined | null): string {
  if (x === undefined || x === null) return "";
  return typeof x === "string" ? x : t(x.k, x.p);
}

/** מספרים לתצוגה בשפה הנוכחית (ערבית — ספרות מערביות, כמו במשחקים במפרץ) */
const nf = () => { try { return new Intl.NumberFormat(lang, { numberingSystem: "latn" }); } catch { return null; } };
let numFmt: Intl.NumberFormat | null | undefined;
export function fmtNum(n: number): string {
  if (numFmt === undefined) numFmt = nf();
  return numFmt ? numFmt.format(n) : String(n);
}

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

/** תווית של אפשרות בלובי (configOptions): games.<id>.opt.<key> / games.<id>.opt.<key>.<v>, עם נפילה לעברית שבקטלוג */
export function optText(gameId: string, key: string, fallback: string, v?: string): string {
  const k = v === undefined ? `games.${gameId}.opt.${key}` : `games.${gameId}.opt.${key}.${v}`;
  return has(k) ? t(k) : fallback;
}

/** טקסט של משחק מהקטלוג: שם/טאגליין/הסבר לפי השפה, עם נפילה לעברית שבקוד */
export function gameText(g: { id: string; name: string; tagline: string; howTo?: string }) {
  return {
    name: has(`games.${g.id}.name`) ? t(`games.${g.id}.name`) : g.name,
    tagline: has(`games.${g.id}.tagline`) ? t(`games.${g.id}.tagline`) : g.tagline,
    howTo: has(`games.${g.id}.howTo`) ? t(`games.${g.id}.howTo`) : (g.howTo ?? g.tagline),
  };
}
