/**
 * הגנבים 🥷 — מניפסט הנכסים: מדבקות (WEBP שקוף, gpt_image_2 → two-background matting) + סאונד "צעצוע השוד" (MP3, מסונתז).
 * החלפת נכס = החלפת קובץ ב-public/thieves, אפס שינויי קוד. אם קובץ חסר — הציור הפרוצדורלי של הגרייבוקס נשאר.
 */
const P = "/thieves/";

export const TH_IMG = {
  thief: Array.from({ length: 8 }, (_, i) => `${P}thief${i}.webp`),   // דביבונים: כתום · תכלת · מנטה · צהוב · אדום · סגול · ליים · ורוד (= PCOL)
  den: Array.from({ length: 8 }, (_, i) => `${P}den${i}.webp`),       // אוהל · מחילה · גזע · בית-עץ · קרון · מצודה · מגדל · איגלו
  gem: Array.from({ length: 5 }, (_, i) => `${P}gem${i}.webp`),       // 0 סלע (צ'אנק) · 1 חלוק · 2 זהב · 3 קורן · 4 אגדי
  mtn: Array.from({ length: 4 }, (_, i) => `${P}mtn${i}.webp`),       // מלא · חצי · ליבה · מכתש
  fx: { pow: `${P}fx0.webp`, sparkle: `${P}fx1.webp`, dust: `${P}fx2.webp`, ring: `${P}fx3.webp` },
  btn: `${P}btn.webp`,
  tower: Array.from({ length: 3 }, (_, i) => `${P}tower${i}.webp`),   // 🗼 פעיל · כבוי (עשן, עיניים עצומות) · חורבה
};

export const TH_SFX: Record<string, string> = Object.fromEntries([
  "mine1", "mine2", "mine3", "mine_deep", "mine_core", "note", "bell", "chirp", "receipt", "horn", "whistle", "tick",
  "warsting", "rumble", "siren", "grab", "stolen", "pow", "bounce", "pick", "home", "rage", "nope", "gulp", "music",
  "shot", "thud", "heat", "zap", "crumble", "hammer",   // 🗼 המגדל: ירייה · פגיעה · חימום · השבתה · הריסה · בנייה
].map((n) => [n, `${P}sfx/${n}.mp3`]));

export interface ThImages {
  thief: HTMLImageElement[]; den: HTMLImageElement[]; gem: HTMLImageElement[]; mtn: HTMLImageElement[]; tower: HTMLImageElement[];
  fx: Record<"pow" | "sparkle" | "dust" | "ring", HTMLImageElement>;
}
const okImg = (im: HTMLImageElement) => im.complete && im.naturalWidth > 0;
export const ready = okImg;

function img(src: string) { const im = new Image(); im.decoding = "async"; im.src = src; return im; }

/** טוען את כל התמונות ברקע; כל ציור בודק ready() ונופל לצורות אם עוד לא הגיע */
export function loadImages(): ThImages {
  return {
    thief: TH_IMG.thief.map(img), den: TH_IMG.den.map(img), gem: TH_IMG.gem.map(img), mtn: TH_IMG.mtn.map(img), tower: TH_IMG.tower.map(img),
    fx: { pow: img(TH_IMG.fx.pow), sparkle: img(TH_IMG.fx.sparkle), dust: img(TH_IMG.fx.dust), ring: img(TH_IMG.fx.ring) },
  };
}

/** מאורה בצבע השחקן: שטיפת צבע (source-atop) על המדבקה הניטרלית — פעם אחת לכל צירוף, ואז drawImage זול */
const tintCache = new Map<string, HTMLCanvasElement>();
export function tinted(im: HTMLImageElement, color: string, alpha = 0.3): HTMLCanvasElement | HTMLImageElement {
  if (!okImg(im)) return im;
  const key = im.src + color + alpha;
  let c = tintCache.get(key);
  if (c) return c;
  c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext("2d")!;
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = "source-atop"; g.globalAlpha = alpha; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  tintCache.set(key, c);
  return c;
}

