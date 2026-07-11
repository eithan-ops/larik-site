/**
 * LARIK — מנוע חלוקת העמלות
 * ---------------------------------
 * מכל עמלה שמתקבלת ממוכר:
 *   8%  — פלטפורמה
 *   92% — מתחלקים:
 *       60% למוביל הרכישה (הקונה בקאשבק / המשתף שהוביל לקנייה)
 *       32% לשרשרת ההזמנות, בדעיכה גיאומטרית:
 *           דור 1 = 16%, דור 2 = 8%, דור 3 = 4% ... (כל דור חצי מהקודם, עד אינסוף)
 *           הטור מתכנס ל-32% בדיוק: 16 * (1/(1-0.5)) = 32
 *       שארית של שרשרת קצרה — לקופת הקהילה (פרסי הליגה).
 * כל הסכומים באגורות (int) כדי למנוע שגיאות צף.
 */

export const PLATFORM_RATE = 0.08;
export const DRIVER_RATE = 0.6; // מתוך ה-92%
export const GEN1_RATE = 0.16; // מתוך ה-92%, ונחצה בכל דור

export interface SplitResult {
  /** אגורות לפלטפורמה */
  platform: number;
  /** אגורות למוביל הרכישה */
  driver: number;
  /** אגורות לכל דור בשרשרת, מהקרוב לרחוק */
  chain: number[];
  /** שארית לקופת הקהילה (שרשרת קצרה / עיגולים) */
  communityPool: number;
  /** סה"כ — חייב להיות שווה בדיוק לעמלה */
  total: number;
}

/**
 * מפצל עמלה (באגורות) בין הפלטפורמה, המוביל והשרשרת.
 * @param commissionAgorot העמלה שהתקבלה מהמוכר, באגורות
 * @param chainLength כמה אבות יש בשרשרת ההזמנות של המוביל (0 = אין אף אחד מעליו)
 */
export function splitCommission(
  commissionAgorot: number,
  chainLength: number
): SplitResult {
  if (!Number.isInteger(commissionAgorot) || commissionAgorot < 0) {
    throw new Error("commission must be a non-negative integer (agorot)");
  }
  if (!Number.isInteger(chainLength) || chainLength < 0) {
    throw new Error("chainLength must be a non-negative integer");
  }

  const platform = Math.floor(commissionAgorot * PLATFORM_RATE);
  const distributable = commissionAgorot - platform; // ~92%
  const driver = Math.floor(distributable * DRIVER_RATE);

  // דור k מקבל 16% * (1/2)^(k-1) מתוך החלק המחולק (92%)
  const chain: number[] = [];
  let genRate = GEN1_RATE;
  for (let g = 0; g < chainLength; g++) {
    const amount = Math.floor(commissionAgorot * 0.92 * genRate);
    if (amount < 1) break; // מתחת לאגורה — אין טעם להמשיך
    chain.push(amount);
    genRate /= 2;
  }

  const distributed = driver + chain.reduce((a, b) => a + b, 0);
  const communityPool = distributable - distributed;

  return {
    platform,
    driver,
    chain,
    communityPool,
    total: platform + driver + chain.reduce((a, b) => a + b, 0) + communityPool,
  };
}

/** עוזר תצוגה: אגורות → "₪12.34" */
export function fmt(agorot: number): string {
  return "₪" + (agorot / 100).toFixed(2);
}
