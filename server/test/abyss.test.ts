/**
 * התהום 🕳️ — פלייטסט בוטים על מנוע החדר. מריצים: npx tsx test/abyss.test.ts
 *
 * חדר A (4 בוטים, 2 צניחות, קונפיג דחוס): ab_descent · cue המדף · הצבעות (עוצר/ממשיך/שותק/מנותק) ·
 *   נתפס באמצע → קרן · פלח הקרן מוצלח · תוצאות · דראפט · בליעה בצניחה 2 · סיום → טקס עם עובדות.
 * חדר B (זריקות): מלכודת נוחתת קדימה, קולדאון, תור לכל מטרה, busy, חסימה לפני מדף, בונוס צייד, בונוס עזרה, סבירות.
 * חדר C: כלל השתיקה · מצטרף באמצע · חזרה אחרי ניתוק · back_to_lobby מנקה טיימרים.
 * חדר D: סולו/יומי → dailyRun.
 */
import { Room, Transport } from "../src/engine";
import type { GameCtx, GameInstance } from "../src/engine";
import { createAbyss } from "../src/games/abyss";
import type { ServerMsg } from "../../shared/protocol";
import { abDepthAt, abFreezeAt, abRevealAt, abResumeAt, abWorld, abAvailableValue, abMult, abPotBounty } from "../../shared/abyss";
import type { AbTiming } from "../../shared/protocol";

let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : ""));
  if (!cond) failed++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean, ms: number, step = 25) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(step); } return fn(); };

function makeTransport() {
  const inbox = new Map<string, ServerMsg[]>();
  const transport: Transport = {
    send(pid, msg) { if (!inbox.has(pid)) inbox.set(pid, []); inbox.get(pid)!.push(msg); },
  };
  const ev = (pid: string, a: string) =>
    (inbox.get(pid) ?? []).filter((m: any) => (m.t === "game" || m.t === "cue") && m.d?.a === a).map((m: any) => m.d);
  const evAt = (pid: string, a: string) =>
    (inbox.get(pid) ?? []).filter((m: any) => m.t === "cue" && m.d?.a === a).map((m: any) => ({ at: m.at as number, d: m.d }));
  const last = (pid: string, a: string) => ev(pid, a).at(-1);
  const clear = () => inbox.clear();
  return { transport, ev, evAt, last, clear, inbox };
}

const CFG = { descents: 2, segmentMs: 3000, voteMs: 700, warnMs: 500, revealOffsetMs: 1600, revealShowMs: 600, introMs: 800, resultsMs: 800, draftMs: 1500, staleMs: 1500, maxLedges: 4 };

/** בוט: מדווח ab_state כל 100ms בעומק הנכון לזמן, עם x/c שאפשר לשנות מבחוץ */
function makeBot(room: Room, pid: string, get: () => { startAt: number; cfg: AbTiming } | null) {
  const st = { x: 50, c: 0, s: 0, on: true, every: 100 };
  let t: NodeJS.Timeout | null = null;
  const tick = () => {
    if (!st.on) return;
    const g = get();
    if (g) {
      const T = abDepthAt(g.cfg, g.startAt, Date.now());
      room.onMessage(pid, { t: "game", d: { a: "ab_state", x: st.x, d: Math.round(T.depth), c: st.c, s: st.s } as any });
    }
    t = setTimeout(tick, st.every);
  };
  t = setTimeout(tick, 10);
  return { st, stop() { st.on = false; if (t) clearTimeout(t); }, start() { st.on = true; tick(); } };
}

