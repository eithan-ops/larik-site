/**
 * LARIK — כרטיס הסיום האישי.
 *
 * הרעיון: בסוף ערב, *כל טלפון* מקבל כרטיס משלו עם התואר שהוא זכה בו —
 * לא כרטיס אחד למארח. שישה שחקנים = שישה שיתופים במקום אחד,
 * ולכל כרטיס יש QR שמצטרף לחדר — כך שהשיתוף הוא גם ערוץ גיוס.
 *
 * הסגנון לא נבחר על ידי השחקן אלא *מוגרל* בצורה דטרמיניסטית ממזהה השחקן:
 * "מה יצא לך?" הוא בדיוק סוג הסקרנות שגורם להראות את המסך לחבר שיושב לידך.
 *
 * הכול מצויר ב-canvas (בלי תלויות מלבד qrcode שכבר בפרויקט) —
 * עברית מרונדרת נכון כי הדפדפן עושה את ה-bidi, בניגוד לרינדור בצד שרת.
 */
import QRCode from "qrcode";
import type { Award } from "../../../shared/protocol";

const W = 1080;
const H = 1920;

/* הפלטה מ-tokens.css — מקור אחד לצבע */
const PAPER = "#FFF3DC";
const PAPER_HI = "#FFF9EC";
const INK = "#171310";
const INK_DEEP = "#12100E";
const CREAM = "#F2E9D8";
const RED = "#FF4438";
const YELLOW = "#FFC531";
const BLUE = "#1F52D6";

const DISPLAY = "'Suez One', 'Arial Hebrew', Arial, sans-serif";
const BODY = "'Assistant Variable', Assistant, 'Segoe UI', Arial, sans-serif";

export type CardStyle = "player" | "wanted" | "poster" | "news";
export const CARD_STYLES: CardStyle[] = ["player", "wanted", "poster", "news"];

export interface EndCardData {
  name: string;
  emoji: string;
  award: Award;
  points: number;
  place: number;        // מקום בלוח הערב (1 = ראשון)
  totalPlayers: number;
  gamesPlayed: number;  // "ערב #7"
  roomCode: string;
  joinUrl: string;      // מה שה-QR מוביל אליו
  style?: CardStyle;    // כפייה ידנית (לתצוגות ובדיקות)
}

/* ---------- עזרים ---------- */

