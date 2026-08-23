/**
 * הכור ☢️ — מניפסט הנכסים הגרפיים.
 * כל האמנות נטענת מכאן לפי מפתח: סבב נכסי היגספילד = החלפת קבצים ב-public/reactor,
 * אפס שינויי קוד. לכל נכס יש fallback (אימוג'י/CSS) עד שהקובץ קיים.
 */
export const RX_ASSET = {
  keyart: "/reactor/keyart.webp",       // קי-ארט לקטלוג/שיתוף (ייכנס בסבב ה-Key Art — ר' README)
  core: "/reactor/core.webp",           // הליבה בריאה (זוהר ציאן)
  coreHurt: "/reactor/core-hurt.webp",  // הליבה סדוקה (אדום) — HP נמוך
  orb: "/reactor/orb.webp",             // אורב רגיל
  orbGold: "/reactor/orb-gold.webp",    // אורב הזהב
  badgeFeeder: "/reactor/badge-feeder.webp",
  badgeLoader: "/reactor/badge-loader.webp",
  badgeFixer: "/reactor/badge-fixer.webp",
  bg: "/reactor/bg.webp",               // רקע תעשייתי כהה
  meltdown: "/reactor/meltdown.webp",   // פיצוץ ההתכה
} as const;

export const RX_FALLBACK: Record<keyof typeof RX_ASSET, string> = {
  keyart: "☢️",
  core: "🔵",
  coreHurt: "🔴",
  orb: "🔵",
  orbGold: "🟡",
  badgeFeeder: "🫳",
  badgeLoader: "🎯",
  badgeFixer: "🔧",
  bg: "",
  meltdown: "💥",
};
