/**
 * "פודים" — צד לקוח. הטלפון = פוד אור על השולחן.
 * ההדלקות מגיעות כ-cue מתוזמן: כל הפודים מגיבים באותה המילישנייה,
 * והנגיעה נמדדת בזמן-שרת — מדידת תגובה הוגנת גם ברשת איטית.
 */
import { useEffect, useRef, useState } from "react";
import type { PodsServerMsg } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";

interface Light { id: number; color: string; at: number }

export default function PodsView({ room, me, conn, hub }: GameViewProps) {
  const [mode, setMode] = useState<"king" | "survival" | "">("");
  const [myColor, setMyColor] = useState("");
  const [runner, setRunner] = useState("");
  const [light, setLight] = useState<Light | null>(null); // הפוד שלי דולק?
  const [scores, setScores] = useState<Record<string, number>>({});
  const [avg, setAvg] = useState<Record<string, number>>({});
  const [lastHit, setLastHit] = useState<{ pid: string; ms: number } | null>(null);
  const [dead, setDead] = useState<string[]>([]);
  const lightRef = useRef<Light | null>(null);
  lightRef.current = light;

  function nameOf(pid: string) { return room.players.find((p) => p.id === pid)?.name ?? ""; }

  useEffect(() => hub.subscribe((d, at) => {
    const m = d as PodsServerMsg;
    switch (m.a) {
      case "pd_mode":
        setMode(m.mode);
        if (m.colors) setMyColor(m.colors[me] ?? "");
        return;
      case "pd_runner":
        setRunner(m.pid);
        setLastHit(null);
        if (m.pid === me) { Sfx.fanfare(); vibrate([80, 60, 80]); }
        else Sfx.ding();
        return;
      case "pd_light":
        // cue מתוזמן — כרגע הוא כבר "בזמן": מדליקים מיד
        if (m.podId === me) {
          setLight({ id: m.lightId, color: m.color, at });
          Sfx.goBeep(); vibrate(50);
        }
        return;
      case "pd_off":
        if (lightRef.current?.id === m.lightId) setLight(null);
        return;
      case "pd_hit":
        setLight(null);
        setLastHit({ pid: m.pid, ms: m.reactionMs });
        Sfx.pop();
        return;
      case "pd_miss":
        setLight(null);
        Sfx.sadTrombone();
        return;
      case "pd_eliminated":
        setDead((ds) => [...ds, m.pid]);
        if (m.pid === me) vibrate(500);
        return;
      case "pd_score":
        setScores(m.scores);
        if (m.avgMs) setAvg(m.avgMs);
        return;
    }
  }), [hub, me]);

  /* ---- הפוד שלי דולק — כל המסך הופך לכפתור ---- */
  function tap() {
    const l = lightRef.current;
    if (!l) return;
    conn.sendGame({ a: "pd_tap", lightId: l.id, atServer: conn.serverNow() });
    setLight(null);
    vibrate(30);
  }

  if (light) {
    return (
      <main className="fullscreen" style={{ background: light.color }} onPointerDown={tap}>
        <div className="huge" style={{ color: "#0B0C11" }}>👆</div>
        <div className="big" style={{ color: "#0B0C11" }}>גע!</div>
      </main>
    );
  }

  const iAmDead = dead.includes(me);
  const iAmRunner = runner === me;

  return (
    <main className="fullscreen" style={{
      background: iAmDead ? "#1a0f14" : "#05060d",
      border: myColor ? `6px solid ${myColor}` : "none",
    }}>
      <div style={{ fontSize: 44 }}>⚡</div>

      {mode === "king" && (
        <>
          <div className="big" style={{ marginTop: 8 }}>
            {iAmRunner ? "רוץ! הפודים שלך!" : runner ? `${nameOf(runner)} רץ!` : "פודים"}
          </div>
          {lastHit && (
            <p className="sub popin" style={{ fontSize: 22, marginTop: 10, color: "var(--money)", fontWeight: 900 }}>
              {(lastHit.ms / 1000).toFixed(2)} שנ' ⚡
            </p>
          )}
          <p className="sub" style={{ marginTop: 14 }}>
            {iAmRunner ? "כשפוד נדלק — גע בו הכי מהר שאתה יכול" : "החזק את הטלפון גלוי — אתה פוד במשחק שלו"}
          </p>
        </>
      )}

      {mode === "survival" && (
        <>
          <div className="big" style={{ marginTop: 8, color: iAmDead ? "#ff8a8a" : myColor }}>
            {iAmDead ? "נפסלת 💀 (אבל אתה עדיין פוד!)" : "הישרדות"}
          </div>
          {!iAmDead && <p className="sub" style={{ marginTop: 10 }}>
            כשהצבע <b style={{ color: myColor }}>שלך</b> נדלק על פוד כלשהו — רוץ וגע בו!
          </p>}
          {dead.length > 0 && <p className="sub" style={{ marginTop: 8 }}>
            נפלו: {dead.map(nameOf).join(", ")}
          </p>}
        </>
      )}

      {Object.keys(scores).length > 0 && (
        <div className="card" style={{ marginTop: 20, width: "100%", maxWidth: 300, padding: 10 }}>
          {Object.entries(scores).sort((a, b) => b[1] - a[1]).map(([pid, s]) => (
            <div key={pid} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "3px 4px" }}>
              <span>{nameOf(pid)}</span>
              <b style={{ color: "var(--money)" }}>{s}{avg[pid] ? ` · ${(avg[pid] / 1000).toFixed(2)}s` : ""}</b>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
