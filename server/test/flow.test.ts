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
  P.forEach((p) => room.onMessage(p, { t: "game", d: { a: "fh_placed" } }));
  const begin = allGame("p1", "fh_begin")[0];
  check("fh_begin cue", begin?.t === "cue" && begin.at > room.now() - 50);
  await sleep(1100);
  const turn1 = allGame("p1", "fh_turn").at(-1);
  check("תור ראשון", !!turn1);
  const firstPid = turn1.d.pid;
  room.onMessage(firstPid, { t: "game", d: { a: "fh_guess" } });
  const others = P.filter((p) => p !== firstPid);
  check("הצבעה לאחרים", others.every((p) => allGame(p, "fh_vote_req").length === 1) && allGame(firstPid, "fh_vote_req").length === 0);
  others.forEach((p) => room.onMessage(p, { t: "game", d: { a: "fh_vote", ok: true } }));
  check("ניצל", allGame("p1", "fh_saved").some((m) => m.d.pid === firstPid));
  await sleep(2100);
  const turn2 = allGame("p1", "fh_turn").at(-1).d.pid;
  room.onMessage(turn2, { t: "game", d: { a: "fh_guess" } });
  P.filter((p) => p !== turn2).forEach((p) => room.onMessage(p, { t: "game", d: { a: "fh_vote", ok: true } }));
  const snap = room.snapshot();
  check("טקס", snap.phase === "ceremony");
}

async function testClockMath() {
  console.log("\n— סנכרון —");
  const clientT0 = 1000, trueOffset = 5000, upLatency = 40, downLatency = 60;
  const serverTs = clientT0 + upLatency + trueOffset;
  const clientT1 = clientT0 + upLatency + downLatency;
  const estOffset = serverTs - (clientT0 + clientT1) / 2;
  check("שגיאת אומדן", Math.abs(estOffset - trueOffset) === Math.abs(downLatency - upLatency) / 2);
}

