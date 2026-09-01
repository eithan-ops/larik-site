/**
 * "החופרים" ⛏️ — צד לקוח.
 *
 * עולם אחד, חלון אישי: המפה נוצרת אצל כל שחקן מהזרע ששודר, ומאותו רגע
 * מגיעים רק הפרשים. התנועה והחפירה שלך מנובאות מקומית כדי שהאגודל ירגיש
 * מיידי, והשרת מיישר קו כשיש פער — כך שאין השהיה על הפעולה שעושים כל שנייה.
 */
import { useEffect, useRef, useState } from "react";
import type { HofrimServerMsg, HofrimCard } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { unlockIosAudio } from "../lib/unmute";
import {
  HF_COLS as COLS, HF_ROWS as ROWS, HF_AIR as AIR, HF_VEIN as VEIN, HF_WALL as WALL, HF_LIFT as LIFT,
  HF_HARDNESS as HARDNESS, hfGenerate, hfIdx as idx,
} from "../../../shared/hofrim";

const TS = 34;
const SPD = 5.6;
const ART = "/hofrim/art/";
const SFX = "/hofrim/sfx/";
const MAT: Record<number, { col: string; col2: string; tex: string }> = {
  1: { col: "#8B5E3C", col2: "#5E4028", tex: "tile-dirt" }, 2: { col: "#7E5A2E", col2: "#553D1F", tex: "tile-clay" },
  3: { col: "#6E6A66", col2: "#4B4845", tex: "tile-rock" }, 4: { col: "#565E68", col2: "#3B4148", tex: "tile-hard" },
  5: { col: "#3C4553", col2: "#2A303A", tex: "tile-basalt" }, 6: { col: "#4A4066", col2: "#332C46", tex: "tile-vein" },
  7: { col: "#211D1A", col2: "#171412", tex: "" },
};
const MON_ART: Record<string, string> = { crawl: "mon-crawl", armo: "mon-armo", bat: "mon-bat", golem: "mon-golem" };
const MON_COL: Record<string, string> = { crawl: "#E5484D", armo: "#8E9BA8", bat: "#B37BE0", golem: "#7A6A4E" };
const PCOL = ["#FF8A3D", "#5AC8FA", "#46E0C0", "#F2C14E", "#E5484D", "#B37BE0", "#8ee34a", "#FF6FB5"];

const IMGS = ["tile-dirt", "tile-clay", "tile-rock", "tile-hard", "tile-basalt", "tile-vein",
  "bag", "gold", "crystal", "gem", "miner-front", "miner-side", "miner-back",
  "mon-crawl", "mon-armo", "mon-bat", "mon-golem", "lift", "bomb",
  "boom1", "boom2", "boom3", "boom4", "fx-chips", "fx-coin", "fx-shot"];

interface Ent { x: number; y: number; tx: number; ty: number }
interface Mon extends Ent { id: number; k: string; hp: number; max: number; flash: number }
interface Bag { id: number; c: number; y: number; st: number; vy: number }
interface Item { id: number; x: number; y: number; k: number; held: number }
interface Boom { x: number; y: number; t: number; s: number }
interface Fly { x: number; y: number; t: number; k: number; tx: number; ty: number; pid: string }
interface Pop { x: number; y: number; t: string; col: string; l: number; sz: number }

