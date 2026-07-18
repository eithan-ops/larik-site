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
  /** תיקו אמיתי = כמה מנצחים; תמיד כולל את winnerId */
  winnerIds?: string[];
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
  /** מי משתתף במשחק הרץ כרגע — מי שהצטרף אחרי ההתחלה מחכה בצד */
  gamePids?: string[];
}

/* ---- לקוח → שרת ---- */
export type ClientMsg =
  | { t: "join"; name: string; emoji: string; rejoinId?: string }
  | { t: "arm" } // הטלפון חומש (אודיו+חיישנים)
  | { t: "ping"; t0: number } // סנכרון שעונים
  | { t: "select_game"; gameId: string; config?: unknown } // מארח בלבד
  | { t: "start_game" } // מארח בלבד
  | { t: "back_to_lobby" } // מארח בלבד
  | { t: "leave" } // שחקן עוזב את החדר מרצונו (מוסר לגמרי מהרשימה)
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

// מטר הפצצות
export type BombType = "classic" | "sticky" | "chain" | "duo";

export type BombsClientMsg =
  | { a: "bm_pass"; bombId: number; to: string } // העברת פצצה לשחקן אחר
  | { a: "bm_unstuck"; bombId: number } // הדביקה שופשפה והשתחררה
  | { a: "bm_hold"; bombId: number; down: boolean }; // תאומה: מחזיק/עזב

export type BombsServerMsg =
  | { a: "bm_start"; lives: number }
  | { a: "bm_spawn"; bombId: number; type: BombType; holder: string; fuseMs: number; partner?: string } // cue — explodeAt = at + fuseMs
  | { a: "bm_pass"; bombId: number; from: string; to: string } // cue
  | { a: "bm_unstuck"; bombId: number }
  | { a: "bm_hold"; bombId: number; pid: string; down: boolean }
  | { a: "bm_defused"; bombId: number; by: string[] } // cue
  | { a: "bm_explode"; bombId: number; holder: string } // cue — בום אצל כולם באותה מילישנייה
  | { a: "bm_lives"; lives: number };

// חוקי הצבע
export type ColorRulesClientMsg =
  | { a: "cr_tap"; roundId: number; atServer: number };

export type ColorRulesServerMsg =
  | { a: "cr_begin"; lives: number }
  | { a: "cr_flash"; roundId: number; color: string; label: string; mustTap: boolean; at: number; until: number } // cue
  | { a: "cr_resolve"; roundId: number; out: string[]; alive: string[] }
  | { a: "cr_lives"; pid: string; lives: number };

// סימון מבוזר
export type SimonClientMsg =
  | { a: "sm_tap" };

export type SimonServerMsg =
  | { a: "sm_setup"; colors: Record<string, string>; lives: number }
  | { a: "sm_watch"; round: number } // התחלת שלב צפייה
  | { a: "sm_light"; pid: string; step: number; at: number } // cue — הטלפון של pid נדלק
  | { a: "sm_input"; round: number } // עכשיו תור השחקנים לשחזר
  | { a: "sm_progress"; index: number; pid: string } // הצליחו עד index
  | { a: "sm_wrong"; expected: string; got: string; lives: number }
  | { a: "sm_lives"; lives: number };

// נגיעת המוות
export type DeathTouchClientMsg =
  | { a: "dt_touched" } // הטלפון שלי קיבל נגיעה (בחלון ציד)
  | { a: "dt_vote"; suspect: string };

export type DeathTouchServerMsg =
  | { a: "dt_role"; role: "killer" | "civilian"; killers?: number } // אישי
  | { a: "dt_phase"; phase: "hunt" | "accuse" | "reveal"; until: number }
  | { a: "dt_hunt" } // אישי לרוצח: לך תיגע במישהו
  | { a: "dt_killed"; pid: string } // cue — נדלק אדום אצל כולם
  | { a: "dt_accuse"; alive: string[]; until: number }
  | { a: "dt_voted"; count: number; total: number }
  | { a: "dt_result"; suspect?: string; wasKiller?: boolean; msg: string }
  | { a: "dt_alive"; alive: string[] };

