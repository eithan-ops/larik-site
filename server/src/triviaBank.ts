/**
 * LARIK — מאגר הטריוויה.
 *
 * שתי דרישות שקובעות את כל המבנה כאן:
 *  1. **שאלה שנשאלה בסולו לא תחזור בערב הקבוצתי.** הפתרון הוא לא שני
 *     מאגרים נפרדים אלא מאגר אחד עם מזהה יציב לכל שאלה, ומעקב "נראה"
 *     שנשמר במכשיר של כל שחקן. החדר מסנן כל שאלה שמישהו מהנוכחים ראה.
 *  2. **המאגר חייב לגדול הרבה.** טריוויה יומית לשנה = 3,650 שאלות לשחקן.
 *     לכן הזרע הסטטי הוא רק ההתחלה, ויש "מפעל שאלות" שמייצר עוד לתוך
 *     האחסון (grow), ומדלג על כפילויות.
 *
 * ⚠️ מזהה שאלה הוא **המיקום שלה במערך**. לכן: מותר רק להוסיף בסוף.
 * מחיקה או שינוי סדר יהפכו את זיכרון ה"נראה" של כל השחקנים לשקר.
 */
import { TRIVIA, type TriviaQ } from "./decks";
import { getStore, type Store } from "./store";

export interface BankQ extends TriviaQ { id: number }

/** שאלות שנוצרו במפעל ונשמרו באחסון */
interface GrownBank { questions: TriviaQ[]; updatedAt: number }

const BANK_KEY = "trivia:bank";
const CATS: TriviaQ["cat"][] = ["israel", "world", "science"];

/** נרמול להשוואת כפילויות — סימני פיסוק ורווחים לא הופכים שאלה לחדשה */
function norm(q: string): string {
  return q.replace(/[^֐-׿a-zA-Z0-9]/g, "").toLowerCase();
}

/** גיבוב יציב לבחירה דטרמיניסטית (אותו יום ⇐ אותן שאלות לכולם) */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

export class TriviaBank {
  private store?: Store;
  private grown: TriviaQ[] = [];
  private loaded = false;

  constructor(store?: Store) {
    this.store = store;
  }

  /** נטען פעם אחת; נכשל בשקט — המאגר הסטטי לבדו עדיין משחק */
  async load(): Promise<void> {
    if (this.loaded || !this.store) { this.loaded = true; return; }
    this.loaded = true;
    try {
      const b = await this.store.get<GrownBank>(BANK_KEY);
      if (b?.questions?.length) this.grown = b.questions;
    } catch { /* אין אחסון — ממשיכים עם הזרע */ }
  }

  /** כל השאלות עם מזהים. הסדר קבוע: זרע ואז מה שנוצר, לפי סדר היצירה. */
  all(): BankQ[] {
    return [...TRIVIA, ...this.grown].map((q, id) => ({ ...q, id }));
  }

  size(): number { return TRIVIA.length + this.grown.length; }

  /**
   * בוחר שאלות מהמאגר.
   * `exclude` — מזהים שכבר נראו (איחוד של כל הנוכחים בחדר).
   * `seed` — כשניתן, הבחירה דטרמיניסטית: אותו זרע מחזיר בדיוק אותן שאלות.
   *
   * אם אחרי הסינון אין מספיק שאלות, מרפים מהסינון במקום להחזיר פחות —
   * ערב שנעצר כי "נגמרו השאלות" הוא באג, חזרה על שאלה היא רק חבל.
   */
  pick(n: number, opts: { exclude?: Set<number>; cat?: string; seed?: string } = {}): BankQ[] {
    const { exclude, cat, seed } = opts;
    const pool = this.all().filter((q) => !cat || cat === "mix" || q.cat === cat);
    const fresh = exclude?.size ? pool.filter((q) => !exclude.has(q.id)) : pool;
    const source = fresh.length >= n ? fresh : pool;
    return this.shuffle(source, seed).slice(0, Math.min(n, source.length));
  }

  /** השאלות של היום — זהות לכל השחקנים בעולם, כדי שתהיה טבלה יומית אמיתית */
  daily(dateISO: string, n = 10): BankQ[] {
    return this.pick(n, { seed: `daily:${dateISO}` });
  }

  /** ערבוב דטרמיניסטי כשיש זרע, ואקראי אמיתי כשאין */
  private shuffle(list: BankQ[], seed?: string): BankQ[] {
    if (!seed) return [...list].sort(() => Math.random() - 0.5);
    return [...list]
      .map((q) => ({ q, k: hash(`${seed}:${q.id}`) }))
      .sort((a, b) => a.k - b.k || a.q.id - b.q.id)
      .map((x) => x.q);
  }

