/**
 * "הכור" ☢️ — צד לקוח. קו-אופ תפקידים: מזינים → טוען → ליבה, והמתקן מציל תקלות.
 *
 * פריסת מסך (החלטת איתן 23.8): פס-תהליך דק וקריא-במבט למעלה (מזינים/תקלות/תור/ליבה),
 * והתחנה של השחקן בגדול. הצליל הוא השופט — כל אירוע קריטי נשמע, לא רק נראה.
 * ה-ringEpoch של טבעת הטוען = זמן ה-cue של פתיחת הגל (השרת שולח 0 → משתמשים ב-at).
 */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ReactorServerMsg, ReactorRole, ReactorCard, ReactorStats } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";
import { RX_ASSET, RX_FALLBACK } from "./reactorAssets";

interface OrbV { id: number; expireAt: number; bornAt: number }

/** תמונה מהמניפסט עם fallback אימוג'י — עד שנכסי ההיגספילד בפנים */
function Art({ k, size, className }: { k: keyof typeof RX_ASSET; size: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <span className={className} style={{ fontSize: size * 0.8, lineHeight: 1 }}>{RX_FALLBACK[k]}</span>;
  return <img src={RX_ASSET[k]} alt="" draggable={false} className={className}
    style={{ width: size, height: size, objectFit: "contain" }} onError={() => setBroken(true)} />;
}

const ROLE_NAME: Record<ReactorRole, string> = { feeder: "מזין", loader: "טוען", fixer: "מתקן" };
const ROLE_ICON: Record<ReactorRole, string> = { feeder: "🫳", loader: "🎯", fixer: "🔧" };
const ROLE_HINT: Record<ReactorRole, string> = {
  feeder: "גע באורבים לפני שהם נעלמים — כל אורב שאבד פוגע בליבה!",
  loader: "גע כשהסמן בירוק! מושלם = פי 6 אנרגיה",
  fixer: "תחנה אדומה = תקלה. גע בה 4 פעמים מהר!",
};
const FIX_TAPS = 4;

export default function ReactorView({ room, me, conn, hub }: GameViewProps) {
  const [phase, setPhase] = useState<"warmup" | "wave" | "draft" | "runover">("warmup");
  const [wave, setWave] = useState(0);
  const [hp, setHp] = useState(100);
  const [roles, setRoles] = useState<Record<string, ReactorRole>>({});
  const [ringMs, setRingMs] = useState(2100);
  const [ringEpoch, setRingEpoch] = useState(0);
  const [pf, setPf] = useState(0.09);
  const [gf, setGf] = useState(0.22);
  const [queueN, setQueueN] = useState(0);
  const [orbsMine, setOrbsMine] = useState<OrbV[]>([]);
  const [jams, setJams] = useState<string[]>([]);
  const [draft, setDraft] = useState<{ cards: ReactorCard[]; until: number } | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [gold, setGold] = useState<{ tapAt: number; until: number; need: number; done: boolean } | null>(null);
  const [melt, setMelt] = useState(false);
  const [runOver, setRunOver] = useState<{ wave: number; bestWave: number; nearMiss?: string; mvp?: string; stats: Record<string, ReactorStats> } | null>(null);
  const [toast, setToast] = useState("");
  const [flash, setFlash] = useState<"" | "perfect" | "good" | "weak" | "lost">("");
  const [, setTick] = useState(0);
  const boltsRef = useRef<Record<string, number>>({});
  const lastBeep = useRef<Record<number, number>>({});
  const goldBeeped = useRef(0);
  const orbsRef = useRef<OrbV[]>([]);
  orbsRef.current = orbsMine;
  const goldRef = useRef(gold);
  goldRef.current = gold;

  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? "";
  const emojiOf = (pid: string) => room.players.find((p) => p.id === pid)?.emoji ?? "🙂";
  const myRole: ReactorRole | undefined = roles[me];
  const isHost = room.hostId === me;

  function showToast(m: string) { setToast(m); window.setTimeout(() => setToast(""), 2000); }
  function flashQ(q: "perfect" | "good" | "weak" | "lost") { setFlash(q); window.setTimeout(() => setFlash(""), 450); }

  /* ---- אירועי שרת ---- */
  useEffect(() => hub.subscribe((d, at) => {
    const m = d as ReactorServerMsg;
    switch (m.a) {
      case "rx_wave":
        setPhase("wave"); setWave(m.wave); setHp(m.hp); setRoles(m.roles);
        setRingMs(m.ringMs); setRingEpoch(m.ringEpoch || at); setPf(m.pf); setGf(m.gf);
        setQueueN(0); setOrbsMine([]); setJams([]); setDraft(null); setPickedId(null);
        setGold(null); setMelt(false); setRunOver(null);
        boltsRef.current = {};
        Sfx.goBeep(); vibrate([60, 40, 60]);
        showToast(`🌊 גל ${m.wave} — ${ROLE_ICON[m.roles[me] ?? "feeder"]} אתה ה${ROLE_NAME[m.roles[me] ?? "feeder"]}!`);
        return;
      case "rx_state": // rejoin / החלפת תפקיד באמצע
        setPhase(m.phase); setWave(m.wave); setHp(m.hp); setRoles(m.roles);
        setRingMs(m.ringMs); setRingEpoch(m.ringEpoch || at); setPf(m.pf); setGf(m.gf);
        setQueueN(m.queue); setJams(m.jams);
        return;
      case "rx_orb":
        if (m.feeder === me) {
          setOrbsMine((os) => [...os, { id: m.orbId, expireAt: m.expireAt, bornAt: at }]);
          Sfx.ding(); vibrate(30);
        }
        return;
      case "rx_sent":
        setOrbsMine((os) => os.filter((o) => o.id !== m.orbId));
        if (roles[me] === "loader") Sfx.tick();
        return;
      case "rx_queue":
        setQueueN(m.queue);
        return;
      case "rx_injected":
        setQueueN(m.queue); setHp(m.hp);
        if (m.by === me) {
          flashQ(m.quality);
          if (m.quality === "perfect") { Sfx.fanfare(); vibrate([40, 30, 90]); }
          else if (m.quality === "good") Sfx.pop();
          else Sfx.tick();
        } else if (m.quality === "perfect") Sfx.pop();
        return;
      case "rx_lost":
        setHp(m.hp);
        setOrbsMine((os) => os.filter((o) => o.id !== m.orbId));
        if (m.where === me) { flashQ("lost"); Sfx.alarm(); vibrate(200); showToast("💔 איבדת אורב!"); }
        else Sfx.tick();
        return;
      case "rx_jam":
        setJams((js) => [...new Set([...js, m.station])]);
        if (m.station === me) { Sfx.alarm(); vibrate([120, 60, 120]); }
        if (roles[me] === "fixer") { Sfx.alarm(); vibrate([80, 40, 80]); }
        return;
      case "rx_unjam":
        setJams((js) => js.filter((s) => s !== m.station));
        delete boltsRef.current[m.station];
        Sfx.pop();
        if (m.station === me) showToast(`🔧 ${nameOf(m.by)} תיקן אותך!`);
        return;
      case "rx_hp":
        setHp(m.hp);
        return;
      case "rx_gold": {
        const tapAt = at + m.leadMs;
        setGold({ tapAt, until: tapAt + m.windowMs, need: m.need, done: false });
        goldBeeped.current = 0;
        return;
      }
      case "rx_gold_res":
        setGold(null); setHp(m.hp);
        if (m.success) { Sfx.fanfare(); vibrate([50, 30, 50, 30, 120]); showToast(`🟡 אורב הזהב! ‎+${m.count} נגעו — הליבה נרפאת!`); }
        else { Sfx.sadTrombone(); showToast(`🟡 רק ${m.count}/${m.need} נגעו... פספסתם את הזהב`); }
        return;
      case "rx_wave_clear":
        setPhase("draft"); setHp(m.hp); setOrbsMine([]); setGold(null);
        Sfx.fanfare(); vibrate([40, 30, 40, 30, 100]);
        return;
      case "rx_draft":
        setDraft({ cards: m.cards, until: m.until }); setPickedId(null);
        return;
      case "rx_picked":
        if (m.pid !== me) showToast(`${emojiOf(m.pid)} ${nameOf(m.pid)} בחר ${m.emoji} ${m.name}`);
        return;
      case "rx_meltdown":
        setMelt(true); setGold(null); setDraft(null);
        Sfx.boom(); vibrate(700);
        return;
      case "rx_run_over":
        setPhase("runover"); setMelt(false); setRunOver(m);
        Sfx.sadTrombone();
        return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [hub, me, roles]);

  /* ---- מנוע RAF: טבעת הטוען, טבעות אורבים, ביפים ---- */
  useEffect(() => {
    let raf = 0;
    const step = () => {
      setTick((t) => t + 1);
      const now = conn.serverNow();
      for (const o of orbsRef.current) {
        const remain = o.expireAt - now;
        if (remain > 0 && remain < 1500) {
          const sec = Math.ceil(remain / 500);
          if (lastBeep.current[o.id] !== sec) { lastBeep.current[o.id] = sec; Sfx.tick(); }
        }
      }
      const g = goldRef.current;
      if (g && now < g.tapAt) {
        const sec = Math.ceil((g.tapAt - now) / 1000);
        if (goldBeeped.current !== sec) { goldBeeped.current = sec; Sfx.countBeep(); vibrate(40); }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = conn.serverNow();
  const participants = room.players.filter((p) => (room.gamePids?.includes(p.id) ?? true));
  const feeders = participants.filter((p) => roles[p.id] === "feeder");
  const loaderPid = Object.keys(roles).find((p) => roles[p] === "loader");
  const fixerPid = Object.keys(roles).find((p) => roles[p] === "fixer");
  const hpColor = hp > 55 ? "#22d3ee" : hp > 25 ? "#ffce3c" : "#ff4d4d";
  const iAmJammed = jams.includes(me);

  /* ---- פעולות ---- */
  function feed(orbId: number) {
    if (iAmJammed) return;
    conn.sendGame({ a: "rx_feed", orbId });
    setOrbsMine((os) => os.filter((o) => o.id !== orbId));
    Sfx.pop(); vibrate(25);
  }
  function inject() {
    conn.sendGame({ a: "rx_inject", atServer: Math.round(conn.serverNow()) });
    vibrate(20);
  }
  function fixTap(station: string) {
    if (!jams.includes(station)) return;
    const n = (boltsRef.current[station] ?? 0) + 1;
    boltsRef.current[station] = n;
    Sfx.tick(); vibrate(25);
    if (n >= FIX_TAPS) { conn.sendGame({ a: "rx_fixed", station }); delete boltsRef.current[station]; }
    else setTick((t) => t + 1);
  }
  function goldTap() {
    if (!gold || gold.done) return;
    conn.sendGame({ a: "rx_gold_tap" });
    setGold({ ...gold, done: true });
    Sfx.goBeep(); vibrate([40, 20, 40]);
  }

  /* ---- טבעת הטוען ---- */
  const ringPhase = ringMs > 0 ? ((((now - ringEpoch) % ringMs) + ringMs) % ringMs) / ringMs : 0;
  const markerDeg = ringPhase * 360;
  const pfDeg = pf * 360, gfDeg = gf * 360;

  return (
    <main className={"rx-arena" + (melt ? " shake-hard" : "")}
      style={{ "--rx-hp": hpColor } as CSSProperties}>
      {toast && <div className="toast" style={{ zIndex: 70 }}>{toast}</div>}
      {flash && <div className={"rx-flash " + flash} />}

      {/* ══ פס התהליך — קריא במבט ══ */}
      <div className="rx-strip">
        <span className="chip" style={{ fontWeight: 800 }}>🌊 {wave || "..."}</span>
        <div className="rx-line">
          {feeders.map((p) => (
            <span key={p.id} className={"rx-dot" + (jams.includes(p.id) ? " jam" : "") + (p.id === me ? " me" : "")}
              title={p.name}>{jams.includes(p.id) ? "⚠️" : p.emoji}</span>
          ))}
          <span className="rx-arrow">‹</span>
          <span className={"rx-dot loader" + (loaderPid === me ? " me" : "")}>
            🎯{queueN > 0 && <b className="rx-qbadge">{queueN}</b>}
          </span>
          {fixerPid && <span className={"rx-dot" + (fixerPid === me ? " me" : "")} style={{ opacity: 0.85 }}>🔧</span>}
        </div>
        <div className="rx-corebox">
          <Art k={hp > 25 ? "core" : "coreHurt"} size={30} className={hp <= 25 ? "pulse" : ""} />
          <div className="rx-hpbar"><div style={{ width: `${hp}%`, background: hpColor }} /></div>
        </div>
      </div>

      {/* ══ התחנה שלי — בגדול ══ */}
      {phase === "warmup" && (
        <div className="rx-center">
          <Art k="core" size={110} className="pulse" />
          <div className="big pulse" style={{ marginTop: 12 }}>☢️ הכור מתחמם...</div>
        </div>
      )}

      {phase === "wave" && myRole === "feeder" && (
        <div className="rx-station">
          {iAmJammed && (
            <div className="rx-jam-overlay popin">
              <div style={{ fontSize: 64 }} className="pulse">⚠️</div>
              <b style={{ fontSize: 22 }}>תקלה בתחנה שלך!</b>
              <p className="sub">צעק ל{fixerPid ? nameOf(fixerPid) : "מתקן"} שיציל אותך! 🔧</p>
            </div>
          )}
          <div className="rx-orbzone">
            {orbsMine.length === 0 && !iAmJammed && (
              <p className="sub" style={{ textAlign: "center", opacity: 0.7 }}>אורבים בדרך... 👀</p>
            )}
            {orbsMine.map((o) => {
              const remain = Math.max(0, o.expireAt - now);
              const frac = Math.min(1, remain / Math.max(1, o.expireAt - o.bornAt));
              const danger = remain < 1200;
              return (
                <button key={o.id} className={"rx-orb popin" + (danger ? " danger" : "")}
                  onPointerDown={() => feed(o.id)}
                  style={{ background: `conic-gradient(${danger ? "#ff4d4d" : "#22d3ee"} ${frac * 360}deg, rgba(255,255,255,.07) 0deg)` }}>
                  <Art k="orb" size={54} className={danger ? "shake" : ""} />
                </button>
              );
            })}
          </div>
          <p className="sub rx-hint">{ROLE_HINT.feeder}</p>
        </div>
      )}

      {phase === "wave" && myRole === "loader" && (
        <div className="rx-station" onPointerDown={inject}>
          <div className="rx-ring" style={{
            background: `conic-gradient(from ${-pfDeg / 2}deg,
              #34e89e 0deg ${pfDeg}deg,
              rgba(255,206,60,.55) ${pfDeg}deg ${gfDeg}deg,
              rgba(255,255,255,.06) ${gfDeg}deg ${360 - (gfDeg - pfDeg)}deg,
              rgba(255,206,60,.55) ${360 - (gfDeg - pfDeg)}deg 360deg)`,
          }}>
            <div className="rx-ring-in">
              <Art k="core" size={64} />
              <b style={{ fontSize: 15 }}>{queueN > 0 ? `${queueN} בתור` : "התור ריק"}</b>
            </div>
            <div className="rx-marker" style={{ transform: `rotate(${markerDeg}deg)` }}><i /></div>
          </div>
          <p className="sub rx-hint">{queueN > 0 ? ROLE_HINT.loader : "אין אורבים בתור — צעק למזינים! 📣"}</p>
        </div>
      )}

      {phase === "wave" && myRole === "fixer" && (
        <div className="rx-station">
          <div className="rx-fixgrid">
            {feeders.map((p) => {
              const jammed = jams.includes(p.id);
              const bolts = boltsRef.current[p.id] ?? 0;
              return (
                <button key={p.id} className={"rx-fixcard" + (jammed ? " jam pulse" : "")}
                  onPointerDown={() => fixTap(p.id)}>
                  <span style={{ fontSize: 34 }}>{p.emoji}</span>
                  <b>{p.name}</b>
                  {jammed
                    ? <span className="rx-bolts">{Array.from({ length: FIX_TAPS }, (_, i) => (i < bolts ? "🔩" : "⚪")).join(" ")}</span>
                    : <span className="sub" style={{ fontSize: 12 }}>✅ תקין</span>}
                </button>
              );
            })}
          </div>
          <p className="sub rx-hint">{jams.length ? ROLE_HINT.fixer : "הכול תקין — תנשום... זה לא יחזיק 😅"}</p>
        </div>
      )}

      {/* ══ דראפט שדרוגים ══ */}
      {phase === "draft" && (
        <div className="rx-overlay">
          <div className="big" style={{ marginBottom: 4 }}>🌊 גל {wave} הושלם!</div>
          {draft ? (
            <>
              <p className="sub">בחר שדרוג לצוות — {Math.max(0, Math.ceil((draft.until - now) / 1000))} שנ'</p>
              <div className="rx-cards">
                {draft.cards.map((c) => (
                  <button key={c.id} className={"rx-card" + (pickedId === c.id ? " sel" : "") + (pickedId && pickedId !== c.id ? " dim" : "")}
                    disabled={!!pickedId}
                    onClick={() => { setPickedId(c.id); conn.sendGame({ a: "rx_pick", cardId: c.id }); Sfx.goBeep(); vibrate(40); }}>
                    <span style={{ fontSize: 40 }}>{c.emoji}</span>
                    <b>{c.name}</b>
                    <span className="sub" style={{ fontSize: 12 }}>{c.desc}</span>
                  </button>
                ))}
              </div>
              {pickedId && <p className="sub pulse" style={{ marginTop: 10 }}>ממתינים לשאר הצוות...</p>}
            </>
          ) : <p className="sub pulse">מכינים את הקלפים...</p>}
        </div>
      )}

      {/* ══ אורב הזהב ══ */}
      {gold && (
        <div className="rx-overlay gold" onPointerDown={goldTap}>
          <Art k="orbGold" size={110} className="pulse" />
          {now < gold.tapAt ? (
            <div className="rx-goldnum">{Math.max(1, Math.ceil((gold.tapAt - now) / 1000))}</div>
          ) : gold.done ? (
            <div className="big">✋ נגעת! מחכים לכולם...</div>
          ) : (
            <div className="rx-goldnum tap">געו כולם!!!</div>
          )}
          <p className="sub">אורב הזהב — צריך {gold.need} נגיעות ביחד! 🟡</p>
        </div>
      )}

      {/* ══ ההתכה ══ */}
      {melt && (
        <div className="rx-overlay melt">
          <Art k="meltdown" size={140} className="pulse" />
          <div className="rx-meltword">התכה!!!</div>
        </div>
      )}

      {/* ══ סוף ריצה — near-miss + עוד פעם ══ */}
      {phase === "runover" && runOver && (
        <div className="rx-overlay">
          <div style={{ fontSize: 15, opacity: 0.8 }}>☢️ הכור קרס בגל</div>
          <div className="rx-bigwave">{runOver.wave}</div>
          {runOver.nearMiss && <div className="rx-nearmiss popin">{runOver.nearMiss}</div>}
          {runOver.bestWave > runOver.wave && <p className="sub">🏆 שיא הערב: גל {runOver.bestWave}</p>}
          <div className="rx-stats">
            {Object.entries(runOver.stats).map(([pid, s]) => (
              <div key={pid} className="rx-statrow">
                <span>{emojiOf(pid)} {nameOf(pid)} {runOver.mvp === pid && "👑"}</span>
                <span className="sub" style={{ fontSize: 12 }}>
                  🫳{s.fed} · 🎯{s.perfect} · 🔧{s.fixed} · 💔{s.lost}
                </span>
              </div>
            ))}
          </div>
          {isHost ? (
            <>
              <button className="btn rx-again" onClick={() => { conn.sendGame({ a: "rx_again" }); Sfx.goBeep(); }}>
                🔁 עוד פעם! (אתם קרובים)
              </button>
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => conn.sendGame({ a: "rx_finish" })}>
                🏁 סיימנו — לטקס
              </button>
            </>
          ) : (
            <p className="sub pulse" style={{ marginTop: 14 }}>המארח מחליט: עוד ריצה או טקס... 👀</p>
          )}
        </div>
      )}
    </main>
  );
}
