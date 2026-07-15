/**
 * "סימון מבוזר" — צד לקוח. הטלפון שלך הוא אחד ה"כפתורים" בסיימון ענק.
 */
import { useEffect, useRef, useState } from "react";
import type { SimonServerMsg } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";

export default function SimonView({ room, me, conn, hub }: GameViewProps) {
  const [myColor, setMyColor] = useState("#00E676");
  const [lives, setLives] = useState(3);
  const [phase, setPhase] = useState<"watch" | "input" | "idle">("idle");
  const [lit, setLit] = useState(false);
  const [round, setRound] = useState(0);
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState("מתכוננים...");
  const litTimer = useRef<number | undefined>(undefined);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? "";

  useEffect(() => hub.subscribe((d) => {
    const m = d as SimonServerMsg;
    switch (m.a) {
      case "sm_setup": setMyColor(m.colors[me] ?? "#00E676"); setLives(m.lives); return;
      case "sm_watch": setPhase("watch"); setRound(m.round); setProgress(0); setMsg("צפו ברצף... 👀"); return;
      case "sm_light":
        if (m.pid === me) {
          setLit(true); Sfx.goBeep(); vibrate(60);
          window.clearTimeout(litTimer.current);
          litTimer.current = window.setTimeout(() => setLit(false), 420);
        } else { Sfx.tick(); }
        return;
      case "sm_input": setPhase("input"); setMsg("עכשיו שחזרו! גע כשזה תורך 👆"); return;
      case "sm_progress":
        setProgress(m.index);
        if (m.pid === me) { Sfx.pop(); vibrate(30); }
        return;
      case "sm_wrong":
        setLives(m.lives); Sfx.sadTrombone(); vibrate(300);
        setMsg(`אופס! היה תור של ${nameOf(m.expected)}. מתחילים שוב...`);
        setPhase("idle");
        return;
    }
  }), [hub, me]);

  function tap() {
    if (phaseRef.current !== "input") return;
    conn.sendGame({ a: "sm_tap" });
    setLit(true); vibrate(30);
    window.clearTimeout(litTimer.current);
    litTimer.current = window.setTimeout(() => setLit(false), 200);
  }

  const active = phase === "input";
  return (
    <main className="fullscreen"
      style={{ background: lit ? myColor : "#0b0c11", border: `8px solid ${myColor}`, transition: "background .08s" }}
      onPointerDown={tap}>
      <div style={{ position: "absolute", top: 20, fontSize: 22 }}>
        {Array.from({ length: 3 }, (_, i) => (i < lives ? "💚" : "🖤")).join("")}
      </div>
      <div style={{ fontSize: 54 }} className={active ? "pulse" : ""}>{active ? "👆" : "🟩"}</div>
      <div className="big" style={{ marginTop: 10, color: lit ? "#0b0c11" : "#fff" }}>
        {phase === "watch" ? "צפו" : phase === "input" ? "שחזרו!" : "סימון"}
      </div>
      <p className="sub" style={{ marginTop: 10, color: lit ? "#0b0c11" : undefined, textAlign: "center", padding: "0 20px" }}>{msg}</p>
      {round > 0 && <p className="sub" style={{ marginTop: 8, color: lit ? "#0b0c11" : undefined }}>אורך רצף: {round} · שוחזרו: {progress}</p>}
    </main>
  );
}
