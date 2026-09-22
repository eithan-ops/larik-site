#!/usr/bin/env node
/**
 * i18n-scan — מוצא עברית קשיחה בקוד (מחוץ ל-locales/ ולהערות).
 *
 *   node tools/i18n-scan.mjs            → דוח: כמה שורות עברית בכל קובץ (מה נשאר לתרגם)
 *   node tools/i18n-scan.mjs --check    → נכשל (exit 1) אם יש עברית בקבצים שכבר הועברו ל-t()
 *   node tools/i18n-scan.mjs --keys     → נכשל אם לשפה כלשהי חסר/עודף מפתח מול he/common.json
 *
 * ה-check רץ לפני build — כדי שמשחק חדש לא יחזיר עברית קשיחה למסגרת.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEB = /[\u0590-\u05FF]/;
const CODE = /\.(tsx?|css|html)$/;

/** קבצים שכבר עברו ל-t() — עברית בהם (מחוץ להערות) = רגרסיה */
const MIGRATED = [
  "client/src/components/Home.tsx",
  "client/src/components/Room.tsx",
  "client/src/components/Ceremony.tsx",
  "client/src/components/GamesShelf.tsx",
  "client/src/components/InstallPrompt.tsx",
  "client/src/components/LangSwitch.tsx",
  "client/src/lib/locale.ts",
  "client/src/main.tsx",
  "client/src/App.tsx",
  // שלב B — השרת שולח מפתחות, מטרונובול מקצה לקצה
  "client/src/games/metro.tsx",
  "client/src/games/metroSprites.ts",
  "shared/metro.ts",
  "server/src/awards.ts",
  "server/src/engine.ts",
  "server/src/games/metro.ts",
  // שלב C — התותחים
  "client/src/games/tanks.tsx",
  "client/src/games/tanksSprites.ts",
  "shared/tanks.ts",
  "server/src/games/tanks.ts",
  // שלב D — הקומות
  "client/src/games/floors.tsx",
  "client/src/games/floorsSprites.ts",
  "shared/floors.ts",
  "server/src/games/floors.ts",
  // שלב E — הגנבים
  "client/src/games/thieves.tsx",
  "shared/thieves.ts",
  "server/src/games/thieves.ts",
  // שלב F — החומה
  "client/src/games/wall.tsx",
  "server/src/games/wall.ts",
  // שלב G — ספורט פודים + פודים (shared/spods.ts נשאר עם name/tagline/howTo/labels כנפילה לקטלוג, כמו protocol.ts)
  "client/src/games/spods.tsx",
  "client/src/games/pods.tsx",
  "server/src/games/spods.ts",
  "server/src/games/pods.ts",
  // שלב H — המתחזה למתקדמים, התהום (+מפת הפיר), מי הכי, החופרים
  "client/src/games/undercover.tsx",
  "server/src/games/undercover.ts",
  "client/src/games/abyss.tsx",
  "client/src/lib/shaftcard.ts",
  "shared/abyss.ts",
  "server/src/games/abyss.ts",
  "client/src/games/whomost.tsx",
  "server/src/games/whomost.ts",
  "client/src/games/hofrim.tsx",
  "server/src/games/hofrim.ts",
  // שלב I — המשחקים הקטנים (מילות החפיסה ב-decks.ts — שלב נפרד)
  "client/src/games/forehead.tsx", "server/src/games/forehead.ts",
  "client/src/games/deathtouch.tsx", "server/src/games/deathtouch.ts",
  "client/src/games/impostor.tsx", "server/src/games/impostor.ts",
  "client/src/games/bombs.tsx", "server/src/games/bombs.ts",
  "client/src/games/colorrules.tsx", "server/src/games/colorrules.ts",
  "client/src/games/alias.tsx", "server/src/games/alias.ts",
  "client/src/games/simon.tsx", "server/src/games/simon.ts",
  "client/src/games/demons.tsx", "server/src/games/demons.ts",
  "client/src/games/trivia.tsx", "server/src/games/trivia.ts",
  // שלב K — אפליקציית המופע (show.json), כרטיסי השיתוף, היומית, סורק ה-QR, שיאי החבורה
  "client/src/lib/i18n.ts", "client/src/show/ShowLanding.tsx", "client/src/show/ShowRoom.tsx", "client/src/show/ShowApp.tsx",
  "client/src/games/show.tsx", "client/src/components/ShowGate.tsx",
  "client/src/lib/endcard.ts", "client/src/lib/sharecard.ts", "client/src/components/Daily.tsx", "client/src/components/QRScanner.tsx",
  "server/src/groups.ts",
];

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === "dist" || n === "locales" || n.startsWith(".")) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (CODE.test(n)) out.push(p);
  }
  return out;
}

