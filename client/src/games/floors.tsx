/**
 * הקומות 🏢 — צד לקוח (גרייבוקס, שלב A).
 *
 * "הטלפון בעלים של הריצה, השרת בעלים של השעון": הפיזיקה (shared/floors.ts, פורט של Icy Tower 1.3.1)
 * רצה כאן ב-50Hz דטרמיניסטי על המגדל המשותף (seed לחדר); השרת מקבל דיווח ב-10Hz ומחזיר
 * את כולם + קו המוות. ה-cues (עצירה/חשיפה) מגיעים בזמן-שרת — כל הטלפונים קופאים באותה שנייה.
 *
 * שליטה (מחקר UI 4.9): אגודל נוגע וגורר אופקית = ג'ויסטיק יחסי; טאפ (<200ms, <12px) בכל מקום = קפיצה;
 * אצבע שנייה בזמן גרירה = קפיצה מיידית; כפתורי שדרוג פעיל בפינה שמאלית-תחתונה (הבקשה של איתן), 60px + hit-slop.
 * ציור: canvas אחד לעולם (DPR עד 2), DOM ל-HUD/דראפט/חצים.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { GameViewProps } from "./registry";
import {
  FL, flNewSim, flStep, flMods, flFloor, flFloorY, flFloorAt, flPlace, flBreakCombo, flShout, FL_SHOUTS,
  flRunStart, flRunEnd, flKillRate, flCard, flNewBot, flBotInput,
} from "../../../shared/floors";
import type { FlSim, FlMods, FlInput, FloorsServerMsg, FlCardWire, FlTimingWire } from "../../../shared/floors";
import { flAudioInit, flSfx } from "./floorsAudio";
import { vibrate } from "../lib/audio";

type Phase = "wait" | "pick" | "intro" | "run" | "freeze" | "draft" | "reveal" | "over";
type OverMsg = Extract<FloorsServerMsg, { a: "fl_over" }>;
interface Other { x: number; y: number; tx: number; ty: number; dx: number; st: number; floor: number; combo: number; at: number; dead: boolean; out: boolean }
interface Pop { x: number; y: number; t: string; col: string; l: number; sz: number; vy: number }
interface Part { x: number; y: number; vx: number; vy: number; l: number; col: string; r: number }
interface Shot { id: number; by: string; x: number; y: number; dx: number; at: number; done: boolean }

const REPORT_MS = FL.REPORT_MS;
const TAP_MS = 200, TAP_PX = 12, STICK_PX = 26, DEAD_PX = 5;
const INK = "#0C0906", PAPER = "#FFF3DC", SIG = "#FF7A29";
/** צבע הקטע לפי הקומה (כל 100 — הגרפיקה מתחלפת, כמו במקור) */
const SECTIONS = ["#7D8DA3", "#8FD3F4", "#C8955B", "#9AA5B1", "#E88AD1", "#E9E1C9", "#6FBF73", "#5CC8B0", "#CFE7FF", "#F7B7D2", "#BFEFFF"];
const RAR_COL: Record<string, string> = { c: "#C8B78E", u: "#4D86FF", r: "#A855F7", chaos: "#FF7A29", cursed: "#9B6BFF", fun: "#FFC531", evo: "#FFC531" };
const RAR_NAME: Record<string, string> = { c: "רגיל", u: "נדיר", r: "אגדי", chaos: "כאוס", cursed: "מקולל", fun: "קומי", evo: "אבולוציה" };
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

declare global { interface Window { __flDbg?: unknown; __flFrames?: number; __flErr?: string; __flAuto?: boolean } }

