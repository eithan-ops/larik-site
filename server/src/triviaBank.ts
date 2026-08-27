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

/**
 * שאלות שנוצרו במפעל ונשמרו באחסון.
 * `disabled` = מזהים שהוצאו משימוש. *לא* מוחקים, כי מזהה הוא מיקום במערך
 * ומחיקה הייתה הופכת את זיכרון ה"נראה" של כל השחקנים לשקר.
 */
interface GrownBank { questions: TriviaQ[]; disabled?: number[]; updatedAt: number }

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
  private disabled = new Set<number>();
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
      if (b?.disabled?.length) this.disabled = new Set(b.disabled);
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
    const pool = this.all()
      .filter((q) => !this.disabled.has(q.id))
      .filter((q) => !cat || cat === "mix" || q.cat === cat);
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
  ): Promise<{ added: number; skipped: number; size: number; rejected?: string[]; error?: string; sample?: string }> {
    await this.load();
    const seen = new Set(this.all().map((q) => norm(q.q)));
    const sample = this.all().filter((q) => q.cat === cat).slice(-6).map((q) => q.q);

    const prompt = [
      `כתוב ${n} שאלות טריוויה בעברית בקטגוריה "${catName(cat)}".`,
      "לכל שאלה בדיוק 4 תשובות, אחת נכונה ושלוש מוטעות אך סבירות.",
      "רמת קושי בינונית — שאלה שאדם ישראלי ממוצע יכול לענות עליה בערב עם חברים.",
      "בלי שאלות על אירועים מהשנה האחרונה, ובלי שאלות שהתשובה שלהן משתנה עם הזמן.",
      "",
      "כללי ניסוח מחייבים:",
      "- שאלה אחת בלבד לכל פריט, קצרה — עד 15 מילים, וסימן שאלה אחד.",
      "- אסור שהתשובה הנכונה תופיע בתוך נוסח השאלה.",
      "- בלי רמזים, בלי סוגריים מסבירים, בלי 'נשאל אחרת'.",
      "- ארבע התשובות באורך דומה. תשובה נכונה ארוכה מהשאר מסגירה את עצמה.",
      "- עברית תקנית בלבד. בלי אותיות משפות אחרות.",
      "- ודא שהתשובה שסימנת נכונה עובדתית. אם אינך בטוח — אל תכלול את השאלה.",
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

    // סבב אימות: המבנה תקין אבל העובדות לא נבדקו. "איזה משורר כתב את
    // שיר לשלום?" עם התשובה "לאה גולדברג" עובר כל ולידציה מבנית והוא פשוט
    // שגוי. רק שאלה חוזרת למודל תופסת את זה.
    const candidates = (parsed.questions ?? []).filter((q) => !this.valid(q));
    const vetoed = candidates.length ? await this.verify(candidates, ask) : new Set<number>();

    let added = 0, skipped = 0;
    const rejected: string[] = [];
    for (const q of parsed.questions ?? []) {
      const why = this.valid(q);
      if (why) { skipped++; rejected.push(`${why}: ${String(q?.q ?? "").slice(0, 40)}`); continue; }
      const ci = candidates.indexOf(q);
      if (ci >= 0 && vetoed.has(ci)) { skipped++; rejected.push(`נפסלה באימות: ${q.q.slice(0, 40)}`); continue; }
      const key = norm(q.q);
      if (seen.has(key)) { skipped++; rejected.push(`כפולה: ${q.q.slice(0, 40)}`); continue; }
      seen.add(key);
      this.grown.push({ q: q.q.trim(), options: q.options.map((o) => String(o).trim()), correct: q.correct, cat });
      added++;
    }
    if (added) await this.save();
    return { added, skipped, size: this.size(), rejected };
  }

  /**
   * מבקש מהמודל לבדוק את עצמו: לכל שאלה, האם התשובה המסומנת נכונה עובדתית.
   * זה לא מושלם, אבל זה הדבר היחיד שתופס שאלה תקינה־מבנית ושגויה־עובדתית,
   * וזו בדיוק הקטגוריה המסוכנת — היא נראית מצוין עד שמישהו יודע את התשובה.
   * כישלון של האימות עצמו לא פוסל כלום: עדיף לפספס מאשר להשמיד אצווה תקינה.
   */
  private async verify(
    qs: TriviaQ[],
    ask: (prompt: string, maxTokens?: number) => Promise<string>
  ): Promise<Set<number>> {
    const list = qs.map((q, i) => `${i}. ${q.q} -> התשובה המסומנת: "${q.options[q.correct]}"`).join("\n");
    const prompt = [
      "לפניך שאלות טריוויה בעברית עם התשובה שסומנה כנכונה.",
      "לכל שאלה החלט: האם התשובה המסומנת נכונה עובדתית, והאם השאלה מנוסחת היטב?",
      "פסול שאלה אם התשובה שגויה, אם יש יותר מתשובה נכונה אחת, או אם הניסוח מבלבל.",
      "אם אינך בטוח בעובדה — פסול. עדיף לוותר על שאלה מאשר לשאול שאלה שגויה.",
      "",
      list,
      "",
      'החזר JSON בלבד: {"reject":[מספרי השאלות לפסילה]}',
    ].join("\n");
    try {
      const raw = await ask(prompt, Math.min(4000, 300 + qs.length * 60));
      const parsed = JSON.parse(extractJson(raw)) as { reject?: number[] };
      return new Set((parsed.reject ?? []).filter((i) => Number.isInteger(i)));
    } catch {
      return new Set(); // האימות נפל — לא פוסלים כלום
    }
  }

  private async save(): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.put<GrownBank>(BANK_KEY, {
        questions: this.grown, disabled: [...this.disabled], updatedAt: Date.now(),
      });
    } catch { /* לא נשמר — השינוי יחיה עד הריסטארט הבא */ }
  }

  /**
   * מוציא שאלות משימוש בלי למחוק אותן.
   * זו הדרך היחידה לנקות זבל בלי לשבור את המזהים — ובלי זה, שאלה שגויה
   * שנכנסה פעם אחת נשארת במאגר לנצח.
   */
  async retire(ids: number[]): Promise<{ disabled: number; total: number }> {
    await this.load();
    for (const id of ids) if (Number.isInteger(id) && id >= 0 && id < this.size()) this.disabled.add(id);
    await this.save();
    return { disabled: this.disabled.size, total: this.size() };
  }

  /** כמה שאלות באמת זמינות למשחק */
  active(): number { return this.size() - this.disabled.size; }

  /**
   * שאלה פסולה שנכנסת למאגר נשארת שם לנצח, ולכן הסינון כאן הוא הגנה אמיתית.
   * כל כלל כאן נולד מדוגמה אמיתית שהמודל ייצר בסבב הראשון.
   */
  private valid(q: TriviaQ): string | null {
    if (!q || typeof q.q !== "string") return "אין שאלה";
    const text = q.q.trim();
    if (text.length < 8) return "קצרה מדי";
    // "באיזו שנה התרחשה הכայית..." — תו בטמילית שנכנס לתוך מילה עברית
    if (!/^[\u0590-\u05FFa-zA-Z0-9\s.,;:!?'"()\-–—״׳%/+&]+$/.test(text)) return "תווים זרים";
    // "...אך הקשר מתבטא גם בשם של חברה ממשלתית? נשאל אחרת: מהי הנקודה הנמוכה?"
    if ((text.match(/\?/g) ?? []).length > 1) return "שתי שאלות באחת";
    if (text.length > 110) return "ארוכה מדי";
    if (/\(רמז|רמז:/.test(text)) return "מכילה רמז";
    if (!/[\u0590-\u05FF]/.test(text)) return "לא בעברית";

    if (!Array.isArray(q.options) || q.options.length !== 4) return "לא 4 תשובות";
    const opts = q.options.map((o) => String(o ?? "").trim());
    if (opts.some((o) => !o)) return "תשובה ריקה";
    if (new Set(opts).size !== 4) return "תשובות כפולות";
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) return "אינדקס לא חוקי";

    // "איזה צמח מזוהה עם חג בשקדיה?" כשהתשובה היא "שקדייה" — השאלה עונה על עצמה
    const answer = norm(opts[q.correct]);
    if (answer.length >= 3 && norm(text).includes(answer)) return "התשובה מופיעה בשאלה";

    // התשובה הארוכה בהרבה מהשאר היא רמז מובהק, גם כשהיא נכונה
    const others = opts.filter((_, i) => i !== q.correct).map((o) => o.length);
    const avg = others.reduce((a, b) => a + b, 0) / others.length;
    if (opts[q.correct].length > Math.max(18, avg * 2.2)) return "התשובה הנכונה ארוכה בהרבה מהשאר";

    return null;
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
