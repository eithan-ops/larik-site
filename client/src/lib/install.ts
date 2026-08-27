/**
 * LARIK — התקנה למסך הבית.
 *
 * ההחלטה המוצרית: לאריק נשאר אפליקציה וובית. מה שחסר לעומת נייטיב זה לא
 * יכולות אלא *תחושה ונוכחות* — אייקון על המסך, בלי סרגל דפדפן, והרשאה
 * לשלוח התראה. שלושתם מגיעים מהתקנה למסך הבית, וזו הסיבה שהקובץ הזה קיים.
 *
 * שני כללים:
 *  1. **לא מבקשים בכניסה הראשונה.** מבקשים אחרי ערב מוצלח, כשיש כבר סיבה.
 *  2. **מי שסירב לא נשאל שוב** במשך חודש. באנר שחוזר בכל ביקור הוא הדרך
 *     הבטוחה לגרום למישהו להפסיק לפתוח את האתר.
 *
 * אנדרואיד/כרום נותנים אירוע התקנה אמיתי; אייפון לא — שם אפשר רק להסביר
 * את שני הצעדים בתפריט השיתוף, ולכן המסך שם שונה.
 */

const DISMISS_KEY = "larik-install-dismissed";
const MONTH_MS = 30 * 864e5;

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: PromptEvent | null = null;

/** נקרא פעם אחת בעלייה — האירוע נורה מוקדם, ואם לא נתפוס אותו הוא אבוד */
export function watchInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();     // בלי זה כרום מציג באנר משלו, בתזמון שלו
    deferred = e as PromptEvent;
  });
}

/** האם האפליקציה כבר רצה מותקנת */
export function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  // אייפד מודרני מתחזה למק — מזהים אותו לפי מסך מגע
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function dismissedRecently(): boolean {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - t < MONTH_MS;
  } catch { return false; }
}

export function dismissInstall() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* אין אחסון */ }
}

/** מה להציג, אם בכלל: כפתור התקנה אמיתי, הסבר לאייפון, או כלום */
export function installMode(): "prompt" | "ios" | "none" {
  if (isStandalone() || dismissedRecently()) return "none";
  if (deferred) return "prompt";
  if (isIOS() && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent)) return "ios";
  return "none";
}

/** מפעיל את דיאלוג ההתקנה של המערכת. מחזיר true אם הותקן. */
export async function runInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null; // אירוע חד-פעמי — אי אפשר להשתמש בו פעמיים
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome !== "accepted") dismissInstall();
    return outcome === "accepted";
  } catch { return false; }
}
