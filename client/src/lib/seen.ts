/**
 * LARIK — "מה כבר ראיתי".
 *
 * הדרישה: שאלה שנשאלה בטריוויה היומית לא תחזור בערב הקבוצתי, ולהפך.
 * הפתרון: כל מכשיר זוכר את מזהי השאלות שהוא ראה, ושולח אותם לחדר
 * כשהוא מצטרף. השרת מסנן כל שאלה שמישהו מהנוכחים ראה.
 *
 * למה במכשיר ולא בשרת: אין הרשמה, אין למי לשייך זיכרון כזה, וזה גם
 * חוסך אחסון. המחיר — מי שמנקה אחסון מתחיל מאפס, וזה מחיר סביר.
 */
import { encodeSeen, decodeSeen } from "../../../shared/bitset";

const KEY = "larik-seen-q";

let cache: Set<number> | null = null;

/** כל השאלות שהמכשיר הזה כבר ראה */
export function seenSet(): Set<number> {
  if (cache) return cache;
  try { cache = decodeSeen(localStorage.getItem(KEY) ?? ""); }
  catch { cache = new Set(); }
  return cache;
}

/** מסמן שאלות כנראו. נקרא גם בסולו וגם בכל שאלה בערב הקבוצתי. */
export function markSeen(ids: number | number[]) {
  const set = seenSet();
  const list = Array.isArray(ids) ? ids : [ids];
  let changed = false;
  for (const id of list) {
    if (typeof id === "number" && Number.isInteger(id) && !set.has(id)) { set.add(id); changed = true; }
  }
  if (!changed) return;
  try { localStorage.setItem(KEY, encodeSeen(set)); } catch { /* אין אחסון — הזיכרון חי עד רענון */ }
}

/** הייצוג הדחוס שנשלח לשרת בהצטרפות לחדר */
export function seenBlob(): string {
  const set = seenSet();
  return set.size ? encodeSeen(set) : "";
}

/** לכפתור "אפס לי את המאגר" בהגדרות, אם וכשיהיה */
export function clearSeen() {
  cache = new Set();
  try { localStorage.removeItem(KEY); } catch { /* לא נורא */ }
}
