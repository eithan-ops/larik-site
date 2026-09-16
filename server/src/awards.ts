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
  /** מפתח יחסי לתואר: D("detail", {n}) → awards.<id>.detail */
  detail?: { k: string; p?: Record<string, string | number> };
}

interface AwardDef {
  id: string;
  emoji: string;
  /** סדר ההקצאה: תארים חזקים נתפסים ראשונים */
  priority: number;
  test(f: PlayerFacts, all: PlayerFacts[]): Candidate | null;
}

const sec = (ms: number) => (ms / 1000).toFixed(2);
/**
 * הטקסטים עצמם חיים ב-client/src/locales/<lang>/common.json תחת awards.<id>.{title,headline,detail…}
 * השרת שולח רק מפתחות ומספרים — כל טלפון בחדר מרנדר בשפה שלו. "פעם אחת/פעמיים/N פעמים"
 * = {n, plural, …} בתוך התרגום. D("x", {n}) = מפתח awards.<id>.x של התואר הנוכחי (מושלם ב-computeAwards).
 */
const D = (k: string, p?: Record<string, string | number>): Candidate["detail"] => ({ k, p });

/**
 * סדר החשיבות: קודם התארים שמספרים סיפור מדיד ("0.41 שניות"),
 * ואז אלה שמספרים סיפור חברתי, ובסוף תארי הנחמה.
 * תואר בלי כיסוי בעובדות פשוט לא נבחר — עדיף פחות תארים מתואר משקר.
 */
