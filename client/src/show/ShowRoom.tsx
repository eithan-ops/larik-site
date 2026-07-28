/**
 * חדר מופע 🕯️ — גרסה רזה של Room לאפליקציית המופע בלבד.
 * דיג'י (?dj=1 או המארח): בוחר אוטומטית את המופע, מקבל QR ולובי, ואז את הקונסולה.
 * קהל: שם → המתנה מרגשת → הטלפון נהיה אור. דו-לשוני he/en.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { navigate } from "./ShowApp";
import type { RoomSnapshot } from "../../../shared/protocol";
import { Connection, defaultServerUrl } from "../lib/connection";
import { unlockAudio, Sfx, vibrate } from "../lib/audio";
import { GameHub } from "../lib/gamehub";
import { track } from "../lib/analytics";
import QRCodeView from "../components/QRCodeView";
import ShowView from "../games/show";
import { t, getLang, setLang, showPrefix } from "../lib/i18n";

type Stage = "name" | "arm" | "in";

const DOT_EMOJIS = ["🔵", "🟣", "🟢", "🟡", "🟠", "🔴", "🟤", "⚪", "🟦", "🟪", "🟩", "🟨"];
function autoEmoji(): string {
  const saved = localStorage.getItem("larik-emoji-auto");
  if (saved) return saved;
  const e = DOT_EMOJIS[Math.floor(Math.random() * DOT_EMOJIS.length)];
  localStorage.setItem("larik-emoji-auto", e);
  return e;
}

export default function ShowRoom({ code }: { code: string }) {
  const isRejoin = !!sessionStorage.getItem(`larik-pid-${code}`) && !!localStorage.getItem("larik-name");
  const [stage, setStage] = useState<Stage>(isRejoin ? "arm" : "name");
  const [name, setName] = useState(localStorage.getItem("larik-name") || "");
  const [emoji] = useState(autoEmoji());
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [me, setMe] = useState("");
  const [fatal, setFatal] = useState("");
  const connRef = useRef<Connection | null>(null);
  const roomRef = useRef<RoomSnapshot | null>(null);
  const hub = useMemo(() => new GameHub(), []);
  const pfx = showPrefix();

  function armAndJoin() {
    unlockAudio(); // חייב בתוך מחוות משתמש
    Sfx.ding();
    vibrate(60);
    localStorage.setItem("larik-name", name);
    const conn = new Connection(defaultServerUrl(), code, {
      onWelcome: (pid, r) => { setMe(pid); setRoom(r); roomRef.current = r; },
      onRoom: (r) => { setRoom(r); roomRef.current = r; },
      onGame: (d) => hub.emit(d, 0),
      onCue: (d, at) => hub.emit(d, at),
      onError: (m) => { if (!roomRef.current) setFatal(m || t("roomGone")); },
      onStatus: () => { /* צ'יפ סטטוס לא קריטי במופע */ },
    });
    connRef.current = conn;
    conn.connect(name.trim() || (getLang() === "he" ? "אורח" : "guest"), emoji);
    conn.send({ t: "arm" });
    track("room_joined");
    setStage("in");
  }

  useEffect(() => () => connRef.current?.close(), []);

  // Wake Lock — הטלפון הוא פיקסל; אסור שהמסך יכבה
  const phase = room?.phase;
  useEffect(() => { if (phase !== "game") hub.reset(); }, [phase, hub]);
  useEffect(() => {
    if (stage !== "in") return;
    let lock: { release?: () => Promise<void> } | undefined;
    let active = true;
    const req = () => (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<never> } })
      .wakeLock?.request("screen")
      .then((l: { release?: () => Promise<void> }) => { if (active) lock = l; else l.release?.(); })
      .catch(() => { /* דפדפן ישן */ });
    req();
    const onVis = () => { if (document.visibilityState === "visible") req(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { active = false; document.removeEventListener("visibilitychange", onVis); lock?.release?.(); };
  }, [stage]);

  // הדיג'י (המארח) — המופע נבחר אוטומטית
  useEffect(() => {
    if (room && me === room.hostId && room.phase === "lobby" && !room.gameId) {
      connRef.current?.send({ t: "select_game", gameId: "show", config: {} });
    }
  }, [room, me]);

  /* ---------- כניסה ---------- */
  if (stage === "name") {
    return (
      <main style={{ justifyContent: "center" }}>
        <button className="chip sc-chipbtn" style={{ position: "fixed", top: 14, insetInlineEnd: 14, zIndex: 5 }}
          onClick={() => setLang(getLang() === "he" ? "en" : "he")}>
          🌐 {getLang() === "he" ? "English" : "עברית"}
        </button>
        <div className="logo-big" style={{ fontSize: 30, marginBottom: 14 }}>LARIK SHOW</div>
        <form className="card popin" style={{ padding: 18 }}
          onSubmit={(e) => { e.preventDefault(); armAndJoin(); }}>
          <h2 style={{ textAlign: "center", marginBottom: 4 }}>{t("joinTitle")}</h2>
          <p className="sub" style={{ textAlign: "center", marginBottom: 14, fontSize: 13 }}>
            {t("joinSub")}<br />
            <span style={{ fontSize: 11.5 }}>{t("joinNote")}</span>
          </p>
          <input className="input" placeholder={t("joinPh")} value={name} maxLength={14} autoFocus
            onChange={(e) => setName(e.target.value)} />
          <button className="btn" type="submit" style={{ marginTop: 14 }}>
            {t("joinBtn")}
          </button>
        </form>
      </main>
    );
  }

  if (stage === "arm") {
    return (
      <main style={{ justifyContent: "center", textAlign: "center" }}>
        <div style={{ fontSize: 84 }} className="pulse">⚡</div>
        <h1 style={{ margin: "12px 0 8px" }}>{t("rejoinTitle")}</h1>
        <p className="sub" style={{ marginBottom: 26 }}>{t("rejoinSub")}</p>
        <button className="btn gold" onClick={armAndJoin}>{t("rejoinBtn")}</button>
      </main>
    );
  }

  /* ---------- בתוך החדר ---------- */
  if (fatal && !room) {
    return (
      <main style={{ justifyContent: "center", textAlign: "center" }}>
        <div style={{ fontSize: 64 }}>🕳️</div>
        <h1 style={{ margin: "12px 0 6px" }}>{t("roomGone")}</h1>
        <button className="btn" style={{ maxWidth: 300, margin: "18px auto 0" }} onClick={() => navigate(pfx || "/")}>
          {t("backHome")}
        </button>
      </main>
    );
  }
  if (!room) {
    return <main style={{ justifyContent: "center", textAlign: "center" }}>
      <div className="pulse" style={{ fontSize: 60 }}>🪐</div>
      <p className="sub">{t("connecting")} ({code})</p>
    </main>;
  }

  const isHost = me === room.hostId;
  const conn = connRef.current!;
  const connectedCount = room.players.filter((p) => p.connected).length;
  const lightCount = Math.max(0, connectedCount - 1); // בלי הדיג'י

  function leave() {
    conn.send({ t: "leave" });
    conn.close();
    navigate(pfx || "/");
  }

  // המופע רץ — הקונסולה או הפיקסל
  if (room.phase === "game" && room.gameId === "show") {
    return (
      <>
        {isHost ? (
          <button className="exit-fab" onClick={() => conn.send({ t: "back_to_lobby" })}>{t("endShow")}</button>
        ) : (
          <button className="exit-fab" onClick={leave}>🚪</button>
        )}
        <ShowView room={room} me={me} conn={conn} hub={hub} />
      </>
    );
  }

  /* ---------- לובי ---------- */
  if (!isHost) {
    return (
      <main style={{ justifyContent: "center", textAlign: "center" }}>
        <div className="pulse" style={{ fontSize: 76 }}>🕯️</div>
        <h1 className="shimmer" style={{ margin: "16px 0 10px", fontSize: 24 }}>{t("guestTitle")}</h1>
        <p className="sub" style={{ fontSize: 15, lineHeight: 1.7, maxWidth: 320, margin: "0 auto 22px" }}>
          {t("guestBody")}
          <br /><b style={{ color: "var(--text)" }}>{t("guestStarting")}</b>
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 26 }}>
          <span className="chip">{t("chipBright")}</span>
          <span className="chip">{t("chipOut")}</span>
          <span className="chip">{t("chipNoLock")}</span>
        </div>
        <p className="sub popin" style={{ fontSize: 13 }}>
          {lightCount} {lightCount === 1 ? t("lightOn") : t("lightsOn")} 💜
        </p>
        <button className="btn ghost" style={{ marginTop: 26, opacity: 0.6, maxWidth: 240, marginInline: "auto" }} onClick={leave}>
          {t("exit")}
        </button>
      </main>
    );
  }

  // לובי הדיג'י — QR + התחלה
  const joinUrl = `${location.origin}${pfx}/r/${code}`;
  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="brand" style={{ fontSize: 22 }}>LARIK SHOW</h1>
        <span className="chip">🔦 {lightCount}</span>
      </div>

      <div className="card" style={{ textAlign: "center", marginTop: 12 }}>
        <div className="sub">{t("hostScanTitle")}</div>
        <QRCodeView url={joinUrl} />
        <div className="code-big">{code}</div>
        <p className="sub" style={{ fontSize: 12, direction: "ltr" }}>{joinUrl}</p>
      </div>

      <div className="featured popin" style={{ "--gc": "#ffc93c" } as CSSProperties}>
        <div className="fhead">
          <span className="fic">🎛️</span>
          <span>
            <b style={{ fontSize: 18 }}>{t("hostPanelTitle")}</b>
            <div className="sub" style={{ fontSize: 13 }}>{t("hostPanelSub")}</div>
          </span>
        </div>
        <p className="sub" style={{ fontSize: 13, lineHeight: 1.6, marginTop: 4 }}>{t("hostPanelBody")}</p>
        <p className="sub" style={{ fontSize: 12.5, marginTop: 10, fontWeight: 700 }}>{t("hostMidJoin")}</p>
        <button className="btn gold" style={{ marginTop: 12 }} disabled={lightCount < 1}
          onClick={() => { track("game_started", { game_id: "show" }); conn.send({ t: "start_game" }); }}>
          {lightCount < 1 ? t("hostWaitFirst") : `${t("hostStart")} (${lightCount} 🔦)`}
        </button>
      </div>

      <button className="btn ghost" style={{ marginTop: 14, opacity: 0.75 }} onClick={leave}>
        {t("exit")}
      </button>
    </main>
  );
}
