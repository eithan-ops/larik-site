/**
 * הגנבים 🥷 — שכבה 2/א: המגדל וסולם הנגדים. מריצים: npx tsx test/thieves-tower.test.ts
 *
 *  1. פולש שרץ ישר למאורה מוגנת ⇒ th_shot + th_hit, ודגל האטה ב-th_pos.
 *  2. חימום: 8 יריות רצופות ⇒ th_tower(hot) ואז ≥3.9 שניות בלי יריות ⇒ th_tower(ok).
 *  3. זיגזג בטווח ⇒ החלוקים מפספסים (הנגד החינמי).
 *  4. השבתה: ערוץ 1.5ש' ⇒ th_act_done(250) + th_tower(off), הזהב יורד, ואין יריות בזמן הכיבוי.
 *  5. מגע של הבעלים קוטע ערוץ (th_channel_end touched).
 *  6. הריסה תחת אש: יריות לא קוטעות ⇒ th_tower(ruin); בנייה מחדש בבית ⇒ build ⇒ ok, בחינם למגדל בסיסי.
 *  7. th_nope: tower (אין על מה לפעול) · gold (אין 250) · far (רחוק מכל מגדל זר).
 */
import { Room, Transport } from "../src/engine";
import { createThieves } from "../src/games/thieves";
import type { ServerMsg } from "../../shared/protocol";

let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : ""));
  if (!cond) failed++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeTransport() {
  const inbox = new Map<string, ServerMsg[]>();
  const times: { pid: string; d: any; at: number }[] = [];
  const transport: Transport = {
    send(pid, msg) {
      if (!inbox.has(pid)) inbox.set(pid, []); inbox.get(pid)!.push(msg);
      const d = (msg as any).d; if (d?.a && (msg as any).t !== "room") times.push({ pid, d, at: Date.now() });
    },
  };
  const ev = (pid: string, a: string) => (inbox.get(pid) ?? []).filter((m: any) => (m.t === "game" || m.t === "cue") && m.d?.a === a).map((m: any) => m.d);
  const last = (pid: string, a: string) => ev(pid, a).at(-1);
  const since = (pid: string, a: string, t: number) => times.filter((x) => x.pid === pid && x.d.a === a && x.at >= t).map((x) => x.d);
  const timed = (pid: string, a: string) => times.filter((x) => x.pid === pid && x.d.a === a);
  return { transport, ev, last, since, timed };
}