const CATALOG: AwardDef[] = [
  {
    id: "king", emoji: "👑", priority: 100, // מלך הערב
    test: (f, all) => {
      const pts = f.points ?? 0;
      if (pts <= 0) return null;
      const best = Math.max(...all.map((x) => x.points ?? 0));
      if (pts < best) return null;
      return { score: 1000 + pts, detail: D("detail", { n: pts }) };
    },
  },
  {
    id: "fastest", emoji: "⚡", priority: 95, // האצבע הכי מהירה
    test: (f, all) => {
      const ms = f.bestReactionMs;
      if (ms === undefined) return null;
      const best = Math.min(...all.map((x) => x.bestReactionMs ?? Infinity));
      if (ms > best) return null;
      return { score: 900 + (2000 - Math.min(ms, 2000)), detail: D("detail", { sec: sec(ms) }) };
    },
  },
  {
    id: "traitor", emoji: "🕵️", priority: 92, // הבוגד של הערב
    test: (f, all) => {
      const rounds = f.impostorRounds ?? 0;
      if (rounds < 1) return null;
      const most = Math.max(...all.map((x) => x.impostorRounds ?? 0));
      if (rounds < most) return null;
      // "לא נתפס" נמדד מאז שהמתחזה למתקדמים הביא הצבעה אמיתית — והוא משדרג את הכותרת
      const safe = f.impostorSafe ?? 0;
      return {
        score: 800 + rounds * 10 + safe * 20,
        detail: safe > 0 ? D("detail_safe", { n: rounds, safe }) : D("detail", { n: rounds }),
      };
    },
  },
  {
    id: "clown", emoji: "🤡", priority: 90, // ליצן הערב
    test: (f, all) => {
      const n = f.clown ?? 0;
      if (n < 1) return null;
      const worst = Math.max(...all.map((x) => x.clown ?? 0));
      if (n < worst) return null;
      return { score: 700 + n * 10, detail: n > 1 ? D("times", { n }) : undefined };
    },
  },
  {
    id: "brain", emoji: "🧠", priority: 85, // המוח של הערב
    test: (f, all) => {
      const n = f.correct ?? 0;
      if (n < 3) return null;
      const best = Math.max(...all.map((x) => x.correct ?? 0));
      if (n < best) return null;
      return { score: 600 + n, detail: D("detail", { n }) };
    },
  },
  {
    id: "streak", emoji: "🔥", priority: 84, // על גל חם
    test: (f) => {
      const s = f.bestStreak ?? 0;
      if (s < 2) return null;
      return { score: 580 + s * 20, detail: D("detail", { n: s }) };
    },
  },
  {
    id: "versatile", emoji: "🎖️", priority: 82, // טוב בכל דבר
    test: (f, all) => {
      const n = f.wonGames ?? 0;
      if (n < 2) return null;
      const best = Math.max(...all.map((x) => x.wonGames ?? 0));
      if (n < best) return null;
      return { score: 560 + n * 10, detail: D("detail", { n }) };
    },
  },
  {
    id: "machine", emoji: "🎰", priority: 78, // מכונת נגיעות
    test: (f, all) => {
      const n = f.taps ?? 0;
      if (n < 5) return null;
      const best = Math.max(...all.map((x) => x.taps ?? 0));
      if (n < best) return null;
      return { score: 500 + n, detail: D("detail", { n }) };
    },
  },
  {
    id: "survivor", emoji: "🛡️", priority: 76, // האחרון ששרד
    test: (f, all) => {
      const n = f.survivedLast ?? 0;
      if (n < 1) return null;
      const best = Math.max(...all.map((x) => x.survivedLast ?? 0));
      if (n < best) return null;
      return { score: 480 + n * 10, detail: n > 1 ? D("times", { n }) : undefined };
    },
  },
  {
    id: "detective", emoji: "🔍", priority: 74, // הבלש
    test: (f, all) => {
      const n = f.guessed ?? 0;
      if (n < 2) return null;
      const best = Math.max(...all.map((x) => x.guessed ?? 0));
      if (n < best) return null;
      return { score: 460 + n * 10, detail: D("detail", { n }) };
    },
  },
  {
    id: "peeker", emoji: "🐀", priority: 70, // נתפס מציץ
    test: (f) => {
      const n = f.peeks ?? 0;
      if (n < 1) return null;
      return { score: 420 + n * 10, detail: D("times", { n }) };
    },
  },
  {
    id: "confident", emoji: "🤷", priority: 66, // ביטחון עצמי מופרז
    test: (f, all) => {
      const n = f.wrong ?? 0;
      if (n < 3) return null;
      const worst = Math.max(...all.map((x) => x.wrong ?? 0));
      if (n < worst) return null;
      return { score: 380 + n, detail: D("detail", { n }) };
    },
  },
  {
    id: "firstout", emoji: "💣", priority: 64, // הראשון שנופל
    test: (f, all) => {
      const n = f.outFirst ?? 0;
      if (n < 1) return null;
      const worst = Math.max(...all.map((x) => x.outFirst ?? 0));
      if (n < worst) return null;
      return { score: 350 + n * 10, detail: n > 1 ? D("times", { n }) : undefined };
    },
  },
  {
    id: "suspect", emoji: "😇", priority: 62, // החשוד שלא עשה כלום
    test: (f) => {
      // שיחק הרבה, אף פעם לא היה המתחזה, ובכל זאת לא ניצח — הקורבן המושלם
      const g = f.games ?? 0;
      if (g < 2 || (f.impostorRounds ?? 0) > 0 || (f.wins ?? 0) > 0) return null;
      return { score: 320, detail: D("detail") };
    },
  },
  {
    id: "hf_deep", emoji: "🕳️", priority: 79, // שיאן העומק
    test: (f, all) => {
      const d = f.hfDeepest ?? 0;
      if (d < 30) return null;
      const best = Math.max(...all.map((x) => x.hfDeepest ?? 0));
      if (d < best) return null;
      return { score: 600 + d, detail: D("detail", { n: d }) };
    },
  },
  {
    id: "hf_banker", emoji: "🏦", priority: 77, // עמוד התווך
    test: (f, all) => {
      const n = f.hfDeposits ?? 0;
      if (n < 3) return null;
      const best = Math.max(...all.map((x) => x.hfDeposits ?? 0));
      if (n < best) return null;
      return { score: 580 + n * 5, detail: D("detail", { n }) };
    },
  },
  {
    id: "hf_hunter", emoji: "⚔️", priority: 75, // צייד המכרה
    test: (f, all) => {
      const n = f.hfKills ?? 0;
      if (n < 5) return null;
      const best = Math.max(...all.map((x) => x.hfKills ?? 0));
      if (n < best) return null;
      return { score: 560 + n * 4, detail: D("detail", { n }) };
    },
  },
  {
    id: "hf_pick", emoji: "⛏️", priority: 73, // מלך המכוש
    test: (f, all) => {
      const n = f.hfDigs ?? 0;
      if (n < 120) return null;
      const best = Math.max(...all.map((x) => x.hfDigs ?? 0));
      if (n < best) return null;
      return { score: 540 + Math.min(300, Math.round(n / 2)), detail: D("detail", { n }) };
    },
  },
  {
    id: "hf_cat", emoji: "😼", priority: 58, // תשע נשמות
    test: (f, all) => {
      const n = f.hfDowns ?? 0;
      if (n < 2) return null;
      const worst = Math.max(...all.map((x) => x.hfDowns ?? 0));
      if (n < worst) return null;
      return { score: 300 + n * 10, detail: D("detail", { n }) };
    },
  },
  /* ---- התהום 🕳️ ---- */
  {
    id: "ab_pot", emoji: "🏆", priority: 78, // שודד הקרן
    test: (f, all) => {
      const n = f.abPots ?? 0;
      if (n < 1) return null;
      const best = Math.max(...all.map((x) => x.abPots ?? 0));
      if (n < best) return null;
      return { score: 620 + n * 50, detail: n > 1 ? D("detail_n", { n }) : D("detail") };
    },
  },
  {
    id: "ab_deep", emoji: "🕳️", priority: 76, // הכי עמוק בתהום
    test: (f, all) => {
      const k = f.abLedge ?? 0;
      if (k < 2) return null;
      const best = Math.max(...all.map((x) => x.abLedge ?? 0));
      if (k < best) return null;
      return { score: 590 + k * 10, detail: D("detail", { n: k + 1 }) };
    },
  },
  {
    id: "ab_gambler", emoji: "🎰", priority: 74, // המהמר
    test: (f, all) => {
      const n = f.abGoes ?? 0;
      if (n < 3) return null;
      const best = Math.max(...all.map((x) => x.abGoes ?? 0));
      if (n < best) return null;
      return { score: 570 + n * 5, detail: D("detail", { n }) };
    },
  },
  {
    id: "ab_hunter", emoji: "🪨", priority: 72, // הצייד מהמדף
    test: (f, all) => {
      const n = f.abHunts ?? 0;
      if (n < 1) return null;
      const best = Math.max(...all.map((x) => x.abHunts ?? 0));
      if (n < best) return null;
      return { score: 550 + n * 20, detail: D("detail", { n }) };
    },
  },
  {
    id: "ab_angel", emoji: "💎", priority: 70, // המלאך של התהום
    test: (f, all) => {
      const n = f.abHelps ?? 0;
      if (n < 1) return null;
      const best = Math.max(...all.map((x) => x.abHelps ?? 0));
      if (n < best) return null;
      return { score: 530 + n * 15, detail: D("detail", { n }) };
    },
  },
  {
    id: "ab_banker", emoji: "🏦", priority: 62, // הידיים הבטוחות
    test: (f, all) => {
      const b = f.abBest ?? 0;
      if (b < 50 || (f.abCaught ?? 0) > 0) return null;
      const best = Math.max(...all.map((x) => (x.abCaught ?? 0) > 0 ? 0 : (x.abBest ?? 0)));
      if (b < best) return null;
      return { score: 450 + Math.min(300, Math.round(b / 5)), detail: D("detail", { n: b }) };
    },
  },
  {
    id: "ab_chicken", emoji: "🐔", priority: 60, // תפס מדף ראשון
    test: (f, all) => {
      const n = f.abStops ?? 0;
      if (n < 2 || (f.abGoes ?? 0) > 0) return null;
      const best = Math.max(...all.map((x) => (x.abGoes ?? 0) > 0 ? 0 : (x.abStops ?? 0)));
      if (n < best) return null;
      return { score: 420 + n * 5, detail: D("detail", { n }) };
    },
  },
  {
    id: "ab_eaten", emoji: "💀", priority: 56, // התהום בלעה אותו
    test: (f, all) => {
      const n = f.abCaught ?? 0;
      if (n < 2) return null;
      const worst = Math.max(...all.map((x) => x.abCaught ?? 0));
      if (n < worst) return null;
      return { score: 290 + n * 10, detail: D("detail", { n }) };
    },
  },
  /* ---- המתחזה למתקדמים 🥸 ---- */
  {
    id: "uc_selfaware", emoji: "💡", priority: 93, // הבין לבד
    test: (f) => {
      // הרגע הנדיר של המשחק: הבין שהוא המתחזה, הכריז, וניחש נכון את מילת הרוב.
      // אין כאן השוואה מול האחרים — מי שעשה את זה אפילו פעם אחת ראוי לתואר.
      // חייב עדיפות מעל "הבוגד" (92): מי שהבין לבד הוא בהכרח גם מתחזה,
      // ובלי זה "הבוגד" היה בולע את התואר הזה תמיד והוא לא היה נראה לעולם.
      const n = f.ucSelfFound ?? 0;
      if (n < 1) return null;
      return {
        score: 780 + n * 40,
        detail: n > 1 ? D("detail_n", { n }) : D("detail"),
      };
    },
  },
  {
    id: "uc_hunter", emoji: "🎯", priority: 75, // צייד המתחזים
    test: (f, all) => {
      const n = f.ucCaught ?? 0;
      if (n < 2) return null;
      const best = Math.max(...all.map((x) => x.ucCaught ?? 0));
      if (n < best) return null;
      return { score: 520 + n * 15, detail: D("detail", { n }) };
    },
  },
  {
    id: "uc_paranoid", emoji: "🫣", priority: 63, // חשד בעצמו
    test: (f, all) => {
      const n = f.ucFooled ?? 0;
      if (n < 1) return null;
      const worst = Math.max(...all.map((x) => x.ucFooled ?? 0));
      if (n < worst) return null;
      return { score: 330 + n * 10, detail: n > 1 ? D("times", { n }) : D("detail") };
    },
  },
  {
    id: "solid", emoji: "📈", priority: 40, // העקבי של החבורה
    test: (f) => {
      const g = f.games ?? 0;
      if (g < 2 || (f.clown ?? 0) > 0) return null;
      return { score: 200 + (f.points ?? 0), detail: D("detail", { n: g }) };
    },
  },
  /* ---- תארי נחמה: תמיד עוברים, כדי שאף טלפון לא יישאר בלי כרטיס ---- */
  {
    id: "spirit", emoji: "🎉", priority: 20, // הרוח החיה
    test: () => ({ score: 100 }),
  },
  {
    id: "darkhorse", emoji: "🐎", priority: 18, // הסוס השחור
    test: () => ({ score: 90 }),
  },
  {
    id: "quiet", emoji: "🤫", priority: 16, // השקט שמסוכן
    test: () => ({ score: 80 }),
  },
  {
    id: "loyal", emoji: "🫡", priority: 14, // תמיד מגיע
    test: () => ({ score: 70 }),
  },
  {
    id: "chaos", emoji: "🌪️", priority: 12, // סוכן הכאוס
    test: () => ({ score: 60 }),
  },
  {
    id: "legend", emoji: "🃏", priority: 10, // מקרה מיוחד
    test: () => ({ score: 50 }),
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
      id: def.id, emoji: def.emoji, title: { k: `awards.${def.id}.title` },
      // "times" = "פעם אחת / פעמיים / N פעמים" — מפתח משותף לכל התארים
      detail: bestCand.detail ? { k: bestCand.detail.k === "times" ? "awards.times" : `awards.${def.id}.${bestCand.detail.k}`, p: bestCand.detail.p } : undefined,
      headline: { k: `awards.${def.id}.headline` },
    };
  }

  // רשת ביטחון: אם נגמרו התארים (יותר שחקנים מתארים) — אף אחד לא נשאר ריק
  for (const pid of pids) {
    if (out[pid]) continue;
    out[pid] = { id: "player", emoji: "🎮", title: { k: "awards.player.title" }, headline: { k: "awards.player.headline" } };
  }
  return out;
}
