/**
 * מטרונובול 🎾 — הכדור: נכס אחד מהיגספילד (`/metro/ball.webp`, 3 פרצופים בשורה: רגוע · נחיתה · טיסה, גוף ירוק)
 * שמוסט גוון ל-8 צבעים (הצינור של הקומות/התותחים: רק פיקסלים רוויים סביב הגוון הבסיסי — עיניים, לחיים וקו הדיו לא נוגעים),
 * וציור פרוצדורלי בסגנון המדבקות כגיבוי עד שהנכס נטען (או אם אין אותו).
 */
import { MB } from "../../../shared/metro";

const INK = "#0C0906";
export type BallPose = "idle" | "land" | "fly";
const POSE_I: Record<BallPose, number> = { idle: 0, land: 1, fly: 2 };
export const BALL_NAMES = MB.CHAR_NAMES;

let atlas: HTMLImageElement | null = null;
let sheets: (HTMLCanvasElement | null)[] = [];
let ready = false;
let cell = 256;
const readyCbs: (() => void)[] = [];
export const ballSpriteReady = () => ready;
export function onBallSpriteReady(fn: () => void) { readyCbs.push(fn); return () => { const i = readyCbs.indexOf(fn); if (i >= 0) readyCbs.splice(i, 1); }; }

export function loadBallSprite(): Promise<boolean> {
  if (ready) return Promise.resolve(true);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      try {
        atlas = img; cell = img.naturalHeight;
        const base = dominantHue(img);
        sheets = MB.CHAR_HUES.map((h) => recolor(img, base, h));
        ready = true; readyCbs.forEach((f) => f()); res(true);
      } catch { res(false); }
    };
    img.onerror = () => res(false);
    img.src = "/metro/ball.webp";
  });
}

function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const dl = mx - mn;
  let h = 0;
  if (dl > 0) { if (mx === r) h = ((g - b) / dl) % 6; else if (mx === g) h = (b - r) / dl + 2; else h = (r - g) / dl + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx === 0 ? 0 : dl / mx, mx];
}
/** הגוון השכיח ביותר בין הפיקסלים הרוויים — הגוף של הכדור */
function dominantHue(img: HTMLImageElement): number {
  const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext("2d")!; ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const hist = new Array<number>(36).fill(0);
  for (let i = 0; i < d.length; i += 16) { if (d[i + 3] < 128) continue; const [h, s, v] = hsv(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255); if (s < 0.35 || v < 0.25) continue; hist[Math.floor(h / 10) % 36]++; }
  let best = 0; for (let k = 1; k < 36; k++) if (hist[k] > hist[best]) best = k;
  return best * 10 + 5;
}
function recolor(img: HTMLImageElement, base: number, hue: number): HTMLCanvasElement {
  const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext("2d")!; ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, cv.width, cv.height); const d = id.data;
  const shift = hue - base;
  // צהוב וכתום נראים "שרופים" בהיסט גוון טהור — מוסיפים מעט בהירות
  const vGain = hue >= 20 && hue <= 60 ? 1.08 : 1;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const [h, s, mx] = hsv(r, g, b);
    if (s < 0.22) continue;
    if (Math.abs(((h - base + 540) % 360) - 180) > 42) continue;
    const nh = (h + shift + 360) % 360;
    const v = Math.min(1, mx * vGain);
    const c = v * s, x = c * (1 - Math.abs(((nh / 60) % 2) - 1)), m = v - c;
    let rr = 0, gg = 0, bb = 0;
    if (nh < 60) { rr = c; gg = x; } else if (nh < 120) { rr = x; gg = c; } else if (nh < 180) { gg = c; bb = x; } else if (nh < 240) { gg = x; bb = c; } else if (nh < 300) { rr = x; bb = c; } else { rr = c; bb = x; }
    d[i] = Math.round((rr + m) * 255); d[i + 1] = Math.round((gg + m) * 255); d[i + 2] = Math.round((bb + m) * 255);
  }
  ctx.putImageData(id, 0, 0);
  return cv;
}

/**
 * ציור כדור: (x, y) = נקודת המגע עם הרצפה (מרכז-תחתית), r = רדיוס בפיקסלים,
 * sx/sy = מעיכה/מתיחה (1 = עגול), c = צבע (-1 = כדור המטרונום, אפור-קרם), dim = כהות (כדור ישן)
 */
export function drawBall(ctx: CanvasRenderingContext2D, c: number, x: number, y: number, r: number, sx: number, sy: number, pose: BallPose, dim = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  if (dim > 0) ctx.globalAlpha = 1 - dim * 0.45;
  if (ready && atlas) {
    const sheet = c >= 0 ? sheets[c] : null;
    const pi = POSE_I[pose];
    const size = r * 2.08; // הנכס ממלא ~96% מהתא
    if (sheet) ctx.drawImage(sheet, pi * cell, 0, cell, cell, -size / 2, -size, size, size);
    else { ctx.filter = "saturate(0) brightness(1.15)"; ctx.drawImage(atlas, pi * cell, 0, cell, cell, -size / 2, -size, size, size); ctx.filter = "none"; }
    ctx.restore();
    return;
  }
  // --- פרוצדורלי: עיגול עם קו דיו, הברקה ופרצוף ---
  const col = c >= 0 ? MB.CHAR_COLORS[c] : "#EDE3CC";
  ctx.lineWidth = Math.max(1.5, r * 0.09); ctx.strokeStyle = INK; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(0, -r, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.45)";
  ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 1.45, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2); ctx.fill();
  // עיניים
  const ey = -r * 1.05, ex = r * 0.34, er = r * 0.2;
  if (pose === "land") {
    ctx.beginPath(); ctx.arc(-ex, ey, er, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(ex, ey, er, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, -r * 0.62, r * 0.32, r * 0.2, 0, 0, Math.PI); ctx.fill();
  } else {
    ctx.fillStyle = "#FFF"; ctx.beginPath(); ctx.arc(-ex, ey, er, 0, Math.PI * 2); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; const py = pose === "fly" ? ey - er * 0.35 : ey + er * 0.1;
    ctx.beginPath(); ctx.arc(-ex, py, er * 0.5, 0, Math.PI * 2); ctx.arc(ex, py, er * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    if (pose === "fly") ctx.arc(0, -r * 0.62, r * 0.14, 0, Math.PI * 2); else ctx.arc(0, -r * 0.78, r * 0.26, 0.25, Math.PI - 0.25);
    ctx.stroke();
  }
  ctx.restore();
}

/** אייקון DOM (data URL) — למסך הבחירה ולטבלאות */
const iconCache = new Map<string, string>();
export function ballIcon(c: number, size = 96, pose: BallPose = "idle"): string {
  const key = `${c}:${size}:${pose}:${ready ? 1 : 0}`;
  const hit = iconCache.get(key); if (hit) return hit;
  const cv = document.createElement("canvas"); cv.width = size; cv.height = size;
  const ctx = cv.getContext("2d")!;
  drawBall(ctx, c, size / 2, size * 0.97, size * 0.46, 1, 1, pose);
  const url = cv.toDataURL("image/png"); iconCache.set(key, url); return url;
}
