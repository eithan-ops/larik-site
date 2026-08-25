/**
 * "החומה" 🏰 — צד לקוח. רנדור canvas ב-60fps מעל סימולציה דטרמיניסטית:
 * אויבים נעים לפי הנוסחה ששודרה ב-spawn (זהה לשרת), אירועים (פגיעות/מצבים)
 * מגיעים כ-cue. לכל תפקיד פועל שליטה משלו:
 * ⚔️ חלוץ — גרירה=תנועה, החלקה מהירה=מכה לכיוון, כפתור מגן. 🏹 קשת — מתיחה
 * ושחרור (Angry Birds). 💣 תותחן — כיוון ושיגור עם קשת מסלול. 🔫 מקלען — החזקה
 * וגרירת כיוון עם מד חום. "עולם אחד, חלון אישי": מצלמה ממוקדת בעמדה שלך.
 */
import { useEffect, useRef, useState } from "react";
import type { WallServerMsg, WallRole, WallCard, WallStats, WallEnemyType } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";
import { wlImg, preloadWl, type WlImgKey } from "./wallAssets";

/* ---- קבועי עולם (זהים לשרת) ---- */
const W = 1000, WORLD_H = 1600, WALL_Y = 1250, STRIP_TOP = 950, GATE_X = 500;
const VIEW_W = 660; // רוחב החלון האישי ביחידות עולם

const ROLE_NAME: Record<WallRole, string> = { infantry: "חלוץ", archer: "קשת", cannon: "תותחן", mg: "מקלען" };
const ROLE_ICON: Record<WallRole, string> = { infantry: "⚔️", archer: "🏹", cannon: "💣", mg: "🔫" };
const ROLE_COLOR: Record<WallRole, string> = { infantry: "#ff5c5c", archer: "#34e89e", cannon: "#ffce3c", mg: "#5c8aff" };
const ROLE_DESC: Record<WallRole, string> = {
  infantry: "נלחם בשטח לפני החומה — גרור לזוז, החלק להכות, החזק את כפתור המגן לחסום",
  archer: "על החומה — משוך אחורה ושחרר כמו קשת אמיתית. פגיעת ראש = נזק כפול",
  cannon: "במגדל — כוון, שגר פגז שטח. כל פגז הוא החלטה",
  mg: "בעמדת המקלע — החזק לירי רציף וגרור לכוון. היזהר מהתחממות!",
};
const ETYPE_IMG: Record<WallEnemyType, WlImgKey> = {
  swarm: "eSwarm", runner: "eRunner", armored: "eArmored", bomber: "eBomber", sniper: "eSniper", digger: "eDigger", boss: "eBoss",
};
const ETYPE_SIZE: Record<WallEnemyType, number> = { swarm: 52, runner: 60, armored: 84, bomber: 64, sniper: 68, digger: 62, boss: 150 };

interface EnemyV {
  id: number; type: WallEnemyType;
  hp: number; maxHp: number;
  x0: number; y0: number; speed: number; wob: number; at: number;
  state: "walk" | "fight" | "wall" | "burrow";
  deadAt?: number;
}
interface Proj { kind: "arrow" | "shell"; fx: number; fy: number; tx: number; ty: number; t0: number; T: number; fire?: boolean; by: string }
interface Fx { kind: "boom" | "slash" | "spark" | "levelup"; x: number; y: number; t0: number; r?: number; dir?: number; color?: string }
interface HeroV { role: WallRole; slot: [number, number]; x: number; y: number; hp: number; max: number; down: boolean; tier: number }

