/**
 * ספורט פודים 🏃 — פלייטסט שרת עם מאמן + 4 פודים-ספורטאים (בוטים נוגעים).
 * מריצים: SP_FAST=1 npx tsx test/spods.test.ts [colors|duel|...|all]
 * מכסה: setup → sp_cfg/sp_role/sp_hand/sp_order/sp_test → start → cue-ים של sp_light → נגיעות בזמן-שרת → sp_hit/sp_miss →
 * הפסקה/המשך → sp_over → ctx.end (טקס בחדר) · שיפוט ±1 · דלג · עצור.
 */
process.env.SP_FAST = process.env.SP_FAST || "1";
import { Room, Transport } from "../src/engine";
import { createSpods } from "../src/games/spods";
import type { ServerMsg } from "../../shared/protocol";
import { SP_GAME_IDS, SP_DEFS } from "../../shared/spods";
import type { SpGame, SpLight, SpState } from "../../shared/spods";

let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : ""));
  if (!cond) failed++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(f: () => boolean, ms = 8000) { const t0 = Date.now(); while (!f() && Date.now() - t0 < ms) await sleep(15); return f(); }

function makeTransport() {
  const inbox = new Map<string, ServerMsg[]>();
  const listeners: ((pid: string, m: ServerMsg) => void)[] = [];
  const transport: Transport = { send(pid, msg) { if (!inbox.has(pid)) inbox.set(pid, []); inbox.get(pid)!.push(msg); for (const l of listeners) l(pid, msg); } };
  const ev = (pid: string, a: string) => (inbox.get(pid) ?? []).filter((m: any) => (m.t === "game" || m.t === "cue") && m.d?.a === a).map((m: any) => m.d);
  const last = (pid: string, a: string) => ev(pid, a).at(-1);
  const lastRoom = (pid: string) => (inbox.get(pid) ?? []).filter((m: any) => m.t === "room").at(-1) as any;
  const state = (pid: string): SpState | undefined => last(pid, "sp_state")?.s;
  return { transport, ev, last, lastRoom, state, listeners };
}

/** בוט-פוד: כל cue של sp_light על הפוד שלו → נגיעה אחרי rt (זמן-שרת) */
function attachBots(room: Room, listeners: ((pid: string, m: ServerMsg) => void)[], pods: string[], rtOf: (l: SpLight) => number | null) {
  listeners.push((pid, m: any) => {
    if (m.t !== "cue" || m.d?.a !== "sp_light") return;
    const l: SpLight = m.d.l;
    if (l.pod !== pid || !pods.includes(pid)) return;
    const rt = rtOf(l);
    if (rt === null) return;
    const at = m.at + rt;
    setTimeout(() => room.onMessage(pid, { t: "game", d: { a: "sp_tap", id: l.id, at, zone: l.zones ? Math.floor(Math.random() * l.zones.length) : undefined } as any }), Math.max(0, at - Date.now()));
  });
}

