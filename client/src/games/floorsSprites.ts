/**
 * הקומות 🏢 — הדמות: יצור ג'לי אחד ב-8 צבעים.
 *
 * נכס אחד (public/floors/jelly.webp, 512×384, 12 פוזות של 128px, נוצר בהיגספילד 5.9) — והצבעים
 * מחושבים כאן בטעינה: היסט גוון (hue) על פיקסלים ירוקים בלבד, כך שהעיניים, הקווים והלשון נשארים.
 * כל צבע מקבל גם אביזר קטן שמצויר בקנבס מעל הראש — "מי זה הסגול עם הכתר?".
 */

export const JELLY_URL = "/floors/jelly.webp";
export const JF = 128;             // גודל פריים
export const JELLY_COLS = 4;
export const JFEET = 124;          // y של כפות הרגליים בתוך הפריים
export const P = { idle: 0, crouch: 1, launch: 2, ball: 3, fall: 4, land: 5, run1: 6, run2: 7, dizzy: 8, ko: 9, throw: 10, win: 11 } as const;
/** ראש הדמות (y בפריים) לכל פוזה — לאביזרים */
export const JTOP = [25, 33, 16, 35, 23, 48, 27, 26, 17 + 24, 63, 26, 22];
/** גובה הג'לי בעולם (יחידות המשחק) בעמידה: 99px בפריים → 44 יחידות */
export const JWORLD = 44 / 99;
const BASE_HUE = 85;

export interface JellyColor { id: string; name: string; hue: number; css: string; sat: number; val: number; acc: string }
export const JELLY: JellyColor[] = [
  { id: "purple", name: "הסגול", hue: 275, css: "#9B4DFF", sat: 1.0, val: 1.0, acc: "crown" },
  { id: "orange", name: "הכתום", hue: 28, css: "#FF8A2B", sat: 1.15, val: 1.05, acc: "antenna" },
  { id: "blue", name: "הכחול", hue: 215, css: "#2F7BFF", sat: 1.0, val: 1.0, acc: "hat" },
  { id: "red", name: "האדום", hue: 358, css: "#FF3B3B", sat: 1.05, val: 1.0, acc: "horns" },
  { id: "yellow", name: "הצהוב", hue: 52, css: "#FFD21F", sat: 0.95, val: 1.14, acc: "sprout" },
  { id: "pink", name: "הוורוד", hue: 325, css: "#FF5FB0", sat: 1.0, val: 1.05, acc: "bow" },
  { id: "green", name: "הירוק", hue: 110, css: "#5FD44A", sat: 1.0, val: 1.0, acc: "halo" },
  { id: "cyan", name: "הטורקיז", hue: 185, css: "#2EDCE6", sat: 1.0, val: 1.06, acc: "party" },
];

type Sheet = HTMLCanvasElement | OffscreenCanvas;
const sheets: (Sheet | null)[] = JELLY.map(() => null);
const icons = new Map<string, string>();
let loading: Promise<boolean> | null = null;
let ready = false;
const listeners = new Set<() => void>();