export default function HofrimView({ room, me, conn, hub }: GameViewProps) {
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [hud, setHud] = useState({ bag: 0, slots: 8, hp: 3, maxhp: 3, pow: 2, level: 1, gold: 0, left: 0, banked: 0, target: 0, shift: 1, of: 6 });
  const [draft, setDraft] = useState<HofrimCard[] | null>(null);
  const [banner, setBanner] = useState<{ ic: string; t: string; s: string } | null>(null);
  const [toast, setToast] = useState("");
  const [teams, setTeams] = useState<{ pid: string; name: string; emoji: string; gold: number; build: string[] }[]>([]);

  const G = useRef({
    grid: new Uint8Array(0), item: new Uint8Array(0), prog: new Float32Array(COLS * ROWS), lit: new Uint8Array(COLS * ROWS),
    liftC: Math.floor(COLS / 2), ready: false,
    me: { c: 23, r: 3, x: 23, y: 3, tc: 23, tr: 3, mv: false, dir: 2, dead: false } as Ent & { c: number; r: number; tc: number; tr: number; mv: boolean; dir: number; dead: boolean },
    others: new Map<string, Ent & { dir: number; dig: number; down?: number }>(),
    mons: new Map<number, Mon>(), bags: new Map<number, Bag>(), items: new Map<number, Item>(),
    booms: [] as Boom[], flies: [] as Fly[], pops: [] as Pop[], parts: [] as { x: number; y: number; vx: number; vy: number; l: number; col: string }[],
    shots: [] as { x: number; y: number; dx: number; dy: number; l: number }[],
    chips: [] as { x: number; y: number; t: number }[],
    fuses: [] as { c: number; r: number; R: number; t: number }[],
    ping: null as { x: number; y: number; col: string; t: number } | null,
    stats: { pow: 2, slots: 8, light: 5.2, magnet: 1.3, spd: 1, bomb: 0, xray: 0, glow: 0, level: 1 },
    cam: { x: 0, y: 0 }, dir: { x: 0, y: 0 }, digPunch: 0, shake: 0, stop: 0, flash: 0, flashCol: "#fff",
    call: 0, gold: new Map<string, number>(), builds: new Map<string, string[]>(),
    left: 0, banked: 0, target: 0, bag: 0,
    corr: { x: 0, y: 0 },        // תיקון מהשרת שנמרח על כמה פריימים במקום קפיצה
    players: [] as { id: string; name: string }[],
  });

  /* ---- נכסים ---- */
  const img = useRef<Record<string, HTMLImageElement>>({});
  useEffect(() => {
    let n = 0;
    IMGS.forEach((k) => {
      const im = new Image();
      im.onload = () => { (im as HTMLImageElement & { ok?: 1 }).ok = 1; if (++n >= IMGS.length) setReady(true); };
      im.onerror = () => { if (++n >= IMGS.length) setReady(true); };
      im.src = ART + k + ".webp";
      img.current[k] = im;
    });
  }, []);
  const has = (k: string) => { const i = img.current[k]; return !!i && !!(i as HTMLImageElement & { ok?: 1 }).ok; };

  /* ---- סאונד ---- */
  const audio = useRef<{ ctx: AudioContext | null; buf: Record<string, AudioBuffer>; note: number; noteT: number }>({ ctx: null, buf: {}, note: 0, noteT: 0 });
  function aInit() {
    unlockIosAudio();                     // אייפון: עוקף את מתג ההשתקה דרך ערוץ המדיה
    const ex = audio.current.ctx;
    if (ex) { if (ex.state === "suspended") ex.resume().catch(() => {}); return; }  // חוזרים מרקע/נעילה — מחיים
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const c = new AC(); audio.current.ctx = c;
      ["dig-dirt", "dig-rock", "break", "coin", "bagcrash", "creak", "splat", "boom", "deposit", "shot", "hit", "levelup"].forEach((n) =>
        fetch(SFX + n + ".mp3").then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b)).then((d) => { audio.current.buf[n] = d; }).catch(() => {}));
    } catch { /* אין אודיו — המשחק ממשיך */ }
  }
  function play(n: string, vol = 0.5, rate?: number) {
    const a = audio.current; if (!a.ctx || !a.buf[n]) return false;
    const s = a.ctx.createBufferSource(); s.buffer = a.buf[n];
    s.playbackRate.value = rate ?? 0.94 + Math.random() * 0.12;
    const g = a.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(a.ctx.destination); s.start(); return true;
  }
  const PENT = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  function tone(f: number, d: number, type: OscillatorType, vol: number) {
    const a = audio.current; if (!a.ctx) return;
    const t = a.ctx.currentTime, o = a.ctx.createOscillator(), g = a.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(a.ctx.destination); o.start(t); o.stop(t + d + 0.05);
  }
  function crystalTone() {   // המכרה שר — כל גביש הוא הצליל הבא בסולם
    const a = audio.current, now = performance.now() / 1000;
    if (now - a.noteT > 3.2) a.note = 0; else a.note++;
    a.noteT = now;
    const n = PENT[Math.min(a.note, PENT.length - 1)];
    tone(392 * Math.pow(2, n / 12), 0.16, "triangle", 0.3);
  }

  /* ---- הודעות מהשרת ---- */
  useEffect(() => {
    const g = G.current;
    return hub.subscribe((raw) => {
      const d = raw as HofrimServerMsg;
      switch (d.a) {
        case "hf_init": {
          const mine = hfGenerate(d.seed);
          // init חוזר (reconnect בלי טעינת דף) — מנקים הכל לפני בנייה מחדש
          g.mons.clear(); g.items.clear(); g.bags.clear(); g.others.clear();
          g.booms.length = 0; g.flies.length = 0; g.shots.length = 0; g.parts.length = 0; g.chips.length = 0; g.pops.length = 0; g.fuses.length = 0;
          g.prog.fill(0); g.lit.fill(0);
          g.grid = new Uint8Array(mine.grid); g.item = new Uint8Array(mine.item); g.liftC = d.lift; g.ready = true;
          for (const b of mine.bags) g.bags.set(b.id, { id: b.id, c: b.c, y: b.r, st: 0, vy: 0 });
          g.me.c = d.lift; g.me.r = 3; g.me.x = d.lift; g.me.y = 3; g.me.tc = d.lift; g.me.tr = 3;
          g.cam.x = d.lift * TS; g.cam.y = 3 * TS;
          break;
        }
        case "hf_sync": {
          for (const i of d.dug) { g.grid[i] = AIR; g.item[i] = 0; }
          // המצב החי — בלעדיו מצטרף חוזר רואה שקים במקומות הישנים וחוטף ממפלצות בלתי-נראות
          g.bags.clear();
          for (const [bid, bc, by] of d.bags) g.bags.set(bid, { id: bid, c: bc, y: by, st: 0, vy: 0 });
          g.mons.clear();
          for (const [mid, mk, mhp, mmax, mc, mr] of d.mons) g.mons.set(mid, { id: mid, k: mk, x: mc, y: mr, tx: mc, ty: mr, hp: mhp, max: mmax, flash: 0 });
          break;
        }
        case "hf_dig": {
          const i = idx(d.c, d.r);
          const predicted = d.by === me && g.grid[i] === AIR;   // נשבר כבר בניבוי — האפקט הורגש
          g.grid[i] = AIR; g.item[i] = 0; g.prog[i] = 0;
          if (d.lit) g.lit[i] = 1;
          if (predicted) break;
          burst(g, d.c + 0.5, d.r + 0.5, MAT[d.mat]?.col ?? "#888", 7);
          if (d.by === me) { g.chips.push({ x: d.c + 0.5, y: d.r + 0.5, t: 0 }); play("break", 0.45); }
          break;
        }
        case "hf_item": g.items.set(d.id, { id: d.id, x: d.x, y: d.y, k: d.k, held: 0 }); break;
        case "hf_gone": g.items.delete(d.id); break;
        case "hf_take": {
          const it = g.items.get(d.id);
          if (it) { g.flies.push({ x: it.x, y: it.y, t: 0, k: it.k, tx: 0, ty: 0, pid: d.pid }); g.items.delete(d.id); }
          if (d.pid === me) {
            g.bag = d.bag;
            setHud((h) => ({ ...h, bag: d.bag, slots: d.slots }));
            if (it?.k === 1) crystalTone(); else { play("coin", 0.45); }
          }
          break;
        }
        case "hf_bag": { const b = g.bags.get(d.id); if (b) { b.c = d.c; b.y = d.y; b.st = d.st; if (d.st === 1) play("creak", 0.5, 1); } break; }
        case "hf_bagland": {
          const b = g.bags.get(d.id);
          if (b) { b.y = d.y; b.st = 0; }
          play("bagcrash", 0.6); g.shake = Math.max(g.shake, d.broke ? 10 : 5);
          burst(g, d.c + 0.5, d.y + 0.5, "#C88A2E", 14);
          if (d.broke) g.bags.delete(d.id);
          break;
        }
        case "hf_mon": g.mons.set(d.id, { id: d.id, k: d.k, x: d.c, y: d.r, tx: d.c, ty: d.r, hp: d.hp, max: d.max, flash: 0 }); break;
        case "hf_mhit": {
          const m = g.mons.get(d.id); if (!m) break;
          m.flash = 0.09; m.hp = d.hp;
          if (d.res) pop(g, m.x, m.y, "🛡️ חסין!", "#8E9BA8", 15);
          else { g.stop = Math.max(g.stop, 0.04); g.shake = Math.max(g.shake, 4); play("hit", 0.3); }
          break;
        }
        case "hf_mdie": {
          g.mons.delete(d.id);
          g.booms.push({ x: d.x + 0.5, y: d.y + 0.5, t: 0, s: d.k === "golem" ? 1.9 : d.k === "armo" ? 1.4 : 1.1 });
          g.stop = Math.max(g.stop, 0.075); g.shake = Math.max(g.shake, 9);
          burst(g, d.x, d.y, MON_COL[d.k] ?? "#E5484D", 14);
          play("splat", 0.45);
          break;
        }
        case "hf_shot": g.shots.push({ x: d.x + 0.5, y: d.y + 0.5, dx: d.dx, dy: d.dy, l: 1.4 }); if (d.by === me) play("shot", 0.24); break;
        case "hf_chain": g.pops.push({ x: d.x2, y: d.y2, t: "⚡", col: "#BFD8FF", l: 0.4, sz: 18 }); break;
        case "hf_pos": {
          for (const [pid, x, y, dir, dig] of d.ps) {
            if (pid === me) {
              // יישור קו רך: פער סביר נמרח על כמה פריימים, ורק פער אמיתי מקפיץ.
              // קפיצה על כל הפרש קטן היא בדיוק מה שנראה כמו "גמגום".
              const gap = Math.hypot(x - g.me.x, y - g.me.y);
              if (gap > 3) { g.me.x = x; g.me.y = y; g.me.c = Math.round(x); g.me.r = Math.round(y); g.me.mv = false; g.corr.x = 0; g.corr.y = 0; }
              else if (gap > 0.75) { g.corr.x = x - g.me.x; g.corr.y = y - g.me.y; }
              continue;
            }
            const o = g.others.get(pid) ?? { x, y, tx: x, ty: y, dir, dig };
            o.tx = x; o.ty = y; o.dir = dir; o.dig = dig;
            g.others.set(pid, o);
          }
          for (const [id, x, y] of d.ms) { const m = g.mons.get(id); if (m) { m.tx = x; m.ty = y; } }
          g.left = d.left; g.banked = d.banked;
          setHud((h) => (h.left === d.left && h.banked === d.banked ? h : { ...h, left: d.left, banked: d.banked }));
          break;
        }
        case "hf_hp":
          if (d.pid === me) { setHud((h) => ({ ...h, hp: d.hp, maxhp: d.max })); g.shake = 12; g.flash = 0.16; g.flashCol = "#E5484D"; g.stop = 0.07; }
          break;
        case "hf_down":
          if (d.pid === me) { g.me.dead = true; setToast("💀 נפלת — קמים בעוד רגע"); }
          else { const o = g.others.get(d.pid); if (o) o.down = 1; setToast(`💀 ${g.players.find((x) => x.id === d.pid)?.name ?? "חבר"} נפל!`); }
          break;
        case "hf_up":
          if (d.pid === me) { g.me.dead = false; g.me.c = g.liftC; g.me.r = 3; g.me.x = g.liftC; g.me.y = 3; g.me.mv = false; setHud((h) => ({ ...h, hp: d.hp })); }
          else { const o = g.others.get(d.pid); if (o) o.down = 0; }
          break;
        case "hf_bank": {
          g.gold.set(d.pid, d.total);
          setTeams((t) => t.map((x) => (x.pid === d.pid ? { ...x, gold: d.total } : x)));
          const who = d.pid === me ? g.me : g.others.get(d.pid);        // מעל מי שהפקיד, לא מעליי
          if (who) pop(g, who.x, who.y - 0.5, "+" + d.v, "#F2C14E", d.pid === me ? 22 : 16);
          if (d.pid === me) { g.bag = 0; play("deposit", 0.6); setHud((h) => ({ ...h, bag: 0, gold: d.total })); }
          break;
        }
        case "hf_stats":
          g.stats = { pow: d.pow, slots: d.slots, light: d.light, magnet: d.magnet, spd: d.spd, bomb: d.bomb, xray: d.xray, glow: d.glow, level: d.level };
          setHud((h) => ({ ...h, pow: d.pow, slots: d.slots, level: d.level }));
          break;
        case "hf_build":
          g.builds.set(d.pid, d.picks);
          setTeams((t) => t.map((x) => (x.pid === d.pid ? { ...x, build: d.picks } : x)));
          break;
        case "hf_shift":
          g.target = d.target;
          setHud((h) => ({ ...h, shift: d.n, target: d.target, of: d.of }));
          setBanner({ ic: "⛏️", t: `משמרת ${d.n}`, s: `${d.target.toLocaleString()} זהב · ${d.secs} שניות` });
          setTimeout(() => setBanner(null), 2200);
          break;
        case "hf_quota": setToast("🎉 עמדנו במכסה!"); g.flash = 0.25; g.flashCol = "#F2C14E"; g.stop = Math.max(g.stop, 0.09); g.shake = Math.max(g.shake, 8); play("levelup", 0.6); break;
        case "hf_shiftend":
          setBanner(d.ok ? { ic: "✅", t: "המשמרת הושלמה", s: `${d.banked.toLocaleString()} מתוך ${d.target.toLocaleString()}` }
            : d.partial ? { ic: "😬", t: "כמעט", s: `${d.banked.toLocaleString()} מתוך ${d.target.toLocaleString()} — בחירת נחמה` }
            : { ic: "❌", t: "לא עמדנו במכסה", s: `החמצה ${d.misses} מתוך 3` });
          setTimeout(() => setBanner(null), 2600);
          break;
        case "hf_draft": setDraft(d.cards); break;
        case "hf_took":
          if (d.pid === me) {
            setDraft(null);
            setBanner({ ic: d.card.ic, t: d.card.t, s: d.card.d.replace(/<[^>]+>/g, "") });
            g.flash = 0.22; g.flashCol = "#FFD152"; play("levelup", 0.55);
            setTimeout(() => { setBanner(null); setToast("⌛ ממתינים לשאר החברים…"); }, 1600);
          }
          break;
        case "hf_called": {
          const p = g.players.find((x) => x.id === d.pid);
          if (d.pid !== me) {
            const col = PCOL[(g.players.findIndex((x) => x.id === d.pid) + 1) % PCOL.length];
            g.ping = { x: d.x, y: d.y, col, t: 6 };                     // המיקום שהשרת שולח — סוף סוף בשימוש
            setToast(`📣 ${p?.name ?? "חבר"} קורא לך!`); tone(660, 0.13, "square", 0.24);
          }
          break;
        }
        case "hf_bombset":
          g.fuses.push({ c: d.c, r: d.r, R: d.R, t: 0 });
          tone(196, 0.12, "square", 0.22);
          break;
        case "hf_boom":
          g.fuses = g.fuses.filter((f) => f.c !== d.c || f.r !== d.r);
          g.booms.push({ x: d.c + 0.5, y: d.r + 0.5, t: 0, s: d.R * 1.6 });
          g.shake = 14; play("boom", 0.6);
          break;
        case "hf_left": g.others.delete(d.pid); break;
      }
    });
  }, [hub, me]);

  /* ---- לוח הצוות ---- */
  useEffect(() => {
    G.current.players = room.players.map((p) => ({ id: p.id, name: p.name }));
    setTeams(room.players.filter((p) => p.connected).map((p) => ({ pid: p.id, name: p.name, emoji: p.emoji, gold: G.current.gold.get(p.id) ?? 0, build: G.current.builds.get(p.id) ?? [] })));
  }, [room.players]);

  /* ---- קלט ---- */
  const joy = useRef({ on: false, ox: 0, oy: 0, dx: 0, dy: 0 });
  useEffect(() => {
    const g = G.current;
    function sendDir() {
      const j = joy.current;
      let dx = 0, dy = 0;
      if (Math.abs(j.dx) > 0.28 || Math.abs(j.dy) > 0.28) {
        if (Math.abs(j.dx) >= Math.abs(j.dy)) dx = Math.sign(j.dx); else dy = Math.sign(j.dy);
      }
      if (dx !== g.dir.x || dy !== g.dir.y) { g.dir = { x: dx, y: dy }; conn.sendGame({ a: "hf_dir", dx, dy }); }
    }
    const pos = (e: TouchEvent | MouseEvent) => {
      const t = (e as TouchEvent).touches?.[0] ?? (e as MouseEvent);
      return { x: t.clientX, y: t.clientY };
    };
    const down = (e: TouchEvent | MouseEvent) => {
      aInit();
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});  // אנדרואיד; אייפון מתעלם בשקט
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
    const up = () => { joy.current.on = false; joy.current.dx = 0; joy.current.dy = 0; sendDir(); };
    const key = (e: KeyboardEvent, on: boolean) => {
      const j = joy.current;
      const k = e.key;
      if (k === "ArrowLeft" || k === "a") j.dx = on ? -1 : 0;
      else if (k === "ArrowRight" || k === "d") j.dx = on ? 1 : 0;
      else if (k === "ArrowUp" || k === "w") j.dy = on ? -1 : 0;
      else if (k === "ArrowDown" || k === "s") j.dy = on ? 1 : 0;
      else return;
      e.preventDefault(); sendDir();
    };
    const kd = (e: KeyboardEvent) => key(e, true), ku = (e: KeyboardEvent) => key(e, false);
    window.addEventListener("touchstart", down, { passive: false });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up); window.addEventListener("touchcancel", up);
    window.addEventListener("mousedown", down); window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    return () => {
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
    const cv: HTMLCanvasElement = cv0;                 // מקבע את הצמצום גם בתוך הלולאה
    const ctx2 = cv.getContext("2d", { alpha: false })!;
    let raf = 0, last = 0, W = 0, H = 0, DPR = 1, digT = 0;
    const g = G.current;

    const resize = () => {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth || window.innerWidth;
      H = cv.clientHeight || window.innerHeight;
      cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
    };
    resize();
    window.addEventListener("resize", resize);

    const inB = (c: number, r: number) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
    const at = (c: number, r: number) => (inB(c, r) ? g.grid[idx(c, r)] : WALL);
    const solid = (c: number, r: number) => { const t = at(c, r); return t !== AIR && t !== LIFT; };
    const bagAt = (c: number, r: number) => [...g.bags.values()].find((b) => b.c === c && Math.round(b.y) === r);

    function spr(k: string, cx: number, cy: number, size: number, rot = 0, flip = false, alpha = 1) {
      if (!has(k)) return false;
      ctx2.save(); ctx2.translate(cx, cy); if (rot) ctx2.rotate(rot); if (flip) ctx2.scale(-1, 1);
      ctx2.globalAlpha = alpha; ctx2.drawImage(img.current[k], -size / 2, -size / 2, size, size); ctx2.restore(); return true;
    }
    function glow(k: string, cx: number, cy: number, size: number, rot = 0, alpha = 1) {
      if (!has(k)) return false;
      ctx2.save(); ctx2.globalCompositeOperation = "screen"; ctx2.globalAlpha = alpha;
      ctx2.translate(cx, cy); if (rot) ctx2.rotate(rot);
      ctx2.drawImage(img.current[k], -size / 2, -size / 2, size, size); ctx2.restore(); return true;
    }

    function frame(ts: number) {
      raf = requestAnimationFrame(frame);
      if (!last) last = ts;
      const wantW = cv.clientWidth || window.innerWidth, wantH = cv.clientHeight || window.innerHeight;
      if (wantW && wantH && (Math.abs(wantW - W) > 1 || Math.abs(wantH - H) > 1)) resize();
      let dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      if (g.stop > 0) { g.stop -= dt; dt *= 0.06; }
      if (!g.ready) { ctx2.setTransform(DPR, 0, 0, DPR, 0, 0); ctx2.fillStyle = "#0B0908"; ctx2.fillRect(0, 0, W, H); return; }

      /* ניבוי מקומי: תנועה וחפירה שלי מיידיות, בלי לחכות לרשת */
      const m = g.me;
      if (!m.dead) {
        // הנוסחה חייבת להיות זהה לשרת — כל הפרש כאן מצטבר לסחיפה ואז לקפיצה
        const spd = SPD * g.stats.spd * (g.bag >= g.stats.slots ? 0.82 : 1);
        if (m.mv) {
          const dx = m.tc - m.x, dy = m.tr - m.y, d = Math.hypot(dx, dy), s = spd * dt;
          if (d <= s) { m.x = m.tc; m.y = m.tr; m.c = m.tc; m.r = m.tr; m.mv = false; }
          else { m.x += (dx / d) * s; m.y += (dy / d) * s; }
        }
        if (!m.mv && (g.dir.x || g.dir.y)) {
          const nc = m.c + g.dir.x, nr = m.r + g.dir.y;
          m.dir = g.dir.y < 0 ? 0 : g.dir.y > 0 ? 2 : g.dir.x > 0 ? 1 : 3;
          if (inB(nc, nr) && !solid(nc, nr) && !bagAt(nc, nr)) { m.tc = nc; m.tr = nr; m.mv = true; }
          else if (inB(nc, nr) && solid(nc, nr)) {
            const i = idx(nc, nr), h = HARDNESS[g.grid[i]];
            if (h < 999) {
              g.prog[i] += Math.max(0.06, g.stats.pow / h) * dt;
              digT += dt;
              if (digT > 0.16) {
                digT = 0; g.digPunch = 1;
                play(h >= 4 ? "dig-rock" : "dig-dirt", 0.32, 0.9 + Math.min(1, g.prog[i]) * 0.45);
                g.chips.push({ x: nc + 0.5 - g.dir.x * 0.35, y: nr + 0.5 - g.dir.y * 0.35, t: 0 });
              }
              // שוברים מקומית ברגע שהמד מתמלא. בלי זה כל תא עולה הלוך-חזור ברשת —
              // וזה בדיוק ה"דילאי" שמרגישים. השרת לעולם לא איטי מאיתנו (כוחו שווה
              // או גדול יותר בזכות חבר שחופר איתנו), ולכן ניבוי כזה לא סוטה קדימה.
              if (g.prog[i] >= 1) {
                g.grid[i] = AIR; g.item[i] = 0; g.prog[i] = 0;
                burst(g, nc + 0.5, nr + 0.5, MAT[h >= 6 ? 5 : h >= 4 ? 3 : 1]?.col ?? "#888", 6);
                play("break", 0.4);
              }
            }
          }
        }
      }
      // מריחת התיקון מהשרת — ~250ms של החלקה במקום טלפורט
      if (g.corr.x || g.corr.y) {
        const k = Math.min(1, dt * 4);
        m.x += g.corr.x * k; m.y += g.corr.y * k;
        g.corr.x *= 1 - k; g.corr.y *= 1 - k;
        if (Math.abs(g.corr.x) < 0.01 && Math.abs(g.corr.y) < 0.01) { g.corr.x = 0; g.corr.y = 0; }
      }
      if (g.digPunch > 0) g.digPunch = Math.max(0, g.digPunch - dt * 7);
      if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 40);
      if (g.flash > 0) g.flash -= dt;
      if (g.call > 0) g.call -= dt;

      // אינטרפולציה של האחרים והמפלצות
      for (const o of g.others.values()) { o.x += (o.tx - o.x) * Math.min(1, dt * 12); o.y += (o.ty - o.y) * Math.min(1, dt * 12); }
      for (const mo of g.mons.values()) { mo.x += (mo.tx - mo.x) * Math.min(1, dt * 12); mo.y += (mo.ty - mo.y) * Math.min(1, dt * 12); if (mo.flash > 0) mo.flash -= dt; }
      for (const b of g.bags.values()) if (b.st === 2) b.y += 11 * dt;
      for (let i = g.shots.length - 1; i >= 0; i--) { const s = g.shots[i]; s.x += s.dx * 11 * dt; s.y += s.dy * 11 * dt; s.l -= dt; if (s.l <= 0) g.shots.splice(i, 1); }
      for (let i = g.booms.length - 1; i >= 0; i--) { g.booms[i].t += dt; if (g.booms[i].t > 0.4) g.booms.splice(i, 1); }
      for (let i = g.chips.length - 1; i >= 0; i--) { g.chips[i].t += dt; if (g.chips[i].t > 0.22) g.chips.splice(i, 1); }
      for (let i = g.fuses.length - 1; i >= 0; i--) { g.fuses[i].t += dt; if (g.fuses[i].t > 1.3) g.fuses.splice(i, 1); }
      if (g.ping) { g.ping.t -= dt; if (g.ping.t <= 0) g.ping = null; }
      for (let i = g.flies.length - 1; i >= 0; i--) { g.flies[i].t += dt; if (g.flies[i].t > 0.42) g.flies.splice(i, 1); }
      for (let i = g.pops.length - 1; i >= 0; i--) { g.pops[i].l -= dt; g.pops[i].y -= dt * 1.4; if (g.pops[i].l <= 0) g.pops.splice(i, 1); }
      for (let i = g.parts.length - 1; i >= 0; i--) { const p = g.parts[i]; p.l -= dt; if (p.l <= 0) { g.parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 9 * dt; }

      // מצלמה
      const tx = m.x * TS - W / 2, ty = m.y * TS - H / 2;
      g.cam.x += (tx - g.cam.x) * Math.min(1, dt * 7); g.cam.y += (ty - g.cam.y) * Math.min(1, dt * 7);
      if (COLS * TS > W) g.cam.x = Math.max(0, Math.min(COLS * TS - W, g.cam.x));
      else g.cam.x = -(W - COLS * TS) / 2;                              // מסך רחב מהמפה — ממרכזים
      g.cam.y = Math.max(-40, Math.min(ROWS * TS - H, g.cam.y));

      /* ציור */
      if (ctx2.reset) ctx2.reset(); else { cv.width = cv.width; }
      ctx2.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx2.fillStyle = "#0B0908"; ctx2.fillRect(0, 0, W, H);
      const sx = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0, sy = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0;
      ctx2.save(); ctx2.translate(-g.cam.x + sx, -g.cam.y + sy);

      const lr = Math.max(TS * g.stats.light, Math.min(W, H) * 0.45);  // הפנס נגזר גם מגודל המסך — לא כהה בדסקטופ
      const litR = lr / TS + 3;            // מעבר לזה הפנס מכהה כמעט לגמרי — אין טעם במרקם
      const c0 = Math.max(0, Math.floor(g.cam.x / TS)), c1 = Math.min(COLS - 1, Math.ceil((g.cam.x + W) / TS));
      const r0 = Math.max(0, Math.floor(g.cam.y / TS)), r1 = Math.min(ROWS - 1, Math.ceil((g.cam.y + H) / TS));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const i = idx(c, r), t = g.grid[i], X = c * TS, Y = r * TS;
        if (t === AIR) { ctx2.fillStyle = r < 4 ? "#1A2430" : g.lit[i] ? "#241C14" : "#171310"; ctx2.fillRect(X, Y, TS, TS); continue; }
        if (t === LIFT) { ctx2.fillStyle = "#3E3222"; ctx2.fillRect(X, Y, TS, TS); spr("lift", X + TS / 2, Y + TS / 2, TS * 1.25); continue; }
        const mm = MAT[t] ?? MAT[7];
        const near = Math.abs(c - m.x) < litR && Math.abs(r - m.y) < litR;
        if (near && mm.tex && has(mm.tex)) {
          const im = img.current[mm.tex], o = ((c * 7 + r * 13) % 4) * 16, o2 = ((c * 11 + r * 5) % 4) * 16;
          ctx2.drawImage(im, o, o2, im.width - 64, im.height - 64, X, Y, TS, TS);
        } else { ctx2.fillStyle = near ? mm.col : mm.col2; ctx2.fillRect(X, Y, TS, TS); }
        ctx2.strokeStyle = "rgba(0,0,0,.3)"; ctx2.lineWidth = 1; ctx2.strokeRect(X + 0.5, Y + 0.5, TS - 1, TS - 1);
        if (t === VEIN) spr("gem", X + TS / 2, Y + TS / 2, TS * 0.6);
        else if (g.item[i] === 1) spr("crystal", X + TS / 2, Y + TS / 2, TS * (g.stats.xray ? 0.5 : 0.38), 0, false, g.stats.xray ? 0.95 : 0.5);
        const pg = g.prog[i];
        if (pg > 0) {
          ctx2.strokeStyle = "rgba(0,0,0,.55)"; ctx2.lineWidth = 2;
          for (let k = 0; k <= Math.min(3, Math.floor(pg * 4)); k++) { ctx2.beginPath(); ctx2.moveTo(X + 4 + k * 7, Y + 3); ctx2.lineTo(X + 9 + k * 7, Y + TS - 4); ctx2.stroke(); }
        }
      }

      const vis = (x: number, y: number) => x * TS > g.cam.x - TS * 2 && x * TS < g.cam.x + W + TS * 2 && y * TS > g.cam.y - TS * 2 && y * TS < g.cam.y + H + TS * 2;
      for (const b of g.bags.values()) {
        if (!vis(b.c, b.y)) continue;
        const bx = b.c * TS + TS / 2, by = b.y * TS + TS / 2;
        ctx2.fillStyle = "rgba(242,193,78,.16)"; ctx2.beginPath(); ctx2.arc(bx, by, TS * 0.85, 0, 6.283); ctx2.fill();
        spr("bag", bx, by, TS * 0.98, b.st === 1 ? Math.sin(ts / 33) * 0.17 : 0);
        if (b.st === 1) { ctx2.strokeStyle = "rgba(229,72,77,.9)"; ctx2.lineWidth = 3; ctx2.strokeRect(b.c * TS + 3, (Math.round(b.y) + 1) * TS + 3, TS - 6, TS - 6); }
      }
      for (const it of g.items.values()) {
        if (!vis(it.x, it.y)) continue;
        const k = it.k === 2 ? "gem" : it.k === 0 ? "gold" : "crystal";
        spr(k, it.x * TS, it.y * TS + Math.sin(ts / 250 + it.id) * 2, TS * 0.55);
      }
      for (const f of g.flies) {
        const u = f.t / 0.42, e = u * u * (3 - 2 * u);
        const tg = f.pid === me ? m : g.others.get(f.pid);              // עף אל מי שאסף — לא תמיד אליי
        const tx0 = ((tg ? tg.x : f.x) + 0.5) * TS, ty0 = ((tg ? tg.y : f.y) + 0.5) * TS;
        const fx = f.x * TS + (tx0 - f.x * TS) * e, fy = f.y * TS + (ty0 - f.y * TS) * e - Math.sin(u * 3.14) * 22;
        spr(f.k === 2 ? "gem" : f.k === 0 ? "gold" : "crystal", fx, fy, TS * 0.55 * (1 - e * 0.55), u * 7, false, 1 - e * 0.3);
        if (u > 0.72) glow("fx-coin", tx0, ty0, TS * (1.1 + (u - 0.72) * 3), 0, (1 - u) * 3);
      }
      for (const ch of g.chips) glow("fx-chips", ch.x * TS, ch.y * TS, TS * (0.55 + (ch.t / 0.22) * 0.8), 0, 1 - ch.t / 0.22);
      for (const mo of g.mons.values()) {
        if (!vis(mo.x, mo.y)) continue;
        const mx = mo.x * TS + TS / 2, my = mo.y * TS + TS / 2 + Math.sin(ts / (mo.k === "bat" ? 60 : 140) + mo.id) * 3;
        const sz = TS * (mo.k === "golem" ? 1.32 : 1.15);
        if (!spr(MON_ART[mo.k] ?? "mon-crawl", mx, my, sz)) { ctx2.fillStyle = MON_COL[mo.k] ?? "#E5484D"; ctx2.fillRect(mx - 12, my - 12, 24, 24); }
        if (mo.flash > 0) { ctx2.save(); ctx2.globalCompositeOperation = "lighter"; ctx2.globalAlpha = 0.9; spr(MON_ART[mo.k] ?? "mon-crawl", mx, my, sz); ctx2.restore(); }
        if (mo.max > 2) { ctx2.fillStyle = "#000"; ctx2.fillRect(mx - TS / 2 + 4, my - TS / 2 - 4, TS - 8, 4); ctx2.fillStyle = "#E5484D"; ctx2.fillRect(mx - TS / 2 + 4, my - TS / 2 - 4, (TS - 8) * Math.max(0, mo.hp / mo.max), 4); }
      }
      for (const s of g.shots) glow("fx-shot", s.x * TS, s.y * TS, 26, Math.atan2(s.dy, s.dx));
      for (const b of g.booms) { const u = b.t / 0.4, f = Math.min(3, Math.floor(u * 4.2)); glow("boom" + (f + 1), b.x * TS, b.y * TS, TS * b.s * (1.5 + u * 1.9), u * 0.6, f === 3 ? (1 - u) * 2.2 : 1); }
      for (const f of g.fuses) {
        const bx = (f.c + 0.5) * TS, by = (f.r + 0.5) * TS, blink = 0.55 + 0.45 * Math.sin(f.t * 26);
        if (!spr("bomb", bx, by, TS * 0.9, Math.sin(f.t * 20) * 0.15)) { ctx2.fillStyle = "#1c1c1c"; ctx2.beginPath(); ctx2.arc(bx, by, TS * 0.32, 0, 6.283); ctx2.fill(); }
        ctx2.strokeStyle = `rgba(229,72,77,${(0.3 + 0.5 * blink).toFixed(2)})`; ctx2.lineWidth = 3; ctx2.setLineDash([6, 6]);
        ctx2.beginPath(); ctx2.arc(bx, by, (f.R + 0.5) * TS, 0, 6.283); ctx2.stroke(); ctx2.setLineDash([]);
      }

      // חברים
      let pi = 0;
      for (const [pid, o] of g.others.entries()) {
        const col = PCOL[(g.players.findIndex((p) => p.id === pid) + 1) % PCOL.length];
        const px = o.x * TS + TS / 2, py = o.y * TS + TS / 2;
        if (o.down) ctx2.globalAlpha = 0.45;
        ctx2.strokeStyle = col; ctx2.lineWidth = 3; ctx2.beginPath(); ctx2.arc(px, py, TS * 0.55, 0, 6.283); ctx2.stroke();
        if (!spr(o.dir === 0 ? "miner-back" : o.dir === 2 ? "miner-front" : "miner-side", px, py, TS * 1.15, 0, o.dir === 3)) {
          ctx2.fillStyle = col; ctx2.fillRect(px - 11, py - 11, 22, 22);
        }
        const nm = g.players.find((p) => p.id === pid)?.name ?? "";
        ctx2.font = "800 11px Assistant, sans-serif"; ctx2.textAlign = "center";
        ctx2.fillStyle = "#000"; ctx2.fillText(nm, px + 1, py - TS * 0.62 + 1);
        ctx2.fillStyle = col; ctx2.fillText(nm, px, py - TS * 0.62);
        ctx2.globalAlpha = 1;
        if (o.down) { ctx2.font = "16px sans-serif"; ctx2.fillText("💀", px, py - 2); }
        pi++;
      }

      // אני
      if (!m.dead) {
        const dd = [[0, -1], [1, 0], [0, 1], [-1, 0]][m.dir];
        const kick = g.digPunch * 6;
        const px = m.x * TS + TS / 2 + dd[0] * kick, py = m.y * TS + TS / 2 + dd[1] * kick;
        if (!spr(m.dir === 0 ? "miner-back" : m.dir === 2 ? "miner-front" : "miner-side", px, py, TS * 1.22 * (1 + g.digPunch * 0.06), g.digPunch * 0.1 * (dd[0] || 1), m.dir === 3)) {
          ctx2.fillStyle = "#FF8A3D"; ctx2.fillRect(px - 11, py - 11, 22, 22);
        }
      }

      // מד הקושי — "חומר קשה", לא "נתקעתי"
      if (!m.dead && (g.dir.x || g.dir.y)) {
        const tc = m.c + g.dir.x, tr = m.r + g.dir.y;
        if (inB(tc, tr) && solid(tc, tr)) {
          const i = idx(tc, tr), h = HARDNESS[g.grid[i]];
          if (h < 999) {
            const X = tc * TS, Y = tr * TS, eta = (h / Math.max(0.06, g.stats.pow)) * (1 - g.prog[i]), hard = eta > 2.5;
            ctx2.strokeStyle = "rgba(255,255,255,.18)"; ctx2.lineWidth = 4;
            ctx2.beginPath(); ctx2.arc(X + TS / 2, Y + TS / 2, TS * 0.4, 0, 6.283); ctx2.stroke();
            ctx2.strokeStyle = hard ? "#FF9A3C" : "#46E0C0"; ctx2.lineWidth = 4;
            ctx2.beginPath(); ctx2.arc(X + TS / 2, Y + TS / 2, TS * 0.4, -1.57, -1.57 + 6.283 * Math.min(1, g.prog[i])); ctx2.stroke();
            const label = `קושי ${h} · כוחך ${g.stats.pow}`;
            ctx2.font = "800 12px Assistant, sans-serif"; ctx2.textAlign = "center";
            const w = ctx2.measureText(label).width + 12;
            ctx2.fillStyle = hard ? "rgba(120,52,10,.92)" : "rgba(10,40,36,.9)";
            ctx2.fillRect(X + TS / 2 - w / 2, Y - 24, w, 19);
            ctx2.fillStyle = hard ? "#FFD9A8" : "#BFF5EA"; ctx2.fillText(label, X + TS / 2, Y - 10);
            if (hard) { ctx2.fillStyle = `rgba(255,154,60,${0.55 + 0.45 * Math.sin(ts / 160)})`; ctx2.fillText("📣 קרא לחבר", X + TS / 2, Y + TS + 18); }
          }
        }
      }

      for (const p of g.parts) { ctx2.globalAlpha = Math.max(0, p.l); ctx2.fillStyle = p.col; ctx2.fillRect(p.x * TS - 2, p.y * TS - 2, 4, 4); }
      ctx2.globalAlpha = 1; ctx2.textAlign = "center";
      for (const p of g.pops) {
        ctx2.globalAlpha = Math.min(1, p.l); ctx2.font = `800 ${p.sz}px Assistant, sans-serif`;
        ctx2.fillStyle = "#000"; ctx2.fillText(p.t, p.x * TS + 1, p.y * TS + 1);
        ctx2.fillStyle = p.col; ctx2.fillText(p.t, p.x * TS, p.y * TS);
      }
      ctx2.globalAlpha = 1;
      ctx2.restore();

      // פנס
      const lg = ctx2.createRadialGradient(m.x * TS - g.cam.x + TS / 2, m.y * TS - g.cam.y + TS / 2, TS * 1.2, m.x * TS - g.cam.x + TS / 2, m.y * TS - g.cam.y + TS / 2, lr);
      lg.addColorStop(0, "rgba(0,0,0,0)"); lg.addColorStop(0.55, "rgba(4,3,2,.3)"); lg.addColorStop(1, "rgba(3,2,2,.9)");
      ctx2.fillStyle = lg; ctx2.fillRect(0, 0, W, H);
      if (g.flash > 0) { ctx2.globalAlpha = Math.min(0.55, g.flash * 1.6); ctx2.fillStyle = g.flashCol; ctx2.fillRect(0, 0, W, H); ctx2.globalAlpha = 1; }
      if (g.stats.xray) for (const mo of g.mons.values()) {              // הקלף מבטיח לראות מפלצות — מקיימים
        const mx2 = mo.x * TS - g.cam.x + TS / 2, my2 = mo.y * TS - g.cam.y + TS / 2;
        if (mx2 < 0 || mx2 > W || my2 < 0 || my2 > H) continue;
        ctx2.globalAlpha = 0.55; ctx2.fillStyle = MON_COL[mo.k] ?? "#E5484D";
        ctx2.beginPath(); ctx2.arc(mx2, my2, 4, 0, 6.283); ctx2.fill(); ctx2.globalAlpha = 1;
      }

      // מצפן למעלית
      const lx = g.liftC * TS + TS / 2, ly = 4 * TS, ddx = lx - m.x * TS, ddy = ly - m.y * TS, dd2 = Math.hypot(ddx, ddy);
      if (dd2 > TS * 4) {
        ctx2.save(); ctx2.translate(W / 2, 54); ctx2.rotate(Math.atan2(ddy, ddx));
        ctx2.fillStyle = "rgba(242,193,78,.92)"; ctx2.strokeStyle = "#000"; ctx2.lineWidth = 2;
        ctx2.beginPath(); ctx2.moveTo(13, 0); ctx2.lineTo(-8, -8); ctx2.lineTo(-4, 0); ctx2.lineTo(-8, 8); ctx2.closePath();
        ctx2.fill(); ctx2.stroke(); ctx2.restore();
      }
      if (g.ping) {
        const pdx = (g.ping.x + 0.5) * TS - (m.x + 0.5) * TS, pdy = (g.ping.y + 0.5) * TS - (m.y + 0.5) * TS;
        if (Math.hypot(pdx, pdy) > TS * 3) {
          ctx2.save(); ctx2.translate(W / 2, 96); ctx2.rotate(Math.atan2(pdy, pdx));
          ctx2.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(g.ping.t * 6));
          ctx2.fillStyle = g.ping.col; ctx2.strokeStyle = "#000"; ctx2.lineWidth = 2;
          ctx2.beginPath(); ctx2.moveTo(16, 0); ctx2.lineTo(-9, -9); ctx2.lineTo(-5, 0); ctx2.lineTo(-9, 9); ctx2.closePath();
          ctx2.fill(); ctx2.stroke(); ctx2.restore(); ctx2.globalAlpha = 1;
          ctx2.font = "15px sans-serif"; ctx2.textAlign = "center"; ctx2.fillText("📣", W / 2, 80);
        }
      }
      // חיצי חברים — מי שמחוץ למסך מקבל חץ בצבע שלו על שפת המסך, עם שם ומרחק.
      // בלי זה 8 שחקנים במפה של 46×110 הם 8 משחקי יחיד.
      for (const [pid, o] of g.others.entries()) {
        const fx2 = o.x * TS - g.cam.x + TS / 2, fy2 = o.y * TS - g.cam.y + TS / 2;
        if (fx2 > -TS && fx2 < W + TS && fy2 > -TS && fy2 < H + TS) continue;
        const col = PCOL[(g.players.findIndex((p) => p.id === pid) + 1) % PCOL.length];
        const cx = W / 2, cy = H / 2, ddx2 = fx2 - cx, ddy2 = fy2 - cy;
        const pad = 30;
        const tX = ddx2 !== 0 ? ((ddx2 > 0 ? W - pad : pad) - cx) / ddx2 : Infinity;
        const tY = ddy2 !== 0 ? ((ddy2 > 0 ? H - pad : pad) - cy) / ddy2 : Infinity;
        const tt = Math.min(tX, tY);
        const ex2 = cx + ddx2 * tt, ey2 = cy + ddy2 * tt;
        const dist = Math.round(Math.hypot(o.x - m.x, o.y - m.y));
        ctx2.save(); ctx2.translate(ex2, ey2); ctx2.rotate(Math.atan2(ddy2, ddx2));
        ctx2.globalAlpha = o.down ? 0.5 : 0.9;
        ctx2.fillStyle = col; ctx2.strokeStyle = "#000"; ctx2.lineWidth = 2;
        ctx2.beginPath(); ctx2.moveTo(12, 0); ctx2.lineTo(-7, -7); ctx2.lineTo(-4, 0); ctx2.lineTo(-7, 7); ctx2.closePath();
        ctx2.fill(); ctx2.stroke(); ctx2.restore();
        const nm2 = (g.players.find((p) => p.id === pid)?.name ?? "").slice(0, 6);
        const lbl = (o.down ? "💀 " : "") + nm2 + " · " + dist;
        ctx2.font = "800 10px Assistant, sans-serif"; ctx2.textAlign = "center";
        ctx2.fillStyle = "#000"; ctx2.fillText(lbl, ex2 + 1, ey2 + 18);
        ctx2.fillStyle = col; ctx2.fillText(lbl, ex2, ey2 + 17);
        ctx2.globalAlpha = 1;
      }
      if (joy.current.on) {
        ctx2.strokeStyle = "rgba(243,231,211,.35)"; ctx2.lineWidth = 3;
        ctx2.beginPath(); ctx2.arc(joy.current.ox, joy.current.oy, 46, 0, 6.283); ctx2.stroke();
        ctx2.fillStyle = "rgba(255,138,61,.85)";
        ctx2.beginPath(); ctx2.arc(joy.current.ox + joy.current.dx * 46, joy.current.oy + joy.current.dy * 46, 20, 0, 6.283); ctx2.fill();
      }
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [ready, me]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2200); return () => clearTimeout(t); }, [toast]);

  const pct = hud.target ? Math.min(100, (hud.banked / hud.target) * 100) : 0;
  const nearly = pct >= 85;

  return (
    <div className="hf-wrap" style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh", zIndex: 60, background: "#0B0908", overflow: "hidden", touchAction: "none" }}>
      <canvas ref={cvRef} className="hf-cv" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />

      {/* מד הצוות — מספר מוחלט, בלי דירוג */}
      <div className="hf-quota">
        <div className="hf-qbar"><div className="hf-qfill" style={{ width: pct + "%" }} /></div>
        <b>{nearly ? `עוד ${(hud.target - hud.banked).toLocaleString()}` : `${hud.banked.toLocaleString()} / ${hud.target.toLocaleString()}`}</b>
        <span>משמרת {hud.shift}/{hud.of} · {Math.floor(hud.left / 60)}:{String(hud.left % 60).padStart(2, "0")}</span>
      </div>

      <div className="hf-team">
        {teams.map((t) => (
          <div key={t.pid} className={"hf-tp" + (t.pid === me ? " me" : "")}>
            <span className="e">{t.emoji}</span>
            <b>{t.gold.toLocaleString()}</b>
            <span className="b">{t.build.slice(-3).join("")}</span>
          </div>
        ))}
      </div>

      <div className="hf-hud">
        <span className="chip">{"❤️".repeat(hud.hp)}{"🖤".repeat(Math.max(0, hud.maxhp - hud.hp))}</span>
        <span className="chip">🎒 {hud.bag}/{hud.slots}</span>
        <span className="chip">⛏️ {hud.pow}</span>
        <span className="chip">⭐ {hud.level}</span>
      </div>

      <button className="hf-call" onClick={() => { conn.sendGame({ a: "hf_call" }); G.current.call = 8; }}>📣</button>
      {G.current.stats.bomb > 0 && <button className="hf-bomb" onClick={() => conn.sendGame({ a: "hf_bomb" })}>🧨</button>}

      {toast && <div className="hf-toast">{toast}</div>}
      {banner && (
        <div className="hf-banner"><div className="in">
          <div className="ic">{banner.ic}</div><div className="ti">{banner.t}</div><div className="su">{banner.s}</div>
        </div></div>
      )}

      {draft && (
        <div className="hf-draft">
          <div className="card">
            <h2>רמה {hud.level} — במה משדרגים?</h2>
            {draft.map((c) => (
              <button key={c.id} className="hf-pick" onClick={() => conn.sendGame({ a: "hf_pick", card: c.id })}>
                <span className="ic">{c.ic}</span>
                <span className="tx"><b>{c.t}{c.wow && <i className="new">חדש!</i>}</b><span>{c.d}</span></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- עוזרים ---- */
function burst(g: { parts: { x: number; y: number; vx: number; vy: number; l: number; col: string }[] }, x: number, y: number, col: string, n: number) {
  for (let i = 0; i < n && g.parts.length < 220; i++) {
    const a = Math.random() * 6.28, s = 1 + Math.random() * 4;
    g.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, l: 0.5 + Math.random() * 0.4, col });
  }
}
function pop(g: { pops: { x: number; y: number; t: string; col: string; l: number; sz: number }[] }, x: number, y: number, t: string, col: string, sz: number) {
  g.pops.push({ x, y, t, col, l: 1, sz });
}
