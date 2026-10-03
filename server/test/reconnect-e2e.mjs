/**
 * בדיקת ניתוקים מקצה לקצה מול שרת אמיתי (ws), בלי דפדפן.
 * מריצים: PORT=8899 npx tsx src/index.ts & ; node test/reconnect-e2e.mjs 8899
 *
 * 1. סוקט ישן שנסגר *אחרי* שהשחקן כבר חזר בסוקט חדש — לא מסמן אותו מנותק (הבאג של הערב הגדול)
 * 2. טאב חדש בלי pid (נפתח שוב מהקישור) — חוזר לאותו כיסא לפי מזהה המכשיר (gpid)
 * 3. השרת "עלה מחדש" (חדר לא קיים) — מי שחוזר עם pid מקים את החדר מחדש באותו קוד, והמארח חוזר להיות מארח
 * 4. טאב שני של אותו שחקן מעיף את הראשון עם קוד 4001
 */
import WebSocket from "ws";

const PORT = process.argv[2] || "8899";
const BASE = `http://localhost:${PORT}`;
const WS = `ws://localhost:${PORT}/ws`;
let failed = 0;
const check = (name, cond) => { console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name); if (!cond) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(q, name = "p", gpid) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${WS}?${q}`);
    const s = { ws, msgs: [], closeCode: null, room: null, pid: null };
    ws.on("message", (raw) => {
      const m = JSON.parse(String(raw));
      s.msgs.push(m);
      if (m.t === "welcome") { s.pid = m.playerId; s.room = m.room; }
      if (m.t === "room") s.room = m.room;
    });
    ws.on("close", (code) => { s.closeCode = code; });
    ws.on("open", () => { ws.send(JSON.stringify({ t: "join", name, emoji: "🙂", gpid })); });
    setTimeout(() => resolve(s), 300);
  });
}
const createRoom = async () => (await (await fetch(`${BASE}/api/create-room`)).json()).code;
const me = (s, pid) => s.room?.players.find((p) => p.id === pid);

console.log("\n— 1. סוקט ישן נסגר אחרי החזרה —");
{
  const code = await createRoom();
  const host = await open(`room=${code}&gpid=gH`, "מארח", "gH");
  const a1 = await open(`room=${code}&gpid=gA`, "אבי", "gA");
  const pidA = a1.pid;
  // הטלפון של אבי "חוזר" בסוקט חדש בזמן שהישן עוד חי (זומבי)
  const a2 = await open(`room=${code}&pid=${pidA}&gpid=gA`, "אבי", "gA");
  check("אותו pid בחזרה", a2.pid === pidA);
  await sleep(200);
  // ה-close של הישן מגיע מאוחר
  a1.ws.terminate();
  await sleep(400);
  check("אבי עדיין מחובר בעיני המארח", me(host, pidA)?.connected === true);
  // והסוקט החדש עדיין עובד
  a2.ws.send(JSON.stringify({ t: "ping", t0: 1 }));
  await sleep(200);
  check("הסוקט החדש חי (pong)", a2.msgs.some((m) => m.t === "pong"));
  host.ws.close(); a2.ws.close();
}

console.log("\n— 2. טאב חדש בלי pid חוזר לאותו כיסא לפי המכשיר —");
{
  const code = await createRoom();
  const host = await open(`room=${code}&gpid=gH2`, "מארח", "gH2");
  const b1 = await open(`room=${code}&gpid=gB`, "בתיה", "gB");
  const pidB = b1.pid;
  b1.ws.close();
  await sleep(300);
  check("בתיה מנותקת", me(host, pidB)?.connected === false);
  const b2 = await open(`room=${code}&gpid=gB`, "בתיה", "gB"); // בלי pid!
  check("קיבלה את ה-pid הישן", b2.pid === pidB);
  await sleep(200);
  check("אין שחקן כפול", host.room.players.length === 2);
  check("מחוברת שוב", me(host, pidB)?.connected === true);
  host.ws.close(); b2.ws.close();
}

console.log("\n— 3. חדר שנמחק (ריסטרט) קם מחדש —");
{
  const code = "ZQXW";
  const guest = await open(`room=${code}&pid=guest1&gpid=gG`, "אורח", "gG");
  check("האורח נכנס (במקום 'החדר נסגר')", guest.pid === "guest1" && guest.room?.code === code);
  const host = await open(`room=${code}&pid=host1&gpid=gHH&h=1`, "מארח", "gHH");
  await sleep(200);
  check("המארח המקורי קיבל את הכתר בחזרה", host.room?.hostId === "host1");
  const third = await open(`room=${code}&pid=x3&gpid=g3&h=1`, "עוד", "g3");
  await sleep(200);
  check("טענת מארח שנייה לא גונבת את הכתר", third.room?.hostId === "host1");
  guest.ws.close(); host.ws.close(); third.ws.close();
}

console.log("\n— 4. טאב שני מעיף את הראשון בקוד 4001 —");
{
  const code = await createRoom();
  const t1 = await open(`room=${code}&gpid=gT`, "טל", "gT");
  const t2 = await open(`room=${code}&pid=${t1.pid}&gpid=gT`, "טל", "gT");
  await sleep(300);
  check("הראשון קיבל 4001", t1.closeCode === 4001);
  check("השני בפנים", t2.pid === t1.pid);
  t2.ws.close();
}

console.log(failed ? `\n${failed} נכשלו ✗` : "\nהכול עבר ✓");
process.exit(failed ? 1 : 0);
