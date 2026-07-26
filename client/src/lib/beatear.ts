/**
 * "האוזן" 🎤 — זיהוי ביט אוטומטי מהמיקרופון של טלפון המפעיל.
 * הרעיון: הדיג'י לא צריך להקיש TAP — הטלפון שלו שומע את המוזיקה (הוא ליד הרמקולים!),
 * מזהה את הבעיטות (kick) לפי קפיצות אנרגיה בתדרים הנמוכים, ומחשב BPM + פאזה.
 *
 * האלגוריתם (פשוט ועמיד):
 * 1. AnalyserNode → אנרגיית התדרים 40–160Hz (הבאס/קיק) כל ~23ms.
 * 2. Onset = קפיצה חדה מעל הממוצע הנע (סף אדפטיבי) + זמן מת של 270ms (מקס' ~220BPM).
 * 3. מרווחי הזמן בין onsets "מקופלים" לטווח 80–180BPM (בעיטה כל ביט/שני ביטים — אותו קצב).
 * 4. חציון המרווחים = BPM; פיזור נמוך (MAD<26ms) = נעילה ✓; ה-onset האחרון = עוגן פאזה.
 */

export interface EarUpdate {
  bpm: number;         // 0 = עוד אין אומדן
  msSinceBeat: number; // כמה ms עברו מהביט האחרון שזוהה (לחישוב anchor בזמן-שרת)
  locked: boolean;     // הקצב יציב מספיק כדי לסנכרן את הקהל
}

export class BeatEar {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: number | null = null;
  private onsets: number[] = [];
  private ehist: number[] = [];
  private lastOnset = 0;
  private cb: (u: EarUpdate) => void;

  constructor(cb: (u: EarUpdate) => void) { this.cb = cb; }

  /**
   * מפעילים מתוך מחוות משתמש (דרישת הדפדפן). false = אין הרשאת מיקרופון.
   * external — הזרקת מקור שמע חלופי (לבדיקות אוטומטיות, ובעתיד: beacons מה-PA).
   */
  async start(external?: MediaStream): Promise<boolean> {
    if (external) this.stream = external;
    else try {
      // בלי "שיפורי שמע" — הם מוחקים בדיוק את הבאסים שאנחנו מחפשים
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch { return false; }
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    this.ctx = new AC();
    await this.ctx.resume().catch(() => { /* iOS לפעמים דורש ניסיון שני */ });
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;
    src.connect(this.analyser);

    const buf = new Uint8Array(this.analyser.frequencyBinCount);
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const lo = Math.max(1, Math.round(40 / binHz));
    const hi = Math.round(160 / binHz);

    this.timer = window.setInterval(() => {
      const a = this.analyser;
      if (!a) return;
      a.getByteFrequencyData(buf);
      let e = 0;
      for (let i = lo; i <= hi; i++) e += buf[i];
      const now = performance.now();
      const h = this.ehist;
      h.push(e);
      if (h.length > 43) h.shift(); // חלון ~1 שנייה
      if (h.length < 20) return;    // עוד מתכיילים
      const mean = h.reduce((x, y) => x + y, 0) / h.length;
      // בעיטה: אנרגיה שקופצת משמעותית מעל הרגיל, אחרי זמן מת
      if (e > mean * 1.45 + 40 && e > 120 && now - this.lastOnset > 270) {
        this.lastOnset = now;
        this.onsets.push(now);
        if (this.onsets.length > 24) this.onsets.shift();
        this.estimate(now);
      }
    }, 23);
    return true;
  }

  private estimate(now: number) {
    const on = this.onsets.filter((t) => now - t < 9000); // רק 9 השניות האחרונות (שיר מתחלף)
    if (on.length < 5) { this.cb({ bpm: 0, msSinceBeat: 0, locked: false }); return; }
    const iois: number[] = [];
    for (let i = 1; i < on.length; i++) {
      let d = on[i] - on[i - 1];
      if (d > 2200) continue; // שקט ארוך — לא מרווח ביט
      while (d < 333) d *= 2; // קיפול לטווח 80–180BPM
      while (d > 750) d /= 2;
      iois.push(d);
    }
    if (iois.length < 4) { this.cb({ bpm: 0, msSinceBeat: 0, locked: false }); return; }
    iois.sort((a, b) => a - b);
    const med = iois[Math.floor(iois.length / 2)];
    const devs = iois.map((x) => Math.abs(x - med)).sort((a, b) => a - b);
    const mad = devs[Math.floor(devs.length / 2)];
    this.cb({
      bpm: Math.max(50, Math.min(200, Math.round(60000 / med))),
      msSinceBeat: now - this.lastOnset,
      locked: mad < 26,
    });
  }

  stop() {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close().catch(() => { /* כבר סגור */ });
    this.ctx = null;
    this.analyser = null;
    this.onsets = [];
    this.ehist = [];
  }
}
