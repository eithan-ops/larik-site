/**
 * "נגיעת המוות" — צד לקוח. תפקיד סודי; בחלון ציד מניחים טלפון ומרימים ידיים.
 * הרוצח נוגע במסך של הקורבן → הטלפון מדווח נגיעה. סבב האשמה בהצבעה.
 */
import { useEffect, useRef, useState } from "react";
import type { DeathTouchServerMsg } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";
import { t, lt } from "../lib/locale";

type Phase = "role" | "hunt" | "accuse" | "reveal" | "dead";

export default function DeathTouchView({ room, me, conn, hub }: GameViewProps) {
  const [role, setRole] = useState<"killer" | "civilian" | "">("");
  const [phase, setPhase] = useState<Phase>("role");
  const [amHunting, setAmHunting] = useState(false);
  const [alive, setAlive] = useState<string[]>([]);
  const [dead, setDead] = useState<string[]>([]);
  const [voted, setVoted] = useState("");
  const [msg, setMsg] = useState("");
  const [toast, setToast] = useState("");
  const [until, setUntil] = useState(0);
  const [, setTick] = useState(0);
  const phaseRef = useRef<Phase>("role");
  phaseRef.current = phase;
  const iAmDead = dead.includes(me);

  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? "";
  const emojiOf = (pid: string) => room.players.find((p) => p.id === pid)?.emoji ?? "🙂";
  function showToast(m: string) { setToast(m); window.setTimeout(() => setToast(""), 3000); }

  useEffect(() => hub.subscribe((d) => {
    const m = d as DeathTouchServerMsg;
    switch (m.a) {
      case "dt_role":
        setRole(m.role);
        setMsg(m.role === "killer" ? t("deathtouch.you_killer", { n: m.killers ?? 1 }) : t("deathtouch.you_civilian"));
        return;
      case "dt_phase":
        setUntil(m.until);
        if (m.phase === "hunt") { setPhase("hunt"); if (!iAmDead) { Sfx.alarm(); vibrate([100, 60, 100]); } }
        if (m.phase === "accuse") { setPhase("accuse"); setVoted(""); }
        return;
      case "dt_hunt":
        setAmHunting(true); vibrate([50, 30, 50, 30, 200]);
        window.setTimeout(() => setAmHunting(false), 9000);
        return;
      case "dt_killed":
        setDead((ds) => [...ds, m.pid]);
        Sfx.boom();
        if (m.pid === me) { vibrate(600); setPhase("dead"); }
        showToast(t("deathtouch.x_killed", { name: nameOf(m.pid) }));
        return;
      case "dt_accuse": setAlive(m.alive); setPhase("accuse"); setUntil(m.until); return;
      case "dt_alive": setAlive(m.alive); return;
      case "dt_voted": setMsg(t("deathtouch.voted_n", { n: m.count, of: m.total })); return;
      case "dt_result":
        Sfx.ding();
        showToast(m.suspect ? t("deathtouch.x_ejected", { name: nameOf(m.suspect), what: m.wasKiller ? t("deathtouch.killer_bang") : t("deathtouch.innocent") }) : lt(m.msg));
        return;
    }
  }), [hub, me, iAmDead]);

  useEffect(() => {
    let raf = 0;
    const step = () => { setTick((t) => t + 1); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  function huntTouch() {
    if (phaseRef.current === "hunt" && !iAmDead) {
      conn.sendGame({ a: "dt_touched" });
    }
  }

  function vote(pid: string) {
    if (phase !== "accuse" || iAmDead || voted) return;
    setVoted(pid);
    conn.sendGame({ a: "dt_vote", suspect: pid });
    vibrate(40);
  }

  const secs = Math.max(0, Math.ceil((until - conn.serverNow()) / 1000));

  if (phase === "role") {
    return (
      <main className="fullscreen" style={{ background: role === "killer" ? "#1a0d0d" : "var(--bg)" }}>
        <div style={{ fontSize: 80 }}>{role === "killer" ? "🔪" : role === "civilian" ? "😇" : "🎭"}</div>
        <div className="big" style={{ marginTop: 10, color: role === "killer" ? "#ff6b6b" : "#8ff5cc" }}>{msg || t("deathtouch.dealing_roles")}</div>
        <p className="sub" style={{ marginTop: 14, textAlign: "center", padding: "0 24px" }}>
          {role === "killer" ? t("deathtouch.hint_killer") : t("deathtouch.hint_civilian")}
        </p>
        <p className="sub" style={{ marginTop: 20, fontSize: 12 }}>{t("deathtouch.starting")}</p>
      </main>
    );
  }

  if (iAmDead) {
    return (
      <main className="fullscreen" style={{ background: "#140000" }}>
        {toast && <div className="toast" style={{ background: "#ff4d4d", color: "#fff" }}>{toast}</div>}
        <div style={{ fontSize: 70 }}>👻</div>
        <div className="big" style={{ color: "#ff8a8a" }}>{t("deathtouch.you_dead")}</div>
        <p className="sub" style={{ marginTop: 10 }}>{t("deathtouch.poker_face")}</p>
        <p className="sub" style={{ marginTop: 8 }}>{t("deathtouch.alive_list", { names: alive.map(nameOf).join(", ") })}</p>
      </main>
    );
  }

  if (phase === "hunt") {
    return (
      <main className="fullscreen"
        style={{ background: amHunting ? "#2a0808" : "var(--bg)", border: amHunting ? "8px solid #ff4d4d" : "none" }}
        onPointerDown={huntTouch}>
        {toast && <div className="toast" style={{ background: "#ff4d4d", color: "#fff" }}>{toast}</div>}
        {amHunting ? (
          <>
            <div style={{ fontSize: 74 }} className="shake">🔪</div>
            <div className="big" style={{ color: "#ff6b6b" }}>{t("deathtouch.go_touch")}</div>
            <p className="sub" style={{ marginTop: 10 }}>{t("deathtouch.reach_now")}</p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 74 }} className="pulse">🖐️</div>
            <div className="big">{t("deathtouch.hands_up")}</div>
            <p className="sub" style={{ marginTop: 10, textAlign: "center", padding: "0 24px" }}>
              {t("deathtouch.phone_down", { s: secs })}
            </p>
          </>
        )}
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100dvh", padding: 18 }}>
      {toast && <div className="toast" style={{ background: "#ff4d4d", color: "#fff" }}>{toast}</div>}
      <h1 className="brand" style={{ textAlign: "center" }}>{t("deathtouch.who_killer")}</h1>
      <p className="sub" style={{ textAlign: "center", marginBottom: 6 }}>{t("deathtouch.vote_suspect", { s: secs })}</p>
      <p className="sub" style={{ textAlign: "center", marginBottom: 14 }}>{msg}</p>
      <div className="players-grid">
        {alive.filter((p) => p !== me).map((pid) => (
          <button key={pid} className={"pbadge" + (voted === pid ? " armed" : "")}
            style={{ borderColor: voted === pid ? "#ff4d4d" : undefined }}
            onPointerDown={() => vote(pid)}>
            <span className="em">{emojiOf(pid)}</span>
            <span className="nm">{nameOf(pid)}</span>
          </button>
        ))}
      </div>
      {voted && <p className="sub" style={{ textAlign: "center", marginTop: 16 }}>{t("deathtouch.you_voted", { name: nameOf(voted) })}</p>}
    </main>
  );
}
