/** צילומי דראפט וצניחה שנייה: 3 צניחות, כולם עוצרים במדף 0 (צניחות קצרות). node test/abyss-shots-draft.mjs → /tmp/ab-d-*.png */
import { chromium } from "playwright";
import { spawn } from "child_process";
const PORT = 8794;
const srv = spawn("npx", ["tsx", "src/index.ts"], { env: { ...process.env, PORT: String(PORT) }, stdio: "pipe" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbg = (p) => p.evaluate(() => ({ ...(window.__abDbg ?? {}), err: window.__abErr ?? "" }));
const waitPhase = async (p, ph, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await dbg(p); if (d.phase === ph) return d; await sleep(120); } return await dbg(p); };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
try {
  await sleep(2500);
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const mk = async () => (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true })).newPage();
  const enter = async (page, name) => { const inp = page.locator("input").first(); await inp.waitFor({ timeout: 10000 }); await inp.click(); await inp.type(name, { delay: 30 }); await page.click("text=נכנסים"); await sleep(1000); };
  const p1 = await mk(); await p1.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await p1.click("text=פתח חדר חדש", { timeout: 15000 }); await enter(p1, "דניאל");
  const code = new URL(p1.url()).pathname.split("/").pop();
  const p2 = await mk(); await p2.goto(`http://localhost:${PORT}/r/${code}`, { waitUntil: "domcontentloaded" }); await enter(p2, "נועם");
  await p1.click("button:has-text('התהום')"); await sleep(400);
  await p1.click("text=מתחילים", { timeout: 10000 });
  for (const p of [p1, p2]) await p.evaluate(() => { window.__abAuto = true; });
  for (let d = 0; d < 3; d++) {
    await waitPhase(p1, "fall", 12000); log("descent", d, "fall");
    await waitPhase(p1, "ledge", 30000); await sleep(400);
    await p1.locator(".ab-slab.stop").click().catch(() => {});
    await p2.locator(".ab-slab.stop").click().catch(() => {});
    await waitPhase(p1, "reveal", 8000); await sleep(1200);
    await p1.screenshot({ path: `/tmp/ab-d-${d}-reveal.png` });
    const r = await waitPhase(p1, "results", 12000); log("results", r.phase);
    await sleep(500);
    await p1.screenshot({ path: `/tmp/ab-d-${d}-results.png` });
    if (d < 2) {
      const dr = await waitPhase(p1, "draft", 8000); log("draft", dr.phase);
      await sleep(700);
      await p1.screenshot({ path: `/tmp/ab-d-${d}-draft.png` });
      await p1.locator(".ab-pick").first().click().catch(() => {});
      await sleep(400);
      await p1.screenshot({ path: `/tmp/ab-d-${d}-draft-picked.png` });
      // p2 לא בוחר — בחירה אוטומטית אחרי 12 שנ'
    }
  }
  await sleep(6000);
  await p1.screenshot({ path: `/tmp/ab-d-end.png` });
  const e1 = await dbg(p1), e2 = await dbg(p2);
  log("errs:", e1.err || "-", e2.err || "-");
  await browser.close();
  console.log("done");
} catch (e) { console.log("ERR", String(e).slice(0, 400)); } finally { srv.kill(); }
process.exit(0);