export default function FloorsView({ room, me, conn, hub }: GameViewProps) {
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("wait");
  const [pick, setPick] = useState<{ taken: Record<string, number>; until: number } | null>(null);
  const [hud, setHud] = useState({ floor: 0, combo: 0, comboFrac: 0, lives: FL.LIVES as number, secs: 0, lvl: 0, score: 0, rank: 0, n: 0, dead: false, out: false, k: 0, sprint: false });
  const [arrows, setArrows] = useState<{ pid: string; up: boolean; d: number; x: number }[]>([]);
  const [count, setCount] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ ic: string; t: string; s?: string; cls?: string } | null>(null);
  const [freeze, setFreeze] = useState<{ rank: string[]; scores: Record<string, number> } | null>(null);
  const [draft, setDraft] = useState<{ cards: FlCardWire[]; until: number; sel?: string; locked?: string } | null>(null);
  const [reveal, setReveal] = useState<Record<string, FlCardWire | null> | null>(null);
  const [over, setOver] = useState<OverMsg | null>(null);
  const [feed, setFeed] = useState<{ id: number; tx: string }[]>([]);
  const [btns, setBtns] = useState<{ id: string; ic: string; readyAt: number; cd: number }[]>([]);
  const [flash, setFlash] = useState<string>("");
  const feedId = useRef(1);

  const G = useRef({
    phase: "wait" as Phase, seed: "", startAt: 0, cfg: null as FlTimingWire | null, k: 0,
    chars: {} as Record<string, number>, lives: {} as Record<string, number>,
    sim: flNewSim() as FlSim, mods: flMods([]) as FlMods, cards: [] as string[],
    others: new Map<string, Other>(),
    kill: -3 * FL.FLOOR_H, killAt: 0, killRate: 0, lvl: 0, killDraw: -3 * FL.FLOOR_H,
    frozen: false, dead: false, out: false, respawnAt: 0, respawnFloor: 0, invulnUntil: 0, graceUntil: 0, propUsed: false,
    attackReadyAt: 0, shieldReadyAt: 0, bananaAt: 0, btnReady: {} as Record<string, number>,
    shots: new Map<number, Shot>(), traps: new Map<number, { by: string; floor: number; until: number }>(),
    input: { pid: -1, x0: 0, y0: 0, t0: 0, drag: false, dir: 0, hold: false, jumpQ: 0 },
    cam: { bottom: -200, vh: 800, scale: 1 },
    fx: { pops: [] as Pop[], parts: [] as Part[], shake: 0, flash: 0, flashCol: "#fff", spinA: 0 },
    acc: 0, lastFrame: 0, lastReport: 0, hudAt: 0, arrowsAt: 0, lastLvl: 0, lastAight: 0, seenFloor50: 0,
    players: [] as { id: string; name: string; emoji: string }[],
    reduced: reduced(),
  });

  const pl = (pid: string) => G.current.players.find((p) => p.id === pid);
  const pname = (pid: string) => pl(pid)?.name ?? "מישהו";
  const charOf = (pid: string) => G.current.chars[pid] ?? 0;
  const chEmoji = (pid: string) => FL.CHARS[charOf(pid)] ?? "🙂";
  const chColor = (pid: string) => FL.CHAR_COLORS[charOf(pid)] ?? "#fff";
  const fmt = (n: number) => Math.round(n).toLocaleString("he-IL");
  function setPhaseBoth(p: Phase) { G.current.phase = p; setPhase(p); }
  function addFeed(tx: string) { setFeed((f) => [...f.slice(-2), { id: feedId.current++, tx }]); }
  function pop(x: number, y: number, t: string, col = PAPER, sz = 20) { G.current.fx.pops.push({ x, y, t, col, l: 1, sz, vy: 1.2 }); }
  function burst(x: number, y: number, col: string, n = 10, sp = 5) { const g = G.current; if (g.reduced) return; for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = Math.random() * sp + 1; g.fx.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 2, l: 1, col, r: 2 + Math.random() * 3 }); } }
  const myScore = () => { const s = G.current.sim; return s.maxFloor * 10 + s.comboBonus; };

  useEffect(() => { G.current.players = room.players.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })); }, [room.players]);
  useEffect(() => { flAudioInit(); }, []);
  useEffect(() => { if (!banner) return; const t = setTimeout(() => setBanner(null), banner.cls === "long" ? 3000 : banner.cls === "short" ? 1100 : 2000); return () => clearTimeout(t); }, [banner]);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(""), 300); return () => clearTimeout(t); }, [flash]);

  /* ---------- כפתורי שדרוג ---------- */
  function refreshButtons() {
    const g = G.current;
    const list: { id: string; ic: string; readyAt: number; cd: number }[] = [];
    for (const id of new Set(g.cards)) { const c = flCard(id); if (c?.kind === "button") list.push({ id, ic: c.ic, readyAt: g.btnReady[id] ?? 0, cd: c.cd ?? 4000 }); }
    setBtns(list.slice(0, 3));
  }
  function useButton(id: string) {
    const g = G.current; const t = conn.serverNow();
    if (g.phase !== "run" || g.dead || g.out || g.frozen) return;
    if (t < (g.btnReady[id] ?? 0) || t < g.graceUntil) { vibrate(20); return; }
    if (id === "snow") {
      g.btnReady[id] = t + (flCard("snow")!.cd ?? 4000);
      conn.sendGame({ a: "fl_shot", x: Math.round(g.sim.x), y: Math.round(g.sim.y + 20), dx: g.sim.face });
      flSfx.shot();
    }
    refreshButtons();
  }

  /* ---------- הודעות מהשרת ---------- */
  useEffect(() => {
    return hub.subscribe((raw) => {
      const d = raw as unknown as FloorsServerMsg;
      if (typeof (d as any)?.a !== "string" || !(d as any).a.startsWith("fl_")) return;
      const g = G.current;
      try {
        switch (d.a) {
          case "fl_pickphase": {
            if (g.phase === "wait" || g.phase === "pick") { setPhaseBoth("pick"); setPick((p) => ({ taken: d.taken, until: d.until || p?.until || conn.serverNow() + 15000 })); }
            g.chars = d.taken;
            break;
          }
          case "fl_go": {
            g.seed = d.seed; g.startAt = d.startAt; g.cfg = d.cfg; g.chars = d.chars; g.lives = d.lives; g.k = 0;
            g.sim = flNewSim(FL.W / 2); g.dead = false; g.out = false; g.frozen = false; g.propUsed = false;
            g.cam.bottom = -200;
            setPick(null); setPhaseBoth("intro");
            // ספירה לאחור מסונכרנת
            const steps = ["3", "2", "1", "קדימה!"];
            steps.forEach((s, i) => setTimeout(() => { setCount(s); if (i < 3) flSfx.count(); else { flSfx.go(); vibrate(40); } }, Math.max(0, conn.untilServer(d.startAt - (3 - i) * 800))));
            setTimeout(() => { setCount(null); setPhaseBoth("run"); g.graceUntil = conn.serverNow() + FL.GRACE_MS; }, Math.max(0, conn.untilServer(d.startAt)));
            break;
          }
          case "fl_pos": {
            const t = conn.serverNow();
            g.kill = d.kill; g.killAt = t; g.lvl = d.lvl; g.k = d.k;
            const seen = new Set<string>();
            for (const [pid, x, y, dx, st, floor, combo] of d.ps) {
              seen.add(pid);
              if (pid === me) continue;
              const o = g.others.get(pid);
              if (o) { o.tx = x; o.ty = y; o.dx = dx; o.st = st; o.floor = floor; o.combo = combo; o.at = t; if (Math.hypot(o.x - x, o.y - y) > 300) { o.x = x; o.y = y; } }
              else g.others.set(pid, { x, y, tx: x, ty: y, dx, st, floor, combo, at: t, dead: false, out: false });
            }
            for (const [pid, o] of g.others) if (!seen.has(pid)) o.out = true;
            if (d.lvl !== g.lastLvl) { if (d.lvl > g.lastLvl && g.phase === "run" && d.lvl >= 2) { flSfx.hurry(); setBanner({ ic: "⏰", t: d.lvl >= 4 ? "ספרינט!" : "מהר יותר!", cls: "short" }); } g.lastLvl = d.lvl; }
            break;
          }
          case "fl_freeze": {
            g.frozen = true; setPhaseBoth("freeze");
            g.input.dir = 0; g.input.hold = false;
            setFreeze({ rank: d.rank, scores: d.scores });
            flSfx.freeze(); vibrate([60, 40, 60]);
            setFlash("#fff");
            break;
          }
          case "fl_draft": {
            setFreeze(null); setPhaseBoth("draft");
            setDraft({ cards: d.cards, until: d.until });
            break;
          }
          case "fl_took": {
            if (d.pid === me) { g.cards.push(d.card.id); g.mods = flMods(g.cards); refreshButtons(); }
            else addFeed(`${chEmoji(d.pid)} ${pname(d.pid)} לקח ${d.card.ic} ${d.card.t}`);
            break;
          }
          case "fl_reveal": {
            setDraft(null); setPhaseBoth("reveal"); setReveal(d.picks);
            const mine = d.picks[me];
            if (mine && !g.cards.includes(mine.id)) { g.cards.push(mine.id); g.mods = flMods(g.cards); refreshButtons(); }
            if (mine?.id === "life") { g.lives[me] = Math.min(FL.LIVES_MAX, (g.lives[me] ?? FL.LIVES) + 1); }
            flSfx.reveal();
            setTimeout(() => {
              setReveal(null); g.frozen = false; setPhaseBoth("run");
              g.graceUntil = conn.serverNow() + FL.GRACE_MS;
              const sprint = g.cfg && d.k + 1 >= g.cfg.cycles;
              setBanner({ ic: sprint ? "🏁" : "🏃", t: sprint ? "ספרינט הסיום!" : `דקה ${d.k + 2}`, s: "5 שניות חסד — אין פגיעות", cls: "short" });
              flSfx.go();
            }, Math.max(0, conn.untilServer(d.resumeAt)));
            break;
          }
          case "fl_fell": {
            g.lives[d.pid] = d.lives;
            if (d.pid === me) {
              g.dead = true; g.respawnAt = d.respawnAt; g.respawnFloor = d.floor;
              flBreakCombo(g.sim, g.mods);
              if (d.lives <= 0) { g.out = true; setBanner({ ic: "💀", t: "נגמרו החיים", s: "צופים עד הסוף", cls: "long" }); }
              else setBanner({ ic: "💔", t: `נפלת! נשארו ${d.lives}`, s: "חוזרים בעוד 3 שניות", cls: "long" });
            } else {
              const o = g.others.get(d.pid); if (o) { o.dead = true; if (d.lives <= 0) o.out = true; }
              addFeed(`${chEmoji(d.pid)} ${pname(d.pid)} נפל ${d.lives > 0 ? `(${d.lives} ❤️)` : "— בחוץ"}`);
              setTimeout(() => { const o2 = g.others.get(d.pid); if (o2) o2.dead = false; }, Math.max(0, conn.untilServer(d.respawnAt)));
            }
            break;
          }
          case "fl_out": { const o = g.others.get(d.pid); if (o) o.out = true; break; }
          case "fl_hit": {
            if (d.target === me) {
              const s = g.sim; s.st = 2; s.dy = -FL.HAMMER_DROP; s.dx = d.dir * FL.HAMMER_FLING; s.coyote = 0;
              flBreakCombo(s, g.mods);
              g.fx.shake = 8; g.fx.flash = 0.5; g.fx.flashCol = "#FF4438"; flSfx.hit(true); vibrate(80);
              setBanner({ ic: "🔨", t: `${pname(d.by)} הפיל אותך!`, cls: "short" });
            } else {
              const o = g.others.get(d.target); if (o) { burst(o.x, o.y + 20, "#FF4438", 8); }
              if (d.by === me) { flSfx.hit(false); pop(g.sim.x, g.sim.y + 60, "🔨 בום!", "#FF4438", 18); }
            }
            break;
          }
          case "fl_shot": {
            g.shots.set(d.id, { id: d.id, by: d.by, x: d.x, y: d.y, dx: d.dx, at: d.at, done: false });
            if (d.by !== me) flSfx.shot();
            break;
          }
          case "fl_shothit": {
            const sh = g.shots.get(d.id); if (sh) sh.done = true;
            if (d.pid === me) {
              if (d.shielded) { flSfx.shield(); pop(g.sim.x, g.sim.y + 60, "🛡️", "#8FE9F5", 24); g.shieldReadyAt = conn.serverNow() + 20000; }
              else { g.sim.slowUntil = g.sim.tick + Math.round(FL.SHOT_SLOW_MS / FL.TICK_MS); flSfx.hit(true); g.fx.flash = 0.35; g.fx.flashCol = "#8FE9F5"; vibrate(50); setBanner({ ic: "❄️", t: `${pname(d.by)} פגע בך`, cls: "short" }); }
            } else { const o = g.others.get(d.pid); if (o) burst(o.x, o.y + 20, d.shielded ? "#8FE9F5" : "#FFFFFF", 8); if (d.by === me && !d.shielded) pop(g.sim.x, g.sim.y + 60, "❄️ פגיעה!", "#8FE9F5", 18); }
            break;
          }
          case "fl_trap": { g.traps.set(d.id, { by: d.by, floor: d.floor, until: d.until }); if (d.by !== me) { /* שקט — מגלים ברגל */ } break; }
          case "fl_shout": {
            const tier = FL_SHOUTS.length - 1 - FL_SHOUTS.findIndex(([n]) => d.n >= n);
            if (d.pid !== me) {
              if (d.n >= 15) { addFeed(`${chEmoji(d.pid)} ${pname(d.pid)}: ${d.text} (${d.n})`); flSfx.shout(tier, false); }
              const o = g.others.get(d.pid); if (o) pop(o.x, o.y + 70, d.text, chColor(d.pid), 18);
            }
            break;
          }
          case "fl_bonus": {
            if (d.pid === me) { g.sim.comboBonus += 0; pop(g.sim.x, g.sim.y + 70, `+${d.amount} ${d.kind === "hunter" ? "🎯" : "🐕"}`, "#FFC531", 20); }
            break;
          }
          case "fl_over": {
            g.frozen = true; setPhaseBoth("over"); setOver(d); setDraft(null); setReveal(null); setFreeze(null);
            flSfx.over(); vibrate([80, 60, 120]);
            break;
          }
          case "fl_sync": {
            g.seed = d.seed; g.startAt = d.startAt; g.cfg = d.cfg; g.chars = d.chars; g.lives = d.lives; g.k = d.k;
            g.cards = d.cards[me] ?? []; g.mods = flMods(g.cards); refreshButtons();
            g.out = d.you.out;
            if (d.phase === "pick") { setPhaseBoth("pick"); setPick({ taken: d.chars, until: conn.serverNow() + 8000 }); }
            else if (d.phase === "over") { setPhaseBoth("over"); }
            else { flPlace(g.sim, g.seed, d.you.floor); g.cam.bottom = g.sim.y - 200; g.frozen = d.phase !== "run"; setPhaseBoth(d.phase === "run" ? "run" : "freeze"); g.invulnUntil = conn.serverNow() + 2000; }
            break;
          }
        }
      } catch (e) { window.__flErr = String(e); }
    });
  }, [hub, me]);

  /* ---------- קלט ---------- */
  useEffect(() => {
    const el = cvRef.current?.parentElement; if (!el) return;
    const g = G.current;
    const isBtn = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.(".fl-btn, .fl-draft, .fl-pick, .fl-over, .fl-reveal, button");
    const down = (e: PointerEvent) => {
      if (isBtn(e.target)) return;
      flAudioInit();
      const inp = g.input;
      if (inp.pid >= 0 && inp.drag) { inp.jumpQ = 1; inp.hold = true; return; } // אצבע שנייה בזמן גרירה = קפיצה מיידית
      inp.pid = e.pointerId; inp.x0 = e.clientX; inp.y0 = e.clientY; inp.t0 = performance.now(); inp.drag = false;
      try { el.setPointerCapture(e.pointerId); } catch { /* */ }
    };
    const move = (e: PointerEvent) => {
      const inp = g.input; if (e.pointerId !== inp.pid) return;
      const dx = e.clientX - inp.x0, dy = e.clientY - inp.y0;
      if (!inp.drag && Math.hypot(dx, dy) > TAP_PX) inp.drag = true;
      if (inp.drag) { inp.dir = Math.abs(dx) < DEAD_PX ? 0 : Math.max(-1, Math.min(1, dx / STICK_PX)); }
    };
    const up = (e: PointerEvent) => {
      const inp = g.input;
      if (e.pointerId !== inp.pid) { inp.hold = false; return; }
      if (!inp.drag && performance.now() - inp.t0 < TAP_MS) { inp.jumpQ = 1; }
      inp.pid = -1; inp.drag = false; inp.dir = 0; inp.hold = false;
    };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    const prevent = (e: TouchEvent) => { if (!isBtn(e.target)) e.preventDefault(); };
    el.addEventListener("touchstart", prevent, { passive: false }); el.addEventListener("touchmove", prevent, { passive: false });
    const key = (e: KeyboardEvent) => { // מקלדת לפיתוח
      if (e.type === "keydown") { if (e.key === "ArrowLeft") g.input.dir = -1; if (e.key === "ArrowRight") g.input.dir = 1; if (e.key === " " || e.key === "ArrowUp") { if (!e.repeat) g.input.jumpQ = 1; g.input.hold = true; } if (e.key === "x") useButton("snow"); }
      else { if (e.key === "ArrowLeft" && g.input.dir < 0) g.input.dir = 0; if (e.key === "ArrowRight" && g.input.dir > 0) g.input.dir = 0; if (e.key === " " || e.key === "ArrowUp") g.input.hold = false; }
    };
    window.addEventListener("keydown", key); window.addEventListener("keyup", key);
    return () => {
      el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
      el.removeEventListener("touchstart", prevent); el.removeEventListener("touchmove", prevent);
      window.removeEventListener("keydown", key); window.removeEventListener("keyup", key);
    };
  }, []);

  /* ---------- הלולאה ---------- */
  useEffect(() => {
    const cv = cvRef.current!; const ctx = cv.getContext("2d", { alpha: false })!;
    let raf = 0, cssW = 0, cssH = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cssW = cv.clientWidth || window.innerWidth; cssH = cv.clientHeight || window.innerHeight;
      cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
      const g = G.current; g.cam.scale = cssW / FL.W; g.cam.vh = cssH / g.cam.scale;
    };
    resize(); window.addEventListener("resize", resize);
    const slippery = (floor: number) => { const t = conn.serverNow(); for (const tr of G.current.traps.values()) if (tr.floor === floor && tr.by !== me && tr.until > t) return true; return false; };

    const events = {
      jump: (v: number, air: boolean) => { const g = G.current; if (air) flSfx.airJump(); else flSfx.jump(v); if (!air && g.mods.banana && conn.serverNow() > g.bananaAt) { g.bananaAt = conn.serverNow() + 3000; conn.sendGame({ a: "fl_trap", floor: g.sim.floor }); flSfx.banana(); } if (v > 22) burst(g.sim.x, g.sim.y, "#FFF", 5, 3); },
      land: (floor: number, gained: number) => {
        const g = G.current; flSfx.land(gained);
        if (gained >= 2) { pop(g.sim.x, g.sim.y + 50, `+${gained}`, gained >= 3 ? "#FFC531" : PAPER, 14 + gained * 2); if (!g.reduced) burst(g.sim.x, g.sim.y, SECTIONS[Math.floor(floor / 100) % SECTIONS.length], 4, 2); }
        if (floor % 50 === 0 && floor > g.seenFloor50) { g.seenFloor50 = floor; flSfx.aight(); pop(g.sim.x, g.sim.y + 90, `קומה ${floor}!`, "#FFC531", 24); vibrate(30); }
        if (slippery(floor)) { pop(g.sim.x, g.sim.y + 40, "🍌", "#FFC531", 20); }
      },
      wall: (v: number) => { const g = G.current; flSfx.wall(v); if (!g.reduced) burst(g.sim.x, g.sim.y + 20, "#FFF", 3, 2); },
      comboEnd: (n: number, bonus: number) => {
        const g = G.current; conn.sendGame({ a: "fl_combo", n, bonus });
        const text = flShout(n);
        if (text) { const tier = FL_SHOUTS.length - 1 - FL_SHOUTS.findIndex(([m]) => n >= m); flSfx.shout(tier, true); pop(g.sim.x, g.sim.y + 90, `${text} +${bonus}`, "#FFC531", 22 + tier * 2); vibrate(20 + tier * 10); }
      },
      comboBreak: () => { /* המד מתרוקן — שקט */ },
    };

    const step = () => {
      const g = G.current; const s = g.sim; const t = conn.serverNow();
      if (window.__flAuto && g.phase === "run" && !g.frozen) bot(g);
      const inp: FlInput = { dir: g.input.dir, jump: g.input.jumpQ > 0, hold: g.input.hold };
      g.input.jumpQ = 0;
      if (g.frozen || g.dead || g.out) { return; }
      const above = [...g.others.values()].some((o) => !o.out && o.y > s.y + 40);
      flStep(s, inp, g.mods, g.seed, events, slippery, above);
      // קו המוות
      const kill = killNow(t);
      if (s.y < kill - FL.DEATH_BELOW) {
        if (g.mods.propeller && !g.propUsed) {
          g.propUsed = true; conn.sendGame({ a: "fl_prop" });
          flPlace(s, g.seed, flFloorAt(kill) + 6); s.st = 2; s.dy = 6; g.invulnUntil = t + 1500;
          setBanner({ ic: "🚁", t: "כובע המדחף!", cls: "short" }); flSfx.respawn(); burst(s.x, s.y, "#FFF", 12, 6);
        } else {
          g.dead = true; conn.sendGame({ a: "fl_fell" }); flSfx.fall(); vibrate([40, 30, 80]); g.fx.shake = 10;
        }
      }
      // פטיש — התוקף מזהה
      if (g.mods.hammer && t >= g.attackReadyAt && t >= g.graceUntil && Math.abs(s.dx) > 4) {
        for (const [pid, o] of g.others) {
          if (o.out || o.dead) continue;
          if (Math.abs(o.x - s.x) < FL.HAMMER_R && Math.abs(o.y - s.y) < 34) { g.attackReadyAt = t + FL.ATTACK_CD_MS; conn.sendGame({ a: "fl_hit", target: pid, kind: "hammer" }); break; }
        }
      }
      // קליעים — הנפגע מזהה
      for (const sh of g.shots.values()) {
        if (sh.done || sh.by === me || t < g.invulnUntil) continue;
        const age = (t - sh.at) / FL.TICK_MS; if (age > FL.SHOT_LIFE) continue;
        const sx = sh.x + sh.dx * age;
        if (Math.abs(sx - s.x) < FL.SHOT_R + FL.BODY_HW && Math.abs(sh.y - (s.y + 20)) < 30) { sh.done = true; conn.sendGame({ a: "fl_hitme", shot: sh.id }); s.slowUntil = s.tick + 100; }
      }
    };
    /** בוט לפלייטסט (shared/floors.ts — מסתכל קדימה); לפעמים יורה */
    const bot = (g: typeof G.current) => {
      const b = (g as any).bot ?? ((g as any).bot = flNewBot(0.6 + Math.random() * 0.4));
      const inp = flBotInput(g.sim, g.mods, g.seed, b, killNow(conn.serverNow()));
      g.input.dir = inp.dir; if (inp.jump) g.input.jumpQ = 1;
      if (g.mods.snowball && Math.random() < 0.01) useButton("snow");
    };
    const killNow = (t: number) => { const g = G.current; if (!g.cfg || g.phase !== "run") return g.kill; const { rate } = flKillRate(g.cfg, g.k, t - flRunStart(g.cfg, g.startAt, g.k)); return g.kill + rate * Math.min(0.4, (t - g.killAt) / 1000); };

    const frame = (nowMs: number) => {
      raf = requestAnimationFrame(frame);
      const g = G.current; const t = conn.serverNow();
      try {
        // תחייה
        if (g.dead && !g.out && g.respawnAt && t >= g.respawnAt) {
          g.dead = false; g.respawnAt = 0; flPlace(g.sim, g.seed, g.respawnFloor); g.invulnUntil = t + FL.INVULN_MS; flSfx.respawn(); burst(g.sim.x, g.sim.y, "#FFF", 10, 5); g.cam.bottom = g.sim.y - g.cam.vh * 0.42;
        }
        // צעדים קבועים
        const dt = g.lastFrame ? Math.min(100, nowMs - g.lastFrame) : FL.TICK_MS; g.lastFrame = nowMs;
        g.acc += dt; let n = 0;
        while (g.acc >= FL.TICK_MS && n < 5) { step(); g.acc -= FL.TICK_MS; n++; }
        if (n >= 5) g.acc = 0;
        // אחרים — אינטרפולציה
        for (const o of g.others.values()) { o.x += (o.tx - o.x) * 0.25; o.y += (o.ty - o.y) * 0.25; }
        // דיווח
        if (t - g.lastReport > REPORT_MS && g.phase !== "wait" && g.phase !== "pick" && !g.out) {
          g.lastReport = t; const s = g.sim;
          conn.sendGame({ a: "fl_state", x: Math.round(s.x), y: Math.round(s.y), dx: Math.round(s.dx * 10) / 10, st: s.st, fl: s.floor, mf: s.maxFloor, cb: s.comboBonus, c: s.combo });
        }
        draw(ctx, cssW, cssH, dpr, t, killNow(t));
        // HUD ב-10Hz
        if (t - g.hudAt > 100) {
          g.hudAt = t; const s = g.sim;
          let secs = 0, sprint = false;
          if (g.cfg && g.startAt) { const end = flRunEnd(g.cfg, g.startAt, g.k); secs = Math.max(0, Math.ceil((end - t) / 1000)); sprint = g.k >= g.cfg.cycles; }
          const scores = [...g.others.entries()].filter(([, o]) => !o.out).map(([, o]) => o.floor * 10);
          const mine = myScore(); const rank = 1 + scores.filter((x) => x > mine).length;
          setHud({ floor: s.floor, combo: s.comboTicks > 0 ? s.combo : 0, comboFrac: s.comboTicks > 0 ? s.comboTicks / g.mods.comboTicks : 0, lives: (g.lives[me] ?? FL.LIVES) as number, secs, lvl: g.lvl, score: mine, rank, n: g.others.size + 1, dead: g.dead, out: g.out, k: g.k, sprint });
          if (btns.length) setBtns((b) => b.map((x) => ({ ...x, readyAt: g.btnReady[x.id] ?? 0 })));
        }
        if (t - g.arrowsAt > 150) {
          g.arrowsAt = t; const s = g.sim; const top = g.cam.bottom + g.cam.vh;
          const list: { pid: string; up: boolean; d: number; x: number }[] = [];
          for (const [pid, o] of g.others) { if (o.out) continue; if (o.y > top + 20) list.push({ pid, up: true, d: Math.round((o.y - s.y) / FL.FLOOR_H), x: o.x / FL.W }); else if (o.y < g.cam.bottom - 40) list.push({ pid, up: false, d: Math.round((s.y - o.y) / FL.FLOOR_H), x: o.x / FL.W }); }
          list.sort((a, b) => a.d - b.d); setArrows(list.slice(0, 4));
        }
        window.__flFrames = (window.__flFrames ?? 0) + 1;
      } catch (e) { window.__flErr = String(e); }
    };
    raf = requestAnimationFrame(frame);
    window.__flDbg = { get g() { return G.current; } };
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  /* ---------- ציור ---------- */
  function draw(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, t: number, kill: number) {
    const g = G.current; const s = g.sim; const S = g.cam.scale; const vh = g.cam.vh;
    // מצלמה
    let target = (g.dead && !g.out ? flFloorY(g.respawnFloor) : s.y) - vh * 0.42;
    if (g.out) { let best = -1e9; for (const o of g.others.values()) if (!o.out && o.y > best) best = o.y; if (best > -1e8) target = best - vh * 0.5; }
    target = Math.max(target, -vh * 0.25);
    g.cam.bottom += (target - g.cam.bottom) * (g.frozen ? 0.05 : 0.14);
    if (g.fx.shake > 0) g.fx.shake *= 0.85;
    const shx = g.fx.shake > 0.3 ? (Math.random() - 0.5) * g.fx.shake : 0, shy = g.fx.shake > 0.3 ? (Math.random() - 0.5) * g.fx.shake : 0;
    const bottom = g.cam.bottom, top = bottom + vh;
    const sx = (x: number) => x * S + shx, sy = (y: number) => (top - y) * S + shy;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // רקע לפי קטע
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#14110E"); grad.addColorStop(1, "#22190F");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    // פסי גובה עדינים
    ctx.strokeStyle = "rgba(255,243,220,.04)"; ctx.lineWidth = 1;
    for (let i = flFloorAt(bottom); i <= flFloorAt(top); i++) { const y = sy(flFloorY(i)); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // קירות
    ctx.fillStyle = "#2A2119"; ctx.fillRect(0, 0, sx(FL.TILE0 * FL.TILE) - shx, H); ctx.fillRect(sx((FL.TILE0 + FL.TILES) * FL.TILE) - shx, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.05)"; for (let y = ((top % 40) * S) % (40 * S); y < H; y += 40 * S) { ctx.fillRect(0, y, sx(FL.TILE0 * FL.TILE) - shx, 1); ctx.fillRect(sx((FL.TILE0 + FL.TILES) * FL.TILE) - shx, y, W, 1); }
    // קומות
    const lo = Math.max(0, flFloorAt(bottom) - 1), hi = flFloorAt(top) + 1;
    for (let i = lo; i <= hi; i++) {
      const f = flFloor(g.seed || "x", i); const y = sy(flFloorY(i));
      const col = SECTIONS[Math.floor(i / 100) % SECTIONS.length];
      const slip = slipperyNow(i, t);
      ctx.fillStyle = INK; ctx.fillRect(sx(f.x0) - 2, y - 2, (f.x1 - f.x0) * S + 4, 14 * S + 4);
      ctx.fillStyle = slip ? "#FFE066" : col; ctx.fillRect(sx(f.x0), y, (f.x1 - f.x0) * S, 12 * S);
      ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(sx(f.x0), y, (f.x1 - f.x0) * S, 3 * S);
      if (i % 10 === 0 && i > 0) { ctx.fillStyle = PAPER; ctx.font = `800 ${Math.round(11 * S)}px Assistant, sans-serif`; ctx.textAlign = "center"; ctx.fillText(String(i), sx((f.x0 + f.x1) / 2), y + 10 * S); }
      if (slip) { ctx.font = `${Math.round(14 * S)}px serif`; ctx.textAlign = "center"; ctx.fillText("🍌", sx((f.x0 + f.x1) / 2), y - 2); }
    }
    // קו המוות — "הקרח" שעולה
    g.killDraw += (kill - g.killDraw) * 0.2;
    const ky = sy(g.killDraw);
    if (ky > -40) {
      const kg = ctx.createLinearGradient(0, ky, 0, H);
      kg.addColorStop(0, "rgba(143,233,245,.9)"); kg.addColorStop(0.15, "rgba(56,200,232,.75)"); kg.addColorStop(1, "rgba(20,40,60,.95)");
      ctx.fillStyle = kg; ctx.beginPath(); ctx.moveTo(0, ky + 6);
      for (let x = 0; x <= W; x += 12) ctx.lineTo(x, ky + Math.sin(x / 18 + t / 180) * 4);
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#FFF"; ctx.lineWidth = 2; ctx.beginPath(); for (let x = 0; x <= W; x += 12) { const y = ky + Math.sin(x / 18 + t / 180) * 4; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
    }
    // מלכודות שפגו — ניקוי
    for (const [id, tr] of g.traps) if (tr.until < t - 1000) g.traps.delete(id);
    // קליעים
    for (const [id, sh] of g.shots) {
      const age = (t - sh.at) / FL.TICK_MS;
      if (sh.done || age > FL.SHOT_LIFE) { if (age > FL.SHOT_LIFE + 50) g.shots.delete(id); continue; }
      const x = sh.x + sh.dx * age;
      if (x < FL.WALL_L - 20 || x > FL.WALL_R + 20) { sh.done = true; continue; }
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(sx(x), sy(sh.y), (FL.SHOT_R + 2) * S, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#EAF8FF"; ctx.beginPath(); ctx.arc(sx(x), sy(sh.y), FL.SHOT_R * S, 0, Math.PI * 2); ctx.fill();
    }
    // אחרים
    for (const [pid, o] of g.others) { if (o.out || o.dead) continue; if (o.y < bottom - 60 || o.y > top + 60) continue; drawChar(ctx, sx(o.x), sy(o.y), S, pid, o.dx, o.st, false, t, o.combo); }
    // אני
    if (!g.dead && !g.out) drawChar(ctx, sx(s.x), sy(s.y), S, me, s.dx, s.st, true, t, s.comboTicks > 0 ? s.combo : 0, s.spin);
    // חלקיקים ופופים
    for (let i = g.fx.parts.length - 1; i >= 0; i--) { const p = g.fx.parts[i]; p.x += p.vx; p.y += p.vy; p.vy -= 0.35; p.l -= 0.04; if (p.l <= 0) { g.fx.parts.splice(i, 1); continue; } ctx.globalAlpha = Math.max(0, p.l); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), p.r * S * p.l, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (let i = g.fx.pops.length - 1; i >= 0; i--) { const p = g.fx.pops[i]; p.y += p.vy; p.l -= 0.018; if (p.l <= 0) { g.fx.pops.splice(i, 1); continue; } ctx.globalAlpha = Math.min(1, p.l * 2); ctx.font = `800 ${Math.round(p.sz * S)}px Assistant, sans-serif`; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeText(p.t, sx(p.x), sy(p.y)); ctx.fillStyle = p.col; ctx.fillText(p.t, sx(p.x), sy(p.y)); }
    ctx.globalAlpha = 1;
    if (g.fx.flash > 0) { ctx.globalAlpha = g.fx.flash; ctx.fillStyle = g.fx.flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; g.fx.flash -= 0.05; }
    // חסינות — הבהוב
    if (t < g.invulnUntil && !g.dead && Math.floor(t / 120) % 2 === 0) { ctx.globalAlpha = 0.25; ctx.fillStyle = "#FFF"; ctx.beginPath(); ctx.arc(sx(s.x), sy(s.y + 20), 34 * S, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
  }
  function slipperyNow(floor: number, t: number) { for (const tr of G.current.traps.values()) if (tr.floor === floor && tr.until > t) return true; return false; }
  function drawChar(ctx: CanvasRenderingContext2D, x: number, y: number, S: number, pid: string, dx: number, st: number, mine: boolean, t: number, combo: number, spin = false) {
    const col = chColor(pid); const w = 22 * S, h = 40 * S;
    ctx.save(); ctx.translate(x, y);
    if (spin) { G.current.fx.spinA += 0.35; ctx.translate(0, -h / 2); ctx.rotate(G.current.fx.spinA * (dx >= 0 ? 1 : -1)); ctx.translate(0, h / 2); }
    // צל
    ctx.globalAlpha = mine ? 1 : 0.8;
    ctx.fillStyle = INK; roundRect(ctx, -w / 2 - 3 * S, -h - 3 * S, w + 6 * S, h + 6 * S, 8 * S); ctx.fill();
    ctx.fillStyle = col; roundRect(ctx, -w / 2, -h, w, h, 7 * S); ctx.fill();
    // מתיחה בקפיצה
    const face = dx >= 0 ? 1 : -1;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(face * 4 * S, -h + 12 * S, 2.2 * S, 0, Math.PI * 2); ctx.fill();
    ctx.font = `${Math.round(18 * S)}px serif`; ctx.textAlign = "center"; ctx.fillText(chEmoji(pid), 0, -h / 2 + 8 * S);
    ctx.globalAlpha = 1;
    // שם
    ctx.font = `800 ${Math.round((mine ? 12 : 11) * S)}px Assistant, sans-serif`; ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.fillStyle = mine ? "#FFC531" : PAPER;
    const label = mine ? "אתה" : pname(pid).slice(0, 8);
    ctx.strokeText(label, 0, -h - 8 * S); ctx.fillText(label, 0, -h - 8 * S);
    if (combo >= 4) { ctx.font = `800 ${Math.round(11 * S)}px Assistant, sans-serif`; ctx.fillStyle = "#FFC531"; ctx.strokeText(`🔗${combo}`, 0, -h - 22 * S); ctx.fillText(`🔗${combo}`, 0, -h - 22 * S); }
    if (mine) { ctx.fillStyle = "#FFC531"; ctx.beginPath(); ctx.moveTo(0, 6 * S); ctx.lineTo(-5 * S, 12 * S); ctx.lineTo(5 * S, 12 * S); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    void st; void t;
  }
  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  /* ---------- בחירת דמות ---------- */
  function pickChar(c: number) { flAudioInit(); flSfx.pick(); conn.sendGame({ a: "fl_char", c }); }

  /* ---------- דראפט ---------- */
  function tapCard(id: string) {
    flAudioInit();
    setDraft((d) => {
      if (!d || d.locked) return d;
      if (d.sel === id) { flSfx.pick(); conn.sendGame({ a: "fl_pick", card: id }); vibrate(30); return { ...d, locked: id }; }
      flSfx.count(); return { ...d, sel: id };
    });
  }
  useEffect(() => {
    if (!draft || draft.locked) return;
    const tm = setTimeout(() => { setDraft((d) => { if (!d || d.locked) return d; const id = d.sel ?? d.cards[0]?.id; if (id) conn.sendGame({ a: "fl_pick", card: id }); return { ...d, locked: id }; }); }, Math.max(0, conn.untilServer(draft.until - 300)));
    return () => clearTimeout(tm);
  }, [draft?.until, draft?.locked, draft?.sel]);

  const myChar = G.current.chars[me];
  const cardCounts = () => { const m = new Map<string, number>(); for (const id of G.current.cards) m.set(id, (m.get(id) ?? 0) + 1); return [...m.entries()]; };

  return (
    <div className="fl-wrap" style={{ "--gc": SIG } as CSSProperties}>
      <canvas ref={cvRef} className="fl-cv" />

      {/* HUD */}
      {(phase === "run" || phase === "freeze" || phase === "intro") && (
        <>
          <div className="fl-top">
            <div className="fl-lives" aria-label="חיים">{Array.from({ length: Math.max(hud.lives, FL.LIVES) }).map((_, i) => <span key={i} className={i < hud.lives ? "on" : "off"}>{i < hud.lives ? "❤️" : "🖤"}</span>)}</div>
            <div className="fl-floor"><b>{hud.floor}</b><small>קומה</small></div>
            <div className={"fl-timer" + (hud.secs <= 5 ? " hot" : hud.secs <= 10 ? " warm" : "")} style={{ "--p": `${hud.secs > 0 && G.current.cfg ? (hud.secs / ((hud.sprint ? G.current.cfg.sprintMs : G.current.cfg.runMs) / 1000)) * 360 : 0}deg` } as CSSProperties}><span>{hud.secs}</span></div>
          </div>
          <div className="fl-sub"><span>#{hud.rank}/{hud.n}</span><span>{fmt(hud.score)} נק'</span>{hud.lvl >= 2 && <span className="fl-hurry">⏰ ×{hud.lvl}</span>}</div>
          <div className={"fl-combo" + (hud.combo > 0 ? " on" : "")}>
            <div className="fl-combobar"><i style={{ height: `${hud.comboFrac * 100}%` }} /></div>
            <b>{hud.combo > 0 ? hud.combo : ""}</b>
          </div>
          {arrows.map((a) => (
            <div key={a.pid} className={"fl-arrow" + (a.up ? " up" : " down")} style={{ left: `${Math.round(a.x * 100)}%` }}>
              <span className="ic">{a.up ? "▲" : "▼"}</span><span className="nm">{chEmoji(a.pid)} {pname(a.pid).slice(0, 8)} {a.d}</span>
            </div>
          ))}
          <div className="fl-btns">
            {btns.map((b) => {
              const left = Math.max(0, b.readyAt - conn.serverNow());
              return <button key={b.id} className={"fl-btn" + (left > 0 ? " cd" : "")} style={{ "--p": `${left > 0 ? (1 - left / b.cd) * 360 : 360}deg` } as CSSProperties} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); useButton(b.id); }}><span>{b.ic}</span></button>;
            })}
          </div>
          {hud.dead && !hud.out && <div className="fl-dead">💔 חוזרים בעוד רגע…</div>}
          {hud.out && <div className="fl-dead">👁️ צופה — נגמרו החיים</div>}
        </>
      )}
      {feed.length > 0 && phase !== "over" && <div className="fl-feed">{feed.map((f) => <div key={f.id}>{f.tx}</div>)}</div>}
      {count && <div className="fl-count" key={count}>{count}</div>}
      {banner && <div className={"fl-banner " + (banner.cls ?? "")}><span className="ic">{banner.ic}</span><b>{banner.t}</b>{banner.s && <small>{banner.s}</small>}</div>}
      {flash && <div className="fl-flash" style={{ background: flash }} />}

      {/* בחירת דמות */}
      {phase === "pick" && pick && (
        <div className="fl-pick">
          <h2>מי אתה במגדל?</h2>
          <p className="sub">כל דמות לשחקן אחד. אחר כך: מי זה התמנון?</p>
          <div className="grid">
            {FL.CHARS.map((ch, i) => {
              const owner = Object.entries(pick.taken).find(([, c]) => c === i)?.[0];
              const mineC = owner === me;
              return (
                <button key={i} className={"tile" + (owner ? (mineC ? " mine" : " taken") : "")} style={{ "--cc": FL.CHAR_COLORS[i] } as CSSProperties} disabled={!!owner && !mineC} onClick={() => pickChar(i)}>
                  <span className="em">{ch}</span><b>{FL.CHAR_NAMES[i]}</b>
                  {owner && <small>{mineC ? "אתה" : pname(owner)}</small>}
                </button>
              );
            })}
          </div>
          <PickTimer until={pick.until} conn={conn} />
        </div>
      )}

      {/* עצירה */}
      {phase === "freeze" && freeze && (
        <div className="fl-freeze">
          <h2>✋ עצירה!</h2>
          <ol>{freeze.rank.slice(0, 8).map((pid, i) => <li key={pid} className={pid === me ? "me" : ""}><span>{i + 1}</span><span>{chEmoji(pid)} {pid === me ? "אתה" : pname(pid)}</span><b>{fmt(freeze.scores[pid] ?? 0)}</b></li>)}</ol>
        </div>
      )}

      {/* דראפט */}
      {phase === "draft" && draft && (
        <div className="fl-draft">
          <div className="head"><h2>בחר שדרוג</h2><DraftTimer until={draft.until} conn={conn} /></div>
          <div className="cards">
            {draft.cards.map((c) => (
              <button key={c.id} className={"card" + (draft.sel === c.id ? " sel" : "") + (draft.locked === c.id ? " locked" : "") + (draft.locked && draft.locked !== c.id ? " dim" : "")} style={{ "--rc": RAR_COL[c.r] ?? "#C8B78E" } as CSSProperties} onClick={() => tapCard(c.id)} disabled={!!draft.locked}>
                <span className="ic">{c.ic}</span><b>{c.t}</b><small>{c.d}</small><i>{RAR_NAME[c.r] ?? ""}{c.k === "button" ? " · כפתור" : ""}</i>
              </button>
            ))}
          </div>
          <p className="hint">{draft.locked ? "נבחר ✓ — מחכים לכולם" : draft.sel ? "טאפ שוב לאישור" : "טאפ לבחירה, טאפ שוב לאישור"}</p>
        </div>
      )}

      {/* חשיפה */}
      {phase === "reveal" && reveal && (
        <div className="fl-reveal">
          <h2>מי לקח מה</h2>
          <div className="row">{Object.entries(reveal).map(([pid, c]) => <div key={pid} className={"who" + (pid === me ? " me" : "")}><span className="em">{chEmoji(pid)}</span><b>{pid === me ? "אתה" : pname(pid).slice(0, 8)}</b><span className="cd">{c ? `${c.ic} ${c.t}` : "—"}</span></div>)}</div>
        </div>
      )}

      {/* סיום */}
      {phase === "over" && over && (
        <div className="fl-over">
          <h2>🏢 סוף המגדל</h2>
          <ol>{over.rows.map((r, i) => <li key={r.pid} className={r.pid === me ? "me" : ""}>
            <span className="pos">{i + 1}</span><span className="em">{FL.CHARS[r.c]}</span>
            <span className="nm">{r.pid === me ? "אתה" : pname(r.pid)}<small>קומה {r.maxFloor} · קומבו {r.bestCombo}{r.kills ? ` · 🎯${r.kills}` : ""}</small></span>
            <b>{fmt(r.score)}</b>
          </li>)}</ol>
          <div className="titles">{over.titles.map((t) => <span key={t.pid + t.ic}>{t.ic} {t.t}: <b>{t.pid === me ? "אתה" : pname(t.pid)}</b></span>)}</div>
          <div className="mycards">{cardCounts().map(([id, n]) => { const c = flCard(id); return c ? <span key={id}>{c.ic} {c.t}{n > 1 ? ` ×${n}` : ""}</span> : null; })}</div>
          <p className="sub">המארח ממשיך לטקס</p>
        </div>
      )}
      {phase === "wait" && <div className="fl-waitmsg">🏢 המגדל נטען…{myChar !== undefined ? "" : ""}</div>}
    </div>
  );
}

function PickTimer({ until, conn }: { until: number; conn: GameViewProps["conn"] }) {
  const [left, setLeft] = useState(0);
  useEffect(() => { const iv = setInterval(() => setLeft(Math.max(0, Math.ceil((until - conn.serverNow()) / 1000))), 200); return () => clearInterval(iv); }, [until]);
  return <p className="timer">{until ? `${left} שניות` : "כולם בחרו — מתחילים!"}</p>;
}
function DraftTimer({ until, conn }: { until: number; conn: GameViewProps["conn"] }) {
  const [left, setLeft] = useState(10);
  useEffect(() => { const iv = setInterval(() => setLeft(Math.max(0, (until - conn.serverNow()) / 1000)), 100); return () => clearInterval(iv); }, [until]);
  const secs = Math.ceil(left);
  return <div className={"ring" + (secs <= 3 ? " hot" : secs <= 5 ? " warm" : "")} style={{ "--p": `${(left / 10) * 360}deg` } as CSSProperties}><span>{secs}</span></div>;
}
