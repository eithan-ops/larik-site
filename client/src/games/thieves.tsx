/**
 * "הגנבים" 🥷 — צד לקוח.
 *
 * מסך = חלון אישי על שדה אחד: הר במרכז, מאורה לכל שחקן בקצוות, והחוט —
 * הקו שמחבר אותך הביתה ומראה בכל רגע כמה אתה חשוף. התנועה שלך מנובאת
 * מקומית (אותה נוסחה כמו בשרת), הפרשים נמרחים — כמו בחופרים.
 *
 * סבב הזרימה (2.9): ניבוי לפי הקלט ששלחנו + פיוס לפי היסטוריה וזמן-שרת · האחרים נחזים קדימה לפי
 * הווקטור · ג'ויסטיק לפי מזהה מגע · הרגעים המשותפים כ-cue · זוהר בספרייטים מוכנים.
 *
 * 🗼 המגדל (3.9): ליד כל מאורה, 3 מצבים (פעיל/מתחמם/כבוי); הטווח והשטח המת שלי תמיד על המסך.
 *
 * 🃏 סבב 5 (7.9): **עצירה כל דקה** — כולם קופאים ב-cue (הדביבונים הופכים לקרח 🧊), דירוג הדקה, מדף של 4 קלפים
 * במחיר בזהב (השרת מציע, הלקוח מציג; קנייה אחת), חשיפה של "מי לקח מה" עם 8 הפרצופים, ואז חוזרים.
 * הקלפים הם מודים (shared/thieves.ts) — הניבוי המקומי מכבד אותם (מהירות, שק, קל רגליים, ישורת הבית, גדרות, סולם).
 * כפתורי יכולות (עד 2, מעל "לגנוב!"): דאש · בועה · עוגה · רוח הרפאים — טבעת קירור. חתימות: אייקוני הקלפים של כל
 * שחקן מתחת לשם, תוספות הבית כמדבקות על המאורה (גדר/חומה/דבש/פעמון/כספת/דשן/ארגזים/מוקש), מגדל 2/3/אחורי.
 * הדביבון מונפש (thievesSprites.ts): ריצה, נשיאה, דאש, הפלה, קפוא, ניצחון — squash & stretch על הצעד.
 * הרקע: אריח יער בלילה (createPattern) · המאורה+מגדל+תוספות מצוירים לחותמת אחת שמתרעננת רק כשמשהו משתנה.
 */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ThievesServerMsg, ThTowerSt } from "../../../shared/protocol";
import { TH_CARDS, TH_TIMING, thCard, thMods, thButtons } from "../../../shared/thieves";
import type { ThMods, ThShelfCard, ThTiming, ThievesServerMsg5 } from "../../../shared/thieves";
import type { GameViewProps } from "./registry";
import { loadImages, ready as imgOk, tinted, ThSfx, TH_IMG } from "./thievesAssets";
import type { ThImages, ThFxKind } from "./thievesAssets";
import { loadRaccoon, drawRaccoon, racIcon, racReady, RP } from "./thievesSprites";
import type { RacPose } from "./thievesSprites";
import "../thieves.css";

const TS = 30;                     // פיקסלים לתא
const SPD = 6.0;                   // חייב להיות זהה לשרת
const DEN_R = 2.0;
const DASH_MS = 300, DASH_MUL = 2.4;   // זהה לשרת
const PCOL = ["#FF8A3D", "#5AC8FA", "#46E0C0", "#F2C14E", "#E5484D", "#B37BE0", "#8ee34a", "#FF6FB5"];
const LVL_SIZE = [6, 9, 12];
const RATE = [0.2, 0.6, 1.2];
const HIST_MS = 1500;
const STEAL_HOLD = 450;
const RAR_COL: Record<string, string> = { c: "#C8B78E", u: "#5AC8FA", r: "#B37BE0", x: "#46E0C0", e: "#F2C14E" };
const TRACK_TX: Record<string, string> = { p: "🦝 שחקן", h: "🏠 בית", j: "🃏 ג'וקר" };

interface Other { x: number; y: number; tx: number; ty: number; vx: number; vy: number; st: number; carry: number; stolen: number; rage: number; slow: number; gold: number; face: number; stunUntil: number; bubbleUntil: number; ghostUntil: number; dashUntil: number; grabAt: number; hitAt: number }
interface TowerC { st: ThTowerSt; until: number; since: number; aim: number }
interface Shot { den: string; x0: number; y0: number; x1: number; y1: number; t0: number; ms: number }
interface PieC { x0: number; y0: number; x1: number; y1: number; t0: number; ms: number }
interface Fx { img: HTMLImageElement; x: number; y: number; t: number; life: number; sz: number; rot: number; add: boolean; grow: number }
interface CItem { lvl: number; v: number; state: "den" | "carried" | "ground"; den: string; carrier: string; gx: number; gy: number; pulse: number; nugget?: boolean }
interface Pop { x: number; y: number; t: string; col: string; l: number; sz: number }
interface PauseUi { phase: "freeze" | "draft" | "reveal"; k: number; rank: string[]; gold: Record<string, number>; draftAt: number; revealAt: number; resumeAt: number; shelf: ThShelfCard[]; discount: boolean; sel: string | null; bought: string | null; skip: boolean; picks: Record<string, string | null> }
const towerPos = (den: { x: number; y: number }, mtn: { x: number }) => { const side = Math.sign(mtn.x - den.x) || 1; return { x: den.x + 2.1 * side, y: den.y - 0.5 }; };
const rearPos = (den: { x: number; y: number }, mtn: { x: number }) => { const side = Math.sign(mtn.x - den.x) || 1; return { x: den.x - 1.9 * side, y: den.y - 0.9 }; };
const vScale = (v: number) => 0.75 + 0.3 * Math.sqrt(Math.max(1, v));

/* ---- זוהר מוכן מראש ---- */
const glowCache = new Map<string, HTMLCanvasElement>();
function glowSprite(col: string, r: number): HTMLCanvasElement {
  r = Math.max(4, Math.round(r / 4) * 4);
  const key = col + r;
  let c = glowCache.get(key);
  if (c) return c;
  const size = r * 2 + 2;
  c = document.createElement("canvas"); c.width = size; c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, r);
  grad.addColorStop(0, col); grad.addColorStop(0.35, col + "AA"); grad.addColorStop(1, col + "00");
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  glowCache.set(key, c);
  return c;
}