/* ---------- בנק הסאונד ---------- */
const GAIN: Record<string, number> = {
  mine1: 0.4, mine2: 0.4, mine3: 0.4, mine_deep: 0.5, mine_core: 0.6, note: 0.55, bell: 0.5, chirp: 0.5, receipt: 0.45, horn: 0.8,
  whistle: 0.55, tick: 0.4, warsting: 0.7, rumble: 0.6, siren: 0.35, grab: 0.55, stolen: 0.4, pow: 0.6, bounce: 0.45, pick: 0.5,
  home: 0.65, rage: 0.5, nope: 0.25, gulp: 0.6, music: 0.16,
  shot: 0.3, thud: 0.55, heat: 0.4, zap: 0.55, crumble: 0.6, hammer: 0.45,
};

export class ThSfx {
  ctx: AudioContext | null = null;
  private bufs = new Map<string, AudioBuffer>();
  private master: GainNode | null = null;
  private music: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private loading = false;

  attach(ctx: AudioContext) {
    if (this.ctx === ctx) return;
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 1; this.master.connect(ctx.destination);
    void this.load();
  }
  /** כל הקבצים במקביל; כישלון בקובץ אחד לא מפיל את השאר — הצליל המסונתז נשאר כגיבוי */
  async load() {
    if (this.loading || !this.ctx) return; this.loading = true;
    await Promise.all(Object.entries(TH_SFX).map(async ([name, url]) => {
      try {
        const res = await fetch(url); if (!res.ok) return;
        const ab = await res.arrayBuffer();
        const buf = await new Promise<AudioBuffer>((ok, err) => this.ctx!.decodeAudioData(ab, ok, err));
        this.bufs.set(name, buf);
      } catch { /* בלי הדגימה הזו */ }
    }));
  }
  has(name: string) { return this.bufs.has(name); }
  /** מנגן דגימה; rate = גובה (2^(חצאי-טונים/12)); מחזיר false אם אין דגימה — שהקורא ינגן סינתזה */
  play(name: string, opt: { rate?: number; gain?: number; delay?: number } = {}): boolean {
    const c = this.ctx, b = this.bufs.get(name);
    if (!c || !b || !this.master || c.state !== "running") return false;
    const src = c.createBufferSource(); src.buffer = b; src.playbackRate.value = opt.rate ?? 1;
    const g = c.createGain(); g.gain.value = (GAIN[name] ?? 0.5) * (opt.gain ?? 1);
    src.connect(g); g.connect(this.master); src.start(c.currentTime + (opt.delay ?? 0));
    return true;
  }
  /** מוזיקת הרקע — לופ שקט מתחת לאפקטים; מתחיל ב-cue של "צאו!" (כל הטלפונים יחד) */
  startMusic() {
    const c = this.ctx, b = this.bufs.get("music");
    if (!c || !b || !this.master || this.music || c.state !== "running") return false;
    const src = c.createBufferSource(); src.buffer = b; src.loop = true;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(GAIN.music, c.currentTime + 1.2);
    src.connect(g); g.connect(this.master); src.start();
    this.music = { src, gain: g }; return true;
  }
  /** הקצב עולה עם הפאזה: דלדול 1.0 → מלחמה 1.06 → אזעקה 1.14 (וגם הגובה — קריקטורי, בכוונה) */
  musicRate(r: number) { const c = this.ctx; if (this.music && c) this.music.src.playbackRate.setTargetAtTime(r, c.currentTime, 0.6); }
  stopMusic(fade = 0.6) {
    const c = this.ctx, m = this.music; if (!c || !m) return; this.music = null;
    m.gain.gain.setTargetAtTime(0.0001, c.currentTime, fade / 3); try { m.src.stop(c.currentTime + fade); } catch { /* כבר נעצר */ }
  }
}
