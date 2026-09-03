/**
 * LARIK Games — שרת Node (ws + hono-style http מינימלי)
 * מגיש גם את קבצי הלקוח הבנויים (client/dist) — תהליך אחד לכל הפיילוט.
 *
 * פריסה: כל מקום שמריץ Node (מחשב בסלון + cloudflared tunnel, VPS, Fly, Railway).
 * לעתיד: adapter ל-PartyKit/Durable Objects — המנוע (engine.ts) לא משתנה.
 */
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { join, extname, resolve } from "path";
import { randomUUID } from "crypto";
import { RoomManager, Transport } from "./engine";
import { Groups } from "./groups";
import { generateAiDeck, aiDeckAvailable, askModel } from "./aideck";
import { getStore } from "./store";
import { getTriviaBank } from "./triviaBank";
import { WallDaily, dailyDate, dailySeed } from "./wallDaily";
import { statRoomCreated, statPlayerJoined, statGameStarted, statConcurrent, statsPage, STATS_KEY, stats } from "./stats";
import { CATALOG } from "../../shared/protocol";
import { createForehead } from "./games/forehead";
import { createPods } from "./games/pods";
import { createBombs } from "./games/bombs";
import { createColorRules } from "./games/colorrules";
import { createSimon } from "./games/simon";
import { createDeathTouch } from "./games/deathtouch";
import { createDemons } from "./games/demons";
import { createAlias } from "./games/alias";
import { createTrivia } from "./games/trivia";
import { createWhoMost } from "./games/whomost";
import { createShow } from "./games/show";
import { createImpostor } from "./games/impostor";
import { createWall } from "./games/wall";
import { createHofrim } from "./games/hofrim";
import { createThieves } from "./games/thieves";
import { createAbyss } from "./games/abyss";
import type { ClientMsg } from "../../shared/protocol";

const PORT = Number(process.env.PORT || 8787);
const CLIENT_DIST = resolve(process.cwd(), "../client/dist");

/* ---------- טרנספורט ws ---------- */
const sockets = new Map<string, WebSocket>(); // playerId -> socket

const transport: Transport = {
  send(playerId, msg) {
    const ws = sockets.get(playerId);
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  },
};

const groups = new Groups();
const wallDaily = new WallDaily();
const abyssDaily = new WallDaily(undefined, undefined, "abyss");   // התהום היומית — אותה מכניקה, טבלה נפרדת

const manager = new RoomManager(transport, {
  forehead: createForehead,
  pods: createPods,
  bombs: createBombs,
  colorrules: createColorRules,
  simon: createSimon,
  deathtouch: createDeathTouch,
  demons: createDemons,
  alias: createAlias,
  trivia: createTrivia,
  whomost: createWhoMost,
  show: createShow,
  impostor: createImpostor,
  wall: createWall,
  hofrim: createHofrim,
  thieves: createThieves,
  abyss: createAbyss,
}, {
  playerJoined: statPlayerJoined,
  gameStarted: statGameStarted,
  dailyRun: (r) => {
    // הניקוד הגיע מהשרת שהריץ את המשחק — אין כאן קלט מהלקוח. הזרע: `<game>:<date>`
    const m = /^(wall|abyss):(\d{4}-\d{2}-\d{2})/.exec(r.seed);
    if (!m) return;
    const board = m[1] === "abyss" ? abyssDaily : wallDaily;
    for (const p of r.players) {
      void board.submit({ name: p.name, emoji: p.emoji, score: p.score, wave: r.wave }, m[2]);
    }
  },
}, groups);
setInterval(() => manager.cleanup(), 60_000);

/* ---------- HTTP: יצירת חדר + הגשת לקוח ---------- */
const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json",
  ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
  ".webmanifest": "application/manifest+json", ".ico": "image/x-icon",
};