export default function ThievesView({ room, me, conn, hub }: GameViewProps) {
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const [hud, setHud] = useState({ gold: 0, carry: 0, left: 0, mtnPct: 100, stolen: false, rage: false, alarm: false, empty: false, tower: "ok" as ThTowerSt, towerLeft: 0, nextP: 0 });
  const [banner, setBanner] = useState<{ ic: string; t: string; s: string } | null>(null);
  const [toast, setToast] = useState("");
  const [feed, setFeed] = useState<{ id: number; tx: string }[]>([]);
  const [acts, setActs] = useState({ steal: false });
  const [countdown, setCountdown] = useState(0);
  const [stalled, setStalled] = useState(false);
  const [pause, setPause] = useState<PauseUi | null>(null);
  const [myCards, setMyCards] = useState<string[]>([]);
  const [cds, setCds] = useState<Record<string, number>>({});      // readyAt (שעון שרת) לכל כפתור
  const [tickUi, setTickUi] = useState(0);                          // דופק 4Hz לטבעות
  const feedId = useRef(1);
  const shelfRef = useRef<{ k: number; cards: ThShelfCard[]; discount: boolean } | null>(null);   // המדף עלול להגיע לפני ה-cue של העצירה

  const G = useRef({
    ready: false, w: 46, h: 30,
    mtn: { x: 23, y: 15, total: 1, left: 1 },
    dens: new Map<string, { x: number; y: number; back: number }>(),
    tower: { r: 5.5, arc: Math.PI / 3, disable: 0, destroy: 0 },
    towers: new Map<string, TowerC>(),
    shots: [] as Shot[],
    pies: [] as PieC[],
    bananas: new Map<number, { x: number; y: number; by: string; t: number }>(),
    me: { x: 5, y: 5, carry: 0, stolen: 0, rageUntil: 0, slowUntil: 0, slowMul: 0.7, stunUntil: 0, dashUntil: 0, dashDx: 1, dashDy: 0, bubbleUntil: 0, ghostUntil: 0, gold: 0, grabAt: 0, hitAt: 0 },
    mods: thMods([]) as ThMods,
    cards: new Map<string, string[]>(),
    sent: { x: 0, y: 0 }, sentAt: 0, pendT: 0,
    hist: [] as { t: number; x: number; y: number }[],
    others: new Map<string, Other>(),
    items: new Map<number, CItem>(),
    corr: { x: 0, y: 0 },
    cam: { x: 0, y: 0 },
    trail: [] as { x: number; y: number; l: number; col: string }[],
    pops: [] as Pop[],
    parts: [] as { x: number; y: number; vx: number; vy: number; l: number; col: string }[],
    ping: null as { x: number; y: number; col: string; t: number } | null,
    warn: null as { pid: string; t: number } | null,
    shake: 0, flash: 0, flashCol: "#fff", stop: 0, zoom: 0,
    left: 0, goAt: 0, endsAt: 0, go: false, alarm: false, empty: false, over: false, won: false,
    beepAt: 0, hudAt: 0, stealOkAt: 0, mineAt: 0, face: 1,
    lastPosAt: 0, kickAt: 0, stalled: false,
    fxs: [] as Fx[],
    players: [] as { id: string; name: string }[],
    // ⏸ העצירה
    timing: TH_TIMING as ThTiming, nextPauseAt: 0, paused: false, pauseAt: 0, pausedAtPerf: 0, resumeAt: 0, k: 0,
    bullUntil: 0, darkUntil: 0,
    groundPat: null as CanvasPattern | null,
    stamps: new Map<string, { key: string; cv: HTMLCanvasElement }>(),
  });
  const IMGS = useRef<ThImages | null>(null);
  const SFX = useRef<ThSfx | null>(null);
  if (!SFX.current) SFX.current = new ThSfx();
  const fx = (kind: ThFxKind, x: number, y: number, sz = 2, life = 420, add = true, grow = 0.5) => {
    const im = IMGS.current?.fx[kind]; if (!im || !imgOk(im)) return;
    G.current.fxs.push({ img: im, x, y, t: performance.now(), life, sz: sz * TS, rot: (Math.random() - 0.5) * 0.6, add, grow });
  };
  const pidx = (pid: string) => Math.max(0, G.current.players.findIndex((p) => p.id === pid));
  useEffect(() => { const w = window as unknown as { __thDbg?: unknown; __thSfx?: unknown }; w.__thDbg = G.current; w.__thSfx = SFX.current; }, []);

  const pcol = (pid: string) => PCOL[Math.max(0, G.current.players.findIndex((p) => p.id === pid)) % PCOL.length];
  const pname = (pid: string) => G.current.players.find((p) => p.id === pid)?.name ?? "מישהו";

  /* ---- סאונד ---- */
  const audio = useRef<{ ctx: AudioContext | null; note: number; noteT: number }>({ ctx: null, note: 0, noteT: 0 });
  function aInit() {
    const ex = audio.current.ctx;
    if (ex) { if (ex.state === "suspended") ex.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audio.current.ctx = new AC();
      SFX.current!.attach(audio.current.ctx);
    } catch { /* בלי אודיו */ }
  }
  useEffect(() => { IMGS.current = loadImages(); void loadRaccoon(PCOL); aInit(); return () => { SFX.current?.stopMusic(0.2); }; }, []);
  const sfx = (name: string, opt?: { rate?: number; gain?: number; delay?: number }) => SFX.current!.play(name, opt);
  function tone(f: number, d: number, type: OscillatorType, vol: number, slideTo?: number) {
    const a = audio.current; if (!a.ctx) return;
    const t = a.ctx.currentTime, o = a.ctx.createOscillator(), g = a.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(a.ctx.destination); o.start(t); o.stop(t + d + 0.05);
  }
  const PENT = [0, 2, 4, 7, 9, 12, 14, 16];
  function pentaTone(vol = 0.3) {
    const a = audio.current, now = performance.now() / 1000;
    if (now - a.noteT > 3.2) a.note = 0; else a.note++;
    a.noteT = now;
    const semi = PENT[Math.min(a.note, PENT.length - 1)];
    if (!sfx("note", { rate: Math.pow(2, semi / 12), gain: vol / 0.3 })) tone(392 * Math.pow(2, semi / 12), 0.16, "triangle", vol);
  }
  const bell = () => { if (!sfx("bell")) { tone(880, 0.5, "triangle", 0.28); tone(1320, 0.4, "sine", 0.14); } };
  const alarmSiren = () => { if (!sfx("siren")) { tone(520, 0.28, "square", 0.22, 700); tone(700, 0.28, "square", 0.2, 520); } };
  const goSound = () => { if (!sfx("whistle")) { tone(523, 0.09, "square", 0.22); setTimeout(() => tone(659, 0.09, "square", 0.22), 100); setTimeout(() => tone(784, 0.22, "square", 0.26), 200); } };
  const horn = () => { if (!sfx("horn")) { tone(330, 0.9, "sawtooth", 0.26, 262); tone(415, 0.9, "sawtooth", 0.18, 330); setTimeout(() => tone(262, 0.5, "sawtooth", 0.2, 220), 500); } };
  const nearGain = (x: number, y: number) => Math.max(0, 1 - Math.hypot(x - G.current.me.x, y - G.current.me.y) / 16);
  const shotSnd = (x: number, y: number) => { const gn = nearGain(x, y); if (gn <= 0.05) return; if (!sfx("shot", { gain: gn, rate: 0.94 + Math.random() * 0.12 })) tone(900, 0.05, "square", 0.1 * gn, 300); };
  const thudSnd = (x: number, y: number, mine: boolean) => { const gn = mine ? 1 : nearGain(x, y) * 0.7; if (gn <= 0.05) return; if (!sfx("thud", { gain: gn })) tone(120, 0.12, "sine", 0.25 * gn, 60); };
  const zapSnd = () => { if (!sfx("zap")) tone(1200, 0.18, "sawtooth", 0.2, 200); };
  const heatSnd = () => { if (!sfx("heat")) tone(200, 0.3, "sawtooth", 0.1, 100); };
  const nopeSnd = () => { if (!sfx("nope")) tone(240, 0.09, "square", 0.14, 180); };

  function addFeed(tx: string) { setFeed((f) => [...f.slice(-2), { id: feedId.current++, tx }]); }

  /* ---- הודעות מהשרת ---- */
  useEffect(() => {
    const g = G.current;
    /** אחרי העצירה: כל הטיימרים המקומיים (performance.now) זזים באורך העצירה, כמו בשרת */
    const unpause = () => {
      if (!g.paused) return;
      const dms = performance.now() - g.pausedAtPerf;
      const b = (v: number) => (v ? v + dms : v);
      const m = g.me;
      m.rageUntil = b(m.rageUntil); m.slowUntil = b(m.slowUntil); m.stunUntil = b(m.stunUntil); m.bubbleUntil = b(m.bubbleUntil); m.ghostUntil = b(m.ghostUntil); m.dashUntil = 0;
      g.bullUntil = b(g.bullUntil); g.darkUntil = b(g.darkUntil);
      for (const o of g.others.values()) { o.stunUntil = b(o.stunUntil); o.bubbleUntil = b(o.bubbleUntil); o.ghostUntil = b(o.ghostUntil); o.dashUntil = 0; }
      for (const bn of g.bananas.values()) bn.t = b(bn.t);
      g.paused = false; g.hist.length = 0; g.corr.x = 0; g.corr.y = 0; g.lastPosAt = performance.now();
      setPause(null);
      SFX.current?.musicRate(g.alarm ? 1.14 : g.empty ? 1.06 : 1);
    };
    return hub.subscribe((raw) => {
      const d = raw as ThievesServerMsg | ThievesServerMsg5;
      switch (d.a) {
        case "th_init": {
          g.w = d.w; g.h = d.h;
          g.mtn = { x: d.mtn.x, y: d.mtn.y, total: d.mtn.total, left: d.mtn.total };
          g.dens.clear();
          for (const [pid, x, y, back] of d.dens) {
            g.dens.set(pid, { x, y, back: back ?? Math.atan2(y - d.mtn.y, x - d.mtn.x) });
            if (!g.towers.has(pid)) g.towers.set(pid, { st: "ok", until: 0, since: 0, aim: Math.atan2(d.mtn.y - y, d.mtn.x - x) });
          }
          if (d.tower) g.tower = d.tower;
          if (d.timing) g.timing = d.timing;
          if (typeof d.nextPauseAt === "number") g.nextPauseAt = d.nextPauseAt;
          if (typeof d.k === "number") g.k = d.k;
          const mine = g.dens.get(me);
          if (mine && !g.ready) { g.me.x = mine.x; g.me.y = mine.y; g.cam.x = mine.x * TS; g.cam.y = mine.y * TS; }
          g.goAt = d.goAt; g.endsAt = d.endsAt; g.ready = true; g.lastPosAt = performance.now();
          if (conn.serverNow() >= d.goAt) g.go = true;
          break;
        }
        case "th_sync": {
          g.mtn.left = d.mtn;
          g.items.clear();
          for (const [id, den, lvl, , v] of d.items) g.items.set(id, { lvl, v: v ?? 1, state: "den", den, carrier: "", gx: 0, gy: 0, pulse: 0 });
          for (const [id, x, y, lvl, v] of d.ground) g.items.set(id, { lvl: Math.max(0, lvl), v: v ?? 1, state: "ground", den: "", carrier: "", gx: x, gy: y, pulse: 0, nugget: lvl < 0 });
          for (const [id, carrier, lvl, v] of d.carried) g.items.set(id, { lvl, v: v ?? 1, state: "carried", den: "", carrier, gx: 0, gy: 0, pulse: 0 });
          if ([...g.items.values()].some((it) => it.state === "carried" && it.carrier === me)) g.me.stolen = 1;
          for (const [den, st, until] of d.towers ?? []) { const tw = g.towers.get(den); if (tw) { tw.st = st; tw.until = until; tw.since = performance.now(); } }
          g.endsAt = d.endsAt;
          break;
        }
        case "th_home_cards": {
          for (const [pid, cards] of Object.entries(d.cards)) g.cards.set(pid, cards);
          const mine = d.cards[me]; if (mine) { g.mods = thMods(mine); setMyCards(mine); }
          g.stamps.clear();
          break;
        }
        case "th_cards": {
          g.cards.set(d.pid, d.cards);
          if (d.pid === me) { g.mods = thMods(d.cards); setMyCards(d.cards); }
          g.stamps.delete(d.pid);
          break;
        }
        /* ---- ⏸ העצירה ---- */
        case "th_pause": {
          g.paused = true; g.pauseAt = d.at; g.pausedAtPerf = performance.now(); g.resumeAt = d.resumeAt; g.k = d.k;
          g.sent = { x: 0, y: 0 };
          for (const o of g.others.values()) { o.vx = 0; o.vy = 0; }
          const sh = shelfRef.current && shelfRef.current.k === d.k ? shelfRef.current : null;
          setPause({ phase: "freeze", k: d.k, rank: d.rank, gold: d.gold, draftAt: d.draftAt, revealAt: d.revealAt, resumeAt: d.resumeAt, shelf: sh?.cards ?? [], discount: sh?.discount ?? false, sel: null, bought: null, skip: false, picks: {} });
          g.flash = 0.16; g.flashCol = "#9BD6FF"; g.shake = Math.max(g.shake, 6);
          if (!sfx("whistle", { rate: 0.8 })) tone(660, 0.25, "triangle", 0.22, 440);
          if (navigator.vibrate) navigator.vibrate(60);
          SFX.current?.musicRate(0.9);
          break;
        }
        case "th_shelf": {
          shelfRef.current = { k: d.k, cards: d.cards, discount: d.discount };
          setPause((p) => (p ? { ...p, shelf: d.cards, discount: d.discount } : p));
          break;
        }
        case "th_bought": {
          setPause((p) => (p ? { ...p, picks: { ...p.picks, [d.pid]: d.id }, bought: d.pid === me ? d.id : p.bought } : p));
          if (d.pid === me) { if (!sfx("home", { gain: 0.7 })) tone(523, 0.15, "triangle", 0.3); }
          break;
        }
        case "th_reveal": {
          setPause((p) => (p ? { ...p, phase: "reveal", picks: d.picks, resumeAt: d.resumeAt } : p));
          g.resumeAt = d.resumeAt;
          sfx("tick"); sfx("tick", { delay: 0.12, rate: 1.2 });
          break;
        }
        case "th_resume": {
          g.endsAt = d.endsAt; g.nextPauseAt = d.nextPauseAt;
          for (const [den, st, until] of d.towers) { const tw = g.towers.get(den); if (tw) { tw.st = st as ThTowerSt; tw.until = until; tw.since = performance.now(); } }
          unpause();
          setToast(g.k >= g.timing.pauses ? "🚨 אין יותר עצירות — עד הצפירה!" : "▶️ ממשיכים!");
          break;
        }
        case "th_cd": {
          setCds((c) => ({ ...c, [d.id]: d.readyAt }));
          break;
        }
        /* ---- 🔘 יכולות ואפקטים ---- */
        case "th_fx": {
          const now = performance.now();
          const p = d.pid === me ? g.me : g.others.get(d.pid);
          if (d.k === "dash") {
            if (d.pid === me) { g.me.dashUntil = now + (d.ms ?? DASH_MS); g.me.dashDx = d.x ?? g.face; g.me.dashDy = d.y ?? 0; g.zoom = 0.05; }
            else if (p) (p as Other).dashUntil = now + (d.ms ?? DASH_MS);
            if (p) fx("dust", p.x, p.y + 0.3, 2.2, 380, false, 0.8);
            if (!sfx("grab", { rate: 1.3 })) tone(500, 0.1, "sawtooth", 0.18, 900);
          } else if (d.k === "bubble") {
            if (d.pid === me) g.me.bubbleUntil = now + (d.ms ?? 2000); else if (p) (p as Other).bubbleUntil = now + (d.ms ?? 2000);
            if (!sfx("note", { rate: 1.5 })) tone(880, 0.12, "sine", 0.2);
          } else if (d.k === "ghost") {
            if (d.pid === me) g.me.ghostUntil = now + (d.ms ?? 5000); else if (p) (p as Other).ghostUntil = now + (d.ms ?? 5000);
            if (!sfx("rage")) tone(180, 0.3, "sawtooth", 0.22, 420);
            if (p) fx("ring", p.x, p.y, 3, 600, true, 1.4);
          } else if (d.k === "boom") {
            fx("pow", d.x ?? 0, (d.y ?? 0) - 0.5, 3.6, 480, false, 0.5); g.shake = Math.max(g.shake, 9);
            if (!sfx("crumble")) tone(90, 0.4, "sawtooth", 0.22, 40);
            if (d.pid === me) setToast("🧨 מוקש! עפת");
          } else if (d.k === "honey") {
            fx("honey", d.x ?? 0, d.y ?? 0, 1.8, 900, false, 0.3);
            if (d.pid === me) { setToast("🍯 נדבקת בדבש!"); if (!sfx("gulp", { gain: 0.6 })) tone(200, 0.2, "sine", 0.2, 120); }
          } else if (d.k === "wrench") {
            fx("sparkle", d.x ?? 0, (d.y ?? 0) - 0.6, 2.4, 500); zapSnd();
          }
          break;
        }
        case "th_pie": {
          g.pies.push({ x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1, t0: performance.now(), ms: d.ms });
          if (!sfx("bounce", { rate: 1.3 })) tone(700, 0.08, "triangle", 0.2, 500);
          break;
        }
        case "th_stun": {
          const now = performance.now();
          if (d.pid === me) { g.me.stunUntil = now + d.ms; g.me.hitAt = now; g.shake = Math.max(g.shake, 7); setToast(d.why === "pie" ? "🥧 עוגה בפרצוף!" : d.why === "banana" ? "🍌 החלקת!" : d.why === "circus" ? "🎪 מהומם!" : ""); }
          else { const o = g.others.get(d.pid); if (o) { o.stunUntil = now + d.ms; o.hitAt = now; } }
          const p = d.pid === me ? g.me : g.others.get(d.pid);
          if (p) { if (d.why === "pie") fx("pie", p.x, p.y - 0.8, 2.4, 700, false, 0.4); fx("stars", p.x, p.y - 1.4, 1.6, d.ms, false, 0.2); }
          if (d.why === "pie" || d.why === "banana") { if (!sfx("pow", { gain: 0.6 })) tone(95, 0.14, "square", 0.3); }
          break;
        }
        case "th_banana": { g.bananas.set(d.id, { x: d.x, y: d.y, by: d.by, t: performance.now() }); break; }
        case "th_banana_gone": { g.bananas.delete(d.id); break; }
        case "th_rain": {
          for (const [id, x, y, v] of d.items) g.items.set(id, { lvl: 0, v, state: "ground", den: "", carrier: "", gx: x, gy: y, pulse: 1, nugget: true });
          setBanner({ ic: "🌀", t: "גשם זהב!", s: "צ'אנקים בכל המפה — מי שמרים, שלו" });
          setTimeout(() => setBanner(null), 2200);
          if (!sfx("rumble", { gain: 0.6 })) tone(200, 0.4, "sawtooth", 0.2, 120);
          for (const [, x, y] of d.items) fx("dust", x, y, 1.6, 500, false, 0.6);
          break;
        }
        case "th_nugget": {
          g.items.delete(d.id);
          if (d.by === me) { g.me.carry = d.carry; if (!sfx("pick")) tone(500, 0.09, "triangle", 0.24); }
          { const p = d.by === me ? g.me : g.others.get(d.by); if (p) fx("sparkle", p.x, p.y - 0.6, 1.3, 300); }
          break;
        }
        case "th_bull": {
          g.bullUntil = performance.now() + d.ms;
          setBanner({ ic: "🐂", t: "ריצת פרים!", s: "כולם פי 1.5 מהר — 15 שניות" }); setTimeout(() => setBanner(null), 2200);
          if (!sfx("warsting")) alarmSiren();
          break;
        }
        case "th_dark": {
          g.darkUntil = performance.now() + d.ms;
          setBanner({ ic: "🌙", t: "חושך!", s: "20 שניות בלי מיני-מפה" }); setTimeout(() => setBanner(null), 2200);
          break;
        }
        case "th_warn": {
          g.warn = { pid: d.pid, t: 3 };
          sfx("chirp", { rate: 0.78 + 0.07 * (pidx(d.pid) % 8) });
          setToast(`🔔 ${pname(d.pid)} מתקרב לבית שלך!`);
          break;
        }
        /* ---- 🗼 המגדל ---- */
        case "th_tower": {
          const tw = g.towers.get(d.den) ?? { st: "ok" as ThTowerSt, until: 0, since: 0, aim: 0 };
          const prev = tw.st;
          tw.st = d.st; tw.until = d.until ?? 0; tw.since = performance.now(); g.towers.set(d.den, tw);
          g.stamps.delete(d.den);
          const den = g.dens.get(d.den);
          if (den) {
            const tp = towerPos(den, g.mtn);
            if (d.st === "hot") { fx("dust", tp.x, tp.y - 1.2, 2.2, 700, false, 0.9); if (d.den === me) heatSnd(); }
            if (d.st === "off") { fx("sparkle", tp.x, tp.y - 0.6, 2.4, 500); }
            if (d.st === "ok" && prev !== "ok") fx("ring", tp.x, tp.y - 0.4, 2.4, 500, true, 1.2);
          }
          if (d.den === me) {
            if (d.st === "hot") setToast("🔥 המגדל שלך התחמם — 4 שניות קירור");
            else if (d.st === "off") { g.shake = Math.max(g.shake, 8); setToast(`🔧 ${pname(d.by ?? "")} כיבה לך את המגדל!`); }
            else if (d.st === "ok" && prev !== "ok") setToast("🗼 המגדל שלך חזר לפעול!");
          }
          break;
        }
        case "th_shot": {
          g.shots.push({ den: d.den, x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1, t0: performance.now(), ms: d.ms });
          const tw = g.towers.get(d.den); if (tw) tw.aim = Math.atan2(d.y1 - d.y0, d.x1 - d.x0);
          shotSnd(d.x0, d.y0);
          break;
        }
        case "th_hit": {
          fx("pow", d.x, d.y - 0.4, 1.9, 320, false, 0.3);
          if (d.pid === me) {
            g.me.slowUntil = performance.now() + d.ms; g.me.slowMul = d.ms >= 3000 ? 0.5 : 0.7; g.shake = Math.max(g.shake, 7); thudSnd(d.x, d.y, true);
            g.corr.x += d.x - g.me.x; g.corr.y += d.y - g.me.y;
            setToast(d.ms >= 3000 ? "🍯 חלוק דביק! איטי 3 שניות" : "🐌 חלוק מהמגדל! איטי 2 שניות");
          } else {
            const o = g.others.get(d.pid); if (o) o.slow = 1;
            thudSnd(d.x, d.y, false);
          }
          break;
        }
        case "th_act_done": {
          if (d.kind === "disable") addFeed(`🔧 ${pname(d.by)} כיבה את המגדל של ${pname(d.den)}`);
          if (d.by === me && d.kind === "disable") setToast(`🔧 המגדל של ${pname(d.den)} כבוי — עכשיו!`);
          break;
        }
        case "th_pos": {
          g.lastPosAt = performance.now();
          for (const [pid, x, y, carry, stolen, gold, rage, dx, dy, slow] of d.ps) {
            if (pid === me) {
              if (g.paused) { g.me.x = x; g.me.y = y; g.corr.x = 0; g.corr.y = 0; }
              else if (conn.synced && d.t && g.hist.length) {
                const h = g.hist;
                let i = h.length - 1; while (i > 0 && h[i].t > d.t) i--;
                const a = h[i], b = h[Math.min(i + 1, h.length - 1)];
                const u = b.t > a.t ? Math.max(0, Math.min(1, (d.t - a.t) / (b.t - a.t))) : 0;
                const px = a.x + (b.x - a.x) * u, py = a.y + (b.y - a.y) * u;
                const ex = x - px, ey = y - py, gap = Math.hypot(ex, ey);
                if (gap > 3) { g.me.x = x; g.me.y = y; g.corr.x = 0; g.corr.y = 0; g.hist.length = 0; }
                else if (gap > 0.02) { g.corr.x += ex; g.corr.y += ey; for (const s of h) { s.x += ex; s.y += ey; } }
              } else {
                const gap = Math.hypot(x - g.me.x, y - g.me.y);
                if (gap > 3) { g.me.x = x; g.me.y = y; g.corr.x = 0; g.corr.y = 0; }
                else if (gap > 0.6) { g.corr.x = x - g.me.x; g.corr.y = y - g.me.y; }
              }
              g.me.carry = carry; g.me.gold = gold;
              if (!stolen) g.me.stolen = 0;
              if (!slow && g.me.slowUntil) g.me.slowUntil = 0;
              const now = performance.now();
              if (now - g.hudAt > 250) {
                g.hudAt = now;
                const tw = g.towers.get(me); const tst = tw?.st ?? "ok";
                const tLeft = tw && tw.until ? Math.max(0, Math.ceil((tw.until - conn.serverNow()) / 1000)) : 0;
                const nextP = g.nextPauseAt && !g.paused ? Math.max(0, Math.min(1, 1 - (g.nextPauseAt - conn.serverNow()) / g.timing.segMs)) : 0;
                setHud((h) => (h.gold === gold && h.carry === carry && h.tower === tst && h.towerLeft === tLeft && Math.abs(h.nextP - nextP) < 0.01 ? h : { ...h, gold, carry, tower: tst, towerLeft: tLeft, nextP }));
                setTickUi((t) => t + 1);
              }
              continue;
            }
            const o = g.others.get(pid) ?? { x, y, tx: x, ty: y, vx: 0, vy: 0, st: d.t, carry, stolen, rage, slow: 0, gold, face: 1, stunUntil: 0, bubbleUntil: 0, ghostUntil: 0, dashUntil: 0, grabAt: 0, hitAt: 0 };
            const om = thMods(g.cards.get(pid) ?? []);
            let s = SPD * om.speed * (1 - 0.05 * carry);
            if (stolen) s *= om.stolenSlow;
            if (rage) s *= om.rageMul;
            if (slow) s *= 0.7;
            if (g.paused) s = 0;
            o.tx = x; o.ty = y; o.vx = (dx ?? 0) * s; o.vy = (dy ?? 0) * s; o.st = d.t;
            o.carry = carry; o.stolen = stolen; o.rage = rage; o.slow = slow ?? 0; o.gold = gold;
            g.others.set(pid, o);
          }
          g.mtn.left = d.mtn; g.left = d.left;
          setHud((h) => {
            const pct = Math.round((d.mtn / Math.max(1, g.mtn.total)) * 100);
            return h.left === d.left && h.mtnPct === pct ? h : { ...h, left: d.left, mtnPct: pct };
          });
          break;
        }
        case "th_go":
          g.go = true; setCountdown(0);
          setBanner({ ic: "🥷", t: "צאו!", s: "ההר מחכה — מי מגיע ראשון?" });
          setTimeout(() => setBanner(null), 1400);
          goSound(); g.flash = 0.12; g.flashCol = "#F2C14E";
          SFX.current?.startMusic();
          break;
        case "th_mine":
          if (d.pid === me) {
            g.mineAt = performance.now();
            const tier = d.tier ?? 1;
            if (!sfx(tier >= 3 ? "mine_core" : tier === 2 ? "mine_deep" : "mine" + (1 + Math.floor(Math.random() * 3))))
              tone(tier >= 3 ? 330 : tier === 2 ? 260 : 210, 0.07, "square", 0.18);
            g.parts.push(...burst(g.mtn.x, g.mtn.y, tier >= 3 ? "#FFE082" : "#C8B78E", 4 + 3 * (tier - 1)));
            fx("sparkle", g.me.x + (g.mtn.x - g.me.x) * 0.35, g.me.y + (g.mtn.y - g.me.y) * 0.35 - 0.4, tier >= 2 ? 1.6 : 1.1, 320);
          }
          break;
        case "th_dep": {
          for (const id of d.ids) g.items.set(id, { lvl: 0, v: d.v ?? 1, state: "den", den: d.pid, carrier: "", gx: 0, gy: 0, pulse: 1 });
          if (d.pid === me) { pentaTone(0.32); if ((d.v ?? 1) >= 6) setTimeout(() => pentaTone(0.34), 120); g.me.carry = 0; }
          { const den = g.dens.get(d.pid); if (den) fx("sparkle", den.x, den.y - 0.2, (d.v ?? 1) >= 6 ? 3.2 : 2.2, 520); }
          break;
        }
        case "th_ripen": {
          const it = g.items.get(d.id);
          if (it) { it.lvl = d.lvl; it.pulse = 1; }
          if (d.den === me) pentaTone(0.34);
          if (d.lvl === 2 && d.bell) {
            bell();
            const den = g.dens.get(d.den);
            if (den) { g.ping = { x: den.x, y: den.y, col: pcol(d.den), t: 4 }; fx("ring", den.x, den.y, 3.4, 700, true, 1.4); }
            if (d.den !== me) addFeed(`🔔 גביש בשל אצל ${pname(d.den)}!`);
          }
          break;
        }
        case "th_grab": {
          const it = g.items.get(d.id) ?? { lvl: d.lvl, v: d.v ?? 1, state: "carried" as const, den: d.from, carrier: d.by, gx: 0, gy: 0, pulse: 0 };
          it.lvl = d.lvl; it.state = "carried"; it.carrier = d.by; it.den = d.from; if (d.v) it.v = d.v;
          g.items.set(d.id, it);
          if (d.by === me) { g.me.stolen = 1; g.me.grabAt = performance.now(); g.zoom = 0.04; if (!sfx("grab")) tone(660, 0.12, "sawtooth", 0.2, 440); setToast("🥷 רוץ הביתה!!"); setHud((h) => ({ ...h, stolen: true })); }
          else { const o = g.others.get(d.by); if (o) o.grabAt = performance.now(); }
          if (d.from === me) {
            g.shake = 12; g.flash = 0.2; g.flashCol = "#E5484D";
            if (!sfx("stolen")) { tone(760, 0.16, "square", 0.3, 560); tone(560, 0.16, "square", 0.26, 420); }
            sfx("chirp", { rate: 0.78 + 0.07 * (pidx(d.by) % 8), delay: 0.2 });
            setToast(`😱 ${pname(d.by)} גנב לך את הגביש!`);
          }
          addFeed(`🥷 ${pname(d.by)} גנב מ${pname(d.from)}!`);
          break;
        }
        case "th_nope": {
          nopeSnd(); g.shake = Math.max(g.shake, 4);
          setToast(d.why === "far" ? "🚶 תיכנס למאורה שלהם" : d.why === "empty" ? "🕳️ אין שם מה לגנוב" : d.why === "gold" ? "💰 אין לך מספיק זהב לזה" : "🎒 קודם תביא את השלל הביתה");
          break;
        }
        case "th_tackle": {
          g.shake = Math.max(g.shake, 8); if (!sfx("pow")) tone(95, 0.14, "square", 0.3);
          g.stop = Math.max(g.stop, 0.08);                                       // hit-stop — העולם קופא לרגע
          { const p = d.carrier === me ? g.me : g.others.get(d.carrier); if (p) { fx("pow", p.x, p.y - 0.3, 3.2, 380, false, 0.35); p.hitAt = performance.now(); } }
          if (d.carrier === me) { g.me.stolen = 0; setToast("💥 הפילו אותך!"); setHud((h) => ({ ...h, stolen: false })); }
          addFeed(`💥 ${pname(d.by)} הפיל את ${pname(d.carrier)}!`);
          break;
        }
        case "th_drop": {
          const it = g.items.get(d.id);
          if (it) { it.state = "ground"; it.carrier = ""; it.gx = d.x; it.gy = d.y; it.pulse = 1; }
          g.parts.push(...burst(d.x, d.y, "#F2C14E", 8));
          sfx("bounce", { delay: 0.12 }); fx("dust", d.x, d.y + 0.2, 2.4, 520, false, 0.6);
          break;
        }
        case "th_pick": {
          const it = g.items.get(d.id);
          if (it) { it.state = "carried"; it.carrier = d.by; }
          if (d.by === me) { g.me.stolen = 1; g.me.grabAt = performance.now(); if (!sfx("pick")) tone(500, 0.09, "triangle", 0.24); setHud((h) => ({ ...h, stolen: true })); }
          { const p = d.by === me ? g.me : g.others.get(d.by); if (p) fx("sparkle", p.x, p.y - 0.6, 1.4, 300); }
          break;
        }
        case "th_home": {
          const it = g.items.get(d.id);
          if (it) { it.state = "den"; it.den = d.by; it.carrier = ""; it.pulse = 1; }
          if (d.by === me) {
            g.me.stolen = 0; setHud((h) => ({ ...h, stolen: false }));
            if (d.from === me) { setToast("🏠 החזרת את הגביש שלך!"); if (!sfx("home", { gain: 0.8 })) tone(520, 0.2, "triangle", 0.3); }
            else { setToast("💰 השלל שלך!"); if (!sfx("home")) { tone(392, 0.1, "triangle", 0.3); tone(523, 0.1, "triangle", 0.3); setTimeout(() => tone(659, 0.16, "triangle", 0.32), 90); } }
            { const den = g.dens.get(me); if (den) { fx("sparkle", den.x, den.y - 0.3, 3, 600); g.parts.push(...burst(den.x, den.y - 0.5, "#FFD152", 10)); } }
          } else if (d.from === me) {
            if (!sfx("receipt")) tone(300, 0.25, "sine", 0.16, 200);
            setToast(`📄 ${pname(d.by)} לקח את הגביש שלך הביתה`);
          }
          if (d.from !== d.by) addFeed(`🏠 ${pname(d.by)} הביא שלל של ${pname(d.from)}`);
          break;
        }
        case "th_rage":
          if (d.pid === me) { g.me.rageUntil = performance.now() + d.secs * 1000; setHud((h) => ({ ...h, rage: true })); if (!sfx("rage")) tone(180, 0.3, "sawtooth", 0.22, 420); setTimeout(() => setHud((h) => ({ ...h, rage: false })), d.secs * 1000); }
          break;
        case "th_first":
          setBanner({ ic: "⚔️", t: `${pname(d.by)} פתח את המלחמה!`, s: `הגניבה הראשונה — מ${pname(d.from)}` });
          setTimeout(() => setBanner(null), 2600);
          if (!sfx("warsting")) alarmSiren();
          break;
        case "th_empty":
          g.empty = true; setHud((h) => ({ ...h, empty: true }));
          setBanner({ ic: "⛰️", t: "ההר נגמר!", s: "הזהב היחיד שנשאר — אצל החברים שלכם" });
          setTimeout(() => setBanner(null), 3000);
          if (!sfx("rumble")) tone(200, 0.5, "sawtooth", 0.24, 120); g.shake = Math.max(g.shake, 10);
          if (!g.paused) SFX.current?.musicRate(1.06);
          for (let i = 0; i < 3; i++) fx("dust", g.mtn.x + (Math.random() - 0.5) * 3, g.mtn.y + (Math.random() - 0.5) * 2, 3.5, 900 + i * 200, false, 0.8);
          break;
        case "th_alarm":
          g.alarm = true; setHud((h) => ({ ...h, alarm: true }));
          setBanner({ ic: "🚨", t: "דקה אחרונה!", s: "כל ההכנסות פי 3" });
          setTimeout(() => setBanner(null), 2600);
          alarmSiren(); setTimeout(alarmSiren, 950);
          SFX.current?.musicRate(1.14);
          break;
        case "th_horn": {
          horn(); g.stop = 0.9; g.flash = 0.25; g.flashCol = "#F3E7D3"; SFX.current?.stopMusic(1.4); g.over = true;
          // מי שמוביל — פוזת ניצחון; הרגע נספר למעלה אצל כולם
          let best = "", bg = -1; for (const [pid, o] of g.others.entries()) if (o.gold > bg) { bg = o.gold; best = pid; }
          g.won = g.me.gold >= bg; void best;
          setBanner({ ic: "🔔", t: "הצפירה!", s: "מה שנשאר בבית — שלך" });
          break;
        }
        case "th_left": g.others.delete(d.pid); break;
      }
    });
  }, [hub, me, conn]);

  useEffect(() => { G.current.players = room.players.map((p) => ({ id: p.id, name: p.name })); }, [room.players]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2400); return () => clearTimeout(t); }, [toast]);
  // מעבר הקפאה → מדף → (החשיפה מגיעה כ-cue) לפי שעון השרת
  useEffect(() => {
    if (!pause || pause.phase !== "freeze") return;
    const t = setTimeout(() => setPause((p) => (p && p.phase === "freeze" ? { ...p, phase: "draft" } : p)), Math.max(0, conn.untilServer(pause.draftAt)));
    return () => clearTimeout(t);
  }, [pause?.phase, pause?.draftAt, conn]);
  // רשת ביטחון: אם th_resume לא הגיע (אבד) — משחררים לבד ב-resumeAt + חסד
  useEffect(() => {
    if (!pause) return;
    const t = setTimeout(() => { const g = G.current; if (g.paused) { g.paused = false; g.hist.length = 0; g.corr.x = 0; g.corr.y = 0; } setPause(null); }, Math.max(0, conn.untilServer(pause.resumeAt) + 1200));
    return () => clearTimeout(t);
  }, [pause?.resumeAt, conn]);

  /* ---- קלט ---- */
  const joy = useRef({ on: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 });
  useEffect(() => {
    const g = G.current;
    function flush(dx: number, dy: number) {
      g.sent = { x: dx, y: dy }; g.sentAt = performance.now();
      conn.sendGame({ a: "th_dir", dx, dy });
    }
    function sendDir(force = false) {
      const j = joy.current;
      let dx = Math.abs(j.dx) > 0.14 ? j.dx : 0, dy = Math.abs(j.dy) > 0.14 ? j.dy : 0;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      dx = Math.round(dx * 20) / 20; dy = Math.round(dy * 20) / 20;
      const changed = Math.abs(dx - g.sent.x) > 0.04 || Math.abs(dy - g.sent.y) > 0.04 || (!dx && !dy && (g.sent.x || g.sent.y));
      if (!force && !changed) return;
      const now = performance.now();
      if (!force && now - g.sentAt < 40) {
        if (!g.pendT) g.pendT = window.setTimeout(() => { g.pendT = 0; sendDir(false); }, 40 - (now - g.sentAt));
        return;
      }
      if (g.pendT) { clearTimeout(g.pendT); g.pendT = 0; }
      flush(dx, dy);
    }
    const isTouch = (e: Event): e is TouchEvent => "touches" in e;
    const touchOf = (e: TouchEvent, id: number) => { for (let i = 0; i < e.touches.length; i++) if (e.touches[i].identifier === id) return e.touches[i]; return null; };
    const down = (e: TouchEvent | MouseEvent) => {
      aInit();
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      const el = e.target as HTMLElement;
      if (el?.closest("button, .th-pause")) return;
      const j = joy.current;
      if (isTouch(e)) {
        if (j.on) return;
        const t = e.changedTouches[0]; if (!t) return;
        joy.current = { on: true, id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0 };
      } else {
        if (j.on && j.id !== -1) return;
        joy.current = { on: true, id: -1, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
      }
      if (e.cancelable) e.preventDefault();
    };
    const move = (e: TouchEvent | MouseEvent) => {
      const j = joy.current; if (!j.on) return;
      let px: number, py: number;
      if (isTouch(e)) { const t = touchOf(e, j.id); if (!t) return; px = t.clientX; py = t.clientY; }
      else { if (j.id !== -1) return; px = e.clientX; py = e.clientY; }
      let dx = px - j.ox, dy = py - j.oy;
      const d = Math.hypot(dx, dy), R = 46;
      if (d > R) { j.ox += (dx / d) * (d - R); j.oy += (dy / d) * (d - R); dx = px - j.ox; dy = py - j.oy; }
      j.dx = dx / R; j.dy = dy / R; sendDir();
      if (e.cancelable) e.preventDefault();
    };
    const up = (e: TouchEvent | MouseEvent) => {
      const j = joy.current; if (!j.on) return;
      if (isTouch(e)) {
        let mine = false;
        for (let i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === j.id) mine = true;
        if (!mine) return;
      } else if (j.id !== -1) return;
      j.on = false; j.dx = 0; j.dy = 0; sendDir(true);
    };
    const key = (e: KeyboardEvent, on: boolean) => {
      const j = joy.current, k = e.key;
      if (k === "ArrowLeft" || k === "a") j.dx = on ? -1 : 0;
      else if (k === "ArrowRight" || k === "d") j.dx = on ? 1 : 0;
      else if (k === "ArrowUp" || k === "w") j.dy = on ? -1 : 0;
      else if (k === "ArrowDown" || k === "s") j.dy = on ? 1 : 0;
      else if (on && (k === "1" || k === "2")) { const ids = thButtons(g.cards.get(me) ?? []); const id = ids[Number(k) - 1]; if (id) conn.sendGame({ a: "th_use", id } as never); return; }
      else return;
      e.preventDefault(); sendDir();
    };
    const kd = (e: KeyboardEvent) => key(e, true), ku = (e: KeyboardEvent) => key(e, false);
    const iv = setInterval(() => { if (!g.paused && (joy.current.on || joy.current.dx || joy.current.dy)) sendDir(true); }, 900);
    window.addEventListener("touchstart", down, { passive: false });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up); window.addEventListener("touchcancel", up);
    window.addEventListener("mousedown", down); window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    return () => {
      clearInterval(iv);
      if (g.pendT) clearTimeout(g.pendT);
      window.removeEventListener("touchstart", down); window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up); window.removeEventListener("touchcancel", up);
      window.removeEventListener("mousedown", down); window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [conn, me]);

  /* ---- הלולאה ---- */
  useEffect(() => {
    const cv0 = cvRef.current; if (!cv0) return;
    const cv: HTMLCanvasElement = cv0;
    const ctx2 = cv.getContext("2d", { alpha: false })!;
    let raf = 0, last = 0, W = 0, H = 0, DPR = 1, stealChk = 0, cdShown = -1;
    const g = G.current;

    const resize = () => {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth || window.innerWidth;
      H = cv.clientHeight || window.innerHeight;
      cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
      g.stamps.clear();
    };
    resize();
    window.addEventListener("resize", resize);

    const mtnR = () => (g.mtn.left <= 0 ? 0 : 1.6 + 2.8 * Math.sqrt(g.mtn.left / Math.max(1, g.mtn.total)));
    const glow = (x: number, y: number, col: string, r: number, alpha: number) => {
      const sp = glowSprite(col, r); const half = sp.width / 2;
      ctx2.globalAlpha = alpha; ctx2.drawImage(sp, x - half, y - half); ctx2.globalAlpha = 1;
    };
    function denShape(x: number, y: number, r: number, idx: number, fill: string, stroke: string, lw: number, c: CanvasRenderingContext2D = ctx2) {
      const sides = [4, 6, 3, 5, 8, 4, 6, 3][idx % 8];
      const rot = idx % 2 ? Math.PI / sides : -Math.PI / 2;
      c.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
      c.fillStyle = fill; c.fill();
      c.strokeStyle = stroke; c.lineWidth = lw; c.stroke();
    }
    const rrect = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
      c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r);
      c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
      c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
    };
    /** המהירות שלי — אותה נוסחה כמו בשרת, עם המודים */
    const mySpeed = (now: number) => {
      const m = g.me, md = g.mods;
      if (now < m.stunUntil) return 0;
      let s = SPD * md.speed * (1 - 0.05 * m.carry);
      if (m.stolen && now >= m.ghostUntil) s *= md.stolenSlow;
      if (now < m.ghostUntil) s *= 1.3;
      if (now < m.rageUntil) s *= md.rageMul;
      if (now < m.slowUntil) s *= m.slowMul;
      if (now < g.bullUntil) s *= 1.5;
      const myDen = g.dens.get(me);
      if (md.stretch && m.stolen && myDen && Math.hypot(m.x - myDen.x, m.y - myDen.y) <= 6) s *= 1.3;
      if (!md.ladder) for (const [pid, den] of g.dens.entries()) {
        if (pid === me) continue;
        const f = thMods(g.cards.get(pid) ?? []).fence; if (!f) continue;
        if (Math.hypot(m.x - den.x, m.y - den.y) <= DEN_R + 0.4) { s *= f === 2 ? 0.35 : 0.5; break; }
      }
      return s;
    };

    /* 🏠 חותמת המאורה: מאורה + גדר/חומה + מגדל(ים) + תוספות — מצוירת לקנבס קטן פעם אחת, ומתרעננת כשמשהו משתנה */
    const STAMP_R = 5.2;   // תאים מכל צד
    function denStamp(pid: string, den: { x: number; y: number }, idx: number, col: string, isMe: boolean, tw: TowerC | undefined): HTMLCanvasElement | null {
      const IM = IMGS.current; if (!IM) return null;
      const cards = g.cards.get(pid) ?? [];
      const md = thMods(cards);
      const key = [tw?.st ?? "ok", md.towerLvl, md.rear ? 1 : 0, md.fence, md.honey ? 1 : 0, md.bell ? 1 : 0, md.vault ? 1 : 0, md.mine ? 1 : 0, cards.filter((c) => c === "fert").length, cards.filter((c) => c === "shelf").length, imgOk(IM.den[idx % 8]) ? 1 : 0, imgOk(IM.tower[0]) ? 1 : 0, imgOk(IM.towerUp.l2) ? 1 : 0, imgOk(IM.home.fence) ? 1 : 0, DPR].join("|");
      const have = g.stamps.get(pid);
      if (have && have.key === key) return have.cv;
      const size = STAMP_R * 2 * TS;
      const c = document.createElement("canvas"); c.width = Math.round(size * DPR); c.height = Math.round(size * DPR);
      const cx = c.getContext("2d")!; cx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const ox = STAMP_R * TS, oy = STAMP_R * TS;     // מרכז המאורה
      const side = Math.sign(g.mtn.x - den.x) || 1;
      // 🧱 גדר / חומה — טבעת + מדבקה בחזית
      if (md.fence) {
        const im = md.fence === 2 ? IM.home.wall : IM.home.fence;
        cx.strokeStyle = md.fence === 2 ? "#8E8A84" : "#8B6B3E"; cx.lineWidth = md.fence === 2 ? 5 : 3.5; cx.globalAlpha = 0.9;
        cx.beginPath(); cx.arc(ox, oy + 4, (DEN_R + 0.35) * TS, 0, 6.283); cx.stroke(); cx.globalAlpha = 1;
        if (imgOk(im)) { const h = TS * 1.5, w = h * (im.naturalWidth / im.naturalHeight); cx.drawImage(im, ox - w / 2 - TS * 1.2, oy + TS * 1.1, w, h); cx.save(); cx.translate(ox + w / 2 + TS * 1.2, oy + TS * 1.1); cx.scale(-1, 1); cx.drawImage(im, 0, 0, w, h); cx.restore(); }
      }
      // המאורה
      const denImg = IM.den[idx % 8];
      if (imgOk(denImg)) { const w = TS * 3.6, h = w * (denImg.naturalHeight / denImg.naturalWidth); cx.drawImage(tinted(denImg, col, isMe ? 0.22 : 0.3), ox - w / 2, oy - h * 0.66, w, h); }
      else denShape(ox, oy, DEN_R * TS * 0.72, idx, "rgba(20,16,12,.92)", col, isMe ? 4.5 : 3, cx);
      cx.strokeStyle = col; cx.globalAlpha = 0.16; cx.lineWidth = 2; cx.beginPath(); cx.arc(ox, oy, DEN_R * TS, 0, 6.283); cx.stroke(); cx.globalAlpha = 1;
      // 🗼 המגדל (ומגדל אחורי)
      const drawTw = (x: number, y: number, kind: "l1" | "l2" | "l3" | "rear", st: ThTowerSt) => {
        const im = kind === "rear" ? IM.towerUp.rear : kind === "l3" ? IM.towerUp.l3 : kind === "l2" ? IM.towerUp.l2 : IM.tower[st === "off" ? 1 : 0];
        cx.fillStyle = "rgba(0,0,0,.3)"; cx.beginPath(); cx.ellipse(x, y + TS * 0.42, kind === "rear" ? 12 : 15, 5, 0, 0, 6.283); cx.fill();
        if (imgOk(im)) {
          const h = TS * (kind === "rear" ? 1.5 : kind === "l3" ? 2.9 : kind === "l2" ? 2.6 : 2.35), w = h * (im.naturalWidth / im.naturalHeight);
          cx.save(); cx.translate(x, y + TS * 0.45); if (side > 0) cx.scale(-1, 1);
          if (st === "off") cx.globalAlpha = 0.7;
          cx.drawImage(tinted(im, col, isMe ? 0.2 : 0.28), -w / 2, -h, w, h); cx.restore(); cx.globalAlpha = 1;
        } else {
          cx.fillStyle = st === "off" ? "#3A332E" : "#6B5F55"; cx.strokeStyle = "#2C2825"; cx.lineWidth = 2.5;
          cx.beginPath(); rrect(cx, x - 12, y - TS * 1.3, 24, TS * 1.6, 5); cx.fill(); cx.stroke();
          cx.fillStyle = col; cx.beginPath(); cx.moveTo(x - 15, y - TS * 1.28); cx.lineTo(x + 15, y - TS * 1.28); cx.lineTo(x, y - TS * 1.85); cx.closePath(); cx.fill(); cx.stroke();
        }
      };
      const tp = towerPos(den, g.mtn), rp = rearPos(den, g.mtn);
      const st = tw?.st ?? "ok";
      if (md.rear) drawTw(ox + (rp.x - den.x) * TS, oy + (rp.y - den.y) * TS, "rear", st);
      drawTw(ox + (tp.x - den.x) * TS, oy + (tp.y - den.y) * TS, md.towerLvl === 3 ? "l3" : md.towerLvl === 2 ? "l2" : "l1", st);
      // 🏠 תוספות — מדבקות סביב המאורה, אותו מקום תמיד
      const addon = (im: HTMLImageElement, x: number, y: number, h: number) => { if (!imgOk(im)) return; const w = h * (im.naturalWidth / im.naturalHeight); cx.drawImage(im, ox + x * TS - w / 2, oy + y * TS - h, w, h); };
      if (md.honey) addon(IM.home.honey, 0, 2.5, TS * 1.1);
      if (md.bell) addon(IM.home.bell, -1.6 * side, -0.9, TS * 1.4);
      if (md.vault) addon(IM.home.safe, -2.1 * side, 1.7, TS * 1.2);
      if (cards.includes("fert")) addon(IM.home.plant, 2.2 * side, 1.5, TS * 1.1);
      const shelves = cards.filter((c2) => c2 === "shelf").length;
      if (shelves) addon(IM.home.crates, -2.6 * side, -1.4, TS * (1.0 + 0.25 * shelves));
      if (md.mine) addon(IM.home.mine, 1.1, 2.7, TS * 1.0);
      g.stamps.set(pid, { key, cv: c });
      return c;
    }

    function frame(ts: number) {
      raf = requestAnimationFrame(frame);
      if (!last) last = ts;
      const wantW = cv.clientWidth || window.innerWidth, wantH = cv.clientHeight || window.innerHeight;
      if (wantW && wantH && (Math.abs(wantW - W) > 1 || Math.abs(wantH - H) > 1)) resize();
      let dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      if (g.stop > 0) { g.stop -= dt; dt *= 0.06; }
      if (!g.ready) { ctx2.setTransform(DPR, 0, 0, DPR, 0, 0); ctx2.fillStyle = "#14100C"; ctx2.fillRect(0, 0, W, H); return; }
      const IM = IMGS.current;
      if (!g.groundPat && IM && imgOk(IM.ground)) { const p = ctx2.createPattern(IM.ground, "repeat"); if (p) { p.setTransform?.(new DOMMatrix().scale(0.5)); g.groundPat = p; } }

      const sNow = conn.serverNow();
      if (!g.go && g.goAt) {
        const cd = Math.max(0, Math.ceil((g.goAt - sNow) / 1000));
        if (cd !== cdShown) { cdShown = cd; setCountdown(cd); if (cd > 0 && !sfx("tick")) tone(440, 0.08, "triangle", 0.16); }
      }
      if (g.go && !g.over && g.lastPosAt) {
        const since = performance.now() - g.lastPosAt;
        if (since > 4000 && document.visibilityState === "visible") {
          if (!g.stalled) { g.stalled = true; setStalled(true); }
          if (performance.now() - g.kickAt > 5000) { g.kickAt = performance.now(); conn.kick(); }
        } else if (g.stalled && since < 1500) { g.stalled = false; setStalled(false); }
      }

      /* ניבוי מקומי */
      const m = g.me;
      const nowP = performance.now();
      const raging = nowP < m.rageUntil, slowed = nowP < m.slowUntil, stunned = nowP < m.stunUntil, dashing = nowP < m.dashUntil;
      const moving = g.go && !g.paused && !g.over && !stunned && (dashing || !!(g.sent.x || g.sent.y));
      if (g.sent.x) g.face = g.sent.x < 0 ? -1 : 1;
      if (dashing) g.face = m.dashDx < 0 ? -1 : m.dashDx > 0 ? 1 : g.face;
      if (moving) {
        const s = dashing ? SPD * g.mods.speed * DASH_MUL : mySpeed(nowP);
        const mx = dashing ? m.dashDx : g.sent.x, my = dashing ? m.dashDy : g.sent.y;
        m.x = Math.max(1, Math.min(g.w - 1, m.x + mx * s * dt));
        m.y = Math.max(1, Math.min(g.h - 1, m.y + my * s * dt));
        const r = mtnR();
        if (r > 0) {
          const ddx = m.x - g.mtn.x, ddy = m.y - g.mtn.y, d = Math.hypot(ddx, ddy);
          if (d < r && d > 0.001) { m.x = g.mtn.x + (ddx / d) * r; m.y = g.mtn.y + (ddy / d) * r; }
        }
      }
      if (!g.paused && (g.corr.x || g.corr.y)) {
        const k = Math.min(1, dt * 6);
        m.x += g.corr.x * k; m.y += g.corr.y * k;
        g.corr.x *= 1 - k; g.corr.y *= 1 - k;
        if (Math.abs(g.corr.x) < 0.005 && Math.abs(g.corr.y) < 0.005) { g.corr.x = 0; g.corr.y = 0; }
      }
      if (conn.synced && !g.paused) {
        g.hist.push({ t: sNow + conn.rttMs / 2, x: m.x, y: m.y });
        while (g.hist.length > 2 && g.hist[0].t < sNow - HIST_MS) g.hist.shift();
      }
      if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 40);
      if (g.flash > 0) g.flash -= dt;
      if (g.zoom > 0) g.zoom = Math.max(0, g.zoom - dt * 0.25);
      for (const o of g.others.values()) {
        if (g.paused) continue;
        const age = Math.max(0, Math.min(0.25, (sNow - o.st) / 1000));
        const gx = o.tx + o.vx * age, gy = o.ty + o.vy * age;
        o.x += (gx - o.x) * Math.min(1, dt * 16); o.y += (gy - o.y) * Math.min(1, dt * 16);
        if (Math.abs(o.vx) > 0.3) o.face = o.vx < 0 ? -1 : 1;
      }
      for (let i = g.trail.length - 1; i >= 0; i--) { g.trail[i].l -= dt * 1.6; if (g.trail[i].l <= 0) g.trail.splice(i, 1); }
      for (let i = g.pops.length - 1; i >= 0; i--) { g.pops[i].l -= dt; g.pops[i].y -= dt * 1.2; if (g.pops[i].l <= 0) g.pops.splice(i, 1); }
      for (let i = g.parts.length - 1; i >= 0; i--) { const p = g.parts[i]; p.l -= dt; if (p.l <= 0) { g.parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 7 * dt; }
      for (const it of g.items.values()) if (it.pulse > 0) it.pulse = Math.max(0, it.pulse - dt * 2.2);
      if (g.ping) { g.ping.t -= dt; if (g.ping.t <= 0) g.ping = null; }
      if (g.warn) { g.warn.t -= dt; if (g.warn.t <= 0) g.warn = null; }
      for (let i = g.shots.length - 1; i >= 0; i--) {
        const s = g.shots[i];
        if (nowP - s.t0 >= s.ms) { g.shots.splice(i, 1); fx("dust", s.x1, s.y1 + 0.1, 1.3, 300, false, 0.5); }
      }
      for (let i = g.pies.length - 1; i >= 0; i--) if (nowP - g.pies[i].t0 >= g.pies[i].ms + 80) g.pies.splice(i, 1);
      if (!g.paused) {
        if (m.stolen && Math.random() < 0.6) g.trail.push({ x: m.x, y: m.y, l: 1, col: pcol(me) });
        if (nowP < m.ghostUntil && Math.random() < 0.8) g.trail.push({ x: m.x + (Math.random() - 0.5) * 0.6, y: m.y + (Math.random() - 0.5) * 0.6, l: 0.8, col: "#F3E7D3" });
        for (const [pid, o] of g.others.entries()) { if (o.stolen && Math.random() < 0.6) g.trail.push({ x: o.x, y: o.y, l: 1, col: pcol(pid) }); if (nowP < o.ghostUntil && Math.random() < 0.8) g.trail.push({ x: o.x, y: o.y, l: 0.8, col: "#F3E7D3" }); }
      }

      // מצלמה (עם פאנץ'-זום קטן ברגעי גניבה/דאש)
      const txc = m.x * TS - W / 2, tyc = m.y * TS - H / 2;
      g.cam.x += (txc - g.cam.x) * Math.min(1, dt * 7); g.cam.y += (tyc - g.cam.y) * Math.min(1, dt * 7);
      if (g.w * TS > W) g.cam.x = Math.max(-TS, Math.min(g.w * TS - W + TS, g.cam.x)); else g.cam.x = -(W - g.w * TS) / 2;
      if (g.h * TS > H) g.cam.y = Math.max(-TS, Math.min(g.h * TS - H + TS, g.cam.y)); else g.cam.y = -(H - g.h * TS) / 2;

      /* ציור */
      ctx2.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx2.fillStyle = "#100D0A"; ctx2.fillRect(0, 0, W, H);
      const sx = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0, sy = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0;
      ctx2.save();
      if (g.zoom > 0) { ctx2.translate(W / 2, H / 2); ctx2.scale(1 + g.zoom, 1 + g.zoom); ctx2.translate(-W / 2, -H / 2); }
      ctx2.translate(-g.cam.x + sx, -g.cam.y + sy);

      // 🌲 הרצפה — אריח יער בלילה (pattern), או נקודות הדפסה עד שהוא נטען
      const x0 = Math.max(0, Math.floor(g.cam.x / TS) - 2), x1 = Math.min(g.w, Math.ceil((g.cam.x + W) / TS) + 1);
      const y0 = Math.max(0, Math.floor(g.cam.y / TS) - 2), y1 = Math.min(g.h, Math.ceil((g.cam.y + H) / TS) + 1);
      if (g.groundPat) { ctx2.fillStyle = g.groundPat; ctx2.fillRect(x0 * TS, y0 * TS, (x1 - x0) * TS, (y1 - y0) * TS); ctx2.fillStyle = "rgba(10,7,5,.22)"; ctx2.fillRect(x0 * TS, y0 * TS, (x1 - x0) * TS, (y1 - y0) * TS); }
      else {
        ctx2.fillStyle = "#1B1510"; ctx2.fillRect(0, 0, g.w * TS, g.h * TS);
        ctx2.fillStyle = "rgba(243,231,211,.045)";
        for (let yy = 1; yy < g.h; yy += 2) { if (yy < y0 || yy > y1) continue; for (let xx = 1 + (yy % 4 === 1 ? 0 : 1); xx < g.w; xx += 2) { if (xx < x0 || xx > x1) continue; ctx2.fillRect(xx * TS - 1, yy * TS - 1, 2, 2); } }
      }
      ctx2.strokeStyle = "#3A2E22"; ctx2.lineWidth = 5; ctx2.strokeRect(2, 2, g.w * TS - 4, g.h * TS - 4);

      // החוט שלי
      const myDen = g.dens.get(me);
      if (myDen) {
        const dx = myDen.x - m.x, dy = myDen.y - m.y, dist = Math.hypot(dx, dy);
        const maxD = Math.hypot(g.w, g.h) * 0.55, frac = Math.min(1, dist / maxD);
        const puls = frac > 0.72 ? 0.5 + 0.5 * Math.sin(ts / 90) : 1;
        ctx2.strokeStyle = pcol(me);
        ctx2.globalAlpha = (0.22 + frac * 0.6) * puls;
        ctx2.lineWidth = 3.4 - frac * 2;
        ctx2.beginPath();
        ctx2.moveTo(m.x * TS, m.y * TS);
        const mx = (m.x + myDen.x) / 2, myy = (m.y + myDen.y) / 2 - (2.4 - frac * 2.1);
        ctx2.quadraticCurveTo(mx * TS, myy * TS, myDen.x * TS, myDen.y * TS);
        ctx2.stroke();
        ctx2.globalAlpha = 1;
      }

      // ההר
      const r = mtnR();
      const frac = g.mtn.left / Math.max(1, g.mtn.total);
      const mtnImg = IM ? IM.mtn[g.mtn.left <= 0 ? 3 : frac > 0.62 ? 0 : frac > 0.28 ? 1 : 2] : null;
      if (mtnImg && imgOk(mtnImg)) {
        const rr = r > 0 ? r : 1.7;
        const w = rr * TS * 2.4, h = w * (mtnImg.naturalHeight / mtnImg.naturalWidth);
        if (r > 0 && frac <= 0.28) glow(g.mtn.x * TS, g.mtn.y * TS, "#FFB300", rr * TS * 1.1, 0.18 + 0.1 * Math.sin(ts / 200));
        ctx2.drawImage(mtnImg, g.mtn.x * TS - w / 2, g.mtn.y * TS - h * 0.58, w, h);
        ctx2.font = "800 13px Assistant, sans-serif"; ctx2.textAlign = "center";
        const lbl = r > 0 ? `⛰️ ${g.mtn.left}` : "⛰️ ההר נגמר";
        ctx2.fillStyle = "#0009"; ctx2.fillText(lbl, g.mtn.x * TS + 1, g.mtn.y * TS - h * 0.58 - 5);
        ctx2.fillStyle = r > 0 ? "#E8D9BC" : "#8B7D6B"; ctx2.fillText(lbl, g.mtn.x * TS, g.mtn.y * TS - h * 0.58 - 6);
      } else if (r > 0) {
        ctx2.save(); ctx2.translate(g.mtn.x * TS, g.mtn.y * TS); ctx2.beginPath();
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, wob = 1 + 0.14 * Math.sin(i * 3.7); const px = Math.cos(a) * r * TS * wob, py = Math.sin(a) * r * TS * wob; if (i === 0) ctx2.moveTo(px, py); else ctx2.lineTo(px, py); }
        ctx2.closePath(); ctx2.fillStyle = "#57524C"; ctx2.fill(); ctx2.strokeStyle = "#2C2825"; ctx2.lineWidth = 4; ctx2.stroke();
        ctx2.font = "800 13px Assistant, sans-serif"; ctx2.textAlign = "center"; ctx2.fillStyle = "#E8D9BC"; ctx2.fillText(`⛰️ ${g.mtn.left}`, 0, -r * TS - 10);
        ctx2.restore();
      } else { ctx2.font = "800 13px Assistant, sans-serif"; ctx2.textAlign = "center"; ctx2.fillStyle = "#6B5F4E"; ctx2.fillText("⛰️ ההר נגמר", g.mtn.x * TS, g.mtn.y * TS); }

      // מאורות (חותמות) + טווחי מגדל + אבנים
      const byDen = new Map<string, CItem[]>();
      for (const it of g.items.values()) if (it.state === "den") { const arr = byDen.get(it.den); if (arr) arr.push(it); else byDen.set(it.den, [it]); }
      for (const [pid, den] of g.dens.entries()) {
        const idx = Math.max(0, g.players.findIndex((p) => p.id === pid));
        const col = pcol(pid), isMe = pid === me;
        const its = byDen.get(pid) ?? [];
        let wealth = 0; for (const it of its) wealth += RATE[it.lvl] * it.v * 5;
        const gl = Math.min(26, 4 + wealth * 1.6);
        glow(den.x * TS, den.y * TS, col, DEN_R * TS * 0.72 + gl * 1.4, 0.18 + Math.min(0.42, wealth * 0.02));
        const tw = g.towers.get(pid);
        const towerUp = !!tw && (tw.st === "ok" || tw.st === "hot");
        const dMe = Math.hypot(m.x - den.x, m.y - den.y);
        const omd = thMods(g.cards.get(pid) ?? []);
        const R = g.tower.r + (omd.towerLvl >= 2 ? 0.5 : 0);
        if (isMe) {
          ctx2.save(); ctx2.setLineDash([7, 9]); ctx2.strokeStyle = col; ctx2.globalAlpha = towerUp ? 0.28 : 0.1; ctx2.lineWidth = 2;
          ctx2.beginPath(); ctx2.arc(den.x * TS, den.y * TS, R * TS, 0, 6.283); ctx2.stroke(); ctx2.restore();
          if (!omd.rear) {
            ctx2.save(); ctx2.beginPath(); ctx2.moveTo(den.x * TS, den.y * TS);
            ctx2.arc(den.x * TS, den.y * TS, R * TS, den.back - g.tower.arc / 2, den.back + g.tower.arc / 2); ctx2.closePath();
            ctx2.fillStyle = "rgba(0,0,0,.30)"; ctx2.fill();
            ctx2.setLineDash([4, 6]); ctx2.strokeStyle = "rgba(243,231,211,.28)"; ctx2.lineWidth = 1.5; ctx2.stroke(); ctx2.restore();
          }
        } else if (towerUp && dMe <= R + 0.3) {
          ctx2.save(); ctx2.setLineDash([5, 7]); ctx2.strokeStyle = "#E5484D"; ctx2.globalAlpha = 0.2 + 0.1 * Math.sin(ts / 140); ctx2.lineWidth = 2;
          ctx2.beginPath(); ctx2.arc(den.x * TS, den.y * TS, R * TS, 0, 6.283); ctx2.stroke(); ctx2.restore();
        }
        // החותמת
        const st = denStamp(pid, den, idx, col, isMe, tw);
        if (st) ctx2.drawImage(st, (den.x - STAMP_R) * TS, (den.y - STAMP_R) * TS, STAMP_R * 2 * TS, STAMP_R * 2 * TS);
        else denShape(den.x * TS, den.y * TS, DEN_R * TS * 0.72, idx, "rgba(20,16,12,.92)", col, isMe ? 4.5 : 3);
        // מצבי מגדל דינמיים: חימום (זוהר+עשן), כבוי (💤 + קשת ספירה)
        if (tw) {
          const tp = towerPos(den, g.mtn), px = tp.x * TS, py = tp.y * TS;
          if (tw.st === "hot") { glow(px, py - TS * 0.5, "#FF5A3C", 30, 0.35 + 0.15 * Math.sin(ts / 90)); if (Math.random() < 0.08) fx("dust", tp.x + (Math.random() - 0.5) * 0.4, tp.y - 1.3, 1.1 + Math.random() * 0.5, 620, false, 0.9); }
          const total = tw.st === "off" ? Math.max(1, tw.until - tw.since + performance.now() - sNow) : tw.st === "hot" ? 4000 : 0;
          if (total && tw.until) {
            const left = Math.max(0, tw.until - sNow), u = Math.min(1, left / (tw.st === "hot" ? 4000 : 8000));
            ctx2.strokeStyle = tw.st === "hot" ? "#FF5A3C" : "#9AA4B2"; ctx2.lineWidth = 3; ctx2.globalAlpha = 0.9;
            ctx2.beginPath(); ctx2.arc(px, py - TS * 0.8, 22, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2); ctx2.stroke(); ctx2.globalAlpha = 1;
            ctx2.font = "15px sans-serif"; ctx2.textAlign = "center";
            if (tw.st === "off") ctx2.fillText("💤", px + 14 * Math.sin(ts / 500), py - TS * 1.9 - 3 * Math.sin(ts / 300));
          }
        }
        // האבנים
        const vaulted = omd.vault ? its.reduce<CItem | null>((b, it) => (!b || it.lvl > b.lvl || (it.lvl === b.lvl && it.v > b.v) ? it : b), null) : null;
        const n = its.length, step = Math.min(0.62, 2.9 / Math.max(1, n));
        its.forEach((it, i) => {
          const ang = Math.PI / 2 + (i - (n - 1) / 2) * step;
          const ix = den.x * TS + Math.cos(ang) * TS * 1.55, iy = den.y * TS + Math.sin(ang) * TS * 0.78 + TS * 0.32;
          const pulse = (1 + it.pulse * 0.7) * (it.lvl === 2 ? 1 + 0.08 * Math.sin(ts / 160) : 1);
          const gemImg = IM ? IM.gem[it.v >= 6 ? 4 : it.lvl === 2 ? 3 : it.lvl === 1 ? 2 : 1] : null;
          if (it.lvl > 0 || it.v >= 6) glow(ix, iy, it.v >= 6 ? "#FFD152" : "#F2C14E", TS * (0.5 + it.lvl * 0.2) * vScale(it.v) + (it.v >= 6 ? 8 : 0), 0.35);
          if (gemImg && imgOk(gemImg)) { const gs = TS * (0.58 + it.lvl * 0.12) * vScale(it.v) * pulse; ctx2.drawImage(gemImg, ix - gs / 2, iy - gs / 2, gs, gs * (gemImg.naturalHeight / gemImg.naturalWidth)); }
          else { const sz = LVL_SIZE[it.lvl] * vScale(it.v) * pulse; ctx2.save(); ctx2.translate(ix, iy); ctx2.rotate(Math.PI / 4); ctx2.fillStyle = it.lvl === 2 ? "#FFE082" : it.lvl === 1 ? "#F2C14E" : "#B9C46E"; ctx2.fillRect(-sz / 2, -sz / 2, sz, sz); ctx2.restore(); }
          if (vaulted === it) { ctx2.font = "12px sans-serif"; ctx2.textAlign = "center"; ctx2.fillText("🔒", ix + 9, iy - 8); }
        });
        // שם
        ctx2.font = `800 ${isMe ? 13 : 11}px Assistant, sans-serif`; ctx2.textAlign = "center";
        const nm = (isMe ? "🏠 " : "") + pname(pid);
        ctx2.fillStyle = "#000"; ctx2.fillText(nm, den.x * TS + 1, den.y * TS + DEN_R * TS + 15);
        ctx2.fillStyle = col; ctx2.fillText(nm, den.x * TS, den.y * TS + DEN_R * TS + 14);
      }

      // 🍌 בננות על הרצפה
      for (const bn of g.bananas.values()) {
        ctx2.font = "18px sans-serif"; ctx2.textAlign = "center";
        ctx2.fillStyle = "rgba(0,0,0,.3)"; ctx2.beginPath(); ctx2.ellipse(bn.x * TS, bn.y * TS + 6, 9, 4, 0, 0, 6.283); ctx2.fill();
        ctx2.fillText("🍌", bn.x * TS, bn.y * TS + 4 + Math.sin(ts / 300 + bn.x) * 1.5);
      }
      // שלל וצ'אנקים על הרצפה
      for (const [, it] of g.items.entries()) {
        if (it.state !== "ground") continue;
        if (it.nugget) {
          const rock = IM ? IM.gem[0] : null;
          glow(it.gx * TS, it.gy * TS, "#F2C14E", 14, 0.35);
          if (rock && imgOk(rock)) { const gs = TS * 0.6 * (it.v >= 2 ? 1.2 : 1); ctx2.drawImage(rock, it.gx * TS - gs / 2, it.gy * TS - gs / 2 - 2 * Math.abs(Math.sin(ts / 260)), gs, gs * (rock.naturalHeight / rock.naturalWidth)); }
          else { ctx2.fillStyle = "#C8B78E"; ctx2.beginPath(); ctx2.arc(it.gx * TS, it.gy * TS, 6, 0, 6.283); ctx2.fill(); }
          continue;
        }
        const sz = (LVL_SIZE[it.lvl] + 4) * vScale(it.v) + 2 * Math.sin(ts / 130);
        glow(it.gx * TS, it.gy * TS, "#FFD152", sz + 16, 0.6);
        const gemImg = IM ? IM.gem[it.v >= 6 ? 4 : it.lvl === 2 ? 3 : it.lvl === 1 ? 2 : 1] : null;
        ctx2.save(); ctx2.translate(it.gx * TS, it.gy * TS - 2 - 3 * Math.abs(Math.sin(ts / 260)));
        if (gemImg && imgOk(gemImg)) { const gs = TS * 0.95 * vScale(it.v); ctx2.rotate(Math.sin(ts / 300) * 0.25); ctx2.drawImage(gemImg, -gs / 2, -gs / 2, gs, gs * (gemImg.naturalHeight / gemImg.naturalWidth)); }
        else { ctx2.rotate(ts / 500); ctx2.fillStyle = "#FFE082"; ctx2.fillRect(-sz / 2, -sz / 2, sz, sz); }
        ctx2.restore();
      }

      // חלוקים ועוגות באוויר
      if (g.shots.length) {
        const rock = IM ? IM.gem[0] : null, hasRock = !!rock && imgOk(rock);
        for (const s of g.shots) {
          const u = Math.min(1, (performance.now() - s.t0) / s.ms);
          const dist = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
          const x = (s.x0 + (s.x1 - s.x0) * u) * TS, y = (s.y0 + (s.y1 - s.y0) * u) * TS - TS * 0.9 * (1 - u) - Math.sin(u * Math.PI) * TS * (0.5 + dist * 0.12);
          ctx2.fillStyle = "rgba(0,0,0,.25)"; ctx2.beginPath(); ctx2.ellipse((s.x0 + (s.x1 - s.x0) * u) * TS, (s.y0 + (s.y1 - s.y0) * u) * TS + 3, 5, 2.5, 0, 0, 6.283); ctx2.fill();
          ctx2.save(); ctx2.translate(x, y); ctx2.rotate(u * 9);
          if (hasRock) ctx2.drawImage(rock!, -7, -7, 14, 14 * (rock!.naturalHeight / rock!.naturalWidth));
          else { ctx2.fillStyle = "#C8B78E"; ctx2.strokeStyle = "#2C2825"; ctx2.lineWidth = 1.5; ctx2.beginPath(); ctx2.arc(0, 0, 5, 0, 6.283); ctx2.fill(); ctx2.stroke(); }
          ctx2.restore();
        }
      }
      for (const p of g.pies) {
        const u = Math.min(1, (performance.now() - p.t0) / p.ms);
        const x = (p.x0 + (p.x1 - p.x0) * u) * TS, y = (p.y0 + (p.y1 - p.y0) * u) * TS - TS * 0.8 - Math.sin(u * Math.PI) * TS * 0.6;
        ctx2.font = "22px sans-serif"; ctx2.textAlign = "center"; ctx2.save(); ctx2.translate(x, y); ctx2.rotate(u * 6); ctx2.fillText("🥧", 0, 8); ctx2.restore();
      }

      if (g.ping) {
        const u = 1 - (g.ping.t % 1);
        ctx2.strokeStyle = g.ping.col; ctx2.globalAlpha = (1 - u) * 0.7; ctx2.lineWidth = 3;
        ctx2.beginPath(); ctx2.arc(g.ping.x * TS, g.ping.y * TS, TS * (0.6 + u * 2.4), 0, 6.283); ctx2.stroke();
        ctx2.globalAlpha = 1;
      }
      for (const t of g.trail) { ctx2.globalAlpha = t.l * 0.5; ctx2.fillStyle = t.col; ctx2.beginPath(); ctx2.arc(t.x * TS, t.y * TS, 5 * t.l, 0, 6.283); ctx2.fill(); }
      ctx2.globalAlpha = 1;

      // 🦝 שחקנים
      const cardsImg = IM?.cards ?? null, hasCards = !!cardsImg && imgOk(cardsImg);
      const drawPlayer = (pid: string, x: number, y: number, carry: number, stolen: number, rage: number, isMe: boolean, face: number, mov: boolean, carriedV: number, slow: number, st: { stun: boolean; bubble: boolean; ghost: boolean; dash: boolean; grabAt: number; hitAt: number }) => {
        const col = pcol(pid), idx = pidx(pid);
        const im = IM ? IM.thief[idx % 8] : null, hasImg = !!im && imgOk(im);
        if (stolen) glow(x * TS, y * TS, col, 44, 0.55);
        if (rage) glow(x * TS, y * TS, "#FF4438", 40, 0.5);
        if (slow) glow(x * TS, y * TS + 6, "#7FB8FF", 30, 0.35);
        if (st.ghost) glow(x * TS, y * TS, "#F3E7D3", 36, 0.35);
        // צל
        ctx2.fillStyle = "rgba(0,0,0,.34)"; ctx2.beginPath(); ctx2.ellipse(x * TS, y * TS + TS * 0.62, 13, 5, 0, 0, 6.283); ctx2.fill();
        // הפוזה
        let pose: RacPose = RP.idle;
        const since = (t: number) => nowP - t;
        if (g.paused && !g.over) pose = RP.frozen;
        else if (g.over) pose = isMe ? (g.won ? RP.win : RP.idle) : RP.idle;
        else if (st.stun || since(st.hitAt) < 500) pose = RP.hit;
        else if (st.dash) pose = RP.dash;
        else if (since(st.grabAt) < 320) pose = RP.grab;
        else if (stolen) pose = mov ? (Math.floor(ts / 110) % 2 ? RP.carry1 : RP.carry2) : RP.carry1;
        else if (mov) pose = ([RP.run1, RP.run2, RP.run3, RP.run2] as RacPose[])[Math.floor(ts / 95) % 4];
        else pose = Math.floor(ts / 2600 + idx) % 5 === 0 ? RP.look : RP.idle;
        const bob = mov && !g.paused ? Math.abs(Math.sin(ts / 82 + idx)) * 3 : 0;
        const sq = mov && !g.paused ? Math.sin(ts / 82 + idx) * 0.05 : 0;
        const drawn = racReady() && drawRaccoon(ctx2, col, pose, x * TS, y * TS + TS * 0.62 - bob, TS * 2.3, face < 0, sq, st.ghost ? 0.7 : 1);
        if (!drawn) {
          if (hasImg) {
            const h = TS * 2.05, w = h * (im!.naturalWidth / im!.naturalHeight);
            const bob2 = mov ? Math.abs(Math.sin(ts / 82 + idx)) * 3.2 : Math.sin(ts / 620 + idx) * 0.8;
            ctx2.save(); ctx2.translate(x * TS, y * TS + 3 - bob2); if (face < 0) ctx2.scale(-1, 1);
            ctx2.drawImage(im!, -w / 2, -h * 0.6, w, h); ctx2.restore();
          } else { ctx2.fillStyle = col; ctx2.beginPath(); ctx2.arc(x * TS, y * TS, isMe ? 12 : 10.5, 0, 6.283); ctx2.fill(); ctx2.strokeStyle = isMe ? "#F3E7D3" : "#0008"; ctx2.lineWidth = isMe ? 3 : 2; ctx2.stroke(); }
        }
        // 🫧 בועה
        if (st.bubble) { const bim = IM?.fx.bubble; if (bim && imgOk(bim)) { ctx2.globalAlpha = 0.85; const bs = TS * 3; ctx2.drawImage(bim, x * TS - bs / 2, y * TS - TS * 0.5 - bs / 2, bs, bs); ctx2.globalAlpha = 1; } else { ctx2.strokeStyle = "#9BD6FF"; ctx2.lineWidth = 3; ctx2.beginPath(); ctx2.arc(x * TS, y * TS - TS * 0.5, TS * 1.3, 0, 6.283); ctx2.stroke(); } }
        // צ'אנקים ביד
        const rock = IM ? IM.gem[0] : null;
        for (let i = 0; i < carry; i++) {
          const a = ts / 400 + (i / 5) * Math.PI * 2, cx = x * TS + Math.cos(a) * 19, cy = y * TS + Math.sin(a) * 12 + 4;
          if (rock && imgOk(rock)) ctx2.drawImage(rock, cx - 7, cy - 6, 14, 14 * (rock.naturalHeight / rock.naturalWidth));
          else { ctx2.fillStyle = "#C8B78E"; ctx2.beginPath(); ctx2.arc(cx, cy, 4, 0, 6.283); ctx2.fill(); }
        }
        // שלל גנוב מעל הראש (הספרייט כבר מחזיק גביש — מוסיפים זוהר וגודל לפי ערך)
        if (stolen) {
          const gy = y * TS - TS * 1.55 - 2 * Math.sin(ts / 110);
          glow(x * TS, gy, "#FFD152", 18 + 4 * vScale(carriedV), 0.5);
          if (!drawn) { const gemImg = IM ? IM.gem[carriedV >= 6 ? 4 : 3] : null; if (gemImg && imgOk(gemImg)) { const gs = TS * 0.8 * vScale(carriedV); ctx2.drawImage(gemImg, x * TS - gs / 2, gy - gs / 2, gs, gs * (gemImg.naturalHeight / gemImg.naturalWidth)); } }
        }
        if (rage) { ctx2.font = "15px sans-serif"; ctx2.textAlign = "center"; ctx2.fillText("🔥", x * TS + 16 * face, y * TS - TS * 1.1); }
        if (slow) {
          const bx = x * TS - 21 * face, by = y * TS - TS * 1.05 + 2 * Math.sin(ts / 200);
          ctx2.fillStyle = "rgba(16,13,10,.82)"; ctx2.beginPath(); ctx2.arc(bx, by - 6, 12, 0, 6.283); ctx2.fill();
          ctx2.strokeStyle = "#7FB8FF"; ctx2.lineWidth = 2; ctx2.stroke();
          ctx2.font = "16px sans-serif"; ctx2.textAlign = "center"; ctx2.fillStyle = "#fff"; ctx2.fillText("🐌", bx, by);
        }
        // שם + חתימות הבילד (אייקוני הקלפים מהגיליון)
        ctx2.font = `800 ${isMe ? 12 : 11}px Assistant, sans-serif`; ctx2.textAlign = "center";
        const nm = pname(pid), ny = y * TS + TS * 1.02;
        ctx2.fillStyle = "#000"; ctx2.fillText(nm, x * TS + 1, ny + 1);
        ctx2.fillStyle = isMe ? "#F3E7D3" : col; ctx2.fillText(nm, x * TS, ny);
        const cards = g.cards.get(pid) ?? [];
        if (cards.length) {
          const uniq = [...new Set(cards)].slice(-5);
          const sz = 15, tot = uniq.length * (sz + 2);
          uniq.forEach((cid, i) => {
            const c = thCard(cid); if (!c) return;
            const px = x * TS - tot / 2 + i * (sz + 2), py = ny + 5;
            if (hasCards && c.sheet !== undefined) ctx2.drawImage(cardsImg!, (c.sheet % 8) * 96, Math.floor(c.sheet / 8) * 96, 96, 96, px, py, sz, sz);
            else { ctx2.font = "11px sans-serif"; ctx2.fillText(c.ic, px + sz / 2, py + sz - 2); }
          });
        }
      };
      const carriedValue = (pid: string) => { for (const it of g.items.values()) if (it.state === "carried" && it.carrier === pid) return it.v; return 1; };
      const order = [...g.others.entries()].map(([pid, o]) => ({ pid, o })).sort((a, b) => a.o.y - b.o.y);
      let meDrawn = false;
      const meSt = { stun: stunned, bubble: nowP < m.bubbleUntil, ghost: nowP < m.ghostUntil, dash: dashing, grabAt: m.grabAt, hitAt: m.hitAt };
      const drawMe = () => drawPlayer(me, m.x, m.y, m.carry, m.stolen ? 1 : 0, raging ? 1 : 0, true, g.face, !!moving, carriedValue(me), slowed ? 1 : 0, meSt);
      for (const { pid, o } of order) {
        if (!meDrawn && m.y < o.y) { drawMe(); meDrawn = true; }
        drawPlayer(pid, o.x, o.y, o.carry, o.stolen, o.rage, false, o.face, Math.hypot(o.vx, o.vy) > 0.3 && !g.paused, carriedValue(pid), o.slow, { stun: nowP < o.stunUntil, bubble: nowP < o.bubbleUntil, ghost: nowP < o.ghostUntil, dash: nowP < o.dashUntil, grabAt: o.grabAt, hitAt: o.hitAt });
      }
      if (!meDrawn) drawMe();
      // ⛏️ קשת החציבה
      if (r > 0 && !m.stolen && m.carry < g.mods.carryCap && Math.hypot(m.x - g.mtn.x, m.y - g.mtn.y) <= r + 1.0 && !g.paused) {
        const u = Math.min(1, (performance.now() - g.mineAt) / g.mods.mineMs);
        ctx2.strokeStyle = "#F2C14E"; ctx2.lineWidth = 3; ctx2.globalAlpha = 0.85;
        ctx2.beginPath(); ctx2.arc(m.x * TS, m.y * TS, 17, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2); ctx2.stroke();
        ctx2.globalAlpha = 1;
      }

      for (const p of g.parts) { ctx2.globalAlpha = Math.max(0, p.l); ctx2.fillStyle = p.col; ctx2.fillRect(p.x * TS - 2, p.y * TS - 2, 4, 4); }
      ctx2.globalAlpha = 1;
      const nowT = performance.now();
      for (let i = g.fxs.length - 1; i >= 0; i--) {
        const f = g.fxs[i], u = (nowT - f.t) / f.life;
        if (u >= 1) { g.fxs.splice(i, 1); continue; }
        const a = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85, s = f.sz * (0.55 + f.grow * u), ar = f.img.naturalHeight / f.img.naturalWidth;
        ctx2.globalCompositeOperation = f.add ? "lighter" : "source-over"; ctx2.globalAlpha = Math.max(0, a);
        ctx2.save(); ctx2.translate(f.x * TS, f.y * TS); ctx2.rotate(f.rot); ctx2.drawImage(f.img, -s / 2, -s * ar / 2, s, s * ar); ctx2.restore();
      }
      ctx2.globalCompositeOperation = "source-over"; ctx2.globalAlpha = 1;
      // 🔦 לפיד — בריכת אור שנעה עם הדביבון שלי (הלילה סביב)
      glow(m.x * TS, m.y * TS - TS * 0.3, "#FFC86B", TS * 5.5, 0.11);
      ctx2.restore();

      // וינייטת לילה + אזעקה + הבזק
      const vg = ctx2.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.38)"); ctx2.fillStyle = vg; ctx2.fillRect(0, 0, W, H);
      if (g.alarm) { ctx2.fillStyle = `rgba(229,72,77,${0.06 + 0.05 * Math.sin(ts / 220)})`; ctx2.fillRect(0, 0, W, H); }
      if (g.paused && !g.over) { ctx2.fillStyle = "rgba(120,170,220,.10)"; ctx2.fillRect(0, 0, W, H); }
      if (g.flash > 0) { ctx2.globalAlpha = Math.min(0.5, g.flash * 1.6); ctx2.fillStyle = g.flashCol; ctx2.fillRect(0, 0, W, H); ctx2.globalAlpha = 1; }

      // 🧭 חץ אל הגנב שסוחב את הגביש שלי / 🔔 חץ אל מי שמתקרב לבית
      let thiefPid = "", thiefX = 0, thiefY = 0;
      for (const it of g.items.values()) {
        if (it.state === "carried" && it.den === me && it.carrier !== me) { thiefPid = it.carrier; const o = g.others.get(it.carrier); if (o) { thiefX = o.x; thiefY = o.y; } }
      }
      if (!thiefPid && g.warn) { const o = g.others.get(g.warn.pid); if (o) { thiefPid = g.warn.pid; thiefX = o.x; thiefY = o.y; } }
      if (thiefPid) {
        const tdx = thiefX * TS - m.x * TS, tdy = thiefY * TS - m.y * TS;
        ctx2.save(); ctx2.translate(W / 2, 138); ctx2.rotate(Math.atan2(tdy, tdx));
        ctx2.globalAlpha = 0.65 + 0.35 * Math.sin(ts / 100);
        ctx2.fillStyle = pcol(thiefPid); ctx2.strokeStyle = "#000"; ctx2.lineWidth = 2;
        ctx2.beginPath(); ctx2.moveTo(18, 0); ctx2.lineTo(-10, -10); ctx2.lineTo(-5, 0); ctx2.lineTo(-10, 10); ctx2.closePath();
        ctx2.fill(); ctx2.stroke(); ctx2.restore(); ctx2.globalAlpha = 1;
        ctx2.font = "800 12px Assistant, sans-serif"; ctx2.textAlign = "center";
        ctx2.fillStyle = "#F3E7D3"; ctx2.fillText(g.warn && !g.items.size ? `🔔 ${pname(thiefPid)} מתקרב!` : `🏃 ${pname(thiefPid)} ${g.warn ? "מתקרב לבית!" : "עם הגביש שלך!"}`, W / 2, 118);
        const hisDen = g.dens.get(thiefPid);
        if (hisDen && audio.current.ctx && !g.warn && !g.paused) {
          const dHome = Math.hypot(thiefX - hisDen.x, thiefY - hisDen.y);
          const iv2 = Math.max(180, Math.min(1100, dHome * 70));
          if (ts - g.beepAt > iv2) { g.beepAt = ts; tone(740, 0.05, "square", 0.14); }
        }
      }

      // 🗺️ מיני-מפה (כבויה ב"חושך")
      const MW = 132, MH = Math.round(MW * (g.h / g.w)), MX = W - MW - 10, MY = 104;
      ctx2.fillStyle = "rgba(16,13,10,.86)"; ctx2.fillRect(MX, MY, MW, MH);
      ctx2.strokeStyle = "#3A2E22"; ctx2.lineWidth = 2; ctx2.strokeRect(MX, MY, MW, MH);
      if (nowP < g.darkUntil) {
        ctx2.font = "800 13px Assistant, sans-serif"; ctx2.textAlign = "center"; ctx2.fillStyle = "#8B7D6B"; ctx2.fillText("🌙 חושך", MX + MW / 2, MY + MH / 2 + 5);
      } else {
        const mx2 = (x: number) => MX + (x / g.w) * MW, my2 = (y: number) => MY + (y / g.h) * MH;
        if (r > 0) { ctx2.fillStyle = "#57524C"; ctx2.beginPath(); ctx2.arc(mx2(g.mtn.x), my2(g.mtn.y), (r / g.w) * MW, 0, 6.283); ctx2.fill(); }
        for (const [pid, den] of g.dens.entries()) {
          const col = pcol(pid);
          const pos2 = pid === me ? m : g.others.get(pid);
          if (pos2) { ctx2.strokeStyle = col; ctx2.globalAlpha = 0.55; ctx2.lineWidth = 1; ctx2.beginPath(); ctx2.moveTo(mx2(pos2.x), my2(pos2.y)); ctx2.lineTo(mx2(den.x), my2(den.y)); ctx2.stroke(); ctx2.globalAlpha = 1; }
          ctx2.fillStyle = col; ctx2.fillRect(mx2(den.x) - 2.5, my2(den.y) - 2.5, 5, 5);
          const twm = g.towers.get(pid);
          if (twm && twm.st !== "ok") { ctx2.fillStyle = twm.st === "hot" ? "#FF5A3C" : "#9AA4B2"; ctx2.beginPath(); ctx2.arc(mx2(den.x) + 4.5, my2(den.y) - 4.5, 2.2, 0, 6.283); ctx2.fill(); }
        }
        for (const [pid, o] of g.others.entries()) {
          ctx2.fillStyle = pcol(pid);
          ctx2.beginPath(); ctx2.arc(mx2(o.x), my2(o.y), o.stolen ? 3.6 : 2.3, 0, 6.283); ctx2.fill();
          if (o.stolen) { ctx2.strokeStyle = "#fff"; ctx2.lineWidth = 1; ctx2.stroke(); }
        }
        ctx2.fillStyle = "#F3E7D3"; ctx2.beginPath(); ctx2.arc(mx2(m.x), my2(m.y), 3, 0, 6.283); ctx2.fill();
      }

      if (joy.current.on && !g.paused) {
        ctx2.strokeStyle = "rgba(243,231,211,.35)"; ctx2.lineWidth = 3;
        ctx2.beginPath(); ctx2.arc(joy.current.ox, joy.current.oy, 46, 0, 6.283); ctx2.stroke();
        ctx2.fillStyle = "rgba(255,138,61,.85)";
        ctx2.beginPath(); ctx2.arc(joy.current.ox + joy.current.dx * 46, joy.current.oy + joy.current.dy * 46, 20, 0, 6.283); ctx2.fill();
      }

      if (ts - stealChk > 60) {
        stealChk = ts;
        let steal = false;
        if (g.go && !g.over && !g.paused && !m.stolen) {
          for (const [pid, den] of g.dens.entries()) {
            if (pid === me) continue;
            if (Math.hypot(m.x - den.x, m.y - den.y) <= DEN_R && (byDen.get(pid)?.length ?? 0) > 0) steal = true;
          }
        }
        if (steal) g.stealOkAt = ts;
        steal = steal || (!m.stolen && !g.paused && ts - g.stealOkAt < STEAL_HOLD);
        setActs((c) => (c.steal === steal ? c : { steal }));
      }
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [me, conn]);

  const mins = Math.floor(hud.left / 60), secs = String(hud.left % 60).padStart(2, "0");
  const myBtns = thButtons(myCards);
  const sNowUi = conn.serverNow();
  void tickUi;

  return (
    <div style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh", zIndex: 60, background: "#100D0A", overflow: "hidden", touchAction: "none", direction: "rtl" }}>
      <canvas ref={cvRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />

      {/* שעון + הר + טבעת "עד העצירה" */}
      <div style={{
        position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 10px)", left: "50%", transform: "translateX(-50%)",
        background: hud.alarm ? "rgba(120,20,20,.92)" : "rgba(16,13,10,.85)", border: `2px solid ${hud.alarm ? "#E5484D" : "#3A2E22"}`,
        borderRadius: 14, padding: "5px 14px", color: "#F3E7D3", fontWeight: 800, fontFamily: "Assistant, sans-serif",
        fontSize: 15, display: "flex", gap: 12, alignItems: "center", whiteSpace: "nowrap",
      }}>
        <span>{hud.alarm ? "🚨" : "⏱"} {mins}:{secs}</span>
        <span style={{ opacity: 0.85 }}>{hud.empty ? "⚔️ מלחמה" : `⛰️ ${hud.mtnPct}%`}</span>
        {!hud.alarm && <span className="th-next" style={{ "--p": `${Math.round(hud.nextP * 360)}deg` } as CSSProperties} title="עד העצירה" />}
      </div>

      {/* הזהב שלי + פס הבילד */}
      <div style={{
        position: "absolute", bottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)", right: 14,
        background: "rgba(16,13,10,.85)", border: "2px solid #3A2E22", borderRadius: 14, padding: "6px 14px",
        color: "#F2C14E", fontWeight: 800, fontFamily: "Assistant, sans-serif", fontSize: 20,
      }}>
        💰 {hud.gold.toLocaleString()}
        {hud.carry > 0 && <span style={{ fontSize: 13, color: "#C8B78E", marginRight: 8 }}>+{hud.carry} ביד</span>}
        {hud.rage && <span style={{ fontSize: 13, color: "#FF6B5E", marginRight: 8 }}>🔥 זעם!</span>}
        {hud.tower !== "ok" && (
          <div style={{ fontSize: 12, color: "#E8D9BC", marginTop: 2, whiteSpace: "nowrap" }}>
            {hud.tower === "hot" ? `🔥 המגדל מתקרר ${hud.towerLeft}` : `💤 המגדל כבוי ${hud.towerLeft}`}
          </div>
        )}
        {myCards.length > 0 && (
          <div className="th-build">{[...new Set(myCards)].map((id) => { const c = thCard(id); const n = myCards.filter((x) => x === id).length; return c ? <i key={id} title={c.t}>{c.ic}{n > 1 ? `×${n}` : ""}</i> : null; })}</div>
        )}
      </div>

      {/* 🔘 כפתורי היכולות — מעל "לגנוב!" */}
      {myBtns.length > 0 && (
        <div className="th-btns">
          {myBtns.map((id) => {
            const c = thCard(id)!; const ready = (cds[id] ?? 0) <= sNowUi; const cdTot = c.cd ?? 1;
            const p = ready ? 360 : Math.round(360 * (1 - Math.max(0, cds[id] - sNowUi) / cdTot));
            return (
              <button key={id} className={"th-btn" + (ready && !pause ? "" : " cd")} style={{ "--p": `${p}deg` } as CSSProperties} aria-label={c.t}
                onPointerDown={(e) => { e.preventDefault(); aInit(); if (ready && !pause) conn.sendGame({ a: "th_use", id } as never); }}
                onClick={(e) => e.preventDefault()}>
                <span>{c.ic}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* פיד */}
      <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 198px)", right: 10, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", pointerEvents: "none" }}>
        {feed.map((f) => (
          <div key={f.id} style={{ background: "rgba(16,13,10,.78)", border: "1.5px solid #3A2E22", borderRadius: 10, padding: "3px 10px", color: "#E8D9BC", fontWeight: 700, fontFamily: "Assistant, sans-serif", fontSize: 12 }}>{f.tx}</div>
        ))}
      </div>

      {/* כפתור הגניבה */}
      {acts.steal && !pause && (
        <button
          onPointerDown={(e) => { e.preventDefault(); aInit(); conn.sendGame({ a: "th_steal" }); }}
          onClick={(e) => e.preventDefault()}
          style={{
            position: "absolute", bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)", left: 18,
            width: 96, height: 96, borderRadius: "50%", border: "none", padding: 0,
            background: `#7A3CC8 url(${TH_IMG.btn}) center / 100% 100% no-repeat`, color: "#fff", fontFamily: "Assistant, sans-serif",
            boxShadow: "0 0 26px rgba(160,90,255,.65)", zIndex: 5, touchAction: "manipulation",
          }}>
          <span style={{ position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%) rotate(-3deg)", background: "#F3E7D3", color: "#1B1510", borderRadius: 10, padding: "1px 9px", fontSize: 13, fontWeight: 900, border: "2px solid #1B1510", boxShadow: "2px 2px 0 rgba(226,63,60,.85)", whiteSpace: "nowrap" }}>🥷 לגנוב!</span>
        </button>
      )}

      {toast && !stalled && (
        <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 54px)", left: "50%", transform: "translateX(-50%)", background: "rgba(16,13,10,.92)", border: "2px solid #3A2E22", borderRadius: 14, padding: "8px 18px", color: "#F3E7D3", fontWeight: 800, fontFamily: "Assistant, sans-serif", fontSize: 16, whiteSpace: "nowrap", zIndex: 6 }}>{toast}</div>
      )}
      {stalled && (
        <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 54px)", left: "50%", transform: "translateX(-50%)", background: "rgba(120,20,20,.92)", border: "2px solid #E5484D", borderRadius: 14, padding: "8px 16px", color: "#F3E7D3", fontWeight: 800, fontFamily: "Assistant, sans-serif", fontSize: 14, whiteSpace: "nowrap", zIndex: 8, pointerEvents: "none" }}>🔌 החיבור נפל — מתחבר מחדש…</div>
      )}
      {countdown > 0 && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", zIndex: 7 }}>
          <div key={countdown} className="popin" style={{ textAlign: "center", fontFamily: "Assistant, sans-serif", color: "#F3E7D3" }}>
            <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 1, textShadow: "5px 5px 0 rgba(226,63,60,.85)" }}>{countdown}</div>
            <div style={{ fontSize: 16, fontWeight: 700, opacity: 0.85, marginTop: 8 }}>🥷 מתכוננים…</div>
          </div>
        </div>
      )}
      {banner && !pause && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", zIndex: 7 }}>
          <div style={{ background: "rgba(16,13,10,.94)", border: "3px solid #F2C14E", borderRadius: 20, padding: "18px 30px", textAlign: "center", color: "#F3E7D3", fontFamily: "Assistant, sans-serif", transform: "rotate(-1.3deg)", boxShadow: "5px 5px 0 rgba(226,63,60,.85)" }}>
            <div style={{ fontSize: 40 }}>{banner.ic}</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{banner.t}</div>
            <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>{banner.s}</div>
          </div>
        </div>
      )}

      {/* ⏸ מסך העצירה */}
      {pause && (
        <PauseScreen ui={pause} me={me} gold={hud.gold} players={room.players} pcol={pcol} conn={conn} sNow={sNowUi}
          onSelect={(id) => setPause((p) => (p && !p.bought ? { ...p, sel: p.sel === id ? null : id, skip: false } : p))}
          onBuy={(id) => { aInit(); conn.sendGame({ a: "th_buy", id } as never); }}
          onSkip={() => setPause((p) => (p ? { ...p, skip: !p.skip, sel: null } : p))} />
      )}
    </div>
  );
}

