/**
 * שכבת החיישנים — חימוש (הרשאות iOS) + זיהוי מצח/הצצה בג'ירו.
 */

export interface Capabilities {
  motion: boolean;
  audio: boolean;
}

/** "חמש את הטלפון" — לחיצה אחת שפותחת הכול (חובה בתוך מחוות משתמש ב-iOS) */
export async function armPhone(): Promise<Capabilities> {
  let motion = false;
  const DME = (window as any).DeviceMotionEvent;
  const DOE = (window as any).DeviceOrientationEvent;
  try {
    if (DOE?.requestPermission) {
      motion = (await DOE.requestPermission()) === "granted";
    } else if (DME?.requestPermission) {
      motion = (await DME.requestPermission()) === "granted";
    } else {
      motion = "DeviceOrientationEvent" in window;
    }
  } catch { motion = false; }

  // Wake Lock — שהמסך לא יכבה באמצע משחק
  try { await (navigator as any).wakeLock?.request("screen"); } catch { /* לא קריטי */ }
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") {
      try { await (navigator as any).wakeLock?.request("screen"); } catch { /* */ }
    }
  });

  return { motion, audio: true };
}

export type ForeheadState = "unknown" | "on-forehead" | "peeking" | "down";

/**
 * זיהוי מצח: הטלפון אנכי (מסך כלפי חוץ) ליד הראש.
 * beta ≈ 90 = הטלפון עומד; הצצה = הטלפון מוטה חזרה לכיוון הפנים (beta קטן).
 * ספים נדיבים + היסטרזיס כדי לא להציק. פולבק ידני קיים ב-UI.
 */
export function watchForehead(cb: (s: ForeheadState) => void): () => void {
  let last: ForeheadState = "unknown";
  let stableCount = 0;
  const handler = (e: DeviceOrientationEvent) => {
    const beta = e.beta ?? 0; // -180..180
    let next: ForeheadState;
    if (beta > 60 && beta < 120) next = "on-forehead";
    else if (beta > 15 && beta <= 55) next = "peeking";
    else next = "down";
    if (next === last) {
      stableCount++;
    } else {
      stableCount = 0;
      last = next;
    }
    if (stableCount === 4) cb(next); // ~4 דגימות יציבות = אירוע
  };
  window.addEventListener("deviceorientation", handler);
  return () => window.removeEventListener("deviceorientation", handler);
}
