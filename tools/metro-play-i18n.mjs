/**
 * פלייטסט מטרונובול 🎾 בשפה זרה — 3 טלפונים, משחק שלם עד הטקס, בלי אף מילה בעברית.
 *   MB_FAST=1 npx tsx src/index.ts   (שרת מקוצר)
 *   LANG=en node tools/metro-play-i18n.mjs
 * מוכיח: מרחב-השמות של המשחק נטען, השרת שולח מפתחות (טקס + תארים) וכל טלפון מרנדר בשפת החדר.
 */
import { chromium, devices } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8787";
const LANG = process.env.LANG_ || process.env.L || "en";
const OUT = `/tmp/metro-${LANG}`;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : "")); if (!ok) failed++; };
const HEB = /[֐-׿]/;
const errors = [];
const txt = (p) => p.evaluate(() => document.body.innerText);
const click = async (p, re) => { const b = p.locator("button", { hasText: re }).first(); await b.waitFor({ state: "visible", timeout: 15000 }); await b.click(); };

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
  check("html lang", (await host.evaluate(() => document.documentElement.lang)) === LANG);
  await host.locator("button.mega-cta").click();
  await host.waitForTimeout(1200);
  await enter(host, names[0]);
  const code = (await txt(host)).match(/\b[A-Z]{4}\b/)?.[0];
  check("room opened", !!code, code);
  const link = decodeURIComponent(await host.evaluate(() => document.querySelector('a[href*="wa.me"]')?.getAttribute("href") || ""));
  check("room link carries ?l=", link.includes(`l=${LANG}`), link);
  for (const [i, p] of [a, b].entries()) { await p.goto(`${BASE}/r/${code}?l=${LANG}`, { waitUntil: "networkidle" }); await enter(p, names[i + 1]); }
  await host.waitForTimeout(1000);

  // pick Metronoball in the catalog (by id-independent: the sticker with the localized name)
  await host.locator("button.gcard", { hasText: /Metrono|メトロ|메트로|مترونو/ }).first().click();
  await host.waitForTimeout(800);
  await host.screenshot({ path: `${OUT}/01-lobby-selected.png`, fullPage: true });
  const lobby = await txt(host);
  check("lobby: options localized (no Hebrew)", !HEB.test(lobby), lobby.match(/.{0,30}[֐-׿].{0,30}/)?.[0]);
  await host.locator("button.btn", { hasText: /🚀/ }).first().click();
  await host.waitForTimeout(1500);
  await Promise.all(phones.map((p) => p.locator("button", { hasText: /👍/ }).first().click({ timeout: 1500 }).catch(() => {})));
  await host.waitForTimeout(300);

  // pick balls
  await host.screenshot({ path: `${OUT}/01b-after-start.png` });
  console.log("after start (host):", (await txt(host)).replace(/\s+/g, " ").slice(0, 300));
  // מסך בחירת הכדור נמשך 4 שניות ב-MB_FAST — תופסים אותו אם הוא עוד שם
  try { await a.locator(".mb-pick").waitFor({ timeout: 300 }); await a.screenshot({ path: `${OUT}/02-pick.png` }); const pick = await txt(a); check("pick screen localized", !HEB.test(pick), pick.match(/.{0,30}[\u0590-\u05FF].{0,30}/)?.[0]); } catch { console.log("  (pick phase already over)"); }
  for (const p of phones) await p.evaluate(() => { window.__mbAuto = true; });

  // play rounds: whoever is leader presses done; screenshots along the way
  let shotsSet = 0, shotsPad = 0, shotsRes = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    let over = false;
    for (const p of phones) {
      const ph = await p.evaluate(() => document.querySelector(".mb-over") ? "over" : document.querySelector(".mb-result") ? "result" : document.querySelector(".mb-leadpanel:not(.watch)") ? "set" : document.querySelector(".mb-pad") ? "pad" : document.querySelector(".mb-wrap") ? "wrap" : "none");
      if (ph === "set") { if (!shotsSet++) { await p.screenshot({ path: `${OUT}/03-leader-set.png` }); const s = await txt(p); check("leader panel localized", !HEB.test(s), s.match(/.{0,30}[֐-׿].{0,30}/)?.[0]); } try { await p.locator("button.mb-done").click({ timeout: 500 }); } catch { /* */ } }
      if (ph === "pad" && !shotsPad++) { await p.screenshot({ path: `${OUT}/04-pad.png` }); const s = await txt(p); check("tap pad localized", !HEB.test(s), s.match(/.{0,30}[֐-׿].{0,30}/)?.[0]); }
      if (ph === "result" && !shotsRes++) { await p.screenshot({ path: `${OUT}/05-result.png` }); const s = await txt(p); check("round result localized", !HEB.test(s), s.match(/.{0,30}[֐-׿].{0,30}/)?.[0]); }
      if (ph === "over") { over = true; }
    }
    if (over) break;
    await sleep(400);
  }
  await sleep(300);
  await a.screenshot({ path: `${OUT}/06-over.png` });
  const ov = await txt(a);
  check("game over screen localized (titles from server keys)", /\S/.test(ov) && !HEB.test(ov), ov.match(/.{0,30}[֐-׿].{0,30}/)?.[0]);
  // ceremony
  await host.waitForTimeout(2500);
  const cer = await txt(host);
  await host.screenshot({ path: `${OUT}/07-ceremony.png`, fullPage: true });
  await b.screenshot({ path: `${OUT}/08-ceremony-player.png`, fullPage: true });
  check("ceremony reached", /🌙|🏅|🎾/.test(cer));
  check("ceremony localized: title + award from server keys", !HEB.test(cer) && !/awards\.|metro\.end/.test(cer), cer.match(/.{0,30}([֐-׿]|awards\.|metro\.end).{0,30}/)?.[0]);
  console.log("--- ceremony text (host) ---\n" + cer.split("\n").filter(Boolean).slice(0, 18).join(" | "));
  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" ; "));
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nALL OK");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
