/**
 * התותחים 💥 — צד לקוח.
 *
 * "כולם יורים באותה שנייה": בשלב הכיוון מותחים רוגטקה באגודל (הכיוון = זווית, המרחק = עוצמה) ורואים
 * תחזית מקווקוות; השרת אוסף את כל הכיוונים ומשדר את הסלבו כ-cue — כל טלפון מריץ את אותה
 * סימולציה (shared/tanks.ts) על הזמן של השרת ומצייר: שבילים, פיצוצים, אדמה עפה, מספרי נזק.
 * אחרי האנימציה מגיע tk_result עם המצב הסמכותי והלקוח מתיישר.
 * ציור: canvas אחד לעולם (כל ההר ברוחב המסך, DPR≤2) + canvas מטמון להר; DOM ל-HUD/מוסך/שמיים.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { GameViewProps } from "./registry";
import { TK, TK_RAR_NAME, TK_CAT_NAME, TK_BASIC, tkCard, tkMods, tkNewWorld, tkGround, tkNewSalvo, tkPreview, tkWeaponOf, tkBotAim } from "../../../shared/tanks";
import type { TkWorld, TkTank, TkTankWire, TkWorldWire, TkCardWire, TkSalvoSim, TkEvent, TkMods, TanksServerMsg, TkRow } from "../../../shared/tanks";
import { tkAudioInit, tkSfx } from "./tanksAudio";
import { drawTankBody, drawBarrel, tankIcon, loadTankSprite, onTankSpriteReady, tankSpriteReady, barrelPivot, TANKS, TANK_W } from "./tanksSprites";
import { vibrate } from "../lib/audio";

type Phase = "wait" | "pick" | "intro" | "aim" | "salvo" | "garage" | "battleover" | "over";
type OverMsg = Extract<TanksServerMsg, { a: "tk_over" }>;
type BattleOverMsg = Extract<TanksServerMsg, { a: "tk_battleover" }>;
interface Pop { x: number; y: number; t: string; col: string; l: number; sz: number; vy: number }
interface Part { x: number; y: number; vx: number; vy: number; l: number; col: string; r: number; g: number; sq?: boolean }
interface Ring { x: number; y: number; r: number; l: number; col: string; kind: string }
interface Anim { fireAt: number; hurtAt: number; angle: number }
const INK = "#0C0906", PAPER = "#FFF3DC", SIG = "#E8433F";
const DRAG_MAX = 150;
const RAR_COL: Record<string, string> = { c: "#C8B78E", u: "#4D86FF", r: "#A855F7", e: "#FFC531" };
const CAT_COL: Record<string, string> = { W: "#FF7A29", D: "#4D86FF", T: "#0FA958", S: "#E23FA0", X: "#38C8E8", E: "#FFC531", K: "#A78BFA" };
const THEME: Record<string, { sky: [string, string]; dirt: string; deep: string; grass: string; water: string; sun?: string; stars?: boolean }> = {
  day: { sky: ["#5EC8F6", "#C9F0FF"], dirt: "#A8693A", deep: "#7A4A2A", grass: "#6CCB4E", water: "rgba(60,140,255,.55)", sun: "#FFE27A" },
  sunset: { sky: ["#3B2A6B", "#FF9A5C"], dirt: "#8E5A3C", deep: "#5E3A26", grass: "#C88B3A", water: "rgba(255,120,80,.45)", sun: "#FF6B3D" },
  night: { sky: ["#0B1030", "#2A3A6E"], dirt: "#4C4A60", deep: "#2E2C40", grass: "#7A8FB0", water: "rgba(40,80,200,.5)", sun: "#F4F1D6", stars: true },
  space: { sky: ["#05040F", "#1B0F3A"], dirt: "#6B5A8E", deep: "#3E3260", grass: "#C4A8FF", water: "rgba(120,60,255,.45)", stars: true },
};
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** רקעי שמיים מהיגספילד (client/public/tanks/sky-*.webp) — נטענים עצל לפי העולם; בלי הקובץ נשאר הגרדיאנט */
const skyImgs = new Map<string, HTMLImageElement | null>();
function skyImg(theme: string): HTMLImageElement | null {
  if (skyImgs.has(theme)) return skyImgs.get(theme) ?? null;
  skyImgs.set(theme, null);
  const im = new Image(); im.onload = () => skyImgs.set(theme, im); im.onerror = () => skyImgs.set(theme, null); im.src = `/tanks/sky-${theme}.webp`;
  return null;
}

declare global { interface Window { __tkDbg?: unknown; __tkFrames?: number; __tkErr?: string; __tkAuto?: boolean } }

/** רוחב > גובה על טלפון = משחק לרוחב (עמודות בצדדים, ההר על כל המסך) */
const isLandscape = () => typeof window !== "undefined" && window.innerWidth > window.innerHeight && window.innerHeight < 600;
/** ניסיון עדין למסך מלא + נעילה לרוחב (אנדרואיד; iOS מתעלם) — רק מתוך מגע של המשתמש */
function tryLandscape() {
  try {
    const el = document.documentElement as HTMLElement & { requestFullscreen?: (o?: unknown) => Promise<void> };
    const lock = () => { try { (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.("landscape")?.catch(() => { /* */ }); } catch { /* */ } };
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).then(lock).catch(() => { /* */ });
    else lock();
  } catch { /* */ }
}
function leaveLandscape() {
  try { (screen.orientation as unknown as { unlock?: () => void })?.unlock?.(); } catch { /* */ }
  try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { /* */ }); } catch { /* */ }
}
/** מה השתנה בבילד — שורות קצרות לטוסט הקנייה ("חיים 100 → 130") */
function modDelta(a: TkMods, b: TkMods): string[] {
  const out: string[] = [];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  if (b.hpMax !== a.hpMax) out.push(`❤️ חיים ${a.hpMax} → ${b.hpMax}`);
  if (b.armor !== a.armor) out.push(`🛡️ שריון ${pct(a.armor)} → ${pct(b.armor)} פחות נזק`);
  if (b.shield !== a.shield) out.push(`🔵 מגן ${a.shield} → ${b.shield} כל סלבו`);
  if (b.repair !== a.repair) out.push(`🔧 +${b.repair} חיים כל סלבו`);
  if (b.dodge !== a.dodge) out.push(`💫 ${pct(b.dodge)} מהפגזים מפספסים`);
  if (b.fuel !== a.fuel) out.push(`⛽ ${b.fuel} צעדים בסיבוב`);
  if (b.moveStep !== a.moveStep) out.push(`🏎️ צעד ${a.moveStep} → ${b.moveStep}`);
  if (b.power !== a.power) out.push(`🔩 עוצמה ${pct(a.power)} → ${pct(b.power)}`);
  if (b.gold !== a.gold) out.push(`🪙 זהב ×${a.gold} → ×${b.gold}`);
  if (b.windK !== a.windK) out.push(`🧥 הרוח משפיעה ×${b.windK}`);
  if (b.preview !== a.preview) out.push("🧮 רואה את כל המסלול");
  if (b.luck !== a.luck) out.push(`🍀 מזל ${b.luck} — יותר קלפים נדירים`);
  if (b.discount !== a.discount) out.push(`🏷️ ${pct(b.discount)} הנחה במוסך`);
  if (b.interest !== a.interest) out.push(`🏦 +${pct(b.interest)} זהב כל סלבו`);
  if (b.killBonus !== a.killBonus) out.push(`🦅 +${b.killBonus} זהב להריגה`);
  if (b.surviveMul !== a.surviveMul) out.push(`🌵 שרידות ×${b.surviveMul}`);
  if (b.offerN !== a.offerN) out.push(`📜 ${b.offerN} קלפים במוסך`);
  const flags: [keyof TkMods, string][] = [["chute", "🪂 בלי נזק נפילה"], ["hover", "🛸 חסין לנפילה ולמבול"], ["heavy", "🪨 חסין להדף"], ["fireproof", "🧯 חסין לאש"], ["faraday", "🔌 חסין להקפאה ו-EMP"], ["lastStand", "🕯️ פגיעה קטלנית משאירה 1"], ["reflect", "🪞 פגיעה במגן חוזרת ליורה"], ["windPreview", "🌬️ התחזית כוללת רוח"], ["dbl", "🎯🎯 כל ירייה — פעמיים"], ["stabilizer", "📐 מניפות צפופות"], ["sight", "🔭 רואה את נקודת הנחיתה"], ["revenge", "😤 נזק כפול למי שפגע בך"], ["hunter", "🏹 בונוס ראש-בפרס כפול"], ["betray", "🗡️ מותר לפגוע בבן הברית"]];
  for (const [k, tx] of flags) if (b[k] && !a[k]) out.push(tx);
  return out;
}
/** תיאור תחמושת בשורה: נזק · רדיוס · מיוחד */
function ammoLine(id: string): string {
  const w = tkWeaponOf(id); const bits: string[] = [];
  if (w.dmg > 0) bits.push(`💥 נזק ${w.dmg}${w.n > 1 ? ` ×${w.n}` : ""}`);
  if (w.r > 0) bits.push(`מכתש ${w.r}`);
  if (w.mirv > 0) bits.push(`מתפצל ל-${w.mirv} בשיא`);
  if (w.burst > 0) bits.push(`מתפצל ל-${w.burst} בפגיעה`);
  if (w.bounce > 0) bits.push(`${w.bounce} קפיצות`);
  if (w.fire > 0) bits.push("🔥 מצית");
  if (w.dig > 0) bits.push("⛏️ חופר");
  if (w.laser) bits.push("קו ישר");
  if (w.homing > 0) bits.push("🛰️ מתביית");
  if (w.chain > 0) bits.push(`⛓️ ${w.chain} פיצוצים נוספים`);
  if (w.shock > 0) bits.push("💨 הדף");
  if (w.freeze) bits.push("🧊 מקפיא"); if (w.emp) bits.push("⚡ EMP"); if (w.heal > 0) bits.push(`💊 מרפא ${w.heal}`);
  if (w.dirt) bits.push("בונה אדמה"); if (w.confetti) bits.push("🎊 0 נזק");
  return bits.join(" · ");
}

const wireToTank = (w: TkTankWire, prev?: TkTank): TkTank => ({
  pid: w.pid, c: w.c, x: w.x, y: w.y, hp: w.hp, hpMax: w.hpMax, shield: w.sh, alive: w.alive,
  armor: prev?.armor ?? 0, dodge: prev?.dodge ?? 0, chute: prev?.chute ?? false, heavy: prev?.heavy ?? false, fireproof: prev?.fireproof ?? false, faraday: prev?.faraday ?? false, reflect: prev?.reflect ?? false, hover: prev?.hover ?? false,
  lastStand: prev?.lastStand ?? false, frozen: !!w.frozen, emp: -1, aim: prev?.aim ?? null, bounty: w.bounty ? 999 : -1, lastHitBy: prev?.lastHitBy ?? "",
});

