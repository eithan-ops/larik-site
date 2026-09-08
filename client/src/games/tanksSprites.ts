/**
 * התותחים 💥 — הדמות: טנק אחד ב-8 צבעים.
 * ציור פרוצדורלי בסגנון המדבקות (קו דיו עבה, צבע שטוח, עיניים גדולות) כברירת מחדל,
 * ועם נכס אמיתי מהיגספילד (`/tanks/tank.webp`, גוף בירוק-ליים שמוסט גוון לכל צבע — הצינור של הקומות)
 * כשהוא נטען. הקנה תמיד פרוצדורלי (מסתובב). האביזר לכל צבע — "מי זה הסגול עם הכתר?".
 */
import { TK } from "../../../shared/tanks";

export const TANKS = [
  { id: "purple", name: "הסגול", hue: 270, acc: "crown" },
  { id: "orange", name: "הכתום", hue: 25, acc: "antenna" },
  { id: "blue", name: "הכחול", hue: 220, acc: "tophat" },
  { id: "red", name: "האדום", hue: 0, acc: "horns" },
  { id: "yellow", name: "הצהוב", hue: 48, acc: "sprout" },
  { id: "pink", name: "הוורוד", hue: 325, acc: "bow" },
  { id: "green", name: "הירוק", hue: 110, acc: "halo" },
  { id: "cyan", name: "הטורקיז", hue: 185, acc: "party" },
];
const INK = "#0C0906";
export const TANK_W = 62, TANK_H = 40;   // יחידות עולם: רוחב/גובה הגוף
const SPRITE_TOP = 43, SPRITE_PIVOT = 31;  // בנכס האמיתי: ראש הטנק וציר הקנה (יחידות עולם מעל הקרקע)
/** גובה ציר הקנה מעל הקרקע — תלוי אם הנכס נטען */
export const barrelPivot = () => (ready ? SPRITE_PIVOT : TANK_H * 0.95);

/* ---------- נכס (אופציונלי) ---------- */
let atlas: HTMLImageElement | null = null;
let sheets: (HTMLCanvasElement | null)[] = [];
let ready = false;
let meta: { poses: number; w: number; h: number; feet: number } | null = null;
const readyCbs: (() => void)[] = [];
export const tankSpriteReady = () => ready;
export function onTankSpriteReady(fn: () => void) { readyCbs.push(fn); return () => { const i = readyCbs.indexOf(fn); if (i >= 0) readyCbs.splice(i, 1); }; }
/** טוען את האטלס (פוזות: 0 רגיל · 1 יורה · 2 נפגע · 3 הרוס · 4 מנצח), מייצר 8 גיליונות בהיסט גוון על הגוף בלבד */
export function loadTankSprite(): Promise<boolean> {
  if (ready) return Promise.resolve(true);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      try {
        fetch("/tanks/tank-meta.json").then((r) => r.json()).catch(() => null).then((m) => {
          meta = m && typeof m.poses === "number" ? m : { poses: 5, w: img.naturalWidth / 5, h: img.naturalHeight, feet: img.naturalHeight - 6 };
          atlas = img;
          sheets = TANKS.map((t) => recolor(img, t.hue));
          ready = true; readyCbs.forEach((f) => f()); res(true);
        });
      } catch { res(false); }
    };
    img.onerror = () => res(false);
    img.src = "/tanks/tank.webp";
  });
}
/** היסט גוון רק על פיקסלים רוויים סביב הליים (85°) — העיניים, קו המתאר והמתכת לא נוגעים */
function recolor(img: HTMLImageElement, hue: number): HTMLCanvasElement {
  const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext("2d")!; ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, cv.width, cv.height); const d = id.data;
  const shift = hue - 85;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const dl = mx - mn;
    if (mx === 0) continue;
    const s = dl / mx; if (s < 0.22) continue;
    let h = 0;
    if (dl > 0) { if (mx === r) h = ((g - b) / dl) % 6; else if (mx === g) h = (b - r) / dl + 2; else h = (r - g) / dl + 4; h *= 60; if (h < 0) h += 360; }
    if (Math.abs(((h - 85 + 540) % 360) - 180) > 40) continue;
    const nh = (h + shift + 360) % 360;
    const c = mx * s, x = c * (1 - Math.abs(((nh / 60) % 2) - 1)), m = mx - c;
    let rr = 0, gg = 0, bb = 0;
    if (nh < 60) { rr = c; gg = x; } else if (nh < 120) { rr = x; gg = c; } else if (nh < 180) { gg = c; bb = x; } else if (nh < 240) { gg = x; bb = c; } else if (nh < 300) { rr = x; bb = c; } else { rr = c; bb = x; }
    d[i] = Math.round((rr + m) * 255); d[i + 1] = Math.round((gg + m) * 255); d[i + 2] = Math.round((bb + m) * 255);
  }
  ctx.putImageData(id, 0, 0);
  return cv;
}

