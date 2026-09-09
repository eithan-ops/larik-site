/**
 * מטרונובול 🎾 — צד לקוח.
 *
 * הבמה (canvas): רצפה בפרספקטיבה, כל הכדורים קופצים לפי (bpm, anchor) בזמן-שרת — אותה פרבולה בכל טלפון,
 * הכדור שלי והכדור של הקובע גדולים בקדמת הבמה, שאר החברים בשורה האחורית. הנחיתות של הקובע מתוזמנות ב-WebAudio
 * לזמן-שרת (כל החדר שומע את אותה נחיתה באותה מילישנייה). ההקשות שלי מזינות את אותו מודל טאפ-טמפו כמו בשרת (תגובה מיידית),
 * ונשלחות עם זמן-שרת לניקוד סמכותי. DOM: HUD, כפתורי הקובע, משטח ההקשה, טבלאות.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import type { GameViewProps } from "./registry";
import { MB, MB_FLOORS, mbFloor, mbBpm, mbLevelOf, mbPeriod, mbPhase, mbHeight, mbNewBall, mbFeedTap, mbAsleep } from "../../../shared/metro";
import type { MbBall, MbResultRow, MbProgRow, MetroServerMsg } from "../../../shared/metro";
import { mbAudioInit, mbAudioTime, mbLand, mbCancelScheduled, mbSfx, mbSay, mbPreloadVoices } from "./metroAudio";
import { drawBall, ballIcon, loadBallSprite, onBallSpriteReady, type BallPose } from "./metroSprites";
import { vibrate } from "../lib/audio";

type Phase = "wait" | "pick" | "set" | "count" | "match" | "result" | "over";
type OverMsg = Extract<MetroServerMsg, { a: "mb_over" }>;
type ResultMsg = Extract<MetroServerMsg, { a: "mb_result" }>;
interface Ring { x: number; y: number; r: number; l: number; col: string }
interface Part { x: number; y: number; vx: number; vy: number; l: number; col: string; r: number; g: number }
interface Judge { t: string; cls: string; id: number }
const PAPER = "#FFF3DC", SIG = "#3DC63D";
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* תמונות (רצפות, רקע) — עצל, בלי הקובץ נשאר ציור פרוצדורלי */
const imgs = new Map<string, HTMLImageElement | null>();
function img(src: string): HTMLImageElement | null {
  if (imgs.has(src)) return imgs.get(src) ?? null;
  imgs.set(src, null);
  const im = new Image(); im.onload = () => imgs.set(src, im); im.onerror = () => imgs.set(src, null); im.src = src;
  return null;
}
declare global { interface Window { __mbDbg?: unknown; __mbFrames?: number; __mbErr?: string; __mbAuto?: boolean; __mbTap?: () => void } }

