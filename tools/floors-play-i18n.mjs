/**
 * פלייטסט הקומות 🏢 בשפה זרה — 3 טלפונים, משחק שלם עד הטקס, בלי אף מילה בעברית.
 *   FL_FAST=1 npx tsx src/index.ts   (שרת מקוצר, מ-server/)
 *   L=en node tools/floors-play-i18n.mjs
 * מוכיח: מרחב-השמות floors נטען; קלפים/קריאות/תארים/כותרת הסיום מגיעים כמזהים ומרונדרים בשפת החדר.
 */
import { chromium, devices } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8787";
const LANG = process.env.L || "en";
const OUT = `/tmp/floors-${LANG}`;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : "")); if (!ok) failed++; };
const HEB = /[֐-׿]/;
const KEY = /floors\.[a-z_]+\.?[a-zA-Z_.]*|awards\./;
const errors = [];
const txt = (p) => p.evaluate(() => document.body.innerText);
const bad = (s) => s.match(/.{0,30}[֐-׿].{0,30}/)?.[0] || s.match(/.{0,20}(floors\.|awards\.).{0,30}/)?.[0];
const ok = (s) => !HEB.test(s) && !KEY.test(s);
const dbg = (p) => p.evaluate(() => { const g = window.__flDbg?.g; return g ? { phase: g.phase, dead: g.dead, out: g.out, lives: g.lives, err: window.__flErr } : { phase: "none" }; });
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

  await host.locator("button.gcard", { hasText: /Floors|Pisos|Andares|층층이|フロアーズ|الطوابق|הקומות/ }).first().click();
  await host.waitForTimeout(800);
  await host.screenshot({ path: `${OUT}/01-lobby.png`, fullPage: true });
  check("lobby: options localized", !HEB.test(await txt(host)), bad(await txt(host)));
  await host.locator("button.btn", { hasText: /🚀/ }).first().click();
  await host.waitForTimeout(1500);
  await Promise.all(phones.map((p) => p.locator("button", { hasText: /👍/ }).first().click({ timeout: 1500 }).catch(() => {})));

  await waitPhase(host, "pick", 10000);
  await sleep(400);
  await host.screenshot({ path: `${OUT}/02-pick.png` });
  const pick = await txt(host);
  check("pick screen localized (colors from floors.char.*, easy mode)", ok(pick), bad(pick));
  try { await host.locator(".fl-pick .tile").nth(2).click({ timeout: 2000 }); await a.locator(".fl-pick .tile").nth(5).click({ timeout: 2000 }); await b.locator(".fl-pick .tile").nth(0).click({ timeout: 2000 }); } catch { console.log("  (pick partially skipped)"); }
  for (const p of phones) await p.evaluate(() => { window.__flAuto = true; });

  await waitPhase(host, "intro", 10000); await sleep(900);
  await host.screenshot({ path: `${OUT}/03-intro.png` });
  const intro = await txt(host); check("intro/how-to localized", ok(intro), bad(intro));
  await waitPhase(host, "run", 8000); await sleep(5000);
  await host.screenshot({ path: `${OUT}/04-run.png` });
  const run = await txt(host); check("run HUD localized", ok(run), bad(run));
  const feed = await host.evaluate(() => [...document.querySelectorAll(".fl-feed div")].map((x) => x.textContent));
  if (feed.length) check("feed lines localized: " + feed.join(" | ").slice(0, 90), feed.every(ok));

  await waitPhase(host, "freeze", 20000); await sleep(500);
  await host.screenshot({ path: `${OUT}/05-freeze.png` });
  const fr = await txt(host); check("freeze board localized", ok(fr), bad(fr));
  await waitPhase(host, "draft", 6000); await sleep(400);
  await host.screenshot({ path: `${OUT}/06-draft.png` });
  const dr = await txt(host); check("draft localized (card names/desc/rarity)", ok(dr), bad(dr));
  const c1 = host.locator(".fl-draft .card").nth(1); await c1.click({ force: true }).catch(() => {}); await sleep(200); await c1.click({ force: true }).catch(() => {});
  for (const p of [a, b]) { const c = p.locator(".fl-draft .card").nth(0); await c.click({ force: true }).catch(() => {}); await sleep(150); await c.click({ force: true }).catch(() => {}); }
  await sleep(300);
  const dl = await txt(host); check("draft locked hint localized", ok(dl), bad(dl));
  await waitPhase(host, "reveal", 8000); await sleep(600);
  await host.screenshot({ path: `${OUT}/07-reveal.png` });
  const rv = await txt(host); check("reveal localized", ok(rv), bad(rv));
  const feed2 = await host.evaluate(() => [...document.querySelectorAll(".fl-feed div")].map((x) => x.textContent));
  if (feed2.length) check("feed (took card) localized: " + feed2.join(" | ").slice(0, 90), feed2.every(ok));

  await waitPhase(host, "over", 90000); await sleep(800);
  await a.screenshot({ path: `${OUT}/08-over.png` });
  const ov = await txt(a);
  check("game over localized (titles from server keys)", /\S/.test(ov) && ok(ov), bad(ov));
  console.log("--- over text ---\n" + ov.split("\n").filter(Boolean).slice(0, 14).join(" | "));
  let cer = "";
  for (let i = 0; i < 24; i++) { await sleep(500); cer = await txt(host); if (/🌙|🏅/.test(cer)) break; }
  await host.screenshot({ path: `${OUT}/09-ceremony.png`, fullPage: true });
  check("ceremony reached", /🌙|🏅/.test(cer));
  check("ceremony localized: title + award from server keys", !HEB.test(cer) && !/awards\.|floors\.end/.test(cer), bad(cer));
  console.log("--- ceremony text (host) ---\n" + cer.split("\n").filter(Boolean).slice(0, 14).join(" | "));
  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" ; "));
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nALL OK");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
