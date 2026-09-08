/**
 * התותחים 💥 — סאונד מסונתז (אפס קבצים). צליל לכל פעולה: שריקת ירי לפי עוצמה, פיצוץ לפי גודל,
 * פגיעה, הריגה (פנפרה), מגן, קנייה, tick-tock, גונג הסלבו, מטאור, לייזר, הקפאה, ריפוי, קונפטי.
 */
let ctx: AudioContext | null = null;
export function tkAudioInit() {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch { /* אין אודיו */ }
}
const ac = () => (ctx && ctx.state === "running" ? ctx : null);
type Note = { f: number; t: number; d: number; type?: OscillatorType; g?: number; to?: number };
function play(notes: Note[], vol = 1) {
  const c = ac(); if (!c) return;
  const base = c.currentTime;
  for (const n of notes) {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = n.type || "sine"; o.frequency.setValueAtTime(n.f, base + n.t);
    if (n.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, n.to), base + n.t + n.d);
    g.gain.setValueAtTime(0.0001, base + n.t);
    g.gain.exponentialRampToValueAtTime((n.g ?? 0.2) * vol, base + n.t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, base + n.t + n.d);
    o.connect(g).connect(c.destination); o.start(base + n.t); o.stop(base + n.t + n.d + 0.05);
  }
}
function noise(d: number, g = 0.12, f = 1200, type: BiquadFilterType = "lowpass", delay = 0) {
  const c = ac(); if (!c) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * d), c.sampleRate);
  const data = buf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.6);
  const src = c.createBufferSource(); src.buffer = buf;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f;
  const gn = c.createGain(); gn.gain.value = g;
  src.connect(fl).connect(gn).connect(c.destination); src.start(c.currentTime + delay);
}
let lastBoom = 0, lastFire = 0;
export const tkSfx = {
  /** ירי — שריקה עולה לפי העוצמה */
  fire(power: number, mine: boolean) {
    const now = performance.now(); if (now - lastFire < 40) return; lastFire = now;
    noise(0.12, mine ? 0.18 : 0.08, 2500, "bandpass");
    play([{ f: 300 + power * 500, t: 0, d: 0.35, type: "sine", g: mine ? 0.12 : 0.05, to: 900 + power * 900 }]);
  },
  /** פיצוץ — לפי הרדיוס */
  boom(r: number, mine = false) {
    const now = performance.now(); if (now - lastBoom < 35) return; lastBoom = now;
    const big = Math.min(1.6, 0.5 + r / 60);
    noise(0.25 * big, 0.22 * big * (mine ? 1.3 : 1), 300 + r * 4);
    play([{ f: 90, t: 0, d: 0.3 * big, type: "triangle", g: 0.25 * big, to: 40 }]);
  },
  dirt() { noise(0.1, 0.07, 500); },
  hit(mine: boolean) { noise(0.1, mine ? 0.22 : 0.1, 700); play([{ f: 180, t: 0, d: 0.16, type: "square", g: mine ? 0.18 : 0.07, to: 90 }]); },
  shield() { play([{ f: 880, t: 0, d: 0.18, type: "sine", g: 0.14 }, { f: 1320, t: 0.05, d: 0.2, type: "sine", g: 0.1 }]); },
  dodge() { play([{ f: 700, t: 0, d: 0.1, type: "triangle", g: 0.1, to: 1400 }]); },
  kill(mine: boolean) { play([{ f: 523, t: 0, d: 0.1, type: "square", g: mine ? 0.16 : 0.08 }, { f: 659, t: 0.1, d: 0.1, type: "square", g: mine ? 0.16 : 0.08 }, { f: 784, t: 0.2, d: 0.1, type: "square", g: mine ? 0.16 : 0.08 }, { f: 1047, t: 0.3, d: 0.35, type: "square", g: mine ? 0.2 : 0.1 }]); },
  die() { play([{ f: 400, t: 0, d: 0.7, type: "sawtooth", g: 0.16, to: 60 }]); noise(0.5, 0.2, 400); },
  split() { play([{ f: 900, t: 0, d: 0.06, type: "square", g: 0.08 }, { f: 1200, t: 0.06, d: 0.06, type: "square", g: 0.08 }, { f: 1500, t: 0.12, d: 0.08, type: "square", g: 0.08 }]); },
  meteor() { play([{ f: 1800, t: 0, d: 0.9, type: "sawtooth", g: 0.06, to: 200 }]); noise(0.8, 0.06, 900, "bandpass"); },
  laser() { play([{ f: 1200, t: 0, d: 0.25, type: "sawtooth", g: 0.1, to: 300 }]); },
  freeze() { play([{ f: 1500, t: 0, d: 0.3, type: "sine", g: 0.12, to: 3000 }, { f: 700, t: 0.1, d: 0.3, type: "triangle", g: 0.06 }]); },
  heal() { play([{ f: 523, t: 0, d: 0.12, type: "sine", g: 0.12 }, { f: 659, t: 0.1, d: 0.12, type: "sine", g: 0.12 }, { f: 784, t: 0.2, d: 0.2, type: "sine", g: 0.12 }]); },
  confetti() { for (let i = 0; i < 6; i++) play([{ f: 600 + Math.random() * 900, t: i * 0.05, d: 0.08, type: "triangle", g: 0.08 }]); },
  emp() { play([{ f: 200, t: 0, d: 0.4, type: "sawtooth", g: 0.1, to: 3000 }]); },
  tele() { play([{ f: 400, t: 0, d: 0.25, type: "sine", g: 0.12, to: 1600 }, { f: 1600, t: 0.2, d: 0.25, type: "sine", g: 0.1, to: 400 }]); },
  fall() { play([{ f: 500, t: 0, d: 0.35, type: "sawtooth", g: 0.08, to: 120 }]); noise(0.12, 0.1, 500, "lowpass", 0.3); },
  water() { noise(0.3, 0.1, 600, "bandpass"); play([{ f: 300, t: 0, d: 0.3, type: "sine", g: 0.08, to: 120 }]); },
  /** גונג הסלבו — כולם שומעים אותו באותה שנייה */
  salvo() { play([{ f: 196, t: 0, d: 1.0, type: "triangle", g: 0.3 }, { f: 392, t: 0.02, d: 0.8, type: "sine", g: 0.18 }, { f: 587, t: 0.04, d: 0.6, type: "sine", g: 0.1 }]); },
  garage() { play([{ f: 440, t: 0, d: 0.1, type: "triangle", g: 0.14 }, { f: 554, t: 0.1, d: 0.1, type: "triangle", g: 0.14 }, { f: 659, t: 0.2, d: 0.25, type: "triangle", g: 0.16 }]); },
  buy() { play([{ f: 880, t: 0, d: 0.06, type: "square", g: 0.12 }, { f: 1320, t: 0.07, d: 0.14, type: "square", g: 0.14 }]); noise(0.05, 0.06, 3000, "highpass"); },
  nope() { play([{ f: 220, t: 0, d: 0.12, type: "square", g: 0.1 }, { f: 180, t: 0.12, d: 0.16, type: "square", g: 0.1 }]); },
  select() { play([{ f: 660, t: 0, d: 0.06, type: "triangle", g: 0.1 }]); },
  tick(hot: boolean) { play([{ f: hot ? 1100 : 800, t: 0, d: 0.06, type: "square", g: hot ? 0.12 : 0.06 }]); },
  count() { play([{ f: 660, t: 0, d: 0.12, type: "triangle", g: 0.14 }]); },
  go() { play([{ f: 660, t: 0, d: 0.1, type: "triangle", g: 0.16 }, { f: 990, t: 0.1, d: 0.3, type: "triangle", g: 0.2 }]); },
  ready() { play([{ f: 523, t: 0, d: 0.08, type: "triangle", g: 0.12 }, { f: 784, t: 0.08, d: 0.16, type: "triangle", g: 0.14 }]); },
  gold(n: number) { const k = Math.min(5, 1 + Math.floor(n / 40)); for (let i = 0; i < k; i++) play([{ f: 1300 + i * 120, t: i * 0.06, d: 0.09, type: "sine", g: 0.09 }]); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => play([{ f, t: i * 0.11, d: 0.28, type: "triangle", g: 0.18 }])); },
  over() { play([{ f: 330, t: 0, d: 0.3, type: "triangle", g: 0.2 }, { f: 415, t: 0.25, d: 0.3, type: "triangle", g: 0.2 }, { f: 494, t: 0.5, d: 0.3, type: "triangle", g: 0.2 }, { f: 659, t: 0.75, d: 0.7, type: "triangle", g: 0.24 }]); },
  drag(p: number) { const now = performance.now(); if (now - lastFire < 90) return; lastFire = now; play([{ f: 200 + p * 500, t: 0, d: 0.05, type: "sine", g: 0.04 }]); },
};
