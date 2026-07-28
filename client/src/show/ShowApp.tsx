/**
 * ראוטר אפליקציית המופע: / (לנדינג לדיג'י) · /r/CODE (חדר מופע).
 * עובד גם תחת הקידומת /s (larik.ai/s/...) וגם בשורש (show.larik.ai/...).
 */
import { useEffect, useState } from "react";
import ShowLanding from "./ShowLanding";
import ShowRoom from "./ShowRoom";
import ShowGate from "../components/ShowGate";

/** מנקים את קידומת /s אם קיימת — אותו ראוטר לשני הדומיינים */
function cleanPath(): string {
  const p = location.pathname;
  return p === "/s" ? "/" : p.startsWith("/s/") ? p.slice(2) : p;
}

export default function ShowApp() {
  const [path, setPath] = useState(cleanPath());

  useEffect(() => {
    const onPop = () => setPath(cleanPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const roomMatch = path.match(/^\/r\/([A-Za-z]{4})$/);
  if (roomMatch) return <ShowRoom code={roomMatch[1].toUpperCase()} />;
  // שער כרטיס 🎫 לאירועים ממופים (QR עם מושב): /t/CODE — וגם הנתיב הישן /show/CODE
  const ticketMatch = path.match(/^\/(?:t|show)\/([A-Za-z]{3,10})$/);
  if (ticketMatch) return <ShowGate code={ticketMatch[1].toUpperCase()} />;
  return <ShowLanding />;
}

export function navigate(to: string) {
  history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
