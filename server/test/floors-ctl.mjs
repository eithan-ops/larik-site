import { chromium } from "playwright";
import { spawn } from "child_process";
const PORT = 8795;
const srv = spawn("npx", ["tsx", "src/index.ts"], { env: { ...process.env, PORT: String(PORT), FL_FAST: "1" }, stdio: "pipe" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbg = (p) => p.evaluate(() => { const g = window.__flDbg?.g; return g ? { phase: g.phase, x: Math.round(g.sim.x), y: Math.round(g.sim.y), dx: +g.sim.dx.toFixed(2), st: g.sim.st, floor: g.sim.floor, dir: g.input.dir, jh: g.input.jumpHold, err: window.__flErr } : { phase: "none" }; });
const waitPhase = async (p, ph, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await dbg(p); if (d.phase === ph) return d; await sleep(120); } return await dbg(p); };
try {
  await sleep(2500);
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const pg = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true })).newPage();
  pg.on("pageerror", (e) => console.log("PAGEERR", String(e)));
  await pg.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await pg.click("text=פתח חדר חדש", { timeout: 15000 }); const inp = pg.locator("input").first(); await inp.click(); await inp.type("דני"); await pg.click("text=נכנסים"); await sleep(900);
  await pg.click("button:has-text('הקומות')"); await sleep(500); await pg.click("text=מתחילים", { timeout: 10000 });
  await waitPhase(pg, "pick", 8000); await pg.locator(".fl-pick .tile").nth(0).click();
  await waitPhase(pg, "run", 15000); await sleep(300);
  const ev = (type, id, x, y) => pg.evaluate(([type, id, x, y]) => { const el = document.querySelector(".fl-wrap"); el.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 1 })); }, [type, id, x, y]);
  // 1. אגודל שמאל: גרירה קטנה ימינה (20px = 36%) → הליכה
  await ev("pointerdown", 1, 100, 600); await ev("pointermove", 1, 120, 600); await sleep(700); const walk = await dbg(pg);
  // 2. גרירה מלאה (60px) → ריצה
  await ev("pointermove", 1, 160, 600); await sleep(700); const run = await dbg(pg);
  console.log("walk dx", walk.dx, "dir", walk.dir, "| run dx", run.dx, "dir", run.dir);
  // 3. הנפה למעלה = קפיצה
  await ev("pointermove", 1, 160, 590); await sleep(16); await ev("pointermove", 1, 160, 560); await sleep(120); const flick = await dbg(pg);
  console.log("flick st", flick.st, "(1/2 = באוויר)");
  await sleep(1200);
  // 4. אגודל ימין מוחזק = קפיצה אוטומטית שוב ושוב
  await ev("pointerdown", 2, 330, 700); const f0 = (await dbg(pg)).floor; let air = 0; for (let i = 0; i < 20; i++) { await sleep(100); if ((await dbg(pg)).st !== 0) air++; }
  const f1 = (await dbg(pg)).floor; await ev("pointerup", 2, 330, 700);
  console.log("hold-jump: air samples", air, "/20, floor", f0, "→", f1, "jumpHold after up:", (await dbg(pg)).jh);
  await ev("pointerup", 1, 160, 560); await sleep(100); console.log("after release dir", (await dbg(pg)).dir, "err", (await dbg(pg)).err);
  await pg.screenshot({ path: "/tmp/ctl.png" });
  await browser.close();
} catch (e) { console.log("ERR", e); }
srv.kill(); process.exit(0);
