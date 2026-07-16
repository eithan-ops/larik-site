import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { RoomSnapshot } from "../../../shared/protocol";
import { CATALOG } from "../../../shared/protocol";
import { Connection, defaultServerUrl } from "../lib/connection";
import { unlockAudio, Sfx, vibrate } from "../lib/audio";
import { armPhone } from "../lib/sensors";
import QRCodeView from "./QRCodeView";
import Ceremony from "./Ceremony";
import { GAME_VIEWS, GAME_COLORS, GameHub } from "../games/registry";

const EMOJIS = ["😎", "🦄", "🐸", "🔥", "🍕", "👾", "🐙", "🌈", "🦁", "🍩", "🚀"];

type Stage = "name" | "arm" | "in";

export default function Room({ code }: { code: string }) {
  const [stage, setStage] = useState<Stage>("name");
  const [name, setName] = useState(localStorage.getItem("larik-name") || "");
  const [emoji, setEmoji] = useState(localStorage.getItem("larik-emoji") || "😎");
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [me, setMe] = useState("");
  const [status, setStatus] = useState("");
  const [toast, setToast] = useState("");
  const connRef = useRef<Connection | null>(null);
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
      onWelcome: (pid, r) => { setMe(pid); setRoom(r); },
      onRoom: (r) => setRoom(r),
      onGame: (d) => hub.emit(d, 0),
      onCue: (d, at) => hub.emit(d, at),
      onError: (m) => showToast(m),
      onStatus: (s) => setStatus(s),
    });
    connRef.current = conn;
    conn.connect(name.trim() || "שחקן", emoji);
    conn.send({ t: "arm" });
    setStage("in");
  }

  useEffect(() => () => connRef.current?.close(), []);

  /* ---------- מסכי כניסה ---------- */
  if (stage === "name") {
    return (
      <main style={{ justifyContent: "center" }}>
        <div className="logo-big" style={{ fontSize: 34, marginBottom: 2 }}>LARIK</div>
        <div className="sub" style={{ textAlign: "center", marginBottom: 2 }}>חדר</div>
        <div className="code-big" style={{ marginBottom: 20 }}>{code}</div>
        <div className="card popin" style={{ padding: 18 }}>
          <div className="sub" style={{ textAlign: "center", marginBottom: 10 }}>איך קוראים לך הערב?</div>
          <input className="input" placeholder="הכינוי שלך" value={name} maxLength={14}
            onChange={(e) => setName(e.target.value)} />
          <div className="opt-row" style={{ justifyContent: "center", margin: "14px 0" }}>
            {EMOJIS.map((e) => (
              <button key={e} className={"opt" + (emoji === e ? " sel" : "")}
                style={{ fontSize: 22, padding: "6px 10px" }}
                onClick={() => setEmoji(e)}>{e}</button>
            ))}
          </div>
          <button className="btn" disabled={!name.trim()} onClick={() => setStage("arm")}>
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
  if (!room) {
    return <main style={{ justifyContent: "center", textAlign: "center" }}>
      <div className="pulse" style={{ fontSize: 60 }}>🪐</div>
      <p className="sub">מתחבר לחדר {code}...</p>
    </main>;
  }

  const isHost = me === room.hostId;
  const conn = connRef.current!;

  if (room.phase === "ceremony" && room.ceremony) {
    return <Ceremony room={room} me={me} isHost={isHost}
      onBackToLobby={() => conn.send({ t: "back_to_lobby" })} />;
  }

  if (room.phase === "game" && room.gameId) {
    const View = GAME_VIEWS[room.gameId];
    if (View) return (
      <>
        {isHost && (
          <button className="exit-fab" onClick={() => conn.send({ t: "back_to_lobby" })}>
            ✕ סיום משחק
          </button>
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
          onStart={() => conn.send({ t: "start_game" })} />
      ) : (
        <p className="sub" style={{ textAlign: "center" }}>
          {room.players.find((p) => p.id === room.hostId)?.name} בוחר משחק... 👑
        </p>
      )}
    </main>
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
      <button className="btn" style={{ marginTop: 8 }} disabled={!canStart} onClick={onStart}>
        {canStart ? "🚀 מתחילים!" : sel ? `צריך לפחות ${sel.minPlayers} שחקנים` : "בחר משחק"}
      </button>
    </div>
  );
}
