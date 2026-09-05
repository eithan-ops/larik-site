/**
 * הקומות 🏢 — פלייטסט E2E עם 4 דפדפני מובייל ובוטים + צילומי מסך.
 * FL_FAST=1 node test/floors-shots.mjs  →  /tmp/fl-*.png
 * (דורש build של הלקוח: cd client && npm run build)
 */
import { chromium } from "playwright";
import { spawn } from "child_process";

const PORT = 8794;
const srv = spawn("npx", ["tsx", "src/index.ts"], { env: { ...process.env, PORT: String(PORT), FL_FAST: "1" }, stdio: "pipe" });
srv.stderr.on("data", (d) => { const s = String(d); if (/error|Error/.test(s)) console.log("SRV:", s.slice(0, 300)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbg = (p) => p.evaluate(() => { const g = window.__flDbg?.g; return g ? { phase: g.phase, floor: g.sim.floor, max: g.sim.maxFloor, combo: g.sim.combo, bonus: g.sim.comboBonus, dead: g.dead, out: g.out, lives: g.lives, cards: g.cards, others: g.others.size, kill: g.kill, err: window.__flErr, frames: window.__flFrames } : { phase: "none" }; });
const waitPhase = async (p, ph, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await dbg(p); if (d.phase === ph) return d; await sleep(120); } return await dbg(p); };
const errors = [];
try {
  await sleep(2500);
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const mk = async () => { const pg = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true })).newPage(); pg.on("pageerror", (e) => errors.push(String(e))); pg.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }); return pg; };
  const enter = async (page, name) => { const inp = page.locator("input").first(); await inp.waitFor({ timeout: 10000 }); await inp.click(); await inp.type(name, { delay: 30 }); await page.click("text=נכנסים"); await sleep(900); };
  const p1 = await mk(); await p1.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await p1.click("text=פתח חדר חדש", { timeout: 15000 }); await enter(p1, "דניאל");
  const code = new URL(p1.url()).pathname.split("/").pop();
  const pages = [p1];
  for (const n of ["נועם", "תמר", "יובל"]) { const p = await mk(); await p.goto(`http://localhost:${PORT}/r/${code}`, { waitUntil: "domcontentloaded" }); await enter(p, n); pages.push(p); }
  await p1.click("button:has-text('הקומות')"); await sleep(600);
  await p1.screenshot({ path: "/tmp/fl-0-catalog.png" });
  await p1.click("text=מתחילים", { timeout: 10000 });
  await waitPhase(p1, "pick", 8000);
  await sleep(500);
  await p1.screenshot({ path: "/tmp/fl-1-pick.png" });
  // בחירת דמויות: 1 בוחר צפרדע, 2 מנסה צפרדע (תפוס) ואז דינוזאור; השאר אוטומטי
  await p1.locator(".fl-pick .tile").nth(2).click(); await sleep(300);
  await pages[1].locator(".fl-pick .tile").nth(5).click(); await sleep(400);
  await pages[1].screenshot({ path: "/tmp/fl-2-pick-taken.png" });
  for (const p of pages) await p.evaluate(() => { window.__flAuto = true; });
  await waitPhase(p1, "intro", 8000);
  await sleep(1200);
  await p1.screenshot({ path: "/tmp/fl-3-intro.png" });
  await waitPhase(p1, "run", 6000);
  await sleep(4000);
  await p1.screenshot({ path: "/tmp/fl-4-run.png" });
  console.log("run:", JSON.stringify(await dbg(p1)));
  await sleep(4000);
  await pages[1].screenshot({ path: "/tmp/fl-5-run-late.png" });
  await waitPhase(p1, "freeze", 12000);
  await sleep(600);
  await p1.screenshot({ path: "/tmp/fl-6-freeze.png" });
  await waitPhase(p1, "draft", 5000);
  await sleep(500);
  await p1.screenshot({ path: "/tmp/fl-7-draft.png" });
  // p1 בוחר את הקלף השני (טאפ+טאפ), p2 את הראשון
  const c1 = p1.locator(".fl-draft .card").nth(1); await c1.click(); await sleep(250); await p1.screenshot({ path: "/tmp/fl-7b-draft-sel.png" }); await c1.click();
  await pages[1].locator(".fl-draft .card").nth(0).click(); await pages[1].locator(".fl-draft .card").nth(0).click();
  await sleep(300);
  await p1.screenshot({ path: "/tmp/fl-8-draft-locked.png" });
  await waitPhase(p1, "reveal", 8000);
  await sleep(700);
  await p1.screenshot({ path: "/tmp/fl-9-reveal.png" });
  await waitPhase(p1, "run", 5000);
  await sleep(1500);
  await p1.screenshot({ path: "/tmp/fl-10-run2.png" });
  console.log("run2:", JSON.stringify(await dbg(p1)));
  await sleep(9000);
  console.log("late2:", JSON.stringify(await dbg(pages[2])));
  await pages[2].screenshot({ path: "/tmp/fl-11-run2-late.png" });
  await waitPhase(p1, "over", 40000);
  await sleep(800);
  await p1.screenshot({ path: "/tmp/fl-12-over.png" });
  for (const [i, p] of pages.entries()) console.log("final", i, JSON.stringify(await dbg(p)));
  await sleep(5000);
  await p1.screenshot({ path: "/tmp/fl-13-ceremony.png" });
  await browser.close();
  console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
  console.log("done");
} catch (e) { console.log("ERR", String(e).slice(0, 600)); } finally { srv.kill(); }
process.exit(0);
