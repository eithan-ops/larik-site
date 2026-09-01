/**
 * "הגנבים" 🥷 — צד לקוח, גרייבוקס הליבה.
 *
 * מסך = חלון אישי על שדה אחד: הר במרכז, מאורה לכל שחקן בקצוות, והחוט —
 * הקו שמחבר אותך הביתה ומראה בכל רגע כמה אתה חשוף. התנועה שלך מנובאת
 * מקומית (אותה נוסחה כמו בשרת), הפרשים נמרחים — כמו בחופרים.
 * גרייבוקס: צורות וצבעים בלבד, אפס נכסים; הסאונד מסונתז.
 */
import { useEffect, useRef, useState } from "react";
import type { ThievesServerMsg } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";

const TS = 30;                     // פיקסלים לתא
const SPD = 6.0;                   // חייב להיות זהה לשרת
const CARRY_SLOW = 0.05;
const STOLEN_SLOW = 0.74;
const RAGE_MUL = 1.4;
const DEN_R = 2.0;
const PCOL = ["#FF8A3D", "#5AC8FA", "#46E0C0", "#F2C14E", "#E5484D", "#B37BE0", "#8ee34a", "#FF6FB5"];
const LVL_SIZE = [6, 9, 12];       // גודל הגביש לפי דרגת הבשלה
const RATE = [1, 3, 6];

interface Other { x: number; y: number; tx: number; ty: number; carry: number; stolen: number; rage: number; gold: number }
interface CItem { lvl: number; state: "den" | "carried" | "ground"; den: string; carrier: string; gx: number; gy: number; pulse: number }
interface Pop { x: number; y: number; t: string; col: string; l: number; sz: number }

