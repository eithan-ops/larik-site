/**
 * התהום 🕳️ — סאונד מסונתז, אפס קבצים. AudioContext משלו (כמו הגנבים) כדי לגלוש בגובה,
 * לנגן whoosh לולאתי שעוקב אחרי המהירות, ולסדר סטינגרים. חובה לקרוא init() מתוך מחווה.
 */
import { unlockIosAudio } from "../lib/unmute";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let whooshSrc: AudioBufferSourceNode | null = null;
let whooshFilter: BiquadFilterNode | null = null;
let whooshGain: GainNode | null = null;
let noteIdx = 0, noteAt = 0;
const PENT = [0, 2, 4, 7, 9, 12, 14, 16, 19];

export function abAudioInit() {
  // unlockIosAudio אידמפוטנטי — אם הניסיון הראשון היה בלי מחווה (mount), המגע הבא משלים אותו
  unlockIosAudio();
  if (ctx) { if (ctx.state === "suspended") ctx.resume().catch(() => {}); return; }
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  } catch { ctx = null; }
}
export function abAudioResume() { if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {}); }

function tone(f: number, d: number, type: OscillatorType, vol: number, slideTo?: number, when = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.05);
}
function noise(d: number, vol: number, cutoff: number, when = 0, type: BiquadFilterType = "lowpass") {
  if (!ctx || !master) return;
  const n = Math.floor(ctx.sampleRate * d), buf = ctx.createBuffer(1, n, ctx.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = cutoff;
  const g = ctx.createGain(); const t = ctx.currentTime + when;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
}

/* ---- whoosh הנפילה ---- */
export function abWhoosh(on: boolean, speed01 = 0) {
  if (!ctx || !master) return;
  if (on && !whooshSrc) {
    const n = ctx.sampleRate * 2, buf = ctx.createBuffer(1, n, ctx.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
    whooshSrc = ctx.createBufferSource(); whooshSrc.buffer = buf; whooshSrc.loop = true;
    whooshFilter = ctx.createBiquadFilter(); whooshFilter.type = "lowpass"; whooshFilter.frequency.value = 300; whooshFilter.Q.value = 0.8;
    whooshGain = ctx.createGain(); whooshGain.gain.value = 0.0001;
    whooshSrc.connect(whooshFilter); whooshFilter.connect(whooshGain); whooshGain.connect(master);
    whooshSrc.start();
  }
  if (!whooshGain || !whooshFilter) return;
  const t = ctx.currentTime;
  if (on) {
    whooshGain.gain.cancelScheduledValues(t);
    whooshGain.gain.setTargetAtTime(0.05 + 0.09 * speed01, t, 0.15);
    whooshFilter.frequency.setTargetAtTime(260 + 900 * speed01, t, 0.2);
  } else {
    whooshGain.gain.cancelScheduledValues(t);
    whooshGain.gain.setTargetAtTime(0.0001, t, 0.08);
  }
}

/* ---- אירועים ---- */
export const abSfx = {
  /** גביש: סולם פנטטוני עולה — כל איסוף בתוך שנייה מעלה דרגה */
  crystal() {
    const now = performance.now() / 1000;
    if (now - noteAt > 1.1) noteIdx = 0; else noteIdx = Math.min(noteIdx + 1, PENT.length - 1);
    noteAt = now;
    const f = 523 * Math.pow(2, PENT[noteIdx] / 12);
    tone(f, 0.14, "triangle", 0.22); tone(f * 2, 0.1, "sine", 0.06);
  },
  gem() { tone(1046, 0.35, "triangle", 0.26); tone(1568, 0.3, "sine", 0.16, undefined, 0.04); tone(2093, 0.25, "sine", 0.1, undefined, 0.08); },
  nearMiss() { noise(0.12, 0.25, 2400, 0, "bandpass"); },
  shieldTaken() { tone(660, 0.12, "sine", 0.2); tone(990, 0.16, "sine", 0.2, undefined, 0.06); tone(1320, 0.22, "sine", 0.16, undefined, 0.12); },
  shieldPop() { noise(0.18, 0.4, 3200, 0, "highpass"); tone(1200, 0.12, "square", 0.12, 400); },
  caught() { tone(900, 0.55, "sine", 0.3, 180); noise(0.35, 0.7, 500, 0.45); tone(90, 0.3, "sine", 0.35, 45, 0.45); },
  ledgeRiser(secs = 1.2) { tone(180, secs, "sawtooth", 0.09, 420); noise(secs, 0.12, 900, 0, "bandpass"); },
  land() { noise(0.25, 0.45, 380); tone(70, 0.22, "sine", 0.3, 40); },
  count() { tone(660, 0.14, "triangle", 0.25); },
  go() { tone(990, 0.35, "triangle", 0.3); tone(1320, 0.3, "sine", 0.15, undefined, 0.05); },
  tick() { tone(1100, 0.05, "square", 0.06); },
  sealed() { for (let i = 0; i < 8; i++) noise(0.05, 0.25, 800, i * 0.07); },
  reveal() { noise(0.4, 0.9, 700); tone(392, 0.6, "triangle", 0.28); tone(523, 0.6, "triangle", 0.22, undefined, 0.02); tone(784, 0.7, "sine", 0.18, undefined, 0.04); },
  bank() { tone(1046, 0.09, "square", 0.12); tone(1318, 0.09, "square", 0.12, undefined, 0.07); tone(1568, 0.28, "triangle", 0.22, undefined, 0.14); tone(2093, 0.3, "sine", 0.12, undefined, 0.16); },
  multUp() { tone(440, 0.16, "triangle", 0.2); tone(660, 0.3, "triangle", 0.22, undefined, 0.12); },
  potWin() {
    const seq = [523, 659, 784, 1046, 784, 1046, 1318];
    seq.forEach((f, i) => tone(f, i === seq.length - 1 ? 0.7 : 0.18, "triangle", 0.26, undefined, i * 0.11));
    noise(0.6, 0.35, 4000, 0.7, "highpass");
  },
  swallow() { noise(1.3, 0.9, 130); tone(60, 1.2, "sine", 0.4, 30); tone(45, 1.2, "triangle", 0.2, 25, 0.1); },
  throwWhoosh() { noise(0.28, 0.35, 1800, 0, "bandpass"); tone(300, 0.25, "sine", 0.12, 700); },
  incoming() { tone(1400, 0.08, "square", 0.14); tone(1400, 0.08, "square", 0.14, undefined, 0.12); },
  bonus() { tone(880, 0.1, "triangle", 0.2); tone(1320, 0.18, "triangle", 0.2, undefined, 0.08); },
  pick() { tone(523, 0.1, "triangle", 0.2); tone(784, 0.22, "triangle", 0.22, undefined, 0.08); },
  potTick() { tone(1800, 0.03, "square", 0.05); },
};
