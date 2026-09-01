/**
 * "החומה" — בדיקות סבב 2+3 (1.9.2026): דלק, החלשת ההליקופטר, ותכונות עילית.
 * מריצים: npx tsx test/wall-round2.test.ts
 *
 *  ⛽ הדלק נשרף בטיסה מעל השדה, מתמלא ברצועת החומה, וחוסם פצצות כשהוא נגמר.
 *  💣 המטח מוגבל (n≤4) והרדיוס מוגבל (≤260) — התקרות שההליקופטר מעולם לא קיבל.
 *  🏠 גג מבוצר חסין לנזק מהטייס אבל לא מהקשת.
 *  🌀/💚 מגן קינטי חוסם פגיעות בודדות · מרפא מעלה חיים לנחיל (wl_hit עם by ריק).
 */
import { Room, Transport } from "../src/engine";
import { createWall } from "../src/games/wall";
import type { ServerMsg } from "../../shared/protocol";

let failed = 0;
function check(name: string, cond: boolean) {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name);
  if (!cond) failed++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeTransport() {
  const inbox = new Map<string, ServerMsg[]>();
  const transport: Transport = {
    send(pid, msg) {
      if (!inbox.has(pid)) inbox.set(pid, []);
      inbox.get(pid)!.push(msg);
    },
  };
  const game = (pid: string, a: string) =>
    (inbox.get(pid) ?? []).filter((m: any) => (m.t === "game" || m.t === "cue") && m.d?.a === a).map((m: any) => m.d);
  return { transport, game };
}

const posOf = (e: any, t: number): [number, number] => [
  e.x0 + e.wob * Math.sin((t - e.at) / 700),
  Math.min(1250 - 45, e.y0 + (e.speed * (t - e.at)) / 1000),
];