/* ---------- ציור ---------- */
export type TankPose = "idle" | "fire" | "hurt" | "dead" | "win";
const POSE_I: Record<TankPose, number> = { idle: 0, fire: 1, hurt: 2, dead: 3, win: 4 };

/** גוף הטנק — (x, y) = נקודת המגע עם הקרקע (מרכז), k = יחידות עולם → פיקסלים, face = 1 ימינה / -1 שמאלה */
export function drawTankBody(ctx: CanvasRenderingContext2D, c: number, x: number, y: number, k: number, face: number, pose: TankPose, t: number) {
  const col = TK.CHAR_COLORS[c] ?? "#FFF";
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face, 1);
  if (ready && atlas && meta && sheets[c]) {
    const pi = Math.min(meta.poses - 1, POSE_I[pose]);
    const sw = meta.w, sh = meta.h;
    const scale = (TANK_W * k) / (sw * 0.8);
    const bob = pose === "dead" ? 0 : Math.sin(t / 380 + c) * 0.6 * k;
    const hop = pose === "win" ? Math.abs(Math.sin(t / 160)) * 6 * k : 0;
    ctx.drawImage(sheets[c]!, pi * sw, 0, sw, sh, -sw * scale / 2, -meta.feet * scale + bob - hop, sw * scale, sh * scale);
    if (pose !== "dead") drawAccessory(ctx, c, 2 * k, -SPRITE_TOP * k + bob - hop, k, t);
    ctx.restore();
    return;
  }
  // --- פרוצדורלי בסגנון מדבקה ---
  const W = TANK_W * k, H = TANK_H * k;
  const dead = pose === "dead";
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.5, 2.2 * k);
  ctx.strokeStyle = INK;
  // שרשראות
  ctx.fillStyle = dead ? "#3a332c" : "#4A3F35";
  rr(ctx, -W / 2, -H * 0.42, W, H * 0.42, H * 0.21); ctx.fill(); ctx.stroke();
  // גלגלים
  ctx.fillStyle = dead ? "#555" : "#8C7B6B";
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * W * 0.3, -H * 0.21, H * 0.14, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  // גוף
  ctx.fillStyle = dead ? "#5b5148" : col;
  const bob = dead ? 0 : Math.sin(t / 380 + c) * 0.6 * k;
  rr(ctx, -W * 0.44, -H * 0.95 + bob, W * 0.88, H * 0.58, H * 0.22); ctx.fill(); ctx.stroke();
  // הברקה
  if (!dead) { ctx.fillStyle = "rgba(255,255,255,.28)"; rr(ctx, -W * 0.36, -H * 0.9 + bob, W * 0.4, H * 0.14, H * 0.07); ctx.fill(); }
  // צריח (כיפה) עם עיניים
  ctx.fillStyle = dead ? "#5b5148" : col;
  ctx.beginPath(); ctx.arc(0, -H * 0.95 + bob, W * 0.22, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  const ey = -H * 1.02 + bob;
  if (dead) {
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, 2 * k);
    for (const ex of [-W * 0.1, W * 0.08]) { ctx.beginPath(); ctx.moveTo(ex - 2.5 * k, ey - 2.5 * k); ctx.lineTo(ex + 2.5 * k, ey + 2.5 * k); ctx.moveTo(ex + 2.5 * k, ey - 2.5 * k); ctx.lineTo(ex - 2.5 * k, ey + 2.5 * k); ctx.stroke(); }
  } else {
    const blink = ((t / 1000 + c * 0.7) % 4) > 3.85;
    const look = pose === "hurt" ? 0 : 1.2 * k;
    for (const ex of [-W * 0.1, W * 0.09]) {
      ctx.fillStyle = "#FFF"; ctx.beginPath(); ctx.ellipse(ex, ey, 4.2 * k, blink ? 0.8 * k : (pose === "hurt" ? 5 : 4.6) * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (!blink) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ex + look, ey + (pose === "win" ? -0.8 * k : 0.6 * k), 2 * k, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#FFF"; ctx.beginPath(); ctx.arc(ex + look + 0.8 * k, ey - 0.4 * k, 0.7 * k, 0, Math.PI * 2); ctx.fill(); }
    }
    // פה
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, 1.6 * k);
    ctx.beginPath();
    if (pose === "hurt") { ctx.arc(0, ey + 6.5 * k, 2 * k, 0, Math.PI * 2); }
    else if (pose === "win") { ctx.arc(0, ey + 4 * k, 3.2 * k, 0.15, Math.PI - 0.15); }
    else { ctx.arc(0, ey + 4.5 * k, 2.2 * k, 0.3, Math.PI - 0.3); }
    ctx.stroke();
    drawAccessory(ctx, c, 0, -H * 0.95 - W * 0.22 + bob, k, t);
  }
  ctx.restore();
}
/** הקנה — מהצריח, בזווית (רדיאנים, 0 = ימינה, חיובי = למעלה), recoil 0..1 */
export function drawBarrel(ctx: CanvasRenderingContext2D, c: number, x: number, y: number, k: number, angle: number, recoil: number, dead: boolean) {
  const col = TK.CHAR_COLORS[c] ?? "#FFF";
  ctx.save();
  ctx.translate(x, y - barrelPivot() * k);
  ctx.rotate(-angle);
  const len = (36 - recoil * 9) * k;
  ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, 2.2 * k);
  ctx.fillStyle = dead ? "#3a332c" : "#2E2620";
  rr(ctx, 2 * k, -3.2 * k, len, 6.4 * k, 3 * k); ctx.fill(); ctx.stroke();
  ctx.fillStyle = dead ? "#555" : col;
  rr(ctx, len - 4 * k, -4.2 * k, 6 * k, 8.4 * k, 2.5 * k); ctx.fill(); ctx.stroke();
  ctx.restore();
}
export function drawAccessory(ctx: CanvasRenderingContext2D, c: number, x: number, top: number, k: number, t: number) {
  const acc = TANKS[c]?.acc; if (!acc) return;
  ctx.save(); ctx.translate(x, top); ctx.lineWidth = Math.max(1.2, 1.8 * k); ctx.strokeStyle = INK; ctx.lineJoin = "round";
  switch (acc) {
    case "crown": ctx.fillStyle = "#FFC531"; ctx.beginPath(); ctx.moveTo(-7 * k, 0); ctx.lineTo(-7 * k, -7 * k); ctx.lineTo(-3.5 * k, -3 * k); ctx.lineTo(0, -9 * k); ctx.lineTo(3.5 * k, -3 * k); ctx.lineTo(7 * k, -7 * k); ctx.lineTo(7 * k, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case "antenna": { const sw = Math.sin(t / 250) * 2 * k; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sw, -6 * k, sw * 1.5, -11 * k); ctx.stroke(); ctx.fillStyle = "#FF4438"; ctx.beginPath(); ctx.arc(sw * 1.5, -12 * k, 2.6 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break; }
    case "tophat": ctx.fillStyle = "#1a1512"; rr(ctx, -8 * k, -2.5 * k, 16 * k, 2.5 * k, 1 * k); ctx.fill(); ctx.stroke(); rr(ctx, -5 * k, -12 * k, 10 * k, 10 * k, 1.5 * k); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#FF4438"; ctx.fillRect(-5 * k, -5 * k, 10 * k, 2 * k); break;
    case "horns": ctx.fillStyle = "#FFF3DC"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 5 * k, 0); ctx.quadraticCurveTo(s * 9 * k, -4 * k, s * 8 * k, -10 * k); ctx.quadraticCurveTo(s * 6 * k, -5 * k, s * 2 * k, -1 * k); ctx.closePath(); ctx.fill(); ctx.stroke(); } break;
    case "sprout": ctx.strokeStyle = "#2E8B3A"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -6 * k); ctx.stroke(); ctx.fillStyle = "#5FD44A"; ctx.strokeStyle = INK; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 3.5 * k, -7.5 * k, 4 * k, 2.2 * k, s * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } break;
    case "bow": ctx.fillStyle = "#FF5FB0"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, -2 * k); ctx.lineTo(s * 8 * k, -7 * k); ctx.lineTo(s * 8 * k, 2 * k); ctx.closePath(); ctx.fill(); ctx.stroke(); } ctx.beginPath(); ctx.arc(0, -2 * k, 2.2 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
    case "halo": ctx.strokeStyle = "#FFC531"; ctx.lineWidth = Math.max(1.5, 2.4 * k); ctx.beginPath(); ctx.ellipse(0, -8 * k + Math.sin(t / 400) * 1.2 * k, 8 * k, 2.6 * k, 0, 0, Math.PI * 2); ctx.stroke(); break;
    case "party": ctx.fillStyle = "#2EDCE6"; ctx.beginPath(); ctx.moveTo(-6 * k, 0); ctx.lineTo(0, -13 * k); ctx.lineTo(6 * k, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#FF5FB0"; for (const dy of [-3, -7]) { ctx.beginPath(); ctx.arc(dy === -3 ? 1.5 * k : -1 * k, dy * k, 1.3 * k, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = "#FFC531"; ctx.beginPath(); ctx.arc(0, -13 * k, 2 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
  }
  ctx.restore();
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/** אייקון לרשימות/בחירה — dataURL במטמון */
const icons = new Map<string, string>();
export function tankIcon(c: number, size = 64, pose: TankPose = "idle"): string {
  const key = `${c}:${size}:${pose}:${ready ? 1 : 0}`;
  const hit = icons.get(key); if (hit) return hit;
  const cv = document.createElement("canvas"); const dpr = 2; cv.width = size * dpr; cv.height = size * dpr;
  const ctx = cv.getContext("2d")!; ctx.scale(dpr, dpr);
  const k = (size * 0.8) / TANK_W;
  drawTankBody(ctx, c, size / 2, size * 0.86, k, 1, pose, 1000);
  drawBarrel(ctx, c, size / 2, size * 0.86, k, 0.6, 0, pose === "dead");
  const url = cv.toDataURL("image/png"); icons.set(key, url); return url;
}
