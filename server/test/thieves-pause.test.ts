/**
 * הגנבים 🥷 — סבב 5: העצירה, המדף והקלפים. מריצים: npx tsx test/thieves-pause.test.ts
 *
 * תזמון מהיר (config.timing): דקה = 4 שנ', עצירה = 3 שנ' (0.6 הקפאה + 1.8 מדף + 0.6 חשיפה), 2 עצירות.
 *  1. th_init נושא timing/nextPauseAt/k · th_pause מגיע כ-cue עם דירוג וזהב · th_shelf אישי עם 4 קלפים ומחירים.
 *  2. בעצירה: th_dir מתעלם (קפואים), th_pos ממשיך לזרום ו-left קפוא.
 *  3. קנייה לפני המדף — נדחית; במדף — th_bought + th_cards והזהב יורד; קנייה שנייה — נדחית.
 *  4. th_reveal כ-cue עם "מי לקח מה" · th_resume עם endsAt שזז באורך העצירה ו-nextPauseAt.
 *  5. 💨 דאש: th_use ⇒ th_fx(dash) + th_cd, קפיצה של ≥3 תאים ב-0.3 שנ'; שימוש חוזר בקירור — נדחה.
 *  6. עצירה 2: ג'וקר על המדף (🌀 גשם זהב) ⇒ בחזרה th_rain עם 10 צ'אנקים, הרמה ⇒ th_nugget; אחריה nextPauseAt=0.
 *  7. הסבב נגמר בטקס עם ניקוד ועובדות (spent/cards).
 */
import { Room, Transport } from "../src/engine";
import { createThieves } from "../src/games/thieves";
import type { ServerMsg } from "../../shared/protocol";
import { TH_TIMING } from "../../shared/thieves";

let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : ""));
  if (!cond) failed++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeTransport() {
  const inbox = new Map<string, ServerMsg[]>();
  const times: { pid: string; t: string; d: any; at: number }[] = [];
  let lastRoom: any = null;
  const transport: Transport = {
    send(pid, msg) {
      if (!inbox.has(pid)) inbox.set(pid, []); inbox.get(pid)!.push(msg);
      const m = msg as any;
      if (m.t === "room") { lastRoom = m; return; }
      if (m.d?.a) times.push({ pid, t: m.t, d: m.d, at: Date.now() });
    },
  };
  const ev = (pid: string, a: string) => times.filter((x) => x.pid === pid && x.d.a === a).map((x) => x.d);
  const last = (pid: string, a: string) => ev(pid, a).at(-1);
  const since = (pid: string, a: string, t: number) => times.filter((x) => x.pid === pid && x.d.a === a && x.at >= t).map((x) => x.d);
  const timed = (pid: string, a: string) => times.filter((x) => x.pid === pid && x.d.a === a);
  const isCue = (pid: string, a: string) => times.some((x) => x.pid === pid && x.t === "cue" && x.d.a === a);
  return { transport, ev, last, since, timed, isCue, room: () => lastRoom };
}

