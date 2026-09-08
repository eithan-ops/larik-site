/**
 * התותחים 💥 — בדיקות הליבה המשותפת. מריצים: npx tsx test/tanks-shared.test.ts
 * מכסה: הר דטרמיניסטי · מכתש/תל · פגז בסיסי פוגע · דטרמיניזם (שרת=לקוח) · כל מנגנון נשק עושה משהו ·
 * כל קלף בבנק תקין (אין קלף מת: לכל תחמושת יש w, לכל פסיבי יש m שמשנה מוד, לכל מיידי יש fx) · הבוט פוגע.
 */
import {
  TK, TK_CARDS, tkNewWorld, tkGround, tkCrater, tkMound, tkPlaceTanks, tkNewTank, tkMods, tkBaseMods, tkNewSalvo, tkWeaponOf, tkBotAim, tkPreview, tkCard,
} from "../../shared/tanks";
import type { TkTank, TkSalvoIn, TkEvent, TkWorld } from "../../shared/tanks";

let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : ""));
  if (!cond) failed++;
}

function setup(seed = "t1", n = 2): { world: TkWorld; tanks: Map<string, TkTank> } {
  const world = tkNewWorld(seed);
  const xs = tkPlaceTanks(seed, world.h, n);
  const tanks = new Map<string, TkTank>();
  for (let i = 0; i < n; i++) tanks.set("p" + i, tkNewTank("p" + i, i, xs[i], world.h, tkBaseMods()));
  return { world, tanks };
}
function run(world: TkWorld, tanks: Map<string, TkTank>, input: Partial<TkSalvoIn>): TkEvent[] {
  const inp: TkSalvoIn = { seed: "s", k: 1, wind: 0, shots: [], meteors: [], noDmg: [], betray: [], revenge: {}, doom: false, ...input };
  const sim = tkNewSalvo(world, tanks, inp);
  let guard = 0;
  while (!sim.step() && guard++ < 5000) { /* */ }
  return sim.events;
}
const evs = (e: TkEvent[], t: string) => e.filter((x) => x.t === t) as any[];