async function roomA() {
  console.log("\n— חדר A: הליבה (4 בוטים, 2 צניחות) —");
  const { transport, ev, evAt, last } = makeTransport();
  const room = new Room("ABYS", transport, { abyss: createAbyss });
  const P = ["a", "b", "c", "d"];
  P.forEach((p, i) => room.join(p, "צנחן" + i, "🪂"));
  room.onMessage("a", { t: "select_game", gameId: "abyss", config: CFG });
  const t0 = Date.now();
  room.onMessage("a", { t: "start_game" });

  const desc = last("a", "ab_descent") as any;
  check("ab_descent נשלח לכולם עם אותו זרע ו-startAt", !!desc && P.every((p) => (last(p, "ab_descent") as any)?.seed === desc.seed && (last(p, "ab_descent") as any)?.startAt === desc.startAt));
  check("startAt ≈ now + introMs", Math.abs(desc.startAt - t0 - CFG.introMs) < 80, `${desc.startAt - t0}`);
  check("players = 4 נופלים, of=2", desc.players.length === 4 && desc.players.every((p: any) => p[1] === "fall") && desc.of === 2);
  const cfg = desc.cfg as AbTiming, startAt = desc.startAt as number;
  const get = () => ({ startAt, cfg });
  const bots = Object.fromEntries(P.map((p) => [p, makeBot(room, p, get)]));
  // גבישים "נאספים" בקצב סביר (ערך זמין בעומק)
  const world = abWorld(desc.seed, cfg);
  const feed = setInterval(() => {
    for (const p of P) { const T = abDepthAt(cfg, startAt, Date.now()); bots[p].st.c = Math.floor(abAvailableValue(world, T.depth) * 0.5); }
  }, 100);

  // --- מדף 0 ---
  const freeze0 = abFreezeAt(cfg, startAt, 0);
  await until(() => evAt("a", "ab_ledge").length > 0, freeze0 - Date.now() + 200);
  const ledge = evAt("a", "ab_ledge")[0];
  check("cue המדף הגיע לכל 4", P.every((p) => evAt(p, "ab_ledge").length === 1));
  check("at של ה-cue ≈ freezeAt − warnMs", !!ledge && Math.abs(ledge.at - (freeze0 - CFG.warnMs)) < 80, ledge ? `${ledge.at - (freeze0 - CFG.warnMs)}` : "none");
  check("ab_ledge: k=0, freezeAt נכון, 4 נופלים, pot=0", ledge?.d.k === 0 && ledge.d.freezeAt === freeze0 && ledge.d.falling.length === 4 && ledge.d.pot === 0);
  // d מתנתק בדיוק בהקפאה (מדווח עד אז)
  await sleep(Math.max(0, freeze0 - Date.now() + 60));
  bots.d.stop(); room.disconnect("d");
  // הצבעה מוקדמת מדי (לפני ההקפאה) לא מתקבלת — נבדק דרך ab_votes בהמשך
  room.onMessage("a", { t: "game", d: { a: "ab_vote", k: 0, v: "stop" } as any });
  room.onMessage("b", { t: "game", d: { a: "ab_vote", k: 0, v: "stop" } as any });
  room.onMessage("b", { t: "game", d: { a: "ab_vote", k: 0, v: "go" } as any });    // הלחיצה האחרונה קובעת
  await sleep(50);
  const votes = last("a", "ab_votes") as any;
  check("ab_votes סופר בלי לחשוף", votes && votes.n === 2 && votes.of === 4, votes ? `${votes.n}/${votes.of}` : "none");
  const cA = bots.a.st.c;
  const reveal0At = abRevealAt(cfg, startAt, 0);
  await until(() => evAt("a", "ab_reveal").length > 0, reveal0At - Date.now() + 400);
  const rv = evAt("a", "ab_reveal")[0];
  check("cue החשיפה הגיע ב-≈revealAt", !!rv && Math.abs(rv.at - reveal0At) < 120, rv ? `${rv.at - reveal0At}` : "none");
  check("הצבעות: a עוצר · b ממשיך · c שותק→ממשיך · d מנותק→עוצר", rv?.d.votes.a === "stop" && rv.d.votes.b === "go" && rv.d.votes.c === "go" && rv.d.votes.d === "stop", JSON.stringify(rv?.d.votes));
  check("בנקאות a = גבישים×1", rv?.d.banked.a === Math.round(cA * abMult(0)), `${rv?.d.banked.a} vs ${cA}`);
  check("הקרן = פרס מדף 0 (100), next=fall", rv?.d.pot === abPotBounty(0) && rv.d.next === "fall");
  bots.a.stop();

  // --- פלח 1: b נתפס באמצע ---
  const resume0 = abResumeAt(cfg, startAt, 0);
  await sleep(Math.max(0, resume0 - Date.now() + 600));
  const cB = bots.b.st.c;
  room.onMessage("b", { t: "game", d: { a: "ab_caught", o: 12345 } as any });
  bots.b.stop();
  await sleep(60);
  const caught = last("a", "ab_caught") as any;
  check("ab_caught שודר: b, lost=גבישיו, הקרן גדלה", caught && caught.pid === "b" && caught.lost === cB && caught.pot === 100 + cB && caught.why === "hit", JSON.stringify(caught));
  // מדף 1: c ממשיך לבד → פלח הקרן
  const freeze1 = abFreezeAt(cfg, startAt, 1);
  await sleep(Math.max(0, freeze1 - Date.now() + 100));
  room.onMessage("c", { t: "game", d: { a: "ab_vote", k: 1, v: "go" } as any });
  const reveal1At = abRevealAt(cfg, startAt, 1);
  await until(() => evAt("a", "ab_reveal").length > 1, reveal1At - Date.now() + 400);
  const rv1 = evAt("a", "ab_reveal")[1];
  check("מדף 1: c ממשיך לבד → next=pot, potRunner=c", rv1?.d.votes.c === "go" && rv1.d.next === "pot" && rv1.d.potRunner === "c", JSON.stringify(rv1?.d));
  check("b מסומן caught בחשיפה, הקרן = 100 + lost + 200", rv1?.d.votes.b === "caught" && rv1.d.pot === 100 + cB + abPotBounty(1), `${rv1?.d.pot}`);
  const potBefore = rv1.d.pot;

  // --- פלח הקרן: c שורד ---
  const freeze2 = abFreezeAt(cfg, startAt, 2);
  await until(() => evAt("a", "ab_reveal").length > 2, abRevealAt(cfg, startAt, 2) - Date.now() + 400);
  const cC = bots.c.st.c;
  const rv2 = evAt("a", "ab_reveal")[2];
  check("פלח הקרן: c לוקח — votes=pot, next=end", rv2?.d.votes.c === "pot" && rv2.d.next === "end" && rv2.d.potWon?.pid === "c", JSON.stringify(rv2?.d.votes));
  check("potWon = הקרן + גבישים×2.5, הקרן מתאפסת, לא נבלעה", !!rv2 && Math.abs(rv2.d.potWon.amount - (potBefore + Math.round(cC * abMult(2)))) <= Math.round(cC * abMult(2)) * 0.15 + 1 && rv2.d.pot === 0 && rv2.d.swallowed === undefined, `${rv2?.d.potWon?.amount} vs ${potBefore}+${cC}×2.5`);
  bots.c.stop(); clearInterval(feed);
  check("freeze2 עבר (הבדיקה רצה בזמן אמת)", Date.now() > freeze2);
  await until(() => ev("a", "ab_results").length > 0, 1500);
  const res = last("a", "ab_results") as any;
  check("ab_results: d=0, 4 שורות, potLost=0, totals[c] כולל הקרן", res && res.d === 0 && res.rows.length === 4 && res.potLost === 0 && res.totals.c === rv2.d.potWon.amount, res ? `${res.totals.c}` : "none");
  const rowB = res.rows.find((r: any) => r.pid === "b");
  check("שורת b: caught, banked 0", rowB && rowB.caught && rowB.banked === 0);

  // --- דראפט ---
  await until(() => ev("a", "ab_draft").length > 0, CFG.resultsMs + 500);
  check("דראפט נפתח לשלושת המחוברים (d מנותק)", ev("a", "ab_draft").length === 1 && ev("b", "ab_draft").length === 1 && ev("c", "ab_draft").length === 1 && (last("a", "ab_draftopen") as any)?.ids.length === 3);
  const cards = (last("a", "ab_draft") as any).cards;
  check("3 קלפים עם טקסט", cards.length === 3 && cards.every((c: any) => c.id && c.t && c.d));
  room.onMessage("a", { t: "game", d: { a: "ab_pick", card: cards[0].id } as any });
  await sleep(40);
  check("ab_took + ab_perks על הבחירה", (last("a", "ab_took") as any)?.pid === "a" && (last("a", "ab_perks") as any)?.perks[0] === cards[0].id);
  await until(() => ev("a", "ab_took").length >= 3, CFG.draftMs + 800);
  check("בחירה אוטומטית לשאר אחרי draftMs", ev("a", "ab_took").length === 3);

  // --- צניחה 2: בליעה ---
  await until(() => ev("a", "ab_descent").length > 1, 2500);
  const d2 = last("a", "ab_descent") as any;
  check("צניחה 2 התחילה: d=1, d (מנותק) עדיין ברשימה, totals מועברים", d2 && d2.d === 1 && d2.players.length === 4 && d2.totals.c === res.totals.c, d2 ? `${d2.players.length}` : "none");
  const startAt2 = d2.startAt as number;
  const get2 = () => ({ startAt: startAt2, cfg });
  const bots2 = Object.fromEntries(["a", "b", "c"].map((p) => [p, makeBot(room, p, get2)]));
  const fz0 = abFreezeAt(cfg, startAt2, 0);
  await sleep(Math.max(0, fz0 - Date.now() + 100));
  room.onMessage("a", { t: "game", d: { a: "ab_vote", k: 0, v: "stop" } as any });
  room.onMessage("b", { t: "game", d: { a: "ab_vote", k: 0, v: "stop" } as any });
  room.onMessage("c", { t: "game", d: { a: "ab_vote", k: 0, v: "go" } as any });
  await until(() => evAt("a", "ab_reveal").length > 3, abRevealAt(cfg, startAt2, 0) - Date.now() + 400);
  const rvB = evAt("a", "ab_reveal")[3];
  check("צניחה 2 מדף 0: c לבד → פלח הקרן", rvB?.d.next === "pot" && rvB.d.potRunner === "c");
  bots2.a.stop(); bots2.b.stop();
  await sleep(Math.max(0, abResumeAt(cfg, startAt2, 0) - Date.now() + 500));
  room.onMessage("c", { t: "game", d: { a: "ab_caught", o: 1 } as any });
  bots2.c.stop();
  await sleep(60);
  const sw = last("a", "ab_swallow") as any;
  check("הרץ נפל → ab_swallow עם הקרן", sw && sw.pid === "c" && sw.pot === rvB.d.pot, JSON.stringify(sw));
  await until(() => ev("a", "ab_results").length > 1, 3500);
  const res2 = last("a", "ab_results") as any;
  check("ab_results 2: potLost = הקרן שנבלעה", res2 && res2.d === 1 && res2.potLost === rvB.d.pot, res2 ? `${res2.potLost}` : "none");

  // --- סיום ---
  await until(() => room.snapshot().phase === "ceremony", CFG.resultsMs + 1500);
  const snap = room.snapshot();
  check("המשחק נגמר → טקס", snap.phase === "ceremony");
  const cer = snap.ceremony!;
  check("ניקוד הטקס = totals, המנצח = c", !!cer && cer.scores?.c === res2.totals.c && cer.winnerId === "c", JSON.stringify(cer?.scores));
  check("תארים לכל השחקנים", !!cer?.awards && Object.keys(cer.awards).length === 4);
  check("הכותרת מזכירה את התהום", (cer?.title ?? "").includes("התהום"));
}

