import { useEffect, useMemo, useRef, useState } from "react";
import type { RoomSnapshot } from "../../../shared/protocol";
import { CATALOG } from "../../../shared/protocol";
import { Connection, defaultServerUrl } from "../lib/connection";
import { unlockAudio, Sfx, vibrate } from "../lib/audio";
import { armPhone } from "../lib/sensors";
import QRCodeView from "./QRCodeView";
import Ceremony from "./Ceremony";
import { GAME_VIEWS, GameHub } from "../games/registry";

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
        <h1 className="brand" style={{ textAlign: "center", marginBottom: 4 }}>LARIK</h1>
        <div className="code-big" style={{ marginBottom: 20 }}>{code}</div>
        <div className="card">
          <input className="input" placeholder="הכינוי שלך" value={name} maxLength={14}
            onChange={(e) => setName(e.target.value)} />
          <div className="opt-row" style={{ justifyContent: "center", margin: "12px 0" }}>
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
        <div style={{ fontSize: 80 }} className="pulse">🔫</div>
        <h1 style={{ margin: "10px 0" }}>חמש את הטלפון</h1>
        <p className="sub" style={{ marginBottom: 24 }}>
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
    if (View) return <View room={room} me={me} conn={conn} hub={hub} />;
  }

  /* ---------- לובי ---------- */
  return (
    <main>
      {toast && <div className="toast">{toast}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="brand">LARIK</h1>
        <span className="chip">{status === "open" ? "🟢 מחובר" : "🟡 מתחבר..."}</span>
      </div>

      <div className="card" style={{ textAlign: "center" }}>
        <div className="sub">סרקו להצטרפות</div>
        <QRCodeView url={`${location.origin}/r/${code}`} />
        <div className="code-big">{code}</div>
      </div>

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
      <h2 style={{ marginBottom: 8 }}>בחר משחק 👑</h2>
      {CATALOG.map((g) => (
        <button key={g.id} className={"gamecard" + (room.gameId === g.id ? " sel" : "")}
          onClick={() => onSelect(g.id, config)}>
          <span className="ic">{g.icon}</span>
          <span style={{ flex: 1 }}>
            <b>{g.name}</b>
            <div className="sub">{g.tagline} · {g.minPlayers}–{g.maxPlayers} שחקנים</div>
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