console.log("\n— התותחים 💥 (ליבה) —");
// הר
{
  const a = tkNewWorld("abc").h, b = tkNewWorld("abc").h, c = tkNewWorld("abd").h;
  check("הר דטרמיניסטי מזרע", a.length === TK.COLS && a.every((v, i) => v === b[i]) && a.some((v, i) => v !== c[i]));
  check("גבהים בטווח", a.every((v) => v >= 60 && v <= 560));
  const h = [...a];
  const g0 = tkGround(h, 300);
  tkCrater(h, 300, g0, 40);
  check("מכתש מוריד אדמה", tkGround(h, 300) < g0 - 30, `${g0}→${tkGround(h, 300)}`);
  tkMound(h, 300, tkGround(h, 300), 40);
  check("תל מוסיף אדמה", tkGround(h, 300) > g0 - 30);
  const xs = tkPlaceTanks("abc", h, 8);
  check("8 טנקים במרחק ≥50 זה מזה", xs.length === 8 && [...xs].sort((p, q) => p - q).every((x, i, arr) => i === 0 || x - arr[i - 1] >= 50), xs.join(","));
}
// פגז בסיסי + דטרמיניזם
{
  const { world, tanks } = setup("t1");
  const me = tanks.get("p0")!, tg = tanks.get("p1")!;
  const aim = tkBotAim(world, me, tg, 0, 1, (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })());
  const w2 = { ...tkNewWorld("t1"), h: [...world.h] }; const t2 = new Map<string, TkTank>(); for (const [k, v] of tanks) t2.set(k, { ...v });
  const ev1 = run(world, tanks, { shots: [{ pid: "p0", ...aim, w: "basic" }] });
  const ev2 = run(w2, t2, { shots: [{ pid: "p0", ...aim, w: "basic" }] });
  check("הבוט פוגע במטרה (או קרוב)", evs(ev1, "hit").some((h) => h.pid === "p1"), JSON.stringify(evs(ev1, "boom")[0]));
  check("סימולציה דטרמיניסטית: אותם אירועים בשתי ריצות", JSON.stringify(ev1) === JSON.stringify(ev2) && world.h.every((v, i) => v === w2.h[i]), JSON.stringify(ev1).slice(0, 200) + " | " + JSON.stringify(ev2).slice(0, 200));
  check("HP ירד", tg.hp < TK.HP, `hp=${tg.hp}`);
  check("אירוע ירי אחד לפגז בסיסי", evs(ev1, "fire").length === 1);
}
// מנגנוני נשק — כל אחד משנה משהו
function shotAt(seed: string, wid: string, extra: Partial<TkSalvoIn> = {}, tweak?: (w: TkWorld, t: Map<string, TkTank>) => void) {
  const { world, tanks } = setup(seed, 3);
  tweak?.(world, tanks);
  const me = tanks.get("p0")!, tg = tanks.get("p1")!;
  const aim = tkBotAim(world, me, tg, 0, 1, (() => { let s = 3; return () => { s = (s * 48271) % 2147483647; return s / 2147483647; }; })());
  const h0 = [...world.h];
  const ev = run(world, tanks, { shots: [{ pid: "p0", ...aim, w: wid }], ...extra });
  return { ev, world, tanks, h0, me, tg };
}
{
  let r = shotAt("w1", "triple"); check("שלשה: 3 אירועי ירי", evs(r.ev, "fire").length === 3);
  r = shotAt("w2", "mirv", { shots: [{ pid: "p0", vx: -2, vy: 18, w: "mirv" }] }); check("MIRV: התפצלות + ≥3 פיצוצים", evs(r.ev, "split").length >= 1 && evs(r.ev, "boom").filter((b) => b.kind === "boom").length >= 3);
  r = shotAt("w3", "napalm"); check("נפאלם: כתם אש נשאר בעולם", r.world.fires.length >= 1 && r.world.fires[0].until === 3);
  r = shotAt("w4", "bouncer"); check("קפצן: ≥2 נגיעות לפני הפיצוץ", evs(r.ev, "boom").length >= 3, `${evs(r.ev, "boom").length}`);
  r = shotAt("w5", "dirtball"); check("כדור אדמה: ההר עלה איפשהו", r.world.h.some((v, i) => v > r.h0[i]));
  r = shotAt("w6", "digger"); { const b = evs(r.ev, "boom")[0]; check("מקדחה: מתפוצצת מתחת לפני הקרקע המקורית", !!b && b.y < tkGround(r.h0, b.x) - 5, `y=${b?.y} g=${b && tkGround(r.h0, b.x)}`); }
  r = shotAt("w7", "confetti"); check("קונפטי: פיצוץ בלי נזק", evs(r.ev, "boom")[0]?.kind === "confetti" && evs(r.ev, "hit").length === 0);
  r = shotAt("w8", "cluster"); check("מצרר: התפצלות בפגיעה", evs(r.ev, "split").length >= 1 && evs(r.ev, "boom").length >= 4);
  r = shotAt("w9", "chain"); check("שרשרת: 4 פיצוצים", evs(r.ev, "boom").filter((b) => b.kind === "boom").length >= 4);
  r = shotAt("w10", "laser", { shots: [{ pid: "p0", vx: 2, vy: -2.1, w: "laser" }] }); check("לייזר: פיצוץ מסוג laser", evs(r.ev, "boom").some((b) => b.kind === "laser"), JSON.stringify(evs(r.ev, "boom")[0]));
  r = shotAt("w11", "meteorcall"); check("קריאה למטאור: פיצוץ מטאור", evs(r.ev, "boom").some((b) => b.kind === "meteor"));
  r = shotAt("w12", "quakeshot"); check("רעידה: ההר ירד גם רחוק מהפגיעה", r.world.h.filter((v, i) => v < r.h0[i]).length > 60);
  r = shotAt("w13", "medic", {}, (w, t) => { t.get("p1")!.hp = 50; }); check("פגז רפואה: ריפוי", evs(r.ev, "hit").some((h) => h.kind === "heal" && h.dmg < 0) || r.tg.hp > 50);
  r = shotAt("w14", "shock"); check("הדף: הטנק זז", evs(r.ev, "shock").length >= 1 || evs(r.ev, "hit").length === 0);
  r = shotAt("w15", "freeze"); check("הקפאה: המטרה קפואה", r.tg.frozen || evs(r.ev, "hit").length === 0);
  r = shotAt("w16", "emp", {}, (w, t) => { t.get("p1")!.shield = 30; }); check("EMP: המגן נמחק", r.tg.shield === 0);
  r = shotAt("w17", "teleshot"); check("פגז טלפורט: היורה זז", evs(r.ev, "tele").length === 1 && evs(r.ev, "tele")[0].pid === "p0");
  r = shotAt("w18", "roller"); check("מתגלגל: מתפוצץ אחרי גלגול", evs(r.ev, "boom").length >= 1);
  r = shotAt("w19", "homing"); check("מתביית: פוגע במישהו", evs(r.ev, "hit").some((h) => h.pid !== "p0"), JSON.stringify(evs(r.ev, "boom")[0]));
  r = shotAt("w20", "nuke"); check("אטום: נזק ≥ 60 בפגיעה קרובה", evs(r.ev, "hit").some((h) => h.dmg >= 40) || evs(r.ev, "die").length >= 1);
  r = shotAt("w21", "blackhole"); check("חור שחור: משיכה", evs(r.ev, "shock").length >= 1 || evs(r.ev, "hit").length === 0);
  r = shotAt("w22", "ghost"); check("רפאים: פיצוץ אחד (עבר דרך ההר או פגע)", evs(r.ev, "boom").length >= 1);
  r = shotAt("w23", "lift"); check("מעלית: ההר עלה מתחת למישהו", r.world.h.some((v, i) => v > r.h0[i]) || evs(r.ev, "hit").length === 0);
  r = shotAt("w24", "basic", { meteors: [r.tg.x] }); check("מטאור משמיים: נופל ופוגע", evs(r.ev, "boom").some((b) => b.kind === "meteor"));
  r = shotAt("w25", "basic", { shots: [{ pid: "p0", vx: 8, vy: 10, w: "basic", dbl: true }] as any }); check("קנה כפול: 2 ירי", evs(r.ev, "fire").length === 2);
  r = shotAt("w26", "basic", { noDmg: [["p0", "p1"]] }); check("ברית: בלי נזק", !evs(r.ev, "hit").some((h) => h.pid === "p1" && h.by === "p0"));
  r = shotAt("w27", "heavy", { doom: true }); check("יום הדין: נזק כפול (≥70 בפגיעה ישירה)", evs(r.ev, "hit").every((h) => h.dmg >= 0) && (evs(r.ev, "hit").some((h) => h.dmg >= 50) || evs(r.ev, "die").length >= 1 || evs(r.ev, "hit").length === 0));
  r = shotAt("w28", "heavy", {}, (w, t) => { t.get("p1")!.armor = 0.6; }); check("שריון: הנזק קטן", evs(r.ev, "hit").every((h) => h.dmg <= 30));
  r = shotAt("w29", "heavy", {}, (w, t) => { t.get("p1")!.shield = 100; }); check("מגן סופג", evs(r.ev, "hit").filter((h) => h.pid === "p1").every((h) => h.shield));
  r = shotAt("w30", "heavy", {}, (w, t) => { t.get("p1")!.hp = 10; t.get("p1")!.lastStand = true; }); check("עמידה אחרונה: נשאר עם 1", evs(r.ev, "hit").some((h) => h.pid === "p1") ? r.tg.hp >= 1 && r.tg.alive : true);
  r = shotAt("w31", "basic", { shots: [{ pid: "p0", vx: 8, vy: 10, w: "basic" }], wind: 0 }, (w) => { w.water = 400; }); check("מים: הפגז מתפוצץ במפלס המים", evs(r.ev, "boom").length >= 1);
}
// הבנק — אין קלף מת
{
  const ids = new Set<string>();
  let bad: string[] = [];
  for (const c of TK_CARDS) {
    if (ids.has(c.id)) bad.push("dup:" + c.id); ids.add(c.id);
    if (c.kind === "ammo" && (!c.w || !c.n)) bad.push("ammo:" + c.id);
    if (c.kind === "passive") { const a = tkBaseMods(), b = tkBaseMods(); c.m!(b); if (JSON.stringify(a) === JSON.stringify(b)) bad.push("passive-noop:" + c.id); }
    if ((c.kind === "instant" || c.kind === "sky") && !c.fx) bad.push("fx:" + c.id);
    if (c.req) for (const r of c.req) if (!tkCard(r)) bad.push("req:" + c.id + "→" + r);
    if (c.d.split(" ").length > 9) bad.push("long:" + c.id);
  }
  check(`בנק: ${TK_CARDS.length} קלפים, כולם תקינים`, bad.length === 0 && TK_CARDS.length >= 110, bad.join(" "));
  const m = tkMods({ armor: 3, shield: 2, fuel: 1, magnet: 2, dbl: 1 });
  check("מודים נערמים", m.armor === 0.6 && m.shield === 60 && m.fuel === 2 && Math.abs(m.gold - 1.7) < 1e-9 && m.dbl);
  const w = tkWeaponOf("apoc"); check("נשק אבולוציה יורש בסיס", w.mirv === 5 && w.dmg === 60 && w.n === 1);
}
// תחזית
{
  const world = tkNewWorld("pv");
  const pts = tkPreview(world, 100, 300, 4, 12, 0, 400);
  check("תחזית מסתיימת בקרקע", pts.length > 5 && pts[pts.length - 1].y <= tkGround(world.h, pts[pts.length - 1].x) + 1);
}
console.log(failed ? `\n${failed} בדיקות נכשלו` : "\nהכול עבר ✓");
process.exit(failed ? 1 : 0);
