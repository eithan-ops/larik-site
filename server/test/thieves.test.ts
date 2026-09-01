/**
 * הגנבים 🥷 — פלייטסט גרייבוקס עם 4 בוטים. מריצים: npx tsx test/thieves.test.ts
 *
 * מכסה את כל לולאת הליבה:
 *  1. חציבה מההר → הפקדה במאורה → הבשלה (lvl 0→1→2) → הכנסה כל שנייה.
 *  2. גניבה ממאורה של חבר: יורדת דרגה, נשלחת th_grab + th_first + th_rage.
 *  3. מרדף: מגע מפיל (th_tackle+th_drop), צד שלישי מרים (th_pick), הגעה הביתה (th_home) → הזהב עובר.
 *  4. ההר נגמר (th_empty), האזעקה בדקה האחרונה (th_alarm ×3), וסיום עם ניקוד = זהב.
 */
import { Room, Transport } from "../src/engine";
import { createThieves, TH_W, TH_H } from "../src/games/thieves";
import type { ServerMsg } from "../../shared/protocol";

let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : ""));
  if (!cond) failed++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeTransport() {
  const inbox = new Map<string, ServerMsg[]>();
  const transport: Transport = {
    send(pid, msg) { if (!inbox.has(pid)) inbox.set(pid, []); inbox.get(pid)!.push(msg); },
  };
  const ev = (pid: string, a: string) =>
    (inbox.get(pid) ?? []).filter((m: any) => (m.t === "game" || m.t === "cue") && m.d?.a === a).map((m: any) => m.d);
  const last = (pid: string, a: string) => ev(pid, a).at(-1);
  return { transport, ev, last };
}