async function main() {
  console.log("\n— הגנבים 🥷 שכבה 2/א: המגדל (4 בוטים) —");
  const { transport, ev, last, since, timed } = makeTransport();
  const room = new Room("TOWR", transport, { thieves: createThieves });
  const P = ["a", "b", "c", "d"];
  P.forEach((p, i) => room.join(p, "גנב" + i, "🥷"));
  // כולם מתחילים עם 900 זהב (השבתה 250 · הריסה 750 — ואז אין ל-d 250 להשבתה נוספת). הר זעיר, סבב של 100 שניות.
  room.onMessage("a", { t: "select_game", gameId: "thieves", config: { roundMs: 100_000, mtnPer: 2, startGold: 900 } });
  room.onMessage("a", { t: "start_game" });
  const init = last("a", "th_init") as any;
  const dens = new Map<string, { x: number; y: number; back: number }>((init.dens as [string, number, number, number][]).map(([p, x, y, back]) => [p, { x, y, back }]));
  const A = dens.get("a")!;
  check("0. th_init: מגדל (רדיוס, קשת, מחירים) וזווית הגב", init.tower?.r > 0 && init.tower.arc > 0 && init.tower.disable === 250 && init.tower.destroy === 750 && typeof A.back === "number", `r=${init.tower?.r} back(a)=${A.back}`);
  const R = init.tower.r as number;

  const posOf = (pid: string) => { const pos = last(pid, "th_pos") as any; const row = pos?.ps?.find((r: any[]) => r[0] === pid); return row ? { x: row[1], y: row[2], gold: row[5], slow: row[9] } : { x: dens.get(pid)!.x, y: dens.get(pid)!.y, gold: 0, slow: 0 }; };
  const dir = (pid: string, dx: number, dy: number) => room.onMessage(pid, { t: "game", d: { a: "th_dir", dx, dy } as any });
  const steer = (pid: string, tx: number, ty: number) => { const p = posOf(pid); const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1; if (d < 0.35) { dir(pid, 0, 0); return 0; } dir(pid, dx / d, dy / d); return d; };
  const goTo = async (pid: string, tx: number, ty: number, maxMs = 9000) => { for (let i = 0; i < maxMs / 100; i++) { if (steer(pid, tx, ty) === 0) return true; await sleep(100); } return false; };
  const act = (pid: string, kind: string) => room.onMessage(pid, { t: "game", d: { a: "th_act", kind } as any });
  const towerSt = (den: string) => (ev("a", "th_tower").filter((m: any) => m.den === den).at(-1) as any)?.st ?? "ok";
  const waitTower = async (den: string, st: string, maxMs: number) => { for (let i = 0; i < maxMs / 100; i++) { if (towerSt(den) === st) return true; await sleep(100); } return false; };

  await sleep(1700);   // "צאו!"

  /* --- 1. פולש ישר: c רץ מ-[41,5] אל המאורה של a ב-[5,5] לאורך y=5 — מולו, לא בשטח המת --- */
  const t1 = Date.now();
  const spot = { x: A.x + 4, y: A.y };       // 4 תאים מהמאורה — בטווח, לא בגב
  await goTo("c", A.x + 0.4, A.y, 12_000);   // רץ ישר עד מרכז המאורה — כמו פולש אמיתי
  await sleep(900);
  const shotsAtC = since("a", "th_shot", t1).filter((s: any) => s.den === "a" && s.tgt === "c");
  const hitsC = since("a", "th_hit", t1).filter((h: any) => h.den === "a" && h.pid === "c");
  check("1. המגדל יורה על פולש שנכנס לטווח (th_shot)", shotsAtC.length >= 1, `יריות=${shotsAtC.length}`);
  check("1א. th_shot נושא מוצא, יעד וזמן מעוף", shotsAtC.every((s: any) => typeof s.x0 === "number" && typeof s.x1 === "number" && s.ms >= 120 && s.ms <= 650));
  check("2. פולש שרץ ישר נפגע (th_hit) — האטה והדף", hitsC.length >= 1, `פגיעות=${hitsC.length} מתוך ${shotsAtC.length}`);
  {
    // דגל ההאטה ב-th_pos (השדה העשירי) הופיע אצל c אחרי הפגיעה
    const slowed = timed("a", "th_pos").some((x) => x.at >= t1 && x.d.ps.some((r: any[]) => r[0] === "c" && r[9] === 1));
    check("2א. th_pos מסמן את המואט (שדה 10)", slowed);
  }

  /* --- 2. חימום: c נשאר בטווח (חוזר לנקודה אחרי כל הדף) עד 8 יריות --- */
  const t2 = Date.now();
  let hot = false;
  for (let i = 0; i < 160; i++) { steer("c", spot.x, spot.y); if (towerSt("a") === "hot") { hot = true; break; } await sleep(100); }
  dir("c", 0, 0);
  const shotsHeat = since("a", "th_shot", t2).filter((s: any) => s.den === "a").length;
  check("3. חימום — אחרי 8 יריות המגדל נכנס לקירור (th_tower hot)", hot, `יריות מאז=${shotsHeat}`);
  const hotAt = Date.now();
  const okAgain = await waitTower("a", "ok", 6000);
  const shotsDuringCool = since("a", "th_shot", hotAt).filter((s: any) => s.den === "a" && s.at === undefined);
  const gapOk = (() => { const ss = timed("a", "th_shot").filter((x) => x.d.den === "a" && x.at >= hotAt - 50); const first = ss[0]?.at; return first === undefined || first - hotAt >= 3900; })();
  check("3א. בקירור אין יריות ≥3.9 שניות, ואז המגדל חוזר לפעול (ok)", okAgain && gapOk, `ok=${okAgain} shots=${shotsDuringCool.length}`);
  // c יוצא מהטווח
  await goTo("c", A.x + R + 4, A.y, 4000);

  /* --- 3. זיגזג: d עומד בטווח מלמטה ומחליף כיוון כל 150ms — החלוקים אמורים לפספס --- */
  await goTo("d", A.x, A.y + 4.2, 12_000);
  const t3 = Date.now();
  for (let i = 0; i < 26; i++) { dir("d", i % 2 ? 1 : -1, 0); await sleep(150); }
  dir("d", 0, 0);
  await sleep(700);
  const shotsZ = since("a", "th_shot", t3).filter((s: any) => s.den === "a" && s.tgt === "d").length;
  const hitsZ = since("a", "th_hit", t3).filter((h: any) => h.den === "a" && h.pid === "d").length;
  check("4. זיגזג בטווח — רוב החלוקים מפספסים (ניבוי קדימה = הנגד החינמי)", shotsZ >= 2 && hitsZ <= Math.floor(shotsZ / 2), `יריות=${shotsZ} פגיעות=${hitsZ}`);

  /* --- 4. השבתה: c חוזר לטווח הפעולה, עומד, ומשבית --- */
  await waitTower("a", "ok", 6000);
  await goTo("c", A.x + 2.4, A.y, 8000);
  dir("c", 0, 0);
  const goldBefore = posOf("c").gold;
  const t4 = Date.now();
  act("c", "disable");
  await sleep(150);
  const ch = last("a", "th_channel") as any;
  check("5. th_act(disable) פותח ערוץ פומבי (th_channel) עם מחיר וזמן", !!ch && ch.by === "c" && ch.den === "a" && ch.kind === "disable" && ch.cost === 250 && ch.ms === 1500);
  await sleep(1700);
  const done = since("a", "th_act_done", t4).find((m: any) => m.kind === "disable");
  check("5א. הערוץ הושלם: th_act_done(disable, 250) + th_tower(off)", !!done && done.by === "c" && done.cost === 250 && towerSt("a") === "off", `st=${towerSt("a")}`);
  check("5ב. הזהב של c ירד ב-250 (החיוב מהניקוד)", posOf("c").gold <= goldBefore - 245 && posOf("c").gold >= goldBefore - 260, `${goldBefore} → ${posOf("c").gold}`);
  {
    const offAt = Date.now();
    for (let i = 0; i < 30; i++) { steer("c", A.x + 3.5, A.y); await sleep(100); }   // c מסתובב בטווח 3 שניות
    dir("c", 0, 0);
    const shotsOff = since("a", "th_shot", offAt).filter((s: any) => s.den === "a").length;
    check("5ג. מגדל כבוי לא יורה (3 שניות בטווח, אפס יריות)", shotsOff === 0, `יריות=${shotsOff}`);
  }
  // c יוצא מהטווח כדי לא להפריע
  await goTo("c", A.x + R + 4, A.y, 5000);

  /* --- 5. מגע קוטע: d פותח ערוץ הריסה, a (הבעלים) רץ ונוגע בו --- */
  await goTo("d", A.x, A.y + 2.4, 6000);
  dir("d", 0, 0);
  await sleep(200);
  const t5 = Date.now();
  act("d", "destroy");
  await sleep(150);
  const ch2 = since("a", "th_channel", t5).find((m: any) => m.by === "d" && m.kind === "destroy");
  check("6. ערוץ הריסה נפתח (3 שניות, 750)", !!ch2 && ch2.ms === 3000 && ch2.cost === 750);
  for (let i = 0; i < 25; i++) { steer("a", posOf("d").x, posOf("d").y); if (since("a", "th_channel_end", t5).length) break; await sleep(100); }
  dir("a", 0, 0);
  const end2 = since("a", "th_channel_end", t5).find((m: any) => m.by === "d") as any;
  check("6א. מגע של הבעלים קוטע את הערוץ (th_channel_end touched, who=a)", !!end2 && end2.ok === false && end2.why === "touched" && end2.who === "a", end2 ? JSON.stringify(end2) : "אין");
  check("6ב. ערוץ שנקטע לא חויב", posOf("d").gold >= 895, `gold(d)=${posOf("d").gold}`);
  await goTo("a", A.x, A.y, 4000);

  /* --- 6. הריסה תחת אש: מחכים שהמגדל יחזור מכיבוי, d מנסה שוב — המגדל יורה עליו, הערוץ נמשך --- */
  const backOn = await waitTower("a", "ok", 16_000);
  check("7. אחרי 15 שניות המגדל הכבוי חוזר לפעול (th_tower ok)", backOn, `st=${towerSt("a")}`);
  await goTo("d", A.x, A.y + 2.4, 6000);
  dir("d", 0, 0);
  await sleep(150);
  const t6 = Date.now();
  act("d", "destroy");
  await sleep(3400);
  const shotsUnder = since("a", "th_shot", t6).filter((s: any) => s.den === "a" && s.tgt === "d").length;
  const ruined = towerSt("a") === "ruin";
  const done2 = since("a", "th_act_done", t6).find((m: any) => m.kind === "destroy") as any;
  check("7א. הריסה תחת אש: המגדל ירה בזמן הערוץ אבל הערוץ הושלם (th_tower ruin)", shotsUnder >= 1 && ruined && !!done2 && done2.cost === 750, `יריות=${shotsUnder} st=${towerSt("a")}`);
  check("7ב. הזהב של d ירד ב-750", posOf("d").gold <= 160 && posOf("d").gold >= 140, `gold(d)=${posOf("d").gold}`);
  // נגד על חורבה — אין על מה לפעול (d נדחף אחורה מהפגיעות — חוזר לטווח הפעולה)
  await goTo("d", A.x, A.y + 2.2, 4000); dir("d", 0, 0); await sleep(120);
  act("c", "disable"); await sleep(120);
  act("d", "disable"); await sleep(120);
  check("8. th_nope(tower) — השבתה של חורבה", (last("d", "th_nope") as any)?.why === "tower" || (last("c", "th_nope") as any)?.why === "tower");
  // בנייה מחדש — הבעלים בבית, לחיצה אחת, חינם למגדל בסיסי, 3 שניות
  const goldA = posOf("a").gold;
  const t7 = Date.now();
  act("a", "rebuild");
  await sleep(150);
  check("9. בנייה מחדש: th_tower(build) + th_act_done(rebuild, 0)", towerSt("a") === "build" && (since("a", "th_act_done", t7).find((m: any) => m.kind === "rebuild") as any)?.cost === 0, `st=${towerSt("a")}`);
  const rebuilt = await waitTower("a", "ok", 4500);
  check("9א. אחרי 3 שניות המגדל פעיל שוב, והזהב של הבעלים לא ירד", rebuilt && posOf("a").gold >= goldA, `gold(a) ${goldA} → ${posOf("a").gold}`);
  // אין 250 להשבתה
  await goTo("d", A.x, A.y + 2.2, 4000); dir("d", 0, 0); await sleep(120);
  act("d", "disable"); await sleep(150);
  check("10. th_nope(gold) — ל-d אין 250", (last("d", "th_nope") as any)?.why === "gold", `gold(d)=${posOf("d").gold}`);
  // רחוק מכל מגדל זר
  act("a", "disable"); await sleep(150);
  check("11. th_nope(far) — הבעלים בבית, אין מגדל זר בטווח פעולה", (last("a", "th_nope") as any)?.why === "far");
  // הגנב עם שלל לא יכול לפתוח ערוץ — נבדק דרך busy: c פותח ערוץ ואז מנסה עוד אחד
  await goTo("c", A.x + 2.4, A.y, 8000); dir("c", 0, 0); await sleep(150);
  act("c", "disable"); await sleep(120); act("c", "disable"); await sleep(120);
  check("12. th_nope(busy) — ערוץ באמצע ערוץ", (last("c", "th_nope") as any)?.why === "busy");
  await sleep(1600);
  check("12א. ערוץ שני של c הושלם — המגדל כבוי שוב, ול-c נשארו 400", towerSt("a") === "off" && posOf("c").gold >= 395 && posOf("c").gold <= 410, `gold(c)=${posOf("c").gold} st=${towerSt("a")}`);
  // הבעלים מנסה לבנות מחדש מגדל שלא נהרס
  act("a", "rebuild"); await sleep(120);
  check("13. th_nope(tower) — בנייה מחדש של מגדל שעומד", (last("a", "th_nope") as any)?.why === "tower");
  check("14. הסבב עדיין רץ ולא היו שגיאות טיק", ev("a", "th_pos").length > 100);

  console.log(failed ? `\n✗ ${failed} כשלונות\n` : "\n✓ כל בדיקות המגדל עברו\n");
  process.exit(failed ? 1 : 0);
}

main();