async function roomB() {
  console.log("\n— חדר B: זריקות, בונוסים, סבירות —");
  const { transport, ev, evAt, last } = makeTransport();
  const room = new Room("THRW", transport, { abyss: createAbyss });
  const P = ["a", "b", "c", "d"];
  P.forEach((p, i) => room.join(p, "צנחן" + i, "🪂"));
  const cfgB = { ...CFG, descents: 1, segmentMs: 6000, throwLeadMs: 800, throwBlockMs: 700, intakeMs: 1500, throwCdMs: 2000, maxLedges: 3 };
  room.onMessage("a", { t: "select_game", gameId: "abyss", config: cfgB });
  room.onMessage("a", { t: "start_game" });
  const desc = last("a", "ab_descent") as any;
  const cfg = desc.cfg as AbTiming, startAt = desc.startAt as number;
  const get = () => ({ startAt, cfg });
  const bots = Object.fromEntries(P.map((p) => [p, makeBot(room, p, get)]));
  bots.c.st.x = 30; bots.b.st.x = 70;

  // סבירות: c מדווח 999999 גבישים → נחתך לזמין
  await sleep(startAt - Date.now() + 700);
  bots.c.st.c = 999999;
  await sleep(250);
  const world = abWorld(desc.seed, cfg);
  const pos = last("a", "ab_pos") as any;
  const rowC = pos?.ps.find((r: any) => r[0] === "c");
  const T = abDepthAt(cfg, startAt, Date.now());
  check("סבירות: 999999 גבישים נחתכים לערך הזמין בעומק", !!rowC && rowC[2] <= abAvailableValue(world, T.depth + 30) && rowC[2] < 999999, rowC ? `${rowC[2]} ≤ ${abAvailableValue(world, T.depth + 30)}` : "none");
  bots.c.st.c = 40;
  // זריקה בזמן נפילה — נכשלת
  room.onMessage("a", { t: "game", d: { a: "ab_throw", target: "c", kind: "trap" } as any });
  await sleep(30);
  check("נופל לא יכול לזרוק → throwfail falling", (last("a", "ab_throwfail") as any)?.reason === "falling");

  // מדף 0: a ו-d עוצרים, b ו-c ממשיכים
  const fz0 = abFreezeAt(cfg, startAt, 0);
  await sleep(Math.max(0, fz0 - Date.now() + 100));
  room.onMessage("a", { t: "game", d: { a: "ab_vote", k: 0, v: "stop" } as any });
  room.onMessage("d", { t: "game", d: { a: "ab_vote", k: 0, v: "stop" } as any });
  room.onMessage("b", { t: "game", d: { a: "ab_vote", k: 0, v: "go" } as any });
  room.onMessage("c", { t: "game", d: { a: "ab_vote", k: 0, v: "go" } as any });
  bots.a.stop(); bots.d.stop();
  await until(() => evAt("a", "ab_reveal").length > 0, abRevealAt(cfg, startAt, 0) - Date.now() + 400);
  const rs0 = abResumeAt(cfg, startAt, 0);
  await sleep(Math.max(0, rs0 - Date.now() + 300));

  // a זורק מלכודת על c
  const tThrow = Date.now();
  room.onMessage("a", { t: "game", d: { a: "ab_throw", target: "c", kind: "trap" } as any });
  await sleep(40);
  const th1 = last("b", "ab_throw") as any;
  const ok1 = last("a", "ab_throwok") as any;
  const expectD = abDepthAt(cfg, startAt, tThrow + cfgB.throwLeadMs).depth;
  check("ab_throw שודר: מלכודת של a על c, x של c, d ≈ עומק בעוד 800ms", th1 && th1.by === "a" && th1.target === "c" && th1.kind === "trap" && Math.abs(th1.x - 30) < 0.2 && Math.abs(th1.d - expectD) < 25, th1 ? `d=${th1.d.toFixed(0)} vs ${expectD.toFixed(0)}` : "none");
  check("ab_throwok אישי עם readyAt ≈ now+cd", ok1 && ok1.id === th1.id && Math.abs(ok1.readyAt - (tThrow + cfgB.throwCdMs)) < 80);
  room.onMessage("a", { t: "game", d: { a: "ab_throw", target: "c", kind: "trap" } as any });
  await sleep(30);
  check("זריקה שנייה מיד → cooldown", (last("a", "ab_throwfail") as any)?.reason === "cooldown");
  // d זורק בועה על c בתוך intake → נכנס לתור (נוחת ≥1500ms אחרי הראשונה)
  room.onMessage("d", { t: "game", d: { a: "ab_throw", target: "c", kind: "shield" } as any });
  await sleep(30);
  check("זריקה שנייה על אותה מטרה בתוך 1.5 שנ' — עוד לא שודרה (בתור)", ev("b", "ab_throw").length === 1);
  await until(() => ev("b", "ab_throw").length >= 2, 1800);
  const th2 = ev("b", "ab_throw")[1] as any;
  check("…ומשוחררת אחרי intakeMs", th2 && th2.kind === "shield" && th2.by === "d" && th2.at - th1.at >= cfgB.intakeMs - 60, th2 ? `${th2.at - th1.at}` : "none");
  // c אוסף את הבועה (help) ו-a הופך צייד: c נתפס במלכודת של a
  room.onMessage("c", { t: "game", d: { a: "ab_took", th: th2.id } as any });
  room.onMessage("c", { t: "game", d: { a: "ab_caught", th: th1.id } as any });
  bots.c.stop();
  await sleep(50);
  const caughtC = last("a", "ab_caught") as any;
  check("ab_caught מציין by=a ו-th", caughtC && caughtC.pid === "c" && caughtC.by === "a" && caughtC.th === th1.id && caughtC.lost > 0, JSON.stringify(caughtC));
  const bonusA = ev("a", "ab_bonus").find((b: any) => b.pid === "a" && b.kind === "hunter") as any;
  check("בונוס צייד ל-a = 15% מההפסד של c (אחרי חיתוך הסבירות)", bonusA && bonusA.amount === Math.round(caughtC.lost * 0.15) && bonusA.from === "c", JSON.stringify(bonusA));
  // b ממשיך לבד → נעצור אותו במדף 1 אחרי שקיבל בועה מ-d → בונוס עזרה ל-d
  bots.b.st.c = 30;
  await sleep(900);   // הקולדאון של d (2 שנ') נמדד מזמן הזריקה, לא מזמן השחרור מהתור
  room.onMessage("d", { t: "game", d: { a: "ab_throw", target: "b", kind: "shield" } as any });
  await sleep(40);
  const th3 = last("a", "ab_throw") as any;
  check("d יכול לזרוק שוב (קולדאון 2 שנ' עבר)", th3 && th3.target === "b" && th3.by === "d", JSON.stringify(last("d", "ab_throwfail")));
  room.onMessage("b", { t: "game", d: { a: "ab_took", th: th3.id } as any });
  // חסימה לפני מדף
  const fz1 = abFreezeAt(cfg, startAt, 1);
  await sleep(Math.max(0, fz1 - cfgB.throwBlockMs + 100 - Date.now()));
  room.onMessage("a", { t: "game", d: { a: "ab_throw", target: "b", kind: "trap" } as any });
  await sleep(30);
  check("זריקה ב-700ms שלפני המדף → ledge", (last("a", "ab_throwfail") as any)?.reason === "ledge");
  await sleep(Math.max(0, fz1 - Date.now() + 100));
  const bankedB = Math.round(bots.b.st.c * abMult(1));
  room.onMessage("b", { t: "game", d: { a: "ab_vote", k: 1, v: "stop" } as any });
  await until(() => evAt("a", "ab_reveal").length > 1, abRevealAt(cfg, startAt, 1) - Date.now() + 400);
  const rv1 = evAt("a", "ab_reveal")[1];
  const helpD = ev("d", "ab_bonus").find((b: any) => b.pid === "d" && b.kind === "help") as any;
  check("b עצר → בונוס עזרה ל-d = 10% מהבנקאות", rv1?.d.votes.b === "stop" && helpD && helpD.amount === Math.round(bankedB * 0.10) && rv1.d.bonus.d === helpD.amount, `${helpD?.amount} vs ${bankedB}`);
  check("כולם עצרו/נתפסו → next=end, הקרן נבלעת", rv1?.d.next === "end" && rv1.d.swallowed > 0 && rv1.d.pot === 0, JSON.stringify({ next: rv1?.d.next, sw: rv1?.d.swallowed }));
  bots.b.stop();
  await until(() => room.snapshot().phase === "ceremony", 4000);
  check("צניחה אחת → טקס", room.snapshot().phase === "ceremony");
}