const http = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://x");
  if (url.pathname === "/api/create-room") {
    // ?code=ARIEL — קוד קבוע לאירועים (מודפס על כרטיסים); אם החדר כבר קיים מחזירים אותו
    const wanted = (url.searchParams.get("code") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10);
    let room;
    if (wanted.length >= 3) room = manager.get(wanted) ?? manager.createRoom(wanted);
    else room = manager.createRoom();
    // ?g=ABCDE — פתיחת חדר עבור חבורה קיימת, כך שהערב נזקף לעונה שלה
    const gid = (url.searchParams.get("g") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);
    if (gid) void room.attachGroup(gid);
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ code: room.code, group: gid || undefined }));
    statRoomCreated();
    return;
  }
  // עמוד החבורה — טבלת עונה שאפשר לשתף בלי להיות בחדר
  if (url.pathname === "/api/group") {
    const gid = (url.searchParams.get("id") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);
    groups.get(gid)
      .then((g) => {
        res.writeHead(g ? 200 : 404, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify(g ? groups.summarize(g) : { error: "לא נמצאה חבורה כזו" }));
      })
      .catch(() => { res.writeHead(503); res.end(JSON.stringify({ error: "האחסון לא זמין" })); });
    return;
  }
  /**
   * האתגר היומי של החומה.
   * GET /api/wall-daily        → הזרע של היום והטבלה
   * GET /api/wall-daily/room   → פותח חדר סולו שמתחיל מעצמו, מחזיר קוד
   */
  if (url.pathname === "/api/wall-daily" || url.pathname === "/api/wall-daily/room") {
    const date = dailyDate();
    if (url.pathname.endsWith("/room")) {
      const room = manager.createRoom();
      room.armSoloDaily("wall", { seed: dailySeed(date), solo: true, difficulty: "normal" });
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ code: room.code, date }));
      statRoomCreated();
      return;
    }
    wallDaily.board(date)
      .then((b) => {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ date, runs: b.runs, top: b.entries.slice(0, 20) }));
      })
      .catch(() => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ date, runs: 0, top: [] })); });
    return;
  }
  /**
   * התהום היומית 🕳️ — אותו פיר לכל הארץ, צניחה אחת, סולו.
   * GET /api/abyss-daily        → הטבלה של היום
   * GET /api/abyss-daily/room   → פותח חדר סולו שמתחיל מעצמו, מחזיר קוד
   */
  if (url.pathname === "/api/abyss-daily" || url.pathname === "/api/abyss-daily/room") {
    const date = dailyDate();
    if (url.pathname.endsWith("/room")) {
      const room = manager.createRoom();
      room.armSoloDaily("abyss", { seed: `abyss:${date}`, solo: true, descents: 1 });
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ code: room.code, date }));
      statRoomCreated();
      return;
    }
    abyssDaily.board(date)
      .then((b) => {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ date, runs: b.runs, top: b.entries.slice(0, 20) }));
      })
      .catch(() => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ date, runs: 0, top: [] })); });
    return;
  }
  if (url.pathname === "/api/health") {
    res.writeHead(200); res.end("ok"); return;
  }
  /**
   * מצב האחסון — בלי סודות, רק איזה ספק מחובר והאם כתיבה+קריאה עוברות.
   * זה מה שמאפשר לוודא מבחוץ שמשתני הסביבה נדבקו נכון, בלי לנחש.
   */
  if (url.pathname === "/api/store-status") {
    const store = getStore();
    // probe() עוקף את המטמון בכוונה — אחרת כתיבה שנכשלה נראית כמו הצלחה
    store.probe()
      .then((ok) => {
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({
          kind: store.kind,
          writable: ok,
          persists: store.kind !== "memory" && ok,
          triviaBank: getTriviaBank().size(),
          triviaActive: getTriviaBank().active(),
          triviaPending: getTriviaBank().pendingCount(),
        }));
      })
      .catch((e) => {
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ kind: store.kind, writable: false, persists: false, error: String(e).slice(0, 200) }));
      });
    return;
  }
  /** הטריוויה היומית — אותן שאלות לכל השחקנים באותו יום */
  if (url.pathname === "/api/daily-trivia") {
    const day = (url.searchParams.get("d") || "").match(/^\d{4}-\d{2}-\d{2}$/)
      ? url.searchParams.get("d")!
      : new Date().toISOString().slice(0, 10);
    const bank = getTriviaBank();
    bank.load().then(() => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ date: day, questions: bank.daily(day, 10), bankSize: bank.size() }));
    });
    return;
  }
  /** מפעל השאלות — מוגן במפתח הסטטיסטיקות, כדי שלא כל אחד ישרוף לך מכסת מודל */
  if (url.pathname === "/api/trivia/grow") {
    if (url.searchParams.get("k") !== STATS_KEY) { res.writeHead(403); res.end("no"); return; }
    const n = Math.min(50, Math.max(1, Number(url.searchParams.get("n")) || 20));
    const cat = (url.searchParams.get("cat") || "weird") as "israel" | "world" | "science" | "weird";
    getTriviaBank().grow(n, cat, askModel)
      .then((r) => {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(r));
      })
      .catch((e) => { res.writeHead(500); res.end(String(e).slice(0, 200)); });
    return;
  }
  /**
   * תור האישור — שום שאלה שנוצרה לא מגיעה לשחקנים לפני שאדם קרא אותה.
   * GET /api/trivia/pending?k=...            → מה מחכה
   * GET /api/trivia/approve?k=...&pids=a,b   → להכניס למאגר
   * GET /api/trivia/drop?k=...&pids=a,b      → למחוק מהתור
   */
  if (url.pathname.startsWith("/api/trivia/pending")
   || url.pathname.startsWith("/api/trivia/approve")
   || url.pathname.startsWith("/api/trivia/drop")) {
    if (url.searchParams.get("k") !== STATS_KEY) { res.writeHead(403); res.end("no"); return; }
    const bank = getTriviaBank();
    const pids = (url.searchParams.get("pids") || "").split(",").map((x) => x.trim()).filter(Boolean);
    const action =
      url.pathname.endsWith("/approve") ? bank.approve(pids)
      : url.pathname.endsWith("/drop") ? bank.rejectPending(pids)
      : bank.pendingList();
    action
      .then((r) => {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify(r));
      })
      .catch((e) => { res.writeHead(500); res.end(String(e).slice(0, 200)); });
    return;
  }
  /**
   * הוצאת שאלות משימוש. לא מוחק — מזהה שאלה הוא מיקום במערך, ומחיקה
   * הייתה מזיזה את כל המזהים שאחריה והופכת את זיכרון ה"נראה" לשקר.
   * GET /api/trivia/retire?k=...&ids=30,33,35
   */
  if (url.pathname === "/api/trivia/retire") {
    if (url.searchParams.get("k") !== STATS_KEY) { res.writeHead(403); res.end("no"); return; }
    const ids = (url.searchParams.get("ids") || "").split(",").map(Number).filter(Number.isInteger);
    getTriviaBank().retire(ids)
      .then((r) => {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(r));
      })
      .catch((e) => { res.writeHead(500); res.end(String(e).slice(0, 200)); });
    return;
  }
  // חפיסה אישית ✨ — פרוקסי ל-LLM (המפתח נשאר בשרת). GET /api/ai-deck?topic=...
  if (url.pathname === "/api/ai-deck") {
    const topic = url.searchParams.get("topic") || "";
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").split(",")[0].trim();
    generateAiDeck(topic, ip)
      .then(({ status, body }) => {
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify(body));
      })
      .catch(() => { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "שגיאה פנימית" })); });
    return;
  }
  // הלקוח שואל אם הפיצ'ר מופעל (יש מפתח בסביבה) — כדי להציג/להסתיר את האופציה
  if (url.pathname === "/api/ai-deck-available") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ available: aiDeckAvailable() }));
    return;
  }
  // דף סטטיסטיקות פרטי — larik.ai/stats?k=<מפתח>
  if (url.pathname === "/stats" || url.pathname === "/api/stats") {
    if (url.searchParams.get("k") !== STATS_KEY) { res.writeHead(404); res.end("not found"); return; }
    const liveRooms = [...manager.rooms.values()].filter((r) => !r.isEmpty).length;
    if (url.pathname === "/api/stats") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ...stats, liveRooms, liveSockets: sockets.size }));
    } else {
      const names = Object.fromEntries(CATALOG.map((g) => [g.id, `${g.icon} ${g.name}`]));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(statsPage(names, liveRooms, sockets.size));
    }
    return;
  }
  // הגשת קבצי הלקוח — שתי אפליקציות מאותו dist:
  // דומיין show.* או נתיב /s → אפליקציית המופע (show.html); כל השאר → משחקים (index.html)
  if (existsSync(CLIENT_DIST)) {
    const host = String(req.headers.host || "");
    const isShowApp = host.startsWith("show.") || url.pathname === "/s" || url.pathname.startsWith("/s/");
    let file = join(CLIENT_DIST, url.pathname);
    // URLs נקיים לעמודי תוכן סטטיים: /games/trivia → games/trivia.html, /games → games/index.html
    if (existsSync(file) && statSync(file).isDirectory() && existsSync(join(file, "index.html"))) {
      file = join(file, "index.html");
    } else if ((!existsSync(file) || statSync(file).isDirectory()) && url.pathname !== "/" && existsSync(file + ".html")) {
      file = file + ".html";
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      file = join(CLIENT_DIST, isShowApp ? "show.html" : "index.html");
    }
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
    return;
  }
  res.writeHead(404); res.end("client not built — run: cd client && npm run build");
});

/* ---------- WebSocket ---------- */
const wss = new WebSocketServer({ server: http, path: "/ws" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", "http://x");
  const code = (url.searchParams.get("room") || "").toUpperCase();
  const rejoinId = url.searchParams.get("pid") || "";
  const room = manager.get(code);
  if (!room) {
    ws.send(JSON.stringify({ t: "error", msg: "החדר לא נמצא — בקש מהמארח QR חדש" }));
    ws.close();
    return;
  }
  const playerId = rejoinId || randomUUID().slice(0, 8);
  sockets.set(playerId, ws);
  statConcurrent(sockets.size);

  ws.on("message", (raw) => {
    let msg: ClientMsg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.t === "join") room.join(playerId, msg.name, msg.emoji, msg.gpid);
    else room.onMessage(playerId, msg);
  });

  ws.on("close", () => {
    if (sockets.get(playerId) === ws) sockets.delete(playerId);
    room.disconnect(playerId);
  });
});

http.listen(PORT, () => {
  console.log(`⚡ LARIK Games server on http://localhost:${PORT}`);
  console.log(`   client dist: ${existsSync(CLIENT_DIST) ? CLIENT_DIST : "(לא נבנה עדיין)"}`);
});
