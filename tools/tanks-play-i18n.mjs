/**
 * פלייטסט התותחים 💥 בשפה זרה — 3 טלפונים, משחק שלם עד הטקס, בלי אף מילה בעברית.
 *   TK_FAST=1 TK_BOTS=1 npx tsx src/index.ts   (שרת מקוצר, מ-server/)
 *   L=en node tools/tanks-play-i18n.mjs
 * מוכיח: מרחב-השמות tanks נטען, שמות הקלפים/הפיד/התארים מגיעים כמפתחות ומרונדרים בשפת החדר.
 */
import { chromium, devices } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8787";
const LANG = process.env.L || "en";
const OUT = `/tmp/tanks-${LANG}`;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : "")); if (!ok) failed++; };
const HEB = /[֐-׿]/;
const KEY = /tanks\.[a-z_]+\.?[a-zA-Z_.]*|awards\./;
const errors = [];
const txt = (p) => p.evaluate(() => document.body.innerText);
const heb = (s) => s.match(/.{0,30}[֐-׿].{0,30}/)?.[0] || s.match(/.{0,20}(tanks\.|awards\.).{0,30}/)?.[0];
const dbg = (p) => p.evaluate(() => ({ ...(window.__tkDbg ?? { phase: "none" }), err: window.__tkErr }));
const waitPhase = async (p, ph, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await dbg(p); if (d.phase === ph) return d; await sleep(120); } return await dbg(p); };