export default function WallView({ room, me, conn, hub }: GameViewProps) {
  const [phase, setPhase] = useState<"setup" | "wave" | "breath" | "over">("setup");
  const [wave, setWave] = useState(0);
  const [roles, setRoles] = useState<Record<string, WallRole>>({});
  const [wallHp, setWallHp] = useState(1);
  const [wallMax, setWallMax] = useState(1);
  const [myHp, setMyHp] = useState(150);
  const [myMax, setMyMax] = useState(150);
  const [down, setDown] = useState(false);
  const [xp, setXp] = useState({ xp: 0, level: 1, next: 10 });
  const [draft, setDraft] = useState<{ level: number; cards: WallCard[] } | null>(null);
  const [banner, setBanner] = useState("");
  const [toast, setToast] = useState("");
  const [jamUntil, setJamUntil] = useState(0);
  const [over, setOver] = useState<{ wave: number; bestWave: number; nearMiss?: string; mvp?: string; stats: Record<string, WallStats> } | null>(null);
  const [, setUi] = useState(0); // רענון קל ל-HUD

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const enemies = useRef(new Map<number, EnemyV>());
  const heroes = useRef(new Map<string, HeroV>());
  const projs = useRef<Proj[]>([]);
  const fxs = useRef<Fx[]>([]);
  const streams = useRef(new Map<string, number>()); // מקלען → aimX
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const rolesRef = useRef(roles); rolesRef.current = roles;
  const camX = useRef(500);
  const shake = useRef(0);
  // קלט
  const ptr = useRef<{ down: boolean; x0: number; y0: number; t0: number; x: number; y: number; moved: boolean }>({ down: false, x0: 0, y0: 0, t0: 0, x: 0, y: 0, moved: false });
  const aimRef = useRef<{ tx: number; ty: number; power: number } | null>(null); // קשת/תותחן
  const heat = useRef(0);
  const firing = useRef(false);
  const shielding = useRef(false);
  const lastPosSend = useRef(0);
  const lastAimSend = useRef(0);
  const cannonReady = useRef(0);

  const myRole = (): WallRole => rolesRef.current[me] ?? "infantry";
  const myHero = () => heroes.current.get(me);
  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? "";
  const isHost = room.hostId === me;

  function showToast(m: string) { setToast(m); window.setTimeout(() => setToast(""), 2200); }
  function showBanner(m: string, ms = 2200) { setBanner(m); window.setTimeout(() => setBanner(""), ms); }

  const posOf = (e: EnemyV, t: number): [number, number] => {
    if (e.state === "fight" || e.state === "wall") return [e.x0, e.y0];
    const dt = t - e.at;
    return [e.x0 + e.wob * Math.sin(dt / 700), e.y0 + (e.speed * dt) / 1000];
  };

  /* ---- אירועי שרת ---- */
  useEffect(() => {
    preloadWl();
    return hub.subscribe((d) => {
      const m = d as WallServerMsg;
      switch (m.a) {
        case "wl_setup": {
          setPhase("setup"); setOver(null); setDraft(null);
          setRoles(m.roles);
          heroes.current.clear();
          for (const [pid, role] of Object.entries(m.roles)) {
            const slot = m.slots[pid] ?? [500, 1100];
            heroes.current.set(pid, { role, slot, x: slot[0], y: slot[1], hp: 150, max: 150, down: false, tier: 1 });
          }
          enemies.current.clear(); projs.current = []; fxs.current = [];
          return;
        }
        case "wl_wave":
          setPhase("wave"); setWave(m.wave); setWallHp(m.wallHp); setWallMax(m.wallMax);
          heat.current = 0; firing.current = false;
          showBanner(`🌊 גל ${m.wave}`);
          Sfx.goBeep(); vibrate([60, 40, 60]);
          return;
        case "wl_spawn":
          enemies.current.set(m.id, { id: m.id, type: m.type, hp: m.hp, maxHp: m.maxHp, x0: m.x0, y0: m.y0, speed: m.speed, wob: m.wob, at: m.at, state: "walk" });
          if (m.type === "boss") { showBanner("👹 הבוס מגיע!!!", 2600); Sfx.alarm(); vibrate([150, 80, 150]); }
          return;
        case "wl_estate": {
          const e = enemies.current.get(m.id);
          if (!e) return;
          e.x0 = m.x; e.y0 = m.y; e.at = m.at; e.state = m.state;
          if (m.speed !== undefined) e.speed = m.speed;
          return;
        }
        case "wl_hit": {
          const e = enemies.current.get(m.id);
          if (!e) return;
          e.hp = m.hp;
          const [ex, ey] = posOf(e, conn.serverNow());
          if (m.hp <= 0) {
            e.deadAt = conn.serverNow();
            fxs.current.push({ kind: "spark", x: ex, y: ey, t0: performance.now(), color: m.by === me ? "#ffce3c" : "#fff" });
            if (m.by === me) { Sfx.pop(); vibrate(20); }
            window.setTimeout(() => enemies.current.delete(m.id), 400);
          } else if (m.crit && m.by === me) {
            fxs.current.push({ kind: "spark", x: ex, y: ey, t0: performance.now(), color: "#ff5c5c" });
          }
          return;
        }
        case "wl_arrow":
          if (m.by !== me) projs.current.push({ kind: "arrow", fx: m.fx, fy: m.fy, tx: m.tx, ty: m.ty, t0: performance.now(), T: m.T, fire: m.fire, by: m.by });
          return;
        case "wl_shell":
          projs.current.push({ kind: "shell", fx: m.fx, fy: m.fy, tx: m.tx, ty: m.ty, t0: performance.now(), T: m.T, by: m.by });
          if (m.by === me) { Sfx.boom(); vibrate(60); }
          return;
        case "wl_boomfx":
          fxs.current.push({ kind: "boom", x: m.x, y: m.y, t0: performance.now(), r: m.r });
          shake.current = Math.max(shake.current, 12);
          Sfx.boom(); vibrate(80);
          return;
        case "wl_stream":
          if (m.on) streams.current.set(m.by, m.x); else streams.current.delete(m.by);
          return;
        case "wl_jam":
          if (m.by === me) { setJamUntil(Date.now() + m.ms); firing.current = false; Sfx.sadTrombone(); vibrate(300); showToast("🥵 התחממות יתר!"); }
          return;
        case "wl_ppos":
          for (const [pid, x, y] of m.ps) {
            const h = heroes.current.get(pid);
            if (h && pid !== me) { h.x = x; h.y = y; }
          }
          return;
        case "wl_hero": {
          const h = heroes.current.get(m.pid);
          if (h) { h.hp = m.hp; h.max = m.max; h.down = !!m.down; }
          if (m.pid === me) {
            setMyHp(m.hp); setMyMax(m.max); setDown(!!m.down);
            if (m.down) { Sfx.sadTrombone(); vibrate(400); showToast("💀 נפלת! חוזר עוד 3 שניות..."); }
          } else if (m.down) showToast(`💀 ${nameOf(m.pid)} נפל!`);
          return;
        }
        case "wl_wall": {
          const prev = wallHp;
          setWallHp(m.hp); setWallMax(m.max);
          if (m.hp < prev) { shake.current = Math.max(shake.current, 6); if (m.hp / m.max < 0.25) { Sfx.alarm(); } }
          return;
        }
        case "wl_sniper": {
          const e = enemies.current.get(m.id);
          showToast(m.target === me ? "🎯 צלף נעל עליך!! (הקשתים — תצילו!)" : `🎯 צלף נעל על ${nameOf(m.target)}!`);
          Sfx.alarm(); vibrate([80, 50, 80]);
          void e;
          return;
        }
        case "wl_levelup":
          setDraft({ level: m.level, cards: m.cards });
          fxs.current.push({ kind: "levelup", x: myHero()?.x ?? 500, y: myHero()?.y ?? 1100, t0: performance.now() });
          Sfx.fanfare(); vibrate([40, 30, 80]);
          return;
        case "wl_picked":
          if (m.pid !== me) showToast(`${m.emoji} ${nameOf(m.pid)} לקח ${m.name}`);
          return;
        case "wl_tier": {
          const h = heroes.current.get(m.pid);
          if (h) h.tier = m.tier;
          showBanner(m.pid === me ? `⬆️ הנשק שלך שודרג לדרגה ${m.tier}!` : `⬆️ ${nameOf(m.pid)} שידרג נשק!`, 1800);
          Sfx.fanfare();
          return;
        }
        case "wl_xp":
          setXp({ xp: m.xp, level: m.level, next: m.next });
          return;
        case "wl_clear":
          setPhase("breath"); setWallHp(m.wallHp);
          showBanner(`🌊 גל ${m.wave} הושרד! ✨`, 2600);
          Sfx.fanfare(); vibrate([40, 30, 40, 30, 100]);
          return;
        case "wl_over":
          setPhase("over"); setOver(m); setDraft(null);
          shake.current = 20;
          Sfx.boom();
          window.setTimeout(() => Sfx.sadTrombone(), 700);
          vibrate(600);
          return;
        case "wl_state": {
          setPhase(m.phase === "over" ? "over" : m.phase);
          setWave(m.wave); setRoles(m.roles); setWallHp(m.wallHp); setWallMax(m.wallMax);
          for (const [pid, role] of Object.entries(m.roles)) {
            if (!heroes.current.has(pid)) {
              const slot = m.slots[pid] ?? [500, 1100];
              heroes.current.set(pid, { role, slot, x: slot[0], y: slot[1], hp: 100, max: 100, down: false, tier: m.tiers[pid] ?? 1 });
            }
          }
          return;
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, me]);

  /* ---- לולאת רנדור ---- */
  useEffect(() => {
    let raf = 0;
    const step = () => {
      draw();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    // מראה מקומית של החום (השרת אוכף; זה רק ל-HUD)
    if (myRole() === "mg") {
      heat.current = firing.current ? Math.min(100, heat.current + 0.29) : Math.max(0, heat.current - 0.37);
    }
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = cv.clientWidth, chh = cv.clientHeight;
    if (cv.width !== cw * dpr) { cv.width = cw * dpr; cv.height = chh * dpr; }
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const now = conn.serverNow();
    const pnow = performance.now();

    // מצלמה: עוקבת אחרי הגיבור/הכיוון שלי
    const h = myHero();
    let targetCam = h ? h.x : 500;
    if (myRole() === "mg" && firing.current && aimRef.current) targetCam = (aimRef.current.tx + (h?.x ?? 500)) / 2;
    if (aimRef.current && (myRole() === "archer" || myRole() === "cannon")) targetCam = (aimRef.current.tx + (h?.slot[0] ?? 500)) / 2;
    camX.current += (targetCam - camX.current) * 0.08;
    const scale = cw / VIEW_W;
    const viewH = chh / scale;
    const camTop = Math.max(0, Math.min(WORLD_H - viewH, WALL_Y + 170 - viewH));
    let ox = 0, oy = 0;
    if (shake.current > 0.5) {
      ox = (Math.random() - 0.5) * shake.current;
      oy = (Math.random() - 0.5) * shake.current;
      shake.current *= 0.88;
    }
    const camL = Math.max(0, Math.min(W - VIEW_W, camX.current - VIEW_W / 2));
    const wx = (x: number) => (x - camL) * scale + ox;
    const wy = (y: number) => (y - camTop) * scale + oy;

    // רקע
    ctx.fillStyle = "#0a0d14";
    ctx.fillRect(0, 0, cw, chh);
    const bg = wlImg("bgfield");
    if (bg.complete && bg.naturalWidth) {
      ctx.globalAlpha = 0.55;
      ctx.drawImage(bg, wx(0), wy(-80), W * scale, (WALL_Y + 80) * scale);
      ctx.globalAlpha = 1;
    }
    // רצועת החלוץ — הבהוב עדין
    ctx.fillStyle = "rgba(255,92,92,0.04)";
    ctx.fillRect(wx(0), wy(STRIP_TOP), W * scale, (WALL_Y - STRIP_TOP) * scale);

    // חומה
    const wt = wlImg("walltex");
    const wallHFrac = wallHp / Math.max(1, wallMax);
    if (wt.complete && wt.naturalWidth) {
      for (let x = 0; x < W; x += 250) ctx.drawImage(wt, wx(x), wy(WALL_Y), 250 * scale, 130 * scale);
    } else {
      ctx.fillStyle = "#3a3f4a";
      ctx.fillRect(wx(0), wy(WALL_Y), W * scale, 130 * scale);
    }
    // סדקים לפי מצב החומה
    if (wallHFrac < 0.6) {
      const ck = wlImg("crack");
      if (ck.complete && ck.naturalWidth) {
        ctx.globalAlpha = Math.min(0.9, (0.6 - wallHFrac) * 2);
        ctx.globalCompositeOperation = "screen";
        for (const cx of [180, 500, 820]) ctx.drawImage(ck, wx(cx - 90), wy(WALL_Y - 10), 180 * scale, 140 * scale);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
    }
    const gt = wlImg("gate");
    if (gt.complete && gt.naturalWidth) ctx.drawImage(gt, wx(GATE_X - 70), wy(WALL_Y - 30), 140 * scale, 160 * scale);

    // אויבים
    for (const e of enemies.current.values()) {
      const [ex, ey] = posOf(e, now);
      if (ey < camTop - 100) { // מעל החלון — חץ התרעה קטן למעלה
        continue;
      }
      const size = ETYPE_SIZE[e.type];
      const im = wlImg(ETYPE_IMG[e.type]);
      const dying = e.deadAt !== undefined;
      const alpha = dying ? Math.max(0, 1 - (now - e.deadAt!) / 350) : e.state === "burrow" ? 0.25 : 1;
      ctx.globalAlpha = alpha;
      if (im.complete && im.naturalWidth) {
        const bob = e.state === "walk" ? Math.sin((now - e.at) / 120) * 2 : 0;
        ctx.drawImage(im, wx(ex - size / 2), wy(ey - size / 2 + bob), size * scale, size * scale);
      } else {
        ctx.fillStyle = "#7a4aa0";
        ctx.beginPath(); ctx.arc(wx(ex), wy(ey), (size / 2) * scale, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!dying && e.hp < e.maxHp) {
        const bw = size * scale * 0.8;
        ctx.fillStyle = "rgba(0,0,0,.5)";
        ctx.fillRect(wx(ex) - bw / 2, wy(ey - size / 2 - 10), bw, 4);
        ctx.fillStyle = e.type === "armored" ? "#ff8a3c" : "#39e75f";
        ctx.fillRect(wx(ex) - bw / 2, wy(ey - size / 2 - 10), bw * (e.hp / e.maxHp), 4);
      }
    }

    // גיבורים
    for (const [pid, hh] of heroes.current.entries()) {
      const mine = pid === me;
      const role = hh.role;
      let im: HTMLImageElement;
      if (role === "cannon") im = wlImg(hh.tier >= 3 ? "cannon3" : hh.tier === 2 ? "cannon2" : "cannon1");
      else if (role === "mg") im = wlImg(hh.tier >= 2 ? "mg2" : "mg1");
      else if (role === "archer") im = wlImg("heroArcher");
      else im = wlImg("heroInfantry");
      const size = role === "cannon" ? 95 + hh.tier * 12 : role === "mg" ? 85 + hh.tier * 8 : 72;
      ctx.globalAlpha = hh.down ? 0.35 : 1;
      // הילה בצבע התפקיד
      ctx.beginPath();
      ctx.fillStyle = mine ? ROLE_COLOR[role] + "55" : ROLE_COLOR[role] + "22";
      ctx.arc(wx(hh.x), wy(hh.y + size * 0.3), size * 0.45 * scale, 0, 7);
      ctx.fill();
      if (im.complete && im.naturalWidth) {
        ctx.drawImage(im, wx(hh.x - size / 2), wy(hh.y - size / 2), size * scale, size * scale);
      } else {
        ctx.font = `${28 * scale}px sans-serif`; ctx.textAlign = "center";
        ctx.fillText(ROLE_ICON[role], wx(hh.x), wy(hh.y));
      }
      ctx.globalAlpha = 1;
      // מגן פעיל
      if (mine && shielding.current) {
        ctx.strokeStyle = "#ffffffcc"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(wx(hh.x), wy(hh.y), size * 0.55 * scale, 0, 7); ctx.stroke();
      }
      if (!mine) {
        ctx.font = `${11 * scale}px Rubik, sans-serif`;
        ctx.fillStyle = ROLE_COLOR[role];
        ctx.textAlign = "center";
        ctx.fillText(nameOf(pid), wx(hh.x), wy(hh.y - 45));
      }
    }

    // זרמי מקלע
    for (const [pid, ax] of streams.current.entries()) {
      const hh = heroes.current.get(pid);
      if (!hh) continue;
      const grad = ctx.createLinearGradient(wx(hh.x), wy(hh.y), wx(ax), wy(80));
      grad.addColorStop(0, "#9cc8ffee"); grad.addColorStop(1, "#5c8aff11");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3.5 + Math.random() * 2;
      ctx.beginPath(); ctx.moveTo(wx(hh.x), wy(hh.y - 20)); ctx.lineTo(wx(ax + (Math.random() - 0.5) * 30), wy(60)); ctx.stroke();
    }

    // פרויקטילים
    projs.current = projs.current.filter((p) => pnow - p.t0 < p.T + 100);
    for (const p of projs.current) {
      const f = Math.min(1, (pnow - p.t0) / p.T);
      const px = p.fx + (p.tx - p.fx) * f;
      const arc = p.kind === "shell" ? 260 : 150;
      const py = p.fy + (p.ty - p.fy) * f - Math.sin(f * Math.PI) * arc;
      if (p.kind === "arrow") {
        const im = wlImg(p.fire ? "arrowFire" : "arrow");
        const ang = Math.atan2(p.ty - p.fy, p.tx - p.fx) - Math.PI / 2 + (f - 0.5) * 0.6;
        ctx.save();
        ctx.translate(wx(px), wy(py));
        ctx.rotate(ang);
        ctx.globalCompositeOperation = "screen";
        if (im.complete && im.naturalWidth) ctx.drawImage(im, -14 * scale, -22 * scale, 28 * scale, 44 * scale);
        ctx.globalCompositeOperation = "source-over";
        ctx.restore();
      } else {
        ctx.fillStyle = "#2c2c34";
        ctx.beginPath(); ctx.arc(wx(px), wy(py), 9 * scale, 0, 7); ctx.fill();
        ctx.fillStyle = "#ff9a2f88";
        ctx.beginPath(); ctx.arc(wx(px), wy(py), 4 * scale, 0, 7); ctx.fill();
      }
    }

    // אפקטים
    fxs.current = fxs.current.filter((f) => pnow - f.t0 < 600);
    for (const f of fxs.current) {
      const ft = (pnow - f.t0) / 600;
      if (f.kind === "boom") {
        const im = wlImg("boom");
        const r = (f.r ?? 120) * (0.6 + ft * 0.9);
        ctx.globalAlpha = 1 - ft;
        ctx.globalCompositeOperation = "screen";
        if (im.complete && im.naturalWidth) ctx.drawImage(im, wx(f.x - r), wy(f.y - r), r * 2 * scale, r * 2 * scale);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      } else if (f.kind === "slash") {
        ctx.strokeStyle = `rgba(255,255,255,${1 - ft})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(wx(f.x), wy(f.y), 60 * scale * (0.5 + ft), (f.dir ?? 0) - 0.9, (f.dir ?? 0) + 0.9);
        ctx.stroke();
      } else if (f.kind === "spark") {
        ctx.fillStyle = f.color ?? "#fff";
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const rr = ft * 34;
          ctx.globalAlpha = 1 - ft;
          ctx.fillRect(wx(f.x + Math.cos(a) * rr), wy(f.y + Math.sin(a) * rr), 3, 3);
        }
        ctx.globalAlpha = 1;
      } else if (f.kind === "levelup") {
        ctx.strokeStyle = `rgba(255,206,60,${1 - ft})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(wx(f.x), wy(f.y), 30 + ft * 120, 0, 7); ctx.stroke();
      }
    }

    // כיוון (קשת/תותחן)
    const aim = aimRef.current;
    if (aim && !down) {
      const role = myRole();
      if (role === "archer" || role === "cannon") {
        const from = h?.slot ?? [500, WALL_Y + 60];
        ctx.setLineDash([6, 8]);
        ctx.strokeStyle = role === "archer" ? "#34e89ecc" : "#ffce3ccc";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(wx(from[0]), wy(from[1]));
        // קשת מסלול
        for (let i = 1; i <= 12; i++) {
          const f = i / 12;
          const px = from[0] + (aim.tx - from[0]) * f;
          const py = from[1] + (aim.ty - from[1]) * f - Math.sin(f * Math.PI) * (role === "cannon" ? 260 : 150);
          ctx.lineTo(wx(px), wy(py));
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.strokeStyle = role === "archer" ? "#34e89e" : "#ffce3c";
        ctx.arc(wx(aim.tx), wy(aim.ty), (role === "cannon" ? 60 : 26) * scale, 0, 7);
        ctx.stroke();
      }
    }

    // מיני-מפה: פס עליון של כל החזית
    const mmH = 34;
    ctx.fillStyle = "rgba(5,7,12,.82)";
    ctx.fillRect(0, 0, cw, mmH);
    ctx.fillStyle = "#39e75f";
    for (const e of enemies.current.values()) {
      if (e.deadAt) continue;
      const [ex, ey] = posOf(e, now);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = e.type === "boss" ? "#ff5c5c" : e.type === "armored" ? "#ff8a3c" : "#39e75f";
      ctx.fillRect((ex / W) * cw - 1.5, 4 + (ey / WALL_Y) * (mmH - 10), e.type === "boss" ? 6 : 3, e.type === "boss" ? 6 : 3);
    }
    ctx.globalAlpha = 1;
    for (const [pid, hh] of heroes.current.entries()) {
      ctx.fillStyle = ROLE_COLOR[hh.role];
      const y = mmH - 5;
      ctx.fillRect((hh.x / W) * cw - 2, y, pid === me ? 6 : 4, 4);
    }
    // חלון המצלמה שלי
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.strokeRect((camL / W) * cw, 1, (VIEW_W / W) * cw, mmH - 2);
  }

  /* ---- קלט ---- */
  function toWorld(e: React.PointerEvent): [number, number] {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    const scale = r.width / VIEW_W;
    const viewH = r.height / scale;
    const camTop = Math.max(0, Math.min(WORLD_H - viewH, WALL_Y + 170 - viewH));
    const camL = Math.max(0, Math.min(W - VIEW_W, camX.current - VIEW_W / 2));
    return [camL + (e.clientX - r.left) / scale, camTop + (e.clientY - r.top) / scale];
  }

  function onDown(e: React.PointerEvent) {
    if (phaseRef.current !== "wave" || down) return;
    const [wx0, wy0] = toWorld(e);
    ptr.current = { down: true, x0: e.clientX, y0: e.clientY, t0: performance.now(), x: e.clientX, y: e.clientY, moved: false };
    const role = myRole();
    if (role === "mg") {
      if (Date.now() < jamUntil) return;
      firing.current = true;
      aimRef.current = { tx: wx0, ty: 100, power: 1 };
      conn.sendGame({ a: "wl_fire", on: true });
      conn.sendGame({ a: "wl_aim", x: wx0 });
    } else if (role === "archer" || role === "cannon") {
      aimRef.current = { tx: wx0, ty: Math.min(wy0, WALL_Y - 60), power: 0.7 };
    }
    void wy0;
  }

  function onMove(e: React.PointerEvent) {
    if (!ptr.current.down) return;
    const p = ptr.current;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 14) p.moved = true;
    const role = myRole();
    const [wxp, wyp] = toWorld(e);
    if (role === "infantry" && !shielding.current) {
      const h = myHero();
      if (h && !h.down) {
        h.x = Math.max(30, Math.min(W - 30, wxp));
        h.y = Math.max(STRIP_TOP, Math.min(WALL_Y - 15, wyp));
        const tn = performance.now();
        if (tn - lastPosSend.current > 140) {
          lastPosSend.current = tn;
          conn.sendGame({ a: "wl_pos", x: Math.round(h.x), y: Math.round(h.y) });
        }
      }
    } else if (role === "mg" && firing.current) {
      aimRef.current = { tx: wxp, ty: 100, power: 1 };
      const tn = performance.now();
      if (tn - lastAimSend.current > 160) {
        lastAimSend.current = tn;
        conn.sendGame({ a: "wl_aim", x: Math.round(wxp) });
      }
    } else if (role === "archer" || role === "cannon") {
      // קשת: מתיחה — ככל שמושכים למטה, יורים רחוק יותר (Angry Birds הפוך פשוט: היעד = מיקום האצבע)
      aimRef.current = { tx: wxp, ty: Math.max(60, Math.min(wyp, WALL_Y - 60)), power: Math.min(1, Math.max(0.35, (WALL_Y - wyp) / WALL_Y + 0.3)) };
    }
  }

  function onUp() {
    const p = ptr.current;
    if (!p.down) return;
    p.down = false;
    const role = myRole();
    const dur = performance.now() - p.t0;
    if (role === "mg") {
      firing.current = false;
      conn.sendGame({ a: "wl_fire", on: false });
      aimRef.current = null;
    } else if (role === "archer") {
      if (aimRef.current) {
        conn.sendGame({ a: "wl_shot", tx: Math.round(aimRef.current.tx), ty: Math.round(aimRef.current.ty), power: aimRef.current.power });
        const h = myHero();
        projs.current.push({ kind: "arrow", fx: h?.slot[0] ?? 500, fy: h?.slot[1] ?? WALL_Y + 60, tx: aimRef.current.tx, ty: aimRef.current.ty, t0: performance.now(), T: 280 + Math.hypot(aimRef.current.tx - (h?.slot[0] ?? 500), aimRef.current.ty - (h?.slot[1] ?? 0)) * 0.35, fire: (h?.tier ?? 1) >= 2, by: me });
        Sfx.tick(); vibrate(25);
      }
      aimRef.current = null;
    } else if (role === "cannon") {
      if (aimRef.current && Date.now() >= cannonReady.current) {
        conn.sendGame({ a: "wl_boom", tx: Math.round(aimRef.current.tx), ty: Math.round(aimRef.current.ty) });
        cannonReady.current = Date.now() + 3600;
        setUi((u) => u + 1);
      }
      aimRef.current = null;
    } else if (role === "infantry") {
      // החלקה מהירה = מכה
      const dx = p.x - p.x0, dy = p.y - p.y0;
      const dist = Math.hypot(dx, dy);
      if (dur < 320 && dist > 24) {
        const dir = Math.atan2(dy, dx);
        conn.sendGame({ a: "wl_swing", dir });
        const h = myHero();
        if (h) fxs.current.push({ kind: "slash", x: h.x, y: h.y, t0: performance.now(), dir });
        Sfx.tick(); vibrate(30);
      }
    }
  }

  /* ---- מסכי-על ---- */
  const roleCounts: Record<WallRole, number> = { infantry: 0, archer: 0, cannon: 0, mg: 0 };
  for (const r of Object.values(roles)) roleCounts[r]++;

  if (phase === "setup") {
    return (
      <main className="wl-arena">
        <div className="wl-setup">
          <h2 style={{ margin: "6px 0" }}>🏰 החומה — בחרו תפקיד</h2>
          <p className="sub" style={{ fontSize: 12.5 }}>הגלים מתחזקים — הצוות צריך את כל התפקידים. אפשר כפילויות!</p>
          <div className="wl-rolegrid">
            {(["infantry", "archer", "cannon", "mg"] as WallRole[]).map((r) => (
              <button key={r}
                className={"wl-rolecard" + (roles[me] === r ? " sel" : "")}
                style={{ "--rc": ROLE_COLOR[r] } as React.CSSProperties}
                onClick={() => { conn.sendGame({ a: "wl_role", role: r }); Sfx.pop(); vibrate(25); }}>
                <img src={`/wall/badge-${r === "infantry" ? "infantry" : r === "archer" ? "archer" : r === "cannon" ? "cannon" : "mg"}.webp`} alt=""
                  onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; }} />
                <b>{ROLE_ICON[r]} {ROLE_NAME[r]}</b>
                <span className="sub" style={{ fontSize: 11.5 }}>{ROLE_DESC[r]}</span>
                <span className="wl-count">{roleCounts[r] > 0 ? `×${roleCounts[r]}` : " "}</span>
              </button>
            ))}
          </div>
          <div className="wl-team">
            {room.players.filter((p) => p.connected).map((p) => (
              <span key={p.id} className="chip" style={{ borderColor: ROLE_COLOR[roles[p.id] ?? "infantry"] }}>
                {p.emoji} {p.name} {ROLE_ICON[roles[p.id] ?? "infantry"]}
              </span>
            ))}
          </div>
          {isHost ? (
            <button className="btn" style={{ marginTop: 14 }} onClick={() => conn.sendGame({ a: "wl_go" })}>
              ⚔️ אל החומות!
            </button>
          ) : (
            <p className="sub pulse" style={{ marginTop: 14 }}>המארח פותח את הקרב...</p>
          )}
        </div>
      </main>
    );
  }

  const role = myRole();
  const cdLeft = Math.max(0, cannonReady.current - Date.now());
  const jamLeft = Math.max(0, jamUntil - Date.now());

  return (
    <main className="wl-arena">
      <canvas ref={canvasRef} className="wl-canvas"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />

      {/* HUD עליון */}
      <div className="wl-hud">
        <span className="chip" style={{ fontWeight: 900 }}>🌊 {wave}</span>
        <div className="wl-wallbar">
          <div style={{ width: `${(wallHp / Math.max(1, wallMax)) * 100}%`, background: wallHp / wallMax > 0.5 ? "#39e75f" : wallHp / wallMax > 0.22 ? "#ffce3c" : "#ff4d4d" }} />
          <span>🏰 {Math.round(wallHp)}</span>
        </div>
        <span className="chip" style={{ color: ROLE_COLOR[role] }}>{ROLE_ICON[role]} {xp.level}</span>
      </div>
      {/* מד XP */}
      <div className="wl-xpbar"><div style={{ width: `${Math.min(100, (xp.xp / xp.next) * 100)}%` }} /></div>

      {/* HUD תפקיד */}
      <div className="wl-rolehud">
        {role === "mg" && (
          <div className="wl-heatwrap">
            {jamLeft > 0 ? <b style={{ color: "#ff5c5c" }}>🥵 {Math.ceil(jamLeft / 1000)}</b> : <span className="sub" style={{ fontSize: 10 }}>חום</span>}
            <div className="wl-heat"><div style={{ height: `${Math.min(100, heat.current)}%` }} /></div>
          </div>
        )}
        {role === "cannon" && (
          <div className="wl-cd" style={{ opacity: cdLeft > 0 ? 1 : 0.4 }}>
            {cdLeft > 0 ? `⏳ ${(cdLeft / 1000).toFixed(1)}` : "💣 מוכן!"}
          </div>
        )}
        {role === "infantry" && (
          <button className={"wl-shieldbtn" + (shielding.current ? " on" : "")}
            onPointerDown={(e) => { e.stopPropagation(); shielding.current = true; conn.sendGame({ a: "wl_shield", on: true }); setUi((u) => u + 1); }}
            onPointerUp={() => { shielding.current = false; conn.sendGame({ a: "wl_shield", on: false }); setUi((u) => u + 1); }}
            onPointerLeave={() => { if (shielding.current) { shielding.current = false; conn.sendGame({ a: "wl_shield", on: false }); setUi((u) => u + 1); } }}>
            🛡️
          </button>
        )}
        <div className="wl-hp"><div style={{ width: `${(myHp / Math.max(1, myMax)) * 100}%` }} /></div>
      </div>

      {banner && <div className="wl-banner popin">{banner}</div>}
      {toast && <div className="toast" style={{ zIndex: 70 }}>{toast}</div>}
      {down && <div className="wl-downveil"><b>💀 נפלת!</b><span className="sub">חוזר בעוד רגע...</span></div>}

      {/* דראפט — צף, המשחק ממשיך ברקע! */}
      {draft && (
        <div className="wl-draft popin">
          <b>⬆️ רמה {draft.level}! בחר שדרוג:</b>
          <div className="wl-draftrow">
            {draft.cards.map((c) => (
              <button key={c.id} className="wl-card" onClick={() => { conn.sendGame({ a: "wl_pick", cardId: c.id }); setDraft(null); Sfx.goBeep(); vibrate(30); }}>
                <span style={{ fontSize: 26 }}>{c.emoji}</span>
                <b style={{ fontSize: 12 }}>{c.name}</b>
                <span className="sub" style={{ fontSize: 10 }}>{c.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* סוף ריצה */}
      {phase === "over" && over && (
        <div className="wl-overlay">
          <div style={{ fontSize: 15, opacity: 0.85 }}>🏰 החומה נפלה בגל</div>
          <div className="wl-bigwave">{over.wave}</div>
          {over.nearMiss && <div className="wl-nearmiss popin">{over.nearMiss}</div>}
          {over.bestWave > over.wave && <p className="sub">🏆 שיא הערב: גל {over.bestWave}</p>}
          <div className="wl-stats">
            {Object.entries(over.stats).map(([pid, s]) => (
              <div key={pid} className="wl-statrow">
                <span>{ROLE_ICON[roles[pid] ?? "infantry"]} {nameOf(pid)} {over.mvp === pid && "👑"}</span>
                <span className="sub" style={{ fontSize: 12 }}>⚔️{s.kills} · 💥{Math.round(s.dmg)} · 🛟{s.saves} · 💀{s.deaths}</span>
              </div>
            ))}
          </div>
          {isHost ? (
            <>
              <button className="btn wl-again" onClick={() => { conn.sendGame({ a: "wl_again" }); Sfx.goBeep(); }}>
                🔁 עוד פעם! (הפעם נחזיק)
              </button>
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => conn.sendGame({ a: "wl_finish" })}>
                🏁 סיימנו — לטקס
              </button>
            </>
          ) : (
            <p className="sub pulse" style={{ marginTop: 14 }}>המארח מחליט: עוד קרב או טקס... 👀</p>
          )}
        </div>
      )}
    </main>
  );
}
