/**
 * צילומי מסך של התהום לבדיקה ויזואלית: נפילה · מדף/הצבעה · חשיפה · צופה · תוצאות.
 * node test/abyss-shots.mjs  →  /tmp/ab-*.png
 */
import { chromium } from "playwright";
import { spawn } from "child_process";

const PORT = 8793;
const srv = spawn("npx", ["tsx", "src/index.ts"], { env: { ...process.env, PORT: String(PORT) }, stdio: "pipe" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbg = (p) => p.evaluate(() => ({ ...(window.__abDbg ?? {}) }));
const waitPhase = async (p, ph, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await dbg(p); if (d.phase === ph) return d; await sleep(120); } return await dbg(p); };
try {
  await sleep(2500);
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const mk = async () => (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true })).newPage();
  const enter = async (page, name) => { const inp = page.locator("input").first(); await inp.waitFor({ timeout: 10000 }); await inp.click(); await inp.type(name, { delay: 30 }); await page.click("text=נכנסים"); await sleep(1000); };
  const p1 = await mk(); await p1.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await p1.click("text=פתח חדר חדש", { timeout: 15000 }); await enter(p1, "דניאל");
  const code = new URL(p1.url()).pathname.split("/").pop();
  const p2 = await mk(); await p2.goto(`http://localhost:${PORT}/r/${code}`, { waitUntil: "domcontentloaded" }); await enter(p2, "נועם");
  const p3 = await mk(); await p3.goto(`http://localhost:${PORT}/r/${code}`, { waitUntil: "domcontentloaded" }); await enter(p3, "תמר");
  await p1.click("button:has-text('התהום')"); await sleep(500);
  await p1.screenshot({ path: "/tmp/ab-0-catalog.png" });
  const one = p1.locator("button:has-text('אחת')"); if (await one.count()) await one.first().click();
  await p1.click("text=מתחילים", { timeout: 10000 });
  await sleep(1200);
  await p1.screenshot({ path: "/tmp/ab-1-intro.png" });
  for (const p of [p1, p2, p3]) await p.evaluate(() => { window.__abAuto = true; });
  await waitPhase(p1, "fall", 8000);
  await sleep(6000);
  await p1.screenshot({ path: "/tmp/ab-2-fall.png" });
  await sleep(6000);
  await p2.screenshot({ path: "/tmp/ab-3-fall-late.png" });
  await waitPhase(p1, "ledge", 20000);
  await sleep(700);
  await p1.screenshot({ path: "/tmp/ab-4-ledge.png" });
  await p1.locator(".ab-slab.stop").click().catch(() => {});
  await p2.locator(".ab-slab.go").click().catch(() => {});
  await p3.locator(".ab-slab.go").click().catch(() => {});
  await sleep(300);
  await p1.screenshot({ path: "/tmp/ab-5-voted.png" });
  await waitPhase(p1, "reveal", 8000);
  await sleep(1300);
  await p1.screenshot({ path: "/tmp/ab-6-reveal.png" });
  await waitPhase(p2, "fall", 8000);
  await sleep(2500);
  await p1.screenshot({ path: "/tmp/ab-7-spectator.png" });
  await p1.locator(".ab-throw.trap").click().catch(() => {});
  await sleep(900);
  await p2.screenshot({ path: "/tmp/ab-8-incoming.png" });
  await p1.screenshot({ path: "/tmp/ab-8b-spectator-after-throw.png" });
  await waitPhase(p1, "ledge", 25000);
  await sleep(600);
  await p1.screenshot({ path: "/tmp/ab-9-spec-ledge.png" });
  await p2.locator(".ab-slab.stop").click().catch(() => {});
  await p3.locator(".ab-slab.go").click().catch(() => {});
  await waitPhase(p1, "reveal", 8000);
  await sleep(1300);
  await p1.screenshot({ path: "/tmp/ab-10-reveal2.png" });
  await waitPhase(p1, "results", 45000);
  await sleep(800);
  await p1.screenshot({ path: "/tmp/ab-11-results.png" });
  const url = await p1.evaluate(() => window.__abCardUrl ?? "");
  if (url) { const { writeFileSync } = await import("fs"); writeFileSync("/tmp/ab-card.png", Buffer.from(url.split(",")[1], "base64")); }
  await sleep(6000);
  await p1.screenshot({ path: "/tmp/ab-12-ceremony.png" });
  await browser.close();
  console.log("done");
} catch (e) { console.log("ERR", String(e).slice(0, 400)); } finally { srv.kill(); }
process.exit(0);
