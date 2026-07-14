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
import { createForehead } from "./games/forehead";
import { createPods } from "./games/pods";
import { createBombs } from "./games/bombs";
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
});
setInterval(() => manager.cleanup(), 60_000);

/* ---------- HTTP: יצירת חדר + הגשת לקוח ---------- */
const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json",
  ".woff2": "font/woff2", ".mp3": "audio/mpeg",
};

const http = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://x");
  if (url.pathname === "/api/create-room") {
    const room = manager.createRoom();
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ code: room.code }));
    return;
  }
  if (url.pathname === "/api/health") {
    res.writeHead(200); res.end("ok"); return;
  }
  // הגשת קבצי הלקוח (SPA fallback ל-index.html)
  if (existsSync(CLIENT_DIST)) {
    let file = join(CLIENT_DIST, url.pathname);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(CLIENT_DIST, "index.html");
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
