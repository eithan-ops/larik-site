"use client";
import { useEffect, useRef, useState } from "react";

/** מספר שנספר-עולה בסגנון Revolut — הכסף אף פעם לא "מתעדכן", הוא עולה. */
export default function CountUp({ agorot }: { agorot: number }) {
  const [shown, setShown] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const start = shown;
    const t0 = performance.now();
    const dur = 900;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(start + (agorot - start) * e);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agorot]);
  return <>₪ {(shown / 100).toFixed(2)}</>;
}
