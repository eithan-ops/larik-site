/**
 * "הגנבים" 🥷 — צד לקוח, גרייבוקס הליבה.
 *
 * מסך = חלון אישי על שדה אחד: הר במרכז, מאורה לכל שחקן בקצוות, והחוט —
 * הקו שמחבר אותך הביתה ומראה בכל רגע כמה אתה חשוף. התנועה שלך מנובאת
 * מקומית (אותה נוסחה כמו בשרת), הפרשים נמרחים — כמו בחופרים.
 * גרייבוקס: צורות וצבעים בלבד, אפס נכסים; הסאונד מסונתז.
 *
 * סבב הזרימה (2.9):
 *  · הניבוי משתמש בקלט ששלחנו לשרת (לא בקלט שנשאר בלקוח), והפיוס משווה את מיקום השרת
 *    למקום שבו *היינו* באותו זמן-שרת (היסטוריה) — אפס "גומייה", ואפשר לתקן גם סטיות קטנות.
 *  · האחרים נחזים קדימה לפי הווקטור שהשרת שולח — במקום להיגרר ~150ms מאחור.
 *  · ג'ויסטיק לפי מזהה מגע: אגודל שני על "לגנוב!" לא עוצר את הריצה.
 *  · הרגעים המשותפים (צאו/מלחמה/ההר נגמר/אזעקה/צפירה) מגיעים כ-cue — כל הטלפונים יחד.
 *  · זוהר בספרייטים מוכנים במקום shadowBlur לכל פריים — הרנדור זול פי כמה בטלפון.
 *
 * נכסים (2.9): דביבונים גנבים ב-8 צבעים, 8 מאורות (מדבקות ניטרליות + שטיפת צבע השחקן), הר ב-4 מצבים,
 * אבנים ב-5 דרגות, אפקטים (POW/ניצוץ/אבק/טבעת) — כולם WEBP קטנים מ-public/thieves; בלי קובץ — הצורות נשארות.
 * סאונד "צעצוע השוד": דגימות MP3 מסונתזות (thievesAssets.ts); הסינתזה הישנה נשארת כגיבוי עד שהן נטענות.
 *
 * 🗼 שכבה 2/א (3.9) — המגדל: ליד כל מאורה מגדל ב-5 מצבים (פעיל/מתחמם/כבוי/חורבה/בבנייה). הטווח והשטח המת
 * של המגדל *שלי* תמיד על המסך; של אחרים — טבעת אדומה חלשה רק כשאני בתוך הטווח (שלב B יוסיף סורק).
 * החלוקים מונפשים לפי th_shot (הלקוח מציג, השרת מכריע), הפגיעה מאיטה — אותה נוסחה בניבוי. עמודת כפתורים
 * קונטקסטואלית: לגנוב · להשבית/להרוס ליד מגדל זר · לבנות מחדש בבית. ערוץ פעולה = טבעת התקדמות על השחקן
 * ופס במיני-מפה אצל כולם.
 */
import { useEffect, useRef, useState } from "react";
import type { ThievesServerMsg, ThTowerSt } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { loadImages, ready as imgOk, tinted, ThSfx, TH_IMG } from "./thievesAssets";
import type { ThImages } from "./thievesAssets";

const TS = 30;                     // פיקסלים לתא
const SPD = 6.0;                   // חייב להיות זהה לשרת
const CARRY_SLOW = 0.05;
const STOLEN_SLOW = 0.74;
const RAGE_MUL = 1.4;
const SLOW_MUL = 0.7;              // פגיעת מגדל — זהה לשרת
const DEN_R = 2.0;
const ACT_R = DEN_R + 0.9;         // מרחק פעולה על מגדל זר — זהה לשרת
const PCOL = ["#FF8A3D", "#5AC8FA", "#46E0C0", "#F2C14E", "#E5484D", "#B37BE0", "#8ee34a", "#FF6FB5"];
const LVL_SIZE = [6, 9, 12];       // גודל הגביש לפי דרגת הבשלה
const RATE = [0.2, 0.6, 1.2];      // זהה לשרת (÷5) — לזוהר העושר של המאורה
const HIST_MS = 1500;              // כמה היסטוריית מיקומים שומרים לפיוס
const STEAL_HOLD = 450;            // הכפתור לא נעלם באותה מילישנייה שיצאת מהרדיוס

interface Other { x: number; y: number; tx: number; ty: number; vx: number; vy: number; st: number; carry: number; stolen: number; rage: number; slow: number; gold: number; face: number }
interface TowerC { st: ThTowerSt; until: number; since: number; aim: number }   // until=שעון-שרת · since=performance.now של המעבר · aim=לאן הקנה מכוון
interface Shot { den: string; x0: number; y0: number; x1: number; y1: number; t0: number; ms: number }
interface Chan { den: string; kind: "disable" | "destroy"; t0: number; ms: number; cost: number }
type Acts = { steal: boolean; disable: boolean; destroy: boolean; rebuild: boolean; chan: boolean };
const NO_ACTS: Acts = { steal: false, disable: false, destroy: false, rebuild: false, chan: false };
/** המגדל עומד ליד המאורה, בצד שפונה להר — אותו היסט בשרת */
const towerPos = (den: { x: number; y: number }, mtn: { x: number }) => { const side = Math.sign(mtn.x - den.x) || 1; return { x: den.x + 2.1 * side, y: den.y - 0.5 }; };
interface Fx { img: HTMLImageElement; x: number; y: number; t: number; life: number; sz: number; rot: number; add: boolean; grow: number }
interface CItem { lvl: number; v: number; state: "den" | "carried" | "ground"; den: string; carrier: string; gx: number; gy: number; pulse: number }
const MINE_MS = 2500;              // חייב להיות זהה לשרת — לקשת ההתקדמות של החציבה
const vScale = (v: number) => 0.75 + 0.3 * Math.sqrt(Math.max(1, v));   // אבן שווה יותר — גדולה יותר
interface Pop { x: number; y: number; t: string; col: string; l: number; sz: number }

