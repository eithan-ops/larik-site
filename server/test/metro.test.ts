/**
 * מטרונובול 🎾 — פלייטסט שרת עם 4 בוטים + סולו. מריצים: MB_FAST=1 npx tsx test/metro.test.ts
 * מכסה: בחירת צבע → mb_go → mb_round (הקובע מכוון: רמה/רצפה/סיום מוקדם) → mb_count → הקשות בזמן-שרת →
 * mb_ball/mb_prog/mb_lock/mb_unison → mb_result עם ניקוד → סבבים לכולם → mb_over → ctx.end · סולו: השרת קובע.
 */
process.env.MB_FAST = process.env.MB_FAST || "1";
import { Room, Transport } from "../src/engine";
import { createMetro } from "../src/games/metro";
import type { ServerMsg } from "../../shared/protocol";
import { MB, mbBotTaps, mbLevelOf } from "../../shared/metro";

let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : ""));
  if (!cond) failed++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(f: () => boolean, ms = 8000) { const t0 = Date.now(); while (!f() && Date.now() - t0 < ms) await sleep(20); return f(); }

function makeTransport() {
  const inbox = new Map<string, ServerMsg[]>();
  const transport: Transport = { send(pid, msg) { if (!inbox.has(pid)) inbox.set(pid, []); inbox.get(pid)!.push(msg); } };
  const ev = (pid: string, a: string) => (inbox.get(pid) ?? []).filter((m: any) => (m.t === "game" || m.t === "cue") && m.d?.a === a).map((m: any) => m.d);
  const cues = (pid: string, a: string) => (inbox.get(pid) ?? []).filter((m: any) => m.t === "cue" && m.d?.a === a);
  const last = (pid: string, a: string) => ev(pid, a).at(-1);
  const lastRoom = (pid: string) => (inbox.get(pid) ?? []).filter((m: any) => m.t === "room").at(-1) as any;
  return { transport, ev, cues, last, lastRoom };
}

/** בוט מקיש: מתזמן הקשות אמיתיות (setTimeout) לפי פעימות המנהיג */
function scheduleBot(g: (pid: string, d: any) => void, pid: string, bpm: number, anchor: number, from: number, to: number, o: { jitterMs: number; startDelayMs: number; tempoErr: number; converge: number }) {
  const taps = mbBotTaps(bpm, anchor, from, to, o);
  for (const t of taps) setTimeout(() => g(pid, { a: "mb_tap", at: t }), Math.max(0, t - Date.now()));
  return taps.length;
}

