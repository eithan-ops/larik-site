/**
 * בדיקת שלב L — כותרות/OG/מניפסט לפי שפה, בזמן ריצה:
 *   מארח קוריאני פותח חדר → /r/CODE בלי ?l= מקבל מהשרת כותרת קוריאנית (שפת החדר);
 *   כותרת הטאב מתעדכנת בניווט (בית → חדר → יומית); אחרי 🌐 (בחירה ידנית) ה-<link rel=manifest> עובר לשפה.
 *   npx tsx src/index.ts (מ-server/) ואז: node tools/meta-play-i18n.mjs
 */
import { chromium, devices } from "/opt/node-tools/node_modules/playwright/index.mjs";
const BASE = process.env.BASE || "http://localhost:8787";
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : "")); if (!ok) failed++; };
const browser = await chromium.launch({ args: ["--no-proxy-server"], env: { ...process.env, HTTPS_PROXY: "", HTTP_PROXY: "", https_proxy: "", http_proxy: "" } });
const ctx = await browser.newContext({ ...devices["Pixel 7"] });
const host = await ctx.newPage();
await host.goto(`${BASE}/?l=ko`, { waitUntil: "networkidle" });
check("home title (ko)", (await host.title()).includes("LARIK") && /[가-힯]/.test(await host.title()), await host.title());
await host.locator("button.mega-cta").click(); await host.waitForTimeout(1200);
const inp = host.locator("input").first(); await inp.type("Dana", { delay: 20 }); await host.locator("button.btn").first().click(); await host.waitForTimeout(1500);
const code = (await host.evaluate(() => document.body.innerText)).match(/\b[A-Z]{4}\b/)?.[0];
check("room opened", !!code, code);
check("room tab title (ko, runtime)", (await host.title()).includes(code) && /[가-힯]/.test(await host.title()), await host.title());
// שרת: /r/CODE בלי ?l= → שפת החדר (המארח קוריאני)
const raw = await (await ctx.request.get(`${BASE}/r/${code}`)).text();
const title = raw.match(/<title>([^<]*)<\/title>/)?.[1] || "";
check("server: /r/CODE title follows host lang (ko)", title.includes(code) && /[가-힯]/.test(title), title);
check("server: /r/CODE html lang=ko", /<html lang="ko"/.test(raw));
check("server: noindex on room", /name="robots" content="noindex"/.test(raw));
// היומית — כותרת בזמן ריצה
const p2 = await ctx.newPage();
await p2.goto(`${BASE}/daily?l=ar`, { waitUntil: "networkidle" }); await p2.waitForTimeout(800);
check("daily tab title (ar)", /[؀-ۿ]/.test(await p2.title()) && (await p2.title()).includes("LARIK"), await p2.title());
check("daily manifest link ?l=ar", (await p2.getAttribute('link[rel="manifest"]', "href") || "").endsWith("?l=ar"));
// בחירה ידנית: 🌐 → אנגלית → הכותרת והמניפסט עוברים לאנגלית בלי ?l= בכתובת
await p2.goto(`${BASE}/`, { waitUntil: "networkidle" });
await p2.evaluate(() => { localStorage.setItem("larik-lang", "en"); });
await p2.reload({ waitUntil: "networkidle" }); await p2.waitForTimeout(800);
check("manual switch: tab title en", /Party games/.test(await p2.title()), await p2.title());
check("manual switch: manifest link ?l=en", (await p2.getAttribute('link[rel="manifest"]', "href") || "").endsWith("?l=en"), await p2.getAttribute('link[rel="manifest"]', "href"));
const mf = await (await ctx.request.get(new URL(await p2.getAttribute('link[rel="manifest"]', "href"), BASE).toString())).json();
check("manifest en name", mf.name === "LARIK — Party games" && mf.lang === "en" && mf.dir === "ltr", mf.name);
// המופע
const p3 = await ctx.newPage();
await p3.goto(`${BASE}/s/t/${code}?r=3&c=7&l=pt`, { waitUntil: "networkidle" }); await p3.waitForTimeout(800);
check("show gate tab title (pt)", (await p3.title()).includes(code) && /Entre no show/.test(await p3.title()), await p3.title());
check("show manifest link ?l=pt", (await p3.getAttribute('link[rel="manifest"]', "href") || "").endsWith("/show.webmanifest?l=pt"));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL OK"); process.exit(failed ? 1 : 0);
