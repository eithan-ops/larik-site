/**
 * שחרור הסאונד באייפון — הטריק של unmute.js.
 *
 * מתג ההשתקה של האייפון משתיק WebAudio לחלוטין, אבל לא את ערוץ
 * המדיה (זה שסרטונים מתנגנים בו). תג <audio> שמנגן שקט בלולאה מעביר
 * את סשן האודיו כולו לערוץ המדיה — ומאותו רגע גם WebAudio נשמע,
 * גם כשהמתג על שקט. חייב להיקרא מתוך מחוות משתמש (מגע/קליק).
 */
let el: HTMLAudioElement | null = null;

function silentWav(): string {
  // 50ms של שקט, 8kHz מונו 8-ביט — נבנה בזיכרון, בלי קובץ ובלי base64 ענק
  const rate = 8000, n = 400;
  const buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, "data"); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  let s = "";
  new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
  return "data:audio/wav;base64," + btoa(s);
}

export function unlockIosAudio() {
  if (el) { if (el.paused) el.play().catch(() => {}); return; }
  try {
    const a = document.createElement("audio");
    a.setAttribute("playsinline", "");
    a.loop = true;
    a.src = silentWav();
    el = a;
    a.play().catch(() => { el = null; });
  } catch { el = null; }
}
