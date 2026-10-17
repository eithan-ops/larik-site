/**
 * שחקן שהטלפון שלו "נרדם" 60 שניות בלובי חוזר לאותו חדר ולאותו כיסא (17.10).
 * מריצים: PORT=8899 npx tsx src/index.ts & ; node test/lobby-away-e2e.mjs 8899
 */
import WebSocket from "ws";
const PORT = process.argv[2] || "8899";
const AWAY_MS = Number(process.argv[3] || 60000);
const BASE = `http://localhost:${PORT}`, WS = `ws://localhost:${PORT}/ws`;
let failed = 0;
const check = (n, c) => { console.log((c ? "  ✓ " : "  ✗ FAIL ") + n); if (!c) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function open(q, name, gpid) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${WS}?${q}`);
    const s = { ws, room: null, pid: null };
    ws.on("message", (raw) => { const m = JSON.parse(String(raw)); if (m.t === "welcome") { s.pid = m.playerId; s.room = m.room; } if (m.t === "room") s.room = m.room; });
    ws.on("open", () => ws.send(JSON.stringify({ t: "join", name, emoji: "🙂", gpid })));
    const iv = setInterval(() => { if (s.pid) { clearInterval(iv); resolve(s); } }, 20);
  });
}
const code = (await (await fetch(`${BASE}/api/create-room`)).json()).code;
const host = await open(`room=${code}&gpid=gH2`, "מארח", "gH2");
const g1 = await open(`room=${code}&gpid=gG2`, "אורחת", "gG2");
const pid = g1.pid;
g1.ws.terminate(); // המסך כבה בלובי — הסוקט מת
await sleep(500);
check("המארח רואה אותה מנותקת", host.room.players.find((p) => p.id === pid)?.connected === false);
await sleep(AWAY_MS);
check("הכיסא שלה עדיין בחדר אחרי " + AWAY_MS / 1000 + " שניות", !!host.room.players.find((p) => p.id === pid));
const g2 = await open(`room=${code}&pid=${pid}&gpid=gG2`, "אורחת", "gG2"); // מה ש-connection.ts עושה כשהדף חוזר להיות גלוי
await sleep(300);
check("חזרה לאותו חדר עם אותו מזהה", g2.pid === pid && g2.room.code === code);
check("המארח רואה אותה מחוברת", host.room.players.find((p) => p.id === pid)?.connected === true);
check("אין כפילות בחדר", host.room.players.length === 2);
host.ws.close(); g2.ws.close();
console.log(failed ? `\n${failed} נכשלו` : "\nהכול עבר ✓");
process.exit(failed ? 1 : 0);
