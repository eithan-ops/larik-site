/**
 * LARIK — האתגר היומי של החומה.
 *
 * למה זה קיים: מצב סולו הוא מנוע החזרה של המוצר — סיבה לפתוח את האפליקציה
 * גם כשאין חבורה בסלון. הטריוויה היומית לא יכולה למלא את התפקיד הזה, כי
 * היא צורכת 3,650 שאלות בשנה לכל שחקן ואי אפשר לייצר כאלה באיכות מספקת.
 * החומה, לעומת זאת, **לא צורכת תוכן בכלל**: אותו זרע ליום נותן אתגר זהה
 * לכל השחקנים בעולם, והוא אינסופי מעצם היותו משחק.
 *
 * הניקוד מגיע מהשרת, שמריץ את המשחק בעצמו — ולכן הטבלה היומית לא ניתנת
 * לזיוף מהלקוח. זה מה שהופך אותה למשהו ששווה להשוות בו.
 */
import type { Store } from "./store";
import { getStore } from "./store";

export interface DailyEntry {
  name: string;
  emoji: string;
  score: number;
  wave: number;
  at: number;
}

interface DailyBoard {
  date: string;
  entries: DailyEntry[];
  runs: number;
}

const TOP = 50;
const key = (date: string) => `wall:daily:${date}`;

/** התאריך של האתגר, לפי שעון ישראל — היום מתחלף בחצות המקומית ולא ב-UTC */
export function dailyDate(now = new Date()): string {
  const il = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  return `${il.getFullYear()}-${String(il.getMonth() + 1).padStart(2, "0")}-${String(il.getDate()).padStart(2, "0")}`;
}

/** הזרע של היום. גלוי בכוונה — הידיעה מה הזרע לא עוזרת לאף אחד לשחק טוב יותר. */
export function dailySeed(date = dailyDate()): string {
  return `wall:${date}`;
}

export class WallDaily {
  private store: Store;
  private now: () => number;

  constructor(store: Store = getStore(), now: () => number = () => Date.now()) {
    this.store = store;
    this.now = now;
  }

  async board(date = dailyDate()): Promise<DailyBoard> {
    try {
      const b = await this.store.get<DailyBoard>(key(date));
      if (b) return b;
    } catch { /* אין אחסון — טבלה ריקה, המשחק עצמו לא נפגע */ }
    return { date, entries: [], runs: 0 };
  }

  /**
   * רושם ריצה. שחקן שמשחק שוב באותו יום — התוצאה הטובה שלו נשמרת ולא האחרונה,
   * אחרת ניסיון כושל אחרי ריצה טובה היה מוחק אותה, וזה מרגיש כמו עונש.
   */
  async submit(entry: Omit<DailyEntry, "at">, date = dailyDate()): Promise<DailyBoard> {
    const b = await this.board(date);
    b.runs += 1;
    const prev = b.entries.findIndex((e) => e.name === entry.name && e.emoji === entry.emoji);
    if (prev >= 0) {
      if (entry.score <= b.entries[prev].score) { await this.save(date, b); return b; }
      b.entries.splice(prev, 1);
    }
    b.entries.push({ ...entry, at: this.now() });
    b.entries.sort((x, y) => y.score - x.score || y.wave - x.wave || x.at - y.at);
    b.entries = b.entries.slice(0, TOP);
    await this.save(date, b);
    return b;
  }

  /** המקום של ניקוד נתון בטבלה — מה שמוצג לשחקן בסוף הריצה */
  rankOf(b: DailyBoard, score: number): number {
    const i = b.entries.findIndex((e) => e.score === score);
    return i >= 0 ? i + 1 : b.entries.length + 1;
  }

  private async save(date: string, b: DailyBoard) {
    try { await this.store.put(key(date), b); }
    catch { /* לא נשמר — הריצה עדיין נספרה בזיכרון של הבקשה */ }
  }
}
