/**
 * התותחים 💥 — פלייטסט שרת עם 4 בוטים. מריצים: TK_FAST=1 npx tsx test/tanks.test.ts
 * מכסה: בחירת צבע → tk_go → tk_battle (הר + טנקים) → tk_aim → כיוון (בוטים) + מוכן → tk_salvo כ-cue עם הקלטים →
 * tk_result עם HP/זהב → tk_garage → קנייה (תחמושת/פסיבי/מיידי עם מטרה/עולם) → קלף שמיים למת → סיום קרב → tk_over → ctx.end.
 */
process.env.TK_FAST = process.env.TK_FAST || "1";
import { Room, Transport } from "../src/engine";
import { createTanks } from "../src/games/tanks";
import type { ServerMsg } from "../../shared/protocol";
import { TK, tkNewWorld, tkBotAim, tkGround } from "../../shared/tanks";
import type { TkTank, TkWorld } from "../../shared/tanks";

let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : ""));
  if (!cond) failed++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(f: () => boolean, ms = 8000) { const t0 = Date.now(); while (!f() && Date.now() - t0 < ms) await sleep(30); return f(); }

function makeTransport() {
  const inbox = new Map<string, ServerMsg[]>();
  const transport: Transport = { send(pid, msg) { if (!inbox.has(pid)) inbox.set(pid, []); inbox.get(pid)!.push(msg); } };
  const ev = (pid: string, a: string) => (inbox.get(pid) ?? []).filter((m: any) => (m.t === "game" || m.t === "cue") && m.d?.a === a).map((m: any) => m.d);
  const cues = (pid: string, a: string) => (inbox.get(pid) ?? []).filter((m: any) => m.t === "cue" && m.d?.a === a);
  const last = (pid: string, a: string) => ev(pid, a).at(-1);
  const lastRoom = (pid: string) => (inbox.get(pid) ?? []).filter((m: any) => m.t === "room").at(-1) as any;
  return { transport, ev, cues, last, lastRoom };
}

