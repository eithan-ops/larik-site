/**
 * התהום 🕳️ — "מפת הפיר": חפץ השיתוף שנוצר לבד בסוף צניחה.
 *
 * פיר אנכי עם קווי המדפים והמכפילים, והאימוג'י של כל שחקן במקום שבו יצא —
 * ⬆️ על המדף שבו עצר (עם הסכום), 💀 בנקודת הנפילה, 🏆 מי שלקח את הקרן.
 * הכותרת נכתבת לבד ("5 עצרו. אחד המשיך. 1,840 מטר.") והכרטיס הוא *לכל טלפון*:
 * השורה האישית שונה לעוצר, לנתפס וללוקח הקרן. QR שמצטרף לחדר — השיתוף הוא גם גיוס.
 * קנבס 1080×1920 בשפת המדבקות, כמו endcard.ts.
 */
import QRCode from "qrcode";

const W = 1080, H = 1920;
const INK = "#0C0906", PAPER = "#FFF3DC", CREAM = "#F2E9D8";
const CYAN = "#38C8E8", GOLD = "#FFC531", GREEN = "#2ED47A";
const DISPLAY = "'Suez One', 'Arial Hebrew', Arial, sans-serif";
const BODY = "'Assistant Variable', Assistant, 'Segoe UI', Arial, sans-serif";

export interface ShaftRow { pid: string; name: string; emoji: string; banked: number; at: number; caught: boolean; pot: number; caughtK?: number }
export interface ShaftCardData {
  me: string;
  rows: ShaftRow[];
  ledgeDepths: number[];        // עומק (יחידות=מטרים) של כל מדף שנפתח בצניחה
  mult: number[];
  potLost: number;
  descent: number; of: number;
  roomCode: string; joinUrl: string;
  groupName?: string; groupEvening?: number;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function sticker(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, { r = 24, fill = PAPER, line = INK, lw = 7, shadow = INK, off = 12 } = {}) {
  if (off) { c.fillStyle = shadow; roundRect(c, x - off * 0.5, y + off, w, h, r); c.fill(); }
  c.fillStyle = fill; roundRect(c, x, y, w, h, r); c.fill();
  c.lineWidth = lw; c.strokeStyle = line; roundRect(c, x, y, w, h, r); c.stroke();
}
function band(c: CanvasRenderingContext2D, text: string, cx: number, cy: number, bg: string, fg: string, px = 62, tilt = -2) {
  c.save(); c.font = `400 ${px}px ${DISPLAY}`;
  const tw = Math.min(c.measureText(text).width, W - 200), bw = tw + 92, bh = px * 1.62;
  c.translate(cx, cy); c.rotate((tilt * Math.PI) / 180);
  sticker(c, -bw / 2, -bh / 2, bw, bh, { r: 14, fill: bg, lw: 7, off: 10 });
  c.fillStyle = fg; c.textBaseline = "middle"; c.textAlign = "center"; c.fillText(text, 0, 4); c.textBaseline = "alphabetic";
  c.restore();
}
function fitFont(c: CanvasRenderingContext2D, text: string, maxW: number, startPx: number, family: string, weight = "400"): number {
  let px = startPx;
  for (;;) { c.font = `${weight} ${px}px ${family}`; if (c.measureText(text).width <= maxW || px <= 22) return px; px -= 4; }
}
const fmt = (n: number) => Math.round(n).toLocaleString("he-IL");

/** הכותרת האוטומטית — המשפט שנשלח בוואטסאפ */
export function shaftHeadline(d: ShaftCardData): string {
  const stopped = d.rows.filter((r) => !r.caught && r.pot === 0 && r.at >= 0).length;
  const caught = d.rows.filter((r) => r.caught).length;
  const taker = d.rows.find((r) => r.pot > 0);
  const deepest = Math.max(0, ...d.ledgeDepths);
  const parts: string[] = [];
  if (stopped) parts.push(stopped === 1 ? "אחד עצר." : `${stopped} עצרו.`);
  if (caught) parts.push(caught === 1 ? "אחד נתפס." : `${caught} נתפסו.`);
  if (taker) parts.push(`הקרן אצל ${taker.name}.`);
  else if (d.potLost > 0) parts.push(`התהום בלעה ${fmt(d.potLost)}.`);
  if (deepest > 0) parts.push(`${fmt(deepest)} מטר.`);
  return parts.join(" ");
}
export function shaftPersonalLine(d: ShaftCardData): string {
  const r = d.rows.find((x) => x.pid === d.me);
  if (!r) return "צפית מלמעלה";
  if (r.pot > 0) return `לקחת את הכול — ${fmt(r.banked)}`;
  if (r.caught) { const dep = d.ledgeDepths[Math.max(0, (r.caughtK ?? 0))] ?? 0; return `התהום תפסה אותך ב-${fmt(dep * 0.6)} מטר`; }
  if (r.at >= 0) return `עצרת במדף ${r.at + 1} — ${fmt(r.banked)} בבטחה`;
  return "";
}

export async function drawShaftCard(d: ShaftCardData): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d")!;
  c.direction = "rtl"; c.textAlign = "center";
  try { await (document as Document & { fonts?: FontFaceSet }).fonts?.ready; } catch { /* דפדפן ישן */ }