async function run(game: SpGame) {
  const def = SP_DEFS[game];
  console.log(`\n— ${def.icon} ${def.name} (${game}) —`);
  const { transport, ev, last, lastRoom, state, listeners } = makeTransport();
  const factories = Object.fromEntries(SP_GAME_IDS.map((g) => [`sp_${g}`, (ctx: any) => createSpods(ctx, g)]));
  const room = new Room("SPRT", transport, factories);
  const COACH = "coach"; const P = ["a", "b", "c", "d"];
  room.join(COACH, "מאמן", "👑");
  P.forEach((p, i) => room.join(p, "ילד" + i, "🏃"));
  const g = (pid: string, d: any) => room.onMessage(pid, { t: "game", d });
  const misses = { d: 0 };
  // הבוטים: a מהיר, b בינוני, c איטי, d לפעמים מפספס (חלון קצר) — ובבדיוק-בזמן כולם מכוונים לדעיכה
  attachBots(room, listeners, P, (l) => {
    if (l.fade) return l.fade + (l.pod === "a" ? 60 : l.pod === "b" ? -200 : l.pod === "c" ? 400 : 900);
    if (l.pod === "d" && l.until && Math.random() < 0.5) { misses.d++; return null; }
    const base = l.pod === "a" ? 500 : l.pod === "b" ? 800 : l.pod === "c" ? 1200 : 900;
    return base + Math.random() * 300;
  });

  room.onMessage(COACH, { t: "select_game", gameId: `sp_${game}`, config: {} });
  room.onMessage(COACH, { t: "start_game" });
  await sleep(30);
  let s = state(COACH)!;
  check("setup: מצב נשלח, 4 פודים, 4 ספורטאים, המאמן לא פוד", !!s && s.phase === "setup" && s.pods.length === 4 && s.aths.length === 4 && !s.pods.includes(COACH), JSON.stringify(s?.pods));
  check("צבעים שונים לכל ספורטאי", new Set(s.aths.map((a) => a.c)).size === 4);
  // הגדרות: הראשונה ברשימה → הערך הראשון
  const st0 = def.settings[0];
  g(COACH, { a: "sp_cfg", key: st0.key, v: st0.values[0].v });
  g("a", { a: "sp_cfg", key: st0.key, v: st0.values[2]?.v ?? st0.values[0].v });
  s = state(COACH)!;
  check(`sp_cfg מהמאמן מתקבל (${st0.key}=${st0.values[0].v}), משחקן — לא`, s.cfg[st0.key] === st0.values[0].v);
  g(COACH, { a: "sp_hand", pid: "c", ms: 2000 });
  g(COACH, { a: "sp_order", pods: ["b", "a", "c", "d"] });
  g(COACH, { a: "sp_test", pod: "a" });
  s = state(COACH)!;
  check("הנדיקפ + סדר פודים + הבהוב", s.aths.find((a) => a.pid === "c")?.hand === 2000 && s.pods[0] === "b" && ev("a", "sp_flash").length === 1);
  g(COACH, { a: "sp_role", pid: "d", role: "pod" });
  check("d הפך לפוד בלבד", state(COACH)!.aths.length === 3 && state(COACH)!.pods.length === 4);
  g(COACH, { a: "sp_role", pid: "d", role: "ath" });
  check("d חזר לספורטאי", state(COACH)!.aths.length === 4);
  if (game === "relay") { g(COACH, { a: "sp_team", pid: "a", team: 1 }); check("קבוצה שונתה", state(COACH)!.aths.find((a) => a.pid === "a")?.team === 1); }
  g("a", { a: "sp_ctl", op: "start" });
  check("שחקן לא יכול להתחיל", state(COACH)!.phase === "setup");

  g(COACH, { a: "sp_ctl", op: "start" });
  const gotRun = await waitFor(() => state(COACH)?.phase === "run", 6000);
  check("המאמן התחיל → run", gotRun, state(COACH)?.phase);
  const gotLight = await waitFor(() => ev("a", "sp_light").length + ev("b", "sp_light").length + ev("c", "sp_light").length + ev("d", "sp_light").length > 0, 6000);
  check("פוד נדלק (cue)", gotLight);
  const anyLight = [...ev("a", "sp_light"), ...ev("b", "sp_light")][0];
  check("ל-cue יש זמן עתידי, צבע, ומזהה", !!anyLight && anyLight.l.id > 0 && typeof anyLight.l.c === "number");
  const gotHit = await waitFor(() => ev(COACH, "sp_hit").length > 0, 8000);
  check("נגיעה בזמן-שרת → sp_hit", gotHit);
  const hit = last(COACH, "sp_hit");
  check("זמן התגובה סביר (150ms–20s)", !!hit && hit.ms > -20000 && Math.abs(hit.ms) < 20000, JSON.stringify(hit));

  // הפסקה והמשך
  await sleep(300);
  if (state(COACH)?.phase === "run") {
    g(COACH, { a: "sp_ctl", op: "pause" });
    check("הפסקה → pause", state(COACH)?.phase === "pause");
    const offs = ev("a", "sp_off").filter((o: any) => o.why === "stop").length + ev("b", "sp_off").filter((o: any) => o.why === "stop").length;
    check("הפסקה מכבה אורות", offs >= 0);
    await sleep(200);
    g(COACH, { a: "sp_ctl", op: "resume" });
    const resumed = await waitFor(() => state(COACH)?.phase === "run", 4000);
    check("המשך → run", resumed, state(COACH)?.phase);
  } else console.log("  (דילוג על בדיקת הפסקה — לא ב-run)");
  // שיפוט
  const before = state(COACH)!.aths.find((a) => a.pid === "a")!.score;
  g(COACH, { a: "sp_judge", pid: "a", d: 1 });
  check("שיפוט +1", state(COACH)!.aths.find((a) => a.pid === "a")!.score === before + 1);
  g(COACH, { a: "sp_judge", pid: "a", d: -1 });

  const over = await waitFor(() => state(COACH)?.phase === "over", ["duel", "beep", "steal"].includes(game) ? 150000 : 45000);
  check("המשחק הסתיים לבד → over", over, state(COACH)?.phase + " " + JSON.stringify(state(COACH)?.aths.map((a) => [a.pid, a.score, a.extra])));
  const ov = last(COACH, "sp_over");
  check("sp_over עם ניקוד לכולם", !!ov && Object.keys(ov.scores).length === 4, JSON.stringify(ov));
  const cer = await waitFor(() => lastRoom(COACH)?.room?.phase === "ceremony", 3000);
  const c = lastRoom(COACH)?.room?.ceremony;
  check("טקס: כותרת (מפתח + שם המשחק) ומנצח מבין הספורטאים", cer && !!c && c.title?.k === "spods.s.end_title" && JSON.stringify(c.title).includes(`games.sp_${game}.name`) && (!c.winnerId || P.includes(c.winnerId)), JSON.stringify({ t: c?.title, w: c?.winnerId }));
  const fs = state(COACH)!;
  const anyHits = fs.aths.some((a) => a.hits > 0);
  check("לפחות ספורטאי אחד עם נגיעות", anyHits, JSON.stringify(fs.aths.map((a) => [a.pid, a.hits, a.miss, a.med])));
  console.log("  לוח:", fs.aths.map((a) => `${a.pid}:${a.score}${a.extra ? "(" + a.extra + ")" : ""}${a.out ? "💀" : ""}`).join(" · "), "| פספוסי d:", misses.d);
  return fs;
}

