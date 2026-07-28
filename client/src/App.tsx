import { useEffect, useState } from "react";
import Home from "./components/Home";
import Room from "./components/Room";
import Mapper from "./components/Mapper";

/** ראוטר משחקים: / (בית) · /r/CODE (חדר). המופע עבר לאפליקציה נפרדת (/s) */
export default function App() {
  const [path, setPath] = useState(location.pathname);

  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // נתיבי מופע ישנים — מפנים לאפליקציית המופע (קישורים/כרטיסים שכבר הודפסו ממשיכים לעבוד)
  if (path === "/show") { location.replace("/s"); return null; }
  const showMatch = path.match(/^\/show\/([A-Za-z]{3,10})$/);
  if (showMatch) { location.replace(`/s/t/${showMatch[1].toUpperCase()}${location.search}`); return null; }

  const roomMatch = path.match(/^\/r\/([A-Za-z]{4})$/);
  if (roomMatch) return <Room code={roomMatch[1].toUpperCase()} />;
  if (path === "/mapper") return <Mapper />;
  return <Home />;
}

export function navigate(to: string) {
  history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
