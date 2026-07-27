/**
 * Service Worker — "טעינה אחת מצליחה = האפליקציה שרדה".
 * בנוי לתרחיש אולם בלי קליטה: מי שסרק את ה-QR בכניסה (איפה שיש קליטה)
 * ממשיך לעבוד גם כשהרשת נעלמת בפנים.
 * - נכסים עם hash (assets/, פונטים, אייקונים): cache-first — הם immutable.
 * - ניווטים (דפי החדר): network-first עם נפילה ל-shell השמור.
 * - API/WS לא נוגעים — חיבור חי בלבד.
 */
const CACHE = "larik-v1";
const SHELL = "/__shell";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/ws")) return;

  // נכסים חתומי-hash — פעם אחת ברשת, לתמיד מהמטמון
  if (url.pathname.startsWith("/assets/") || /\.(png|woff2?|webmanifest|svg)$/.test(url.pathname)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    })());
    return;
  }

  // ניווט (SPA — כל נתיב מחזיר את אותו index.html): רשת קודם, מטמון כגיבוי
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) c.put(SHELL, res.clone());
        return res;
      } catch {
        const shell = await c.match(SHELL);
        if (shell) return shell;
        throw new Error("offline, no shell cached");
      }
    })());
  }
});
