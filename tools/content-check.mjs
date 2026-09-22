/**
 * בדיקת תוכן לפי שפה — server/src/content/<lang>.ts: מבנה, כמויות, כפילויות, כתב נכון, טריוויה תקינה.
 *   node tools/content-check.mjs            (כל השפות)
 *   node tools/content-check.mjs en es      (חלק)
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LANGS = process.argv.slice(2).length ? process.argv.slice(2) : ["he", "en", "es", "pt", "ko", "ja", "ar"];
const SCRIPT = {
  he: /[֐-׿]/, ar: /[؀-ۿ]/, ko: /[가-힯]/, ja: /[぀-ヿ一-鿿]/,
  en: /[a-zA-Z]/, es: /[a-zA-Z]/, pt: /[a-zA-Z]/,
};
const FOREIGN = { he: /[؀-ۿ가-힯぀-ヿ一-鿿]/, ar: /[֐-׿가-힯぀-ヿ一-鿿]/,
  ko: /[֐-׿؀-ۿ぀-ヿ]/, ja: /[֐-׿؀-ۿ가-힯]/,
  en: /[֐-׿؀-ۿ가-힯぀-ヿ一-鿿]/, es: /[֐-׿؀-ۿ가-힯぀-ヿ一-鿿]/, pt: /[֐-׿؀-ۿ가-힯぀-ヿ一-鿿]/ };
const MIN = { animals: 36, celebs: 28, food: 28, cartoons: 26, impostor: 55, uc2: 80, uc1: 50, triviaLocal: 10, triviaWorld: 10, triviaScience: 10 };

let bad = 0;
for (const lang of LANGS) {
  const probs = [];
  const r = spawnSync("npx", ["tsx", "-e", `import("./server/src/content/${lang}.ts").then((m) => console.log(JSON.stringify(m.${lang})))`], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0 || !r.stdout.trim()) { console.log(`✗ ${lang}: cannot load — ${(r.stderr || "").split("\n").slice(0, 3).join(" | ").slice(0, 300)}`); bad++; continue; }
  let c; try { c = JSON.parse(r.stdout.trim().split("\n").pop()); } catch (e) { console.log(`✗ ${lang}: bad JSON ${e.message}`); bad++; continue; }
  const okScript = (s) => SCRIPT[lang].test(s) && !FOREIGN[lang].test(s);
  const dupes = (arr) => { const seen = new Set(), d = []; for (const x of arr) { const k = String(x).trim().toLowerCase(); if (seen.has(k)) d.push(x); seen.add(k); } return d; };
  for (const k of ["animals", "celebs", "food", "cartoons"]) {
    const cards = c.decks?.[k]?.cards;
    if (!Array.isArray(cards)) { probs.push(`deck ${k} missing`); continue; }
    if (cards.length < MIN[k]) probs.push(`deck ${k}: ${cards.length} < ${MIN[k]}`);
    const d = dupes(cards); if (d.length) probs.push(`deck ${k} dupes: ${d.slice(0, 4).join(", ")}`);
    const f = cards.filter((x) => typeof x !== "string" || !x.trim() || x.length > 40 || !okScript(x)); if (f.length) probs.push(`deck ${k} bad cards: ${f.slice(0, 4).join(", ")}`);
  }
  const ip = c.impostorPairs ?? [];
  if (ip.length < MIN.impostor) probs.push(`impostor pairs: ${ip.length} < ${MIN.impostor}`);
  const ipBad = ip.filter((p) => !Array.isArray(p) || p.length !== 2 || p[0] === p[1] || !p.every((w) => typeof w === "string" && okScript(w)));
  if (ipBad.length) probs.push(`impostor bad: ${JSON.stringify(ipBad.slice(0, 3))}`);
  const ipD = dupes(ip.map((p) => p.join("|"))); if (ipD.length) probs.push(`impostor dupes: ${ipD.slice(0, 3).join(" ; ")}`);
  const uc = c.undercoverPairs ?? [];
  const uc2 = uc.filter((p) => p.d === 2).length, uc1 = uc.filter((p) => p.d === 1).length;
  if (uc2 < MIN.uc2) probs.push(`undercover d:2 ${uc2} < ${MIN.uc2}`);
  if (uc1 < MIN.uc1) probs.push(`undercover d:1 ${uc1} < ${MIN.uc1}`);
  const ucBad = uc.filter((p) => !p || typeof p.a !== "string" || typeof p.b !== "string" || p.a === p.b || ![1, 2].includes(p.d) || !okScript(p.a) || !okScript(p.b));
  if (ucBad.length) probs.push(`undercover bad: ${JSON.stringify(ucBad.slice(0, 3))}`);
  const ucD = dupes(uc.map((p) => `${p.a}|${p.b}`)); if (ucD.length) probs.push(`undercover dupes: ${ucD.slice(0, 3).join(" ; ")}`);
  const tr = c.trivia ?? [];
  const byCat = { israel: 0, world: 0, science: 0, weird: 0 };
  for (const q of tr) {
    byCat[q.cat] = (byCat[q.cat] ?? 0) + 1;
    if (!q.q || typeof q.q !== "string" || !okScript(q.q)) probs.push(`trivia bad q: ${String(q.q).slice(0, 40)}`);
    else if (!Array.isArray(q.options) || q.options.length !== 4) probs.push(`trivia not 4 options: ${q.q.slice(0, 40)}`);
    else if (new Set(q.options.map((o) => String(o).trim().toLowerCase())).size !== 4) probs.push(`trivia dup options: ${q.q.slice(0, 40)}`);
    else if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) probs.push(`trivia bad correct: ${q.q.slice(0, 40)}`);
    else if (!["israel", "world", "science", "weird"].includes(q.cat)) probs.push(`trivia bad cat: ${q.q.slice(0, 40)}`);
    else if ((q.q.match(/\?/g) || []).length > 1) probs.push(`trivia two questions: ${q.q.slice(0, 40)}`);
    else if (q.options.some((o) => !okScript(String(o)) && !/^[\d\s.,%+\-–—/]+$/.test(String(o)))) probs.push(`trivia foreign option: ${q.q.slice(0, 40)}`);
  }
  if (byCat.israel < MIN.triviaLocal) probs.push(`trivia local ${byCat.israel} < ${MIN.triviaLocal}`);
  if (byCat.world < MIN.triviaWorld) probs.push(`trivia world ${byCat.world} < ${MIN.triviaWorld}`);
  if (byCat.science < MIN.triviaScience) probs.push(`trivia science ${byCat.science} < ${MIN.triviaScience}`);
  const trD = dupes(tr.map((q) => q.q)); if (trD.length) probs.push(`trivia dupes: ${trD.slice(0, 2).join(" ; ")}`);
  // התפלגות התשובות הנכונות — אם הכול "1" השחקנים ילמדו
  const dist = [0, 1, 2, 3].map((i) => tr.filter((q) => q.correct === i).length);
  if (tr.length >= 20 && Math.max(...dist) > tr.length * 0.6) probs.push(`trivia correct-index skew: ${dist.join("/")}`);
  const summary = `decks ${["animals", "celebs", "food", "cartoons"].map((k) => c.decks?.[k]?.cards?.length ?? 0).join("/")} · impostor ${ip.length} · uc ${uc2}+${uc1} · trivia ${byCat.israel}/${byCat.world}/${byCat.science}/${byCat.weird} (correct ${dist.join("/")})`;
  if (probs.length) { bad++; console.log(`✗ ${lang}: ${summary}\n   ` + probs.slice(0, 12).join("\n   ")); } else console.log(`✓ ${lang}: ${summary}`);
}
process.exit(bad ? 1 : 0);