// השדים הקטנים
export type DemonsClientMsg =
  | { a: "dm_hit" } // נגעתי בנקודה
  | { a: "dm_send"; target: string }; // שולח שד ליריב

export type DemonsServerMsg =
  | { a: "dm_begin"; until: number; colors: Record<string, string> }
  | { a: "dm_score"; scores: Record<string, number>; meters: Record<string, number> }
  | { a: "dm_demon"; from: string; target: string; kind: number; at: number; dur: number } // cue אצל היעד
  | { a: "dm_end"; scores: Record<string, number> };

// על הלשון (אליאס)
export type AliasClientMsg =
  | { a: "al_correct" }
  | { a: "al_skip" };

export type AliasServerMsg =
  | { a: "al_turn"; pid: string; deckName: string; until: number }
  | { a: "al_word"; word: string } // אישי למתאר
  | { a: "al_scored"; pid: string; total: number }
  | { a: "al_skipped"; pid: string }
  | { a: "al_turnend"; pid: string; got: number };

// טריוויה
export type TriviaClientMsg =
  | { a: "tv_answer"; qId: number; choice: number; atServer: number };

export type TriviaServerMsg =
  | { a: "tv_begin"; total: number }
  | { a: "tv_q"; qId: number; q: string; options: string[]; index: number; total: number; at: number; until: number } // cue
  | { a: "tv_answered"; count: number; total: number }
  | { a: "tv_reveal"; qId: number; correct: number; tally: number[]; scores: Record<string, number>; gained: Record<string, number> };

// מי הכי? (Who's Most Likely)
export type WhoMostClientMsg =
  | { a: "wm_add"; text: string } // מארח מוסיף שאלה
  | { a: "wm_remove"; idx: number }
  | { a: "wm_publish" } // מארח → מעבר לשלב מענה
  | { a: "wm_vote"; qIdx: number; target: string } // הצבעה חשאית
  | { a: "wm_done" } // סיימתי לענות
  | { a: "wm_start" } // מארח → מעבר לשלב גילוי
  | { a: "wm_reveal" } // מארח → גלה את השאלה הנוכחית
  | { a: "wm_next" }; // מארח → שאלה הבאה

export type WhoMostServerMsg =
  | { a: "wm_phase"; phase: "write" | "answer" | "reveal" }
  | { a: "wm_questions"; questions: string[] } // רשימת השאלות (עריכה + מענה)
  | { a: "wm_progress"; done: number; total: number }
  | { a: "wm_reveal_q"; idx: number; total: number; text: string } // הצג שאלה בשלב גילוי
  | { a: "wm_result"; idx: number; winners: string[]; tally: Record<string, number>; voters: number }
  | { a: "wm_lit"; pids: string[] }; // cue — הטלפונים של הנבחרים נדלקים

/* ---- המתחזה 🎭 — האפליקציה רק מחלקת תפקידים; המשחק עצמו בקול, סביב השולחן ---- */
export type ImpostorClientMsg =
  | { a: "im_next" }     // מארח: סיבוב חדש — מילה חדשה + מתחזה חדש
  | { a: "im_expose" };  // מארח: חשוף את המתחזה
export type ImpostorServerMsg =
  | { a: "im_role"; word: string; isImpostor: boolean; round: number } // word ריק אצל המתחזה
  | { a: "im_exposed"; impostorPid: string; word: string; round: number };

/* ---- מופע 🕯️ — הקהל כמסך ---- */
export type ShowFx = "off" | "candles" | "wave" | "pulse" | "text" | "heart" | "countdown" | "sparkle" | "sections" | "flash" | "color" | "tribal";
export type ShowClientMsg =
  | { a: "sh_set"; fx: ShowFx; text?: string; bpm?: number; color?: string } // מפעיל בלבד
  | { a: "sh_seat"; r: number; c: number }; // מושב מכרטיס (QR) — דורס את השיבוץ האוטומטי
