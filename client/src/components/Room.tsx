import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { navigate } from "../App";
import type { RoomSnapshot } from "../../../shared/protocol";
import { CATALOG, SPODS_CATEGORY } from "../../../shared/protocol";
import { Connection, defaultServerUrl } from "../lib/connection";
import { unlockAudio, Sfx, vibrate } from "../lib/audio";
import { armPhone } from "../lib/sensors";
import { track, trackOnce, entrySource, bumpGamesTotal } from "../lib/analytics";
import { setGround } from "../lib/ground";
import QRCodeView from "./QRCodeView";
import Ceremony from "./Ceremony";
import { GAME_VIEWS, GAME_COLORS, GameHub } from "../games/registry";
import { t, gameText, roomUrl } from "../lib/locale";

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
  const leavingRef = useRef(false); // סגירה מכוונת (עזיבה/ניווט) — לא ניתוק רשת
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
      onWelcome: (pid, r) => {
        // ה-welcome הראשון = הצטרפות אמיתית (השרת אישר). מכאן יודעים אם אני המארח ומאיפה הגעתי
        if (!roomRef.current) {
          track("room_joined", {
            role: pid === r.hostId ? "host" : "guest",
            via: entrySource(),
            rejoin: isRejoin ? 1 : 0,
            players: r.players.filter((p) => p.connected).length,
            phase: r.phase,
          });
        }
        setMe(pid); setRoom(r); roomRef.current = r;
      },
      onRoom: (r) => { setRoom(r); roomRef.current = r; },
      onGame: (d) => hub.emit(d, 0),
      onCue: (d, at) => hub.emit(d, at),
      // שגיאה לפני שנכנסנו לחדר (קוד שגוי / חדר שנסגר) = מסך שגיאה עם דרך חזרה, לא ספינר נצחי
      onError: (m) => {
        if (!roomRef.current) { track("join_failed", { via: entrySource(), reason: m || "not_found" }); setFatal(m || t("lobby.room_not_found")); }
        else showToast(m);
      },
      onStatus: (s) => {
        // ניתוק אחרי שכבר היינו בפנים — פעם אחת לחדר, שנדע כמה חדרים סובלים מרשת
        if (s === "closed" && roomRef.current && !leavingRef.current) trackOnce(`lost-${code}`, "connection_lost", { phase: roomRef.current.phase, game_id: roomRef.current.gameId ?? "" });
        setStatus(s);
      },
    });
    connRef.current = conn;
    conn.connect(name.trim() || t("app.player"), emoji);
    conn.send({ t: "arm" });
    setStage("in");
  }

  useEffect(() => () => { leavingRef.current = true; connRef.current?.close(); }, []);

  // בין משחקים מנקים הודעות שמורות — שלא יזלגו למשחק הבא
  const phase = room?.phase;
  useEffect(() => { if (phase !== "game") hub.reset(); }, [phase, hub]);

  /* ---- אנליטיקה אחידה לכל המשחקים — לפי מעבר שלב שהשרת אישר ----
   * game_selected (מארח) · game_started · game_ended (+room_completed למארח) · game_aborted.
   * אין צורך בקוד בתוך אף משחק: כל משחק חדש נמדד אוטומטית. */
  const ga = useRef<{ phase?: string; gameId?: string; startedAt: number; players: number; inGame: boolean }>({ startedAt: 0, players: 0, inGame: false });
  useEffect(() => {
    if (!room || !me) return;
    const g = ga.current;
    const prev = g.phase;
    const role = me === room.hostId ? "host" : "guest";
    const gameNo = (room.ceremony?.gamesPlayed ?? 0);
    if (room.phase === "game" && prev !== "game" && room.gameId) {
      const inGame = !room.gamePids || room.gamePids.includes(me);
      g.startedAt = Date.now(); g.players = room.gamePids?.length ?? room.players.filter((p) => p.connected).length; g.inGame = inGame; g.gameId = room.gameId;
      if (inGame) track("game_started", { game_id: room.gameId, role, players: g.players, game_no: gameNo + 1 });
    } else if (prev === "game" && room.phase !== "game" && g.gameId) {
      const duration_s = Math.round((Date.now() - g.startedAt) / 1000);
      if (room.phase === "ceremony" && room.ceremony) {
        const c = room.ceremony;
        const won = c.winnerIds?.includes(me) || c.winnerId === me;
        const result = won ? "won" : c.loserId === me ? "lost" : "played";
        const params = { game_id: g.gameId, role, players: g.players, duration_s, game_no: c.gamesPlayed ?? gameNo, result };
        if (g.inGame) { track("game_ended", params); bumpGamesTotal(); }
        // אירוע-חדר יחיד (רק המארח) — זה ה-Key Event ל-Google Ads: "חדר שסיים משחק"
        if (role === "host") track("room_completed", params);
      } else if (g.inGame) {
        track("game_aborted", { game_id: g.gameId, role, players: g.players, duration_s });
      }
      g.inGame = false;
    } else if (room.phase === "lobby" && role === "host" && room.gameId && room.gameId !== g.gameId) {
      track("game_selected", { game_id: room.gameId, players: room.players.filter((p) => p.connected).length });
    }
    if (room.phase === "lobby") g.gameId = room.gameId;
    g.phase = room.phase;
  }, [room, me]);

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
        <div className="sub" style={{ textAlign: "center", marginBottom: 2 }}>{t("lobby.room")}</div>
        <div className="code-big" style={{ marginBottom: 20 }}>{code}</div>
        <form className="card popin" style={{ padding: 18 }}
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) armAndJoin(); }}>
          <h2 style={{ textAlign: "center", marginBottom: 4 }}>{t("lobby.welcome")}</h2>
          <p className="sub" style={{ textAlign: "center", marginBottom: 14, fontSize: 13 }}>
            {t("lobby.ask_name")}<br />
            <span style={{ fontSize: 11.5 }}>{t("lobby.name_note")}</span>
          </p>
          <input className="input" placeholder={t("lobby.name_ph")} value={name} maxLength={14} autoFocus
            onChange={(e) => setName(e.target.value)} />
          <button className="btn" type="submit" style={{ marginTop: 14 }} disabled={!name.trim()}>
            {t("lobby.lets_go")}
          </button>
          <p className="sub" style={{ textAlign: "center", fontSize: 11, marginTop: 8 }}>
            {t("lobby.ios_note")}
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
        <h1 style={{ margin: "12px 0 8px" }}>{t("lobby.resume_title")}</h1>
        <p className="sub" style={{ marginBottom: 26 }}>
          {t("lobby.resume_sub")}
        </p>
        <button className="btn gold" onClick={armAndJoin}>{t("lobby.resume_btn")}</button>
      </main>
    );
  }

  /* ---------- בתוך החדר ---------- */
  if (fatal && !room) {
    return (
      <main style={{ justifyContent: "center", textAlign: "center" }}>
        <div style={{ fontSize: 64 }}>🕳️</div>
        <h1 style={{ margin: "12px 0 6px" }}>{t("lobby.oops")}</h1>
        <p className="sub" style={{ marginBottom: 24 }}>{fatal}</p>
        <button className="btn" style={{ maxWidth: 300, margin: "0 auto" }} onClick={() => navigate("/")}>
          {t("lobby.home")}
        </button>
      </main>
    );
  }
  if (!room) {
    return <main style={{ justifyContent: "center", textAlign: "center" }}>
      <div className="pulse" style={{ fontSize: 60 }}>🪐</div>
      <p className="sub">{t("lobby.connecting_to", { code })}</p>
    </main>;
  }

  const isHost = me === room.hostId;
  const conn = connRef.current!;

  function leaveRoom() {
    track("room_left", { role: isHost ? "host" : "guest", phase: room?.phase ?? "", game_id: room?.gameId ?? "" });
    leavingRef.current = true;
    conn.send({ t: "leave" });
    conn.close();
    navigate("/");
  }

  if (room.phase === "ceremony" && room.ceremony) {
    return (
      <>
        {!isHost && <button className="exit-fab" onClick={leaveRoom}>{t("lobby.exit")}</button>}
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
          <h1 style={{ margin: "14px 0 6px" }}>{t("lobby.midgame_title")}</h1>
          <p className="sub" style={{ marginBottom: 24 }}>
            {t("lobby.midgame_sub1")}<br />{t("lobby.midgame_sub2")}
          </p>
          <button className="btn ghost" style={{ maxWidth: 280, margin: "0 auto" }} onClick={leaveRoom}>
            {t("lobby.leave_room")}
          </button>
        </main>
      );
    }
    const View = GAME_VIEWS[room.gameId];
    if (View) return (
      <>
        {isHost ? (
          <button className="exit-fab" onClick={() => conn.send({ t: "back_to_lobby" })}>
            {t("lobby.end_game")}
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
        <span className="chip">{status === "open" ? t("lobby.connected") : t("lobby.connecting")}</span>
      </div>

      <div className="joined-banner popin">
        <span className="tick">✅</span>
        <div style={{ flex: 1 }}>
          <b>{t("lobby.you_in", { emoji, name: name.trim() || t("app.player") })}</b>
          <div className="sub" style={{ fontSize: 12.5 }}>
            {/* לחבורה שנשמרה יש שם — והוא עדיף על "חדר KFRT" בכל מקום שהוא מופיע */}
            {room.group ? t("lobby.group_line", { name: room.group.name, n: Math.max(1, room.group.evenings + 1) }) : t("lobby.room_code", { code })}
            {" · "}{t("lobby.connected_n", { n: connectedCount })}
            {isHost ? t("lobby.you_host") : ""}
          </div>
        </div>
      </div>

      {isHost ? (
        <div className="card" style={{ textAlign: "center" }}>
          <div className="sub">{t("lobby.friends_scan")}</div>
          <QRCodeView url={roomUrl(code, "qr")} />
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
            <span className="nm"><bdi>{p.name}</bdi>{p.id === me ? t("lobby.me") : ""}</span>
          </div>
        ))}
      </div>

      {isHost ? (
        <HostCatalog room={room} onSelect={(gameId, config) => conn.send({ t: "select_game", gameId, config })}
          onStart={() => conn.send({ t: "start_game" })} />
      ) : room.gameId ? (
        <GameExplainer room={room} me={me} conn={conn} />
      ) : (
        <p className="sub" style={{ textAlign: "center" }}>
          {t("lobby.host_picking", { name: room.players.find((p) => p.id === room.hostId)?.name ?? "" })}
        </p>
      )}

      <button className="btn ghost" style={{ marginTop: 18, opacity: 0.75 }} onClick={leaveRoom}>
        {t("lobby.leave_room")}
      </button>
    </main>
  );
}

