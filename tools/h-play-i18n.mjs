/**
 * פלייטסט שלב H בשפה זרה — מי הכי / המתחזה למתקדמים / התהום / החופרים: משחק שלם עד הטקס, בלי אף מילה בעברית
 * (חוץ ממילות החפיסה של המתחזה — עדיין בעברית עד שלב החפיסות).
 *   HF_FAST=1 npx tsx src/index.ts   (מ-server/)
 *   L=en G=whomost node tools/h-play-i18n.mjs     (G: whomost|undercover|abyss|hofrim)
 */
import { chromium, devices } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8787";
const LANG = process.env.L || "en";
const GAME = process.env.G || "whomost";
const OUT = `/tmp/h-${GAME}-${LANG}`;
const COMMON = JSON.parse(readFileSync(new URL(`../client/src/locales/${LANG}/common.json`, import.meta.url), "utf8"));
const GAME_NAME = COMMON[`games.${GAME}.name`];
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : "")); if (!ok) failed++; };
const HEB = LANG === "he" ? /$^/ : /[֐-׿]/;   // בעברית בודקים רק דליפת מפתחות ושגיאות
const KEY = new RegExp(`\\b(${GAME}|games|awards)\\.[a-z_]+`);
const errors = [];
// טקסט המסך בלי מילות החפיסה (המתחזה: <b> בתוך .card) — הן עדיין בעברית עד שלב החפיסות
const txt = (p) => p.evaluate(() => {
  const clone = document.body.cloneNode(true);
  for (const el of clone.querySelectorAll(".card > b, .card > div > b, .card b[style*='--gold'], .card b[style*='ff8a8a'], input")) el.remove();
  return clone.innerText;
});
const bad = (s) => (LANG !== "he" && s.match(/.{0,30}[\u0590-\u05FF].{0,30}/)?.[0]) || s.match(new RegExp(`.{0,20}\\b(${GAME}|games|awards)\\..{0,30}`))?.[0];
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
  const N = GAME === "abyss" || GAME === "hofrim" ? 2 : GAME === "undercover" ? 4 : 3;
  const phones = [];
  for (let i = 0; i < N; i++) {
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
  if (GAME === "abyss") { const one = host.locator("button", { hasText: COMMON["games.abyss.opt.descents.1"] }); if (await one.count()) await one.first().click(); }
  await snap(host, "lobby");
  check("lobby: options localized", ok(await txt(host)), bad(await txt(host)));
  await host.locator("button.btn", { hasText: /🚀/ }).first().click();
  await host.waitForTimeout(1500);
  await Promise.all(phones.map((p) => p.locator("button", { hasText: /👍/ }).first().click({ timeout: 1500 }).catch(() => {})));
  await sleep(1200);

  if (GAME === "whomost") await playWhomost(host, rest);
  else if (GAME === "undercover") await playUndercover(host, rest);
  else if (GAME === "abyss") await playAbyss(host, rest);
  else if (GAME === "hofrim") await playHofrim(host, rest);

  let cer = "";
  for (let i = 0; i < 30; i++) { await sleep(500); cer = await host.evaluate(() => document.body.innerText); if (/🌙|🏅/.test(cer)) break; }
  await snap(host, "ceremony");
  check("ceremony reached", /🌙|🏅/.test(cer));
  check("ceremony localized: title + award", (LANG === "he" || !/[\u0590-\u05FF]/.test(cer)) && !/awards\.|\.end\./.test(cer), bad(cer));
  console.log("--- ceremony text (host) ---\n" + cer.split("\n").filter(Boolean).slice(0, 10).join(" | "));
  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" ; "));
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nALL OK");
  process.exit(failed ? 1 : 0);
}

async function playWhomost(host, rest) {
  const all = [host, ...rest];
  await snap(host, "write"); await scan(all, "write");
  for (let i = 0; i < 3; i++) await host.locator("button", { hasText: /🎲/ }).click();
  await sleep(400); await snap(host, "write-3q"); await scan(all, "write-3q");
  await host.locator("button", { hasText: /🚀/ }).click();
  await sleep(800); await snap(rest[0], "answer"); await scan(all, "answer");
  for (const p of all) {
    const chips = p.locator(".throw-chip");
    const n = await chips.count();
    // בכל שאלה 3 מועמדים — בוחרים את הראשון בכל שאלה
    for (let q = 0; q < n; q += all.length) await chips.nth(q).click();
    await sleep(200);
    await p.locator("button.btn", { hasText: /✅/ }).click();
  }
  await sleep(800); await snap(host, "answered"); await scan(all, "answered");
  await host.locator("button", { hasText: /🎬/ }).click();
  await sleep(800);
  for (let q = 0; q < 3; q++) {
    await scan(all, `reveal-q${q}`); if (q === 0) await snap(host, "reveal-q");
    await host.locator("button", { hasText: /🔦/ }).click();
    await sleep(1500);
    await scan(all, `result-q${q}`); if (q === 0) { await snap(host, "result"); for (const p of rest) if (/👑/.test(await p.evaluate(() => document.body.innerText))) { await snap(p, "its-you"); break; } }
    await host.locator("button", { hasText: /➡️|🏆/ }).click();
    await sleep(800);
  }
}

