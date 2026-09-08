/**
 * הגנבים 🦝 — הדביבון המונפש: גיליון אחד ב-12 פוזות (public/thieves/raccoon.webp, 864×256, נוצר בהיגספילד 7.9)
 * שנצבע בטעינה ל-8 צבעי השחקנים: הקפוצ'ון בגיליון הוא מג'נטה, וכל פיקסל מג'נטה מקבל את צבע השחקן
 * עם שמירה על ההצללה (יחס הבהירות). הפרווה, המסכה, השק והגביש לא נוגעים — אותו עיקרון כמו הג'לי בהקומות.
 * פוזות: ריצה ×3 · עמידה · מבט לאחור · חטיפה · נשיאת גביש ×2 · דאש · הפלה · קפוא (בעצירה) · ניצחון.
 */
export const RAC_URL = "/thieves/raccoon.webp";
export const RF_W = 144, RF_H = 128, RAC_COLS = 6;
export const RFEET = 124;                 // y של כפות הרגליים בפריים
export const RP = { run1: 0, run2: 1, run3: 2, idle: 3, look: 4, grab: 5, carry1: 6, carry2: 7, dash: 8, hit: 9, frozen: 10, win: 11 } as const;
export type RacPose = (typeof RP)[keyof typeof RP];

const HOOD_HUE = 330;                     // המג'נטה של הגיליון
type Sheet = HTMLCanvasElement;
const sheets = new Map<string, Sheet>();  // לפי צבע
let base: ImageData | null = null;
let refLum = 0.5;
let loading: Promise<boolean> | null = null;
let ready = false;
const listeners = new Set<() => void>();
export const racReady = () => ready;
export function onRacReady(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", ""); const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function isHood(r: number, g: number, b: number): boolean {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
  if (mx < 40) return false;
  const s = dl / mx; if (s < 0.35) return false;
  let h = 0;
  if (dl > 0) { if (mx === r) h = ((g - b) / dl) % 6; else if (mx === g) h = (b - r) / dl + 2; else h = (r - g) / dl + 4; h *= 60; if (h < 0) h += 360; }
  let dist = Math.abs(h - HOOD_HUE); if (dist > 180) dist = 360 - dist;
  return dist <= 38;
}

/** טוען את הגיליון ומכין גיליון צבוע לכל צבע ברשימה (פעם אחת לחיי הדף) */
export function loadRaccoon(colors: string[]): Promise<boolean> {
  if (loading) return loading;
  loading = new Promise<boolean>((resolve) => {
    if (typeof document === "undefined") { resolve(false); return; }
    const im = new Image();
    im.onload = () => {
      try {
        const src = document.createElement("canvas"); src.width = im.width; src.height = im.height;
        const sctx = src.getContext("2d", { willReadFrequently: true })!; sctx.drawImage(im, 0, 0);
        base = sctx.getImageData(0, 0, src.width, src.height);
        // בהירות הייחוס של הקפוצ'ון — ממוצע על פיקסלי המג'נטה
        const d = base.data; let sum = 0, n = 0;
        for (let p = 0; p < d.length; p += 4) { if (d[p + 3] < 40) continue; if (isHood(d[p], d[p + 1], d[p + 2])) { sum += 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]; n++; } }
        refLum = n ? sum / n / 255 : 0.5;
        for (const c of colors) sheetFor(c);
        ready = true; resolve(true); listeners.forEach((fn) => fn());
      } catch { resolve(false); }
    };
    im.onerror = () => resolve(false);
    im.src = RAC_URL;
  });
  return loading;
}

export function sheetFor(color: string): Sheet | null {
  const have = sheets.get(color); if (have) return have;
  if (!base) return null;
  const [tr, tg, tb] = hexRgb(color);
  const tl = (0.299 * tr + 0.587 * tg + 0.114 * tb) / 255;
  const cv = document.createElement("canvas"); cv.width = base.width; cv.height = base.height;
  const out = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
  const d = out.data;
  for (let p = 0; p < d.length; p += 4) {
    if (d[p + 3] < 8) continue;
    const r = d[p], g = d[p + 1], b = d[p + 2];
    if (!isHood(r, g, b)) continue;
    // צבע היעד × יחס הבהירות (הצללה נשמרת); צבעים בהירים (צהוב) מקבלים תקרה כדי לא להישרף
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    let k = lum / refLum; if (tl > 0.6) k = Math.min(k, 1.15); else k = Math.min(k, 1.35);
    d[p] = Math.min(255, tr * k); d[p + 1] = Math.min(255, tg * k); d[p + 2] = Math.min(255, tb * k);
  }
  cv.getContext("2d")!.putImageData(out, 0, 0);
  sheets.set(color, cv);
  return cv;
}

/** מצייר פוזה: (x, y) = כפות הרגליים בעולם-פיקסלים, h = גובה הפריים על המסך; flip = פונה שמאלה; sq = מעיכה/מתיחה */
export function drawRaccoon(ctx: CanvasRenderingContext2D, color: string, pose: RacPose, x: number, y: number, h: number, flip: boolean, sq = 0, alpha = 1) {
  const sh = sheetFor(color); if (!sh) return false;
  const sx = (pose % RAC_COLS) * RF_W, sy = Math.floor(pose / RAC_COLS) * RF_H;
  const s = h / RF_H, w = RF_W * s;
  ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
  ctx.scale(1 + sq, 1 - sq);
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(sh, sx, sy, RF_W, RF_H, -w / 2, -RFEET * s, w, h);
  ctx.restore();
  return true;
}

const iconCache = new Map<string, string>();
/** אייקון עמידה (data URL) לפרצוף בחשיפת "מי לקח מה" ובדירוג */
export function racIcon(color: string, size = 56): string {
  const key = color + size; const c = iconCache.get(key); if (c) return c;
  const sh = sheetFor(color); if (!sh) return "";
  const cv = document.createElement("canvas"); cv.width = size; cv.height = size;
  const g = cv.getContext("2d")!;
  const sx = (RP.idle % RAC_COLS) * RF_W, sy = Math.floor(RP.idle / RAC_COLS) * RF_H;
  // חותכים את הראש: החלק העליון של הפריים
  g.drawImage(sh, sx + 22, sy + 4, 100, 100, 0, 0, size, size);
  const url = cv.toDataURL("image/png"); iconCache.set(key, url); return url;
}
