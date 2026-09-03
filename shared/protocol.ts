/**
 * LARIK Games — הפרוטוקול המשותף (לקוח ↔ שרת)
 * כל הזמנים במילישניות של "שעון השרת" — הלקוח ממיר דרך שכבת הסנכרון.
 */

export interface PlayerInfo {
  id: string;
  /** מזהה יציב בין ערבים, נשמר במכשיר — הבסיס ל"החבורה שלנו". נפרד מ-id של החדר. */
  gpid?: string;
  name: string;
  emoji: string;
  armed: boolean; // עבר את מסך "חמש את הטלפון"
  connected: boolean;
  isHost: boolean;
}

export type RoomPhase = "lobby" | "game" | "ceremony";

/**
 * עובדות על שחקן שנצברות לאורך כל הערב ומזינות את מנוע התארים.
 * המשחקים לא יודעים מה זה תואר — הם רק מדווחים מה קרה.
 * מדיניות המיזוג לכל מפתח מוגדרת ב-server/src/awards.ts (FACT_MERGE).
 */
export interface PlayerFacts {
  /* נצברות אוטומטית במנוע — כל המשחקים מקבלים אותן בחינם */
  games?: number;        // כמה משחקים שיחק
  wins?: number;         // כמה ניצח
  clown?: number;        // כמה פעמים היה הליצן
  points?: number;       // ניקוד הערב המצטבר
  bestStreak?: number;   // רצף הניצחונות הארוך ביותר
  wonGames?: number;     // בכמה משחקים *שונים* ניצח

  /* עובדות ייעודיות שהמשחקים מדווחים */
  bestReactionMs?: number;  // פודים — זמן התגובה הטוב ביותר (מינימום)
  taps?: number;            // פודים — כמה פודים חטף
  outFirst?: number;        // הודח ראשון
  survivedLast?: number;    // נשאר אחרון
  correct?: number;         // טריוויה — תשובות נכונות
  wrong?: number;           // טריוויה — תשובות שגויות
  impostorRounds?: number;  // המתחזה — כמה סיבובים היה המתחזה
  impostorSafe?: number;    // המתחזה — כמה פעמים לא נחשף
  peeks?: number;           // על המצח — נתפס מציץ
  guessed?: number;         // על המצח — ניחש נכון
  hfDeepest?: number;       // החופרים — השורה הכי עמוקה שהגיע אליה (מקס)
  hfDeposits?: number;      // החופרים — כמה הפקדות במעלית
  hfKills?: number;         // החופרים — מפלצות שחיסל
  hfDigs?: number;          // החופרים — תאים ששבר
  hfDowns?: number;         // החופרים — כמה פעמים נפל
  abBanked?: number;        // התהום — סך הגבישים שבנקאי
  abBest?: number;          // התהום — הבנקאות הגדולה ביותר בצניחה אחת (מקס)
  abLedge?: number;         // התהום — המדף העמוק ביותר שהגיע אליו (מקס)
  abPots?: number;          // התהום — כמה קרנות לקח
  abCaught?: number;        // התהום — כמה פעמים נתפס
  abHunts?: number;         // התהום — כמה חברים הפיל במלכודת
  abHelps?: number;         // התהום — כמה עזרות שלו נאספו ותוגמלו
  abStops?: number;         // התהום — כמה פעמים עצר במדף
  abGoes?: number;          // התהום — כמה פעמים המשיך במדף
}

/** התואר האישי שמופיע על כרטיס הסיום של השחקן */
export interface Award {
  id: string;
  emoji: string;
  title: string;    // "האצבע הכי מהירה"
  detail?: string;  // "0.41 שניות"
  /** כותרת עיתונאית לסגנון "עיתון הערב" */
  headline?: string;
}

/* ---- החבורה שלנו ---- */

/** שיא שנשבר בחבורה — "האצבע הכי מהירה בחבורה: 0.38" */
export interface GroupRecord {
  label: string;
  pid: string;
  name: string;
  value: number;
  at: number;
}

/** תקציר החבורה שנשלח ללקוח — קטן בכוונה, בלי שדות פנימיים */
export interface GroupSummary {
  id: string;
  name: string;
  evenings: number;
  seasonNo: number;
  daysLeftInSeason: number;
  table: { pid: string; name: string; emoji: string; points: number; evenings: number }[];
  records: GroupRecord[];
}

export interface CeremonyInfo {
  title: string;
  winnerId?: string;
  /** תיקו אמיתי = כמה מנצחים; תמיד כולל את winnerId */
  winnerIds?: string[];
  loserId?: string;
  scores?: Record<string, number>; // ניקוד המשחק שנגמר
  eveningScores: Record<string, number>; // לוח הערב המצטבר
  /** תואר אישי לכל שחקן — כל טלפון מקבל כרטיס משלו, וזה מה שמייצר את השיתופים */
  awards?: Record<string, Award>;
  /** כמה משחקים כבר שוחקו בערב הזה — מופיע על הכרטיס ("ערב #7") */
  gamesPlayed?: number;
  /** החבורה שהחדר משויך אליה — טבלת עונה, שיאים, ושם אמיתי על הכרטיס */
  group?: GroupSummary;
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
  /** מי לחץ "הבנתי" על הסבר המשחק שנבחר (בלובי) */
  gotIt?: string[];
  /** החבורה שהחדר משויך אליה (אם יש) — מוצג כבר בלובי: "הרביעייה · ערב #7" */
  group?: GroupSummary;
}

