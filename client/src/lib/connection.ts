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
import { currentLang } from "./locale";
import type { ClientMsg, ServerMsg, RoomSnapshot, GameServerMsg, LText } from "../../../shared/protocol";
import { myGpid } from "./group";
import { seenBlob } from "./seen";

export type CueHandler = (d: GameServerMsg, at: number) => void;

export interface ConnectionEvents {
  onRoom(room: RoomSnapshot): void;
  onGame(d: GameServerMsg): void;
  /** אירוע מתוזמן — ייקרא בדיוק בזמן (סטייה אופיינית <30ms) */
  onCue: CueHandler;
  onError(msg: LText): void; // מפתח+פרמטרים מהשרת — Room מריץ lt()
  onWelcome(playerId: string, room: RoomSnapshot): void;
  onStatus(s: "connecting" | "open" | "closed"): void;
}

const PING_ROUNDS = 8;
const PING_INTERVAL = 15_000;
/** בלי שום הודעה מהשרת כל הזמן הזה, בזמן שהדף גלוי = סוקט זומבי (יש פינג כל 15ש', אז זה לא אמור לקרות) */
const STALE_MS = 25_000;
/** חזרה לדף אחרי נעילה: מחכים לתשובה לפינג זמן קצר — לא ענה = מתחברים מחדש מיד, לא אחרי דקה */
const WAKE_PROBE_MS = 3_500;
/** תקרת ה-backoff (היה 30ש'). בערב בסלון 30ש' של "מתחבר…" מרגישים כמו "נזרקתי מהמשחק" */
const MAX_BACKOFF_MS = 10_000;

/**
 * ה-pid של המכשיר בחדר נשמר ב-localStorage (היה sessionStorage, שמת עם הטאב).
 * זה מה שמאפשר לחזור לאותו כיסא גם אחרי שהדפדפן הרג את הטאב ברקע, או כשפותחים שוב
 * את הקישור מוואטסאפ (טאב חדש). נשמר 12 שעות — ערב אחד.
 */
