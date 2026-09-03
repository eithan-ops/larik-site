/**
 * התהום 🕳️ — ציור קנבס טהור: "נייר גזור בתהום".
 * כל חפץ = מדבקה: מתאר דיו בעובי קבוע, צל קשיח, שני גווני cel ו-rim light מכיוון קבוע (למעלה-שמאל).
 * בלי React, בלי רשת. הקורא מעביר מבט (AbView) ומה לצייר.
 */
import { AB, abRng, abMovingX } from "../../../shared/abyss";
import type { AbObstacle, AbCrystal, AbThrowObj } from "../../../shared/abyss";
import { abImg, abReady, biomeOf } from "./abyssAssets";

export const AB_WALL = 6;                 // רוחב הקיר המצויר בכל צד (יחידות)
export const INK = "#0C0906";
export const PAPER = "#FFF3DC";
export const CYAN = "#38C8E8", CYAN_HI = "#8FE9F5", CYAN_LO = "#1E8FA6";
export const GOLD = "#FFC531", GOLD_HI = "#FFE08A", GOLD_LO = "#B8860B";
export const RED = "#FF4438", GREEN = "#2ED47A";
export const PCOL = ["#FF8A3D", "#5AC8FA", "#46E0C0", "#F2C14E", "#E5484D", "#B37BE0", "#8ee34a", "#FF6FB5"];
const LINE = 2.5;

export interface AbView { W: number; H: number; ppu: number; py: number }
export function makeView(W: number, H: number, pyFrac: number): AbView {
  return { W, H, ppu: W / (AB.W + 2 * AB_WALL), py: H * pyFrac };
}
export const sx = (v: AbView, x: number) => (x + AB_WALL) * v.ppu;
export const sy = (v: AbView, D: number, depth: number) => v.py + (D - depth) * v.ppu;
export const visTop = (v: AbView, depth: number) => depth - v.py / v.ppu;
export const visBottom = (v: AbView, depth: number) => depth + (v.H - v.py) / v.ppu;

/* ---- פלטת עומק — עוגן לכל ביום: 🌱 שורשים → 💜 גבישים → 🧊 קרח → 🌋 לבה ---- */
const PAL = [
  { bg0: "#1B2246", bg1: "#141838", wall: "#262C5C", wallLo: "#1A1F45", wallHi: "#3A4380", back: "#10132C" },   // שורשים (k0-1)
  { bg0: "#241A44", bg1: "#1A1233", wall: "#332457", wallLo: "#241A40", wallHi: "#4B3A7A", back: "#150E28" },   // מערת הגבישים (k2-3)
  { bg0: "#0F2436", bg1: "#0A1826", wall: "#1C3A50", wallLo: "#122A3C", wallHi: "#3A6884", back: "#081420" },   // הקרח (k4-5)
  { bg0: "#1A0B0B", bg1: "#0E0505", wall: "#2E1414", wallLo: "#1E0C0C", wallHi: "#6E2A1A", back: "#0A0404" },   // הלבה (k6+)
];
function lerpHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}
export function palette(kf: number) {
  const { i, f } = biomeOf(kf);
  const A = PAL[i], B = PAL[Math.min(3, i + 1)];
  const mix = (key: keyof typeof A) => lerpHex(A[key], B[key], f);
  return { bg0: mix("bg0"), bg1: mix("bg1"), wall: mix("wall"), wallLo: mix("wallLo"), wallHi: mix("wallHi"), back: mix("back") };
}
const BG_KEYS = ["bg0", "bg1", "bg2", "bg3"] as const;
const WALL_KEYS = ["wallTex0", "wallTex1", "wallTex2", "wallTex3"] as const;

/* ---- מטמון ספרייטים ---- */
const sprites = new Map<string, HTMLCanvasElement>();
function sprite(key: string, w: number, h: number, dpr: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): HTMLCanvasElement {
  const k = `${key}|${w}|${h}|${dpr}`;
  let cv = sprites.get(k);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr);
    const c = cv.getContext("2d")!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(c, w, h);
    sprites.set(k, cv);
  }
  return cv;
}