  // רקע התהום
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1B2246"); bg.addColorStop(0.6, "#1A1233"); bg.addColorStop(1, "#0A070E");
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  c.fillStyle = "rgba(255,255,255,.05)";
  for (let y = 18; y < H; y += 26) for (let x = 18; x < W; x += 26) { c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill(); }

  // כותרת
  band(c, "🕳️ התהום", W / 2, 150, CYAN, INK, 74, -2);
  const head = shaftHeadline(d);
  const hp = fitFont(c, head, W - 140, 46, BODY, "800");
  c.font = `800 ${hp}px ${BODY}`; c.fillStyle = PAPER; c.fillText(head, W / 2, 262);
  const mine = shaftPersonalLine(d);
  if (mine) band(c, mine, W / 2, 340, GOLD, INK, 44, 1.5);

  // הפיר
  const top = 430, bottom = H - 330, sx0 = 250, sx1 = W - 250;
  const n = Math.max(1, d.ledgeDepths.length);
  const depths = d.ledgeDepths.length ? d.ledgeDepths : [1];
  const maxD = Math.max(...depths) * 1.08;
  const yOf = (depth: number) => top + (depth / maxD) * (bottom - top);
  // קירות
  c.fillStyle = "#262C5C"; c.fillRect(sx0 - 60, top - 40, 60, bottom - top + 80); c.fillRect(sx1, top - 40, 60, bottom - top + 80);
  c.lineWidth = 7; c.strokeStyle = INK;
  c.beginPath(); c.moveTo(sx0, top - 40); c.lineTo(sx0, bottom + 40); c.moveTo(sx1, top - 40); c.lineTo(sx1, bottom + 40); c.stroke();
  c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(sx0, top - 40, sx1 - sx0, bottom - top + 80);
  // מדפים
  for (let k = 0; k < n; k++) {
    const y = yOf(depths[k]);
    c.fillStyle = INK; c.fillRect(sx0 - 10, y + 6, sx1 - sx0 + 20, 22);
    c.fillStyle = "#3A4380"; c.fillRect(sx0 - 10, y, sx1 - sx0 + 20, 22);
    c.font = `800 28px ${BODY}`; c.fillStyle = CREAM; c.textAlign = "left";
    c.fillText(`מדף ${k + 1} · ×${d.mult[k] ?? "?"}`, sx1 + 74, y + 18);
    c.font = `700 24px ${BODY}`; c.fillStyle = "rgba(242,233,216,.6)"; c.textAlign = "right";
    c.fillText(`${fmt(depths[k])} מ'`, sx0 - 74, y + 18);
    c.textAlign = "center";
  }
  // שחקנים
  const rows = [...d.rows];
  const byLedge = new Map<number, ShaftRow[]>();
  for (const r of rows) {
    const k = r.caught ? (r.caughtK ?? 0) : r.at;
    const key = r.caught ? -100 - k : k;
    if (!byLedge.has(key)) byLedge.set(key, []);
    byLedge.get(key)!.push(r);
  }
  const avatar = (x: number, y: number, r: ShaftRow, kind: "stop" | "caught" | "pot" | "spec") => {
    const R = 44;
    const col = kind === "pot" ? GOLD : kind === "caught" ? "#6B6B6B" : kind === "stop" ? GREEN : CYAN;
    c.fillStyle = col; c.beginPath(); c.arc(x - 5, y + 7, R, 0, Math.PI * 2); c.fill();
    c.fillStyle = PAPER; c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill();
    c.lineWidth = 6; c.strokeStyle = INK; c.stroke();
    c.font = `56px ${BODY}`; c.textBaseline = "middle"; c.fillStyle = INK; c.fillText(r.emoji, x, y + 4); c.textBaseline = "alphabetic";
    const badge = kind === "pot" ? "🏆" : kind === "caught" ? "💀" : "⬆️";
    c.font = "34px sans-serif"; c.fillText(badge, x + R * 0.8, y - R * 0.75);
    c.font = `800 26px ${BODY}`; c.fillStyle = PAPER;
    c.lineWidth = 6; c.strokeStyle = INK; c.strokeText(r.name, x, y + R + 34); c.fillText(r.name, x, y + R + 34);
    if (kind !== "caught") {
      c.font = `400 30px ${DISPLAY}`; c.fillStyle = kind === "pot" ? GOLD : GREEN;
      c.strokeText(`+${fmt(r.banked)}`, x, y + R + 68); c.fillText(`+${fmt(r.banked)}`, x, y + R + 68);
    }
    if (r.pid === d.me) { c.lineWidth = 5; c.strokeStyle = PAPER; c.setLineDash([8, 8]); c.beginPath(); c.arc(x, y, R + 12, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); }
  };
  for (const [key, list] of byLedge) {
    const caught = key <= -100;
    const k = caught ? -100 - key : key;
    if (k < 0) continue;
    const yBase = caught ? (k === 0 ? (top + yOf(depths[0])) / 2 : (yOf(depths[k - 1]) + yOf(depths[Math.min(k, n - 1)])) / 2) : yOf(depths[Math.min(k, n - 1)]) - 60;
    const span = Math.min(sx1 - sx0 - 140, 150 * list.length);
    list.forEach((r, i) => {
      const x = list.length === 1 ? (sx0 + sx1) / 2 : sx0 + 70 + (span / (list.length - 1)) * i + ((sx1 - sx0 - 140) - span) / 2;
      avatar(x, yBase, r, r.pot > 0 ? "pot" : r.caught ? "caught" : "stop");
    });
  }
  if (d.potLost > 0) {
    c.font = `400 40px ${DISPLAY}`; c.fillStyle = "rgba(242,233,216,.75)";
    c.fillText(`🕳️ התהום בלעה ${fmt(d.potLost)}`, (sx0 + sx1) / 2, bottom + 14);
  }