/** מסך העצירה: הקפאה (דירוג) → המדף (4 קלפים במחיר) → החשיפה ("מי לקח מה") */
function PauseScreen({ ui, me, gold, players, pcol, conn, sNow, onSelect, onBuy, onSkip }: {
  ui: PauseUi; me: string; gold: number; players: { id: string; name: string }[]; pcol: (pid: string) => string;
  conn: GameViewProps["conn"]; sNow: number; onSelect: (id: string) => void; onBuy: (id: string) => void; onSkip: () => void;
}) {
  const [, force] = useState(0);
  useEffect(() => { const iv = setInterval(() => force((v) => v + 1), 250); return () => clearInterval(iv); }, []);
  void conn;
  const name = (pid: string) => players.find((p) => p.id === pid)?.name ?? "?";
  const phaseEnd = ui.phase === "freeze" ? ui.draftAt : ui.phase === "draft" ? ui.revealAt : ui.resumeAt;
  const phaseStart = ui.phase === "freeze" ? ui.draftAt - TH_TIMING.freezeMs : ui.phase === "draft" ? ui.draftAt : ui.revealAt;
  const leftMs = Math.max(0, phaseEnd - sNow), tot = Math.max(1, phaseEnd - phaseStart);
  const secs = Math.ceil(leftMs / 1000), deg = Math.round(360 * (leftMs / tot));
  const sheetUrl = TH_IMG.cards;
  return (
    <div className="th-pause">
      <div className="head">
        <div className={"ring" + (ui.phase === "draft" && secs <= 3 ? " hot" : "")} style={{ "--p": `${deg}deg` } as CSSProperties}><span>{secs}</span></div>
        <h2>{ui.phase === "freeze" ? `🧊 עצירה ${ui.k}!` : ui.phase === "draft" ? "🛒 קונים שדרוג?" : "👁️ מי לקח מה"}</h2>
      </div>
      {ui.phase === "freeze" && (
        <>
          <p className="sub">כולם קפואים · דירוג הדקה</p>
          <div className="th-rank">
            {ui.rank.map((pid, i) => (
              <div key={pid} className={"row" + (pid === me ? " me" : "")} style={{ "--c": pcol(pid) } as CSSProperties}>
                <span style={{ width: 18, fontVariantNumeric: "tabular-nums", color: "#C8B78E" }}>{i + 1}</span>
                {racIcon(pcol(pid)) ? <img src={racIcon(pcol(pid))} alt="" /> : <span style={{ width: 34, height: 34, borderRadius: "50%", background: pcol(pid), display: "inline-block" }} />}
                <span className="nm">{name(pid)}</span>
                <span className="g">💰 {(ui.gold[pid] ?? 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {ui.phase === "draft" && (
        <>
          <p className="sub">יש לך <span className="th-gold">💰 {gold.toLocaleString()}</span> · המחיר יורד מהניקוד{ui.discount ? " · 🏷️ הנחת מרדף 50%" : ""}</p>
          <div className="th-shelf">
            {ui.shelf.map((sc) => {
              const c = thCard(sc.id); if (!c) return null;
              const poor = sc.price > gold, locked = ui.bought === sc.id, sel = ui.sel === sc.id;
              const cls = "th-card" + (locked ? " locked" : sel ? " sel" : "") + (ui.bought && !locked ? " dim" : "") + (poor && !locked ? " poor" : "");
              return (
                <button key={sc.id} className={cls} style={{ "--rc": RAR_COL[c.rarity], "--sheet": `url(${sheetUrl})` } as CSSProperties} disabled={!!ui.bought}
                  onClick={() => { if (ui.bought) return; if (poor) return; if (sel) onBuy(sc.id); else onSelect(sc.id); }}>
                  <span className="tr">{c.evo ? "⭐ אבולוציה" : TRACK_TX[c.track]}</span>
                  <span className="ic" style={c.sheet !== undefined ? { backgroundPosition: `${(c.sheet % 8) * (100 / 7)}% ${Math.floor(c.sheet / 8) * (100 / 3)}%` } : undefined}>{c.sheet === undefined ? c.ic : ""}</span>
                  <b>{c.t}</b>
                  <small>{c.d}</small>
                  <span className={"pr" + (sc.price === 0 ? " free" : poor ? " no" : "")}>{sc.price === 0 ? "🎁 חינם" : `💰 ${sc.price}`}</span>
                </button>
              );
            })}
          </div>
          <p className="sub">{ui.bought ? `✓ קנית ${thCard(ui.bought)?.t ?? ""} — מחכים לכולם` : ui.sel ? "טאפ שוב לקנייה" : "טאפ לבחירה · טאפ שוב לקנייה"}</p>
          {!ui.bought && <button className={"th-skip" + (ui.skip ? " on" : "")} onClick={onSkip}>{ui.skip ? "🐿️ אוגר — לא קונה הפעם" : "לא קונה הפעם"}</button>}
        </>
      )}
      {ui.phase === "reveal" && (
        <>
          <div className="th-reveal">
            {(ui.rank.length ? ui.rank : players.map((p) => p.id)).map((pid, i) => {
              const pick = ui.picks[pid] ?? null; const c = pick ? thCard(pick) : null;
              return (
                <div key={pid} className="p" style={{ "--c": pcol(pid), animationDelay: `${i * 60}ms` } as CSSProperties}>
                  {racIcon(pcol(pid)) ? <img className="face" src={racIcon(pcol(pid))} alt="" /> : <span className="face" style={{ width: 52, height: 52, borderRadius: "50%", background: pcol(pid), display: "inline-block" }} />}
                  <span className={"pick" + (c ? "" : " none")} style={c && c.sheet !== undefined ? { "--sheet": `url(${sheetUrl})`, "--pos": `${(c.sheet % 8) * (100 / 7)}% ${Math.floor(c.sheet / 8) * (100 / 3)}%` } as CSSProperties : undefined}>{c ? (c.sheet === undefined ? c.ic : "") : "🐿️"}</span>
                  <span>{name(pid)}</span>
                </div>
              );
            })}
          </div>
          <p className="sub">{ui.picks[me] ? `לקחת ${thCard(ui.picks[me]!)?.t}` : "אגרת — הזהב נשאר ניקוד"} · ממשיכים בעוד {secs}</p>
        </>
      )}
    </div>
  );
}

function burst(x: number, y: number, col: string, n: number) {
  const out: { x: number; y: number; vx: number; vy: number; l: number; col: string }[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, s = 1 + Math.random() * 3;
    out.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, l: 0.4 + Math.random() * 0.35, col });
  }
  return out;
}
void TH_CARDS;
