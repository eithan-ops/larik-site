/**
 * מטרונובול 🎾 — פלייטסט E2E עם 4 דפדפני מובייל ובוטים מקישים + צילומי מסך.
 * MB_FAST=1 node test/metro-shots.mjs  →  /tmp/mb-*.png
 * (דורש build של הלקוח: cd client && npm run build)
 */
import { chromium } from "playwright";
import { spawn } from "child_process";

const PORT = 8796;
const srv = spawn("npx", ["tsx", "src/index.ts"], { env: { ...process.env, PORT: String(PORT), MB_FAST: process.env.MB_FAST || "1" }, stdio: "pipe" });
srv.stderr.on("data", (d) => { const s = String(d); if (/error|Error/.test(s)) console.log("SRV:", s.slice(0, 300)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbg = (p) => p.evaluate(() => ({ ...(window.__mbDbg ?? { phase: "none" }), err: window.__mbErr, frames: window.__mbFrames }));
const waitPhase = async (p, ph, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await dbg(p); if (d.phase === ph) return d; await sleep(120); } return await dbg(p); };
const errors = [];
const shot = (p, n) => p.screenshot({ path: `/tmp/mb-${n}.png` });
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
  await p1.click("button:has-text('מטרונובול')"); await sleep(600);
  if (process.env.MB_OPTS) { try { await p1.click("text=דלוק 🎵", { timeout: 2000 }); await p1.click("text=דלוק 🪂", { timeout: 2000 }); await sleep(300); } catch (e) { console.log("opts click failed", String(e).slice(0, 80)); } }
  await shot(p1, "0-catalog");
  await p1.click("text=מתחילים", { timeout: 10000 });
  for (const p of pages) await p.evaluate(() => { window.__mbAuto = true; });
  await waitPhase(p1, "pick", 8000);
  await sleep(500);
  await shot(p1, "1-pick");
  try { await p1.locator(".mb-pick .tile").nth(0).click({ timeout: 2000 }); await sleep(250); await pages[1].locator(".mb-pick .tile").nth(3).click({ timeout: 2000 }); await sleep(300); } catch { console.log("pick skipped"); }
  await shot(pages[1], "2-pick-taken");
  await waitPhase(p1, "set", 9000);
  await sleep(300);
  // מי הקובע?
  let leaderIdx = -1;
  for (const [i, p] of pages.entries()) { if (await p.locator(".mb-leadpanel").count()) leaderIdx = i; }
  console.log("leader:", leaderIdx);
  const lead = pages[leaderIdx] ?? p1; const fol = pages.find((_, i) => i !== leaderIdx) ?? pages[1];
  // הקובע מכוון: +5, -1, רצפת מים
  try {
    await lead.locator(".mb-lv").nth(3).dispatchEvent("pointerdown", {}, { timeout: 1500 }); await sleep(120);
    await lead.locator(".mb-lv").nth(1).dispatchEvent("pointerdown", {}, { timeout: 1500 }); await sleep(120);
    await lead.locator(".mb-fl").nth(process.env.MB_OPTS ? 3 : 4).dispatchEvent("pointerdown", {}, { timeout: 1500 }); await sleep(120);
    if (process.env.MB_OPTS) { await lead.locator(".mb-pat").nth(1).dispatchEvent("pointerdown", {}, { timeout: 1500 }); await sleep(300); }
  } catch (e) { console.log("adjust skipped", String(e).slice(0, 80)); }
  await shot(lead, "3-set-leader");
  await shot(fol, "4-set-follower");
  console.log("lead dbg:", JSON.stringify((await dbg(fol)).lead));
  await waitPhase(fol, "count", 8000);
  await sleep(400);
  await shot(fol, "6-count");
  await waitPhase(fol, "match", 6000);
  await sleep(1500);
  await shot(fol, "7-match");
  await shot(lead, "8-match-leader");
  await sleep(2500);
  await shot(fol, "9-match-locked");
  console.log("fol dbg:", JSON.stringify(await dbg(fol)));
  await waitPhase(fol, "result", 12000);
  await sleep(600);
  await shot(fol, "10-result");
  // סבב 2: מישהו אחר קובע; p1 ידני — מקיש דרך __mbTap
  await waitPhase(fol, "set", 8000);
  await sleep(600);
  await shot(fol, "11-set2");
  await waitPhase(fol, "match", 12000);
  // כדור ישן אצל מי שלא מקיש
  await pages[2].evaluate(() => { window.__mbAuto = false; });
  await sleep(2200);
  await shot(pages[2], "12-match-sleep");
  await pages[2].evaluate(() => { window.__mbTap?.(); }); await sleep(120); await pages[2].evaluate(() => { window.__mbTap?.(); });
  await sleep(200);
  await shot(pages[2], "13-match-tapped");
  await pages[2].evaluate(() => { window.__mbAuto = true; });
  let last = "";
  for (let i = 0; i < 120; i++) {
    const d = await dbg(p1);
    if (d.phase !== last) { console.log("phase:", d.phase, "locked=", JSON.stringify(d.locked)); last = d.phase; }
    if (d.phase === "over") break;
    await sleep(600);
  }
  await waitPhase(p1, "over", 60000);
  await sleep(700);
  await shot(p1, "14-over");
  for (const [i, p] of pages.entries()) console.log("final", i, JSON.stringify(await dbg(p)));
  await sleep(3000);
  await shot(p1, "15-ceremony");
  await browser.close();
  console.log("errors:", errors.length ? errors.slice(0, 6) : "none");
  console.log("done");
} catch (e) { console.log("ERR", String(e).slice(0, 800)); } finally { srv.kill(); }
process.exit(0);
