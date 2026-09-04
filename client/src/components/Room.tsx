import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { navigate } from "../App";
import type { RoomSnapshot } from "../../../shared/protocol";
import { CATALOG } from "../../../shared/protocol";
import { Connection, defaultServerUrl } from "../lib/connection";
import { unlockAudio, Sfx, vibrate } from "../lib/audio";
import { armPhone } from "../lib/sensors";
import { track } from "../lib/analytics";
import { setGround } from "../lib/ground";
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

  // הרקע נגזר מהרגע, לא מהגדרה: לובי = מדבקות נייר על דיו,
  // משחק = הכול כהה (קריאוּת), טקס = אור מלא (הדרמה של סוף הערב).
  useEffect(() => {
    setGround(phase === "game" ? "night-ink" : phase === "ceremony" ? "day" : "night-paper");
    return () => setGround("night-paper");
  }, [phase]);

  // וייב בלובי: "פופ" קטן כשחבר נכנס — החדר מרגיש חי גם לפני שהמשחק התחיל
  const prevConnected = useRef(0);
  useEffect(() => {
    const n = room?.players.filter((p) => p.connected).length ?? 0;
    if (phase === "lobby" && prevConnected.current > 0 && n > prevConnected.current) {
      Sfx.pop(); vibrate(20);
    }
    prevConnected.current = n;
  }, [room, phase]);

  // Wake Lock — שהמסך לא יכבה באמצע משחק או מופע (קריטי כשהטלפון הוא פיקסל)
  const needWake = phase === "game" || (phase === "lobby" && room?.gameId === "show");
  useEffect(() => {
    if (!needWake) return;
    let lock: { release?: () => Promise<void> } | undefined;
    let active = true;
    const req = () => (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<never> } })
      .wakeLock?.request("screen")
      .then((l: { release?: () => Promise<void> }) => { if (active) lock = l; else l.release?.(); })
      .catch(() => { /* דפדפן ישן — לא קריטי */ });
    req();
    const onVis = () => { if (document.visibilityState === "visible") req(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { active = false; document.removeEventListener("visibilitychange", onVis); lock?.release?.(); };
  }, [needWake]);

  // המופע עבר לאפליקציה נפרדת — קישורים ישנים (?show=1 או חדר מופע) מופנים לשם עם אותו קוד חדר
  const wantShow = useMemo(() => new URLSearchParams(location.search).has("show"), []);
  useEffect(() => {
    if (wantShow || room?.gameId === "show") {
      connRef.current?.close();
      location.replace(`/s/r/${code}${wantShow ? "?dj=1" : ""}`);
    }
  }, [wantShow, room?.gameId, code]);

  /* ---------- מסכי כניסה ---------- */
  if (stage === "name") {
    // מסך כניסה אחד: שם + כפתור שגם "מחמש" (הלחיצה מפעילה אודיו וחיישנים) — בלי עצירות מיותרות
    return (
      <main style={{ justifyContent: "center" }}>
        <div className="logo-big" style={{ fontSize: 34, marginBottom: 2 }}>LARIK</div>
        <div className="sub" style={{ textAlign: "center", marginBottom: 2 }}>חדר</div>
        <div className="code-big" style={{ marginBottom: 20 }}>{code}</div>
        <form className="card popin" style={{ padding: 18 }}
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) armAndJoin(); }}>
          <h2 style={{ textAlign: "center", marginBottom: 4 }}>ברוכים הבאים! 👋</h2>
          <p className="sub" style={{ textAlign: "center", marginBottom: 14, fontSize: 13 }}>
            עוד רגע אתם בפנים. איך קוראים לך?<br />
            <span style={{ fontSize: 11.5 }}>(השם יופיע אצל שאר השחקנים — אפשר גם כינוי)</span>
          </p>
          <input className="input" placeholder="השם שלך" value={name} maxLength={14} autoFocus
            onChange={(e) => setName(e.target.value)} />
          <button className="btn" type="submit" style={{ marginTop: 14 }} disabled={!name.trim()}>
            ⚡ נכנסים!
          </button>
          <p className="sub" style={{ textAlign: "center", fontSize: 11, marginTop: 8 }}>
            (אייפון ישאל אישור לחיישני תנועה — תאשרו)
          </p>
        </form>
      </main>
    );
  }

  if (stage === "arm") {
    // רק בחזרה לחדר מוכר (reload) — לחיצה אחת להפעלת האודיו וממשיכים
    return (
      <main style={{ justifyContent: "center", textAlign: "center" }}>
        <div style={{ fontSize: 84 }} className="pulse">⚡</div>
        <h1 style={{ margin: "12px 0 8px" }}>ממשיכים מאיפה שעצרנו</h1>
        <p className="sub" style={{ marginBottom: 26 }}>
          לחיצה אחת מחזירה אותך פנימה — עם הרמקול והקסם.
        </p>
        <button className="btn gold" onClick={armAndJoin}>⚡ חזרה למשחק</button>
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
          onSaveGroup={(name) => conn.send({ t: "save_group", name })}
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
            {/* לחבורה שנשמרה יש שם — והוא עדיף על "חדר KFRT" בכל מקום שהוא מופיע */}
            {room.group ? `🏅 ${room.group.name} · ערב ${Math.max(1, room.group.evenings + 1)}` : `חדר ${code}`}
            {" · "}{connectedCount} {connectedCount === 1 ? "מחובר" : "מחוברים"}
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

/* קטגוריות הקטלוג — המופע חי בעולם משלו (larik.ai/show) */
const CATEGORIES: { icon: string; name: string; ids: string[] }[] = [
  { icon: "🎉", name: "מסיבה", ids: ["whomost", "impostor", "undercover", "alias", "forehead"] },
  { icon: "⚡", name: "אקשן", ids: ["floors", "thieves", "abyss", "colorrules", "pods", "demons"] },
  { icon: "🤝", name: "ביחד נגד המכונה", ids: ["wall", "hofrim", "bombs", "simon"] },
  { icon: "🧠", name: "מוח", ids: ["trivia", "deathtouch"] },
];
/* סדר ההמלצה של "המנחה" — הכי חברתיים קודם */
const RECO_ORDER = ["impostor", "undercover", "whomost", "alias", "floors", "wall", "hofrim", "thieves", "abyss", "bombs", "colorrules", "trivia", "forehead", "demons", "simon", "pods", "deathtouch"];

function HostCatalog({ room, onSelect, onStart }: {
  room: RoomSnapshot;
  onSelect: (gameId: string, config: Record<string, unknown>) => void;
  onStart: () => void;
}) {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const sel = CATALOG.find((g) => g.id === room.gameId);
  const connected = room.players.filter((p) => p.connected).length;
  // חפיסה אישית ✨ נבחרה אבל עוד לא נוצרה — לא מתחילים בלי קלפים (רלוונטי רק למשחקים עם חפיסה)
  const hasDeckOpt = !!sel?.configOptions?.some((o) => o.key === "deck");
  const customPending = hasDeckOpt && config.deck === "custom" && !(Array.isArray(config.customCards) && config.customCards.length >= 8);
  const canStart = !!sel && connected >= (sel?.minPlayers ?? 2) && !customPending;
  // התקדמות "הבנתי" — כמה מהשחקנים (לא המארח) קראו ואישרו את ההסבר
  const others = room.players.filter((p) => p.connected && p.id !== room.hostId);
  const gotCount = others.filter((p) => room.gotIt?.includes(p.id)).length;
  const allGotIt = others.length > 0 && gotCount === others.length;

  // "דינג" למארח ברגע שכולם סיימו לקרוא — הסימן שאפשר לשגר
  const prevAllGotIt = useRef(false);
  useEffect(() => {
    if (allGotIt && !prevAllGotIt.current) { Sfx.ding(); vibrate(30); }
    prevAllGotIt.current = allGotIt;
  }, [allGotIt]);

  // "המנחה": משחקים שמתאימים לכמות המחוברים כרגע
  const fits = (g: (typeof CATALOG)[number]) => connected >= g.minPlayers && connected <= g.maxPlayers;
  const suitable = RECO_ORDER
    .map((id) => CATALOG.find((g) => g.id === id)!)
    .filter((g) => g && fits(g));
  const reco = !sel ? suitable[0] : undefined;
  const shown = sel ?? reco; // הפאנל הגדול: המשחק הנבחר, או ההמלצה

  function surprise() {
    const pool = suitable.length ? suitable : CATALOG.filter((g) => g.id !== "show" && !g.external);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    onSelect(pick.id, config);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="section-title" style={{ margin: "6px 0" }}>🎮 בחר משחק</h2>
        <button className="chip" style={{ border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 800 }}
          onClick={surprise}>
          🎲 הפתיעו אותנו
        </button>
      </div>

      {shown && (
        <div className="featured popin" key={shown.id}
          style={{ "--gc": GAME_COLORS[shown.id] ?? "#8b5cf6" } as CSSProperties}>
          {!sel && <span className="badge-reco">✨ המומלץ ל{connected} מחוברים</span>}
          <div className="fhead">
            <span className="fic">{shown.icon}</span>
            <span>
              <b style={{ fontSize: 18 }}>{shown.name}</b>
              <div className="sub" style={{ fontSize: 13 }}>{shown.tagline}</div>
              <div className="sub" style={{ fontSize: 11.5, opacity: 0.85, marginTop: 2 }}>
                👥 {shown.minPlayers}–{shown.maxPlayers} שחקנים
              </div>
            </span>
          </div>
          {sel?.configOptions?.map((opt) => (
            <div key={opt.key} style={{ marginTop: 8 }}>
              <div className="sub" style={{ fontSize: 12.5 }}>{opt.label}</div>
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
          {sel && config.deck === "custom" && (
            <AiDeckPanel
              current={Array.isArray(config.customCards) && config.customCards.length
                ? { name: String(config.customName ?? ""), count: (config.customCards as string[]).length }
                : null}
              onDeck={(name, cards) => {
                const next = { ...config, deck: "custom", customName: name, customCards: cards };
                setConfig(next);
                onSelect(sel.id, next);
                Sfx.fanfare(); vibrate([40, 30, 80]);
              }} />
          )}
          <div className="howto">{shown.howTo ?? shown.tagline}</div>
          {sel && others.length > 0 && (
            <div className="sub" style={{ marginTop: 10, fontWeight: 700, color: allGotIt ? "#7ee787" : undefined }}>
              {allGotIt ? "✅ כולם קראו את ההסבר — אפשר להתחיל!" : `👍 הבנתי: ${gotCount}/${others.length} — ההסבר מוצג עכשיו אצל כולם`}
            </div>
          )}
          {sel ? (
            <button className="btn" style={{ marginTop: 12 }} disabled={!canStart} onClick={onStart}>
              {canStart ? "🚀 מתחילים!" : customPending ? "✨ צרו חפיסה למעלה קודם" : `צריך לפחות ${sel.minPlayers} שחקנים`}
            </button>
          ) : (
            <button className="btn" style={{ marginTop: 12 }} onClick={() => shown && onSelect(shown.id, config)}>
              👑 בחר את {shown.name}
            </button>
          )}
        </div>
      )}

      {CATEGORIES.map((cat) => (
        <div key={cat.name}>
          <div className="cat-title">
            <span>{cat.icon}</span> {cat.name}
          </div>
          <div className="cat-row">
            {cat.ids.map((id) => {
              const g = CATALOG.find((x) => x.id === id);
              if (!g) return null;
              const ok = fits(g);
              return (
                <button key={id}
                  className={"gcard" + (room.gameId === id ? " sel" : "") + (ok ? "" : " dim")}
                  style={{ "--gc": GAME_COLORS[id] ?? "#8b5cf6" } as CSSProperties}
                  onClick={() => onSelect(id, config)}>
                  <span className="ic">{g.icon}</span>
                  <b>{g.name}</b>
                  <span className="pp">👥 {g.minPlayers}–{g.maxPlayers}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <p className="sub" style={{ fontSize: 11.5, textAlign: "center", marginTop: 6 }}>
        🕯️ מחפשים את המופע? הוא עבר לאפליקציה משלו — larik.ai/s
      </p>
    </div>
  );
}

/* ---------- חפיסה אישית ✨ — המארח מקליד נושא, ה-AI רוקח חפיסה ----------
 * "החתונה של דנה", "המשרד שלנו", "הטיול לתאילנד" — קריאת LLM אחת לחפיסה שלמה,
 * דרך פרוקסי בשרת (המפתח לא נחשף). זה הפיצ'ר שהופך ערב רגיל לערב שמדברים עליו.
 */
function AiDeckPanel({ current, onDeck }: {
  current: { name: string; count: number } | null;
  onDeck: (name: string, cards: string[]) => void;
}) {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [avail, setAvail] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/ai-deck-available")
      .then((r) => r.json())
      .then((d) => setAvail(!!d.available))
      .catch(() => setAvail(false));
  }, []);

  async function generate() {
    const t = topic.trim();
    if (t.length < 2 || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/ai-deck?topic=${encodeURIComponent(t)}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.cards)) { setErr(data.error || "משהו השתבש — נסו שוב"); }
      else { track("ai_deck_created"); onDeck(data.name, data.cards); }
    } catch {
      setErr("אין קשר לשרת — נסו שוב עוד רגע");
    }
    setBusy(false);
  }

  if (avail === false) {
    return (
      <p className="sub" style={{ marginTop: 10, fontSize: 12.5 }}>
        ✨ החפיסות האישיות עוד לא הופעלו בשרת — בינתיים בחרו חפיסה מוכנה.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 10, background: "rgba(255,255,255,.05)", borderRadius: 14, padding: "12px 12px" }}>
      {current ? (
        <div className="popin" style={{ textAlign: "center" }}>
          <b style={{ fontSize: 15 }}>✨ {current.name}</b>
          <div className="sub" style={{ fontSize: 12 }}>{current.count} קלפים מוכנים — אפשר להתחיל!</div>
        </div>
      ) : (
        <p className="sub" style={{ fontSize: 12.5, marginBottom: 8 }}>
          על מה החפיסה? <b>"החתונה של דנה"</b>, "המשרד שלנו", "שנות ה-90"...
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: current ? 10 : 0 }}>
        <input className="input" placeholder={current ? "נושא אחר?" : "הנושא שלכם"} value={topic} maxLength={60}
          style={{ textAlign: "right", fontSize: 15, padding: 11 }}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") generate(); }} />
        <button className="btn gold" style={{ width: "auto", padding: "0 16px", fontSize: 15 }}
          disabled={busy || topic.trim().length < 2} onClick={generate}>
          {busy ? "🪄..." : "✨ צרו"}
        </button>
      </div>
      {busy && <p className="sub pulse" style={{ fontSize: 12, marginTop: 8, textAlign: "center" }}>🪄 רוקחים חפיסה בשבילכם...</p>}
      {err && <p className="sub" style={{ fontSize: 12, marginTop: 8, color: "#ff8a8a", fontWeight: 700, textAlign: "center" }}>{err}</p>}
    </div>
  );
}