/* ---- לקוח → שרת ---- */
export type ClientMsg =
  /** `seen` = סט ביטים ב-base64 של שאלות שהמכשיר כבר ראה (ראו server/src/bitset.ts) */
  | { t: "join"; name: string; emoji: string; rejoinId?: string; gpid?: string; seen?: string }
  | { t: "save_group"; name: string }   // מארח בלבד: הפיכת הערב הזה לחבורה שנשמרת
  | { t: "rename_group"; name: string } // מארח בלבד
  | { t: "arm" } // הטלפון חומש (אודיו+חיישנים)
  | { t: "ping"; t0: number } // סנכרון שעונים
  | { t: "select_game"; gameId: string; config?: unknown } // מארח בלבד
  | { t: "start_game" } // מארח בלבד
  | { t: "back_to_lobby" } // מארח בלבד
  | { t: "leave" } // שחקן עוזב את החדר מרצונו (מוסר לגמרי מהרשימה)
  | { t: "got_it" } // "הבנתי" — קראתי את הסבר המשחק שנבחר
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
  /** `bankId` = המזהה היציב של השאלה במאגר; הלקוח מסמן אותו כ"נראה" כדי שלא יחזור */
  | { a: "tv_q"; qId: number; bankId?: number; q: string; options: string[]; index: number; total: number; at: number; until: number } // cue
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
export type ShowFx = "off" | "candles" | "wave" | "pulse" | "text" | "heart" | "countdown" | "sparkle" | "sections" | "flash" | "color" | "tribal" | "beat"
  | "paparazzi" | "spot" | "ember"; // פפראצי 📸 · הגרלת זרקור 🎯 (text = pid הזוכה) · גחלים 🌅 (walk-away)
/** צורת התאורה על מסך הצופה — full = כל המסך; אחרת צורה גדולה זוהרת שמתמלאת בצבע האפקט */
export type ShowShape = "full" | "heart" | "circle" | "stripes" | "star" | "bolt" | "dancers";
export type ShowClientMsg =
  | { a: "sh_set"; fx: ShowFx; text?: string; bpm?: number; color?: string; anchor?: number; shape?: ShowShape } // מפעיל בלבד; anchor = זמן-שרת של ביט (Tap-Tempo)
  | { a: "sh_dim"; v: number } // מפעיל: פיידר עוצמה ראשי (Grand Master) 0..1
  | { a: "sh_seat"; r: number; c: number }; // מושב מכרטיס (QR) — דורס את השיבוץ האוטומטי
export type ShowServerMsg =
  | { a: "sh_pos"; r: number; c: number; maxR: number; maxC: number } // המיקום שלי + גבולות הרשת
  | { a: "sh_fx"; fx: ShowFx; text?: string; bpm?: number; color?: string; anchor?: number; shape?: ShowShape; at: number } // cue — כולם מחליפים אפקט יחד
  | { a: "sh_dim"; v: number; at: number } // cue — עוצמה ראשית לכל הקהל
  | { a: "sh_count"; total: number }; // כמה טלפונים מחוברים (לקונסולה)

/* ---- הכור ☢️ — קו-אופ תפקידים: האכילו את הליבה, אל תגיעו להתכה ---- */
export type ReactorRole = "feeder" | "loader" | "fixer";
export type ReactorQuality = "perfect" | "good" | "weak";
export interface ReactorCard { id: string; name: string; emoji: string; desc: string }
export interface ReactorStats { fed: number; perfect: number; fixed: number; lost: number }

export type ReactorClientMsg =
  | { a: "rx_feed"; orbId: number }                 // מזין: שגר אורב לצינור
  | { a: "rx_inject"; atServer: number }            // טוען: הזרקה — האיכות לפי פאזת הטבעת בזמן-שרת
  | { a: "rx_fixed"; station: string }              // מתקן: סיים לתקן את התחנה
  | { a: "rx_gold_tap" }                            // אורב הזהב: נגעתי בחלון
  | { a: "rx_pick"; cardId: string }                // דראפט: בחרתי קלף
  | { a: "rx_again" }                               // מארח: עוד ריצה (מיידי, בלי לובי)
  | { a: "rx_finish" };                             // מארח: סיום → טקס

