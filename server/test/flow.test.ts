/**
 * בדיקת זרימה מלאה של המנוע + שני המשחקים, עם טרנספורט מדומה.
 * מריצים: npm test
 */
import { Room, Transport } from "../src/engine";
import { createForehead } from "../src/games/forehead";
import { createPods } from "../src/games/pods";
import type { ServerMsg } from "../../shared/protocol";

let failed = 0;
function check(name: string, cond: boolean) {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name);
  if (!cond) failed++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* טרנספורט מדומה: אוסף כל הודעה לכל שחקן */
function makeTransport() {
  const inbox = new Map<string, ServerMsg[]>();
  const transport: Transport = {
    send(pid, msg) {
      if (!inbox.has(pid)) inbox.set(pid, []);
      inbox.get(pid)!.push(msg);
    },
  };
  const last = (pid: string, t: string) =>
    [...(inbox.get(pid) ?? [])].reverse().find((m) => m.t === t) as any;
  const allGame = (pid: string, a: string) =>
    (inbox.get(pid) ?? []).filter((m: any) => (m.t === "game" || m.t === "cue") && m.d?.a === a) as any[];
  return { transport, inbox, last, allGame };
}

async function testForehead() {
  console.log("\n— על המצח —");
  const { transport, last, allGame } = makeTransport();
  const room = new Room("TEST", transport, { forehead: createForehead });
  const P = ["p1", "p2", "p3"];
  P.forEach((p, i) => room.join(p, "שחקן" + i, "🙂"));

  room.onMessage("p1", { t: "select_game", gameId: "forehead", config: { deck: "animals" } });
  room.onMessage("p1", { t: "start_game" });

  check("כולם קיבלו קלף", P.every((p) => allGame(p, "fh_deal").length === 1));
  const cards = Object.fromEntries(P.map((p) => [p, allGame(p, "fh_deal")[0].d.card]));

  // כולם מניחים על המצח
  P.forEach((p) => room.onMessage(p, { t: "game", d: { a: "fh_placed" } }));
  const begin = allGame("p1", "fh_begin")[0];
  check("fh_begin נשלח כ-cue עם זמן עתידי", begin?.t === "cue" && begin.at > room.now() - 50);

  await sleep(1100);
  const turn1 = allGame("p1", "fh_turn").at(-1);
  check("תור ראשון הוכרז", !!turn1);
  const firstPid = turn1.d.pid;

  // בעל התור מנחש; שני האחרים מצביעים "צדק"
  room.onMessage(firstPid, { t: "game", d: { a: "fh_guess" } });
  const others = P.filter((p) => p !== firstPid);
  check("מסך הצבעה הגיע לאחרים בלבד",
    others.every((p) => allGame(p, "fh_vote_req").length === 1) && allGame(firstPid, "fh_vote_req").length === 0);
  check("ההצבעה מציגה את הקלף הנכון", allGame(others[0], "fh_vote_req")[0].d.card === cards[firstPid]);

  others.forEach((p) => room.onMessage(p, { t: "game", d: { a: "fh_vote", ok: true } }));
  check("המנחש ניצל", allGame("p1", "fh_saved").some((m) => m.d.pid === firstPid));

  // הצצה — אזעקה לכולם
  await sleep(2100); // מחכים לתור הבא
  const cheater = P.find((p) => p !== firstPid)!;
  room.onMessage(cheater, { t: "game", d: { a: "fh_peek" } });
  check("אזעקת רמאי שודרה לכולם", P.every((p) => allGame(p, "fh_cheater").length >= 1));

  // השני מנחש נכון => נשאר אחד => טקס
  const turn2 = allGame("p1", "fh_turn").at(-1).d.pid;
  room.onMessage(turn2, { t: "game", d: { a: "fh_guess" } });
  P.filter((p) => p !== turn2).forEach((p) => room.onMessage(p, { t: "game", d: { a: "fh_vote", ok: true } }));

  const snap = room.snapshot();
  check("המשחק נגמר בטקס", snap.phase === "ceremony");
  check("יש ליצן והוא היחיד שלא ניצל", !!snap.ceremony?.loserId);
  check("המנצח הוא הראשון שניצל", snap.ceremony?.winnerId === firstPid);
  check("לוח הערב עודכן", (snap.ceremony?.eveningScores[firstPid] ?? 0) === 3);
}

