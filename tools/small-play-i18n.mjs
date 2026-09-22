/**
 * פלייטסט "בוט מקשקש" למשחקים הקטנים בשפה זרה — 4 טלפונים, כל טלפון לוחץ על כפתורים אקראיים (חוץ מיציאה),
 * ובכל צעד בודקים שאין עברית/מפתחות גולמיים על אף מסך. רץ עד הטקס או עד הזמן שהוגדר.
 *   npx tsx src/index.ts   (מ-server/)
 *   L=en G=trivia node tools/small-play-i18n.mjs   (G: forehead|deathtouch|impostor|bombs|colorrules|alias|simon|demons|trivia)
 */
import { chromium, devices } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8787";
const LANG = process.env.L || "en";
const GAME = process.env.G || "trivia";
const SECS = Number(process.env.SECS || 75);
const OUT = `/tmp/small-${GAME}-${LANG}`;
const COMMON = JSON.parse(readFileSync(new URL(`../client/src/locales/${LANG}/common.json`, import.meta.url), "utf8"));
const GAME_NAME = COMMON[`games.${GAME}.name`];
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : "")); if (!ok) failed++; };
const HEB = LANG === "he" ? /$^/ : /[֐-׿]/;
const KEY = new RegExp(`\\b(${GAME}|games|awards)\\.[a-z_]+`);
const errors = [];
// מילות החפיסה (על המצח / המתחזה / על הלשון / טריוויה) עדיין בעברית — מסירים את האלמנטים שמציגים אותן
// תוכן החפיסות/הטריוויה עדיין בעברית (שלב נפרד) — מנקים את המילים האלה מהטקסט לפני הבדיקה
const CONTENT = [...new Set([readFileSync(new URL("../server/src/decks.ts", import.meta.url), "utf8"), readFileSync(new URL("../server/src/triviaBank.ts", import.meta.url), "utf8")]
  .flatMap((src) => [...src.matchAll(/"((?:[^"\\\n]|\\.)*[\u0590-\u05FF](?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"'))))].sort((a, b) => b.length - a.length);
const stripContent = (s) => { if (process.env.STRICT) return s; for (const w of CONTENT) if (s.includes(w)) s = s.split(w).join("·"); return s; };
const txt = (p) => p.evaluate(() => { const clone = document.body.cloneNode(true); for (const el of clone.querySelectorAll("input")) el.remove(); return clone.innerText; }).then(stripContent);
const bad = (s) => (LANG !== "he" && s.match(/.{0,30}[֐-׿].{0,30}/)?.[0]) || s.match(new RegExp(`.{0,20}\\b(${GAME}|games|awards)\\..{0,30}`))?.[0];
const ok = (s) => !HEB.test(s) && !KEY.test(s);
let shots = 0;
const snap = async (p, tag) => { shots++; await p.screenshot({ path: `${OUT}/${String(shots).padStart(2, "0")}-${tag}.png` }); };
const seen = new Set();
async function scan(pages, tag) {
  for (const [i, p] of pages.entries()) {
    const s = await txt(p);
    if (!ok(s)) { const b = bad(s); if (!seen.has(b)) { seen.add(b); check(`P${i} ${tag}: localized`, false, b); } }
  }
}

async function main() {
  const browser = await chromium.launch({ args: ["--no-proxy-server"], env: { ...process.env, HTTPS_PROXY: "", HTTP_PROXY: "", https_proxy: "", http_proxy: "" } });
  const phones = [];
  for (let i = 0; i < 4; i++) {
    const ctx = await browser.newContext({ ...devices["Pixel 7"] });
    const p = await ctx.newPage();
    p.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|ERR_TUNNEL|ERR_BLOCKED|Failed to load resource/.test(m.text())) errors.push(`P${i}: ${m.text()}`); });
    p.on("pageerror", (e) => errors.push(`P${i}: ${e.message}`));
    phones.push(p);
  }
  const [host, ...rest] = phones;
  const names = ["Dana", "Omer", "Yuki", "Sam"];
  const enter = async (p, name) => { const i = p.locator("input").first(); await i.waitFor({ timeout: 15000 }); await i.type(name, { delay: 30 }); await p.locator("button.btn").first().click(); await p.waitForTimeout(600); };

  await host.goto(`${BASE}/?l=${LANG}`, { waitUntil: "networkidle" });
  await host.locator("button.mega-cta").click();
  await host.waitForTimeout(1200);
  await enter(host, names[0]);
  const code = (await host.evaluate(() => document.body.innerText)).match(/\b[A-Z]{4}\b/)?.[0];
  check("room opened", !!code, code);
  for (const [i, p] of rest.entries()) { await p.goto(`${BASE}/r/${code}?l=${LANG}`, { waitUntil: "networkidle" }); await enter(p, names[i + 1]); }
  await host.waitForTimeout(1000);
  await host.locator("button.gcard", { hasText: GAME_NAME }).first().click();
  await host.waitForTimeout(800);
  check("lobby: options localized", ok(await txt(host)), bad(await txt(host)));
  await host.locator("button.btn", { hasText: /🚀/ }).first().click();
  await host.waitForTimeout(1500);
  await Promise.all(phones.map((p) => p.locator("button", { hasText: /👍/ }).first().click({ timeout: 1500 }).catch(() => {})));
  await sleep(1500);
  await snap(host, "start"); await snap(rest[0], "start-p1"); await scan(phones, "start");

  // בוט: כל 900ms כל טלפון לוחץ על כפתור אקראי (לא יציאה), וכל 3 צעדים גם על המסך עצמו
  const t0 = Date.now(); let step = 0, cer = "";
  while (Date.now() - t0 < SECS * 1000) {
    step++;
    for (const p of phones) {
      await p.evaluate(() => {
        const btns = [...document.querySelectorAll("button")].filter((b) => !b.disabled && b.offsetParent && !/✕|🚪|🏠/.test(b.textContent || ""));
        const b = btns[Math.floor(Math.random() * btns.length)];
        if (b) b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        if (b) b.click();
      }).catch(() => {});
      if (step % 3 === 0) await p.mouse.click(200 + Math.random() * 100, 400 + Math.random() * 200).catch(() => {});
    }
    await sleep(900);
    await scan(phones, `t${step}`);
    if (step === 4 || step === 12 || step === 24) { await snap(host, `mid${step}`); await snap(rest[0], `mid${step}-p1`); }
    cer = await host.evaluate(() => document.body.innerText);
    if (/🌙|🏅/.test(cer)) break;
  }
  const reached = /🌙|🏅/.test(cer);
  await snap(host, reached ? "ceremony" : "end");
  console.log(reached ? "  ✓ ceremony reached" : "  · time's up (no ceremony) — fine for host-driven games");
  if (reached) { check("ceremony localized: title + award", !HEB.test(cer) && !/awards\.|\.end\./.test(cer), bad(cer)); console.log("--- ceremony ---\n" + cer.split("\n").filter(Boolean).slice(0, 8).join(" | ")); }
  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" ; "));
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nALL OK");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
