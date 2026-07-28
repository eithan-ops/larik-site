/**
 * i18n מינימלי לאפליקציית המופע — עברית + אנגלית, בלי ספריות.
 * ברירת מחדל לפי שפת הדפדפן (he → עברית, כל השאר → אנגלית) + מתג ידני שנשמר.
 * החלפת שפה = reload (המחרוזות נטענות פעם אחת) — פשוט ואמין.
 * המותג מרוכז ב-BRAND — שינוי שם עתידי = עריכה בשורה אחת.
 */
export type Lang = "he" | "en";

export const BRAND = "LARIK SHOW";

export function getLang(): Lang {
  const saved = localStorage.getItem("larik-lang");
  if (saved === "he" || saved === "en") return saved;
  return navigator.language?.toLowerCase().startsWith("he") ? "he" : "en";
}

export function setLang(l: Lang) {
  localStorage.setItem("larik-lang", l);
  location.reload();
}

/** כיוון + שפה על ה-html — לקרוא פעם אחת בעליית האפליקציה */
export function applyLangDir() {
  const l = getLang();
  document.documentElement.lang = l;
  document.documentElement.dir = l === "he" ? "rtl" : "ltr";
}

export const isRtl = () => getLang() === "he";

/** קידומת הנתיבים: בדומיין show.* האפליקציה יושבת בשורש, אחרת תחת /s */
export const showPrefix = () =>
  location.hostname.startsWith("show.") ? "" : "/s";

const he = {
  // לנדינג
  landTagline: "הקהל הוא המסך",
  landSub: "כל טלפון בקהל הופך לנקודת אור אחת — גלים, לבבות, פעימות על הביט וזרקורים, בסנכרון מושלם. בלי אפליקציה, בלי הרשמה.",
  landStart: "🎛️ אני הדיג'י — פתח מופע",
  landOpening: "פותח...",
  landErr: "השרת מתעורר... נסו שוב עוד כמה שניות 😴",
  landHint: "תקבלו QR וקונסולת תאורה חיה — הקהל סורק ומצטרף",
  landHaveCode: "הקהל? יש לכם קוד?",
  landCodePh: "קוד מופע",
  landJoin: "הצטרפו למופע",
  // כניסה לחדר
  joinTitle: "ברוכים הבאים למופע ✨",
  joinSub: "עוד רגע אתם חלק ממנו. איך קוראים לך?",
  joinNote: "(השם למשחקי הזרקור — אפשר כינוי)",
  joinPh: "השם שלך",
  joinBtn: "⚡ נכנסים!",
  rejoinTitle: "ממשיכים מאיפה שעצרנו",
  rejoinSub: "לחיצה אחת מחזירה אותך פנימה.",
  rejoinBtn: "⚡ חזרה למופע",
  connecting: "מתחבר...",
  roomGone: "המופע לא נמצא",
  backHome: "🏠 לדף הבית",
  exit: "🚪 יציאה",
  endShow: "✕ סיום המופע",
  // לובי מארח
  hostPanelTitle: "המופע שלך",
  hostPanelSub: "הקהל הוא המסך — אתה על ההגה",
  hostPanelBody: "כל מי שסורק הופך לנקודת אור. ברגע שתתחיל — תקבל קונסולת תאורה חיה:",
  hostScanTitle: "הקהל סורק כדי להצטרף",
  hostStart: "🕯️ התחל את המופע",
  hostWaitFirst: "מחכים לאור הראשון בקהל...",
  hostMidJoin: "💡 אפשר להתחיל כבר עכשיו — מי שסורק באמצע מצטרף אוטומטית.",
  lightsOn: "אורות כבר דולקים",
  lightOn: "אור כבר דולק",
  // המתנת אורח
  guestTitle: "אתם חלק ממשהו מיוחד ✨",
  guestBody: "עוד מעט כל טלפון בקהל — כולל שלכם — יהפוך לנקודת אור במופע אחד גדול.",
  guestStarting: "המופע מתחיל בעוד רגע...",
  chipBright: "🔆 בהירות למקסימום",
  chipOut: "📱 מסך כלפי חוץ",
  chipNoLock: "🔓 אל תנעלו את הטלפון",
  // קונסולה
  phones: "טלפונים",
  pilotOff: "🪄 טייס אוטומטי",
  pilotOffSub: "המופע רץ לבד לפי המוזיקה",
  pilotHear: "🎤 שומע את המוזיקה",
  pilotHearSub: "מחליף לוק כל 8 תיבות · הקשה = כיבוי",
  pilotListen: "🎤 מאזין למוזיקה...",
  pilotListenSub: "תקרבו את הטלפון לרמקול · בינתיים לפי",
  pilotNoMic: "🪄 פועל בלי מיקרופון",
  pilotNoMicSub: "אפשר לדייק עם TAP · לפי",
  fxBeat: "לפי הקצב", fxTribal: "שבטי", fxPulse: "פעימות", fxCandles: "נרות",
  fxWave: "גל", fxSparkle: "נצנוץ", fxSections: "יציעים", fxPaparazzi: "פפראצי",
  fxSpot: "זרקור", fxCountdown: "ספירה", fxEmber: "גחלים", fxText: "טקסט",
  shFull: "מלא", shHeart: "לב", shCircle: "עיגול", shStripes: "פסים",
  shStar: "כוכב", shBolt: "ברק", shDancers: "רוקדים",
  flash: "הבזק",
  off: "חושך",
  arming: "...",
  faderMax: "⬆ מלא",
  spotOn: "🎯 הזרקור על:",
  sheetTextLabel: "טקסט שירוץ על הקהל:",
  sheetTextPh: "למשל: שם השיר / אני אוהב אתכם",
  sheetSend: "🔤 שגר את הטקסט",
  sheetBpm: "כיוון BPM ידני:",
  sheetClose: "סגור",
  lockTitle: "הקונסולה נעולה",
  lockSub: "החזיקו כדי לשחרר",
  // צופה
  hintTitle: "תרימו בהירות למקסימום!",
  hintBody: "החזיקו את הטלפון גבוה — אתם חלק מהמופע ✨",
  hintTap: "(הקשה על המסך = מסך מלא)",
  zoneQ: "📍 איפה אתם ברחבה? (הפנים לבמה)",
  zoneL: "שמאל", zoneC: "מרכז", zoneR: "ימין",
  spotWin: "הזרקור עליך!",
  spotWinSub: "תרימו את הטלפון גבוה! 🙌",
  midGame: "המופע כבר רץ — אתם בפנים!",
};

