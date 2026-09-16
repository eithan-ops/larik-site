/**
 * SEO לכל שפה — מה שגוגל רואה בכתובת /xx/ (הכותרת, התיאור, og). משותף לשרת (הזרקה ל-index.html)
 * ולסקריפטים (sitemap). המחרוזות כאן נכתבות לביטויי חיפוש ("party games on your phone", לא "LARIK"):
 * אנשים לא מחפשים את השם, הם מחפשים את הצורך. ביקורת דובר-שפת-אם: ראו GLOSSARY.md.
 *
 * מבנה הכתובות: עברית = השורש https://larik.ai/ (כמו שגוגל כבר מכיר), שאר השפות = /en/ /es/ /pt/ /ko/ /ja/ /ar/.
 * x-default = /en/ (מדינה בלי שפה נתמכת מקבלת אנגלית — אותו כלל של GeoIP).
 */
import { LANGS, type Lang } from "./i18n";

export const SITE = "https://larik.ai";

export type SeoText = { title: string; description: string; og: string; locale: string };

export const SEO: Record<Lang, SeoText> = {
  he: {
    title: "LARIK — משחקי חברה לטלפון, בלי אפליקציה",
    description: "משחקי חברה לטלפון בלי אפליקציה ובלי הרשמה — סורקים QR ומשחקים. מי הכי, על המצח, על הלשון ועוד, כולל חפיסה אישית שה-AI בונה לכל אירוע.",
    og: "סורקים QR ומשחקים ביחד — מי הכי, על המצח, על הלשון ועוד. בלי הורדות, בלי הרשמה, בעברית.",
    locale: "he_IL",
  },
  en: {
    title: "LARIK — Party games on your phone, no app needed",
    description: "Party games to play with friends on your phones — no app, no signup. Scan a QR code and play together: Who's Most Likely, Impostor, Forehead and more. Free.",
    og: "Scan a QR code and play together — no downloads, no signup. Free party games for any group.",
    locale: "en_US",
  },
  es: {
    title: "LARIK — Juegos para fiestas con el celular, sin app",
    description: "Juegos de fiesta para jugar con amigos desde el celular: sin descargar nada y sin registrarse. Escanean un código QR y juegan juntos. Gratis.",
    og: "Escanean un código QR y juegan juntos — sin descargas, sin registro. Juegos de fiesta gratis.",
    locale: "es_ES",
  },
  pt: {
    title: "LARIK — Jogos para festa no celular, sem app",
    description: "Jogos para jogar com amigos no celular: sem baixar nada e sem cadastro. É só escanear o QR code e jogar juntos. Grátis.",
    og: "Escaneie o QR code e jogue com os amigos — sem download, sem cadastro. Jogos de festa grátis.",
    locale: "pt_BR",
  },
  ko: {
    title: "LARIK — 앱 설치 없이 폰으로 즐기는 파티 게임",
    description: "친구들과 스마트폰으로 즐기는 파티 게임. 앱 설치도 회원가입도 없이 QR 코드만 찍으면 바로 함께 플레이. 무료.",
    og: "QR 코드만 찍으면 바로 시작 — 설치도 가입도 없이. 무료 파티 게임.",
    locale: "ko_KR",
  },
  ja: {
    title: "LARIK — アプリ不要、スマホで遊べるパーティーゲーム",
    description: "友達とスマホで遊べるパーティーゲーム。アプリのインストールも登録も不要、QRコードを読み取るだけでみんなで一緒にプレイ。無料。",
    og: "QRコードを読み取るだけでみんなで一緒に — インストール不要、登録不要。無料のパーティーゲーム。",
    locale: "ja_JP",
  },
  ar: {
    title: "LARIK — ألعاب جماعية على الهاتف، بدون تطبيق",
    description: "ألعاب جماعية تلعبونها مع الأصدقاء على هواتفكم: بدون تحميل تطبيق وبدون تسجيل. امسحوا رمز QR والعبوا معًا. مجانًا.",
    og: "امسحوا رمز QR والعبوا معًا — بدون تحميل، بدون تسجيل. ألعاب جماعية مجانية.",
    locale: "ar_AR",
  },
};

/** הכתובת הקנונית של דף הבית בשפה: עברית = השורש, השאר = /xx/ */
export const homeUrl = (l: Lang): string => (l === "he" ? `${SITE}/` : `${SITE}/${l}/`);

/** שפה מתוך נתיב /xx או /xx/ — רק דף הבית, לא נתיבי חדר/משחק */
export function langFromPath(pathname: string): Lang | null {
  const m = pathname.match(/^\/([a-z]{2})\/?$/);
  return m && (LANGS as readonly string[]).includes(m[1]) ? (m[1] as Lang) : null;
}

/** תגי hreflang לכל 7 הגרסאות + x-default — אותו בלוק בכל דף בית, לפי הדרישה של גוגל (הדדיות) */
export function hreflangLinks(): string {
  const links = LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${homeUrl(l)}" />`);
  links.push(`<link rel="alternate" hreflang="x-default" href="${homeUrl("en")}" />`);
  return links.join("\n    ");
}
