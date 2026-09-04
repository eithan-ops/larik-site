/**
 * הקומות 🏢 — סאונד מסונתז (אפס קבצים). גרייבוקס: צליל לכל פעולה — קפיצה ב-3 גבהים, קיר, נחיתה,
 * קריאת קומבו, נפילה, עצירה, בחירה, פגיעה. הדמויות יקבלו קולות משלהן בשלב הנכסים.
 */
let ctx: AudioContext | null = null;
export function flAudioInit() {
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
    if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, base + n.t + n.d);
    g.gain.setValueAtTime(0.0001, base + n.t);
    g.gain.exponentialRampToValueAtTime((n.g ?? 0.2) * vol, base + n.t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, base + n.t + n.d);
    o.connect(g).connect(c.destination); o.start(base + n.t); o.stop(base + n.t + n.d + 0.05);
  }
}
function noise(d: number, g = 0.12, f = 1200) {
  const c = ac(); if (!c) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * d), c.sampleRate);
  const data = buf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource(); src.buffer = buf;
  const fl = c.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = f;
  const gn = c.createGain(); gn.gain.value = g;
  src.connect(fl).connect(gn).connect(c.destination); src.start();
}
let lastJump = 0;
export const flSfx = {
  /** 3 דרגות לפי מהירות ההמראה — כמו הגניחות המקוריות */
  jump(v: number, pitch = 1) {
    const now = performance.now(); if (now - lastJump < 60) return; lastJump = now;
    const tier = v > 22 ? 2 : v > 15.6 ? 1 : 0;
    const f = [330, 440, 560][tier] * pitch;
    play([{ f, t: 0, d: 0.12 + tier * 0.05, type: "triangle", g: 0.18, to: f * (1.5 + tier * 0.3) }]);
  },
  airJump(pitch = 1) { play([{ f: 700 * pitch, t: 0, d: 0.1, type: "square", g: 0.08, to: 1100 * pitch }]); },
  land(gained: number) { noise(0.05, gained >= 2 ? 0.1 : 0.05, 900); if (gained >= 2) play([{ f: 220 + gained * 40, t: 0, d: 0.08, type: "triangle", g: 0.12 }]); },
  wall(v: number) { play([{ f: 180 + v * 12, t: 0, d: 0.07, type: "square", g: 0.08 }]); noise(0.04, 0.06, 600); },
  /** קריאת הקומבו — סולם עולה לפי הדרגה */
  shout(tier: number, mine: boolean) {
    const base = 440 * Math.pow(1.12, tier);
    play([{ f: base, t: 0, d: 0.12, type: "triangle", g: mine ? 0.22 : 0.1 }, { f: base * 1.25, t: 0.1, d: 0.12, type: "triangle", g: mine ? 0.22 : 0.1 }, { f: base * 1.5, t: 0.2, d: 0.28, type: "triangle", g: mine ? 0.26 : 0.12 }]);
  },
  fall() { play([{ f: 600, t: 0, d: 0.5, type: "sawtooth", g: 0.12, to: 120 }]); },
  respawn() { play([{ f: 400, t: 0, d: 0.1, type: "triangle" }, { f: 600, t: 0.1, d: 0.1, type: "triangle" }, { f: 800, t: 0.2, d: 0.2, type: "triangle" }]); },
  hurry() { play([{ f: 880, t: 0, d: 0.12, type: "square", g: 0.12 }, { f: 880, t: 0.16, d: 0.12, type: "square", g: 0.12 }, { f: 1100, t: 0.32, d: 0.2, type: "square", g: 0.12 }]); },
  freeze() { play([{ f: 196, t: 0, d: 0.9, type: "triangle", g: 0.3 }, { f: 392, t: 0.02, d: 0.7, type: "sine", g: 0.18 }, { f: 587, t: 0.04, d: 0.5, type: "sine", g: 0.1 }]); },
  pick() { play([{ f: 660, t: 0, d: 0.08, type: "triangle" }, { f: 990, t: 0.07, d: 0.16, type: "triangle", g: 0.28 }]); },
  reveal() { play([{ f: 523, t: 0, d: 0.1, type: "triangle", g: 0.14 }, { f: 784, t: 0.08, d: 0.18, type: "triangle", g: 0.16 }]); },
  hit(mine: boolean) { noise(0.12, mine ? 0.25 : 0.12, 500); play([{ f: 160, t: 0, d: 0.18, type: "square", g: mine ? 0.2 : 0.08 }]); },
  shot() { play([{ f: 900, t: 0, d: 0.08, type: "sine", g: 0.1, to: 300 }]); },
  shield() { play([{ f: 1200, t: 0, d: 0.15, type: "sine", g: 0.14 }, { f: 1600, t: 0.05, d: 0.2, type: "sine", g: 0.1 }]); },
  banana() { play([{ f: 300, t: 0, d: 0.15, type: "sine", g: 0.1, to: 900 }]); },
  aight() { play([{ f: 523, t: 0, d: 0.08, type: "square", g: 0.1 }, { f: 659, t: 0.08, d: 0.08, type: "square", g: 0.1 }, { f: 784, t: 0.16, d: 0.2, type: "square", g: 0.12 }]); },
  go() { play([{ f: 660, t: 0, d: 0.15, type: "triangle", g: 0.2 }, { f: 990, t: 0.12, d: 0.35, type: "triangle", g: 0.3 }]); },
  count() { play([{ f: 660, t: 0, d: 0.12, type: "triangle", g: 0.18 }]); },
  over() { play([{ f: 523, t: 0, d: 0.15, type: "triangle" }, { f: 659, t: 0.15, d: 0.15, type: "triangle" }, { f: 784, t: 0.3, d: 0.15, type: "triangle" }, { f: 1046, t: 0.45, d: 0.5, type: "triangle", g: 0.3 }]); },
};
