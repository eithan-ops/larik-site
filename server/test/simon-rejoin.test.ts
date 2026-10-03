/**
 * סימון: ניתוק רגעי לא מוציא את השחקן; ניתוק ארוך (מעבר לחסד) כן.
 * מריצים: npx tsx test/simon-rejoin.test.ts
 */
import { Room, Transport } from "../src/engine";
import { createSimon } from "../src/games/simon";
import type { ServerMsg } from "../../shared/protocol";

let failed = 0;
const check = (name: string, cond: boolean) => { console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name); if (!cond) failed++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const inbox = new Map<string, ServerMsg[]>();
const transport: Transport = { send(pid, msg) { (inbox.get(pid) ?? inbox.set(pid, []).get(pid)!).push(msg); } };
const got = (pid: string, a: string) => (inbox.get(pid) ?? []).filter((m: any) => (m.t === "game" || m.t === "cue") && m.d?.a === a).length;

console.log("\n— סימון: חסד לניתוק רגעי —");
const room = new Room("SIMN", transport, { simon: createSimon });
["p1", "p2", "p3"].forEach((p) => room.join(p, p, "🙂"));
room.onMessage("p1", { t: "select_game", gameId: "simon" });
room.onMessage("p1", { t: "start_game" });
await sleep(100);
room.disconnect("p3");
inbox.set("p3", []);
await sleep(300);
room.join("p3", "p3", "🙂");
check("חזר וקיבל את הצבעים שלו (onRejoin)", got("p3", "sm_setup") === 1);
console.log(failed ? `\n${failed} נכשלו ✗` : "\nהכול עבר ✓");
process.exit(failed ? 1 : 0);