function hexagon(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0) {
  c.beginPath();
  for (let i = 0; i < 6; i++) { const a = rot + (i / 6) * Math.PI * 2; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
  c.closePath();
}

/** גביש / אבן חן עם הילה אפויה */
export function crystalSprite(gem: boolean, r: number, dpr: number): HTMLCanvasElement {
  const pad = r * 2.2, size = r * 2 + pad * 2;
  return sprite(gem ? "gem" : "cry", size, size, dpr, (c, w) => {
    const cx = w / 2, cy = w / 2;
    const [base, hi, lo] = gem ? [GOLD, GOLD_HI, GOLD_LO] : [CYAN, CYAN_HI, CYAN_LO];
    const glow = c.createRadialGradient(cx, cy, r * 0.6, cx, cy, r + pad);
    glow.addColorStop(0, gem ? "rgba(255,197,49,.55)" : "rgba(56,200,232,.55)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = glow; c.fillRect(0, 0, w, w);
    // צל קשיח
    hexagon(c, cx - 1.5, cy + 2, r, Math.PI / 6); c.fillStyle = INK; c.fill();
    hexagon(c, cx, cy, r, Math.PI / 6); c.fillStyle = base; c.fill();
    // פאה כהה למטה-ימין
    c.save(); hexagon(c, cx, cy, r, Math.PI / 6); c.clip();
    c.fillStyle = lo; c.beginPath(); c.moveTo(cx + r, cy - r); c.lineTo(cx + r, cy + r); c.lineTo(cx - r, cy + r); c.closePath(); c.fill();
    c.fillStyle = hi; c.beginPath(); c.moveTo(cx - r * 0.6, cy - r * 0.9); c.lineTo(cx + r * 0.1, cy - r * 0.9); c.lineTo(cx - r * 0.55, cy - r * 0.1); c.closePath(); c.fill();
    c.restore();
    hexagon(c, cx, cy, r, Math.PI / 6); c.lineWidth = Math.max(1.5, LINE * 0.8); c.strokeStyle = INK; c.stroke();
  });
}

/** סלע גזור — עיגול לא-מושלם עם cel ו-rim */
export function rockSprite(variant: number, r: number, dpr: number): HTMLCanvasElement {
  const pad = 6, size = r * 2 + pad * 2;
  return sprite(`rock${variant}`, size, size, dpr, (c, w) => {
    const rng = abRng(`rock-${variant}`);
    const cx = w / 2, cy = w / 2, n = 11;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const rr = r * (0.9 + rng() * 0.16); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    const path = (ox: number, oy: number, s = 1) => { c.beginPath(); pts.forEach(([px, py], i) => { if (i) c.lineTo(cx + ox + px * s, cy + oy + py * s); else c.moveTo(cx + ox + px * s, cy + oy + py * s); }); c.closePath(); };
    path(-2, 3); c.fillStyle = INK; c.fill();                          // צל קשיח
    path(0, 0); c.fillStyle = "#5B5878"; c.fill();
    c.save(); path(0, 0); c.clip();
    c.fillStyle = "#3E3B55"; c.beginPath(); c.arc(cx + r * 0.45, cy + r * 0.45, r * 1.05, 0, Math.PI * 2); c.fill();   // רצועת צל
    c.fillStyle = "#5B5878"; c.beginPath(); c.arc(cx - r * 0.15, cy - r * 0.15, r * 0.95, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#9A96BE"; c.lineWidth = 2; c.beginPath(); c.arc(cx - r * 0.05, cy - r * 0.05, r * 0.72, Math.PI * 1.05, Math.PI * 1.6); c.stroke();   // rim
    c.restore();
    path(0, 0); c.lineWidth = LINE; c.strokeStyle = INK; c.stroke();
  });
}

/* ---- רקע וקירות ---- */
export function drawBackdrop(c: CanvasRenderingContext2D, v: AbView, kf: number, dpr: number, depth = 0) {
  const p = palette(kf);
  const g = c.createLinearGradient(0, 0, 0, v.H);
  g.addColorStop(0, p.bg0); g.addColorStop(1, p.bg1);
  c.fillStyle = g; c.fillRect(0, 0, v.W, v.H);
  // 🖼️ רקע הביום (Higgsfield) — נגלל בפרלקסה איטית, עם מעבר הדרגתי לביום הבא
  const { i, f } = biomeOf(kf);
  const drawBg = (key: (typeof BG_KEYS)[number], alpha: number) => {
    if (alpha <= 0.01 || !abReady(key)) return;
    const im = abImg(key);
    const scale = v.W / im.naturalWidth;
    const ih = im.naturalHeight * scale;
    const off = ((depth * v.ppu * 0.22) % ih + ih) % ih;   // פרלקסה: הרקע זז לאט מהעולם
    c.save();
    c.globalAlpha = alpha;
    c.drawImage(im, 0, -off, v.W, ih);
    c.drawImage(im, 0, -off + ih, v.W, ih);                // עטיפה אנכית
    c.restore();
  };
  drawBg(BG_KEYS[i], 0.5 * (1 - f));
  if (f > 0) drawBg(BG_KEYS[Math.min(3, i + 1)], 0.5 * f);
  // נקודות הדפסה עדינות
  const dots = sprite("dots", 26, 26, dpr, (cc) => { cc.fillStyle = "rgba(255,255,255,.045)"; cc.beginPath(); cc.arc(1.5, 1.5, 1.3, 0, Math.PI * 2); cc.fill(); cc.beginPath(); cc.arc(14.5, 14.5, 1.3, 0, Math.PI * 2); cc.fill(); });
  const pat = c.createPattern(dots, "repeat");
  if (pat) { c.fillStyle = pat; c.fillRect(0, 0, v.W, v.H); }
}

/** קירות strata משוננים משני הצדדים + שכבת פרלקסה אחורית */
export function drawWalls(c: CanvasRenderingContext2D, v: AbView, seed: string, depth: number, kf: number, reduced: boolean) {
  const p = palette(kf);
  const top = visTop(v, depth), bottom = visBottom(v, depth);
  const STEP = 22;
  const edge = (side: -1 | 1, d: number, scale: number) => {
    const i = Math.floor(d / STEP);
    const r = abRng(`${seed}|w${side}|${i}`);
    return (1.2 + r() * 3.2) * scale;   // כמה הקיר נכנס פנימה
  };
  const poly = (side: -1 | 1, scale: number, depthScale: number, fill: string | CanvasPattern, stroke: string | null, hi: string | null) => {
    const dsc = depth * depthScale;
    const t0 = Math.floor((top * depthScale - STEP) / STEP) * STEP, t1 = bottom * depthScale + STEP;
    c.beginPath();
    const baseX = side < 0 ? 0 : v.W;
    c.moveTo(baseX, -10);
    const pts: [number, number][] = [];
    for (let d = t0; d <= t1; d += STEP) {
      const e = edge(side, d, scale);
      const xu = side < 0 ? -AB_WALL + e : AB.W + AB_WALL - e;
      const x = sx(v, xu), y = v.py + (d - dsc) * v.ppu;
      pts.push([x, y]);
    }
    // קצוות משוננים: זיגזג בין נקודות
    pts.forEach(([x, y], i) => {
      if (i === 0) c.lineTo(x, y - STEP * v.ppu * 0.5);
      const nx = side < 0 ? x - 2 : x + 2;
      c.lineTo(nx, y - STEP * v.ppu * 0.25); c.lineTo(x, y);
    });
    c.lineTo(baseX, v.H + 10); c.closePath();
    c.fillStyle = fill; c.fill();
    if (stroke) { c.lineWidth = LINE; c.strokeStyle = stroke; c.stroke(); }
    if (hi) {
      c.strokeStyle = hi; c.lineWidth = 1.5; c.beginPath();
      pts.forEach(([x, y], i) => { const hx = side < 0 ? x - 1.5 : x + 1.5; if (i) c.lineTo(hx, y); else c.moveTo(hx, y); });
      c.stroke();
    }
  };
  if (!reduced) { poly(-1, 1.9, 0.6, p.back, null, null); poly(1, 1.9, 0.6, p.back, null, null); }
  poly(-1, 1, 1, p.wall, INK, p.wallHi);
  poly(1, 1, 1, p.wall, INK, p.wallHi);
  // 🧱 טקסטורת הביום על הקירות (Higgsfield) — נגללת עם העולם, מתחלפת בין ביומים
  const { i: bi, f: bf } = biomeOf(kf);
  const tex = (key: (typeof WALL_KEYS)[number], alpha: number) => {
    if (alpha <= 0.01 || !abReady(key)) return;
    const im = abImg(key);
    const pat = c.createPattern(im, "repeat");
    if (!pat) return;
    const s = (v.W * 0.5) / im.naturalWidth;
    const th = im.naturalHeight * s;
    pat.setTransform(new DOMMatrix().translate(0, -(((depth * v.ppu) % th + th) % th)).scale(s));
    c.save(); c.globalAlpha = alpha;
    poly(-1, 1, 1, pat, null, null);
    poly(1, 1, 1, pat, null, null);
    c.restore();
  };
  tex(WALL_KEYS[bi], 0.38 * (1 - bf));
  if (bf > 0) tex(WALL_KEYS[Math.min(3, bi + 1)], 0.38 * bf);
}

/** מדף הסלע — מדף strata לרוחב הפיר */
export function drawLedge(c: CanvasRenderingContext2D, v: AbView, depth: number, ledgeDepth: number, kf: number, label: string, floor: boolean) {
  const y = sy(v, ledgeDepth, depth) + AB.PLAYER_R * v.ppu * 0.9;
  if (y < -40 || y > v.H + 40) return;
  const p = palette(kf);
  const h = 12 * v.ppu;
  c.fillStyle = INK; c.fillRect(-4, y + 4, v.W + 8, h);
  c.fillStyle = floor ? "#2A5F66" : p.wallHi; c.fillRect(-4, y, v.W + 8, h);
  c.fillStyle = floor ? "#1E8FA6" : p.wall; c.fillRect(-4, y + h * 0.35, v.W + 8, h * 0.65);
  // 🪨 טקסטורת מדף מצוירת (Higgsfield) — נמתחת לרוחב הפס
  if (abReady("ledgeTex")) {
    const im = abImg("ledgeTex");
    const tw = h * (im.naturalWidth / im.naturalHeight);
    c.save(); c.globalAlpha = 0.85;
    for (let tx = -4; tx < v.W + 4; tx += tw) c.drawImage(im, tx, y, tw, h);
    c.restore();
  }
  c.lineWidth = LINE; c.strokeStyle = INK; c.beginPath(); c.moveTo(-4, y); c.lineTo(v.W + 4, y); c.stroke();
  // חריצים
  c.strokeStyle = "rgba(0,0,0,.35)"; c.lineWidth = 1.5;
  for (let x = 12; x < v.W; x += 34) { c.beginPath(); c.moveTo(x, y + h * 0.4); c.lineTo(x + 14, y + h * 0.4); c.stroke(); }
  if (floor) {
    // מצע גבישים זוהר
    for (let x = 10; x < v.W; x += 24) { const s = crystalSprite(false, 6, 2); c.drawImage(s, x - s.width / 4, y - 10, s.width / 2, s.height / 2); }
  }
  c.font = `700 ${Math.max(11, 4.2 * v.ppu)}px Assistant, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.direction = "rtl";
  c.fillStyle = "rgba(255,243,220,.85)"; c.fillText(label, v.W / 2, y + h * 0.6);
}

/* ---- מכשולים ---- */
export function drawObstacle(c: CanvasRenderingContext2D, v: AbView, o: AbObstacle, depth: number, tauSec: number, time: number, dpr: number) {
  const ox = abMovingX(o, tauSec);
  const x = sx(v, ox), y = sy(v, o.d, depth);
  if (o.kind === 0) {
    const r = o.w * v.ppu;
    const key = (["rock0", "rock1", "rock2"] as const)[o.id % 3];
    if (abReady(key)) {
      // 🪨 סלע מצויר (Higgsfield) — סיבוב קבוע לפי id, שכל סלע ייראה קצת אחרת
      const im = abImg(key);
      const d2 = r * 2.3, rot = ((o.id * 137) % 360) * (Math.PI / 180);
      c.save(); c.translate(x, y); c.rotate(rot);
      c.drawImage(im, -d2 / 2, -d2 / 2 * (im.naturalHeight / im.naturalWidth), d2, d2 * (im.naturalHeight / im.naturalWidth));
      c.restore();
      return;
    }
    const s = rockSprite(o.id % 3, Math.round(r), dpr);
    const half = s.width / dpr / 2;
    c.drawImage(s, x - half, y - half, s.width / dpr, s.height / dpr);
    return;
  }
  if (o.kind === 1) {
    if (abReady("spike")) {
      // 🧗 זיז סלע מצויר — נמתח למידות המכשול
      const im = abImg("spike");
      const w = o.w * v.ppu * 2.25, h = o.h * v.ppu * 2.25;
      c.drawImage(im, x - w / 2, y - h / 2, w, h);
      return;
    }
    const w = o.w * v.ppu, h = o.h * v.ppu;
    c.fillStyle = INK; roundRect(c, x - w - 2, y - h + 4, w * 2, h * 2, 6); c.fill();
    c.fillStyle = "#3B3760"; roundRect(c, x - w, y - h, w * 2, h * 2, 6); c.fill();
    c.fillStyle = "#2A2748"; roundRect(c, x - w, y, w * 2, h, 6); c.fill();
    c.strokeStyle = "#6E68A0"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - w + 6, y - h + 3); c.lineTo(x + w - 6, y - h + 3); c.stroke();
    c.lineWidth = LINE; c.strokeStyle = INK; roundRect(c, x - w, y - h, w * 2, h * 2, 6); c.stroke();
    return;
  }
  if (o.kind === 2) {
    if (abReady("bat")) {
      // 🦇 עטלף מצויר — נפנוף במעיכת גובה קלה + הטיה
      const im = abImg("bat");
      const r = o.w * v.ppu, flap = Math.sin(time * 14 + o.id);
      const w = r * 4.4, h = w * (im.naturalHeight / im.naturalWidth) * (1 - 0.14 * Math.abs(flap));
      c.save(); c.translate(x, y); c.rotate(Math.sin(time * 3 + o.id) * 0.08);
      c.drawImage(im, -w / 2, -h / 2, w, h);
      c.restore();
      return;
    }
    // עטלף נייר: גוף + כנפיים מתנפנפות
    const r = o.w * v.ppu, flap = Math.sin(time * 14 + o.id) * 0.5;
    c.fillStyle = INK;
    wing(c, x, y + 3, r, -1, flap); c.fill(); wing(c, x, y + 3, r, 1, flap); c.fill();
    c.fillStyle = "#4B2E7A"; wing(c, x, y, r, -1, flap); c.fill(); wing(c, x, y, r, 1, flap); c.fill();
    c.lineWidth = LINE; c.strokeStyle = INK; wing(c, x, y, r, -1, flap); c.stroke(); wing(c, x, y, r, 1, flap); c.stroke();
    c.beginPath(); c.arc(x - 1.5, y + 3, r * 0.75, 0, Math.PI * 2); c.fillStyle = INK; c.fill();
    c.beginPath(); c.arc(x, y, r * 0.75, 0, Math.PI * 2); c.fillStyle = "#3B2A5E"; c.fill(); c.lineWidth = LINE; c.strokeStyle = INK; c.stroke();
    c.fillStyle = GOLD; c.beginPath(); c.arc(x - r * 0.28, y - r * 0.12, r * 0.14, 0, Math.PI * 2); c.arc(x + r * 0.28, y - r * 0.12, r * 0.14, 0, Math.PI * 2); c.fill();
    return;
  }
  // מסור נייר — פס אנכי עם שיניים
  if (abReady("saw")) {
    // ⚙️ טור להבים מסתובבים לאורך הפס — הצללית תואמת את תיבת הפגיעה האמיתית
    const im = abImg("saw");
    const bw = o.w * v.ppu, bh = o.h * v.ppu;
    const rr = bw * 1.35;
    const n = Math.max(1, Math.round(bh / rr));
    for (let bi2 = 0; bi2 < n; bi2++) {
      const by = y - bh + rr + (bi2 * 2 * (bh - rr)) / Math.max(1, n - 1) - (n === 1 ? bh - rr : 0);
      c.save(); c.translate(x, n === 1 ? y : by); c.rotate(time * 5 * (bi2 % 2 ? -1 : 1) + o.id);
      c.drawImage(im, -rr, -rr, rr * 2, rr * 2);
      c.restore();
    }
    return;
  }
  const w = o.w * v.ppu, h = o.h * v.ppu;
  c.fillStyle = INK; c.fillRect(x - w - 2, y - h + 4, w * 2, h * 2);
  c.fillStyle = "#8E8FA8"; c.fillRect(x - w, y - h, w * 2, h * 2);
  c.fillStyle = "#5E5F78"; c.fillRect(x, y - h, w, h * 2);
  c.fillStyle = "#C9CADF";
  for (let yy = y - h + 4; yy < y + h - 4; yy += 9) { c.beginPath(); c.moveTo(x - w, yy); c.lineTo(x - w - 4, yy + 4); c.lineTo(x - w, yy + 8); c.closePath(); c.fill(); c.beginPath(); c.moveTo(x + w, yy); c.lineTo(x + w + 4, yy + 4); c.lineTo(x + w, yy + 8); c.closePath(); c.fill(); }
  c.lineWidth = LINE; c.strokeStyle = INK; c.strokeRect(x - w, y - h, w * 2, h * 2);
}
function wing(c: CanvasRenderingContext2D, x: number, y: number, r: number, side: -1 | 1, flap: number) {
  c.beginPath();
  c.moveTo(x + side * r * 0.4, y);
  c.quadraticCurveTo(x + side * r * 1.6, y - r * (1.1 + flap), x + side * r * 2.4, y - r * (0.3 + flap * 0.6));
  c.quadraticCurveTo(x + side * r * 1.9, y + r * 0.2, x + side * r * 1.5, y + r * 0.1);
  c.quadraticCurveTo(x + side * r * 1.0, y + r * 0.45, x + side * r * 0.4, y + r * 0.3);
  c.closePath();
}
export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + rr, y); c.arcTo(x + w, y, x + w, y + h, rr); c.arcTo(x + w, y + h, x, y + h, rr); c.arcTo(x, y + h, x, y, rr); c.arcTo(x, y, x + w, y, rr); c.closePath();
}

export function drawCrystal(c: CanvasRenderingContext2D, v: AbView, cr: AbCrystal, depth: number, time: number, dpr: number) {
  const gem = cr.v >= AB.GEM_VAL;
  const r = (gem ? 4.2 : AB.CRYSTAL_R) * v.ppu;
  const bob = Math.sin(time * 3 + cr.id) * 1.5;
  const key = gem ? "gem" : "crystal";
  if (abReady(key)) {
    // 💎 גביש/אבן חן מצוירים (Higgsfield) — ההילה אפויה בקובץ, נצנוץ בסיבוב עדין
    const im = abImg(key);
    const w = r * 3.1, h = w * (im.naturalHeight / im.naturalWidth);
    c.save();
    c.translate(sx(v, cr.x), sy(v, cr.d, depth) + bob);
    c.rotate(Math.sin(time * 2 + cr.id * 1.7) * 0.12);
    c.drawImage(im, -w / 2, -h / 2, w, h);
    c.restore();
    return;
  }
  const s = crystalSprite(gem, Math.round(r), dpr);
  const w = s.width / dpr, h = s.height / dpr;
  c.drawImage(s, sx(v, cr.x) - w / 2, sy(v, cr.d, depth) - h / 2 + bob, w, h);
}

/** חפץ זרוק — מלכודת/בועה/פרץ, עם טלגרף ושיוך */
export function drawThrow(c: CanvasRenderingContext2D, v: AbView, th: AbThrowObj, depth: number, time: number, dpr: number, emoji: string, landed: boolean) {
  const x = sx(v, th.x), y = sy(v, th.d, depth);
  if (y < -60 || y > v.H + 60) return;
  const pulse = 0.5 + 0.5 * Math.sin(time * 8);
  if (th.kind === "trap") {
    const r = AB.TRAP_R * v.ppu;
    c.setLineDash([6, 6]); c.lineDashOffset = -time * 40; c.strokeStyle = `rgba(255,68,56,${0.5 + 0.4 * pulse})`; c.lineWidth = 2.5;
    c.beginPath(); c.arc(x, y, r + 8, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    if (landed) {
      if (abReady("trap")) {
        // 🪤 סלע המלכודת המצויר — פס האזהרה האדום כבר בקובץ
        const im = abImg("trap");
        const d2 = r * 2.4;
        c.drawImage(im, x - d2 / 2, y - d2 / 2 * (im.naturalHeight / im.naturalWidth), d2, d2 * (im.naturalHeight / im.naturalWidth));
      } else {
        const s = rockSprite(1, Math.round(r), dpr); const half = s.width / dpr / 2;
        c.drawImage(s, x - half, y - half, s.width / dpr, s.height / dpr);
        c.fillStyle = RED; c.fillRect(x - r * 0.9, y - 3, r * 1.8, 6);
        c.lineWidth = 1.5; c.strokeStyle = INK; c.strokeRect(x - r * 0.9, y - 3, r * 1.8, 6);
      }
    } else {
      c.fillStyle = `rgba(255,68,56,${0.15 + 0.15 * pulse})`; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
  } else if (th.kind === "shield") {
    const r = AB.BUBBLE_R * v.ppu;
    c.fillStyle = `rgba(56,200,232,${0.22 + 0.15 * pulse})`; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.lineWidth = LINE; c.strokeStyle = CYAN_HI; c.stroke();
    c.strokeStyle = "rgba(255,255,255,.7)"; c.lineWidth = 2; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.5, Math.PI * 1.1, Math.PI * 1.6); c.stroke();
  } else {
    for (let i = 0; i < AB.BURST_N; i++) {
      const a = (i / AB.BURST_N) * Math.PI * 2;
      const cr: AbCrystal = { id: -(th.id * 10 + i), d: th.d + Math.sin(a) * AB.BURST_R, x: th.x + Math.cos(a) * AB.BURST_R, v: AB.BURST_VAL };
      drawCrystal(c, v, cr, depth, time, dpr);
    }
  }
  // שיוך: האימוג'י של הזורק בתג קטן
  tag(c, x, y - (AB.TRAP_R * v.ppu) - 22, emoji);
}
function tag(c: CanvasRenderingContext2D, x: number, y: number, emoji: string) {
  c.fillStyle = INK; roundRect(c, x - 16, y - 12 + 3, 32, 24, 8); c.fill();
  c.fillStyle = PAPER; roundRect(c, x - 16, y - 12, 32, 24, 8); c.fill();
  c.lineWidth = 1.5; c.strokeStyle = INK; c.stroke();
  c.font = "15px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = INK; c.fillText(emoji, x, y + 1);
}

/** דמות: דיסק נייר + מתאר דיו + צל קשיח בצבע השחקן + אימוג'י */
export function drawAvatar(c: CanvasRenderingContext2D, x: number, y: number, r: number, emoji: string, color: string, alpha: number, shield: number, lean: number, name?: string) {
  c.save(); c.globalAlpha = alpha;
  c.translate(x, y); c.rotate(lean * 0.35); c.translate(-x, -y);
  if (shield > 0) {
    c.fillStyle = "rgba(56,200,232,.22)"; c.beginPath(); c.arc(x, y, r * 1.55, 0, Math.PI * 2); c.fill();
    c.lineWidth = 2.5; c.strokeStyle = CYAN_HI; c.beginPath(); c.arc(x, y, r * 1.55, 0, Math.PI * 2); c.stroke();
    if (shield > 1) { c.strokeStyle = CYAN; c.beginPath(); c.arc(x, y, r * 1.8, 0, Math.PI * 2); c.stroke(); }
  }
  c.fillStyle = color; c.beginPath(); c.arc(x - 3, y + 4, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = PAPER; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.lineWidth = LINE; c.strokeStyle = INK; c.stroke();
  c.font = `${Math.round(r * 1.25)}px sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = INK;
  c.fillText(emoji, x, y + r * 0.08);
  if (name) {
    c.font = "700 11px Assistant, sans-serif"; c.direction = "rtl";
    c.lineWidth = 3; c.strokeStyle = INK; c.strokeText(name, x, y - r - 9);
    c.fillStyle = PAPER; c.fillText(name, x, y - r - 9);
  }
  c.restore();
}

export interface Particle { x: number; y: number; vx: number; vy: number; l: number; col: string; r: number }
export function drawParticles(c: CanvasRenderingContext2D, parts: Particle[], dt: number) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.l -= dt; if (p.l <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 380 * dt;
    c.globalAlpha = Math.min(1, p.l * 2.2);
    c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;
}
export function burst(parts: Particle[], x: number, y: number, col: string, n: number, speed: number, r = 3) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.4, l: 0.35 + Math.random() * 0.4, col, r: r * (0.6 + Math.random() * 0.8) });
  }
}

/** שובל כוכב-שביט של הנופל */
export function drawTrail(c: CanvasRenderingContext2D, trail: { x: number; y: number }[], color: string, r: number) {
  if (trail.length < 2) return;
  for (let i = 1; i < trail.length; i++) {
    const t = i / trail.length;
    c.globalAlpha = t * 0.55;
    c.strokeStyle = color; c.lineWidth = r * 1.4 * t; c.lineCap = "round";
    c.beginPath(); c.moveTo(trail[i - 1].x, trail[i - 1].y); c.lineTo(trail[i].x, trail[i].y); c.stroke();
  }
  c.globalAlpha = 1;
}

/** קווי מהירות בצדדים כשמהר */
export function drawSpeedLines(c: CanvasRenderingContext2D, v: AbView, intensity: number, time: number) {
  if (intensity <= 0) return;
  c.strokeStyle = `rgba(255,255,255,${0.08 * intensity})`; c.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    const x = ((i * 137 + time * 40) % (v.W + 40)) - 20;
    const y0 = ((i * 251 + time * 900 * intensity) % (v.H + 200)) - 100;
    c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y0 + 40 + 60 * intensity); c.stroke();
  }
}
