/**
 * "חוקי הצבע" — צד לקוח. המסך מתמלא בצבע + פקודה; נוגעים (או לא) בזמן.
 */
import { useEffect, useRef, useState } from "react";
import type { ColorRulesServerMsg } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";

interface Flash { roundId: number; color: string; label: string; mustTap: boolean; until: number }

export default function ColorRulesView({ room, me, conn, hub }: GameViewProps) {
  const [flash, setFlash] = useState<Flash | null>(null);
  const [lives, setLives] = useState(3);
  const [out, setOut] = useState(false);
  const [msg, setMsg] = useState("מתכוננים...");
  const [tappedRound, setTappedRound] = useState(0);
  const [, setTick] = useState(0);
  const flashRef = useRef<Flash | null>(null);
  flashRef.current = flash;

  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? "";

  useEffect(() => hub.subscribe((d) => {
    const m = d as ColorRulesServerMsg;
    switch (m.a) {
      case "cr_begin": setLives(m.lives); setMsg("שימו לב למסך!"); return;
      case "cr_flash":
        setFlash({ roundId: m.roundId, color: m.color, label: m.label, mustTap: m.mustTap, until: m.until });
        if (m.mustTap) { Sfx.goBeep(); vibrate(40); } else { Sfx.countBeep(); }
        return;
      case "cr_lives":
        if (m.pid === me) { setLives(m.lives); if (m.lives <= 0) setOut(true); }
        return;
      case "cr_resolve":
        setFlash(null);
        if (m.out.includes(me)) { setOut(true); Sfx.sadTrombone(); vibrate(300); }
        setMsg(m.out.length ? `יצאו: ${m.out.map(nameOf).join(", ")}` : "יפה! ממשיכים...");
        return;
    }
  }), [hub, me]);

  useEffect(() => {
    let raf = 0;
    const step = () => { setTick((t) => t + 1); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  function tap() {
    const f = flashRef.current;
    if (!f || out || tappedRound === f.roundId) return;
    setTappedRound(f.roundId);
    conn.sendGame({ a: "cr_tap", roundId: f.roundId, atServer: conn.serverNow() });
    vibrate(30);
    if (!f.mustTap) Sfx.pop();
  }

  if (out) {
    return (
      <main className="fullscreen" style={{ background: "#1a0f14" }}>
        <div style={{ fontSize: 70 }}>💀</div>
        <div className="big" style={{ color: "#ff8a8a" }}>יצאת!</div>
        <p className="sub" style={{ marginTop: 8 }}>תשאר לצפות — מי ישרוד אחרון?</p>
      </main>
    );
  }

  if (flash) {
    const remain = Math.max(0, flash.until - conn.serverNow());
    const light = flash.color === "#f4f6ff";
    return (
      <main className="fullscreen" style={{ background: flash.color, transition: "none" }} onPointerDown={tap}>
        <div className="huge" style={{ color: light ? "#0b0c11" : "#0b0c11", fontSize: "min(16vw,74px)", textAlign: "center", padding: "0 16px" }}>
          {flash.label}
        </div>
        <div style={{ position: "absolute", bottom: 40, fontSize: 20, fontWeight: 900, color: "#0b0c11cc" }}>
          {(remain / 1000).toFixed(1)}
        </div>
        {tappedRound === flash.roundId && (
          <div style={{ position: "absolute", top: 40, fontSize: 40 }}>{flash.mustTap ? "✅" : "🙊"}</div>
        )}
      </main>
    );
  }

  return (
    <main className="fullscreen" style={{ background: "#0b0c11" }}>
      <div style={{ fontSize: 50 }} className="pulse">🎨</div>
      <div className="big" style={{ marginTop: 10 }}>חוקי הצבע</div>
      <p className="sub" style={{ marginTop: 8 }}>{msg}</p>
      <div style={{ marginTop: 16, fontSize: 22 }}>{Array.from({ length: 3 }, (_, i) => (i < lives ? "❤️" : "🖤")).join("")}</div>
      <p className="sub" style={{ marginTop: 20, fontSize: 12, maxWidth: 280, textAlign: "center" }}>
        צבע = גע במסך ובצע את הפקודה. לבן 🤍 = אל תיגע! טעות מורידה לב.
      </p>
    </main>
  );
}