async function main() {
  console.log("\n— התותחים 💥 (שרת, 4 בוטים) —");
  const { transport, ev, cues, last, lastRoom } = makeTransport();
  const room = new Room("TNKS", transport, { tanks: createTanks });
  const P = ["a", "b", "c", "d"];
  P.forEach((p, i) => room.join(p, "תותחן" + i, "💥"));
  room.onMessage("a", { t: "select_game", gameId: "tanks", config: { battles: 1, maxSalvos: 4 } });
  room.onMessage("a", { t: "start_game" });
  const g = (pid: string, d: any) => room.onMessage(pid, { t: "game", d });

  check("שלב בחירת צבע נפתח", !!last("a", "tk_pickphase"));
  g("a", { a: "tk_char", c: 3 }); g("b", { a: "tk_char", c: 3 }); g("b", { a: "tk_char", c: 0 }); g("c", { a: "tk_char", c: 5 }); g("d", { a: "tk_char", c: 7 });
  check("צבע תפוס לא נבחר פעמיים", last("a", "tk_pickphase").taken.b === 0);
  await waitFor(() => !!last("a", "tk_go"), 3000);
  const go = last("a", "tk_go");
  check("tk_go עם צבעים לכולם", !!go && Object.keys(go.chars).length === 4 && new Set(Object.values(go.chars)).size === 4, JSON.stringify(go?.chars));
  await waitFor(() => !!last("a", "tk_battle"), 3000);
  const bt = last("a", "tk_battle");
  check("tk_battle: הר של 360 עמודות, 4 טנקים על הקרקע, רוח", !!bt && bt.h.length === TK.COLS && bt.tanks.length === 4 && bt.tanks.every((t: any) => Math.abs(t.y - tkGround(bt.h, t.x)) < 1) && typeof bt.wind === "number");
  // מצב מקומי לבוטים
  const world: TkWorld = { ...tkNewWorld(bt.seed), h: [...bt.h] };
  const tanks = new Map<string, TkTank>();
  const applyTanks = (list: any[]) => { for (const w of list) tanks.set(w.pid, { ...(tanks.get(w.pid) ?? ({} as TkTank)), pid: w.pid, c: w.c, x: w.x, y: w.y, hp: w.hp, hpMax: w.hpMax, shield: w.sh, alive: w.alive } as TkTank); };
  applyTanks(bt.tanks);
  await waitFor(() => !!last("a", "tk_aim"), 4000);
  const aim1 = last("a", "tk_aim");
  check("tk_aim k=1 עם until", !!aim1 && aim1.k === 1 && aim1.until > Date.now() - 100);
  check("tk_you לכל שחקן עם 120 זהב", P.every((p) => last(p, "tk_you")?.gold === TK.GOLD_START));
  // בוטים מכוונים; a יורה ב-b, כולם מוכנים → סלבו מוקדם
  for (const p of P) {
    const me = tanks.get(p)!; const tg = tanks.get(P[(P.indexOf(p) + 1) % 4])!;
    const v = tkBotAim(world, me, tg, aim1.wind, 1, Math.random);
    g(p, { a: "tk_aimset", ...v, w: "basic" });
    g(p, { a: "tk_ready" });
  }
  g("a", { a: "tk_movereq", dir: 1 });
  check("תנועה בלי דלק לא עובדת", ev("a", "tk_move").length === 0);
  await waitFor(() => cues("a", "tk_salvo").length === 1, 4000);
  const sv = last("a", "tk_salvo");
  check("tk_salvo הגיע כ-cue עם 4 יריות ותמונת מצב", cues("a", "tk_salvo").length === 1 && sv.input.shots.length === 4 && sv.tanks.length === 4 && sv.ticks > 30, `ticks=${sv?.ticks}`);
  check("הסלבו התחיל מוקדם (כולם מוכנים)", Date.now() < aim1.until, `${aim1.until - Date.now()}ms לפני הזמן`);
  await waitFor(() => !!last("a", "tk_result"), 15000);
  const rs = last("a", "tk_result");
  check("tk_result: HP, זהב ומפת גבהים", !!rs && rs.tanks.length === 4 && rs.h.length === TK.COLS && Object.keys(rs.gold).length === 4);
  const hurt = rs.tanks.filter((t: any) => t.hp < t.hpMax).length;
  const earned = Object.values(rs.earned as Record<string, number>).filter((e) => e > TK.GOLD_SURVIVE).length;
  check("מישהו נפגע ומישהו הרוויח זהב מנזק", hurt >= 1 && earned >= 1, `נפגעו ${hurt}, הרוויחו ${earned}: ${JSON.stringify(rs.earned)}`);
  check("שרידות +15", Object.values(rs.earned as Record<string, number>).every((e) => e >= TK.GOLD_SURVIVE) || rs.tanks.some((t: any) => !t.alive));
  applyTanks(rs.tanks); world.h = [...rs.h];
  // המוסך
  await waitFor(() => !!last("a", "tk_garage"), 3000);
  const gr = last("a", "tk_garage");
  check("tk_garage: 6 קלפים, ≥2 תחמושת, 1 הגנה", !!gr && gr.cards.length === 6 && gr.cards.filter((c: any) => c.cat === "W").length >= 2 && gr.cards.some((c: any) => c.cat === "D"), gr?.cards.map((c: any) => c.id).join(","));
  const cheap = gr.cards.filter((c: any) => c.price <= gr.gold).sort((x: any, y: any) => x.price - y.price);
  const ammo = cheap.find((c: any) => c.kind === "ammo"), pas = cheap.find((c: any) => c.kind === "passive");
  if (ammo) { g("a", { a: "tk_buy", id: ammo.id }); check(`קניית תחמושת ${ammo.id}: תחמושת + זהב ירד + פיד לכולם`, (last("a", "tk_you")?.ammo[ammo.id] ?? 0) >= 1 && last("a", "tk_you").gold === gr.gold - ammo.price && last("b", "tk_bought")?.pid === "a"); }
  if (pas && last("a", "tk_you").gold >= pas.price) { const before = last("a", "tk_you").gold; g("a", { a: "tk_buy", id: pas.id }); check(`קניית פסיבי ${pas.id}: owned`, (last("a", "tk_you")?.owned[pas.id] ?? 0) === 1 && last("a", "tk_you").gold === before - pas.price); }
  g("a", { a: "tk_buy", id: "nuke" });
  check("קלף שלא הוצע לא נקנה", !last("a", "tk_you").ammo?.nuke);
  const grb = last("b", "tk_garage");
  const social = grb.cards.find((c: any) => c.tg === "player" && c.price <= grb.gold);
  if (social) { g("b", { a: "tk_buy", id: social.id, target: "c" }); check(`קלף חברתי ${social.id} עם מטרה: פיד`, last("a", "tk_bought")?.pid === "b" && !!last("a", "tk_bought").tx); }
  const grc = last("c", "tk_garage");
  const worldCard = grc.cards.find((c: any) => c.cat === "X" && c.price <= grc.gold);
  if (worldCard) { g("c", { a: "tk_buy", id: worldCard.id }); check(`קלף עולם ${worldCard.id}: פיד`, last("a", "tk_bought")?.pid === "c"); }
  for (const p of P) g(p, { a: "tk_ready" });
  await waitFor(() => (last("a", "tk_aim")?.k ?? 0) === 2, 4000);
  check("סיבוב 2 נפתח (מוקדם — כולם סיימו במוסך)", last("a", "tk_aim")?.k === 2);
  // ממשיכים עד סוף הקרב: הבוטים יורים בכל סיבוב, המתים בוחרים קלף שמיים
  for (let round = 2; round <= 6; round++) {
    const aim = last("a", "tk_aim"); if (!aim || aim.k !== round) break;
    const cur = last("a", "tk_result"); if (cur) { applyTanks(cur.tanks); world.h = [...cur.h]; }
    for (const p of P) {
      const me = tanks.get(p)!;
      if (!me.alive) { const sky = last(p, "tk_sky"); if (sky && sky.k === round) { const c = sky.cards[0]; const tgt = P.find((q) => q !== p && tanks.get(q)!.alive); g(p, { a: "tk_skypick", id: c.id, target: c.tg === "player" ? tgt : undefined, x: 300 }); } continue; }
      const tg = P.map((q) => tanks.get(q)!).filter((t) => t.pid !== p && t.alive)[0]; if (!tg) continue;
      g(p, { a: "tk_aimset", ...tkBotAim(world, me, tg, aim.wind, 1, Math.random), w: last(p, "tk_you")?.ammo && Object.keys(last(p, "tk_you").ammo)[0] || "basic" });
      g(p, { a: "tk_ready" });
    }
    const ok = await waitFor(() => (last("a", "tk_result")?.k ?? 0) === round || !!last("a", "tk_over"), 20000);
    if (!ok) { check(`סיבוב ${round} הסתיים`, false); break; }
    if (last("a", "tk_battleover") || last("a", "tk_over")) break;
    await waitFor(() => (last("a", "tk_garage")?.k ?? 0) === round, 3000);
    for (const p of P) g(p, { a: "tk_ready" });
    await waitFor(() => (last("a", "tk_aim")?.k ?? 0) === round + 1, 4000);
  }
  await waitFor(() => !!last("a", "tk_over"), 30000);
  const over = last("a", "tk_over");
  check("tk_battleover + tk_over עם שורות ותארים", !!last("a", "tk_battleover") && !!over && over.rows.length === 4 && over.titles.length >= 1, JSON.stringify(over?.titles));
  const skyPicks = ev("a", "tk_salvo").flatMap((s: any) => s.pre);
  const anyDead = ev("a", "tk_result").some((r: any) => r.tanks.some((t: any) => !t.alive));
  check("אם מישהו מת — קלף שמיים נכנס לסלבו", !anyDead || skyPicks.length >= 1 || ev("a", "tk_salvo").some((s: any) => s.input.meteors.length || (s.input.dirts ?? []).length), JSON.stringify(skyPicks));
  await waitFor(() => ["ended", "lobby", "ceremony"].includes(lastRoom("a")?.room?.phase), 4000);
  check("החדר נסגר בטקס", ["ended", "lobby", "ceremony"].includes(lastRoom("a")?.room?.phase), lastRoom("a")?.room?.phase);
  console.log(failed ? `\n${failed} בדיקות נכשלו` : "\nהכול עבר ✓");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
