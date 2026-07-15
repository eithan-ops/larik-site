/**
 * "טריוויה" — צד לקוח. שאלה מגיעה כ-cue מסונכרן; עונים מהר, ניקוד לפי מהירות.
 */
import { useEffect, useRef, useState } from "react";
import type { TriviaServerMsg } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";

interface Q { qId: number; q: string; options: string[]; index: number; total: number; at: number; until: number }
const OPT_COLORS = ["#ff4d9d", "#5c8aff", "#ffce3c", "#00E676"];
const ANSWER_MS = 12_000;

export default function TriviaView({ room, me, conn, hub }: GameViewProps) {
  const [q, setQ] = useState<Q | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [reveal, setReveal] = useState<{ correct: number; tally: number[]; gained: Record<string, number> } | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [answered, setAnswered] = useState(0);
  const [, setTick] = useState(0);
  const qRef = useRef<Q | null>(null);
  qRef.current = q;

  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? "";

  useEffect(() => hub.subscribe((d, at) => {
    const m = d as TriviaServerMsg;
    switch (m.a) {
      case "tv_q":
        setQ({ qId: m.qId, q: m.q, options: m.options, index: m.index, total: m.total, at, until: at + ANSWER_MS });
        setChosen(null); setReveal(null); setAnswered(0);
        Sfx.goBeep(); vibrate(40);
        return;
      case "tv_answered": setAnswered(m.count); return;
      case "tv_reveal":
        setReveal({ correct: m.correct, tally: m.tally, gained: m.gained });
        setScores(m.scores);
        if (chosen === m.correct) { Sfx.fanfare(); vibrate([40, 30, 80]); } else { Sfx.sadTrombone(); }
        return;
    }
  }), [hub, chosen]);

  useEffect(() => {
    let raf = 0;
    const step = () => { setTick((t) => t + 1); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  function answer(i: number) {
    if (!q || chosen !== null || reveal) return;
    setChosen(i);
    conn.sendGame({ a: "tv_answer", qId: q.qId, choice: i, atServer: conn.serverNow() });
    vibrate(30);
  }

  if (!q) {
    return (
      <main className="fullscreen">
        <div style={{ fontSize: 56 }} className="pulse">🧠</div>
        <div className="big" style={{ marginTop: 8 }}>טריוויה</div>
        <p className="sub" style={{ marginTop: 8 }}>מתכוננים... כולם עונים בו-זמנית!</p>
      </main>
    );
  }

  const secs = Math.max(0, Math.ceil((q.until - conn.serverNow()) / 1000));
  const gained = reveal?.gained[me];

  return (
    <main style={{ minHeight: "100dvh", padding: 16, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="chip">{q.index + 1}/{q.total}</span>
        {!reveal ? <span className="chip" style={{ color: secs <= 4 ? "#ff8a8a" : undefined }}>⏱️ {secs}s</span>
          : <span className="chip">ענו {answered}</span>}
      </div>
      <div className="card" style={{ marginTop: 14, textAlign: "center", padding: "22px 16px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.4 }}>{q.q}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
        {q.options.map((opt, i) => {
          const isCorrect = reveal && i === reveal.correct;
          const isMine = chosen === i;
          const dim = reveal && !isCorrect;
          return (
            <button key={i} onPointerDown={() => answer(i)} disabled={chosen !== null || !!reveal}
              style={{
                border: isMine ? "3px solid #fff" : "none", borderRadius: 16, padding: "20px 10px", fontSize: 16, fontWeight: 800,
                color: "#0b0c11", background: OPT_COLORS[i], opacity: dim ? 0.35 : 1, minHeight: 74,
                boxShadow: isCorrect ? "0 0 24px #00e676" : "none", transition: "opacity .2s",
                position: "relative",
              }}>
              {opt}
              {isCorrect && <span style={{ position: "absolute", top: 4, left: 6, fontSize: 18 }}>✓</span>}
              {reveal && <span style={{ position: "absolute", bottom: 2, right: 8, fontSize: 12, color: "#0b0c11aa" }}>{reveal.tally[i]}</span>}
            </button>
          );
        })}
      </div>
      {reveal ? (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          {chosen === reveal.correct
            ? <div className="big popin" style={{ color: "var(--money)", fontSize: 26 }}>+{gained} 🎉</div>
            : <div className="big" style={{ color: "#ff8a8a", fontSize: 22 }}>{chosen === null ? "לא ענית" : "טעות"} 😬</div>}
          <div className="card" style={{ marginTop: 12, maxWidth: 300, margin: "12px auto 0", padding: 10 }}>
            {Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([pid, s], idx) => (
              <div key={pid} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "3px 4px" }}>
                <span>{idx === 0 ? "👑 " : ""}{nameOf(pid)}{pid === me ? " (אני)" : ""}</span>
                <b style={{ color: "var(--money)" }}>{s}</b>
              </div>
            ))}
          </div>
        </div>
      ) : chosen !== null ? (
        <p className="sub" style={{ textAlign: "center", marginTop: 16 }}>ננעל! מחכים לכולם... ({answered})</p>
      ) : (
        <p className="sub" style={{ textAlign: "center", marginTop: 16 }}>גע בתשובה — מהר יותר = יותר נקודות!</p>
      )}
    </main>
  );
}
