/**
 * "המתחזה למתקדמים" 🥸 — לוגיקת השרת.
 *
 * ההבדל היחיד מ"המתחזה", וכל המשחק תלוי בו: *גם המתחזה מקבל מילה*.
 * לכן אף אחד לא יודע מי הוא — כולל המתחזה עצמו. uc_role נראה זהה
 * לחלוטין אצל כולם, ואסור שישדר ולו ביט אחד שמסגיר (בלי isImpostor,
 * בלי אורך מילה חריג, בלי סדר שליחה שונה).
 *
 * סיבוב: קלף → סבב רמזים (תור מואר) → דיון → הצבעה סודית →
 * חשיפה מסונכרנת (cue) → ניחוש אחרון של מי שנתפס → ניקוד.
 *
 * "הכרזה עצמית" 🥸 — שכבה אופציונלית שהמארח מדליק בבחירת המשחק
 * (configOptions.declare; **כבויה כברירת מחדל**). כשהיא דלוקה נפתח בסבב
 * הרמזים ובדיון כפתור סודי: שחקן שמבין שהוא המתחזה מכריז ומנחש את מילת
 * הרוב. צדק → +5 והרגע של הערב; טעה (או שלא היה המתחזה מלכתחילה) → 0
 * לסיבוב. כשהיא כבויה הכפתור לא קיים אצל אף אחד, והשרת דוחה כל הכרזה.
 */
import type { GameCtx, GameInstance } from "../engine";
import type {
  UndercoverClientMsg, GameClientMsg, UcPhase, UcDeclare, UcScoreRow, PlayerFacts,
} from "../../../shared/protocol";
import { pickUndercoverPair } from "../decks";

interface UcConfig { level?: "normal" | "hard"; declare?: "on" | "off" }

const TURN_MS = 25_000;   // רשת ביטחון לתור — לא הקצב הרגיל (הקצב הוא "אמרתי ✓")
const TALK_MS = 90_000;   // דיון חופשי; המארח יכול לקצר
const VOTE_MS = 45_000;
const GUESS_MS = 15_000;  // מספיק להקליד מילה אחת, לא מספיק כדי שהחדר ישתעמם
const REVEAL_LEAD = 900;  // ה-cue של החשיפה — מספיק זמן שכל הטלפונים יתהפכו יחד
const SCORES_GAP = 4_200; // כמה החשיפה "נושמת" לפני לוח הניקוד