async function multi() {
  console.log("\n— מטרונובול 🎾 (שרת, 4 בוטים) —");
  const { transport, ev, cues, last, lastRoom } = makeTransport();
  const room = new Room("METR", transport, { metro: createMetro });
  const P = ["a", "b", "c", "d"];
  P.forEach((p, i) => room.join(p, "כדור" + i, "🎾"));
  room.onMessage("a", { t: "select_game", gameId: "metro", config: { rounds: "1" } });
  room.onMessage("a", { t: "start_game" });
  const g = (pid: string, d: any) => room.onMessage(pid, { t: "game", d });

  check("שלב בחירת צבע נפתח", !!last("a", "mb_pickphase"));
  g("a", { a: "mb_char", c: 3 }); g("b", { a: "mb_char", c: 3 }); g("b", { a: "mb_char", c: 0 }); g("c", { a: "mb_char", c: 5 }); g("d", { a: "mb_char", c: 7 });
  check("צבע תפוס לא נבחר פעמיים", last("a", "mb_pickphase").taken.b === 0);
  await waitFor(() => !!last("a", "mb_go"), 3000);
  const go = last("a", "mb_go");
  check("mb_go: 4 צבעים שונים, 4 סבבים, לא סולו", !!go && Object.keys(go.chars).length === 4 && new Set(Object.values(go.chars)).size === 4 && go.rounds === 4 && go.solo === false, JSON.stringify(go));
  await waitFor(() => !!last("a", "mb_round"), 3000);
  const r0 = last("a", "mb_round");
  check("mb_round 0: קובע מבין השחקנים, רצפה, רמה 6–45", !!r0 && P.includes(r0.leader) && typeof r0.floor === "string" && r0.level >= 6 && r0.level <= 45, JSON.stringify(r0));
  const lead = r0.leader as string;
  const others = P.filter((p) => p !== lead);
  // הקובע מכוון: רמה, רצפה; עוקב שמנסה — נחסם
  g(others[0], { a: "mb_level", level: 10 });
  check("עוקב לא יכול לשנות רמה", ev("a", "mb_lead").length === 0);
  g(lead, { a: "mb_level", level: 20 });
  g(lead, { a: "mb_floor", floor: "water" });
  const ld = last("a", "mb_lead");
  check("הקובע שינה רמה ל-20 (108 BPM) ורצפה למים — כולם קיבלו mb_lead", !!ld && ld.bpm === 108 && ld.floor === "water" && ev("b", "mb_lead").length === 2);
  g(lead, { a: "mb_level", level: 0 }); g(lead, { a: "mb_level", level: 51 });
  check("רמות מחוץ לטווח נזרקות", last("a", "mb_lead").bpm === 108);
  g(others[0], { a: "mb_tap", at: Date.now() });
  check("הקשה בזמן הכיוון לא נספרת", ev("a", "mb_ball").length === 0);
  g(lead, { a: "mb_setdone" });
  await waitFor(() => !!last("a", "mb_count"), 1500);
  const ct = last("a", "mb_count");
  check("mb_setdone → mb_count מיד, startAt בעתיד, bpm 108", !!ct && ct.startAt > Date.now() && ct.bpm === 108 && ct.floor === "water" && ct.until === ct.startAt + 8000, JSON.stringify(ct));
  // בוטים: שניים טובים, אחד גרוע (קצב רחוק), אחד ישן
  const n0 = scheduleBot(g, others[0], ct.bpm, ct.startAt, ct.startAt, ct.until, { jitterMs: 15, startDelayMs: 300, tempoErr: 0.02, converge: 0.3 });
  const n1 = scheduleBot(g, others[1], ct.bpm, ct.startAt, ct.startAt, ct.until, { jitterMs: 25, startDelayMs: 1200, tempoErr: 0.04, converge: 0.25 });
  scheduleBot(g, others[2], ct.bpm * 1.5, ct.startAt, ct.startAt, ct.until, { jitterMs: 30, startDelayMs: 500, tempoErr: 0, converge: 0 });
  // הקובע מקיש — נחסם
  setTimeout(() => g(lead, { a: "mb_tap", at: Date.now() }), 1000);
  await waitFor(() => !!last("a", "mb_result"), 14000);
  const res = last("a", "mb_result");
  check("mb_result הגיע עם 4 שורות והרמה נחשפה (20)", !!res && res.rows.length === 4 && res.level === 20 && res.leader === lead);
  const row = (pid: string) => res.rows.find((x: any) => x.pid === pid);
  check("הבוט המדויק נעל מהר וקיבל ניקוד גבוה", row(others[0]).lockAt > 0 && row(others[0]).lockAt < 4000 && row(others[0]).acc >= 350 && row(others[0]).speed >= 350, JSON.stringify(row(others[0])));
  check("הבוט האיטי-להתחיל נעל מאוחר יותר", row(others[1]).lockAt > row(others[0]).lockAt && row(others[1]).round > 0, JSON.stringify(row(others[1])));
  check("בוט בקצב ×1.5 לא נעל וקיבל 0", row(others[2]).lockAt === 0 && row(others[2]).round === 0, JSON.stringify(row(others[2])));
  check("הקובע קיבל 20 על כל נעילה (2 נעילות = 40), בלי דיוק", row(lead).leader && row(lead).bonus === 2 * MB.LEADER_PER_LOCK && row(lead).acc === 0, JSON.stringify(row(lead)));
  check("אין unison (לא כולם נעולים)", cues("a", "mb_unison").length === 0);
  check("mb_lock נשלח פעמיים (שני הבוטים הטובים)", ev("a", "mb_lock").length === 2);
  check("mb_ball שודר לכולם על הקשות (≥ ההקשות של הבוט המדויק)", ev("d", "mb_ball").filter((m: any) => m.pid === others[0]).length >= n0 - 2, `${ev("d", "mb_ball").filter((m: any) => m.pid === others[0]).length}/${n0}`);
  check("mb_prog נשלח ב-2Hz בזמן ההשוואה", ev("a", "mb_prog").length >= 10, `${ev("a", "mb_prog").length}`);
  check("הקשה של הקובע נזרקה", !ev("a", "mb_ball").some((m: any) => m.pid === lead));
  check("הטבלה מסודרת לפי ניקוד הסבב", res.rows.every((x: any, i: number) => i === 0 || res.rows[i - 1].round >= x.round));
  void n1;

  // סבב 2: כולם נועלים → unison
  await waitFor(() => last("a", "mb_round")?.r === 1, 6000);
  const r1 = last("a", "mb_round");
  check("סבב 1 עם קובע אחר", !!r1 && r1.leader !== lead && Math.abs(r1.level - 20) >= 6, JSON.stringify(r1));
  await waitFor(() => last("a", "mb_count")?.r === 1, 9000);
  const ct1 = last("a", "mb_count");
  check("הכיוון נגמר לבד אחרי setMs", !!ct1 && ct1.r === 1);
  for (const p of P.filter((x) => x !== r1.leader)) scheduleBot(g, p, ct1.bpm, ct1.startAt, ct1.startAt, ct1.until, { jitterMs: 12, startDelayMs: 200, tempoErr: 0.01, converge: 0.4 });
  await waitFor(() => last("a", "mb_result")?.r === 1, 14000);
  const res1 = last("a", "mb_result");
  check("unison כ-cue כשכולם נעולים", cues("a", "mb_unison").length === 1);
  check("בונוס 100 לכולם כולל הקובע", res1.rows.every((x: any) => x.bonus >= MB.UNISON_BONUS), JSON.stringify(res1.rows.map((x: any) => [x.pid, x.bonus])));
  check("הסכום הכולל מצטבר", res1.rows.every((x: any) => x.total >= x.round));

  // סבב 2: הקובע עוזב → הכיוון מתקצר
  await waitFor(() => last("a", "mb_round")?.r === 2, 6000);
  const r2 = last("a", "mb_round");
  room.onMessage(r2.leader, { t: "leave" });
  await waitFor(() => last("a", "mb_count")?.r === 2, 1500);
  check("הקובע עזב → mb_count מיד", last("a", "mb_count")?.r === 2 && last("a", "mb_count").startAt - Date.now() > 800);

  // סבבים 2–3 בלי הקשות → סיום
  await waitFor(() => !!last("a", "mb_over"), 120000);
  const ov = last("a", "mb_over");
  check("mb_over עם טבלה מסודרת ותארים", !!ov && ov.rows.length === 4 && ov.rows[0].total >= ov.rows[1].total && ov.titles.length >= 1, JSON.stringify(ov?.titles));
  await waitFor(() => lastRoom("a")?.room?.phase === "ceremony", 3000);
  const cer = lastRoom("a")?.room;
  check("ctx.end → טקס עם ניקוד", cer?.phase === "ceremony" && !!cer.ceremony?.scores && Object.keys(cer.ceremony.scores).length === 4, JSON.stringify(cer?.ceremony?.title));

  // rejoin
  const { transport: t2, last: last2 } = makeTransport();
  const room2 = new Room("MET2", t2, { metro: createMetro });
  ["x", "y"].forEach((p) => room2.join(p, p, "🎾"));
  room2.onMessage("x", { t: "select_game", gameId: "metro" }); room2.onMessage("x", { t: "start_game" });
  room2.onMessage("x", { t: "game", d: { a: "mb_char", c: 1 } as any }); room2.onMessage("y", { t: "game", d: { a: "mb_char", c: 2 } as any });
  await waitFor(() => !!last2("x", "mb_round"), 3000);
  room2.disconnect("y"); room2.join("y", "y", "🎾", "y");
  await waitFor(() => !!last2("y", "mb_sync"), 2000);
  const sy = last2("y", "mb_sync");
  check("חוזר מניתוק מקבל mb_sync עם שלב, קובע, רצפה וצבעים", !!sy && sy.phase === "set" && typeof sy.leader === "string" && Object.keys(sy.chars).length === 2, JSON.stringify(sy && { phase: sy.phase, leader: sy.leader }));
}

