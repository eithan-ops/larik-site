/**
 * ספורט פודים 🏃 — צד לקוח. שני מסכים על אותו מודול:
 *  - השלט (המארח): הגדרות, רשימת ספורטאים, מפת פודים, התחל/הפסקה/דלג/עצור, לוח חי ושיפוט.
 *  - הפוד (כל השאר): מסך כהה עם מספר הפוד; כשנדלק — כל המסך צבע + טקסט ענק, נגיעה = sp_tap בזמן-שרת.
 * ההדלקות מגיעות כ-cue: כל הפודים נדלקים באותה מילישנייה, והמדידה מול זמן ה-cue.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";
import { SP_DEFS, SP_HAND_STEPS, spColor, spGameOf, spFmtScore } from "../../../shared/spods";
const fmtScore = (g: SpGame, v: number) => SP_DEFS[g].unit === "lvl" ? t("spods.level_n", { n: v }) : spFmtScore(g, v);
import type { SpState, SpLight, SpodsServerMsg, SpodsClientMsg, SpGame } from "../../../shared/spods";
import "../spods.css";
import { t, lt, optText, currentLang } from "../lib/locale";

const TTS_LANG: Record<string, string> = { he: "he-IL", en: "en-US", es: "es-ES", pt: "pt-BR", ko: "ko-KR", ja: "ja-JP", ar: "ar-SA" };

declare global { interface Window { __spDbg?: unknown; __spAuto?: boolean } }

/* ---- קריין: דיבור בעברית אם יש קול במכשיר, אחרת שקט (הצלילים עושים את העבודה) ---- */
function speak(text: string) {
  try {
    const ss = window.speechSynthesis;
    if (!ss) return;
    const u = new SpeechSynthesisUtterance(text);
    const lang = currentLang();
    const v = ss.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang));
    if (v) u.voice = v;
    u.lang = TTS_LANG[lang] ?? lang; u.rate = 1.05;
    ss.cancel(); ss.speak(u);
  } catch { /* אין קריין */ }
}

