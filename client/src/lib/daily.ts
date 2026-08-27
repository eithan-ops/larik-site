/**
 * רצף הימים של הטריוויה היומית.
 *
 * נשמר במכשיר בלבד — אין הרשמה, ואין למי לשייך רצף בשרת. המחיר הוא
 * שהרצף אישי למכשיר, וזה בסדר: הרצף הוא תזכורת עצמית, לא תחרות.
 *
 * הכלל: יום שהוחמץ שובר את הרצף, אבל *אתמול* ממשיך אותו. בלי זה
 * ה"רצף" הוא רק מונה משחקים, ואין לו שום כוח להחזיר מישהו מחר.
 */

const KEY = "larik-daily";

export interface Streak {
  days: number;
  lastDay: string;       // YYYY-MM-DD
  lastScore?: number;
  best: number;
}

const EMPTY: Streak = { days: 0, lastDay: "", best: 0 };

/** התאריך המקומי של המשתמש, לא UTC — "היום" הוא היום שלו */
export function todayISO(d = new Date()): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function prevDay(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return todayISO(d);
}

export function loadStreak(): Streak {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Streak) : EMPTY;
    // רצף שנשבר מוצג כאפס כבר בכניסה, ולא רק אחרי המשחק הבא
    if (s.lastDay && s.lastDay !== todayISO() && s.lastDay !== prevDay(todayISO())) {
      return { ...s, days: 0 };
    }
    return s;
  } catch { return EMPTY; }
}

export function saveStreak(day: string, score: number): Streak {
  const cur = loadStreak();
  if (cur.lastDay === day) return cur; // כבר שיחק היום — לא מנפחים רצף
  const days = cur.lastDay === prevDay(day) ? cur.days + 1 : 1;
  const next: Streak = { days, lastDay: day, lastScore: score, best: Math.max(cur.best, days) };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* אין אחסון */ }
  return next;
}
