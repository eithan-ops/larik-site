import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { navigate } from "../App";
import type { RoomSnapshot } from "../../../shared/protocol";
import { CATALOG } from "../../../shared/protocol";
import { Connection, defaultServerUrl } from "../lib/connection";
import { unlockAudio, Sfx, vibrate } from "../lib/audio";
import { armPhone } from "../lib/sensors";
import { track } from "../lib/analytics";
import QRCodeView from "./QRCodeView";
import Ceremony from "./Ceremony";
import { GAME_VIEWS, GAME_COLORS, GameHub } from "../games/registry";

/** מזהה צבעוני שקט — במקום בחירת אווטר (הקהל מבוגר, לא צריך חיות) */
const DOT_EMOJIS = ["🔵", "🟣", "🟢", "🟡", "🟠", "🔴", "🟤", "⚪", "🟦", "🟪", "🟩", "🟨"];
function autoEmoji(): string {
  const saved = localStorage.getItem("larik-emoji-auto");
  if (saved) return saved;
  const e = DOT_EMOJIS[Math.floor(Math.random() * DOT_EMOJIS.length)];
  localStorage.setItem("larik-emoji-auto", e);
  return e;
}

type Stage = "name" | "arm" | "in";

export default function Room({ code }: { code: string }) {
  // חוזר לחדר מוכר (reload)? מדלגים על מסך הכינוי — נשאר רק "חמש" (חובה בשביל האודיו)
  const isRejoin = !!sessionStorage.getItem(`larik-pid-${code}`) && !!localStorage.getItem("larik-name");
  const [stage, setStage] = useState<Stage>(isRejoin ? "arm" : "name");
  const [name, setName] = useState(localStorage.getItem("larik-name") || "");
  const [emoji] = useState(autoEmoji());
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [me, setMe] = useState("");
  const [status, setStatus] = useState("");
  const [toast, setToast] = useState("");
  const [fatal, setFatal] = useState("");
  const connRef = useRef<Connection | null>(null);
  const roomRef = useRef<RoomSnapshot | null>(null);
  const hub = useMemo(() => new GameHub(), []);

  function showToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  /* ---- שלב 2: חימוש + התחברות ---- */
  async function armAndJoin() {
    unlockAudio(); // חייב בתוך המחווה
    await armPhone();
    Sfx.ding();
    vibrate(60);
    localStorage.setItem("larik-name", name);
    localStorage.setItem("larik-emoji", emoji);

    const conn = new Connection(defaultServerUrl(), code, {
      onWelcome: (pid, r) => { setMe(pid); setRoom(r); roomRef.current = r; },
      onRoom: (r) => { setRoom(r); roomRef.current = r; },
      onGame: (d) => hub.emit(d, 0),
      onCue: (d, at) => hub.emit(d, at),
      // שגיאה לפני שנכנסנו לחדר (קוד שגוי / חדר שנסגר) = מסך שגיאה עם דרך חזרה, לא ספינר נצחי
      onError: (m) => { if (!roomRef.current) setFatal(m || "החדר לא נמצא"); else showToast(m); },
      onStatus: (s) => setStatus(s),
    });
    connRef.current = conn;
    conn.connect(name.trim() || "שחקן", emoji);
    conn.send({ t: "arm" });
    track("room_joined");
    setStage("in");
  }

  useEffect(() => () => connRef.current?.close(), []);

  // בין משחקים מנקים הודעות שמורות — שלא יזלגו למשחק הבא
  const phase = room?.phase;
  useEffect(() => { if (phase !== "game") hub.reset(); }, [phase, hub]);

  /* ---------- מסכי כניסה ---------- */
  if (stage === "name") {
    return (
      <main style={{ justifyContent: "center" }}>
        <div className="logo-big" style={{ fontSize: 34, marginBottom: 2 }}>LARIK</div>
        <div className="sub" style={{ textAlign: "center", marginBottom: 2 }}>חדר</div>
        <div className="code-big" style={{ marginBottom: 20 }}>{code}</div>
        <div className="card popin" style={{ padding: 18 }}>
          <h2 style={{ textAlign: "center", marginBottom: 4 }}>ברוכים הבאים! 👋</h2>
          <p className="sub" style={{ textAlign: "center", marginBottom: 14, fontSize: 13 }}>
            עוד רגע אתם בפנים. איך קוראים לך?<br />
            <span style={{ fontSize: 11.5 }}>(השם יופיע אצל שאר השחקנים — אפשר גם כינוי)</span>
          </p>
          <input className="input" placeholder="השם שלך" value={name} maxLength={14}
            onChange={(e) => setName(e.target.value)} />
          <button className="btn" style={{ marginTop: 14 }} disabled={!name.trim()} onClick={() => setStage("arm")}>
            ממשיכים ➜
          </button>
        </div>
      </main>
    );
  }

  if (stage === "arm") {
    return (
      <main style={{ justifyContent: "center", textAlign: "center" }}>
        <div style={{ fontSize: 84 }} className="pulse">🔫</div>
        <h1 style={{ margin: "12px 0 8px" }}>חמש את הטלפון</h1>
        <p className="sub" style={{ marginBottom: 26 }}>
          לחיצה אחת מפעילה את הרמקול, החיישנים והקסם.<br />
          (אייפון ישאל אישור לחיישני תנועה — תאשרו!)
        </p>
        <button className="btn gold" onClick={armAndJoin}>⚡ חמוש ומוכן</button>
      </main>
    );
  }

  /* ---------- בתוך החדר ---------- */
  if (fatal && !room) {
    return (
      <main style={{ justifyContent: "center", textAlign: "center" }}>
        <div style={{ fontSize: 64 }}>🕳️</div>
        <h1 style={{ margin: "12px 0 6px" }}>אופס!</h1>
        <p className="sub" style={{ marginBottom: 24 }}>{fatal}</p>
        <button className="btn" style={{ maxWidth: 300, margin: "0 auto" }} onClick={() => navigate("/")}>
          🏠 לדף הבית
        </button>
      </main>
    );
  }
  if (!room) {
    return <main style={{ justifyContent: "center", textAlign: "center" }}>
      <div className="pulse" style={{ fontSize: 60 }}>🪐</div>
      <p className="sub">מתחבר לחדר {code}...</p>
    </main>;
  }

  const isHost = me === room.hostId;
  const conn = connRef.current!;

  function leaveRoom() {
    conn.send({ t: "leave" });
    conn.close();
    navigate("/");
  }

  if (room.phase === "ceremony" && room.ceremony) {
    return (
      <>
        {!isHost && <button className="exit-fab" onClick={leaveRoom}>🚪 יציאה</button>}
        <Ceremony room={room} me={me} isHost={isHost}
          onBackToLobby={() => conn.send({ t: "back_to_lobby" })} />
      </>
    );
  }

  if (room.phase === "game" && room.gameId) {
    // הצטרפת אחרי שהמשחק התחיל? מחכים איתך בצד — בסיבוב הבא אתה בפנים
    if (room.gamePids && !room.gamePids.includes(me)) {
      return (
        <main style={{ justifyContent: "center", textAlign: "center" }}>
          <div className="pulse" style={{ fontSize: 64 }}>🍿</div>
          <h1 style={{ margin: "14px 0 6px" }}>המשחק כבר באמצע</h1>
          <p className="sub" style={{ marginBottom: 24 }}>
            אתה בפנים! ברגע שהסיבוב הזה ייגמר —<br />תצטרף אוטומטית למשחק הבא.
          </p>
          <button className="btn ghost" style={{ maxWidth: 280, margin: "0 auto" }} onClick={leaveRoom}>
            🚪 עזוב את החדר
          </button>
        </main>
      );
    }
    const View = GAME_VIEWS[room.gameId];
    if (View) return (
      <>
        {isHost ? (
          <button className="exit-fab" onClick={() => conn.send({ t: "back_to_lobby" })}>
            ✕ סיום משחק
          </button>
        ) : (
          <button className="exit-fab" onClick={leaveRoom}>🚪</button>
        )}
        <View room={room} me={me} conn={conn} hub={hub} />
      </>
    );
  }

  /* ---------- לובי ---------- */
  const connectedCount = room.players.filter((p) => p.connected).length;
  return (
    <main>
      {toast && <div className="toast">{toast}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="brand">LARIK</h1>
        <span className="chip">{status === "open" ? "🟢 מחובר" : "🟡 מתחבר..."}</span>
      </div>

      <div className="joined-banner popin">
        <span className="tick">✅</span>
        <div style={{ flex: 1 }}>
          <b>{emoji} {name.trim() || "שחקן"} — אתה בפנים!</b>
          <div className="sub" style={{ fontSize: 12.5 }}>
            חדר {code} · {connectedCount} {connectedCount === 1 ? "מחובר" : "מחוברים"}
            {isHost ? " · אתה המארח 👑" : ""}
          </div>
        </div>
      </div>

      {isHost ? (
        <div className="card" style={{ textAlign: "center" }}>
          <div className="sub">החברים סורקים כדי להצטרף</div>
          <QRCodeView url={`${location.origin}/r/${code}`} />
          <div className="code-big">{code}</div>
          <ShareRow code={code} />
        </div>
      ) : (
        <div className="card" style={{ padding: 12 }}>
          <ShareRow code={code} />
        </div>
      )}

      <div className="players-grid" style={{ marginBottom: 14 }}>
        {room.players.map((p) => (
          <div key={p.id}
            className={"pbadge" + (p.armed ? " armed" : "") + (p.connected ? "" : " off") + (p.id === room.hostId ? " host" : "")}>
            <span className="em">{p.emoji}</span>
            <span className="nm">{p.name}{p.id === me ? " (אני)" : ""}</span>
          </div>
        ))}
      </div>

      {isHost ? (
        <HostCatalog room={room} onSelect={(gameId, config) => conn.send({ t: "select_game", gameId, config })}
          onStart={() => { if (room.gameId) track("game_started", { game_id: room.gameId }); conn.send({ t: "start_game" }); }} />
      ) : room.gameId ? (
        <GameExplainer room={room} me={me} conn={conn} />
      ) : (
        <p className="sub" style={{ textAlign: "center" }}>
          {room.players.find((p) => p.id === room.hostId)?.name} בוחר משחק... 👑
        </p>
      )}

      <button className="btn ghost" style={{ marginTop: 18, opacity: 0.75 }} onClick={leaveRoom}>
        🚪 עזוב את החדר
      </button>
    </main>
  );
}

/* המארח בחר משחק — כל שחקן קורא את ההסבר ומאשר "הבנתי" לפני שמתחילים */
function GameExplainer({ room, me, conn }: { room: RoomSnapshot; me: string; conn: Connection }) {
  const g = CATALOG.find((x) => x.id === room.gameId);
  if (!g) return null;
  const confirmed = !!room.gotIt?.includes(me);

  return (
    <div className="card popin" style={{ padding: 18, textAlign: "center" }}>
      <div style={{ fontSize: 44 }}>{g.icon}</div>
      <h2 style={{ margin: "6px 0 2px" }}>{g.name}</h2>
      <p className="sub" style={{ fontSize: 13 }}>{g.tagline}</p>
      <p style={{
        fontSize: 14.5, lineHeight: 1.7, textAlign: "right", margin: "14px 0 16px",
        background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: "12px 14px",
      }}>
        {g.howTo ?? g.tagline}
      </p>
      {confirmed ? (
        <div className="popin">
          <div style={{ fontSize: 34 }}>✅</div>
          <p className="sub" style={{ fontWeight: 700, marginTop: 4 }}>
            מעולה! מחכים שהמארח יתחיל... 👑
          </p>
        </div>
      ) : (
        <button className="btn gold" onClick={() => { Sfx.ding(); vibrate(40); conn.send({ t: "got_it" }); }}>
          👍 הבנתי, אני מוכן!
        </button>
      )}
    </div>
  );
}

/* שיתוף מהיר — הדרך הקלה להכניס חברים בלי להקליד כלום */
function ShareRow({ code }: { code: string }) {
  const joinUrl = `${location.origin}/r/${code}`;
  const text = `🎮 בואו לשחק LARIK!\nנכנסים לחדר שלי בלחיצה:\n${joinUrl}`;

  async function shareNative() {
    try {
      await navigator.share({ title: "LARIK", text: "🎮 בואו לשחק LARIK! מצטרפים בלחיצה:", url: joinUrl });
    } catch { /* המשתמש ביטל */ }
  }

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
      <a className="btn wa" style={{ flex: 1, textDecoration: "none" }}
        href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
        שתפו בוואטסאפ
      </a>
      {"share" in navigator && (
        <button className="btn ghost" style={{ flex: "0 0 auto", width: "auto", padding: "17px 18px" }}
          onClick={shareNative} aria-label="שיתוף">
          ⤴️
        </button>
      )}
    </div>
  );
}