/* המארח בחר משחק — כל שחקן קורא את ההסבר ומאשר "הבנתי" לפני שמתחילים */
function GameExplainer({ room, me, conn }: { room: RoomSnapshot; me: string; conn: Connection }) {
  const g = CATALOG.find((x) => x.id === room.gameId);
  if (!g) return null;
  const gt = gameText(g);
  const confirmed = !!room.gotIt?.includes(me);

  return (
    <div className="card popin" style={{ padding: 18, textAlign: "center" }}>
      <div style={{ fontSize: 44 }}>{g.icon}</div>
      <h2 style={{ margin: "6px 0 2px" }}>{gt.name}</h2>
      <p className="sub" style={{ fontSize: 13 }}>{gt.tagline}</p>
      <p style={{
        fontSize: 14.5, lineHeight: 1.7, textAlign: "start", margin: "14px 0 16px",
        background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: "12px 14px",
      }}>
        {gt.howTo}
      </p>
      {confirmed ? (
        <div className="popin">
          <div style={{ fontSize: 34 }}>✅</div>
          <p className="sub" style={{ fontWeight: 700, marginTop: 4 }}>
            {t("lobby.got_it_wait")}
          </p>
        </div>
      ) : (
        <button className="btn gold" onClick={() => { Sfx.ding(); vibrate(40); conn.send({ t: "got_it" }); }}>
          {t("lobby.got_it_btn")}
        </button>
      )}
    </div>
  );
}

