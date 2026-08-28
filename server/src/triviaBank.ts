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
interface GrownBank { questions: TriviaQ[]; disabled?: number[]; pending?: PendingQ[]; updatedAt: number }

/**
 * שאלה שנוצרה ומחכה לאישור אנושי.
 *
 * למה תור ולא כניסה ישירה: שלושה סבבים מול הלייב הראו שהמודל לא יכול
 * לשמש גם כמקור וגם כבודק — ההמצאות שלו יציבות, ולכן גם שני סבבי אימות
 * בלתי תלויים מאשרים אותן. שאלה שגויה שנכנסת נשארת במאגר לנצח, ולכן
 * שום שאלה לא מגיעה לשחקנים לפני שאדם קרא אותה.
 *
 * `pid` יציב לאורך חיי התור, כדי שאישור לא יפגע בשאלה אחרת אם הרשימה
 * השתנתה בין הקריאה לאישור.
 */
export interface PendingQ extends TriviaQ { pid: string }

const BANK_KEY = "trivia:bank";
const CATS: TriviaQ["cat"][] = ["israel", "world", "science", "weird"];

/** נרמול להשוואת כפילויות — סימני פיסוק ורווחים לא הופכים שאלה לחדשה */
function norm(q: string): string {
  return q.replace(/[^֐-׿a-zA-Z0-9]/g, "").toLowerCase();
}

/**
 * הקלישאות שמודל חוזר אליהן כשלא עוצרים אותו. אלה לא שאלות שגויות —
 * הן פשוט משעממות, וכל אחת מהן תופסת מקום של שאלה שמישהו היה מספר עליה.
 * הרשימה מכוונת לנוסחים ספציפיים ולא לנושאים, כדי לא לחסום שאלה טובה
 * שבמקרה מזכירה בירה או מטבע.
 */