export type ReactorServerMsg =
  | { a: "rx_wave"; wave: number; roles: Record<string, ReactorRole>; hp: number; waveMs: number; ringMs: number; ringEpoch: number; pf: number; gf: number } // cue — פתיחת גל מסונכרנת; pf/gf = חלקי חלון מושלם/טוב בטבעת
  | { a: "rx_orb"; orbId: number; feeder: string; expireAt: number; }                    // cue — אורב נולד אצל מזין
  | { a: "rx_sent"; orbId: number; feeder: string; arriveAt: number }                    // cue — האורב בדרך לליבה
  | { a: "rx_injected"; orbId: number; by: string; quality: ReactorQuality; gain: number; hp: number; queue: number }
  | { a: "rx_lost"; orbId: number; where: string; hp: number }                           // where = pid של מזין או "loader"
  | { a: "rx_queue"; queue: number }
  | { a: "rx_jam"; station: string }                                                     // תקלה אצל מזין
  | { a: "rx_unjam"; station: string; by: string }
  | { a: "rx_hp"; hp: number }
  | { a: "rx_gold"; leadMs: number; windowMs: number; need: number }                     // cue — אורב הזהב: ספירה של leadMs ואז חלון משותף
  | { a: "rx_gold_res"; success: boolean; count: number; need: number; hp: number }
  | { a: "rx_wave_clear"; wave: number; hp: number }
  | { a: "rx_draft"; cards: ReactorCard[]; until: number }                               // אישי — 3 קלפים לבחירה
  | { a: "rx_picked"; pid: string; name: string; emoji: string }                         // מי בחר מה (לכולם)
  | { a: "rx_meltdown"; wave: number }                                                   // cue — ההתכה המסונכרנת אצל כולם
  | { a: "rx_run_over"; wave: number; bestWave: number; nearMiss?: string; mvp?: string; stats: Record<string, ReactorStats> }
  | { a: "rx_state"; wave: number; roles: Record<string, ReactorRole>; hp: number; ringMs: number; ringEpoch: number; pf: number; gf: number; queue: number; jams: string[]; phase: "wave" | "draft" | "runover" }; // rejoin / שינוי תפקידים באמצע

/* ---- החומה 🏰 — הגנת נחיל קו-אופ עם תפקידים ----
 * העולם: רוחב 0-1000, גובה 0-1600. הנחיל נכנס מלמעלה (y שלילי) וצועד מטה.
 * החומה ב-y=1250. רצועת החלוץ 950-1240. מסלול אויב דטרמיניסטי:
 *   y(t) = y0 + speed*(t-at)/1000 · x(t) = x0 + wob*sin((t-at)/700)
 * כל הטלפונים מציירים מהנוסחה; שינויי מצב (עצירה/קרב/מוות) = אירועי שרת.
 */
export type WallRole = "heli" | "archer" | "cannon" | "mg";
export type WallEnemyType = "swarm" | "runner" | "armored" | "bomber" | "sniper" | "digger" | "boss";
/** תכונת אויב (שכבת התוכן): 🏠 גג מבוצר — חסין לנזק מההליקופטר · 💚 מרפא — מרפא את הנחיל סביבו · 🌀 מגן קינטי — סופג פגיעות בודדות, נשבר רק מאש רציפה */
export type WallAffix = "roof" | "healer" | "shield";
export interface WallCard { id: string; name: string; emoji: string; desc: string; tier?: number }
export interface WallStats { kills: number; dmg: number; saves: number; deaths: number }

export type WallClientMsg =
  | { a: "wl_role"; role: WallRole }                          // בחירת תפקיד במסך ההיערכות
  | { a: "wl_go" }                                            // מארח: פותחים את הקרב
  | { a: "wl_pos"; x: number; y: number }                     // חלוץ: מיקום (5-8Hz)
  | { a: "wl_bomb" }                                          // 🚁 הליקופטר: הטלת פצצה (השרת שוער את הקצב)
  | { a: "wl_shield"; on: boolean }                           // (שמור — לא בשימוש מאז מעבר להליקופטר)
  | { a: "wl_shot"; tx: number; ty: number; power: number }   // קשת: חץ לנקודה (power 0-1)
  | { a: "wl_boom"; tx: number; ty: number }                  // תותחן: פגז לנקודה
  | { a: "wl_fire"; on: boolean }                             // מקלען: התחלת/הפסקת צרור
  | { a: "wl_aim"; x: number; y?: number }                    // מקלען: נקודת הכיוון (מניפה מהעמדה אליה)
  | { a: "wl_pick"; cardId: string }                          // דראפט אישי
  | { a: "wl_again" }                                         // מארח: ריצה חדשה מיד
  | { a: "wl_finish" };                                       // מארח: סיום → טקס