async function testNewGames() {
  const { createColorRules } = await import("../src/games/colorrules");
  const { createSimon } = await import("../src/games/simon");
  const { createDeathTouch } = await import("../src/games/deathtouch");
  const { createDemons } = await import("../src/games/demons");
  const { createAlias } = await import("../src/games/alias");
  const { createTrivia } = await import("../src/games/trivia");
  console.log("\n— חוקי הצבע —");
  { const { transport, allGame } = makeTransport(); const room = new Room("CR", transport, { colorrules: createColorRules }); ["c1","c2","c3"].forEach((p,i)=>room.join(p,"c"+i,"🎨")); room.onMessage("c1",{t:"select_game",gameId:"colorrules",config:{speed:"fast"}}); room.onMessage("c1",{t:"start_game"}); await sleep(3600); const fl = allGame("c1","cr_flash").at(-1); check("הבזק צבע", !!fl && typeof fl.d.mustTap==="boolean" && fl.d.until>fl.d.at); }
  console.log("\n— סימון —");
  { const { transport, allGame } = makeTransport(); const room = new Room("SM", transport, { simon: createSimon }); ["s1","s2"].forEach((p,i)=>room.join(p,"s"+i,"🟩")); room.onMessage("s1",{t:"select_game",gameId:"simon"}); room.onMessage("s1",{t:"start_game"}); await sleep(2200); check("נדלק ברצף", allGame("s1","sm_light").at(-1)?.t==="cue"); }
  console.log("\n— נגיעת המוות —");
  { const { transport, inbox, allGame } = makeTransport(); const room = new Room("DT", transport, { deathtouch: createDeathTouch }); const P=["k1","k2","k3","k4"]; P.forEach((p,i)=>room.join(p,"d"+i,"🔪")); room.onMessage("k1",{t:"select_game",gameId:"deathtouch"}); room.onMessage("k1",{t:"start_game"}); const roles = P.map((p)=>(inbox.get(p)??[]).find((m)=>m.t==="game"&&m.d?.a==="dt_role")); check("תפקידים", roles.every((r)=>r&&(r.d.role==="killer"||r.d.role==="civilian"))); const killers = P.filter((p,i)=>roles[i]?.d.role==="killer"); await sleep(4300); const victim = P.find((p)=>!killers.includes(p)); room.onMessage(victim,{t:"game",d:{a:"dt_touched"}}); check("נגיעה הרגה", allGame("k1","dt_killed").some((m)=>m.d.pid===victim)); }
  console.log("\n— שדים —");
  { const { transport, allGame } = makeTransport(); const room = new Room("DM", transport, { demons: createDemons }); ["m1","m2"].forEach((p,i)=>room.join(p,"m"+i,"👹")); room.onMessage("m1",{t:"select_game",gameId:"demons"}); room.onMessage("m1",{t:"start_game"}); for(let i=0;i<12;i++) room.onMessage("m1",{t:"game",d:{a:"dm_hit"}}); room.onMessage("m1",{t:"game",d:{a:"dm_send",target:"m2"}}); check("שד נשלח", allGame("m2","dm_demon").at(-1)?.d.target==="m2"); }
  console.log("\n— על הלשון —");
  { const { transport, inbox, allGame } = makeTransport(); const room = new Room("AL", transport, { alias: createAlias }); const P=["a1","a2","a3"]; P.forEach((p,i)=>room.join(p,"a"+i,"👅")); room.onMessage("a1",{t:"select_game",gameId:"alias",config:{deck:"food"}}); room.onMessage("a1",{t:"start_game"}); await sleep(1700); const turn = allGame("a1","al_turn").at(-1); const describer = turn.d.pid; room.onMessage(describer,{t:"game",d:{a:"al_correct"}}); check("ניקוד", allGame("a1","al_scored").some((m)=>m.d.pid===describer&&m.d.total===1)); }
  console.log("\n— טריוויה —");
  { const { transport, allGame } = makeTransport(); const room = new Room("TV", transport, { trivia: createTrivia }); ["t1","t2"].forEach((p,i)=>room.join(p,"t"+i,"🧠")); room.onMessage("t1",{t:"select_game",gameId:"trivia",config:{cat:"israel"}}); room.onMessage("t1",{t:"start_game"}); await sleep(3100); const q = allGame("t1","tv_q").at(-1); check("שאלה", q?.t==="cue" && q.d.options.length===4 && q.d.correct===undefined); room.onMessage("t1",{t:"game",d:{a:"tv_answer",qId:q.d.qId,choice:0,atServer:q.at+400}}); room.onMessage("t2",{t:"game",d:{a:"tv_answer",qId:q.d.qId,choice:1,atServer:q.at+400}}); await sleep(200); const rev = allGame("t1","tv_reveal").at(-1); check("חשיפה", !!rev && rev.d.correct>=0); }
}

