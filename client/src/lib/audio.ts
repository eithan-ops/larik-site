/**
 * מנוע האודיו — הכול מסונתז ב-WebAudio (אפס קבצים, אפס טעינה).
 * playAt(serverTime) ממיר זמן-שרת לזמן AudioContext — דיוק ברמת הדגימה.
 */
let ctx: AudioContext | null = null;

export function unlockAudio() {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  // צליל דמה כדי לפתוח את iOS
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  o.connect(g).connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + 0.01);
}

function ac(): AudioContext | null { return ctx && ctx.state === "running" ? ctx : null; }

type Note = { f: number; t: number; d: number; type?: OscillatorType; g?: number };

function playNotes(notes: Note[], when = 0) {
  const c = ac(); if (!c) return;
  const base = c.currentTime + Math.max(0, when);
  for (const n of notes) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = n.type || "sine";
    o.frequency.value = n.f;
    g.gain.setValueAtTime(0.0001, base + n.t);
    g.gain.exponentialRampToValueAtTime(n.g ?? 0.25, base + n.t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, base + n.t + n.d);
    o.connect(g).connect(c.destination);
    o.start(base + n.t);
    o.stop(base + n.t + n.d + 0.05);
  }
}

/** delayMs — כמה ms מעכשיו (מחושב משכבת הסנכרון) */
function inSec(delayMs: number) { return Math.max(0, delayMs) / 1000; }

export const Sfx = {
  ding: (delayMs = 0) => playNotes([{ f: 880, t: 0, d: 0.35 }, { f: 1320, t: 0.05, d: 0.3, g: 0.12 }], inSec(delayMs)),
  tick: (delayMs = 0) => playNotes([{ f: 1000, t: 0, d: 0.05, type: "square", g: 0.06 }], inSec(delayMs)),
  countBeep: (delayMs = 0) => playNotes([{ f: 660, t: 0, d: 0.15, type: "triangle" }], inSec(delayMs)),
  goBeep: (delayMs = 0) => playNotes([{ f: 990, t: 0, d: 0.4, type: "triangle", g: 0.35 }], inSec(delayMs)),
  fanfare: (delayMs = 0) => playNotes([
    { f: 523, t: 0, d: 0.18, type: "triangle" }, { f: 659, t: 0.15, d: 0.18, type: "triangle" },
    { f: 784, t: 0.3, d: 0.18, type: "triangle" }, { f: 1046, t: 0.45, d: 0.5, type: "triangle", g: 0.35 },
  ], inSec(delayMs)),
  sadTrombone: (delayMs = 0) => playNotes([
    { f: 233, t: 0, d: 0.3, type: "sawtooth", g: 0.15 }, { f: 220, t: 0.3, d: 0.3, type: "sawtooth", g: 0.15 },
    { f: 207, t: 0.6, d: 0.3, type: "sawtooth", g: 0.15 }, { f: 185, t: 0.9, d: 0.8, type: "sawtooth", g: 0.18 },
  ], inSec(delayMs)),
  alarm: (delayMs = 0) => playNotes([
    { f: 800, t: 0, d: 0.2, type: "square", g: 0.15 }, { f: 600, t: 0.2, d: 0.2, type: "square", g: 0.15 },
    { f: 800, t: 0.4, d: 0.2, type: "square", g: 0.15 }, { f: 600, t: 0.6, d: 0.2, type: "square", g: 0.15 },
  ], inSec(delayMs)),
  pop: (delayMs = 0) => playNotes([{ f: 440, t: 0, d: 0.1, type: "triangle", g: 0.3 }, { f: 880, t: 0.02, d: 0.12, g: 0.2 }], inSec(delayMs)),
  boom: (delayMs = 0) => {
    const c = ac(); if (!c) return;
    const when = c.currentTime + inSec(delayMs);
    const dur = 0.6;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.setValueAtTime(0.5, when);
    const f = c.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 400;
    src.connect(f).connect(g).connect(c.destination);
    src.start(when);
  },
};

export function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* iOS — אין */ }
}
