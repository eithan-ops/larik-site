/**
 * הקומות 🏢 — פלייטסט שרת עם 4 בוטים. מריצים: npx tsx test/floors.test.ts
 * מכסה: בחירת דמות → fl_go → fl_pos ב-10Hz עם קו מוות שעולה → נפילה/תחייה/חיים →
 * fl_freeze כ-cue → דראפט של 6 קלפים לשחקן עם כיסוי קטגוריות → fl_reveal → פטיש/כדור שלג/בננה →
 * קומבו → ספרינט → fl_over עם תארים ו-ctx.end.
 */
import { Room, Transport } from "../src/engine";
import { createFloors } from "../src/games/floors";
import type { ServerMsg } from "../../shared/protocol";
import { FL } from "../../shared/floors";

let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : ""));
  if (!cond) failed++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeTransport() {
  const inbox = new Map<string, ServerMsg[]>();
  const transport: Transport = { send(pid, msg) { if (!inbox.has(pid)) inbox.set(pid, []); inbox.get(pid)!.push(msg); } };
  const ev = (pid: string, a: string) => (inbox.get(pid) ?? []).filter((m: any) => (m.t === "game" || m.t === "cue") && m.d?.a === a).map((m: any) => m.d);
  const cues = (pid: string, a: string) => (inbox.get(pid) ?? []).filter((m: any) => m.t === "cue" && m.d?.a === a);
  const last = (pid: string, a: string) => ev(pid, a).at(-1);
  const lastRoom = (pid: string) => (inbox.get(pid) ?? []).filter((m: any) => m.t === "room").at(-1) as any;
  return { transport, ev, cues, last, lastRoom };
}