const en: typeof he = {
  landTagline: "The crowd is the screen",
  landSub: "Every phone in the crowd becomes one point of light — waves, hearts, beat-synced pulses and spotlights, in perfect sync. No app, no signup.",
  landStart: "🎛️ I'm the DJ — start a show",
  landOpening: "Starting...",
  landErr: "Server is waking up... try again in a few seconds 😴",
  landHint: "You'll get a QR + a live lighting console — the crowd scans and joins",
  landHaveCode: "In the crowd? Got a code?",
  landCodePh: "Show code",
  landJoin: "Join the show",
  joinTitle: "Welcome to the show ✨",
  joinSub: "You're about to be part of it. What's your name?",
  joinNote: "(used for spotlight moments — a nickname is fine)",
  joinPh: "Your name",
  joinBtn: "⚡ I'm in!",
  rejoinTitle: "Picking up where we left off",
  rejoinSub: "One tap brings you back in.",
  rejoinBtn: "⚡ Back to the show",
  connecting: "Connecting...",
  roomGone: "Show not found",
  backHome: "🏠 Home",
  exit: "🚪 Leave",
  endShow: "✕ End show",
  hostPanelTitle: "Your show",
  hostPanelSub: "The crowd is the screen — you're at the controls",
  hostPanelBody: "Everyone who scans becomes a point of light. Hit start to get your live lighting console:",
  hostScanTitle: "The crowd scans to join",
  hostStart: "🕯️ Start the show",
  hostWaitFirst: "Waiting for the first light...",
  hostMidJoin: "💡 You can start now — anyone scanning later joins automatically.",
  lightsOn: "lights already on",
  lightOn: "light already on",
  guestTitle: "You're part of something special ✨",
  guestBody: "In a moment, every phone in this crowd — including yours — becomes a point of light in one big show.",
  guestStarting: "The show is about to begin...",
  chipBright: "🔆 Brightness to max",
  chipOut: "📱 Screen facing out",
  chipNoLock: "🔓 Don't lock your phone",
  phones: "phones",
  pilotOff: "🪄 Autopilot",
  pilotOffSub: "The show runs itself to the music",
  pilotHear: "🎤 Hearing the music",
  pilotHearSub: "New look every 8 bars · tap to turn off",
  pilotListen: "🎤 Listening to the music...",
  pilotListenSub: "Hold the phone near a speaker · meanwhile at",
  pilotNoMic: "🪄 Running without mic",
  pilotNoMicSub: "Use TAP to dial it in · at",
  fxBeat: "To the beat", fxTribal: "Tribal", fxPulse: "Pulse", fxCandles: "Candles",
  fxWave: "Wave", fxSparkle: "Sparkle", fxSections: "Sections", fxPaparazzi: "Paparazzi",
  fxSpot: "Spotlight", fxCountdown: "Countdown", fxEmber: "Embers", fxText: "Text",
  shFull: "Full", shHeart: "Heart", shCircle: "Circle", shStripes: "Stripes",
  shStar: "Star", shBolt: "Bolt", shDancers: "Dancers",
  flash: "Flash",
  off: "Black",
  arming: "...",
  faderMax: "⬆ Full",
  spotOn: "🎯 Spotlight on:",
  sheetTextLabel: "Text to run across the crowd:",
  sheetTextPh: "e.g. song name / I love you all",
  sheetSend: "🔤 Send the text",
  sheetBpm: "Manual BPM:",
  sheetClose: "Close",
  lockTitle: "Console locked",
  lockSub: "Hold to unlock",
  hintTitle: "Brightness to the max!",
  hintBody: "Hold your phone up high — you're part of the show ✨",
  hintTap: "(tap the screen for fullscreen)",
  zoneQ: "📍 Where are you? (facing the stage)",
  zoneL: "Left", zoneC: "Center", zoneR: "Right",
  spotWin: "Spotlight's on you!",
  spotWinSub: "Hold your phone up high! 🙌",
  midGame: "The show is live — you're in!",
};

const dict = { he, en };

export function t(k: keyof typeof he): string {
  return dict[getLang()][k] ?? he[k];
}
