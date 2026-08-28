/**
 * LARIK — אנליטיקה פנימית (פרטית לגמרי, בלי אף גורם שלישי)
 *
 * סופרת שימוש אמיתי: חדרים שנפתחו, שחקנים שהצטרפו, משחקים שהותחלו (לפי משחק),
 * ושיא מחוברים בו-זמנית.
 *
 * למה זה נשמר במסד ולא רק בקובץ: ב-Render free הדיסק זמני — כל deploy וכל
 * הרדמה מוחקים את הקובץ. ב-28.8 זה נצרב: ביום שבו סוף-סוף שיחקו כאן הרבה,
 * הדחיפה של אותו בוקר איפסה את המונים, והראיה לשימוש האמיתי נעלמה.
 * מאז המונים חיים ב-Upstash (אותו אחסון של החבורות), שורדים כל deploy,
 * והקובץ נשאר רק כמטמון מקומי לפיתוח.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { getStore, type Store } from "./store";

export interface StatsData {
  since: string; // מתי התחילה הספירה (קובץ חדש)
  bootAt: string; // עליית התהליך האחרונה
  roomsCreated: number;
  playersJoined: number;
  gamesStarted: Record<string, number>; // gameId -> count
  peakConcurrent: number;
  daily: Record<string, { rooms: number; players: number; games: number }>; // YYYY-MM-DD
}

const FILE = join(process.cwd(), "larik-stats.json");
const KEY = "stats:v1";
/** כמה ימים לשמור בפירוט היומי — מעבר לזה המסמך רק תופח */
const KEEP_DAYS = 90;

function fresh(): StatsData {
  const now = new Date().toISOString();
  return { since: now, bootAt: now, roomsCreated: 0, playersJoined: 0, gamesStarted: {}, peakConcurrent: 0, daily: {} };
}

function sane(d: Partial<StatsData> | null): StatsData | null {
  if (!d || typeof d !== "object") return null;
  const f = fresh();
  return {
    since: typeof d.since === "string" ? d.since : f.since,
    bootAt: f.bootAt,
    roomsCreated: Number(d.roomsCreated) || 0,
    playersJoined: Number(d.playersJoined) || 0,
    gamesStarted: (d.gamesStarted && typeof d.gamesStarted === "object") ? d.gamesStarted : {},
    peakConcurrent: Number(d.peakConcurrent) || 0,
    daily: (d.daily && typeof d.daily === "object") ? d.daily : {},
  };
}

/**
 * מיזוג היסטוריה שמורה עם מה שנספר מאז העלייה.
 * המונים מתחילים מאפס בכל עלייה, ולכן `live` הוא תמיד *דלתא* — סכימה נכונה.
 * השיא הוא מקסימום ולא סכום, ו-`since` הוא המוקדם מבין השניים.
 */
function merge(saved: StatsData, live: StatsData): StatsData {
  const out: StatsData = {
    since: saved.since < live.since ? saved.since : live.since,
    bootAt: live.bootAt,
    roomsCreated: saved.roomsCreated + live.roomsCreated,
    playersJoined: saved.playersJoined + live.playersJoined,
    gamesStarted: { ...saved.gamesStarted },
    peakConcurrent: Math.max(saved.peakConcurrent, live.peakConcurrent),
    daily: {},
  };
  for (const [id, n] of Object.entries(live.gamesStarted)) out.gamesStarted[id] = (out.gamesStarted[id] ?? 0) + n;
  for (const src of [saved.daily, live.daily]) {
    for (const [d, v] of Object.entries(src)) {
      const t = (out.daily[d] ??= { rooms: 0, players: 0, games: 0 });
      t.rooms += v.rooms || 0; t.players += v.players || 0; t.games += v.games || 0;
    }
  }
  const keep = Object.keys(out.daily).sort().slice(-KEEP_DAYS);
  out.daily = Object.fromEntries(keep.map((d) => [d, out.daily[d]]));
  return out;
}

/** מתחילים תמיד נקי: מה שנספר מכאן ואילך הוא דלתא שתתמזג עם ההיסטוריה */
export const stats = fresh();

let store: Store | null = null;
/** עד שההיסטוריה נטענה אסור לכתוב — כתיבה מוקדמת תדרוס את המסד בדלתא ריקה */
let hydrated = false;
let dirtyWhileLoading = false;

/** קריאה חד-פעמית בעליית התהליך: מושכים את ההיסטוריה וממזגים לתוך `stats` */
async function hydrate() {
  let saved: StatsData | null = null;
  try {
    store = getStore();
    saved = sane(await store.get<StatsData>(KEY));
  } catch { /* אין מסד — ממשיכים עם הקובץ המקומי */ }
  if (!saved) {
    try { if (existsSync(FILE)) saved = sane(JSON.parse(readFileSync(FILE, "utf8"))); }
    catch { /* קובץ פגום — מתחילים נקי */ }
  }
  if (saved) Object.assign(stats, merge(saved, { ...stats }));
  hydrated = true;
  if (dirtyWhileLoading) scheduleSave();
}
void hydrate();

