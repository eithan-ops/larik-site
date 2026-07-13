/**
 * LARIK Games — הפרוטוקול המשותף (לקוח ↔ שרת)
 * כל הזמנים במילישניות של "שעון השרת" — הלקוח ממיר דרך שכבת הסנכרון.
 */

export interface PlayerInfo {
  id: string;
  name: string;
  emoji: string;
  armed: boolean; // עבר את מסך "חמש את הטלפון"
  connected: boolean;
  isHost: boolean;
}

export type RoomPhase = "lobby" | "game" | "ceremony";

export interface CeremonyInfo {
  title: string;
  winnerId?: string;
  loserId?: string;
  scores?: Record<string, number>; // ניקוד המשחק שנגמר
  eveningScores: Record<string, number>; // לוח הערב המצטבר
}

export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  players: PlayerInfo[];
  hostId: string;
  gameId?: string;
  gameConfig?: unknown;
  ceremony?: CeremonyInfo;
}

/* ---- לקוח → שרת ---- */
export type ClientMsg =
  | { t: "join"; name: string; emoji: string; rejoinId?: string }
  | { t: "arm" } // הטלפון חומש (אודיו+חיישנים)
  | { t: "ping"; t0: number } // סנכרון שעונים
  | { t: "select_game"; gameId: string; config?: unknown } // מארח בלבד
  | { t: "start_game" } // מארח בלבד
  | { t: "back_to_lobby" } // מארח בלבד
  | { t: "game"; d: GameClientMsg }; // מועבר למודול המשחק

/* ---- שרת → לקוח ---- */
export type ServerMsg =
  | { t: "welcome"; playerId: string; room: RoomSnapshot }
  | { t: "pong"; t0: number; ts: number } // ts = זמן שרת
  | { t: "room"; room: RoomSnapshot }
  | { t: "game"; d: GameServerMsg } // אירוע משחק מיידי
  | { t: "cue"; at: number; d: GameServerMsg } // אירוע מתוזמן: לבצע בזמן-שרת at
  | { t: "error"; msg: string };

/* ---- הודעות משחק (מזוהות לפי a) ---- */
// על המצח
export type ForeheadClientMsg =
  | { a: "fh_placed" } | { a: "fh_removed" }
  | { a: "fh_guess" } // בעל התור מכריז ניחוש
  | { a: "fh_vote"; ok: boolean }
  | { a: "fh_peek" }; // הג'ירו תפס הצצה

export type ForeheadServerMsg =
  | { a: "fh_deal"; card: string; deckName: string } // אישי
  | { a: "fh_wait_placed"; placed: string[]; total: number }
  | { a: "fh_begin" } // cue
  | { a: "fh_turn"; pid: string; until: number }
  | { a: "fh_vote_req"; pid: string; card: string; until: number } // לכולם חוץ מהמנחש
  | { a: "fh_saved"; pid: string; rank: number; card: string }
  | { a: "fh_wrong"; pid: string }
  | { a: "fh_cheater"; pid: string } // cue — אזעקה אצל כולם
  | { a: "fh_state"; saved: string[]; order: string[]; turn: string };

// פודים
export type PodsClientMsg =
  | { a: "pd_tap"; lightId: number; atServer: number }; // זמן הנגיעה במונחי שעון-שרת

export type PodsServerMsg =
  | { a: "pd_mode"; mode: "king" | "survival"; colors?: Record<string, string> }
  | { a: "pd_runner"; pid: string; until: number } // מלך המהירות: תור של שחקן
  | { a: "pd_light"; lightId: number; podId: string; color: string; at: number } // cue: פוד נדלק
  | { a: "pd_off"; lightId: number } // cue/מיידי: כיבוי
  | { a: "pd_hit"; lightId: number; pid: string; reactionMs: number }
  | { a: "pd_miss"; lightId: number; pid: string } // הישרדות: פספוס
  | { a: "pd_eliminated"; pid: string }
  | { a: "pd_score"; scores: Record<string, number>; avgMs?: Record<string, number> };

export type GameClientMsg = ForeheadClientMsg | PodsClientMsg;
export type GameServerMsg = ForeheadServerMsg | PodsServerMsg;

/* ---- קטלוג ---- */
export interface GameMeta {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  configOptions?: { key: string; label: string; values: { v: string; label: string }[] }[];
}

export const CATALOG: GameMeta[] = [
  {
    id: "forehead",
    name: "על המצח",
    icon: "🤳",
    tagline: "כולם רואים מי אתה. חוץ ממך.",
    minPlayers: 3,
    maxPlayers: 10,
    configOptions: [
      {
        key: "deck",
        label: "חפיסה",
        values: [
          { v: "animals", label: "חיות 🐨" },
          { v: "celebs", label: "מפורסמים 🌟" },
          { v: "food", label: "אוכל 🍕" },
          { v: "cartoons", label: "מצוירים 🦸" },
        ],
      },
    ],
  },
  {
    id: "pods",
    name: "פודים",
    icon: "⚡",
    tagline: "פוד נדלק — חוטפים אותו.",
    minPlayers: 2,
    maxPlayers: 10,
    configOptions: [
      {
        key: "mode",
        label: "מצב",
        values: [
          { v: "king", label: "מלך המהירות 👑" },
          { v: "survival", label: "הישרדות 💀" },
        ],
      },
    ],
  },
];