export type WallServerMsg =
  | { a: "wl_setup"; roles: Record<string, WallRole>; slots: Record<string, [number, number]> } // מסך היערכות (slots = עמדות שהוקצו)
  | { a: "wl_wave"; wave: number; wallHp: number; wallMax: number; duration: number; pushes?: number } // cue — פתיחת גל (pushes = כמה דחיפות בו-זמניות)
  | { a: "wl_spawn"; id: number; type: WallEnemyType; x0: number; y0: number; speed: number; wob: number; hp: number; maxHp: number; at: number; affix?: WallAffix }
  | { a: "wl_estate"; id: number; state: "walk" | "fight" | "wall" | "burrow"; x: number; y: number; at: number; speed?: number } // שינוי מצב/מסלול
  | { a: "wl_hit"; id: number; hp: number; by: string; crit?: boolean; k?: "hit" | "burn" | "poison" | "chain" | "blast" | "frost" | "pierce" | "vamp"; blocked?: boolean } // פגיעה באויב (hp<=0 = מוות); k = מקור הנזק; blocked = הפגיעה נחסמה (גג מבוצר/מגן קינטי)
  | { a: "wl_chain"; x1: number; y1: number; x2: number; y2: number; by: string }                // קשת ברק בין שני אויבים
  | { a: "wl_style"; pid: string; traits: Record<string, number>; tier: number; evos: string[]; amps?: Record<string, number> } // איך הנשק של השחקן נראה — כל החדר מקבל (amps = כמה פעמים נבחר כל מגבר)
  | { a: "wl_evo"; pid: string; trait: string; name: string; emoji: string }                     // 🌟 אבולוציה — הרגע שכל החדר עוצר בשבילו
  | { a: "wl_arrow"; fx: number; fy: number; tx: number; ty: number; T: number; by: string; fire?: boolean } // cue — חץ באוויר
  | { a: "wl_shell"; fx: number; fy: number; tx: number; ty: number; T: number; by: string }      // cue — פגז באוויר
  | { a: "wl_boomfx"; x: number; y: number; r: number }                                          // פיצוץ (בזמן הפגיעה)
  | { a: "wl_stream"; by: string; x: number; y?: number; on: boolean }                           // זרם המקלע (ויזואלי) — x,y = נקודת הכיוון
  | { a: "wl_jam"; by: string; ms: number }                                                      // התחממות-יתר
  | { a: "wl_drop"; pid: string; x: number; y: number; fall: number; r: number; n: number }        // פצצה בדרך למטה — לכולם
  | { a: "wl_flak"; id: number; x: number; y: number; at: number }                               // אש נגד-מטוסים: פגז בדרך אל נקודה, מתפוצץ ב-at
  | { a: "wl_ppos"; ps: [string, number, number][] }                                             // מיקומי גיבורים (3Hz)
  | { a: "wl_hero"; pid: string; hp: number; max: number; down?: boolean; upAt?: number }        // חיי גיבור / נפילה
  | { a: "wl_wall"; hp: number; max: number }                                                    // חיי החומה
  | { a: "wl_sniper"; id: number; target: string; fireAt: number }                               // צלף ננעל על גיבור — לקשת 3 שנ' להרוג
  | { a: "wl_levelup"; level: number; cards: WallCard[] }                                        // אישי — דראפט תוך-קרב
  | { a: "wl_picked"; pid: string; name: string; emoji: string }
  | { a: "wl_tier"; pid: string; tier: number }                                                  // דרגת נשק עלתה (ויזואל חדש!)
  | { a: "wl_xp"; xp: number; level: number; next: number }                                      // אישי — מד XP
  | { a: "wl_mods"; rate: number; speed: number }                                                // אישי — מכפילי קצב/מהירות (הלקוח מכייל איתם את שערי הקלט)
  | { a: "wl_heat"; heat: number }                                                               // אישי (מקלען) — החום האמיתי מהשרת, 5Hz
  | { a: "wl_fuel"; fuel: number; max: number }                                                  // אישי (הליקופטר) — הדלק מהשרת, 5Hz; מתמלא רק ברצועת החומה
  | { a: "wl_clear"; wave: number; wallHp: number }                                              // הגל הוסתיים — נשימה
  | { a: "wl_over"; wave: number; bestWave: number; nearMiss?: string; mvp?: string; stats: Record<string, WallStats> }
  | { a: "wl_state"; wave: number; roles: Record<string, WallRole>; slots: Record<string, [number, number]>; wallHp: number; wallMax: number; phase: "setup" | "wave" | "breath" | "over"; tiers: Record<string, number> }; // rejoin

/* ---------- החופרים ⛏️ ---------- */
export interface HofrimCard { id: string; ic: string; t: string; d: string; b: string; wow: boolean }

export type HofrimClientMsg =
  | { a: "hf_dir"; dx: number; dy: number }        // כיוון מוחזק — נשלח רק כשהוא משתנה
  | { a: "hf_call" }                               // 📣 קריאה לחברים
  | { a: "hf_bomb" }
  | { a: "hf_pick"; card: string };                // בחירה בדראפט