export type ShowServerMsg =
  | { a: "sh_pos"; r: number; c: number; maxR: number; maxC: number } // המיקום שלי + גבולות הרשת
  | { a: "sh_fx"; fx: ShowFx; text?: string; bpm?: number; color?: string; at: number } // cue — כולם מחליפים אפקט יחד
  | { a: "sh_count"; total: number }; // כמה טלפונים מחוברים (לקונסולה)

export type GameClientMsg = ForeheadClientMsg | PodsClientMsg | BombsClientMsg
  | ColorRulesClientMsg | SimonClientMsg | DeathTouchClientMsg | DemonsClientMsg | AliasClientMsg | TriviaClientMsg
  | WhoMostClientMsg | ShowClientMsg | ImpostorClientMsg;
export type GameServerMsg = ForeheadServerMsg | PodsServerMsg | BombsServerMsg
  | ColorRulesServerMsg | SimonServerMsg | DeathTouchServerMsg | DemonsServerMsg | AliasServerMsg | TriviaServerMsg
  | WhoMostServerMsg | ShowServerMsg | ImpostorServerMsg;

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
    id: "whomost",
    name: "מי הכי?",
    icon: "🫵",
    tagline: "המארח שואל. מי הכי מתאים? הטלפון של הנבחר נדלק.",
    minPlayers: 3,
    maxPlayers: 15,
  },
  {
    id: "impostor",
    name: "המתחזה",
    icon: "🎭",
    tagline: "לכולם אותה מילה. לאחד — אין. מצאו אותו.",
    minPlayers: 3,
    maxPlayers: 15,
  },
  {
    id: "colorrules",
    name: "חוקי הצבע",
    icon: "🎨",
    tagline: "המסך מצווה. אתה מציית — או יוצא.",
    minPlayers: 2,
    maxPlayers: 12,
    configOptions: [
      { key: "speed", label: "קצב", values: [{ v: "normal", label: "רגיל 🙂" }, { v: "fast", label: "מהיר 🔥" }] },
    ],
  },
  {
    id: "simon",
    name: "סימון מבוזר",
    icon: "🟩",
    tagline: "הטלפונים נדלקים בתור. תזכרו — ביחד.",
    minPlayers: 2,
    maxPlayers: 8,
  },
  {
    id: "deathtouch",
    name: "נגיעת המוות",
    icon: "🔪",
    tagline: "רוצח מסתובב. שמרו על הטלפון.",
    minPlayers: 4,
    maxPlayers: 12,
  },
  {
    id: "demons",
    name: "השדים הקטנים",
    icon: "👹",
    tagline: "צברו נקודות. שגרו שד למסך של חבר.",
    minPlayers: 2,
    maxPlayers: 10,
  },
  {
    id: "alias",
    name: "על הלשון",
    icon: "👅",
    tagline: "תאר בלי להגיד את המילה.",
    minPlayers: 3,
    maxPlayers: 12,
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
    id: "trivia",
    name: "טריוויה",
    icon: "🧠",
    tagline: "כולם עונים. המהיר והצודק מנצח.",
    minPlayers: 2,
    maxPlayers: 20,
    configOptions: [
      {
        key: "cat",
        label: "נושא",
        values: [
          { v: "mix", label: "מעורב 🎲" },
          { v: "israel", label: "ישראל 🇮🇱" },
          { v: "world", label: "עולם 🌍" },
          { v: "science", label: "מדע 🔬" },
        ],
      },
    ],
  },
  {
    id: "bombs",
    name: "מטר הפצצות",
    icon: "💣",
    tagline: "כולנו צוות אחד. הפצצות נגד כולנו.",
    minPlayers: 2,
    maxPlayers: 10,
    configOptions: [
      {
        key: "difficulty",
        label: "קצב",
        values: [
          { v: "chill", label: "רגוע 🙂" },
          { v: "wild", label: "מטורף 🔥" },
        ],
      },
    ],
  },
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
    id: "show",
    name: "מופע",
    icon: "🕯️",
    tagline: "הטלפונים של כולם = מסך ענק אחד. אורות, גלים וטקסט רץ.",
    minPlayers: 2,
    maxPlayers: 5000,
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
