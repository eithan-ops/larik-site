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
  const dir = join(ROOT, "client/src/locales");
  const he = Object.keys(JSON.parse(readFileSync(join(dir, "he/common.json"), "utf-8")));
  let bad = 0;
  for (const l of readdirSync(dir)) {
    if (!statSync(join(dir, l)).isDirectory() || l === "he") continue;
    const keys = new Set(Object.keys(JSON.parse(readFileSync(join(dir, l, "common.json"), "utf-8"))));
    const missing = he.filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !he.includes(k));
    if (missing.length || extra.length) { bad++; console.error(`✗ ${l}: missing ${missing.length} ${JSON.stringify(missing.slice(0, 5))} extra ${extra.length} ${JSON.stringify(extra.slice(0, 5))}`); }
    else console.log(`✓ ${l}: ${keys.size} keys`);
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