export default function MetroView({ room, me, conn, hub }: GameViewProps) {
  const [phase, setPhase] = useState<Phase>("wait");
  const [pick, setPick] = useState<{ taken: Record<string, number>; until: number } | null>(null);
  const [rnd, setRnd] = useState<{ r: number; of: number; leader: string; until: number; level: number }>({ r: 0, of: 0, leader: "", until: 0, level: 0 });
  const [cnt, setCnt] = useState<{ startAt: number; until: number } | null>(null);
  const [floorId, setFloorId] = useState(MB_FLOORS[0].id);
  const [level, setLevel] = useState(25);
  const [prog, setProg] = useState<MbProgRow[]>([]);
  const [judge, setJudge] = useState<Judge | null>(null);
  const [hint, setHint] = useState("");
  const [result, setResult] = useState<ResultMsg | null>(null);
  const [over, setOver] = useState<OverMsg | null>(null);
  const [banner, setBanner] = useState<{ ic: string; t: string; s?: string; cls?: string } | null>(null);
  const [flash, setFlash] = useState("");
  const [total, setTotal] = useState(0);
  const [solo, setSolo] = useState(false);
  const [spr, setSpr] = useState(false);
  const [asleep, setAsleep] = useState(true);
  const [countN, setCountN] = useState(-1);
  const cvRef = useRef<HTMLCanvasElement>(null);

  const G = useRef({
    phase: "wait" as Phase, leader: "", solo: false,
    chars: {} as Record<string, number>,
    lead: { bpm: 0, anchor: 0, floor: MB_FLOORS[0].id },
    balls: new Map<string, { bpm: number; anchor: number }>(),
    my: mbNewBall() as MbBall,
    locked: new Set<string>(), unison: false, unisonAt: 0,
    lastN: new Map<string, number>(), landAt: new Map<string, number>(),
    rings: [] as Ring[], parts: [] as Part[], shake: 0, flashA: 0,
    sched: { n: -Infinity, key: "" },
    wakeAt: 0, sleptAt: 0, startAt: 0, until: 0, lastTapAt: 0,
    players: [] as { id: string; name: string; emoji: string }[],
    lastFrame: 0, hudAt: 0, countTimers: [] as number[],
  });
  const pl = (pid: string) => G.current.players.find((p) => p.id === pid);
  const pname = (pid: string) => pid === me ? "אתה" : pl(pid)?.name ?? "מישהו";
  const cOf = (pid: string) => G.current.chars[pid] ?? 0;
  const colorOf = (pid: string) => MB.CHAR_COLORS[cOf(pid)];
  const isLeader = () => G.current.leader === me;
  function setPhaseBoth(p: Phase) { G.current.phase = p; setPhase(p); }
  const Face = ({ c, size = 28, pose = "idle" as BallPose }: { c: number; size?: number; pose?: BallPose }) => <img className="mb-face" src={ballIcon(c, 96, pose)} width={size} height={size} alt="" data-spr={spr ? 1 : 0} />;

  useEffect(() => { G.current.players = room.players.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })); }, [room.players]);
  useEffect(() => { mbAudioInit(); loadBallSprite().then((ok) => setSpr(ok)); mbPreloadVoices(["intro", "yourturn", "listen", "catch", "lock", "unison", "winner", "three", "two", "one", "go", "newtempo"]); img("/metro/stage.webp"); return onBallSpriteReady(() => setSpr(true)); }, []);
  useEffect(() => { if (!banner) return; const t = setTimeout(() => setBanner(null), banner.cls === "long" ? 3000 : 1600); return () => clearTimeout(t); }, [banner]);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(""), 320); return () => clearTimeout(t); }, [flash]);
  useEffect(() => { if (!judge) return; const t = setTimeout(() => setJudge(null), 700); return () => clearTimeout(t); }, [judge]);
  useEffect(() => { img(`/metro/floor-${floorId}.webp`); }, [floorId]);

  /* ---------- הודעות ---------- */
  function applyLead(bpm: number, anchor: number, floor: string) {
    const g = G.current;
    if (g.lead.bpm !== bpm || g.lead.anchor !== anchor) { mbCancelScheduled(); g.sched = { n: -Infinity, key: "" }; }
    g.lead = { bpm, anchor, floor };
    setFloorId(floor); setLevel(mbLevelOf(bpm));
  }
  function clearCount() { for (const t of G.current.countTimers) clearTimeout(t); G.current.countTimers = []; }
  function scheduleCount(startAt: number) {
    clearCount();
    const g = G.current;
    const say = (v: "three" | "two" | "one" | "go", n: number) => { setCountN(n); if (!mbSay(v)) mbSfx.count(n); if (n === 0) { vibrate(30); setFlash("rgba(255,255,255,.35)"); } };
    for (const [n, v] of [[3, "three"], [2, "two"], [1, "one"], [0, "go"]] as const) {
      const ms = startAt - n * 1000 - conn.serverNow();
      if (ms > -200) g.countTimers.push(window.setTimeout(() => say(v, n), Math.max(0, ms)));
    }
    g.countTimers.push(window.setTimeout(() => setCountN(-1), Math.max(0, startAt + 700 - conn.serverNow())));
  }
  useEffect(() => {
    return hub.subscribe((raw, at) => {
      const d = raw as unknown as MetroServerMsg;
      const g = G.current;
      try {
        switch (d.a) {
          case "mb_pickphase": {
            if (g.phase === "wait" || g.phase === "pick") { setPhaseBoth("pick"); setPick((p) => ({ taken: d.taken, until: d.until || p?.until || conn.serverNow() + 8000 })); }
            break;
          }
          case "mb_go": {
            g.chars = d.chars; g.solo = d.solo; setSolo(d.solo);
            mbSay("intro");
            setBanner({ ic: "🎾", t: "מטרונובול", s: d.solo ? `${d.rounds} קצבים — תפסו כל אחד` : `${d.rounds} סבבים — כל אחד קובע קצב`, cls: "long" });
            break;
          }
          case "mb_round": {
            g.leader = d.leader; g.locked.clear(); g.unison = false; g.balls.clear(); g.my = mbNewBall(); g.lastN.clear();
            applyLead(mbBpm(d.level), d.anchor, d.floor);
            setRnd({ r: d.r, of: d.of, leader: d.leader, until: d.until, level: d.level });
            setProg([]); setResult(null); setHint(""); setAsleep(true);
            setPhaseBoth("set");
            if (g.solo) { setBanner({ ic: "🎵", t: `קצב ${d.r + 1} מתוך ${d.of}`, s: "תקשיבו… ואז תפסו אותו", cls: "long" }); mbSay("newtempo"); }
            else if (d.leader === me) { setBanner({ ic: "🎛️", t: "הקצב שלך!", s: "כוונו את הכדור — כולם שומעים אותו", cls: "long" }); mbSay("yourturn"); vibrate([40, 40, 40]); }
            else { setBanner({ ic: "👂", t: `${pname(d.leader)} קובע את הקצב`, s: "תקשיבו לכדור שלו…", cls: "long" }); mbSay("listen"); }
            break;
          }
          case "mb_lead": { applyLead(d.bpm, d.anchor, d.floor); break; }
          case "mb_count": {
            applyLead(d.bpm, d.startAt, d.floor);
            g.startAt = d.startAt; g.until = d.until; g.my = mbNewBall(); g.balls.clear(); g.lastN.clear(); g.locked.clear(); g.unison = false;
            setCnt({ startAt: d.startAt, until: d.until }); setPhaseBoth("count"); setAsleep(true);
            const t = d.startAt - conn.serverNow();
            g.countTimers.push(window.setTimeout(() => { if (G.current.phase === "count") setPhaseBoth("match"); }, Math.max(0, t)));
            if (!isLeader()) { if (t > 3600) setBanner({ ic: "👂", t: "תקשיבו לקצב…", s: "בעוד רגע — מקישים איתו", cls: "long" }); else mbSay("catch"); }
            scheduleCount(d.startAt);
            break;
          }
          case "mb_ball": { if (d.pid !== me) g.balls.set(d.pid, { bpm: d.bpm, anchor: d.anchor }); break; }
          case "mb_prog": { setProg(d.rows); for (const r of d.rows) { if (r.locked) g.locked.add(r.pid); else if (!g.unison) g.locked.delete(r.pid); } break; }
          case "mb_lock": {
            g.locked.add(d.pid);
            if (d.pid === me) { mbSfx.lock(); mbSay("lock"); vibrate([20, 30, 60]); setBanner({ ic: "🔒", t: "נעול על הקצב!", s: `אחרי ${((d.at - g.startAt) / 1000).toFixed(1)} שניות — עכשיו להחזיק` }); setFlash("rgba(95,212,74,.35)"); }
            else { mbSfx.otherLock(); if (isLeader()) setBanner({ ic: "🔒", t: `${pname(d.pid)} תפס את הקצב שלך`, s: "+20" }); }
            break;
          }
          case "mb_unison": {
            g.unison = true; g.unisonAt = at;
            mbSfx.unison(); mbSay("unison"); vibrate([60, 40, 60, 40, 120]);
            setBanner({ ic: "🎶", t: g.solo ? "תפסת את הקצב!" : "כולם ביחד!", s: `+${MB.UNISON_BONUS} לכולם`, cls: "long" }); setFlash("rgba(255,197,49,.45)");
            confetti(); g.shake = 4;
            break;
          }
          case "mb_result": {
            clearCount(); setCountN(-1);
            setResult(d); setPhaseBoth("result");
            const mine = d.rows.find((x) => x.pid === me); if (mine) setTotal(mine.total);
            mbSfx.result();
            break;
          }
          case "mb_over": {
            clearCount(); setOver(d); setPhaseBoth("over");
            const mine = d.rows.find((x) => x.pid === me); if (mine) setTotal(mine.total);
            if (d.rows[0]?.pid === me && !g.solo) { mbSfx.win(); mbSay("winner"); vibrate([60, 40, 60, 40, 120]); } else mbSfx.result();
            if (g.solo && mine) { try { const best = Number(localStorage.getItem("mb_best") || 0); if (mine.total > best) localStorage.setItem("mb_best", String(mine.total)); } catch { /* */ } }
            break;
          }
          case "mb_sync": {
            g.chars = d.chars; g.solo = d.solo; setSolo(d.solo); g.leader = d.leader;
            applyLead(d.bpm, d.anchor, d.floor);
            g.startAt = d.startAt; g.until = d.until;
            g.balls.clear(); for (const b of d.balls) if (b.pid !== me) g.balls.set(b.pid, { bpm: b.bpm, anchor: b.anchor });
            setTotal(d.totals[me] ?? 0);
            setRnd({ r: d.r, of: d.of, leader: d.leader, until: d.until, level: d.level });
            if (d.phase === "pick") { setPhaseBoth("pick"); setPick({ taken: d.chars, until: conn.serverNow() + 8000 }); }
            else if (d.phase === "count" || d.phase === "match") { setCnt({ startAt: d.startAt, until: d.until }); setPhaseBoth(conn.serverNow() < d.startAt ? "count" : "match"); }
            else if (d.phase === "set") setPhaseBoth("set");
            else if (d.phase === "result") setPhaseBoth("result");
            else if (d.phase === "over") setPhaseBoth("over");
            break;
          }
        }
      } catch (e) { window.__mbErr = String(e); }
    });
  }, [hub, me]);
  useEffect(() => () => { clearCount(); mbCancelScheduled(); }, []);

  /* ---------- פעולות ---------- */
  function pickChar(c: number) { mbAudioInit(); conn.sendGame({ a: "mb_char", c }); mbSfx.select(); vibrate(15); }
  function setLv(delta: number) {
    const g = G.current; if (g.phase !== "set" || !isLeader()) return;
    const nl = Math.max(1, Math.min(MB.LEVELS, level + delta));
    if (nl === level) { return; }
    setLevel(nl); conn.sendGame({ a: "mb_level", level: nl }); mbSfx.levelTick(delta > 0); vibrate(8);
  }
  function setFl(id: string) { const g = G.current; if (g.phase !== "set" || !isLeader()) return; setFloorId(id); conn.sendGame({ a: "mb_floor", floor: id }); mbSfx.select(); vibrate(12); }
  function setDone() { if (G.current.phase !== "set" || !isLeader()) return; conn.sendGame({ a: "mb_setdone" }); mbSfx.select(); }
  /** ההקשה שלי — הכדור מגיב מיד, השרת שופט אחר כך */
  function tap() {
    const g = G.current;
    if ((g.phase !== "count" && g.phase !== "match") || isLeader()) return;
    mbAudioInit();
    const at = conn.serverNow();
    if (at - g.lastTapAt < 70) return; g.lastTapAt = at;
    const wasAsleep = mbAsleep(g.my, at);
    g.my = mbFeedTap(g.my, at);
    conn.sendGame({ a: "mb_tap", at: Math.round(at) });
    if (wasAsleep) { g.wakeAt = at; mbSfx.wake(); setAsleep(false); }
    // שיפוט מקומי מול פעימות המנהיג — פידבק מיידי (הניקוד האמיתי מהשרת)
    const T = mbPeriod(g.lead.bpm);
    const k = Math.round((at - g.lead.anchor) / T); const off = at - (g.lead.anchor + k * T);
    const a = Math.abs(off);
    const good: 0 | 1 | 2 | 3 = a <= MB.PERFECT_MS ? 3 : a <= MB.GOOD_MS ? 2 : a <= MB.OK_MS ? 1 : 0;
    mbSfx.tap(good);
    vibrate(good === 3 ? 12 : 6);
    if (g.phase === "match") {
      const id = Date.now();
      setJudge(good === 3 ? { t: "מושלם!", cls: "p", id } : good === 2 ? { t: "טוב", cls: "g", id } : good === 1 ? { t: "קרוב", cls: "o", id } : { t: off < 0 ? "מוקדם" : "מאוחר", cls: "b", id });
      if (g.my.bpm > 0) { const rel = (g.my.bpm - g.lead.bpm) / g.lead.bpm; setHint(rel > MB.TEMPO_TOL ? "לאט יותר ⏪" : rel < -MB.TEMPO_TOL ? "מהר יותר ⏩" : rel > MB.LOCK_TOL ? "קצת לאט יותר" : rel < -MB.LOCK_TOL ? "קצת מהר יותר" : ""); }
    }
    // הבזק נחיתה מקומי לכדור שלי
    g.landAt.set(me, performance.now());
  }
  useEffect(() => { window.__mbTap = tap; return () => { delete window.__mbTap; }; });

  /* ---------- אפקטים ---------- */
  function ring(x: number, y: number, r: number, col: string) { if (G.current.rings.length < 24) G.current.rings.push({ x, y, r, l: 1, col }); }
  function confetti() {
    const cv = cvRef.current; if (!cv || reduced()) return;
    const W = cv.clientWidth, H = cv.clientHeight; const g = G.current;
    for (let i = 0; i < 70; i++) g.parts.push({ x: W / 2 + (Math.random() - 0.5) * W * 0.6, y: H * 0.3, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 7 - 2, l: 1, col: MB.CHAR_COLORS[i % 8], r: 3 + Math.random() * 4, g: 0.22 });
  }

  /* ---------- מגע: כל המסך (חוץ מכפתורים) = הקשה ---------- */
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".mb-wrap"); if (!el) return;
    const isBtn = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("button, .mb-pick, .mb-result, .mb-over, .exit-fab, .mb-top, .mb-leadpanel");
    const down = (e: PointerEvent) => { if (isBtn(e.target)) return; e.preventDefault(); tap(); };
    el.addEventListener("pointerdown", down, { passive: false });
    const key = (e: KeyboardEvent) => { if (e.code === "Space" && !e.repeat) { e.preventDefault(); tap(); } };
    window.addEventListener("keydown", key);
    return () => { el.removeEventListener("pointerdown", down); window.removeEventListener("keydown", key); };
  }, []);

  /* ---------- ציור ---------- */
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    const g = G.current;
    let lastAsleep = true;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      try {
        const DPR = Math.min(2, window.devicePixelRatio || 1);
        const W = cv.clientWidth, H = cv.clientHeight;
        if (cv.width !== Math.round(W * DPR) || cv.height !== Math.round(H * DPR)) { cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); }
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        const now = conn.serverNow(); const pn = performance.now();
        const dt = Math.min(0.05, (pn - (g.lastFrame || pn)) / 1000); g.lastFrame = pn;
        window.__mbFrames = (window.__mbFrames || 0) + 1;
        const ph = g.phase;
        const inRound = ph === "set" || ph === "count" || ph === "match";
        // רעידה
        const sh = g.shake > 0 ? g.shake : 0; g.shake = Math.max(0, g.shake - dt * 14);
        ctx.save(); if (sh > 0 && !reduced()) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);

        /* רקע */
        const bg = img("/metro/stage.webp");
        if (bg) { const s = Math.max(W / bg.naturalWidth, H / bg.naturalHeight); ctx.drawImage(bg, (W - bg.naturalWidth * s) / 2, (H - bg.naturalHeight * s) / 2, bg.naturalWidth * s, bg.naturalHeight * s); }
        else { const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#241A2E"); gr.addColorStop(1, "#14110E"); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); }
        // אור במה
        const spot = ctx.createRadialGradient(W / 2, H * 0.1, 10, W / 2, H * 0.5, H * 0.75); spot.addColorStop(0, "rgba(255,220,160,.22)"); spot.addColorStop(1, "rgba(255,220,160,0)"); ctx.fillStyle = spot; ctx.fillRect(0, 0, W, H);

        /* רצפה בפרספקטיבה */
        const fl = mbFloor(g.lead.floor);
        const yH = H * 0.44; // אופק
        const fi = img(`/metro/floor-${fl.id}.webp`);
        if (fi) {
          const N = 28;
          for (let i = 0; i < N; i++) {
            const t0 = i / N, t1 = (i + 1) / N;
            // עומק: קרוב = למטה. שורות דחוסות יותר ליד האופק
            const y0 = yH + (H - yH) * (t0 * t0 * 0.6 + t0 * 0.4), y1 = yH + (H - yH) * (t1 * t1 * 0.6 + t1 * 0.4) + 1;
            const sy0 = (1 - t0) * fi.naturalHeight * 0.9, sy1 = (1 - t1) * fi.naturalHeight * 0.9;
            const wid = W * (0.7 + 0.9 * t0);
            ctx.drawImage(fi, 0, Math.min(sy0, sy1), fi.naturalWidth, Math.abs(sy0 - sy1) + 1, (W - wid) / 2, y0, wid, y1 - y0);
          }
        } else { ctx.fillStyle = fl.tint; ctx.fillRect(0, yH, W, H - yH); }
        const shade = ctx.createLinearGradient(0, yH, 0, H); shade.addColorStop(0, "rgba(0,0,0,.55)"); shade.addColorStop(0.5, "rgba(0,0,0,.12)"); shade.addColorStop(1, "rgba(0,0,0,.28)"); ctx.fillStyle = shade; ctx.fillRect(0, yH, W, H - yH);
        // קו האופק (דיו)
        ctx.fillStyle = "rgba(12,9,6,.6)"; ctx.fillRect(0, yH - 1.5, W, 3);

        /* מי עומד איפה */
        const leader = g.leader; const soloMode = g.solo;
        const front: { pid: string; c: number; kind: "lead" | "me" | "metro" }[] = [];
        const back: { pid: string; c: number }[] = [];
        const parts = Object.keys(g.chars);
        if (inRound || ph === "result") {
          if (soloMode) { front.push({ pid: "__metro", c: -1, kind: "metro" }); if (g.chars[me] !== undefined) front.push({ pid: me, c: cOf(me), kind: "me" }); }
          else {
            if (leader) front.push({ pid: leader, c: cOf(leader), kind: "lead" });
            if (leader !== me && g.chars[me] !== undefined) front.push({ pid: me, c: cOf(me), kind: "me" });
            for (const pid of parts) if (pid !== leader && pid !== me) back.push({ pid, c: cOf(pid) });
          }
        }
        const rF = Math.min(W * 0.125, 54, (H - yH) * 0.22);
        const yF = H * 0.9;
        const frontX = (i: number, n: number) => n === 1 ? W / 2 : (i === 0 ? W * 0.3 : W * 0.7); // RTL: הקובע משמאל, אני מימין
        const yB = yH + (H - yH) * 0.26;
        const rB = Math.max(13, Math.min(24, (W * 0.9) / (Math.max(1, back.length) * 2.6)));
        const backX = (i: number, n: number) => W * 0.5 + (i - (n - 1) / 2) * Math.min(rB * 2.7, (W * 0.88) / Math.max(1, n));

        const ballState = (pid: string, kind: string): { bpm: number; anchor: number; asleep: boolean } => {
          if (kind === "lead" || kind === "metro") return { bpm: g.lead.bpm, anchor: g.lead.anchor, asleep: !inRound && ph !== "result" ? true : g.lead.bpm <= 0 };
          const b = pid === me ? g.my : g.balls.get(pid);
          if (!b || (ph !== "count" && ph !== "match")) return { bpm: 0, anchor: 0, asleep: true };
          return { bpm: b.bpm, anchor: b.anchor, asleep: b.bpm <= 0 || now - b.anchor > MB.SLEEP_MS };
        };

        const drawOne = (pid: string, c: number, kind: string, x: number, yFloor: number, r: number, label: string) => {
          const st = ballState(pid, kind);
          const maxH = Math.max(r * 1.2, (yFloor - yH - r * 2.2 + (kind === "lead" || kind === "me" || kind === "metro" ? (yH - r) * 0.35 : 0)));
          let hh = 0, pose: BallPose = "idle", sx = 1, sy = 1, dim = 0;
          if (st.asleep) {
            // ישן: נושם על הרצפה
            const br = Math.sin(pn / 600) * 0.03; sx = 1.04 + br; sy = 0.96 - br; dim = kind === "me" || kind === "metro" ? 0.25 : 0.5;
          } else {
            const { phi, n } = mbPhase(st.bpm, st.anchor, now);
            const T = mbPeriod(st.bpm);
            const hNorm = mbHeight(st.bpm);
            hh = maxH * hNorm * 4 * phi * (1 - phi);
            const since = phi * T; // ms מאז הנחיתה
            const last = g.lastN.get(pid);
            if (last !== undefined && n !== last) { g.landAt.set(pid, pn); ring(x, yFloor, r * 0.9, kind === "lead" || kind === "metro" ? "#FFC531" : "rgba(255,243,220,.85)"); }
            g.lastN.set(pid, n);
            const la = g.landAt.get(pid); const sinceLand = la === undefined ? 999 : pn - la;
            const sq = sinceLand < 110 ? Math.sin((sinceLand / 110) * Math.PI) : 0;
            sx = 1 + 0.24 * sq; sy = 1 - 0.28 * sq;
            const v = Math.abs(1 - 2 * phi); // מהירות יחסית
            if (sq === 0 && hh > r * 0.5) { sy *= 1 + 0.1 * v; sx *= 1 - 0.06 * v; }
            pose = sinceLand < 130 || since < 60 ? "land" : phi < 0.5 ? "fly" : "idle";
          }
          // צל
          const hn = Math.min(1, hh / Math.max(1, maxH));
          ctx.fillStyle = `rgba(0,0,0,${0.38 * (1 - 0.65 * hn)})`;
          ctx.beginPath(); ctx.ellipse(x, yFloor + r * 0.06, r * (1.05 - 0.45 * hn) * sx, r * (0.26 - 0.1 * hn), 0, 0, Math.PI * 2); ctx.fill();
          // טבעת נעילה / הקובע
          if (kind === "lead" || kind === "metro") { ctx.strokeStyle = "rgba(255,197,49,.85)"; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -pn / 40; ctx.beginPath(); ctx.ellipse(x, yFloor + r * 0.06, r * 1.35, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
          else if (g.locked.has(pid)) { const pulse = 0.7 + 0.3 * Math.sin(pn / 160); ctx.strokeStyle = `rgba(95,212,74,${pulse})`; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.ellipse(x, yFloor + r * 0.06, r * 1.35, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); }
          // הכדור
          drawBall(ctx, c, x, yFloor - hh, r, sx, sy, pose, dim);
          // תווית
          ctx.font = `800 ${Math.max(10, Math.min(14, r * 0.34))}px "Assistant Variable", Assistant, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "top";
          ctx.lineWidth = 3; ctx.strokeStyle = "rgba(12,9,6,.85)"; ctx.fillStyle = kind === "me" ? "#FFC531" : PAPER;
          ctx.strokeText(label, x, yFloor + r * 0.36); ctx.fillText(label, x, yFloor + r * 0.36);
          if (st.asleep && (kind === "me") && (ph === "count" || ph === "match")) { ctx.font = `${Math.round(r * 0.5)}px sans-serif`; ctx.fillText("💤", x + r * 0.7, yFloor - r * 2.1 - Math.sin(pn / 500) * 3); }
          if (kind === "lead" || kind === "metro") { ctx.font = `${Math.round(r * 0.42)}px sans-serif`; ctx.fillText("🔊", x - r * 0.95, yFloor - r * 2.15); }
        };

        // שורה אחורית קודם (עומק)
        back.forEach((b, i) => drawOne(b.pid, b.c, "back", backX(i, back.length), yB, rB, pname(b.pid).slice(0, 8)));
        front.forEach((f, i) => drawOne(f.pid, f.c, f.kind, frontX(i, front.length), yF, rF, f.kind === "metro" ? "המטרונום" : f.kind === "me" ? "אתה" : pname(f.pid).slice(0, 9)));

        /* טבעות אבק */
        for (const rg of g.rings) { rg.l -= dt * 3.6; rg.r += dt * 120; if (rg.l <= 0) continue; ctx.strokeStyle = rg.col; ctx.globalAlpha = Math.max(0, rg.l) * 0.7; ctx.lineWidth = 2 + rg.l * 2; ctx.beginPath(); ctx.ellipse(rg.x, rg.y, rg.r, rg.r * 0.32, 0, 0, Math.PI * 2); ctx.stroke(); }
        g.rings = g.rings.filter((x) => x.l > 0); ctx.globalAlpha = 1;
        /* קונפטי */
        for (const p of g.parts) { p.vy += p.g; p.x += p.vx; p.y += p.vy; p.l -= dt * 0.55; ctx.globalAlpha = Math.max(0, p.l); ctx.fillStyle = p.col; ctx.fillRect(p.x, p.y, p.r, p.r * 0.6); }
        g.parts = g.parts.filter((p) => p.l > 0 && p.y < H + 20); ctx.globalAlpha = 1;
        /* הבזק "כולם ביחד" */
        if (g.unison && pn - g.unisonAt < 1) { /* הבזק ב-DOM */ }
        ctx.restore();

        /* --- סאונד הנחיתה של הקובע (רק הוא נשמע) --- */
        if (inRound && g.lead.bpm > 0) {
          const T = mbPeriod(g.lead.bpm);
          const n = Math.floor((now - g.lead.anchor) / T);
          const nxt = g.lead.anchor + (n + 1) * T;
          const key = `${g.lead.bpm}:${g.lead.anchor}`;
          if (g.sched.key !== key) { g.sched = { n: -Infinity, key }; }
          if (nxt - now < 240 && g.sched.n < n + 1) { g.sched.n = n + 1; mbLand(fl.sfx, mbAudioTime(nxt, now), ph === "set" && !isLeader() ? 0.75 : 1); }
        }
        /* --- הכדור שלי נרדם? --- */
        const meAsleep = mbAsleep(g.my, now);
        if (meAsleep !== lastAsleep) { lastAsleep = meAsleep; if ((ph === "match") && meAsleep && g.my.taps.length) { mbSfx.sleep(); } setAsleep(meAsleep); }
        if (window.__mbAuto) { window.__mbDbg = { phase: ph, lead: g.lead, my: g.my, locked: [...g.locked], balls: [...g.balls.entries()] }; }
      } catch (e) { window.__mbErr = String(e); }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [conn]);

  /* ---------- בוט לבדיקות (window.__mbAuto): מקיש סביב פעימות המנהיג ---------- */
  useEffect(() => {
    let t = 0; let lastBeat = 0;
    const loop = () => {
      t = window.setTimeout(loop, 20);
      if (!window.__mbAuto) return;
      const g = G.current;
      if ((g.phase !== "count" && g.phase !== "match") || isLeader() || g.lead.bpm <= 0) return;
      const now = conn.serverNow(); const T = mbPeriod(g.lead.bpm);
      const near = g.lead.anchor + Math.round((now - g.lead.anchor) / T) * T;
      if (Math.abs(now - near) <= 45 && Math.abs(near - lastBeat) > T / 2 && now > g.startAt - 400) { lastBeat = near; tap(); }
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  /* ---------- HUD ---------- */
  const [hud, setHud] = useState({ left: 0, tot: 0 });
  useEffect(() => {
    const iv = setInterval(() => {
      const g = G.current; const now = conn.serverNow();
      const until = g.phase === "set" ? rnd.until : (g.phase === "count" || g.phase === "match") ? (cnt?.until ?? 0) : g.phase === "result" ? (result?.until ?? 0) : 0;
      setHud({ left: until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0, tot: g.phase === "set" ? MB.SET_MS / 1000 : MB.MATCH_MS / 1000 });
    }, 200);
    return () => clearInterval(iv);
  }, [rnd, cnt, result, conn]);

  const lead = rnd.leader;
  const lockedN = prog.filter((p) => p.locked).length;
  const bestLocal = (() => { try { return Number(localStorage.getItem("mb_best") || 0); } catch { return 0; } })();
  const showPad = (phase === "count" || phase === "match") && lead !== me;
  const inRound = phase === "set" || phase === "count" || phase === "match";

  return (
    <div className="mb-wrap" style={{ "--gc": SIG } as CSSProperties}>
      <canvas ref={cvRef} className="mb-cv" />
      {flash && <div className="mb-flash" style={{ background: flash }} />}

      {/* HUD */}
      {inRound && (
        <div className="mb-top">
          <div className="mb-me">
            <div className="mb-chip big">🏅 <b>{total.toLocaleString("he-IL")}</b></div>
            {solo && bestLocal > 0 && <div className="mb-chip small">שיא <b>{bestLocal.toLocaleString("he-IL")}</b></div>}
          </div>
          <div className="mb-mid">
            <div className="mb-round">{solo ? "קצב" : "סבב"} <b>{rnd.r + 1}</b>/{rnd.of}</div>
            {!solo && lead && <div className="mb-leadchip" style={{ "--cc": colorOf(lead) } as CSSProperties}><Face c={cOf(lead)} size={22} /> {lead === me ? "הקצב שלך" : `הקצב של ${pname(lead)}`}</div>}
            {phase === "match" && !solo && <div className="mb-tag">🔒 {lockedN}/{prog.length || Math.max(0, Object.keys(G.current.chars).length - 1)} נעולים</div>}
          </div>
          <div className="mb-timerbox">
            {hud.left > 0 && phase !== "count" && <div className={"mb-timer" + (hud.left <= 5 ? " warm" : "")} style={{ "--p": `${Math.min(1, hud.left / hud.tot) * 360}deg` } as CSSProperties}><span>{hud.left}</span></div>}
          </div>
        </div>
      )}

      {/* באנר */}
      {banner && <div className={"mb-banner " + (banner.cls ?? "")} key={banner.t + banner.ic}><span className="ic">{banner.ic}</span><div><b>{banner.t}</b>{banner.s && <small>{banner.s}</small>}</div></div>}
      {/* ספירה */}
      {countN >= 0 && <div className="mb-count" key={countN}>{countN === 0 ? "קדימה!" : countN}</div>}

      {/* בקרת הקובע */}
      {phase === "set" && lead === me && !solo && (
        <div className="mb-leadpanel">
          <div className="mb-lvrow">
            <button className="mb-lv" onPointerDown={(e) => { e.stopPropagation(); setLv(-5); }}>◀◀</button>
            <button className="mb-lv big" onPointerDown={(e) => { e.stopPropagation(); setLv(-1); }}>◀</button>
            <div className="mb-lvnum"><small>רמה</small><b>{level}</b><small>{mbBpm(level)} BPM</small></div>
            <button className="mb-lv big" onPointerDown={(e) => { e.stopPropagation(); setLv(1); }}>▶</button>
            <button className="mb-lv" onPointerDown={(e) => { e.stopPropagation(); setLv(5); }}>▶▶</button>
          </div>
          <div className="mb-floors">
            {MB_FLOORS.map((f) => <button key={f.id} className={"mb-fl" + (f.id === floorId ? " on" : "")} style={{ "--ft": f.tint } as CSSProperties} onPointerDown={(e) => { e.stopPropagation(); setFl(f.id); }}><span>{f.ic}</span><small>{f.name}</small></button>)}
          </div>
          <button className="mb-done" onClick={setDone}>✓ זה הקצב!</button>
        </div>
      )}
      {/* הקובע בזמן ההשוואה */}
      {(phase === "count" || phase === "match") && lead === me && !solo && (
        <div className="mb-leadpanel watch">
          <h3>🔊 כולם מקישים לפי הקצב שלך</h3>
          <div className="mb-locklist">
            {Object.keys(G.current.chars).filter((p) => p !== me).map((p) => { const row = prog.find((x) => x.pid === p); const on = !!row?.locked; return <span key={p} className={"mb-lockchip" + (on ? " on" : "")} style={{ "--cc": colorOf(p) } as CSSProperties}><Face c={cOf(p)} size={20} /> {pname(p).slice(0, 8)} {on ? "🔒" : row && row.beats > 0 ? `${Math.round((row.pts / Math.max(1, row.beats)) * 10)}%` : "…"}</span>; })}
          </div>
          <p className="sub">+20 על כל מי שתופס · +100 לכולם אם כולם נועלים יחד</p>
        </div>
      )}
      {/* עוקב בזמן הכיוון */}
      {phase === "set" && lead !== me && (
        <div className="mb-pad listen">
          <div className="ear">👂</div>
          <b>{solo ? "תקשיבו לקצב…" : `${pname(lead)} מכוון את הקצב`}</b>
          <small>{solo ? "בעוד רגע מקישים" : "תקשיבו לכדור שלו — בעוד רגע מקישים איתו"}</small>
        </div>
      )}
      {/* משטח ההקשה */}
      {showPad && (
        <div className={"mb-pad" + (asleep ? " sleep" : "") + (G.current.locked.has(me) ? " locked" : "")}>
          {judge && <div className={"mb-judge " + judge.cls} key={judge.id}>{judge.t}</div>}
          <b>{phase === "count" ? "תקשיבו… מקישים כשהכדור נוחת" : asleep ? "הקישו בקצב — כל המסך הוא כפתור" : G.current.locked.has(me) ? "🔒 נעול — להחזיק את הקצב" : hint || "הקישו כשהכדור של הקובע נוחת"}</b>
          <small>{asleep ? "הכדור שלכם ישן עד ההקשה הראשונה" : hint && !G.current.locked.has(me) ? "מקישים איתו — לא רואים את המספר, רק שומעים" : "בלי לראות את המספר. רק לפי האוזן."}</small>
        </div>
      )}

      {/* בחירת צבע */}
      {phase === "pick" && pick && (
        <div className="mb-pick">
          <h2>איזה כדור אתה?</h2>
          <p className="sub">כל צבע לשחקן אחד. אחר כך — כולם רואים את כל הכדורים קופצים.</p>
          <div className="grid">
            {MB.CHAR_NAMES.map((nm, i) => {
              const owner = Object.entries(pick.taken).find(([, c]) => c === i)?.[0];
              const mineC = owner === me;
              return (
                <button key={i} className={"tile" + (owner ? (mineC ? " mine" : " taken") : "")} style={{ "--cc": MB.CHAR_COLORS[i] } as CSSProperties} disabled={!!owner && !mineC} onClick={() => pickChar(i)}>
                  <img src={ballIcon(i, 128, mineC ? "land" : "idle")} alt="" /><b>{nm}</b>
                  {owner && <small>{mineC ? "אתה" : pname(owner)}</small>}
                </button>
              );
            })}
          </div>
          <PickTimer until={pick.until} conn={conn} />
        </div>
      )}

      {/* טבלת הסבב */}
      {phase === "result" && result && (
        <div className="mb-result">
          <h2>{solo ? `קצב ${result.r + 1} מתוך ${result.of}` : `סבב ${result.r + 1} מתוך ${result.of}`}</h2>
          <p className="lv">הקצב היה רמה <b>{result.level}</b> · {mbBpm(result.level)} BPM{!solo && result.leader ? ` · קבע: ${pname(result.leader)}` : ""}</p>
          <ol>
            {result.rows.map((r, i) => <ResultRow key={r.pid} r={r} i={i} me={me} name={pname(r.pid)} Face={Face} />)}
          </ol>
          <p className="sub">{result.r + 1 < result.of ? (solo ? "קצב חדש בעוד רגע…" : "הקובע הבא בעוד רגע…") : "מסכמים…"}</p>
        </div>
      )}

      {/* סיום */}
      {phase === "over" && over && (
        <div className="mb-over">
          <h2>🎾 {solo ? "סיימת!" : over.rows[0]?.pid === me ? "ניצחת!" : `${pname(over.rows[0]?.pid ?? "")} ניצח`}</h2>
          {solo && <p className="lv">{over.rows[0]?.total ?? 0} נקודות{bestLocal > 0 && (over.rows[0]?.total ?? 0) >= bestLocal ? " · 🏆 שיא חדש!" : bestLocal > 0 ? ` · השיא שלך ${bestLocal}` : ""}</p>}
          <ol>
            {over.rows.map((r, i) => <li key={r.pid} className={r.pid === me ? "me" : ""}><span>{i + 1}</span><span className="nm"><Face c={r.c} size={26} pose={i === 0 ? "land" : "idle"} /> {pname(r.pid)}</span><small>{r.lockAt > 0 ? `⚡${(r.lockAt / 1000).toFixed(1)}ש'` : ""} {r.acc > 0 ? `🎯${Math.round(r.acc / 5)}%` : ""}</small><b>{r.total.toLocaleString("he-IL")}</b></li>)}
          </ol>
          {over.titles.length > 0 && <div className="titles">{over.titles.map((t) => <span key={t.t} className={t.pid === me ? "me" : ""}>{t.ic} <b>{t.t}</b> — {pname(t.pid)}</span>)}</div>}
        </div>
      )}
    </div>
  );
}

