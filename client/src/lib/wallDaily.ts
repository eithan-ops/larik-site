/**
 * האתגר היומי של החומה — צד לקוח.
 *
 * כל ההיגיון בשרת: הוא בוחר את הזרע, פותח חדר שמתחיל מעצמו, ומחשב את
 * הניקוד. הלקוח רק מבקש קוד חדר ונכנס אליו. הבחירה הזאת גם מונעת זיוף
 * ניקוד וגם אומרת שהאתגר לא נשבר אם מישהו ייגע במסכי הלובי.
 */

export interface DailyEntry { name: string; emoji: string; score: number; wave: number }
export interface DailyBoard { date: string; runs: number; top: DailyEntry[] }

const PLAYED_KEY = "larik-wall-daily";

/** פותח חדר לאתגר של היום ומחזיר את הקוד */
export async function openDailyRoom(): Promise<string | null> {
  try {
    const r = await fetch("/api/wall-daily/room", { method: "POST" });
    const b = (await r.json()) as { code?: string };
    return b.code ?? null;
  } catch { return null; }
}

export async function dailyBoard(): Promise<DailyBoard | null> {
  try { return (await fetch("/api/wall-daily").then((r) => r.json())) as DailyBoard; }
  catch { return null; }
}

/** מה שיחקתי היום — מוצג בבית כדי שלא צריך להיכנס כדי לדעת */
export function myDailyRun(): { date: string; score: number } | null {
  try {
    const raw = localStorage.getItem(PLAYED_KEY);
    return raw ? (JSON.parse(raw) as { date: string; score: number }) : null;
  } catch { return null; }
}

export function rememberDailyRun(date: string, score: number) {
  const prev = myDailyRun();
  // שומרים את התוצאה הטובה של היום, לא האחרונה — בדיוק כמו בטבלה בשרת
  if (prev?.date === date && prev.score >= score) return;
  try { localStorage.setItem(PLAYED_KEY, JSON.stringify({ date, score })); } catch { /* אין אחסון */ }
}
