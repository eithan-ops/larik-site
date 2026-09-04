/**
 * פלייטסט אמיתי של "המתחזה למתקדמים" 🥸 — 5 דפדפני מובייל, סיבוב שלם.
 * מריצים (אחרי npm run build בלקוח, והשרת על 8787):
 *   node tools/uc-play.mjs
 *
 * מה זה מוכיח שהבדיקות בשרת לא מוכיחות:
 *  · חמישה טלפונים אמיתיים עוברים את כל המסכים בלי שגיאת קונסולה.
 *  · מסך הקלף נראה *זהה* אצל המתחזה ואצל השאר (השוואת DOM) — הסוד לא דולף ללקוח.
 *  · הנכסים (uc-card / uc-caught / uc-safe / uc-genius / הפוסטר) באמת נטענים.
 *  · צילום מסך של כל שלב, כולל רגע החשיפה.
 */
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8787";
const OUT = "/tmp/uc-shots";
const N = 5;
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = "") => {
  console.log((ok ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : ""));
  if (!ok) failed++;
};

const errors = [];
async function newPhone(browser, name) {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const p = await ctx.newPage();
  // ERR_TUNNEL הוא הפרוקסי של סביבת הבדיקה, לא באג של המשחק
  const noise = /ERR_TUNNEL_CONNECTION_FAILED|net::ERR_BLOCKED/;
  p.on("console", (m) => { if (m.type() === "error" && !noise.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  return p;
}

const txt = (p) => p.evaluate(() => document.body.innerText);
const click = async (p, re) => {
  const b = p.locator("button", { hasText: re }).first();
  await b.waitFor({ state: "visible", timeout: 15000 });
  await b.click();
};

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const phones = [];
  for (let i = 0; i < N; i++) phones.push(await newPhone(browser, "P" + i));

  // --- המארח פותח חדר ונכנס בשמו ---
  const enter = async (p, name) => {
    const i = p.locator("input").first();
    await i.waitFor({ timeout: 15000 });
    await i.type(name, { delay: 40 });        // fill() לא מפעיל את הכפתור
    await click(p, /נכנסים/);
    await p.waitForTimeout(700);
  };
  const host = phones[0];
  await host.goto(BASE, { waitUntil: "networkidle" });
  await click(host, /פתח חדר/);
  await host.waitForTimeout(1200);
  await enter(host, "מארח");
  const code = (await txt(host)).match(/\b[A-Z]{4}\b/)?.[0];
  check("נפתח חדר", !!code, code);

  // --- כולם מצטרפים ---
  for (let i = 1; i < N; i++) {
    const p = phones[i];
    await p.goto(`${BASE}/r/${code}`, { waitUntil: "networkidle" });
    await enter(p, "שחקן" + i);
  }
  await host.waitForTimeout(1200);
  check(`${N} שחקנים בלובי`, (await txt(host)).includes("שחקן4"));

  // --- בחירת המשחק ---
  await host.locator("button", { hasText: "המתחזה למתקדמים" }).first().click();
  await host.waitForTimeout(800);
  await host.screenshot({ path: `${OUT}/00-catalog.png`, fullPage: true });
  await click(host, /מתחילים|שחקו|יוצאים|התחל/);
  await host.waitForTimeout(600);
  for (const p of phones) { try { await click(p, /הבנתי/); } catch { /* לא תמיד יש */ } }
  await host.waitForTimeout(1500);

  // --- 1. הקלף ---
  const cards = [], full = [];
  for (const p of phones) {
    await p.locator("text=החזק כדי לראות").first().waitFor({ timeout: 15000 });
    // הכרטיס עצמו — כאן חי הסוד, וכאן הוא חייב להיראות זהה אצל כולם
    cards.push(await p.locator(".card").first().innerText());
    full.push(await txt(p));
  }
  check("כל הטלפונים על מסך הקלף", full.every((t) => t.includes("החזק כדי לראות")));
  check("הקלף נראה זהה אצל כולם — הסוד לא דולף", new Set(cards).size === 1, JSON.stringify([...new Set(cards)]));
  // מסירים את מה שנבדל בין מארח לשחקן ברמת המסגרת (כפתור היציאה, כפתור ההתחלה) —
  // מה שנשאר הוא המסך של המשחק עצמו, והוא חייב להיות זהה בית-בבית
  const norm = (t) => t
    .replace(/מתחילים בלי לחכות ▶/g, "")
    .replace(/✕ סיום משחק|🚪/g, "")
    .replace(/\s+/g, " ").trim();
  const uniq = [...new Set(full.map(norm))];
  check("גם ההסבר סביב הקלף זהה (חוץ מכפתור המארח)", uniq.length === 1,
    uniq.length > 1 ? uniq.map((u, i) => `#${i}:${u.slice(0, 160)}`).join(" ||| ") : "");
  check("נטען איור גב-הקלף", await phones[0].locator('img[src*="uc-card"]').count() > 0);
  await phones[0].screenshot({ path: `${OUT}/01-card.png` });

  for (const p of phones) await click(p, /קראתי/);
  await host.waitForTimeout(1200);

  // --- 2. סבב רמזים ---
  let t0 = await txt(host);
  check("התחיל סבב הרמזים", /התור שלך|אומר רמז/.test(t0));
  await phones[0].screenshot({ path: `${OUT}/02-clues.png` });
  for (let round = 0; round < N + 2; round++) {
    let advanced = false;
    for (const p of phones) {
      if ((await txt(p)).includes("התור שלך")) { await click(p, /אמרתי/); advanced = true; break; }
    }
    await host.waitForTimeout(500);
    if (!advanced || (await txt(host)).includes("מתווכחים")) break;
  }
  check("סיימנו את סבב הרמזים והגענו לדיון", (await txt(host)).includes("מתווכחים"));
  await phones[1].screenshot({ path: `${OUT}/03-talk.png` });

  // --- 3. הצבעה ---
  await click(host, /להצבעה/);
  await host.waitForTimeout(900);
  check("כולם על מסך ההצבעה", (await txt(phones[2])).includes("מי המתחזה"));
  await phones[2].screenshot({ path: `${OUT}/04-vote.png` });
  for (const p of phones) {
    const badge = p.locator("button.pbadge").first();
    await badge.click();
    await click(p, /נועל הצבעה/);
    await p.waitForTimeout(200);
  }

  // --- 4. חשיפה --- (ה-cue ב-0.9ש', שלבי האנימציה עד 3.1ש', לוח הניקוד ב-5.1ש')
  await host.waitForTimeout(4500);
  const rev = await txt(phones[0]);
  for (let i = 0; i < N; i++) await phones[i].screenshot({ path: `${OUT}/05-reveal-p${i}.png` });
  check("החשיפה מציגה את מילת הרוב", rev.includes("מילת הרוב"));
  check("החשיפה מציגה את מילת המתחזה", rev.includes("מילת המתחזה"));
  check("החשיפה מכריזה על המתחזה", /המתחזה: |המתחזים: /.test(rev));

  // מי שנחשף רואה איור
  let artSeen = false;
  for (const p of phones) if (await p.locator('img[src*="uc-caught"], img[src*="uc-safe"], img[src*="uc-genius"]').count()) artSeen = true;
  check("איור התוצאה נטען אצל המתחזה", artSeen);

  // --- 5. ניקוד ---
  // אם המודח היה המתחזה, יש קודם חלון "ניחוש אחרון" — הבוטים לא מנחשים,
  // אז מחכים עד שהניקוד באמת מגיע במקום להמר על מספר קבוע
  let sc = "";
  for (let i = 0; i < 40; i++) {
    sc = await txt(host);
    if (sc.includes("הניקוד")) break;
    await host.waitForTimeout(1000);
  }
  check("הגענו ללוח הניקוד", sc.includes("הניקוד"));
  check("למארח יש 'סיבוב חדש'", sc.includes("סיבוב חדש"));
  await host.screenshot({ path: `${OUT}/06-scores.png` });

  // --- 6. סיבוב שני ---
  await click(host, /סיבוב חדש/);
  await host.waitForTimeout(1500);
  check("סיבוב 2 התחיל עם קלף חדש", (await txt(phones[3])).includes("סיבוב 2"));

  check("אין שגיאות קונסולה", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
  console.log(failed ? `\n✗ ${failed} נכשלו\n` : `\n✓ הכול עבר · צילומים ב-${OUT}\n`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
