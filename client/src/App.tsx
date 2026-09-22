import { useEffect, useState } from "react";
import Home from "./components/Home";
import Room from "./components/Room";
import Mapper from "./components/Mapper";
import GamesShelf from "./components/GamesShelf";
import Daily from "./components/Daily";
import { pageView } from "./lib/analytics";
import { t } from "./lib/locale";

/** ראוטר משחקים: / או /xx/ (בית, xx = שפה) · /r/CODE (חדר) · /daily (סולו). המופע באפליקציה נפרדת (/s) */
export default function App() {
  const [path, setPath] = useState(location.pathname);

  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // page_view ידני לכל מעבר מסך (ה-config ב-analytics.ts לא שולח אוטומטית) — נתיב מנורמל
  useEffect(() => { pageView(path); }, [path]);
  // כותרת הטאב בשפה שנבחרה (השרת מזריק לפי הקישור/המדינה; אחרי בחירה ידנית ב-🌐 רק זה מעדכן)
  useEffect(() => {
    const r = path.match(/^\/r\/([A-Za-z]{4})$/);
    document.title = r ? t("meta.room", { code: r[1].toUpperCase() }) : path === "/daily" ? t("meta.daily") : t("meta.title");
  }, [path]);

  // נתיבי מופע ישנים — מפנים לאפליקציית המופע (קישורים/כרטיסים שכבר הודפסו ממשיכים לעבוד)
  if (path === "/show") { location.replace("/s"); return null; }
  const showMatch = path.match(/^\/show\/([A-Za-z]{3,10})$/);
  if (showMatch) { location.replace(`/s/t/${showMatch[1].toUpperCase()}${location.search}`); return null; }

  const roomMatch = path.match(/^\/r\/([A-Za-z]{4})$/);
  if (roomMatch) return <Room code={roomMatch[1].toUpperCase()} />;
  if (path === "/mapper") return <Mapper />;
  // ‎/games שמור לעמוד ה-SEO הסטטי — מדף המשחקים באפליקציה חי ב-/play
  if (path === "/play") return <GamesShelf />;
  if (path === "/daily") return <Daily />;
  // ‎/es/ ‎/ko/ … — דף הבית בשפה (כתובות ה-SEO; השפה עצמה נקבעת ב-locale.ts לפי הנתיב)
  return <Home />;
}

export function navigate(to: string) {
  history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