export default function SpodsView({ room, me, conn, hub }: GameViewProps) {
  const game: SpGame = spGameOf(room.gameId ?? "") ?? "colors";
  const def = SP_DEFS[game];
  const isCoach = me === room.hostId;
  const [s, setS] = useState<SpState | null>(null);
  const [light, setLight] = useState<SpLight | null>(null);
  const [fb, setFb] = useState<{ txt: string; good?: boolean } | null>(null);
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState("");
  const [, setTick] = useState(0);
  const lightRef = useRef<SpLight | null>(null);
  lightRef.current = light;
  const sRef = useRef<SpState | null>(null);
  sRef.current = s;
  const send = (d: SpodsClientMsg) => conn.sendGame(d);
  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? "?";

  useEffect(() => { const iv = setInterval(() => setTick((t) => t + 1), 200); return () => clearInterval(iv); }, []);

  useEffect(() => hub.subscribe((d0, at) => {
    const d = d0 as unknown as SpodsServerMsg;
    switch (d.a) {
      case "sp_state": {
        const prev = sRef.current;
        setS(d.s);
        if (d.s.phase === "count" && prev?.phase !== "count") { const dt = d.s.until - conn.serverNow(); [3000, 2000, 1000].forEach((k) => { if (dt - k > 0) Sfx.countBeep(dt - k); }); }
        if (d.s.phase === "over" && prev?.phase !== "over") Sfx.fanfare();
        return;
      }
      case "sp_light":
        if (d.l.pod !== me) return;
        setLight({ ...d.l, at: at || d.l.at, until: d.l.until && at ? at + (d.l.until - d.l.at) : d.l.until });
        setFb(null);
        Sfx.goBeep(); vibrate(60);
        return;
      case "sp_off":
        if (lightRef.current?.id === d.id) setLight(null);
        return;
      case "sp_hit":
        if (d.pod === me || (d.id && lightRef.current?.id === d.id)) { setFb({ txt: d.txt !== undefined ? lt(d.txt) : (d.ms ? `${(d.ms / 1000).toFixed(2)}` : "✓"), good: d.good }); setTimeout(() => setFb(null), 1800); }
        if (isCoach) Sfx.pop();
        return;
      case "sp_miss":
        if (d.pod === me) { setFb({ txt: t("spods.miss"), good: false }); setTimeout(() => setFb(null), 1500); Sfx.sadTrombone(); }
        return;
      case "sp_go":
        Sfx.goBeep(); Sfx.goBeep(120); vibrate(120);
        return;
      case "sp_say":
        if (isCoach) { setToast(lt(d.t)); setTimeout(() => setToast(""), 2600); }
        if (d.k === "win") Sfx.fanfare(); else if (d.k === "out") Sfx.sadTrombone(); else if (d.k === "next") Sfx.ding();
        speak(lt(d.t));
        return;
      case "sp_flash":
        if (d.pod === me) { setFlash(true); Sfx.ding(); vibrate(200); setTimeout(() => setFlash(false), 700); }
        return;
      case "sp_over":
        return;
    }
  }), [hub, me, isCoach, conn]);

  // דיבאג/בוטים לפלייטסט: window.__spAuto — הפוד "נוגע" לבד אחרי 0.4–1.2 שנ'
  useEffect(() => {
    window.__spDbg = { phase: s?.phase, banner: s?.banner, round: s?.round, lit: !!light, coach: isCoach, aths: s?.aths.map((a) => [nameOf(a.pid), a.score, a.extra]) };
  });
  useEffect(() => {
    if (!light || !window.__spAuto) return;
    const delay = light.fade ? Math.max(200, light.fade - 300 + Math.random() * 600) : 400 + Math.random() * 800;
    const t = setTimeout(() => tap(light.zones ? Math.floor(Math.random() * light.zones.length) : undefined), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [light]);

  function tap(zone?: number) {
    const l = lightRef.current;
    if (!l) return;
    send({ a: "sp_tap", id: l.id, at: conn.serverNow(), zone });
    setLight(null);
    vibrate(30);
  }

  if (!s) return <main className="fullscreen sp-pod"><div className="pulse" style={{ fontSize: 60 }}>{def.icon}</div><p className="sub">{t("spods.connecting")}</p></main>;

  if (isCoach) return <Coach s={s} def={def} send={send} nameOf={nameOf} toast={toast} serverNow={() => conn.serverNow()} />;

  /* ================= הפוד ================= */
  const myIdx = s.pods.indexOf(me);
  const myAth = s.aths.find((a) => a.pid === me);
  const col = myAth ? spColor(myAth.c) : null;
  const secsLeft = s.until ? Math.max(0, Math.ceil((s.until - conn.serverNow()) / 1000)) : 0;

  if (light) {
    const c = spColor(light.c);
    // דעיכה (בדיוק בזמן): בהירות יורדת מ-1 ל-0 לאורך fade; פייק = עצירה של שנייה
    let bright = 1;
    if (light.fade) {
      let el = conn.serverNow() - light.at;
      if (light.fakeAt !== undefined) { if (el > light.fakeAt) el = el > light.fakeAt + 1000 ? el - 1000 : light.fakeAt; }
      bright = Math.max(0, 1 - el / Math.max(1, light.fade - (light.fakeAt !== undefined ? 1000 : 0)));
    }
    if (light.zones) {
      return (
        <main className="sp-pod sp-lit" style={{ background: "#FFF3DC" }}>
          <div className="sp-zones">
            {light.zones.map((z, i) => { const zc = spColor(z); return (
              <div key={i} className="sp-zone" style={{ background: zc.hex, color: zc.ink }} onPointerDown={(e) => { e.preventDefault(); tap(i); }}>
                <span>{nameOf(s.aths.find((a) => a.c === z)?.pid ?? "")}</span>
              </div>
            ); })}
          </div>
          <div className="sp-zones-title">{light.txt ? lt(light.txt) : t("spods.s.steal_bang")}</div>
        </main>
      );
    }
    return (
      <main className="sp-pod sp-lit" style={{ background: c.hex, color: c.ink, filter: `brightness(${(0.08 + 0.92 * bright).toFixed(3)})` }} onPointerDown={(e) => { e.preventDefault(); tap(); }}>
        {light.ic && <div className="sp-ic">{light.ic}</div>}
        <div className="sp-txt">{light.txt ? lt(light.txt) : t("spods.touch_bang")}</div>
        {light.sub && <div className="sp-sub">{lt(light.sub)}</div>}
        {!light.ic && !light.fade && <div className="sp-hand">👆</div>}
        {light.home && <div className="sp-sub">{t("spods.touch_home")}</div>}
      </main>
    );
  }

  return (
    <main className="sp-pod" style={{ background: flash ? "#FFFFFF" : "#07060A", border: col ? `10px solid ${col.hex}` : "10px solid #1C1A22" }}>
      {fb && <div className={"sp-fb popin" + (fb.good === false ? " bad" : fb.good ? " good" : "")}>{fb.txt}</div>}
      <div className="sp-podnum">{myIdx >= 0 ? myIdx + 1 : "·"}</div>
      <div className="sp-podlbl">{t("spods.pod")}</div>
      {myAth && col && <div className="sp-chip" style={{ background: col.hex, color: col.ink }}>{nameOf(me)} · {t(`spods.color.${myAth.c}`)}{myAth.out ? " · 💀" : ""}</div>}
      {!myAth && <div className="sp-chip dim">{nameOf(me)} · {t("spods.pod_only")}</div>}
      <div className="sp-banner">{lt(s.banner)}{s.phase === "count" && secsLeft > 0 ? ` · ${secsLeft}` : ""}</div>
      {s.phase === "setup" && <div className="sp-hint">{t("spods.place_me")}</div>}
      {s.phase === "over" && <div className="sp-hint">{t("spods.game_over")}</div>}
      {myAth && s.phase !== "setup" && <div className="sp-score">{t(`spods.score.${game}`)}: <b>{fmtScore(game, myAth.score)}</b>{myAth.extra ? ` · ${lt(myAth.extra)}` : ""}</div>}
    </main>
  );
}

/* ================= השלט ================= */
function Coach({ s, def, send, nameOf, toast, serverNow }: {
  s: SpState; def: (typeof SP_DEFS)[SpGame]; send: (d: SpodsClientMsg) => void; nameOf: (pid: string) => string; toast: string; serverNow: () => number;
}) {
  const game = s.game;
  const secsLeft = s.until ? Math.max(0, Math.ceil((s.until - serverNow()) / 1000)) : 0;
  const setup = s.phase === "setup";
  const running = s.phase === "run" || s.phase === "between" || s.phase === "count";
  const ranked = [...s.aths].sort((x, y) => {
    const d = def.lowerIsBetter ? (x.score || 9e9) - (y.score || 9e9) : y.score - x.score;
    return d || (x.med || 9e9) - (y.med || 9e9);
  });
  const nAth = s.aths.length;
  const canStart = s.pods.length >= 1 && nAth >= def.minAth;
  const movePod = (i: number, dir: -1 | 1) => { const p = [...s.pods]; const j = i + dir; if (j < 0 || j >= p.length) return; [p[i], p[j]] = [p[j], p[i]]; send({ a: "sp_order", pods: p }); };

  return (
    <main className="sp-coach">
      {toast && <div className="toast" style={{ zIndex: 80 }}>🎙️ {toast}</div>}
      <div className="sp-head">
        <div className="sp-title"><span className="sp-ic-s">{def.icon}</span><b>{t(`games.sp_${game}.name`)}</b><span className="sub">{t("spods.coach_remote")}</span></div>
        <div className={"sp-timer" + (secsLeft && secsLeft <= 5 ? " warm" : "")}>{s.until ? secsLeft : phaseLabel(s.phase)}</div>
      </div>

      <div className={"sp-bannerbox " + s.phase}>
        <b>{lt(s.banner) || t(`games.sp_${game}.name`)}</b>
        {s.sub && <small>{lt(s.sub)}</small>}
        {s.level ? <span className="chip">{t("spods.level_n", { n: s.level })}</span> : null}
      </div>

      {/* כפתורי שליטה */}
      <div className="sp-ctl">
        {setup && <button className="btn gold" disabled={!canStart} onClick={() => { Sfx.ding(); vibrate(40); send({ a: "sp_ctl", op: "start" }); }}>
          {canStart ? t("spods.start") : nAth < def.minAth ? t("spods.need_aths", { n: def.minAth }) : t("spods.need_pod")}
        </button>}
        {running && <button className="btn ghost" onClick={() => send({ a: "sp_ctl", op: "pause" })}>{t("spods.pause")}</button>}
        {s.phase === "pause" && <button className="btn gold" onClick={() => send({ a: "sp_ctl", op: "resume" })}>{t("spods.resume")}</button>}
        {(running || s.phase === "pause") && <button className="btn ghost" onClick={() => send({ a: "sp_ctl", op: "skip" })}>{t("spods.skip")}</button>}
        {(running || s.phase === "pause") && <button className="btn ghost danger" onClick={() => send({ a: "sp_ctl", op: "stop" })}>{t("spods.stop_now")}</button>}
      </div>

      {setup && (
        <div className="card sp-card">
          <b>{t("spods.setup_title")}</b>
          <p className="sub" style={{ marginTop: 4 }}>{t(`spods.setup.${game}`)}</p>
          <p className="sub" style={{ fontSize: 12 }}>{t("spods.safety")}</p>
          {def.settings.map((st) => (
            <div key={st.key} style={{ marginTop: 8 }}>
              <div className="sub" style={{ fontSize: 12.5 }}>{optText(`sp_${game}`, st.key, st.label)}</div>
              <div className="opt-row">
                {st.values.map((v) => <button key={v.v} className={"opt" + (s.cfg[st.key] === v.v ? " sel" : "")} onClick={() => send({ a: "sp_cfg", key: st.key, v: v.v })}>{optText(`sp_${game}`, st.key, v.label, String(v.v))}</button>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ספורטאים */}
      <div className="card sp-card">
        <b>{t("spods.athletes")} {nAth ? `(${nAth})` : ""}</b>
        {!setup && <span className="sub" style={{ marginInlineEnd: 8, fontSize: 12 }}>{t(`spods.score.${game}`)}</span>}
        {ranked.length === 0 && <p className="sub">{t("spods.no_aths")}</p>}
        {ranked.map((a, i) => {
          const c = spColor(a.c);
          const inFocus = s.focus?.includes(a.pid);
          return (
            <div key={a.pid} className={"sp-row" + (a.out ? " out" : "") + (inFocus ? " focus" : "")}>
              <span className="sp-dot" style={{ background: c.hex }} />
              <span className="sp-name">{!setup && <b className="sp-rank">{i + 1}</b>}{nameOf(a.pid)}{a.out ? " 💀" : ""}</span>
              {setup ? (
                <span className="sp-rowctl">
                  {def.id === "relay" && <button className={"opt tiny" + (a.team === 0 ? " sel" : "")} onClick={() => send({ a: "sp_team", pid: a.pid, team: a.team === 0 ? 1 : 0 })}>{a.team === 0 ? "🔵" : "🔴"}</button>}
                  <select className="sp-sel" value={a.hand} onChange={(e) => send({ a: "sp_hand", pid: a.pid, ms: Number(e.target.value) })} title={t("spods.handicap")}>
                    {SP_HAND_STEPS.map((h) => <option key={h} value={h}>{h ? t("spods.hand_secs", { s: h / 1000 }) : t("spods.no_handicap")}</option>)}
                  </select>
                  <button className="opt tiny" onClick={() => send({ a: "sp_role", pid: a.pid, role: "pod" })}>{t("spods.pod_only")}</button>
                </span>
              ) : (
                <span className="sp-rowctl">
                  <span className="sp-extra">{a.extra ? lt(a.extra) : ""}{a.med ? ` · ${(a.med / 1000).toFixed(2)}s` : ""}</span>
                  <b className="sp-scorev">{spFmtScore(def.id, a.score)}</b>
                  {s.phase !== "over" && <>
                    <button className="opt tiny" onClick={() => send({ a: "sp_judge", pid: a.pid, d: 1 })}>+1</button>
                    <button className="opt tiny" onClick={() => send({ a: "sp_judge", pid: a.pid, d: -1 })}>−1</button>
                  </>}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* פודים */}
      <div className="card sp-card">
        <b>{t("spods.pods_n", { n: s.pods.length })}</b>
        <p className="sub" style={{ fontSize: 12, marginTop: 2 }}>{setup ? t("spods.pods_hint") : t("spods.pods_map")}</p>
        {s.pods.map((pid, i) => {
          const a = s.aths.find((x) => x.pid === pid);
          return (
            <div key={pid} className="sp-row">
              <b className="sp-podn">{i + 1}</b>
              <span className="sp-name">{nameOf(pid)}{a ? "" : ` · ${t("spods.pod_only")}`}</span>
              {setup && <span className="sp-rowctl">
                <button className="opt tiny" onClick={() => movePod(i, -1)} disabled={i === 0}>▲</button>
                <button className="opt tiny" onClick={() => movePod(i, 1)} disabled={i === s.pods.length - 1}>▼</button>
                <button className="opt tiny" onClick={() => send({ a: "sp_test", pod: pid })}>{t("spods.blink")}</button>
                {!a && <button className="opt tiny" onClick={() => send({ a: "sp_role", pid, role: "ath" })}>{t("spods.athlete")}</button>}
              </span>}
            </div>
          );
        })}
        {s.pods.length === 0 && <p className="sub">{t("spods.no_pods")}</p>}
      </div>

      <p className="sub" style={{ fontSize: 11.5, textAlign: "center", marginTop: 4 }}>
        {t("spods.ends_alone")}
      </p>
    </main>
  );
}

function phaseLabel(p: SpState["phase"]) {
  return p === "setup" ? t("spods.phase_setup") : p === "count" ? "3-2-1" : p === "run" ? "▶" : p === "pause" ? "⏸" : p === "between" ? "…" : "🏁";
}

export const spStyle = (c: number): CSSProperties => ({ background: spColor(c).hex, color: spColor(c).ink });