  // פוטר: QR + larik.ai
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, d.joinUrl, { width: 190, margin: 1, color: { dark: INK, light: CREAM } });
  const y = H - 250, qx = 92;
  sticker(c, qx - 14, y - 14, qr.width + 28, qr.height + 28, { r: 16, fill: CREAM, lw: 6, off: 8, shadow: CYAN });
  c.drawImage(qr, qx, y);
  c.textAlign = "right"; c.fillStyle = CREAM;
  c.font = `400 54px ${DISPLAY}`; c.fillText("larik.ai", W - 92, y + 62);
  c.font = `700 34px ${BODY}`; c.fillStyle = "rgba(242,233,216,.75)";
  c.fillText("סרקו והצטרפו לצניחה הבאה", W - 92, y + 112);
  c.fillText(d.groupName ? `${d.groupName} · ערב ${Math.max(1, d.groupEvening ?? 1)}` : `חדר ${d.roomCode} · צניחה ${d.descent + 1}/${d.of}`, W - 92, y + 160);
  c.textAlign = "center";
  return canvas;
}

export async function shareShaftCard(d: ShaftCardData, blob?: Blob | null): Promise<"shared" | "downloaded" | "failed"> {
  const b = blob ?? (await new Promise<Blob | null>((res) => drawShaftCard(d).then((cv) => cv.toBlob(res, "image/png"))));
  if (!b) return "failed";
  const file = new File([b], "larik-abyss.png", { type: "image/png" });
  const text = `🕳️ התהום — ${shaftHeadline(d)} larik.ai`;
  const nav = navigator as Navigator & { canShare?: (x: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: "LARIK — התהום", text }); return "shared"; } catch { return "failed"; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = "larik-abyss.png"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return "downloaded";
}