export type HofrimServerMsg =
  | { a: "hf_init"; seed: string; cols: number; rows: number; lift: number; players: string[] } // הזרע — הלקוח מייצר ממנו את אותה מפה
  | { a: "hf_sync"; dug: number[]; bags: [number, number, number][]; mons: [number, string, number, number, number, number][] } // למצטרף חוזר: מפלצת = [id, סוג, חיים, מקס, עמודה, שורה]
  | { a: "hf_shift"; n: number; target: number; endsAt: number; of: number; secs: number }
  | { a: "hf_shiftend"; ok: boolean; partial: boolean; banked: number; target: number; misses: number }
  | { a: "hf_quota" }                              // עמדנו במכסה — 3 שניות אחרונות
  | { a: "hf_pos"; ps: [string, number, number, number, number][]; ms: [number, number, number][]; left: number; banked: number }
  | { a: "hf_dig"; c: number; r: number; by: string; mat: number; lit: number }
  | { a: "hf_item"; id: number; x: number; y: number; k: number }
  | { a: "hf_take"; id: number; pid: string; bag: number; slots: number }
  | { a: "hf_gone"; id: number }
  | { a: "hf_bag"; id: number; c: number; y: number; st: number }          // 0 מנוחה · 1 מתנדנד · 2 נופל
  | { a: "hf_bagland"; id: number; c: number; y: number; broke: number }
  | { a: "hf_mon"; id: number; k: string; c: number; r: number; hp: number; max: number }
  | { a: "hf_mhit"; id: number; hp: number; by?: string; k?: string; res?: number } // res=1 → 🛡️ חסין
  | { a: "hf_mdie"; id: number; x: number; y: number; k: string }
  | { a: "hf_chain"; x1: number; y1: number; x2: number; y2: number }
  | { a: "hf_shot"; x: number; y: number; dx: number; dy: number; by: string }
  | { a: "hf_hp"; pid: string; hp: number; max: number; why: string }
  | { a: "hf_down"; pid: string }
  | { a: "hf_up"; pid: string; hp: number }
  | { a: "hf_bank"; pid: string; v: number; total: number; team: number; share?: string }
  | { a: "hf_stats"; pow: number; slots: number; light: number; magnet: number; spd: number; bomb: number; xray: number; glow: number; level: number }
  | { a: "hf_build"; pid: string; picks: string[]; level: number }
  | { a: "hf_draft"; cards: HofrimCard[]; ms: number }
  | { a: "hf_draftopen"; ids: string[] }
  | { a: "hf_took"; pid: string; card: HofrimCard }
  | { a: "hf_called"; pid: string; x: number; y: number; why: string }
  | { a: "hf_bombset"; c: number; r: number; R: number; by: string }
  | { a: "hf_boom"; c: number; r: number; R: number }
  | { a: "hf_left"; pid: string };

/* ---------- הגנבים 🥷 ---------- */
export type ThievesClientMsg =
  | { a: "th_dir"; dx: number; dy: number }        // וקטור אנלוגי ‎-1..1 — נשלח רק כשהוא משתנה
  | { a: "th_steal" };                             // כפתור הפעולה — גניבה מהמאורה שאתה עומד בה

export type ThievesServerMsg =
  | { a: "th_init"; w: number; h: number; mtn: { x: number; y: number; total: number }; dens: [string, number, number][]; players: string[]; goAt: number; endsAt: number }
  | { a: "th_pos"; t: number; ps: [string, number, number, number, number, number, number, number, number][]; mtn: number; left: number } // t=שעון השרת · [pid,x,y,צ'אנקים,סוחב-שלל,זהב,זעם,dx,dy] — dx/dy לניבוי האחרים
  | { a: "th_go" }                                                                    // 🥷 צאו! — cue משותף, כולם יוצאים לדרך באותה שנייה
  | { a: "th_horn" }                                                                  // 🔔 הצפירה — cue בזמן הסיום, לפני מסך הטקס
  | { a: "th_nope"; why: "far" | "empty" | "busy" }                                   // הגניבה לא יצאה לפועל — משוב מיידי במקום שתיקה
  | { a: "th_mine"; pid: string; carry: number; left: number; tier?: number }         // צ'אנק נחצב מההר · tier=שכבת ההר (1 רגיל · 2 עמוק · 3 ליבה)
  | { a: "th_dep"; pid: string; ids: number[]; v?: number }                           // הפקדה — כל הצ'אנקים שביד הפכו לאבן אחת בערך v (סכום השכבות, 1–9)
  | { a: "th_ripen"; id: number; den: string; lvl: number; bell?: boolean }           // גביש עלה דרגת הבשלה · bell=הפעמון הפומבי (אחד למאורה לכמה שניות)
  | { a: "th_grab"; id: number; by: string; from: string; lvl: number; v?: number }   // גניבה ממאורה (הדרגה אחרי ההורדה) · v=ערך האבן
  | { a: "th_tackle"; by: string; carrier: string }                                   // מגע הפיל את הסוחב
  | { a: "th_drop"; id: number; x: number; y: number; lvl: number }                   // שלל על הרצפה — מי שמגיע ראשון
  | { a: "th_pick"; id: number; by: string }                                          // הרמה מהרצפה
  | { a: "th_home"; id: number; by: string; from: string; lvl: number }               // השלל הגיע לבית של הגנב — עכשיו שלו
  | { a: "th_rage"; pid: string; secs: number }                                       // 🔥 הזעם של הנשדד
  | { a: "th_empty" }                                                                 // ההר נגמר — המלחמה
  | { a: "th_alarm"; secs: number }                                                   // 🚨 הדקה האחרונה — הכנסות ×3
  | { a: "th_first"; by: string; from: string }                                       // הגניבה הראשונה של הסבב
  | { a: "th_sync"; mtn: number; items: [number, string, number, number, number][]; ground: [number, number, number, number, number][]; carried: [number, string, number, number][]; endsAt: number } // items=[id,den,lvl,sinceLvl,v] · ground=[id,x,y,lvl,v] · carried=[id,carrier,lvl,v]
  | { a: "th_left"; pid: string };