async function stopAndSkip() {
  console.log("\n— עצירה ודילוג מהשלט —");
  const { transport, state, lastRoom } = makeTransport();
  const factories = Object.fromEntries(SP_GAME_IDS.map((g) => [`sp_${g}`, (ctx: any) => createSpods(ctx, g)]));
  const room = new Room("SPR2", transport, factories);
  room.join("coach", "מאמן", "👑"); ["a", "b"].forEach((p) => room.join(p, p, "🏃"));
  room.onMessage("coach", { t: "select_game", gameId: "sp_star", config: {} });
  room.onMessage("coach", { t: "start_game" });
  room.onMessage("coach", { t: "game", d: { a: "sp_ctl", op: "start" } as any });
  await waitFor(() => state("coach")?.phase === "run", 5000);
  room.onMessage("coach", { t: "game", d: { a: "sp_ctl", op: "skip" } as any });
  await sleep(100);
  check("דלג: התור נגמר (between/run של הבא)", ["between", "run", "count"].includes(state("coach")!.phase), state("coach")!.phase);
  room.onMessage("coach", { t: "game", d: { a: "sp_ctl", op: "stop" } as any });
  await sleep(50);
  check("עצור → over", state("coach")?.phase === "over");
  const cer = await waitFor(() => lastRoom("coach")?.room?.phase === "ceremony", 3000);
  check("עצירה מובילה לטקס", cer);
}

