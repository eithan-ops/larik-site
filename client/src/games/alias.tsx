/**
 * "על הלשון" — צד לקוח. המתאר מחזיק את הטלפון ורואה מילה; השאר צועקים ניחושים.
 */
import { useEffect, useState } from "react";
import type { AliasServerMsg } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";

export default function AliasView({ room, me, conn, hub }: GameViewProps) {
  const [describer, setDescriber] = useState("");
  const [word, setWord] = useState("");
  const [deckName, setDeckName] = useState("");
  const [until, setUntil] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [flash, setFlash] = useState<"" | "ok" | "skip">("");
  const [, setTick] = useState(0);
  const iAmDescriber = describer === me;

  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? "";

  useEffect(() => hub.subscribe((d) => {
    const m = d as AliasServerMsg;
    switch (m.a) {
      case "al_turn":
        setDescriber(m.pid); setUntil(m.until); setDeckName(m.deckName); setWord("");
        if (m.pid === me) { Sfx.goBeep(); vibrate([80, 50, 80]); } else Sfx.ding();
        return;
      case "al_word": setWord(m.word); return;
      case "al_scored":
        setScores((s) => ({ ...s, [m.pid]: m.total }));
        if (m.pid === me) { setFlash("ok"); Sfx.pop(); vibrate(40); window.setTimeout(() => setFlash(""), 350); }
        return;
      case "al_skipped":
        if (m.pid === me) { setFlash("skip"); window.setTimeout(() => setFlash(""), 300); }
        return;
      case "al_turnend": setWord(""); setDescriber(""); return;
    }
  }), [hub, me]);

  useEffect(() => {
    let raf = 0;
    const step = () => { setTick((t) => t + 1); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const secs = Math.max(0, Math.ceil((until - conn.serverNow()) / 1000));
  const danger = secs <= 10;

  if (iAmDescriber) {
    return (
      <main className="fullscreen" style={{ background: flash === "ok" ? "#0a2a16" : "#0b0c11", justifyContent: "space-between", padding: "20px 16px" }}>
        <div style={{ textAlign: "center", marginTop: 6 }}>
          <span className="chip" style={{ color: danger ? "#ff8a8a" : undefined }}>⏱️ {secs}s</span>
          <span className="chip" style={{ marginRight: 8 }}>{deckName}</span>
        </div>
        <div style={{ textAlign: "center" }}>
          <p className="sub">תאר בלי להגיד את המילה:</p>
          <div className="huge" style={{ fontSize: "min(13vw,58px)", margin: "14px 0", lineHeight: 1.15 }}>{word || "..."}</div>
          <p className="sub" style={{ fontSize: 12 }}>ניחשו? לחץ ✓. תקוע? דלג.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn ghost" style={{ flex: 1 }} onPointerDown={() => conn.sendGame({ a: "al_skip" })}>דלג ⏭️</button>
          <button className="btn" style={{ flex: 2 }} onPointerDown={() => conn.sendGame({ a: "al_correct" })}>ניחשו! ✓</button>
        </div>
      </main>
    );
  }

  return (
    <main className="fullscreen" style={{ background: "#0b0c11" }}>
      <div style={{ fontSize: 56 }} className="pulse">👅</div>
      <div className="big" style={{ marginTop: 8 }}>{describer ? `${nameOf(describer)} מתאר!` : "מתכוננים..."}</div>
      <p className="sub" style={{ marginTop: 10, textAlign: "center", padding: "0 24px" }}>
        צעקו את הניחושים שלכם בקול! {describer && `(${secs}s)`}
      </p>
      {Object.keys(scores).length > 0 && (
        <div className="card" style={{ marginTop: 20, width: "100%", maxWidth: 280, padding: 10 }}>
          {Object.entries(scores).sort((a, b) => b[1] - a[1]).map(([pid, s]) => (
            <div key={pid} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "3px 4px" }}>
              <span>{nameOf(pid)}{pid === me ? " (אני)" : ""}</span><b style={{ color: "var(--money)" }}>{s}</b>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
