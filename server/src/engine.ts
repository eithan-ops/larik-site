/**
 * LARIK Games — מנוע החדרים (עצמאי מטרנספורט: עובד עם node-ws היום, PartyKit מחר)
 *
 * עקרון התזמון: לשרת יש שעון אחד (now()). כל אירוע שדורש בו-זמניות
 * נשלח כ-cue עם זמן-שרת עתידי; הלקוחות, שמסונכרנים ±20ms, מבצעים יחד.
 */
import type {
  ClientMsg, ServerMsg, RoomSnapshot, PlayerInfo, GameServerMsg, GameClientMsg, CeremonyInfo,
  PlayerFacts,
} from "../../shared/protocol";
import { CATALOG } from "../../shared/protocol";
import { mergeFacts, computeAwards } from "./awards";
import { Groups } from "./groups";
import type { GroupSummary } from "../../shared/protocol";

export interface Transport {
  send(playerId: string, msg: ServerMsg): void;
}

export interface GameEndResult {
  title: string;
  winnerId?: string;
  /** תיקו: כל המנצחים — כולם מקבלים +3 בלוח הערב */
  winnerIds?: string[];
  loserId?: string;
  scores?: Record<string, number>;
  /**
   * עובדות ייעודיות למנוע התארים — אופציונלי לגמרי.
   * המשחק מדווח מה קרה ("זמן התגובה הכי טוב היה 410ms"), לא מה זה אומר.
   * העובדות הבסיסיות (ניצחונות, ליצן, נקודות) נצברות אוטומטית ולא צריך לדווח אותן.
   */
  facts?: Record<string, PlayerFacts>;
}

export interface GameCtx {
  players(): PlayerInfo[];
  connectedPlayers(): PlayerInfo[];
  /** משתתפי המשחק הרץ (מי שהיה מחובר בהתחלה) — מצטרפים מאוחרים אינם כאן */
  participants(): PlayerInfo[];
  now(): number;
  sendTo(pid: string, d: GameServerMsg): void;
  broadcast(d: GameServerMsg): void;
  /** משדר cue לביצוע בו-זמני בעוד delayMs; מחזיר את זמן-השרת שנקבע */
  cue(delayMs: number, d: GameServerMsg, only?: string[]): number;
  timer(ms: number, fn: () => void): NodeJS.Timeout;
  end(result: GameEndResult): void;
  /**
   * דיווח עובדות תוך כדי משחק — למשחקים שלא נגמרים ב-end() (כמו המתחזה,
   * שרץ בסיבובים עד שהמארח יוצא). בלי זה הם לא היו מזינים תארים בכלל.
   */
  reportFacts(facts: Record<string, PlayerFacts>): void;
  config: unknown;
}

export interface GameInstance {
  /** מותר להצטרף באמצע (מופע וכד') — מצטרף חדש נכנס מיד כמשתתף דרך onRejoin */
  allowMidJoin?: boolean;
  onStart(): void;
  onMessage(pid: string, d: GameClientMsg): void;
  /** permanent=true רק בעזיבה מרצון; ניתוק רגעי (reload) מגיע עם false — לא להעניש */
  onLeave?(pid: string, permanent?: boolean): void;
  /** שחקן מהמשחק חזר אחרי reload/ניתוק — לשלוח לו מחדש את המצב שהוא צריך כדי להמשיך */
  onRejoin?(pid: string): void;
  dispose(): void;
}

export type GameFactory = (ctx: GameCtx) => GameInstance;

/** ווי אנליטיקה — אופציונלי לגמרי (הבדיקות לא מעבירות אותו) */
export interface StatHooks {
  playerJoined?: () => void;
  gameStarted?: (gameId: string) => void;
}

const CUE_LEAD_MS = 350; // מרווח ביטחון מינימלי כדי שה-cue יגיע לכולם לפני זמן הביצוע

export class Room {
  code: string;
  private players = new Map<string, PlayerInfo>();
  private phase: RoomSnapshot["phase"] = "lobby";
  private hostId = "";
  private hostGrace?: NodeJS.Timeout; // מארח שהתנתק זמנית (נעילת מסך/מעבר לרקע) — לא מעבירים מיד
  private gameId?: string;
  private gameConfig: unknown;
  private game?: GameInstance;
  private ceremony?: CeremonyInfo;
  private eveningScores: Record<string, number> = {};
  private eveningFacts: Record<string, PlayerFacts> = {}; // הזיכרון של הערב — מזין את התארים
  groupId?: string;                    // החבורה שהחדר משויך אליה
  private groupSummary?: GroupSummary;  // התקציר האחרון — מוצג בלובי ובטקס
  private groupApplied = 0;             // כמה משחקים כבר נזקפו לעונה (מונע ספירה כפולה)
  private groupPointsApplied: Record<string, number> = {}; // כמה נקודות כבר נזקפו לכל שחקן
  private groups?: Groups;
  private winStreak: Record<string, number> = {};         // רצף ניצחונות רץ (לא נשמר בעובדות)
  private wonGameIds: Record<string, Set<string>> = {};   // באילו משחקים שונים ניצח
  private gamesPlayed = 0;
  private timers = new Set<NodeJS.Timeout>();
  private gamePids: string[] = []; // משתתפי המשחק הרץ — ננעל ברגע ההתחלה
  private gotIt = new Set<string>(); // מי אישר "הבנתי" על המשחק שנבחר

