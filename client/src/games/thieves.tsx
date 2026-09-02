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
 */
import { useEffect, useRef, useState } from "react";
import type { ThievesServerMsg } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { loadImages, ready as imgOk, tinted, ThSfx, TH_IMG } from "./thievesAssets";
import type { ThImages } from "./thievesAssets";

const TS = 30;                     // פיקסלים לתא
const SPD = 6.0;                   // חייב להיות זהה לשרת
const CARRY_SLOW = 0.05;
const STOLEN_SLOW = 0.74;
const RAGE_MUL = 1.4;
const DEN_R = 2.0;
const PCOL = ["#FF8A3D", "#5AC8FA", "#46E0C0", "#F2C14E", "#E5484D", "#B37BE0", "#8ee34a", "#FF6FB5"];
const LVL_SIZE = [6, 9, 12];       // גודל הגביש לפי דרגת הבשלה
const RATE = [1, 3, 6];
const HIST_MS = 1500;              // כמה היסטוריית מיקומים שומרים לפיוס
const STEAL_HOLD = 450;            // הכפתור לא נעלם באותה מילישנייה שיצאת מהרדיוס

interface Other { x: number; y: number; tx: number; ty: number; vx: number; vy: number; st: number; carry: number; stolen: number; rage: number; gold: number; face: number }
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
  const [hud, setHud] = useState({ gold: 0, carry: 0, left: 0, mtnPct: 100, stolen: false, rage: false, alarm: false, empty: false });
  const [banner, setBanner] = useState<{ ic: string; t: string; s: string } | null>(null);
  const [toast, setToast] = useState("");
  const [feed, setFeed] = useState<{ id: number; tx: string }[]>([]);
  const [canSteal, setCanSteal] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const feedId = useRef(1);

  const G = useRef({
    ready: false, w: 46, h: 30,
    mtn: { x: 23, y: 15, total: 1, left: 1 },
    dens: new Map<string, { x: number; y: number }>(),
    me: { x: 5, y: 5, carry: 0, stolen: 0, rageUntil: 0, gold: 0 },
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
          for (const [pid, x, y] of d.dens) g.dens.set(pid, { x, y });
          const mine = g.dens.get(me);
          if (mine && !g.ready) { g.me.x = mine.x; g.me.y = mine.y; g.cam.x = mine.x * TS; g.cam.y = mine.y * TS; }
          g.goAt = d.goAt; g.endsAt = d.endsAt; g.ready = true;
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
          g.endsAt = d.endsAt;
          break;
        }
        case "th_pos": {
          for (const [pid, x, y, carry, stolen, gold, rage, dx, dy] of d.ps) {
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
              // ה-HUD מתעדכן עד 4 פעמים בשנייה — הזהב זז כל טיק, ו-React לא צריך לרוץ 20 פעמים בשנייה
              const now = performance.now();
              if (now - g.hudAt > 250) { g.hudAt = now; setHud((h) => (h.gold === gold && h.carry === carry ? h : { ...h, gold, carry })); }
              continue;
            }
            const o = g.others.get(pid) ?? { x, y, tx: x, ty: y, vx: 0, vy: 0, st: d.t, carry, stolen, rage, gold, face: 1 };
            let s = SPD * (1 - CARRY_SLOW * carry);
            if (stolen) s *= STOLEN_SLOW;
            if (rage) s *= RAGE_MUL;
            o.tx = x; o.ty = y; o.vx = (dx ?? 0) * s; o.vy = (dy ?? 0) * s; o.st = d.t;
            o.carry = carry; o.stolen = stolen; o.rage = rage; o.gold = gold;
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
          setToast(d.why === "far" ? "🚶 תיכנס למאורה שלהם" : d.why === "empty" ? "🕳️ אין שם מה לגנוב" : "🎒 קודם תביא את השלל הביתה");
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
          horn(); g.stop = 0.9; g.flash = 0.25; g.flashCol = "#F3E7D3"; SFX.current?.stopMusic(1.4);
          setBanner({ ic: "🔔", t: "הצפירה!", s: "מה שנשאר בבית — שלך" });
          break;
        case "th_left": g.others.delete(d.pid); break;
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
    const iv = setInterval(() => { if (joy.current.on || joy.current.dx || joy.current.dy) sendDir(true); }, 900); // רשת ביטחון לדריפט
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
  }, [conn]);

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

      /* ניבוי מקומי — אותה נוסחה כמו בשרת, עם הקלט *ששלחנו* (זה מה שהשרת מריץ) */
      const m = g.me;
      const raging = performance.now() < m.rageUntil;
      const moving = g.go && (g.sent.x || g.sent.y);
      if (g.sent.x) g.face = g.sent.x < 0 ? -1 : 1;
      if (moving) {
        let s = SPD * (1 - CARRY_SLOW * m.carry);
        if (m.stolen) s *= STOLEN_SLOW;
        if (raging) s *= RAGE_MUL;
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
        let wealth = 0; for (const it of its) wealth += RATE[it.lvl] * it.v;
        const gl = Math.min(26, 4 + wealth * 1.6);
        glow(den.x * TS, den.y * TS, col, DEN_R * TS * 0.72 + gl * 1.4, 0.18 + Math.min(0.42, wealth * 0.02)); // מאורה עשירה זוהרת — העושר פומבי
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
      const drawPlayer = (pid: string, x: number, y: number, carry: number, stolen: number, rage: number, isMe: boolean, face: number, mov: boolean, carriedV: number) => {
        const col = pcol(pid), idx = pidx(pid);
        const im = IM ? IM.thief[idx % 8] : null, hasImg = !!im && imgOk(im);
        if (stolen) glow(x * TS, y * TS, col, hasImg ? 44 : 32, 0.55);           // הדבר היחיד שזורח חזק בשדה
        if (rage) glow(x * TS, y * TS, "#FF4438", hasImg ? 40 : 28, 0.5);
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
        if (!meDrawn && m.y < o.y) { drawPlayer(me, m.x, m.y, m.carry, m.stolen ? 1 : 0, raging ? 1 : 0, true, g.face, !!moving, carriedValue(me)); meDrawn = true; }
        drawPlayer(pid, o.x, o.y, o.carry, o.stolen, o.rage, false, o.face, Math.hypot(o.vx, o.vy) > 0.3, carriedValue(pid));
      }
      if (!meDrawn) drawPlayer(me, m.x, m.y, m.carry, m.stolen ? 1 : 0, raging ? 1 : 0, true, g.face, !!moving, carriedValue(me));
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
        ctx2.save(); ctx2.translate(W / 2, 92); ctx2.rotate(Math.atan2(tdy, tdx));
        ctx2.globalAlpha = 0.65 + 0.35 * Math.sin(ts / 100);
        ctx2.fillStyle = pcol(thiefPid); ctx2.strokeStyle = "#000"; ctx2.lineWidth = 2;
        ctx2.beginPath(); ctx2.moveTo(18, 0); ctx2.lineTo(-10, -10); ctx2.lineTo(-5, 0); ctx2.lineTo(-10, 10); ctx2.closePath();
        ctx2.fill(); ctx2.stroke(); ctx2.restore(); ctx2.globalAlpha = 1;
        ctx2.font = "800 12px Assistant, sans-serif"; ctx2.textAlign = "center";
        ctx2.fillStyle = "#F3E7D3"; ctx2.fillText(`🏃 ${pname(thiefPid)} עם הגביש שלך!`, W / 2, 74);
        // פעימה לפי כמה הוא קרוב לבית שלו
        const hisDen = g.dens.get(thiefPid);
        if (hisDen && audio.current.ctx) {
          const dHome = Math.hypot(thiefX - hisDen.x, thiefY - hisDen.y);
          const iv2 = Math.max(180, Math.min(1100, dHome * 70));
          if (ts - g.beepAt > iv2) { g.beepAt = ts; tone(740, 0.05, "square", 0.14); }
        }
      }

      // 🗺️ מיני-מפה — החוטים של כולם
      const MW = 132, MH = Math.round(MW * (g.h / g.w)), MX = W - MW - 10, MY = 64;
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

      // כפתור הגניבה — בדיקה מדי ~60ms, ונשאר עוד רגע אחרי שיצאת (שלא ייעלם מתחת לאגודל)
      if (ts - stealChk > 60) {
        stealChk = ts;
        let ok = false;
        if (!m.stolen && g.go) {
          for (const [pid, den] of g.dens.entries()) {
            if (pid === me) continue;
            if (Math.hypot(m.x - den.x, m.y - den.y) <= DEN_R && (byDen.get(pid)?.length ?? 0) > 0) { ok = true; break; }
          }
        }
        if (ok) g.stealOkAt = ts;
        const show = ok || (!m.stolen && ts - g.stealOkAt < STEAL_HOLD);
        setCanSteal((c) => (c === show ? c : show));
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
      </div>

      {/* פיד הקבלות — מתחת למיני-מפה, לא עליה */}
      <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 158px)", right: 10, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", pointerEvents: "none" }}>
        {feed.map((f) => (
          <div key={f.id} style={{
            background: "rgba(16,13,10,.78)", border: "1.5px solid #3A2E22", borderRadius: 10, padding: "3px 10px",
            color: "#E8D9BC", fontWeight: 700, fontFamily: "Assistant, sans-serif", fontSize: 12,
          }}>{f.tx}</div>
        ))}
      </div>

      {/* כפתור הגניבה — הפשע דורש לחיצה. pointerdown ולא click: אצבע שנייה שמקישה בזמן
          שהראשונה מחזיקה את הג'ויסטיק לא מייצרת click בכלל בדפדפני מובייל — רק pointer/touch */}
      {canSteal && (
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

      {toast && (
        <div style={{
          position: "absolute", bottom: "calc(env(safe-area-inset-bottom, 0px) + 120px)", left: "50%", transform: "translateX(-50%)",
          background: "rgba(16,13,10,.92)", border: "2px solid #3A2E22", borderRadius: 14, padding: "8px 18px",
          color: "#F3E7D3", fontWeight: 800, fontFamily: "Assistant, sans-serif", fontSize: 16, whiteSpace: "nowrap", zIndex: 6,
        }}>{toast}</div>
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

function burst(x: number, y: number, col: string, n: number) {
  const out: { x: number; y: number; vx: number; vy: number; l: number; col: string }[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, s = 1 + Math.random() * 3;
    out.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, l: 0.4 + Math.random() * 0.35, col });
  }
  return out;
}