const PID_TTL_MS = 12 * 3600_000;
export function savedPid(code: string): string {
  const k = `larik-pid-${code}`;
  try {
    const raw = localStorage.getItem(k);
    if (raw) {
      const [pid, ts] = raw.split("|");
      if (pid && Date.now() - Number(ts || 0) < PID_TTL_MS) return pid;
      localStorage.removeItem(k);
    }
  } catch { /* אין אחסון */ }
  try { return sessionStorage.getItem(k) || ""; } catch { return ""; }
}
function savePid(code: string, pid: string) {
  const k = `larik-pid-${code}`;
  try { localStorage.setItem(k, `${pid}|${Date.now()}`); } catch { /* מצב פרטי */ }
  try { sessionStorage.setItem(k, pid); } catch { /* מצב פרטי */ }
}

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
  /** השרת סגר אותנו כי אותו מכשיר התחבר מטאב אחר (קוד 4001) — לא חוזרים לבד, רק כשחוזרים לטאב הזה */
  private replaced = false;
  private lastMsgAt = 0;
  private reconnectTimer?: number;
  private watchdogTimer?: number;
  private wakeProbe?: number;
  /** היינו המארח — אם השרת עלה מחדש ומקים את החדר מחדש, הכתר חוזר אלינו */
  wasHost = false;
  private onVis = () => {
    if (document.visibilityState !== "visible" || this.closedByUs) return;
    if (this.waitVisible || this.replaced) {
      this.waitVisible = false; this.replaced = false;
      this.reconnectNow();
      return;
    }
    // חזרנו מנעילת מסך/אפליקציה אחרת: הסוקט נראה פתוח אבל ייתכן שהמערכת חנקה אותו מזמן.
    // שולחים פינג; אם לא הגיע כלום תוך 3.5ש' — מתחברים מחדש עכשיו (ולא מחכים לטיימאוט של TCP).
    if (this.open) {
      const before = this.lastMsgAt;
      this.send({ t: "ping", t0: performance.now() });
      clearTimeout(this.wakeProbe);
      this.wakeProbe = window.setTimeout(() => { if (this.lastMsgAt === before) this.kick(); }, WAKE_PROBE_MS);
    } else {
      this.reconnectNow();
    }
  };
  /** הרשת חזרה (וויי-פיי ↔ סלולר) — לא מחכים ל-backoff */
  private onOnline = () => { if (!this.closedByUs && !this.open) this.reconnectNow(); };

  /** מבטל backoff ממתין ומתחבר עכשיו (אם אין כבר חיבור חי/בדרך) */
  private reconnectNow() {
    if (this.closedByUs) return;
    clearTimeout(this.reconnectTimer);
    const st = this.ws?.readyState;
    if (st === WebSocket.OPEN || st === WebSocket.CONNECTING) return;
    this.reconnectAttempt = 0;
    this.connect(this.name, this.emoji);
  }

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
    const ws = this.ws;
    const st = ws?.readyState;
    if (st === WebSocket.OPEN || st === WebSocket.CONNECTING) {
      // סוקט זומבי: close() רגיל מחכה ללחיצת-יד שלא תגיע, ו-onclose עלול להתעכב עשרות שניות.
      // מנתקים אותו מהטיפול שלנו ומתחברים מיד בסוקט חדש.
      this.detach(ws!);
      try { ws!.close(); } catch { /* לא משנה */ }
      this.events.onStatus("closed");
      this.reconnectAttempt = 0;
      this.connect(this.name, this.emoji);
    } else if (st === undefined || st === WebSocket.CLOSED || st === WebSocket.CLOSING) this.reconnectNow();
  }

  /** סוקט ישן שלא שלנו יותר — שום אירוע שלו לא נוגע במצב (מונע כפילויות ו"התנתקתי" שקרי) */
  private detach(ws: WebSocket) {
    ws.onopen = null; ws.onmessage = null; ws.onclose = null; ws.onerror = null;
    clearInterval(this.pingTimer);
  }

  connect(name: string, emoji: string) {
    this.name = name; this.emoji = emoji;
    if (this.closedByUs) return;
    clearTimeout(this.reconnectTimer);
    document.removeEventListener("visibilitychange", this.onVis);
    document.addEventListener("visibilitychange", this.onVis);
    window.removeEventListener("online", this.onOnline);
    window.addEventListener("online", this.onOnline);
    if (this.ws) this.detach(this.ws);
    const pid = savedPid(this.roomCode);
    const gpid = myGpid();
    const url = `${this.serverUrl}/ws?room=${this.roomCode}`
      + (pid ? `&pid=${encodeURIComponent(pid)}` : "")
      + (gpid ? `&gpid=${encodeURIComponent(gpid)}` : "")
      + (this.wasHost ? "&h=1" : "");
    this.events.onStatus("connecting");
    const ws = new WebSocket(url);
    this.ws = ws;
    this.lastMsgAt = performance.now();
    // כלב שמירה: דף גלוי + שקט ארוך מהשרת (למרות פינג כל 15ש') = החיבור מת בלי שנודע לנו
    clearInterval(this.watchdogTimer);
    this.watchdogTimer = window.setInterval(() => {
      if (this.ws !== ws || document.visibilityState !== "visible") return;
      if (ws.readyState === WebSocket.OPEN && performance.now() - this.lastMsgAt > STALE_MS) this.kick();
      // חיבור שנתקע ב"מתחבר…" (רשת גרועה באולם) — מנסים שוב במקום לחכות לנצח
      else if (ws.readyState === WebSocket.CONNECTING && performance.now() - this.lastMsgAt > 12_000) this.kick();
    }, 5_000);

    ws.onopen = () => {
      this.lastMsgAt = performance.now();
      this.events.onStatus("open");
      // gpid = הזהות היציבה של המכשיר, מה שמאפשר לעונה של החבורה לזכור אותו
      this.send({ t: "join", name, emoji, gpid, seen: seenBlob(), lang: currentLang() });
      this.syncClock();
      clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.syncClock(), PING_INTERVAL);
    };

    ws.onmessage = (ev) => {
      this.lastMsgAt = performance.now();
      let msg: ServerMsg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.t) {
        case "welcome":
          this.everWelcomed = true;
          this.reconnectAttempt = 0; // חזרנו — מאפסים את הענישה
          this.playerId = msg.playerId;
          this.wasHost = msg.playerId === msg.room.hostId;
          savePid(this.roomCode, msg.playerId);
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
        case "room":
          if (this.playerId) this.wasHost = msg.room.hostId === this.playerId;
          this.events.onRoom(msg.room); return;
        case "game": this.events.onGame(msg.d); return;
        case "cue": {
          if (!this.synced) { this.pendingCues.push({ at: msg.at, d: msg.d }); return; }
          this.scheduleCue(msg.at, msg.d);
          return;
        }
        case "error": this.events.onError(msg.msg); return;
      }
    };

    ws.onclose = (ev) => {
      if (this.ws !== ws) return; // סוקט ישן — כבר הוחלף
      this.events.onStatus("closed");
      clearInterval(this.pingTimer);
      // ניסיון חיבור מחדש — אבל לא אחרי close() מכוון ולא לחדר שמעולם לא קיבל אותנו.
      if (this.closedByUs) return;
      // עוד לא נכנסנו: קוד שגוי/חדר שנסגר מגיעים כ-error מהשרת (ומסך שגיאה), אבל רשת שנפלה
      // בדיוק ברגע ההצטרפות לא אמורה להשאיר ספינר נצחי — עוד שני ניסיונות ואז מוותרים
      if (!this.everWelcomed && this.reconnectAttempt >= 2) return;
      // אותו מכשיר התחבר מטאב אחר — לא נלחמים עליו; חוזרים רק כשהטאב הזה שוב גלוי
      if (ev.code === 4001) { this.replaced = true; return; }
      // backoff אקספוננציאלי עם jitter: 0.75-1.5ש' → ... → עד 10ש'. ה-jitter הוא מה ששומר
      // שנפילת רשת באולם לא תהפוך לסערת התחברות (thundering herd), גם עם תקרה נמוכה יותר.
      const base = Math.min(MAX_BACKOFF_MS, 1500 * Math.pow(2, this.reconnectAttempt++));
      const delay = base * (0.5 + Math.random() * 0.5);
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = window.setTimeout(() => {
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
    clearInterval(this.watchdogTimer);
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.wakeProbe);
    document.removeEventListener("visibilitychange", this.onVis);
    window.removeEventListener("online", this.onOnline);
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
