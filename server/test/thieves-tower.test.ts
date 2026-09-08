/**
 * הגנבים 🥷 — המגדל וקלפי הבית (סבב 5). מריצים: npx tsx test/thieves-tower.test.ts
 *
 *  1. פולש שרץ ישר למאורה מוגנת ⇒ th_shot + th_hit, ודגל האטה ב-th_pos · 🔔 פעמון מוקדם ⇒ th_warn לבעלים.
 *  2. חימום: 8 יריות רצופות ⇒ th_tower(hot) ואז ≥3.9 שניות בלי יריות ⇒ th_tower(ok).
 *  3. זיגזג בטווח ⇒ החלוקים מפספסים (הנגד החינמי).
 *  4. 🔧 מפתח שוודי: נגיעה במגדל זר ⇒ th_tower(off, by) + th_act_done(disable, 0) + th_cd, בלי זהב; כבוי לא יורה; חוזר אחרי 8 שנ'.
 *  5. 🏯 מגדל אחורי: בגב מגדל רגיל אין יריות (שטח מת); בגב מגדל עם 'rear' — יש. 🗼 מגדל 2 יורה כל שנייה.
 *  6. 🧨 מוקש: הפולש הראשון עף ומהומם (th_stun mine + th_fx boom), פעם אחת.
 *  7. 🧱 גדר: זר זז בחצי מהירות במאורה; 🪜 סולם מבטל.
 *  8. 🍯 דבש: כניסה למאורה ⇒ th_stun(honey) פעם אחת לכניסה.
 * הקלפים ניתנים דרך config.startCards (וו לבדיקות) — בלי לעבור את מסך העצירה.
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

function makeTransport() {
  const inbox = new Map<string, ServerMsg[]>();
  const times: { pid: string; d: any; at: number }[] = [];
  const transport: Transport = {
    send(pid, msg) {
      if (!inbox.has(pid)) inbox.set(pid, []); inbox.get(pid)!.push(msg);
      const d = (msg as any).d; if (d?.a && (msg as any).t !== "room") times.push({ pid, d, at: Date.now() });
    },
  };
  const ev = (pid: string, a: string) => (inbox.get(pid) ?? []).filter((m: any) => (m.t === "game" || m.t === "cue") && m.d?.a === a).map((m: any) => m.d);
  const last = (pid: string, a: string) => ev(pid, a).at(-1);
  const since = (pid: string, a: string, t: number) => times.filter((x) => x.pid === pid && x.d.a === a && x.at >= t).map((x) => x.d);
  const timed = (pid: string, a: string) => times.filter((x) => x.pid === pid && x.d.a === a);
  return { transport, ev, last, since, timed };
}

async function main() {
  console.log("\n— הגנבים 🥷 המגדל וקלפי הבית (4 בוטים) —");
  const { transport, ev, last, since, timed } = makeTransport();
  const room = new Room("TOWR", transport, { thieves: createThieves });
  const P = ["a", "b", "c", "d"];
  P.forEach((p, i) => room.join(p, "גנב" + i, "🥷"));
  // בלי עצירות (הן נבדקות ב-thieves-pause.test.ts). הקלפים ניתנים מראש.
  const startCards = { a: ["bell"], b: ["t2", "rear", "fence", "mine"], c: ["ladder"], d: ["wrench", "honey"] };
  room.onMessage("a", { t: "select_game", gameId: "thieves", config: { roundMs: 130_000, mtnPer: 2, startGold: 500, timing: { pauses: 0 }, startCards } });
  room.onMessage("a", { t: "start_game" });
  const init = last("a", "th_init") as any;
  const dens = new Map<string, { x: number; y: number; back: number }>((init.dens as [string, number, number, number][]).map(([p, x, y, back]) => [p, { x, y, back }]));
  const A = dens.get("a")!, B = dens.get("b")!, D = dens.get("d")!;
  check("0. th_init: מגדל (רדיוס, קשת) וזווית הגב; בלי מחירי השבתה/הריסה", init.tower?.r > 0 && init.tower.arc > 0 && init.tower.disable === 0 && init.tower.destroy === 0 && typeof A.back === "number", `r=${init.tower?.r} back(a)=${A.back}`);
  const hc = last("a", "th_home_cards") as any;
  check("0א. th_home_cards נושא את קלפי הבית של כולם", !!hc && hc.cards.b?.includes("t2") && hc.cards.d?.includes("wrench"), hc ? JSON.stringify(hc.cards) : "אין");
  const R = init.tower.r as number;

  const posOf = (pid: string) => { const pos = last(pid, "th_pos") as any; const row = pos?.ps?.find((r: any[]) => r[0] === pid); return row ? { x: row[1], y: row[2], gold: row[5], slow: row[9] } : { x: dens.get(pid)!.x, y: dens.get(pid)!.y, gold: 0, slow: 0 }; };
  const dir = (pid: string, dx: number, dy: number) => room.onMessage(pid, { t: "game", d: { a: "th_dir", dx, dy } as any });
  const steer = (pid: string, tx: number, ty: number) => { const p = posOf(pid); const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1; if (d < 0.35) { dir(pid, 0, 0); return 0; } dir(pid, dx / d, dy / d); return d; };
  const goTo = async (pid: string, tx: number, ty: number, maxMs = 9000) => { for (let i = 0; i < maxMs / 100; i++) { if (steer(pid, tx, ty) === 0) return true; await sleep(100); } return false; };
  const towerSt = (den: string) => (ev("a", "th_tower").filter((m: any) => m.den === den).at(-1) as any)?.st ?? "ok";
  const waitTower = async (den: string, st: string, maxMs: number) => { for (let i = 0; i < maxMs / 100; i++) { if (towerSt(den) === st) return true; await sleep(100); } return false; };
  const towerPos = (den: { x: number; y: number }) => { const side = Math.sign(init.mtn.x - den.x) || 1; return { x: den.x + 2.1 * side, y: den.y - 0.5 }; };
  /** מהירות ממוצעת מ-th_pos רצופים (20Hz) בתוך רדיוס סביב נקודה, רק בדגימות בלי האטה */
  const speedInside = (pid: string, c: { x: number; y: number }, r: number, fromT: number) => {
    const rows = timed("a", "th_pos").filter((x) => x.at >= fromT).map((x) => ({ t: x.d.t as number, r: x.d.ps.find((q: any[]) => q[0] === pid) as any[] })).filter((x) => x.r);
    let dist = 0, tm = 0;
    for (let i = 1; i < rows.length; i++) {
      const p0 = rows[i - 1].r, p1 = rows[i].r, dt = (rows[i].t - rows[i - 1].t) / 1000;
      if (dt <= 0 || dt > 0.2 || p0[9] || p1[9]) continue;
      if (Math.hypot(p0[1] - c.x, p0[2] - c.y) > r || Math.hypot(p1[1] - c.x, p1[2] - c.y) > r) continue;
      dist += Math.hypot(p1[1] - p0[1], p1[2] - p0[2]); tm += dt;
    }
    return tm > 0.25 ? dist / tm : -1;
  };

  await sleep(1700);   // "צאו!"

  /* --- 1. פולש ישר: c רץ מ-[41,5] אל המאורה של a ב-[5,5] לאורך y=5 — מולו, לא בשטח המת --- */
  const t1 = Date.now();
  const spot = { x: A.x + 4, y: A.y };
  await goTo("c", A.x + 0.4, A.y, 12_000);
  await sleep(900);
  const shotsAtC = since("a", "th_shot", t1).filter((s: any) => s.den === "a" && s.tgt === "c");
  const hitsC = since("a", "th_hit", t1).filter((h: any) => h.den === "a" && h.pid === "c");
  check("1. המגדל יורה על פולש שנכנס לטווח (th_shot)", shotsAtC.length >= 1, `יריות=${shotsAtC.length}`);
  check("1א. th_shot נושא מוצא, יעד וזמן מעוף", shotsAtC.every((s: any) => typeof s.x0 === "number" && typeof s.x1 === "number" && s.ms >= 120 && s.ms <= 650));
  check("1ב. 🔔 פעמון מוקדם — a קיבל th_warn על c, ורק a", since("a", "th_warn", t1).some((w: any) => w.pid === "c") && !ev("b", "th_warn").length && !ev("c", "th_warn").length);
  check("2. פולש שרץ ישר נפגע (th_hit) — האטה והדף", hitsC.length >= 1, `פגיעות=${hitsC.length} מתוך ${shotsAtC.length}`);
  {
    const slowed = timed("a", "th_pos").some((x) => x.at >= t1 && x.d.ps.some((r: any[]) => r[0] === "c" && r[9] === 1));
    check("2א. th_pos מסמן את המואט (שדה 10)", slowed);
  }

  /* --- 2. חימום: c נשאר בטווח (חוזר לנקודה אחרי כל הדף) עד 8 יריות --- */
  const t2 = Date.now();
  let hot = false;
  for (let i = 0; i < 160; i++) { steer("c", spot.x, spot.y); if (towerSt("a") === "hot") { hot = true; break; } await sleep(100); }
  dir("c", 0, 0);
  const shotsHeat = since("a", "th_shot", t2).filter((s: any) => s.den === "a").length;
  check("3. חימום — אחרי 8 יריות המגדל נכנס לקירור (th_tower hot)", hot, `יריות מאז=${shotsHeat}`);
  const hotMsgAt = timed("a", "th_tower").filter((x) => x.d.den === "a" && x.d.st === "hot").at(-1)?.at ?? Date.now();
  const okAgain = await waitTower("a", "ok", 6000);
  // היריה השמינית משודרת באותו טיק של th_tower(hot) — אחריה חייב להיות שקט של ≥3.9 שנ'
  const gapOk = (() => { const ss = timed("a", "th_shot").filter((x) => x.d.den === "a" && x.at > hotMsgAt + 20); const first = ss[0]?.at; return first === undefined || first - hotMsgAt >= 3900; })();
  check("3א. בקירור אין יריות ≥3.9 שניות, ואז המגדל חוזר לפעול (ok)", okAgain && gapOk, `ok=${okAgain}`);
  await goTo("c", A.x + R + 4, A.y, 4000);

  /* --- 3. זיגזג: d עומד בטווח מלמטה ומחליף כיוון כל 150ms — החלוקים אמורים לפספס --- */
  await goTo("d", A.x, A.y + 4.2, 12_000);
  const t3 = Date.now();
  for (let i = 0; i < 26; i++) { dir("d", i % 2 ? 1 : -1, 0); await sleep(150); }
  dir("d", 0, 0);
  await sleep(700);
  const shotsZ = since("a", "th_shot", t3).filter((s: any) => s.den === "a" && s.tgt === "d").length;
  const hitsZ = since("a", "th_hit", t3).filter((h: any) => h.den === "a" && h.pid === "d").length;
  check("4. זיגזג בטווח — רוב החלוקים מפספסים (ניבוי קדימה = הנגד החינמי)", shotsZ >= 2 && hitsZ <= Math.floor(shotsZ / 2), `יריות=${shotsZ} פגיעות=${hitsZ}`);

  /* --- 4. 🔧 מפתח שוודי: d נוגע במגדל של a --- */
  await waitTower("a", "ok", 6000);
  const goldD = posOf("d").gold;
  const t4 = Date.now();
  const tpA = towerPos(A);
  await goTo("d", tpA.x, tpA.y + 0.3, 9000);
  await sleep(250);
  const off = since("a", "th_tower", t4).find((m: any) => m.den === "a" && m.st === "off") as any;
  const done = since("a", "th_act_done", t4).find((m: any) => m.kind === "disable") as any;
  const cd = since("d", "th_cd", t4).find((m: any) => m.id === "wrench") as any;
  if (process.env.TH_DBG) console.log("   [dbg] t4+", Date.now() - t4, "d=", JSON.stringify(posOf("d")), "towers:", timed("a", "th_tower").filter((x) => x.d.den === "a").map((x) => `${x.at - t4}:${x.d.st}${x.d.by ? "/" + x.d.by : ""}`).join(" "), "cd:", timed("d", "th_cd").map((x) => `${x.at - t4}:${x.d.id}`).join(" "));
  check("5. נגיעה במגדל זר מכבה אותו: th_tower(off, by=d) + th_act_done(disable, 0) + th_fx(wrench)", !!off && off.by === "d" && !!done && done.by === "d" && done.cost === 0 && since("a", "th_fx", t4).some((f: any) => f.k === "wrench"), `st=${towerSt("a")}`);
  check("5א. th_cd(wrench) לנוגע (20 שנ'), והזהב שלו לא ירד", !!cd && cd.readyAt > Date.now() + 15_000 && posOf("d").gold >= goldD - 1, `gold ${goldD} → ${posOf("d").gold}`);
  {
    const offAt = Date.now();
    for (let i = 0; i < 30; i++) { steer("d", A.x + 3.5, A.y); await sleep(100); }
    dir("d", 0, 0);
    const shotsOff = since("a", "th_shot", offAt).filter((s: any) => s.den === "a").length;
    check("5ב. מגדל כבוי לא יורה (3 שניות בטווח, אפס יריות)", shotsOff === 0, `יריות=${shotsOff}`);
    const backOn = await waitTower("a", "ok", 6500);
    check("5ג. אחרי 8 שניות המגדל הכבוי חוזר לפעול (th_tower ok)", backOn, `st=${towerSt("a")}`);
  }

  /* --- 5. שטח מת מול מגדל אחורי: d בגב של a (אין יריות) ואז בגב של b (rear ⇒ יש; t2 ⇒ כל שנייה) --- */
  const backSpot = (den: { x: number; y: number; back: number }, dist: number) => ({ x: Math.max(1, Math.min(init.w - 1, den.x + Math.cos(den.back) * dist)), y: Math.max(1, Math.min(init.h - 1, den.y + Math.sin(den.back) * dist)) });
  const bsA = backSpot(A, 3.6);
  await goTo("d", bsA.x, bsA.y, 12_000);
  dir("d", 0, 0);
  const t5 = Date.now();
  await sleep(2500);
  const shotsBackA = since("a", "th_shot", t5).filter((s: any) => s.den === "a" && s.tgt === "d").length;
  check("6. בגב של מגדל רגיל אין יריות (השטח המת)", shotsBackA === 0, `יריות=${shotsBackA}`);
  const bsB = backSpot(B, 3.6);
  const wp = { x: B.x + 3.5, y: B.y - 5.5 };          // נקודת ביניים — עוקפים את המאורה של b (המוקש עוד דרוך)
  await goTo("d", wp.x, wp.y, 16_000);
  await goTo("d", bsB.x, bsB.y, 6000);
  dir("d", 0, 0);
  const t5b = Date.now();
  await sleep(3200);
  const shotsBackB = timed("a", "th_shot").filter((x) => x.at >= t5b && x.d.den === "b" && x.d.tgt === "d");
  const gaps = shotsBackB.slice(1).map((s, i) => s.at - shotsBackB[i].at);
  check("6א. 🏯 מגדל אחורי — בגב של b יש יריות", shotsBackB.length >= 2, `יריות=${shotsBackB.length}`);
  check("6ב. 🗼 מגדל 2 — קצב ירי ~שנייה (במקום 1.5)", gaps.length >= 1 && gaps.every((gp) => gp >= 900 && gp <= 1250), `מרווחים=${gaps.join(",")}`);
  await goTo("d", wp.x, wp.y, 6000);
  await goTo("d", B.x - R - 4, B.y, 8000);
  dir("d", 0, 0);
  // c (סולם) מתמקם בינתיים משמאל למאורה של b — מחוץ לרדיוס המוקש
  const cReady = goTo("c", B.x - 3.5, B.y - 0.3, 20_000);
  await waitTower("b", "ok", 6000);

  /* --- 6. 🧨 מוקש: הפולש הראשון למאורה של b עף ומהומם --- */
  const t6 = Date.now();
  for (let i = 0; i < 90; i++) { if (since("a", "th_stun", t6).some((s: any) => s.pid === "d" && s.why === "mine")) break; steer("d", B.x + 0.3, B.y); await sleep(100); }
  dir("d", 0, 0);
  await sleep(150);
  const stunMine = since("a", "th_stun", t6).find((s: any) => s.pid === "d" && s.why === "mine") as any;
  const boom = since("a", "th_fx", t6).find((f: any) => f.k === "boom" && f.pid === "d");
  check("7. מוקש: th_stun(d, mine) + th_fx(boom)", !!stunMine && !!boom && stunMine.ms >= 900, stunMine ? `ms=${stunMine.ms}` : "אין");
  {
    const p = posOf("d");
    check("7א. הפולש הועף מהמאורה (≥2 תאים מהמרכז)", Math.hypot(p.x - B.x, p.y - B.y) >= 2, `dist=${Math.hypot(p.x - B.x, p.y - B.y).toFixed(1)}`);
  }
  await sleep(1100);
  await cReady;

  /* --- 7. 🧱 גדר: d (בלי סולם) חוצה את המאורה של b לאט; c (סולם) — לא --- */
  const t7 = Date.now();
  await goTo("d", B.x + 0.2, B.y + 0.2, 9000);     // בדרך d נוגע במגדל של b — המפתח השוודי מכבה אותו, ואז אין חלוקים שיאטו
  const stunAgain = since("a", "th_stun", t7).filter((s: any) => s.pid === "d" && s.why === "mine").length;
  check("7ב. המוקש מתפוצץ פעם אחת (לא נטען עד העצירה הבאה)", stunAgain === 0, `פיצוצים=${stunAgain}`);
  for (let i = 0; i < 30 && (posOf("d").slow || posOf("c").slow); i++) await sleep(100);   // ההאטה מהפגיעות פגה
  const t7x = Date.now();
  await Promise.all([goTo("d", B.x - 3.5, B.y, 6000), goTo("c", B.x + 3.5, B.y - 0.3, 6000)]);
  dir("d", 0, 0); dir("c", 0, 0);
  const vD = speedInside("d", B, 2.4, t7x), vC = speedInside("c", B, 2.4, t7x);
  check("8. גדר — זר זז בחצי מהירות בתוך המאורה (~3 במקום 6)", vD > 0 && vD < 4.2, `v(d)=${vD.toFixed(2)} מגדל=${towerSt("b")}`);
  check("8א. 🪜 סולם — c לא מואט בגדר (~6)", vC > 4.8, `v(c)=${vC.toFixed(2)}`);

  /* --- 8. 🍯 דבש: c נכנס למאורה של d — נדבק שנייה, פעם אחת לכניסה --- */
  await goTo("c", D.x + 4.5, D.y, 20_000);
  const t8 = Date.now();
  await goTo("c", D.x, D.y, 6000);
  dir("c", 0, 0);
  await sleep(2600);
  const honeyStuns = since("a", "th_stun", t8).filter((s: any) => s.pid === "c" && s.why === "honey");
  check("9. דבש: th_stun(c, honey) + th_fx(honey) בכניסה", honeyStuns.length >= 1 && since("a", "th_fx", t8).some((f: any) => f.k === "honey" && f.pid === "c"), `stuns=${honeyStuns.length}`);
  check("9א. נדבקים פעם אחת לכניסה (שהייה של 2.6 שנ' = עדיין אחת)", honeyStuns.length === 1, `stuns=${honeyStuns.length}`);
  {
    const firstStunAt = timed("a", "th_stun").find((x) => x.at >= t8 && x.d.pid === "c")?.at ?? 0;
    const frozen = firstStunAt ? timed("a", "th_pos").filter((x) => x.at >= firstStunAt + 100 && x.at <= firstStunAt + 800).map((x) => x.d.ps.find((q: any[]) => q[0] === "c")) : [];
    const moved = frozen.length >= 4 ? Math.hypot(frozen.at(-1)![1] - frozen[0][1], frozen.at(-1)![2] - frozen[0][2]) : 9;
    check("9ב. בזמן ההימום c לא זז (עד הדף אחד של חלוק)", moved < 1.0, `moved=${moved.toFixed(2)}`);
  }
  check("10. הסבב עדיין רץ ולא היו שגיאות טיק", ev("a", "th_pos").length > 100);

  console.log(failed ? `\n✗ ${failed} כשלונות\n` : "\n✓ כל בדיקות המגדל וקלפי הבית עברו\n");
  process.exit(failed ? 1 : 0);
}

main();
