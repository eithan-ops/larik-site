/**
 * מטרונובול 🎾 — סאונד. הנחיתות מסונתזות ב-WebAudio ומתוזמנות לזמן-שרת (דיוק ברמת הדגימה — כל הטלפונים "נוחתים" יחד);
 * 8 רצפות = 8 צלילים. הקריין (עברית, ElevenLabs דרך היגספילד) = קבצי MP3 קטנים ב-/metro/voice/, נטענים עצל; בלעדיהם — שקט.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
export function mbAudioInit() {
  try {
    if (!ctx) { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination); }
    if (ctx.state === "suspended") ctx.resume();
  } catch { /* אין אודיו */ }
}
const ac = () => (ctx && ctx.state === "running" ? ctx : null);
const out = () => master!;
/** זמן-שרת → זמן AudioContext (serverNow = השעון המסונכרן של החיבור) */
export function mbAudioTime(serverAt: number, serverNow: number): number { const c = ac(); return c ? c.currentTime + Math.max(0, (serverAt - serverNow) / 1000) : 0; }

type Note = { f: number; t: number; d: number; type?: OscillatorType; g?: number; to?: number };
const live = new Set<{ stop: () => void }>();
function tone(notes: Note[], at: number, vol = 1, track = false) {
  const c = ac(); if (!c) return;
  const base = at || c.currentTime;
  for (const n of notes) {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = n.type || "sine"; o.frequency.setValueAtTime(n.f, base + n.t);
    if (n.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, n.to), base + n.t + n.d);
    g.gain.setValueAtTime(0.0001, base + n.t);
    g.gain.exponentialRampToValueAtTime((n.g ?? 0.2) * vol, base + n.t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, base + n.t + n.d);
    o.connect(g).connect(out()); o.start(base + n.t); o.stop(base + n.t + n.d + 0.05);
    if (track) { const h = { stop: () => { try { o.stop(); } catch { /* */ } } }; live.add(h); o.onended = () => live.delete(h); }
  }
}
let noiseBuf: AudioBuffer | null = null;
function noise(at: number, d: number, g = 0.12, f = 1200, type: BiquadFilterType = "lowpass", q = 1, track = false) {
  const c = ac(); if (!c) return;
  if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const data = noiseBuf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1; }
  const src = c.createBufferSource(); src.buffer = noiseBuf;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const gn = c.createGain(); const base = at || c.currentTime;
  gn.gain.setValueAtTime(g, base); gn.gain.exponentialRampToValueAtTime(0.0001, base + d);
  src.connect(fl).connect(gn).connect(out()); src.start(base); src.stop(base + d + 0.02);
  if (track) { const h = { stop: () => { try { src.stop(); } catch { /* */ } } }; live.add(h); src.onended = () => live.delete(h); }
}
/** ביטול נחיתות שכבר תוזמנו (הקובע שינה קצב) */
export function mbCancelScheduled() { for (const h of live) h.stop(); live.clear(); }

/** צליל הנחיתה של רצפה, בזמן at (AudioContext). vol 0..1 */
export function mbLand(sfx: string, at: number, vol = 1) {
  const c = ac(); if (!c) return;
  const T = true;
  switch (sfx) {
    case "wood": noise(at, 0.07, 0.22 * vol, 1700, "bandpass", 1.2, T); tone([{ f: 240, t: 0, d: 0.09, type: "sine", g: 0.28, to: 120 }], at, vol, T); break;
    case "tile": tone([{ f: 2600, t: 0, d: 0.05, type: "sine", g: 0.16 }, { f: 3900, t: 0, d: 0.03, type: "triangle", g: 0.08 }], at, vol, T); noise(at, 0.03, 0.1 * vol, 5000, "highpass", 1, T); break;
    case "rubber": tone([{ f: 150, t: 0, d: 0.17, type: "triangle", g: 0.32, to: 55 }], at, vol, T); noise(at, 0.08, 0.1 * vol, 380, "lowpass", 1, T); break;
    case "drum": noise(at, 0.13, 0.26 * vol, 1500, "bandpass", 0.8, T); tone([{ f: 190, t: 0, d: 0.12, type: "sine", g: 0.3, to: 90 }], at, vol, T); break;
    case "water": tone([{ f: 520, t: 0, d: 0.13, type: "sine", g: 0.22, to: 1500 }], at, vol, T); noise(at, 0.04, 0.05 * vol, 3000, "highpass", 1, T); break;
    case "beep": tone([{ f: 880, t: 0, d: 0.07, type: "square", g: 0.1 }, { f: 1320, t: 0.02, d: 0.06, type: "square", g: 0.06 }], at, vol, T); break;
    case "pop": tone([{ f: 950, t: 0, d: 0.06, type: "sine", g: 0.26, to: 320 }], at, vol, T); noise(at, 0.025, 0.12 * vol, 3500, "highpass", 1, T); break;
    case "thump": tone([{ f: 125, t: 0, d: 0.15, type: "sine", g: 0.3, to: 50 }], at, vol, T); noise(at, 0.1, 0.07 * vol, 320, "lowpass", 1, T); break;
    default: tone([{ f: 660, t: 0, d: 0.06, type: "triangle", g: 0.2 }], at, vol, T);
  }
}

