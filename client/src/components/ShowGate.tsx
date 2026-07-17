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
import { GAME_VIEWS, GameHub } from "../games/registry";

type Stage = "gate" | "connecting" | "waiting" | "in";

export default function ShowGate({ code }: { code: string }) {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const seatR = Number(params.get("r"));
  const seatC = Number(params.get("c"));
  const hasSeat = Number.isFinite(seatR) && Number.isFinite(seatC) && params.has("r");
  const isHost = params.get("host") === "1";

  const [stage, setStage] = useState<Stage>("gate");
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [me, setMe] = useState("");
  const [tries, setTries] = useState(0);
  const connRef = useRef<Connection | null>(null);
  const retryRef = useRef<number | undefined>(undefined);
  const hub = useMemo(() => new GameHub(), []);

  // שומרים את המושב — מסך המופע ישלח אותו לשרת
  useEffect(() => {
    if (hasSeat) sessionStorage.setItem(`larik-seat-${code}`, `${seatR},${seatC}`);
  }, [code, hasSeat, seatR, seatC]);

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
    const name = isHost ? "מפעיל" : hasSeat ? `מושב ${seatR}·${seatC}` : "קהל";
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
  if (stage === "gate") {
    return (
      <main style={{ justifyContent: "center" }}>
        <div className="hero">
          <div className="hero-emojis" aria-hidden><span>🕯️</span><span>🎤</span><span>✨</span></div>
          <div className="logo-big" style={{ fontSize: 40 }}>LARIK</div>
          <h1 style={{ marginTop: 10, fontSize: 22 }}>{isHost ? "קונסולת המופע 🎛️" : "הטלפון שלך הוא חלק מהמופע! 🕯️"}</h1>
        </div>
        {!isHost && (
          <div className="card" style={{ padding: 16 }}>
            <p style={{ fontSize: 15, lineHeight: 1.8 }}>
              <b>✅ אין מה להוריד ואין הרשמה.</b><br />
              📲 השאירו את הדף הזה פתוח (אפשר לחזור אליו מההיסטוריה או לשמור למסך הבית).<br />
              🎫 {hasSeat ? <>המערכת יודעת שאתם ב<b>שורה {seatR}, מושב {seatC}</b> — האור שלכם הוא פיקסל במסך ענק שכל הקהל יוצר יחד.</> : "האור שלכם יהיה חלק ממסך ענק שכל הקהל יוצר יחד."}<br />
              🔆 כשהמופע יתחיל: בהירות למקסימום, טלפון גבוה באוויר!
            </p>
          </div>
        )}
        <button className="btn" onClick={begin}>{isHost ? "🎛️ פתח את המופע" : "✨ אני בפנים!"}</button>
        <p className="sub" style={{ textAlign: "center", marginTop: 14, fontSize: 12 }}>
          אירוע: <b style={{ color: "var(--gold)" }}>{code}</b>
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
          {stage === "connecting" ? "מתחברים..." : "המופע עוד לא התחיל"}
        </h1>
        <p className="sub">
          הכול מוכן! השאירו את הדף פתוח —<br />ברגע שהמופע יעלה, הטלפון יידלק לבד. ✨
          {tries > 0 && <><br /><span style={{ fontSize: 11 }}>(בודקים שוב כל כמה שניות)</span></>}
        </p>
      </main>
    );
  }

  /* ---------- בפנים ---------- */
  if (!room) return null;
  const conn = connRef.current!;

  if (room.phase === "game" && room.gameId === "show") {
    const View = GAME_VIEWS.show;
    return <View room={room} me={me} conn={conn} hub={hub} />;
  }

  // המפיק בלובי — כפתור התחלה ישיר (בלי קטלוג)
  if (me === room.hostId) {
    const connected = room.players.filter((p) => p.connected).length;
    return (
      <main style={{ justifyContent: "center", textAlign: "center" }}>
        <div style={{ fontSize: 60 }}>🎛️</div>
        <h1 style={{ margin: "12px 0 4px" }}>אירוע {code}</h1>
        <p className="sub" style={{ marginBottom: 20 }}>{connected - 1} טלפונים ממתינים ✨</p>
        <button className="btn gold" style={{ maxWidth: 320, margin: "0 auto" }}
          onClick={() => { conn.send({ t: "select_game", gameId: "show", config: {} }); setTimeout(() => conn.send({ t: "start_game" }), 150); }}>
          🚀 הדלק את המופע!
        </button>
      </main>
    );
  }

  // קהל בלובי — המופע רגע מתחיל
  return (
    <main style={{ justifyContent: "center", textAlign: "center" }}>
      <div className="pulse" style={{ fontSize: 64 }}>🕯️</div>
      <h1 style={{ margin: "14px 0 6px", fontSize: 20 }}>אתם בפנים!</h1>
      <p className="sub">המופע יתחיל עוד רגע —<br />בהירות למקסימום ותחזיקו גבוה 🔆</p>
    </main>
  );
}
