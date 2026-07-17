/**
 * "השדים הקטנים" — צד לקוח.
 */
import { useEffect, useRef, useState } from "react";
import type { DemonsServerMsg } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";

interface Dot { id: number; x: number; y: number }
interface Demon { id: number; kind: number; from: string; born: number; dur: number; x: number; y: number }
const METER_MAX = 12;
const SPRITE = ["/demons/d0.png", "/demons/d1.png", "/demons/d2.png", "/demons/d3.png"];
const FALL = ["👹", "👺", "😈", "👿"];

export default function DemonsView({ room, me, conn, hub }: GameViewProps) {
  const [phase, setPhase] = useState<"wait" | "play" | "done">("wait");
  const [until, setUntil] = useState(0);
  const [dots, setDots] = useState<Dot[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [meter, setMeter] = useState(0);
  const [demons, setDemons] = useState<Demon[]>([]);
  const [picking, setPicking] = useState(false);
  const [, setTick] = useState(0);
  const dotSeq = useRef(0);
  const meterRef = useRef(0);
  meterRef.current = meter;

  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? "";
  const emojiOf = (pid: string) => room.players.find((p) => p.id === pid)?.emoji ?? "🙂";

  useEffect(() => hub.subscribe((d) => {
    const m = d as DemonsServerMsg;
    switch (m.a) {
      case "dm_begin": setUntil(m.until); setPhase("play"); Sfx.countBeep(); return;
      case "dm_score":
        setScores(m.scores);
        if (m.meters[me] != null) setMeter(m.meters[me]);
        return;
      case "dm_demon":
        if (m.target === me) {
          const born = conn.serverNow();
          setDemons((ds) => [...ds, { id: Math.floor(born), kind: m.kind, from: m.from, born, dur: m.dur, x: 10 + Math.random() * 50, y: 15 + Math.random() * 55 }]);
          Sfx.alarm(); vibrate([80, 40, 80]);
          window.setTimeout(() => setDemons((ds) => ds.filter((x) => x.born !== born)), m.dur);
        }
        return;
      case "dm_end": setScores(m.scores); setPhase("done"); return;
    }
  }), [hub, me, conn]);

  useEffect(() => {
    let raf = 0;
    const step = () => { setTick((t) => t + 1); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (phase !== "play") return;
    const iv = window.setInterval(() => {
      setDots((ds) => ds.length >= 4 ? ds : [...ds, { id: ++dotSeq.current, x: 8 + Math.random() * 78, y: 14 + Math.random() * 66 }]);
    }, 750);
    return () => window.clearInterval(iv);
  }, [phase]);

  function hitDot(id: number) {
    setDots((ds) => ds.filter((x) => x.id !== id));
    conn.sendGame({ a: "dm_hit" });
    Sfx.pop(); vibrate(20);
  }

  function sendDemon(target: string) {
    setPicking(false);
    conn.sendGame({ a: "dm_send", target });
    setMeter(0);
    Sfx.goBeep();
  }

  const secs = Math.max(0, Math.ceil((until - conn.serverNow()) / 1000));
  const myScore = scores[me] ?? 0;
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  if (phase === "done") {
    return (
      <main className="fullscreen">
        <div style={{ fontSize: 54 }}>👹</div>
        <div className="big">נגמר!</div>
        <div className="card" style={{ marginTop: 16, width: "100%", maxWidth: 300 }}>
          {ranked.map(([pid, s], i) => (
            <div key={pid} style={{ display: "flex", justifyContent: "space-between", padding: "4px 6px" }}>
              <span>{i === 0 ? "👑 " : ""}{emojiOf(pid)} {nameOf(pid)}</span>
              <b style={{ color: "var(--money)" }}>{s}</b>
            </div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="fullscreen" style={{ background: "#0b0c11", justifyContent: "flex-start", paddingTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "0 16px", alignItems: "center" }}>
        <span className="chip">⏱️ {secs}s</span>
        <span className="chip" style={{ color: "var(--money)" }}>נקודות: {myScore}</span>
      </div>
      <div style={{ width: "88%", marginTop: 10 }}>
        <div className="rub-bar" style={{ height: 12 }}>
          <div style={{ width: `${Math.min(100, (meter / METER_MAX) * 100)}%`, background: "linear-gradient(90deg,#b26bff,#ff4d9d)" }} />
        </div>
        <button className="btn social" style={{ marginTop: 8, padding: 12, opacity: meter >= METER_MAX ? 1 : 0.4 }}
          disabled={meter < METER_MAX} onPointerDown={() => setPicking(true)}>
          👹 שגר שד ליריב!
        </button>
      </div>
      <div style={{ position: "relative", flex: 1, width: "100%", marginTop: 8, overflow: "hidden" }}>
        {phase === "play" && secs > 57 && (
          <div className="big pulse" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>מוכנים? 👹</div>
        )}
        {dots.map((dot) => (
          <button key={dot.id}
            onPointerDown={() => hitDot(dot.id)}
            style={{
              position: "absolute", left: `${dot.x}%`, top: `${dot.y}%`, width: 62, height: 62, borderRadius: "50%",
              border: "none", background: "radial-gradient(circle at 35% 30%, #7dffb8, #00c853)", boxShadow: "0 0 22px #00e67699",
              fontSize: 26, animation: "popin .2s",
            }}>⭐</button>
        ))}
        {demons.map((dm) => (
          <img key={dm.id} src={SPRITE[dm.kind]} alt=""
            onError={(e) => { const el = e.target as HTMLImageElement; el.replaceWith(document.createTextNode(FALL[dm.kind])); }}
            style={{ position: "absolute", left: `${dm.x}%`, top: `${dm.y}%`, width: 150, height: 150, objectFit: "contain", zIndex: 20, animation: "wobble .5s infinite", pointerEvents: "none" }} />
        ))}
      </div>
      {picking && (
        <div className="scan-overlay" style={{ background: "#000c", justifyContent: "center" }} onPointerDown={() => setPicking(false)}>
          <h2 style={{ marginBottom: 12 }}>למי לשלוח שד? 👹</h2>
          <div className="players-grid" style={{ padding: "0 20px" }}>
            {room.players.filter((p) => p.id !== me && p.connected && (room.gamePids?.includes(p.id) ?? true)).map((p) => (
              <button key={p.id} className="pbadge" onPointerDown={(e) => { e.stopPropagation(); sendDemon(p.id); }}>
                <span className="em">{p.emoji}</span>
                <span className="nm">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
