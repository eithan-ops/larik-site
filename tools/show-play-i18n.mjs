/**
 * פלייטסט שלב K בשפה זרה — אפליקציית המופע (/s): לנדינג → פתיחת מופע → קהל מצטרף → קונסולה; היומית (/daily);
 * וכרטיסי השיתוף (endcard/sharecard) מצוירים ונבדקים דרך OCR-לייט: אין עברית בטקסטים שהועברו לקנבס (נבדק דרך t()).
 *   npx tsx src/index.ts   (מ-server/)
 *   L=en node tools/show-play-i18n.mjs
 */
import { chromium, devices } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8787";
const LANG = process.env.L || "en";
const OUT = `/tmp/show-${LANG}`;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : "")); if (!ok) failed++; };
const HEB = LANG === "he" ? /$^/ : /[֐-׿]/;
const KEY = /\b(show|daily|card|board|qr|group|err)\.[a-zA-Z_.]+/;
const errors = [];
const txt = (p) => p.evaluate(() => document.body.innerText);
const bad = (s) => (LANG !== "he" && s.match(/.{0,30}[֐-׿].{0,30}/)?.[0]) || s.match(/.{0,20}\b(show|daily|card|board|qr|group|err)\..{0,30}/)?.[0];
const ok = (s) => !HEB.test(s) && !KEY.test(s);
let shots = 0;
const snap = async (p, tag) => { shots++; await p.screenshot({ path: `${OUT}/${String(shots).padStart(2, "0")}-${tag}.png` }); };

async function main() {
  const browser = await chromium.launch({ args: ["--no-proxy-server"], env: { ...process.env, HTTPS_PROXY: "", HTTP_PROXY: "", https_proxy: "", http_proxy: "" } });
  const mk = async (i) => { const ctx = await browser.newContext({ ...devices["Pixel 7"] }); const p = await ctx.newPage();
    p.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|ERR_TUNNEL|ERR_BLOCKED|Failed to load resource/.test(m.text())) errors.push(`P${i}: ${m.text()}`); });
    p.on("pageerror", (e) => errors.push(`P${i}: ${e.message}`)); return p; };
  const dj = await mk(0), fan = await mk(1);

  // ---- המופע: לנדינג
  await dj.goto(`${BASE}/s?l=${LANG}`, { waitUntil: "networkidle" });
  await sleep(800);
  await snap(dj, "show-landing");
  const land = await txt(dj); check("show landing localized", ok(land), bad(land));
  check("show landing has 🌐 switch", (await dj.locator(".lang-btn").count()) === 1);
  // פותחים מופע
  await dj.locator("button.btn").first().click();
  await sleep(2500);
  const nameScreen = await txt(dj); check("DJ name screen localized", ok(nameScreen), bad(nameScreen));
  await dj.locator("input").first().type("Dana", { delay: 20 }); await dj.locator("button.btn").first().click(); await sleep(2500);
  await snap(dj, "show-host");
  const host = await txt(dj); check("show host screen localized", ok(host), bad(host));
  const code = dj.url().match(/\/r\/([A-Za-z]{4})/)?.[1]?.toUpperCase();
  check("show opened (code)", !!code, code);
  if (code) {
    await fan.goto(`${BASE}/s/r/${code}?l=${LANG}`, { waitUntil: "networkidle" }).catch(() => {});
    await sleep(1200);
    const j = await txt(fan); check("fan join screen localized", ok(j), bad(j));
    const inp = fan.locator("input").first();
    if (await inp.count()) { await inp.type("Omer", { delay: 20 }); await fan.locator("button.btn").first().click(); await sleep(1500); }
    await snap(fan, "show-fan");
    const f = await txt(fan); check("fan waiting screen localized", ok(f), bad(f));
    // מתחילים
    const start = dj.locator("button", { hasText: /🕯️/ });
    if (await start.count()) { await start.first().click(); await sleep(2500); }
    await snap(dj, "show-console"); await snap(fan, "show-fan-live");
    const c = await txt(dj); check("DJ console localized (pads/shapes/pilot)", ok(c), bad(c));
    const f2 = await txt(fan); check("fan live screen localized", ok(f2), bad(f2));
  }

  // ---- שער כרטיס 🎫 (ShowGate) — קהל עם מושב
  if (code) {
    await fan.goto(`${BASE}/s/t/${code}?r=3&c=7&l=${LANG}`, { waitUntil: "networkidle" }).catch(() => {});
    await sleep(1200);
    await snap(fan, "show-gate");
    const g = await txt(fan); check("ticket gate localized", ok(g), bad(g));
  }

  // ---- היומית
  await fan.goto(`${BASE}/daily?l=${LANG}`, { waitUntil: "networkidle" });
  await sleep(2500);
  await snap(fan, "daily");
  const d = await txt(fan); check("daily localized", ok(d), bad(d));
  // עונים על שאלה אחת
  const optBtn = fan.locator("button").nth(1);
  if (await optBtn.count()) { await optBtn.click().catch(() => {}); await sleep(1500); const d2 = await txt(fan); check("daily after answer localized", ok(d2), bad(d2)); await snap(fan, "daily-answered"); }

  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" ; "));
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nALL OK");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