/* ---------- התהום 🕳️ ---------- */
export interface AbyssCard { id: string; ic: string; t: string; d: string }
export interface AbTiming { segmentMs: number; voteMs: number; warnMs: number; revealOffsetMs: number; pauseMs: number; introMs: number; maxLedges: number }
export interface AbThrowWire { id: number; by: string; target: string; kind: "trap" | "shield" | "burst"; d: number; x: number; at: number }
export type AbPlayerState = "falling" | "stopped" | "caught" | "spectator" | "out";

export type AbyssClientMsg =
  | { a: "ab_state"; x: number; d: number; c: number; s: number }          // 10Hz בזמן נפילה: x, עומק, ערך גבישים, מגן
  | { a: "ab_caught"; o?: number; th?: number }                            // נתפסתי (בלי מגן). o=מכשול, th=חפץ זרוק
  | { a: "ab_shielded"; o?: number; th?: number }                          // המגן ספג פגיעה
  | { a: "ab_took"; th: number }                                           // אספתי חפץ עזרה (בועה/פרץ)
  | { a: "ab_vote"; k: number; v: "stop" | "go" }                          // הלחיצה האחרונה בתוך החלון קובעת
  | { a: "ab_throw"; target: string; kind: "trap" | "shield" | "burst" }   // פעולת צופה
  | { a: "ab_watch"; target: string }                                      // החלפת מבט
  | { a: "ab_pick"; card: string };                                        // דראפט

export type AbyssServerMsg =
  | { a: "ab_descent"; d: number; of: number; seed: string; startAt: number; cfg: AbTiming; mult: number[]; players: [string, "fall" | "spec"][]; perks: Record<string, string[]>; totals: Record<string, number> }
  | { a: "ab_pos"; ps: [string, number, number, number][] }                // 10Hz: [pid, x, גבישים, מגן] — נופלים בלבד; העומק נגזר מהזמן
  | { a: "ab_ledge"; k: number; freezeAt: number; voteUntil: number; revealAt: number; resumeAt: number; pot: number; mult: number; falling: string[]; potSeg: boolean }   // cue ב-freezeAt−warnMs
  | { a: "ab_votes"; n: number; of: number }                               // ספירה בלבד — הבחירות סודיות
  | { a: "ab_reveal"; k: number; votes: Record<string, "stop" | "go" | "caught" | "pot">; banked: Record<string, number>; bonus: Record<string, number>; pot: number; potRunner?: string; potWon?: { pid: string; amount: number }; next: "fall" | "pot" | "end"; swallowed?: number; resumeAt: number }   // cue ב-revealAt
  | { a: "ab_caught"; pid: string; k: number; lost: number; pot: number; by?: string; th?: number; why: "hit" | "lost" | "left" }
  | { a: "ab_shielded"; pid: string }
  | ({ a: "ab_throw" } & AbThrowWire)
  | { a: "ab_throwok"; id: number; readyAt: number }                       // אישי — טבעת הקולדאון
  | { a: "ab_throwfail"; reason: "cooldown" | "busy" | "ledge" | "target" | "falling" }
  | { a: "ab_bonus"; pid: string; kind: "hunter" | "help" | "gift"; amount: number; from: string } // gift = 🫂 נדיב
  | { a: "ab_swallow"; pot: number; pid: string }
  | { a: "ab_results"; d: number; of: number; rows: { pid: string; banked: number; at: number; caught: boolean; pot: number; bonus: number }[]; totals: Record<string, number>; potLost: number }
  | { a: "ab_draft"; cards: AbyssCard[]; ms: number }                      // אישי
  | { a: "ab_draftopen"; ids: string[] }
  | { a: "ab_took"; pid: string; card: AbyssCard }
  | { a: "ab_perks"; pid: string; perks: string[] }
  | { a: "ab_sync"; phase: "intro" | "fall" | "ledge" | "reveal" | "results" | "draft" | "over"; d: number; of: number; seed: string; startAt: number; cfg: AbTiming; mult: number[]; k: number; pot: number; potRunner: string; potSeg: boolean;
      players: { pid: string; state: AbPlayerState; x: number; c: number; s: number; banked: number }[]; totals: Record<string, number>; perks: Record<string, string[]>;
      you: { state: AbPlayerState; x: number; c: number; s: number; invulnMs: number }; throws: AbThrowWire[] }
  | { a: "ab_left"; pid: string };

export type GameClientMsg = ForeheadClientMsg | PodsClientMsg | BombsClientMsg
  | ColorRulesClientMsg | SimonClientMsg | DeathTouchClientMsg | DemonsClientMsg | AliasClientMsg | TriviaClientMsg
  | WhoMostClientMsg | ShowClientMsg | ImpostorClientMsg | ReactorClientMsg | WallClientMsg | HofrimClientMsg | ThievesClientMsg | AbyssClientMsg;
