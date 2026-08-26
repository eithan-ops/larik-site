import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// פונטים מקומיים — בלי תלות ב-Google Fonts (קריטי לאולם בלי קליטה). שניהם כוללים תת-קבוצה עברית.
import "@fontsource/suez-one";              // תצוגה: כותרות, מספרים גדולים, שמות משחקים
import "@fontsource-variable/assistant";    // גוף הטקסט
import "./styles.css";
import "./tokens.css";     // הפלטה — חייב לבוא אחרי styles.css
import "./stickers.css";   // שכבת המראה — חייבת לבוא אחרונה
import { initAnalytics } from "./lib/analytics";

initAnalytics();

// טעינה אחת מוצלחת = האפליקציה שרדה (סורקים QR בכניסה, עובד גם כשהקליטה נעלמת בפנים)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => { /* דפדפן ישן */ }));
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
