/**
 * "מטר הפצצות" — צד לקוח. שיתופי: כל החדר נגד הפצצות.
 *
 * הפצצה נוחתת כ-cue מסונכרן — כולם רואים אותה נוחתת באותה מילישנייה,
 * והפתיל נספר בזמן-שרת, כך שכל הטלפונים מסכימים בדיוק מתי "בום".
 */
import { useEffect, useRef, useState } from "react";
import type { BombsServerMsg, BombType } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";

interface BombV {
  id: number;
  type: BombType;
  holder: string;
  explodeAt: number;
  stuck: boolean;
  partner?: string;
  holds: string[];
}

const SPRITE: Record<BombType, string> = {
  classic: "/bombs/classic.png",
  sticky: "/bombs/sticky.png",
  chain: "/bombs/chain.png",
  duo: "/bombs/duo.png",
};
const FALLBACK: Record<BombType, string> = { classic: "💣", sticky: "🟣", chain: "⛓️", duo: "🤝" };
const TYPE_HINT: Record<BombType, string> = {
  classic: "העף אותה למישהו! 👇",
  sticky: "דביקה! שפשף אותה חזק כדי לשחרר 🧽",
  chain: "זהירות — מתפצלת בהעברה! ⛓️",
  duo: "תאומה! שניכם מחזיקים בו-זמנית 🤝",
};
const RUB_TARGET = 900; // פיקסלים של שפשוף

