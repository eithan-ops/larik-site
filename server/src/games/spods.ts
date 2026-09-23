/**
 * ספורט פודים 🏃 — שרת. מנוע אחד, עשר תוכניות.
 *
 * המארח = השלט (מאמן), לא פוד ולא ספורטאי. כל שאר הטלפונים = פודים; מי שבתפקיד "ath" הוא גם ספורטאי
 * (הטלפון שלו מונח כפוד, הוא רץ עם הצבע שלו). הדלקה = cue; נגיעה מגיעה בזמן-שרת; החלון נמדד מול ה-cue.
 * המשחק לא נגמר לבד אלא אם התוכנית סיימה — המאמן יכול להשהות/לעצור/לדלג בכל רגע.
 *
 * SP_FAST=1 מקצר זמנים לבדיקות (לא משפיע על פרודקשן).
 */
import type { GameCtx, GameInstance } from "../engine";
import type { GameClientMsg, GameServerMsg, LText } from "../../../shared/protocol";
import {
  SP_DEFS, SP_COLORS, SP_KITS, SP_KIT_IDS, SP_KIT_CUSTOM, SP_POSES, SP_HAND_STEPS, SP_TOURN_PTS, SP_BALL_WINDOW, spConfig, spMedian, spRoundRobin, spTournPoints, spTournTable, spBalanceTeams, spCleanKit,
} from "../../../shared/spods";
import type { SpGame, SpCfg, SpPhase, SpAth, SpState, SpLight, SpodsClientMsg, SpodsServerMsg, SpMove, SpSayKind, SpCtlOp, SpTourn, SpTournGame, SpCustomMove } from "../../../shared/spods";

/** מה שחי בחדר בין משחקי ספורט-פודים (GameCtx.memo): הטורניר, צבע/הנדיקפ/קבוצה של כל ספורטאי, והאימון שה-AI בנה */
interface SpMemo { spTourn?: SpTournGame[]; spRoster?: Record<string, { c: number; hand: number; team: number }>; spKit?: SpCustomMove[] }

const FAST = !!process.env.SP_FAST;
const T = {
  count: FAST ? 1200 : 3000,      // ספירה לאחור
  between: FAST ? 800 : 4000,     // "חזרו לקו"
  end: FAST ? 600 : 3000,
  lead: 400,                      // מרווח cue מינימלי
};
const WF = FAST ? 0.3 : 1;          // בדיקות: חלונות קצרים
const MIN_RT = 150;               // מתחת לזה = מישהו עמד על הפוד, לא רפלקס

interface Ath extends SpAth { rts: number[]; wins: number; tourn: number; legs: number[]; nextAt: number; stationIdx: number; lastPod: string; lightsDone: number; err: number }
interface LightRec { l: SpLight; onHit: (a: Ath, rt: number, l: SpLight) => void; onMiss: (a: Ath | undefined, l: SpLight) => void; timer?: NodeJS.Timeout }

