/**
 * אפליקציית המופע — מעטפת דקה מעל מנגנון ה-i18n הראשי (lib/locale): אותה הכרעת שפה (מדינה / ?l= / 🌐),
 * אותם 7 שפות, המחרוזות ב-locales/<lang>/show.json (מרחב-שמות "show"). ה-API הישן (t/getLang/setLang/isRtl)
 * נשמר כדי שהמסכים לא ישתנו; המותג מרוכז ב-BRAND.
 */
import { t as tt, currentLang, setLang as setLocaleLang, isRtlLang, initLocale, loadNs } from "./locale";
import type { Lang } from "../../../shared/i18n";
export type { Lang };

export const BRAND = "LARIK SHOW";

/** מפתח קצר ("landTagline") → "show.landTagline" */
export const t = (key: string, params?: Record<string, string | number | undefined>): string => tt(`show.${key}`, params);

export const getLang = (): Lang => currentLang();
export const setLang = (l: Lang): void => setLocaleLang(l);
export const isRtl = (): boolean => isRtlLang();

/** לקרוא פעם אחת בעליית האפליקציה — שפה, כיוון, פונטים, ואז המילון של המופע */
export async function initShow(): Promise<Lang> {
  const l = await initLocale();
  await loadNs("show");
  return l;
}

/** קידומת הנתיבים: בדומיין show.* האפליקציה יושבת בשורש, אחרת תחת /s */
export const showPrefix = () =>
  location.hostname.startsWith("show.") ? "" : "/s";
