/**
 * LARIK — אנליטיקה פנימית (פרטית לגמרי, בלי אף גורם שלישי)
 *
 * סופרת שימוש אמיתי: חדרים שנפתחו, שחקנים שהצטרפו, משחקים שהותחלו (לפי משחק),
 * ושיא מחוברים בו-זמנית. נשמר לקובץ JSON — הערה כנה: בדיסק של Render free
 * הקובץ נמחק ב-deploy/הרדמות, אז המספרים ההיסטוריים המלאים חיים ב-Google Analytics,
 * וכאן רואים תמונת מצב חיה + מאז העלייה האחרונה.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

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

function fresh(): StatsData {
  const now = new Date().toISOString();
  return { since: now, bootAt: now, roomsCreated: 0, playersJoined: 0, gamesStarted: {}, peakConcurrent: 0, daily: {} };
}

function load(): StatsData {
  try {
    if (existsSync(FILE)) {
      const d = { ...fresh(), ...JSON.parse(readFileSync(FILE, "utf8")) } as StatsData;
      d.bootAt = new Date().toISOString();
      return d;
    }
  } catch { /* קובץ פגום — מתחילים נקי */ }
  return fresh();
}

export const stats = load();

let saveTimer: NodeJS.Timeout | null = null;
function save() {
  saveTimer = null;
  try { writeFileSync(FILE, JSON.stringify(stats)); } catch { /* דיסק לקריאה בלבד? לא קריטי */ }
}
function scheduleSave() {
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

process.on("SIGTERM", save);
process.on("SIGINT", save);

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
ב-Render free המונים מתאפסים ב-deploy — ההיסטוריה המלאה נשמרת ב-Google Analytics.</p>
</body></html>`;
}
