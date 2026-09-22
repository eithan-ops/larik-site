/**
 * שער הכרטיס 🎫 — מי שסורק QR של כרטיס מגיע לכאן: larik.ai/show/CODE?r=3&c=12
 * מסך הוראות ("אין מה להוריד!") → חיבור → המתנה עד שהמופע מתחיל → הטלפון נהיה פיקסל.
 * אם החדר עוד לא נפתח — ממשיכים לנסות ברקע; הטאב פשוט נשאר פתוח עד ההופעה.
 * המפיק/זמר נכנס עם ?host=1 — יוצר את החדר (בקוד הקבוע) ומקבל את הקונסולה.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { RoomSnapshot } from "../../../shared/protocol";
import { Connection, defaultServerUrl } from "../lib/connection";
import { unlockAudio } from "../lib/audio";
import { armPhone } from "../lib/sensors";
import { GameHub } from "../lib/gamehub";
import ShowView from "../games/show";
import { VENUES } from "../venues";
import { t } from "../lib/i18n";
import { useNs } from "../lib/useNs";

type Stage = "gate" | "connecting" | "waiting" | "in";

export default function ShowGate({ code }: { code: string }) {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const seatR = Number(params.get("r"));
  const seatC = Number(params.get("c"));
  const seatG = Number(params.get("g") || "1"); // גוש (1-based) — לאולמות ממופים
  const hasSeat = Number.isFinite(seatR) && Number.isFinite(seatC) && params.has("r");
  const isHost = params.get("host") === "1";
  const nsReady = useNs("show"); // המילון של המופע (show.json) — נטען לפי השפה

  const [stage, setStage] = useState<Stage>("gate");
  const [venueId, setVenueId] = useState("");
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [me, setMe] = useState("");
  const [tries, setTries] = useState(0);
  const connRef = useRef<Connection | null>(null);
  const retryRef = useRef<number | undefined>(undefined);
  const hub = useMemo(() => new GameHub(), []);

  // שומרים את המושב — מסך המופע ישתמש בו (גוש,שורה,מושב)
  useEffect(() => {
    if (hasSeat) sessionStorage.setItem(`larik-seat-${code}`, `${seatG},${seatR},${seatC}`);
  }, [code, hasSeat, seatG, seatR, seatC]);

  async function begin() {
    unlockAudio();
    await armPhone().catch(() => {});
    setStage("connecting");
    if (isHost) {
      // המפיק — יוצר/פותח את חדר האירוע בקוד הקבוע
      try { await fetch(`/api/create-room?code=${code}`); } catch { /* ננסה להתחבר בכל זאת */ }
    }
    connect();
  }

  function connect() {
    connRef.current?.close();
    const name = isHost ? t("gate.host") : hasSeat ? t("gate.seatName", { r: seatR, c: seatC }) : t("gate.crowd");
    const conn = new Connection(defaultServerUrl(), code, {
      onWelcome: (pid, r) => { setMe(pid); setRoom(r); setStage("in"); },
      onRoom: (r) => setRoom(r),
      onGame: (d) => hub.emit(d, 0),
      onCue: (d, at) => hub.emit(d, at),
      onError: () => {
        // החדר עוד לא נפתח — ננסה שוב בעוד 20 שניות, הטאב פשוט מחכה
        setStage("waiting");
        setTries((t) => t + 1);
        retryRef.current = window.setTimeout(connect, 20_000);
      },
      onStatus: () => {},
    });
    connRef.current = conn;
    conn.connect(name, isHost ? "🎤" : "🕯️");
  }

  useEffect(() => () => { connRef.current?.close(); clearTimeout(retryRef.current); }, []);
  const phase = room?.phase;
  useEffect(() => { if (phase !== "game") hub.reset(); }, [phase, hub]);

  /* ---------- שער ההוראות ---------- */
  if (!nsReady) return null;
  if (stage === "gate") {
    return (
      <main style={{ justifyContent: "center" }}>
        <div className="hero">
          <div className="hero-emojis" aria-hidden><span>🕯️</span><span>🎤</span><span>✨</span></div>
          <div className="logo-big" style={{ fontSize: 40 }}>LARIK</div>
          <h1 style={{ marginTop: 10, fontSize: 22 }}>{isHost ? t("gate.titleHost") : t("gate.titleGuest")}</h1>
        </div>
        {!isHost && (
          <div className="card" style={{ padding: 16 }}>
            <p style={{ fontSize: 15, lineHeight: 1.8 }}>
              <b>{t("gate.p1")}</b><br />
              {t("gate.p2")}<br />
              {hasSeat ? t("gate.p3seat", { r: seatR, c: seatC }) : t("gate.p3")}<br />
              {t("gate.p4")}
            </p>
          </div>
        )}
        <button className="btn" onClick={begin}>{isHost ? t("gate.openHost") : t("gate.imIn")}</button>
        <p className="sub" style={{ textAlign: "center", marginTop: 14, fontSize: 12 }}>
          <b style={{ color: "var(--gold)" }}>{t("gate.event", { code })}</b>
        </p>
      </main>
    );
  }

  /* ---------- מחכים שהאירוע ייפתח ---------- */
  if (stage === "waiting" || stage === "connecting") {
    return (
      <main style={{ justifyContent: "center", textAlign: "center" }}>
        <div className="pulse" style={{ fontSize: 64 }}>🕯️</div>
        <h1 style={{ margin: "14px 0 6px", fontSize: 20 }}>
          {stage === "connecting" ? t("gate.connecting") : t("gate.notStarted")}
        </h1>
        <p className="sub">
          {t("gate.ready")}<br />{t("gate.ready2")}
          {tries > 0 && <><br /><span style={{ fontSize: 11 }}>{t("gate.retrying")}</span></>}
        </p>
      </main>
    );
  }

  /* ---------- בפנים ---------- */
  if (!room) return null;
  const conn = connRef.current!;

  if (room.phase === "game" && room.gameId === "show") {
    return <ShowView room={room} me={me} conn={conn} hub={hub} />;
  }

  // המפיק בלובי — בחירת אולם + כפתור התחלה ישיר (בלי קטלוג)
  if (me === room.hostId) {
    const connected = room.players.filter((p) => p.connected).length;
    return (
      <main style={{ justifyContent: "center", textAlign: "center" }}>
        <div style={{ fontSize: 60 }}>🎛️</div>
        <h1 style={{ margin: "12px 0 4px" }}>{t("gate.eventN", { code })}</h1>
        <p className="sub" style={{ marginBottom: 16 }}>{t("gate.waitingPhones", { n: Math.max(0, connected - 1) })}</p>
        <div className="card" style={{ padding: 12, textAlign: "start", maxWidth: 340, margin: "0 auto 12px" }}>
          <div className="sub" style={{ marginBottom: 6 }}>{t("gate.venue")}</div>
          <select className="input" style={{ textAlign: "start" }} value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            <option value="">{t("gate.autoGrid")}</option>
            {VENUES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <button className="btn gold" style={{ maxWidth: 320, margin: "0 auto" }}
          onClick={() => { conn.send({ t: "select_game", gameId: "show", config: { venue: venueId || undefined } }); setTimeout(() => conn.send({ t: "start_game" }), 150); }}>
          {t("gate.light")}
        </button>
      </main>
    );
  }

  // קהל בלובי — המופע רגע מתחיל
  return (
    <main style={{ justifyContent: "center", textAlign: "center" }}>
      <div className="pulse" style={{ fontSize: 64 }}>🕯️</div>
      <h1 style={{ margin: "14px 0 6px", fontSize: 20 }}>{t("gate.youreIn")}</h1>
      <p className="sub">{t("gate.startsSoon")}<br />{t("gate.startsSoon2")}</p>
    </main>
  );
}
