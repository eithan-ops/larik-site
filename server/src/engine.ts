/**
 * LARIK Games — מנוע החדרים (עצמאי מטרנספורט: עובד עם node-ws היום, PartyKit מחר)
 *
 * עקרון התזמון: לשרת יש שעון אחד (now()). כל אירוע שדורש בו-זמניות
 * נשלח כ-cue עם זמן-שרת עתידי; הלקוחות, שמסונכרנים ±20ms, מבצעים יחד.
 */
import type {
  ClientMsg, ServerMsg, RoomSnapshot, PlayerInfo, GameServerMsg, GameClientMsg, CeremonyInfo,
} from "../../shared/protocol";

export interface Transport {
  send(playerId: string, msg: ServerMsg): void;
}

export interface GameEndResult {
  title: string;
  winnerId?: string;
  loserId?: string;
  scores?: Record<string, number>;
}

export interface GameCtx {
  players(): PlayerInfo[];
  connectedPlayers(): PlayerInfo[];
  now(): number;
  sendTo(pid: string, d: GameServerMsg): void;
  broadcast(d: GameServerMsg): void;
  /** משדר cue לביצוע בו-זמני בעוד delayMs; מחזיר את זמן-השרת שנקבע */
  cue(delayMs: number, d: GameServerMsg, only?: string[]): number;
  timer(ms: number, fn: () => void): NodeJS.Timeout;
  end(result: GameEndResult): void;
  config: unknown;
}

export interface GameInstance {
  onStart(): void;
  onMessage(pid: string, d: GameClientMsg): void;
  onLeave?(pid: string): void;
  dispose(): void;
}

export type GameFactory = (ctx: GameCtx) => GameInstance;

const CUE_LEAD_MS = 350; // מרווח ביטחון מינימלי כדי שה-cue יגיע לכולם לפני זמן הביצוע

export class Room {
  code: string;
  private players = new Map<string, PlayerInfo>();
  private phase: RoomSnapshot["phase"] = "lobby";
  private hostId = "";
  private gameId?: string;
  private gameConfig: unknown;
  private game?: GameInstance;
  private ceremony?: CeremonyInfo;
  private eveningScores: Record<string, number> = {};
  private timers = new Set<NodeJS.Timeout>();

  private transport: Transport;
  private gameFactories: Record<string, GameFactory>;
  private clock: () => number;

  constructor(
    code: string,
    transport: Transport,
    gameFactories: Record<string, GameFactory>,
    clock: () => number = () => Date.now()
  ) {
    this.code = code;
    this.transport = transport;
    this.gameFactories = gameFactories;
    this.clock = clock;
  }

  now() { return this.clock(); }

  /* ---------- חיבור שחקנים ---------- */

  join(pid: string, name: string, emoji: string): void {
    const existing = this.players.get(pid);
    if (existing) {
      existing.connected = true;
      existing.name = name || existing.name;
    } else {
      const isFirst = this.players.size === 0;
      this.players.set(pid, {
        id: pid, name: name.slice(0, 16) || "שחקן", emoji: emoji || "🙂",
        armed: false, connected: true, isHost: isFirst,
      });
      if (isFirst) this.hostId = pid;
    }
    this.transport.send(pid, { t: "welcome", playerId: pid, room: this.snapshot() });
    this.broadcastRoom();
  }

  disconnect(pid: string) {
    const p = this.players.get(pid);
    if (!p) return;
    p.connected = false;
    this.game?.onLeave?.(pid);
    // מארח שהתנתק — הבא בתור יורש
    if (pid === this.hostId) {
      const next = [...this.players.values()].find((x) => x.connected);
      if (next) { this.hostId = next.id; next.isHost = true; p.isHost = false; }
    }
    this.broadcastRoom();
  }

  get isEmpty() { return ![...this.players.values()].some((p) => p.connected); }

  /* ---------- הודעות ---------- */