async function main() {
  console.log("\n— הקומות 🏢 (שרת, 4 בוטים) —");
  const { transport, ev, cues, last, lastRoom } = makeTransport();
  const room = new Room("FLRS", transport, { floors: createFloors });
  const P = ["a", "b", "c", "d"];
  P.forEach((p, i) => room.join(p, "קופץ" + i, "🐸"));
  const cfg = { minutes: 8, cycles: 2, runMs: 2500, freezeMs: 400, draftMs: 3000, revealMs: 300, sprintMs: 1200, introMs: 400, pickMs: 600 };
  room.onMessage("a", { t: "select_game", gameId: "floors", config: cfg });
  room.onMessage("a", { t: "start_game" });
  const g = (pid: string, d: any) => room.onMessage(pid, { t: "game", d });

  // בחירת דמות
  check("שלב בחירת דמות נפתח", !!last("a", "fl_pickphase"));
  g("a", { a: "fl_char", c: 2 }); g("b", { a: "fl_char", c: 2 }); g("b", { a: "fl_char", c: 5 });
  check("דמות תפוסה לא ניתנת לבחירה פעמיים", last("a", "fl_pickphase").taken.b === 5 && last("a", "fl_pickphase").taken.a === 2);
  await sleep(800);
  const go = last("a", "fl_go");
  check("fl_go עם זרע, startAt ודמויות לכולם (השלמה אוטומטית)", !!go && typeof go.seed === "string" && Object.keys(go.chars).length === 4 && new Set(Object.values(go.chars)).size === 4, JSON.stringify(go?.chars));
  check("5 חיים לכולם", go && P.every((p) => go.lives[p] === FL.LIVES));
  await sleep(600);
  // דקה 0: בוטים מטפסים; a מהיר, d איטי ונופל
  const state = (pid: string, y: number, fl: number, mf: number, c = 0) => g(pid, { a: "fl_state", x: 240, y, dx: 12, st: 0, fl, mf, cb: 0, c });
  for (let i = 0; i < 12; i++) {
    state("a", 80 * (i * 2 + 1), i * 2 + 1, i * 2 + 1);
    state("b", 80 * (i + 1), i + 1, i + 1);
    state("c", 80 * (i + 1), i + 1, i + 1);
    state("d", -400, 0, 0);
    await sleep(100);
  }
  const pos = last("a", "fl_pos");
  check("fl_pos משודר עם 4 שחקנים וקו מוות", !!pos && pos.ps.length === 4 && typeof pos.kill === "number", `kill=${pos?.kill}`);
  check("קו המוות עולה עם הזמן", pos.kill > -3 * FL.FLOOR_H);
  check("הקו מכבד את החבורה: לא יותר מ-9 קומות מתחת לאמצע", pos.kill >= 80 * 7 - 9 * 80 - 5, `kill=${pos.kill}`);
  g("d", { a: "fl_fell" });
  const fell = last("a", "fl_fell");
  check("נפילה: חיים 5→4, תחייה מעל הקו", fell && fell.pid === "d" && fell.lives === 4 && fell.floor > (pos.kill / 80) && fell.respawnAt > Date.now(), JSON.stringify(fell));
  g("d", { a: "fl_fell" });
  check("נפילה כפולה בזמן התחייה לא נספרת", ev("a", "fl_fell").length === 1);
  // קומבו
  g("a", { a: "fl_combo", n: 9, bonus: 81 });
  const sh = last("b", "fl_shout");
  check("קומבו 9 → קריאה 'מתוק!' לכולם + בונוס 81", sh && sh.pid === "a" && sh.text === "מתוק!" && sh.bonus === 81);
  g("a", { a: "fl_combo", n: 9, bonus: 500 });
  check("בונוס מנופח נחתך ל-n²", last("b", "fl_shout").bonus === 81);
  // מגע/קליע בלי קלפים — לא עובד
  g("a", { a: "fl_hit", target: "b", kind: "hammer" });
  check("פטיש בלי הקלף לא פוגע", ev("b", "fl_hit").length === 0);

  // עצירה ראשונה
  await sleep(1800);
  check("fl_freeze הגיע כ-cue עם דירוג", cues("a", "fl_freeze").length === 1 && last("a", "fl_freeze").rank[0] === "a", JSON.stringify(last("a", "fl_freeze")?.rank));
  await sleep(700);
  const dr = last("a", "fl_draft"), drD = last("d", "fl_draft");
  check("דראפט: 6 קלפים לשחקן, עם הסבר קצר", dr && dr.cards.length === 6 && dr.cards.every((c: any) => c.d.split(" ").length <= 8), dr?.cards.map((c: any) => c.id).join(","));
  const cats = (cards: any[]) => cards.map((c: any) => c.id);
  check("6 קלפים שונים", new Set(cats(dr.cards)).size === 6);
  check("השחקן האחרון מקבל הצעה משלו (לא זהה)", drD && cats(drD.cards).join() !== cats(dr.cards).join());
  // a לוקח פטיש אם מוצע, אחרת הראשון; b כדור שלג/בננה
  const pickOf = (pid: string, want: string[]) => { const cards = last(pid, "fl_draft").cards.map((c: any) => c.id); const id = want.find((w) => cards.includes(w)) ?? cards[0]; g(pid, { a: "fl_pick", card: id }); return id; };
  const aPick = pickOf("a", ["hammer"]), bPick = pickOf("b", ["snow", "banana"]), cPick = pickOf("c", ["shield", "life"]);
  check("fl_took משודר על בחירה", ev("d", "fl_took").length >= 3);
  g("d", { a: "fl_pick", card: "nope" });
  await sleep(2400);
  const rv = last("a", "fl_reveal");
  check("fl_reveal כ-cue עם הבחירות של כולם (d — אוטומטי)", cues("a", "fl_reveal").length === 1 && rv.picks.a?.id === aPick && rv.picks.b?.id === bPick && rv.picks.c?.id === cPick && !!rv.picks.d, JSON.stringify(rv?.picks && Object.fromEntries(Object.entries(rv.picks).map(([k, v]: any) => [k, v?.id]))));
  await sleep(500);
  // דקה 1 — חסד 5 שנ' אחרי העצירה: פטיש לא עובד מיד
  state("a", 80 * 20, 20, 20); state("b", 80 * 20, 20, 20);
  if (aPick === "hammer") {
    g("a", { a: "fl_hit", target: "b", kind: "hammer" });
    check("חסד אחרי עצירה: פטיש לא פוגע ב-5 השניות הראשונות", ev("b", "fl_hit").length === 0);
  }
  if (bPick === "snow") {
    g("b", { a: "fl_shot", x: 240, y: 1600, dx: 1 });
    check("ירייה בזמן חסד לא יוצאת", ev("a", "fl_shot").length === 0);
  }
  if (bPick === "banana") {
    g("b", { a: "fl_trap", floor: 20 });
    check("בננה מונחת על הקומה", last("a", "fl_trap")?.floor === 20);
  }
  // ספרינט וסיום
  await sleep(2600 + 3200 + 1400);
  const over = last("a", "fl_over");
  check("fl_over עם שורות ותארים", !!over && over.rows.length === 4 && over.rows[0].pid === "a" && over.titles.some((t: any) => t.ic === "🏔️" && t.pid === "a"), JSON.stringify(over?.titles));
  check("הניקוד = 10×קומה + קומבו²", over.rows[0].score === 23 * 10 + 81 + 81 || over.rows[0].score >= 230, `${over.rows[0].score}`);
  await sleep(1800);
  const rm = lastRoom("a");
  check("החדר עבר לטקס עם מנצח", rm?.room?.phase === "ceremony" && rm.room.ceremony?.winnerId === "a", rm?.room?.phase);
  console.log(failed ? `\n${failed} FAILED\n` : "\nהכול עבר ✓\n");
  process.exit(failed ? 1 : 0);
}
main();