  private transport: Transport;
  private gameFactories: Record<string, GameFactory>;
  private clock: () => number;
  private hooks: StatHooks;

  constructor(
    code: string,
    transport: Transport,
    gameFactories: Record<string, GameFactory>,
    clock: () => number = () => Date.now(),
    hooks: StatHooks = {},
    groups?: Groups
  ) {
    this.code = code;
    this.transport = transport;
    this.gameFactories = gameFactories;
    this.clock = clock;
    this.hooks = hooks;
    this.groups = groups;
  }

  /** שיוך החדר לחבורה קיימת — נקרא מיצירת החדר (`/api/create-room?g=...`) */
  async attachGroup(id: string) {
    if (!this.groups) return;
    const g = await this.groups.get(id);
    if (!g) return;
    this.groupId = g.id;
    this.groupSummary = this.groups.summarize(g);
    this.broadcastRoom();
  }

  now() { return this.clock(); }

  /* ---------- חיבור שחקנים ---------- */

  join(pid: string, name: string, emoji: string, gpid?: string): void {
    const existing = this.players.get(pid);
    if (existing) {
      existing.connected = true;
      existing.name = name || existing.name;
      if (gpid) existing.gpid = gpid;
      // המפעיל חזר תוך זמן החסד — מבטלים את העברת התפקיד ומשחזרים אותו כמפעיל
      if (pid === this.hostId) { clearTimeout(this.hostGrace); this.hostGrace = undefined; existing.isHost = true; }
      // חוזר באמצע משחק שהוא חלק ממנו — המשחק ישדר לו מחדש את המצב
      if (this.phase === "game" && this.gamePids.includes(pid)) {
        this.transport.send(pid, { t: "welcome", playerId: pid, room: this.snapshot() });
        this.broadcastRoom();
        this.game?.onRejoin?.(pid);
        return;
      }
    } else {
      const isFirst = this.players.size === 0;
      this.players.set(pid, {
        id: pid, gpid, name: name.slice(0, 16) || "שחקן", emoji: emoji || "🙂",
        armed: false, connected: true, isHost: isFirst,
      });
      if (isFirst) this.hostId = pid;
      this.hooks.playerJoined?.();
    }
    // מצטרף חדש באמצע משחק שמתיר זאת (מופע) — נכנס מיד כמשתתף
    if (this.phase === "game" && this.game?.allowMidJoin && !this.gamePids.includes(pid)) {
      this.gamePids.push(pid);
      this.transport.send(pid, { t: "welcome", playerId: pid, room: this.snapshot() });
      this.broadcastRoom();
      this.game.onRejoin?.(pid);
      return;
    }
    this.transport.send(pid, { t: "welcome", playerId: pid, room: this.snapshot() });
    this.broadcastRoom();
  }