function ResultRow({ r, i, me, name, Face }: { r: MbResultRow; i: number; me: string; name: string; Face: (p: { c: number; size?: number; pose?: BallPose }) => ReactElement }) {
  return (
    <li className={(r.pid === me ? "me" : "") + (r.leader ? " lead" : "")}>
      <span>{r.leader ? "🔊" : i + 1}</span>
      <span className="nm"><Face c={r.c} size={26} pose={i === 0 && !r.leader ? "land" : "idle"} /> {name}</span>
      <small>{r.leader ? "קבע את הקצב" : r.lockAt > 0 ? `🔒 ${(r.lockAt / 1000).toFixed(1)}ש' · 🎯 ${Math.round(r.acc / 5)}%` : r.acc > 0 ? `🎯 ${Math.round(r.acc / 5)}% · לא נעל` : "לא תפס"}{r.bonus > 0 ? ` · +${r.bonus}` : ""}</small>
      <b>+{r.round}</b>
      <i>{r.total.toLocaleString("he-IL")}</i>
    </li>
  );
}

function PickTimer({ until, conn }: { until: number; conn: GameViewProps["conn"] }) {
  const [left, setLeft] = useState(0);
  useEffect(() => { const iv = setInterval(() => setLeft(Math.max(0, Math.ceil((until - conn.serverNow()) / 1000))), 200); return () => clearInterval(iv); }, [until]);
  return <p className="timer">{until ? `${left} שניות` : "כולם בחרו — מתחילים!"}</p>;
}