function HostCatalog({ room, onSelect, onStart }: {
  room: RoomSnapshot;
  onSelect: (gameId: string, config: Record<string, string>) => void;
  onStart: () => void;
}) {
  const [config, setConfig] = useState<Record<string, string>>({});
  const sel = CATALOG.find((g) => g.id === room.gameId);
  const connected = room.players.filter((p) => p.connected).length;
  const canStart = !!sel && connected >= (sel?.minPlayers ?? 2);
  // התקדמות "הבנתי" — כמה מהשחקנים (לא המארח) קראו ואישרו את ההסבר
  const others = room.players.filter((p) => p.connected && p.id !== room.hostId);
  const gotCount = others.filter((p) => room.gotIt?.includes(p.id)).length;
  const allGotIt = others.length > 0 && gotCount === others.length;

  return (
    <div>
      <h2 className="section-title">🎮 בחר משחק</h2>
      {CATALOG.map((g) => (
        <button key={g.id} className={"gamecard" + (room.gameId === g.id ? " sel" : "")}
          style={{ "--gc": GAME_COLORS[g.id] ?? "#8b5cf6" } as CSSProperties}
          onClick={() => onSelect(g.id, config)}>
          <span className="ic">{g.icon}</span>
          <span style={{ flex: 1 }}>
            <b>{g.name}</b>
            <div className="sub">{g.tagline}</div>
            <div className="sub" style={{ fontSize: 11.5, opacity: 0.8, marginTop: 2 }}>
              👥 {g.minPlayers}–{g.maxPlayers} שחקנים
            </div>
          </span>
        </button>
      ))}
      {sel?.configOptions?.map((opt) => (
        <div key={opt.key} className="card" style={{ padding: 12 }}>
          <div className="sub">{opt.label}</div>
          <div className="opt-row">
            {opt.values.map((v) => (
              <button key={v.v}
                className={"opt" + ((config[opt.key] ?? opt.values[0].v) === v.v ? " sel" : "")}
                onClick={() => {
                  const next = { ...config, [opt.key]: v.v };
                  setConfig(next);
                  onSelect(sel.id, next);
                }}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {sel && (
        <div className="card popin" style={{ padding: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>📖 איך משחקים ב{sel.name}</div>
          <p className="sub" style={{ fontSize: 13.5, lineHeight: 1.65 }}>{sel.howTo ?? sel.tagline}</p>
          {others.length > 0 && (
            <div className="sub" style={{ marginTop: 10, fontWeight: 700, color: allGotIt ? "#7ee787" : undefined }}>
              {allGotIt ? "✅ כולם קראו את ההסבר — אפשר להתחיל!" : `👍 הבנתי: ${gotCount}/${others.length} — ההסבר מוצג עכשיו אצל כולם`}
            </div>
          )}
        </div>
      )}
      <button className="btn" style={{ marginTop: 8 }} disabled={!canStart} onClick={onStart}>
        {canStart ? "🚀 מתחילים!" : sel ? `צריך לפחות ${sel.minPlayers} שחקנים` : "בחר משחק"}
      </button>
    </div>
  );
}
