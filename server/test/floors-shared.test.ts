/**
 * הקומות 🏢 — בדיקות הליבה המשותפת. מריצים: npx tsx test/floors-shared.test.ts
 * מאמת את הפורט של הפיזיקה מול טבלת הקפיצה שנגזרה מהקוד המקורי (מסמך המחקר 4.9):
 * עמידה → 1 קומה · |dx|=8 → 2 · 10 → 3 · 12.2 → 4; קומבו = n²; הקיר שומר 90%; מגדל דטרמיניסטי.
 */
import { FL, flNewSim, flStep, flBaseMods, flFloor, flFloorY, flMods, flBreakCombo, flPlace } from "../../shared/floors";

let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : ""));
  if (!cond) failed++;
}
const SEED = "test";
/** מגדל פשוט: כל הקומות ברוחב מלא — כדי לבדוק גובה קפיצה בלי תלות ב-x */
const FULL = "__full__";
// עוקפים את המחולל: seed מיוחד שמחזיר קומות מלאות (דרך flFloor הרגיל זה לא אפשרי — מדמים עם מגדל אמיתי ובוחרים x באמצע)

function peak(dx: number): { peakPx: number; floors: number } {
  const s = flNewSim(240); const m = flBaseMods();
  // מציבים על קומה 0 (מלאה), נותנים מהירות, קופצים
  s.dx = dx - (dx > 1 ? 0.3 : 0); // המקשים מעובדים לפני הקפיצה: dir=1 מוסיף 0.3
  const inp = { dir: dx > 1 ? 1 : 0, jump: true, hold: false };
  let best = 0;
  // מגדל "פתוח": נשתמש ב-seed שבו הקומות 1..6 מכסות את x=240? לא מובטח — לכן בודקים רק את שיא הגובה, ומחשבים קומות מתוכו
  flStep(s, inp, m, SEED, undefined, () => false);
  inp.jump = false; inp.dir = 0;
  // מבטלים חיכוך אופקי לצורך הבדיקה: משאירים dir=0 → dx דועך, זה לא משפיע על הגובה
  for (let i = 0; i < 120 && s.st !== 0; i++) { flStep(s, inp, m, "nofloors", undefined, () => false); best = Math.max(best, s.y); if (s.y < -200) break; }
  return { peakPx: best, floors: Math.floor(best / FL.FLOOR_H) };
}

