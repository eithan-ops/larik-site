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
  hfDeepest: "max",
  abLedge: "max",
  abBest: "max",
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
      // "לא נתפס" נמדד מאז שהמתחזה למתקדמים הביא הצבעה אמיתית — והוא משדרג את הכותרת
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
    id: "hf_deep", emoji: "🕳️", title: "שיאן העומק", priority: 79,
    test: (f, all) => {
      const d = f.hfDeepest ?? 0;
      if (d < 30) return null;
      const best = Math.max(...all.map((x) => x.hfDeepest ?? 0));
      if (d < best) return null;
      return { score: 600 + d, detail: `שורה ${d} במכרה`, headline: "ירד לאן שאף אחד לא העז" };
    },
  },
  {
    id: "hf_banker", emoji: "🏦", title: "עמוד התווך", priority: 77,
    test: (f, all) => {
      const n = f.hfDeposits ?? 0;
      if (n < 3) return null;
      const best = Math.max(...all.map((x) => x.hfDeposits ?? 0));
      if (n < best) return null;
      return { score: 580 + n * 5, detail: `${n} הפקדות במעלית`, headline: "המכסה עברה בזכותו" };
    },
  },
  {
    id: "hf_hunter", emoji: "⚔️", title: "צייד המכרה", priority: 75,
    test: (f, all) => {
      const n = f.hfKills ?? 0;
      if (n < 5) return null;
      const best = Math.max(...all.map((x) => x.hfKills ?? 0));
      if (n < best) return null;
      return { score: 560 + n * 4, detail: `${n} מפלצות`, headline: "שמר על המנהרות נקיות" };
    },
  },
  {
    id: "hf_pick", emoji: "⛏️", title: "מלך המכוש", priority: 73,
    test: (f, all) => {
      const n = f.hfDigs ?? 0;
      if (n < 120) return null;
      const best = Math.max(...all.map((x) => x.hfDigs ?? 0));
      if (n < best) return null;
      return { score: 540 + Math.min(300, Math.round(n / 2)), detail: `${n} סלעים נשברו`, headline: "לא הניח את המכוש לרגע" };
    },
  },
  {
    id: "hf_cat", emoji: "😼", title: "תשע נשמות", priority: 58,
    test: (f, all) => {
      const n = f.hfDowns ?? 0;
      if (n < 2) return null;
      const worst = Math.max(...all.map((x) => x.hfDowns ?? 0));
      if (n < worst) return null;
      return { score: 300 + n * 10, detail: `נפל ${times(n)} — וקם`, headline: "המכרה ניסה. הוא חזר" };
    },
  },
  /* ---- התהום 🕳️ ---- */
  {
    id: "ab_pot", emoji: "🏆", title: "שודד הקרן", priority: 78,
    test: (f, all) => {
      const n = f.abPots ?? 0;
      if (n < 1) return null;
      const best = Math.max(...all.map((x) => x.abPots ?? 0));
      if (n < best) return null;
      return { score: 620 + n * 50, detail: n > 1 ? `לקח את הקרן ${times(n)}` : "נשאר אחרון ולקח את הקרן", headline: "כולם עצרו. הוא לא." };
    },
  },
  {
    id: "ab_deep", emoji: "🕳️", title: "הכי עמוק בתהום", priority: 76,
    test: (f, all) => {
      const k = f.abLedge ?? 0;
      if (k < 2) return null;
      const best = Math.max(...all.map((x) => x.abLedge ?? 0));
      if (k < best) return null;
      return { score: 590 + k * 10, detail: `הגיע למדף ${k + 1}`, headline: "ירד לאן שאף אחד לא העז" };
    },
  },
  {
    id: "ab_gambler", emoji: "🎰", title: "המהמר", priority: 74,
    test: (f, all) => {
      const n = f.abGoes ?? 0;
      if (n < 3) return null;
      const best = Math.max(...all.map((x) => x.abGoes ?? 0));
      if (n < best) return null;
      return { score: 570 + n * 5, detail: `המשיך ${times(n)}`, headline: "המדף היה שם. הוא לא עצר" };
    },
  },
  {
    id: "ab_hunter", emoji: "🪨", title: "הצייד מהמדף", priority: 72,
    test: (f, all) => {
      const n = f.abHunts ?? 0;
      if (n < 1) return null;
      const best = Math.max(...all.map((x) => x.abHunts ?? 0));
      if (n < best) return null;
      return { score: 550 + n * 20, detail: `הפיל ${n === 1 ? "חבר אחד" : `${n} חברים`} במלכודת`, headline: "עצר בזמן — וזרק סלעים" };
    },
  },
  {
    id: "ab_angel", emoji: "💎", title: "המלאך של התהום", priority: 70,
    test: (f, all) => {
      const n = f.abHelps ?? 0;
      if (n < 1) return null;
      const best = Math.max(...all.map((x) => x.abHelps ?? 0));
      if (n < best) return null;
      return { score: 530 + n * 15, detail: `${n === 1 ? "עזרה אחת" : `${n} עזרות`} שהשתלמו`, headline: "מלמעלה, שמר על החברים" };
    },
  },
  {
    id: "ab_banker", emoji: "🏦", title: "הידיים הבטוחות", priority: 62,
    test: (f, all) => {
      const b = f.abBest ?? 0;
      if (b < 50 || (f.abCaught ?? 0) > 0) return null;
      const best = Math.max(...all.map((x) => (x.abCaught ?? 0) > 0 ? 0 : (x.abBest ?? 0)));
      if (b < best) return null;
      return { score: 450 + Math.min(300, Math.round(b / 5)), detail: `בנקאות של ${b} בצניחה אחת, בלי להיתפס`, headline: "יצא תמיד ברווח" };
    },
  },
  {
    id: "ab_chicken", emoji: "🐔", title: "תפס מדף ראשון", priority: 60,
    test: (f, all) => {
      const n = f.abStops ?? 0;
      if (n < 2 || (f.abGoes ?? 0) > 0) return null;
      const best = Math.max(...all.map((x) => (x.abGoes ?? 0) > 0 ? 0 : (x.abStops ?? 0)));
      if (n < best) return null;
      return { score: 420 + n * 5, detail: `עצר במדף הראשון ${times(n)}`, headline: "לא סיכן גביש אחד" };
    },
  },
  {
    id: "ab_eaten", emoji: "💀", title: "התהום בלעה אותו", priority: 56,
    test: (f, all) => {
      const n = f.abCaught ?? 0;
      if (n < 2) return null;
      const worst = Math.max(...all.map((x) => x.abCaught ?? 0));
      if (n < worst) return null;
      return { score: 290 + n * 10, detail: `נתפס ${times(n)}`, headline: "הסלעים ידעו את שמו" };
    },
  },
  /* ---- המתחזה למתקדמים 🥸 ---- */
  {
    id: "uc_selfaware", emoji: "💡", title: "הבין לבד", priority: 93,
    test: (f) => {
      // הרגע הנדיר של המשחק: הבין שהוא המתחזה, הכריז, וניחש נכון את מילת הרוב.
      // אין כאן השוואה מול האחרים — מי שעשה את זה אפילו פעם אחת ראוי לתואר.
      // חייב עדיפות מעל "הבוגד" (92): מי שהבין לבד הוא בהכרח גם מתחזה,
      // ובלי זה "הבוגד" היה בולע את התואר הזה תמיד והוא לא היה נראה לעולם.
      const n = f.ucSelfFound ?? 0;
      if (n < 1) return null;
      return {
        score: 780 + n * 40,
        detail: n > 1 ? `${times(n)} תפס את עצמו` : "הכריז וניחש נכון",
        headline: "הבין שהוא המתחזה לפני שכולם הבינו",
      };
    },
  },
  {
    id: "uc_hunter", emoji: "🎯", title: "צייד המתחזים", priority: 75,
    test: (f, all) => {
      const n = f.ucCaught ?? 0;
      if (n < 2) return null;
      const best = Math.max(...all.map((x) => x.ucCaught ?? 0));
      if (n < best) return null;
      return { score: 520 + n * 15, detail: `הצביע נכון ${times(n)}`, headline: "האף שלו לא טועה" };
    },
  },
  {
    id: "uc_paranoid", emoji: "🫣", title: "חשד בעצמו", priority: 63,
    test: (f, all) => {
      const n = f.ucFooled ?? 0;
      if (n < 1) return null;
      const worst = Math.max(...all.map((x) => x.ucFooled ?? 0));
      if (n < worst) return null;
      return { score: 330 + n * 10, detail: n > 1 ? times(n) : "הכריז — ולא היה המתחזה", headline: "הסגיר את עצמו על לא עוול בכפו" };
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
