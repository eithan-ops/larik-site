import { splitCommission, fmt } from "../src/lib/split";

let failed = 0;
function check(name: string, cond: boolean) {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name);
  if (!cond) failed++;
}

console.log("LARIK split engine tests\n");

// עמלה של ₪24 (2400 אגורות), שרשרת של 3 דורות
const r = splitCommission(2400, 3);
check("סה'כ תמיד שווה לעמלה", r.total === 2400);
check("פלטפורמה = 8% => ₪1.92", r.platform === 192);
check("מוביל = 60% מ-92% => ₪13.24", r.driver === Math.floor(2208 * 0.6));
check("דור 1 = ₪3.53", r.chain[0] === Math.floor(2400 * 0.92 * 0.16));
check("דור 2 = חצי מדור 1 (בערך)", Math.abs(r.chain[1] - r.chain[0] / 2) <= 1);
check("קופת קהילה מקבלת את השארית", r.communityPool >= 0);

// שרשרת אינסופית — לא מתפוצצת ולא חורגת
const inf = splitCommission(2400, 1000);
check("1000 דורות: סה'כ עדיין שווה לעמלה", inf.total === 2400);
check("1000 דורות: השרשרת נעצרת כשמגיעים לאגורה", inf.chain.length < 15);
const chainSum = inf.chain.reduce((a, b) => a + b, 0);
check("סך השרשרת <= 32% מ-92%", chainSum <= Math.ceil(2400 * 0.92 * 0.32));

// בלי שרשרת בכלל — הכול למוביל ולקופה
const solo = splitCommission(2400, 0);
check("בלי שרשרת: אין תשלומי דורות", solo.chain.length === 0);
check("בלי שרשרת: הקופה מקבלת את כל ה-32%", solo.communityPool === 2400 - solo.platform - solo.driver);

// קצוות
check("עמלה 0 עובדת", splitCommission(0, 5).total === 0);
check("אגורה אחת עובדת", splitCommission(1, 5).total === 1);

console.log("\nדוגמה — עמלה ₪24, שרשרת 5:");
const d = splitCommission(2400, 5);
console.log(`  פלטפורמה ${fmt(d.platform)} | מוביל ${fmt(d.driver)} | שרשרת: ${d.chain.map(fmt).join(" → ")} | קופה ${fmt(d.communityPool)}`);

if (failed) { console.error(`\n${failed} tests FAILED`); process.exit(1); }
console.log("\nכל הבדיקות עברו ✓");