const BORING = [
  /^מהי? (עיר ה)?בירת/, /^איזו עיר היא בירת/,
  /^מהו? המטבע של/, /^איזה מטבע/,
  /^איזו יבשת/, /^מהו האוקיינוס/,
  /מי היה רא(ש|שת) הממשלה הראשון/, /^מי היה הנשיא הראשון/,
  /^באיזו שנה קמה מדינת ישראל/, /^כמה כוכבים/,
  /^כמה שבטים/, /^מי כתב את ["״]?התקווה/,
  /^מהו הים הנמוך/, /^מהי הנקודה הנמוכה/,
];

/** מזהה קצר ויציב לשאלה בתור — נגזר מהטקסט, כך שאותה שאלה לא תיכפל */
function pendingId(q: string): string {
  return hash(norm(q)).toString(36).slice(0, 8);
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
  private pending: PendingQ[] = [];
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
      if (b?.pending?.length) this.pending = b.pending;
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
  ): Promise<{ added: number; skipped: number; size: number; pending?: number; rejected?: string[]; error?: string; sample?: string }> {
    await this.load();
    const seen = new Set([...this.all(), ...this.pending].map((q) => norm(q.q)));
    const sample = this.all().filter((q) => q.cat === cat).slice(-6).map((q) => q.q);

    const prompt = [
      `כתוב ${n} שאלות טריוויה בעברית בקטגוריה "${catName(cat)}".`,
      "",
      "המבחן היחיד שקובע אם שאלה טובה: **מישהו סביב השולחן אומר 'מה?! באמת?'**",
      "אנחנו לא בונים מבחן בבית ספר. אנחנו בונים רגע שמישהו יספר עליו הלאה.",
      "",
      "סוגי שאלות שאנחנו רוצים:",
      "- עובדה שמתנגשת עם האינטואיציה ('באיזו מדינה יש יותר פירמידות מבמצרים?')",
      "- השוואות שמפתיעות בסדר הזמנים ('מה קדם למה?')",
      "- מקור מפתיע של דבר יומיומי — שם, מוצר, ביטוי, מנהג",
      "- קיצוניות מצחיקה: הקצר ביותר, הכבד ביותר, הכי מוזר שקרה",
      "- דברים שכולם רואים כל יום ואף אחד לא שאל למה הם ככה",
      "",
      "אסור בהחלט — שאלות שספר לימוד היה שואל:",
      "- בירות, מטבעות, יבשות, אוקיינוסים",
      "- 'מי היה הראשון ש...', 'באיזו שנה קמה', 'כמה כוכבים בדגל'",
      "- כל שאלה שהתשובה שלה נלמדת בכיתה ד'",
      "",
      "אם עובדה לא מפתיעה אותך — אל תכלול אותה. עדיף 5 שאלות מעולות מ-20 בינוניות.",
      "",
      "כללי ניסוח מחייבים:",
      "- שאלה אחת בלבד לכל פריט, קצרה — עד 15 מילים, וסימן שאלה אחד.",
      "- לכל שאלה בדיוק 4 תשובות. גם השגויות צריכות להישמע אפשריות ומעניינות.",
      "- אסור שהתשובה הנכונה תופיע בתוך נוסח השאלה.",
      "- בלי רמזים, בלי סוגריים מסבירים, בלי 'נשאל אחרת'.",
      "- ארבע התשובות באורך דומה. תשובה נכונה ארוכה מהשאר מסגירה את עצמה.",
      "- עברית תקנית בלבד. בלי אותיות משפות אחרות.",
      "- בלי אירועים מהשנה האחרונה ובלי תשובות שמשתנות עם הזמן.",
      "- **ודא שהעובדה נכונה.** אם אינך בטוח — אל תכלול את השאלה.",
      "",
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
      // לתור, לא למאגר. רק אישור אנושי מכניס שאלה למשחק.
      this.pending.push({
        pid: pendingId(q.q),
        q: q.q.trim(), options: q.options.map((o) => String(o).trim()), correct: q.correct, cat,
      });
      added++;
    }
    if (added) await this.save();
    return { added, skipped, size: this.size(), pending: this.pending.length, rejected };
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
      "פסול שאלה אם מתקיים אחד מאלה:",
      "1. התשובה המסומנת שגויה עובדתית, או שיש יותר מתשובה נכונה אחת.",
      "2. הניסוח מבלבל או דו-משמעי.",
      "3. **השאלה משעממת** — ידע בסיסי שספר לימוד שואל, בלי שום הפתעה.",
      "   המבחן: האם מישהו סביב שולחן היה אומר 'מה?! באמת?' כששומע את התשובה.",
      "",
      "היה חשדן במיוחד בשני מקרים שבהם קל להמציא:",
      "- **טענות מקור** ('הומצא במקור עבור', 'נוצר כדי'). אם אינך יודע בוודאות",
      "  שזה מתועד — פסול. סיפור מקור שנשמע טוב הוא בדרך כלל מומצא.",
      "- **שמות מקצועיים בעברית**. ודא שהמונח בתשובה הוא באמת מה שהשאלה מתארת",
      "  (למשל 'כסף' ו'כסף חי' הם שני חומרים שונים לגמרי).",
      "",
      "",
      "פסול רק כשאתה די בטוח שיש בעיה — אדם יקרא את כל מה שיעבור ממילא,",
      "ואין טעם לזרוק שאלה טובה רק כי אינך זוכר את העובדה בוודאות מלאה.",
      "",
      list,
      "",
      'החזר JSON בלבד: {"reject":[מספרי השאלות לפסילה]}',
    ].join("\n");

    /**
     * סבב אחד, לא שניים.
     *
     * שני סבבים עם "אם אינך בטוח — פסול" פסלו 14 מתוך 16, כולל שאלות
     * טובות ("איזה חלק בגוף אינו מקבל אספקת דם" — הקרנית). זה היה מוצדק
     * כשהאימות היה הקו האחרון; מרגע שיש תור אישור אנושי, תפקידו השתנה:
     * לחתוך את הזבל הברור, לא להיות השופט האחרון. אדם קורא הכול ממילא.
     */
    const budget = Math.min(4000, 300 + qs.length * 60);
    try {
      const raw = await ask(prompt, budget);
      const parsed = JSON.parse(extractJson(raw)) as { reject?: number[] };
      return new Set((parsed.reject ?? []).filter((i) => Number.isInteger(i)));
    } catch {
      return new Set(); // האימות נפל — התור עדיין מגן
    }
  }

  private async save(): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.put<GrownBank>(BANK_KEY, {
        questions: this.grown, disabled: [...this.disabled], pending: this.pending, updatedAt: Date.now(),
      });
    } catch { /* לא נשמר — השינוי יחיה עד הריסטארט הבא */ }
  }

  /** מה מחכה לאישור — זה מה שהאדם קורא לפני שהוא מחליט */
  async pendingList(): Promise<PendingQ[]> {
    await this.load();
    return [...this.pending];
  }

  /**
   * מאשר שאלות מהתור והכניס אותן למאגר. רק כאן שאלה מקבלת מזהה קבוע
   * ומתחילה להופיע לשחקנים.
   */
  async approve(pids: string[]): Promise<{ approved: number; pending: number; size: number }> {
    await this.load();
    const wanted = new Set(pids);
    const taking = this.pending.filter((p) => wanted.has(p.pid));
    if (!taking.length) return { approved: 0, pending: this.pending.length, size: this.size() };
    for (const p of taking) {
      this.grown.push({ q: p.q, options: p.options, correct: p.correct, cat: p.cat });
    }
    this.pending = this.pending.filter((p) => !wanted.has(p.pid));
    await this.save();
    return { approved: taking.length, pending: this.pending.length, size: this.size() };
  }

  /** דחיית שאלות מהתור — הן פשוט נעלמות, כי מעולם לא קיבלו מזהה */
  async rejectPending(pids: string[]): Promise<{ rejected: number; pending: number }> {
    await this.load();
    const wanted = new Set(pids);
    const before = this.pending.length;
    this.pending = this.pending.filter((p) => !wanted.has(p.pid));
    await this.save();
    return { rejected: before - this.pending.length, pending: this.pending.length };
  }

  pendingCount(): number { return this.pending.length; }

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
    // הבדיקה הזאת הייתה על השאלה בלבד, ו"פלמינגو" עם ואו ערבית עברה כתשובה.
    // תו זר בתשובה נראה תקין למי שסורק מהר, ונשאר במאגר לנצח.
    if (opts.some((o) => !/^[\u0590-\u05FFa-zA-Z0-9\s.,;:!?'"()\-–—״׳%/+&]+$/.test(o))) return "תווים זרים בתשובה";
    if (new Set(opts).size !== 4) return "תשובות כפולות";
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) return "אינדקס לא חוקי";

    // "איזה צמח מזוהה עם חג בשקדיה?" כשהתשובה היא "שקדייה" — השאלה עונה על עצמה
    const answer = norm(opts[q.correct]);
    if (answer.length >= 3 && norm(text).includes(answer)) return "התשובה מופיעה בשאלה";

    // שאלת ספר לימוד — נכונה, תקינה, ומשעממת. תופסת מקום של שאלה טובה.
    if (BORING.some((re) => re.test(text))) return "שאלת ספר לימוד";

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
  if (cat === "israel") return "ישראל";
  if (cat === "science") return "מדע וטבע";
  if (cat === "weird") return "עובדות מדהימות ומוזרות";
  return "עולם וידע כללי";
}

export { CATS };