export default function ThievesView({ room, me, conn, hub }: GameViewProps) {
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const [hud, setHud] = useState({ gold: 0, carry: 0, left: 0, mtnPct: 100, stolen: false, rage: false, alarm: false, empty: false });
  const [banner, setBanner] = useState<{ ic: string; t: string; s: string } | null>(null);
  const [toast, setToast] = useState("");
  const [feed, setFeed] = useState<{ id: number; tx: string }[]>([]);
  const [canSteal, setCanSteal] = useState(false);
  const feedId = useRef(1);

  const G = useRef({
    ready: false, w: 46, h: 30,
    mtn: { x: 23, y: 15, total: 1, left: 1 },
    dens: new Map<string, { x: number; y: number }>(),
    me: { x: 5, y: 5, carry: 0, stolen: 0, rageUntil: 0, gold: 0 },
    dir: { x: 0, y: 0 }, sent: { x: 0, y: 0 },
    others: new Map<string, Other>(),
    items: new Map<number, CItem>(),
    corr: { x: 0, y: 0 },
    cam: { x: 0, y: 0 },
    trail: [] as { x: number; y: number; l: number; col: string }[],
    pops: [] as Pop[],
    parts: [] as { x: number; y: number; vx: number; vy: number; l: number; col: string }[],
    ping: null as { x: number; y: number; col: string; t: number } | null,
    shake: 0, flash: 0, flashCol: "#fff", stop: 0,
    left: 0, endsAt: 0, alarm: false, empty: false,
    beepAt: 0,
    players: [] as { id: string; name: string }[],
  });

  const pcol = (pid: string) => PCOL[Math.max(0, G.current.players.findIndex((p) => p.id === pid)) % PCOL.length];
  const pname = (pid: string) => G.current.players.find((p) => p.id === pid)?.name ?? "מישהו";

  /* ---- סאונד מסונתז — אפס נכסים ---- */
  const audio = useRef<{ ctx: AudioContext | null; note: number; noteT: number }>({ ctx: null, note: 0, noteT: 0 });
  function aInit() {
    const ex = audio.current.ctx;
    if (ex) { if (ex.state === "suspended") ex.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audio.current.ctx = new AC();
    } catch { /* בלי אודיו */ }
  }
  function tone(f: number, d: number, type: OscillatorType, vol: number, slideTo?: number) {
    const a = audio.current; if (!a.ctx) return;
    const t = a.ctx.currentTime, o = a.ctx.createOscillator(), g = a.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(a.ctx.destination); o.start(t); o.stop(t + d + 0.05);
  }
  const PENT = [0, 2, 4, 7, 9, 12, 14, 16];
  function pentaTone(vol = 0.3) {          // המאורה שלך שרה — כל הפקדה/הבשלה היא הצליל הבא בסולם
    const a = audio.current, now = performance.now() / 1000;
    if (now - a.noteT > 3.2) a.note = 0; else a.note++;
    a.noteT = now;
    tone(392 * Math.pow(2, PENT[Math.min(a.note, PENT.length - 1)] / 12), 0.16, "triangle", vol);
  }
  const bell = () => { tone(880, 0.5, "triangle", 0.28); tone(1320, 0.4, "sine", 0.14); };     // 🔔 פעמון ההבשלה
  const alarmSiren = () => { tone(520, 0.28, "square", 0.22, 700); tone(700, 0.28, "square", 0.2, 520); };

  function addFeed(tx: string) {
    setFeed((f) => [...f.slice(-2), { id: feedId.current++, tx }]);
  }
  const denRate = (pid: string) => {
    let r = 0;
    for (const it of G.current.items.values()) if (it.state === "den" && it.den === pid) r += RATE[it.lvl];
    return r;
  };

  /* ---- הודעות מהשרת ---- */
  useEffect(() => {
    const g = G.current;
    return hub.subscribe((raw) => {
      const d = raw as ThievesServerMsg;
      switch (d.a) {
        case "th_init": {
          g.w = d.w; g.h = d.h;
          g.mtn = { x: d.mtn.x, y: d.mtn.y, total: d.mtn.total, left: d.mtn.total };
          g.dens.clear();
          for (const [pid, x, y] of d.dens) g.dens.set(pid, { x, y });
          const mine = g.dens.get(me);
          if (mine && !g.ready) { g.me.x = mine.x; g.me.y = mine.y; g.cam.x = mine.x * TS; g.cam.y = mine.y * TS; }
          g.endsAt = d.endsAt; g.ready = true;
          break;
        }
        case "th_sync": {
          g.mtn.left = d.mtn;
          g.items.clear();
          for (const [id, den, lvl] of d.items) g.items.set(id, { lvl, state: "den", den, carrier: "", gx: 0, gy: 0, pulse: 0 });
          for (const [id, x, y, lvl] of d.ground) g.items.set(id, { lvl, state: "ground", den: "", carrier: "", gx: x, gy: y, pulse: 0 });
          for (const [id, carrier, lvl] of d.carried) g.items.set(id, { lvl, state: "carried", den: "", carrier, gx: 0, gy: 0, pulse: 0 });
          if ([...g.items.values()].some((it) => it.state === "carried" && it.carrier === me)) g.me.stolen = 1;
          g.endsAt = d.endsAt;
          break;
        }
        case "th_pos": {
          for (const [pid, x, y, carry, stolen, gold, rage] of d.ps) {
            if (pid === me) {
              const gap = Math.hypot(x - g.me.x, y - g.me.y);
              if (gap > 3) { g.me.x = x; g.me.y = y; g.corr.x = 0; g.corr.y = 0; }
              else if (gap > 0.6) { g.corr.x = x - g.me.x; g.corr.y = y - g.me.y; }
              g.me.carry = carry; g.me.gold = gold;
              if (!stolen) g.me.stolen = 0;
              setHud((h) => (h.gold === gold && h.carry === carry ? h : { ...h, gold, carry }));
              continue;
            }
            const o = g.others.get(pid) ?? { x, y, tx: x, ty: y, carry, stolen, rage, gold };
            o.tx = x; o.ty = y; o.carry = carry; o.stolen = stolen; o.rage = rage; o.gold = gold;
            g.others.set(pid, o);
          }
          g.mtn.left = d.mtn; g.left = d.left;
          setHud((h) => {
            const pct = Math.round((d.mtn / Math.max(1, g.mtn.total)) * 100);
            return h.left === d.left && h.mtnPct === pct ? h : { ...h, left: d.left, mtnPct: pct };
          });
          break;
        }
        case "th_mine":
          if (d.pid === me) { tone(210, 0.07, "square", 0.18); g.parts.push(...burst(g.mtn.x, g.mtn.y, "#C8B78E", 4)); }
          break;
        case "th_dep": {
          const now = performance.now();
          for (const id of d.ids) g.items.set(id, { lvl: 0, state: "den", den: d.pid, carrier: "", gx: 0, gy: 0, pulse: 1 });
          if (d.pid === me) { for (let i = 0; i < d.ids.length; i++) setTimeout(() => pentaTone(0.32), i * 110); g.me.carry = 0; }
          void now;
          break;
        }
        case "th_ripen": {
          const it = g.items.get(d.id);
          if (it) { it.lvl = d.lvl; it.pulse = 1; }
          if (d.den === me) pentaTone(0.34);                    // רק המאורה שלך שרה
          if (d.lvl === 2) {                                    // 🔔 הבשלה מלאה — כל החדר שומע
            bell();
            const den = g.dens.get(d.den);
            if (den) g.ping = { x: den.x, y: den.y, col: pcol(d.den), t: 4 };
            if (d.den !== me) addFeed(`🔔 גביש בשל אצל ${pname(d.den)}!`);
          }
          break;
        }
        case "th_grab": {
          const it = g.items.get(d.id) ?? { lvl: d.lvl, state: "carried" as const, den: d.from, carrier: d.by, gx: 0, gy: 0, pulse: 0 };
          it.lvl = d.lvl; it.state = "carried"; it.carrier = d.by; it.den = d.from;
          g.items.set(d.id, it);
          if (d.by === me) { g.me.stolen = 1; tone(660, 0.12, "sawtooth", 0.2, 440); setToast("🥷 רוץ הביתה!!"); setHud((h) => ({ ...h, stolen: true })); }
          if (d.from === me) {
            g.shake = 12; g.flash = 0.2; g.flashCol = "#E5484D";
            tone(760, 0.16, "square", 0.3, 560); tone(560, 0.16, "square", 0.26, 420);
            setToast(`😱 ${pname(d.by)} גנב לך את הגביש!`);
          }
          addFeed(`🥷 ${pname(d.by)} גנב מ${pname(d.from)}!`);
          break;
        }
        case "th_tackle": {
          g.shake = Math.max(g.shake, 8); tone(95, 0.14, "square", 0.3);
          if (d.carrier === me) { g.me.stolen = 0; setToast("💥 הפילו אותך!"); setHud((h) => ({ ...h, stolen: false })); }
          addFeed(`💥 ${pname(d.by)} הפיל את ${pname(d.carrier)}!`);
          break;
        }
        case "th_drop": {
          const it = g.items.get(d.id);
          if (it) { it.state = "ground"; it.carrier = ""; it.gx = d.x; it.gy = d.y; it.pulse = 1; }
          g.parts.push(...burst(d.x, d.y, "#F2C14E", 8));
          break;
        }
        case "th_pick": {
          const it = g.items.get(d.id);
          if (it) { it.state = "carried"; it.carrier = d.by; }
          if (d.by === me) { g.me.stolen = 1; tone(500, 0.09, "triangle", 0.24); setHud((h) => ({ ...h, stolen: true })); }
          break;
        }
        case "th_home": {
          const it = g.items.get(d.id);
          if (it) { it.state = "den"; it.den = d.by; it.carrier = ""; it.pulse = 1; }
          if (d.by === me) {
            g.me.stolen = 0; setHud((h) => ({ ...h, stolen: false }));
            if (d.from === me) { setToast("🏠 החזרת את הגביש שלך!"); tone(520, 0.2, "triangle", 0.3); }
            else { setToast("💰 השלל שלך!"); tone(392, 0.1, "triangle", 0.3); tone(523, 0.1, "triangle", 0.3); setTimeout(() => tone(659, 0.16, "triangle", 0.32), 90); }
          } else if (d.from === me) {
            tone(300, 0.25, "sine", 0.16, 200);                 // שלילי — נמוך ושקט מהחיובי
            setToast(`📄 ${pname(d.by)} לקח את הגביש שלך הביתה`);
          }
          if (d.from !== d.by) addFeed(`🏠 ${pname(d.by)} הביא שלל של ${pname(d.from)}`);
          break;
        }
        case "th_rage":
          if (d.pid === me) { g.me.rageUntil = performance.now() + d.secs * 1000; setHud((h) => ({ ...h, rage: true })); tone(180, 0.3, "sawtooth", 0.22, 420); setTimeout(() => setHud((h) => ({ ...h, rage: false })), d.secs * 1000); }
          break;
        case "th_first":
          setBanner({ ic: "⚔️", t: `${pname(d.by)} פתח את המלחמה!`, s: `הגניבה הראשונה — מ${pname(d.from)}` });
          setTimeout(() => setBanner(null), 2600);
          alarmSiren();
          break;
        case "th_empty":
          g.empty = true; setHud((h) => ({ ...h, empty: true }));
          setBanner({ ic: "⛰️", t: "ההר נגמר!", s: "הזהב היחיד שנשאר — אצל החברים שלכם" });
          setTimeout(() => setBanner(null), 3000);
          tone(200, 0.5, "sawtooth", 0.24, 120); g.shake = Math.max(g.shake, 10);
          break;
        case "th_alarm":
          g.alarm = true; setHud((h) => ({ ...h, alarm: true }));
          setBanner({ ic: "🚨", t: "דקה אחרונה!", s: "כל ההכנסות פי 3" });
          setTimeout(() => setBanner(null), 2600);
          alarmSiren(); setTimeout(alarmSiren, 400);
          break;
        case "th_left": g.others.delete(d.pid); break;
      }
    });
  }, [hub, me]);

  useEffect(() => { G.current.players = room.players.map((p) => ({ id: p.id, name: p.name })); }, [room.players]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2400); return () => clearTimeout(t); }, [toast]);

  /* ---- קלט: ג'ויסטיק צף אנלוגי ---- */
  const joy = useRef({ on: false, ox: 0, oy: 0, dx: 0, dy: 0 });
  useEffect(() => {
    const g = G.current;
    function sendDir(force = false) {
      const j = joy.current;
      let dx = Math.abs(j.dx) > 0.14 ? j.dx : 0, dy = Math.abs(j.dy) > 0.14 ? j.dy : 0;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      dx = Math.round(dx * 20) / 20; dy = Math.round(dy * 20) / 20;
      if (force || Math.abs(dx - g.sent.x) > 0.08 || Math.abs(dy - g.sent.y) > 0.08 || (!dx && !dy && (g.sent.x || g.sent.y))) {
        g.sent = { x: dx, y: dy }; g.dir = { x: dx, y: dy };
        conn.sendGame({ a: "th_dir", dx, dy });
      } else g.dir = { x: dx, y: dy };
    }
    const pos = (e: TouchEvent | MouseEvent) => {
      const t = (e as TouchEvent).touches?.[0] ?? (e as MouseEvent);
      return { x: t.clientX, y: t.clientY };
    };
    const down = (e: TouchEvent | MouseEvent) => {
      aInit();
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      const el = e.target as HTMLElement;
      if (el?.closest("button")) return;
      const p = pos(e); joy.current = { on: true, ox: p.x, oy: p.y, dx: 0, dy: 0 };
      if (e.cancelable) e.preventDefault();
    };
    const move = (e: TouchEvent | MouseEvent) => {
      const j = joy.current; if (!j.on) return;
      const p = pos(e); let dx = p.x - j.ox, dy = p.y - j.oy;
      const d = Math.hypot(dx, dy), R = 46;
      if (d > R) { j.ox += (dx / d) * (d - R); j.oy += (dy / d) * (d - R); dx = p.x - j.ox; dy = p.y - j.oy; }
      j.dx = dx / R; j.dy = dy / R; sendDir();
      if (e.cancelable) e.preventDefault();
    };
    const up = () => { joy.current.on = false; joy.current.dx = 0; joy.current.dy = 0; sendDir(true); };
    const key = (e: KeyboardEvent, on: boolean) => {
      const j = joy.current, k = e.key;
      if (k === "ArrowLeft" || k === "a") j.dx = on ? -1 : 0;
      else if (k === "ArrowRight" || k === "d") j.dx = on ? 1 : 0;
      else if (k === "ArrowUp" || k === "w") j.dy = on ? -1 : 0;
      else if (k === "ArrowDown" || k === "s") j.dy = on ? 1 : 0;
      else return;
      e.preventDefault(); sendDir();
    };
    const kd = (e: KeyboardEvent) => key(e, true), ku = (e: KeyboardEvent) => key(e, false);
    const iv = setInterval(() => { if (joy.current.on || joy.current.dx || joy.current.dy) sendDir(true); }, 900); // רשת ביטחון לדריפט
    window.addEventListener("touchstart", down, { passive: false });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up); window.addEventListener("touchcancel", up);
    window.addEventListener("mousedown", down); window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    return () => {
      clearInterval(iv);
      window.removeEventListener("touchstart", down); window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up); window.removeEventListener("touchcancel", up);
      window.removeEventListener("mousedown", down); window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [conn]);

  /* ---- הלולאה ---- */
  useEffect(() => {
    const cv0 = cvRef.current; if (!cv0) return;
    const cv: HTMLCanvasElement = cv0;
    const ctx2 = cv.getContext("2d", { alpha: false })!;
    let raf = 0, last = 0, W = 0, H = 0, DPR = 1, stealChk = 0;
    const g = G.current;

    const resize = () => {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth || window.innerWidth;
      H = cv.clientHeight || window.innerHeight;
      cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
    };
    resize();
    window.addEventListener("resize", resize);

    const mtnR = () => (g.mtn.left <= 0 ? 0 : 1.6 + 2.8 * Math.sqrt(g.mtn.left / Math.max(1, g.mtn.total)));

    function denShape(x: number, y: number, r: number, idx: number, fill: string, stroke: string, lw: number) {
      const sides = [4, 6, 3, 5, 8, 4, 6, 3][idx % 8];
      const rot = idx % 2 ? Math.PI / sides : -Math.PI / 2;
      ctx2.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (i === 0) ctx2.moveTo(px, py); else ctx2.lineTo(px, py);
      }
      ctx2.closePath();
      ctx2.fillStyle = fill; ctx2.fill();
      ctx2.strokeStyle = stroke; ctx2.lineWidth = lw; ctx2.stroke();
    }

    function frame(ts: number) {
      raf = requestAnimationFrame(frame);
      if (!last) last = ts;
      const wantW = cv.clientWidth || window.innerWidth, wantH = cv.clientHeight || window.innerHeight;
      if (wantW && wantH && (Math.abs(wantW - W) > 1 || Math.abs(wantH - H) > 1)) resize();
      let dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      if (g.stop > 0) { g.stop -= dt; dt *= 0.06; }
      if (!g.ready) { ctx2.setTransform(DPR, 0, 0, DPR, 0, 0); ctx2.fillStyle = "#14100C"; ctx2.fillRect(0, 0, W, H); return; }

      /* ניבוי מקומי — אותה נוסחה כמו בשרת */
      const m = g.me;
      const raging = performance.now() < m.rageUntil;
      if (g.dir.x || g.dir.y) {
        let s = SPD * (1 - CARRY_SLOW * m.carry);
        if (m.stolen) s *= STOLEN_SLOW;
        if (raging) s *= RAGE_MUL;
        m.x = Math.max(1, Math.min(g.w - 1, m.x + g.dir.x * s * dt));
        m.y = Math.max(1, Math.min(g.h - 1, m.y + g.dir.y * s * dt));
        const r = mtnR();
        if (r > 0) {
          const ddx = m.x - g.mtn.x, ddy = m.y - g.mtn.y, d = Math.hypot(ddx, ddy);
          if (d < r && d > 0.001) { m.x = g.mtn.x + (ddx / d) * r; m.y = g.mtn.y + (ddy / d) * r; }
        }
      }
      if (g.corr.x || g.corr.y) {
        const k = Math.min(1, dt * 4);
        m.x += g.corr.x * k; m.y += g.corr.y * k;
        g.corr.x *= 1 - k; g.corr.y *= 1 - k;
        if (Math.abs(g.corr.x) < 0.01 && Math.abs(g.corr.y) < 0.01) { g.corr.x = 0; g.corr.y = 0; }
      }
      if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 40);
      if (g.flash > 0) g.flash -= dt;
      for (const o of g.others.values()) { o.x += (o.tx - o.x) * Math.min(1, dt * 12); o.y += (o.ty - o.y) * Math.min(1, dt * 12); }
      for (let i = g.trail.length - 1; i >= 0; i--) { g.trail[i].l -= dt * 1.6; if (g.trail[i].l <= 0) g.trail.splice(i, 1); }
      for (let i = g.pops.length - 1; i >= 0; i--) { g.pops[i].l -= dt; g.pops[i].y -= dt * 1.2; if (g.pops[i].l <= 0) g.pops.splice(i, 1); }
      for (let i = g.parts.length - 1; i >= 0; i--) { const p = g.parts[i]; p.l -= dt; if (p.l <= 0) { g.parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 7 * dt; }
      for (const it of g.items.values()) if (it.pulse > 0) it.pulse = Math.max(0, it.pulse - dt * 2.2);
      if (g.ping) { g.ping.t -= dt; if (g.ping.t <= 0) g.ping = null; }

      // שובל לכל סוחב שלל
      if (m.stolen && Math.random() < 0.6) g.trail.push({ x: m.x, y: m.y, l: 1, col: pcol(me) });
      for (const [pid, o] of g.others.entries()) if (o.stolen && Math.random() < 0.6) g.trail.push({ x: o.x, y: o.y, l: 1, col: pcol(pid) });

      // מצלמה
      const txc = m.x * TS - W / 2, tyc = m.y * TS - H / 2;
      g.cam.x += (txc - g.cam.x) * Math.min(1, dt * 7); g.cam.y += (tyc - g.cam.y) * Math.min(1, dt * 7);
      if (g.w * TS > W) g.cam.x = Math.max(-TS, Math.min(g.w * TS - W + TS, g.cam.x)); else g.cam.x = -(W - g.w * TS) / 2;
      if (g.h * TS > H) g.cam.y = Math.max(-TS, Math.min(g.h * TS - H + TS, g.cam.y)); else g.cam.y = -(H - g.h * TS) / 2;

      /* ציור */
      ctx2.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx2.fillStyle = "#100D0A"; ctx2.fillRect(0, 0, W, H);
      const sx = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0, sy = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0;
      ctx2.save(); ctx2.translate(-g.cam.x + sx, -g.cam.y + sy);

      // הרצפה — נייר חם עם נקודות דפוס עדינות
      ctx2.fillStyle = "#1B1510"; ctx2.fillRect(0, 0, g.w * TS, g.h * TS);
      ctx2.fillStyle = "rgba(243,231,211,.045)";
      for (let yy = 1; yy < g.h; yy += 2) for (let xx = 1 + (yy % 4 === 1 ? 0 : 1); xx < g.w; xx += 2) ctx2.fillRect(xx * TS - 1, yy * TS - 1, 2, 2);
      ctx2.strokeStyle = "#3A2E22"; ctx2.lineWidth = 5; ctx2.strokeRect(2, 2, g.w * TS - 4, g.h * TS - 4);

      // החוט שלי — הלב הוויזואלי של המשחק
      const myDen = g.dens.get(me);
      if (myDen) {
        const dx = myDen.x - m.x, dy = myDen.y - m.y, dist = Math.hypot(dx, dy);
        const maxD = Math.hypot(g.w, g.h) * 0.55, frac = Math.min(1, dist / maxD);
        const puls = frac > 0.72 ? 0.5 + 0.5 * Math.sin(ts / 90) : 1;
        ctx2.strokeStyle = pcol(me);
        ctx2.globalAlpha = (0.22 + frac * 0.6) * puls;
        ctx2.lineWidth = 3.4 - frac * 2;
        ctx2.beginPath();
        ctx2.moveTo(m.x * TS, m.y * TS);
        const mx = (m.x + myDen.x) / 2, myy = (m.y + myDen.y) / 2 - (2.4 - frac * 2.1);
        ctx2.quadraticCurveTo(mx * TS, myy * TS, myDen.x * TS, myDen.y * TS);
        ctx2.stroke();
        ctx2.globalAlpha = 1;
      }

      // ההר
      const r = mtnR();
      if (r > 0) {
        ctx2.save();
        ctx2.translate(g.mtn.x * TS, g.mtn.y * TS);
        ctx2.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2, wob = 1 + 0.14 * Math.sin(i * 3.7);
          const px = Math.cos(a) * r * TS * wob, py = Math.sin(a) * r * TS * wob;
          if (i === 0) ctx2.moveTo(px, py); else ctx2.lineTo(px, py);
        }
        ctx2.closePath();
        ctx2.fillStyle = "#57524C"; ctx2.fill();
        ctx2.strokeStyle = "#2C2825"; ctx2.lineWidth = 4; ctx2.stroke();
        // ניצוצות זהב לפי כמה נשאר
        const specks = Math.max(2, Math.round((g.mtn.left / Math.max(1, g.mtn.total)) * 14));
        ctx2.fillStyle = "#F2C14E";
        for (let i = 0; i < specks; i++) {
          const a = i * 2.399 + 0.6, rr = r * TS * 0.62 * ((i % 5) / 5 + 0.2);
          ctx2.beginPath(); ctx2.arc(Math.cos(a) * rr, Math.sin(a) * rr, 3, 0, 6.283); ctx2.fill();
        }
        ctx2.font = "800 13px Assistant, sans-serif"; ctx2.textAlign = "center";
        ctx2.fillStyle = "#0009"; ctx2.fillText(`⛰️ ${g.mtn.left}`, 1, -r * TS - 9);
        ctx2.fillStyle = "#E8D9BC"; ctx2.fillText(`⛰️ ${g.mtn.left}`, 0, -r * TS - 10);
        ctx2.restore();
      } else {
        ctx2.font = "800 13px Assistant, sans-serif"; ctx2.textAlign = "center";
        ctx2.fillStyle = "#6B5F4E"; ctx2.fillText("⛰️ ההר נגמר", g.mtn.x * TS, g.mtn.y * TS);
      }

      // מאורות + גבישים
      for (const [pid, den] of g.dens.entries()) {
        const idx = Math.max(0, g.players.findIndex((p) => p.id === pid));
        const col = pcol(pid), isMe = pid === me;
        const wealth = denRate(pid);
        const glow = Math.min(26, 4 + wealth * 1.6);
        ctx2.save();
        ctx2.shadowColor = col; ctx2.shadowBlur = glow;               // מאורה עשירה זוהרת — העושר פומבי
        denShape(den.x * TS, den.y * TS, DEN_R * TS * 0.72, idx, "rgba(20,16,12,.92)", col, isMe ? 4.5 : 3);
        ctx2.restore();
        // טבעת רדיוס המאורה
        ctx2.strokeStyle = col; ctx2.globalAlpha = 0.16; ctx2.lineWidth = 2;
        ctx2.beginPath(); ctx2.arc(den.x * TS, den.y * TS, DEN_R * TS, 0, 6.283); ctx2.stroke();
        ctx2.globalAlpha = 1;
        // הגבישים שבפנים
        const its = [...g.items.values()].filter((it) => it.state === "den" && it.den === pid);
        its.forEach((it, i) => {
          const n = its.length, ang = (i / Math.max(1, n)) * Math.PI * 2 + idx;
          const ix = den.x * TS + Math.cos(ang) * TS * 0.85, iy = den.y * TS + Math.sin(ang) * TS * 0.85;
          const sz = LVL_SIZE[it.lvl] * (1 + it.pulse * 0.7) * (it.lvl === 2 ? 1 + 0.1 * Math.sin(ts / 160) : 1);
          ctx2.save(); ctx2.translate(ix, iy); ctx2.rotate(Math.PI / 4);
          ctx2.fillStyle = it.lvl === 2 ? "#FFE082" : it.lvl === 1 ? "#F2C14E" : "#B9C46E";
          ctx2.shadowColor = "#F2C14E"; ctx2.shadowBlur = it.lvl * 7;
          ctx2.fillRect(-sz / 2, -sz / 2, sz, sz);
          ctx2.restore();
        });
        // שם
        ctx2.font = `800 ${isMe ? 13 : 11}px Assistant, sans-serif`; ctx2.textAlign = "center";
        const nm = (isMe ? "🏠 " : "") + pname(pid);
        ctx2.fillStyle = "#000"; ctx2.fillText(nm, den.x * TS + 1, den.y * TS + DEN_R * TS + 15);
        ctx2.fillStyle = col; ctx2.fillText(nm, den.x * TS, den.y * TS + DEN_R * TS + 14);
      }

      // שלל על הרצפה — כולם רואים, מי שמגיע ראשון
      for (const [, it] of g.items.entries()) {
        if (it.state !== "ground") continue;
        const sz = LVL_SIZE[it.lvl] + 4 + 2 * Math.sin(ts / 130);
        ctx2.save(); ctx2.translate(it.gx * TS, it.gy * TS); ctx2.rotate(ts / 500);
        ctx2.fillStyle = "#FFE082"; ctx2.shadowColor = "#FFD152"; ctx2.shadowBlur = 16;
        ctx2.fillRect(-sz / 2, -sz / 2, sz, sz);
        ctx2.restore();
      }

      // פעימת פינג (פעמון)
      if (g.ping) {
        const u = 1 - (g.ping.t % 1);
        ctx2.strokeStyle = g.ping.col; ctx2.globalAlpha = (1 - u) * 0.7; ctx2.lineWidth = 3;
        ctx2.beginPath(); ctx2.arc(g.ping.x * TS, g.ping.y * TS, TS * (0.6 + u * 2.4), 0, 6.283); ctx2.stroke();
        ctx2.globalAlpha = 1;
      }

      // שובלים
      for (const t of g.trail) {
        ctx2.globalAlpha = t.l * 0.5; ctx2.fillStyle = t.col;
        ctx2.beginPath(); ctx2.arc(t.x * TS, t.y * TS, 5 * t.l, 0, 6.283); ctx2.fill();
      }
      ctx2.globalAlpha = 1;

      // שחקנים
      const drawPlayer = (pid: string, x: number, y: number, carry: number, stolen: number, rage: number, isMe: boolean) => {
        const col = pcol(pid);
        ctx2.save();
        if (stolen) { ctx2.shadowColor = col; ctx2.shadowBlur = 24; }        // הדבר היחיד שזורח חזק בשדה
        if (rage) { ctx2.shadowColor = "#FF4438"; ctx2.shadowBlur = 18; }
        ctx2.fillStyle = col;
        ctx2.beginPath(); ctx2.arc(x * TS, y * TS, isMe ? 12 : 10.5, 0, 6.283); ctx2.fill();
        ctx2.strokeStyle = isMe ? "#F3E7D3" : "#0008"; ctx2.lineWidth = isMe ? 3 : 2; ctx2.stroke();
        ctx2.restore();
        // צ'אנקים שהוא סוחב
        for (let i = 0; i < carry; i++) {
          const a = ts / 400 + (i / 3) * Math.PI * 2;
          ctx2.fillStyle = "#C8B78E";
          ctx2.beginPath(); ctx2.arc(x * TS + Math.cos(a) * 17, y * TS + Math.sin(a) * 17, 4, 0, 6.283); ctx2.fill();
        }
        // שלל גנוב מעל הראש
        if (stolen) {
          const sz2 = 11 + 2 * Math.sin(ts / 110);
          ctx2.save(); ctx2.translate(x * TS, y * TS - 21); ctx2.rotate(Math.PI / 4);
          ctx2.fillStyle = "#FFE082"; ctx2.shadowColor = "#FFD152"; ctx2.shadowBlur = 12;
          ctx2.fillRect(-sz2 / 2, -sz2 / 2, sz2, sz2);
          ctx2.restore();
        }
        if (rage) { ctx2.font = "13px sans-serif"; ctx2.textAlign = "center"; ctx2.fillText("🔥", x * TS, y * TS - (stolen ? 34 : 20)); }
        ctx2.font = "800 11px Assistant, sans-serif"; ctx2.textAlign = "center";
        const nm = pname(pid);
        ctx2.fillStyle = "#000"; ctx2.fillText(nm, x * TS + 1, y * TS + 25);
        ctx2.fillStyle = isMe ? "#F3E7D3" : col; ctx2.fillText(nm, x * TS, y * TS + 24);
      };
      for (const [pid, o] of g.others.entries()) drawPlayer(pid, o.x, o.y, o.carry, o.stolen, o.rage, false);
      drawPlayer(me, m.x, m.y, m.carry, m.stolen ? 1 : 0, raging ? 1 : 0, true);

      for (const p of g.parts) { ctx2.globalAlpha = Math.max(0, p.l); ctx2.fillStyle = p.col; ctx2.fillRect(p.x * TS - 2, p.y * TS - 2, 4, 4); }
      ctx2.globalAlpha = 1;
      for (const p of g.pops) {
        ctx2.globalAlpha = Math.min(1, p.l); ctx2.font = `800 ${p.sz}px Assistant, sans-serif`; ctx2.textAlign = "center";
        ctx2.fillStyle = "#000"; ctx2.fillText(p.t, p.x * TS + 1, p.y * TS + 1);
        ctx2.fillStyle = p.col; ctx2.fillText(p.t, p.x * TS, p.y * TS);
      }
      ctx2.globalAlpha = 1;
      ctx2.restore();

      // וינייטת אזעקה
      if (g.alarm) {
        ctx2.fillStyle = `rgba(229,72,77,${0.06 + 0.05 * Math.sin(ts / 220)})`;
        ctx2.fillRect(0, 0, W, H);
      }
      if (g.flash > 0) { ctx2.globalAlpha = Math.min(0.5, g.flash * 1.6); ctx2.fillStyle = g.flashCol; ctx2.fillRect(0, 0, W, H); ctx2.globalAlpha = 1; }

      // 🧭 חץ אל הגנב שסוחב את הגביש שלי + פעימה שמתגברת ככל שהוא מתקרב הביתה
      let thiefPid = "", thiefX = 0, thiefY = 0;
      for (const it of g.items.values()) {
        if (it.state === "carried" && it.den === me && it.carrier !== me) {
          thiefPid = it.carrier;
          const o = g.others.get(it.carrier);
          if (o) { thiefX = o.x; thiefY = o.y; }
        }
      }
      if (thiefPid) {
        const tdx = thiefX * TS - g.cam.x - (m.x * TS - g.cam.x), tdy = thiefY * TS - g.cam.y - (m.y * TS - g.cam.y);
        ctx2.save(); ctx2.translate(W / 2, 92); ctx2.rotate(Math.atan2(tdy, tdx));
        ctx2.globalAlpha = 0.65 + 0.35 * Math.sin(ts / 100);
        ctx2.fillStyle = pcol(thiefPid); ctx2.strokeStyle = "#000"; ctx2.lineWidth = 2;
        ctx2.beginPath(); ctx2.moveTo(18, 0); ctx2.lineTo(-10, -10); ctx2.lineTo(-5, 0); ctx2.lineTo(-10, 10); ctx2.closePath();
        ctx2.fill(); ctx2.stroke(); ctx2.restore(); ctx2.globalAlpha = 1;
        ctx2.font = "800 12px Assistant, sans-serif"; ctx2.textAlign = "center";
        ctx2.fillStyle = "#F3E7D3"; ctx2.fillText(`🏃 ${pname(thiefPid)} עם הגביש שלך!`, W / 2, 74);
        // פעימה לפי כמה הוא קרוב לבית שלו
        const hisDen = g.dens.get(thiefPid);
        if (hisDen && audio.current.ctx) {
          const dHome = Math.hypot(thiefX - hisDen.x, thiefY - hisDen.y);
          const iv2 = Math.max(180, Math.min(1100, dHome * 70));
          if (ts - g.beepAt > iv2) { g.beepAt = ts; tone(740, 0.05, "square", 0.14); }
        }
      }

      // 🗺️ מיני-מפה — החוטים של כולם
      const MW = 132, MH = Math.round(MW * (g.h / g.w)), MX = W - MW - 10, MY = 64;
      ctx2.fillStyle = "rgba(16,13,10,.86)"; ctx2.fillRect(MX, MY, MW, MH);
      ctx2.strokeStyle = "#3A2E22"; ctx2.lineWidth = 2; ctx2.strokeRect(MX, MY, MW, MH);
      const mx2 = (x: number) => MX + (x / g.w) * MW, my2 = (y: number) => MY + (y / g.h) * MH;
      if (r > 0) { ctx2.fillStyle = "#57524C"; ctx2.beginPath(); ctx2.arc(mx2(g.mtn.x), my2(g.mtn.y), (r / g.w) * MW, 0, 6.283); ctx2.fill(); }
      for (const [pid, den] of g.dens.entries()) {
        const col = pcol(pid);
        const pos2 = pid === me ? m : g.others.get(pid);
        if (pos2) {                                            // החוט — מידע הוא הפעולה
          ctx2.strokeStyle = col; ctx2.globalAlpha = 0.55; ctx2.lineWidth = 1;
          ctx2.beginPath(); ctx2.moveTo(mx2(pos2.x), my2(pos2.y)); ctx2.lineTo(mx2(den.x), my2(den.y)); ctx2.stroke();
          ctx2.globalAlpha = 1;
        }
        ctx2.fillStyle = col; ctx2.fillRect(mx2(den.x) - 2.5, my2(den.y) - 2.5, 5, 5);
      }
      for (const [pid, o] of g.others.entries()) {
        ctx2.fillStyle = pcol(pid);
        ctx2.beginPath(); ctx2.arc(mx2(o.x), my2(o.y), o.stolen ? 3.6 : 2.3, 0, 6.283); ctx2.fill();
        if (o.stolen) { ctx2.strokeStyle = "#fff"; ctx2.lineWidth = 1; ctx2.stroke(); }
      }
      ctx2.fillStyle = "#F3E7D3"; ctx2.beginPath(); ctx2.arc(mx2(m.x), my2(m.y), 3, 0, 6.283); ctx2.fill();

      // ג'ויסטיק
      if (joy.current.on) {
        ctx2.strokeStyle = "rgba(243,231,211,.35)"; ctx2.lineWidth = 3;
        ctx2.beginPath(); ctx2.arc(joy.current.ox, joy.current.oy, 46, 0, 6.283); ctx2.stroke();
        ctx2.fillStyle = "rgba(255,138,61,.85)";
        ctx2.beginPath(); ctx2.arc(joy.current.ox + joy.current.dx * 46, joy.current.oy + joy.current.dy * 46, 20, 0, 6.283); ctx2.fill();
      }

      // כפתור הגניבה — בדיקה מדי ~180ms
      if (ts - stealChk > 180) {
        stealChk = ts;
        let ok = false;
        if (!m.stolen) {
          for (const [pid, den] of g.dens.entries()) {
            if (pid === me) continue;
            if (Math.hypot(m.x - den.x, m.y - den.y) <= DEN_R &&
                [...g.items.values()].some((it) => it.state === "den" && it.den === pid)) { ok = true; break; }
          }
        }
        setCanSteal((c) => (c === ok ? c : ok));
      }
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [me]);

  const mins = Math.floor(hud.left / 60), secs = String(hud.left % 60).padStart(2, "0");

  return (
    <div style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh", zIndex: 60, background: "#100D0A", overflow: "hidden", touchAction: "none", direction: "rtl" }}>
      <canvas ref={cvRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />

      {/* שעון + הר */}
      <div style={{
        position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 10px)", left: "50%", transform: "translateX(-50%)",
        background: hud.alarm ? "rgba(120,20,20,.92)" : "rgba(16,13,10,.85)", border: `2px solid ${hud.alarm ? "#E5484D" : "#3A2E22"}`,
        borderRadius: 14, padding: "5px 14px", color: "#F3E7D3", fontWeight: 800, fontFamily: "Assistant, sans-serif",
        fontSize: 15, display: "flex", gap: 12, alignItems: "center", whiteSpace: "nowrap",
      }}>
        <span>{hud.alarm ? "🚨" : "⏱"} {mins}:{secs}</span>
        <span style={{ opacity: 0.85 }}>{hud.empty ? "⚔️ מלחמה" : `⛰️ ${hud.mtnPct}%`}</span>
      </div>

      {/* הזהב שלי */}
      <div style={{
        position: "absolute", bottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)", right: 14,
        background: "rgba(16,13,10,.85)", border: "2px solid #3A2E22", borderRadius: 14, padding: "6px 14px",
        color: "#F2C14E", fontWeight: 800, fontFamily: "Assistant, sans-serif", fontSize: 20,
      }}>
        💰 {hud.gold.toLocaleString()}
        {hud.carry > 0 && <span style={{ fontSize: 13, color: "#C8B78E", marginRight: 8 }}>+{hud.carry} ביד</span>}
        {hud.rage && <span style={{ fontSize: 13, color: "#FF6B5E", marginRight: 8 }}>🔥 זעם!</span>}
      </div>

      {/* פיד הקבלות */}
      <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 46px)", right: 10, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", pointerEvents: "none" }}>
        {feed.map((f) => (
          <div key={f.id} style={{
            background: "rgba(16,13,10,.78)", border: "1.5px solid #3A2E22", borderRadius: 10, padding: "3px 10px",
            color: "#E8D9BC", fontWeight: 700, fontFamily: "Assistant, sans-serif", fontSize: 12,
          }}>{f.tx}</div>
        ))}
      </div>

      {/* כפתור הגניבה — הפשע דורש לחיצה */}
      {canSteal && (
        <button
          onClick={() => { aInit(); conn.sendGame({ a: "th_steal" }); }}
          style={{
            position: "absolute", bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)", left: 18,
            width: 86, height: 86, borderRadius: "50%", border: "4px solid #F3E7D3",
            background: "#7A3CC8", color: "#fff", fontSize: 15, fontWeight: 900, fontFamily: "Assistant, sans-serif",
            boxShadow: "0 0 22px rgba(160,90,255,.6), 0 4px 0 #4A2478", zIndex: 5,
          }}>
          🥷<br />לגנוב!
        </button>
      )}

      {toast && (
        <div style={{
          position: "absolute", bottom: "calc(env(safe-area-inset-bottom, 0px) + 120px)", left: "50%", transform: "translateX(-50%)",
          background: "rgba(16,13,10,.92)", border: "2px solid #3A2E22", borderRadius: 14, padding: "8px 18px",
          color: "#F3E7D3", fontWeight: 800, fontFamily: "Assistant, sans-serif", fontSize: 16, whiteSpace: "nowrap", zIndex: 6,
        }}>{toast}</div>
      )}

      {banner && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", zIndex: 7 }}>
          <div style={{
            background: "rgba(16,13,10,.94)", border: "3px solid #F2C14E", borderRadius: 20, padding: "18px 30px",
            textAlign: "center", color: "#F3E7D3", fontFamily: "Assistant, sans-serif", transform: "rotate(-1.3deg)",
            boxShadow: "5px 5px 0 rgba(226,63,60,.85)",
          }}>
            <div style={{ fontSize: 40 }}>{banner.ic}</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{banner.t}</div>
            <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>{banner.s}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function burst(x: number, y: number, col: string, n: number) {
  const out: { x: number; y: number; vx: number; vy: number; l: number; col: string }[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, s = 1 + Math.random() * 3;
    out.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, l: 0.4 + Math.random() * 0.35, col });
  }
  return out;
}
