/**
 * "מופע" 🕯️ — צד לקוח.
 * מפעיל (הדיג'י): קונסולת תאורה בהשראת קונסולות מקצועיות (grandMA/SoundSwitch):
 *   פדים גדולים בלי גלילה · Flash רגעי · Blackout בהחזקה · TAP בפינת האגודל ·
 *   פיידר עוצמה ראשי (Grand Master) · בחירת צורה וצבע · נעילת מסך.
 * כל טלפון אחר: פיקסל — כל המסך (או צורה זוהרת: לב/עיגול/פסים/כוכב/ברק/רוקדים)
 * מתמלא בצבע שמחושב לוקאלית: צבע = f(x, y, t מסונכרן).
 * האפקט מגיע כ-cue — כולם מחליפים באותה מילישנייה; מכאן והלאה אפס תלות ברשת.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ShowServerMsg, ShowFx, ShowShape } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";
import { BeatEar } from "../lib/beatear";
import { t } from "../lib/i18n";
import { getVenue, seatToXY } from "../venues";

/* ---------- מנוע האפקטים: צבע = f(x, y, t) ---------- */
interface FxState { fx: ShowFx; text?: string; bpm?: number; color?: string; anchor?: number; shape?: ShowShape; at: number }

const bmp = typeof document !== "undefined" ? document.createElement("canvas") : null;
let bmpData: Uint8ClampedArray | null = null;
let bmpFor = "";
function renderBitmap(str: string) {
  if (!bmp || bmpFor === str) return;
  bmpFor = str;
  bmp.width = 220; bmp.height = 70;
  const c = bmp.getContext("2d", { willReadFrequently: true })!;
  c.clearRect(0, 0, 220, 70);
  c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
  let size = 58;
  c.font = `900 ${size}px 'Rubik Variable', Rubik, Arial`;
  const w = c.measureText(str).width;
  if (w > 210) { size = Math.max(18, Math.floor(size * 210 / w)); c.font = `900 ${size}px 'Rubik Variable', Rubik, Arial`; }
  c.fillText(str, 110, 39);
  bmpData = c.getImageData(0, 0, 220, 70).data;
}
function sampleBitmap(u: number, v: number): boolean {
  if (!bmpData || u < 0 || u > 1 || v < 0 || v > 1) return false;
  const px = Math.floor(u * 219), py = Math.floor(v * 69);
  return bmpData[(py * 220 + px) * 4 + 3] > 100;
}
function inHeart(nx: number, ny: number, scale: number): boolean {
  const x = nx / scale, y = ny / scale;
  const a = x * x + y * y - 0.25;
  return a * a * a - x * x * y * y * y * 0.25 < 0;
}
const DARK: [number, number, number] = [16, 10, 30];

