/**
 * פלייטסט הגנבים 🥷 בשפה זרה — 3 טלפונים, ריצה להר, עצירה + מדף + חשיפה, עד הצפירה והטקס, בלי אף מילה בעברית.
 *   TH_FAST=1 npx tsx src/index.ts   (שרת מקוצר, מ-server/)
 *   L=en node tools/thieves-play-i18n.mjs
 */
import { chromium, devices } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8787";
const LANG = process.env.L || "en";
const OUT = `/tmp/thieves-${LANG}`;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : "")); if (!ok) failed++; };
const HEB = /[֐-׿]/;
const KEY = /thieves\.[a-z_]+\.?[a-zA-Z_.]*|awards\./;
const errors = [];
const txt = (p) => p.evaluate(() => document.body.innerText);
const bad = (s) => s.match(/.{0,30}[֐-׿].{0,30}/)?.[0] || s.match(/.{0,20}(thieves\.|awards\.).{0,30}/)?.[0];
const ok = (s) => !HEB.test(s) && !KEY.test(s);
const dbg = (p) => p.evaluate(() => { const g = window.__thDbg; return g ? { ready: g.ready, go: g.go, paused: g.paused, k: g.k, over: g.over } : { none: true }; });
const waitFor = async (p, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await dbg(p); if (fn(d)) return d; await sleep(120); } return await dbg(p); };

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

  await host.locator("button.gcard", { hasText: /Thieves|Ladrones|Ladrões|도둑들|泥棒たち|اللصوص|הגנבים/ }).first().click();
  await host.waitForTimeout(800);
  await host.screenshot({ path: `${OUT}/01-lobby.png`, fullPage: true });
  check("lobby: options localized", !HEB.test(await txt(host)), bad(await txt(host)));
  await host.locator("button.btn", { hasText: /🚀/ }).first().click();
  await host.waitForTimeout(1500);
  await Promise.all(phones.map((p) => p.locator("button", { hasText: /👍/ }).first().click({ timeout: 1500 }).catch(() => {})));

  await waitFor(host, (d) => d.ready, 12000); await sleep(600);
  await host.screenshot({ path: `${OUT}/02-countdown.png` });
  const cd = await txt(host); check("countdown localized", ok(cd), bad(cd));
  await waitFor(host, (d) => d.go, 8000); await sleep(500);
  await host.screenshot({ path: `${OUT}/03-go.png` });
  const go = await txt(host); check("go banner + HUD localized", ok(go), bad(go));
  // run toward the mountain with the keyboard (host spawns top-left → down-right)
  const runs = [["d", "s"], ["a", "w"], ["a", "s"]];
  await Promise.all(phones.map(async (p, i) => { await p.keyboard.down(runs[i][0]); await p.keyboard.down(runs[i][1]); await sleep(3600); await p.keyboard.up(runs[i][0]); await p.keyboard.up(runs[i][1]); }));
  await sleep(2000);
  await host.screenshot({ path: `${OUT}/04-mine.png` });
  const mine = await txt(host); check("mining HUD localized", ok(mine), bad(mine));
  await Promise.all(phones.map(async (p, i) => { const back = { d: "a", a: "d", s: "w", w: "s" }; await p.keyboard.down(back[runs[i][0]]); await p.keyboard.down(back[runs[i][1]]); await sleep(4200); await p.keyboard.up(back[runs[i][0]]); await p.keyboard.up(back[runs[i][1]]); }));
  await host.screenshot({ path: `${OUT}/05-carry.png` });
  const carry = await txt(host); check("carry HUD localized", ok(carry), bad(carry));

  await waitFor(host, (d) => d.paused, 20000); await sleep(500);
  await host.screenshot({ path: `${OUT}/06-freeze.png` });
  const fr = await txt(host); check("pause board localized", ok(fr), bad(fr));
  try { await host.locator(".th-shelf").waitFor({ timeout: 8000 }); } catch { /* */ }
  await sleep(400);
  await host.screenshot({ path: `${OUT}/07-shelf.png` });
  const sh = await txt(host); check("shop localized (cards/tracks/prices)", ok(sh), bad(sh));
  const cards = host.locator(".th-card:not(.poor)"); if (await cards.count()) { await cards.nth(0).click({ force: true }); await sleep(250); await cards.nth(0).click({ force: true }); await sleep(400); const sb = await txt(host); check("bought hint localized", ok(sb), bad(sb)); }
  try { await a.locator(".th-skip").click({ force: true, timeout: 1500 }); } catch { /* */ }
  await sleep(300);
  const sk = await txt(a); check("skip hint localized", ok(sk), bad(sk));
  try { await host.locator(".th-reveal").waitFor({ timeout: 15000 }); } catch { /* */ }
  await sleep(500);
  await host.screenshot({ path: `${OUT}/08-reveal.png` });
  const rv = await txt(host); check("reveal localized", ok(rv), bad(rv));
  await waitFor(host, (d) => !d.paused, 15000); await sleep(800);
  const rs = await txt(host); check("resume toast localized", ok(rs), bad(rs));

  await waitFor(host, (d) => d.over, 120000); await sleep(600);
  await host.screenshot({ path: `${OUT}/09-over.png` });
  let cer = "";
  for (let i = 0; i < 24; i++) { await sleep(500); cer = await txt(host); if (/🌙|🏅/.test(cer)) break; }
  await host.screenshot({ path: `${OUT}/10-ceremony.png`, fullPage: true });
  check("ceremony reached", /🌙|🏅/.test(cer));
  check("ceremony localized: title (thieves.end.title) + award", !HEB.test(cer) && !/awards\.|thieves\.end/.test(cer), bad(cer));
  console.log("--- ceremony text (host) ---\n" + cer.split("\n").filter(Boolean).slice(0, 14).join(" | "));
  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" ; "));
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nALL OK");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