async function playUndercover(host, rest) {
  const all = [host, ...rest];
  await snap(host, "deal"); await scan(all, "deal");
  for (const p of all) { await p.locator("button.mega-cta").click({ timeout: 3000 }).catch(() => {}); }
  await sleep(1000); await snap(host, "clues"); await scan(all, "clues");
  // סבב רמזים: מי שיש לו mega-cta — לוחץ "אמרתי"
  for (let i = 0; i < 12; i++) {
    let clicked = false;
    for (const p of all) { const b = p.locator("button.mega-cta"); if (await b.count()) { await b.click({ timeout: 1000 }).catch(() => {}); clicked = true; await sleep(300); } }
    await scan(all, `clue-${i}`);
    if (!clicked) break;
    const hostTxt = await txt(host); if (/🗣️/.test(hostTxt)) break;
    await sleep(300);
  }
  await snap(host, "talk"); await scan(all, "talk");
  await host.locator("button.mega-cta").click({ timeout: 3000 }).catch(() => {});
  await sleep(1000); await snap(host, "vote"); await scan(all, "vote");
  for (const p of all) { await p.locator(".players-grid button").first().click({ timeout: 2000 }).catch(() => {}); await sleep(150); await p.locator("button.mega-cta").click({ timeout: 2000 }).catch(() => {}); }
  await sleep(2500); await snap(host, "reveal"); await scan(all, "reveal");
  // ניחוש אחרון (אם המתחזה נתפס)
  for (const p of all) { const inp = p.locator("input"); if (await inp.count()) { await inp.fill("banana"); await p.locator("button.btn.gold").click({ timeout: 2000 }).catch(() => {}); await snap(p, "guess"); } }
  // ניחוש אחרון עשוי להתחיל מאוחר יותר (15 שנ') — ממלאים אם צץ, ומחכים ללוח הניקוד
  for (let i = 0; i < 40; i++) {
    await sleep(700);
    for (const p of all) { const inp = p.locator("input"); if (await inp.count()) { await inp.fill("banana").catch(() => {}); await p.locator("button.btn.gold").click({ timeout: 1000 }).catch(() => {}); } }
    if (await host.locator("button.btn.ghost", { hasText: /🏁/ }).count()) break;
  }
  await snap(host, "scores"); await scan(all, "scores");
  await host.locator("button.btn.ghost", { hasText: /🏁/ }).click({ timeout: 8000 });
}

async function playAbyss(host, rest) {
  const all = [host, ...rest];
  const dbg = (p) => p.evaluate(() => ({ ...(window.__abDbg ?? {}), err: (window.__abErr ?? "").slice(0, 200) }));
  const waitPhase = async (p, ph, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await dbg(p); if (d.phase === ph) return d; await sleep(150); } return await dbg(p); };
  for (const p of all) await p.evaluate(() => { window.__abAuto = true; });
  await scan(all, "count");
  const f = await waitPhase(host, "fall", 10000); check("fall started", f.phase === "fall", f.phase);
  await sleep(2500); await snap(host, "fall"); await scan(all, "fall");
  const l = await waitPhase(host, "ledge", 30000); check("ledge reached", l.phase === "ledge");
  await sleep(400); await snap(host, "ledge"); await scan(all, "ledge");
  await host.locator(".ab-slab.stop").click({ timeout: 2000 }).catch(() => {});
  await rest[0].locator(".ab-slab.go").click({ timeout: 2000 }).catch(() => {});
  const r = await waitPhase(host, "reveal", 8000); check("reveal reached", r.phase === "reveal");
  await sleep(500); await snap(host, "reveal"); await scan(all, "reveal");
  await waitPhase(rest[0], "fall", 8000);
  await sleep(1500); await snap(host, "spectator"); await scan(all, "spectator");
  await host.locator(".ab-throw.trap").click({ timeout: 2000 }).catch(() => {});
  await sleep(900); await snap(rest[0], "trap-incoming"); await scan(all, "trap");
  const res = await waitPhase(host, "results", 45000); check("results reached", res.phase === "results", res.phase);
  await sleep(800); await snap(host, "results"); await scan(all, "results");
  const url = await host.evaluate(() => window.__abCardUrl || "");
  check("shaft card rendered", url.startsWith("data:image/png"), url.slice(0, 20));
  if (url) { const buf = Buffer.from(url.split(",")[1], "base64"); (await import("node:fs")).writeFileSync(`${OUT}/shaft-card.png`, buf); }
  const d = await dbg(host); check("no renderer error", !d.err, d.err);
}

async function playHofrim(host, rest) {
  const all = [host, ...rest];
  await sleep(1500); await snap(host, "shift1"); await scan(all, "shift1");
  const t0 = Date.now(); let n = 0;
  while (Date.now() - t0 < 60000) {
    await sleep(2000); n++;
    await scan(all, `t${n}`);
    if (n === 6) await snap(host, "shift-end");
    const s = await host.evaluate(() => document.body.innerText);
    if (/🌙|🏅/.test(s) || !(await host.locator("canvas.hf-cv").count())) break;
  }
}
main().catch((e) => { console.error(e); process.exit(2); });