/** שורות עם עברית שאינן הערה בלבד (// … · /* … · {/* … · * …) */
function hebrewCodeLines(file) {
  const lines = readFileSync(file, "utf-8").split("\n");
  const hits = [];
  let inBlock = false;
  lines.forEach((line, i) => {
    const s = line.trim();
    if (inBlock) { if (s.includes("*/")) inBlock = false; return; }
    if (s.startsWith("//") || s.startsWith("*")) return;
    if (s.startsWith("/*") || s.startsWith("{/*")) { if (!s.includes("*/")) inBlock = true; return; }
    // עברית שמופיעה רק אחרי // בסוף שורת קוד, או בתוך /* … */ באותה שורה — הערה
    const codePart = s.replace(/\/\*[\s\S]*?\*\//g, "").split("//")[0];
    if (HEB.test(codePart)) hits.push({ n: i + 1, text: s.slice(0, 90) });
  });
  return hits;
}

const mode = process.argv[2] || "";
const files = [...walk(join(ROOT, "client/src")), ...walk(join(ROOT, "server/src")), ...walk(join(ROOT, "shared"))];

if (mode === "--keys") {
  // כל מרחב-שמות (common.json, metro.json, …) חייב להיות זהה במפתחות בין עברית לכל שפה
  const dir = join(ROOT, "client/src/locales");
  const nss = readdirSync(join(dir, "he")).filter((f) => f.endsWith(".json"));
  let bad = 0;
  for (const l of readdirSync(dir)) {
    if (!statSync(join(dir, l)).isDirectory() || l === "he") continue;
    for (const ns of nss) {
      const he = Object.keys(JSON.parse(readFileSync(join(dir, "he", ns), "utf-8")));
      let keys;
      try { keys = new Set(Object.keys(JSON.parse(readFileSync(join(dir, l, ns), "utf-8")))); }
      catch { bad++; console.error(`✗ ${l}/${ns}: missing file`); continue; }
      const missing = he.filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !he.includes(k));
      if (missing.length || extra.length) { bad++; console.error(`✗ ${l}/${ns}: missing ${missing.length} ${JSON.stringify(missing.slice(0, 5))} extra ${extra.length} ${JSON.stringify(extra.slice(0, 5))}`); }
      else console.log(`✓ ${l}/${ns}: ${keys.size} keys`);
    }
  }
  process.exit(bad ? 1 : 0);
}

if (mode === "--check") {
  let bad = 0;
  for (const f of MIGRATED) {
    const hits = hebrewCodeLines(join(ROOT, f));
    if (hits.length) { bad += hits.length; console.error(`✗ ${f}`); hits.forEach((h) => console.error(`   ${h.n}: ${h.text}`)); }
  }
  if (bad) { console.error(`\n${bad} hard-coded Hebrew line(s) in migrated files — use t("key") from lib/locale.`); process.exit(1); }
  console.log(`✓ no hard-coded Hebrew in ${MIGRATED.length} migrated files`);
  process.exit(0);
}

// דוח
const rows = files.map((f) => [hebrewCodeLines(f).length, relative(ROOT, f)]).filter((r) => r[0] > 0).sort((a, b) => b[0] - a[0]);
const total = rows.reduce((s, r) => s + r[0], 0);
console.log(`${total} Hebrew code lines in ${rows.length} files (comments excluded)\n`);
for (const [n, f] of rows) console.log(String(n).padStart(5), f);
