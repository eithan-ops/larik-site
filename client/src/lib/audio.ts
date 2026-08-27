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
  /** צליל שדרוג — לכל תכונה גוון משלה, כך שאתה *שומע* מה קיבלת */
  upgrade: (i = 0, delayMs = 0) => {
    const roots = [392, 440, 523, 587, 659, 698, 784, 880];
    const f = roots[Math.abs(i) % roots.length];
    playNotes([
      { f, t: 0, d: 0.12, type: "triangle", g: 0.3 },
      { f: f * 1.26, t: 0.07, d: 0.14, type: "triangle", g: 0.28 },
      { f: f * 1.5, t: 0.14, d: 0.32, type: "triangle", g: 0.34 },
    ], inSec(delayMs));
  },
  /** אבולוציה — הרגע הגדול, ריזר שכל החדר שומע */
  evolve: (delayMs = 0) => playNotes([
    { f: 262, t: 0, d: 0.2, type: "sawtooth", g: 0.16 },
    { f: 392, t: 0.12, d: 0.2, type: "sawtooth", g: 0.2 },
    { f: 523, t: 0.24, d: 0.2, type: "triangle", g: 0.26 },
    { f: 659, t: 0.36, d: 0.24, type: "triangle", g: 0.3 },
    { f: 784, t: 0.5, d: 0.3, type: "triangle", g: 0.34 },
    { f: 1046, t: 0.66, d: 0.9, type: "triangle", g: 0.38 },
  ], inSec(delayMs)),
  pop: (delayMs = 0) => playNotes([{ f: 440, t: 0, d: 0.1, type: "triangle", g: 0.3 }, { f: 880, t: 0.02, d: 0.12, g: 0.2 }], inSec(delayMs)),
  /** תיפוף מתח לפני חשיפת המנצח — 1.4 שניות של דרמה */
  drumroll: (delayMs = 0) => {
    const notes: Note[] = [];
    for (let i = 0; i < 26; i++) {
      notes.push({ f: 150 + (i % 2) * 24, t: i * 0.054, d: 0.038, type: "square", g: 0.09 });
    }
    notes.push({ f: 520, t: 26 * 0.054, d: 0.3, type: "triangle", g: 0.25 }); // "צ'א!" בסוף
    playNotes(notes, inSec(delayMs));
  },
  /** צליל-הריגה אישי: לכל שחקן פיץ' משלו (פנטטוני) — כל השולחן שומע מי קוטל */
  killNote: (idx: number, mine = false, delayMs = 0) => {
    const SCALE = [523, 659, 784, 880, 1046, 1175, 1319, 1568]; // C E G A C D E G
    const f = SCALE[((idx % SCALE.length) + SCALE.length) % SCALE.length];
    const g = mine ? 0.3 : 0.14;
    playNotes([
      { f, t: 0, d: 0.09, type: "triangle", g },
      { f: f * 1.5, t: 0.055, d: 0.14, type: "triangle", g: g * 0.8 },
    ], inSec(delayMs));
  },
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