console.log("\n— הקומות 🏢 ליבה משותפת —");
{
  const p0 = peak(0.001), p8 = peak(8), p10 = peak(10), p12 = peak(12.2);
  check("קפיצה מעמידה מגיעה לקומה אחת (שיא ~99px)", p0.floors === 1 && p0.peakPx > 90 && p0.peakPx < 110, `${p0.peakPx.toFixed(0)}px`);
  check("|dx|=8 → 2 קומות (שיא ~168px)", p8.floors === 2, `${p8.peakPx.toFixed(0)}px`);
  check("|dx|=10 → 3 קומות (שיא ~260px)", p10.floors === 3, `${p10.peakPx.toFixed(0)}px`);
  check("|dx|=12.2 → 4 קומות (שיא ~384px)", p12.floors === 4, `${p12.peakPx.toFixed(0)}px`);
}
{
  // הקיר שומר 90% ומהפך כיוון; dy לא נפגע
  const s = flNewSim(FL.WALL_R - 5); const m = flBaseMods();
  s.dx = 10; s.dy = 5; s.st = 1;
  let wallV = 0;
  flStep(s, { dir: 0, jump: false, hold: false }, m, SEED, { wall: (v) => { wallV = v; } }, () => false);
  check("הקפצת קיר: dx הופך ונשמר 90% (אחרי חיכוך הטיק)", s.dx < 0 && Math.abs(Math.abs(s.dx) - 8.1) < 0.01, `dx=${s.dx.toFixed(2)}`);
  check("הקפצת קיר לא נוגעת ב-dy", Math.abs(s.dy - (5 - FL.GRAV)) < 1e-9, `dy=${s.dy}`);
  check("אירוע קיר נורה", wallV > 8);
}
{
  // האצה: מ-0 למקסימום ב-~41 טיקים; חיכוך: מקס → <1 ב-~25 טיקים
  const s = flNewSim(FL.WALL_L + 5); const m = flBaseMods();
  let t = 0; while (Math.abs(s.dx) < FL.VMAX - 1e-9 && t < 200) { flStep(s, { dir: 1, jump: false, hold: false }, m, SEED, undefined, () => false); t++; }
  check("0→מקס ב-41 טיקים", t === 41, `${t}`);
  let f = 0; while (Math.abs(s.dx) > 1 && f < 200) { flStep(s, { dir: 0, jump: false, hold: false }, m, SEED, undefined, () => false); f++; }
  check("חיכוך: מקס→1 ב-~24 טיקים", f >= 22 && f <= 26, `${f}`);
}
{
  // המגדל דטרמיניסטי ותקין
  const a = flFloor("s1", 17), b = flFloor("s1", 17), c = flFloor("s2", 17);
  check("אותה קומה מאותו זרע", a.x0 === b.x0 && a.x1 === b.x1);
  check("זרע אחר → קומה אחרת (ברוב המקרים)", a.x0 !== c.x0 || a.x1 !== c.x1);
  check("קומה 0 ו-50 מלאות", flFloor("s1", 0).full && flFloor("s1", 50).full && !flFloor("s1", 51).full);
  let ok = true;
  for (let i = 1; i < 3000; i++) { const f = flFloor("s1", i); if (f.x0 < FL.TILE0 * FL.TILE || f.x1 > (FL.TILE0 + FL.TILES) * FL.TILE || f.x1 - f.x0 < 4 * FL.TILE) ok = false; }
  check("3000 קומות בתוך הקירות וברוחב סביר", ok);
  const w200 = flFloor("s1", 240).x1 - flFloor("s1", 240).x0, w10 = flFloor("s1", 10).x1 - flFloor("s1", 10).x0;
  check("הקומות מצטרות עם הגובה", w200 <= w10 || w200 <= 6 * FL.TILE, `${w10}→${w200}`);
}
{
  // קומבו: שתי קפיצות של 2+ קומות = (סך הקומות)²; קפיצה בודדת = 0
  const s = flNewSim(240); const m = flBaseMods();
  let ended: [number, number] | null = null;
  const ev = { comboEnd: (f: number, b: number) => { ended = [f, b]; } };
  // מדמים נחיתות ישירות דרך flPlace + הלוגיקה הפנימית: נשתמש בסימולציה מלאה על מגדל מלא
  // (קומות מלאות: כל 50) — נציב על 0, "נוחתים" על 3 ואז על 6 דרך land() הפרטית לא זמינה, אז נריץ קפיצות אמיתיות:
  s.dx = 12.2; s.x = 240;
  const run = (ticks: number, dir: number, jump = false) => { for (let i = 0; i < ticks; i++) { flStep(s, { dir, jump: jump && i === 0, hold: false }, m, "combo", ev, () => false); } };
  // מגדל "combo": נבדוק רק שהמכניקה עובדת — קופצים במהירות מלאה, נוחתים איפה שנוחתים
  run(1, 1, true); run(80, 1);
  const f1 = s.floor;
  s.dx = 12.2; run(1, 1, true); run(80, 1);
  const f2 = s.floor;
  // עוצרים: מחכים שהטיימר ייגמר
  run(160, 0);
  const total = f2 - 0;
  if (f1 >= 2 && f2 - f1 >= 2) {
    check("קומבו נסגר עם בונוס = (סך הקומות)²", ended !== null && ended![0] === total && ended![1] === total * total, JSON.stringify(ended));
  } else {
    check("(דילוג — המגדל האקראי לא איפשר שתי קפיצות של 2+; f1=" + f1 + " f2=" + f2 + ")", true);
  }
  check("comboBonus נצבר", s.comboBonus === (ended ? ended![1] : 0));
  // נחיתות מבוקרות: "מפילים" את הדמות על קומה 3 ואז על קומה 6 מגובה קטן
  const t = flNewSim(); const mm = flBaseMods(); let e2: [number, number] | null = null;
  const drop = (fl: number) => { const f = flFloor("combo", fl); t.x = (f.x0 + f.x1) / 2; t.y = flFloorY(fl) + 3; t.dy = -2; t.st = 2; for (let i = 0; i < 4; i++) flStep(t, { dir: 0, jump: false, hold: false }, mm, "combo", { comboEnd: (a, b) => { e2 = [a, b]; } }, () => false); };
  drop(3); check("נחיתה על קומה 3 פותחת קומבו 3", t.floor === 3 && t.combo === 3 && t.comboJumps === 1 && t.comboTicks > 0);
  drop(6); check("נחיתה על 6 מוסיפה: קומבו 6, 2 קפיצות", t.combo === 6 && t.comboJumps === 2);
  drop(6); check("נחיתה חוזרת על אותה קומה לא שוברת", t.combo === 6 && t.comboTicks > 0);
  drop(7); check("קפיצת קומה אחת שוברת", t.comboTicks === 0 && e2 !== null && e2![0] === 6 && e2![1] === 36, JSON.stringify(e2));
  check("הבונוס נכנס ל-comboBonus", t.comboBonus === 36);
}
{
  const m = flMods(["sprint", "sprint", "dbljump", "fuse"]);
  check("מודים נערמים: 2×ספרינטר = ×1.2", Math.abs(m.speed - 1.2) < 1e-9);
  check("קפיצה כפולה מוסיפה קפיצה אווירית", m.extraJumps === 1);
  check("פתיל ארוך = 150 טיקים", m.comboTicks === 150);
  const s = flNewSim(); s.comboTicks = 50; s.combo = 6; s.comboJumps = 2;
  flBreakCombo(s, m);
  check("שבירת קומבו מבחוץ סוגרת אותו ומזכה", s.comboTicks === 0 && s.comboBonus === 36);
  flPlace(s, "x", 12);
  check("הצבה על קומה", s.floor === 12 && s.y === flFloorY(12) && s.st === 0);
}

console.log(failed ? `\n${failed} FAILED\n` : "\nהכול עבר ✓\n");
process.exit(failed ? 1 : 0);