async function main() {
  const browser = await chromium.launch({ args: ["--no-proxy-server"], env: { ...process.env, HTTPS_PROXY: "", HTTP_PROXY: "", https_proxy: "", http_proxy: "" } });
  const phones = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext({ ...devices["Pixel 7"] });
    const p = await ctx.newPage();
    p.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|ERR_TUNNEL|ERR_BLOCKED/.test(m.text())) errors.push(`P${i}: ${m.text()}`); });
    p.on("pageerror", (e) => errors.push(`P${i}: ${e.message}`));
    phones.push(p);
  }
  const [host, a, b] = phones;
  const names = ["Dana", "Omer", "Yuki"];
  const enter = async (p, name) => { const i = p.locator("input").first(); await i.waitFor({ timeout: 15000 }); await i.type(name, { delay: 30 }); await p.locator("button.btn").first().click(); await p.waitForTimeout(600); };

  await host.goto(`${BASE}/?l=${LANG}`, { waitUntil: "networkidle" });
  await host.locator("button.mega-cta").click();
  await host.waitForTimeout(1200);
  await enter(host, names[0]);
  const code = (await txt(host)).match(/\b[A-Z]{4}\b/)?.[0];
  check("room opened", !!code, code);
  for (const [i, p] of [a, b].entries()) { await p.goto(`${BASE}/r/${code}?l=${LANG}`, { waitUntil: "networkidle" }); await enter(p, names[i + 1]); }
  await host.waitForTimeout(1000);

  await host.locator("button.gcard", { hasText: /Cannon|Cañon|Canh|대포|大砲|المدافع|התותחים/ }).first().click();
  await host.waitForTimeout(800);
  await host.screenshot({ path: `${OUT}/01-lobby.png`, fullPage: true });
  const lobby = await txt(host);
  check("lobby: options localized", !HEB.test(lobby), heb(lobby));
  await host.locator("button.btn", { hasText: /🚀/ }).first().click();
  await host.waitForTimeout(1500);
  await Promise.all(phones.map((p) => p.locator("button", { hasText: /👍/ }).first().click({ timeout: 1500 }).catch(() => {})));

  // pick
  await waitPhase(host, "pick", 10000);
  await sleep(400);
  await host.screenshot({ path: `${OUT}/02-pick.png` });
  const pick = await txt(host);
  check("pick screen localized (color names from tanks.char.*)", !HEB.test(pick) && !KEY.test(pick), heb(pick));
  try { await host.locator(".tk-pick .tile").nth(0).click({ timeout: 2000 }); await a.locator(".tk-pick .tile").nth(3).click({ timeout: 2000 }); await b.locator(".tk-pick .tile").nth(5).click({ timeout: 2000 }); } catch { console.log("  (pick partially skipped)"); }
  await sleep(300);
  await a.screenshot({ path: `${OUT}/02b-pick-taken.png` });
  for (const p of phones) await p.evaluate(() => { window.__tkAuto = true; });

  await waitPhase(host, "aim", 12000);
  await sleep(600);
  await host.screenshot({ path: `${OUT}/03-aim.png` });
  const aim = await txt(host);
  check("aim HUD localized", !HEB.test(aim) && !KEY.test(aim), heb(aim));

  let shots = { garage: 0, sky: 0, bo: 0, feed: 0 };
  let last = ""; const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    const d = await dbg(host);
    if (d.err) { errors.push("tkErr: " + d.err); }
    if (d.phase !== last) { console.log("  phase:", d.phase, "b=", d.b, "k=", d.k, "alive=", d.alive); last = d.phase; }
    if (d.phase === "garage" && !shots.garage++) {
      await sleep(400);
      await host.screenshot({ path: `${OUT}/04-garage.png` });
      const g = await txt(host);
      check("garage localized (card names/desc/rarity/category)", !HEB.test(g) && !KEY.test(g), heb(g));
      const cards = host.locator(".tk-garage .card:not(.poor)"); if (await cards.count()) { await cards.nth(0).click({ force: true }); await sleep(400); await host.screenshot({ path: `${OUT}/05-garage-bought.png` }); const g2 = await txt(host); check("buy toast localized", !HEB.test(g2) && !KEY.test(g2), heb(g2)); }
    }
    if ((d.phase === "aim" || d.phase === "salvo") && shots.feed < 3) {
      const f = await host.evaluate(() => [...document.querySelectorAll(".tk-feed div")].map((x) => x.textContent));
      if (f.length) { shots.feed++; check("feed lines localized: " + f.join(" | ").slice(0, 80), !f.some((x) => HEB.test(x) || KEY.test(x))); if (shots.feed === 1) await host.screenshot({ path: `${OUT}/06-feed.png` }); }
    }
    if (d.phase === "aim" && d.alive === false && !shots.sky++) {
      await host.evaluate(() => { window.__tkAuto = false; }); await sleep(500);
      await host.screenshot({ path: `${OUT}/07-sky.png` });
      const s = await txt(host); check("sky cards localized", !HEB.test(s) && !KEY.test(s), heb(s));
      await host.evaluate(() => { window.__tkAuto = true; });
    }
    if (d.phase === "battleover" && !shots.bo++) { await sleep(500); await host.screenshot({ path: `${OUT}/08-battleover.png` }); const s = await txt(host); check("battle over localized", !HEB.test(s) && !KEY.test(s), heb(s)); }
    if (d.phase === "over") break;
    await sleep(500);
  }
  await sleep(400);
  await a.screenshot({ path: `${OUT}/09-over.png` });
  const ov = await txt(a);
  check("game over screen localized (titles from server keys)", /\S/.test(ov) && !HEB.test(ov) && !KEY.test(ov), heb(ov));
  console.log("--- over text ---\n" + ov.split("\n").filter(Boolean).slice(0, 14).join(" | "));
  let cer = "";
  for (let i = 0; i < 16; i++) { await sleep(500); cer = await txt(host); if (/🌙|🏅/.test(cer)) break; }
  await host.screenshot({ path: `${OUT}/10-ceremony.png`, fullPage: true });
  check("ceremony reached", /🌙|🏅|💥/.test(cer));
  check("ceremony localized: title + award from server keys", !HEB.test(cer) && !/awards\.|tanks\.end/.test(cer), heb(cer));
  console.log("--- ceremony text (host) ---\n" + cer.split("\n").filter(Boolean).slice(0, 18).join(" | "));
  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" ; "));
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nALL OK");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
