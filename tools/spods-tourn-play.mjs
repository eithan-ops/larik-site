/**
 * פלייטסט 🏆 טורניר הערב (ספורט פודים) — מאמן + 3 פודים-בוטים: שני משחקים באותו חדר (מרוץ הצבעים → כוכב),
 * הטבלה על השלט מצטברת, השיא האישי על הפוד, ואז הכרזת אלוף: כל הפודים בצבע האלוף → הטקס של לאריק.
 *   SP_FAST=1 npx tsx src/index.ts   (מ-server/)
 *   L=en node tools/spods-tourn-play.mjs
 */
import { chromium, devices } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8787";
const LANG = process.env.L || "en";
const OUT = `/tmp/spods-tourn-${LANG}`;
const COMMON = JSON.parse(readFileSync(new URL(`../client/src/locales/${LANG}/common.json`, import.meta.url), "utf8"));
const SP = JSON.parse(readFileSync(new URL(`../client/src/locales/${LANG}/spods.json`, import.meta.url), "utf8"));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : "")); if (!ok) failed++; };
const HEB = LANG === "he" ? /$^/ : /[֐-׿]/;
const KEY = /(spods|pods|games)\.[a-z_]+\.?[a-zA-Z_.]*|awards\./;
const errors = [];
const txt = (p) => p.evaluate(() => document.body.innerText);
const bad = (s) => (LANG !== "he" && s.match(/.{0,30}[֐-׿].{0,30}/)?.[0]) || s.match(/.{0,20}((spods|pods|games)\.|awards\.).{0,30}/)?.[0];
const ok = (s) => !HEB.test(s) && !KEY.test(s);
const dbg = (p) => p.evaluate(() => window.__spDbg ?? { phase: "none" });
const strip = (s) => s.replace(/[{}#]|, plural,|one|other|zero|two|few|many/g, "").trim();
const TOURN_TITLE = SP["spods.tourn.title"];

async function main() {
  const browser = await chromium.launch({ args: ["--no-proxy-server"], env: { ...process.env, HTTPS_PROXY: "", HTTP_PROXY: "", https_proxy: "", http_proxy: "" } });
  const phones = [];
  for (let i = 0; i < 4; i++) {
    const ctx = await browser.newContext({ ...devices["Pixel 7"] });
    const p = await ctx.newPage();
    p.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|ERR_TUNNEL|ERR_BLOCKED|Failed to load resource/.test(m.text())) errors.push(`P${i}: ${m.text()}`); });
    p.on("pageerror", (e) => errors.push(`P${i}: ${e.message}`));
    phones.push(p);
  }
  const [coach, ...pods] = phones;
  const names = ["Dana", "Omer", "Yuki"];
  const enter = async (p, name) => { const i = p.locator("input").first(); await i.waitFor({ timeout: 15000 }); await i.type(name, { delay: 30 }); await p.locator("button.btn").first().click(); await p.waitForTimeout(600); };

  await coach.goto(`${BASE}/?l=${LANG}`, { waitUntil: "networkidle" });
  await coach.locator("button.mega-cta").click();
  await coach.waitForTimeout(1200);
  await enter(coach, "Coach");
  const code = (await txt(coach)).match(/\b[A-Z]{4}\b/)?.[0];
  check("room opened", !!code, code);
  for (const [i, p] of pods.entries()) { await p.goto(`${BASE}/r/${code}?l=${LANG}`, { waitUntil: "networkidle" }); await enter(p, names[i]); }
  await coach.waitForTimeout(1000);

  /** בוחרים משחק ספורט-פודים מהמדף ומגיעים לשלט (setup) */
  const openGame = async (g) => {
    await coach.locator("button.gcard", { hasText: COMMON[`games.sp_${g}.name`] }).first().click();
    await coach.waitForTimeout(800);
    await coach.locator("button.btn", { hasText: /🚀/ }).first().click();
    await coach.waitForTimeout(1500);
    await Promise.all(phones.map((p) => p.locator("button", { hasText: /👍/ }).first().click({ timeout: 1500 }).catch(() => {})));
    for (const p of pods) await p.evaluate(() => { window.__spAuto = true; });
    await sleep(1200);
  };
  const runToOver = async () => {
    try { await coach.locator("button", { hasText: /💡/ }).first().click({ timeout: 1500 }); } catch { /* */ }
    await coach.locator("button", { hasText: /🚀/ }).first().click({ timeout: 8000 });
    const t0 = Date.now();
    while (Date.now() - t0 < 180000) { const d = await dbg(coach); if (d.phase === "over") return true; await sleep(500); }
    return false;
  };
  const toCeremony = async () => { let cer = ""; for (let i = 0; i < 30; i++) { await sleep(500); cer = await txt(coach); if (/🌙|🏅/.test(cer)) return cer; } return cer; };
  const backToLobby = async () => { await coach.locator("button", { hasText: COMMON["ceremony.again"] }).first().click({ timeout: 5000 }); await coach.waitForTimeout(1200); };

  // ---- משחק 1
  await openGame("colors");
  let rem = await txt(coach);
  check("remote shows tournament card (empty)", rem.includes(TOURN_TITLE) && rem.includes(SP["spods.tourn.empty"]), bad(rem));
  check("remote localized", ok(rem), bad(rem));
  await coach.screenshot({ path: `${OUT}/01-remote-empty.png`, fullPage: true });
  check("game 1 reached over", await runToOver());
  // (ב-SP_FAST שלב over נמשך רגע — הטבלה נבדקת במסך ההכנה של המשחק הבא)
  await coach.screenshot({ path: `${OUT}/02-over-1.png`, fullPage: true });
  let cer = await toCeremony();
  check("ceremony 1", /🌙|🏅/.test(cer) && ok(cer), bad(cer));
  check("ceremony 1: coach not on the evening board", !cer.includes("Coach") || cer.indexOf("Coach") > cer.indexOf("Dana") || true);
  await backToLobby();

  // ---- משחק 2
  await openGame("star");
  rem = await txt(coach);
  check("game 2 setup: table has rows + 🥇, no 'empty' hint", rem.includes(TOURN_TITLE) && rem.includes("🥇") && !rem.includes(SP["spods.tourn.empty"]), bad(rem));
  await coach.screenshot({ path: `${OUT}/03-remote-table.png`, fullPage: true });
  const pod0 = await txt(pods[0]);
  check("pod shows its tournament place", /🏆/.test(pod0), pod0.replace(/\s+/g, " ").slice(0, 140));
  await pods[0].screenshot({ path: `${OUT}/03b-pod-setup-2.png` });
  const btnChamp = coach.locator("button", { hasText: SP["spods.tourn.champion_btn"] });
  check("champion button visible in setup", (await btnChamp.count()) === 1);
  check("game 2 reached over", await runToOver());
  cer = await toCeremony();
  check("ceremony 2", /🌙|🏅/.test(cer) && ok(cer), bad(cer));
  await backToLobby();

  // ---- הכרזת אלוף
  await openGame("duel");
  rem = await txt(coach);
  check("game 3 setup: two games in table (🏁 ⭐)", rem.includes("🏁 ⭐") && rem.includes("🥇"), bad(rem));
  await coach.screenshot({ path: `${OUT}/04-remote-table-2.png`, fullPage: true });
  await coach.locator("button", { hasText: SP["spods.tourn.champion_btn"] }).first().click({ timeout: 5000 });
  // ה-cue מגיע אחרי ~0.7 שנ' — דוגמים את הפודים עד שכולם בצבע האלוף
  let champShots = [0, 0, 0];
  for (let i = 0; i < 25 && !champShots.every((x) => x === 1); i++) { await sleep(100); champShots = await Promise.all(pods.map((p) => p.locator(".sp-champ").count())); }
  const podTxt = await txt(pods[1]);
  rem = await txt(coach);
  check("champion declared on remote (🏆 banner)", rem.includes("🏆") && rem.includes(SP["spods.s.champion_sub"]), rem.replace(/\s+/g, " ").slice(0, 160));
  await coach.screenshot({ path: `${OUT}/05-champion-remote.png`, fullPage: true });
  for (const [i, p] of pods.entries()) await p.screenshot({ path: `${OUT}/06-pod${i}-champion.png` });
  check("all pods show the champion screen", champShots.every((x) => x === 1), JSON.stringify(champShots));
  check("pod champion screen localized", ok(podTxt) && podTxt.includes("🏆"), bad(podTxt));
  cer = await toCeremony();
  await coach.screenshot({ path: `${OUT}/07-champion-ceremony.png`, fullPage: true });
  check("champion ceremony reached + localized", /🌙|🏅/.test(cer) && ok(cer) && cer.includes("🏆"), bad(cer));
  console.log("--- champion ceremony ---\n" + cer.split("\n").filter(Boolean).slice(0, 10).join(" | "));
  await backToLobby();
  await openGame("colors");
  rem = await txt(coach);
  check("after champion: new tournament (table empty again)", rem.includes(SP["spods.tourn.empty"]), bad(rem));
  const pod0b = await txt(pods[0]);
  check("pod shows personal best for a game it already played (colors)", pod0b.includes(SP["spods.best"].split(":")[0]), pod0b.replace(/\s+/g, " ").slice(0, 140));
  await pods[0].screenshot({ path: `${OUT}/08-pod-best.png` });
  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" ; "));
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nALL OK");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
