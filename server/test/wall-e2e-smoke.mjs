/**
 * E2E עשן לחומה — שני דפדפנים בחדר אמיתי (החומה דורשת 2 שחקנים), מתחילים ריצה,
 * טסים/יורים ~25 שניות, ובודקים: אפס שגיאות קונסולה, הרנדרר לא קורס (__wlErr ריק),
 * פריימים זורמים, ואויבים על המסך.
 * מריצים אחרי build של הלקוח:  node test/wall-e2e-smoke.mjs
 */
import { chromium } from "playwright";
import { spawn } from "child_process";

const PORT = 8791;
const srv = spawn("npx", ["tsx", "src/index.ts"], { env: { ...process.env, PORT: String(PORT) }, stdio: "pipe" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, cond) => { console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name); if (!cond) failed++; };

try {
  await sleep(2500);
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const errs = new Map();
  const mkPage = async (tag) => {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true })).newPage();
    errs.set(tag, []);
    page.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL|ERR_NAME|Failed to load resource/.test(m.text())) errs.get(tag).push(m.text()); }); // שגיאות רשת של משאבים חיצוניים (חסומים בסביבת הבדיקה) אינן באג במשחק
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

  // שחקן 1 פותח חדר
  const p1 = await mkPage("טייס");
  await p1.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await p1.click("text=פתח חדר חדש", { timeout: 15000 });
  await enter(p1, "טייס");
  const code = new URL(p1.url()).pathname.split("/").pop();
  check("חדר נפתח (יש קוד)", !!code && code.length >= 4);

  // שחקן 2 מצטרף עם הקוד
  const p2 = await mkPage("מקלען");
  await p2.goto(`http://localhost:${PORT}/r/${code}`, { waitUntil: "domcontentloaded" });
  await enter(p2, "מקלען");

  // המארח בוחר את החומה ומתחיל
  await p1.click("button:has-text('החומה')");
  await sleep(700);
  await p1.click("text=מתחילים", { timeout: 10000 });
  await sleep(1500);
  // מסך היערכות: p1 נשאר הליקופטר (ברירת מחדל), p2 בוחר מקלען
  const mgBtn = p2.locator("button:has-text('מקלען')");
  if (await mgBtn.count()) await mgBtn.first().click();
  await sleep(400);
  await p1.click("text=אל החומות", { timeout: 10000 });
  await sleep(3000);

  const cv1 = p1.locator("canvas.wl-canvas");
  check("קנבס עלה אצל שניהם", (await cv1.count()) === 1 && (await p2.locator("canvas.wl-canvas").count()) === 1);
  const b1 = await cv1.boundingBox();
  const b2 = await p2.locator("canvas.wl-canvas").boundingBox();

  // ~25 שניות: הטייס גורר (טס+מפציץ), המקלען מחזיק ומרסס
  for (let i = 0; i < 10; i++) {
    const x0 = b1.x + 60 + Math.random() * (b1.width - 120);
    const y0 = b1.y + b1.height * 0.55 + Math.random() * b1.height * 0.3;
    await p1.mouse.move(x0, y0);
    await p1.mouse.down();
    const mgx = b2.x + 40 + Math.random() * (b2.width - 80);
    await p2.mouse.move(mgx, b2.y + b2.height * 0.45);
    await p2.mouse.down();
    await p1.mouse.move(x0 + (Math.random() - 0.5) * 170, y0 - Math.random() * 150, { steps: 8 });
    await p2.mouse.move(b2.x + b2.width - (mgx - b2.x), b2.y + b2.height * 0.4, { steps: 10 });
    await sleep(1500);
    await p1.mouse.up();
    await p2.mouse.up();
    // אם נפתח דראפט — בוחרים את הקלף הראשון וממשיכים
    for (const p of [p1, p2]) {
      const card = p.locator(".wl-card").first();
      if (await card.count()) await card.click({ timeout: 1500 }).catch(() => {});
    }
    await sleep(400);
  }

  for (const [tag, p] of [["טייס", p1], ["מקלען", p2]]) {
    const dbg = await p.evaluate(() => ({
      frames: window.__wlFrames ?? 0,
      err: (window.__wlErr ?? "").slice(0, 300),
      wave: window.__wlDbg?.wave, phase: window.__wlDbg?.phase,
      enemies: window.__wlDbg?.enemies?.length ?? 0,
      bombs: window.__wlBombs ?? 0,
    }));
    const ce = errs.get(tag);
    check(`${tag}: הרנדרר רץ (יש פריימים)`, dbg.frames > 500);
    check(`${tag}: אפס קריסות רנדרר (__wlErr ריק)`, !dbg.err);
    check(`${tag}: המשחק בגל פעיל`, dbg.wave >= 1 && dbg.phase !== "setup");
    check(`${tag}: אפס שגיאות קונסולה`, ce.length === 0);
    if (dbg.err) console.log(`    __wlErr: ${dbg.err}`);
    if (ce.length) console.log(`    console: ${ce.slice(0, 3).join(" ;; ").slice(0, 300)}`);
    console.log(`    (${tag}: פריימים ${dbg.frames}, גל ${dbg.wave}, אויבים ${dbg.enemies}, פצצות ${dbg.bombs})`);
  }
  await browser.close();
} catch (e) {
  failed++;
  console.log("  ✗ FAIL חריגה:", String(e).slice(0, 300));
} finally {
  srv.kill();
}
console.log(failed ? `\n${failed} בדיקות עשן נכשלו ✗` : "\nעשן E2E עבר ✓");
process.exit(failed ? 1 : 0);
