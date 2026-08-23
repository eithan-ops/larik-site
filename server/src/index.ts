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
import { generateAiDeck, aiDeckAvailable } from "./aideck";
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
import { createReactor } from "./games/reactor";
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
  reactor: createReactor,
}, { playerJoined: statPlayerJoined, gameStarted: statGameStarted });
setInterval(() => manager.cleanup(), 60_000);

/* ---------- HTTP: יצירת חדר + הגשת לקוח ---------- */
const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json",
  ".woff2": "font/woff2", ".mp3": "audio/mpeg",
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
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ code: room.code }));
    statRoomCreated();
    return;
  }
  if (url.pathname === "/api/health") {
    res.writeHead(200); res.end("ok"); return;
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
    if (msg.t === "join") room.join(playerId, msg.name, msg.emoji);
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
