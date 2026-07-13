/**
 * שכבת החיבור + סנכרון השעונים — הלב של "בלי דילאיי".
 *
 * איך זה עובד:
 * 1. בהתחברות נשלחים 8 פינגים; לכל אחד מחשבים offset = ts - (t0+t1)/2 ו-rtt.
 * 2. שומרים את ה-offset של הפינג עם ה-rtt הנמוך ביותר (הוא המדויק ביותר).
 * 3. serverNow() = performance.now() + offset — שעון שרת מקומי, מדויק ל-±10-30ms.
 * 4. cue מהשרת = {at, d}: מתזמנים את הביצוע לזמן המקומי המתאים.
 *    לאודיו — ממירים לזמן AudioContext לתזמון מושלם ברמת הדגימה.
 * 5. פינג מתחדש כל 15 שניות לתיקון סחיפה.
 */
import type { ClientMsg, ServerMsg, RoomSnapshot, GameServerMsg } from "../../../shared/protocol";

export type CueHandler = (d: GameServerMsg, at: number) => void;

export interface ConnectionEvents {
  onRoom(room: RoomSnapshot): void;
  onGame(d: GameServerMsg): void;
  /** אירוע מתוזמן — ייקרא בדיוק בזמן (סטייה אופיינית <30ms) */
  onCue: CueHandler;
  onError(msg: string): void;
  onWelcome(playerId: string, room: RoomSnapshot): void;
  onStatus(s: "connecting" | "open" | "closed"): void;
}

const PING_ROUNDS = 8;
const PING_INTERVAL = 15_000;

export class Connection {
  private ws?: WebSocket;
  private offset = 0; // serverTime - perfTime
  private bestRtt = Infinity;
  private pingTimer?: number;
  playerId = "";
  synced = false;

  private serverUrl: string;
  private roomCode: string;
  private events: ConnectionEvents;

  constructor(serverUrl: string, roomCode: string, events: ConnectionEvents) {
    this.serverUrl = serverUrl;
    this.roomCode = roomCode;
    this.events = events;
  }

  /* ---- שעון ---- */
  serverNow(): number { return performance.now() + this.offset; }
  /** ms עד זמן-שרת נתון */
  untilServer(at: number): number { return at - this.serverNow(); }

  connect(name: string, emoji: string) {
    const pid = sessionStorage.getItem(`larik-pid-${this.roomCode}`) || "";
    const url = `${this.serverUrl}/ws?room=${this.roomCode}${pid ? `&pid=${pid}` : ""}`;
    this.events.onStatus("connecting");
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.events.onStatus("open");
      this.send({ t: "join", name, emoji });
      this.syncClock();
      this.pingTimer = window.setInterval(() => this.syncClock(), PING_INTERVAL);
    };

    this.ws.onmessage = (ev) => {
      const msg: ServerMsg = JSON.parse(ev.data);
      switch (msg.t) {
        case "welcome":
          this.playerId = msg.playerId;
          sessionStorage.setItem(`larik-pid-${this.roomCode}`, msg.playerId);
          this.events.onWelcome(msg.playerId, msg.room);
          return;
        case "pong": {
          const t1 = performance.now();
          const rtt = t1 - msg.t0;
          if (rtt < this.bestRtt) {
            this.bestRtt = rtt;
            this.offset = msg.ts - (msg.t0 + t1) / 2;
            this.synced = true;
          }
          return;
        }
        case "room": this.events.onRoom(msg.room); return;
        case "game": this.events.onGame(msg.d); return;
        case "cue": {
          const delay = Math.max(0, this.untilServer(msg.at));
          window.setTimeout(() => this.events.onCue(msg.d, msg.at), delay);
          return;
        }
        case "error": this.events.onError(msg.msg); return;
      }
    };

    this.ws.onclose = () => {
      this.events.onStatus("closed");
      clearInterval(this.pingTimer);
      // ניסיון חיבור מחדש עדין
      setTimeout(() => {
        if (document.visibilityState === "visible") this.connect(name, emoji);
      }, 1500);
    };
  }

  private syncClock() {
    // סדרת פינגים קצרה; שומרים את הטוב ביותר
    this.bestRtt = Math.min(this.bestRtt * 1.5, 500); // מאפשרים שיפור אחרי שינויי רשת
    for (let i = 0; i < PING_ROUNDS; i++) {
      setTimeout(() => this.send({ t: "ping", t0: performance.now() }), i * 120);
    }
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  sendGame(d: ClientMsg extends { t: "game" } ? never : any) {
    this.send({ t: "game", d });
  }

  close() {
    clearInterval(this.pingTimer);
    this.ws?.close();
  }
}

/** כתובת השרת: אותו host שממנו הוגש הדף (dev: ויטה מפרוקסי) */
export function defaultServerUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}`;
}

export async function createRoom(): Promise<string> {
  const res = await fetch("/api/create-room", { method: "GET" });
  const { code } = await res.json();
  return code;
}
