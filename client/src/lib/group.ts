/**
 * LARIK — זהות מכשיר ו"החבורה שלנו" בצד הלקוח.
 *
 * הכלל שלא נשבר: **אין הרשמה.** מזהה השחקן נוצר במכשיר בפעם הראשונה
 * ונשמר ב-localStorage, וזה מספיק כדי שהעונה תזכור אותו בין ערבים.
 * מי שמחק אחסון פשוט בוחר את עצמו מרשימת החבורה וממשיך מאותה נקודה.
 *
 * localStorage ולא sessionStorage — בכוונה: sessionStorage מת עם הטאב,
 * וחבורה שנשכחת בכל פתיחת דפדפן היא לא חבורה.
 */

const PID_KEY = "larik-gpid";
const ME_KEY = "larik-me";
const GROUPS_KEY = "larik-groups";

export interface SavedGroup {
  id: string;
  name: string;
  lastPlayedAt: number;
}

export interface Me {
  name: string;
  emoji: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; } // מצב פרטי / אחסון חסום — לא מפילים את המשחק
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* אין אחסון — ממשיכים בלי זיכרון */ }
}

/** מזהה יציב למכשיר. נוצר פעם אחת ולא משתנה. */
export function myGpid(): string {
  try {
    let id = localStorage.getItem(PID_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(36).slice(2)).slice(0, 36);
      localStorage.setItem(PID_KEY, id);
    }
    return id;
  } catch {
    return ""; // בלי אחסון אין זהות יציבה; השרת ייפול למזהה החדר
  }
}

/** השם והאווטר האחרונים — כדי לא להקליד אותם בכל ערב */
export function loadMe(): Me | null {
  const me = read<Me | null>(ME_KEY, null);
  return me && me.name ? me : null;
}

export function saveMe(name: string, emoji: string) {
  write(ME_KEY, { name, emoji });
}

/** החבורות שהמכשיר הזה חבר בהן, האחרונה ששוחקה בראש */
export function myGroups(): SavedGroup[] {
  return read<SavedGroup[]>(GROUPS_KEY, []).sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
}

export function rememberGroup(id: string, name: string) {
  if (!id) return;
  const all = read<SavedGroup[]>(GROUPS_KEY, []).filter((g) => g.id !== id);
  all.push({ id, name, lastPlayedAt: Date.now() });
  write(GROUPS_KEY, all.slice(-12)); // תקרה שפויה — אף אחד לא חבר ב-12 חבורות
}

export function forgetGroup(id: string) {
  write(GROUPS_KEY, read<SavedGroup[]>(GROUPS_KEY, []).filter((g) => g.id !== id));
}

/** פותח חדר חדש עבור חבורה קיימת — הערב ייזקף לעונה שלה */
export async function openRoomForGroup(id: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/create-room?g=${encodeURIComponent(id)}`, { method: "POST" });
    const body = (await res.json()) as { code?: string };
    return body.code ?? null;
  } catch { return null; }
}