/** הפונקציה שכל טלפון מריץ — זהה לסימולטור, רק שכאן הפיקסל הוא כל המסך. win = אני זוכה הזרקור 🎯 */
export function fxColor(fx: FxState, x: number, y: number, now: number, rnd: number, win = false): [number, number, number] {
  // anchor (Tap-Tempo) מעגן את הפאזה לביט האמיתי של המוזיקה; בלעדיו — לרגע החלפת האפקט
  const t = Math.max(0, (now - (fx.anchor ?? fx.at)) / 1000);
  switch (fx.fx) {
    case "off": return DARK;
    case "color": {
      const c = fx.color ?? "#8b5cf6";
      return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    }
    case "candles": {
      const f = 0.72 + 0.28 * Math.sin(t * 2.2 + rnd * 40) * Math.sin(t * 3.7 + rnd * 17);
      return [255 * f, 165 * f, 55 * f];
    }
    case "wave": {
      const v = (((x * 3 - t * 0.55) % 1) + 1) % 1;
      return v < 0.3 ? [199, 132, 255] : [40, 18, 60];
    }
    case "pulse": {
      const bpm = fx.bpm ?? 120;
      const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * bpm / 60)), 3);
      return [139 * (0.1 + beat), 92 * (0.1 + beat), 246 * (0.1 + beat)];
    }
    case "text": {
      renderBitmap(fx.text || "✨");
      const offset = 1.1 - ((t * 0.35) % 2.2);
      const u = x - offset;
      return u >= 0 && u <= 1 && sampleBitmap(u, 1 - y) ? [255, 201, 60] : DARK;
    }
    case "heart": {
      const beat = 1 + 0.13 * Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.6)), 2);
      return inHeart(x - 0.5, y - 0.48, 0.34 * beat) ? [255, 60, 110] : DARK;
    }
    case "countdown": {
      // 🔢 ספירה 10→1 ואז הפיצוץ: 3 שניות סטרוב לבן וזהב שמחזיק
      const n = 10 - Math.floor(t);
      if (n > 0) {
        renderBitmap(String(n));
        const frac = 1 - (t % 1);
        return sampleBitmap(x, 1 - y) ? [255, 201 * frac + 54, 60] : DARK;
      }
      const bt = t - 10;
      if (bt < 3) { const s = Math.sin(bt * 28 + rnd * 3) > 0 ? 1 : 0.12; return [255 * s, 248 * s, 235 * s]; }
      return [255, 201, 60];
    }
    case "sparkle":
      return Math.sin(t * 3 + rnd * 700) > 0.94 ? [255, 255, 255] : [30, 20, 55];
    case "sections": {
      const sec = x < 0.333 ? 0 : x < 0.667 ? 1 : 2;
      const cols: [number, number, number][] = [[92, 138, 255], [236, 72, 153], [52, 232, 158]];
      const winner = Math.floor(t / 3) % 3;
      const b = sec === winner ? 0.75 + 0.25 * Math.sin(t * 14) : 0.2;
      const c = cols[sec];
      return [c[0] * b, c[1] * b, c[2] * b];
    }
    case "flash": {
      const ft = t % 2.5;
      const b = ft < 0.12 ? 1 : Math.max(0.04, 0.5 - ft * 0.35);
      return [255 * b, 245 * b, 230 * b];
    }
    case "tribal": {
      // מקצב שבטי 🥁 — כל טלפון שייך לאחד מ-4 שבטים (אקראי יציב);
      // כל שבט מהבהב על פעימה אחרת בתוך תיבה של 4 — הקהל מנצנץ בפוליריתמיקה
      const bpm = fx.bpm ?? 120;
      const myTribe = Math.floor(rnd * 4);
      const beatFloat = t * bpm / 60;
      const beatInBar = Math.floor(beatFloat) % 4;
      const within = beatFloat % 1; // 0..1 בתוך הפעימה
      const cols: [number, number, number][] = [[139, 92, 246], [236, 72, 153], [255, 201, 60], [52, 232, 158]];
      const c = cols[myTribe];
      if (beatInBar === myTribe) {
        const b = Math.max(0, 1 - within * 1.6); // הבזק שדועך לאורך הפעימה
        return [c[0] * (0.15 + b * 0.85), c[1] * (0.15 + b * 0.85), c[2] * (0.15 + b * 0.85)];
      }
      return [c[0] * 0.07, c[1] * 0.07, c[2] * 0.07]; // זכר עדין לצבע השבט
    }
    case "beat": {
      // 🎵 לפי הקצב — כל הקהל מבזיק יחד על הביט, צבע חדש בכל פעימה
      const bpm = fx.bpm ?? 120;
      const beatFloat = t * bpm / 60;
      const within = beatFloat % 1;
      const b = Math.pow(Math.max(0, 1 - within * 1.35), 2.2);
      const cols: [number, number, number][] = [
        [139, 92, 246], [236, 72, 153], [255, 201, 60], [52, 232, 158], [92, 138, 255], [255, 255, 255],
      ];
      const c = cols[Math.floor(beatFloat) % cols.length];
      return [c[0] * (0.05 + b * 0.95), c[1] * (0.05 + b * 0.95), c[2] * (0.05 + b * 0.95)];
    }
    case "paparazzi": {
      // 📸 הבזקי מצלמות — כל טלפון מבליח לבן ברגעים אקראיים משלו (דטרמיניסטי, אפס תקשורת)
      const ph = t * (1.4 + rnd * 0.8) + rnd * 120;
      const flash = ph % 1 < 0.15 && Math.sin(Math.floor(ph) * 37.7 + rnd * 91) > -0.1;
      return flash ? [255, 255, 255] : [18, 12, 34];
    }
    case "spot": {
      // 🎯 הזרקור עליך — הזוכה זוהר בזהב מהבהב, כל השאר דועכים לרקע סגלגל
      if (win) { const s = 0.85 + 0.15 * Math.sin(t * 16); return [255 * s, 215 * s, 90 * s]; }
      return [28, 16, 44];
    }
    case "ember": {
      // 🌅 גחלים — זוהר חם ונושם לאט; ה-walk-away של סוף הערב (וגם חוסך סוללה)
      const b = 0.10 + 0.08 * (0.5 + 0.5 * Math.sin(t * 0.7 + rnd * 20));
      return [255 * b, 130 * b, 40 * b];
    }
  }
  return DARK;
}