export function createSpods(ctx: GameCtx, game: SpGame): GameInstance {
  const def = SP_DEFS[game];
  const cfg: SpCfg = spConfig(game, ctx.config);
  const now = () => ctx.now();
  const bc = (d: SpodsServerMsg) => ctx.broadcast(d as unknown as GameServerMsg);
  const to = (pid: string, d: SpodsServerMsg) => ctx.sendTo(pid, d as unknown as GameServerMsg);
  const nameOf = (pid: string) => ctx.players().find((p) => p.id === pid)?.name ?? "?";

  const memo = ctx.memo as SpMemo;
  const roster = (memo.spRoster ??= {});
  const tournGames = (memo.spTourn ??= []);
  let champion: string[] | undefined;
  const tourn = (): SpTourn => ({ games: tournGames, rows: spTournTable(tournGames), champion });
  let customKit: SpCustomMove[] | undefined = memo.spKit?.length ? memo.spKit : undefined;
  if (cfg.kit === SP_KIT_CUSTOM && !customKit) cfg.kit = 0;
  // מודיפיירים: ⚽ כדור = חלון ארוך יותר · ↔️ יד אקראית · 🔢 מספר לצעוק
  const ballOn = () => cfg.ball === 1;
  const lr = (): "L" | "R" | undefined => (cfg.hand === 1 ? (Math.random() < 0.5 ? "L" : "R") : undefined);
  const shout = (): number | undefined => (cfg.shout === 1 ? 1 + Math.floor(Math.random() * 9) : undefined);

  const parts = ctx.participants();
  const host = parts.find((p) => p.isHost)?.id ?? parts[0]?.id ?? "";
  const roles: Record<string, "ath" | "pod"> = {};
  let podOrder: string[] = [];
  for (const p of parts) if (p.id !== host) { roles[p.id] = "ath"; podOrder.push(p.id); }
  const aths = new Map<string, Ath>();
  let phase: SpPhase = "setup";
  let round = 0, of = 0, until = 0, level = 0;
  let banner: LText = "", sub: LText = "";
  let focus: string[] | undefined;
  let lightSeq = 0;
  const lights = new Map<number, LightRec>();
  let token = 0;
  const pend = new Set<NodeJS.Timeout>();
  let resumeFn: (() => void) | null = null;
  let disposed = false;
  let ended = false;
  let runStart = 0;

  const newAth = (pid: string, c: number): Ath => ({
    pid, c, hand: 0, score: 0, hits: 0, miss: 0, med: 0, out: false, team: 0, strikes: 0,
    rts: [], wins: 0, tourn: 0, legs: [], nextAt: 0, stationIdx: 0, lastPod: "", lightsDone: 0, err: 0,
  });
  function syncAths() {
    // ספורטאים = מי שבתפקיד ath; צבע לפי סדר הכניסה; צבעים לא משתנים למי שכבר קיבל —
    // וגם לא בין משחקים באותו ערב (הרוסטר בזיכרון החדר): הצבע של דני נשאר הצבע של דני
    const used = new Set([...aths.values()].map((a) => a.c));
    for (const pid of podOrder) {
      if (roles[pid] !== "ath") { aths.delete(pid); continue; }
      if (aths.has(pid)) continue;
      const r = roster[pid];
      let c = r && !used.has(r.c) ? r.c : 0;
      while (used.has(c) && c < SP_COLORS.length - 1) c++;
      used.add(c);
      const a = newAth(pid, c);
      if (r) { a.hand = r.hand; a.team = r.team; }
      aths.set(pid, a);
    }
    for (const pid of [...aths.keys()]) if (roles[pid] !== "ath") aths.delete(pid);
    // קבוצות (מרוץ שליחים): לסירוגין, אלא אם המאמן (או הרוסטר) כבר קבע
    let i = 0; for (const a of aths.values()) { if (a.team !== 0 && a.team !== 1) a.team = 0; if (!teamsTouched && !roster[a.pid]) a.team = i++ % 2; }
    saveRoster();
  }
  let teamsTouched = false;
  function saveRoster() { for (const a of aths.values()) roster[a.pid] = { c: a.c, hand: a.hand, team: a.team }; }

  /* ---------- כלים ---------- */
  const connected = (pid: string) => ctx.players().find((p) => p.id === pid)?.connected ?? false;
  const pods = () => podOrder.filter((pid) => connected(pid));
  const athList = () => [...aths.values()];
  const alive = () => athList().filter((a) => !a.out);
  const podsFree = () => pods().filter((pid) => ![...lights.values()].some((r) => r.l.pod === pid));
  const rnd = <X,>(arr: X[]): X => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = <X,>(arr: X[]): X[] => { const s = [...arr]; for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } return s; };
  const win = (a?: Ath) => Math.round(((cfg.window ?? 6000) + (a?.hand ?? 0)) * (ballOn() ? SP_BALL_WINDOW : 1));

  function later(ms: number, fn: () => void) {
    const tk = token;
    const t = ctx.timer(Math.max(0, ms), () => { pend.delete(t); if (token === tk && !disposed) fn(); });
    pend.add(t);
    return t;
  }
  function clearTimers() { token++; for (const t of pend) clearTimeout(t); pend.clear(); }

  const pub = (a: Ath): SpAth => ({ pid: a.pid, c: a.c, hand: a.hand, score: a.score, hits: a.hits, miss: a.miss, med: a.med, out: a.out, team: a.team, strikes: a.strikes, hold: a.hold, extra: a.extra });
  function state(): SpState {
    return {
      game, phase, cfg, aths: athList().map(pub),
      pods: pods(), roles, round, of, until, banner, sub, focus, level: level || undefined,
      tourn: tourn(), customKit,
    };
  }
  const push = () => bc({ a: "sp_state", s: state() });
  function setBanner(b: LText, s: LText = "") { banner = b; sub = s; }
  const say = (t: LText, k?: SpSayKind) => bc({ a: "sp_say", t, k });
  /** מפתח מ-locales/<lang>/spods.json — הלקוח מתרגם */
  const S = (k: string, p?: Record<string, string | number | { k: string }>): LText => ({ k: `spods.s.${k}`, p });

  /** הדלקת פוד — cue מתוזמן; החלון נמדד מזמן ה-cue */
  function light(o: Omit<SpLight, "id" | "at" | "until"> & { window?: number; delay?: number }, onHit: LightRec["onHit"], onMiss: LightRec["onMiss"]): SpLight {
    const id = ++lightSeq;
    const delay = Math.max(T.lead, o.delay ?? T.lead);
    const at = now() + delay;
    const w = Math.round((o.window ?? 0) * WF);
    const l: SpLight = { id, pod: o.pod, c: o.c, pid: o.pid, txt: o.txt, ic: o.ic, sub: o.sub, at, until: w ? at + w : 0, fade: o.fade, fakeAt: o.fakeAt, zones: o.zones, home: o.home, lr: o.lr, ball: o.ball, shout: o.shout, dir: o.dir };
    const rec: LightRec = { l, onHit, onMiss };
    lights.set(id, rec);
    const realAt = ctx.cue(delay, { a: "sp_light", l } as unknown as GameServerMsg);
    l.at = realAt; l.until = w ? realAt + w : 0;
    const dead = w ? delay + w + 120 : o.fade ? delay + o.fade + 2500 : 0;
    if (dead) rec.timer = later(dead, () => {
      if (!lights.has(id)) return;
      lights.delete(id);
      const a = l.pid ? aths.get(l.pid) : undefined;
      bc({ a: "sp_off", id, why: "miss" });
      if (a) { a.miss++; bc({ a: "sp_miss", id, pid: a.pid, pod: l.pod }); }
      onMiss(a, l);
    });
    return l;
  }
  function offAll(why: "stop" | "hit" = "stop") {
    for (const [id, r] of lights) { if (r.timer) clearTimeout(r.timer); bc({ a: "sp_off", id, why }); }
    lights.clear();
  }
  function record(a: Ath, rt: number) {
    a.rts.push(rt); a.hits++; a.med = spMedian(a.rts);
  }
  function onTap(from: string, m: SpodsClientMsg & { a: "sp_tap" }) {
    const r = lights.get(m.id);
    if (!r || phase !== "run") return;
    const l = r.l;
    if (l.pod !== from) return;
    const rt = m.at - l.at;
    if (rt < MIN_RT) return; // מוקדם מדי — יד על הפוד; מתעלמים והאור נשאר
    let a: Ath | undefined;
    if (l.zones) { const c = l.zones[m.zone ?? -1]; a = athList().find((x) => x.c === c); }
    else if (l.pid) a = aths.get(l.pid);
    if (!a) return;
    lights.delete(m.id);
    if (r.timer) clearTimeout(r.timer);
    // ↔️ ימין/שמאל: הפוד מחולק לשני צדדים (zone 0 = שמאל, 1 = ימין) — הצד הלא-נכון = פספוס
    if (l.lr && m.zone !== undefined && (m.zone === 0 ? "L" : "R") !== l.lr) {
      bc({ a: "sp_off", id: m.id, why: "miss" });
      bc({ a: "sp_miss", id: m.id, pid: a.pid, pod: from });
      to(a.pid, { a: "sp_say", t: S("wrong_hand"), k: "gentle" });
      r.onMiss(a, l);
      return;
    }
    bc({ a: "sp_off", id: m.id, why: "hit" });
    r.onHit(a, rt, l);
  }

  /* ---------- שלבים משותפים ---------- */
  function countdown(b: LText, then: () => void, s: LText = "") {
    phase = "count";
    setBanner(b, s);
    until = now() + T.count;
    ctx.cue(T.count, { a: "sp_go", at: 0 } as unknown as GameServerMsg);
    push();
    later(T.count, () => { phase = "run"; until = 0; runStart = now(); then(); });
  }
  function between(b: LText, ms: number, then: () => void, s: LText = "") {
    phase = "between";
    setBanner(b, s);
    until = now() + ms;
    push();
    resumeFn = () => between(b, Math.min(ms, T.between), then, s);
    later(ms, then);
  }
  function finish(o: { winnerIds?: string[]; title?: LText }) {
    if (ended) return;
    ended = true;
    clearTimers();
    offAll("stop");
    phase = "over"; until = 0;
    const list = athList();
    const ranked = rankAths(list);
    const winners = o.winnerIds ?? (ranked[0] ? [ranked[0].pid] : []);
    const scores: Record<string, number> = Object.fromEntries(list.map((a) => [a.pid, def.lowerIsBetter ? Math.max(1, list.length - ranked.indexOf(a)) : a.score]));
    const w = winners[0];
    setBanner(w ? `🏆 ${winners.map(nameOf).join(" + ")}` : S("end"), o.title ?? { k: `games.sp_${game}.name` });
    focus = winners;
    // טורניר הערב: משחק שבו מישהו בכלל השיג משהו נרשם — 🥇3 🥈2 🥉1 (תיקו = אותו מקום); במשחק קבוצתי: מנצחים 3, השאר 1
    let tpts: Record<string, number> | undefined;
    if (list.some((a) => a.score > 0 || a.hits > 0)) {
      const isWin = (a: Ath) => !!o.winnerIds?.includes(a.pid);
      const order = o.winnerIds ? [...ranked.filter(isWin), ...ranked.filter((a) => !isWin(a))] : ranked;
      tpts = game === "relay" && o.winnerIds
        ? Object.fromEntries(list.map((a) => [a.pid, isWin(a) ? SP_TOURN_PTS[0] : SP_TOURN_PTS[2]]))
        : spTournPoints(order.map((a) => ({ pid: a.pid, score: isWin(a) ? 1e12 : def.lowerIsBetter ? (a.score ? -a.score : -9e9) : a.score })));
      tournGames.push({ game, ranking: order.map((a) => a.pid), pts: tpts, at: now() });
    }
    push();
    bc({ a: "sp_over", winner: w, scores, tpts });
    if (w) say(winners.length > 1 ? S("won_many", { names: winners.map(nameOf).join(" + ") }) : S("won_one", { names: nameOf(w) }), "win");
    const facts: Record<string, Record<string, number>> = {};
    for (const a of list) {
      const f: Record<string, number> = {};
      if (a.rts.length) f.bestReactionMs = Math.min(...a.rts);
      if (a.hits) f.taps = a.hits;
      if (Object.keys(f).length) facts[a.pid] = f;
    }
    ctx.timer(T.end, () => ctx.end({
      title: { k: "spods.s.end_title", p: { ic: def.icon, name: { k: `games.sp_${game}.name` } } }, winnerId: w, winnerIds: winners.length > 1 ? winners : undefined,
      scores, facts,
      // לוח הערב = טבלת הטורניר (המאמן והפודים-בלבד לא מתחרים ולא מופיעים בו)
      points: tpts ?? Object.fromEntries(list.map((a) => [a.pid, 0])),
    }));
  }

  /** 🏆 אלוף הערב — מהשלט, לפני שמתחילים משחק: כל הפודים נדלקים בצבע האלוף, והטקס של לאריק נפתח על הטורניר */
  function declareChampion() {
    if (ended || phase !== "setup") return;
    const rows = spTournTable(tournGames);
    if (!rows.length) return;
    ended = true;
    clearTimers();
    champion = rows.filter((r) => r.pts === rows[0].pts).map((r) => r.pid);
    phase = "over"; until = 0;
    const names = champion.map(nameOf).join(" + ");
    setBanner(`🏆 ${names}`, S("champion_sub"));
    focus = champion;
    push();
    const at = ctx.cue(T.lead + 300, { a: "sp_champion", pids: champion, at: 0 } as unknown as GameServerMsg);
    say(S("champion_say", { names }), "win");
    const pts = Object.fromEntries(rows.map((r) => [r.pid, r.pts]));
    const played = tournGames.length;
    memo.spTourn = [];   // הטורניר הבא מתחיל נקי; הרוסטר (צבעים) נשאר
    ctx.timer(Math.max(T.end * 2, at - now() + (FAST ? 800 : 5000)), () => ctx.end({
      title: { k: "spods.s.champion_title", p: { n: played } },
      winnerId: champion![0], winnerIds: champion!.length > 1 ? champion : undefined,
      scores: pts, points: {}, countsAsGame: false,
    }));
  }
  /** דירוג: לפי הניקוד הראשי (או להפך), שובר שוויון: חציון תגובה נמוך */
  function rankAths(list: Ath[]): Ath[] {
    return [...list].sort((x, y) => {
      const d = def.lowerIsBetter ? (x.score || 9e9) - (y.score || 9e9) : y.score - x.score;
      return d || (x.med || 9e9) - (y.med || 9e9);
    });
  }

  /* ================= התוכניות ================= */
  type Program = { start(): void; resume(): void; skip?(): void };
  let prog: Program;

  /* ---------- 1. מרוץ הצבעים ---------- */
  function progColors(): Program {
    let pending = 0;
    let roundBest: { pid: string; rt: number } | null = null;
    of = cfg.rounds;
    function nextRound() {
      if (round >= of) return finish({});
      const b = S("round_of", { n: round + 1, of });
      between(b, T.between, () => { say(S("to_line"), "line"); fire(); }, S("back_to_line"));
    }
    function fire() {
      phase = "run"; until = 0;
      const ps = pods();
      let list = alive();
      if (!ps.length || !list.length) return finish({});
      // יותר ספורטאים מפודים — מסתובבים לפי הסבב
      if (list.length > ps.length) { const k = (round * ps.length) % list.length; list = [...list.slice(k), ...list.slice(0, k)].slice(0, ps.length); }
      const podsShuf = shuffle(ps).slice(0, list.length);
      const delay = T.lead + 600 + Math.random() * (cfg.delay ?? 3000) * WF;
      setBanner(S("round_of", { n: round + 1, of }), S("wait_sound"));
      focus = list.map((a) => a.pid);
      push();
      pending = list.length;
      roundBest = null;
      ctx.cue(delay, { a: "sp_go", at: 0 } as unknown as GameServerMsg);
      list.forEach((a, i) => light({ pod: podsShuf[i], c: a.c, pid: a.pid, txt: nameOf(a.pid), window: win(a), delay, lr: lr(), ball: ballOn() || undefined }, onHit, onMiss));
      until = now() + delay + win() + 500;
      resumeFn = () => { pending = 0; nextRound(); };
    }
    function done() {
      pending--;
      if (pending > 0) return;
      if (roundBest) { const a = aths.get(roundBest.pid); if (a) { a.wins++; a.score = a.wins; } }
      round++;
      setBanner(S("round_over", { n: round }), roundBest ? S("round_best", { name: nameOf(roundBest.pid), sec: (roundBest.rt / 1000).toFixed(2) }) : "");
      push();
      later(FAST ? 300 : 1500, nextRound);
    }
    function onHit(a: Ath, rt: number) {
      record(a, rt);
      a.extra = `${(rt / 1000).toFixed(2)}s`;
      if (!roundBest || rt < roundBest.rt) roundBest = { pid: a.pid, rt };
      bc({ a: "sp_hit", id: 0, pid: a.pid, pod: "", ms: rt, txt: `${(rt / 1000).toFixed(2)}`, good: true });
      push();
      done();
    }
    function onMiss(a: Ath | undefined) { if (a) { a.extra = S("miss"); push(); } done(); }
    return { start: () => { round = 0; nextRound(); }, resume: () => resumeFn?.(), skip: () => { offAll("stop"); pending = 0; round++; nextRound(); } };
  }

  /* ---------- 2. דו-קרב + סבב זוגות ---------- */
  function progDuel(): Program {
    let matches: [string, string][] = [];
    let m = -1;
    let matchEnd = 0;
    let hitsIn: Record<string, number> = {};
    let turn = 0;
    function schedule() { matches = spRoundRobin(alive().map((a) => a.pid)); of = matches.length; round = 0; }
    function nextMatch() {
      m++;
      if (m >= matches.length) return finish({});
      const [A, B] = matches[m];
      round = m + 1;
      focus = [A, B];
      hitsIn = { [A]: 0, [B]: 0 };
      between(S("duel_of", { n: round, of }), T.between + (FAST ? 200 : 2000), () => countdown(S("vs", { a: nameOf(A), b: nameOf(B) }), runMatch, S("back_to_back")), S("to_center", { a: nameOf(A), b: nameOf(B) }));
    }
    function runMatch() {
      matchEnd = now() + cfg.secs * 1000 * (FAST ? 0.15 : 1);
      until = matchEnd;
      setBanner(`${nameOf(focus![0])} 🆚 ${nameOf(focus![1])}`, "");
      push();
      turn = 0;
      resumeFn = () => { matchEnd = now() + 15000; until = matchEnd; phase = "run"; push(); fireNext(); };
      fireNext();
    }
    function fireNext() {
      if (now() >= matchEnd) return endMatch();
      const [A, B] = focus!;
      const both = Math.random() < 0.22;
      const ps = shuffle(podsFree());
      if (!ps.length) return later(400, fireNext);
      const delay = T.lead + 300 + Math.random() * 1500;
      const targets = both && ps.length >= 2 ? [A, B] : [turn++ % 2 === 0 ? A : B];
      let left = targets.length;
      targets.forEach((pid, i) => {
        const a = aths.get(pid)!;
        light({ pod: ps[i], c: a.c, pid, txt: nameOf(pid), window: win(a), delay, lr: lr() },
          (x, rt) => { record(x, rt); hitsIn[x.pid]++; x.score = x.tourn; x.extra = S("touches_n", { n: hitsIn[x.pid] }); bc({ a: "sp_hit", id: 0, pid: x.pid, pod: "", ms: rt, good: true }); push(); if (--left === 0) later(200, fireNext); },
          () => { if (--left === 0) later(200, fireNext); });
      });
      later(delay + win() + 300, () => { /* הביטחון: אם משהו נתקע, ממשיכים */ if (phase === "run" && lights.size === 0 && left > 0) { left = 0; fireNext(); } });
    }
    function endMatch() {
      offAll("stop");
      const [A, B] = focus!;
      const ha = hitsIn[A], hb = hitsIn[B];
      const a = aths.get(A)!, b = aths.get(B)!;
      if (ha > hb) { a.tourn += 3; b.tourn += 1; } else if (hb > ha) { b.tourn += 3; a.tourn += 1; } else { a.tourn += 2; b.tourn += 2; }
      a.score = a.tourn; b.score = b.tourn;
      const w: LText = ha === hb ? S("draw") : `🥇 ${nameOf(ha > hb ? A : B)}`;
      setBanner(w, `${nameOf(A)} ${ha} : ${hb} ${nameOf(B)}`);
      phase = "between"; until = now() + T.between; push();
      say(w, "next");
      later(T.between, nextMatch);
    }
    return { start: () => { schedule(); nextMatch(); }, resume: () => resumeFn?.(), skip: () => { clearTimers(); endMatch(); } };
  }

  /* ---------- 3. כוכב הזריזות ---------- */
  function progStar(): Program {
    let order: string[] = [];
    let k = -1;
    let turnEnd = 0;
    let cur: Ath | null = null;
    function nextTurn() {
      k++;
      if (k >= order.length) return finish({});
      cur = aths.get(order[k])!;
      round = k + 1; of = order.length; focus = [cur.pid];
      between(S("turn_of", { n: round, of, name: nameOf(cur.pid) }), T.between, () => countdown(S("to_home", { name: nameOf(cur!.pid) }), runTurn, S("hand_on_pod1")), S("stand_home"));
    }
    function runTurn() {
      turnEnd = now() + cfg.secs * 1000 * (FAST ? 0.2 : 1);
      until = turnEnd;
      setBanner(S("x_runs", { name: nameOf(cur!.pid) }), "");
      push();
      resumeFn = () => { turnEnd = now() + 10000; until = turnEnd; phase = "run"; push(); fireOut(); };
      fireOut();
    }
    let lastOuter = -1;
    function fireOut() {
      if (now() >= turnEnd) return endTurn();
      const ps = pods();
      if (!ps.length) return finish({});
      const home = ps[0];
      const outer = ps.length > 1 ? ps.slice(1) : ps;
      // 🔁 סביב העולם: הפוד הבא הוא השכן לפי החץ (↻ = האינדקס הבא במעגל, ↺ = הקודם)
      let dir: 1 | -1 | undefined;
      let pod: string;
      if (cfg.world === 1 && outer.length > 1) { dir = Math.random() < 0.5 ? 1 : -1; lastOuter = lastOuter < 0 ? Math.floor(Math.random() * outer.length) : (lastOuter + dir + outer.length) % outer.length; pod = outer[lastOuter]; }
      else pod = rnd(outer);
      const sh = shout();
      light({ pod, c: cur!.c, pid: cur!.pid, txt: sh !== undefined ? String(sh) : nameOf(cur!.pid), shout: sh, ball: ballOn() || undefined, dir, ic: dir ? (dir > 0 ? "↻" : "↺") : undefined, window: Math.round((12000 + cur!.hand) * (ballOn() ? SP_BALL_WINDOW : 1)), delay: T.lead + 200 + Math.random() * 600 },
        (a, rt) => { record(a, rt); a.score++; a.extra = `${a.score} ⭐`; bc({ a: "sp_hit", id: 0, pid: a.pid, pod, ms: rt, good: true }); push(); fireHome(home); },
        () => fireOut());
    }
    function fireHome(home: string) {
      if (now() >= turnEnd) return endTurn();
      light({ pod: home, c: cur!.c, pid: cur!.pid, txt: S("home"), home: true, window: 12000 + cur!.hand },
        () => fireOut(), () => fireOut());
    }
    function endTurn() {
      offAll("stop");
      setBanner(`${nameOf(cur!.pid)}: ${cur!.score} ⭐`, "");
      phase = "between"; until = now() + T.between; push();
      later(T.between, nextTurn);
    }
    return { start: () => { order = alive().map((a) => a.pid); nextTurn(); }, resume: () => resumeFn?.(), skip: () => { clearTimers(); endTurn(); } };
  }

  /* ---------- 4. מבחן הביפ ---------- */
  function progBeep(): Program {
    let shuttle = 0;
    let w = cfg.window;
    let pending = 0;
    const MAX_LEVEL = cfg.elim ? 12 : 4, PER_LEVEL = 4;
    function nextShuttle() {
      const list = alive();
      if (!list.length) return finish({});
      if (cfg.elim && list.length <= 1 && athList().length > 1) return finish({});
      if (shuttle >= MAX_LEVEL * PER_LEVEL) return finish({});
      level = Math.floor(shuttle / PER_LEVEL) + 1;
      w = Math.round(cfg.window * Math.pow(0.9, level - 1));
      round = shuttle + 1; of = MAX_LEVEL * PER_LEVEL;
      const b = S("level_shuttle", { lvl: level, n: (shuttle % PER_LEVEL) + 1, of: PER_LEVEL });
      between(b, shuttle === 0 ? T.between : (FAST ? 250 : 2500), fire, S("secs_to_touch", { sec: (w / 1000).toFixed(1) }));
    }
    function fire() {
      phase = "run";
      let list = alive();
      const ps = pods();
      if (!ps.length) return finish({});
      // יותר ספורטאים מפודים — גלים לסירוגין
      if (list.length > ps.length) { const k = (shuttle * ps.length) % list.length; list = [...list.slice(k), ...list.slice(0, k)].slice(0, ps.length); }
      const podsShuf = shuffle(ps);
      pending = list.length;
      const delay = T.lead + 400 + Math.random() * 1500;
      setBanner(S("level_n", { n: level }), S("moment"));
      push();
      ctx.cue(delay, { a: "sp_go", at: 0 } as unknown as GameServerMsg);
      list.forEach((a, i) => light({ pod: podsShuf[i], c: a.c, pid: a.pid, txt: nameOf(a.pid), window: w + a.hand, delay },
        (x, rt) => { record(x, rt); x.score = level; x.extra = S("level_n", { n: level }); bc({ a: "sp_hit", id: 0, pid: x.pid, pod: "", ms: rt, good: true }); push(); done(); },
        (x) => { if (x) { x.strikes++; x.extra = `❌ ${x.strikes}`; if (cfg.elim && x.strikes >= 2) { x.out = true; say(S("x_out", { name: nameOf(x.pid) }), "out"); } push(); } done(); }));
      until = now() + delay + w + 500;
      resumeFn = () => { pending = 0; nextShuttle(); };
    }
    function done() { if (--pending > 0) return; shuttle++; later(FAST ? 200 : 800, nextShuttle); }
    return { start: () => { shuttle = 0; nextShuttle(); }, resume: () => resumeFn?.(), skip: () => { offAll("stop"); pending = 0; shuttle++; nextShuttle(); } };
  }

  /* ---------- 5. גניבת הסבב ---------- */
  function progSteal(): Program {
    let heat: Ath[] = [];
    let heats: Ath[][] = [];
    let h = -1;
    function nextHeat() {
      h++;
      if (h >= heats.length) return finish({});
      heat = heats[h];
      round = h + 1; of = heats.length; focus = heat.map((a) => a.pid);
      between(of > 1 ? S("heat_hand_on_cone", { n: round, of }) : S("hand_on_cone"), T.between, () => countdown(S("first_to", { n: cfg.toN }), fire, heat.map((a) => nameOf(a.pid)).join(" · ")), heat.map((a) => `${nameOf(a.pid)}`).join(" · "));
    }
    function fire() {
      phase = "run"; until = 0;
      setBanner(S("first_to", { n: cfg.toN }), heat.map((a) => `${nameOf(a.pid)} ${a.score}`).join(" · "));
      push();
      const ps = pods();
      if (!ps.length) return finish({});
      const delay = T.lead + 500 + Math.random() * (cfg.delay ?? 4000) * WF;
      light({ pod: rnd(ps), c: -1, zones: heat.map((a) => a.c), txt: S("steal_bang"), window: 15000, delay },
        (a, rt) => {
          record(a, rt); a.score++; a.extra = `${a.score} 🦝`;
          bc({ a: "sp_hit", id: 0, pid: a.pid, pod: "", ms: rt, txt: nameOf(a.pid), good: true });
          push();
          if (a.score >= cfg.toN) { offAll("stop"); setBanner(`🏆 ${nameOf(a.pid)}`, ""); phase = "between"; until = now() + T.between; push(); say(S("x_won_heat", { name: nameOf(a.pid) }), "next"); return later(T.between, nextHeat); }
          later(FAST ? 200 : 800, fire);
        },
        () => later(300, fire));
      resumeFn = fire;
    }
    return {
      start: () => { const list = shuffle(alive()); heats = []; for (let i = 0; i < list.length; i += 4) heats.push(list.slice(i, i + 4)); nextHeat(); },
      resume: () => resumeFn?.(), skip: () => { clearTimers(); offAll("stop"); nextHeat(); },
    };
  }

  /* ---------- 6. הישרדות ---------- */
  function progSurvive(): Program {
    let w = cfg.window;
    let n = 0;
    const outOrder: string[] = [];
    function fire() {
      const list = alive();
      if (list.length <= 1 && athList().length > 1) { return finish({ winnerIds: list.map((a) => a.pid) }); }
      if (!list.length) return finish({});
      phase = "run";
      const a = rnd(list);
      const ps = pods();
      if (!ps.length) return finish({});
      const delay = T.lead + 500 + Math.random() * 2500 * WF;
      round = n + 1; of = 0;
      setBanner(S("survive"), S("survivors", { n: list.length, sec: (w / 1000).toFixed(1) }));
      push();
      const sh = shout();
      light({ pod: rnd(ps), c: a.c, pid: a.pid, txt: sh !== undefined ? String(sh) : nameOf(a.pid), shout: sh, ball: ballOn() || undefined, window: Math.round((w + a.hand) * (ballOn() ? SP_BALL_WINDOW : 1)), delay },
        (x, rt) => { record(x, rt); x.score++; x.extra = `${x.score}`; bc({ a: "sp_hit", id: 0, pid: x.pid, pod: "", ms: rt, good: true }); n++; w = Math.max(1500, Math.round(w * 0.93)); push(); later(FAST ? 150 : 700, fire); },
        (x) => { if (x) { x.out = true; outOrder.push(x.pid); x.extra = "💀"; say(S("x_fell", { name: nameOf(x.pid) }), "out"); } n++; push(); later(FAST ? 300 : 1500, fire); });
      resumeFn = fire;
    }
    return { start: fire, resume: () => resumeFn?.(), skip: () => { clearTimers(); offAll("stop"); finish({}); } };
  }

  /* ---------- 7. מרוץ שליחים ---------- */
  function progRelay(): Program {
    type Team = { idx: number; runners: string[]; leg: number; legStart: number; done: boolean; finishAt: number; startPod: string; farPod: string };
    let teams: Team[] = [];
    function build() {
      const list = alive();
      const ps = pods();
      const t0 = list.filter((a) => a.team === 0).map((a) => a.pid), t1 = list.filter((a) => a.team === 1).map((a) => a.pid);
      const two = t0.length && t1.length && ps.length >= 4;
      teams = two
        ? [{ idx: 0, runners: t0, leg: 0, legStart: 0, done: false, finishAt: 0, startPod: ps[0], farPod: ps[1] }, { idx: 1, runners: t1, leg: 0, legStart: 0, done: false, finishAt: 0, startPod: ps[2], farPod: ps[3] }]
        : [{ idx: 0, runners: list.map((a) => a.pid), leg: 0, legStart: 0, done: false, finishAt: 0, startPod: ps[0], farPod: ps[1] ?? ps[0] }];
      of = cfg.laps;
    }
    function start() {
      build();
      between(S("relay"), T.between, () => countdown(S("on_marks"), go, S("first_runner")), teams.length === 2 ? `🔵 ${teams[0].runners.map(nameOf).join(", ")} · 🔴 ${teams[1].runners.map(nameOf).join(", ")}` : S("all_one_team"));
    }
    function go() {
      setBanner(S("run_bang"), ""); push();
      for (const t of teams) fireFar(t);
      resumeFn = () => { phase = "run"; push(); for (const t of teams) if (!t.done) fireFar(t); };
    }
    const teamColor = (t: Team) => (teams.length === 2 ? (t.idx === 0 ? 1 : 0) : -1);
    function fireFar(t: Team) {
      const total = t.runners.length * cfg.laps;
      if (t.leg >= total) return teamDone(t);
      const pid = t.runners[t.leg % t.runners.length];
      t.legStart = now() + T.lead;
      light({ pod: t.farPod, c: teamColor(t) >= 0 ? teamColor(t) : aths.get(pid)!.c, pid, txt: nameOf(pid), sub: S("to_far"), window: 0 },
        (a, rt) => { record(a, rt); bc({ a: "sp_hit", id: 0, pid: a.pid, pod: t.farPod, ms: rt, good: true }); fireStart(t, pid); },
        () => {});
    }
    function fireStart(t: Team, pid: string) {
      light({ pod: t.startPod, c: teamColor(t) >= 0 ? teamColor(t) : aths.get(pid)!.c, pid, txt: nameOf(pid), sub: S("back_bang"), window: 0 },
        (a) => {
          const legMs = now() - t.legStart;
          a.legs.push(legMs); a.score = Math.round(a.legs.reduce((s, x) => s + x, 0) / a.legs.length); a.extra = `${(legMs / 1000).toFixed(1)}s`;
          t.leg++;
          setBanner(teams.length === 2 ? `🔵 ${teams[0].leg} · 🔴 ${teams[1].leg}` : S("leg_of", { n: t.leg, of: t.runners.length * cfg.laps }), "");
          push();
          fireFar(t);
        }, () => {});
    }
    function teamDone(t: Team) {
      t.done = true; t.finishAt = now();
      const place = teams.filter((x) => x.done).length;
      say(place === 1 ? (teams.length === 2 ? S(t.idx === 0 ? "team_blue_first" : "team_red_first") : S("finished_secs", { sec: ((now() - runStart) / 1000).toFixed(1) })) : S("finished"), "win");
      if (teams.every((x) => x.done)) {
        const first = [...teams].sort((a, b) => a.finishAt - b.finishAt)[0];
        finish({ winnerIds: first.runners, title: teams.length === 2 ? S(first.idx === 0 ? "blue_won" : "red_won") : S("secs", { sec: ((first.finishAt - runStart) / 1000).toFixed(1) }) });
      } else push();
    }
    return { start, resume: () => resumeFn?.(), skip: () => { clearTimers(); offAll("stop"); finish({}); } };
  }

  /* ---------- 8. תחנות אש ---------- */
  function progStations(): Program {
    let endAt = 0;
    // ✨ אימון שלנו: התרגילים שה-AI בנה (טקסט חופשי בשפת החדר), אחרת אחת משלוש הערכות הקבועות
    const custom = cfg.kit === SP_KIT_CUSTOM && customKit?.length ? customKit : null;
    const kit: SpMove[] = custom ? custom.map((m, i) => ({ ic: m.ic, id: `custom${i}`, sub: !!m.sub })) : SP_KITS[SP_KIT_IDS[cfg.kit] ?? "warm"].moves;
    const moveTxt = (mv: SpMove): LText => (custom ? custom[Number(mv.id.slice(6))].txt : { k: `spods.move.${mv.id}` });
    const moveSub = (mv: SpMove, a: Ath): LText => (custom ? (custom[Number(mv.id.slice(6))].sub ?? nameOf(a.pid)) : mv.sub ? { k: `spods.move.${mv.id}.sub` } : nameOf(a.pid));
    const seq = new Map<string, SpMove[]>();
    function start() {
      between(S("stations"), T.between, () => countdown(S("moves_mins", { n: kit.length, m: cfg.mins }), go, S("each_by_pod")), S("kit_x", { kit: custom ? { k: "spods.kit.custom" } : { k: `spods.kit.${SP_KIT_IDS[cfg.kit] ?? "warm"}` } }));
    }
    function go() {
      endAt = now() + cfg.mins * 60000 * (FAST ? 0.03 : 1);
      until = endAt;
      setBanner(S("stations"), ""); push();
      for (const a of alive()) fireFor(a);
      later(endAt - now(), () => finish({}));
      resumeFn = () => { phase = "run"; endAt = now() + 20000; until = endAt; push(); for (const a of alive()) fireFor(a); later(endAt - now(), () => finish({})); };
    }
    function fireFor(a: Ath) {
      if (now() >= endAt || ended) return;
      const free = podsFree().filter((p) => p !== a.lastPod);
      if (!free.length) { return later(500, () => fireFor(a)); }
      if (!seq.has(a.pid)) seq.set(a.pid, shuffle(kit));
      const mv = seq.get(a.pid)![a.stationIdx % kit.length];
      a.stationIdx++;
      const pod = rnd(free);
      a.lastPod = pod;
      light({ pod, c: a.c, pid: a.pid, txt: moveTxt(mv), ic: mv.ic, sub: moveSub(mv, a), window: 60000 + a.hand },
        (x, rt) => { record(x, rt); x.score++; x.extra = `${x.score} 🔥`; bc({ a: "sp_hit", id: 0, pid: x.pid, pod, ms: rt, good: true }); push(); later(800, () => fireFor(x)); },
        (x) => { if (x) later(300, () => fireFor(x)); });
    }
    return { start, resume: () => resumeFn?.(), skip: () => { clearTimers(); offAll("stop"); finish({}); } };
  }

  /* ---------- 9. הפסל ---------- */
  function progStatue(): Program {
    let endAt = 0;
    function start() {
      between(S("statue"), T.between, () => countdown(S("hold_until_next"), go, S("all_center")), "");
    }
    function go() {
      endAt = now() + cfg.secs * 1000 * (FAST ? 0.25 : 1);
      until = endAt;
      setBanner(S("statue"), ""); push();
      for (const a of alive()) fireFor(a, 800);
      later(endAt - now(), () => finish({}));
      resumeFn = () => { phase = "run"; endAt = now() + 15000; until = endAt; push(); for (const a of alive()) fireFor(a, 800); later(endAt - now(), () => finish({})); };
    }
    function fireFor(a: Ath, delayBase: number) {
      if (now() >= endAt || ended) return;
      const free = podsFree().filter((p) => p !== a.lastPod);
      if (!free.length) return later(400, () => fireFor(a, 300));
      const pose = rnd(SP_POSES.filter((p) => p.id !== a.hold));
      const pod = rnd(free);
      a.lastPod = pod;
      const delay = T.lead + delayBase + Math.random() * (cfg.hold ?? 6000);
      light({ pod, c: a.c, pid: a.pid, txt: { k: `spods.pose.${pose.id}` }, ic: pose.ic, sub: nameOf(a.pid), window: 12000 + a.hand, delay },
        (x, rt) => { record(x, rt); x.score++; x.hold = pose.id; x.extra = S("pose_extra", { ic: pose.ic, pose: { k: `spods.pose.${pose.id}` } }); bc({ a: "sp_hit", id: 0, pid: x.pid, pod, ms: rt, txt: S("hold_x", { pose: { k: `spods.pose.${pose.id}` } }), good: true }); push(); fireFor(x, 1500); },
        (x) => { if (x) fireFor(x, 500); });
    }
    return { start, resume: () => resumeFn?.(), skip: () => { clearTimers(); offAll("stop"); finish({}); } };
  }

  /* ---------- 10. בדיוק בזמן ---------- */
  function progPacer(): Program {
    function start() {
      of = cfg.lights;
      between(S("pacer"), T.between, () => countdown(S("touch_when_off"), go, S("all_on_line")), "");
    }
    function go() {
      setBanner(S("pacer"), ""); push();
      for (const a of alive()) fireFor(a, 500);
      resumeFn = () => { phase = "run"; push(); for (const a of alive()) if (a.lightsDone < of) fireFor(a, 500); };
    }
    function fireFor(a: Ath, delayBase: number) {
      if (ended) return;
      if (a.lightsDone >= of) { if (alive().every((x) => x.lightsDone >= of)) finish({}); return; }
      const free = podsFree().filter((p) => p !== a.lastPod);
      if (!free.length) return later(400, () => fireFor(a, 200));
      const pod = rnd(free);
      a.lastPod = pod;
      const fade = Math.round((cfg.fade ?? 5000) * (0.7 + Math.random() * 0.6) * (FAST ? 0.3 : 1));
      const fakeAt = cfg.fake && Math.random() < 0.35 ? Math.round(fade * (0.3 + Math.random() * 0.4)) : undefined;
      const total = fade + (fakeAt ? 1000 : 0);
      const l = light({ pod, c: a.c, pid: a.pid, txt: nameOf(a.pid), fade: total, fakeAt, delay: T.lead + delayBase + Math.random() * 1500 },
        (x, rt) => {
          const err = rt - total; // חיובי = נרדם, שלילי = חפוז
          x.err += Math.abs(err); x.score = x.err; x.lightsDone++; x.hits++;
          const sgn = err > 0 ? "+" : "−";
          const txt: LText = Math.abs(err) < 250 ? `${sgn}${(Math.abs(err) / 1000).toFixed(2)} 🎯` : S(err > 0 ? "late" : "early", { d: `${sgn}${(Math.abs(err) / 1000).toFixed(2)}` });
          x.extra = txt;
          x.rts.push(Math.abs(err)); x.med = spMedian(x.rts);
          bc({ a: "sp_hit", id: l.id, pid: x.pid, pod, ms: err, txt, good: Math.abs(err) < 250 });
          round = Math.min(...alive().map((y) => y.lightsDone)); push();
          later(FAST ? 300 : 2000, () => fireFor(x, 800));
        },
        (x) => { if (x) { x.err += 2500; x.score = x.err; x.lightsDone++; x.extra = S("miss"); push(); later(800, () => fireFor(x, 500)); } });
    }
    return { start, resume: () => resumeFn?.(), skip: () => { clearTimers(); offAll("stop"); finish({}); } };
  }

  const PROGS: Record<SpGame, () => Program> = {
    colors: progColors, duel: progDuel, star: progStar, beep: progBeep, steal: progSteal,
    survive: progSurvive, relay: progRelay, stations: progStations, statue: progStatue, pacer: progPacer,
  };

  /* ---------- השלט ---------- */
  function ctl(op: SpCtlOp) {
    if (op === "start") {
      if (phase !== "setup") return;
      syncAths();
      if (!pods().length || athList().length < def.minAth) { to(host, { a: "sp_say", t: S("need_min", { n: def.minAth }), k: "info" }); return; }
      prog = PROGS[game]();
      say(S("go"), "go");
      prog.start();
      return;
    }
    if (op === "pause") {
      if (phase !== "run" && phase !== "between" && phase !== "count") return;
      clearTimers(); offAll("stop");
      phase = "pause"; until = 0; setBanner(S("pause"), S("pause_s")); push();
      say(S("pause_say"), "info");
      return;
    }
    if (op === "resume") {
      if (phase !== "pause") return;
      phase = "between"; setBanner(S("resume"), ""); until = now() + 1500; push();
      later(1500, () => { phase = "run"; prog.resume(); });
      return;
    }
    if (op === "skip") { if (phase === "run" || phase === "between" || phase === "pause") { clearTimers(); prog.skip?.(); } return; }
    if (op === "stop") { if (phase !== "setup") finish({ title: S("coach_stopped") }); return; }
    if (op === "champion") return declareChampion();
    if (op === "reset_tourn") { if (phase === "setup" && tournGames.length) { tournGames.length = 0; push(); say(S("tourn_reset"), "info"); } return; }
    if (op === "team_auto") {
      if (phase !== "setup") return;
      const teams = spBalanceTeams(athList().map((a) => a.pid), spTournTable(tournGames));
      for (const a of aths.values()) a.team = teams[a.pid] ?? 0;
      teamsTouched = true; saveRoster(); push();
    }
  }

  return {
    onStart() {
      syncAths();
      setBanner({ k: `games.sp_${game}.name` }, { k: `spods.setup.${game}` });
      push();
    },
    onMessage(pid: string, d: GameClientMsg) {
      const m = d as unknown as SpodsClientMsg;
      if (m.a === "sp_tap") return onTap(pid, m);
      if (pid !== host) return; // כל השאר — רק המאמן
      switch (m.a) {
        case "sp_ctl": return ctl(m.op);
        case "sp_cfg": if (phase === "setup" && def.settings.some((s) => s.key === m.key && s.values.some((v) => v.v === m.v)) && !(m.key === "kit" && m.v === SP_KIT_CUSTOM && !customKit)) { cfg[m.key] = m.v; push(); } return;
        case "sp_kit": {
          // ✨ ערכה מותאמת (מבונה ה-AI, אחרי אימות) — נשמרת לכל הערב ונבחרת מיד
          if (phase !== "setup" || game !== "stations") return;
          const moves = spCleanKit(m.moves);
          if (moves.length < 3) return;
          customKit = moves; memo.spKit = moves; cfg.kit = SP_KIT_CUSTOM; push();
          return;
        }
        case "sp_role": if (phase === "setup" && m.pid !== host && podOrder.includes(m.pid)) { roles[m.pid] = m.role; syncAths(); push(); } return;
        case "sp_hand": { const a = aths.get(m.pid); if (a && SP_HAND_STEPS.includes(m.ms)) { a.hand = m.ms; saveRoster(); push(); } return; }
        case "sp_judge": { const a = aths.get(m.pid); if (a && phase !== "setup" && phase !== "over" && (m.d === 1 || m.d === -1)) { a.score = Math.max(0, a.score + m.d); if (game === "duel") a.tourn = a.score; if (game === "colors") a.wins = a.score; push(); } return; }
        case "sp_test": if (podOrder.includes(m.pod)) bc({ a: "sp_flash", pod: m.pod }); return;
        case "sp_order": if (phase === "setup" && m.pods.length === podOrder.length && m.pods.every((p) => podOrder.includes(p))) { podOrder = [...m.pods]; push(); } return;
        case "sp_team": { const a = aths.get(m.pid); if (a && phase === "setup" && (m.team === 0 || m.team === 1)) { teamsTouched = true; a.team = m.team; saveRoster(); push(); } return; }
      }
    },
    onRejoin(pid: string) {
      to(pid, { a: "sp_state", s: state() });
      // אור שדולק על הפוד שחזר — שולחים שוב (בלי cue, כבר בזמן)
      for (const r of lights.values()) if (r.l.pod === pid) ctx.sendTo(pid, { a: "sp_light", l: r.l } as unknown as GameServerMsg);
    },
    onLeave(pid: string, permanent?: boolean) {
      if (!permanent) { push(); return; }
      podOrder = podOrder.filter((p) => p !== pid);
      const a = aths.get(pid); if (a) a.out = true;
      push();
    },
    dispose() { disposed = true; clearTimers(); for (const r of lights.values()) if (r.timer) clearTimeout(r.timer); lights.clear(); },
  };
}
