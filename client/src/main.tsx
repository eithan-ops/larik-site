import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { watchInstallPrompt } from "./lib/install";
// פונטים מקומיים — בלי תלות ב-Google Fonts (קריטי לאולם בלי קליטה). שניהם כוללים תת-קבוצה עברית.
import "@fontsource/suez-one";              // תצוגה: כותרות, מספרים גדולים, שמות משחקים
import "@fontsource-variable/assistant";    // גוף הטקסט
import "./styles.css";
import "./tokens.css";     // הפלטה — חייב לבוא אחרי styles.css
import "./stickers.css";   // שכבת המראה — חייבת לבוא אחרונה
import "./hofrim.css";     // מסך החופרים (מסך מלא משלו)
import "./abyss.css";      // מסך התהום (מסך מלא משלו)
import "./floors.css";     // מסך הקומות (מסך מלא משלו)
import { initAnalytics } from "./lib/analytics";

initAnalytics();

// טעינה אחת מוצלחת = האפליקציה שרדה (סורקים QR בכניסה, עובד גם כשהקליטה נעלמת בפנים)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => { /* דפדפן ישן */ }));
}

// חייב לרוץ לפני הרינדור — כרום יורה את אירוע ההתקנה מוקדם, ומי שלא תפס אותו איבד אותו
watchInstallPrompt();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
