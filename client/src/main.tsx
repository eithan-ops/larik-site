import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource-variable/rubik"; // פונט מקומי — בלי תלות ב-Google Fonts (קריטי לאולם בלי קליטה)
import "./styles.css";
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