export const mbSfx = {
  /** ההקשה שלי — כמעט שקטה, רק שיודעים שנרשמה (האוזן צריכה להישאר על המנהיג) */
  tap(good: 0 | 1 | 2 | 3) { const f = good === 3 ? 1200 : good === 2 ? 900 : good === 1 ? 700 : 420; tone([{ f, t: 0, d: 0.035, type: "sine", g: good ? 0.05 : 0.04 }], 0); },
  select() { tone([{ f: 660, t: 0, d: 0.06, type: "triangle", g: 0.1 }, { f: 990, t: 0.05, d: 0.08, type: "triangle", g: 0.1 }], 0); },
  levelTick(up: boolean) { tone([{ f: up ? 1100 : 800, t: 0, d: 0.04, type: "square", g: 0.05 }], 0); },
  count(n: number) { tone([{ f: n === 0 ? 990 : 660, t: 0, d: n === 0 ? 0.4 : 0.15, type: "triangle", g: n === 0 ? 0.3 : 0.2 }], 0); },
  lock() { tone([{ f: 523, t: 0, d: 0.1, type: "triangle", g: 0.18 }, { f: 784, t: 0.08, d: 0.14, type: "triangle", g: 0.2 }, { f: 1047, t: 0.16, d: 0.35, type: "triangle", g: 0.24 }], 0); },
  otherLock() { tone([{ f: 784, t: 0, d: 0.08, type: "sine", g: 0.07 }, { f: 1047, t: 0.06, d: 0.12, type: "sine", g: 0.07 }], 0); },
  unison() { tone([{ f: 392, t: 0, d: 0.16, type: "triangle", g: 0.22 }, { f: 494, t: 0.1, d: 0.16, type: "triangle", g: 0.24 }, { f: 587, t: 0.2, d: 0.16, type: "triangle", g: 0.26 }, { f: 784, t: 0.3, d: 0.7, type: "triangle", g: 0.3 }, { f: 988, t: 0.3, d: 0.7, type: "sine", g: 0.12 }], 0); },
  result() { tone([{ f: 523, t: 0, d: 0.1, type: "triangle", g: 0.14 }, { f: 659, t: 0.1, d: 0.1, type: "triangle", g: 0.14 }, { f: 784, t: 0.2, d: 0.25, type: "triangle", g: 0.16 }], 0); },
  win() { tone([{ f: 523, t: 0, d: 0.15, type: "triangle", g: 0.2 }, { f: 659, t: 0.15, d: 0.15, type: "triangle", g: 0.2 }, { f: 784, t: 0.3, d: 0.15, type: "triangle", g: 0.2 }, { f: 1047, t: 0.45, d: 0.6, type: "triangle", g: 0.3 }], 0); },
  wake() { tone([{ f: 300, t: 0, d: 0.12, type: "sine", g: 0.1, to: 700 }], 0); },
  sleep() { tone([{ f: 500, t: 0, d: 0.18, type: "sine", g: 0.06, to: 180 }], 0); },
};

/* ---------- קריין ---------- */
export type MbVoice = "intro" | "yourturn" | "listen" | "catch" | "lock" | "unison" | "next" | "winner" | "three" | "two" | "one" | "go" | "newtempo";
const voiceBufs = new Map<MbVoice, AudioBuffer | null>();
const voiceLead = new Map<MbVoice, number>();
/** כמה שקט יש בתחילת הקובץ — מדלגים עליו כדי ש"שלוש-שתיים-אחת" ינחתו בזמן */
function leadSilence(b: AudioBuffer): number {
  const d = b.getChannelData(0); const th = 0.02;
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i]) > th) return Math.max(0, i / b.sampleRate - 0.01);
  return 0;
}
const voiceLoading = new Set<MbVoice>();
function loadVoice(v: MbVoice) {
  const c = ctx; if (!c || voiceBufs.has(v) || voiceLoading.has(v)) return;
  voiceLoading.add(v);
  fetch(`/metro/voice/${v}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("404"))))
    .then((ab) => c.decodeAudioData(ab)).then((b) => { voiceBufs.set(v, b); voiceLead.set(v, leadSilence(b)); }).catch(() => voiceBufs.set(v, null)).finally(() => voiceLoading.delete(v));
}
export function mbPreloadVoices(list: MbVoice[]) { for (const v of list) loadVoice(v); }
let lastVoiceAt = 0;
/** מדבר אם הקובץ טעון; אחרת טוען לפעם הבאה. מונע דיבורים חופפים. */
export function mbSay(v: MbVoice, vol = 0.9) {
  const c = ac(); if (!c) return false;
  const b = voiceBufs.get(v);
  if (b === undefined) { loadVoice(v); return false; }
  if (!b) return false;
  const now = c.currentTime; if (now - lastVoiceAt < 0.35) return false; lastVoiceAt = now;
  const s = c.createBufferSource(); s.buffer = b; const g = c.createGain(); g.gain.value = vol;
  s.connect(g).connect(out()); s.start(0, voiceLead.get(v) ?? 0);
  return true;
}