  /**
   * מפעל השאלות: מבקש מהמודל אצווה חדשה, מסנן פסולות וכפילויות, ומוסיף לאחסון.
   * מחזיר כמה נוספו בפועל — 0 הוא תוצאה לגיטימית כשהכול היה כפול.
   */
  async grow(
    n: number,
    cat: TriviaQ["cat"],
    ask: (prompt: string, maxTokens?: number) => Promise<string>
  ): Promise<{ added: number; skipped: number; size: number; error?: string; sample?: string }> {
    await this.load();
    const seen = new Set(this.all().map((q) => norm(q.q)));
    const sample = this.all().filter((q) => q.cat === cat).slice(-6).map((q) => q.q);

    const prompt = [
      `כתוב ${n} שאלות טריוויה בעברית בקטגוריה "${catName(cat)}".`,
      "לכל שאלה בדיוק 4 תשובות, אחת נכונה ושלוש מוטעות אך סבירות.",
      "רמת קושי בינונית — שאלה שאדם ישראלי ממוצע יכול לענות עליה בערב עם חברים.",
      "בלי שאלות על אירועים מהשנה האחרונה, ובלי שאלות שהתשובה שלהן משתנה עם הזמן.",
      "אל תחזור על השאלות האלה:",
      ...sample.map((q) => `- ${q}`),
      "",
      'החזר JSON בלבד במבנה: {"questions":[{"q":"...","options":["a","b","c","d"],"correct":0}]}',
    ].join("\n");

    // תקציב טוקנים לפי מספר השאלות. שאלה בעברית עם ארבע תשובות היא ~200
    // טוקנים, וברירת המחדל של 1200 חתכה את התשובה באמצע ה-JSON.
    let raw = "";
    let parsed: { questions?: TriviaQ[] };
    try {
      raw = await ask(prompt, Math.min(8000, 400 + n * 220));
      parsed = JSON.parse(extractJson(raw)) as { questions?: TriviaQ[] };
    } catch (e) {
      // מפעל ששותק הוא מפעל שאי אפשר לתקן — מחזירים את הסיבה ואת תחילת התשובה
      return {
        added: 0, skipped: 0, size: this.size(),
        error: (e as Error).message.slice(0, 120),
        sample: raw.slice(0, 200),
      };
    }
    if (!parsed.questions?.length) {
      return { added: 0, skipped: 0, size: this.size(), error: "המודל לא החזיר שאלות", sample: raw.slice(0, 200) };
    }

    let added = 0, skipped = 0;
    for (const q of parsed.questions ?? []) {
      if (!this.valid(q)) { skipped++; continue; }
      const key = norm(q.q);
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
      this.grown.push({ q: q.q.trim(), options: q.options.map((o) => String(o).trim()), correct: q.correct, cat });
      added++;
    }
    if (added && this.store) {
      try { await this.store.put<GrownBank>(BANK_KEY, { questions: this.grown, updatedAt: Date.now() }); }
      catch { /* לא נשמר — האצווה תחיה עד הריסטארט הבא */ }
    }
    return { added, skipped, size: this.size() };
  }

  /** שאלה פסולה שנכנסת למאגר נשארת שם לנצח — הסינון כאן הוא הגנה אמיתית */
  private valid(q: TriviaQ): boolean {
    if (!q || typeof q.q !== "string" || q.q.trim().length < 8) return false;
    if (!Array.isArray(q.options) || q.options.length !== 4) return false;
    if (q.options.some((o) => typeof o !== "string" || !o.trim())) return false;
    if (new Set(q.options.map((o) => String(o).trim())).size !== 4) return false;
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) return false;
    if (!/[֐-׿]/.test(q.q)) return false; // חייב להיות בעברית
    return true;
  }
}

/* ---------- מופע יחיד ---------- */

let bank: TriviaBank | null = null;

/**
 * המאגר של השרת. נטען פעם אחת מהאחסון; עד שהטעינה חוזרת עובדים על הזרע.
 * ברירת המחדל היא האחסון האמיתי — בלעדיה המאגר "עובד" אבל שום שאלה
 * שנוצרה לא נשמרת ולא נטענת, וזה נראה בדיוק כמו מפעל תקין שמייצר לחלל.
 */
export function getTriviaBank(store: Store = getStore()): TriviaBank {
  if (!bank) {
    bank = new TriviaBank(store);
    void bank.load();
  }
  return bank;
}

/** לבדיקות: מאגר נקי בלי לגעת במופע הגלובלי */
export function makeTriviaBank(store?: Store): TriviaBank {
  return new TriviaBank(store);
}

/**
 * מחלץ את גוש ה-JSON מתשובת המודל. מודלים עוטפים ב-```json, מוסיפים
 * משפט לפני, ולפעמים גם אחרי — לקחת מהסוגר הראשון עד האחרון עמיד יותר
 * מלנסות לנקות כל וריאציה בנפרד.
 */
function extractJson(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("לא נמצא JSON בתשובה");
  return raw.slice(start, end + 1);
}

function catName(cat: TriviaQ["cat"]): string {
  return cat === "israel" ? "ישראל" : cat === "science" ? "מדע וטבע" : "עולם וידע כללי";
}

export { CATS };