export default function BombsView({ room, me, conn, hub }: GameViewProps) {
  const [lives, setLives] = useState(3);
  const [bombs, setBombs] = useState<BombV[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState<"" | "boom" | "defuse">("");
  const [toast, setToast] = useState("");
  const [started, setStarted] = useState(false);
  const [, setTick] = useState(0); // מנוע האנימציה של הפתילים
  const rubRef = useRef<Record<number, number>>({});
  const lastPosRef = useRef<Record<number, { x: number; y: number }>>({});
  const lastBeepRef = useRef<Record<number, number>>({});
  const bombsRef = useRef<BombV[]>([]);
  bombsRef.current = bombs;

  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? "";
  const emojiOf = (pid: string) => room.players.find((p) => p.id === pid)?.emoji ?? "🙂";

  function showToast(m: string) {
    setToast(m);
    window.setTimeout(() => setToast(""), 2200);
  }

  /* ---- אירועי שרת ---- */
  useEffect(() => hub.subscribe((d, at) => {
    const m = d as BombsServerMsg;
    switch (m.a) {
      case "bm_start":
        setLives(m.lives);
        setStarted(true);
        Sfx.countBeep();
        return;
      case "bm_spawn": {
        const b: BombV = { id: m.bombId, type: m.type, holder: m.holder, explodeAt: at + m.fuseMs, stuck: m.type === "sticky", partner: m.partner, holds: [] };
        setBombs((bs) => [...bs, b]);
        if (m.holder === me || m.partner === me) { Sfx.alarm(); vibrate([90, 50, 90]); }
        else Sfx.ding();
        return;
      }
      case "bm_pass":
        setBombs((bs) => bs.map((b) => (b.id === m.bombId ? { ...b, holder: m.to } : b)));
        if (m.to === me) { Sfx.goBeep(); vibrate([70, 40, 70]); showToast(`💣 ${nameOf(m.from)} העיף אליך!`); }
        else if (m.from === me) Sfx.pop();
        return;
      case "bm_unstuck":
        setBombs((bs) => bs.map((b) => (b.id === m.bombId ? { ...b, stuck: false } : b)));
        return;
      case "bm_hold":
        setBombs((bs) => bs.map((b) => {
          if (b.id !== m.bombId) return b;
          const holds = m.down ? [...new Set([...b.holds, m.pid])] : b.holds.filter((p) => p !== m.pid);
          return { ...b, holds };
        }));
        return;
      case "bm_defused":
        setBombs((bs) => bs.filter((b) => b.id !== m.bombId));
        setFlash("defuse");
        window.setTimeout(() => setFlash(""), 500);
        Sfx.fanfare();
        if (m.by.includes(me)) vibrate([40, 30, 40, 30, 120]);
        showToast(`✨ ${m.by.map(nameOf).join(" + ")} נטרלו תאומה!`);
        return;
      case "bm_explode":
        setBombs((bs) => bs.filter((b) => b.id !== m.bombId));
        setFlash("boom");
        window.setTimeout(() => setFlash(""), 700);
        Sfx.boom();
        vibrate(m.holder === me ? 600 : 250);
        showToast(`💥 התפוצצה אצל ${nameOf(m.holder)}!`);
        return;
      case "bm_lives":
        setLives(m.lives);
        return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [hub, me]);

  /* ---- מנוע פתילים: עדכון חלק + טיקים כשנהיה צפוף ---- */
  useEffect(() => {
    let raf = 0;
    const step = () => {
      setTick((t) => t + 1);
      const now = conn.serverNow();
      for (const b of bombsRef.current) {
        if (b.holder !== me && b.partner !== me) continue;
        const remain = b.explodeAt - now;
        if (remain > 0 && remain < 5200) {
          const sec = Math.ceil(remain / 1000);
          if (lastBeepRef.current[b.id] !== sec) {
            lastBeepRef.current[b.id] = sec;
            Sfx.tick();
            if (remain < 2200) vibrate(35);
          }
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- פעולות ---- */
  function throwTo(pid: string) {
    if (selected == null) return;
    conn.sendGame({ a: "bm_pass", bombId: selected, to: pid });
    setSelected(null);
  }

  function onRub(bombId: number, e: React.PointerEvent) {
    if (e.buttons === 0) { delete lastPosRef.current[bombId]; return; }
    // דלתא ידנית מ-clientX/Y — ב-iOS ערכי movementX/Y הם תמיד 0 והמד לא היה מתמלא
    const last = lastPosRef.current[bombId];
    lastPosRef.current[bombId] = { x: e.clientX, y: e.clientY };
    if (!last) return;
    const acc = (rubRef.current[bombId] ?? 0) + Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y);
    rubRef.current[bombId] = acc;
    if (acc >= RUB_TARGET) {
      conn.sendGame({ a: "bm_unstuck", bombId });
      setBombs((bs) => bs.map((b) => (b.id === bombId ? { ...b, stuck: false } : b)));
      Sfx.pop(); vibrate(60);
    } else {
      setTick((t) => t + 1);
    }
  }

  const now = conn.serverNow();
  const mine = bombs.filter((b) => b.holder === me || (b.type === "duo" && b.partner === me));
  const others = room.players.filter((p) => p.id !== me && p.connected && (room.gamePids?.includes(p.id) ?? true));
  const loadOf = (pid: string) => bombs.filter((b) => b.holder === pid).length;
  const heat = mine.length >= 3 ? "#2a0b12" : mine.length === 2 ? "#1d0e14" : "#0b0e17";

  return (
    <main className={"bomb-arena" + (flash === "boom" ? " shake-hard" : "")} style={{ background: heat }}>
      {flash && <div className={"flashfx " + flash} />}
      {toast && <div className="toast" style={{ zIndex: 60 }}>{toast}</div>}

      {/* HUD */}
      <div className="bomb-hud">
        <span style={{ fontSize: 20, letterSpacing: 2 }}>
          {Array.from({ length: 3 }, (_, i) => (i < lives ? "❤️" : "🖤")).join("")}
        </span>
        <span className="chip">💣 {bombs.length} באוויר</span>
      </div>

      {!started && <div className="big pulse" style={{ textAlign: "center", marginTop: 60 }}>💣 מטר הפצצות מתחיל...</div>}

      {/* הפצצות שלי */}
      <div className="bomb-zone">
        {mine.length === 0 && started && (
          <div style={{ textAlign: "center", opacity: 0.75 }}>
            <div style={{ fontSize: 54 }} className="pulse">😮‍💨</div>
            <p className="sub">אצלך נקי... בינתיים.</p>
            <p className="sub" style={{ fontSize: 12 }}>תסתכל מי עמוס וצעק לו לזרוק אליך!</p>
          </div>
        )}

        {mine.map((b) => {
          const remain = Math.max(0, b.explodeAt - now);
          const total = 10_000;
          const frac = Math.min(1, remain / total);
          const danger = remain < 3000;
          const iAmDuo = b.type === "duo";
          const iHold = b.holds.includes(me);
          const partnerId = b.holder === me ? b.partner : b.holder;
          const partnerHolds = partnerId ? b.holds.includes(partnerId) : false;
          const rub = Math.min(1, (rubRef.current[b.id] ?? 0) / RUB_TARGET);

          return (
            <div key={b.id}
              className={"bomb-card popin" + (selected === b.id ? " sel" : "") + (danger ? " danger" : "")}
              onPointerDown={() => { if (!iAmDuo && !b.stuck) { setSelected(selected === b.id ? null : b.id); vibrate(20); } }}
              onPointerMove={(e) => { if (b.stuck && b.holder === me) onRub(b.id, e); }}>
              <div className="fuse-ring" style={{
                background: `conic-gradient(${danger ? "#ff4d4d" : "#ffce3c"} ${frac * 360}deg, rgba(255,255,255,.08) 0deg)`,
              }}>
                <img src={SPRITE[b.type]} alt="" draggable={false}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling!.textContent = FALLBACK[b.type]; }}
                  className={b.stuck ? "wobble" : danger ? "shake" : ""} />
                <span style={{ fontSize: 52, display: "none" }} />
                <b className="fuse-sec" style={{ color: danger ? "#ff8a8a" : "#ffe9a8" }}>{(remain / 1000).toFixed(1)}</b>
              </div>

              {b.stuck && b.holder === me && (
                <div className="rub-bar"><div style={{ width: `${rub * 100}%` }} /></div>
              )}

              {iAmDuo ? (
                <button className={"btn duo-hold" + (iHold ? " holding" : "")}
                  onPointerDown={(e) => { e.stopPropagation(); conn.sendGame({ a: "bm_hold", bombId: b.id, down: true }); }}
                  onPointerUp={() => conn.sendGame({ a: "bm_hold", bombId: b.id, down: false })}
                  onPointerLeave={() => { if (iHold) conn.sendGame({ a: "bm_hold", bombId: b.id, down: false }); }}>
                  {iHold && partnerHolds ? "מנטרלים... 🤝" : iHold ? `חכה ל${nameOf(partnerId ?? "")}...` : "החזק לנטרול! 🤝"}
                  <span className="duo-dots">
                    <i className={iHold ? "on" : ""} />
                    <i className={partnerHolds ? "on" : ""} />
                  </span>
                </button>
              ) : (
                <p className="sub" style={{ fontSize: 12, textAlign: "center", marginTop: 6 }}>
                  {b.stuck ? TYPE_HINT.sticky : selected === b.id ? "עכשיו בחר למי להעיף! 👇" : TYPE_HINT[b.type]}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* שורת השחקנים — יעדי זריקה + מדדי עומס */}
      <div className="throw-row">
        {others.map((p) => {
          const load = loadOf(p.id);
          return (
            <button key={p.id}
              className={"throw-chip" + (selected != null ? " ready" : "") + (load >= 2 ? " loaded" : "")}
              onPointerDown={() => throwTo(p.id)}>
              <span style={{ fontSize: 26 }}>{p.emoji}</span>
              <span className="nm">{p.name}</span>
              {load > 0 && <span className="loadbadge">{"💣".repeat(Math.min(load, 3))}</span>}
            </button>
          );
        })}
      </div>
      <p className="sub" style={{ textAlign: "center", fontSize: 11, opacity: 0.7, paddingBottom: 6 }}>
        {selected != null ? "בחר חבר להעיף אליו 🎯" : "גע בפצצה שלך ואז בחבר — והכי חשוב: דברו!"}
      </p>
      <span style={{ display: "none" }}>{emojiOf(me)}</span>
    </main>
  );
}
