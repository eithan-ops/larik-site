/**
 * LARIK — מנוע התארים.
 *
 * למה זה קיים: "מקום ראשון, שני, שלישי" זה לוח תוצאות. תואר זה סיפור.
 * לוח תוצאות מסתכלים עליו פעם אחת; תואר מראים לחבר שיושב לידך —
 * וזה בדיוק הרגע שמייצר את השיתוף, ולכן את המשתמש הבא.
 *
 * שני עקרונות שמנחים את הקובץ הזה:
 *  1. **כל שחקן מקבל תואר, ואף תואר לא ניתן פעמיים.** אם שניים מקבלים
 *     "מלך הערב" — אין מה להשוות, ואין מה לשתף.
 *  2. **דטרמיניסטי לחלוטין.** אותן עובדות ⇐ אותם תארים, תמיד.
 *     בלי Math.random: שוברי שוויון לפי מזהה שחקן, כדי שבדיקות יהיו יציבות.
 */
import type { PlayerFacts, Award } from "../../shared/protocol";

/* ---------- מיזוג עובדות ---------- */

type MergePolicy = "sum" | "min" | "max";

/** ברירת המחדל היא צבירה; זמנים הם "הכי טוב", ורצפים הם "הגבוה ביותר" */
const FACT_MERGE: Partial<Record<keyof PlayerFacts, MergePolicy>> = {
  bestReactionMs: "min",
  bestStreak: "max",
};

/** ממזג עובדות של משחק בודד לתוך הצבירה של הערב */
export function mergeFacts(into: PlayerFacts, add: PlayerFacts): PlayerFacts {
  for (const k of Object.keys(add) as (keyof PlayerFacts)[]) {
    const v = add[k];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const cur = into[k];
    const policy = FACT_MERGE[k] ?? "sum";
    if (cur === undefined) into[k] = v;
    else if (policy === "min") into[k] = Math.min(cur, v);
    else if (policy === "max") into[k] = Math.max(cur, v);
    else into[k] = cur + v;
  }
  return into;
}

/* ---------- קטלוג התארים ---------- */

interface Candidate {
  /** ככל שגבוה יותר — השחקן מתאים יותר לתואר הזה */
  score: number;
  detail?: string;
  headline?: string;
}

interface AwardDef {
  id: string;
  emoji: string;
  title: string;
  /** סדר ההקצאה: תארים חזקים נתפסים ראשונים */
  priority: number;
  test(f: PlayerFacts, all: PlayerFacts[]): Candidate | null;
}

const sec = (ms: number) => (ms / 1000).toFixed(2);
const times = (n: number) => (n === 1 ? "פעם אחת" : n === 2 ? "פעמיים" : `${n} פעמים`);

/**
 * סדר החשיבות: קודם התארים שמספרים סיפור מדיד ("0.41 שניות"),
 * ואז אלה שמספרים סיפור חברתי, ובסוף תארי הנחמה.
 * תואר בלי כיסוי בעובדות פשוט לא נבחר — עדיף פחות תארים מתואר משקר.
 */
