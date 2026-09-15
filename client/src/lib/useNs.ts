import { useEffect, useState } from "react";
import { loadNs, nsLoaded } from "./locale";

/**
 * מרחב-השמות של משחק (locales/<lang>/<game>.json) — נטען כשהמשחק נבחר בלובי, כך שכשהוא מתחיל
 * הכול כבר במילון. מחזיר false רק במקרה הנדיר שהמשחק התחיל לפני שה-chunk הגיע.
 */
export function useNs(ns: string | undefined): boolean {
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
