/**
 * "מופע" 🕯️ — צד לקוח.
 * מפעיל (המארח): קונסולה עם פדים של אפקטים.
 * כל טלפון אחר: פיקסל — כל המסך צבע אחד, מחושב לוקאלית: צבע = f(x, y, t מסונכרן).
 * האפקט מגיע כ-cue — כולם מחליפים באותה מילישנייה; מכאן והלאה אפס תלות ברשת.
 */
import { useEffect, useRef, useState } from "react";
import type { ShowServerMsg, ShowFx } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";
import { getVenue, seatToXY } from "../venues";

/* ---------- מנוע האפקטים: צבע = f(x, y, t) ---------- */
interface FxState { fx: ShowFx; text?: string; bpm?: number; color?: string; at: number }

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
  c.font = `900 ${size}px Rubik, Arial`;
  const w = c.measureText(str).width;
  if (w > 210) { size = Math.max(18, Math.floor(size * 210 / w)); c.font = `900 ${size}px Rubik, Arial`; }
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

/** הפונקציה שכל טלפון מריץ — זהה לסימולטור, רק שכאן הפיקסל הוא כל המסך */
export function fxColor(fx: FxState, x: number, y: number, now: number, rnd: number): [number, number, number] {
  const t = Math.max(0, (now - fx.at) / 1000);
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
      const n = 9 - Math.floor(t % 10);
      renderBitmap(String(n));
      const frac = 1 - (t % 1);
      return sampleBitmap(x, 1 - y) ? [255, 201 * frac + 54, 60] : DARK;
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
  }
  return DARK;
}

/* ---------- הקונסולה והפיקסל ---------- */
const PADS: { fx: ShowFx; label: string }[] = [
  { fx: "candles", label: "🕯️ נרות" },
  { fx: "wave", label: "🌊 גל" },
  { fx: "pulse", label: "💓 פעימות" },
  { fx: "text", label: "🔤 טקסט רץ" },
  { fx: "heart", label: "❤️ לב" },
  { fx: "countdown", label: "🔢 ספירה" },
  { fx: "sparkle", label: "✨ נצנוץ" },
  { fx: "tribal", label: "🥁 מקצב שבטי" },
  { fx: "sections", label: "🏟️ יציעים" },
  { fx: "flash", label: "⚡ הבזק" },
  { fx: "off", label: "🌑 חושך" },
];
const SWATCHES = ["#8b5cf6", "#ec4899", "#ffc93c", "#34e89e", "#5c8aff", "#ffffff", "#ff5c5c"];

export default function ShowView({ room, me, conn, hub }: GameViewProps) {
  const isOperator = me === room.hostId;
  const [pos, setPos] = useState<{ r: number; c: number; maxR: number; maxC: number } | null>(null);
  const [count, setCount] = useState(0);
  const [activeFx, setActiveFx] = useState<ShowFx>("candles");
  const [text, setText] = useState("");
  const [bpm, setBpm] = useState(120);
  const [hint, setHint] = useState(true);
  const fxRef = useRef<FxState>({ fx: "candles", at: 0 });
  const rndRef = useRef(Array.from(me).reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 997, 7) / 997);
  const screenRef = useRef<HTMLDivElement>(null);

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
      case "sh_fx":
        fxRef.current = { fx: m.fx, text: m.text, bpm: m.bpm, color: m.color, at: at || conn.serverNow() };
        setActiveFx(m.fx);
        if (m.fx === "flash") vibrate(60);
        return;
    }
  }), [hub, conn]);

  // לולאת הרינדור של הפיקסל — כל פריים מחשבים את הצבע שלנו
  useEffect(() => {
    if (isOperator) return;
    let raf = 0;
    const step = () => {
      const el = screenRef.current;
      if (el) {
        let x = 0.5, y = 0.5, has = false;
        if (venueXY) { x = venueXY.x; y = venueXY.y; has = true; } // אולם ממופה — מיקום אמיתי
        else if (pos) { x = pos.maxC > 0 ? pos.c / pos.maxC : 0.5; y = pos.maxR > 0 ? 1 - pos.r / pos.maxR : 0.5; has = true; }
        if (has) {
          const [r, g, b] = fxColor(fxRef.current, x, y, conn.serverNow(), rndRef.current);
          el.style.background = `rgb(${r | 0},${g | 0},${b | 0})`;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [isOperator, pos, conn, venueXY?.x, venueXY?.y]);

  useEffect(() => { const tm = setTimeout(() => setHint(false), 6000); return () => clearTimeout(tm); }, []);

  /* ---------- מסך המפעיל ---------- */
  if (isOperator) {
    function fire(fx: ShowFx, extra?: { color?: string }) {
      conn.sendGame({ a: "sh_set", fx, text: text.trim() || "✨", bpm, ...extra });
      Sfx.pop(); vibrate(25);
    }
    return (
      <main style={{ minHeight: "100dvh", padding: "60px 16px 20px" }}>
        <h1 className="brand" style={{ textAlign: "center" }}>מופע 🕯️</h1>
        <p className="sub" style={{ textAlign: "center", marginBottom: 14 }}>
          🔦 {count} טלפונים מחוברים · האפקטים מוחלפים אצל כולם בו-זמנית
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {PADS.map((p) => (
            <button key={p.fx} className={"btn" + (activeFx === p.fx ? "" : " ghost")}
              style={{ padding: 14, fontSize: 15 }}
              onPointerDown={() => fire(p.fx)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="card" style={{ marginTop: 12, padding: 12 }}>
          <div className="sub" style={{ marginBottom: 6 }}>טקסט שירוץ על הקהל:</div>
          <input className="input" placeholder="למשל: שם השיר / אני אוהב אתכם" maxLength={24}
            value={text} onChange={(e) => setText(e.target.value)} style={{ textAlign: "right" }} />
          <button className="btn gold" style={{ marginTop: 8, padding: 12 }} onPointerDown={() => fire("text")}>
            🔤 שגר את הטקסט
          </button>
        </div>
        <div className="card" style={{ marginTop: 10, padding: 12 }}>
          <div className="sub" style={{ marginBottom: 6 }}>קצב (BPM לפעימות): {bpm}</div>
          <input type="range" min={60} max={180} value={bpm} style={{ width: "100%", accentColor: "var(--pink)" }}
            onChange={(e) => setBpm(Number(e.target.value))} />
          <div className="sub" style={{ margin: "10px 0 6px" }}>צבע אחיד:</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SWATCHES.map((c) => (
              <button key={c} onPointerDown={() => fire("color", { color: c })}
                style={{ width: 40, height: 40, borderRadius: 12, border: "2px solid var(--line2)", background: c }} />
            ))}
          </div>
        </div>
      </main>
    );
  }

  /* ---------- מסך הפיקסל ---------- */
  return (
    <div ref={screenRef} className="fullscreen" style={{ background: "#10081e", transition: "none" }}>
      {hint && (
        <div className="popin" style={{ textAlign: "center", padding: 20, background: "#000a", borderRadius: 20 }}>
          <div style={{ fontSize: 40 }}>🔆</div>
          <div style={{ fontWeight: 900, fontSize: 18, marginTop: 6 }}>תרימו בהירות למקסימום!</div>
          <p className="sub" style={{ marginTop: 6 }}>החזיקו את הטלפון גבוה — אתם חלק מהמופע ✨</p>
        </div>
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