const CATALOG: AwardDef[] = [
  {
    id: "king", emoji: "👑", title: "מלך הערב", priority: 100,
    test: (f, all) => {
      const pts = f.points ?? 0;
      if (pts <= 0) return null;
      const best = Math.max(...all.map((x) => x.points ?? 0));
      if (pts < best) return null;
      return { score: 1000 + pts, detail: `${pts} נקודות`, headline: "סיים את הערב על הכתר" };
    },
  },
  {
    id: "fastest", emoji: "⚡", title: "האצבע הכי מהירה", priority: 95,
    test: (f, all) => {
      const ms = f.bestReactionMs;
      if (ms === undefined) return null;
      const best = Math.min(...all.map((x) => x.bestReactionMs ?? Infinity));
      if (ms > best) return null;
      return { score: 900 + (2000 - Math.min(ms, 2000)), detail: `${sec(ms)} שניות`, headline: "אף אחד לא הספיק לראות מה קרה" };
    },
  },
  {
    id: "traitor", emoji: "🕵️", title: "הבוגד של הערב", priority: 92,
    test: (f, all) => {
      const rounds = f.impostorRounds ?? 0;
      if (rounds < 1) return null;
      const most = Math.max(...all.map((x) => x.impostorRounds ?? 0));
      if (rounds < most) return null;
      // אם כבר נמדד "לא נתפס" (יבוא כשתתווסף הצבעה למתחזה) — זה משדרג את הכותרת
      const safe = f.impostorSafe ?? 0;
      return {
        score: 800 + rounds * 10 + safe * 20,
        detail: safe > 0 ? `${times(rounds)} מתחזה, ${times(safe)} לא נתפס` : `היה המתחזה ${times(rounds)}`,
        headline: "ישב בין כולם ואף אחד לא חשד",
      };
    },
  },
  {
    id: "clown", emoji: "🤡", title: "ליצן הערב", priority: 90,
    test: (f, all) => {
      const n = f.clown ?? 0;
      if (n < 1) return null;
      const worst = Math.max(...all.map((x) => x.clown ?? 0));
      if (n < worst) return null;
      return { score: 700 + n * 10, detail: n > 1 ? times(n) : undefined, headline: "הפסיד, ודאג שכולם ידעו" };
    },
  },
  {
    id: "brain", emoji: "🧠", title: "המוח של הערב", priority: 85,
    test: (f, all) => {
      const n = f.correct ?? 0;
      if (n < 3) return null;
      const best = Math.max(...all.map((x) => x.correct ?? 0));
      if (n < best) return null;
      return { score: 600 + n, detail: `${n} תשובות נכונות`, headline: "ידע דברים שאף אחד לא הבין למה הוא יודע" };
    },
  },
  {
    id: "streak", emoji: "🔥", title: "על גל חם", priority: 84,
    test: (f) => {
      const s = f.bestStreak ?? 0;
      if (s < 2) return null;
      return { score: 580 + s * 20, detail: `${s} ניצחונות ברצף`, headline: "לא הפסיק לנצח וזה התחיל להיות מעצבן" };
    },
  },
  {
    id: "versatile", emoji: "🎖️", title: "טוב בכל דבר", priority: 82,
    test: (f, all) => {
      const n = f.wonGames ?? 0;
      if (n < 2) return null;
      const best = Math.max(...all.map((x) => x.wonGames ?? 0));
      if (n < best) return null;
      return { score: 560 + n * 10, detail: `ניצח ב-${n} משחקים שונים`, headline: "החליף משחק, נשאר מנצח" };
    },
  },
  {
    id: "machine", emoji: "🎰", title: "מכונת נגיעות", priority: 78,
    test: (f, all) => {
      const n = f.taps ?? 0;
      if (n < 5) return null;
      const best = Math.max(...all.map((x) => x.taps ?? 0));
      if (n < best) return null;
      return { score: 500 + n, detail: `${n} פודים`, headline: "השולחן עוד רועד" };
    },
  },
  {
    id: "survivor", emoji: "🛡️", title: "האחרון ששרד", priority: 76,
    test: (f, all) => {
      const n = f.survivedLast ?? 0;
      if (n < 1) return null;
      const best = Math.max(...all.map((x) => x.survivedLast ?? 0));
      if (n < best) return null;
      return { score: 480 + n * 10, detail: n > 1 ? times(n) : undefined, headline: "כולם נפלו, הוא נשאר לעמוד" };
    },
  },
  {
    id: "detective", emoji: "🔍", title: "הבלש", priority: 74,
    test: (f, all) => {
      const n = f.guessed ?? 0;
      if (n < 2) return null;
      const best = Math.max(...all.map((x) => x.guessed ?? 0));
      if (n < best) return null;
      return { score: 460 + n * 10, detail: `${n} ניחושים מדויקים`, headline: "פיצח את זה לפני כולם" };
    },
  },
  {
    id: "peeker", emoji: "🐀", title: "נתפס מציץ", priority: 70,
    test: (f) => {
      const n = f.peeks ?? 0;
      if (n < 1) return null;
      return { score: 420 + n * 10, detail: times(n), headline: "ניסה לרמות, ונתפס בשידור חי" };
    },
  },
  {
    id: "confident", emoji: "🤷", title: "ביטחון עצמי מופרז", priority: 66,
    test: (f, all) => {
      const n = f.wrong ?? 0;
      if (n < 3) return null;
      const worst = Math.max(...all.map((x) => x.wrong ?? 0));
      if (n < worst) return null;
      return { score: 380 + n, detail: `${n} תשובות שגויות`, headline: "ענה מהר. ענה בביטחון. ענה לא נכון" };
    },
  },
  {
    id: "firstout", emoji: "💣", title: "הראשון שנופל", priority: 64,
    test: (f, all) => {
      const n = f.outFirst ?? 0;
      if (n < 1) return null;
      const worst = Math.max(...all.map((x) => x.outFirst ?? 0));
      if (n < worst) return null;
      return { score: 350 + n * 10, detail: n > 1 ? times(n) : undefined, headline: "הספיק להתיישב ונגמר לו הערב" };
    },
  },
  {
    id: "suspect", emoji: "😇", title: "החשוד שלא עשה כלום", priority: 62,
    test: (f) => {
      // שיחק הרבה, אף פעם לא היה המתחזה, ובכל זאת לא ניצח — הקורבן המושלם
      const g = f.games ?? 0;
      if (g < 2 || (f.impostorRounds ?? 0) > 0 || (f.wins ?? 0) > 0) return null;
      return { score: 320, detail: "תמיד חשוד, אף פעם אשם", headline: "לא עשה כלום, שילם על הכול" };
    },
  },
  {
    id: "solid", emoji: "📈", title: "העקבי של החבורה", priority: 40,
    test: (f) => {
      const g = f.games ?? 0;
      if (g < 2 || (f.clown ?? 0) > 0) return null;
      return { score: 200 + (f.points ?? 0), detail: `${g} משחקים בלי נפילה אחת`, headline: "בלי דרמות. פשוט טוב" };
    },
  },
  /* ---- תארי נחמה: תמיד עוברים, כדי שאף טלפון לא יישאר בלי כרטיס ---- */
  {
    id: "spirit", emoji: "🎉", title: "הרוח החיה", priority: 20,
    test: () => ({ score: 100, headline: "בלעדיו זה היה סתם ערב" }),
  },
  {
    id: "darkhorse", emoji: "🐎", title: "הסוס השחור", priority: 18,
    test: () => ({ score: 90, headline: "אף אחד לא ספר אותו. חבל להם" }),
  },
  {
    id: "quiet", emoji: "🤫", title: "השקט שמסוכן", priority: 16,
    test: () => ({ score: 80, headline: "לא אמר מילה כל הערב. מדאיג" }),
  },
  {
    id: "loyal", emoji: "🫡", title: "תמיד מגיע", priority: 14,
    test: () => ({ score: 70, headline: "אפשר לסמוך עליו שיענה להודעה" }),
  },
  {
    id: "chaos", emoji: "🌪️", title: "סוכן הכאוס", priority: 12,
    test: () => ({ score: 60, headline: "הכניס בלגן לכל משחק שנגע בו" }),
  },
  {
    id: "legend", emoji: "🃏", title: "מקרה מיוחד", priority: 10,
    test: () => ({ score: 50, headline: "אין הסבר. יש רק תוצאה" }),
  },
];

