/**
 * Google Analytics 4 — נטען רק אם הוגדר מזהה.
 * ה-ID מגיע מחשבון ה-GA של איתן (analytics.google.com → Data Streams → Measurement ID).
 * כל עוד ריק — האתר לא טוען שום דבר של גוגל.
 *
 * עקרונות המדידה (15.9.2026):
 * - page_view נשלח ידנית (send_page_view:false) עם נתיב מנורמל — ‎/r/KFRT הופך ל-‎/room,
 *   אחרת כל חדר הוא "דף" משלו ודוחות הדפים הופכים לזבל. ב-GA צריך לכבות את
 *   "Page changes based on browser history events" ב-Enhanced measurement, שלא ייספר פעמיים.
 * - אירועי המשחק (game_started / game_ended / game_aborted) נורים מ-Room.tsx לפי מעבר
 *   שלב שהשרת אישר — לא מלחיצת כפתור — ולכן מכסים את כל המשחקים, כולל עתידיים, בלי קוד במשחק.
 * - כל אירוע נושא role (host/guest): role=host = "פעם אחת לחדר", כולם = "לכל שחקן".
 * - ‎?ga_debug=1 בכתובת מדליק DebugView ב-GA לסשן הזה.
 */
export const GA_ID = "G-CPM104G7JW"; // חשבון LARIK · property "LARIK" · stream "LARIK Web" (חובר 28.7.2026)

declare global {
  interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; }
}

export type Params = Record<string, string | number | boolean>;

const DEBUG_KEY = "larik-ga-debug";

function isDebug(): boolean {
  try {
    if (new URLSearchParams(location.search).has("ga_debug")) sessionStorage.setItem(DEBUG_KEY, "1");
    return sessionStorage.getItem(DEBUG_KEY) === "1";
  } catch { return false; }
}

/** מאיפה הגיע הטלפון לחדר — נגזר מ-‎?s= שמצורף ל-QR ולקישורי השיתוף */
export function entrySource(): string {
  const s = new URLSearchParams(location.search).get("s");
  if (s === "qr" || s === "wa" || s === "sh") return s;
  if (document.referrer) return "ref";
  return "direct";
}

/** מותקן כאפליקציה (PWA) או דפדפן רגיל */
function displayMode(): string {
  const nav = navigator as unknown as { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone ? "pwa" : "browser";
}

/** כמה משחקים המכשיר הזה סיים אי-פעם — נשמר מקומית ומשודר כמאפיין משתמש (דלי, לא מספר) */
const TOTAL_KEY = "larik-games-total";
export function gamesTotal(): number { return Number(localStorage.getItem(TOTAL_KEY)) || 0; }
export function bumpGamesTotal(): number {
  const n = gamesTotal() + 1;
  try { localStorage.setItem(TOTAL_KEY, String(n)); } catch { /* מצב פרטי */ }
  setUserProps({ games_bucket: bucket(n) });
  return n;
}
function bucket(n: number): string {
  return n === 0 ? "0" : n === 1 ? "1" : n <= 3 ? "2-3" : n <= 9 ? "4-9" : n <= 29 ? "10-29" : "30+";
}

export function initAnalytics() {
  if (!GA_ID) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer!.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { send_page_view: false, ...(isDebug() ? { debug_mode: true } : {}) });
  setUserProps({
    app_lang: document.documentElement.lang || "he",
    display_mode: displayMode(),
    games_bucket: bucket(gamesTotal()),
  });
}

/** מאפייני משתמש — נצמדים לכל אירוע שיבוא אחריהם (שפה, PWA, כמה שיחק) */
export function setUserProps(props: Params) {
  window.gtag?.("set", "user_properties", props);
}

/** צפייה בדף עם נתיב מנורמל — חדר = ‎/room, לא ‎/r/KFRT */
export function pageView(path: string) {
  const norm = path.replace(/^\/r\/[A-Za-z]{4}$/, "/room").replace(/^\/s\/r\/[A-Za-z]{4}$/, "/show/room");
  window.gtag?.("event", "page_view", { page_path: norm, page_location: `${location.origin}${norm}`, page_title: document.title });
}

/** אירוע מותאם — היסטוריה עמידה ב-GA גם כשהשרת ב-Render מתאפס */
export function track(event: string, params?: Params) {
  window.gtag?.("event", event, params);
}

/** אירוע שנורה פעם אחת לכל מפתח (למשל: ניתוק אחד לחדר, לא עשרה) */
const once = new Set<string>();
export function trackOnce(key: string, event: string, params?: Params) {
  if (once.has(key)) return;
  once.add(key);
  track(event, params);
}
