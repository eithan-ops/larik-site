/** קצב הטיפוס של הבוט על הפיזיקה המשותפת — כיול קו המוות. npx tsx test/floors-bot.test.ts */
import { FL, flNewSim, flStep, flBaseMods, flNewBot, flBotInput, flMods } from "../../shared/floors";
for (const [label, mods] of [["בסיס", flBaseMods()], ["ספרינטר×2 + קפיצה גבוהה", flMods(["sprint", "sprint", "hijump"])]] as const) {
  for (const skill of [0.5, 0.8, 1]) {
    let tot = 0, falls = 0, combos = 0, bonus = 0;
    for (let r = 0; r < 5; r++) {
      const s = flNewSim(240); const b = flNewBot(skill); const seed = "seed" + r;
      let killY = -240; let minY = 0;
      for (let t = 0; t < 50 * 60; t++) {
        const inp = flBotInput(s, mods, seed, b, killY);
        flStep(s, inp, mods, seed, { comboEnd: (n, bo) => { combos++; bonus += bo; } });
        killY += (t < 1000 ? 20 : t < 2000 ? 40 : 60) / 50;
        if (s.y < killY - 60) { falls++; killY = s.y - 200; }
        minY = Math.min(minY, s.y - killY);
      }
      tot += s.maxFloor;
    }
    console.log(`${label} · מיומנות ${skill}: ממוצע קומה ${(tot / 5).toFixed(0)} בדקה · נפילות ${falls} · קומבואים ${combos} (בונוס ${bonus})`);
  }
}