async function roomC() {
  console.log("\n— חדר C: שתיקה, מצטרף באמצע, חזרה, ניקוי —");
  const { transport, ev, last } = makeTransport();
  const room = new Room("SYNC", transport, { abyss: createAbyss });
  ["a", "b", "c"].forEach((p, i) => room.join(p, "צנחן" + i, "🪂"));
  room.onMessage("a", { t: "select_game", gameId: "abyss", config: { ...CFG, segmentMs: 5000, staleMs: 900 } });
  room.onMessage("a", { t: "start_game" });
  const desc = last("a", "ab_descent") as any;
  const cfg = desc.cfg as AbTiming, startAt = desc.startAt as number;
  const get = () => ({ startAt, cfg });
  const bots = Object.fromEntries(["a", "b", "c"].map((p) => [p, makeBot(room, p, get)]));
  await sleep(startAt - Date.now() + 300);
  // מצטרף באמצע
  room.join("e", "מאחר", "🐢");
  await sleep(40);
  const sync = last("e", "ab_sync") as any;
  check("מצטרף באמצע מקבל ab_sync כצופה", sync && sync.you.state === "spectator" && sync.phase === "fall" && sync.seed === desc.seed && sync.players.length === 4, sync ? `${sync.you.state}` : "none");
  // חזרה אחרי ניתוק (בתוך staleMs)
  bots.b.stop(); room.disconnect("b");
  await sleep(300);
  room.join("b", "צנחן1", "🪂");
  await sleep(40);
  const syncB = last("b", "ab_sync") as any;
  check("חוזר אחרי ניתוק קצר: עדיין נופל, עם חסינות", syncB && syncB.you.state === "falling" && syncB.you.invulnMs > 0 && !ev("a", "ab_caught").some((c: any) => c.pid === "b"));
  bots.b.start();
  // שתיקה: c מפסיק לדווח → נתפס (lost)
  bots.c.stop();
  await until(() => ev("a", "ab_caught").some((c: any) => c.pid === "c"), 2500);
  const lost = ev("a", "ab_caught").find((c: any) => c.pid === "c") as any;
  check("שקט > staleMs באמצע נפילה → ab_caught why=lost", lost && lost.why === "lost");
  // back_to_lobby מנקה הכול
  room.onMessage("a", { t: "back_to_lobby" });
  const n0 = (transport as any) && ev("a", "ab_pos").length;
  await sleep(1500);
  check("back_to_lobby: אין יותר הודעות ab_*", ev("a", "ab_pos").length === n0 && ev("a", "ab_ledge").length === 0);
  bots.a.stop(); bots.b.stop();
  check("החדר בלובי", room.snapshot().phase === "lobby");
}