/* שיתוף מהיר — הדרך הקלה להכניס חברים בלי להקליד כלום */
function ShareRow({ code }: { code: string }) {
  // ‎&s= = מאיפה הגיע המצטרף (וואטסאפ / שיתוף / QR) — נקרא באנליטיקה ב-room_joined
  const joinUrl = roomUrl(code, "wa");
  const text = t("lobby.share_msg", { url: joinUrl });

  async function shareNative() {
    track("invite_share", { channel: "native" });
    try {
      await navigator.share({ title: "LARIK", text: t("lobby.share_short"), url: roomUrl(code, "sh") });
    } catch { /* המשתמש ביטל */ }
  }

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
      <a className="btn wa" style={{ flex: 1, textDecoration: "none" }}
        href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"
        onClick={() => track("invite_share", { channel: "whatsapp" })}>
        {t("lobby.share_wa")}
      </a>
      {"share" in navigator && (
        <button className="btn ghost" style={{ flex: "0 0 auto", width: "auto", padding: "17px 18px" }}
          onClick={shareNative} aria-label={t("lobby.share_aria")}>
          ⤴️
        </button>
      )}
    </div>
  );
}

/* קטגוריות הקטלוג — המופע חי בעולם משלו (larik.ai/show) */
const CATEGORIES: { icon: string; key: string; ids: string[] }[] = [
  { icon: "🎉", key: "lobby.cat_party", ids: ["whomost", "impostor", "undercover", "alias", "forehead"] },
  { icon: "⚡", key: "lobby.cat_action", ids: ["metro", "tanks", "floors", "thieves", "abyss", "colorrules", "pods", "demons"] },
  { icon: "🤝", key: "lobby.cat_coop", ids: ["wall", "hofrim", "bombs", "simon"] },
  { icon: "🧠", key: "lobby.cat_brain", ids: ["trivia", "deathtouch"] },
  { icon: "🏃", key: "games.spods.category", ids: CATALOG.filter((g) => g.category === SPODS_CATEGORY).map((g) => g.id) },
];
/* סדר ההמלצה של "המנחה" — הכי חברתיים קודם */
const RECO_ORDER = ["impostor", "undercover", "whomost", "alias", "metro", "tanks", "floors", "wall", "hofrim", "thieves", "abyss", "bombs", "colorrules", "trivia", "forehead", "demons", "simon", "pods", "deathtouch"];

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
        <h2 className="section-title" style={{ margin: "6px 0" }}>{t("lobby.pick_game")}</h2>
        <button className="chip" style={{ border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 800 }}
          onClick={surprise}>
          {t("lobby.surprise")}
        </button>
      </div>

      {shown && (
        <div className="featured popin" key={shown.id}
          style={{ "--gc": GAME_COLORS[shown.id] ?? "#8b5cf6" } as CSSProperties}>
          {!sel && <span className="badge-reco">{t("lobby.reco_for", { n: connected })}</span>}
          <div className="fhead">
            <span className="fic">{shown.icon}</span>
            <span>
              <b style={{ fontSize: 18 }}>{gameText(shown).name}</b>
              <div className="sub" style={{ fontSize: 13 }}>{gameText(shown).tagline}</div>
              <div className="sub" style={{ fontSize: 11.5, opacity: 0.85, marginTop: 2 }}>
                {t("lobby.players_range", { min: shown.minPlayers, max: shown.maxPlayers })}
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
          <div className="howto">{gameText(shown).howTo}</div>
          {sel && others.length > 0 && (
            <div className="sub" style={{ marginTop: 10, fontWeight: 700, color: allGotIt ? "#7ee787" : undefined }}>
              {allGotIt ? t("lobby.all_read") : t("lobby.got_count", { got: gotCount, all: others.length })}
            </div>
          )}
          {sel ? (
            <button className="btn" style={{ marginTop: 12 }} disabled={!canStart} onClick={onStart}>
              {canStart ? t("lobby.start") : customPending ? t("lobby.create_deck_first") : t("lobby.need_players", { n: sel.minPlayers })}
            </button>
          ) : (
            <button className="btn" style={{ marginTop: 12 }} onClick={() => shown && onSelect(shown.id, config)}>
              {t("lobby.pick_this", { name: gameText(shown).name })}
            </button>
          )}
        </div>
      )}

      {CATEGORIES.map((cat) => (
        <div key={cat.key}>
          <div className="cat-title">
            <span>{cat.icon}</span> {t(cat.key)}
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
                  <b>{gameText(g).name}</b>
                  <span className="pp">👥 {g.minPlayers}–{g.maxPlayers}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <p className="sub" style={{ fontSize: 11.5, textAlign: "center", marginTop: 6 }}>
        {t("lobby.show_moved")}
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
    const topicText = topic.trim();
    if (topicText.length < 2 || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/ai-deck?topic=${encodeURIComponent(topicText)}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.cards)) { setErr(data.error || t("deck.err")); }
      else { track("ai_deck_created"); onDeck(data.name, data.cards); }
    } catch {
      setErr(t("deck.err_net"));
    }
    setBusy(false);
  }

  if (avail === false) {
    return (
      <p className="sub" style={{ marginTop: 10, fontSize: 12.5 }}>
        {t("deck.unavailable")}
      </p>
    );
  }

  return (
    <div style={{ marginTop: 10, background: "rgba(255,255,255,.05)", borderRadius: 14, padding: "12px 12px" }}>
      {current ? (
        <div className="popin" style={{ textAlign: "center" }}>
          <b style={{ fontSize: 15 }}>✨ {current.name}</b>
          <div className="sub" style={{ fontSize: 12 }}>{t("deck.ready", { n: current.count })}</div>
        </div>
      ) : (
        <p className="sub" style={{ fontSize: 12.5, marginBottom: 8 }}>
          {t("deck.prompt")}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: current ? 10 : 0 }}>
        <input className="input" placeholder={current ? t("deck.ph_other") : t("deck.ph")} value={topic} maxLength={60}
          style={{ textAlign: "start", fontSize: 15, padding: 11 }}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") generate(); }} />
        <button className="btn gold" style={{ width: "auto", padding: "0 16px", fontSize: 15 }}
          disabled={busy || topic.trim().length < 2} onClick={generate}>
          {busy ? "🪄..." : t("deck.create")}
        </button>
      </div>
      {busy && <p className="sub pulse" style={{ fontSize: 12, marginTop: 8, textAlign: "center" }}>{t("deck.cooking")}</p>}
      {err && <p className="sub" style={{ fontSize: 12, marginTop: 8, color: "#ff8a8a", fontWeight: 700, textAlign: "center" }}>{err}</p>}
    </div>
  );
}