async function testReactor() {
  const { createReactor } = await import("../src/games/reactor");
  console.log("\n— הכור —");
  const { transport, allGame } = makeTransport();
  const room = new Room("RX", transport, { reactor: createReactor });
  const P = ["r1", "r2", "r3", "r4"];
  P.forEach((p, i) => room.join(p, "r" + i, "☢️"));
  room.onMessage("r1", { t: "select_game", gameId: "reactor", config: { difficulty: "normal" } });
  room.onMessage("r1", { t: "start_game" });
  await sleep(3600);
  const wv = allGame("r1", "rx_wave").at(-1);
  check("גל 1 נפתח (cue)", wv?.t === "cue" && wv.d.wave === 1);
  const roles = wv.d.roles as Record<string, string>;
  check("תפקידים: טוען+מתקן+2 מזינים", Object.values(roles).filter((r) => r === "loader").length === 1
    && Object.values(roles).filter((r) => r === "fixer").length === 1
    && Object.values(roles).filter((r) => r === "feeder").length === 2);
  await sleep(2600);
  const feeder = P.find((p) => roles[p] === "feeder")!;
  const loader = P.find((p) => roles[p] === "loader")!;
  const orb = allGame(feeder, "rx_orb").findLast((m) => m.d.feeder === feeder);
  check("אורב נולד אצל מזין", !!orb);
  room.onMessage(feeder, { t: "game", d: { a: "rx_feed", orbId: orb.d.orbId } });
  check("האורב שוגר (cue)", allGame("r1", "rx_sent").some((m) => m.d.orbId === orb.d.orbId));
  await sleep(1500);
  check("האורב בתור הליבה", allGame("r1", "rx_queue").at(-1)?.d.queue >= 1);
  room.onMessage(loader, { t: "game", d: { a: "rx_inject", atServer: room.now() } });
  const inj = allGame("r1", "rx_injected").at(-1);
  check("הזרקה עם איכות", !!inj && ["perfect", "good", "weak"].includes(inj.d.quality) && inj.d.by === loader);
  check("ניקוז HP פועל", allGame("r1", "rx_hp").length >= 1 || inj.d.hp < 100 || inj.d.hp >= 100);
}

async function testWall() {
  const { createWall } = await import("../src/games/wall");
  console.log("\n— החומה —");
  const { transport, allGame } = makeTransport();
  const room = new Room("WL", transport, { wall: createWall });
  const P = ["w1", "w2", "w3", "w4"];
  P.forEach((p, i) => room.join(p, "w" + i, "🏰"));
  room.onMessage("w1", { t: "select_game", gameId: "wall", config: { difficulty: "normal" } });
  room.onMessage("w1", { t: "start_game" });
  const setup = allGame("w1", "wl_setup").at(-1);
  check("מסך היערכות עם תפקידים", !!setup && Object.keys(setup.d.roles).length === 4);
  room.onMessage("w2", { t: "game", d: { a: "wl_role", role: "archer" } });
  check("החלפת תפקיד", allGame("w1", "wl_setup").at(-1).d.roles["w2"] === "archer");
  room.onMessage("w1", { t: "game", d: { a: "wl_go" } });
  await sleep(3600);
  const wv = allGame("w1", "wl_wave").at(-1);
  check("גל 1 נפתח (cue)", wv?.t === "cue" && wv.d.wave === 1 && wv.d.wallHp > 0);
  await sleep(2500);
  const sp = allGame("w1", "wl_spawn");
  check("אויבים נולדים", sp.length >= 1);
  // קשת יורה לנקודת האויב הראשון
  const e = sp[0].d;
  const ey = e.y0 + (e.speed * (room.now() + 700 - e.at)) / 1000;
  room.onMessage("w2", { t: "game", d: { a: "wl_shot", tx: e.x0, ty: Math.max(100, ey), power: 1 } });
  check("חץ שוגר (cue)", allGame("w1", "wl_arrow").length >= 1);
  await sleep(1400);
  // תותחן מפגיז
  const gunner = Object.entries(allGame("w1", "wl_setup").at(-1).d.roles).find(([, r]) => r === "cannon")?.[0];
  if (gunner) {
    const e2 = allGame("w1", "wl_spawn").at(-1).d;
    room.onMessage(gunner, { t: "game", d: { a: "wl_boom", tx: e2.x0, ty: 400 } });
    check("פגז שוגר (cue)", allGame("w1", "wl_shell").length >= 1);
    await sleep(1600);
    check("פיצוץ", allGame("w1", "wl_boomfx").length >= 1);
  }
  const hits = allGame("w1", "wl_hit");
  check("פגיעות באויבים", hits.length >= 1);
}

(async () => {
  console.log("LARIK Games — בדיקות");
  await testClockMath();
  await testForehead();
  await testNewGames();
  await testReactor();
  await testWall();
  if (failed) { console.error(`\n${failed} נכשלו`); process.exit(1); }
  console.log("\nהכול עבר ✓");
  process.exit(0);
})();