/* ---- זוהר מוכן מראש: radial gradient על קנבס קטן, פעם אחת לצבע+רדיוס — במקום shadowBlur בכל פריים ---- */
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
  const [hud, setHud] = useState({ gold: 0, carry: 0, left: 0, mtnPct: 100, stolen: false, rage: false, alarm: false, empty: false, tower: "ok" as ThTowerSt, towerLeft: 0 });
  const [banner, setBanner] = useState<{ ic: string; t: string; s: string } | null>(null);
  const [toast, setToast] = useState("");
  const [feed, setFeed] = useState<{ id: number; tx: string }[]>([]);
  const [acts, setActs] = useState<Acts>(NO_ACTS);
  const [countdown, setCountdown] = useState(0);
  const [stalled, setStalled] = useState(false);
  const feedId = useRef(1);

  const G = useRef({
    ready: false, w: 46, h: 30,
    mtn: { x: 23, y: 15, total: 1, left: 1 },
    dens: new Map<string, { x: number; y: number; back: number }>(),
    tower: { r: 5.5, arc: Math.PI / 3, disable: 250, destroy: 750 },
    towers: new Map<string, TowerC>(),
    shots: [] as Shot[],
    chans: new Map<string, Chan>(),
    me: { x: 5, y: 5, carry: 0, stolen: 0, rageUntil: 0, slowUntil: 0, gold: 0 },
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
    shake: 0, flash: 0, flashCol: "#fff", stop: 0,
    left: 0, goAt: 0, endsAt: 0, go: false, alarm: false, empty: false,
    beepAt: 0, hudAt: 0, stealOkAt: 0, mineAt: 0, face: 1,
    lastPosAt: 0, kickAt: 0, stalled: false, over: false,
    fxs: [] as Fx[],
    players: [] as { id: string; name: string }[],
  });
  const IMGS = useRef<ThImages | null>(null);
  const SFX = useRef<ThSfx | null>(null);
  if (!SFX.current) SFX.current = new ThSfx();
  /** אפקט-מדבקה במיקום עולם: POW / ניצוץ / אבק / טבעת — מצוירים בשכבה מעל השחקנים */
  const fx = (kind: "pow" | "sparkle" | "dust" | "ring", x: number, y: number, sz = 2, life = 420, add = true, grow = 0.5) => {
    const im = IMGS.current?.fx[kind]; if (!im || !imgOk(im)) return;
    G.current.fxs.push({ img: im, x, y, t: performance.now(), life, sz: sz * TS, rot: (Math.random() - 0.5) * 0.6, add, grow });
  };
  const pidx = (pid: string) => Math.max(0, G.current.players.findIndex((p) => p.id === pid));
  // חלון QA (כמו __wlDbg בחומה): מצב הלקוח לבדיקות אוטומטיות — לא בשימוש במשחק עצמו
  useEffect(() => { const w = window as unknown as { __thDbg?: unknown; __thSfx?: unknown }; w.__thDbg = G.current; w.__thSfx = SFX.current; }, []);

  const pcol = (pid: string) => PCOL[Math.max(0, G.current.players.findIndex((p) => p.id === pid)) % PCOL.length];
  const pname = (pid: string) => G.current.players.find((p) => p.id === pid)?.name ?? "מישהו";

  /* ---- סאונד מסונתז — אפס נכסים ---- */
  const audio = useRef<{ ctx: AudioContext | null; note: number; noteT: number }>({ ctx: null, note: 0, noteT: 0 });
  function aInit() {
    const ex = audio.current.ctx;
    if (ex) { if (ex.state === "suspended") ex.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audio.current.ctx = new AC();
      SFX.current!.attach(audio.current.ctx);       // הדגימות נטענות ומפוענחות ברקע; מתנגנות אחרי המגע הראשון
    } catch { /* בלי אודיו */ }
  }
  // הנכסים נטענים ברגע שהמסך עולה (עוד לפני "צאו!") — הקונטקסט נוצר מושהה ומשתחרר במגע הראשון
  useEffect(() => { IMGS.current = loadImages(); aInit(); return () => { SFX.current?.stopMusic(0.2); }; }, []);
  /** דגימה קודם; אם עוד לא נטענה — הסינתזה הישנה */
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
  function pentaTone(vol = 0.3) {          // המאורה שלך שרה — כל הפקדה/הבשלה היא הצליל הבא בסולם (מרימבה, גובה לפי הסולם)
    const a = audio.current, now = performance.now() / 1000;
    if (now - a.noteT > 3.2) a.note = 0; else a.note++;
    a.noteT = now;
    const semi = PENT[Math.min(a.note, PENT.length - 1)];
    if (!sfx("note", { rate: Math.pow(2, semi / 12), gain: vol / 0.3 })) tone(392 * Math.pow(2, semi / 12), 0.16, "triangle", vol);
  }
  const bell = () => { if (!sfx("bell")) { tone(880, 0.5, "triangle", 0.28); tone(1320, 0.4, "sine", 0.14); } };     // 🔔 פעמון ההבשלה
  const alarmSiren = () => { if (!sfx("siren")) { tone(520, 0.28, "square", 0.22, 700); tone(700, 0.28, "square", 0.2, 520); } };
  const goSound = () => { if (!sfx("whistle")) { tone(523, 0.09, "square", 0.22); setTimeout(() => tone(659, 0.09, "square", 0.22), 100); setTimeout(() => tone(784, 0.22, "square", 0.26), 200); } };
  const horn = () => { if (!sfx("horn")) { tone(330, 0.9, "sawtooth", 0.26, 262); tone(415, 0.9, "sawtooth", 0.18, 330); setTimeout(() => tone(262, 0.5, "sawtooth", 0.2, 220), 500); } };
  /** 🗼 צלילי המגדל — עוצמה לפי המרחק ממני (מגדל בקצה השני של המפה נשמע רחוק) */
  const nearGain = (x: number, y: number) => Math.max(0, 1 - Math.hypot(x - G.current.me.x, y - G.current.me.y) / 16);
  const shotSnd = (x: number, y: number) => { const gn = nearGain(x, y); if (gn <= 0.05) return; if (!sfx("shot", { gain: gn, rate: 0.94 + Math.random() * 0.12 })) tone(900, 0.05, "square", 0.1 * gn, 300); };
  const thudSnd = (x: number, y: number, mine: boolean) => { const gn = mine ? 1 : nearGain(x, y) * 0.7; if (gn <= 0.05) return; if (!sfx("thud", { gain: gn })) tone(120, 0.12, "sine", 0.25 * gn, 60); };
  const zapSnd = () => { if (!sfx("zap")) tone(1200, 0.18, "sawtooth", 0.2, 200); };
  const crumbleSnd = () => { if (!sfx("crumble")) tone(90, 0.5, "sawtooth", 0.22, 40); };
  const hammerSnd = () => { for (let i = 0; i < 3; i++) if (!sfx("hammer", { delay: i * 0.85, rate: 0.96 + i * 0.05 })) setTimeout(() => tone(700, 0.06, "square", 0.2), i * 850); };
  const heatSnd = () => { if (!sfx("heat")) tone(200, 0.3, "sawtooth", 0.1, 100); };
  const KIND_TX = { disable: "להשבית", destroy: "להרוס" } as const;

  function addFeed(tx: string) {
    setFeed((f) => [...f.slice(-2), { id: feedId.current++, tx }]);
  }

  /* ---- הודעות מהשרת ---- */
  useEffect(() => {
    const g = G.current;
    return hub.subscribe((raw) => {
      const d = raw as ThievesServerMsg;
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
          const mine = g.dens.get(me);
          if (mine && !g.ready) { g.me.x = mine.x; g.me.y = mine.y; g.cam.x = mine.x * TS; g.cam.y = mine.y * TS; }
          g.goAt = d.goAt; g.endsAt = d.endsAt; g.ready = true; g.lastPosAt = performance.now();
          if (conn.serverNow() >= d.goAt) g.go = true;   // חזרנו באמצע — אין ספירה לאחור
          break;
        }
        case "th_sync": {
          g.mtn.left = d.mtn;
          g.items.clear();
          for (const [id, den, lvl, , v] of d.items) g.items.set(id, { lvl, v: v ?? 1, state: "den", den, carrier: "", gx: 0, gy: 0, pulse: 0 });
          for (const [id, x, y, lvl, v] of d.ground) g.items.set(id, { lvl, v: v ?? 1, state: "ground", den: "", carrier: "", gx: x, gy: y, pulse: 0 });
          for (const [id, carrier, lvl, v] of d.carried) g.items.set(id, { lvl, v: v ?? 1, state: "carried", den: "", carrier, gx: 0, gy: 0, pulse: 0 });
          if ([...g.items.values()].some((it) => it.state === "carried" && it.carrier === me)) g.me.stolen = 1;
          for (const [den, st, until] of d.towers ?? []) { const tw = g.towers.get(den); if (tw) { tw.st = st; tw.until = until; tw.since = performance.now(); } }
          g.chans.clear();
          g.endsAt = d.endsAt;
          break;
        }
        /* ---- 🗼 המגדל ---- */
        case "th_tower": {
          const tw = g.towers.get(d.den) ?? { st: "ok" as ThTowerSt, until: 0, since: 0, aim: 0 };
          const prev = tw.st;
          tw.st = d.st; tw.until = d.until ?? 0; tw.since = performance.now(); g.towers.set(d.den, tw);
          const den = g.dens.get(d.den);
          if (den) {
            const tp = towerPos(den, g.mtn);
            if (d.st === "hot") { fx("dust", tp.x, tp.y - 1.2, 2.2, 700, false, 0.9); if (d.den === me) heatSnd(); }
            if (d.st === "off") { fx("sparkle", tp.x, tp.y - 0.6, 2.4, 500); }
            if (d.st === "ruin") { g.parts.push(...burst(tp.x, tp.y, "#8B7D6B", 14)); fx("dust", tp.x, tp.y, 3.2, 800, false, 0.8); }
            if (d.st === "ok" && prev !== "ok") fx("ring", tp.x, tp.y - 0.4, 2.4, 500, true, 1.2);
          }
          if (d.den === me) {
            if (d.st === "hot") setToast("🔥 המגדל שלך התחמם — 4 שניות קירור");
            else if (d.st === "off") { g.shake = Math.max(g.shake, 8); setToast(`⚡ ${pname(d.by ?? "")} השבית לך את המגדל ל-15 שניות!`); }
            else if (d.st === "ruin") { g.shake = Math.max(g.shake, 12); g.flash = 0.18; g.flashCol = "#E5484D"; setToast(`💥 ${pname(d.by ?? "")} הרס לך את המגדל! חזור הביתה לבנות`); }
            else if (d.st === "build") setToast("🔨 בונים מחדש… 3 שניות");
            else if (d.st === "ok" && (prev === "off" || prev === "ruin" || prev === "build")) setToast("🗼 המגדל שלך חזר לפעול!");
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
            g.me.slowUntil = performance.now() + d.ms; g.shake = Math.max(g.shake, 7); thudSnd(d.x, d.y, true);
            // ההדף הוא הכרעת שרת — מיישרים מיד (הפיוס הרגיל היה מורח את זה על חצי שנייה)
            g.corr.x += d.x - g.me.x; g.corr.y += d.y - g.me.y;
            setToast("🐌 חלוק מהמגדל! איטי 2 שניות");
          } else {
            const o = g.others.get(d.pid); if (o) o.slow = 1;
            thudSnd(d.x, d.y, false);
          }
          break;
        }
        case "th_channel": {
          g.chans.set(d.by, { den: d.den, kind: d.kind, t0: performance.now(), ms: d.ms, cost: d.cost });
          if (d.by === me) setToast(d.kind === "disable" ? "🔧 עמוד במקום… משבית!" : "💥 עמוד במקום — 3 שניות תחת אש!");
          else if (d.den === me) {
            g.shake = Math.max(g.shake, 10); g.flash = 0.16; g.flashCol = "#E5484D";
            sfx("chirp", { rate: 0.78 + 0.07 * (pidx(d.by) % 8) }); sfx("chirp", { rate: 0.78 + 0.07 * (pidx(d.by) % 8), delay: 0.35 });
            setToast(`😱 ${pname(d.by)} ${d.kind === "disable" ? "משבית" : "מנסה להרוס"} לך את המגדל! רוץ הביתה!`);
          }
          if (d.by !== me) addFeed(`${d.kind === "disable" ? "🔧" : "💥"} ${pname(d.by)} מנסה ${KIND_TX[d.kind]} את המגדל של ${pname(d.den)}`);
          break;
        }
        case "th_channel_end": {
          g.chans.delete(d.by);
          if (d.ok) break;
          if (d.by === me) {
            if (!sfx("nope")) tone(240, 0.09, "square", 0.14, 180);
            setToast(d.why === "touched" ? `✋ ${pname(d.who ?? "")} עצר אותך!` : d.why === "moved" ? "זזת — הפעולה בוטלה" : d.why === "gold" ? "💰 אין מספיק זהב" : "הפעולה בוטלה");
          } else if (d.who === me) { setToast(`✋ עצרת את ${pname(d.by)}!`); fx("pow", g.me.x, g.me.y - 0.5, 2.6, 380, false, 0.35); }
          if (d.why === "touched") addFeed(`✋ ${pname(d.who ?? "")} עצר את ${pname(d.by)}!`);
          break;
        }
        case "th_act_done": {
          if (d.kind === "disable") { zapSnd(); addFeed(`🔧 ${pname(d.by)} שרף ${d.cost} להשבית את המגדל של ${pname(d.den)}`); }
          else if (d.kind === "destroy") { crumbleSnd(); g.shake = Math.max(g.shake, 6); addFeed(`💥 ${pname(d.by)} שרף ${d.cost} והרס את המגדל של ${pname(d.den)}`); }
          else { hammerSnd(); if (d.by !== me) addFeed(`🔨 ${pname(d.by)} בונה מחדש את המגדל`); }
          if (d.by === me && d.kind !== "rebuild") setToast(d.kind === "disable" ? `⚡ המגדל של ${pname(d.den)} כבוי 15 שניות — עכשיו!` : `💥 הרסת את המגדל של ${pname(d.den)}!`);
          break;
        }
        case "th_pos": {
          g.lastPosAt = performance.now();
          for (const [pid, x, y, carry, stolen, gold, rage, dx, dy, slow] of d.ps) {
            if (pid === me) {
              if (conn.synced && d.t && g.hist.length) {
                // פיוס: איפה *היינו* בזמן-השרת של הדגימה (הקלט שלנו מגיע לשרת אחרי חצי RTT,
                // ולכן ההיסטוריה מתויגת ב-serverNow+RTT/2). ההפרש הוא הטעות האמיתית — לא הדילאיי.
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
              if (!slow && g.me.slowUntil) g.me.slowUntil = 0;     // השרת אומר שההאטה נגמרה — הניבוי מתיישר
              // ה-HUD מתעדכן עד 4 פעמים בשנייה — הזהב זז כל טיק, ו-React לא צריך לרוץ 20 פעמים בשנייה
              const now = performance.now();
              if (now - g.hudAt > 250) {
                g.hudAt = now;
                const tw = g.towers.get(me); const tst = tw?.st ?? "ok";
                const tLeft = tw && tw.until ? Math.max(0, Math.ceil((tw.until - conn.serverNow()) / 1000)) : 0;
                setHud((h) => (h.gold === gold && h.carry === carry && h.tower === tst && h.towerLeft === tLeft ? h : { ...h, gold, carry, tower: tst, towerLeft: tLeft }));
              }
              continue;
            }
            const o = g.others.get(pid) ?? { x, y, tx: x, ty: y, vx: 0, vy: 0, st: d.t, carry, stolen, rage, slow: 0, gold, face: 1 };
            let s = SPD * (1 - CARRY_SLOW * carry);
            if (stolen) s *= STOLEN_SLOW;
            if (rage) s *= RAGE_MUL;
            if (slow) s *= SLOW_MUL;
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
          SFX.current?.startMusic();                              // כל הטלפונים מתחילים את הלופ באותו רגע (cue)
          break;
        case "th_mine":
          if (d.pid === me) {
            g.mineAt = performance.now();
            const tier = d.tier ?? 1;
            if (!sfx(tier >= 3 ? "mine_core" : tier === 2 ? "mine_deep" : "mine" + (1 + Math.floor(Math.random() * 3))))
              tone(tier >= 3 ? 330 : tier === 2 ? 260 : 210, 0.07, "square", 0.18);   // שכבה עמוקה נשמעת גבוה יותר
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
          if (d.den === me) pentaTone(0.34);                    // רק המאורה שלך שרה
          if (d.lvl === 2 && d.bell) {                          // 🔔 הבשלה מלאה — כל החדר שומע, פעם אחת למאורה
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
          if (d.by === me) { g.me.stolen = 1; if (!sfx("grab")) tone(660, 0.12, "sawtooth", 0.2, 440); setToast("🥷 רוץ הביתה!!"); setHud((h) => ({ ...h, stolen: true })); }
          if (d.from === me) {
            g.shake = 12; g.flash = 0.2; g.flashCol = "#E5484D";
            // האזעקה שלך: גובה קבוע לכל פולש — יודעים מי לפני שמסתכלים
            if (!sfx("stolen")) { tone(760, 0.16, "square", 0.3, 560); tone(560, 0.16, "square", 0.26, 420); }
            sfx("chirp", { rate: 0.78 + 0.07 * (pidx(d.by) % 8), delay: 0.2 });
            setToast(`😱 ${pname(d.by)} גנב לך את הגביש!`);
          }
          addFeed(`🥷 ${pname(d.by)} גנב מ${pname(d.from)}!`);
          break;
        }
        case "th_nope": {
          // הלחיצה לא תפסה — אומרים למה מיד, במקום שתיקה שמרגישה כמו באג
          if (!sfx("nope")) tone(240, 0.09, "square", 0.14, 180); g.shake = Math.max(g.shake, 4);
          setToast(d.why === "far" ? "🚶 תיכנס למאורה שלהם" : d.why === "empty" ? "🕳️ אין שם מה לגנוב" : d.why === "gold" ? "💰 אין לך מספיק זהב לזה" : d.why === "tower" ? "🗼 אין כאן מגדל לפעול עליו" : g.chans.has(me) ? "✋ אתה באמצע פעולה" : "🎒 קודם תביא את השלל הביתה");
          break;
        }
        case "th_tackle": {
          g.shake = Math.max(g.shake, 8); if (!sfx("pow")) tone(95, 0.14, "square", 0.3);
          { const p = d.carrier === me ? g.me : g.others.get(d.carrier); if (p) fx("pow", p.x, p.y - 0.3, 3.2, 380, false, 0.35); }
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
          if (d.by === me) { g.me.stolen = 1; if (!sfx("pick")) tone(500, 0.09, "triangle", 0.24); setHud((h) => ({ ...h, stolen: true })); }
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
            { const den = g.dens.get(me); if (den) fx("sparkle", den.x, den.y - 0.3, 3, 600); }
          } else if (d.from === me) {
            if (!sfx("receipt")) tone(300, 0.25, "sine", 0.16, 200);   // 📄 הקבלה — יבש, מצחיק-מתסכל, שקט מהחיובי
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
          SFX.current?.musicRate(1.06);
          for (let i = 0; i < 3; i++) fx("dust", g.mtn.x + (Math.random() - 0.5) * 3, g.mtn.y + (Math.random() - 0.5) * 2, 3.5, 900 + i * 200, false, 0.8);
          break;
        case "th_alarm":
          g.alarm = true; setHud((h) => ({ ...h, alarm: true }));
          setBanner({ ic: "🚨", t: "דקה אחרונה!", s: "כל ההכנסות פי 3" });
          setTimeout(() => setBanner(null), 2600);
          alarmSiren(); setTimeout(alarmSiren, 950);
          SFX.current?.musicRate(1.14);
          break;
        case "th_horn":
          // 🔔 הצפירה — אצל כולם באותו רגע; המסך קופא לרגע, ואז הטקס
          horn(); g.stop = 0.9; g.flash = 0.25; g.flashCol = "#F3E7D3"; SFX.current?.stopMusic(1.4); g.over = true;
          setBanner({ ic: "🔔", t: "הצפירה!", s: "מה שנשאר בבית — שלך" });
          break;
        case "th_left": g.others.delete(d.pid); g.chans.delete(d.pid); break;
      }
    });
  }, [hub, me, conn]);

  useEffect(() => { G.current.players = room.players.map((p) => ({ id: p.id, name: p.name })); }, [room.players]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2400); return () => clearTimeout(t); }, [toast]);

  /* ---- קלט: ג'ויסטיק צף אנלוגי, לפי מזהה מגע ---- */
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
      // עד הודעה אחת ב-40ms; שינוי שנחסם נשלח בסוף החלון (לא הולך לאיבוד)
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
      if (el?.closest("button")) return;
      const j = joy.current;
      if (isTouch(e)) {
        if (j.on) return;                            // אצבע שנייה — הג'ויסטיק נשאר אצל הראשונה
        const t = e.changedTouches[0]; if (!t) return;
        joy.current = { on: true, id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0 };
      } else {
        // אירועי עכבר "תואמים" שהדפדפן מייצר אחרי הקשה על כפתור — לא נוגעים בג'ויסטיק של המגע
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
      if (isTouch(e)) {                              // רק האצבע של הג'ויסטיק משחררת אותו
        let mine = false;
        for (let i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === j.id) mine = true;
        if (!mine) return;
      } else if (j.id !== -1) return;                // mouseup מזויף אחרי הקשה על "לגנוב!" — הריצה נמשכת
      j.on = false; j.dx = 0; j.dy = 0; sendDir(true);
    };
    const key = (e: KeyboardEvent, on: boolean) => {
      const j = joy.current, k = e.key;
      if (k === "ArrowLeft" || k === "a") j.dx = on ? -1 : 0;
      else if (k === "ArrowRight" || k === "d") j.dx = on ? 1 : 0;
      else if (k === "ArrowUp" || k === "w") j.dy = on ? -1 : 0;
      else if (k === "ArrowDown" || k === "s") j.dy = on ? 1 : 0;
      else return;
      e.preventDefault(); sendDir();
    };
    const kd = (e: KeyboardEvent) => key(e, true), ku = (e: KeyboardEvent) => key(e, false);
    // רשת ביטחון לדריפט — אבל לא באמצע ערוץ: שידור חוזר של אותו וקטור היה נחשב "תזוזה" ומבטל את הפעולה
    const iv = setInterval(() => { if (!g.chans.has(me) && (joy.current.on || joy.current.dx || joy.current.dy)) sendDir(true); }, 900);
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
    };
    resize();
    window.addEventListener("resize", resize);

    const mtnR = () => (g.mtn.left <= 0 ? 0 : 1.6 + 2.8 * Math.sqrt(g.mtn.left / Math.max(1, g.mtn.total)));
    const glow = (x: number, y: number, col: string, r: number, alpha: number) => {
      const sp = glowSprite(col, r); const half = sp.width / 2;
      ctx2.globalAlpha = alpha; ctx2.drawImage(sp, x - half, y - half); ctx2.globalAlpha = 1;
    };

    function denShape(x: number, y: number, r: number, idx: number, fill: string, stroke: string, lw: number) {
      const sides = [4, 6, 3, 5, 8, 4, 6, 3][idx % 8];
      const rot = idx % 2 ? Math.PI / sides : -Math.PI / 2;
      ctx2.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (i === 0) ctx2.moveTo(px, py); else ctx2.lineTo(px, py);
      }
      ctx2.closePath();
      ctx2.fillStyle = fill; ctx2.fill();
      ctx2.strokeStyle = stroke; ctx2.lineWidth = lw; ctx2.stroke();
    }

    /** מלבן מעוגל בלי roundRect (לא בכל הטלפונים) */
    const rrect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx2.moveTo(x + r, y); ctx2.lineTo(x + w - r, y); ctx2.quadraticCurveTo(x + w, y, x + w, y + r); ctx2.lineTo(x + w, y + h - r);
      ctx2.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx2.lineTo(x + r, y + h); ctx2.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx2.lineTo(x, y + r); ctx2.quadraticCurveTo(x, y, x + r, y); ctx2.closePath();
    };
    /** 🗼 המגדל ליד המאורה — מדבקה ב-3 מצבים (פעיל · כבוי · חורבה) או ציור; קירור = עשן, בנייה = פטיש, כבוי/בנייה = קשת ספירה */
    let smokeAt = 0;
    function drawTower(pid: string, den: { x: number; y: number }, tw: TowerC, col: string, isMe: boolean) {
      const IM = IMGS.current, ts = performance.now(), sNow = conn.serverNow();
      const tp = towerPos(den, g.mtn), px = tp.x * TS, py = tp.y * TS;
      const st = tw.st;
      const im = IM ? IM.tower[st === "ruin" || st === "build" ? 2 : st === "off" ? 1 : 0] : null;
      const hasImg = !!im && imgOk(im);
      // צל
      ctx2.fillStyle = "rgba(0,0,0,.3)"; ctx2.beginPath(); ctx2.ellipse(px, py + TS * 0.42, 15, 5, 0, 0, 6.283); ctx2.fill();
      if (st === "hot") {
        glow(px, py - TS * 0.5, "#FF5A3C", 30, 0.35 + 0.15 * Math.sin(ts / 90));
        if (ts - smokeAt > 260) { smokeAt = ts; fx("dust", tp.x + (Math.random() - 0.5) * 0.4, tp.y - 1.3, 1.1 + Math.random() * 0.5, 620, false, 0.9); }
      }
      if (hasImg) {
        // המדבקה הניטרלית בשטיפת צבע הבעלים (כמו המאורה); הקלע פונה אל ההר — היפוך לפי הצד
        const h = TS * (st === "ruin" || st === "build" ? 1.9 : 2.35), w = h * (im!.naturalWidth / im!.naturalHeight);
        const wob = st === "ok" ? Math.sin(ts / 700 + den.x) * 0.02 : 0;
        const flip = Math.sign(g.mtn.x - den.x) || 1;
        ctx2.save(); ctx2.translate(px, py + TS * 0.45); ctx2.rotate(wob); if (flip > 0) ctx2.scale(-1, 1);
        if (st === "off") ctx2.globalAlpha = 0.8;
        ctx2.drawImage(tinted(im!, col, isMe ? 0.2 : 0.28), -w / 2, -h, w, h); ctx2.restore(); ctx2.globalAlpha = 1;
        if (st === "hot") { ctx2.globalCompositeOperation = "lighter"; ctx2.globalAlpha = 0.22; ctx2.fillStyle = "#FF5A3C"; ctx2.beginPath(); ctx2.ellipse(px, py - TS * 0.6, w * 0.4, h * 0.42, 0, 0, 6.283); ctx2.fill(); ctx2.globalCompositeOperation = "source-over"; ctx2.globalAlpha = 1; }
      } else if (st === "ruin" || st === "build") {
        // חורבה: שלוש אבנים
        ctx2.fillStyle = "#5C5148";
        for (const [ox, oy, rw, rh] of [[-13, -6, 12, 9], [-2, -10, 11, 13], [8, -5, 10, 8]] as number[][]) { ctx2.fillRect(px + ox, py + oy, rw, rh); ctx2.strokeStyle = "#2C2825"; ctx2.lineWidth = 2; ctx2.strokeRect(px + ox, py + oy, rw, rh); }
      } else {
        // גוף אבן + רצועה בצבע השחקן + עדשה שמכוונת לכיוון הירייה האחרונה + גג
        ctx2.fillStyle = st === "off" ? "#3A332E" : "#6B5F55"; ctx2.strokeStyle = "#2C2825"; ctx2.lineWidth = 2.5;
        ctx2.beginPath(); rrect(px - 12, py - TS * 1.3, 24, TS * 1.6, 5); ctx2.fill(); ctx2.stroke();
        ctx2.fillStyle = col; ctx2.globalAlpha = st === "off" ? 0.4 : 1; ctx2.fillRect(px - 12, py - TS * 0.35, 24, 5); ctx2.globalAlpha = 1;
        ctx2.fillStyle = col; ctx2.beginPath(); ctx2.moveTo(px - 15, py - TS * 1.28); ctx2.lineTo(px + 15, py - TS * 1.28); ctx2.lineTo(px, py - TS * 1.85); ctx2.closePath(); ctx2.fill(); ctx2.stroke();
        const ex = px + Math.cos(tw.aim) * 5, ey = py - TS * 0.85 + Math.sin(tw.aim) * 3;
        ctx2.fillStyle = st === "off" ? "#1B1510" : st === "hot" ? "#FF5A3C" : "#F3E7D3"; ctx2.beginPath(); ctx2.arc(px, py - TS * 0.85, 7, 0, 6.283); ctx2.fill(); ctx2.stroke();
        if (st !== "off") { ctx2.fillStyle = "#1B1510"; ctx2.beginPath(); ctx2.arc(ex, ey, 3, 0, 6.283); ctx2.fill(); }
      }
      // מצבים זמניים: קשת ספירה + סמל
      const total = st === "off" ? 15000 : st === "build" ? 3000 : st === "hot" ? 4000 : 0;
      if (total && tw.until) {
        const left = Math.max(0, tw.until - sNow), u = Math.min(1, left / total);
        ctx2.strokeStyle = st === "build" ? "#F2C14E" : st === "hot" ? "#FF5A3C" : "#9AA4B2"; ctx2.lineWidth = 3; ctx2.globalAlpha = 0.9;
        ctx2.beginPath(); ctx2.arc(px, py - TS * 0.8, 22, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2); ctx2.stroke(); ctx2.globalAlpha = 1;
        ctx2.font = "15px sans-serif"; ctx2.textAlign = "center";
        if (st === "off") ctx2.fillText("💤", px + 14 * Math.sin(ts / 500), py - TS * 1.9 - 3 * Math.sin(ts / 300));
        if (st === "build") ctx2.fillText("🔨", px + 12, py - TS * 1.4 - 6 * Math.abs(Math.sin(ts / 140)));
      }
      if (st === "ruin") { ctx2.font = "800 11px Assistant, sans-serif"; ctx2.textAlign = "center"; ctx2.fillStyle = isMe ? "#FF6B5E" : "#8B7D6B"; ctx2.fillText(isMe ? "💥 חזור הביתה לבנות" : "💥 הרוס", px, py - TS * 0.75); }
      void pid;
    }

    function frame(ts: number) {
      raf = requestAnimationFrame(frame);
      if (!last) last = ts;
      const wantW = cv.clientWidth || window.innerWidth, wantH = cv.clientHeight || window.innerHeight;
      if (wantW && wantH && (Math.abs(wantW - W) > 1 || Math.abs(wantH - H) > 1)) resize();
      let dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      if (g.stop > 0) { g.stop -= dt; dt *= 0.06; }
      if (!g.ready) { ctx2.setTransform(DPR, 0, 0, DPR, 0, 0); ctx2.fillStyle = "#14100C"; ctx2.fillRect(0, 0, W, H); return; }

      // ספירה לאחור עד "צאו!" — מחושבת משעון השרת, זהה אצל כולם
      const sNow = conn.serverNow();
      if (!g.go && g.goAt) {
        const cd = Math.max(0, Math.ceil((g.goAt - sNow) / 1000));
        if (cd !== cdShown) { cdShown = cd; setCountdown(cd); if (cd > 0 && !sfx("tick")) tone(440, 0.08, "triangle", 0.16); }
      }

      // 🔌 שומר קיפאון: הדף גלוי אבל 4 שניות בלי th_pos = החיבור מת בשקט (טלפון שננעל/עבר לרקע).
      // מציגים "מתחבר מחדש", ובועטים בחיבור כל 5 שניות עד שההודעות חוזרות.
      if (g.go && !g.over && g.lastPosAt) {
        const since = performance.now() - g.lastPosAt;
        if (since > 4000 && document.visibilityState === "visible") {
          if (!g.stalled) { g.stalled = true; setStalled(true); }
          if (performance.now() - g.kickAt > 5000) { g.kickAt = performance.now(); conn.kick(); }
        } else if (g.stalled && since < 1500) { g.stalled = false; setStalled(false); }
      }

      /* ניבוי מקומי — אותה נוסחה כמו בשרת, עם הקלט *ששלחנו* (זה מה שהשרת מריץ) */
      const m = g.me;
      const raging = performance.now() < m.rageUntil;
      const slowed = performance.now() < m.slowUntil;
      const myChan = g.chans.get(me);
      const moving = g.go && !myChan && (g.sent.x || g.sent.y);
      if (g.sent.x) g.face = g.sent.x < 0 ? -1 : 1;
      if (moving) {
        let s = SPD * (1 - CARRY_SLOW * m.carry);
        if (m.stolen) s *= STOLEN_SLOW;
        if (raging) s *= RAGE_MUL;
        if (slowed) s *= SLOW_MUL;
        m.x = Math.max(1, Math.min(g.w - 1, m.x + g.sent.x * s * dt));
        m.y = Math.max(1, Math.min(g.h - 1, m.y + g.sent.y * s * dt));
        const r = mtnR();
        if (r > 0) {
          const ddx = m.x - g.mtn.x, ddy = m.y - g.mtn.y, d = Math.hypot(ddx, ddy);
          if (d < r && d > 0.001) { m.x = g.mtn.x + (ddx / d) * r; m.y = g.mtn.y + (ddy / d) * r; }
        }
      }
      if (g.corr.x || g.corr.y) {
        const k = Math.min(1, dt * 6);
        m.x += g.corr.x * k; m.y += g.corr.y * k;
        g.corr.x *= 1 - k; g.corr.y *= 1 - k;
        if (Math.abs(g.corr.x) < 0.005 && Math.abs(g.corr.y) < 0.005) { g.corr.x = 0; g.corr.y = 0; }
      }
      // היסטוריה לפיוס: הקלט שלנו יגיע לשרת בעוד חצי RTT — אז זה זמן-השרת שבו המיקום הזה "נכון"
      if (conn.synced) {
        g.hist.push({ t: sNow + conn.rttMs / 2, x: m.x, y: m.y });
        while (g.hist.length > 2 && g.hist[0].t < sNow - HIST_MS) g.hist.shift();
      }
      if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 40);
      if (g.flash > 0) g.flash -= dt;
      // האחרים: המיקום האמיתי שלהם עכשיו ≈ הדגימה האחרונה + הווקטור × הזמן שעבר מאז (בשעון השרת)
      for (const o of g.others.values()) {
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
      // 🗼 חלוקים שנחתו — ענן אבק קטן בנקודת הנחיתה (הפגיעה עצמה מגיעה מהשרת כ-th_hit)
      const nowP = performance.now();
      for (let i = g.shots.length - 1; i >= 0; i--) {
        const s = g.shots[i];
        if (nowP - s.t0 >= s.ms) { g.shots.splice(i, 1); fx("dust", s.x1, s.y1 + 0.1, 1.3, 300, false, 0.5); }
      }
      for (const [pid, c] of g.chans.entries()) if (nowP - c.t0 > c.ms + 1500) g.chans.delete(pid);   // רשת ביטחון אם th_channel_end אבד

      // שובל לכל סוחב שלל
      if (m.stolen && Math.random() < 0.6) g.trail.push({ x: m.x, y: m.y, l: 1, col: pcol(me) });
      for (const [pid, o] of g.others.entries()) if (o.stolen && Math.random() < 0.6) g.trail.push({ x: o.x, y: o.y, l: 1, col: pcol(pid) });

      // מצלמה
      const txc = m.x * TS - W / 2, tyc = m.y * TS - H / 2;
      g.cam.x += (txc - g.cam.x) * Math.min(1, dt * 7); g.cam.y += (tyc - g.cam.y) * Math.min(1, dt * 7);
      if (g.w * TS > W) g.cam.x = Math.max(-TS, Math.min(g.w * TS - W + TS, g.cam.x)); else g.cam.x = -(W - g.w * TS) / 2;
      if (g.h * TS > H) g.cam.y = Math.max(-TS, Math.min(g.h * TS - H + TS, g.cam.y)); else g.cam.y = -(H - g.h * TS) / 2;

      /* ציור */
      ctx2.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx2.fillStyle = "#100D0A"; ctx2.fillRect(0, 0, W, H);
      const sx = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0, sy = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0;
      ctx2.save(); ctx2.translate(-g.cam.x + sx, -g.cam.y + sy);

      // הרצפה — נייר חם עם נקודות דפוס עדינות (רק מה שבמסך)
      ctx2.fillStyle = "#1B1510"; ctx2.fillRect(0, 0, g.w * TS, g.h * TS);
      ctx2.fillStyle = "rgba(243,231,211,.045)";
      const x0 = Math.max(1, Math.floor(g.cam.x / TS) - 2), x1 = Math.min(g.w, Math.ceil((g.cam.x + W) / TS) + 1);
      const y0 = Math.max(1, Math.floor(g.cam.y / TS) - 2), y1 = Math.min(g.h, Math.ceil((g.cam.y + H) / TS) + 1);
      for (let yy = 1; yy < g.h; yy += 2) {
        if (yy < y0 || yy > y1) continue;
        for (let xx = 1 + (yy % 4 === 1 ? 0 : 1); xx < g.w; xx += 2) { if (xx < x0 || xx > x1) continue; ctx2.fillRect(xx * TS - 1, yy * TS - 1, 2, 2); }
      }
      ctx2.strokeStyle = "#3A2E22"; ctx2.lineWidth = 5; ctx2.strokeRect(2, 2, g.w * TS - 4, g.h * TS - 4);

      // החוט שלי — הלב הוויזואלי של המשחק
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

      // ההר — מדבקה ב-4 מצבים (מלא · חצי · ליבה זוהרת · מכתש), או המצולע של הגרייבוקס
      const r = mtnR();
      const IM = IMGS.current;
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
        ctx2.save();
        ctx2.translate(g.mtn.x * TS, g.mtn.y * TS);
        ctx2.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2, wob = 1 + 0.14 * Math.sin(i * 3.7);
          const px = Math.cos(a) * r * TS * wob, py = Math.sin(a) * r * TS * wob;
          if (i === 0) ctx2.moveTo(px, py); else ctx2.lineTo(px, py);
        }
        ctx2.closePath();
        ctx2.fillStyle = "#57524C"; ctx2.fill();
        ctx2.strokeStyle = "#2C2825"; ctx2.lineWidth = 4; ctx2.stroke();
        // ניצוצות זהב לפי כמה נשאר
        const specks = Math.max(2, Math.round((g.mtn.left / Math.max(1, g.mtn.total)) * 14));
        ctx2.fillStyle = "#F2C14E";
        for (let i = 0; i < specks; i++) {
          const a = i * 2.399 + 0.6, rr = r * TS * 0.62 * ((i % 5) / 5 + 0.2);
          ctx2.beginPath(); ctx2.arc(Math.cos(a) * rr, Math.sin(a) * rr, 3, 0, 6.283); ctx2.fill();
        }
        ctx2.font = "800 13px Assistant, sans-serif"; ctx2.textAlign = "center";
        ctx2.fillStyle = "#0009"; ctx2.fillText(`⛰️ ${g.mtn.left}`, 1, -r * TS - 9);
        ctx2.fillStyle = "#E8D9BC"; ctx2.fillText(`⛰️ ${g.mtn.left}`, 0, -r * TS - 10);
        ctx2.restore();
      } else {
        ctx2.font = "800 13px Assistant, sans-serif"; ctx2.textAlign = "center";
        ctx2.fillStyle = "#6B5F4E"; ctx2.fillText("⛰️ ההר נגמר", g.mtn.x * TS, g.mtn.y * TS);
      }

      // מאורות + גבישים (פריטי כל מאורה נאספים פעם אחת לפריים)
      const byDen = new Map<string, CItem[]>();
      for (const it of g.items.values()) if (it.state === "den") { const arr = byDen.get(it.den); if (arr) arr.push(it); else byDen.set(it.den, [it]); }
      for (const [pid, den] of g.dens.entries()) {
        const idx = Math.max(0, g.players.findIndex((p) => p.id === pid));
        const col = pcol(pid), isMe = pid === me;
        const its = byDen.get(pid) ?? [];
        let wealth = 0; for (const it of its) wealth += RATE[it.lvl] * it.v * 5;   // ×5 — הזוהר כויל על הסקאלה הישנה
        const gl = Math.min(26, 4 + wealth * 1.6);
        glow(den.x * TS, den.y * TS, col, DEN_R * TS * 0.72 + gl * 1.4, 0.18 + Math.min(0.42, wealth * 0.02)); // מאורה עשירה זוהרת — העושר פומבי
        // 🗼 הטווח והשטח המת — של המגדל שלי תמיד; של אחרים רק טבעת אדומה חלשה כשאני בפנים (הם רואים אותי)
        const tw = g.towers.get(pid);
        const towerUp = !!tw && (tw.st === "ok" || tw.st === "hot");
        const dMe = Math.hypot(m.x - den.x, m.y - den.y);
        if (isMe) {
          ctx2.save(); ctx2.setLineDash([7, 9]); ctx2.strokeStyle = col; ctx2.globalAlpha = towerUp ? 0.28 : 0.1; ctx2.lineWidth = 2;
          ctx2.beginPath(); ctx2.arc(den.x * TS, den.y * TS, g.tower.r * TS, 0, 6.283); ctx2.stroke(); ctx2.restore();
          // השטח המת — הגזרה בגב (הצד הרחוק מההר). הבעלים רואה אותה; אחרים לומדים אותה בכוח
          ctx2.save(); ctx2.beginPath(); ctx2.moveTo(den.x * TS, den.y * TS);
          ctx2.arc(den.x * TS, den.y * TS, g.tower.r * TS, den.back - g.tower.arc / 2, den.back + g.tower.arc / 2); ctx2.closePath();
          ctx2.fillStyle = "rgba(0,0,0,.30)"; ctx2.fill();
          ctx2.setLineDash([4, 6]); ctx2.strokeStyle = "rgba(243,231,211,.28)"; ctx2.lineWidth = 1.5; ctx2.stroke(); ctx2.restore();
        } else if (towerUp && dMe <= g.tower.r + 0.3 && !g.chans.has(me)) {
          ctx2.save(); ctx2.setLineDash([5, 7]); ctx2.strokeStyle = "#E5484D"; ctx2.globalAlpha = 0.2 + 0.1 * Math.sin(ts / 140); ctx2.lineWidth = 2;
          ctx2.beginPath(); ctx2.arc(den.x * TS, den.y * TS, g.tower.r * TS, 0, 6.283); ctx2.stroke(); ctx2.restore();
        }
        const denImg = IM ? IM.den[idx % 8] : null;
        if (denImg && imgOk(denImg)) {
          // המדבקה הניטרלית בשטיפת צבע השחקן (מוטמן פעם אחת), ה"רצפה" של המאורה בנקודת המאורה
          const w = TS * 3.6, h = w * (denImg.naturalHeight / denImg.naturalWidth);
          ctx2.drawImage(tinted(denImg, col, isMe ? 0.22 : 0.3), den.x * TS - w / 2, den.y * TS - h * 0.66, w, h);
        } else denShape(den.x * TS, den.y * TS, DEN_R * TS * 0.72, idx, "rgba(20,16,12,.92)", col, isMe ? 4.5 : 3);
        // טבעת רדיוס המאורה
        ctx2.strokeStyle = col; ctx2.globalAlpha = 0.16; ctx2.lineWidth = 2;
        ctx2.beginPath(); ctx2.arc(den.x * TS, den.y * TS, DEN_R * TS, 0, 6.283); ctx2.stroke();
        ctx2.globalAlpha = 1;
        if (tw) drawTower(pid, den, tw, col, isMe);
        // האבנים — בקשת לפני הפתח, הגדולות זוהרות
        const n = its.length, step = Math.min(0.62, 2.9 / Math.max(1, n));
        its.forEach((it, i) => {
          const ang = Math.PI / 2 + (i - (n - 1) / 2) * step;
          const ix = den.x * TS + Math.cos(ang) * TS * 1.55, iy = den.y * TS + Math.sin(ang) * TS * 0.78 + TS * 0.32;
          const pulse = (1 + it.pulse * 0.7) * (it.lvl === 2 ? 1 + 0.08 * Math.sin(ts / 160) : 1);
          const gemImg = IM ? IM.gem[it.v >= 6 ? 4 : it.lvl === 2 ? 3 : it.lvl === 1 ? 2 : 1] : null;
          if (it.lvl > 0 || it.v >= 6) glow(ix, iy, it.v >= 6 ? "#FFD152" : "#F2C14E", TS * (0.5 + it.lvl * 0.2) * vScale(it.v) + (it.v >= 6 ? 8 : 0), 0.35);
          if (gemImg && imgOk(gemImg)) {
            const gs = TS * (0.58 + it.lvl * 0.12) * vScale(it.v) * pulse;
            ctx2.drawImage(gemImg, ix - gs / 2, iy - gs / 2, gs, gs * (gemImg.naturalHeight / gemImg.naturalWidth));
          } else {
            const sz = LVL_SIZE[it.lvl] * vScale(it.v) * pulse;
            ctx2.save(); ctx2.translate(ix, iy); ctx2.rotate(Math.PI / 4);
            ctx2.fillStyle = it.lvl === 2 ? "#FFE082" : it.lvl === 1 ? "#F2C14E" : "#B9C46E";
            ctx2.fillRect(-sz / 2, -sz / 2, sz, sz);
            ctx2.restore();
          }
        });
        // שם
        ctx2.font = `800 ${isMe ? 13 : 11}px Assistant, sans-serif`; ctx2.textAlign = "center";
        const nm = (isMe ? "🏠 " : "") + pname(pid);
        ctx2.fillStyle = "#000"; ctx2.fillText(nm, den.x * TS + 1, den.y * TS + DEN_R * TS + 15);
        ctx2.fillStyle = col; ctx2.fillText(nm, den.x * TS, den.y * TS + DEN_R * TS + 14);
      }

      // שלל על הרצפה — כולם רואים, מי שמגיע ראשון
      for (const [, it] of g.items.entries()) {
        if (it.state !== "ground") continue;
        const sz = (LVL_SIZE[it.lvl] + 4) * vScale(it.v) + 2 * Math.sin(ts / 130);
        glow(it.gx * TS, it.gy * TS, "#FFD152", sz + 16, 0.6);
        const gemImg = IM ? IM.gem[it.v >= 6 ? 4 : it.lvl === 2 ? 3 : it.lvl === 1 ? 2 : 1] : null;
        ctx2.save(); ctx2.translate(it.gx * TS, it.gy * TS - 2 - 3 * Math.abs(Math.sin(ts / 260)));
        if (gemImg && imgOk(gemImg)) { const gs = TS * 0.95 * vScale(it.v); ctx2.rotate(Math.sin(ts / 300) * 0.25); ctx2.drawImage(gemImg, -gs / 2, -gs / 2, gs, gs * (gemImg.naturalHeight / gemImg.naturalWidth)); }
        else { ctx2.rotate(ts / 500); ctx2.fillStyle = "#FFE082"; ctx2.fillRect(-sz / 2, -sz / 2, sz, sz); }
        ctx2.restore();
      }

      // 🗼 חלוקים באוויר — קשת קטנה מהמגדל אל נקודת הנחיתה (הלקוח מציג, השרת מכריע)
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

      // פעימת פינג (פעמון)
      if (g.ping) {
        const u = 1 - (g.ping.t % 1);
        ctx2.strokeStyle = g.ping.col; ctx2.globalAlpha = (1 - u) * 0.7; ctx2.lineWidth = 3;
        ctx2.beginPath(); ctx2.arc(g.ping.x * TS, g.ping.y * TS, TS * (0.6 + u * 2.4), 0, 6.283); ctx2.stroke();
        ctx2.globalAlpha = 1;
      }

      // שובלים
      for (const t of g.trail) {
        ctx2.globalAlpha = t.l * 0.5; ctx2.fillStyle = t.col;
        ctx2.beginPath(); ctx2.arc(t.x * TS, t.y * TS, 5 * t.l, 0, 6.283); ctx2.fill();
      }
      ctx2.globalAlpha = 1;

      // שחקנים
      const drawPlayer = (pid: string, x: number, y: number, carry: number, stolen: number, rage: number, isMe: boolean, face: number, mov: boolean, carriedV: number, slow: number) => {
        const col = pcol(pid), idx = pidx(pid);
        const im = IM ? IM.thief[idx % 8] : null, hasImg = !!im && imgOk(im);
        if (stolen) glow(x * TS, y * TS, col, hasImg ? 44 : 32, 0.55);           // הדבר היחיד שזורח חזק בשדה
        if (rage) glow(x * TS, y * TS, "#FF4438", hasImg ? 40 : 28, 0.5);
        if (slow) glow(x * TS, y * TS + 6, "#7FB8FF", hasImg ? 30 : 22, 0.35);   // 🐌 מואט מחלוק
        // ערוץ פעולה — טבעת התקדמות סביב השחקן, בצבע הפעולה
        const ch = g.chans.get(pid);
        if (ch) {
          const u = Math.min(1, (performance.now() - ch.t0) / ch.ms), cc = ch.kind === "disable" ? "#FFB03B" : "#E5484D";
          ctx2.strokeStyle = "rgba(0,0,0,.45)"; ctx2.lineWidth = 7; ctx2.beginPath(); ctx2.arc(x * TS, y * TS, 26, 0, 6.283); ctx2.stroke();
          ctx2.strokeStyle = cc; ctx2.lineWidth = 5; ctx2.beginPath(); ctx2.arc(x * TS, y * TS, 26, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2); ctx2.stroke();
          ctx2.font = "800 12px Assistant, sans-serif"; ctx2.textAlign = "center";
          const lbl = ch.kind === "disable" ? "🔧 משבית…" : "💥 הורס…";
          ctx2.fillStyle = "#000"; ctx2.fillText(lbl, x * TS + 1, y * TS - TS * 1.75 + 1);
          ctx2.fillStyle = cc; ctx2.fillText(lbl, x * TS, y * TS - TS * 1.75);
        }
        if (hasImg) {
          // צל, ואז הדביבון: מקפץ בריצה, מסתובב לכיוון הריצה, נושם בעמידה
          ctx2.fillStyle = "rgba(0,0,0,.34)"; ctx2.beginPath(); ctx2.ellipse(x * TS, y * TS + TS * 0.62, 13, 5, 0, 0, 6.283); ctx2.fill();
          const h = TS * 2.05, w = h * (im!.naturalWidth / im!.naturalHeight);
          const bob = mov ? Math.abs(Math.sin(ts / 82 + idx)) * 3.2 : Math.sin(ts / 620 + idx) * 0.8;
          const rot = mov ? Math.sin(ts / 82 + idx) * 0.07 : 0;
          ctx2.save(); ctx2.translate(x * TS, y * TS + 3 - bob); ctx2.rotate(rot * face); if (face < 0) ctx2.scale(-1, 1);
          ctx2.drawImage(im!, -w / 2, -h * 0.6, w, h); ctx2.restore();
        } else {
          ctx2.fillStyle = col;
          ctx2.beginPath(); ctx2.arc(x * TS, y * TS, isMe ? 12 : 10.5, 0, 6.283); ctx2.fill();
          ctx2.strokeStyle = isMe ? "#F3E7D3" : "#0008"; ctx2.lineWidth = isMe ? 3 : 2; ctx2.stroke();
        }
        // צ'אנקים שהוא סוחב — סלעים קטנים שמסתובבים סביבו
        const rock = IM ? IM.gem[0] : null;
        for (let i = 0; i < carry; i++) {
          const a = ts / 400 + (i / 3) * Math.PI * 2, cx = x * TS + Math.cos(a) * 19, cy = y * TS + Math.sin(a) * 12 + 4;
          if (rock && imgOk(rock)) ctx2.drawImage(rock, cx - 7, cy - 6, 14, 14 * (rock.naturalHeight / rock.naturalWidth));
          else { ctx2.fillStyle = "#C8B78E"; ctx2.beginPath(); ctx2.arc(cx, cy, 4, 0, 6.283); ctx2.fill(); }
        }
        // שלל גנוב מעל הראש
        if (stolen) {
          const gemImg = IM ? IM.gem[carriedV >= 6 ? 4 : 3] : null;
          const gy = y * TS - (hasImg ? TS * 1.45 : 21) - 2 * Math.sin(ts / 110);
          glow(x * TS, gy, "#FFD152", 20, 0.55);
          if (gemImg && imgOk(gemImg)) { const gs = TS * 0.8 * vScale(carriedV); ctx2.drawImage(gemImg, x * TS - gs / 2, gy - gs / 2, gs, gs * (gemImg.naturalHeight / gemImg.naturalWidth)); }
          else { const sz2 = 11 + 2 * Math.sin(ts / 110); ctx2.save(); ctx2.translate(x * TS, gy); ctx2.rotate(Math.PI / 4); ctx2.fillStyle = "#FFE082"; ctx2.fillRect(-sz2 / 2, -sz2 / 2, sz2, sz2); ctx2.restore(); }
        }
        if (rage) { ctx2.font = "15px sans-serif"; ctx2.textAlign = "center"; ctx2.fillText("🔥", x * TS + (hasImg ? 16 * face : 0), y * TS - (hasImg ? TS * 1.1 : 20)); }
        if (slow) {
          // 🐌 תג ההאטה — עיגול כהה מאחוריו כדי שייקרא גם על הקפוצ'ון
          const bx = x * TS - (hasImg ? 21 * face : 0), by = y * TS - (hasImg ? TS * 1.05 : 18) + 2 * Math.sin(ts / 200);
          ctx2.fillStyle = "rgba(16,13,10,.82)"; ctx2.beginPath(); ctx2.arc(bx, by - 6, 12, 0, 6.283); ctx2.fill();
          ctx2.strokeStyle = "#7FB8FF"; ctx2.lineWidth = 2; ctx2.stroke();
          ctx2.font = "16px sans-serif"; ctx2.textAlign = "center"; ctx2.fillStyle = "#fff"; ctx2.fillText("🐌", bx, by);
        }
        ctx2.font = `800 ${isMe ? 12 : 11}px Assistant, sans-serif`; ctx2.textAlign = "center";
        const nm = pname(pid), ny = y * TS + (hasImg ? TS * 1.02 : 24);
        ctx2.fillStyle = "#000"; ctx2.fillText(nm, x * TS + 1, ny + 1);
        ctx2.fillStyle = isMe ? "#F3E7D3" : col; ctx2.fillText(nm, x * TS, ny);
      };
      const carriedValue = (pid: string) => { for (const it of g.items.values()) if (it.state === "carried" && it.carrier === pid) return it.v; return 1; };
      // מציירים לפי y — מי שנמוך יותר במסך מכסה את מי שמעליו (עומק של 3/4)
      const order = [...g.others.entries()].map(([pid, o]) => ({ pid, o })).sort((a, b) => a.o.y - b.o.y);
      let meDrawn = false;
      for (const { pid, o } of order) {
        if (!meDrawn && m.y < o.y) { drawPlayer(me, m.x, m.y, m.carry, m.stolen ? 1 : 0, raging ? 1 : 0, true, g.face, !!moving, carriedValue(me), slowed ? 1 : 0); meDrawn = true; }
        drawPlayer(pid, o.x, o.y, o.carry, o.stolen, o.rage, false, o.face, Math.hypot(o.vx, o.vy) > 0.3, carriedValue(pid), o.slow);
      }
      if (!meDrawn) drawPlayer(me, m.x, m.y, m.carry, m.stolen ? 1 : 0, raging ? 1 : 0, true, g.face, !!moving, carriedValue(me), slowed ? 1 : 0);
      // ⛏️ קשת החציבה — כמה נשאר עד הצ'אנק הבא (החציבה אוטומטית, אבל רואים אותה)
      if (r > 0 && !m.stolen && m.carry < 3 && Math.hypot(m.x - g.mtn.x, m.y - g.mtn.y) <= r + 1.0) {
        const u = Math.min(1, (performance.now() - g.mineAt) / MINE_MS);
        ctx2.strokeStyle = "#F2C14E"; ctx2.lineWidth = 3; ctx2.globalAlpha = 0.85;
        ctx2.beginPath(); ctx2.arc(m.x * TS, m.y * TS, 17, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2); ctx2.stroke();
        ctx2.globalAlpha = 1;
      }

      for (const p of g.parts) { ctx2.globalAlpha = Math.max(0, p.l); ctx2.fillStyle = p.col; ctx2.fillRect(p.x * TS - 2, p.y * TS - 2, 4, 4); }
      ctx2.globalAlpha = 1;
      for (const p of g.pops) {
        ctx2.globalAlpha = Math.min(1, p.l); ctx2.font = `800 ${p.sz}px Assistant, sans-serif`; ctx2.textAlign = "center";
        ctx2.fillStyle = "#000"; ctx2.fillText(p.t, p.x * TS + 1, p.y * TS + 1);
        ctx2.fillStyle = p.col; ctx2.fillText(p.t, p.x * TS, p.y * TS);
      }
      ctx2.globalAlpha = 1;
      // ✨ אפקטי המדבקות — נכנסים בקפיצה, גדלים ונמוגים; אור (lighter) לניצוצות וטבעות, רגיל ל-POW ואבק
      const nowT = performance.now();
      for (let i = g.fxs.length - 1; i >= 0; i--) {
        const f = g.fxs[i], u = (nowT - f.t) / f.life;
        if (u >= 1) { g.fxs.splice(i, 1); continue; }
        const a = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85, s = f.sz * (0.55 + f.grow * u), ar = f.img.naturalHeight / f.img.naturalWidth;
        ctx2.globalCompositeOperation = f.add ? "lighter" : "source-over"; ctx2.globalAlpha = Math.max(0, a);
        ctx2.save(); ctx2.translate(f.x * TS, f.y * TS); ctx2.rotate(f.rot); ctx2.drawImage(f.img, -s / 2, -s * ar / 2, s, s * ar); ctx2.restore();
      }
      ctx2.globalCompositeOperation = "source-over"; ctx2.globalAlpha = 1;
      ctx2.restore();

      // וינייטת אזעקה
      if (g.alarm) {
        ctx2.fillStyle = `rgba(229,72,77,${0.06 + 0.05 * Math.sin(ts / 220)})`;
        ctx2.fillRect(0, 0, W, H);
      }
      if (g.flash > 0) { ctx2.globalAlpha = Math.min(0.5, g.flash * 1.6); ctx2.fillStyle = g.flashCol; ctx2.fillRect(0, 0, W, H); ctx2.globalAlpha = 1; }

      // 🧭 חץ אל הגנב שסוחב את הגביש שלי + פעימה שמתגברת ככל שהוא מתקרב הביתה
      let thiefPid = "", thiefX = 0, thiefY = 0;
      for (const it of g.items.values()) {
        if (it.state === "carried" && it.den === me && it.carrier !== me) {
          thiefPid = it.carrier;
          const o = g.others.get(it.carrier);
          if (o) { thiefX = o.x; thiefY = o.y; }
        }
      }
      if (thiefPid) {
        const tdx = thiefX * TS - g.cam.x - (m.x * TS - g.cam.x), tdy = thiefY * TS - g.cam.y - (m.y * TS - g.cam.y);
        ctx2.save(); ctx2.translate(W / 2, 138); ctx2.rotate(Math.atan2(tdy, tdx));
        ctx2.globalAlpha = 0.65 + 0.35 * Math.sin(ts / 100);
        ctx2.fillStyle = pcol(thiefPid); ctx2.strokeStyle = "#000"; ctx2.lineWidth = 2;
        ctx2.beginPath(); ctx2.moveTo(18, 0); ctx2.lineTo(-10, -10); ctx2.lineTo(-5, 0); ctx2.lineTo(-10, 10); ctx2.closePath();
        ctx2.fill(); ctx2.stroke(); ctx2.restore(); ctx2.globalAlpha = 1;
        ctx2.font = "800 12px Assistant, sans-serif"; ctx2.textAlign = "center";
        ctx2.fillStyle = "#F3E7D3"; ctx2.fillText(`🏃 ${pname(thiefPid)} עם הגביש שלך!`, W / 2, 118);
        // פעימה לפי כמה הוא קרוב לבית שלו
        const hisDen = g.dens.get(thiefPid);
        if (hisDen && audio.current.ctx) {
          const dHome = Math.hypot(thiefX - hisDen.x, thiefY - hisDen.y);
          const iv2 = Math.max(180, Math.min(1100, dHome * 70));
          if (ts - g.beepAt > iv2) { g.beepAt = ts; tone(740, 0.05, "square", 0.14); }
        }
      }

      // 🗺️ מיני-מפה — החוטים של כולם
      const MW = 132, MH = Math.round(MW * (g.h / g.w)), MX = W - MW - 10, MY = 104;
      ctx2.fillStyle = "rgba(16,13,10,.86)"; ctx2.fillRect(MX, MY, MW, MH);
      ctx2.strokeStyle = "#3A2E22"; ctx2.lineWidth = 2; ctx2.strokeRect(MX, MY, MW, MH);
      const mx2 = (x: number) => MX + (x / g.w) * MW, my2 = (y: number) => MY + (y / g.h) * MH;
      if (r > 0) { ctx2.fillStyle = "#57524C"; ctx2.beginPath(); ctx2.arc(mx2(g.mtn.x), my2(g.mtn.y), (r / g.w) * MW, 0, 6.283); ctx2.fill(); }
      for (const [pid, den] of g.dens.entries()) {
        const col = pcol(pid);
        const pos2 = pid === me ? m : g.others.get(pid);
        if (pos2) {                                            // החוט — מידע הוא הפעולה
          ctx2.strokeStyle = col; ctx2.globalAlpha = 0.55; ctx2.lineWidth = 1;
          ctx2.beginPath(); ctx2.moveTo(mx2(pos2.x), my2(pos2.y)); ctx2.lineTo(mx2(den.x), my2(den.y)); ctx2.stroke();
          ctx2.globalAlpha = 1;
        }
        ctx2.fillStyle = col; ctx2.fillRect(mx2(den.x) - 2.5, my2(den.y) - 2.5, 5, 5);
        // 🗼 מגדל שלא פעיל — נקודה אפורה/אדומה ליד המאורה (מידע פומבי: "אצלו פתוח עכשיו")
        const twm = g.towers.get(pid);
        if (twm && twm.st !== "ok") { ctx2.fillStyle = twm.st === "hot" ? "#FF5A3C" : twm.st === "ruin" ? "#E5484D" : "#9AA4B2"; ctx2.beginPath(); ctx2.arc(mx2(den.x) + 4.5, my2(den.y) - 4.5, 2.2, 0, 6.283); ctx2.fill(); }
      }
      // ערוצים פומביים — פס התקדמות ליד המאורה שמותקפת, אצל כולם
      for (const [, c] of g.chans.entries()) {
        const den = g.dens.get(c.den); if (!den) continue;
        const u = Math.min(1, (performance.now() - c.t0) / c.ms), bx = mx2(den.x) - 9, by = my2(den.y) + 5;
        ctx2.fillStyle = "rgba(0,0,0,.7)"; ctx2.fillRect(bx - 1, by - 1, 20, 5);
        ctx2.fillStyle = c.kind === "disable" ? "#FFB03B" : "#E5484D"; ctx2.fillRect(bx, by, 18 * u, 3);
      }
      for (const [pid, o] of g.others.entries()) {
        ctx2.fillStyle = pcol(pid);
        ctx2.beginPath(); ctx2.arc(mx2(o.x), my2(o.y), o.stolen ? 3.6 : 2.3, 0, 6.283); ctx2.fill();
        if (o.stolen) { ctx2.strokeStyle = "#fff"; ctx2.lineWidth = 1; ctx2.stroke(); }
      }
      ctx2.fillStyle = "#F3E7D3"; ctx2.beginPath(); ctx2.arc(mx2(m.x), my2(m.y), 3, 0, 6.283); ctx2.fill();

      // ג'ויסטיק
      if (joy.current.on) {
        ctx2.strokeStyle = "rgba(243,231,211,.35)"; ctx2.lineWidth = 3;
        ctx2.beginPath(); ctx2.arc(joy.current.ox, joy.current.oy, 46, 0, 6.283); ctx2.stroke();
        ctx2.fillStyle = "rgba(255,138,61,.85)";
        ctx2.beginPath(); ctx2.arc(joy.current.ox + joy.current.dx * 46, joy.current.oy + joy.current.dy * 46, 20, 0, 6.283); ctx2.fill();
      }

      // עמודת הכפתורים — בדיקה מדי ~60ms: לגנוב (במאורה זרה עם אבנים) · להשבית/להרוס (ליד מגדל זר שעומד) ·
      // לבנות מחדש (בבית, כשהמגדל חורבה). הגניבה נשארת עוד רגע אחרי שיצאת (שלא תיעלם מתחת לאגודל)
      if (ts - stealChk > 60) {
        stealChk = ts;
        const a: Acts = { ...NO_ACTS, chan: !!myChan };
        if (g.go && !g.over && !myChan) {
          for (const [pid, den] of g.dens.entries()) {
            if (pid === me) continue;
            const dd = Math.hypot(m.x - den.x, m.y - den.y);
            if (!m.stolen && dd <= DEN_R && (byDen.get(pid)?.length ?? 0) > 0) a.steal = true;
            const tw = g.towers.get(pid);
            if (!m.stolen && dd <= ACT_R && tw && (tw.st === "ok" || tw.st === "hot" || tw.st === "off")) { a.destroy = true; if (tw.st !== "off") a.disable = true; }
          }
          const mine = g.dens.get(me), myTw = g.towers.get(me);
          if (mine && myTw?.st === "ruin" && Math.hypot(m.x - mine.x, m.y - mine.y) <= DEN_R) a.rebuild = true;
        }
        if (a.steal) g.stealOkAt = ts;
        a.steal = a.steal || (!m.stolen && !myChan && ts - g.stealOkAt < STEAL_HOLD);
        setActs((c) => (c.steal === a.steal && c.disable === a.disable && c.destroy === a.destroy && c.rebuild === a.rebuild && c.chan === a.chan ? c : a));
      }
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [me, conn]);

  const mins = Math.floor(hud.left / 60), secs = String(hud.left % 60).padStart(2, "0");

  return (
    <div style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh", zIndex: 60, background: "#100D0A", overflow: "hidden", touchAction: "none", direction: "rtl" }}>
      <canvas ref={cvRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />

      {/* שעון + הר */}
      <div style={{
        position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 10px)", left: "50%", transform: "translateX(-50%)",
        background: hud.alarm ? "rgba(120,20,20,.92)" : "rgba(16,13,10,.85)", border: `2px solid ${hud.alarm ? "#E5484D" : "#3A2E22"}`,
        borderRadius: 14, padding: "5px 14px", color: "#F3E7D3", fontWeight: 800, fontFamily: "Assistant, sans-serif",
        fontSize: 15, display: "flex", gap: 12, alignItems: "center", whiteSpace: "nowrap",
      }}>
        <span>{hud.alarm ? "🚨" : "⏱"} {mins}:{secs}</span>
        <span style={{ opacity: 0.85 }}>{hud.empty ? "⚔️ מלחמה" : `⛰️ ${hud.mtnPct}%`}</span>
      </div>

      {/* הזהב שלי */}
      <div style={{
        position: "absolute", bottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)", right: 14,
        background: "rgba(16,13,10,.85)", border: "2px solid #3A2E22", borderRadius: 14, padding: "6px 14px",
        color: "#F2C14E", fontWeight: 800, fontFamily: "Assistant, sans-serif", fontSize: 20,
      }}>
        💰 {hud.gold.toLocaleString()}
        {hud.carry > 0 && <span style={{ fontSize: 13, color: "#C8B78E", marginRight: 8 }}>+{hud.carry} ביד</span>}
        {hud.rage && <span style={{ fontSize: 13, color: "#FF6B5E", marginRight: 8 }}>🔥 זעם!</span>}
        {/* 🗼 מצב המגדל שלי — שורה שנייה, רק כשהוא לא פעיל */}
        {hud.tower !== "ok" && (
          <div style={{ fontSize: 12, color: hud.tower === "ruin" ? "#FF6B5E" : "#E8D9BC", marginTop: 2, whiteSpace: "nowrap" }}>
            {hud.tower === "hot" ? `🔥 המגדל מתקרר ${hud.towerLeft}` : hud.tower === "off" ? `💤 המגדל כבוי ${hud.towerLeft}` : hud.tower === "build" ? `🔨 בונים ${hud.towerLeft}` : "💥 המגדל הרוס — חזור הביתה"}
          </div>
        )}
      </div>

      {/* 🗼 הנגדים — ליד מגדל זר: להשבית / להרוס (המחיר מהניקוד); בבית עם חורבה: לבנות מחדש. pointerdown כמו כפתור הגניבה */}
      {(acts.disable || acts.destroy || acts.rebuild) && (
        <div style={{ position: "absolute", bottom: `calc(env(safe-area-inset-bottom, 0px) + ${acts.steal ? 128 : 30}px)`, left: 14, display: "flex", flexDirection: "column", gap: 8, zIndex: 5 }}>
          {acts.rebuild && (
            <ActBtn label="🔨 לבנות מחדש" sub="חינם · 3 שניות" col="#F2C14E" onTap={() => { aInit(); conn.sendGame({ a: "th_act", kind: "rebuild" }); }} />
          )}
          {acts.disable && (
            <ActBtn label="🔧 להשבית" sub={`${G.current.tower.disable} זהב · 1.5 שנ' · כבוי 15 שנ'`} col="#FFB03B" dim={hud.gold < G.current.tower.disable} onTap={() => { aInit(); conn.sendGame({ a: "th_act", kind: "disable" }); }} />
          )}
          {acts.destroy && (
            <ActBtn label="💥 להרוס" sub={`${G.current.tower.destroy} זהב · 3 שנ' תחת אש`} col="#E5484D" dim={hud.gold < G.current.tower.destroy} onTap={() => { aInit(); conn.sendGame({ a: "th_act", kind: "destroy" }); }} />
          )}
        </div>
      )}

      {/* פיד הקבלות — מתחת למיני-מפה, לא עליה */}
      <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 198px)", right: 10, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", pointerEvents: "none" }}>
        {feed.map((f) => (
          <div key={f.id} style={{
            background: "rgba(16,13,10,.78)", border: "1.5px solid #3A2E22", borderRadius: 10, padding: "3px 10px",
            color: "#E8D9BC", fontWeight: 700, fontFamily: "Assistant, sans-serif", fontSize: 12,
          }}>{f.tx}</div>
        ))}
      </div>

      {/* כפתור הגניבה — הפשע דורש לחיצה. pointerdown ולא click: אצבע שנייה שמקישה בזמן
          שהראשונה מחזיקה את הג'ויסטיק לא מייצרת click בכלל בדפדפני מובייל — רק pointer/touch */}
      {acts.steal && (
        <button
          onPointerDown={(e) => { e.preventDefault(); aInit(); conn.sendGame({ a: "th_steal" }); }}
          onClick={(e) => e.preventDefault()}
          style={{
            position: "absolute", bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)", left: 18,
            width: 96, height: 96, borderRadius: "50%", border: "none", padding: 0,
            background: `#7A3CC8 url(${TH_IMG.btn}) center / 100% 100% no-repeat`, color: "#fff", fontFamily: "Assistant, sans-serif",
            boxShadow: "0 0 26px rgba(160,90,255,.65)", zIndex: 5, touchAction: "manipulation",
          }}>
          <span style={{
            position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%) rotate(-3deg)",
            background: "#F3E7D3", color: "#1B1510", borderRadius: 10, padding: "1px 9px", fontSize: 13, fontWeight: 900,
            border: "2px solid #1B1510", boxShadow: "2px 2px 0 rgba(226,63,60,.85)", whiteSpace: "nowrap",
          }}>🥷 לגנוב!</span>
        </button>
      )}

      {toast && !stalled && (
        <div style={{
          position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 54px)", left: "50%", transform: "translateX(-50%)",
          background: "rgba(16,13,10,.92)", border: "2px solid #3A2E22", borderRadius: 14, padding: "8px 18px",
          color: "#F3E7D3", fontWeight: 800, fontFamily: "Assistant, sans-serif", fontSize: 16, whiteSpace: "nowrap", zIndex: 6,
        }}>{toast}</div>
      )}

      {stalled && (
        <div style={{
          position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 54px)", left: "50%", transform: "translateX(-50%)",
          background: "rgba(120,20,20,.92)", border: "2px solid #E5484D", borderRadius: 14, padding: "8px 16px",
          color: "#F3E7D3", fontWeight: 800, fontFamily: "Assistant, sans-serif", fontSize: 14, whiteSpace: "nowrap", zIndex: 8, pointerEvents: "none",
        }}>🔌 החיבור נפל — מתחבר מחדש…</div>
      )}

      {/* ספירה לאחור — אותו מספר אצל כולם, משעון השרת */}
      {countdown > 0 && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", zIndex: 7 }}>
          <div key={countdown} className="popin" style={{ textAlign: "center", fontFamily: "Assistant, sans-serif", color: "#F3E7D3" }}>
            <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 1, textShadow: "5px 5px 0 rgba(226,63,60,.85)" }}>{countdown}</div>
            <div style={{ fontSize: 16, fontWeight: 700, opacity: 0.85, marginTop: 8 }}>🥷 מתכוננים…</div>
          </div>
        </div>
      )}

      {banner && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", zIndex: 7 }}>
          <div style={{
            background: "rgba(16,13,10,.94)", border: "3px solid #F2C14E", borderRadius: 20, padding: "18px 30px",
            textAlign: "center", color: "#F3E7D3", fontFamily: "Assistant, sans-serif", transform: "rotate(-1.3deg)",
            boxShadow: "5px 5px 0 rgba(226,63,60,.85)",
          }}>
            <div style={{ fontSize: 40 }}>{banner.ic}</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{banner.t}</div>
            <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>{banner.s}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/** כפתור פעולה בעמודה (מדבקה שטוחה עם מחיר). dim = אין מספיק זהב — עדיין לחיץ, השרת יענה th_nope(gold) והטוסט יסביר */
function ActBtn({ label, sub, col, dim, onTap }: { label: string; sub: string; col: string; dim?: boolean; onTap: () => void }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onTap(); }}
      onClick={(e) => e.preventDefault()}
      style={{
        border: `2.5px solid ${col}`, background: "rgba(16,13,10,.92)", color: "#F3E7D3", borderRadius: 14, padding: "6px 12px",
        fontFamily: "Assistant, sans-serif", textAlign: "right", opacity: dim ? 0.5 : 1, touchAction: "manipulation", minWidth: 150,
        boxShadow: `3px 3px 0 ${col}88`, transform: "rotate(-1.5deg)",
      }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: col }}>{label}</div>
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, whiteSpace: "nowrap" }}>{sub}</div>
    </button>
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