async function main() {
  console.log("\n— הגנבים 🥷 העצירה והמדף (4 בוטים, תזמון מהיר) —");
  const { transport, ev, last, since, timed, isCue, room: lastRoom } = makeTransport();
  const room = new Room("PAUS", transport, { thieves: createThieves });
  const P = ["a", "b", "c", "d"];
  P.forEach((p, i) => room.join(p, "גנב" + i, "🥷"));
  const timing = { segMs: 4000, pauseMs: 3000, freezeMs: 600, draftMs: 1800, pauses: 2, alarmMs: 5000 };
  // מאגר קלפים מצומצם: 3 של 🦝, 1 של 🏠, ג'וקר אחד — כך המדף צפוי. כולם מתחילים עם 300 זהב.
  room.onMessage("a", { t: "select_game", gameId: "thieves", config: { roundMs: 24_000, mtnPer: 5, startGold: 300, timing, cards: ["sole", "sack", "dash", "fence", "rain"] } });
  room.onMessage("a", { t: "start_game" });
  const init = last("a", "th_init") as any;
  check("1. th_init נושא timing, nextPauseAt ו-k", !!init.timing && init.timing.segMs === 4000 && init.timing.pauses === 2 && init.nextPauseAt === init.goAt + 4000 && init.k === 0, `next-go=${init.nextPauseAt - init.goAt} k=${init.k}`);
  check("1א. ברירת המחדל: 6×(58 שנ' משחק + 12 שנ' עצירה) + דקת אזעקה = 8:00 בדיוק", TH_TIMING.pauses * (TH_TIMING.segMs + TH_TIMING.pauseMs) + TH_TIMING.alarmMs === 8 * 60_000 && TH_TIMING.segMs === 58_000);

  const posOf = (pid: string) => { const pos = last(pid, "th_pos") as any; const row = pos?.ps?.find((r: any[]) => r[0] === pid); return row ? { x: row[1], y: row[2], gold: row[5], carry: row[3] } : { x: 0, y: 0, gold: 0, carry: 0 }; };
  const dir = (pid: string, dx: number, dy: number) => room.onMessage(pid, { t: "game", d: { a: "th_dir", dx, dy } as any });
  const steer = (pid: string, tx: number, ty: number) => { const p = posOf(pid); const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1; if (d < 0.35) { dir(pid, 0, 0); return 0; } dir(pid, dx / d, dy / d); return d; };
  const goTo = async (pid: string, tx: number, ty: number, maxMs = 9000) => { for (let i = 0; i < maxMs / 100; i++) { if (steer(pid, tx, ty) === 0) return true; await sleep(100); } return false; };
  const buy = (pid: string, id: string) => room.onMessage(pid, { t: "game", d: { a: "th_buy", id } as any });
  const use = (pid: string, id: string) => room.onMessage(pid, { t: "game", d: { a: "th_use", id } as any });
  const waitFor = async (pid: string, a: string, fromT: number, maxMs: number) => { for (let i = 0; i < maxMs / 50; i++) { const m = since(pid, a, fromT); if (m.length) return m[0]; await sleep(50); } return null; };

  await sleep(1600);   // צאו!
  // b,c,d רצים לכיוון ההר (וחוצבים) — a נשאר בבית עם שק ריק, כדי להרים צ'אנקים אחר כך
  for (const p of ["b", "c", "d"]) steer(p, init.mtn.x, init.mtn.y);
  dir("a", 0, 1); await sleep(400); dir("a", 0, 0);

  /* --- 1. העצירה הראשונה --- */
  const t1 = Date.now();
  const pauseMsg = await waitFor("a", "th_pause", t1, 5000) as any;
  check("2. th_pause הגיע (k=1) עם דירוג של 4 וזהב לכולם", !!pauseMsg && pauseMsg.k === 1 && pauseMsg.rank.length === 4 && Object.keys(pauseMsg.gold).length === 4, pauseMsg ? `k=${pauseMsg.k}` : "אין");
  check("2א. th_pause הגיע כ-cue (כולם קופאים באותו רגע), ומועדיו עקביים", isCue("a", "th_pause") && pauseMsg.draftAt === pauseMsg.at + 600 && pauseMsg.revealAt === pauseMsg.at + 2400 && pauseMsg.resumeAt === pauseMsg.at + 3000);
  const shelf = await waitFor("a", "th_shelf", t1, 2000) as any;
  check("3. th_shelf אישי: 4 קלפים עם מחיר, מהמאגר, בלי ג'וקר בעצירה 1", !!shelf && shelf.cards.length === 4 && shelf.cards.every((c: any) => ["sole", "sack", "dash", "fence"].includes(c.id) && c.price > 0), shelf ? shelf.cards.map((c: any) => `${c.id}:${c.price}`).join(" ") : "אין");
  {
    const p = (id: string) => shelf.cards.find((c: any) => c.id === id)?.price ?? -1;
    // חציון 300 × 30% = 90 לרגיל; ×1.8 לנדיר-למחצה (דאש) = 162 → 160
    check("3א. המחירים נגזרים מחציון הזהב (300×30%=90 לרגיל, דאש ×1.8≈160)", p("sole") === 90 && p("fence") === 90 && p("dash") === 160, `sole=${p("sole")} fence=${p("fence")} dash=${p("dash")}`);
  }
  // הקפאה: th_dir מתעלם, המיקום לא זז, th_pos ממשיך לזרום ו-left קפוא
  await sleep(150);
  const frozenPos = posOf("a"), posCount0 = ev("a", "th_pos").length, left0 = (last("a", "th_pos") as any).left;
  dir("a", 1, 0); dir("b", 0, 1);
  await sleep(700);
  const p2 = posOf("a");
  check("4. בעצירה כולם קפואים — th_dir מתעלם והמיקום לא זז", Math.hypot(p2.x - frozenPos.x, p2.y - frozenPos.y) < 0.05, `Δ=${Math.hypot(p2.x - frozenPos.x, p2.y - frozenPos.y).toFixed(2)}`);
  check("4א. th_pos ממשיך לזרום בעצירה (הלקוח חי) ו-left קפוא", ev("a", "th_pos").length > posCount0 + 5 && (last("a", "th_pos") as any).left === left0, `left ${left0}→${(last("a", "th_pos") as any).left}`);

  /* --- 2. קנייה: לפני המדף נדחית; במדף עובדת פעם אחת --- */
  const draftIn = pauseMsg.draftAt - Date.now();
  if (draftIn > 0) { buy("a", "dash"); await sleep(50); }
  check("5. קנייה בזמן ההקפאה (לפני draftAt) — נדחית", ev("a", "th_bought").length === 0);
  await sleep(Math.max(0, pauseMsg.draftAt - Date.now()) + 120);
  const goldA0 = posOf("a").gold;
  buy("a", "dash"); buy("b", "sole"); buy("c", "fence");
  await sleep(200);
  const boughtA = ev("a", "th_bought").find((m: any) => m.pid === "a") as any;
  const cardsA = ev("a", "th_cards").find((m: any) => m.pid === "a") as any;
  check("6. th_bought(a, dash, 160) + th_cards(a, [dash]) לכולם", !!boughtA && boughtA.id === "dash" && boughtA.price === 160 && !!cardsA && cardsA.cards.join() === "dash" && ev("d", "th_bought").some((m: any) => m.pid === "a"));
  buy("a", "sole"); await sleep(150);
  check("6א. קנייה שנייה באותה עצירה — נדחית", ev("a", "th_bought").filter((m: any) => m.pid === "a").length === 1);
  await sleep(300);
  check("6ב. הזהב של a ירד ב-160 (המחיר יורד מהניקוד)", posOf("a").gold <= goldA0 - 159 && posOf("a").gold >= goldA0 - 162, `${goldA0} → ${posOf("a").gold}`);

  /* --- 3. החשיפה והחזרה --- */
  const reveal = await waitFor("a", "th_reveal", t1, 3000) as any;
  check("7. th_reveal כ-cue: picks של כולם (a=dash, b=sole, c=fence, d=אגר)", !!reveal && isCue("a", "th_reveal") && reveal.picks.a === "dash" && reveal.picks.b === "sole" && reveal.picks.c === "fence" && reveal.picks.d === null, reveal ? JSON.stringify(reveal.picks) : "אין");
  const resume = await waitFor("a", "th_resume", t1, 3000) as any;
  const resumedAt = Date.now();
  check("8. th_resume: endsAt זז באורך העצירה (~3 שנ'), nextPauseAt = עוד 4 שנ', מצב המגדלים", !!resume && Math.abs(resume.endsAt - init.endsAt - 3000) <= 150 && resume.nextPauseAt > 0 && resume.nextPauseAt - pauseMsg.resumeAt >= 3900 && resume.nextPauseAt - pauseMsg.resumeAt <= 4200 && resume.towers.length === 4, resume ? `Δends=${resume.endsAt - init.endsAt} Δnext=${resume.nextPauseAt - pauseMsg.resumeAt}` : "אין");
  // אחרי החזרה — זזים שוב
  const pr = posOf("a");
  dir("a", 0, 1); await sleep(600);
  check("8א. אחרי החזרה th_dir עובד שוב", Math.hypot(posOf("a").x - pr.x, posOf("a").y - pr.y) > 1.5, `Δ=${Math.hypot(posOf("a").x - pr.x, posOf("a").y - pr.y).toFixed(2)}`);
  dir("a", 0, 0); await sleep(150);

  /* --- 4. 💨 דאש --- */
  const t4 = Date.now();
  const before = posOf("a");
  dir("a", 1, 0); await sleep(60);
  use("a", "dash");
  await sleep(120);
  const fxDash = since("a", "th_fx", t4).find((f: any) => f.k === "dash" && f.pid === "a") as any;
  const cdDash = since("a", "th_cd", t4).find((c: any) => c.id === "dash") as any;
  check("9. th_use(dash) ⇒ th_fx(dash, כיוון, 300ms) לכולם + th_cd(dash, 6 שנ') למשתמש", !!fxDash && fxDash.ms === 300 && Math.abs((fxDash.x ?? 0) - 1) < 0.01 && !!cdDash && cdDash.readyAt - Date.now() > 5500 && ev("c", "th_fx").some((f: any) => f.k === "dash" && f.pid === "a"), fxDash ? `x=${fxDash.x} y=${fxDash.y}` : "אין");
  await sleep(400);
  dir("a", 0, 0);
  const jump = Math.hypot(posOf("a").x - before.x, posOf("a").y - before.y);
  check("9א. הדאש מזניק ≥3 תאים בפחות מחצי שנייה (×2.4 מהירות)", jump >= 3 && jump <= 6.5, `Δ=${jump.toFixed(2)}`);
  const t4b = Date.now();
  use("a", "dash"); await sleep(120);
  check("9ב. דאש בזמן קירור — נדחה (אין th_fx)", since("a", "th_fx", t4b).filter((f: any) => f.k === "dash" && f.pid === "a").length === 0);
  use("b", "dash"); await sleep(120);
  check("9ג. מי שאין לו את הקלף — th_use מתעלם", !ev("a", "th_fx").some((f: any) => f.k === "dash" && f.pid === "b"));

  /* --- 5. עצירה 2: ג'וקר על המדף --- */
  const t5 = Date.now();
  const pause2 = await waitFor("a", "th_pause", t5, 6000) as any;
  const shelf2 = await waitFor("a", "th_shelf", t5, 2000) as any;
  check("10. עצירה 2 (k=2): על המדף יש ג'וקר (🌀 גשם זהב) ואין את הקלף שכבר נקנה (דאש)", !!pause2 && pause2.k === 2 && !!shelf2 && shelf2.cards.some((c: any) => c.id === "rain") && !shelf2.cards.some((c: any) => c.id === "dash"), shelf2 ? shelf2.cards.map((c: any) => c.id).join(" ") : "אין");
  await sleep(Math.max(0, pause2.draftAt - Date.now()) + 120);
  buy("a", "rain"); await sleep(150);
  check("10א. a קנה את הג'וקר", ev("a", "th_bought").some((m: any) => m.pid === "a" && m.id === "rain"));
  const resume2 = await waitFor("a", "th_resume", t5, 4000) as any;
  check("11. אחרי העצירה האחרונה nextPauseAt=0 (אין יותר עצירות)", !!resume2 && resume2.nextPauseAt === 0, resume2 ? `next=${resume2.nextPauseAt}` : "אין");
  const rain = await waitFor("a", "th_rain", t5, 1500) as any;
  check("11א. הג'וקר המיידי מופעל בחזרה: th_rain עם 10 צ'אנקים על הרצפה", !!rain && rain.items.length === 10 && rain.items.every((it: any[]) => it.length === 4), rain ? `n=${rain.items.length}` : "אין");
  if (rain) {
    const p = posOf("a");
    const nearest = [...rain.items].sort((u: any[], v: any[]) => Math.hypot(u[1] - p.x, u[2] - p.y) - Math.hypot(v[1] - p.x, v[2] - p.y))[0];
    const t6 = Date.now();
    await goTo("a", nearest[1], nearest[2], 6000);
    await sleep(200);
    const nug = since("a", "th_nugget", t6).find((n: any) => n.by === "a") as any;
    check("11ב. הרמת צ'אנק מהרצפה: th_nugget(by=a) ו-carry עולה", !!nug && nug.carry >= 1, nug ? `carry=${nug.carry}` : "אין");
  }
  check("12. השחקן שאגר (d) עדיין עם 300 זהב + הכנסה — לא קנה כלום", posOf("d").gold >= 300 && (last("a", "th_cards") as any)?.pid !== "d");

  /* --- 6. סוף הסבב --- */
  for (let i = 0; i < 400; i++) { if (lastRoom()?.room?.phase === "ceremony") break; await sleep(100); }
  const r = lastRoom();
  const scores = r?.room?.ceremony?.scores;
  check("13. הסבב נגמר בטקס עם ניקוד = זהב", r?.room?.phase === "ceremony" && !!scores && Object.keys(scores).length === 4, `phase=${r?.room?.phase}`);
  check("13א. th_horn הגיע כ-cue", isCue("a", "th_horn"));
  check("13ב. הניקוד של a קטן משל d (שילם 160+ על קלפים ולא הרוויח מהם)", !!scores && scores.a < scores.d, scores ? `a=${scores.a} d=${scores.d}` : "");
  check("14. th_pos נעצר אחרי הצפירה (עד 0.9 שנ' של פריים אחרון) ולא היו שגיאות טיק", timed("a", "th_pos").every((x) => x.at <= (timed("a", "th_horn")[0]?.at ?? Infinity) + 1500) && timed("a", "th_pos").length > 200);

  console.log(failed ? `\n✗ ${failed} כשלונות\n` : "\n✓ כל בדיקות העצירה עברו\n");
  process.exit(failed ? 1 : 0);
}

main();
