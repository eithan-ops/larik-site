/**
 * התהום 🕳️ — בדיקות לקלפי ההרחבה (3.9.2026): ריבית, כפפת אבן, מלטש, עין הנץ, נדיב, ג'וקר.
 * מריצים: npx tsx test/abyss-cards.test.ts   (טהור — רץ במילישניות)
 */
import { AB, abPerkMods, abNewSim, abAdvance, abWorld, abTiming, abConfig, AB_CARDS, AB_STACKABLE } from "../../shared/abyss";
import type { AbThrowObj } from "../../shared/abyss";

let failed = 0;
const check = (name: string, cond: boolean) => { console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name); if (!cond) failed++; };

console.log("\n— קלפי ההרחבה 🃏 —");

/* המודים */
const m0 = abPerkMods([]);
check("בסיס: בלי קלפים — הכול נייטרלי", m0.bankMul === 1 && m0.trapGuard === 0 && m0.gemMul === 1 && m0.nearBonus === 0 && m0.giveShare === 0 && m0.offerN === 3);
const m1 = abPerkMods(["interest", "interest", "gemcut", "gemcut", "trapguard", "hawk", "giver", "joker"]);
check("🏦 ריבית נערמת: 1.16 על שתיים", Math.abs(m1.bankMul - 1.16) < 1e-9);
check("🌟 מלטש נערם: ×2.25 על שתיים", Math.abs(m1.gemMul - 2.25) < 1e-9);
check("🧤 כפפה, 👁️ נץ, 🫂 נדיב, 🃏 ג'וקר", m1.trapGuard === 1 && m1.nearBonus === 3 && m1.giveShare === 0.10 && m1.offerN === 4);
check("🃏 ג'וקר לא עובר 4", abPerkMods(["joker", "joker", "joker"]).offerN === 4);
check("כל 14 הקלפים מוגדרים", AB_CARDS.length === 14 && new Set(AB_CARDS.map((c) => c.id)).size === 14);
check("הנערמים מסומנים", AB_STACKABLE.has("interest") && AB_STACKABLE.has("gemcut") && !AB_STACKABLE.has("joker"));

/* 🧤 כפפת אבן — המלכודת הראשונה נתפסת, השנייה תופסת */
{
  const w = abWorld("cards-v1", abTiming(abConfig({})));
  const mods = abPerkMods(["trapguard"]);
  const sim = abNewSim(0, mods.trapGuard);
  sim.x = 50;
  const trap = (id: number, d: number): AbThrowObj => ({ id, by: "z", target: "me", kind: "trap", d, x: 50, at: 0 });
  // מזיזים את הדמות בעומק פנוי משורות (עמוק בין מכשולים) — המלכודת בדיוק עלינו
  const out1 = abAdvance(w, sim, 0.5, 1.0, 1000, [trap(1, 1.0)], mods, 5000);
  check("המלכודת הראשונה נתפסה ביד (לא נתפסנו)", !!out1.trapCaught && !out1.hit && sim.alive);
  check("...ושווה 15 גבישים", sim.crystals >= 15);
  const out2 = abAdvance(w, sim, 1.2, 1.7, 1400, [trap(2, 1.7)], mods, 6000);
  check("המלכודת השנייה כן תופסת", !!out2.hit?.th && !out2.trapCaught);
}

/* 🌟 מלטש — אבן חן שווה כפול, גביש רגיל לא */
{
  const w = abWorld("cards-v1", abTiming(abConfig({})));
  // מאתרים אבן חן וגביש אמיתיים בפלחים הראשונים
  let gem, plain;
  for (let k = 0; k <= 5 && (!gem || !plain); k++) {
    const s = w.seg(k);
    gem = gem ?? s.cry.find((c) => c.v >= AB.GEM_VAL);
    plain = plain ?? s.cry.find((c) => c.v < AB.GEM_VAL);
  }
  const grab = (c: { d: number; x: number; v: number }, perks: string[]) => {
    const mods = abPerkMods(perks);
    const sim = abNewSim();
    sim.x = c.x;
    abAdvance(w, sim, c.d - 3, c.d + 3, 500, [], mods, 1000);
    return sim.crystals;
  };
  if (gem && plain) {
    check("🌟 אבן חן: פי 1.5 עם מלטש", grab(gem, ["gemcut"]) === Math.round(gem.v * 1.5));
    check("🌟 גביש רגיל: ללא שינוי", grab(plain, ["gemcut"]) === plain.v);
    check("🌟 + 💎 חמדנות מוכפלים יחד", grab(gem, ["gemcut", "greed"]) === Math.round(gem.v * 1.25 * 1.5));
  } else console.log("  ~ לא נמצאו גביש/אבן חן בפלח 0 — לא נבחן");
}

console.log(failed ? `\n${failed} בדיקות נכשלו ✗` : "\nכל בדיקות הקלפים עברו ✓");
process.exit(failed ? 1 : 0);