async function main() {
  console.log("\n— הגנבים 🥷 (גרייבוקס, 4 בוטים) —");
  const { transport, ev, last } = makeTransport();
  const room = new Room("THEV", transport, { thieves: createThieves });
  const P = ["a", "b", "c", "d"];
  P.forEach((p, i) => room.join(p, "גנב" + i, "🥷"));

  // סבב לבדיקה: הבשלה מהירה, הר קטן. ‎70 שנ' כדי שהאזעקה (דקה אחרונה) תיכנס אחרי מרווח סביר.
  room.onMessage("a", { t: "select_game", gameId: "thieves", config: { roundMs: 70000, ripen1Ms: 500, ripen2Ms: 1200, mtnPer: 5 } });
  room.onMessage("a", { t: "start_game" });

  const init = last("a", "th_init") as any;
  check("th_init נשלח עם הר ומאורות", !!init && init.dens.length === 4, init ? `dens=${init.dens.length}` : "none");
  const dens = new Map<string, { x: number; y: number }>((init.dens as [string, number, number][]).map(([p, x, y]) => [p, { x, y }]));
  const mtn = init.mtn as { x: number; y: number; total: number };

  // בוט: לך אל יעד, ושלח th_dir כשהכיוון משתנה מהותית. אנחנו מזיזים "ידנית" בשרת
  // דרך הודעות — אין לנו את מצב השרת, אז נשלח כיוון וניתן לטיקים לרוץ.
  const steer = (pid: string, tx: number, ty: number) => {
    // נדרוש את מיקום הבוט מ-th_pos האחרון
    const pos = (last(pid, "th_pos") as any);
    let x = dens.get(pid)!.x, y = dens.get(pid)!.y;
    if (pos) { const row = pos.ps.find((r: any[]) => r[0] === pid); if (row) { x = row[1]; y = row[2]; } }
    const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1;
    room.onMessage(pid, { t: "game", d: { a: "th_dir", dx: dx / d, dy: dy / d } as any });
    return d;
  };

  // --- שלב 1: כולם חוצבים מההר, ואז חוזרים הביתה להפקיד ---
  // הנסיעה מהפינה למרכז היא ~20 תאים ב-6/שנ' — צריך ~4 שניות
  for (let i = 0; i < 50; i++) { P.forEach((p) => steer(p, mtn.x, mtn.y)); await sleep(100); }
  const mined = P.some((p) => ev(p, "th_mine").length > 0);
  check("1. חציבה מההר עובדת", mined, `נחצבו: ${P.map((p) => ev(p, "th_mine").length).join(",")}`);

  // חוזרים הביתה להפקיד
  for (let i = 0; i < 50; i++) { P.forEach((p) => steer(p, dens.get(p)!.x, dens.get(p)!.y)); await sleep(100); }
  const deposited = P.filter((p) => ev(p, "th_dep").length > 0);
  check("2. הפקדה במאורה יוצרת גבישים", deposited.length >= 2, `הפקידו: ${deposited.length}/4`);

  // --- שלב 2: הבשלה + הכנסה ---
  await sleep(1400);
  const ripens = P.flatMap((p) => ev(p, "th_ripen"));
  check("3. גבישים מבשילים (lvl עולה)", ripens.some((r: any) => r.lvl === 1), `הבשלות: ${ripens.length}`);
  check("4. הבשלה מלאה ל-lvl 2 קיימת", ripens.some((r: any) => r.lvl === 2), `lvl2: ${ripens.filter((r: any) => r.lvl === 2).length}`);
  const goldNow = (last("a", "th_pos") as any)?.ps ?? [];
  check("5. זהב נצבר מהמאורות (הכנסה/שנייה)", goldNow.some((r: any[]) => r[5] > 0), `זהב: ${goldNow.map((r: any[]) => r[5]).join(",")}`);

  // --- שלב 3: גניבה + מרדף ---
  // הגנב = בעל-מאורה עם גביש; הקורבן = המאורה הכי קרובה אליו שיש בה גביש
  const depos = P.filter((p) => ev(p, "th_dep").length > 0);
  const robber = depos[0] ?? P[0];
  const rden = dens.get(robber)!;
  let victim = "", best = 1e9;
  for (const p of P) {
    if (p === robber || ev(p, "th_dep").length === 0) continue;
    const d = dens.get(p)!, dd = Math.hypot(d.x - rden.x, d.y - rden.y);
    if (dd < best) { best = dd; victim = p; }
  }
  if (!victim) victim = P.find((p) => p !== robber)!;
  const vden = dens.get(victim)!;
  // נסיעה אל מאורת הקורבן (עד ~5 שניות) ואז לחיצה על גניבה בכל טיק ליד המאורה
  for (let i = 0; i < 60; i++) {
    steer(robber, vden.x, vden.y);
    room.onMessage(robber, { t: "game", d: { a: "th_steal" } as any });
    if (ev(robber, "th_grab").some((g: any) => g.by === robber)) break;
    await sleep(100);
  }
  const grabbed = ev(robber, "th_grab").some((g: any) => g.by === robber);
  check("6. גניבה ממאורת חבר עובדת", grabbed, grabbed ? `${robber} גנב מ-${victim}` : "לא נגנב");
  check("7. th_first — הגניבה הראשונה משודרת", ev("a", "th_first").length === 1);
  check("8. th_rage — הנשדד מקבל זעם", ev(victim, "th_rage").length >= 1 || ev("a", "th_rage").length >= 1);

  if (grabbed) {
    // צד שלישי רודף ומפיל
    const chaser = P.find((p) => p !== victim && p !== robber)!;
    let tackled = false;
    for (let i = 0; i < 60; i++) {
      const rp = (last(robber, "th_pos") as any)?.ps?.find((r: any[]) => r[0] === robber);
      if (rp) steer(chaser, rp[1], rp[2]);
      // הגנב בורח הביתה
      steer(robber, dens.get(robber)!.x, dens.get(robber)!.y);
      if (ev("a", "th_tackle").length > 0) { tackled = true; break; }
      if (ev(robber, "th_home").length > 0) break;   // הספיק הביתה — עדיין ניצחון בדיקתי
      await sleep(100);
    }
    const homed = ev(robber, "th_home").length > 0;
    check("9. מרדף: או הפלה (th_tackle) או הגעה הביתה (th_home)", tackled || homed, tackled ? "הופל" : homed ? "הגיע הביתה" : "לא הוכרע");
    if (tackled) check("10. שלל שהופל יורד לרצפה (th_drop)", ev("a", "th_drop").length > 0);
  }

  // --- שלב 3ב: הפלה ודאית + הרמת צד-שלישי ---
  // גנב טרי חוטף, וחוסם אותו שחקן שעומד בדיוק בדרך — כדי לאמת th_tackle→th_drop→th_pick
  {
    // b גונב מ-a (שכנים: a=[5,5], c=[41,5] רחוק; ניקח את הקרוב ל-b)
    const bden = dens.get("b")!;
    let vic2 = "", bd2 = 1e9;
    for (const p of P) { if (p === "b" || ev(p, "th_dep").length === 0) continue; const dd = Math.hypot(dens.get(p)!.x - bden.x, dens.get(p)!.y - bden.y); if (dd < bd2) { bd2 = dd; vic2 = p; } }
    if (vic2) {
      const v2 = dens.get(vic2)!;
      let grabbed2 = false;
      for (let i = 0; i < 70; i++) {
        steer("b", v2.x, v2.y);
        room.onMessage("b", { t: "game", d: { a: "th_steal" } as any });
        if (ev("b", "th_grab").some((g: any) => g.by === "b")) { grabbed2 = true; break; }
        await sleep(100);
      }
      if (grabbed2) {
        // הרודף c נצמד ל-b עד הפלה; d ממתין להרים
        const tackBefore = ev("a", "th_tackle").length, pickBefore = ev("a", "th_pick").length;
        for (let i = 0; i < 90; i++) {
          const drop = last("a", "th_drop") as any;
          if (ev("a", "th_tackle").length > tackBefore && drop) {
            // הופל — עכשיו רצים אל השלל שעל הרצפה (מרדף של שלושה על חפץ אחד)
            steer("c", drop.x, drop.y); steer("d", drop.x, drop.y);
          } else {
            const rp = (last("b", "th_pos") as any)?.ps?.find((r: any[]) => r[0] === "b");
            if (rp) { steer("c", rp[1], rp[2]); steer("d", rp[1], rp[2]); }
          }
          steer("b", dens.get("b")!.x, dens.get("b")!.y);
          if (ev("a", "th_tackle").length > tackBefore && ev("a", "th_pick").length > pickBefore) break;
          await sleep(100);
        }
        check("9ב. מגע מפיל את הסוחב (th_tackle)", ev("a", "th_tackle").length > tackBefore);
        check("10. שלל שהופל נופל לרצפה (th_drop)", ev("a", "th_drop").length > 0);
        check("10ב. צד שלישי מרים מהרצפה (th_pick)", ev("a", "th_pick").length > pickBefore);
      }
    }
  }

  // --- שלב 4: ההר נגמר + אזעקה ---
  // מרוקנים את ההר: כולם חוצבים עד th_empty (צריך זמן נסיעה חזרה אל ההר)
  for (let i = 0; i < 70 && ev("a", "th_empty").length === 0; i++) { P.forEach((p) => steer(p, mtn.x, mtn.y)); await sleep(100); }
  check("11. ההר נגמר (th_empty)", ev("a", "th_empty").length >= 1);
  check("12. אזעקת דקה אחרונה (th_alarm)", ev("a", "th_alarm").length >= 1);

  // הכנסות ×3 באזעקה — הזהב ממשיך לעלות
  const goldAlarm = (last("a", "th_pos") as any)?.ps ?? [];
  check("13. זהב ממשיך להיצבר לאורך הריצה", goldAlarm.some((r: any[]) => r[5] > 0), `זהב סופי: ${goldAlarm.map((r: any[]) => r[5]).join(",")}`);

  console.log(failed ? `\n✗ ${failed} כשלונות\n` : "\n✓ כל הבדיקות עברו\n");
  process.exit(failed ? 1 : 0);
}

void TH_W; void TH_H;
main();