/* ---------- צורות התאורה — SVG שממלא את מסך הצופה ---------- */
/** גיאומטריית כל צורה (viewBox 0 0 100 100). הצבע יורש מ-currentColor של העטיפה. */
function shapeNodes(s: ShowShape): ReactNode {
  switch (s) {
    case "heart":
      return <path fill="currentColor" d="M50 86 C22 63 9 46 9 31 C9 18 19 9 30.5 9 C39 9 46.5 14 50 22 C53.5 14 61 9 69.5 9 C81 9 91 18 91 31 C91 46 78 63 50 86 Z" />;
    case "circle":
      return <circle fill="currentColor" cx="50" cy="50" r="43" />;
    case "stripes":
      return <g fill="currentColor">
        {[0, 1, 2, 3, 4].map((i) => <rect key={i} x="2" y={3 + i * 20} width="96" height="13" rx="6.5" />)}
      </g>;
    case "star":
      return <polygon fill="currentColor" points="50,6 61.2,36.6 93.7,37.8 68.1,57.9 77,89.2 50,71 23,89.2 31.9,57.9 6.3,37.8 38.8,36.6" />;
    case "bolt":
      return <path fill="currentColor" d="M58 3 L20 55 L43 55 L37 97 L80 42 L55 42 Z" />;
    case "dancers":
      return <g stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" fill="none">
        <circle cx="20" cy="24" r="6" fill="currentColor" stroke="none" />
        <path d="M20 32 V52 M20 36 L10 24 M20 36 L30 24 M20 52 L13 70 M20 52 L27 70" />
        <circle cx="50" cy="16" r="6" fill="currentColor" stroke="none" />
        <path d="M50 24 V44 M50 28 L38 20 M50 28 L61 15 M50 44 L41 60 M50 44 L60 58" />
        <circle cx="80" cy="26" r="6" fill="currentColor" stroke="none" />
        <path d="M80 34 V54 M80 38 L70 30 M80 38 L91 28 M80 54 L72 72 M80 54 L88 72" />
      </g>;
    default:
      return null;
  }
}

const SHAPES: { s: ShowShape; label: string }[] = [
  { s: "full", label: t("shFull") },
  { s: "heart", label: t("shHeart") },
  { s: "circle", label: t("shCircle") },
  { s: "stripes", label: t("shStripes") },
  { s: "star", label: t("shStar") },
  { s: "bolt", label: t("shBolt") },
  { s: "dancers", label: t("shDancers") },
];

/** אייקון צורה קטן לצ'יפ בקונסולה */
function ShapeIcon({ s }: { s: ShowShape }) {
  if (s === "full") return <svg viewBox="0 0 100 100" width="22" height="22"><rect fill="currentColor" x="8" y="8" width="84" height="84" rx="14" /></svg>;
  return <svg viewBox="0 0 100 100" width="22" height="22">{shapeNodes(s)}</svg>;
}

/* ---------- פדים של הקונסולה ---------- */
const PADS: { fx: ShowFx; ic: string; label: string }[] = [
  { fx: "beat", ic: "🎵", label: t("fxBeat") },
  { fx: "tribal", ic: "🥁", label: t("fxTribal") },
  { fx: "pulse", ic: "💓", label: t("fxPulse") },
  { fx: "candles", ic: "🕯️", label: t("fxCandles") },
  { fx: "wave", ic: "🌊", label: t("fxWave") },
  { fx: "sparkle", ic: "✨", label: t("fxSparkle") },
  { fx: "sections", ic: "🏟️", label: t("fxSections") },
  { fx: "paparazzi", ic: "📸", label: t("fxPaparazzi") },
  { fx: "spot", ic: "🎯", label: t("fxSpot") },
  { fx: "countdown", ic: "🔢", label: t("fxCountdown") },
  { fx: "ember", ic: "🌅", label: t("fxEmber") },
  { fx: "text", ic: "🔤", label: t("fxText") },
];
const SWATCHES = ["#8b5cf6", "#ec4899", "#ffc93c", "#34e89e", "#5c8aff", "#ffffff", "#ff5c5c"];

/** 🪄 פלייליסט הטייס האוטומטי — לוקים (אפקט+צורה) שמתחלפים לבד כל 8 תיבות, בנויים כמסע אנרגיה */
const PILOT_LOOKS: { fx: ShowFx; shape: ShowShape }[] = [
  { fx: "beat", shape: "full" },
  { fx: "tribal", shape: "full" },
  { fx: "beat", shape: "stripes" },
  { fx: "pulse", shape: "heart" },
  { fx: "beat", shape: "dancers" },
  { fx: "sparkle", shape: "full" },
  { fx: "beat", shape: "circle" },
  { fx: "wave", shape: "full" },
  { fx: "beat", shape: "star" },
  { fx: "tribal", shape: "bolt" },
];
const PILOT_BARS = 8; // מחליפים כל 8 תיבות (32 ביטים)