async function soloRun() {
  console.log("\n— מטרונובול 🎾 (סולו) —");
  const { transport, last, lastRoom } = makeTransport();
  const room = new Room("SOLO", transport, { metro: createMetro });
  room.join("s", "סולן", "🎾");
  room.onMessage("s", { t: "select_game", gameId: "metro", config: { minutes: "2" } });
  room.onMessage("s", { t: "start_game" });
  const g = (d: any) => room.onMessage("s", { t: "game", d });
  g({ a: "mb_char", c: 4 });
  await waitFor(() => !!last("s", "mb_go"), 3000);
  const go = last("s", "mb_go");
  check("סולו: 4 סבבים (2 דק' × 2), solo=true", !!go && go.rounds === 4 && go.solo === true, JSON.stringify(go));
  await waitFor(() => !!last("s", "mb_count"), 3000);
  const ct = last("s", "mb_count");
  check("סולו: mb_round עם קובע ריק ואז mb_count", last("s", "mb_round")?.leader === "" && !!ct && mbLevelOf(ct.bpm) === last("s", "mb_round").level);
  check("סולו: 5 שניות הקשבה לפני ההתחלה", ct.startAt - Date.now() > 4000);
  const gg = (pid: string, d: any) => room.onMessage(pid, { t: "game", d });
  scheduleBot(gg, "s", ct.bpm, ct.startAt, ct.startAt, ct.until, { jitterMs: 15, startDelayMs: 400, tempoErr: 0.02, converge: 0.3 });
  await waitFor(() => !!last("s", "mb_result"), 18000);
  const res = last("s", "mb_result");
  check("סולו: תוצאה עם נעילה, דיוק ובונוס נעילה", !!res && res.rows[0].lockAt > 0 && res.rows[0].acc > 200 && res.rows[0].bonus === MB.UNISON_BONUS, JSON.stringify(res?.rows[0]));
  await waitFor(() => !!last("s", "mb_over"), 60000);
  await waitFor(() => lastRoom("s")?.room?.phase === "ceremony", 3000);
  check("סולו: סיום → טקס", lastRoom("s")?.room?.phase === "ceremony");
}

(async () => {
  await multi();
  await soloRun();
  console.log(failed ? `\n✗ ${failed} נכשלו` : "\n✓ כל בדיקות השרת עברו");
  process.exit(failed ? 1 : 0);
})();