export default function TanksView({ room, me, conn, hub }: GameViewProps) {
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("wait");
  const [pick, setPick] = useState<{ taken: Record<string, number>; until: number } | null>(null);
  const [hud, setHud] = useState({ secs: 0, total: 12, gold: 0, hp: 100, hpMax: 100, sh: 0, wind: 0, k: 0, b: 0, battles: 1, bounty: "", sudden: false, alive: true, fuel: 0, locked: false, aimed: false, power: 0, doom: false, night: false });
  const [count, setCount] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ ic: string; t: string; s?: string; cls?: string } | null>(null);
  const [feed, setFeed] = useState<{ id: number; tx: string }[]>([]);
  const [flash, setFlash] = useState("");
  const [you, setYou] = useState<{ gold: number; ammo: Record<string, number>; owned: Record<string, number>; fuel: number; blind: boolean; curse: string }>({ gold: 0, ammo: {}, owned: {}, fuel: 0, blind: false, curse: "" });
  const [weapon, setWeapon] = useState(TK_BASIC);
  const [garage, setGarage] = useState<{ cards: TkCardWire[]; until: number; gold: number; bought: string[]; done: boolean; pick?: TkCardWire } | null>(null);
  const [sky, setSky] = useState<{ cards: TkCardWire[]; pick?: TkCardWire; sent?: string; needX?: boolean } | null>(null);
  const [buys, setBuys] = useState<{ id: number; pid: string; card: TkCardWire; tx: string }[]>([]);
  const [battleOver, setBattleOver] = useState<BattleOverMsg | null>(null);
  const [over, setOver] = useState<OverMsg | null>(null);
  const [spr, setSpr] = useState(tankSpriteReady());
  const [land, setLand] = useState(isLandscape());
  const [buyToast, setBuyToast] = useState<{ id: number; ic: string; t: string; lines: string[]; r: string } | null>(null);
  const [ammoHint, setAmmoHint] = useState("");
  const feedId = useRef(1);

  const G = useRef({
    phase: "wait" as Phase, chars: {} as Record<string, number>, b: 0, k: 0, battles: 1, seed: "", cfg: { aimMs: 12000, garageMs: 12000 },
    world: tkNewWorld("x") as TkWorld, tanks: new Map<string, TkTank>(), wind: 0, until: 0, phaseAt: 0, bounty: "", sudden: false, doom: false,
    gold: 0, ammo: {} as Record<string, number>, owned: {} as Record<string, number>, mods: tkMods({}) as TkMods, fuel: 0, blind: false, weapon: TK_BASIC,
    aim: null as { vx: number; vy: number } | null, locked: false, spyAims: new Map<string, { vx: number; vy: number }>(),
    drag: { pid: -1, x0: 0, y0: 0, cx: 0, cy: 0, on: false, moved: false },
    salvo: null as TkSalvoSim | null, salvoAt: 0, salvoTicks: 0, salvoK: 0, pendingResult: null as Extract<TanksServerMsg, { a: "tk_result" }> | null,
    anim: new Map<string, Anim>(),
    cam: { scale: 1, x0: 0, y0: 0, base: 1, target: 1, vw: 390, vh: 800, bottom: 120, land: false, sideL: 0, sideR: 0, top: 0 },
    builds: new Map<string, string[]>(),   // הבילד של כל טנק (מהשרת) — מוצג מעל הטנק לכולם
    fx: { pops: [] as Pop[], parts: [] as Part[], rings: [] as Ring[], shake: 0, flash: 0, flashCol: "#fff", lasers: [] as { x0: number; y0: number; x1: number; y1: number; l: number }[] },
    terrainCv: null as HTMLCanvasElement | null, terrainDirty: true, terrainTheme: "",
    lastFrame: 0, hudAt: 0, lastTickSec: -1, skyX: false,
    players: [] as { id: string; name: string; emoji: string }[],
    reduced: reduced(),
  });

  const pl = (pid: string) => G.current.players.find((p) => p.id === pid);
  const pname = (pid: string) => pl(pid)?.name ?? "מישהו";
  const charOf = (pid: string) => G.current.chars[pid] ?? G.current.tanks.get(pid)?.c ?? 0;
  const chColor = (pid: string) => TK.CHAR_COLORS[charOf(pid)] ?? "#fff";
  const anim = (pid: string) => { const g = G.current; let a = g.anim.get(pid); if (!a) { a = { fireAt: 0, hurtAt: 0, angle: 0.8 }; g.anim.set(pid, a); } return a; };
  const Face = ({ c, size = 28, pose = "idle" as "idle" | "dead" | "win" }: { c: number; size?: number; pose?: "idle" | "dead" | "win" }) => <img className="tk-face" src={tankIcon(c, 96, pose)} width={size} height={size} alt="" style={{ opacity: spr ? 1 : 1 }} />;
  function setPhaseBoth(p: Phase) { G.current.phase = p; G.current.phaseAt = conn.serverNow(); setPhase(p); }
  function addFeed(tx: string) { setFeed((f) => [...f.slice(-3), { id: feedId.current++, tx }]); }
  function pop(x: number, y: number, t: string, col = PAPER, sz = 18) { G.current.fx.pops.push({ x, y, t, col, l: 1, sz, vy: 1.1 }); }
  function burst(x: number, y: number, col: string, n = 10, sp = 5, g = 0.25, sq = false) { const gg = G.current; if (gg.reduced) n = Math.ceil(n / 3); for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI - Math.PI * 0.05, s = Math.random() * sp + 1; gg.fx.parts.push({ x, y, vx: Math.cos(a) * s * (Math.random() < 0.5 ? -1 : 1), vy: Math.abs(Math.sin(a)) * s + 2, l: 1, col, r: 2 + Math.random() * 3, g, sq }); } }
  function ring(x: number, y: number, r: number, col: string, kind = "boom") { G.current.fx.rings.push({ x, y, r, l: 1, col, kind }); }
  const fmt = (n: number) => Math.round(n).toLocaleString("he-IL");
  const myTank = () => G.current.tanks.get(me);
  const themeOf = () => THEME[G.current.world.theme] ?? THEME.day;

  useEffect(() => { G.current.players = room.players.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })); }, [room.players]);
  useEffect(() => { tkAudioInit(); loadTankSprite().then((ok) => setSpr(ok)); return onTankSpriteReady(() => setSpr(true)); }, []);
  useEffect(() => { if (!banner) return; const t = setTimeout(() => setBanner(null), banner.cls === "long" ? 3200 : banner.cls === "short" ? 1200 : 2000); return () => clearTimeout(t); }, [banner]);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(""), 300); return () => clearTimeout(t); }, [flash]);
  useEffect(() => { if (!buyToast) return; const t = setTimeout(() => setBuyToast(null), 2600); return () => clearTimeout(t); }, [buyToast]);
  useEffect(() => { if (!ammoHint) return; const t = setTimeout(() => setAmmoHint(""), 2600); return () => clearTimeout(t); }, [ammoHint]);
  useEffect(() => {
    const on = () => { const l = isLandscape(); setLand(l); G.current.cam.land = l; };
    window.addEventListener("resize", on); window.addEventListener("orientationchange", on); on();
    return () => { window.removeEventListener("resize", on); window.removeEventListener("orientationchange", on); leaveLandscape(); };
  }, []);
  useEffect(() => { G.current.weapon = weapon; }, [weapon]);

  function applyWorldWire(w: TkWorldWire) { const g = G.current; g.world.water = w.water; g.world.gravK = w.gravK; g.world.windK = w.windK; g.world.walls = w.walls; g.world.night = w.night; g.world.fires = w.fires; if (g.world.theme !== w.theme) { g.world.theme = w.theme; g.terrainDirty = true; } }
  function applyTanks(list: TkTankWire[]) { const g = G.current; for (const w of list) { g.tanks.set(w.pid, wireToTank(w, g.tanks.get(w.pid))); if (w.own) g.builds.set(w.pid, w.own); else if (w.own === undefined && !g.builds.has(w.pid)) { /* אין בילד */ } } }
  /** הבילד שמוצג מעל טנק — שלי חי מ-tk_you, של אחרים מהשרת */
  function buildOf(pid: string): string[] { const g = G.current; if (pid === me) { const RO: Record<string, number> = { e: 0, r: 1, u: 2, c: 3 }; return Object.keys(g.owned).sort((a, b) => (RO[tkCard(a)?.r ?? "c"] ?? 3) - (RO[tkCard(b)?.r ?? "c"] ?? 3)); } return g.builds.get(pid) ?? []; }
  function applyYou(d: { gold: number; ammo: Record<string, number>; owned: Record<string, number>; fuel: number; blind?: boolean; curse?: string }) {
    const g = G.current; g.gold = d.gold; g.ammo = d.ammo; g.owned = d.owned; g.mods = tkMods(d.owned); g.fuel = d.fuel; g.blind = !!d.blind;
    if (g.weapon !== TK_BASIC && !(d.ammo[g.weapon] > 0)) { g.weapon = TK_BASIC; setWeapon(TK_BASIC); }
    setYou({ gold: d.gold, ammo: d.ammo, owned: d.owned, fuel: d.fuel, blind: !!d.blind, curse: d.curse ?? "" });
  }
  function sendAim() {
    const g = G.current; if (!g.aim || g.phase !== "aim") return;
    conn.sendGame({ a: "tk_aimset", vx: Math.round(g.aim.vx * 100) / 100, vy: Math.round(g.aim.vy * 100) / 100, w: g.weapon });
  }
  function ready() {
    const g = G.current; if (g.phase !== "aim" || g.locked) return;
    if (!g.aim) { tkSfx.nope(); setBanner({ ic: "🎯", t: "קודם מכוונים", s: "משכו את האגודל אחורה כמו רוגטקה", cls: "short" }); return; }
    g.locked = true; sendAim(); conn.sendGame({ a: "tk_ready" }); tkSfx.ready(); vibrate(20);
    setHud((h) => ({ ...h, locked: true }));
  }
  function moveTank(dir: number) { const g = G.current; if (g.phase !== "aim" || g.fuel <= 0) { tkSfx.nope(); return; } conn.sendGame({ a: "tk_movereq", dir }); tkSfx.select(); }

  /* ---------- הודעות מהשרת ---------- */
  useEffect(() => {
    return hub.subscribe((raw, at) => {
      const d = raw as unknown as TanksServerMsg;
      if (typeof (d as any)?.a !== "string" || !(d as any).a.startsWith("tk_")) return;
      const g = G.current;
      try {
        switch (d.a) {
          case "tk_pickphase": {
            if (g.phase === "wait" || g.phase === "pick") { setPhaseBoth("pick"); setPick((p) => ({ taken: d.taken, until: d.until || p?.until || conn.serverNow() + 8000 })); }
            g.chars = d.taken;
            break;
          }
          case "tk_go": { g.chars = d.chars; g.battles = d.battles; g.cfg = d.cfg; setPick(null); setPhaseBoth("intro"); break; }
          case "tk_battle": {
            g.b = d.b; g.k = 0; g.seed = d.seed;
            g.world = tkNewWorld(d.seed, d.world.theme); g.world.h = [...d.h]; applyWorldWire(d.world); g.terrainDirty = true;
            g.tanks.clear(); applyTanks(d.tanks); g.wind = d.wind; g.anim.clear(); g.salvo = null; g.fx.parts = []; g.fx.rings = []; g.fx.pops = [];
            g.cam.target = g.cam.base;
            setBattleOver(null); setGarage(null); setSky(null); setPhaseBoth("intro");
            setBanner({ ic: "⚔️", t: `קרב ${d.b + 1}${g.battles > 1 ? ` מתוך ${g.battles}` : ""}`, s: d.b === 0 ? "משכו את האגודל אחורה כמו רוגטקה. שימו לב לרוח!" : "הבילד שלכם עובר איתכם", cls: "long" });
            const steps = ["3", "2", "1", "אש!"];
            steps.forEach((s, i) => setTimeout(() => { setCount(s); if (i < 3) tkSfx.count(); else { tkSfx.go(); vibrate(40); } }, Math.max(0, conn.untilServer(d.startAt - (3 - i) * 700))));
            setTimeout(() => setCount(null), Math.max(0, conn.untilServer(d.startAt + 600)));
            break;
          }
          case "tk_aim": {
            g.k = d.k; g.until = d.until; g.wind = d.wind; g.bounty = d.bounty; g.sudden = d.sudden; g.doom = d.doom; g.world.night = d.night;
            if (g.phase !== "aim") { g.aim = null; g.locked = false; g.spyAims.clear(); setPhaseBoth("aim"); setGarage(null); setSky(null); g.lastTickSec = -1;
              if (d.k > 1 || g.b > 0) tkSfx.garage();
              if (d.sudden) setBanner({ ic: "☄️", t: "מוות פתאומי!", s: "מטאורים נופלים מהשמיים", cls: "long" });
              else if (d.doom) setBanner({ ic: "🔔", t: "יום הדין", s: "כל הנזק כפול בסלבו הזה", cls: "long" });
              else if (d.night) setBanner({ ic: "🌚", t: "לילה", s: "אין תחזית לאף אחד", cls: "long" });
              else if (d.k === 1) setBanner({ ic: "🎯", t: "כוונו!", s: "מותחים אחורה — ומשחררים", cls: "short" });
            }
            setHud((h) => ({ ...h, k: d.k, bounty: d.bounty, sudden: d.sudden, doom: d.doom, night: d.night, wind: d.wind, total: g.cfg.aimMs / 1000 }));
            break;
          }
          case "tk_you": applyYou(d); break;
          case "tk_tank": { const prev = g.tanks.get(d.tank.pid); const t = wireToTank(d.tank, prev); g.tanks.set(d.tank.pid, t); if (prev && (prev.x !== t.x)) { burst(t.x, t.y + 6, "#FFF", 8, 4); if (d.tank.pid === me) tkSfx.tele(); } if (prev && !prev.bounty && d.tank.bounty && d.tank.pid !== me) { /* פיד מגיע מהקנייה */ } break; }
          case "tk_terrain": { g.world.h = [...d.h]; if (d.world) applyWorldWire(d.world); g.terrainDirty = true; break; }
          case "tk_move": { const t = g.tanks.get(d.pid); if (t) { burst(t.x, t.y + 2, themeOf().dirt, 5, 2.5); t.x = d.x; t.y = d.y; } if (d.pid === me) { g.fuel = d.fuel; setYou((y) => ({ ...y, fuel: d.fuel })); } break; }
          case "tk_spy": { g.spyAims.set(d.pid, { vx: d.vx, vy: d.vy }); break; }
          case "tk_salvo": {
            // כולם מתחילים באותה מילישנייה: at = זמן-השרת של הסלבו
            g.salvoK = d.k; g.salvoAt = d.at; g.salvoTicks = d.ticks; g.pendingResult = null;
            applyTanks(d.tanks);
            for (const sh of d.input.shots) { const t = g.tanks.get(sh.pid); if (t) t.aim = { vx: sh.vx, vy: sh.vy }; anim(sh.pid).angle = Math.atan2(sh.vy, sh.vx); }
            g.salvo = tkNewSalvo(g.world, g.tanks, d.input);
            setPhaseBoth("salvo"); setGarage(null); setSky(null);
            setBanner({ ic: "💥", t: "סלבו!", cls: "short" }); tkSfx.salvo(); vibrate([50, 40, 80]); setFlash("#fff");
            for (const tx of d.pre) addFeed(tx);
            if (d.input.meteors.length) setTimeout(() => tkSfx.meteor(), 300);
            void at;
            break;
          }
          case "tk_result": {
            // המצב הסמכותי — מוחל בסוף האנימציה (או מיד אם היא כבר נגמרה)
            if (g.salvo && !g.salvo.done) g.pendingResult = d; else applyResult(d);
            break;
          }
          case "tk_garage": {
            setPhaseBoth("garage");
            setGarage({ cards: d.cards, until: d.until, gold: d.gold, bought: [], done: false });
            g.gold = d.gold; setYou((y) => ({ ...y, gold: d.gold }));
            setBuys([]); tkSfx.garage(); g.lastTickSec = -1;
            break;
          }
          case "tk_sky": { setSky({ cards: d.cards }); break; }
          case "tk_bought": {
            setBuys((b) => [...b.slice(-5), { id: feedId.current++, pid: d.pid, card: d.card, tx: d.tx }]);
            if (d.pid === me) {
              tkSfx.buy(); setGarage((gr) => gr ? { ...gr, bought: [...gr.bought, d.card.id], pick: undefined } : gr);
              // להרגיש את השדרוג: מה בדיוק השתנה
              const c = d.card; let lines: string[] = [];
              if (c.kind === "passive") { const before = tkMods(g.owned); const after = tkMods({ ...g.owned, [c.id]: (g.owned[c.id] ?? 0) + 1 }); lines = modDelta(before, after); if (!lines.length) lines = [c.d]; }
              else if (c.kind === "ammo") lines = [`×${c.n ?? 1} שימושים`, ammoLine(c.id)];
              else lines = [c.d];
              setBuyToast({ id: feedId.current++, ic: c.ic, t: c.t, lines, r: c.r });
              if (c.r === "r" || c.r === "e") { tkSfx.epic(); vibrate([30, 30, 30, 30, 80]); } else vibrate(25);
            }
            else if (d.card.cat === "S" || d.card.cat === "X" || d.card.r === "r" || d.card.r === "e") addFeed(d.tx);
            if (d.target === me && d.card.cat === "S") { setBanner({ ic: d.card.ic, t: `${pname(d.pid)}: ${d.card.t}`, s: "עליך!", cls: "long" }); vibrate(60); }
            break;
          }
          case "tk_battleover": {
            setPhaseBoth("battleover"); setBattleOver(d); setGarage(null); setSky(null);
            if (d.winner === me) { tkSfx.win(); vibrate([60, 40, 60, 40, 120]); } else tkSfx.over();
            break;
          }
          case "tk_over": { setPhaseBoth("over"); setOver(d); setBattleOver(null); tkSfx.over(); vibrate([80, 60, 120]); break; }
          case "tk_feed": addFeed(d.tx); break;
          case "tk_sync": {
            g.chars = d.chars; g.b = d.b; g.k = d.k; g.battles = d.battles; g.cfg = d.cfg; g.seed = d.seed;
            g.world = tkNewWorld(d.seed, d.world.theme); g.world.h = [...d.h]; applyWorldWire(d.world); g.terrainDirty = true;
            g.tanks.clear(); applyTanks(d.tanks); g.wind = d.wind; g.until = d.until;
            applyYou({ ...d.you, blind: false });
            if (d.phase === "pick") { setPhaseBoth("pick"); setPick({ taken: d.chars, until: conn.serverNow() + 8000 }); }
            else if (d.phase === "over") setPhaseBoth("over");
            else if (d.phase === "aim") { g.aim = null; g.locked = false; setPhaseBoth("aim"); }
            else if (d.phase === "garage") setPhaseBoth("garage");
            else setPhaseBoth(d.phase === "salvo" ? "salvo" : "intro");
            break;
          }
        }
      } catch (e) { window.__tkErr = String(e); }
    });
  }, [hub, me]);

  function applyResult(d: Extract<TanksServerMsg, { a: "tk_result" }>) {
    const g = G.current;
    g.world.h = [...d.h]; applyWorldWire(d.world); g.terrainDirty = true;
    applyTanks(d.tanks);
    const mine = d.earned[me] ?? 0;
    if (mine > 0) { const t = myTank(); if (t) pop(t.x, t.y + 70, `+${mine} 🪙`, "#FFC531", 20); tkSfx.gold(mine); }
    g.gold = d.gold[me] ?? g.gold; setYou((y) => ({ ...y, gold: d.gold[me] ?? y.gold }));
    for (const tx of d.feed) addFeed(tx);
    g.salvo = null; g.pendingResult = null;
    g.cam.target = g.cam.base;
  }

  /* ---------- אירועי הסימולציה → אפקטים וסאונד ---------- */
  function onEvents(evs: TkEvent[]) {
    const g = G.current; const th = themeOf();
    for (const e of evs) {
      switch (e.t) {
        case "fire": {
          const a = anim(e.pid); a.fireAt = performance.now(); a.angle = Math.atan2(e.vy, e.vx); const p = Math.hypot(e.vx, e.vy) / TK.VMAX; tkSfx.fire(p, e.pid === me); burst(e.x + Math.cos(a.angle) * 24, e.y + Math.sin(a.angle) * 24, "#FFF3DC", 5, 3, 0.1); if (e.pid === me) g.fx.shake = Math.max(g.fx.shake, 2 + p * 3);
          // נשק מיוחד = רגע: באנר אצלי, שורה בפיד אצל כולם, והאייקון עף על הפגז
          const c = e.w !== TK_BASIC ? tkCard(e.w) : null;
          if (c) { if (e.pid === me) setBanner({ ic: c.ic, t: `${c.t}!`, s: ammoLine(c.id), cls: "short" }); else addFeed(`${c.ic} ${pname(e.pid)} ירה ${c.t}`); const t = g.tanks.get(e.pid); if (t) pop(t.x, t.y + 74, c.ic, PAPER, 26); }
          break;
        }
        case "boom": {
          const big = e.r >= 50;
          if (e.kind === "confetti") { tkSfx.confetti(); for (let i = 0; i < 26; i++) burst(e.x, e.y, ["#FF4438", "#FFC531", "#4D86FF", "#5FD44A", "#FF5FB0"][i % 5], 1, 7, 0.15, true); ring(e.x, e.y, e.r, "#FF5FB0", "confetti"); }
          else if (e.kind === "dirt") { if (e.r > 8) { tkSfx.dirt(); burst(e.x, e.y, th.dirt, 14, 5, 0.3); ring(e.x, e.y, e.r * 0.8, th.dirt, "dirt"); } else burst(e.x, e.y, th.dirt, 3, 2, 0.3); }
          else if (e.kind === "heal") { tkSfx.heal(); ring(e.x, e.y, e.r, "#5FD44A", "heal"); burst(e.x, e.y, "#5FD44A", 10, 3, -0.05); }
          else if (e.kind === "laser") { tkSfx.laser(); ring(e.x, e.y, e.r, "#FF4438", "laser"); burst(e.x, e.y, "#FF8A8A", 8, 4, 0.2); }
          else {
            tkSfx.boom(e.r, e.by === me);
            ring(e.x, e.y, e.r, e.kind === "meteor" ? "#FF7A29" : e.kind === "fire" ? "#FF4438" : "#FFC531", e.kind);
            burst(e.x, e.y, th.dirt, big ? 26 : 14, big ? 8 : 5, 0.3);
            burst(e.x, e.y, e.kind === "fire" ? "#FF7A29" : "#FFE27A", big ? 14 : 8, big ? 7 : 4, 0.12);
            g.fx.shake = Math.max(g.fx.shake, big ? 12 : 5);
            if (big) { g.fx.flash = 0.35; g.fx.flashCol = "#FFF3DC"; }
          }
          g.terrainDirty = true;
          break;
        }
        case "hit": {
          const t = g.tanks.get(e.pid); if (!t) break;
          if (e.dmg < 0) { pop(t.x, t.y + 52, `+${-e.dmg}`, "#5FD44A", 18); break; }
          anim(e.pid).hurtAt = performance.now();
          if (e.shield && e.dmg === 0) { tkSfx.shield(); pop(t.x, t.y + 52, "🛡️", "#8FE9F5", 20); break; }
          { const wc = e.kind && e.kind !== TK_BASIC ? tkCard(e.kind) : null;
            pop(t.x, t.y + 52, `${wc && e.dmg >= 25 ? wc.ic + " " : ""}-${e.dmg}`, e.pid === me ? "#FF4438" : e.by === me ? "#FFC531" : "#FFF3DC", e.dmg >= 60 ? 30 : e.dmg >= 40 ? 24 : 18); }
          tkSfx.hit(e.pid === me);
          if (e.pid === me) { g.fx.shake = Math.max(g.fx.shake, 8); g.fx.flash = 0.4; g.fx.flashCol = "#FF4438"; vibrate(80); }
          else if (e.by === me) { burst(t.x, t.y + 10, "#FFC531", 6, 3); }
          break;
        }
        case "die": {
          const t = g.tanks.get(e.pid);
          if (t) { burst(t.x, t.y + 8, "#2E2620", 18, 6, 0.25); burst(t.x, t.y + 8, "#FF7A29", 10, 6, 0.1); ring(t.x, t.y + 10, 40, "#FF4438", "boom"); }
          if (e.pid === me) { tkSfx.die(); vibrate([100, 50, 200]); g.fx.shake = 14; setBanner({ ic: "💀", t: "הטנק שלך התפוצץ", s: "אבל אתה בשמיים — כל סיבוב תפיל משהו", cls: "long" }); }
          else { tkSfx.kill(e.by === me); if (e.by === me) { setBanner({ ic: "💀", t: `פוצצת את ${pname(e.pid)}!`, s: `+${TK.GOLD_KILL} 🪙`, cls: "long" }); vibrate([30, 30, 60]); } else addFeed(`💀 ${e.by ? pname(e.by) : "השמיים"} ${e.by === e.pid ? "פוצץ את עצמו" : `פוצץ את ${pname(e.pid)}`}`); }
          break;
        }
        case "dodge": { const t = g.tanks.get(e.pid); if (t) pop(t.x, t.y + 52, "💨 פספוס!", "#8FE9F5", 16); tkSfx.dodge(); break; }
        case "reflect": { const t = g.tanks.get(e.pid); if (t) { pop(t.x, t.y + 52, "🪞 חזר!", "#8FE9F5", 16); ring(t.x, t.y + 12, 30, "#8FE9F5", "shield"); } tkSfx.shield(); break; }
        case "split": { tkSfx.split(); burst(e.x, e.y, "#FFF3DC", 8, 3, 0.05); pop(e.x, e.y + 10, `×${e.n}`, "#FFC531", 16); break; }
        case "tele": { const t = g.tanks.get(e.pid); if (t) { burst(e.x, e.y + 6, "#A78BFA", 12, 5, 0.1); } tkSfx.tele(); break; }
        case "fall": { const t = g.tanks.get(e.pid); if (t && e.dmg > 0) { pop(t.x, t.y + 52, `נפילה -${e.dmg}`, "#FF8A2B", 15); tkSfx.fall(); } break; }
        case "water": { const t = g.tanks.get(e.pid); if (t) pop(t.x, t.y + 52, `🌊 -${e.dmg}`, "#38C8E8", 15); tkSfx.water(); break; }
        case "burn": { const t = g.tanks.get(e.pid); if (t) pop(t.x, t.y + 52, `🔥 -${e.dmg}`, "#FF7A29", 15); break; }
        case "shock": { const t = g.tanks.get(e.pid); if (t) burst(t.x, t.y + 6, "#FFF", 6, 4, 0.2); break; }
        case "freeze": { const t = g.tanks.get(e.pid); if (t) pop(t.x, t.y + 52, "🧊 קפוא!", "#8FE9F5", 17); tkSfx.freeze(); break; }
        case "emp": { const t = g.tanks.get(e.pid); if (t) pop(t.x, t.y + 52, "⚡ EMP", "#FFC531", 16); tkSfx.emp(); break; }
        case "laststand": { const t = g.tanks.get(e.pid); if (t) pop(t.x, t.y + 60, "🕯️ עמידה אחרונה!", "#FFC531", 16); break; }
      }
    }
  }

  /* ---------- קלט: רוגטקה ---------- */
  useEffect(() => {
    const el = cvRef.current?.parentElement; if (!el) return;
    const g = G.current;
    // רק כפתורים ומסכי-על חוסמים את הרוגטקה — המרווחים בין הכפתורים שייכים להר (הטנק התחתון היה "נוגע" בכפתורים)
    const isBtn = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("button, .tk-garage, .tk-pick, .tk-over, .tk-bo, .tk-sky, .tk-ammo, .exit-fab");
    const down = (e: PointerEvent) => {
      if (isBtn(e.target)) return;
      tkAudioInit();
      const d = g.drag;
      // קלף שמיים שדורש נקודה — טאפ על ההר
      if (g.skyX) { const wx = (e.clientX - 0) / g.cam.scale + g.cam.x0; skyTap(wx); return; }
      if (g.phase !== "aim" || !myTank()?.alive || d.pid >= 0) return;
      try { el.setPointerCapture(e.pointerId); } catch { /* */ }
      d.pid = e.pointerId; d.x0 = e.clientX; d.y0 = e.clientY; d.cx = e.clientX; d.cy = e.clientY; d.on = true; d.moved = false;
    };
    const move = (e: PointerEvent) => {
      const d = g.drag; if (e.pointerId !== d.pid) return;
      d.cx = e.clientX; d.cy = e.clientY;
      const dx = d.x0 - d.cx, dy = d.cy - d.y0;
      const dist = Math.hypot(dx, dy);
      if (dist > 8) d.moved = true;
      if (d.moved) {
        const p = Math.min(1, dist / DRAG_MAX);
        const v = p * TK.VMAX * g.mods.power;
        g.aim = { vx: (dx / (dist || 1)) * v, vy: (dy / (dist || 1)) * v };
        anim(me).angle = Math.atan2(dy, dx);
        tkSfx.drag(p);
        setHud((h) => h.power === Math.round(p * 100) ? h : { ...h, power: Math.round(p * 100), aimed: true });
      }
    };
    const up = (e: PointerEvent) => {
      const d = g.drag; if (e.pointerId !== d.pid) return;
      d.pid = -1; d.on = false;
      if (d.moved && g.aim) { sendAim(); tkSfx.select(); vibrate(15); }
      d.moved = false;
    };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    const prevent = (e: TouchEvent) => { if (!isBtn(e.target)) e.preventDefault(); };
    el.addEventListener("touchstart", prevent, { passive: false }); el.addEventListener("touchmove", prevent, { passive: false });
    const key = (e: KeyboardEvent) => { // מקלדת לפיתוח
      if (e.key === "Enter") ready();
      if (e.key === "ArrowLeft") moveTank(-1); if (e.key === "ArrowRight") moveTank(1);
    };
    window.addEventListener("keydown", key);
    return () => {
      el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
      el.removeEventListener("touchstart", prevent); el.removeEventListener("touchmove", prevent);
      window.removeEventListener("keydown", key);
    };
  }, []);

  /* ---------- קלפי שמיים ---------- */
  function skyTap(wx: number) {
    const g = G.current;
    setSky((s) => { if (!s?.pick) return s; conn.sendGame({ a: "tk_skypick", id: s.pick.id, x: Math.round(wx) }); tkSfx.ready(); return { ...s, sent: s.pick.id, needX: false }; });
    g.skyX = false;
  }
  function pickSky(c: TkCardWire) {
    tkAudioInit(); tkSfx.select();
    if (c.tg === "x") { setSky((s) => s ? { ...s, pick: c, needX: true } : s); G.current.skyX = true; return; }
    if (c.tg === "player") { setSky((s) => s ? { ...s, pick: c } : s); return; }
    conn.sendGame({ a: "tk_skypick", id: c.id }); tkSfx.ready();
    setSky((s) => s ? { ...s, pick: c, sent: c.id } : s);
  }
  function skyTarget(pid: string) { setSky((s) => { if (!s?.pick) return s; conn.sendGame({ a: "tk_skypick", id: s.pick.id, target: pid }); tkSfx.ready(); return { ...s, sent: s.pick.id }; }); }

  /* ---------- המוסך ---------- */
  function tapCard(c: TkCardWire) {
    tkAudioInit();
    const g = G.current;
    if (!garage || garage.bought.includes(c.id)) return;
    if (c.price > g.gold) { tkSfx.nope(); vibrate(30); setBanner({ ic: "🪙", t: "אין מספיק זהב", s: `צריך ${c.price}, יש ${fmt(g.gold)}`, cls: "short" }); return; }
    if (c.tg === "player") { setGarage((gr) => gr ? { ...gr, pick: c } : gr); tkSfx.select(); return; }
    conn.sendGame({ a: "tk_buy", id: c.id });
  }
  function buyTarget(pid: string) { setGarage((gr) => { if (!gr?.pick) return gr; conn.sendGame({ a: "tk_buy", id: gr.pick.id, target: pid }); return { ...gr, pick: undefined }; }); }
  function garageDone() { setGarage((gr) => gr ? { ...gr, done: true, pick: undefined } : gr); conn.sendGame({ a: "tk_ready" }); tkSfx.ready(); }

  /* ---------- הלולאה ---------- */
  useEffect(() => {
    const cv = cvRef.current!; const ctx = cv.getContext("2d", { alpha: false })!;
    let raf = 0, cssW = 0, cssH = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cssW = cv.clientWidth || window.innerWidth; cssH = cv.clientHeight || window.innerHeight;
      cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
      const g = G.current; g.cam.vw = cssW; g.cam.vh = cssH; g.cam.land = isLandscape();
      fitCam(true);
    };
    /**
     * המצלמה: ההר ממלא את הרוחב שנשאר (לרוחב: בין שתי העמודות), ורצועת הטנקים חייבת להיכנס
     * בין ה-HUD למעלה לכפתורים למטה — הטנק הכי נמוך יושב לפחות 70px מעל הכפתורים.
     */
    const fitCam = (snap = false) => {
      const g = G.current; const cam = g.cam;
      cam.sideL = cam.land ? 104 : 0; cam.sideR = cam.land ? 104 : 0;
      cam.top = cam.land ? 56 : 128; cam.bottom = cam.land ? 14 : 200;
      const wFit = (cam.vw - cam.sideL - cam.sideR) / TK.W;
      let minH = Infinity, maxT = -Infinity; for (const v of g.world.h) if (v < minH) minH = v;
      for (const t of g.tanks.values()) if (t.alive && t.y > maxT) maxT = t.y;
      if (!isFinite(maxT)) maxT = minH;
      const band = (maxT - minH) + 110;   // גובה הטנק + שם + מרווח
      const hFit = (cam.vh - cam.top - cam.bottom) / band;
      const base = Math.max(wFit * 0.5, Math.min(wFit, hFit));
      cam.base = base; if (snap) { cam.scale = base; cam.target = base; }
    };
    resize(); window.addEventListener("resize", resize);

    const stepSalvo = () => {
      const g = G.current; const sim = g.salvo; if (!sim) return;
      const t = conn.serverNow();
      const due = Math.floor((t - g.salvoAt) / TK.TICK_MS);
      let n = 0;
      while (!sim.done && sim.tick < due && n < 12) { sim.step(); n++; }
      if (n > 0) onEvents(sim.drain());
      if (sim.done && g.pendingResult) applyResult(g.pendingResult);
    };
    const bot = () => {
      const g = G.current; if (g.phase !== "aim" || g.locked) return;
      const meT = myTank(); if (!meT?.alive) { if (g.skyX) return; return; }
      if (t0Bot === 0) t0Bot = performance.now();
      if (performance.now() - t0Bot < 800) return;
      t0Bot = 0;
      const tg = [...g.tanks.values()].filter((x) => x.alive && x.pid !== me)[0]; if (!tg) return;
      g.aim = tkBotAim(g.world, meT, tg, g.wind, g.mods.power);
      const ammo = Object.keys(g.ammo)[0]; if (ammo) { g.weapon = ammo; setWeapon(ammo); }
      ready();
    };
    let t0Bot = 0;

    const frame = (nowMs: number) => {
      raf = requestAnimationFrame(frame);
      const g = G.current; const t = conn.serverNow();
      try {
        const dt = g.lastFrame ? Math.min(100, nowMs - g.lastFrame) : 16; g.lastFrame = nowMs;
        if (window.__tkAuto) { bot(); if (g.phase === "garage") { setGarage((gr) => { if (gr && !gr.done && Math.random() < 0.02) { const c = gr.cards.find((x) => !gr.bought.includes(x.id) && x.price <= g.gold && x.tg !== "player"); if (c) conn.sendGame({ a: "tk_buy", id: c.id }); else { conn.sendGame({ a: "tk_ready" }); return { ...gr, done: true }; } } return gr; }); } if (g.phase === "aim" && !myTank()?.alive) setSky((s) => { if (s && !s.sent && !s.pick) { const c = s.cards.find((x) => x.tg !== "player") ?? s.cards[0]; if (c.tg === "x") { conn.sendGame({ a: "tk_skypick", id: c.id, x: 360 }); } else if (c.tg === "player") { const tg = [...g.tanks.values()].find((x) => x.alive && x.pid !== me); if (tg) conn.sendGame({ a: "tk_skypick", id: c.id, target: tg.pid }); } else conn.sendGame({ a: "tk_skypick", id: c.id }); return { ...s, pick: c, sent: c.id }; } return s; }); }
        if (g.phase === "salvo") stepSalvo();
        // מצלמה: מתאימה לרצועת הטנקים, ומתרחקת כשהפגזים גבוה
        const cam = g.cam;
        fitCam();
        let minH = Infinity; for (const v of g.world.h) if (v < minH) minH = v;
        if (g.phase === "salvo" && g.salvo) {
          let top = 0; for (const s of g.salvo.shells) if (!s.done && s.t > 0) top = Math.max(top, s.y);
          const need = top + 80 - (minH - 30);
          const viewH = (cam.vh - cam.bottom) / cam.base;
          cam.target = need > viewH ? Math.max(cam.base * 0.45, (cam.vh - cam.bottom) / need) : cam.base;
        } else cam.target = cam.base;
        cam.scale += (cam.target - cam.scale) * 0.08;
        cam.y0 = minH - 30 - cam.bottom / cam.scale;
        // מרכז ההר = מרכז השטח שבין העמודות
        cam.x0 = TK.W / 2 - (cam.sideL + (cam.vw - cam.sideL - cam.sideR) / 2) / cam.scale;
        // אפקטים
        const k = dt / 16.7;
        for (const p of g.fx.parts) { p.x += p.vx * k; p.y += p.vy * k; p.vy -= p.g * k; p.l -= 0.02 * k; if (p.y < tkGround(g.world.h, p.x) - 2 && p.vy < 0) { p.vy = 0; p.vx *= 0.6; } }
        g.fx.parts = g.fx.parts.filter((p) => p.l > 0);
        for (const p of g.fx.pops) { p.y += p.vy * k; p.l -= 0.014 * k; }
        g.fx.pops = g.fx.pops.filter((p) => p.l > 0);
        for (const r of g.fx.rings) r.l -= (r.kind === "meteor" || r.r > 50 ? 0.028 : 0.05) * k;
        g.fx.rings = g.fx.rings.filter((r) => r.l > 0);
        g.fx.shake *= Math.pow(0.86, k); if (g.fx.shake < 0.3) g.fx.shake = 0;
        g.fx.flash *= Math.pow(0.86, k);
        draw(ctx, cssW, cssH, dpr, t, nowMs);
        window.__tkFrames = (window.__tkFrames ?? 0) + 1;
        // HUD 10Hz
        if (t - g.hudAt > 100) {
          g.hudAt = t;
          const mine = myTank();
          const secs = g.phase === "aim" || g.phase === "garage" ? Math.max(0, Math.ceil((g.until - t) / 1000)) : 0;
          if ((g.phase === "aim" || g.phase === "garage") && secs !== g.lastTickSec) { if (secs <= 3 && secs > 0 && g.lastTickSec >= 0) tkSfx.tick(secs <= 1); g.lastTickSec = secs; }
          setHud((h) => ({ ...h, secs, gold: g.gold, hp: mine?.hp ?? 0, hpMax: mine?.hpMax ?? 100, sh: mine?.shield ?? 0, wind: g.wind, k: g.k, b: g.b, battles: g.battles, bounty: g.bounty, sudden: g.sudden, alive: !!mine?.alive, fuel: g.fuel, locked: g.locked, aimed: !!g.aim, doom: g.doom, night: g.world.night, total: g.phase === "garage" ? g.cfg.garageMs / 1000 : g.cfg.aimMs / 1000 }));
          window.__tkDbg = { phase: g.phase, k: g.k, b: g.b, hp: mine?.hp, alive: mine?.alive, gold: g.gold, tanks: [...g.tanks.values()].map((x) => [x.pid, Math.round(x.x), Math.round(x.y), x.hp, x.alive]), salvo: g.salvo ? { tick: g.salvo.tick, done: g.salvo.done } : null, aim: g.aim, water: g.world.water };
        }
      } catch (e) { window.__tkErr = String(e); }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  /* ---------- ציור ---------- */
  function terrainCanvas(): HTMLCanvasElement {
    const g = G.current; const th = themeOf();
    if (!g.terrainCv) { g.terrainCv = document.createElement("canvas"); g.terrainCv.width = TK.W; g.terrainCv.height = 680; g.terrainDirty = true; }
    if (!g.terrainDirty) return g.terrainCv;
    g.terrainDirty = false;
    const c = g.terrainCv.getContext("2d")!; const H = 680;
    c.clearRect(0, 0, TK.W, H);
    const h = g.world.h;
    // אדמה עמוקה
    c.beginPath(); c.moveTo(0, H);
    for (let i = 0; i < TK.COLS; i++) c.lineTo(i * TK.COL, H - h[i]);
    c.lineTo(TK.W, H - h[TK.COLS - 1]); c.lineTo(TK.W, H); c.closePath();
    const grad = c.createLinearGradient(0, H - 600, 0, H); grad.addColorStop(0, th.dirt); grad.addColorStop(1, th.deep);
    c.fillStyle = grad; c.fill();
    // סלעים (דטרמיניסטי מהזרע)
    let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    c.fillStyle = "rgba(0,0,0,.13)";
    for (let i = 0; i < 90; i++) { const x = rnd() * TK.W, y = rnd() * 520; if (y < tkGround(h, x) - 14) { c.beginPath(); c.ellipse(x, H - y, 3 + rnd() * 6, 2 + rnd() * 4, rnd() * 3, 0, Math.PI * 2); c.fill(); } }
    // דשא/קו עליון
    c.strokeStyle = th.grass; c.lineWidth = 7; c.lineJoin = "round"; c.lineCap = "round";
    c.beginPath(); for (let i = 0; i < TK.COLS; i++) { const x = i * TK.COL, y = H - h[i]; if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke();
    c.strokeStyle = INK; c.lineWidth = 2.5; c.globalAlpha = 0.8;
    c.beginPath(); for (let i = 0; i < TK.COLS; i++) { const x = i * TK.COL, y = H - h[i] - 4; if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke();
    c.globalAlpha = 1;
    return g.terrainCv;
  }

  function draw(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, t: number, nowMs: number) {
    const g = G.current; const cam = g.cam; const th = themeOf();
    const S = cam.scale;
    const sx = (x: number) => (x - cam.x0) * S, sy = (y: number) => H - (y - cam.y0) * S;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // רעידה
    if (g.fx.shake > 0 && !g.reduced) ctx.translate((Math.random() - 0.5) * g.fx.shake, (Math.random() - 0.5) * g.fx.shake);
    // שמיים
    const sk = ctx.createLinearGradient(0, 0, 0, H); sk.addColorStop(0, th.sky[0]); sk.addColorStop(1, th.sky[1]);
    ctx.fillStyle = sk; ctx.fillRect(-20, -20, W + 40, H + 40);
    const bg = skyImg(g.world.theme);
    if (bg) { const r = Math.max((W + 40) / bg.naturalWidth, (H + 40) / bg.naturalHeight); const bw = bg.naturalWidth * r, bh = bg.naturalHeight * r; ctx.drawImage(bg, -20 + ((W + 40) - bw) / 2, -20 + ((H + 40) - bh) * 0.35, bw, bh); }
    else if (th.stars) { let s = 3; const rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647; }; ctx.fillStyle = "#FFF"; for (let i = 0; i < 70; i++) { const x = rnd() * W, y = rnd() * H * 0.7; const tw = 0.5 + 0.5 * Math.sin(nowMs / 500 + i); ctx.globalAlpha = 0.4 + tw * 0.6; ctx.fillRect(x, y, 1.6, 1.6); } ctx.globalAlpha = 1; }
    if (th.sun && !bg) { ctx.fillStyle = th.sun; ctx.beginPath(); ctx.arc(W * 0.8, H * 0.12, 26, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke(); }
    // עננים נעים עם הרוח
    if (!th.stars && !bg) { ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.strokeStyle = "rgba(12,9,6,.5)"; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { const cx = ((i * 190 + nowMs * 0.006 * (1 + g.wind * 0.6) + 2000) % (W + 160)) - 80, cy = H * (0.08 + i * 0.07); cloud(ctx, cx, cy, 26 + i * 6); } }
    // הר
    const tc = terrainCanvas();
    // כשהמצלמה מתרחקת ההר צר מהמסך — ממשיכים את הקצוות ואת האדמה העמוקה לכל הרוחב
    const hL = g.world.h[0], hR = g.world.h[TK.COLS - 1];
    const sideG = ctx.createLinearGradient(0, sy(600), 0, sy(0)); sideG.addColorStop(0, th.dirt); sideG.addColorStop(1, th.deep);
    ctx.fillStyle = sideG;
    if (sx(0) > 0) ctx.fillRect(-20, sy(hL), sx(0) + 21, H - sy(hL) + 40);
    if (sx(TK.W) < W) ctx.fillRect(sx(TK.W) - 1, sy(hR), W - sx(TK.W) + 21, H - sy(hR) + 40);
    ctx.drawImage(tc, sx(0), sy(680), TK.W * S, 680 * S);
    ctx.fillStyle = th.deep; ctx.fillRect(-20, sy(0) - 1, W + 40, H - sy(0) + 40);
    // מים
    if (g.world.water > 0) { ctx.fillStyle = th.water; ctx.fillRect(sx(0), sy(g.world.water + Math.sin(nowMs / 400) * 3), TK.W * S, (g.world.water - cam.y0) * S + 50); ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 2; ctx.beginPath(); for (let x = 0; x <= TK.W; x += 12) { const y = g.world.water + Math.sin(nowMs / 400 + x / 30) * 3; if (x === 0) ctx.moveTo(sx(x), sy(y)); else ctx.lineTo(sx(x), sy(y)); } ctx.stroke(); }
    // אש
    for (const f of g.world.fires) { for (let i = -2; i <= 2; i++) { const x = f.x + i * f.r * 0.35; const gy = tkGround(g.world.h, x); const hgt = (10 + Math.abs(Math.sin(nowMs / 90 + i * 1.7 + x)) * 18); ctx.fillStyle = i % 2 ? "#FF7A29" : "#FFC531"; ctx.beginPath(); ctx.moveTo(sx(x - 7), sy(gy)); ctx.lineTo(sx(x), sy(gy + hgt)); ctx.lineTo(sx(x + 7), sy(gy)); ctx.closePath(); ctx.fill(); } }
    // תחזיות (שלי + ריגול)
    const meT = myTank();
    if (g.phase === "aim" && meT?.alive && !g.blind && !g.world.night) {
      const drawPrev = (tank: TkTank, aim: { vx: number; vy: number }, col: string, ticks: number, mine: boolean) => {
        const w = tkWeaponOf(mine ? g.weapon : TK_BASIC);
        const pts = tkPreview(g.world, tank.x, tank.y + TK.TANK_H, aim.vx, aim.vy, g.mods.windPreview || !mine ? g.wind : 0, ticks, w);
        ctx.setLineDash([7, 9]); ctx.strokeStyle = col; ctx.lineWidth = mine ? 4.5 : 2.5; ctx.lineCap = "round"; ctx.globalAlpha = mine ? 0.95 : 0.6;
        ctx.beginPath(); pts.forEach((p, i) => { if (i === 0) ctx.moveTo(sx(p.x), sy(p.y)); else ctx.lineTo(sx(p.x), sy(p.y)); }); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        if (mine && g.mods.sight && pts.length) { const p = pts[pts.length - 1]; ctx.strokeStyle = "#FF4438"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx(p.x) - 8, sy(p.y) - 8); ctx.lineTo(sx(p.x) + 8, sy(p.y) + 8); ctx.moveTo(sx(p.x) + 8, sy(p.y) - 8); ctx.lineTo(sx(p.x) - 8, sy(p.y) + 8); ctx.stroke(); }
      };
      if (g.aim) drawPrev(meT, g.aim, "#FFF3DC", g.mods.preview, true);
      for (const [pid, a] of g.spyAims) { const tk = g.tanks.get(pid); if (tk?.alive) drawPrev(tk, a, chColor(pid), 999, false); }
    }
    // רוגטקה בזמן גרירה
    if (g.drag.on && g.drag.moved && meT?.alive && g.aim) {
      const p = Math.min(1, Math.hypot(g.aim.vx, g.aim.vy) / (TK.VMAX * g.mods.power));
      const ox = sx(meT.x), oy = sy(meT.y + TK.TANK_H);
      const a = Math.atan2(g.aim.vy, g.aim.vx);
      const len = 30 + p * 70;
      ctx.strokeStyle = "rgba(12,9,6,.55)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox - Math.cos(a) * len * 0.5, oy + Math.sin(a) * len * 0.5); ctx.stroke();
      ctx.strokeStyle = p > 0.8 ? "#FF4438" : p > 0.5 ? "#FFC531" : "#FFF3DC"; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + Math.cos(a) * len, oy - Math.sin(a) * len); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(ox + Math.cos(a) * (len + 12), oy - Math.sin(a) * (len + 12)); ctx.lineTo(ox + Math.cos(a + 2.5) * 12 + Math.cos(a) * len, oy - Math.sin(a + 2.5) * 12 - Math.sin(a) * len); ctx.lineTo(ox + Math.cos(a - 2.5) * 12 + Math.cos(a) * len, oy - Math.sin(a - 2.5) * 12 - Math.sin(a) * len); ctx.closePath(); ctx.fill();
      ctx.font = `800 ${16}px Assistant, sans-serif`; ctx.textAlign = "center"; ctx.fillStyle = PAPER; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineJoin = "round";
      const label = `${Math.round(p * 100)}%`; ctx.strokeText(label, ox, oy - 62); ctx.fillText(label, ox, oy - 62);
    }
    // טנקים
    const kU = S;
    for (const tank of g.tanks.values()) {
      const x = sx(tank.x), y = sy(tank.y);
      const a = anim(tank.pid);
      const face = Math.cos(a.angle) >= 0 ? 1 : -1;
      const hurt = nowMs - a.hurtAt < 500;
      const pose = !tank.alive ? "dead" : hurt ? "hurt" : (g.phase === "battleover" && battleOver?.winner === tank.pid) ? "win" : "idle";
      const build = tank.alive ? buildOf(tank.pid) : [];
      // הילה בצבע הבילד הדומיננטי — רואים מרחוק "מי בנה הגנה ומי בנה כלכלה"
      if (build.length && tank.alive) {
        const cnt: Record<string, number> = {}; for (const id of build) { const c = tkCard(id); if (c) cnt[c.cat] = (cnt[c.cat] ?? 0) + 1; }
        const dom = Object.entries(cnt).sort((p, q) => q[1] - p[1])[0]?.[0] ?? "T";
        const pulse = 0.85 + 0.15 * Math.sin(nowMs / 400 + tank.c);
        ctx.globalAlpha = 0.28 + Math.min(0.3, build.length * 0.05); ctx.fillStyle = CAT_COL[dom] ?? "#FFF";
        ctx.beginPath(); ctx.ellipse(x, y + 2, (40 + build.length * 3) * kU * pulse, (11 + build.length) * kU * pulse, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }
      if (tank.pid === me && tank.alive) { ctx.fillStyle = "rgba(255,197,49,.35)"; ctx.beginPath(); ctx.ellipse(x, y + 2, 34 * kU, 8 * kU, 0, 0, Math.PI * 2); ctx.fill(); }
      const rec = Math.max(0, 1 - (nowMs - a.fireAt) / 220);
      drawTankBody(ctx, tank.c, x, y, kU, face, pose, nowMs + tank.c * 300);
      drawBarrel(ctx, tank.c, x, y, kU, a.angle, rec, !tank.alive);
      if (tank.alive && tank.frozen) { ctx.fillStyle = "rgba(143,233,245,.55)"; ctx.beginPath(); ctx.ellipse(x, y - 14 * kU, 34 * kU, 26 * kU, 0, 0, Math.PI * 2); ctx.fill(); }
      if (tank.alive && rec > 0) { ctx.fillStyle = "#FFE27A"; ctx.beginPath(); ctx.arc(x + Math.cos(a.angle) * 38 * kU, y - barrelPivot() * kU - Math.sin(a.angle) * 38 * kU, 10 * kU * rec, 0, Math.PI * 2); ctx.fill(); }
      if (!tank.alive) { ctx.fillStyle = "rgba(60,50,40,.5)"; for (let i = 0; i < 3; i++) { const ph = (nowMs / 900 + i * 0.33 + tank.c) % 1; ctx.beginPath(); ctx.arc(x + Math.sin(ph * 6 + i) * 6, y - 30 * kU - ph * 40, (4 + ph * 8) * kU, 0, Math.PI * 2); ctx.fill(); } }
      if (tank.alive && tank.shield > 0) { ctx.strokeStyle = "rgba(143,233,245,.9)"; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.arc(x, y - 14 * kU, 32 * kU, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      // שם + חיים
      const mine = tank.pid === me;
      const label = mine ? "אתה" : pname(tank.pid).slice(0, 9);
      ctx.font = `800 ${Math.round(13 * Math.max(0.85, Math.min(1.25, S * 1.7)))}px Assistant, sans-serif`; ctx.textAlign = "center"; ctx.lineJoin = "round";
      const ly = y - TANK_W * 0.95 * kU - 8;
      ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.fillStyle = mine ? "#FFC531" : tank.alive ? PAPER : "#C8B78E";
      ctx.strokeText(label, x, ly); ctx.fillText(label, x, ly);
      // תגי הבילד מעל השם — אבולוציות ונדירים קודם, עד 4 ואז "+n"
      if (build.length) {
        const shown = build.slice(0, 4); const extra = build.length - shown.length;
        const fs = Math.round(13 * Math.max(0.85, Math.min(1.3, S * 1.7)));
        ctx.font = `${fs}px sans-serif`; ctx.textAlign = "center";
        const step = fs + 3; const tot = shown.length * step + (extra > 0 ? step : 0);
        let bx = x - tot / 2 + step / 2; const by = ly - fs - 4;
        ctx.fillStyle = "rgba(12,9,6,.55)"; const rr = 5; const bw0 = tot + 6, bh0 = fs + 6; const rx = x - bw0 / 2, ry = by - fs + 1;
        ctx.beginPath(); ctx.moveTo(rx + rr, ry); ctx.lineTo(rx + bw0 - rr, ry); ctx.quadraticCurveTo(rx + bw0, ry, rx + bw0, ry + rr); ctx.lineTo(rx + bw0, ry + bh0 - rr); ctx.quadraticCurveTo(rx + bw0, ry + bh0, rx + bw0 - rr, ry + bh0); ctx.lineTo(rx + rr, ry + bh0); ctx.quadraticCurveTo(rx, ry + bh0, rx, ry + bh0 - rr); ctx.lineTo(rx, ry + rr); ctx.quadraticCurveTo(rx, ry, rx + rr, ry); ctx.closePath(); ctx.fill();
        for (const id of shown) { ctx.fillText(tkCard(id)?.ic ?? "•", bx, by); bx += step; }
        if (extra > 0) { ctx.font = `800 ${fs - 2}px Assistant, sans-serif`; ctx.fillStyle = "#FFC531"; ctx.fillText(`+${extra}`, bx, by); }
      }
      if (tank.alive) {
        const bw = Math.min(72, 44 * Math.max(1, tank.hpMax / TK.HP)), bh = 6; const hx = x - bw / 2, hy = ly + 3;
        ctx.fillStyle = INK; ctx.fillRect(hx - 1, hy - 1, bw + 2, bh + 2);
        ctx.fillStyle = "#3a2f28"; ctx.fillRect(hx, hy, bw, bh);
        const f = Math.max(0, tank.hp / tank.hpMax); ctx.fillStyle = f > 0.5 ? "#5FD44A" : f > 0.25 ? "#FFC531" : "#FF4438"; ctx.fillRect(hx, hy, bw * f, bh);
        if (tank.shield > 0) { ctx.fillStyle = "#8FE9F5"; ctx.fillRect(hx, hy + bh - 2, bw * Math.min(1, tank.shield / tank.hpMax), 2); }
      }
      const above = build.length ? Math.round(13 * Math.max(0.85, Math.min(1.3, S * 1.7))) + 10 : 0;
      if ((tank.bounty >= 0 || tank.pid === g.bounty) && tank.alive) { ctx.font = "20px sans-serif"; const by = ly - 22 - above + Math.sin(nowMs / 250) * 3; ctx.fillText("🎯", x, by); }
      if (mine && tank.alive && g.phase === "aim") { ctx.fillStyle = "#FFC531"; ctx.strokeStyle = INK; ctx.lineWidth = 2; const ty = ly - 18 - above + Math.sin(nowMs / 300) * 2; ctx.beginPath(); ctx.moveTo(x, ty); ctx.lineTo(x - 7, ty - 10); ctx.lineTo(x + 7, ty - 10); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    }
    // פגזים
    if (g.salvo) {
      for (const s of g.salvo.shells) {
        if (s.t === 0) continue;
        const w = s.w;
        if (s.trail.length >= 4 && !s.done) {
          ctx.lineWidth = w.laser ? 4 : s.meteor ? 6 : 3.2; ctx.lineCap = "round";
          ctx.strokeStyle = w.laser ? "rgba(255,68,56,.9)" : s.meteor ? "rgba(255,122,41,.8)" : w.fire ? "rgba(255,122,41,.6)" : "rgba(255,243,220,.75)";
          ctx.beginPath(); for (let i = 0; i < s.trail.length; i += 2) { const px = sx(s.trail[i]), py = sy(s.trail[i + 1]); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.lineTo(sx(s.x), sy(s.y)); ctx.stroke();
        }
        if (s.done) continue;
        const r = (s.meteor ? 11 : w.r >= 60 ? 8 : w.r >= 40 ? 6 : 4.5) * Math.max(0.7, S * 1.4);
        ctx.fillStyle = s.meteor ? "#FF7A29" : w.confetti ? "#FF5FB0" : w.dirt ? th.dirt : w.heal ? "#5FD44A" : w.fire ? "#FF4438" : w.laser ? "#FF4438" : w.dmg >= 60 ? "#7CFF5C" : "#2E2620";
        ctx.strokeStyle = INK; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx(s.x), sy(s.y), r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (s.meteor) { ctx.fillStyle = "#FFE27A"; ctx.beginPath(); ctx.arc(sx(s.x) - 2, sy(s.y) - 2, r * 0.45, 0, Math.PI * 2); ctx.fill(); }
        // נשק מיוחד — האייקון שלו עף (רואים מה כל אחד ירה)
        else if (s.wid !== TK_BASIC) { const ic = tkCard(s.wid)?.ic; if (ic) { ctx.font = `${Math.round(r * 2.6)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(ic, sx(s.x), sy(s.y)); ctx.textBaseline = "alphabetic"; } }
        // חץ למי שמעל המסך
        if (sy(s.y) < -10) { ctx.fillStyle = "#FFC531"; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(sx(s.x), 8); ctx.lineTo(sx(s.x) - 8, 22); ctx.lineTo(sx(s.x) + 8, 22); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      }
    }
    // טבעות פיצוץ
    for (const r of g.fx.rings) {
      const p = 1 - r.l; const rr = r.r * S * (0.4 + p * 1.1);
      ctx.globalAlpha = r.l * 0.9;
      if (r.kind === "boom" || r.kind === "meteor" || r.kind === "fire") { ctx.fillStyle = p < 0.3 ? "#FFF3DC" : r.col; ctx.beginPath(); ctx.arc(sx(r.x), sy(r.y), rr, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = r.col; ctx.lineWidth = Math.max(2, 6 * r.l); ctx.beginPath(); ctx.arc(sx(r.x), sy(r.y), rr * 1.15, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // חלקיקים
    for (const p of g.fx.parts) { ctx.globalAlpha = Math.max(0, Math.min(1, p.l * 1.4)); ctx.fillStyle = p.col; if (p.sq) ctx.fillRect(sx(p.x) - p.r, sy(p.y) - p.r, p.r * 2, p.r * 1.2); else { ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), p.r * Math.max(0.6, S * 1.3), 0, Math.PI * 2); ctx.fill(); } }
    ctx.globalAlpha = 1;
    // פופים
    for (const p of g.fx.pops) {
      ctx.globalAlpha = Math.min(1, p.l * 1.6); ctx.font = `800 ${p.sz}px Assistant, sans-serif`; ctx.textAlign = "center"; ctx.lineJoin = "round";
      ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.fillStyle = p.col; ctx.strokeText(p.t, sx(p.x), sy(p.y)); ctx.fillText(p.t, sx(p.x), sy(p.y));
    }
    ctx.globalAlpha = 1;
    // הבזק
    if (g.fx.flash > 0.02) { ctx.globalAlpha = Math.min(0.8, g.fx.flash); ctx.fillStyle = g.fx.flashCol; ctx.fillRect(-20, -20, W + 40, H + 40); ctx.globalAlpha = 1; }
    // מטאורים מגיעים — אזהרה
    if (g.phase === "aim" && g.sudden) { ctx.font = "800 13px Assistant, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#FF7A29"; ctx.strokeStyle = INK; ctx.lineWidth = 3; const tx = "☄️ מטאורים בדרך ☄️"; ctx.strokeText(tx, W / 2, 34 + (H - cam.bottom) * 0.28); ctx.fillText(tx, W / 2, 34 + (H - cam.bottom) * 0.28); }
    void t;
  }
  function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) { ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.arc(x + r * 0.6, y - r * 0.2, r * 0.7, 0, Math.PI * 2); ctx.arc(x + r * 1.3, y, r * 0.55, 0, Math.PI * 2); ctx.fill(); }

  /* ---------- בחירת צבע ---------- */
  function pickChar(c: number) { tkAudioInit(); tkSfx.select(); conn.sendGame({ a: "tk_char", c }); if (!land) tryLandscape(); }

  const ammoList = () => [{ id: TK_BASIC, ic: "💣", t: "רגיל", n: -1 }, ...Object.entries(you.ammo).map(([id, n]) => { const c = tkCard(id); return { id, ic: c?.ic ?? "?", t: c?.t ?? id, n }; })];
  const ownedList = () => Object.entries(you.owned).map(([id, n]) => { const c = tkCard(id); return c ? { id, ic: c.ic, t: c.t, n } : null; }).filter(Boolean) as { id: string; ic: string; t: string; n: number }[];
  const others = () => [...G.current.tanks.values()].filter((t) => t.pid !== me);
  const windArrow = (w: number) => { const n = Math.min(3, Math.ceil(Math.abs(w) / 3.4)); return w === 0 ? "•" : (w > 0 ? "→" : "←").repeat(n); };
  const inGame = phase === "aim" || phase === "salvo" || phase === "garage" || phase === "intro" || phase === "battleover";

  return (
    <div className={"tk-wrap" + (land ? " land" : "")} style={{ "--gc": SIG } as CSSProperties}>
      <canvas ref={cvRef} className="tk-cv" />

      {/* HUD: הפינה השמאלית-עליונה שמורה לכפתור "סיום משחק" של החדר; שלי (זהב·טיימר·חיים·בילד) בימין */}
      {inGame && (
        <>
          <div className="tk-top">
            <div className="tk-me">
              <div className="row">
                <div className="tk-chip tk-gold big">🪙 <b>{fmt(hud.gold)}</b></div>
                <div className={"tk-timer" + (hud.secs <= 3 && hud.secs > 0 ? " hot" : hud.secs <= 6 ? " warm" : "") + (phase === "aim" || phase === "garage" ? "" : " off")} style={{ "--p": `${hud.secs > 0 ? (hud.secs / hud.total) * 360 : 0}deg` } as CSSProperties}><span>{phase === "aim" || phase === "garage" ? hud.secs : "💥"}</span></div>
              </div>
              {hud.alive ? <div className="tk-hp"><i style={{ width: `${Math.round((hud.hp / hud.hpMax) * 100)}%` }} /><span>❤️ {Math.round(hud.hp)}/{hud.hpMax}{hud.sh > 0 ? ` 🛡️${Math.round(hud.sh)}` : ""}</span></div> : <div className="tk-hp dead"><span>☁️ בשמיים</span></div>}
              {ownedList().length > 0 && <div className="tk-build">{ownedList().slice(0, 7).map((o) => <span key={o.id} title={o.t}>{o.ic}{o.n > 1 ? <small>×{o.n}</small> : null}</span>)}{ownedList().length > 7 && <span>+{ownedList().length - 7}</span>}</div>}
            </div>
            <div className="tk-mid">
              <div className="tk-round">קרב {hud.b + 1}{hud.battles > 1 ? `/${hud.battles}` : ""} · סלבו <b>{hud.k}</b></div>
              <div className={"tk-wind" + (Math.abs(hud.wind) >= 7 ? " strong" : "")}>🌬️ <span className="arr">{windArrow(hud.wind)}</span> {Math.abs(hud.wind)}</div>
              {hud.bounty && <span className="tk-tag bounty">🎯 ראש בפרס: {hud.bounty === me ? "אתה!" : pname(hud.bounty)}</span>}
              {hud.doom && <span className="tk-tag doom">🔔 יום הדין ×2</span>}
              {you.curse && <span className="tk-tag doom">😈 מקולל</span>}
            </div>
            <div className="tk-fabspace" />
          </div>
          {feed.length > 0 && <div className="tk-feed">{feed.map((f) => <div key={f.id}>{f.tx}</div>)}</div>}
        </>
      )}

      {/* סרגל התחמושת + מוכן — שלב הכיוון (לאורך: למטה · לרוחב: עמודות בצדדים) */}
      {phase === "aim" && hud.alive && (
        <div className="tk-bar">
          <div className="tk-ammo">
            {ammoList().map((a) => (
              <button key={a.id} className={"tk-am" + (weapon === a.id ? " sel" : "")} onClick={() => { tkAudioInit(); setWeapon(a.id); G.current.weapon = a.id; tkSfx.select(); sendAim(); setAmmoHint(a.id === TK_BASIC ? "" : `${a.ic} ${a.t} — ${ammoLine(a.id)}`); }}>
                <span className="ic">{a.ic}</span><b>{a.t}</b><small>{a.n < 0 ? "∞" : `×${a.n}`}</small>
              </button>
            ))}
          </div>
          {ammoHint && <div className="tk-ammohint">{ammoHint}</div>}
          <div className="tk-actions">
            {you.fuel > 0 && <div className="tk-move"><button onClick={() => moveTank(-1)}>◀</button><small>⛽{you.fuel}</small><button onClick={() => moveTank(1)}>▶</button></div>}
            <button className={"tk-ready" + (hud.locked ? " on" : hud.aimed ? " go" : "")} onClick={ready}>{hud.locked ? "✓ מוכן — מחכים לכולם" : hud.aimed ? `🔥 אש! (${hud.power}%)` : "🎯 משכו אחורה לכוון"}</button>
          </div>
        </div>
      )}

      {/* קלפי שמיים — למתים */}
      {phase === "aim" && !hud.alive && sky && (
        <div className={"tk-sky" + (sky.needX ? " needx" : "")}>
          {sky.sent ? <p className="done">☁️ {sky.pick?.ic} {sky.pick?.t} — נשלח! רואים בסלבו</p>
            : sky.needX ? <p className="hint">👆 טאפ על ההר — איפה להפיל את {sky.pick?.t}?</p>
            : sky.pick?.tg === "player" ? <><p className="hint">{sky.pick.ic} {sky.pick.t} — על מי?</p><div className="targets">{others().filter((t) => t.alive).map((t) => <button key={t.pid} onClick={() => skyTarget(t.pid)} style={{ "--cc": chColor(t.pid) } as CSSProperties}><Face c={t.c} size={26} /> {pname(t.pid).slice(0, 8)}</button>)}</div></>
            : <><p className="hint">☁️ אתה בשמיים — בחר מה להפיל הסיבוב</p><div className="cards">{sky.cards.map((c) => <button key={c.id} className="card" onClick={() => pickSky(c)}><span className="ic">{c.ic}</span><b>{c.t}</b><small>{c.d}</small></button>)}</div></>}
        </div>
      )}

      {count && <div className="tk-count" key={count}>{count}</div>}
      {banner && <div className={"tk-banner " + (banner.cls ?? "")}><span className="ic">{banner.ic}</span><b>{banner.t}</b>{banner.s && <small>{banner.s}</small>}</div>}
      {flash && <div className="tk-flash" style={{ background: flash }} />}

      {/* בחירת צבע */}
      {phase === "pick" && pick && (
        <div className="tk-pick">
          <h2>איזה טנק אתה?</h2>
          <p className="sub">כל צבע לשחקן אחד. "מי זה הסגול עם הכתר?"</p>
          {!land && <p className="rotate">🔄 סובבו את הטלפון לרוחב — רואים את כל ההר</p>}
          <div className="grid">
            {TANKS.map((tk, i) => {
              const owner = Object.entries(pick.taken).find(([, c]) => c === i)?.[0];
              const mineC = owner === me;
              return (
                <button key={i} className={"tile" + (owner ? (mineC ? " mine" : " taken") : "")} style={{ "--cc": TK.CHAR_COLORS[i] } as CSSProperties} disabled={!!owner && !mineC} onClick={() => pickChar(i)}>
                  <img src={tankIcon(i, 128, mineC ? "win" : "idle")} alt="" /><b>{tk.name}</b>
                  {owner && <small>{mineC ? "אתה" : pname(owner)}</small>}
                </button>
              );
            })}
          </div>
          <PickTimer until={pick.until} conn={conn} />
        </div>
      )}

      {/* המוסך */}
      {phase === "garage" && garage && (
        <div className="tk-garage">
          <div className="head">
            <h2>🔧 המוסך</h2>
            <div className="tk-chip tk-gold big">🪙 <b>{fmt(hud.gold)}</b></div>
            <Ring until={garage.until} conn={conn} total={G.current.cfg.garageMs / 1000} />
          </div>
          {buyToast && (
            <div className={"tk-buytoast r-" + buyToast.r} key={buyToast.id}>
              <span className="ic">{buyToast.ic}</span>
              <div className="tx"><b>{buyToast.t}{buyToast.r === "e" ? " — אבולוציה!" : buyToast.r === "r" ? " — אגדי!" : ""}</b>{buyToast.lines.map((l, i) => <small key={i}>{l}</small>)}</div>
            </div>
          )}
          {garage.pick ? (
            <div className="target">
              <p>{garage.pick.ic} <b>{garage.pick.t}</b> — על מי?</p>
              <div className="targets">{others().map((t) => <button key={t.pid} onClick={() => buyTarget(t.pid)} style={{ "--cc": chColor(t.pid) } as CSSProperties}><Face c={t.c} size={30} pose={t.alive ? "idle" : "dead"} /> <span>{pname(t.pid).slice(0, 9)}</span></button>)}</div>
              <button className="cancel" onClick={() => setGarage((gr) => gr ? { ...gr, pick: undefined } : gr)}>ביטול</button>
            </div>
          ) : (
            <div className={"cards" + (garage.cards.length > 6 ? " eight" : "")}>
              {garage.cards.map((c) => {
                const bought = garage.bought.includes(c.id); const poor = c.price > hud.gold;
                return (
                  <button key={c.id} className={"card" + (bought ? " bought" : poor ? " poor" : "")} style={{ "--rc": RAR_COL[c.r], "--cc": CAT_COL[c.cat] } as CSSProperties} onClick={() => tapCard(c)} disabled={bought || garage.done}>
                    <span className="cat">{TK_CAT_NAME[c.cat]}</span>
                    <span className="ic">{c.ic}</span><b>{c.t}</b><small>{c.d}</small>
                    <i>{bought ? "✓ נקנה" : `🪙 ${c.price}`}{c.kind === "ammo" && !bought ? ` · ×${c.n}` : ""}{c.r !== "c" && !bought ? ` · ${TK_RAR_NAME[c.r]}` : ""}</i>
                  </button>
                );
              })}
            </div>
          )}
          <div className="mine">
            {ammoList().slice(1).map((a) => <span key={a.id}>{a.ic}×{a.n}</span>)}
            {ownedList().map((o) => <span key={o.id} className="own">{o.ic}{o.n > 1 ? `×${o.n}` : ""}</span>)}
            {ammoList().length === 1 && ownedList().length === 0 && <span className="none">עוד אין לך שדרוגים — קנה משהו!</span>}
          </div>
          {buys.length > 0 && <div className="buys">{buys.slice(-3).map((b) => <span key={b.id} style={{ "--cc": chColor(b.pid) } as CSSProperties}>{b.pid === me ? "אתה" : pname(b.pid).slice(0, 7)}: {b.card.ic} {b.card.t}</span>)}</div>}
          <button className={"tk-ready" + (garage.done ? " on" : " go")} onClick={garageDone} disabled={garage.done}>{garage.done ? "✓ סיימתי — מחכים לכולם" : "✅ סיימתי לקנות"}</button>
        </div>
      )}

      {/* סיום קרב */}
      {phase === "battleover" && battleOver && (
        <div className="tk-bo">
          <h2>{battleOver.winner ? `🏆 ${battleOver.winner === me ? "ניצחת" : pname(battleOver.winner) + " ניצח"} את קרב ${battleOver.b + 1}!` : `🏁 קרב ${battleOver.b + 1} נגמר בתיקו`}</h2>
          <ol>{battleOver.rows.slice(0, 8).map((r, i) => <li key={r.pid} className={r.pid === me ? "me" : ""}><span>{i + 1}</span><span className="nm"><Face c={r.c} size={26} pose={i === 0 ? "win" : "idle"} /> {r.pid === me ? "אתה" : pname(r.pid)}</span><small>💀{r.kills} · 🎯{r.dmg}</small><b>{r.score}</b></li>)}</ol>
          <p className="sub">{battleOver.last ? "מסכמים…" : "הבילד שלכם עובר לקרב הבא — הר חדש בעוד רגע"}</p>
        </div>
      )}

      {/* סיום */}
      {phase === "over" && over && (
        <div className="tk-over">
          <h2>💥 סוף הקרבות</h2>
          <ol>{over.rows.map((r: TkRow, i: number) => <li key={r.pid} className={r.pid === me ? "me" : ""}>
            <span className="pos">{i + 1}</span><Face c={r.c} size={34} pose={i === 0 ? "win" : i === over.rows.length - 1 && over.rows.length > 1 ? "dead" : "idle"} />
            <span className="nm">{r.pid === me ? "אתה" : pname(r.pid)}<small>💀 {r.kills} · נזק {r.dmg} · 🪙 {r.gold}{r.wins ? ` · 🏆${r.wins}` : ""}</small></span>
            <b>{r.score}</b>
          </li>)}</ol>
          <div className="titles">{over.titles.map((t) => <span key={t.pid + t.ic}>{t.ic} {t.t}: <b>{t.pid === me ? "אתה" : pname(t.pid)}</b></span>)}</div>
          <div className="mycards">{ownedList().map((o) => <span key={o.id}>{o.ic} {o.t}{o.n > 1 ? ` ×${o.n}` : ""}</span>)}</div>
          <p className="sub">המארח ממשיך לטקס</p>
        </div>
      )}
      {phase === "wait" && <div className="tk-waitmsg">💥 ההר נבנה…</div>}
    </div>
  );
}

function PickTimer({ until, conn }: { until: number; conn: GameViewProps["conn"] }) {
  const [left, setLeft] = useState(0);
  useEffect(() => { const iv = setInterval(() => setLeft(Math.max(0, Math.ceil((until - conn.serverNow()) / 1000))), 200); return () => clearInterval(iv); }, [until]);
  return <p className="timer">{until ? `${left} שניות` : "כולם בחרו — מתחילים!"}</p>;
}
function Ring({ until, conn, total }: { until: number; conn: GameViewProps["conn"]; total: number }) {
  const [left, setLeft] = useState(total);
  useEffect(() => { const iv = setInterval(() => setLeft(Math.max(0, (until - conn.serverNow()) / 1000)), 100); return () => clearInterval(iv); }, [until]);
  const secs = Math.ceil(left);
  return <div className={"ring" + (secs <= 3 ? " hot" : secs <= 5 ? " warm" : "")} style={{ "--p": `${(left / total) * 360}deg` } as CSSProperties}><span>{secs}</span></div>;
}
