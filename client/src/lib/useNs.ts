import { useEffect, useState } from "react";
import { loadNs, nsLoaded } from "./locale";

/**
 * מרחב-השמות של משחק (locales/<lang>/<game>.json) — נטען כשהמשחק נבחר בלובי, כך שכשהוא מתחיל
 * הכול כבר במילון. מחזיר false רק במקרה הנדיר שהמשחק התחיל לפני שה-chunk הגיע.
 */
/** מזהה משחק → מרחב-שמות: כל משחקי ספורט-פודים (sp_*) והפודים חולקים spods.json */
export const nsOfGame = (gameId: string | undefined): string | undefined =>
  !gameId ? undefined : gameId.startsWith("sp_") || gameId === "pods" ? "spods" : gameId;

export function useNs(gameId: string | undefined): boolean {
  const ns = nsOfGame(gameId);
  const [ready, setReady] = useState(() => !ns || nsLoaded(ns));
  useEffect(() => {
    if (!ns) { setReady(true); return; }
    if (nsLoaded(ns)) { setReady(true); return; }
    let alive = true;
    setReady(false);
    void loadNs(ns).then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [ns]);
  return ready;
}
