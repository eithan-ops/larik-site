/**
 * פלייטסט ספורט-פודים 🏃 בשפה זרה — מאמן + 3 פודים-ספורטאים (בוטים), משחק שלם עד הטקס, בלי אף מילה בעברית.
 *   SP_FAST=1 npx tsx src/index.ts   (מ-server/)
 *   L=en G=colors node tools/spods-play-i18n.mjs     (G: colors|duel|star|beep|steal|survive|relay|stations|statue|pacer)
 */
import { chromium, devices } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8787";
const LANG = process.env.L || "en";
const GAME = process.env.G || "colors";
const OUT = `/tmp/spods-${GAME}-${LANG}`;
const COMMON = JSON.parse(readFileSync(new URL(`../client/src/locales/${LANG}/common.json`, import.meta.url), "utf8"));
const GAME_NAME = COMMON[`games.sp_${GAME}.name`];
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : "")); if (!ok) failed++; };
const HEB = /[֐-׿]/;
const KEY = /(spods|pods|games)\.[a-z_]+\.?[a-zA-Z_.]*|awards\./;
const errors = [];
const txt = (p) => p.evaluate(() => document.body.innerText);
const bad = (s) => s.match(/.{0,30}[֐-׿].{0,30}/)?.[0] || s.match(/.{0,20}((spods|pods|games)\.|awards\.).{0,30}/)?.[0];
const ok = (s) => !HEB.test(s) && !KEY.test(s);
const dbg = (p) => p.evaluate(() => window.__spDbg ?? { phase: "none" });

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

  await coach.locator("button.gcard", { hasText: GAME_NAME }).first().click();
  await coach.waitForTimeout(800);
  await coach.screenshot({ path: `${OUT}/01-lobby.png`, fullPage: true });
  check("lobby: options localized", !HEB.test(await txt(coach)), bad(await txt(coach)));
  await coach.locator("button.btn", { hasText: /🚀/ }).first().click();
  await coach.waitForTimeout(1500);
  await Promise.all(phones.map((p) => p.locator("button", { hasText: /👍/ }).first().click({ timeout: 1500 }).catch(() => {})));
  for (const p of pods) await p.evaluate(() => { window.__spAuto = true; });
  await sleep(1200);
  await coach.screenshot({ path: `${OUT}/02-remote.png`, fullPage: true });
  const rem = await txt(coach); check("coach remote (setup) localized", ok(rem), bad(rem));
  await pods[0].screenshot({ path: `${OUT}/03-pod-setup.png` });
  const ps = await txt(pods[0]); check("pod setup screen localized", ok(ps), bad(ps));
  try { await coach.locator("button", { hasText: /💡/ }).first().click({ timeout: 2000 }); } catch { /* */ }
  await coach.locator("button", { hasText: /🚀/ }).first().click({ timeout: 8000 });
  let shots = 0, lastBanner = "";
  const t0 = Date.now(); let over = false;
  while (Date.now() - t0 < 240000) {
    const d = await dbg(coach);
    const b = JSON.stringify(d.banner);
    if (b !== lastBanner) { lastBanner = b; const c = await txt(coach); if (!ok(c)) check("coach text during " + d.phase, false, bad(c)); const p0 = await txt(pods[0]); if (!ok(p0)) check("pod text during " + d.phase, false, bad(p0)); if (shots < 4) { shots++; await coach.screenshot({ path: `${OUT}/04-run-${shots}.png` }); await pods[0].screenshot({ path: `${OUT}/05-pod-${shots}.png` }); } }
    if (d.phase === "over") { over = true; break; }
    await sleep(600);
  }
  check("game reached over", over);
  const c = await txt(coach); check("coach over screen localized", ok(c), bad(c));
  await coach.screenshot({ path: `${OUT}/06-over.png`, fullPage: true });
  let cer = "";
  for (let i = 0; i < 30; i++) { await sleep(500); cer = await txt(coach); if (/🌙|🏅/.test(cer)) break; }
  await coach.screenshot({ path: `${OUT}/07-ceremony.png`, fullPage: true });
  check("ceremony reached", /🌙|🏅/.test(cer));
  check("ceremony localized: title + award", !HEB.test(cer) && !/awards\.|spods\.|pods\./.test(cer), bad(cer));
  console.log("--- ceremony text (coach) ---\n" + cer.split("\n").filter(Boolean).slice(0, 12).join(" | "));
  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" ; "));
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nALL OK");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
