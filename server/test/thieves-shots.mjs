/**
 * הגנבים 🥷 — פלייטסט E2E עם 4 דפדפני מובייל + צילומי מסך של סבב 5 (העצירה, המדף, הכפתורים).
 * TH_FAST=1 node test/thieves-shots.mjs  →  /tmp/th-*.png
 * (דורש build של הלקוח: cd client && npm run build)
 */
import { chromium } from "playwright";
import { spawn } from "child_process";

const PORT = 8795;
const srv = spawn("npx", ["tsx", "src/index.ts"], { env: { ...process.env, PORT: String(PORT), TH_FAST: "1" }, stdio: "pipe" });
srv.stderr.on("data", (d) => { const s = String(d); if (/error|Error/.test(s)) console.log("SRV:", s.slice(0, 300)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbg = (p) => p.evaluate(() => { const g = window.__thDbg; if (!g) return { none: true }; return { ready: g.ready, go: g.go, paused: g.paused, k: g.k, over: g.over, me: { x: +g.me.x.toFixed(1), y: +g.me.y.toFixed(1), gold: g.me.gold, carry: g.me.carry, stolen: g.me.stolen }, cards: [...g.cards.entries()].map(([p, c]) => p.slice(0, 4) + ":" + c.join("+")), others: g.others.size, items: g.items.size, mods: { speed: g.mods.speed, cap: g.mods.carryCap }, fx: g.fxs.length, pat: !!g.groundPat }; });
const waitFor = async (p, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await dbg(p); if (fn(d)) return d; await sleep(120); } return await dbg(p); };
const errors = [];
const hold = async (p, key, ms) => { await p.keyboard.down(key); await sleep(ms); await p.keyboard.up(key); };
try {
  await sleep(2500);
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const mk = async () => { const pg = await (await browser.newContext({ viewport: { width: +(process.env.VW || 390), height: +(process.env.VH || 844) }, deviceScaleFactor: 2, hasTouch: true })).newPage(); pg.on("pageerror", (e) => errors.push(String(e))); pg.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }); return pg; };
  const enter = async (page, name) => { const inp = page.locator("input").first(); await inp.waitFor({ timeout: 10000 }); await inp.click(); await inp.type(name, { delay: 30 }); await page.click("text=נכנסים"); await sleep(900); };
  const p1 = await mk(); await p1.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await p1.click("text=פתח חדר חדש", { timeout: 15000 }); await enter(p1, "דניאל");
  const code = new URL(p1.url()).pathname.split("/").pop();
  const pages = [p1];
  for (const n of ["נועם", "תמר", "יובל"]) { const p = await mk(); await p.goto(`http://localhost:${PORT}/r/${code}`, { waitUntil: "domcontentloaded" }); await enter(p, n); pages.push(p); }
  await p1.click("button:has-text('הגנבים')"); await sleep(600);
  await p1.screenshot({ path: "/tmp/th-0-catalog.png" });
  await p1.click("text=מתחילים", { timeout: 10000 });
  await waitFor(p1, (d) => d.ready, 8000);
  await sleep(700);
  await p1.screenshot({ path: "/tmp/th-1-countdown.png" });
  await waitFor(p1, (d) => d.go, 6000);
  // כולם רצים להר (מקשים): דניאל [5,5] → ימינה-למטה, נועם [41,25] → שמאלה-למעלה, תמר [41,5] → שמאלה-למטה, יובל [5,25] → ימינה-למעלה
  const runs = [["d", "s"], ["a", "w"], ["a", "s"], ["d", "w"]];
  await Promise.all(pages.map(async (p, i) => { await p.keyboard.down(runs[i][0]); await p.keyboard.down(runs[i][1]); await sleep(3600); await p.keyboard.up(runs[i][0]); await p.keyboard.up(runs[i][1]); }));
  await sleep(300);
  await p1.screenshot({ path: "/tmp/th-2-run.png" });
  console.log("run:", JSON.stringify(await dbg(p1)));
  // חוצבים רגע ואז חוזרים הביתה להפקיד
  await sleep(2000);
  await p1.screenshot({ path: "/tmp/th-2b-mine.png" });
  await Promise.all(pages.map(async (p, i) => { const back = { d: "a", a: "d", s: "w", w: "s" }; await p.keyboard.down(back[runs[i][0]]); await p.keyboard.down(back[runs[i][1]]); await sleep(4200); await p.keyboard.up(back[runs[i][0]]); await p.keyboard.up(back[runs[i][1]]); }));
  await pages[1].screenshot({ path: "/tmp/th-3-carry.png" });
  // ⏸ העצירה הראשונה
  await waitFor(p1, (d) => d.paused, 12000);
  await sleep(500);
  await p1.screenshot({ path: "/tmp/th-4-freeze.png" });
  console.log("freeze:", JSON.stringify(await dbg(p1)));
  await p1.locator(".th-shelf").waitFor({ timeout: 6000 });
  await sleep(400);
  await p1.screenshot({ path: "/tmp/th-5-shelf.png" });
  const shelfTxt = await p1.locator(".th-shelf").innerText();
  console.log("shelf p1:", shelfTxt.replace(/\n+/g, " | ").slice(0, 300));
  // דניאל בוחר דאש אם יש, אחרת את הראשון שאפשר לקנות; נועם קונה את הראשון; תמר אוגרת
  const pick = async (p, prefer) => {
    const cards = p.locator(".th-card:not(.poor)");
    const n = await cards.count(); if (!n) return "none";
    let idx = 0;
    for (let i = 0; i < n; i++) { const t = await cards.nth(i).innerText(); if (prefer && t.includes(prefer)) { idx = i; break; } }
    await cards.nth(idx).click(); await sleep(250);
    return (await cards.nth(idx).innerText()).split("\n")[1] ?? "?";
  };
  const c1 = await pick(p1, "דאש"); await p1.screenshot({ path: "/tmp/th-6-shelf-selected.png" });
  await p1.locator(".th-card.sel").click(); await sleep(300);
  await p1.screenshot({ path: "/tmp/th-7-shelf-bought.png" });
  const c2 = await pick(pages[1], "מגדל 2"); await pages[1].locator(".th-card.sel").click();
  await pages[2].locator(".th-skip").click();
  await sleep(200); await pages[2].screenshot({ path: "/tmp/th-7b-shelf-skip.png" });
  console.log("bought:", c1, "/", c2);
  await p1.locator(".th-reveal").waitFor({ timeout: 12000 });
  await sleep(400);
  await p1.screenshot({ path: "/tmp/th-8-reveal.png" });
  await waitFor(p1, (d) => !d.paused, 6000);
  await sleep(1200);
  await p1.screenshot({ path: "/tmp/th-9-run2.png" });
  console.log("run2:", JSON.stringify(await dbg(p1)));
  // 💨 דאש (כפתור 1) תוך כדי ריצה
  await p1.keyboard.down("d"); await sleep(300); await p1.keyboard.press("1"); await sleep(120);
  await p1.screenshot({ path: "/tmp/th-10-dash.png" });
  await sleep(900); await p1.keyboard.up("d");
  await pages[1].screenshot({ path: "/tmp/th-11-other-view.png" });
  // ⏸ העצירה השנייה — ג'וקרים (לא קריטי לצילומים; אם התזמון המהיר פספס — ממשיכים)
  try {
    await waitFor(p1, (d) => d.paused && d.k === 2, 20000);
    await p1.locator(".th-shelf").waitFor({ timeout: 6000 }); await sleep(400);
    await p1.screenshot({ path: "/tmp/th-12-shelf2.png" });
    console.log("shelf2 p1:", (await p1.locator(".th-shelf").innerText()).replace(/\n+/g, " | ").slice(0, 300));
    const c3 = await pick(p1, "גשם"); if (c3 !== "none") await p1.locator(".th-card.sel").click();
    for (const p of pages.slice(1)) { const c = await pick(p); if (c !== "none") await p.locator(".th-card.sel").click().catch(() => {}); }
    console.log("bought2:", c3);
    await waitFor(p1, (d) => !d.paused, 14000);
  } catch (e) { console.log("pause2 skipped (fast-mode pacing):", String(e).split("\n")[0]); }
  await sleep(1500);
  await p1.screenshot({ path: "/tmp/th-13-run3.png" });
  console.log("run3:", JSON.stringify(await dbg(p1)));
  await sleep(6000);
  await pages[3].screenshot({ path: "/tmp/th-14-alarm.png" });
  await waitFor(p1, (d) => d.over, 40000);
  await sleep(600);
  await p1.screenshot({ path: "/tmp/th-15-horn.png" });
  for (const [i, p] of pages.entries()) console.log("final", i, JSON.stringify(await dbg(p)));
  await sleep(4000);
  await p1.screenshot({ path: "/tmp/th-16-ceremony.png" });
  await browser.close();
  console.log("errors:", errors.length ? errors.slice(0, 8) : "none");
  console.log("done");
} catch (e) { console.log("ERR", String(e).slice(0, 800)); } finally { srv.kill(); }
process.exit(0);
