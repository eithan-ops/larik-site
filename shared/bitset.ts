/**
 * LARIK — סט ביטים דחוס לזיכרון "מה כבר ראיתי".
 *
 * למה לא רשימת מזהים: אחרי שנה של טריוויה יומית לשחקן יש כ-3,650 שאלות
 * שהוא כבר ראה. רשימה כזו היא ~20KB בכל הצטרפות לחדר; סט ביטים של 10,000
 * שאלות הוא 1.25KB, וב-base64 בערך 1.7KB. זה ההבדל בין פיצ'ר לבין מס.
 *
 * הייצוג עמיד לגדילה: מזהה שאלה הוא מספר רץ שלא משתנה לעולם, ומאגר שגדל
 * רק מוסיף מזהים גבוהים יותר — כלומר סט ישן נשאר תקף בלי המרה.
 */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** מקודד אוסף מזהים לסט ביטים ב-base64 */
export function encodeSeen(ids: Iterable<number>): string {
  let max = -1;
  const list: number[] = [];
  for (const id of ids) {
    if (!Number.isInteger(id) || id < 0) continue;
    list.push(id);
    if (id > max) max = id;
  }
  if (max < 0) return "";
  const bytes = new Uint8Array(Math.floor(max / 8) + 1);
  for (const id of list) bytes[id >> 3] |= 1 << (id & 7);
  return bytesToB64(bytes);
}

/** מפענח סט ביטים חזרה לקבוצת מזהים. קלט פגום מחזיר קבוצה ריקה ולא זורק. */
export function decodeSeen(s: string): Set<number> {
  const out = new Set<number>();
  if (!s) return out;
  let bytes: Uint8Array;
  try { bytes = b64ToBytes(s); } catch { return out; }
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (!b) continue;
    for (let bit = 0; bit < 8; bit++) if (b & (1 << bit)) out.add(i * 8 + bit);
  }
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? "=" : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? "=" : B64[c & 63];
  }
  return out;
}

function b64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (idx(clean[i]) << 18) | (idx(clean[i + 1]) << 12) | (idx(clean[i + 2]) << 6) | idx(clean[i + 3]);
    if (p < out.length) out[p++] = (n >> 16) & 255;
    if (p < out.length) out[p++] = (n >> 8) & 255;
    if (p < out.length) out[p++] = n & 255;
  }
  return out;
}

function idx(ch: string | undefined): number {
  if (ch === undefined) return 0;
  const i = B64.indexOf(ch);
  return i < 0 ? 0 : i;
}
