/**
 * מניפסט הנכסים של "המתחזה למתקדמים" 🥸
 * כל איור נטען לפי מפתח מכאן — סבב נכסים חדש הוא החלפת קבצים, לא שכתוב קוד.
 * כל קובץ הוא WEBP קטן עם אלפא אמיתי (רקע לבן הוסר בצינור ה-chroma-key).
 */
export const UC_ART = {
  card:   "/undercover/uc-card.webp",     // גב הקלף הסודי
  caught: "/undercover/uc-caught.webp",   // נתפסת — המשקפיים נופלים
  safe:   "/undercover/uc-safe.webp",     // שרדת — מתגנב החוצה עם חיוך
  genius: "/undercover/uc-genius.webp",   // "רגע… אני המתחזה!" — הנורה נדלקת
  hit:    "/undercover/uc-hit.webp",      // תפסת אותו — אצבע מאשימה
  miss:   "/undercover/uc-miss.webp",     // פספסת — והוא מתגנב לך מאחורי הגב
  fooled: "/undercover/uc-fooled.webp",   // חשבת שאתה המתחזה. לא היית.
} as const;

export type UcArtKey = keyof typeof UC_ART;
