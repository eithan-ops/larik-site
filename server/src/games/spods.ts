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
import type { GameClientMsg, GameServerMsg } from "../../../shared/protocol";
import {
  SP_DEFS, SP_COLORS, SP_KITS, SP_KIT_IDS, SP_POSES, SP_HAND_STEPS, spConfig, spMedian, spRoundRobin,
} from "../../../shared/spods";
import type { SpGame, SpCfg, SpPhase, SpAth, SpState, SpLight, SpodsClientMsg, SpodsServerMsg, SpMove, SpSayKind, SpCtlOp } from "../../../shared/spods";

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

  const parts = ctx.participants();
  const host = parts.find((p) => p.isHost)?.id ?? parts[0]?.id ?? "";
  const roles: Record<string, "ath" | "pod"> = {};
  let podOrder: string[] = [];
  for (const p of parts) if (p.id !== host) { roles[p.id] = "ath"; podOrder.push(p.id); }
  const aths = new Map<string, Ath>();
  let phase: SpPhase = "setup";
  let round = 0, of = 0, until = 0, banner = "", sub = "", level = 0;
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
    // ספורטאים = מי שבתפקיד ath; צבע לפי סדר הכניסה; צבעים לא משתנים למי שכבר קיבל
    const used = new Set([...aths.values()].map((a) => a.c));
    for (const pid of podOrder) {
      if (roles[pid] !== "ath") { aths.delete(pid); continue; }
      if (aths.has(pid)) continue;
      let c = 0; while (used.has(c) && c < SP_COLORS.length - 1) c++;
      used.add(c);
      aths.set(pid, newAth(pid, c));
    }
    for (const pid of [...aths.keys()]) if (roles[pid] !== "ath") aths.delete(pid);
    // קבוצות (מרוץ שליחים): לסירוגין
    let i = 0; for (const a of aths.values()) { if (a.team !== 0 && a.team !== 1) a.team = 0; if (!teamsTouched) a.team = i++ % 2; }
  }
  let teamsTouched = false;

  /* ---------- כלים ---------- */
  const connected = (pid: string) => ctx.players().find((p) => p.id === pid)?.connected ?? false;
  const pods = () => podOrder.filter((pid) => connected(pid));
  const athList = () => [...aths.values()];
  const alive = () => athList().filter((a) => !a.out);
  const podsFree = () => pods().filter((pid) => ![...lights.values()].some((r) => r.l.pod === pid));
  const rnd = <X,>(arr: X[]): X => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = <X,>(arr: X[]): X[] => { const s = [...arr]; for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } return s; };
  const win = (a?: Ath) => (cfg.window ?? 6000) + (a?.hand ?? 0);

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
    };
  }
  const push = () => bc({ a: "sp_state", s: state() });
  function setBanner(b: string, s = "") { banner = b; sub = s; }
  const say = (t: string, k?: SpSayKind) => bc({ a: "sp_say", t, k });

  /** הדלקת פוד — cue מתוזמן; החלון נמדד מזמן ה-cue */
  function light(o: Omit<SpLight, "id" | "at" | "until"> & { window?: number; delay?: number }, onHit: LightRec["onHit"], onMiss: LightRec["onMiss"]): SpLight {
    const id = ++lightSeq;
    const delay = Math.max(T.lead, o.delay ?? T.lead);
    const at = now() + delay;
    const w = Math.round((o.window ?? 0) * WF);
    const l: SpLight = { id, pod: o.pod, c: o.c, pid: o.pid, txt: o.txt, ic: o.ic, sub: o.sub, at, until: w ? at + w : 0, fade: o.fade, fakeAt: o.fakeAt, zones: o.zones, home: o.home };
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
    bc({ a: "sp_off", id: m.id, why: "hit" });
    r.onHit(a, rt, l);
  }

  /* ---------- שלבים משותפים ---------- */
  function countdown(b: string, then: () => void, s = "") {
    phase = "count";
    setBanner(b, s);
    until = now() + T.count;
    ctx.cue(T.count, { a: "sp_go", at: 0 } as unknown as GameServerMsg);
    push();
    later(T.count, () => { phase = "run"; until = 0; runStart = now(); then(); });
  }
  function between(b: string, ms: number, then: () => void, s = "") {
    phase = "between";
    setBanner(b, s);
    until = now() + ms;
    push();
    resumeFn = () => between(b, Math.min(ms, T.between), then, s);
    later(ms, then);
  }
  function finish(o: { winnerIds?: string[]; title?: string }) {
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
    setBanner(w ? `🏆 ${winners.map(nameOf).join(" + ")}` : "סיום", o.title ?? def.name);
    focus = winners;
    push();
    bc({ a: "sp_over", winner: w, scores });
    if (w) say(`${winners.map(nameOf).join(" ו")} — ${winners.length > 1 ? "ניצחתם" : "ניצחת"}!`, "win");
    const facts: Record<string, Record<string, number>> = {};
    for (const a of list) {
      const f: Record<string, number> = {};
      if (a.rts.length) f.bestReactionMs = Math.min(...a.rts);
      if (a.hits) f.taps = a.hits;
      if (Object.keys(f).length) facts[a.pid] = f;
    }
    ctx.timer(T.end, () => ctx.end({
      title: `${def.icon} ${def.name}`, winnerId: w, winnerIds: winners.length > 1 ? winners : undefined,
      scores, facts,
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
      const b = `סבב ${round + 1} מתוך ${of}`;
      between(b, T.between, () => { say("לקו!", "line"); fire(); }, "חזרו לקו הזינוק");
    }
    function fire() {
      phase = "run"; until = 0;
      const ps = pods();
      let list = alive();
      if (!ps.length || !list.length) return finish({});
      // יותר ספורטאים מפודים — מסתובבים לפי הסבב
      if (list.length > ps.length) { const k = (round * ps.length) % list.length; list = [...list.slice(k), ...list.slice(0, k)].slice(0, ps.length); }
      const podsShuf = shuffle(ps).slice(0, list.length);
      const delay = T.lead + 600 + Math.random() * (cfg.delay ?? 3000);
      setBanner(`סבב ${round + 1} מתוך ${of}`, "רגע… חכו לצליל");
      focus = list.map((a) => a.pid);
      push();
      pending = list.length;
      roundBest = null;
      ctx.cue(delay, { a: "sp_go", at: 0 } as unknown as GameServerMsg);
      list.forEach((a, i) => light({ pod: podsShuf[i], c: a.c, pid: a.pid, txt: nameOf(a.pid), window: win(a), delay }, onHit, onMiss));
      until = now() + delay + win() + 500;
      resumeFn = () => { pending = 0; nextRound(); };
    }
    function done() {
      pending--;
      if (pending > 0) return;
      if (roundBest) { const a = aths.get(roundBest.pid); if (a) { a.wins++; a.score = a.wins; } }
      round++;
      setBanner(`סבב ${round} הסתיים`, roundBest ? `🥇 ${nameOf(roundBest.pid)} — ${(roundBest.rt / 1000).toFixed(2)} שנ'` : "");
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
    function onMiss(a: Ath | undefined) { if (a) { a.extra = "פספוס"; push(); } done(); }
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
      between(`דו-קרב ${round}/${of}`, T.between + 2000, () => countdown(`${nameOf(A)} נגד ${nameOf(B)}`, runMatch, "גב אל גב במרכז!"), `${nameOf(A)} 🆚 ${nameOf(B)} — למרכז!`);
    }
    function runMatch() {
      matchEnd = now() + cfg.secs * 1000 * (FAST ? 0.25 : 1);
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
        light({ pod: ps[i], c: a.c, pid, txt: nameOf(pid), window: win(a), delay },
          (x, rt) => { record(x, rt); hitsIn[x.pid]++; x.score = x.tourn; x.extra = `${hitsIn[x.pid]} נגיעות`; bc({ a: "sp_hit", id: 0, pid: x.pid, pod: "", ms: rt, good: true }); push(); if (--left === 0) later(200, fireNext); },
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
      const w = ha === hb ? "תיקו!" : `🥇 ${nameOf(ha > hb ? A : B)}`;
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
      between(`תור ${round}/${of}: ${nameOf(cur.pid)}`, T.between, () => countdown(`${nameOf(cur!.pid)} — לבית!`, runTurn, "יד על פוד 1"), "עמדו על פוד הבית (פוד 1)");
    }
    function runTurn() {
      turnEnd = now() + cfg.secs * 1000 * (FAST ? 0.2 : 1);
      until = turnEnd;
      setBanner(`${nameOf(cur!.pid)} רץ!`, "");
      push();
      resumeFn = () => { turnEnd = now() + 10000; until = turnEnd; phase = "run"; push(); fireOut(); };
      fireOut();
    }
    function fireOut() {
      if (now() >= turnEnd) return endTurn();
      const ps = pods();
      if (!ps.length) return finish({});
      const home = ps[0];
      const outer = ps.length > 1 ? ps.slice(1) : ps;
      const pod = rnd(outer);
      light({ pod, c: cur!.c, pid: cur!.pid, txt: nameOf(cur!.pid), window: 12000 + cur!.hand, delay: T.lead + 200 + Math.random() * 600 },
        (a, rt) => { record(a, rt); a.score++; a.extra = `${a.score} ⭐`; bc({ a: "sp_hit", id: 0, pid: a.pid, pod, ms: rt, good: true }); push(); fireHome(home); },
        () => fireOut());
    }
    function fireHome(home: string) {
      if (now() >= turnEnd) return endTurn();
      light({ pod: home, c: cur!.c, pid: cur!.pid, txt: "🏠 הביתה", home: true, window: 12000 + cur!.hand },
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
    const MAX_LEVEL = 12, PER_LEVEL = 4;
    function nextShuttle() {
      const list = alive();
      if (!list.length) return finish({});
      if (cfg.elim && list.length <= 1 && athList().length > 1) return finish({});
      if (shuttle >= MAX_LEVEL * PER_LEVEL) return finish({});
      level = Math.floor(shuttle / PER_LEVEL) + 1;
      w = Math.round(cfg.window * Math.pow(0.9, level - 1));
      round = shuttle + 1; of = MAX_LEVEL * PER_LEVEL;
      const b = `רמה ${level} · מעבורת ${(shuttle % PER_LEVEL) + 1}/${PER_LEVEL}`;
      between(b, shuttle === 0 ? T.between : Math.max(1200, T.between * 0.6), fire, `${(w / 1000).toFixed(1)} שניות לנגיעה`);
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
      setBanner(`רמה ${level}`, "רגע…");
      push();
      ctx.cue(delay, { a: "sp_go", at: 0 } as unknown as GameServerMsg);
      list.forEach((a, i) => light({ pod: podsShuf[i], c: a.c, pid: a.pid, txt: nameOf(a.pid), window: w + a.hand, delay },
        (x, rt) => { record(x, rt); x.score = level; x.extra = `רמה ${level}`; bc({ a: "sp_hit", id: 0, pid: x.pid, pod: "", ms: rt, good: true }); push(); done(); },
        (x) => { if (x) { x.strikes++; x.extra = `❌ ${x.strikes}`; if (cfg.elim && x.strikes >= 2) { x.out = true; say(`${nameOf(x.pid)} בחוץ`, "out"); } push(); } done(); }));
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
      between(`${of > 1 ? `מקצה ${round}/${of}: ` : ""}יד על הקונוס!`, T.between, () => countdown("ראשון ל-" + cfg.toN, fire, heat.map((a) => nameOf(a.pid)).join(" · ")), heat.map((a) => `${nameOf(a.pid)}`).join(" · "));
    }
    function fire() {
      phase = "run"; until = 0;
      setBanner(`ראשון ל-${cfg.toN}`, heat.map((a) => `${nameOf(a.pid)} ${a.score}`).join(" · "));
      push();
      const ps = pods();
      if (!ps.length) return finish({});
      const delay = T.lead + 500 + Math.random() * (cfg.delay ?? 4000);
      light({ pod: rnd(ps), c: -1, zones: heat.map((a) => a.c), txt: "גנוב!", window: 15000, delay },
        (a, rt) => {
          record(a, rt); a.score++; a.extra = `${a.score} 🦝`;
          bc({ a: "sp_hit", id: 0, pid: a.pid, pod: "", ms: rt, txt: nameOf(a.pid), good: true });
          push();
          if (a.score >= cfg.toN) { offAll("stop"); setBanner(`🏆 ${nameOf(a.pid)}`, ""); phase = "between"; until = now() + T.between; push(); say(`${nameOf(a.pid)} ניצח את המקצה!`, "next"); return later(T.between, nextHeat); }
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
      const delay = T.lead + 500 + Math.random() * 2500;
      round = n + 1; of = 0;
      setBanner("הישרדות", `${list.length} שורדים · ${(w / 1000).toFixed(1)} שנ'`);
      push();
      light({ pod: rnd(ps), c: a.c, pid: a.pid, txt: nameOf(a.pid), window: w + a.hand, delay },
        (x, rt) => { record(x, rt); x.score++; x.extra = `${x.score}`; bc({ a: "sp_hit", id: 0, pid: x.pid, pod: "", ms: rt, good: true }); n++; w = Math.max(1500, Math.round(w * 0.93)); push(); later(FAST ? 150 : 700, fire); },
        (x) => { if (x) { x.out = true; outOrder.push(x.pid); x.extra = "💀"; say(`${nameOf(x.pid)} נפל!`, "out"); } n++; push(); later(FAST ? 300 : 1500, fire); });
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
      between("מרוץ שליחים", T.between, () => countdown("על המקומות…", go, "הרץ הראשון על פוד הזינוק"), teams.length === 2 ? `🔵 ${teams[0].runners.map(nameOf).join(", ")} · 🔴 ${teams[1].runners.map(nameOf).join(", ")}` : "כולם בקבוצה אחת — מרוץ נגד השעון");
    }
    function go() {
      setBanner("רוצו!", ""); push();
      for (const t of teams) fireFar(t);
      resumeFn = () => { phase = "run"; push(); for (const t of teams) if (!t.done) fireFar(t); };
    }
    const teamColor = (t: Team) => (teams.length === 2 ? (t.idx === 0 ? 1 : 0) : -1);
    function fireFar(t: Team) {
      const total = t.runners.length * cfg.laps;
      if (t.leg >= total) return teamDone(t);
      const pid = t.runners[t.leg % t.runners.length];
      t.legStart = now() + T.lead;
      light({ pod: t.farPod, c: teamColor(t) >= 0 ? teamColor(t) : aths.get(pid)!.c, pid, txt: nameOf(pid), sub: "לקצה!", window: 0 },
        (a, rt) => { record(a, rt); bc({ a: "sp_hit", id: 0, pid: a.pid, pod: t.farPod, ms: rt, good: true }); fireStart(t, pid); },
        () => {});
    }
    function fireStart(t: Team, pid: string) {
      light({ pod: t.startPod, c: teamColor(t) >= 0 ? teamColor(t) : aths.get(pid)!.c, pid, txt: nameOf(pid), sub: "חזרה!", window: 0 },
        (a) => {
          const legMs = now() - t.legStart;
          a.legs.push(legMs); a.score = Math.round(a.legs.reduce((s, x) => s + x, 0) / a.legs.length); a.extra = `${(legMs / 1000).toFixed(1)}s`;
          t.leg++;
          setBanner(teams.length === 2 ? `🔵 ${teams[0].leg} · 🔴 ${teams[1].leg}` : `קטע ${t.leg}/${t.runners.length * cfg.laps}`, "");
          push();
          fireFar(t);
        }, () => {});
    }
    function teamDone(t: Team) {
      t.done = true; t.finishAt = now();
      const place = teams.filter((x) => x.done).length;
      say(place === 1 ? (teams.length === 2 ? `קבוצה ${t.idx === 0 ? "כחולה" : "אדומה"} סיימה ראשונה!` : `סיימתם! ${((now() - runStart) / 1000).toFixed(1)} שניות`) : "סיימה!", "win");
      if (teams.every((x) => x.done)) {
        const first = [...teams].sort((a, b) => a.finishAt - b.finishAt)[0];
        finish({ winnerIds: first.runners, title: teams.length === 2 ? `הקבוצה ה${first.idx === 0 ? "כחולה" : "אדומה"} ניצחה` : `${((first.finishAt - runStart) / 1000).toFixed(1)} שניות` });
      } else push();
    }
    return { start, resume: () => resumeFn?.(), skip: () => { clearTimers(); offAll("stop"); finish({}); } };
  }

  /* ---------- 8. תחנות אש ---------- */
  function progStations(): Program {
    let endAt = 0;
    const kit = SP_KITS[SP_KIT_IDS[cfg.kit] ?? "warm"].moves;
    const seq = new Map<string, SpMove[]>();
    function start() {
      between("תחנות אש", T.between, () => countdown(`${kit.length} תרגילים · ${cfg.mins} דקות`, go, "כל אחד ליד פוד"), `ערכת ${SP_KITS[SP_KIT_IDS[cfg.kit] ?? "warm"].name}`);
    }
    function go() {
      endAt = now() + cfg.mins * 60000 * (FAST ? 0.03 : 1);
      until = endAt;
      setBanner("תחנות אש", ""); push();
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
      light({ pod, c: a.c, pid: a.pid, txt: mv.t, ic: mv.ic, sub: mv.sub ?? nameOf(a.pid), window: 60000 + a.hand },
        (x, rt) => { record(x, rt); x.score++; x.extra = `${x.score} 🔥`; bc({ a: "sp_hit", id: 0, pid: x.pid, pod, ms: rt, good: true }); push(); later(800, () => fireFor(x)); },
        (x) => { if (x) later(300, () => fireFor(x)); });
    }
    return { start, resume: () => resumeFn?.(), skip: () => { clearTimers(); offAll("stop"); finish({}); } };
  }

  /* ---------- 9. הפסל ---------- */
  function progStatue(): Program {
    let endAt = 0;
    function start() {
      between("הפסל", T.between, () => countdown("החזיקו את התנוחה עד האור הבא", go, "כולם במרכז"), "");
    }
    function go() {
      endAt = now() + cfg.secs * 1000 * (FAST ? 0.25 : 1);
      until = endAt;
      setBanner("הפסל", ""); push();
      for (const a of alive()) fireFor(a, 800);
      later(endAt - now(), () => finish({}));
      resumeFn = () => { phase = "run"; endAt = now() + 15000; until = endAt; push(); for (const a of alive()) fireFor(a, 800); later(endAt - now(), () => finish({})); };
    }
    function fireFor(a: Ath, delayBase: number) {
      if (now() >= endAt || ended) return;
      const free = podsFree().filter((p) => p !== a.lastPod);
      if (!free.length) return later(400, () => fireFor(a, 300));
      const pose = rnd(SP_POSES.filter((p) => p.t !== a.hold));
      const pod = rnd(free);
      a.lastPod = pod;
      const delay = T.lead + delayBase + Math.random() * (cfg.hold ?? 6000);
      light({ pod, c: a.c, pid: a.pid, txt: pose.t, ic: pose.ic, sub: nameOf(a.pid), window: 12000 + a.hand, delay },
        (x, rt) => { record(x, rt); x.score++; x.hold = pose.t; x.extra = `${pose.ic} ${pose.t}`; bc({ a: "sp_hit", id: 0, pid: x.pid, pod, ms: rt, txt: `החזק: ${pose.t}`, good: true }); push(); fireFor(x, 1500); },
        (x) => { if (x) fireFor(x, 500); });
    }
    return { start, resume: () => resumeFn?.(), skip: () => { clearTimers(); offAll("stop"); finish({}); } };
  }

  /* ---------- 10. בדיוק בזמן ---------- */
  function progPacer(): Program {
    function start() {
      of = cfg.lights;
      between("בדיוק בזמן", T.between, () => countdown("גע בדיוק כשהאור כבה", go, "כולם על הקו"), "");
    }
    function go() {
      setBanner("בדיוק בזמן", ""); push();
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
          const txt = `${sgn}${(Math.abs(err) / 1000).toFixed(2)} ${Math.abs(err) < 250 ? "🎯" : err > 0 ? "נרדם" : "חפוז"}`;
          x.extra = txt;
          x.rts.push(Math.abs(err)); x.med = spMedian(x.rts);
          bc({ a: "sp_hit", id: l.id, pid: x.pid, pod, ms: err, txt, good: Math.abs(err) < 250 });
          round = Math.min(...alive().map((y) => y.lightsDone)); push();
          later(FAST ? 300 : 2000, () => fireFor(x, 800));
        },
        (x) => { if (x) { x.err += 2500; x.score = x.err; x.lightsDone++; x.extra = "פספוס"; push(); later(800, () => fireFor(x, 500)); } });
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
      if (!pods().length || athList().length < def.minAth) { to(host, { a: "sp_say", t: `צריך לפחות ${def.minAth} ספורטאים ופוד אחד`, k: "info" }); return; }
      prog = PROGS[game]();
      say("מתחילים!", "go");
      prog.start();
      return;
    }
    if (op === "pause") {
      if (phase !== "run" && phase !== "between" && phase !== "count") return;
      clearTimers(); offAll("stop");
      phase = "pause"; until = 0; setBanner("⏸️ הפסקה", "המאמן עצר לרגע"); push();
      say("הפסקה", "info");
      return;
    }
    if (op === "resume") {
      if (phase !== "pause") return;
      phase = "between"; setBanner("ממשיכים…", ""); until = now() + 1500; push();
      later(1500, () => { phase = "run"; prog.resume(); });
      return;
    }
    if (op === "skip") { if (phase === "run" || phase === "between" || phase === "pause") { clearTimers(); prog.skip?.(); } return; }
    if (op === "stop") { if (phase !== "setup") finish({ title: "עצר המאמן" }); }
  }

  return {
    onStart() {
      syncAths();
      setBanner(def.name, def.setup);
      push();
    },
    onMessage(pid: string, d: GameClientMsg) {
      const m = d as unknown as SpodsClientMsg;
      if (m.a === "sp_tap") return onTap(pid, m);
      if (pid !== host) return; // כל השאר — רק המאמן
      switch (m.a) {
        case "sp_ctl": return ctl(m.op);
        case "sp_cfg": if (phase === "setup" && def.settings.some((s) => s.key === m.key && s.values.some((v) => v.v === m.v))) { cfg[m.key] = m.v; push(); } return;
        case "sp_role": if (phase === "setup" && m.pid !== host && podOrder.includes(m.pid)) { roles[m.pid] = m.role; syncAths(); push(); } return;
        case "sp_hand": { const a = aths.get(m.pid); if (a && SP_HAND_STEPS.includes(m.ms)) { a.hand = m.ms; push(); } return; }
        case "sp_judge": { const a = aths.get(m.pid); if (a && phase !== "setup" && phase !== "over" && (m.d === 1 || m.d === -1)) { a.score = Math.max(0, a.score + m.d); if (game === "duel") a.tourn = a.score; if (game === "colors") a.wins = a.score; push(); } return; }
        case "sp_test": if (podOrder.includes(m.pod)) bc({ a: "sp_flash", pod: m.pod }); return;
        case "sp_order": if (phase === "setup" && m.pods.length === podOrder.length && m.pods.every((p) => podOrder.includes(p))) { podOrder = [...m.pods]; push(); } return;
        case "sp_team": { const a = aths.get(m.pid); if (a && phase === "setup" && (m.team === 0 || m.team === 1)) { teamsTouched = true; a.team = m.team; push(); } return; }
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