export const jellyReady = () => ready;
export function onJellyReady(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** טוען את הנכס ומייצר 8 גיליונות צבועים (פעם אחת לחיי הדף) */
export function loadJelly(): Promise<boolean> {
  if (loading) return loading;
  loading = new Promise<boolean>((resolve) => {
    if (typeof document === "undefined") { resolve(false); return; }
    const im = new Image();
    im.onload = () => {
      try {
        const src = document.createElement("canvas"); src.width = im.width; src.height = im.height;
        const sctx = src.getContext("2d", { willReadFrequently: true })!; sctx.drawImage(im, 0, 0);
        const base = sctx.getImageData(0, 0, src.width, src.height);
        JELLY.forEach((c, i) => {
          const cv = document.createElement("canvas"); cv.width = src.width; cv.height = src.height;
          const ctx = cv.getContext("2d")!;
          const out = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
          recolor(out.data, c.hue - BASE_HUE, c.sat, c.val);
          ctx.putImageData(out, 0, 0);
          sheets[i] = cv;
        });
        ready = true; resolve(true); listeners.forEach((fn) => fn());
      } catch { resolve(false); }
    };
    im.onerror = () => resolve(false);
    im.src = JELLY_URL;
  });
  return loading;
}

/** היסט גוון רק על פיקסלים "ירוקי בסיס" (רוויים, ±38° סביב 85°) — עיניים/קווים/לשון/כוכבים לא נוגעים */
function recolor(d: Uint8ClampedArray, dh: number, sm: number, vm: number) {
  for (let p = 0; p < d.length; p += 4) {
    const a = d[p + 3]; if (a === 0) continue;
    const r = d[p] / 255, g = d[p + 1] / 255, b = d[p + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
    if (mx === 0) continue;
    const s = dl / mx; if (s < 0.22) continue;
    let h = 0;
    if (dl > 0) { if (mx === r) h = ((g - b) / dl) % 6; else if (mx === g) h = (b - r) / dl + 2; else h = (r - g) / dl + 4; h *= 60; if (h < 0) h += 360; }
    let dist = Math.abs(h - BASE_HUE); if (dist > 180) dist = 360 - dist;
    if (dist > 38) continue;
    let nh = (h + dh) % 360; if (nh < 0) nh += 360;
    const ns = Math.min(1, s * sm), nv = Math.min(1, mx * vm);
    const c = nv * ns, x = c * (1 - Math.abs(((nh / 60) % 2) - 1)), m = nv - c;
    let rr = 0, gg = 0, bb = 0;
    if (nh < 60) { rr = c; gg = x; } else if (nh < 120) { rr = x; gg = c; } else if (nh < 180) { gg = c; bb = x; } else if (nh < 240) { gg = x; bb = c; } else if (nh < 300) { rr = x; bb = c; } else { rr = c; bb = x; }
    d[p] = Math.round((rr + m) * 255); d[p + 1] = Math.round((gg + m) * 255); d[p + 2] = Math.round((bb + m) * 255);
  }
}

export function jellySheet(ci: number): Sheet | null { return sheets[((ci % JELLY.length) + JELLY.length) % JELLY.length]; }

/** dataURL של פריים בודד בצבע — לרשימות/בחירה (מטמון) */
export function jellyIcon(ci: number, pose: number = P.idle, size = 96): string {
  const key = `${ci}:${pose}:${size}`; const hit = icons.get(key); if (hit) return hit;
  const sh = jellySheet(ci); if (!sh) return "";
  const cv = document.createElement("canvas"); cv.width = size; cv.height = size;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(sh as CanvasImageSource, (pose % JELLY_COLS) * JF, Math.floor(pose / JELLY_COLS) * JF, JF, JF, 0, 0, size, size);
  drawAccessory(ctx, ci, pose, size / 2, JTOP[pose] * (size / JF), size / JF);
  const url = cv.toDataURL("image/png"); icons.set(key, url); return url;
}

/**
 * מצייר את הדמות: (x,y) = כפות הרגליים במסך, k = פיקסלים למסך ליחידת עולם, face = 1 ימינה / -1 שמאלה.
 * sx/sy = מעיכה/מתיחה (1 = רגיל), rot = סיבוב (סלטה).
 */
export function drawJelly(ctx: CanvasRenderingContext2D, ci: number, pose: number, x: number, y: number, k: number, face: number, sx = 1, sy = 1, rot = 0, alpha = 1, dy = 0, wink = false) {
  const sh = jellySheet(ci); if (!sh) return false;
  const px = JWORLD * k;                 // פיקסל-פריים → פיקסל-מסך
  const size = JF * px;
  ctx.save(); ctx.translate(x, y - dy * px);
  if (rot) { ctx.translate(0, -size * 0.42); ctx.rotate(rot); ctx.translate(0, size * 0.42); }
  ctx.scale(face < 0 ? -sx : sx, sy);
  ctx.globalAlpha = alpha;
  ctx.drawImage(sh as CanvasImageSource, (pose % JELLY_COLS) * JF, Math.floor(pose / JELLY_COLS) * JF, JF, JF, -size / 2, -JFEET * px, size, size);
  if (wink && pose === P.idle) drawWink(ctx, ci, px);
  if (pose !== P.ball && pose !== P.ko) drawAccessory(ctx, ci, pose, 0, (JTOP[pose] - JFEET) * px, px);
  ctx.restore();
  return true;
}

/** קריצה: מכסים את העין הימנית (בפריים idle: מרכז 68,67) בצבע הגוף ומציירים קשת עצומה */
const EYE = { x: 68 - 64, y: 67 - JFEET, rx: 9.5, ry: 10.5 };
function drawWink(ctx: CanvasRenderingContext2D, ci: number, u: number) {
  ctx.fillStyle = bodyColor(ci);
  ctx.beginPath(); ctx.ellipse(EYE.x * u, EYE.y * u, EYE.rx * u, EYE.ry * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, 2.6 * u); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo((EYE.x - 7) * u, (EYE.y - 1) * u); ctx.quadraticCurveTo(EYE.x * u, (EYE.y + 5) * u, (EYE.x + 7) * u, (EYE.y - 1) * u); ctx.stroke();
}
const bodyCache = new Map<number, string>();
/** צבע הגוף אחרי ההיסט — נדגם מהמצח בפריים idle */
function bodyColor(ci: number): string {
  const hit = bodyCache.get(ci); if (hit) return hit;
  const sh = jellySheet(ci); if (!sh) return "#888";
  try {
    const d = (sh as HTMLCanvasElement).getContext("2d")!.getImageData(64, 48, 1, 1).data;
    const c = `rgb(${d[0]},${d[1]},${d[2]})`; bodyCache.set(ci, c); return c;
  } catch { return "#888"; }
}

/**
 * אנימציית "אישיות" בעמידה — כל צבע זז אחרת (מסך הבחירה + עמידה במשחק). t במילישניות, amp = עוצמה (1 = מסך הבחירה, ~0.5 במשחק).
 * 🟣 כתר: סחרור גאה + קפיצה קטנה · 🟠 אנטנה: ג'לי מתנדנד · 🔵 צילינדר: קופץ על רגל אחת · 🔴 קרניים: מתחמם (ריצה במקום + אגרוף)
 * 🟡 נבט: נשימה גדולה · 🌸 פפיון: קורצת · 🟢 הילה: מרחף · 💎 מסיבה: רוקד
 */
export interface JellyAnim { pose: number; sx: number; sy: number; rot: number; face: number; dy: number; wink: boolean }
export function jellyIdle(ci: number, t: number, amp = 1): JellyAnim {
  const a: JellyAnim = { pose: P.idle, sx: 1, sy: 1, rot: 0, face: 1, dy: 0, wink: false };
  const s = (p: number, ph = 0) => Math.sin(t / p + ph);
  switch (((ci % JELLY.length) + JELLY.length) % JELLY.length) {
    case 0: { // כתר — סחרור גאה, וכל 2.4 שנ' קפיצה קטנה
      a.rot = s(650) * 0.07 * amp; a.sy = 1 + s(650, 1) * 0.03; a.sx = 1 - s(650, 1) * 0.03;
      const ph = t % 2400; if (ph < 260) { const k = Math.sin((ph / 260) * Math.PI); a.pose = P.launch; a.dy = 14 * k * amp; a.sy = 1 + 0.12 * k; a.sx = 1 - 0.08 * k; }
      break;
    }
    case 1: { // אנטנה — התנדנדות ג'לי בפרצים
      const env = Math.max(0, Math.sin(t / 1000)) ** 2; a.rot = s(140) * 0.14 * env * amp; a.sx = 1 + s(140) * 0.06 * env; a.sy = 1 - s(140) * 0.05 * env; break;
    }
    case 2: { // צילינדר — קופץ על רגל אחת
      const h = Math.abs(s(230)); a.pose = P.run1; a.dy = h * 11 * amp; a.sy = h < 0.15 ? 0.86 : 1 + h * 0.06; a.sx = h < 0.15 ? 1.12 : 1; break;
    }
    case 3: { // קרניים — מתחמם: ריצה במקום, וכל 3 שנ' אגרוף
      const ph = t % 3000;
      if (ph > 2650) a.pose = P.throw; else { a.pose = Math.floor(t / 140) % 2 ? P.run1 : P.run2; a.dy = Math.abs(s(140)) * 4 * amp; }
      break;
    }
    case 4: { a.sy = 1 + s(520) * 0.11 * amp; a.sx = 1 - s(520) * 0.08 * amp; break; } // נבט — נשימה גדולה
    case 5: { a.rot = s(800) * 0.05 * amp; a.sy = 1 + s(800, 1) * 0.02; a.wink = t % 2600 < 380; break; } // פפיון — קורצת
    case 6: { a.dy = (s(700) * 7 + 6) * amp; a.rot = s(900) * 0.06 * amp; a.sy = 1 + s(700) * 0.02; break; } // הילה — מרחף
    case 7: { // מסיבה — רוקד: מתהפך כל חצי שנייה, קופץ-מועך
      a.face = Math.floor(t / 500) % 2 ? -1 : 1; const b = Math.abs(s(250)); a.pose = b < 0.3 ? P.crouch : P.idle; a.dy = b * 6 * amp; a.rot = s(500) * 0.1 * amp; break;
    }
  }
  return a;
}

const INK = "#0C0906";
/** אביזר לכל צבע — צורות פשוטות עם קו מתאר, ממוקמות בקצה הראש (cx, top) ; u = פיקסלים ליחידת פריים */
export function drawAccessory(ctx: CanvasRenderingContext2D, ci: number, pose: number, cx: number, top: number, u: number) {
  const acc = JELLY[((ci % JELLY.length) + JELLY.length) % JELLY.length].acc;
  const lw = Math.max(1, 2.2 * u);
  ctx.save(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.lineJoin = "round";
  // קצה הטיפה נוטה מעט ימינה בפוזות רבות — מרכזים קצת ימינה
  const ox = cx + (pose === P.launch || pose === P.fall || pose === P.win ? 4 : 6) * u, oy = top + 4 * u;
  switch (acc) {
    case "crown": { // כתר זהב קטן
      ctx.fillStyle = "#FFC531"; ctx.beginPath();
      ctx.moveTo(ox - 12 * u, oy); ctx.lineTo(ox - 13 * u, oy - 14 * u); ctx.lineTo(ox - 6 * u, oy - 7 * u); ctx.lineTo(ox, oy - 17 * u); ctx.lineTo(ox + 6 * u, oy - 7 * u); ctx.lineTo(ox + 13 * u, oy - 14 * u); ctx.lineTo(ox + 12 * u, oy); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#FF4438"; ctx.beginPath(); ctx.arc(ox, oy - 4 * u, 2.4 * u, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "antenna": { // אנטנה עם כדור
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.quadraticCurveTo(ox + 4 * u, oy - 10 * u, ox + 1 * u, oy - 18 * u); ctx.stroke();
      ctx.fillStyle = "#FF4438"; ctx.beginPath(); ctx.arc(ox + 1 * u, oy - 20 * u, 4.5 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.beginPath(); ctx.arc(ox - 0.5 * u, oy - 21.5 * u, 1.4 * u, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "hat": { // צילינדר קטן
      ctx.fillStyle = "#1E1B18";
      ctx.beginPath(); ctx.rect(ox - 8 * u, oy - 16 * u, 16 * u, 13 * u); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.rect(ox - 12 * u, oy - 4 * u, 24 * u, 4 * u); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#FF4438"; ctx.fillRect(ox - 8 * u, oy - 7 * u, 16 * u, 2.5 * u);
      break;
    }
    case "horns": { // קרניים
      ctx.fillStyle = "#FFF3DC";
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(ox + d * 5 * u, oy + 2 * u); ctx.quadraticCurveTo(ox + d * 12 * u, oy - 6 * u, ox + d * 9 * u, oy - 15 * u); ctx.quadraticCurveTo(ox + d * 6 * u, oy - 6 * u, ox + d * 1 * u, oy + 1 * u); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      break;
    }
    case "sprout": { // נבט עלים
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + 1 * u, oy - 9 * u); ctx.stroke();
      ctx.fillStyle = "#5FD44A";
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(ox + 1 * u, oy - 9 * u); ctx.quadraticCurveTo(ox + d * 9 * u, oy - 15 * u, ox + d * 7 * u, oy - 20 * u); ctx.quadraticCurveTo(ox + d * 1 * u, oy - 17 * u, ox + 1 * u, oy - 9 * u); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      break;
    }
    case "bow": { // פפיון
      ctx.fillStyle = "#FF4438";
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(ox, oy - 4 * u); ctx.lineTo(ox + d * 12 * u, oy - 11 * u); ctx.lineTo(ox + d * 12 * u, oy + 3 * u); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = "#FF7A9C"; ctx.beginPath(); ctx.arc(ox, oy - 4 * u, 3.2 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    }
    case "halo": { // הילה מרחפת
      ctx.strokeStyle = INK; ctx.lineWidth = lw * 1.6; ctx.beginPath(); ctx.ellipse(ox - 2 * u, oy - 14 * u, 12 * u, 4 * u, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "#FFC531"; ctx.lineWidth = lw * 0.9; ctx.beginPath(); ctx.ellipse(ox - 2 * u, oy - 14 * u, 12 * u, 4 * u, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case "party": { // כובע מסיבה
      ctx.fillStyle = "#FF4438"; ctx.beginPath(); ctx.moveTo(ox - 8 * u, oy + 1 * u); ctx.lineTo(ox + 1 * u, oy - 20 * u); ctx.lineTo(ox + 10 * u, oy + 1 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#FFF3DC"; ctx.beginPath(); ctx.moveTo(ox - 3 * u, oy - 10 * u); ctx.lineTo(ox + 5 * u, oy - 10 * u); ctx.lineTo(ox + 1 * u, oy - 20 * u); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#FFC531"; ctx.beginPath(); ctx.arc(ox + 1 * u, oy - 20 * u, 3 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    }
  }
  ctx.restore();
}
