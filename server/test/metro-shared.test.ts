/**
 * מטרונובול 🎾 — בדיקות הליבה המשותפת. מריצים: npx tsx test/metro-shared.test.ts
 */
import { MB, mbBpm, mbPeriod, mbLevelOf, mbNewBall, mbFeedTap, mbAsleep, mbPhase, mbHeight, mbBeatScore, mbTempoClose, mbRoundScore, mbBotTaps, mbConfig, mbLandings, mbBpmAt, mbIsRest, mbAround, mbNearest } from "../../shared/metro";

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

// שיפוט פעימה (לפי ההקשות עצמן — עובד לכל דפוס)
const L = 120; const T = 500;
const tapsAt = (base: number, offs: number[]) => offs.map((o) => base + o);
check("נחיתה מדויקת = 10", mbBeatScore(tapsAt(20000, [0, 500, 1000, 1500]), 21500, 21000).pts === 10);
check("הקשה 60ms אחרי הפעימה = 6", mbBeatScore(tapsAt(20000, [0, 500, 1000, 1560]), 21500, 21000).pts === 6);
check("120ms מהפעימה = 3", mbBeatScore(tapsAt(20120, [0, 500, 1000, 1500]), 21500, 21000).pts === 3);
check("240ms (חצי מחזור) = 0 וזו הקשה יתומה", mbBeatScore(tapsAt(20240, [0, 500, 1000]), 21500, 21000).pts === 0);
const dbl = mbBeatScore(tapsAt(20000, [0, 250, 500, 750, 1000, 1250, 1500]), 21500, 21000);
check("קצב כפול = 0 (הקשה יתומה באמצע) גם כשיש הקשה על הפעימה", dbl.pts === 0 && dbl.orphan);
check("בלי הקשות = 0", mbBeatScore([], 21500, 21000).pts === 0);
check("הקשה ישנה (לפני prev) לא מפריעה", mbBeatScore(tapsAt(20000, [0, 500, 1000, 1500]), 21500, 21000).orphan === false);
const slow = [0, 530, 1060, 1590].reduce((bb, t) => mbFeedTap(bb, 20000 + t), mbNewBall()); // 113 BPM (−6%)
check("קצב ב-6% סטייה לא נעול (LOCK_TOL 4%)", !mbTempoClose(slow, L));
void T;

// דפוסים
const plain = { pattern: "plain" as const, bpm: 120, bpm2: 120, anchor: 100000, until: 130000 };
check("רגיל: 61 נחיתות ב-30 שנ' ב-120 BPM", mbLandings(plain, 130000).length === 61);
const rest = { ...plain, pattern: "rest" as const };
const rl = mbLandings(rest, 130000);
check("הפסקה: הפעימה הרביעית חסרה (0, 500, 1000, 2000…)", rl[0] === 100000 && rl[1] === 100500 && rl[2] === 101000 && rl[3] === 102000 && rl.length === 46, `${rl.slice(0, 5)} n=${rl.length}`);
check("mbIsRest מזהה את ההפסקה ב-1500 ולא את הפעימה ב-1000", mbIsRest(rest, 101500) && !mbIsRest(rest, 101000));
check("mbAround בהפסקה: prev=1000, next=2000 (טיסה כפולה)", JSON.stringify(mbAround(rest, 101600)) === JSON.stringify({ prev: 101000, next: 102000 }));
const acc = { ...plain, pattern: "accel" as const };
const al = mbLandings(acc, 130000);
check("מאיץ: מתחיל ב-120 ומסיים ב-~150 BPM, יותר נחיתות", Math.abs(mbBpmAt(acc, 100000) - 120) < 0.01 && Math.abs(mbBpmAt(acc, 130000) - 150) < 0.01 && al.length > 61 && al.length < 80, `${al.length}`);
check("מאיץ: המרווחים מתקצרים", al[1] - al[0] > al[al.length - 1] - al[al.length - 2]);
const sw = { ...plain, pattern: "switch" as const, bpm2: 90 };
check("מתחלף: 120 עד האמצע ואז 90", mbBpmAt(sw, 114000) === 120 && mbBpmAt(sw, 115000) === 90);
const sl = mbLandings(sw, 130000);
check("מתחלף: מרווח 500 בהתחלה ו-~667 בסוף", sl[1] - sl[0] === 500 && Math.abs(sl[sl.length - 1] - sl[sl.length - 2] - 666.67) < 1);
check("mbNearest לפני ה-anchor (ספירה לאחור) עובד", mbNearest(plain, 99700) === 99500 && mbNearest(plain, 99800) === 100000);
const restTaps = [0, 500, 1000, 2000, 2500, 3000, 4000].reduce((bb, t) => mbFeedTap(bb, 20000 + t), mbNewBall());
check("טאפ-טמפו מנרמל מרווח כפול (הפסקה) — נשאר 120", Math.abs(restTaps.bpm - 120) < 3, `${restTaps.bpm.toFixed(1)}`);
const bt = mbBotTaps(120, 100000, 100000, 130000, { jitterMs: 0, startDelayMs: 0, tempoErr: 0, converge: 0 }, () => 0.5, rest);
check("בוט עוקב אחרי דפוס הפסקה (לא מקיש בהפסקה)", bt.length === 45 && !bt.includes(101500), `${bt.length}`);
check("קונפיג: דפוסים ופיזיקה כבויים כברירת מחדל, on/true מדליקים", !mbConfig({}).patterns && !mbConfig({}).phys && mbConfig({ patterns: "on", phys: true } as any).patterns && mbConfig({ patterns: "on", phys: true } as any).phys);

// ניקוד סבב
const rs = mbRoundScore(10 * 60, 60, 30000 + 5000, 30000);
check("דיוק מושלם = 500, נעילה אחרי 5 שנ' = 400", rs.acc === 500 && rs.speed === 400 && rs.total === 900);
check("בלי נעילה = 0 מהירות", mbRoundScore(300, 60, 0, 30000).speed === 0);
check("נעילה אחרי 30 שנ' = 0 מהירות", mbRoundScore(300, 60, 60000, 30000).speed === 0);

// בוט
const taps = mbBotTaps(120, 100000, 100000, 130000, { jitterMs: 20, startDelayMs: 1000, tempoErr: 0.05, converge: 0.25 }, () => 0.5);
check("בוט מקיש ~58 פעמים ב-30 שנ' ב-120 BPM", taps.length >= 55 && taps.length <= 60, `${taps.length}`);
let bot = mbNewBall(); for (const t of taps) bot = mbFeedTap(bot, t);
check("הבוט מתכנס לקצב", mbTempoClose(bot, 120) && mbBeatScore(taps, 129500, 129000).pts >= 6, `${bot.bpm.toFixed(1)}`);

// קונפיג
check("קונפיג ברירת מחדל: סבב 1, 3 דק'", mbConfig({}).rounds === 1 && mbConfig({}).minutes === 3);
check("קונפיג מהקטלוג (מחרוזות)", mbConfig({ rounds: "2", minutes: "5" } as any).rounds === 2 && mbConfig({ rounds: "2", minutes: "5" } as any).minutes === 5);

console.log(failed ? `\n✗ ${failed} נכשלו` : "\n✓ כל בדיקות הליבה עברו");
process.exit(failed ? 1 : 0);
