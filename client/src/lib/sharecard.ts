/**
 * כרטיס שיתוף — "לוח הערב" כתמונה מעוצבת לוואטסאפ.
 * כל קבוצה שמקבלת את הכרטיס היא מארח פוטנציאלי — זו הפרסומת הכי טובה של לאריק.
 * מצויר ב-canvas (אפס תלויות), משותף עם navigator.share; בלי תמיכה — הורדה.
 */

export interface BoardRow { name: string; emoji: string; score: number }

export interface ShareCardData {
  title: string; // שם המשחק האחרון
  rows: BoardRow[]; // ממוינים מהגבוה לנמוך
  clownName?: string;
}

const W = 1080;
const H = 1350;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawEveningBoard(data: ShareCardData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.direction = "rtl";
  ctx.textAlign = "center";

  /* רקע — סגול-לילה עם כתמי ניאון (השפה של האפליקציה) */
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#120c22");
  bg.addColorStop(1, "#0c0817");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const blob1 = ctx.createRadialGradient(W * 0.9, 60, 0, W * 0.9, 60, 500);
  blob1.addColorStop(0, "rgba(139,92,246,.35)");
  blob1.addColorStop(1, "transparent");
  ctx.fillStyle = blob1;
  ctx.fillRect(0, 0, W, H);
  const blob2 = ctx.createRadialGradient(W * 0.08, H * 0.95, 0, W * 0.08, H * 0.95, 550);
  blob2.addColorStop(0, "rgba(236,72,153,.3)");
  blob2.addColorStop(1, "transparent");
  ctx.fillStyle = blob2;
  ctx.fillRect(0, 0, W, H);

  /* לוגו */
  const logo = ctx.createLinearGradient(W * 0.3, 0, W * 0.7, 0);
  logo.addColorStop(0, "#c4b5fd");
  logo.addColorStop(0.5, "#8b5cf6");
  logo.addColorStop(1, "#ec4899");
  ctx.fillStyle = logo;
  ctx.font = "900 92px Rubik, 'Rubik Variable', Arial, sans-serif";
  ctx.fillText("LARIK", W / 2, 150);

  ctx.fillStyle = "#9d94c4";
  ctx.font = "700 40px Rubik, Arial, sans-serif";
  ctx.fillText("🌙 לוח הערב", W / 2, 225);
  ctx.font = "600 32px Rubik, Arial, sans-serif";
  ctx.fillText(data.title, W / 2, 278);

  /* שורות הדירוג */
  const rows = data.rows.slice(0, 8);
  const rowH = 104;
  const listTop = 340;
  const listW = 920;
  const x0 = (W - listW) / 2;
  rows.forEach((r, i) => {
    const y = listTop + i * (rowH + 14);
    ctx.fillStyle = i === 0 ? "rgba(255,201,60,.14)" : "rgba(255,255,255,.05)";
    roundRect(ctx, x0, y, listW, rowH, 26);
    ctx.fill();
    if (i === 0) {
      ctx.strokeStyle = "rgba(255,201,60,.8)";
      ctx.lineWidth = 3;
      roundRect(ctx, x0, y, listW, rowH, 26);
      ctx.stroke();
    }
    const medal = i === 0 ? "👑" : i === 1 ? "🥈" : i === 2 ? "🥉" : "·";
    ctx.textAlign = "right";
    ctx.font = `${i === 0 ? 800 : 600} 44px Rubik, Arial, sans-serif`;
    ctx.fillStyle = i === 0 ? "#ffc93c" : "#f6f4ff";
    ctx.fillText(`${medal} ${r.emoji} ${r.name}`, x0 + listW - 34, y + rowH / 2 + 16);
    ctx.textAlign = "left";
    ctx.font = "900 48px Rubik, Arial, sans-serif";
    ctx.fillStyle = i === 0 ? "#ffc93c" : "#34e89e";
    ctx.fillText(String(r.score), x0 + 40, y + rowH / 2 + 18);
    ctx.textAlign = "center";
  });

  /* הליצן 🤡 */
  let footY = listTop + rows.length * (rowH + 14) + 46;
  if (data.clownName) {
    ctx.font = "700 38px Rubik, Arial, sans-serif";
    ctx.fillStyle = "#ff8a8a";
    ctx.fillText(`🤡 הליצן של הערב: ${data.clownName}`, W / 2, footY);
    footY += 60;
  }

  /* קריאה לפעולה */
  ctx.font = "700 34px Rubik, Arial, sans-serif";
  ctx.fillStyle = "#f6f4ff";
  ctx.fillText("גם אתם רוצים ערב כזה?", W / 2, H - 130);
  ctx.font = "900 44px Rubik, Arial, sans-serif";
  ctx.fillStyle = "#34e89e";
  ctx.fillText("larik.ai", W / 2, H - 72);
  ctx.font = "600 28px Rubik, Arial, sans-serif";
  ctx.fillStyle = "#9d94c4";
  ctx.fillText("בלי הורדה · בלי הרשמה · הטלפון הוא המשחק", W / 2, H - 28);

  return canvas;
}

/** משתף את הלוח: share נטיבי עם קובץ אם אפשר, אחרת הורדה + פתיחת וואטסאפ */
export async function shareEveningBoard(data: ShareCardData): Promise<"shared" | "downloaded" | "failed"> {
  const canvas = drawEveningBoard(data);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return "failed";
  const file = new File([blob], "larik-night.png", { type: "image/png" });

  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "LARIK", text: "🎮 ככה נראה הערב שלנו בלאריק — larik.ai" });
      return "shared";
    } catch { /* המשתמש ביטל — לא מפילים להורדה */ return "failed"; }
  }

  // דפדפן בלי שיתוף קבצים (בעיקר דסקטופ) — מורידים את התמונה
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "larik-night.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return "downloaded";
}