export default function ShowView({ room, me, conn, hub }: GameViewProps) {
  const isOperator = me === room.hostId;
  const [pos, setPos] = useState<{ r: number; c: number; maxR: number; maxC: number } | null>(null);
  const [count, setCount] = useState(0);
  const [activeFx, setActiveFx] = useState<ShowFx>("candles");
  const [shape, setShape] = useState<ShowShape>("full");
  const [text, setText] = useState("");
  const [bpm, setBpm] = useState(120);
  const [hint, setHint] = useState(true);
  const [tapCount, setTapCount] = useState(0);
  const [locked, setLocked] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [dimUi, setDimUi] = useState(1);
  const tapsRef = useRef<number[]>([]);
  const anchorRef = useRef<number | null>(null);
  const fxRef = useRef<FxState>({ fx: "candles", shape: "full", at: 0 });
  const dimRef = useRef(1);
  const lastLookRef = useRef<{ fx: ShowFx; color?: string }>({ fx: "candles" });
  const rndRef = useRef(Array.from(me).reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 997, 7) / 997);
  const screenRef = useRef<HTMLDivElement>(null);
  const shapeGRef = useRef<SVGGElement>(null);
  const previewRef = useRef<HTMLSpanElement>(null);
  // קונסולה: חושך מוגן בהחזקה + פיידר עוצמה (hooks תמיד ברמה העליונה)
  const offTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [arming, setArming] = useState(false);
  const faderRef = useRef<HTMLDivElement>(null);
  const lastDimSent = useRef(0);
  const lockHold = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 🪄 טייס אוטומטי: האוזן (מיקרופון) + החלפת לוקים אוטומטית
  const [pilot, setPilot] = useState(false);
  const [earState, setEarState] = useState<"off" | "listening" | "locked" | "none">("off");
  const [earBpm, setEarBpm] = useState(0);
  const pilotRef = useRef(false);
  const earRef = useRef<BeatEar | null>(null);
  const bpmRef = useRef(120);
  const shapeRef = useRef<ShowShape>("full");
  const textRef = useRef("");
  const rotIdx = useRef(0);
  const rotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEarSent = useRef(0);
  const [spotName, setSpotName] = useState(""); // שם הזוכה בזרקור — חיווי למפעיל
  // 📍 אזור ברחבה (שמאל/מרכז/ימין) — נותן x אמיתי לגלים גם בלי מושבים
  const [zone, setZone] = useState<number | null>(() => {
    const s = sessionStorage.getItem(`larik-zone-${room.code}`);
    return s === null ? null : Number(s);
  });
  const zoneRef = useRef<number | null>(zone);
  function pickZone(i: number | null) {
    setZone(i);
    zoneRef.current = i;
    if (i === null) sessionStorage.removeItem(`larik-zone-${room.code}`);
    else sessionStorage.setItem(`larik-zone-${room.code}`, String(i));
    vibrate(20);
  }
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { shapeRef.current = shape; }, [shape]);
  useEffect(() => { textRef.current = text; }, [text]);
  // ניקוי ביציאה מהמופע — מכבים מיקרופון וטיימרים
  useEffect(() => () => {
    pilotRef.current = false;
    earRef.current?.stop();
    if (rotTimer.current) clearTimeout(rotTimer.current);
  }, []);

  // אולם ממופה? המיקום מחושב לוקאלית מהכרטיס (גוש/שורה/מושב) — בלי תלות בשרת
  const venue = getVenue((room.gameConfig as { venue?: string } | undefined)?.venue);
  const ticketSeat = (() => {
    const saved = sessionStorage.getItem(`larik-seat-${room.code}`);
    if (!saved) return null;
    const parts = saved.split(",").map(Number);
    if (parts.length === 3) return { g: parts[0], r: parts[1], c: parts[2] };
    if (parts.length === 2) return { g: 1, r: parts[0], c: parts[1] };
    return null;
  })();
  const venueXY = venue && ticketSeat ? seatToXY(venue, ticketSeat.g - 1, ticketSeat.r, ticketSeat.c) : null;

  // בלי אולם ממופה — המושב מהכרטיס נשלח לשרת לרשת האוטומטית
  useEffect(() => {
    if (!isOperator && ticketSeat && !venue) conn.sendGame({ a: "sh_seat", r: ticketSeat.r, c: ticketSeat.c });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, room.code, isOperator]);

  useEffect(() => hub.subscribe((d, at) => {
    const m = d as ShowServerMsg;
    switch (m.a) {
      case "sh_pos": setPos({ r: m.r, c: m.c, maxR: m.maxR, maxC: m.maxC }); return;
      case "sh_count": setCount(m.total); return;
      case "sh_dim": dimRef.current = m.v; return;
      case "sh_fx":
        fxRef.current = { fx: m.fx, text: m.text, bpm: m.bpm, color: m.color, anchor: m.anchor, shape: m.shape ?? "full", at: at || conn.serverNow() };
        setActiveFx(m.fx);
        setShape(m.shape ?? "full");
        if (m.fx === "flash") vibrate(60);
        if (m.fx === "spot" && m.text === me) vibrate([80, 60, 200]); // 🎯 זכית! שתרגיש את זה
        return;
    }
  }), [hub, conn]);

  /* לולאת הרינדור של הפיקסל — כל פריים מחשבים את הצבע שלנו וממלאים מסך/צורה */
  const lastBeatRef = useRef(-1);
  useEffect(() => {
    if (isOperator) return;
    let raf = 0;
    const darkBg = `rgb(${DARK[0]},${DARK[1]},${DARK[2]})`;
    const step = () => {
      const el = screenRef.current;
      if (el) {
        let x = 0.5, y = 0.5;
        if (venueXY) { x = venueXY.x; y = venueXY.y; } // אולם ממופה — מיקום אמיתי
        else if (pos) { x = pos.maxC > 0 ? pos.c / pos.maxC : 0.5; y = pos.maxR > 0 ? 1 - pos.r / pos.maxR : 0.5; }
        if (!venueXY && zoneRef.current !== null) x = [0.17, 0.5, 0.83][zoneRef.current]; // אזור שנבחר ידנית — גלים אמיתיים בעמידה
        const now = conn.serverNow();
        const fx = fxRef.current;
        const d = dimRef.current;
        const win = fx.fx === "spot" && fx.text === me; // 🎯 אני זוכה הזרקור?
        const [r, g, b] = fxColor(fx, x, y, now, rndRef.current, win);
        const col = `rgb(${(r * d) | 0},${(g * d) | 0},${(b * d) | 0})`;
        const sh = fx.shape ?? "full";
        // צורה "מלא" = כל המסך; אחרת — רקע כהה והצורה מתמלאת. צובעים גם את html —
        // שכל פיקסל פיזי (כולל overscroll ואזורי safe-area) יהיה חלק מהמופע.
        const bg = sh === "full" ? col : darkBg;
        el.style.background = bg;
        document.documentElement.style.background = bg;
        if (sh !== "full" && shapeGRef.current) shapeGRef.current.style.color = col;
        // רטט על כל ביט (אנדרואיד; אייפון חוסם רטט בדפדפן) — במצב "לפי הקצב"
        if (fx.fx === "beat") {
          const period = 60000 / (fx.bpm ?? 120);
          const idx = Math.floor((now - (fx.anchor ?? fx.at)) / period);
          if (idx !== lastBeatRef.current) { lastBeatRef.current = idx; vibrate(35); }
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); document.documentElement.style.background = ""; };
  }, [isOperator, pos, conn, venueXY?.x, venueXY?.y]);

  /* תצוגה חיה קטנה בקונסולה — המפעיל רואה מה הקהל רואה עכשיו */
  useEffect(() => {
    if (!isOperator) return;
    let raf = 0;
    const step = () => {
      if (previewRef.current) {
        const d = dimRef.current;
        const [r, g, b] = fxColor(fxRef.current, 0.5, 0.5, conn.serverNow(), 0.42);
        previewRef.current.style.background = `rgb(${(r * d) | 0},${(g * d) | 0},${(b * d) | 0})`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [isOperator, conn]);

  useEffect(() => { const tm = setTimeout(() => setHint(false), 6000); return () => clearTimeout(tm); }, []);

  /* ---------- קונסולת המפעיל ---------- */
  if (isOperator) {
    const send = (fx: ShowFx, extra?: { color?: string; shape?: ShowShape }) =>
      conn.sendGame({
        a: "sh_set", fx, text: text.trim() || "✨", bpm,
        anchor: anchorRef.current ?? undefined, shape: extra?.shape ?? shape,
        ...(extra?.color !== undefined ? { color: extra.color } : {}),
      });
    function fire(fx: ShowFx, extra?: { color?: string }, momentary = false) {
      send(fx, extra);
      if (!momentary) lastLookRef.current = { fx, color: extra?.color };
      Sfx.pop(); vibrate(25);
      // הדיג'י התערב ידנית? הטייס מכבד — דוחה את ההחלפה האוטומטית הבאה במחזור מלא
      if (pilotRef.current && !momentary) {
        if (fx === "off") stopPilot(); // חושך = הדיג'י רוצה שקט; הטייס לא ידליק בחזרה
        else scheduleRotation();
      }
    }
    /* ---------- 🪄 טייס אוטומטי ---------- */
    function scheduleRotation(delayMs?: number) {
      if (rotTimer.current) clearTimeout(rotTimer.current);
      const beat = 60000 / (bpmRef.current || 120);
      let wait = delayMs ?? beat * PILOT_BARS * 4;
      // מיישרים את רגע ההחלפה לביט (אם יש עוגן) — המעבר מרגיש חלק מהמוזיקה
      const anc = anchorRef.current;
      if (anc != null && wait > beat) {
        const target = conn.serverNow() + wait;
        const off = (target - anc) % beat;
        wait += (beat - off) % beat;
      }
      rotTimer.current = setTimeout(() => {
        if (!pilotRef.current) return;
        const look = PILOT_LOOKS[rotIdx.current++ % PILOT_LOOKS.length];
        setShape(look.shape);
        shapeRef.current = look.shape;
        lastLookRef.current = { fx: look.fx };
        conn.sendGame({
          a: "sh_set", fx: look.fx, text: textRef.current.trim() || "✨",
          bpm: bpmRef.current, anchor: anchorRef.current ?? undefined, shape: look.shape,
        });
        scheduleRotation();
      }, wait);
    }
    function stopPilot() {
      pilotRef.current = false;
      setPilot(false);
      earRef.current?.stop();
      earRef.current = null;
      setEarState("off");
      if (rotTimer.current) { clearTimeout(rotTimer.current); rotTimer.current = null; }
    }
    async function togglePilot() {
      if (pilotRef.current) { stopPilot(); vibrate(20); return; }
      pilotRef.current = true;
      setPilot(true);
      Sfx.pop(); vibrate(40);
      // האוזן: מסנכרנת BPM+פאזה מהמיקרופון; אם אין הרשאה — ממשיכים לפי TAP/ידני
      const ear = new BeatEar((u) => {
        if (!pilotRef.current) return;
        if (!u.locked || u.bpm === 0) { setEarState("listening"); return; }
        setEarState("locked");
        setEarBpm(u.bpm);
        const nowMs = Date.now();
        // שולחים לקהל רק כשיש שינוי אמיתי או אחת ל-5 שניות (לתקן סחיפת פאזה)
        if (Math.abs(u.bpm - bpmRef.current) >= 2 || nowMs - lastEarSent.current > 5000) {
          lastEarSent.current = nowMs;
          const anchor = conn.serverNow() - u.msSinceBeat;
          anchorRef.current = anchor;
          bpmRef.current = u.bpm;
          setBpm(u.bpm);
          const p = lastLookRef.current;
          conn.sendGame({
            a: "sh_set", fx: p.fx, text: textRef.current.trim() || "✨",
            bpm: u.bpm, anchor, shape: shapeRef.current,
            ...(p.color !== undefined ? { color: p.color } : {}),
          });
        }
      });
      earRef.current = ear;
      setEarState("listening");
      // hook לבדיקות אוטומטיות: סטרים מוזרק במקום המיקרופון
      const fake = (window as unknown as { __larikMicStream?: MediaStream }).__larikMicStream;
      const ok = await ear.start(fake);
      if (!ok) setEarState("none");
      // יוצאים לדרך מיד עם הלוק הראשון בפלייליסט
      scheduleRotation(400);
    }
    /** 🎯 הגרלת זרקור — בוחרים זוכה אקראי מהקהל; הטלפון שלו זוהר בזהב וכולם דועכים */
    function fireSpot() {
      const cands = room.players.filter((p) => p.connected && p.id !== me);
      if (!cands.length) return;
      const w = cands[Math.floor(Math.random() * cands.length)];
      lastLookRef.current = { fx: "spot" };
      conn.sendGame({ a: "sh_set", fx: "spot", text: w.id, bpm, anchor: anchorRef.current ?? undefined, shape });
      setSpotName(`${w.emoji} ${w.name}`);
      setTimeout(() => setSpotName(""), 6000);
      Sfx.pop(); vibrate(30);
      if (pilotRef.current) scheduleRotation();
    }
    /** ⚡ הבזק רגעי (Flash): דולק כל עוד האצבע על הפד, בשחרור חוזרים ללוק הקודם */
    function flashDown() { fire("flash", undefined, true); }
    function flashUp() { const p = lastLookRef.current; send(p.fx, { color: p.color }); }
    /** 🌑 חושך (Blackout) — מוגן בהחזקה, שלא ייורה בטעות */
    function offDown() {
      setArming(true);
      offTimer.current = setTimeout(() => { setArming(false); fire("off"); vibrate(80); }, 400);
    }
    function offUp() { setArming(false); if (offTimer.current) { clearTimeout(offTimer.current); offTimer.current = null; } }
    /** בחירת צורה — נשלחת מיד עם הלוק הנוכחי */
    function pickShape(s: ShowShape) {
      setShape(s);
      const p = lastLookRef.current;
      conn.sendGame({
        a: "sh_set", fx: p.fx, text: text.trim() || "✨", bpm,
        anchor: anchorRef.current ?? undefined, shape: s,
        ...(p.color !== undefined ? { color: p.color } : {}),
      });
      Sfx.pop(); vibrate(20);
    }
    // 🎵 Tap-Tempo — המפעיל מקיש בקצב השיר; מחשבים BPM + עוגן פאזה בזמן-שרת
    function tapBeat() {
      const now = conn.serverNow();
      const taps = tapsRef.current;
      if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0; // הפסקה = מתחילים למדוד מחדש
      taps.push(now);
      if (taps.length > 8) taps.shift();
      vibrate(20);
      if (taps.length >= 4) {
        const gaps = taps.slice(1).map((t, i) => t - taps[i]);
        const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const newBpm = Math.max(50, Math.min(200, Math.round(60000 / avg)));
        setBpm(newBpm);
        anchorRef.current = now; // ההקשה האחרונה = ביט אמיתי של המוזיקה
        lastLookRef.current = { fx: "beat" };
        conn.sendGame({ a: "sh_set", fx: "beat", text: "", bpm: newBpm, anchor: now, shape });
      }
      setTapCount(taps.length);
    }
    /* פיידר עוצמה ראשי (Grand Master) — גרירה אנכית, כמו בקונסולת תאורה */
    function faderMove(clientY: number) {
      const el = faderRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const v = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
      setDimUi(v);
      dimRef.current = v;
      const now = Date.now();
      if (now - lastDimSent.current > 120) { lastDimSent.current = now; conn.sendGame({ a: "sh_dim", v: Math.round(v * 100) / 100 }); }
    }
    function faderEnd() { conn.sendGame({ a: "sh_dim", v: Math.round(dimRef.current * 100) / 100 }); }

    return (
      <div className="sc-root" onContextMenu={(e) => e.preventDefault()}>
        {/* שורת מצב עליונה — קבועה */}
        <div className="sc-head">
          <span className="sc-preview" ref={previewRef} />
          <b style={{ fontSize: 16 }}>🕯️</b>
          <span className="chip" style={{ fontSize: 12 }}>🔦 {count}</span>
          <span style={{ flex: 1 }} />
          <button className="chip sc-chipbtn" onClick={() => setSheet(true)}>🎚️ {bpm} BPM</button>
          <button className="chip sc-chipbtn" onClick={() => setLocked(true)}>🔓</button>
        </div>

        {/* 🪄 טייס אוטומטי — כפתור אחד והמופע מנהל את עצמו */}
        <button className={"sc-pilot" + (pilot ? " on" : "")} onPointerDown={togglePilot}>
          {!pilot ? (
            <>{t("pilotOff")} <span className="sc-pilot-sub">{t("pilotOffSub")}</span></>
          ) : earState === "locked" ? (
            <>{t("pilotHear")} · {earBpm} BPM ✓ <span className="sc-pilot-sub">{t("pilotHearSub")}</span></>
          ) : earState === "listening" ? (
            <>{t("pilotListen")} <span className="sc-pilot-sub">{t("pilotListenSub")} {bpm} BPM</span></>
          ) : (
            <>{t("pilotNoMic")} <span className="sc-pilot-sub">{t("pilotNoMicSub")} {bpm} BPM</span></>
          )}
        </button>

        <div className="sc-live">
          {/* אזור הפדים — בלי שום גלילה */}
          <div className="sc-main">
            <div className="sc-grid">
              {PADS.map((p) => (
                <button key={p.fx} className={"sc-pad" + (activeFx === p.fx ? " on" : "") + (p.fx === "candles" ? " safe" : "")}
                  onPointerDown={() => (p.fx === "text" ? setSheet(true) : p.fx === "spot" ? fireSpot() : fire(p.fx))}>
                  <span className="ic">{p.ic}</span>{p.label}
                </button>
              ))}
            </div>

            {/* צורות — מה נדלק על מסכי הקהל */}
            <div className="sc-shapes">
              {SHAPES.map((sh) => (
                <button key={sh.s} className={"sc-shape" + (shape === sh.s ? " on" : "")}
                  onPointerDown={() => pickShape(sh.s)} aria-label={sh.label}>
                  <ShapeIcon s={sh.s} />
                  <span>{sh.label}</span>
                </button>
              ))}
            </div>

            {/* צבע אחיד — לחיצה = כל הקהל בצבע (בצורה הנבחרת) */}
            <div className="sc-colors">
              {SWATCHES.map((c) => (
                <button key={c} className={"sc-sw" + (activeFx === "color" && fxRef.current.color === c ? " on" : "")}
                  style={{ background: c }} onPointerDown={() => fire("color", { color: c })} />
              ))}
            </div>

            {/* שורה תחתונה קבועה: TAP באגודל · הבזק רגעי · חושך מוגן */}
            <div className="sc-bottom">
              <button className="sc-pad sc-tap" onPointerDown={tapBeat}>
                <span className="ic">🥁</span>
                TAP{tapCount > 0 && tapCount < 4 ? ` · ${4 - tapCount}` : anchorRef.current ? " ✓" : ""}
              </button>
              <button className="sc-pad sc-flash" onPointerDown={flashDown} onPointerUp={flashUp} onPointerLeave={flashUp}>
                <span className="ic">⚡</span>{t("flash")}
              </button>
              <button className={"sc-pad sc-off" + (arming ? " arming" : "") + (activeFx === "off" ? " on" : "")}
                onPointerDown={offDown} onPointerUp={offUp} onPointerLeave={offUp}>
                <span className="ic">🌑</span>{arming ? t("arming") : t("off")}
              </button>
            </div>
          </div>

          {/* פיידר עוצמה ראשי — Grand Master + כפתור חזרה מיידית ל-100% */}
          <div className="sc-fader-col">
            <button className="sc-fader-max"
              onPointerDown={() => { setDimUi(1); dimRef.current = 1; conn.sendGame({ a: "sh_dim", v: 1 }); vibrate(20); }}>
              {t("faderMax")}
            </button>
            <div className="sc-fader" ref={faderRef}
              onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); faderMove(e.clientY); }}
              onPointerMove={(e) => e.buttons > 0 && faderMove(e.clientY)}
              onPointerUp={faderEnd}>
              <div className="sc-fader-fill" style={{ height: `${dimUi * 100}%` }} />
              <span className="sc-fader-label">{Math.round(dimUi * 100)}%</span>
            </div>
          </div>
        </div>

        {/* 🎯 חיווי הזוכה בזרקור */}
        {spotName && <div className="sc-spotname popin">{t("spotOn")} <b>{spotName}</b></div>}

        {/* גיליון "עוד": טקסט רץ + BPM ידני */}
        {sheet && (
          <div className="sc-sheet popin">
            <div className="sub" style={{ marginBottom: 6 }}>{t("sheetTextLabel")}</div>
            <input className="input" placeholder={t("sheetTextPh")} maxLength={24}
              value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn gold" style={{ marginTop: 8, padding: 12 }}
              onPointerDown={() => { fire("text"); setSheet(false); }}>
              {t("sheetSend")}
            </button>
            <div className="sub" style={{ margin: "14px 0 6px" }}>{t("sheetBpm")} {bpm}</div>
            <input type="range" min={60} max={180} value={bpm} style={{ width: "100%", accentColor: "var(--pink)" }}
              onChange={(e) => { setBpm(Number(e.target.value)); anchorRef.current = null; }} />
            <button className="btn ghost" style={{ marginTop: 14 }} onClick={() => setSheet(false)}>{t("sheetClose")}</button>
          </div>
        )}

        {/* מסך נעול — שהקונסולה לא תירה מהכיס. החזקה ארוכה משחררת */}
        {locked && (
          <button className="sc-lock"
            onPointerDown={() => { lockHold.current = setTimeout(() => setLocked(false), 600); }}
            onPointerUp={() => { if (lockHold.current) clearTimeout(lockHold.current); }}
            onPointerLeave={() => { if (lockHold.current) clearTimeout(lockHold.current); }}>
            <span style={{ fontSize: 44 }}>🔒</span>
            <b>{t("lockTitle")}</b>
            <span className="sub">{t("lockSub")}</span>
          </button>
        )}
      </div>
    );
  }

  /* ---------- מסך הפיקסל (הצופה) ---------- */
  const viewerShape = shape !== "full" ? shape : null;
  return (
    <div ref={screenRef} className="fullscreen" style={{ background: "#10081e", transition: "none" }}
      onClick={() => { document.documentElement.requestFullscreen?.().catch(() => { /* iOS */ }); }}>
      {viewerShape && (
        <svg className="sc-viewer-shape" viewBox="0 0 100 100"
          preserveAspectRatio={viewerShape === "stripes" ? "none" : "xMidYMid meet"}>
          <g ref={shapeGRef} style={{ color: "#10081e" }}>
            {/* הילה — אותה צורה, מוגדלת ושקופה, מאחורי הצורה הראשית */}
            <g transform="translate(50 50) scale(1.13) translate(-50 -50)" opacity="0.25">{shapeNodes(viewerShape)}</g>
            {shapeNodes(viewerShape)}
          </g>
        </svg>
      )}
      {hint && (
        <div className="popin" style={{ textAlign: "center", padding: 20, background: "#000a", borderRadius: 20, zIndex: 3 }}>
          <div style={{ fontSize: 40 }}>🔆</div>
          <div style={{ fontWeight: 900, fontSize: 18, marginTop: 6 }}>{t("hintTitle")}</div>
          <p className="sub" style={{ marginTop: 6 }}>{t("hintBody")}<br />
            <span style={{ fontSize: 11.5 }}>{t("hintTap")}</span></p>
        </div>
      )}
      {/* 🎯 זכית בזרקור! */}
      {activeFx === "spot" && fxRef.current.text === me && (
        <div className="popin" style={{ textAlign: "center", zIndex: 4, textShadow: "0 2px 18px #000" }}>
          <div style={{ fontSize: 56 }}>🎉</div>
          <div style={{ fontWeight: 900, fontSize: 26, color: "#3a2a00" }}>{t("spotWin")}</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#3a2a00" }}>{t("spotWinSub")}</div>
        </div>
      )}
      {/* 📍 בחירת אזור — נותנת לגלים כיוון אמיתי גם בלי מושבים */}
      {!venueXY && zone === null && !hint && (
        <div className="sc-zone popin">
          <span className="sc-zone-q">{t("zoneQ")}</span>
          <div className="sc-zone-btns">
            <button onPointerDown={() => pickZone(0)}>{t("zoneL")}</button>
            <button onPointerDown={() => pickZone(1)}>{t("zoneC")}</button>
            <button onPointerDown={() => pickZone(2)}>{t("zoneR")}</button>
          </div>
        </div>
      )}
      {!venueXY && zone !== null && (
        <button className="sc-zone-chip" onPointerDown={() => pickZone(null)}>
          📍 {[t("zoneL"), t("zoneC"), t("zoneR")][zone]}
        </button>
      )}
      {!hint && (venueXY && ticketSeat ? (
        <span style={{ position: "fixed", bottom: 10, right: "50%", transform: "translateX(50%)", fontSize: 10, color: "#ffffff55", zIndex: 5 }}>
          {venue!.sections[ticketSeat.g - 1]?.name ?? ""} · שורה {ticketSeat.r} · מושב {ticketSeat.c}
        </span>
      ) : pos ? (
        <span style={{ position: "fixed", bottom: 10, right: "50%", transform: "translateX(50%)", fontSize: 10, color: "#ffffff55", zIndex: 5 }}>
          {pos.r + 1}·{pos.c + 1}
        </span>
      ) : null)}
    </div>
  );
}