/** 🏆 טורניר הערב: שני משחקים באותו חדר → טבלה מצטברת, הצבעים נשמרים בין המשחקים, הכרזת אלוף → cue לפודים + טקס */
async function tournament() {
  console.log("\n— 🏆 טורניר הערב —");
  const { transport, ev, state, lastRoom, listeners } = makeTransport();
  const factories = Object.fromEntries(SP_GAME_IDS.map((g) => [`sp_${g}`, (ctx: any) => createSpods(ctx, g)]));
  const room = new Room("SPR3", transport, factories);
  const COACH = "coach"; const P = ["a", "b", "c"];
  room.join(COACH, "מאמן", "👑"); P.forEach((p) => room.join(p, p, "🏃"));
  const g = (pid: string, d: any) => room.onMessage(pid, { t: "game", d });
  attachBots(room, listeners, P, (l) => (l.fade ? l.fade : l.pod === "a" ? 400 : l.pod === "b" ? 700 : 1000));
  const play = async (game: SpGame) => {
    room.onMessage(COACH, { t: "select_game", gameId: `sp_${game}`, config: {} });
    room.onMessage(COACH, { t: "start_game" });
    await sleep(30);
    return state(COACH)!;
  };
  // משחק 1: מרוץ הצבעים — a הכי מהיר
  let s = await play("colors");
  check("לפני המשחק הראשון: טבלה ריקה", !!s.tourn && s.tourn.rows.length === 0 && s.tourn.games.length === 0);
  const colors1 = Object.fromEntries(s.aths.map((a) => [a.pid, a.c]));
  g(COACH, { a: "sp_hand", pid: "c", ms: 1000 });
  g(COACH, { a: "sp_ctl", op: "start" });
  await waitFor(() => state(COACH)?.phase === "over", 45000);
  s = state(COACH)!;
  check("אחרי משחק 1: שורה לכל ספורטאי, 🥇=3", s.tourn!.games.length === 1 && s.tourn!.rows.length === 3 && s.tourn!.rows[0].pts === 3, JSON.stringify(s.tourn!.rows));
  console.log("  לוח משחק 1:", JSON.stringify(s.aths.map((a) => [a.pid, a.score, a.hits, a.miss])));
  // (הבוט מגיב לפי הטלפון, לא לפי הצבע — הסבבים מתחלקים לפי הערבוב; בודקים את הכלל, לא מי ניצח)
  const byScore = [...s.aths].sort((x, y) => y.score - x.score);
  check("המוביל בטבלה = הניקוד הגבוה; שוויון בניקוד = אותן נקודות", s.tourn!.rows[0].pid === byScore[0].pid && s.aths.every((a, _, all) => all.every((b) => a.score !== b.score || s.tourn!.rows.find((r) => r.pid === a.pid)!.pts === s.tourn!.rows.find((r) => r.pid === b.pid)!.pts)), JSON.stringify(s.tourn!.rows.map((r) => [r.pid, r.pts])));
  const ov = ev(COACH, "sp_over").at(-1);
  const lead1 = s.tourn!.rows[0].pid;
  check("sp_over נושא tpts", !!ov?.tpts && ov.tpts[lead1] === 3);
  await waitFor(() => lastRoom(COACH)?.room?.phase === "ceremony", 3000);
  let c = lastRoom(COACH)?.room?.ceremony;
  check("לוח הערב = נקודות הטורניר (המאמן לא בלוח)", !!c && c.eveningScores[lead1] === 3 && c.eveningScores[COACH] === undefined, JSON.stringify(c?.eveningScores));
  // משחק 2: כוכב הזריזות — אותם צבעים, ההנדיקפ נשמר
  room.onMessage(COACH, { t: "back_to_lobby" });
  s = await play("star");
  check("משחק 2: הטבלה נשארה", s.tourn!.games.length === 1 && s.tourn!.rows.length === 3);
  check("הצבעים וההנדיקפ נשמרו בין המשחקים", s.aths.every((a) => a.c === colors1[a.pid]) && s.aths.find((a) => a.pid === "c")!.hand === 1000, JSON.stringify(s.aths.map((a) => [a.pid, a.c, a.hand])));
  g(COACH, { a: "sp_ctl", op: "start" });
  await waitFor(() => state(COACH)?.phase === "over", 60000);
  s = state(COACH)!;
  check("אחרי משחק 2: שני משחקים בטבלה, נקודות מצטברות", s.tourn!.games.length === 2 && s.tourn!.rows.reduce((t, r) => t + r.pts, 0) >= 6 && s.tourn!.rows[0].played === 2, JSON.stringify(s.tourn!.rows));
  await waitFor(() => lastRoom(COACH)?.room?.phase === "ceremony", 3000);
  // הכרזת אלוף — מהשלט, לפני שמתחילים משחק שלישי
  room.onMessage(COACH, { t: "back_to_lobby" });
  s = await play("duel");
  const leader = s.tourn!.rows[0];
  g("a", { a: "sp_ctl", op: "champion" });
  check("שחקן לא יכול להכריז", state(COACH)!.phase === "setup");
  g(COACH, { a: "sp_ctl", op: "champion" });
  s = state(COACH)!;
  check("הכרזה → over, האלוף בבאנר", s.phase === "over" && s.tourn!.champion?.[0] === leader.pid && String(s.banner).includes("🏆"), JSON.stringify([s.phase, s.banner]));
  const cue = await waitFor(() => ev("b", "sp_champion").length > 0, 3000);
  check("cue sp_champion הגיע לפודים", cue && ev("b", "sp_champion")[0].pids[0] === leader.pid);
  const cer = await waitFor(() => lastRoom(COACH)?.room?.phase === "ceremony", 8000);
  c = lastRoom(COACH)?.room?.ceremony;
  check("טקס אלוף הערב: כותרת, מנצח, הלוח לא השתנה", cer && c?.title?.k === "spods.s.champion_title" && c.winnerId === leader.pid && c.eveningScores[leader.pid] === leader.pts, JSON.stringify({ t: c?.title, w: c?.winnerId, e: c?.eveningScores }));
  check("מונה המשחקים לא קפץ בהכרזה", c?.gamesPlayed === 2, String(c?.gamesPlayed));
  room.onMessage(COACH, { t: "back_to_lobby" });
  s = await play("colors");
  check("אחרי ההכרזה: טורניר חדש (טבלה ריקה), הצבעים נשארו", s.tourn!.games.length === 0 && s.aths.every((a) => a.c === colors1[a.pid]));
  // איפוס ידני + איזון קבוצות
  room.onMessage(COACH, { t: "back_to_lobby" });
  s = await play("relay");
  g(COACH, { a: "sp_ctl", op: "team_auto" });
  s = state(COACH)!;
  check("איזון קבוצות: שתי קבוצות", new Set(s.aths.map((a) => a.team)).size === 2, JSON.stringify(s.aths.map((a) => [a.pid, a.team])));
}

(async () => {
  const arg = process.argv[2] || "all";
  const list: SpGame[] = arg === "all" ? SP_GAME_IDS : arg === "tourn" ? [] : [arg as SpGame];
  for (const game of list) await run(game);
  if (arg === "all" || arg === "star") await stopAndSkip();
  if (arg === "all" || arg === "tourn") await tournament();
  console.log(failed ? `\n✗ ${failed} בדיקות נכשלו` : "\n✓ הכול עבר");
  process.exit(failed ? 1 : 0);
})();
