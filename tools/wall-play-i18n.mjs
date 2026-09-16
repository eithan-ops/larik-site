/**
 * פלייטסט החומה 🏰 בשפה זרה — 2 טלפונים (טייס + מקלען), היערכות, קרב, דראפט, נפילת החומה, טקס. בלי אף מילה בעברית.
 *   npx tsx src/index.ts   (מ-server/)
 *   L=en node tools/wall-play-i18n.mjs
 */
import { chromium, devices } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8787";
const LANG = process.env.L || "en";
const OUT = `/tmp/wall-${LANG}`;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : "")); if (!ok) failed++; };
const HEB = /[֐-׿]/;
const KEY = /wall\.[a-z_]+\.?[a-zA-Z_.]*|awards\./;
const errors = [];
const txt = (p) => p.evaluate(() => document.body.innerText);
const bad = (s) => s.match(/.{0,30}[֐-׿].{0,30}/)?.[0] || s.match(/.{0,20}(wall\.|awards\.).{0,30}/)?.[0];
const ok = (s) => !HEB.test(s) && !KEY.test(s);
const dbg = (p) => p.evaluate(() => ({ phase: window.__wlDbg?.phase, wave: window.__wlDbg?.wave, err: (window.__wlErr ?? "").slice(0, 200) }));

async function main() {
  const browser = await chromium.launch({ args: ["--no-proxy-server"], env: { ...process.env, HTTPS_PROXY: "", HTTP_PROXY: "", https_proxy: "", http_proxy: "" } });
  const phones = [];
  for (let i = 0; i < 2; i++) {
    const ctx = await browser.newContext({ ...devices["Pixel 7"] });
    const p = await ctx.newPage();
    p.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|ERR_TUNNEL|ERR_BLOCKED|Failed to load resource/.test(m.text())) errors.push(`P${i}: ${m.text()}`); });
    p.on("pageerror", (e) => errors.push(`P${i}: ${e.message}`));
    phones.push(p);
  }
  const [host, a] = phones;
  const enter = async (p, name) => { const i = p.locator("input").first(); await i.waitFor({ timeout: 15000 }); await i.type(name, { delay: 30 }); await p.locator("button.btn").first().click(); await p.waitForTimeout(600); };

  await host.goto(`${BASE}/?l=${LANG}`, { waitUntil: "networkidle" });
  await host.locator("button.mega-cta").click();
  await host.waitForTimeout(1200);
  await enter(host, "Dana");
  const code = (await txt(host)).match(/\b[A-Z]{4}\b/)?.[0];
  check("room opened", !!code, code);
  await a.goto(`${BASE}/r/${code}?l=${LANG}`, { waitUntil: "networkidle" }); await enter(a, "Omer");
  await host.waitForTimeout(1000);

  await host.locator("button.gcard", { hasText: /Wall|Muralla|Muralha|성벽|城壁|السور|החומה/ }).first().click();
  await host.waitForTimeout(800);
  check("lobby: options localized", !HEB.test(await txt(host)), bad(await txt(host)));
  await host.locator("button.btn", { hasText: /🚀/ }).first().click();
  await host.waitForTimeout(1500);
  await Promise.all(phones.map((p) => p.locator("button", { hasText: /👍/ }).first().click({ timeout: 1500 }).catch(() => {})));
  await sleep(1200);
  await host.screenshot({ path: `${OUT}/01-setup.png`, fullPage: true });
  const setup = await txt(host); check("role setup localized (roles + descriptions)", ok(setup), bad(setup));
  // Omer picks the machine gun (4th role button), host stays helicopter
  const roleBtns = a.locator(".wl-setup button");
  const rn = await roleBtns.count(); if (rn >= 4) await roleBtns.nth(3).click().catch(() => {});
  await sleep(400);
  await host.locator("button", { hasText: /⚔️/ }).first().click({ timeout: 10000 });
  await sleep(2500);
  await host.screenshot({ path: `${OUT}/02-battle.png` });
  const hud = await txt(host); check("battle HUD + hint localized", ok(hud), bad(hud));
  const cv1 = host.locator("canvas.wl-canvas"); const cv2 = a.locator("canvas.wl-canvas");
  const b1 = await cv1.boundingBox(); const b2 = await cv2.boundingBox();
  let sawDraft = false, sawBanner = false;
  for (let i = 0; i < 14; i++) {
    const x0 = b1.x + 60 + Math.random() * (b1.width - 120);
    const y0 = b1.y + b1.height * 0.55 + Math.random() * b1.height * 0.3;
    await host.mouse.move(x0, y0); await host.mouse.down();
    const mgx = b2.x + 40 + Math.random() * (b2.width - 80);
    await a.mouse.move(mgx, b2.y + b2.height * 0.45); await a.mouse.down();
    await host.mouse.move(x0 + (Math.random() - 0.5) * 170, y0 - Math.random() * 150, { steps: 8 });
    await a.mouse.move(b2.x + b2.width - (mgx - b2.x), b2.y + b2.height * 0.4, { steps: 10 });
    await sleep(1500);
    await host.mouse.up(); await a.mouse.up();
    for (const p of [host, a]) {
      const card = p.locator(".wl-card").first();
      if (await card.count()) {
        if (!sawDraft) { sawDraft = true; await p.screenshot({ path: `${OUT}/03-draft.png` }); const d = await txt(p); check("draft localized (card names/desc)", ok(d), bad(d)); }
        await card.click({ timeout: 1500 }).catch(() => {});
      }
    }
    const t = await txt(host); if (!sawBanner && /🌊/.test(t)) { sawBanner = true; check("wave banner localized", ok(t), bad(t)); }
    await sleep(300);
  }
  check("draft appeared", sawDraft);
  const mid = await txt(host); check("mid-battle texts localized (toasts/banners)", ok(mid), bad(mid));
  // idle — let the wall fall
  let over = false;
  for (let i = 0; i < 300; i++) { await sleep(1000); if (await host.locator(".wl-overlay").count()) { over = true; break; } }
  check("wall fell (run over screen)", over);
  await sleep(1500);
  await host.screenshot({ path: `${OUT}/04-over.png`, fullPage: true });
  const ov = await txt(host); check("run over screen localized", ok(ov), bad(ov));
  console.log("--- over text ---\n" + ov.split("\n").filter(Boolean).slice(0, 14).join(" | "));
  await host.locator("button", { hasText: /🏁/ }).first().click({ timeout: 5000 }).catch(() => {});
  let cer = "";
  for (let i = 0; i < 24; i++) { await sleep(500); cer = await txt(host); if (/🌙|🏅/.test(cer)) break; }
  await host.screenshot({ path: `${OUT}/05-ceremony.png`, fullPage: true });
  check("ceremony reached", /🌙|🏅/.test(cer));
  check("ceremony localized: title (wall.end.title) + award", !HEB.test(cer) && !/awards\.|wall\.end/.test(cer), bad(cer));
  console.log("--- ceremony text (host) ---\n" + cer.split("\n").filter(Boolean).slice(0, 12).join(" | "));
  const d = await dbg(host); check("no renderer error", !d.err, d.err);
  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" ; "));
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nALL OK");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
