/**
 * מטרונובול 🎾 — בדיקות הליבה המשותפת. מריצים: npx tsx test/metro-shared.test.ts
 */
import { MB, mbBpm, mbPeriod, mbLevelOf, mbNewBall, mbFeedTap, mbAsleep, mbPhase, mbHeight, mbBeatScore, mbTempoClose, mbRoundScore, mbBotTaps, mbConfig } from "../../shared/metro";

let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : ""));
  if (!cond) failed++;
}
console.log("\n— מטרונובול 🎾 (ליבה) —");

// רמות
check("רמה 1 = 51 BPM, רמה 50 = 198", mbBpm(1) === 51 && mbBpm(50) === 198);
check("רמה מחוץ לטווח נחתכת", mbBpm(0) === 51 && mbBpm(99) === 198);
check("mbLevelOf הופכי ל-mbBpm", [1, 7, 25, 50].every((l) => mbLevelOf(mbBpm(l)) === l));
check("מחזור 120 BPM = 500ms", mbPeriod(120) === 500);
check("גובה: איטי גבוה ממהיר, בטווח 0..1", mbHeight(51) > mbHeight(120) && mbHeight(120) > mbHeight(198) && mbHeight(51) <= 1 && mbHeight(198) >= 0.16, `${mbHeight(51).toFixed(2)} ${mbHeight(120).toFixed(2)} ${mbHeight(198).toFixed(2)}`);

// טאפ-טמפו
let b = mbNewBall();
check("כדור חדש ישן", mbAsleep(b, 1000));
b = mbFeedTap(b, 10000);
check("הקשה אחת: עוגן בלי קצב", b.bpm === 0 && b.anchor === 10000 && b.taps.length === 1);
b = mbFeedTap(b, 10500);
check("שתי הקשות במרווח 500 = 120 BPM", Math.abs(b.bpm - 120) < 0.01, `${b.bpm}`);
b = mbFeedTap(b, 11000); b = mbFeedTap(b, 11500);
check("קצב יציב נשאר 120", Math.abs(b.bpm - 120) < 0.01 && b.taps.length === 4);
const b2 = mbFeedTap(b, 11900);
check("הקשה מוקדמת ב-100ms מזיזה את הקצב מעט (משוקלל, לא קופץ)", b2.bpm > 120 && b2.bpm < 140, `${b2.bpm.toFixed(1)}`);
const b3 = mbFeedTap(b, 11500 + 4000);
check("הפסקה ארוכה = איפוס המדידה", b3.bpm === 0 && b3.taps.length === 1);
check("אחרי 2.5 שנ' בלי הקשה — ישן", !mbAsleep(b, 11500 + 2000) && mbAsleep(b, 11500 + 2600));
const fast = [0, 100, 200, 300].reduce((bb, t) => mbFeedTap(bb, 50000 + t), mbNewBall());
check("הקשות מהירות מדי נחתכות ל-240 BPM", fast.bpm === MB.BPM_MAX);

// פאזה
const ph = mbPhase(120, 1000, 1250);
check("פאזה: 250ms אחרי נחיתה ב-120 BPM = 0.5 (שיא)", Math.abs(ph.phi - 0.5) < 1e-9 && ph.n === 0);
check("פאזה לפני העוגן (ספירה לאחור) עדיין 0..1", (() => { const p = mbPhase(120, 1000, 100); return p.phi >= 0 && p.phi < 1 && p.n < 0; })());

// שיפוט פעימה
const L = 120; const T = 500;
const good = [0, 500, 1000, 1500].reduce((bb, t) => mbFeedTap(bb, 20000 + t), mbNewBall()); // נחיתות ב-20000+n·500
check("נחיתה מדויקת = 10", mbBeatScore(good, L, 22000).pts === 10);
const late = [0, 500, 1000, 1560].reduce((bb, t) => mbFeedTap(bb, 20000 + t), mbNewBall());
check("הקשה 60ms אחרי הפעימה = 6", mbBeatScore(late, L, 21500).pts === 6, `${mbBeatScore(late, L, 21500).off}`);
const off = [0, 500, 1000, 1500].reduce((bb, t) => mbFeedTap(bb, 20120 + t), mbNewBall());
check("120ms מהפעימה = 3", mbBeatScore(off, L, 22000).pts === 3);
const far = [0, 500, 1000, 1500].reduce((bb, t) => mbFeedTap(bb, 20240 + t), mbNewBall());
check("240ms (חצי מחזור) = 0", mbBeatScore(far, L, 22000).pts === 0);
const dbl = [0, 250, 500, 750].reduce((bb, t) => mbFeedTap(bb, 20000 + t), mbNewBall());
check("קצב כפול (240) = 0 גם כשהפאזה מתאימה", mbBeatScore(dbl, L, 21000).pts === 0 && !mbTempoClose(dbl, L));
const slow = [0, 530, 1060, 1590].reduce((bb, t) => mbFeedTap(bb, 20000 + t), mbNewBall()); // 113 BPM (−6%)
check("קצב ב-6% סטייה נספר לפעימה אבל לא לנעילה", mbBeatScore(slow, L, 21590).pts > 0 && !mbTempoClose(slow, L));
check("כדור ישן = 0", mbBeatScore(good, L, 21500 + 4000).pts === 0);

// ניקוד סבב
const rs = mbRoundScore(10 * 60, 60, 30000 + 5000, 30000);
check("דיוק מושלם = 500, נעילה אחרי 5 שנ' = 400", rs.acc === 500 && rs.speed === 400 && rs.total === 900);
check("בלי נעילה = 0 מהירות", mbRoundScore(300, 60, 0, 30000).speed === 0);
check("נעילה אחרי 30 שנ' = 0 מהירות", mbRoundScore(300, 60, 60000, 30000).speed === 0);

// בוט
const taps = mbBotTaps(120, 100000, 100000, 130000, { jitterMs: 20, startDelayMs: 1000, tempoErr: 0.05, converge: 0.25 }, () => 0.5);
check("בוט מקיש ~58 פעמים ב-30 שנ' ב-120 BPM", taps.length >= 55 && taps.length <= 60, `${taps.length}`);
let bot = mbNewBall(); for (const t of taps) bot = mbFeedTap(bot, t);
check("הבוט מתכנס לקצב", mbTempoClose(bot, 120) && mbBeatScore(bot, 120, 130000).pts >= 6, `${bot.bpm.toFixed(1)}`);

// קונפיג
check("קונפיג ברירת מחדל: סבב 1, 3 דק'", mbConfig({}).rounds === 1 && mbConfig({}).minutes === 3);
check("קונפיג מהקטלוג (מחרוזות)", mbConfig({ rounds: "2", minutes: "5" } as any).rounds === 2 && mbConfig({ rounds: "2", minutes: "5" } as any).minutes === 5);

console.log(failed ? `\n✗ ${failed} נכשלו` : "\n✓ כל בדיקות הליבה עברו");
process.exit(failed ? 1 : 0);