  disconnect(pid: string) {
    const p = this.players.get(pid);
    if (!p) return;
    p.connected = false;
    this.game?.onLeave?.(pid, false);
    // מארח שהתנתק — לא מעבירים מיד! נעילת מסך / מעבר להודעות = ניתוק זמני,
    // וה-auto-reconnect מחזיר אותו כמפעיל. מעבירים את התפקיד רק אם באמת נעלם 60ש'.
    // (אחרת: המפעיל עובר לרגע להודעות, וטלפון של הקהל "יורש" את הקונסולה — הבאג.)
    if (pid === this.hostId) {
      clearTimeout(this.hostGrace);
      this.hostGrace = setTimeout(() => {
        this.hostGrace = undefined;
        const cur = this.players.get(this.hostId);
        if (cur?.connected) return; // המפעיל חזר בינתיים — לא נוגעים
        const next = [...this.players.values()].find((x) => x.connected);
        if (next) { if (cur) cur.isHost = false; this.hostId = next.id; next.isHost = true; this.broadcastRoom(); }
      }, 60_000);
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
      case "select_game": {
        if (pid !== this.hostId || this.phase === "game") return;
        const changed = this.gameId !== msg.gameId;
        this.gameId = msg.gameId;
        this.gameConfig = msg.config;
        if (changed) this.gotIt.clear(); // משחק חדש = כולם קוראים הסבר מחדש
        this.broadcastRoom();
        return;
      }
      case "save_group": {
        // הרגע הנכון היחיד לבקש את זה הוא בסוף ערב מוצלח, כשכולם עוד צוחקים
        if (pid !== this.hostId || !this.groups || this.groupId) return;
        const members = [...this.players.values()].map((x) => ({
          pid: this.stablePid(x), name: x.name, emoji: x.emoji,
        }));
        this.groups.create(msg.name, members).then((g) => {
          this.groupId = g.id;
          this.groupApplied = 0;
          // הערב שכבר שוחק נזקף לחבורה מיד — אחרת הוא היה הולך לאיבוד
          return this.syncGroup();
        }).catch(() => { /* אחסון נפל — הערב ממשיך בלי עונה */ });
        return;
      }
      case "rename_group": {
        if (pid !== this.hostId || !this.groups || !this.groupId) return;
        this.groups.rename(this.groupId, msg.name)
          .then((g) => { if (g) { this.groupSummary = this.groups!.summarize(g); this.broadcastRoom(); } })
          .catch(() => { /* לא קריטי */ });
        return;
      }
      case "got_it":
        if (this.phase !== "lobby" || !this.gameId) return;
        this.gotIt.add(pid);
        this.broadcastRoom();
        return;
      case "start_game": {
        if (pid !== this.hostId || this.phase === "game" || !this.gameId) return;
        const factory = this.gameFactories[this.gameId];
        if (!factory) { this.transport.send(pid, { t: "error", msg: "משחק לא קיים" }); return; }
        // אכיפת מינימום שחקנים גם בשרת — לא סומכים רק על הלקוח
        const meta = CATALOG.find((g) => g.id === this.gameId);
        const connected = [...this.players.values()].filter((x) => x.connected);
        if (meta && connected.length < meta.minPlayers) {
          this.transport.send(pid, { t: "error", msg: `צריך לפחות ${meta.minPlayers} שחקנים` });
          return;
        }
        this.phase = "game";
        this.ceremony = undefined;
        this.gamePids = connected.map((x) => x.id);
        this.game = factory(this.makeCtx());
        this.hooks.gameStarted?.(this.gameId);
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
      case "leave": {
        // עזיבה מרצון — מוסרים לגמרי (בשונה מניתוק, שמשאיר "נרדם")
        const leaving = this.players.get(pid);
        if (!leaving) return;
        this.game?.onLeave?.(pid, true);
        this.players.delete(pid);
        // עזיבה מרצון = כוונה מפורשת, מעבירים מיד (בשונה מניתוק זמני)
        if (pid === this.hostId) {
          clearTimeout(this.hostGrace); this.hostGrace = undefined;
          const next = [...this.players.values()].find((x) => x.connected);
          if (next) { this.hostId = next.id; next.isHost = true; }
        }
        this.gamePids = this.gamePids.filter((x) => x !== pid);
        this.broadcastRoom();
        return;
      }
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
      participants: () => [...this.players.values()].filter((p) => this.gamePids.includes(p.id)),
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
      reportFacts: (facts) => {
        for (const [pid, add] of Object.entries(facts)) {
          if (!this.players.has(pid)) continue;
          mergeFacts((this.eveningFacts[pid] ??= {}), add);
        }
      },
      config: this.gameConfig,
    };
  }

  private endGame(result: GameEndResult) {
    const winners = result.winnerIds?.length ? result.winnerIds : result.winnerId ? [result.winnerId] : [];
    const endedGameId = this.gameId ?? "game";
    this.gamesPlayed += 1;
    // ניקוד ערב: כל מנצח (גם בתיקו) +3, כולם חוץ מהליצן +1
    for (const p of this.players.values()) {
      const base = this.eveningScores[p.id] ?? 0;
      const gain = winners.includes(p.id) ? 3 : p.id === result.loserId ? 0 : 1;
      this.eveningScores[p.id] = base + gain;
    }
    this.collectFacts(result, winners, endedGameId);
    this.ceremony = {
      title: result.title,
      winnerId: winners[0],
      winnerIds: winners.length ? winners : undefined,
      loserId: result.loserId,
      scores: result.scores,
      eveningScores: { ...this.eveningScores },
      awards: computeAwards(this.eveningFacts),
      gamesPlayed: this.gamesPlayed,
      group: this.groupSummary,
    };
    this.teardownGame();
    this.phase = "ceremony";
    this.broadcastRoom();
    // העונה מתעדכנת אחרי השידור — כשהאחסון עונה, נשלח שידור נוסף עם הטבלה.
    // הטקס לא מחכה לאף מסד; אם הוא איטי או מת, פשוט אין טבלה.
    void this.syncGroup().catch(() => { /* best-effort במכוון */ });
  }

  /**
   * מזהה יציב לחבורה: מה שהמכשיר שמר, ובהיעדרו מזהה החדר.
   * הנפילה הזו מכוונת — עדיף חבר שנספר פעמיים מערב שלא נשמר בכלל.
   */
  private stablePid(p: PlayerInfo): string {
    return p.gpid || p.id;
  }

  /**
   * זוקף לעונה את המשחקים שעדיין לא נזקפו, ומרענן את התקציר.
   * נקרא אחרי כל טקס; `groupApplied` הוא מה שמונע ספירה כפולה של אותו ערב.
   */
  private async syncGroup(): Promise<void> {
    if (!this.groups || !this.groupId) return;
    const first = this.groupApplied === 0;
    const players = [...this.players.values()].map((p) => {
      const c = this.ceremony;
      const winners = c?.winnerIds ?? (c?.winnerId ? [c.winnerId] : []);
      return {
        pid: this.stablePid(p),
        name: p.name,
        emoji: p.emoji,
        points: (this.eveningScores[p.id] ?? 0) - (this.groupPointsApplied[p.id] ?? 0),
        won: winners.includes(p.id),
        clown: c?.loserId === p.id,
      };
    });
    const factsByStable: Record<string, PlayerFacts> = {};
    for (const p of this.players.values()) factsByStable[this.stablePid(p)] = this.eveningFacts[p.id] ?? {};

    const g = await this.groups.applyGame(this.groupId, players, factsByStable, first);
    if (!g) return;
    for (const p of this.players.values()) this.groupPointsApplied[p.id] = this.eveningScores[p.id] ?? 0;
    this.groupApplied += 1;
    this.groupSummary = this.groups.summarize(g);
    if (this.ceremony) this.ceremony.group = this.groupSummary;
    this.broadcastRoom();
  }

  /**
   * צובר את עובדות הערב: קודם מה שנגזר אוטומטית מכל משחק (ניצחון/ליצן/נקודות/רצף),
   * ואז מה שהמשחק עצמו טרח לדווח. משחק שלא מדווח כלום עדיין מייצר תארים.
   */
  private collectFacts(result: GameEndResult, winners: string[], gameId: string) {
    // רק מי שבאמת השתתף במשחק שנגמר — מי שהצטרף באמצע לא מקבל עליו נתונים
    const took = this.gamePids.length ? this.gamePids : [...this.players.keys()];
    for (const pid of took) {
      const won = winners.includes(pid);
      this.winStreak[pid] = won ? (this.winStreak[pid] ?? 0) + 1 : 0;
      if (won) (this.wonGameIds[pid] ??= new Set()).add(gameId);
      const f = (this.eveningFacts[pid] ??= {});
      mergeFacts(f, { games: 1, wins: won ? 1 : 0, clown: pid === result.loserId ? 1 : 0 });
      f.bestStreak = Math.max(f.bestStreak ?? 0, this.winStreak[pid] ?? 0);
      f.wonGames = this.wonGameIds[pid]?.size ?? 0;
      f.points = this.eveningScores[pid] ?? 0;
    }
    for (const [pid, add] of Object.entries(result.facts ?? {})) {
      if (!this.players.has(pid)) continue;
      mergeFacts((this.eveningFacts[pid] ??= {}), add);
    }
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
      gamePids: this.phase === "game" ? [...this.gamePids] : undefined,
      gotIt: this.phase === "lobby" && this.gameId ? [...this.gotIt] : undefined,
      group: this.groupSummary,
    };
  }
}

/* ---------- ניהול חדרים ---------- */

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // בלי I/O מבלבלים

export class RoomManager {
  rooms = new Map<string, Room>();
  private transport: Transport;
  private gameFactories: Record<string, GameFactory>;
  private hooks: StatHooks;

  private groups?: Groups;

  constructor(transport: Transport, gameFactories: Record<string, GameFactory>, hooks: StatHooks = {}, groups?: Groups) {
    this.transport = transport;
    this.gameFactories = gameFactories;
    this.hooks = hooks;
    this.groups = groups;
  }

  createRoom(fixedCode?: string): Room {
    let code = fixedCode ?? "";
    if (!code) {
      do {
        code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
      } while (this.rooms.has(code));
    }
    const room = new Room(code, this.transport, this.gameFactories, undefined, this.hooks, this.groups);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string) { return this.rooms.get(code.toUpperCase()); }

  cleanup() {
    for (const [code, room] of this.rooms) if (room.isEmpty) this.rooms.delete(code);
  }
}