/* ---------- ההקצאה ---------- */

/**
 * מקצה תואר אחד לכל שחקן, בלי כפילויות.
 * האלגוריתם: עוברים על התארים לפי חשיבות; לכל תואר בוחרים את השחקן
 * הכי מתאים מבין אלה שעדיין בלי תואר. שובר שוויון: מזהה השחקן.
 */
export function computeAwards(facts: Record<string, PlayerFacts>): Record<string, Award> {
  const pids = Object.keys(facts).sort();
  const all = pids.map((p) => facts[p] ?? {});
  const out: Record<string, Award> = {};
  const taken = new Set<string>();

  const defs = [...CATALOG].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  for (const def of defs) {
    if (Object.keys(out).length === pids.length) break;
    let bestPid = "";
    let bestScore = -Infinity;
    let bestCand: Candidate | null = null;
    for (const pid of pids) {
      if (out[pid]) continue;
      const cand = def.test(facts[pid] ?? {}, all);
      if (!cand) continue;
      if (cand.score > bestScore) { bestScore = cand.score; bestPid = pid; bestCand = cand; }
    }
    if (!bestPid || !bestCand || taken.has(def.id)) continue;
    taken.add(def.id);
    out[bestPid] = {
      id: def.id, emoji: def.emoji, title: def.title,
      detail: bestCand.detail, headline: bestCand.headline,
    };
  }

  // רשת ביטחון: אם נגמרו התארים (יותר שחקנים מתארים) — אף אחד לא נשאר ריק
  for (const pid of pids) {
    if (out[pid]) continue;
    out[pid] = { id: "player", emoji: "🎮", title: "חלק מהחבורה", headline: "היה שם. זה נחשב" };
  }
  return out;
}
