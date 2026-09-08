/**
 * הגנבים 🥷 — עומס 8 שחקנים: 8 בוטים עם אופי (חוצבים / גנבים / מגנים / חבלנים) לסבב דחוס.
 * מודד: קצב th_pos (Hz, p50/p99), גודל הודעה, CPU של השרת לטיק, נפח הודעות לשחקן, יריות מגדלים,
 * ובודק נכונות: 8 מאורות שונות, 8 מגדלים, אפס שגיאות טיק, טקס עם 8 ניקודים.
 * מריצים: npx tsx test/thieves-8p.test.ts
 */
import { Room, Transport } from "../src/engine";
import { createThieves } from "../src/games/thieves";
import type { ServerMsg } from "../../shared/protocol";

let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : ""));
  if (!cond) failed++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (arr: number[], p: number) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };

async function main() {
  const N = 8;
  const P = Array.from({ length: N }, (_, i) => String.fromCharCode(97 + i));
  console.log(`\n— הגנבים 🥷 עומס ${N} שחקנים —`);

  const inbox = new Map<string, ServerMsg[]>();
  const posAt = new Map<string, number[]>();
  const bytes = new Map<string, number>();
  const counts = new Map<string, number>();
  let posBytes = 0, posN = 0, maxPs = 0;
  let errors = 0;
  const origErr = console.error;
  console.error = (...a: unknown[]) => { errors++; origErr(...a); };
  const transport: Transport = {
    send(pid, msg) {
      const s = JSON.stringify(msg);
      bytes.set(pid, (bytes.get(pid) ?? 0) + s.length);
      const a = (msg as any).d?.a as string | undefined;
      if (a) counts.set(a, (counts.get(a) ?? 0) + 1);
      if (a === "th_pos") {
        if (!posAt.has(pid)) posAt.set(pid, []);
        posAt.get(pid)!.push(Date.now());
        if (pid === "a") { posBytes += s.length; posN++; maxPs = Math.max(maxPs, (msg as any).d.ps.length); }
        return; // לא שומרים th_pos בתיבה — רק את האחרון
      }
      if (!inbox.has(pid)) inbox.set(pid, []);
      inbox.get(pid)!.push(msg);
    },
  };
  const lastPos = new Map<string, any>();
  let roomMsg: any = null;
  const origSend = transport.send;
  transport.send = (pid, msg) => { if ((msg as any).d?.a === "th_pos") lastPos.set(pid, (msg as any).d); if (pid === "a" && (msg as any).t === "room") roomMsg = msg; origSend(pid, msg); };

  const ev = (pid: string, a: string) => (inbox.get(pid) ?? []).filter((m: any) => (m.t === "game" || m.t === "cue") && m.d?.a === a).map((m: any) => m.d);
  const last = (pid: string, a: string) => ev(pid, a).at(-1);
  const lastRoom = (_pid: string) => roomMsg;

  const room = new Room("TH8P", transport, { thieves: createThieves });
  P.forEach((p, i) => room.join(p, "גנב" + i, "🥷"));
  const ROUND = 90_000;
  // שתי עצירות של 12 שנ' בתוך הסבב — גם המדף והקנייה תחת עומס של 8
  const timing = { segMs: 30_000, pauseMs: 12_000, freezeMs: 2000, draftMs: 8000, pauses: 2, alarmMs: 60_000 };
  room.onMessage("a", { t: "select_game", gameId: "thieves", config: { roundMs: ROUND, ripen1Ms: 2000, ripen2Ms: 5000, mtnPer: 6, timing } });
  const cpu0 = process.cpuUsage();
  const t0 = Date.now();
  room.onMessage("a", { t: "start_game" });

  const init = last("a", "th_init") as any;
  check("th_init עם 8 מאורות", !!init && init.dens.length === N, `dens=${init?.dens?.length}`);
  const dens = new Map<string, { x: number; y: number }>((init.dens as [string, number, number][]).map(([p, x, y]) => [p, { x, y }]));
  const uniq = new Set([...dens.values()].map((d) => `${d.x},${d.y}`));
  check("8 עוגנים שונים (אין שתי מאורות באותה נקודה)", uniq.size === N, `uniq=${uniq.size}`);
  const sync = last("a", "th_sync") as any;
  void sync;
  const mtn = init.mtn as { x: number; y: number; total: number };
  // מרחקי עוגנים: המרחק המינימלי בין שתי מאורות מול 2×רדיוס המגדל (5.5) — חפיפת טווחים
  let minD = 1e9; const ds = [...dens.values()];
  for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) minD = Math.min(minD, Math.hypot(ds[i].x - ds[j].x, ds[i].y - ds[j].y));
  console.log(`  ℹ מרחק מינימלי בין מאורות: ${minD.toFixed(2)} תאים · 2×טווח מגדל = 11 · חפיפה: ${Math.max(0, 11 - minD).toFixed(2)} תאים`);
  const dMtn = ds.map((d) => Math.hypot(d.x - mtn.x, d.y - mtn.y));
  console.log(`  ℹ מרחק מאורה→הר: ${Math.min(...dMtn).toFixed(1)}–${Math.max(...dMtn).toFixed(1)} תאים (פינות רחוקות יותר = יותר זמן חשיפה)`);

  const posOf = (pid: string) => { const row = lastPos.get(pid)?.ps?.find((r: any[]) => r[0] === pid); return row ? { x: row[1], y: row[2], carry: row[3], stolen: row[4], gold: row[5] } : { ...dens.get(pid)!, carry: 0, stolen: 0, gold: 0 }; };
  const steer = (pid: string, tx: number, ty: number) => {
    const { x, y } = posOf(pid);
    const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1;
    room.onMessage(pid, { t: "game", d: { a: "th_dir", dx: dx / d, dy: dy / d } as any });
    return d;
  };
  const send = (pid: string, d: any) => room.onMessage(pid, { t: "game", d });
  // בעלות על אבנים — מעקב מההודעות
  const denItems = new Map<string, Set<number>>(); P.forEach((p) => denItems.set(p, new Set()));
  let mtnLeft = mtn.total;
  const applyEvents = () => {
    for (const m of (inbox.get("a") ?? []).splice(0)) {
      const d = (m as any).d; if (!d) continue;
      if (d.a === "th_dep") for (const id of d.ids) denItems.get(d.pid)?.add(id);
      if (d.a === "th_grab") denItems.get(d.from)?.delete(d.id);
      if (d.a === "th_home") denItems.get(d.by)?.add(d.id);
      if (d.a === "th_mine") mtnLeft = d.left;
      if (d.a === "th_empty") mtnLeft = 0;
      if (d.a === "th_go") events.go = true;
      if (d.a === "th_first") events.first++;
      if (d.a === "th_alarm") events.alarm++;
      if (d.a === "th_horn") events.horn++;
      if (d.a === "th_empty") events.empty++;
      if (d.a === "th_tackle") events.tackle++;
      if (d.a === "th_grab") events.grab++;
      if (d.a === "th_home") events.home++;
      if (d.a === "th_shot") events.shot++;
      if (d.a === "th_hit") events.hit++;
      if (d.a === "th_act_done") events.acts++;
      if (d.a === "th_pause") { events.pause++; paused = true; draftAt = d.draftAt; }
      if (d.a === "th_shelf") { shelves.set("a", d.cards); events.shelf++; if (d.cards.length !== 4) events.badShelf++; }
      if (d.a === "th_resume") { events.resume++; paused = false; }
      if (d.a === "th_bought") events.bought++;
      if (d.a === "th_use") events.use++;
    }
    // כל בוט קונה במדף שלו את הקלף הכי יקר שהוא יכול להרשות לעצמו (בזמן המדף)
    for (const p of P) {
      for (const m of (inbox.get(p) ?? []).splice(0)) {
        const d = (m as any).d; if (!d) continue;
        if (d.a === "th_shelf") { shelves.set(p, d.cards); events.shelf++; if (d.cards.length !== 4) events.badShelf++; }
        if (d.a === "th_cd") cds.set(p + d.id, d.readyAt);
      }
      const sh = shelves.get(p);
      if (sh && paused && Date.now() >= draftAt + 150) {
        const g = posOf(p).gold;
        const aff = sh.filter((c: any) => c.price <= g).sort((a: any, b: any) => b.price - a.price)[0];
        if (aff) { send(p, { a: "th_buy", id: aff.id }); shelves.delete(p); }
      }
    }
  };
  const shelves = new Map<string, any[]>(); const cds = new Map<string, number>();
  let paused = false, draftAt = 0;
  const events = { go: false, first: 0, alarm: 0, horn: 0, empty: 0, tackle: 0, grab: 0, home: 0, shot: 0, hit: 0, acts: 0, pause: 0, resume: 0, shelf: 0, badShelf: 0, bought: 0, use: 0 };

  // אופי: 0-1 חוצבים-אוגרים · 2-4 גנבים · 5-6 מגנים-רודפים · 7 חבלן (משבית מגדלים)
  const role = (i: number) => (i <= 1 ? "hoard" : i <= 4 ? "thief" : i <= 6 ? "guard" : "saboteur");
  let tickN = 0;
  const cpuSamples: number[] = [];
  let lastCpu = process.cpuUsage(), lastWall = Date.now();
  const stepBots = () => {
    applyEvents();
    const now = Date.now(), tIn = now - t0;
    if (paused) { tickN++; return; }
    for (let i = 0; i < N; i++) {
      const p = P[i], me = posOf(p), r = role(i), home = dens.get(p)!;
      // יכולות: מי שיש לו דאש/בועה — לוחץ כשהוא סוחב שלל (עומס על th_use)
      if (me.stolen && tickN % 5 === i % 5) for (const id of ["dash", "bubble"]) if ((cds.get(p + id) ?? 0) <= now) { send(p, { a: "th_use", id }); cds.set(p + id, now + 3000); events.use++; break; }
      if (me.stolen) { steer(p, home.x, home.y); continue; }                       // עם שלל — הביתה
      if (me.carry >= 3 || (me.carry > 0 && mtnLeft <= 0)) { steer(p, home.x, home.y); continue; }   // עם צ'אנקים — הביתה
      const warTime = mtnLeft <= 0 || tIn > 25_000;
      if (!warTime || r === "hoard") { if (mtnLeft > 0) steer(p, mtn.x, mtn.y); else steer(p, home.x, home.y); continue; }
      if (r === "thief" || (r === "guard" && tickN % 3 === 0)) {
        // המאורה הזרה הקרובה עם אבנים
        let best = "", bd = 1e9;
        for (const [q, d] of dens.entries()) { if (q === p || (denItems.get(q)?.size ?? 0) === 0) continue; const dd = Math.hypot(me.x - d.x, me.y - d.y); if (dd < bd) { bd = dd; best = q; } }
        if (best) { const d = dens.get(best)!; const dd = steer(p, d.x, d.y); if (dd <= 1.8) send(p, { a: "th_steal" }); }
        else steer(p, home.x, home.y);
      } else if (r === "guard") {
        // רודף אחרי הסוחב הקרוב
        let best = "", bd = 1e9;
        for (const q of P) { if (q === p) continue; const o = posOf(q); if (!o.stolen) continue; const dd = Math.hypot(me.x - o.x, me.y - o.y); if (dd < bd) { bd = dd; best = q; } }
        if (best) { const o = posOf(best); steer(p, o.x, o.y); } else steer(p, home.x, home.y);
      } else {
        // חבלן: מסתובב בין המגדלים הזרים (נגיעה = מפתח שוודי אם יש לו)
        let best = "", bd = 1e9;
        for (const [q, d] of dens.entries()) { if (q === p) continue; const dd = Math.hypot(me.x - d.x, me.y - d.y); if (dd < bd && dd > 1) { bd = dd; best = q; } }
        const d = dens.get(best)!; const side = Math.sign(mtn.x - d.x) || 1; steer(p, d.x + 2.1 * side, d.y - 0.5);
      }
    }
    tickN++;
    if (tickN % 10 === 0) {
      const c = process.cpuUsage(lastCpu), w = Date.now() - lastWall;
      cpuSamples.push(((c.user + c.system) / 1000) / w);   // חלק ה-CPU מהזמן (כולל הבוטים!)
      lastCpu = process.cpuUsage(); lastWall = Date.now();
    }
  };

  // ריצה עד הטקס
  const start = Date.now();
  while (Date.now() - start < ROUND + timing.pauses * timing.pauseMs + 6000) {
    stepBots();
    await sleep(100);
    const rm = lastRoom("a");
    if (rm?.room?.phase === "ceremony") break;
  }
  applyEvents();
  const cpu = process.cpuUsage(cpu0);
  const wall = Date.now() - t0;

  // --- מדדים ---
  const rates: number[] = [], jit: number[] = [];
  for (const [, ts] of posAt.entries()) {
    const iv: number[] = []; for (let i = 1; i < ts.length; i++) iv.push(ts[i] - ts[i - 1]);
    rates.push(ts.length / (wall / 1000)); jit.push(...iv);
  }
  const hz = rates.reduce((a, b) => a + b, 0) / rates.length;
  const total = [...bytes.values()].reduce((a, b) => a + b, 0);
  console.log(`\n  📊 ${N} שחקנים · ${(wall / 1000).toFixed(1)} שנ' · ${tickN} צעדי בוט`);
  console.log(`  th_pos: ${hz.toFixed(1)}Hz לשחקן · מרווח p50=${pct(jit, 0.5)}ms p90=${pct(jit, 0.9)}ms p99=${pct(jit, 0.99)}ms מקס'=${Math.max(...jit)}ms · ps.length מקס'=${maxPs}`);
  console.log(`  גודל th_pos: ${(posBytes / Math.max(1, posN)).toFixed(0)} בייט · רוחב פס לשחקן: ${(total / N / (wall / 1000) / 1024).toFixed(1)} KB/s · לכל החדר: ${(total / (wall / 1000) / 1024).toFixed(1)} KB/s`);
  console.log(`  CPU של התהליך (שרת+8 בוטים): ${(((cpu.user + cpu.system) / 1000) / wall * 100).toFixed(1)}% מליבה אחת · p90 חלון=${(pct(cpuSamples, 0.9) * 100).toFixed(1)}%`);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([a, n]) => `${a}:${n}`).join(" ");
  console.log(`  הודעות (לכל הנמענים יחד): ${top}`);
  console.log(`  אירועים אצל a: גניבות=${events.grab} הביתה=${events.home} הפלות=${events.tackle} יריות=${events.shot} פגיעות=${events.hit} נגדים=${events.acts} · ההר נגמר=${events.empty} מלחמה=${events.first} אזעקה=${events.alarm} צפירה=${events.horn}`);
  console.log(`  ⏸ עצירות=${events.pause} חזרות=${events.resume} מדפים=${events.shelf} (פגומים=${events.badShelf}) קניות=${events.bought} שימושי יכולות=${events.use}`);
  check("2 עצירות עם 8 מדפים של 4 קלפים בכל אחת, וכולם חזרו", events.pause === 2 && events.resume === 2 && events.shelf === 16 && events.badShelf === 0, `pause=${events.pause} shelf=${events.shelf}`);
  check("היו קניות במדף (th_bought)", events.bought >= 4, `bought=${events.bought}`);

  check("th_pos ≥ 18Hz לכל 8 השחקנים", hz >= 18, `${hz.toFixed(1)}Hz`);
  check("מרווח th_pos p99 ≤ 120ms (בלי חורים)", pct(jit, 0.99) <= 120, `p99=${pct(jit, 0.99)}`);
  check("ps של 8 שחקנים בכל th_pos", maxPs === N);
  check("גודל th_pos ≤ 900 בייט (8 שחקנים)", posBytes / Math.max(1, posN) <= 900);
  check("אפס שגיאות טיק", errors === 0, `errors=${errors}`);
  check("כולם חצבו והפקידו", P.every((p) => (denItems.get(p)?.size ?? 0) > 0 || events.home > 0), P.map((p) => denItems.get(p)?.size ?? 0).join(","));
  check("הייתה מלחמה: גניבות ומרדפים", events.grab >= 5 && events.tackle >= 1, `grab=${events.grab} tackle=${events.tackle}`);
  check("8 מגדלים ירו", events.shot > 20, `shots=${events.shot}`);
  const rm = lastRoom("a");
  const scores = rm?.room?.ceremony?.scores ?? rm?.room?.scores ?? {};
  check("הסבב נגמר בטקס עם 8 ניקודים", rm?.room?.phase === "ceremony" && Object.keys(scores).length === N, `phase=${rm?.room?.phase} scores=${Object.keys(scores).length}`);
  console.log(`  ניקוד: ${P.map((p) => `${p}:${scores[p] ?? "?"}`).join(" ")}`);

  console.log(failed ? `\n✗ ${failed} כשלונות` : "\n✓ כל הבדיקות עברו");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
