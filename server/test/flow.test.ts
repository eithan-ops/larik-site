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

(async () => {
  console.log("LARIK Games — בדיקות");
  await testClockMath();
  await testForehead();
  await testNewGames();
  if (failed) { console.error(`\n${failed} נכשלו`); process.exit(1); }
  console.log("\nהכול עבר ✓");
  process.exit(0);
})();
