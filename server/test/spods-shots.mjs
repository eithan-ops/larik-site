/**
 * ספורט פודים 🏃 — פלייטסט E2E: מאמן + 3 פודים בדפדפני מובייל, בוטים נוגעים, צילומי מסך.
 * SP_FAST=1 SP_GAME=colors node test/spods-shots.mjs  →  /tmp/sp-<game>-*.png
 * (דורש build של הלקוח: cd client && npm run build)
 */
import { chromium } from "playwright";
import { spawn } from "child_process";

const GAME = process.env.SP_GAME || "colors";
const PORT = Number(process.env.PORT || 8797);
const NAMES = { colors: "מרוץ הצבעים", duel: "דו-קרב", star: "כוכב הזריזות", beep: "מבחן הביפ", steal: "גניבת הסבב", survive: "הישרדות", relay: "מרוץ שליחים", stations: "תחנות אש", statue: "הפסל", pacer: "בדיוק בזמן" };
const srv = spawn("npx", ["tsx", "src/index.ts"], { env: { ...process.env, PORT: String(PORT), SP_FAST: process.env.SP_FAST || "1" }, stdio: "pipe" });
srv.stderr.on("data", (d) => { const s = String(d); if (/error|Error/.test(s)) console.log("SRV:", s.slice(0, 300)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbg = (p) => p.evaluate(() => window.__spDbg ?? { phase: "none" });
const waitPhase = async (p, ph, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await dbg(p); if (d.phase === ph) return d; await sleep(120); } return await dbg(p); };
const errors = [];
const shot = (p, n) => p.screenshot({ path: `/tmp/sp-${GAME}-${n}.png` });
let ok = true;
try {
  await sleep(2500);
  const browser = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const mk = async () => { const pg = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true })).newPage(); pg.on("pageerror", (e) => errors.push(String(e))); pg.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }); return pg; };
  const enter = async (page, name) => { const inp = page.locator("input").first(); await inp.waitFor({ timeout: 10000 }); await inp.click(); await inp.type(name, { delay: 30 }); await page.click("text=נכנסים"); await sleep(900); };
  const coach = await mk(); await coach.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await coach.click("text=פתח חדר חדש", { timeout: 15000 }); await enter(coach, "אבא");
  const code = new URL(coach.url()).pathname.split("/").pop();
  const pods = [];
  for (const n of ["נועם", "תמר", "יובל"]) { const p = await mk(); await p.goto(`http://localhost:${PORT}/r/${code}`, { waitUntil: "domcontentloaded" }); await enter(p, n); pods.push(p); }
  // בקטלוג: הקטגוריה "ספורט פודים" → המשחק
  await coach.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await coach.click(`.gcard:has-text("${NAMES[GAME]}")`, { timeout: 8000 }); await sleep(600);
  await shot(coach, "0-catalog");
  await shot(pods[0], "0-explainer");
  await coach.click("text=מתחילים", { timeout: 10000 });
  for (const p of pods) await p.evaluate(() => { window.__spAuto = true; });
  await waitPhase(coach, "setup", 8000);
  await sleep(500);
  await shot(coach, "1-setup");
  await shot(pods[0], "1-pod-idle");
  // הבהוב פוד + הנדיקפ + הגדרה
  try { await coach.locator("button:has-text('הבהב')").first().click({ timeout: 2000 }); await sleep(250); await shot(pods[0], "2-pod-flash"); } catch (e) { console.log("flash skipped", String(e).slice(0, 60)); }
  try { await coach.locator(".opt").nth(1).click({ timeout: 1500 }); } catch { /* */ }
  await coach.click("text=התחל", { timeout: 5000 });
  const run = await waitPhase(coach, "run", 12000);
  console.log("run:", JSON.stringify(run).slice(0, 200));
  if (run.phase !== "run") { ok = false; console.log("✗ לא הגיע ל-run"); }
  await shot(coach, "3-count-or-run");
  // מחכים שפוד כלשהו יידלק ומצלמים אותו
  let litShot = false;
  for (let i = 0; i < 80 && !litShot; i++) {
    for (const p of pods) { const d = await dbg(p); if (d.lit) { await shot(p, "4-pod-lit"); litShot = true; break; } }
    await sleep(100);
  }
  console.log("lit shot:", litShot);
  if (!litShot) ok = false;
  await sleep(1500);
  await shot(coach, "5-coach-live");
  // הפסקה והמשך
  try { await coach.click("text=הפסקה", { timeout: 1500 }); await sleep(400); await shot(coach, "6-pause"); await coach.click("text=המשך", { timeout: 1500 }); } catch (e) { console.log("pause skipped", String(e).slice(0, 60)); }
  const over = await waitPhase(coach, "over", 90000);
  console.log("over:", JSON.stringify(over).slice(0, 300));
  if (over.phase !== "over") { ok = false; console.log("✗ לא הגיע ל-over"); }
  await shot(coach, "7-over");
  await shot(pods[1], "7-pod-over");
  await sleep(3500);
  const cer = await coach.locator("text=/ניצח|טקס|לוח הערב|כוכב/").count();
  await shot(coach, "8-ceremony");
  console.log("ceremony elements:", cer);
  await browser.close();
} catch (e) { ok = false; console.log("E2E error:", e); }
srv.kill();
const real = errors.filter((e) => !/favicon|manifest|Failed to load resource/.test(e));
console.log("console errors:", real.length ? real.slice(0, 5) : "none");
console.log(ok && !real.length ? `✓ E2E ${GAME} עבר` : `✗ E2E ${GAME} נכשל`);
process.exit(ok && !real.length ? 0 : 1);