export type GameServerMsg = ForeheadServerMsg | PodsServerMsg | BombsServerMsg
  | ColorRulesServerMsg | SimonServerMsg | DeathTouchServerMsg | DemonsServerMsg | AliasServerMsg | TriviaServerMsg
  | WhoMostServerMsg | ShowServerMsg | ImpostorServerMsg | ReactorServerMsg | WallServerMsg | HofrimServerMsg | ThievesServerMsg | AbyssServerMsg;

/* ---- קטלוג ---- */
export interface GameMeta {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  /** הסבר קצר לשחקן — מוצג בטלפון של כולם כשהמארח בוחר את המשחק ("הבנתי") */
  howTo?: string;
  minPlayers: number;
  maxPlayers: number;
  configOptions?: { key: string; label: string; values: { v: string; label: string }[] }[];
  /** משחק שחי כעמוד נפרד ולא כחדר — המדף שולח לכאן במקום לפתוח חדר */
  external?: string;
}

export const CATALOG: GameMeta[] = [
  {
    id: "whomost",
    name: "מי הכי?",
    icon: "🫵",
    tagline: "המארח שואל. מי הכי מתאים? הטלפון של הנבחר נדלק.",
    howTo: "המארח כותב שאלות \"מי הכי...\" וכולם מצביעים בסתר מי הכי מתאים. אחר כך מניחים את הטלפונים על השולחן — והטלפון של הנבחר נדלק בזהב. בסוף: כוכב הערב.",
    minPlayers: 3,
    maxPlayers: 15,
  },
  {
    id: "impostor",
    name: "המתחזה",
    icon: "🎭",
    tagline: "לכולם אותה מילה. לאחד — אין. מצאו אותו.",
    howTo: "כולם מקבלים מילה סודית — חוץ מאחד שמגלה שהוא המתחזה. בתורכם אמרו בקול מילה שקשורה למילה הסודית. תתווכחו, תצביעו בקול — וכשתחליטו, המארח חושף.",
    minPlayers: 3,
    maxPlayers: 15,
  },
  {
    id: "colorrules",
    name: "חוקי הצבע",
    icon: "🎨",
    tagline: "המסך מצווה. אתה מציית — או יוצא.",
    howTo: "המסך מתמלא בצבע + פקודה: גע! צעק! קום! ⚡ צבע לבן = אל תיגע בכלל. טעות או היסוס עולים לב. 3 לבבות ואתה בחוץ — האחרון ששורד מנצח.",
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
    howTo: "הטלפונים נדלקים ברצף הולך ומתארך. זכרו את הסדר ושחזרו אותו ביחד — כל אחד נוגע במסך שלו בדיוק כשהתור שלו ברצף. אתם קבוצה: 3 חיים לכולם.",
    minPlayers: 2,
    maxPlayers: 8,
  },
  {
    id: "deathtouch",
    name: "נגיעת המוות",
    icon: "🔪",
    tagline: "רוצח מסתובב. שמרו על הטלפון.",
    howTo: "לאחד מכם תפקיד סודי: רוצח 🔪 בחלון הציד — טלפונים על השולחן, ידיים למעלה, והרוצח מנסה לגעת במסך של קורבן בלי להיתפס. אחר כך: סבב האשמות והצבעה.",
    minPlayers: 4,
    maxPlayers: 12,
  },
  {
    id: "demons",
    name: "השדים הקטנים",
    icon: "👹",
    tagline: "צברו נקודות. שגרו שד למסך של חבר.",
    howTo: "אספו נקודות בנגיעה בכוכבים שצצים על המסך. כשהמד מתמלא — שגרו שד 👹 למסך של יריב: הוא יסתיר לו את הכוכבים לכמה שניות. הכי הרבה נקודות בדקה מנצח.",
    minPlayers: 2,
    maxPlayers: 10,
  },
  {
    id: "alias",
    name: "על הלשון",
    icon: "👅",
    tagline: "תאר בלי להגיד את המילה.",
    howTo: "בתורך: על המסך מופיעה מילה — תאר אותה בקול בלי להגיד אותה (ולא באנגלית!). החברים צועקים ניחושים. ניחשו? לחץ ✓ וקבל את הבאה. כמה תספיקו ב-45 שניות?",
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
          { v: "custom", label: "✨ חפיסה שלנו" },
        ],
      },
    ],
  },
  {
    id: "trivia",
    name: "טריוויה",
    icon: "🧠",
    tagline: "כולם עונים. המהיר והצודק מנצח.",
    howTo: "שאלה מופיעה אצל כולם באותה שנייה בדיוק. עונים על הטלפון — וכמה שעונים מהר יותר, מקבלים יותר נקודות. 8 שאלות, הכי חד מנצח.",
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
    howTo: "אתם צוות אחד נגד הפצצות 💣 פצצה נופלת לך למסך? העבר אותה בהחלקה לחבר, או נטרל לפי הסוג: דביקה — שפשף, כפולה — החזיקו יחד. אל תתנו לה להתפוצץ!",
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
    id: "wall",
    name: "החומה",
    icon: "🏰",
    tagline: "הנחיל מגיע בחושך. כל תפקיד מחזיק את הקו.",
    howTo: "בחרו תפקיד: 🚁 הליקופטר (גרור לטוס בכל השדה — מטיל פצצות לבד, התחמק מאש נגד-מטוסים) · 🏹 קשת (גע והחזק על המטרה — יורה לבד) · 💣 תותחן (כוון ושגר פגז) · 🔫 מקלען (החזק וגרור — מרסס על כל השדה). הרגו את הנחיל לפני שהוא שובר את החומה. כל הריגה = XP ושדרוגים אישיים, וכל גל מביא עוד דחיפות בו-זמנית — לגלים המאוחרים מגיעים רק עם הרבה שחקנים!",
    minPlayers: 2,
    maxPlayers: 10,
    configOptions: [
      {
        key: "difficulty",
        label: "קושי",
        values: [
          { v: "normal", label: "רגיל 🙂" },
          { v: "brutal", label: "אכזרי 🔥" },
        ],
      },
    ],
  },
  {
    id: "forehead",
    name: "על המצח",
    icon: "🤳",
    tagline: "כולם רואים מי אתה. חוץ ממך.",
    howTo: "שים את הטלפון על המצח — המסך כלפי החברים. כולם רואים מי אתה, חוץ ממך. בתורך שאל שאלות כן/לא, וכשאתה בטוח — נחש! החברים שופטים.",
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
          { v: "custom", label: "✨ חפיסה שלנו" },
        ],
      },
    ],
  },
  {
    id: "show",
    name: "מופע",
    icon: "🕯️",
    tagline: "הטלפונים של כולם = מסך ענק אחד. אורות, גלים וטקסט רץ.",
    howTo: "הטלפון שלך הופך לפיקסל במסך ענק שכל החדר יוצר ביחד ✨ בהירות למקסימום, החזיקו את המסך כלפי חוץ — והמפעיל ינהל את האורות.",
    minPlayers: 2,
    maxPlayers: 5000,
  },
  {
    id: "pods",
    name: "פודים",
    icon: "⚡",
    tagline: "פוד נדלק — חוטפים אותו.",
    howTo: "מפזרים את הטלפונים על השולחן — הם פודים של אור. פוד נדלק? רוצו אליו וגעו בו הכי מהר שאפשר. המערכת מודדת את זמן התגובה שלכם במילישניות.",
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
  {
    id: "thieves",
    name: "הגנבים",
    icon: "🥷",
    tagline: "ההר נגמר. הזהב היחיד שנשאר — אצל החברים שלכם.",
    howTo: "כל אחד הוא דביבון גנב עם מאורה משלו. חוצבים זהב מההר שבמרכז וסוחבים הביתה — אבן שהופקדה במאורה מבשילה ומייצרת זהב כל שנייה. אבל ההר נגמר, ואז הזהב היחיד נמצא בבתים של החברים: נכנסים למאורה של מישהו, גונבים גביש — וכל החדר רואה אתכם בורחים איתו. מגע בגנב מפיל את השלל, ומי שמגיע ראשון לוקח. בדקה האחרונה הכל שווה פי 3.",
    minPlayers: 2,
    maxPlayers: 8,
  },
  {
    id: "hofrim",
    name: "החופרים",
    icon: "⛏️",
    tagline: "חופרים למטה, מפילים שקי זהב על מפלצות, ובונים נשק משוגע.",
    howTo: "חופרים מנהרות בכיוון האגודל ואוספים גבישים וזהב. שק זהב מתנדנד שנייה לפני שהוא נופל — בורחים הצידה, והוא מוחץ כל מפלצת שמתחתיו. חוזרים למעלית להפקיד, וכל הפקדה מעלה רמה ופותחת שדרוג. ככל שיורדים עמוק יותר החומר קשה יותר והשלל שווה יותר.",
    minPlayers: 2,
    maxPlayers: 8,
  },
  {
    id: "abyss",
    name: "התהום",
    icon: "🕳️",
    tagline: "כולם נופלים באותו פיר. במדף — עוצרים או ממשיכים. הקרן מחכה לאחרון.",
    howTo: "כולם צונחים באותו פיר, כל אחד בטלפון שלו — מזיזים את האגודל כדי להתחמק מסלעים ולאסוף גבישים. כל 20 שניות מגיע מדף: הכול קופא ל-3 שניות וכל אחד בוחר בסתר — לעצור ולקחת את הגבישים בבטחה, או להמשיך ולהכפיל. ואז כולם חושפים יחד. מי שנתפס מאבד את השלל לקרן. מי שעצר צופה בחברים בשידור חי וזורק להם עזרה או מלכודת. האחרון שממשיך ושורד מדף נוסף — לוקח את כל הקרן.",
    minPlayers: 2,
    maxPlayers: 8,
    configOptions: [
      { key: "descents", label: "צניחות", values: [{ v: "3", label: "שלוש 🙂" }, { v: "1", label: "אחת ⚡" }, { v: "5", label: "חמש 🔥" }] },
    ],
  },
];