/** גיבוב יציב — אותו שחקן באותו ערב תמיד מקבל את אותו סגנון */
export function pickStyle(seed: string): CardStyle {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return CARD_STYLES[Math.abs(h) % CARD_STYLES.length];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** מדבקה: מילוי + קו דיו עבה + צל קשיח — חתימת השפה העיצובית */
function sticker(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  { r = 24, fill = PAPER_HI, line = INK, lw = 7, shadow = INK, off = 12 } = {}
) {
  if (off) {
    ctx.fillStyle = shadow;
    roundRect(ctx, x + off, y + off, w, h, r);
    ctx.fill();
  }
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = line;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
}

/** נקודות הדפסה — מה שהופך רקע שטוח ל"נייר מודפס" */
function halftone(ctx: CanvasRenderingContext2D, color: string, step = 18, r = 2) {
  ctx.fillStyle = color;
  for (let y = step; y < H; y += step) {
    for (let x = step; x < W; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** מקטין את הפונט עד שהטקסט נכנס לרוחב — עדיף אות קטנה מכותרת חתוכה */
function fitFont(ctx: CanvasRenderingContext2D, text: string, maxW: number, startPx: number, family: string, weight = "400"): number {
  let px = startPx;
  for (;;) {
    ctx.font = `${weight} ${px}px ${family}`;
    if (ctx.measureText(text).width <= maxW || px <= 22) return px;
    px -= 4;
  }
}

/** שובר טקסט לשורות לפי רוחב, ומצייר ממורכז. מחזיר את ה-Y אחרי השורה האחרונה */
function wrapCenter(
  ctx: CanvasRenderingContext2D, text: string, cx: number, y: number,
  maxW: number, px: number, family: string, weight = "400", lineH = 1.15
): number {
  ctx.font = `${weight} ${px}px ${family}`;
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  for (const l of lines) {
    ctx.fillText(l, cx, y);
    y += px * lineH;
  }
  return y;
}

/** כותרת על סרט צבעוני מוטה — האלמנט שהכי מזוהה עם לאריק */
function band(ctx: CanvasRenderingContext2D, text: string, cy: number, bg: string, fg: string, px = 62, tilt = -2) {
  ctx.save();
  ctx.font = `400 ${px}px ${DISPLAY}`;
  const tw = Math.min(ctx.measureText(text).width, W - 200);
  const padX = 46;
  const bw = tw + padX * 2;
  const bh = px * 1.62;
  ctx.translate(W / 2, cy);
  ctx.rotate((tilt * Math.PI) / 180);
  sticker(ctx, -bw / 2, -bh / 2, bw, bh, { r: 14, fill: bg, lw: 7, off: 10 });
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 4);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

async function qrImage(url: string, dark: string, light: string): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas");
  await QRCode.toCanvas(c, url, { width: 190, margin: 1, color: { dark, light } });
  return c;
}

/** הפוטר האחיד: QR שמצטרף לחדר + הכתובת. זה מה שהופך שיתוף לגיוס */
async function footer(ctx: CanvasRenderingContext2D, d: EndCardData, onDark: boolean) {
  const y = H - 250;
  const qr = await qrImage(d.joinUrl, INK, onDark ? CREAM : PAPER_HI);
  const qx = 92;
  sticker(ctx, qx - 14, y - 14, qr.width + 28, qr.height + 28, {
    r: 16, fill: onDark ? CREAM : PAPER_HI, lw: 6, off: 8,
    shadow: onDark ? RED : INK,
  });
  ctx.drawImage(qr, qx, y);

  ctx.textAlign = "right";
  ctx.fillStyle = onDark ? CREAM : INK;
  ctx.font = `400 54px ${DISPLAY}`;
  ctx.fillText("larik.ai", W - 92, y + 62);
  ctx.font = `700 34px ${BODY}`;
  ctx.fillStyle = onDark ? "rgba(242,233,216,.75)" : "rgba(23,19,16,.65)";
  ctx.fillText("סרקו והצטרפו לערב", W - 92, y + 112);
  ctx.fillText(`חדר ${d.roomCode} · ערב #${Math.max(1, d.gamesPlayed)}`, W - 92, y + 160);
  ctx.textAlign = "center";
}

/* ---------- ארבעת הסגנונות ---------- */

async function drawPlayer(ctx: CanvasRenderingContext2D, d: EndCardData) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  halftone(ctx, "rgba(23,19,16,.055)");

  sticker(ctx, 44, 44, W - 108, H - 128, { r: 40, fill: PAPER_HI, lw: 10, shadow: RED, off: 20 });

  ctx.textAlign = "center";
  ctx.fillStyle = RED;
  ctx.font = `700 34px ${BODY}`;
  ctx.fillText("· כרטיס שחקן ·", W / 2, 178);

  // אווטר במעגל דיו על צהוב — הדבר הראשון שהעין תופסת
  const cx = W / 2, cy = 400, r = 150;
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(cx + 10, cy + 12, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = YELLOW;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 9; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.font = `400 150px ${BODY}`;
  ctx.fillText(d.emoji, cx, cy + 54);

  const namePx = fitFont(ctx, d.name, W - 320, 82, DISPLAY);
  ctx.fillStyle = INK;
  ctx.font = `400 ${namePx}px ${DISPLAY}`;
  ctx.fillText(d.name, W / 2, 660);

  ctx.font = `400 96px ${BODY}`;
  ctx.fillText(d.award.emoji, W / 2, 800);

  band(ctx, d.award.title, 900, RED, PAPER_HI, fitFont(ctx, d.award.title, W - 300, 66, DISPLAY));

  if (d.award.detail) {
    ctx.fillStyle = "rgba(23,19,16,.72)";
    wrapCenter(ctx, d.award.detail, W / 2, 1010, W - 260, 42, BODY, "700");
  }

  // שלוש קופסאות סטטיסטיקה — המספרים הם מה שמשווים עליהם
  const stats: [string, string][] = [
    [String(d.points), "נקודות"],
    [`${d.place}/${d.totalPlayers}`, "מקום"],
    [String(Math.max(1, d.gamesPlayed)), "משחקים"],
  ];
  const bw = 268, gap = 26, top = 1150;
  const x0 = (W - (bw * 3 + gap * 2)) / 2;
  stats.forEach(([big, small], i) => {
    const x = x0 + i * (bw + gap);
    sticker(ctx, x, top, bw, 180, { r: 20, fill: PAPER, lw: 6, off: 9 });
    ctx.fillStyle = INK;
    ctx.font = `400 68px ${DISPLAY}`;
    ctx.fillText(big, x + bw / 2, top + 90);
    ctx.fillStyle = "rgba(23,19,16,.6)";
    ctx.font = `700 32px ${BODY}`;
    ctx.fillText(small, x + bw / 2, top + 140);
  });

  ctx.fillStyle = INK;
  ctx.font = `400 46px ${DISPLAY}`;
  ctx.fillText("LARIK", W / 2, 1470);
  ctx.fillStyle = "rgba(23,19,16,.6)";
  ctx.font = `700 32px ${BODY}`;
  ctx.fillText("ערב משחקים שלם בטלפון", W / 2, 1520);

  await footer(ctx, d, false);
}

async function drawWanted(ctx: CanvasRenderingContext2D, d: EndCardData) {
  ctx.fillStyle = "#F0E2C4";
  ctx.fillRect(0, 0, W, H);
  halftone(ctx, "rgba(23,19,16,.07)", 15, 2.2);

  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `400 130px ${DISPLAY}`;
  ctx.fillText("מבוקש", W / 2, 220);

  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(120, 268); ctx.lineTo(W - 120, 268); ctx.stroke();

  // מסגרת "תצלום" מרובעת — קלישאה מכוונת, וזה בדיוק מה שמצחיק
  const fx = 190, fy = 320, fw = W - 380, fh = 520;
  sticker(ctx, fx, fy, fw, fh, { r: 10, fill: "#E4D3B0", lw: 10, off: 14 });
  ctx.font = `400 260px ${BODY}`;
  ctx.fillText(d.emoji, W / 2, fy + fh / 2 + 96);

  const namePx = fitFont(ctx, d.name, W - 320, 90, DISPLAY);
  ctx.fillStyle = INK;
  ctx.font = `400 ${namePx}px ${DISPLAY}`;
  ctx.fillText(d.name, W / 2, 940);

  band(ctx, `${d.award.emoji} ${d.award.title}`, 1060, INK, PAPER_HI,
    fitFont(ctx, `${d.award.emoji} ${d.award.title}`, W - 300, 58, DISPLAY), 1.6);

  ctx.fillStyle = "rgba(23,19,16,.78)";
  const afterY = wrapCenter(ctx, d.award.headline ?? "", W / 2, 1200, W - 300, 44, BODY, "700");
  if (d.award.detail) {
    ctx.fillStyle = "rgba(23,19,16,.6)";
    wrapCenter(ctx, d.award.detail, W / 2, afterY + 18, W - 300, 38, BODY, "700");
  }

  // חותמת אדומה מוטה — האלמנט שגורם לכרטיס להיראות "אמיתי"
  ctx.save();
  ctx.translate(250, 1480);
  ctx.rotate((-17 * Math.PI) / 180);
  ctx.strokeStyle = RED;
  ctx.lineWidth = 9;
  ctx.beginPath(); ctx.arc(0, 0, 118, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 100, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = RED;
  ctx.font = `400 52px ${DISPLAY}`;
  ctx.fillText("אשם!", 0, 20);
  ctx.restore();

  ctx.fillStyle = INK;
  ctx.textAlign = "right";
  ctx.font = `700 40px ${BODY}`;
  ctx.fillText("נראה לאחרונה בערב משחקים", W - 140, 1440);
  ctx.font = `400 56px ${DISPLAY}`;
  ctx.fillText("LARIK", W - 140, 1512);
  ctx.font = `700 32px ${BODY}`;
  ctx.fillStyle = "rgba(23,19,16,.6)";
  ctx.fillText("הפרס: עוד סיבוב", W - 140, 1562);
  ctx.textAlign = "center";

  await footer(ctx, d, false);
}

async function drawPoster(ctx: CanvasRenderingContext2D, d: EndCardData) {
  ctx.fillStyle = INK_DEEP;
  ctx.fillRect(0, 0, W, H);
  // אלומת זרקור מלמעלה — הכרטיס היחיד בסדרה שהוא כהה, וזה מה שמבדל אותו
  const spot = ctx.createRadialGradient(W / 2, 240, 40, W / 2, 900, 1100);
  spot.addColorStop(0, "rgba(255,197,49,.32)");
  spot.addColorStop(0.5, "rgba(109,63,224,.16)");
  spot.addColorStop(1, "transparent");
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, W, H);
  halftone(ctx, "rgba(242,233,216,.05)", 20, 1.8);

  ctx.textAlign = "center";
  ctx.fillStyle = RED;
  ctx.font = `700 38px ${BODY}`;
  ctx.fillText("החבורה מציגה", W / 2, 190);

  ctx.fillStyle = CREAM;
  const titlePx = fitFont(ctx, d.award.title, W - 200, 116, DISPLAY);
  wrapCenter(ctx, d.award.title, W / 2, 340, W - 200, titlePx, DISPLAY, "400", 1.08);

  ctx.font = `400 300px ${BODY}`;
  ctx.fillText(d.emoji, W / 2, 900);

  ctx.fillStyle = YELLOW;
  ctx.font = `700 36px ${BODY}`;
  ctx.fillText("בכיכובו של", W / 2, 1010);
  ctx.fillStyle = CREAM;
  const namePx = fitFont(ctx, d.name, W - 300, 92, DISPLAY);
  ctx.font = `400 ${namePx}px ${DISPLAY}`;
  ctx.fillText(d.name, W / 2, 1100);

  if (d.award.headline) {
    ctx.fillStyle = "rgba(242,233,216,.72)";
    wrapCenter(ctx, `"${d.award.headline}"`, W / 2, 1200, W - 260, 42, BODY, "700");
  }

  band(ctx, `🏆 ערב #${Math.max(1, d.gamesPlayed)} · ${d.points} נק'`, 1400, BLUE, CREAM, 48, 1.5);

  ctx.fillStyle = "rgba(242,233,216,.55)";
  ctx.font = `700 30px ${BODY}`;
  ctx.fillText("בקולנוע שבסלון · בלי הורדה · בלי הרשמה", W / 2, 1520);

  await footer(ctx, d, true);
}

async function drawNews(ctx: CanvasRenderingContext2D, d: EndCardData) {
  ctx.fillStyle = "#F4EEE0";
  ctx.fillRect(0, 0, W, H);
  halftone(ctx, "rgba(23,19,16,.06)", 14, 1.9);

  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `400 92px ${DISPLAY}`;
  ctx.fillText("הידיעות של הערב", W / 2, 170);

  ctx.lineWidth = 9;
  ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.moveTo(80, 210); ctx.lineTo(W - 80, 210); ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(80, 226); ctx.lineTo(W - 80, 226); ctx.stroke();

  ctx.fillStyle = "rgba(23,19,16,.6)";
  ctx.font = `700 30px ${BODY}`;
  ctx.fillText(`גיליון #${Math.max(1, d.gamesPlayed)} · מהדורת חדר ${d.roomCode} · המחיר: חינם`, W / 2, 278);

  // הכותרת הראשית היא ה"סיפור" של התואר — זה מה שמצחיק בשיתוף
  ctx.fillStyle = INK;
  const head = d.award.headline ?? d.award.title;
  const headPx = fitFont(ctx, head.split(" ").sort((a, b) => b.length - a.length)[0] ?? head, W - 180, 104, DISPLAY);
  const afterHead = wrapCenter(ctx, head, W / 2, 400, W - 160, headPx, DISPLAY, "400", 1.12);

  ctx.fillStyle = RED;
  ctx.font = `700 40px ${BODY}`;
  ctx.fillText(`${d.award.emoji} ${d.name} — ${d.award.title}`, W / 2, afterHead + 30);

  const py = afterHead + 80;
  const ph = 500;
  sticker(ctx, 140, py, W - 280, ph, { r: 8, fill: YELLOW, lw: 8, off: 12 });
  ctx.font = `400 260px ${BODY}`;
  ctx.fillText(d.emoji, W / 2, py + ph / 2 + 94);

  ctx.fillStyle = "rgba(23,19,16,.65)";
  ctx.font = `700 32px ${BODY}`;
  ctx.fillText(d.award.detail ?? `${d.points} נקודות · מקום ${d.place} מתוך ${d.totalPlayers}`, W / 2, py + ph + 60);

  // שתי עמודות "טקסט" — רק מרקם, אף אחד לא אמור לקרוא אותן
  const colTop = py + ph + 100;
  const colW = (W - 300) / 2;
  ctx.fillStyle = "rgba(23,19,16,.22)";
  for (let c = 0; c < 2; c++) {
    const x = 150 + c * (colW + 40);
    for (let i = 0; i < 7; i++) {
      const lw2 = i === 6 ? colW * 0.6 : colW;
      roundRect(ctx, x, colTop + i * 26, lw2, 8, 4);
      ctx.fill();
    }
  }

  await footer(ctx, d, false);
}

/* ---------- API ---------- */

export async function drawEndCard(data: EndCardData): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.direction = "rtl";
  ctx.textAlign = "center";

  // בלי זה הפונטים עדיין לא נטענו והכרטיס יוצא ב-Arial
  try { await (document as Document & { fonts?: FontFaceSet }).fonts?.ready; } catch { /* דפדפן ישן */ }

  const style = data.style ?? pickStyle(`${data.roomCode}:${data.name}:${data.gamesPlayed}`);
  if (style === "wanted") await drawWanted(ctx, data);
  else if (style === "poster") await drawPoster(ctx, data);
  else if (style === "news") await drawNews(ctx, data);
  else await drawPlayer(ctx, data);

  return canvas;
}

/** משתף את הכרטיס: share נטיבי עם קובץ אם אפשר, אחרת הורדה */
export async function shareEndCard(data: EndCardData): Promise<"shared" | "downloaded" | "failed"> {
  const canvas = await drawEndCard(data);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return "failed";
  const file = new File([blob], "larik-card.png", { type: "image/png" });
  const text = `${data.award.emoji} ${data.award.title} — ככה נגמר לי הערב בלאריק. larik.ai`;

  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "LARIK", text });
      return "shared";
    } catch { return "failed"; } // המשתמש ביטל — לא מפילים להורדה מאחורי הגב שלו
  }

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "larik-card.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return "downloaded";
}
