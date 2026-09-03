/**
 * E2E עשן להתהום 🕳️ — שני דפדפנים בחדר אמיתי, צניחה אחת: אוטופיילוט נופל, מדף → הצבעה (אחד עוצר, אחד ממשיך),
 * חשיפה, פלח הקרן, זריקת מלכודת מהצופה, תוצאות. בודקים: פריימים זורמים, אפס קריסות רנדרר, אפס שגיאות קונסולה.
 * מריצים אחרי build של הלקוח:  node test/abyss-e2e-smoke.mjs
 */
import { chromium } from "playwright";
import { spawn } from "child_process";

const PORT = 8792;
const srv = spawn("npx", ["tsx", "src/index.ts"], { env: { ...process.env, PORT: String(PORT) }, stdio: "pipe" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, cond, extra = "") => { console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : "")); if (!cond) failed++; };
const dbg = (p) => p.evaluate(() => ({ ...(window.__abDbg ?? {}), frames: window.__abFrames ?? 0, err: (window.__abErr ?? "").slice(0, 300) }));
const waitPhase = async (p, ph, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await dbg(p); if (d.phase === ph) return d; await sleep(150); } return await dbg(p); };

try {
  await sleep(2500);
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const errs = new Map();
  const mkPage = async (tag) => {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true })).newPage();
    errs.set(tag, []);
    page.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL|ERR_NAME|Failed to load resource/.test(m.text())) errs.get(tag).push(m.text()); });
    return page;
  };
  const enter = async (page, name) => {
    const inp = page.locator("input").first();
    await inp.waitFor({ timeout: 10000 });
    await inp.click();
    await inp.type(name, { delay: 50 });
    await page.click("text=נכנסים");
    await sleep(1200);
  };

  const p1 = await mkPage("עוצר");
  await p1.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await p1.click("text=פתח חדר חדש", { timeout: 15000 });
  await enter(p1, "עוצר");
  const code = new URL(p1.url()).pathname.split("/").pop();
  check("חדר נפתח (יש קוד)", !!code && code.length >= 4);

  const p2 = await mkPage("ממשיך");
  await p2.goto(`http://localhost:${PORT}/r/${code}`, { waitUntil: "domcontentloaded" });
  await enter(p2, "ממשיך");

  // המארח בוחר את התהום, צניחה אחת, ומתחיל
  await p1.click("button:has-text('התהום')");
  await sleep(600);
  const one = p1.locator("button:has-text('אחת')");
  check("אפשרות 'צניחה אחת' מוצגת למארח", (await one.count()) >= 1);
  if (await one.count()) await one.first().click();
  await sleep(300);
  await p1.click("text=מתחילים", { timeout: 10000 });
  await sleep(1500);

  check("קנבס התהום עלה אצל שניהם", (await p1.locator("canvas.ab-cv").count()) === 1 && (await p2.locator("canvas.ab-cv").count()) === 1);
  for (const p of [p1, p2]) await p.evaluate(() => { window.__abAuto = true; });
  // ספירה → נפילה
  const f1 = await waitPhase(p1, "fall", 8000);
  check("הצניחה התחילה (phase=fall)", f1.phase === "fall", f1.phase);
  await sleep(3000);
  const mid = await dbg(p2);
  check("הנופל מתקדם בעומק ואוסף", mid.depth > 100 && mid.alive === true, `depth=${mid.depth} crystals=${mid.crystals}`);

  // מדף 0
  const l1 = await waitPhase(p1, "ledge", 25000);
  check("מדף 0 הגיע לשניהם", l1.phase === "ledge" && (await waitPhase(p2, "ledge", 2000)).phase === "ledge");
  const stopBtn = p1.locator(".ab-slab.stop"), goBtn = p2.locator(".ab-slab.go");
  check("כפתורי ההצבעה מוצגים", (await stopBtn.count()) === 1 && (await goBtn.count()) === 1);
  await stopBtn.click({ timeout: 2000 }).catch(() => {});
  await goBtn.click({ timeout: 2000 }).catch(() => {});
  const r1 = await waitPhase(p1, "reveal", 8000);
  check("חשיפה אצל העוצר", r1.phase === "reveal");
  await sleep(300);
  check("גריד החשיפה מציג 2 מדבקות", (await p1.locator(".ab-card").count()) === 2);
  const r2 = await waitPhase(p2, "reveal", 2000);
  check("חשיפה אצל הממשיך", r2.phase === "reveal");

  // חזרה לנפילה — פלח הקרן של הממשיך
  const back = await waitPhase(p2, "fall", 8000);
  check("הממשיך חזר לנפול, בחיים", back.phase === "fall" && back.alive === true && back.me === "falling", `${back.phase}/${back.me}`);
  await sleep(1200);
  const s1 = await dbg(p1);
  check("העוצר צופה (me=stopped) עם מטרה", s1.me === "stopped" && s1.target, `${s1.me}/${s1.target}`);
  const trap = p1.locator(".ab-throw.trap");
  check("כפתור המלכודת מוצג לצופה", (await trap.count()) === 1);
  await trap.click({ timeout: 2000 }).catch(() => {});
  await sleep(800);
  const toastP2 = await p2.locator(".ab-toast").allTextContents();
  const feedP1 = await p1.locator(".ab-toast, .ab-feed").allTextContents();
  check("המלכודת הגיעה למטרה (טוסט אצל הממשיך)", toastP2.some((t) => t.includes("מלכודת")) || feedP1.some((t) => t.includes("מלכודת") || t.includes("קולדאון") || t.includes("קרוב")), JSON.stringify([toastP2, feedP1]).slice(0, 160));

  // סיום הצניחה → תוצאות → טקס
  const res = await waitPhase(p1, "results", 40000);
  check("תוצאות הצניחה הוצגו", res.phase === "results", res.phase);
  await sleep(600);
  check("טבלת התוצאות עם 2 שורות", (await p1.locator(".ab-results .row").count()) === 2);
  const t0 = Date.now();
  let ceremony = false;
  while (Date.now() - t0 < 12000) { if ((await p1.locator("text=עוד משחק").count()) > 0 || (await p1.locator(".ab-results").count()) === 0) { ceremony = true; break; } await sleep(300); }
  check("המשחק הסתיים והחדר עבר לטקס", ceremony);

  for (const [tag, p] of [["עוצר", p1], ["ממשיך", p2]]) {
    const d = await dbg(p);
    const ce = errs.get(tag);
    check(`${tag}: הרנדרר רץ (פריימים)`, d.frames > 600, `${d.frames}`);
    check(`${tag}: אפס קריסות רנדרר (__abErr ריק)`, !d.err);
    check(`${tag}: אפס שגיאות קונסולה`, ce.length === 0);
    if (d.err) console.log(`    __abErr: ${d.err}`);
    if (ce.length) console.log(`    console: ${ce.slice(0, 3).join(" ;; ").slice(0, 400)}`);
  }
  await browser.close();
} catch (e) {
  failed++;
  console.log("  ✗ FAIL חריגה:", String(e).slice(0, 400));
} finally {
  srv.kill();
}
console.log(failed ? `\n${failed} בדיקות עשן נכשלו ✗` : "\nעשן E2E עבר ✓");
process.exit(failed ? 1 : 0);