async function roomD() {
  console.log("\n— חדר D: סולו / יומי —");
  const { transport, last } = makeTransport();
  const runs: any[] = [];
  const room = new Room("DALY", transport, { abyss: createAbyss }, undefined, { dailyRun: (r) => runs.push(r) });
  room.armSoloDaily("abyss", { ...CFG, descents: 1, seed: "abyss:2026-09-02", solo: true, maxLedges: 2 });
  room.join("solo", "בודד", "🧪");
  await until(() => !!last("solo", "ab_descent"), 1500);
  const desc = last("solo", "ab_descent") as any;
  check("סולו: המשחק התחיל מעצמו עם זרע יומי", desc && desc.seed === "abyss:2026-09-02:0");
  const cfg = desc.cfg as AbTiming, startAt = desc.startAt as number;
  const bot = makeBot(room, "solo", () => ({ startAt, cfg }));
  bot.st.c = 30;
  const fz0 = abFreezeAt(cfg, startAt, 0);
  await sleep(Math.max(0, fz0 - Date.now() + 100));
  room.onMessage("solo", { t: "game", d: { a: "ab_vote", k: 0, v: "stop" } as any });
  await until(() => room.snapshot().phase === "ceremony", 6000);
  bot.stop();
  check("סולו הסתיים → טקס", room.snapshot().phase === "ceremony");
  const soloScore = room.snapshot().ceremony?.scores?.solo ?? -1;
  check("dailyRun קיבל seed, wave וניקוד = ניקוד הטקס", runs.length === 1 && runs[0].seed === "abyss:2026-09-02" && runs[0].wave >= 1 && runs[0].players[0].score === soloScore && soloScore > 0, JSON.stringify(runs[0]));
}

async function main() {
  await roomA();
  await roomB();
  await roomC();
  await roomD();
  console.log(failed ? `\n✗ ${failed} בדיקות נכשלו` : "\n✓ כל הבדיקות עברו");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

// שקט מהקומפיילר על ייבוא שמשמש רק לטיפוסים בסביבות מסוימות
void (0 as unknown as GameCtx | GameInstance | undefined);
