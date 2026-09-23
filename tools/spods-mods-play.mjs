/**
 * פלייטסט מודיפיירים (ספורט פודים): ↔️ ימין/שמאל במרוץ הצבעים (הפוד מחולק לשני צדדים), ⚽+🔢+🔁 בכוכב הזריזות
 * (⚽ כדרור, מספר ענק לצעוק, חץ), וכרטיס ✨ בונה האימון בתחנות (מוסתר כשה-AI לא זמין). צילומים ב-/tmp/spods-mods-<lang>/.
 *   SP_FAST=1 npx tsx src/index.ts   (מ-server/)
 *   L=en node tools/spods-mods-play.mjs
 */
import { chromium, devices } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8787";
const LANG = process.env.L || "en";
const OUT = `/tmp/spods-mods-${LANG}`;
const COMMON = JSON.parse(readFileSync(new URL(`../client/src/locales/${LANG}/common.json`, import.meta.url), "utf8"));
const SP = JSON.parse(readFileSync(new URL(`../client/src/locales/${LANG}/spods.json`, import.meta.url), "utf8"));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : "")); if (!ok) failed++; };
const HEB = LANG === "he" ? /$^/ : /[֐-׿]/;
const KEY = /(spods|pods|games)\.[a-z_]+\.?[a-zA-Z_.]*|awards\./;
const errors = [];
const txt = (p) => p.evaluate(() => document.body.innerText);
const bad = (s) => (LANG !== "he" && s.match(/.{0,30}[֐-׿].{0,30}/)?.[0]) || s.match(/.{0,20}((spods|pods|games)\.|awards\.).{0,30}/)?.[0];
const ok = (s) => !HEB.test(s) && !KEY.test(s);
const dbg = (p) => p.evaluate(() => window.__spDbg ?? { phase: "none" });

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
  const [coach, ...pods] = phones;
  const names = ["Dana", "Omer", "Yuki"];
  const enter = async (p, name) => { const i = p.locator("input").first(); await i.waitFor({ timeout: 15000 }); await i.type(name, { delay: 30 }); await p.locator("button.btn").first().click(); await p.waitForTimeout(600); };
  await coach.goto(`${BASE}/?l=${LANG}`, { waitUntil: "networkidle" });
  await coach.locator("button.mega-cta").click(); await coach.waitForTimeout(1200);
  await enter(coach, "Coach");
  const code = (await txt(coach)).match(/\b[A-Z]{4}\b/)?.[0];
  check("room opened", !!code, code);
  for (const [i, p] of pods.entries()) { await p.goto(`${BASE}/r/${code}?l=${LANG}`, { waitUntil: "networkidle" }); await enter(p, names[i]); }
  await coach.waitForTimeout(1000);
  const openGame = async (g) => {
    await coach.locator("button.gcard", { hasText: COMMON[`games.sp_${g}.name`] }).first().click(); await coach.waitForTimeout(800);
    await coach.locator("button.btn", { hasText: /🚀/ }).first().click(); await coach.waitForTimeout(1500);
    await Promise.all(phones.map((p) => p.locator("button", { hasText: /👍/ }).first().click({ timeout: 1500 }).catch(() => {})));
    for (const p of pods) await p.evaluate(() => { window.__spAuto = true; });
    await sleep(1200);
  };
  const setOpt = async (label) => { await coach.locator("button.opt", { hasText: label }).first().click({ timeout: 3000 }); await sleep(250); };
  const watch = async (secs, probe) => { const t0 = Date.now(); const seen = {}; while (Date.now() - t0 < secs * 1000) { for (const p of pods) { const r = await probe(p); for (const k of Object.keys(r)) if (r[k] && !seen[k]) { seen[k] = true; await p.screenshot({ path: `${OUT}/${k}.png` }); } } const d = await dbg(coach); if (d.phase === "over") break; await sleep(250); } return seen; };
  const toCeremonyAndBack = async () => { let cer = ""; for (let i = 0; i < 40; i++) { await sleep(500); cer = await txt(coach); if (/🌙|🏅/.test(cer)) break; } await coach.locator("button", { hasText: COMMON["ceremony.again"] }).first().click({ timeout: 5000 }); await coach.waitForTimeout(1200); return cer; };

  // ---- ↔️ במרוץ הצבעים
  await openGame("colors");
  let rem = await txt(coach);
  check("colors setup shows ⚽ and ↔️ modifiers", rem.includes(SP["spods.mod.ball"]) && rem.includes(SP["spods.mod.hand"]) && rem.includes(SP["spods.mod.off"]), bad(rem));
  check("remote localized", ok(rem), bad(rem));
  await setOpt(SP["spods.mod.hand.1"]);
  await coach.screenshot({ path: `${OUT}/01-colors-setup.png`, fullPage: true });
  try { await coach.locator("button", { hasText: /💡/ }).first().click({ timeout: 1500 }); } catch { /* */ }
  await coach.locator("button", { hasText: /🚀/ }).first().click({ timeout: 8000 });
  let seen = await watch(60, async (p) => ({ "02-pod-lr": (await p.locator(".sp-lr").count()) > 0 }));
  check("pods rendered the left/right split", !!seen["02-pod-lr"]);
  const lrTxt = seen["02-pod-lr"] ? "" : "";
  let cer = await toCeremonyAndBack();
  check("ceremony 1 localized", ok(cer), bad(cer));

  // ---- ⚽ 🔢 🔁 בכוכב
  await openGame("star");
  rem = await txt(coach);
  check("star setup shows ⚽ 🔢 🔁", rem.includes(SP["spods.mod.ball"]) && rem.includes(SP["spods.mod.shout"]) && rem.includes(SP["spods.mod.world"]), bad(rem));
  await setOpt(SP["spods.mod.ball.1"]); await setOpt(SP["spods.mod.shout.1"]); await setOpt(SP["spods.mod.world.1"]);
  await coach.screenshot({ path: `${OUT}/03-star-setup.png`, fullPage: true });
  try { await coach.locator("button", { hasText: /💡/ }).first().click({ timeout: 1500 }); } catch { /* */ }
  await coach.locator("button", { hasText: /🚀/ }).first().click({ timeout: 8000 });
  seen = await watch(90, async (p) => { const t = await p.locator(".sp-lit").count() ? await txt(p) : ""; return { "04-pod-shout": (await p.locator(".sp-shout").count()) > 0 && t.includes(SP["spods.mod.shout_it"]), "05-pod-arrow": t.includes("↻") || t.includes("↺"), "06-pod-ball": t.includes(SP["spods.mod.dribble"]) }; });
  check("pod showed a shout number", !!seen["04-pod-shout"]);
  check("pod showed the arrow", !!seen["05-pod-arrow"]);
  check("pod showed the dribble cue", !!seen["06-pod-ball"]);
  cer = await toCeremonyAndBack();
  check("ceremony 2 localized", ok(cer), bad(cer));

  // ---- ✨ תחנות: כרטיס ה-AI מוסתר כשאין מפתח, ערכה 3 מוסתרת
  await openGame("stations");
  rem = await txt(coach);
  const aiAvail = await (await fetch(`${BASE}/api/ai-deck-available`)).json();
  check("AI builder card " + (aiAvail.available ? "shown" : "hidden (no key locally)"), rem.includes(SP["spods.ai.title"]) === !!aiAvail.available);
  check("custom kit option hidden without a kit", !rem.includes(SP["spods.kit.custom"]));
  await coach.screenshot({ path: `${OUT}/07-stations-setup.png`, fullPage: true });
  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" ; "));
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nALL OK");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