let saveTimer: NodeJS.Timeout | null = null;
function save() {
  saveTimer = null;
  if (!hydrated) { dirtyWhileLoading = true; return; }
  try { writeFileSync(FILE, JSON.stringify(stats)); } catch { /* דיסק לקריאה בלבד? לא קריטי */ }
  // המסד הוא העותק ששורד deploy — כישלון כאן לא מפיל כלום, רק מפסיד מדידה
  void store?.put(KEY, stats).catch(() => {});
}
function scheduleSave() {
  if (!hydrated) { dirtyWhileLoading = true; return; }
  if (!saveTimer) saveTimer = setTimeout(save, 3000);
}

function day(): { rooms: number; players: number; games: number } {
  const key = new Date().toISOString().slice(0, 10);
  return (stats.daily[key] ??= { rooms: 0, players: 0, games: 0 });
}

export function statRoomCreated() { stats.roomsCreated++; day().rooms++; scheduleSave(); }
export function statPlayerJoined() { stats.playersJoined++; day().players++; scheduleSave(); }
export function statGameStarted(gameId: string) {
  stats.gamesStarted[gameId] = (stats.gamesStarted[gameId] ?? 0) + 1;
  day().games++; scheduleSave();
}
export function statConcurrent(n: number) {
  if (n > stats.peakConcurrent) { stats.peakConcurrent = n; scheduleSave(); }
}

/**
 * כיבוי מסודר: Render שולח SIGTERM לפני כל deploy — זה בדיוק הרגע שבו
 * המונים היו נמחקים. מחכים לכתיבה למסד (עד 2 שניות) לפני שיוצאים.
 */
let closing = false;
async function flush(sig: NodeJS.Signals) {
  if (closing) return;
  closing = true;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try { writeFileSync(FILE, JSON.stringify(stats)); } catch { /* לא קריטי */ }
  if (hydrated && store) {
    try {
      await Promise.race([
        store.put(KEY, stats),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
    } catch { /* המסד לא זמין — אין מה לעשות */ }
  }
  process.kill(process.pid, sig);
}
process.once("SIGTERM", () => void flush("SIGTERM"));
process.once("SIGINT", () => void flush("SIGINT"));

/* ---------- דף הסטטיסטיקות ---------- */

export const STATS_KEY = process.env.STATS_KEY || "larik-boss";

export function statsPage(gameNames: Record<string, string>, liveRooms: number, liveSockets: number): string {
  const games = Object.entries(stats.gamesStarted).sort((a, b) => b[1] - a[1]);
  const days = Object.entries(stats.daily).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
  const totalGames = games.reduce((s, [, n]) => s + n, 0);
  const row = (l: string, v: string | number) =>
    `<div class="r"><span>${l}</span><b>${v}</b></div>`;
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>LARIK — סטטיסטיקות</title><style>
body{font-family:system-ui;background:#0c0817;color:#eee;margin:0;padding:24px;max-width:640px;margin-inline:auto}
h1{font-size:22px}h2{font-size:15px;opacity:.7;margin:22px 0 8px}
.r{display:flex;justify-content:space-between;padding:9px 14px;background:rgba(255,255,255,.06);border-radius:10px;margin-bottom:6px;font-size:14px}
.r b{color:#ffd166}.note{font-size:12px;opacity:.55;line-height:1.6;margin-top:24px}
.live{color:#7ee787}</style></head><body>
<h1>🎮 LARIK — סטטיסטיקות</h1>
<h2 class="live">● עכשיו בשידור חי</h2>
${row("מחוברים כרגע", liveSockets)}${row("חדרים פעילים", liveRooms)}
<h2>מאז ${stats.since.slice(0, 10)}</h2>
${row("חדרים שנפתחו", stats.roomsCreated)}${row("שחקנים שהצטרפו", stats.playersJoined)}
${row("משחקים שהותחלו", totalGames)}${row("שיא מחוברים בו-זמנית", stats.peakConcurrent)}
<h2>לפי משחק</h2>
${games.map(([id, n]) => row(gameNames[id] ?? id, n)).join("") || '<div class="r"><span>עדיין לא שיחקו</span></div>'}
<h2>לפי יום (14 אחרונים)</h2>
${days.map(([d, v]) => row(d, `${v.rooms} חדרים · ${v.players} שחקנים · ${v.games} משחקים`)).join("") || '<div class="r"><span>אין עדיין</span></div>'}
<p class="note">עלייה אחרונה של השרת: ${stats.bootAt.replace("T", " ").slice(0, 16)} ·
המונים נשמרים במסד ושורדים deploy והרדמה. פילוח מקורות ומכשירים — ב-Google Analytics.</p>
</body></html>`;
}
