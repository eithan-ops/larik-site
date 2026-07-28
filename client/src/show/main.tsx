/** אפליקציית המופע 🕯️ — כניסה נפרדת ורזה (בלי המשחקים). דו-לשונית he/en. */
import React from "react";
import ReactDOM from "react-dom/client";
import ShowApp from "./ShowApp";
import "@fontsource-variable/rubik"; // פונט מקומי — עובד גם בלי רשת חיצונית
import "../styles.css";
import { applyLangDir } from "../lib/i18n";
import { initAnalytics } from "../lib/analytics";

applyLangDir();
initAnalytics();

// טעינה אחת מוצלחת = האפליקציה שרדה (קריטי לאולם בלי קליטה)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => { /* דפדפן ישן */ }));
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ShowApp />
  </React.StrictMode>,
);