async function testPods() {
  console.log("\n— פודים (מלך המהירות) —");
  const { last, transport, allGame } = makeTransport();
  const room = new Room("PODS", transport, { pods: createPods });
  const P = ["a1", "a2"];
  P.forEach((p, i) => room.join(p, "פוד" + i, "⚡"));

  room.onMessage("a1", { t: "select_game", gameId: "pods", config: { mode: "king" } });
  room.onMessage("a1", { t: "start_game" });

  await sleep(1600);
  const runner = allGame("a1", "pd_runner").at(-1)?.d.pid;
  check("רץ ראשון הוכרז", !!runner);

  await sleep(3600); // ההדלקה הראשונה אחרי ספירת פתיחה
  const lightMsg = allGame("a1", "pd_light").at(-1);
  check("פוד נדלק (cue מתוזמן)", lightMsg?.t === "cue");
  if (lightMsg) {
    const podId = lightMsg.d.podId;
    // הפוד "נוגע" 180ms אחרי ההדלקה — בזמן-שרת
    room.onMessage(podId, { t: "game", d: { a: "pd_tap", lightId: lightMsg.d.lightId, atServer: lightMsg.at + 180 } });
    const hit = allGame("a1", "pd_hit").at(-1);
    check("נגיעה נמדדה", !!hit);
    check("זמן התגובה חושב מזמני-שרת (180ms±5)", Math.abs(hit.d.reactionMs - 180) <= 5);
    check("הנקודה נזקפת לרץ (גם אם הפוד של אחר)", hit.d.pid === runner);
  }
  console.log("  (טקס הפודים נבדק בזרימת הזמן המלאה — מדולג בבדיקת יחידה)");
}

async function testClockMath() {
  console.log("\n— סנכרון שעונים (מתמטיקה) —");
  // סימולציית פינג: שרת מקדים את הלקוח ב-5000ms, רשת א-סימטרית קלה
  const clientT0 = 1000;
  const trueOffset = 5000;
  const upLatency = 40, downLatency = 60;
  const serverTs = clientT0 + upLatency + trueOffset;
  const clientT1 = clientT0 + upLatency + downLatency;
  const estOffset = serverTs - (clientT0 + clientT1) / 2;
  const err = Math.abs(estOffset - trueOffset);
  check(`שגיאת אומדן = מחצית הא-סימטריה בלבד (${err}ms)`, err === Math.abs(downLatency - upLatency) / 2);
}

async function testBombs() {
  console.log("\n— מטר הפצצות —");
  const { transport, allGame } = makeTransport();
  const { createBombs } = await import("../src/games/bombs");
  const room = new Room("BOMB", transport, { bombs: createBombs });
  const P = ["b1", "b2", "b3"];
  P.forEach((p, i) => room.join(p, "חבלן" + i, "💣"));

  room.onMessage("b1", { t: "select_game", gameId: "bombs", config: { difficulty: "chill" } });
  room.onMessage("b1", { t: "start_game" });

  check("bm_start הגיע לכולם", P.every((p) => allGame(p, "bm_start").length === 1));

  await sleep(3800); // ספירת פתיחה + הפצצה הראשונה
  const spawn = allGame("b1", "bm_spawn").at(-1);
  check("פצצה ראשונה נחתה (cue מתוזמן)", spawn?.t === "cue" && spawn.at > 0);
  if (spawn) {
    const holder = spawn.d.holder as string;
    check("המחזיק הוא שחקן בחדר", P.includes(holder));
    check("יש פתיל עתידי", spawn.at + spawn.d.fuseMs > room.now());
    // המחזיק מעביר לשחקן אחר
    const to = P.find((p) => p !== holder)!;
    if (spawn.d.type === "sticky") room.onMessage(holder, { t: "game", d: { a: "bm_unstuck", bombId: spawn.d.bombId } });
    if (spawn.d.type !== "duo") {
      room.onMessage(holder, { t: "game", d: { a: "bm_pass", bombId: spawn.d.bombId, to } });
      const pass = allGame("b1", "bm_pass").at(-1);
      check("העברה שודרה כ-cue", pass?.d.to === to && pass?.d.from === holder);
      check("זר לא יכול להעביר", (() => {
        room.onMessage(holder, { t: "game", d: { a: "bm_pass", bombId: spawn.d.bombId, to: holder } });
        return allGame("b1", "bm_pass").at(-1)?.d.to === to;
      })());
    } else {
      // תאומה: שני המחזיקים לוחצים יחד → נטרול
      const partner = spawn.d.partner as string;
      room.onMessage(holder, { t: "game", d: { a: "bm_hold", bombId: spawn.d.bombId, down: true } });
      room.onMessage(partner, { t: "game", d: { a: "bm_hold", bombId: spawn.d.bombId, down: true } });
      await sleep(900);
      check("תאומה נוטרלה בהחזקה כפולה", allGame("b1", "bm_defused").length === 1);
    }
  }
  const snap = room.snapshot();
  check("המשחק עדיין רץ (לא נגמר בטעות)", snap.phase === "game");
}

(async () => {
  console.log("LARIK Games — בדיקות זרימה");
  await testClockMath();
  await testForehead();
  await testPods();
  await testBombs();
  if (failed) { console.error(`\n${failed} בדיקות נכשלו`); process.exit(1); }
  console.log("\nהכול עבר ✓");
  process.exit(0);
})();
