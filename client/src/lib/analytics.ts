/**
 * Google Analytics 4 — נטען רק אם הוגדר מזהה.
 * ה-ID מגיע מחשבון ה-GA של איתן (analytics.google.com → Data Streams → Measurement ID).
 * כל עוד ריק — האתר לא טוען שום דבר של גוגל.
 */
export const GA_ID = ""; // ← להדביק כאן G-XXXXXXXXXX

declare global {
  interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; }
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
  window.gtag("config", GA_ID);
}

/** אירוע מותאם — היסטוריה עמידה ב-GA גם כשהשרת ב-Render מתאפס */
export function track(event: string, params?: Record<string, string | number>) {
  window.gtag?.("event", event, params);
}