  onMessage(pid: string, msg: ClientMsg) {
    const p = this.players.get(pid);
    switch (msg.t) {
      case "ping":
        // מענה מיידי — קריטי לדיוק הסנכרון; בלי שום עיבוד באמצע
        this.transport.send(pid, { t: "pong", t0: msg.t0, ts: this.now() });
        return;
      case "arm":
        if (p) { p.armed = true; this.broadcastRoom(); }
        return;
      case "select_game":
        if (pid !== this.hostId || this.phase === "game") return;
        this.gameId = msg.gameId;
        this.gameConfig = msg.config;
        this.broadcastRoom();
        return;
      case "start_game": {
        if (pid !== this.hostId || this.phase === "game" || !this.gameId) return;
        const factory = this.gameFactories[this.gameId];
        if (!factory) { this.transport.send(pid, { t: "error", msg: "משחק לא קיים" }); return; }
        this.phase = "game";
        this.ceremony = undefined;
        this.game = factory(this.makeCtx());
        this.broadcastRoom();
        this.game.onStart();
        return;
      }
      case "back_to_lobby":
        if (pid !== this.hostId) return;
        this.teardownGame();
        this.phase = "lobby";
        this.broadcastRoom();
        return;
      case "game":
        if (this.phase === "game" && this.game) this.game.onMessage(pid, msg.d);
        return;
    }
  }

  /* ---------- הקשר שניתן למשחק ---------- */

  private makeCtx(): GameCtx {
    return {
      players: () => [...this.players.values()],
      connectedPlayers: () => [...this.players.values()].filter((p) => p.connected),
      now: () => this.now(),
      sendTo: (pid, d) => this.transport.send(pid, { t: "game", d }),
      broadcast: (d) => this.broadcastGame(d),
      cue: (delayMs, d, only) => {
        const at = this.now() + Math.max(delayMs, CUE_LEAD_MS);
        const msg: ServerMsg = { t: "cue", at, d };
        const targets = only ?? [...this.players.keys()];
        for (const pid of targets) this.transport.send(pid, msg);
        return at;
      },
      timer: (ms, fn) => {
        const h = setTimeout(() => { this.timers.delete(h); fn(); }, ms);
        this.timers.add(h);
        return h;
      },
      end: (result) => this.endGame(result),
      config: this.gameConfig,
    };
  }

  private endGame(result: GameEndResult) {
    // ניקוד ערב: מנצח +3, כולם חוץ מהליצן +1
    for (const p of this.players.values()) {
      const base = this.eveningScores[p.id] ?? 0;
      const gain = p.id === result.winnerId ? 3 : p.id === result.loserId ? 0 : 1;
      this.eveningScores[p.id] = base + gain;
    }
    this.ceremony = {
      title: result.title,
      winnerId: result.winnerId,
      loserId: result.loserId,
      scores: result.scores,
      eveningScores: { ...this.eveningScores },
    };
    this.teardownGame();
    this.phase = "ceremony";
    this.broadcastRoom();
  }

  private teardownGame() {
    for (const h of this.timers) clearTimeout(h);
    this.timers.clear();
    this.game?.dispose();
    this.game = undefined;
  }

  /* ---------- שידור ---------- */

  private broadcastGame(d: GameServerMsg) {
    for (const pid of this.players.keys()) this.transport.send(pid, { t: "game", d });
  }

  private broadcastRoom() {
    const msg: ServerMsg = { t: "room", room: this.snapshot() };
    for (const pid of this.players.keys()) this.transport.send(pid, msg);
  }

  snapshot(): RoomSnapshot {
    return {
      code: this.code,
      phase: this.phase,
      players: [...this.players.values()],
      hostId: this.hostId,
      gameId: this.gameId,
      gameConfig: this.gameConfig,
      ceremony: this.ceremony,
    };
  }
}

/* ---------- ניהול חדרים ---------- */

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // בלי I/O מבלבלים

export class RoomManager {
  rooms = new Map<string, Room>();
  private transport: Transport;
  private gameFactories: Record<string, GameFactory>;

  constructor(transport: Transport, gameFactories: Record<string, GameFactory>) {
    this.transport = transport;
    this.gameFactories = gameFactories;
  }

  createRoom(): Room {
    let code = "";
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
    } while (this.rooms.has(code));
    const room = new Room(code, this.transport, this.gameFactories);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string) { return this.rooms.get(code.toUpperCase()); }

  cleanup() {
    for (const [code, room] of this.rooms) if (room.isEmpty) this.rooms.delete(code);
  }
}
