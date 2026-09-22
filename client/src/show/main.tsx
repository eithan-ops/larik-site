/** אפליקציית המופע 🕯️ — כניסה נפרדת ורזה (בלי המשחקים). 7 שפות, כמו האפליקציה הראשית. */
import React from "react";
import ReactDOM from "react-dom/client";
import ShowApp from "./ShowApp";
import "@fontsource-variable/rubik"; // פונט מקומי — עובד גם בלי רשת חיצונית
import "../styles.css";
import "../i18n.css";       // כיווניות, פונטים לכל כתב, 🌐 — חייב אחרון
import { initShow } from "../lib/i18n";
import { initAnalytics } from "../lib/analytics";

initAnalytics();

// טעינה אחת מוצלחת = האפליקציה שרדה (קריטי לאולם בלי קליטה)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => { /* דפדפן ישן */ }));
}

initShow().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ShowApp />
    </React.StrictMode>,
  );
});
