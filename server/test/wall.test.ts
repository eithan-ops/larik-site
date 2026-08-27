/**
 * "החומה" — בדיקות רגרסיה לסבב התיקונים (27.8.2026).
 * מריצים: npx tsx test/wall.test.ts
 *
 * מכסה בדיוק את מה שנשבר:
 *  1. גיבור שנפל *חייב* לקום — גם אם הנפילה קרתה על גבול הגל (הבאג: טיימר תלוי-token).
 *  2. סוף גל = התאוששות (ריפוי) לכל מי ששרד.
 *  3. wl_mods נשלח בתחילת ריצה — בלעדיו "קצב אש"/"זריזות" לא מורגשים בלקוח.
 *  4. wl_heat נשלח למקלען.
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

async function testWall() {
  console.log("\n— החומה 🏰 —");
  const { transport, game } = makeTransport();
  const room = new Room("WALL", transport, { wall: createWall });
  const P = ["p1", "p2", "p3"];
  P.forEach((p, i) => room.join(p, "לוחם" + i, "🙂"));
  room.onMessage("p1", { t: "select_game", gameId: "wall", config: { difficulty: "normal" } });
  room.onMessage("p1", { t: "start_game" });
  check("מסך היערכות", game("p1", "wl_setup").length === 1);

  // p1 = חלוץ (יחטוף), p3 = מקלען (בשביל wl_heat)
  room.onMessage("p1", { t: "game", d: { a: "wl_role", role: "infantry" } });
  room.onMessage("p2", { t: "game", d: { a: "wl_role", role: "archer" } });
  room.onMessage("p3", { t: "game", d: { a: "wl_role", role: "mg" } });
  room.onMessage("p1", { t: "game", d: { a: "wl_go" } });

  check("wl_mods נשלח בתחילת ריצה", game("p1", "wl_mods").length >= 1);
  const m0 = game("p1", "wl_mods").at(-1)!;
  check("wl_mods עם ערכי בסיס", (m0 as any).rate === 1 && (m0 as any).speed === 1);

  await sleep(6000);
  check("wl_heat זורם למקלען", game("p3", "wl_heat").length >= 5);
  check("אויבים נולדו", game("p1", "wl_spawn").length > 0);

  // בוטים: הקשת והמקלען יורים על אויבים חיים (אותה נוסחת מסלול כמו השרת/הלקוח),
  // החלוץ לא נוגע — כך הוא חוטף ונופל, וזו בדיוק הבדיקה.
  const dead = new Set<number>();
  const posOf = (e: any, t: number): [number, number] => [
    e.x0 + e.wob * Math.sin((t - e.at) / 700),
    Math.min(1250 - 45, e.y0 + (e.speed * (t - e.at)) / 1000),
  ];
  const bot = setInterval(() => {
    for (const h of game("p1", "wl_hit") as any[]) if (h.hp <= 0) dead.add(h.id);
    const live = (game("p1", "wl_spawn") as any[]).filter((e) => !dead.has(e.id));
    if (!live.length) return;
    const e = live[Math.floor(Math.random() * live.length)];
    const [x, y] = posOf(e, room.now());
    if (y < 60) return;
    room.onMessage("p2", { t: "game", d: { a: "wl_shot", tx: Math.round(x), ty: Math.round(y), power: 1 } });
  }, 650);

  console.log("    ...מריצים גל שלם (≈40 שנ')");
  let cleared = false, hpBeforeClear = -1;
  for (let i = 0; i < 60 && !cleared; i++) {
    const prev = (game("p1", "wl_hero") as any[]).at(-1);
    await sleep(1000);
    cleared = game("p1", "wl_clear").length > 0 || game("p1", "wl_over").length > 0;
    if (cleared && prev) hpBeforeClear = prev.hp;
  }
  clearInterval(bot);

  const heroMsgs = game("p1", "wl_hero") as any[];
  const fellAt = heroMsgs.findIndex((m) => m.down === true);
  if (fellAt >= 0) {
    const revived = heroMsgs.slice(fellAt + 1).some((m) => m.down === false && m.hp > 0);
    check("גיבור שנפל קם בחזרה (ולא נתקע מת עד סוף הריצה)", revived);
  } else {
    console.log("  ~ הגיבור לא נפל בגל הזה — בדיקת ההקמה לא נבחנה");
  }

  if (game("p1", "wl_clear").length > 0) {
    const after = (game("p1", "wl_hero") as any[]).at(-1);
    const max = after?.max ?? 150;
    if (hpBeforeClear >= 0 && hpBeforeClear < max) {
      check("סוף גל = התאוששות (החלוץ מתרפא)", !!after && after.hp > hpBeforeClear);
    } else {
      console.log("  ~ החלוץ סיים את הגל בחיים מלאים — בדיקת הריפוי לא נבחנה");
    }
    const clear = game("p1", "wl_clear").at(-1) as any;
    const wallAfter = (game("p1", "wl_wall") as any[]).at(-1);
    check("wl_clear משדר את חיי החומה אחרי הריפוי", !!clear && !!wallAfter && wallAfter.hp >= clear.wallHp);
  } else {
    console.log("  ~ החומה נפלה לפני סוף הגל — בדיקות סוף-גל לא נבחנו");
  }

  room.dispose?.();
}

await testWall();
console.log(failed ? `\n${failed} בדיקות נכשלו ✗` : "\nהכול עבר ✓");
process.exit(failed ? 1 : 0);
