/**
 * התותחים 💥 — פלייטסט E2E עם 4 דפדפני מובייל ובוטים + צילומי מסך.
 * TK_FAST=1 node test/tanks-shots.mjs  →  /tmp/tk-*.png
 * (דורש build של הלקוח: cd client && npm run build)
 */
import { chromium } from "playwright";
import { spawn } from "child_process";

const PORT = 8795;
const srv = spawn("npx", ["tsx", "src/index.ts"], { env: { ...process.env, PORT: String(PORT), TK_FAST: process.env.TK_FAST || "1" }, stdio: "pipe" });
srv.stderr.on("data", (d) => { const s = String(d); if (/error|Error/.test(s)) console.log("SRV:", s.slice(0, 300)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbg = (p) => p.evaluate(() => ({ ...(window.__tkDbg ?? { phase: "none" }), err: window.__tkErr, frames: window.__tkFrames }));
const waitPhase = async (p, ph, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await dbg(p); if (d.phase === ph) return d; await sleep(120); } return await dbg(p); };
const errors = [];
const shot = (p, n) => p.screenshot({ path: `/tmp/tk-${n}.png` });
try {
  await sleep(2500);
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const mk = async () => { const pg = await (await browser.newContext({ viewport: { width: +(process.env.VW || 390), height: +(process.env.VH || 844) }, deviceScaleFactor: 2, hasTouch: true })).newPage(); pg.on("pageerror", (e) => errors.push(String(e))); pg.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }); return pg; };
  const enter = async (page, name) => { const inp = page.locator("input").first(); await inp.waitFor({ timeout: 10000 }); await inp.click(); await inp.type(name, { delay: 30 }); await page.click("text=נכנסים"); await sleep(900); };
  const p1 = await mk(); await p1.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await p1.click("text=פתח חדר חדש", { timeout: 15000 }); await enter(p1, "דניאל");
  const code = new URL(p1.url()).pathname.split("/").pop();
  const pages = [p1];
  for (const n of ["נועם", "תמר", "יובל"]) { const p = await mk(); await p.goto(`http://localhost:${PORT}/r/${code}`, { waitUntil: "domcontentloaded" }); await enter(p, n); pages.push(p); }
  await p1.click("button:has-text('התותחים')"); await sleep(600);
  await shot(p1, "0-catalog");
  await p1.click("text=מתחילים", { timeout: 10000 });
  await waitPhase(p1, "pick", 8000);
  await sleep(500);
  await shot(p1, "1-pick");
  try { await p1.locator(".tk-pick .tile").nth(0).click({ timeout: 2000 }); await sleep(250); await pages[1].locator(".tk-pick .tile").nth(3).click({ timeout: 2000 }); await sleep(300); } catch { console.log("pick skipped"); }
  await shot(pages[1], "2-pick-taken");
  // p1 ידני בסיבוב הראשון (רוגטקה), השאר בוטים
  for (const p of pages.slice(1)) await p.evaluate(() => { window.__tkAuto = true; });
  await waitPhase(p1, "intro", 8000);
  await sleep(600);
  await shot(p1, "3-intro");
  await waitPhase(p1, "aim", 8000);
  await sleep(300);
  await shot(p1, "4-aim");
  // רוגטקה: גרירה אחורה
  const vp = p1.viewportSize();
  await p1.mouse.move(vp.width * 0.5, vp.height * 0.45); await p1.mouse.down();
  for (let i = 1; i <= 8; i++) { await p1.mouse.move(vp.width * 0.5 - i * 12, vp.height * 0.45 + i * 9); await sleep(30); }
  await sleep(200);
  await shot(p1, "5-aim-drag");
  await p1.mouse.up(); await sleep(200);
  await shot(p1, "6-aim-set");
  console.log("aim:", JSON.stringify((await dbg(p1)).aim));
  await p1.click(".tk-ready", { force: true }); await sleep(200);
  await shot(p1, "7-aim-ready");
  await waitPhase(p1, "salvo", 6000);
  await sleep(700);
  await shot(p1, "8-salvo");
  await sleep(900);
  await shot(pages[1], "9-salvo-mid");
  console.log("salvo:", JSON.stringify(await dbg(p1)));
  await waitPhase(p1, "garage", 15000);
  await sleep(400);
  await shot(p1, "10-garage");
  console.log("garage:", JSON.stringify(await dbg(p1)));
  // p1 קונה את הקלף הראשון שאפשר
  const cards = p1.locator(".tk-garage .card:not(.poor)"); if (await cards.count()) { await cards.nth(0).click(); await sleep(300); }
  await shot(p1, "11-garage-bought");
  await p1.click(".tk-garage .tk-ready", { force: true }); await sleep(200);
  await p1.evaluate(() => { window.__tkAuto = true; });
  await waitPhase(p1, "aim", 8000);
  await sleep(500);
  await shot(p1, "12-aim2");
  // מחכים לסוף: המשחק רץ עם בוטים
  let last = ""; let skyDone = false;
  for (let i = 0; i < 90; i++) {
    const d = await dbg(p1);
    if (d.phase !== last) { console.log("phase:", d.phase, "k=", d.k, "b=", d.b, "hp=", d.hp, "alive=", d.alive, "gold=", d.gold); last = d.phase; if (d.phase === "salvo") { await sleep(800); await shot(p1, `s-salvo-b${d.b}-k${d.k}`); } if (d.phase === "battleover") { await sleep(500); await shot(p1, `s-battleover-${d.b}`); } }
    if (d.phase === "over") break;
    if (d.phase === "aim" && !d.alive && !skyDone) { skyDone = true; await p1.evaluate(() => { window.__tkAuto = false; }); await sleep(400); await shot(p1, `s-sky-k${d.k}`); const sc = p1.locator(".tk-sky .card"); if (await sc.count()) { await sc.nth(0).click({ force: true }); await sleep(300); await shot(p1, `s-sky-picked`); if (await p1.locator(".tk-sky.needx").count()) { await p1.mouse.click(vp.width * 0.5, vp.height * 0.6); await sleep(300); } const tb = p1.locator(".tk-sky .targets button"); if (await tb.count()) { await tb.nth(0).click({ force: true }); await sleep(300); } await shot(p1, `s-sky-sent`); } await p1.evaluate(() => { window.__tkAuto = true; }); }
    await sleep(700);
  }
  await waitPhase(p1, "over", 60000);
  await sleep(800);
  await shot(p1, "13-over");
  for (const [i, p] of pages.entries()) console.log("final", i, JSON.stringify(await dbg(p)));
  await sleep(4000);
  await shot(p1, "14-ceremony");
  await browser.close();
  console.log("errors:", errors.length ? errors.slice(0, 6) : "none");
  console.log("done");
} catch (e) { console.log("ERR", String(e).slice(0, 800)); } finally { srv.kill(); }
process.exit(0);