async function main() {
  console.log("\n— ⛽ דלק + תקרות + תכונות עילית —");
  const { transport, game } = makeTransport();
  const room = new Room("RND2", transport, { wall: createWall });
  const P = ["h1", "h2", "h3"]; // הליקופטר, קשת, מקלען
  P.forEach((p, i) => room.join(p, "ר" + i, "🙂"));
  room.onMessage("h1", { t: "select_game", gameId: "wall", config: { startWave: 12, seed: "round2-v1" } });
  room.onMessage("h1", { t: "start_game" });
  room.onMessage("h1", { t: "game", d: { a: "wl_role", role: "heli" } });
  room.onMessage("h2", { t: "game", d: { a: "wl_role", role: "archer" } });
  room.onMessage("h3", { t: "game", d: { a: "wl_role", role: "mg" } });
  room.onMessage("h1", { t: "game", d: { a: "wl_go" } });
  // מנקים את דראפטי הפתיחה (רמות פתיחה בגל 12) כדי שהדראפט לא יחסום כלום
  await sleep(600);
  for (const p of P) {
    for (let i = 0; i < 30; i++) {
      const lv = (game(p, "wl_levelup") as any[]).at(-1);
      if (!lv) break;
      const seen = (game(p, "wl_picked") as any[]).length;
      room.onMessage(p, { t: "game", d: { a: "wl_pick", cardId: lv.cards[0].id } });
      await sleep(30);
      if ((game(p, "wl_picked") as any[]).length === seen) break;
    }
  }
  await sleep(3400); // הגל מתחיל

  /* ---- שלב א': טיסה גבוהה — הדלק נשרף, פצצות נופלות ---- */
  room.onMessage("h1", { t: "game", d: { a: "wl_pos", x: 500, y: 350 } });
  const dead = new Set<number>();
  const bomber = setInterval(() => {
    for (const h of game("h1", "wl_hit") as any[]) if (h.hp <= 0) dead.add(h.id);
    // הטייס מרחף מעל צביר אויבים ומפציץ; הקשת והמקלען יורים על גג מבוצר אם יש
    const live = (game("h1", "wl_spawn") as any[]).filter((e) => !dead.has(e.id));
    const roof = live.find((e) => e.affix === "roof");
    const shieldE = live.find((e) => e.affix === "shield");
    const anyE = live[0];
    const target = roof ?? anyE;
    if (target) {
      const [x, y] = posOf(target, room.now());
      if (y > 60 && y < 1100) {
        room.onMessage("h1", { t: "game", d: { a: "wl_pos", x: Math.round(x), y: Math.round(Math.max(120, y - 40)) } });
        room.onMessage("h2", { t: "game", d: { a: "wl_shot", tx: Math.round(x), ty: Math.round(y), power: 1 } });
      }
    }
    const mgT = shieldE ?? anyE;
    if (mgT) {
      const [x, y] = posOf(mgT, room.now());
      if (y > 60) {
        room.onMessage("h3", { t: "game", d: { a: "wl_aim", x: Math.round(x), y: Math.round(y) } });
        room.onMessage("h3", { t: "game", d: { a: "wl_fire", on: true } });
      }
    }
    room.onMessage("h1", { t: "game", d: { a: "wl_bomb" } });
  }, 680);

  await sleep(20_000);
  const fuelsA = (game("h1", "wl_fuel") as any[]).map((f) => f.fuel);
  const dropsA = (game("h2", "wl_drop") as any[]).length;
  console.log(`    (דלק: ${fuelsA[0]} → ${fuelsA.at(-1)}, הטלות: ${dropsA})`);
  check("wl_fuel זורם לטייס", fuelsA.length > 20);
  check("הדלק נשרף בטיסה מעל השדה", fuelsA.length > 1 && fuelsA.at(-1)! < fuelsA[0] - 30);
  check("פצצות נופלות כשיש דלק", dropsA > 5);

  /* ---- שלב ב': ממשיכים באוויר עד שהדלק נגמר — הפצצות נעצרות ---- */
  await sleep(12_000);
  const fuelEmpty = (game("h1", "wl_fuel") as any[]).at(-1);
  const dropsAtEmpty = (game("h2", "wl_drop") as any[]).length;
  await sleep(4_000);
  const dropsAfterEmpty = (game("h2", "wl_drop") as any[]).length;
  console.log(`    (דלק עכשיו: ${fuelEmpty?.fuel}, הטלות בזמן ריק: ${dropsAfterEmpty - dropsAtEmpty})`);
  check("הדלק נגמר אחרי ~25 שניות באוויר", (fuelEmpty?.fuel ?? 99) <= 1);
  check("בלי דלק — אין פצצות", dropsAfterEmpty - dropsAtEmpty === 0);

  /* ---- שלב ג': חוזרים לרצועת החומה — הדלק מתמלא והפצצות חוזרות ---- */
  clearInterval(bomber);
  room.onMessage("h1", { t: "game", d: { a: "wl_pos", x: 500, y: 1150 } });
  await sleep(2_500);
  const fuelBack = (game("h1", "wl_fuel") as any[]).at(-1);
  console.log(`    (דלק אחרי תדלוק: ${fuelBack?.fuel}/${fuelBack?.max})`);
  check("ברצועת החומה הדלק מתמלא מהר", (fuelBack?.fuel ?? 0) > 50);

  /* ---- תקרות ההליקופטר ---- */
  const allDrops = game("h2", "wl_drop") as any[];
  const maxN = Math.max(...allDrops.map((d) => d.n));
  const maxR = Math.max(...allDrops.map((d) => d.r));
  console.log(`    (מטח מרבי: ${maxN} פצצות, רדיוס מרבי: ${maxR})`);
  check("תקרת המטח: לכל היותר 4 פצצות להטלה", maxN <= 4);
  check("תקרת הרדיוס: לכל היותר 260", maxR <= 260);

  /* ---- תכונות עילית ---- */
  const spawns = game("h1", "wl_spawn") as any[];
  const affixed = spawns.filter((s) => s.affix);
  const roofs = new Set(spawns.filter((s) => s.affix === "roof").map((s) => s.id));
  const shields = new Set(spawns.filter((s) => s.affix === "shield").map((s) => s.id));
  console.log(`    (עיליות: ${affixed.length}/${spawns.length} — 🏠${roofs.size} 💚${spawns.filter((s) => s.affix === "healer").length} 🌀${shields.size})`);
  check("תכונות עילית נולדות בגל 12", affixed.length >= 3);
  check("עילית מסומנת ב-wl_spawn (הלקוח יכול לצייר)", affixed.every((s) => ["roof", "healer", "shield"].includes(s.affix)));

  const hits = game("h1", "wl_hit") as any[];
  const roofBlockedByHeli = hits.some((h) => roofs.has(h.id) && h.blocked && h.by === "h1");
  const roofHurtByHeli = hits.some((h) => roofs.has(h.id) && !h.blocked && h.by === "h1" && h.hp >= 0);
  const roofHurtByArcher = hits.some((h) => roofs.has(h.id) && !h.blocked && h.by === "h2");
  if (roofs.size > 0) {
    check("🏠 גג מבוצר חוסם את הטייס (blocked)", roofBlockedByHeli);
    check("🏠 הטייס לא מוריד לו חיים בכלל", !roofHurtByHeli);
    check("🏠 אבל הקשת כן פוגעת בו", roofHurtByArcher);
  } else console.log("  ~ לא נולד גג מבוצר בריצה — לא נבחן");

  const shieldBlocked = hits.some((h) => shields.has(h.id) && h.blocked);
  const shieldBroken = hits.some((h) => shields.has(h.id) && !h.blocked && h.by === "h3");
  if (shields.size > 0) {
    check("🌀 מגן קינטי חוסם פגיעות בודדות", shieldBlocked);
    check("🌀 אש רציפה של המקלען שוברת אותו", shieldBroken);
  } else console.log("  ~ לא נולד מגן קינטי בריצה — לא נבחן");

  // 💚 ריפוי: wl_hit עם by ריק שבו החיים עלו לעומת הידוע הקודם
  const known = new Map<number, number>();
  for (const s of spawns) known.set(s.id, s.hp);
  let healSeen = false;
  for (const h of hits) {
    const prev = known.get(h.id);
    if (prev !== undefined && h.by === "" && h.hp > prev + 0.5) healSeen = true;
    known.set(h.id, h.hp);
  }
  if (spawns.some((s) => s.affix === "healer")) check("💚 המרפא באמת מרפא (wl_hit עם חיים שעולים)", healSeen);
  else console.log("  ~ לא נולד מרפא בריצה — לא נבחן");

  room.onMessage("h3", { t: "game", d: { a: "wl_fire", on: false } });
  console.log(failed ? `\n${failed} בדיקות נכשלו ✗` : "\nכל בדיקות סבב 2 עברו ✓");
  process.exit(failed ? 1 : 0);
}
main();
