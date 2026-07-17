import { useEffect, useState } from "react";
import Home from "./components/Home";
import Room from "./components/Room";
import ShowGate from "./components/ShowGate";
import Mapper from "./components/Mapper";

/** ראוטר מינימלי: / (בית) · /r/CODE (חדר) · /show/CODE (כרטיס מופע 🎫) */
export default function App() {
  const [path, setPath] = useState(location.pathname);

  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const roomMatch = path.match(/^\/r\/([A-Za-z]{4})$/);
  if (roomMatch) return <Room code={roomMatch[1].toUpperCase()} />;
  const showMatch = path.match(/^\/show\/([A-Za-z]{3,10})$/);
  if (showMatch) return <ShowGate code={showMatch[1].toUpperCase()} />;
  if (path === "/mapper") return <Mapper />;
  return <Home />;
}

export function navigate(to: string) {
  history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