/* ---------- השוואת ניחוש סלחנית (עברית) ---------- */
function norm(s: string): string {
  return (s ?? "")
    .replace(/[֑-ׇ]/g, "")          // ניקוד וטעמים
    .replace(/["'`״׳.,!?()\-–—]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
/** "הים" = "ים", "פיצה " = "פיצה", ושגיאת הקלדה אחת במילה ארוכה — עדיין נכון */
export function sameWord(guess: string, target: string): boolean {
  const g = norm(guess), t = norm(target);
  if (!g || !t) return false;
  if (g === t) return true;
  const gs = g.replace(/ /g, ""), ts = t.replace(/ /g, "");
  if (gs === ts) return true;
  const strip = (x: string) => x.replace(/^[הוב]/, "");
  if (strip(gs) === strip(ts)) return true;
  return ts.length >= 5 && lev(gs, ts) <= 1;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createUndercover(ctx: GameCtx): GameInstance {
  const cfg = (ctx.config ?? {}) as UcConfig;
  const level: "normal" | "hard" = cfg.level === "hard" ? "hard" : "normal";
  const declareOn = cfg.declare === "on";   // כבוי כברירת מחדל — המארח מדליק

  let over = false;
  let round = 0;
  let phase: UcPhase = "deal";
  let token = 0;                       // עולה בכל מעבר שלב — טיימר ישן שמתעורר לא עושה כלום
  let handle: NodeJS.Timeout | undefined;
  let until = 0;

  let majorityWord = "";
  let impostorWord = "";
  let impostors = new Set<string>();
  const usedPairs = new Set<string>();
  let lastImpostors: string[] = [];

  let order: string[] = [];
  let turnIdx = 0;
  const ready = new Set<string>();
  const votes = new Map<string, string>();          // מצביע → יעד
  const declares = new Map<string, string>();       // מכריז → ניחוש
  let ejected: string | null = null;
  let tie = false;
  let guessPid: string | null = null;               // מי מנחש עכשיו
  let lastGuessOk = false;
  let lastGuessDone = false;

  const totals: Record<string, number> = {};

  const isHost = (pid: string) => ctx.players().find((p) => p.id === pid)?.isHost === true;
  const alive = () => ctx.participants().filter((p) => p.connected).map((p) => p.id);

  function clearT() { if (handle) { clearTimeout(handle); handle = undefined; } }
  function after(ms: number, fn: () => void) {
    clearT();
    const t = ++token;
    handle = ctx.timer(ms, () => { if (!over && t === token) fn(); });
  }

  function setPhase(p: UcPhase, ms?: number, extra?: { turn?: string; idx?: number; of?: number }) {
    phase = p;
    until = ms ? ctx.now() + ms : 0;
    ctx.broadcast({ a: "uc_phase", phase: p, until: until || undefined, ...extra });
  }

  /* ---------- חלוקה ---------- */
  function deal() {
    const players = alive();
    if (players.length < 3) return;
    round += 1;
    clearT();
    votes.clear(); declares.clear(); ready.clear();
    ejected = null; tie = false; guessPid = null; lastGuessDone = false; lastGuessOk = false;

    const { pair } = pickUndercoverPair(level, usedPairs);
    [majorityWord, impostorWord] = pair;

    // 7+ שחקנים = שני מתחזים (מתחזה בודד בקבוצה גדולה נתפס מהר מדי),
    // ותמיד מיעוט מובהק. השניים מקבלים את אותה מילה ולא יודעים זה על זה.
    const count = players.length >= 7 ? 2 : 1;
    // עדיף לא לחזור על מי שהיה מתחזה בסיבוב הקודם
    const fresh = players.filter((p) => !lastImpostors.includes(p));
    const bag = shuffle(fresh.length >= count ? fresh : players);
    impostors = new Set(bag.slice(0, count));
    lastImpostors = [...impostors];

    order = shuffle(players);            // מגרילים מחדש כל סיבוב — הראשון תמיד בעמדת נחיתות
    turnIdx = 0;

    // אותה הודעה, אותה צורה, אצל כולם
    for (const pid of players) sendRole(pid);
    setPhase("deal");
    ctx.broadcast({ a: "uc_ready", n: 0, of: players.length });

    ctx.reportFacts(Object.fromEntries([...impostors].map((p) => [p, { impostorRounds: 1 } as PlayerFacts])));
  }

  function sendRole(pid: string) {
    ctx.sendTo(pid, {
      a: "uc_role",
      word: impostors.has(pid) ? impostorWord : majorityWord,
      round, order: [...order], impostors: impostors.size, declareOn,
    });
  }

  /* ---------- סבב רמזים ---------- */
  function startClues() {
    if (phase !== "deal") return;
    turnIdx = 0;
    nextTurn(true);
  }

  function nextTurn(first = false) {
    const live = new Set(alive());
    if (!first) turnIdx += 1;
    while (turnIdx < order.length && !live.has(order[turnIdx])) turnIdx += 1;
    if (turnIdx >= order.length) return startTalk();
    setPhase("clues", TURN_MS, { turn: order[turnIdx], idx: turnIdx + 1, of: order.length });
    after(TURN_MS, () => nextTurn());
  }

  function startTalk() {
    setPhase("talk", TALK_MS);
    after(TALK_MS, startVote);
  }

  /* ---------- הצבעה ---------- */
  function startVote() {
    votes.clear();
    setPhase("vote", VOTE_MS);
    ctx.broadcast({ a: "uc_voted", n: 0, of: alive().length });
    after(VOTE_MS, doReveal);
  }

  function tallyVotes() {
    const tally: Record<string, number> = {};
    for (const target of votes.values()) tally[target] = (tally[target] ?? 0) + 1;
    let max = 0;
    for (const n of Object.values(tally)) if (n > max) max = n;
    const top = Object.keys(tally).filter((p) => tally[p] === max);
    return { tally, ejected: max > 0 && top.length === 1 ? top[0] : null, tie: top.length > 1 };
  }

  /* ---------- החשיפה — הרגע ---------- */
  function doReveal() {
    if (phase === "reveal" || phase === "guess" || phase === "scores") return;
    clearT();
    const t = tallyVotes();
    ejected = t.ejected; tie = t.tie;

    const declareRows: UcDeclare[] = [...declares.entries()].map(([pid, guess]) => ({
      pid, guess,
      wasImpostor: impostors.has(pid),
      ok: impostors.has(pid) && sameWord(guess, majorityWord),
    }));

    phase = "reveal";
    ctx.cue(REVEAL_LEAD, {
      a: "uc_reveal", round, majorityWord, impostorWord,
      impostors: [...impostors], votes: Object.fromEntries(votes), tally: t.tally,
      ejected, tie, declares: declareRows,
    });

    // מי שנתפס ולא הכריז קודם מקבל ניחוש אחרון — הרגע שמציל אותו
    const caught = ejected && impostors.has(ejected) ? ejected : null;
    if (caught && !declares.has(caught) && alive().includes(caught)) {
      guessPid = caught;
      after(REVEAL_LEAD + 2600, () => {
        if (!guessPid) return;
        phase = "guess";
        const u = ctx.now() + GUESS_MS;
        ctx.broadcast({ a: "uc_guess", pid: guessPid, until: u });
        after(GUESS_MS, () => resolveGuess(""));
      });
    } else {
      after(REVEAL_LEAD + SCORES_GAP, showScores);
    }
  }

  function resolveGuess(guess: string) {
    if (!guessPid || lastGuessDone) return;
    lastGuessDone = true;
    lastGuessOk = sameWord(guess, majorityWord);
    ctx.broadcast({ a: "uc_guessed", pid: guessPid, guess: guess.trim().slice(0, 40), ok: lastGuessOk });
    after(2600, showScores);
  }

  /* ---------- ניקוד ---------- */
  function showScores() {
    if (phase === "scores") return;
    const rows: UcScoreRow[] = [];
    const facts: Record<string, PlayerFacts> = {};
    const bump = (pid: string, f: PlayerFacts) => { facts[pid] = { ...(facts[pid] ?? {}), ...f }; };

    for (const pid of alive()) {
      const isImp = impostors.has(pid);
      const declaredGuess = declares.get(pid);
      let delta = 0;
      let why: UcScoreRow["why"];

      if (declaredGuess !== undefined) {
        // הימור: הכרזה עצמית
        if (isImp && sameWord(declaredGuess, majorityWord)) {
          delta = 5; why = "declared"; bump(pid, { ucSelfFound: 1 });
        } else if (isImp) {
          delta = 0; why = "bluff";
        } else {
          delta = 0; why = "fooled"; bump(pid, { ucFooled: 1 });
        }
      } else if (isImp) {
        if (ejected !== pid) { delta = 3; why = "safe"; bump(pid, { impostorSafe: 1 }); }
        else if (lastGuessOk) { delta = 3; why = "saved"; }
        else { delta = 0; why = "caught"; }
      } else {
        const target = votes.get(pid);
        if (target && impostors.has(target)) { delta = 2; why = "hit"; bump(pid, { ucCaught: 1 }); }
        else { delta = 0; why = "miss"; }
      }

      totals[pid] = (totals[pid] ?? 0) + delta;
      rows.push({ pid, delta, why });
    }

    if (Object.keys(facts).length) ctx.reportFacts(facts);
    phase = "scores";
    ctx.broadcast({ a: "uc_scores", round, rows, totals: { ...totals } });
    ctx.broadcast({ a: "uc_phase", phase: "scores" });
  }

  function finish() {
    if (over) return;
    over = true;
    clearT();
    const ranked = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
    const top = ranked.length ? totals[ranked[0]] : 0;
    const winnerIds = top > 0 ? ranked.filter((p) => totals[p] === top) : [];
    const loser = ranked.length > 1 ? ranked[ranked.length - 1] : undefined;
    ctx.end({
      title: `המתחזה למתקדמים 🥸 · ${round} סיבובים`,
      winnerId: winnerIds[0], winnerIds,
      loserId: winnerIds.includes(loser ?? "") ? undefined : loser,
      scores: { ...totals },
    });
  }

  /* ---------- מצב מלא לחוזר מניתוק ---------- */
  function sendState(pid: string) {
    if (!round) return;
    sendRole(pid);
    ctx.sendTo(pid, { a: "uc_phase", phase, until: until || undefined,
      turn: phase === "clues" ? order[turnIdx] : undefined,
      idx: phase === "clues" ? turnIdx + 1 : undefined, of: phase === "clues" ? order.length : undefined });
    if (phase === "deal") ctx.sendTo(pid, { a: "uc_ready", n: ready.size, of: alive().length });
    if (phase === "vote") ctx.sendTo(pid, { a: "uc_voted", n: votes.size, of: alive().length });
    if (declares.has(pid)) ctx.sendTo(pid, { a: "uc_declared" });
    if (phase === "reveal" || phase === "guess" || phase === "scores") {
      const t = tallyVotes();
      ctx.sendTo(pid, {
        a: "uc_reveal", round, majorityWord, impostorWord, impostors: [...impostors],
        votes: Object.fromEntries(votes), tally: t.tally, ejected, tie,
        declares: [...declares.entries()].map(([p, guess]) => ({
          pid: p, guess, wasImpostor: impostors.has(p), ok: impostors.has(p) && sameWord(guess, majorityWord),
        })),
      });
      if (phase === "guess" && guessPid) ctx.sendTo(pid, { a: "uc_guess", pid: guessPid, until });
      if (phase === "scores") ctx.sendTo(pid, { a: "uc_scores", round, rows: [], totals: { ...totals } });
    }
  }

  return {
    onStart() { deal(); },

    onMessage(pid: string, d: GameClientMsg) {
      if (over) return;
      const m = d as UndercoverClientMsg;
      switch (m.a) {
        case "uc_ready": {
          if (phase !== "deal") return;
          ready.add(pid);
          const of = alive().length;
          ctx.broadcast({ a: "uc_ready", n: ready.size, of });
          if (ready.size >= of) startClues();
          return;
        }
        case "uc_said":
          if (phase !== "clues") return;
          if (pid !== order[turnIdx] && !isHost(pid)) return;
          nextTurn();
          return;
        case "uc_skip":
          if (!isHost(pid)) return;
          if (phase === "deal") return startClues();
          if (phase === "clues") return startTalk();
          if (phase === "talk") return startVote();
          if (phase === "vote") return doReveal();
          return;
        case "uc_declare": {
          // סודי לגמרי עד החשיפה — אחרת זה מדליף לחדר מי חושד בעצמו
          if (!declareOn) return;
          if (phase !== "clues" && phase !== "talk") return;
          if (declares.has(pid)) return;
          declares.set(pid, (m.guess ?? "").trim().slice(0, 40));
          ctx.sendTo(pid, { a: "uc_declared" });
          return;
        }
        case "uc_vote": {
          if (phase !== "vote") return;
          if (m.target === pid) return;                       // אין הצבעה עצמית
          if (!alive().includes(m.target)) return;
          votes.set(pid, m.target);
          const of = alive().length;
          ctx.broadcast({ a: "uc_voted", n: votes.size, of });
          if (votes.size >= of) doReveal();
          return;
        }
        case "uc_guess":
          if (phase !== "guess" || pid !== guessPid) return;
          resolveGuess(m.guess ?? "");
          return;
        case "uc_next":
          if (!isHost(pid) || phase !== "scores") return;
          deal();
          return;
        case "uc_end":
          if (!isHost(pid)) return;
          finish();
          return;
      }
    },

    onRejoin(pid: string) { sendState(pid); },

    onLeave(pid: string) {
      if (over || !round) return;
      // התור של מי שנעלם — ממשיכים הלאה, שהמשחק לא ייתקע עליו
      if (phase === "clues" && order[turnIdx] === pid) return nextTurn();
      if (phase === "vote" && votes.size >= alive().length && alive().length > 0) return doReveal();
      if (phase === "deal" && ready.size >= alive().length && alive().length > 0) return startClues();
      if (phase === "guess" && guessPid === pid) return resolveGuess("");
    },

    dispose() { over = true; clearT(); },
  };
}
