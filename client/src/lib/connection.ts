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
import { myGpid } from "./group";
import { seenBlob } from "./seen";

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
  private everWelcomed = false; // מתחברים מחדש אוטומטית רק לחדר שבאמת נכנסנו אליו
  private closedByUs = false;
  private reconnectAttempt = 0; // backoff אקספוננציאלי עם jitter — ש-500 טלפונים לא יסתערו יחד אחרי נפילת רשת
  /** cues שהגיעו לפני שהשעון סונכרן — בלי offset אי אפשר לתזמן אותם; משוחררים בפונג הראשון */
  private pendingCues: Array<{ at: number; d: GameServerMsg }> = [];

  private serverUrl: string;
  private roomCode: string;
  private events: ConnectionEvents;
  private name = ""; private emoji = "";
  /** ניסיון חיבור מחדש שהוחמץ כי הטאב היה מוסתר — ישוחרר ברגע שהדף חוזר להיות גלוי */
  private waitVisible = false;
  private onVis = () => {
    if (document.visibilityState !== "visible" || !this.waitVisible) return;
    this.waitVisible = false; this.connect(this.name, this.emoji);
  };

  constructor(serverUrl: string, roomCode: string, events: ConnectionEvents) {
    this.serverUrl = serverUrl;
    this.roomCode = roomCode;
    this.events = events;
  }

  /* ---- שעון ---- */
  serverNow(): number { return performance.now() + this.offset; }
  /** ה-RTT הטוב ביותר שנמדד (ms) — לניבוי: הקלט שלנו מגיע לשרת אחרי חצי מזה */
  get rttMs(): number { return Number.isFinite(this.bestRtt) ? this.bestRtt : 80; }
  /** ms עד זמן-שרת נתון */
  untilServer(at: number): number { return at - this.serverNow(); }

  /** האם הסוקט פתוח כרגע — לשומרי הקיפאון של המשחקים */
  get open(): boolean { return this.ws?.readyState === WebSocket.OPEN; }

  /**
   * חיבור מחדש יזום — כשמשחק מזהה שלא הגיעו הודעות זמן רב למרות שהדף גלוי (סוקט "זומבי":
   * הטלפון ננעל/עבר לרקע והמערכת חנקה את החיבור בלי לסגור אותו).
   */
  kick() {
    if (this.closedByUs) return;
    const st = this.ws?.readyState;
    if (st === WebSocket.OPEN) { try { this.ws!.close(); } catch { /* onclose יטפל */ } }
    else if (st === undefined || st === WebSocket.CLOSED) this.connect(this.name, this.emoji);
  }

  connect(name: string, emoji: string) {
    this.name = name; this.emoji = emoji;
    document.removeEventListener("visibilitychange", this.onVis);
    document.addEventListener("visibilitychange", this.onVis);
    const pid = sessionStorage.getItem(`larik-pid-${this.roomCode}`) || "";
    const url = `${this.serverUrl}/ws?room=${this.roomCode}${pid ? `&pid=${pid}` : ""}`;
    this.events.onStatus("connecting");
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.events.onStatus("open");
      // gpid = הזהות היציבה של המכשיר, מה שמאפשר לעונה של החבורה לזכור אותו
      this.send({ t: "join", name, emoji, gpid: myGpid(), seen: seenBlob() });
      this.syncClock();
      this.pingTimer = window.setInterval(() => this.syncClock(), PING_INTERVAL);
    };

    this.ws.onmessage = (ev) => {
      const msg: ServerMsg = JSON.parse(ev.data);
      switch (msg.t) {
        case "welcome":
          this.everWelcomed = true;
          this.reconnectAttempt = 0; // חזרנו — מאפסים את הענישה
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
          // עכשיו כשיש שעון — משחררים cues שחיכו
          if (this.pendingCues.length) {
            const q = this.pendingCues;
            this.pendingCues = [];
            for (const c of q) this.scheduleCue(c.at, c.d);
          }
          return;
        }
        case "room": this.events.onRoom(msg.room); return;
        case "game": this.events.onGame(msg.d); return;
        case "cue": {
          if (!this.synced) { this.pendingCues.push({ at: msg.at, d: msg.d }); return; }
          this.scheduleCue(msg.at, msg.d);
          return;
        }
        case "error": this.events.onError(msg.msg); return;
      }
    };

    this.ws.onclose = () => {
      this.events.onStatus("closed");
      clearInterval(this.pingTimer);
      // ניסיון חיבור מחדש — אבל לא אחרי close() מכוון ולא לחדר שמעולם לא קיבל אותנו.
      // backoff אקספוננציאלי עם jitter מלא: 0.75-1.5ש' → ... → עד 30ש'. ככה נפילת רשת
      // באולם לא הופכת לסערת התחברות שמפילה את השרת (thundering herd).
      if (this.closedByUs || !this.everWelcomed) return;
      const base = Math.min(30_000, 1500 * Math.pow(2, this.reconnectAttempt++));
      const delay = base * (0.5 + Math.random() * 0.5);
      setTimeout(() => {
        // טאב מוסתר ברגע הזה (טלפון נעול) — לא מוותרים על החיבור: מתחברים ברגע שחוזרים לדף
        if (document.visibilityState === "visible") this.connect(name, emoji);
        else this.waitVisible = true;
      }, delay);
    };
  }

  private scheduleCue(at: number, d: GameServerMsg) {
    const delay = Math.max(0, this.untilServer(at));
    window.setTimeout(() => this.events.onCue(d, at), delay);
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
    this.closedByUs = true;
    clearInterval(this.pingTimer);
    document.removeEventListener("visibilitychange", this.onVis);
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
