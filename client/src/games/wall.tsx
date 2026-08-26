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
const W = 1000, WORLD_H = 1600, WALL_Y = 1250, GATE_X = 500;
const VIEW_W = 660; // רוחב החלון האישי ביחידות עולם

const ROLE_NAME: Record<WallRole, string> = { infantry: "חלוץ", archer: "קשת", cannon: "תותחן", mg: "מקלען" };
const ROLE_ICON: Record<WallRole, string> = { infantry: "⚔️", archer: "🏹", cannon: "💣", mg: "🔫" };
const ROLE_COLOR: Record<WallRole, string> = { infantry: "#ff5c5c", archer: "#34e89e", cannon: "#ffce3c", mg: "#5c8aff" };
const ROLE_DESC: Record<WallRole, string> = {
  infantry: "גרור לזוז בכל השדה — הוא מכה לבד כשאויב קרוב! החזק 🛡️ לחסום",
  archer: "גע והחזק על המטרה — הקשת יורה לבד. הזז את האצבע לכוון",
  cannon: "כוון ושחרר — פגז שטח. כל פגז הוא החלטה",
  mg: "החזק וגרור לרסס כדורים על כל השדה. היזהר מהתחממות!",
};
const ROLE_HINT: Record<WallRole, string> = {
  infantry: "🕹️ גרור בכל מקום כדי לזוז — הלוחם מכה לבד כשאויב קרוב · 🛡️ החזק את הכפתור לחסום",
  archer: "👆 גע והחזק על אויב — הקשת יורה לבד · הזז את האצבע כדי לכוון",
  cannon: "🎯 גרור לכוון, שחרר — בום! כל פגז הוא החלטה",
  mg: "👆 החזק וגרור ימינה-שמאלה — מרסס על כל השדה · שים עין על מד החום",
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
interface Fx { kind: "boom" | "slash" | "spark" | "levelup" | "dmg"; x: number; y: number; t0: number; r?: number; dir?: number; color?: string; txt?: string; big?: boolean }
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
  const [hint, setHint] = useState("");
  const [, setUi] = useState(0); // רענון קל ל-HUD

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const enemies = useRef(new Map<number, EnemyV>());
  const heroes = useRef(new Map<string, HeroV>());
  const projs = useRef<Proj[]>([]);
  const fxs = useRef<Fx[]>([]);
  const streams = useRef(new Map<string, number>()); // מקלען → aimX
  const phaseRef = useRef(phase); phaseRef.current = phase;
  // downRef מוגדר למטה עם שאר ה-refs — משוקף כאן אחרי ההגדרה
  const rolesRef = useRef(roles); rolesRef.current = roles;
  const camX = useRef(500);
  const camTopRef = useRef(320);
  const lunges = useRef(new Map<string, { t0: number; dir: number }>()); // זינוק החלוץ בהנפה
  const joyRef = useRef({ active: false, ox: 0, oy: 0, kx: 0, ky: 0 }); // ג'ויסטיק צף (מסך)
  const lastAutoSwing = useRef(0);
  const lastAutoShot = useRef(0);
  const lastFrame = useRef(0);
  const downRef = useRef(false); downRef.current = down;
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
          if (m.wave === 1) {
            // מדריך 6 שניות בתחילת כל ריצה — איך מפעילים את הנשק שלך
            setHint(ROLE_HINT[rolesRef.current[me] ?? "infantry"]);
            window.setTimeout(() => setHint(""), 6500);
          }
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
          const delta = Math.max(0, e.hp - m.hp);
          e.hp = m.hp;
          const [ex, ey] = posOf(e, conn.serverNow());
          // מספר נזק קופץ — כל פגיעה נראית
          if (delta > 0) {
            fxs.current.push({
              kind: "dmg", x: ex + (Math.random() - 0.5) * 26, y: ey - 20, t0: performance.now(),
              txt: String(Math.round(delta)), big: !!m.crit,
              color: m.crit ? "#ff5c5c" : m.by === me ? "#ffce3c" : "#ffffff",
            });
          }
          if (m.hp <= 0) {
            e.deadAt = conn.serverNow();
            fxs.current.push({ kind: "spark", x: ex, y: ey, t0: performance.now(), color: m.by === me ? "#ffce3c" : "#fff" });
            // צליל-הריגה אישי: פיץ' לפי השחקן — כולם שומעים מי קוטל 🎵
            const ki = room.players.findIndex((p) => p.id === m.by);
            Sfx.killNote(ki < 0 ? 0 : ki, m.by === me);
            if (m.by === me) vibrate(20);
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
        case "wl_slash":
          if (m.pid !== me) {
            fxs.current.push({ kind: "slash", x: m.x, y: m.y, t0: performance.now(), dir: m.dir });
            lunges.current.set(m.pid, { t0: performance.now(), dir: m.dir });
          }
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
      try {
        draw();
        (window as any).__wlFrames = ((window as any).__wlFrames || 0) + 1;
      } catch (err) {
        (window as any).__wlErr = String((err as Error)?.stack || err);
      }
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
    /* ---- קלט רציף (אגודל אחד, כל השאר אוטומטי) ---- */
    {
      const pn = performance.now();
      const dtMs = Math.min(50, pn - (lastFrame.current || pn));
      lastFrame.current = pn;
      const r0 = myRole();
      const inWave = phaseRef.current === "wave" && !downRef.current;
      // חלוץ: תנועה בג'ויסטיק
      if (r0 === "infantry" && inWave && joyRef.current.active && !shielding.current) {
        const j = joyRef.current;
        const dx = j.kx - j.ox, dy = j.ky - j.oy;
        const d = Math.hypot(dx, dy);
        if (d > 8) {
          const sp = 360 * Math.min(1, d / 64);
          const h2 = myHero();
          if (h2) {
            h2.x = Math.max(30, Math.min(W - 30, h2.x + (dx / d) * (sp * dtMs) / 1000));
            h2.y = Math.max(90, Math.min(WALL_Y - 15, h2.y + (dy / d) * (sp * dtMs) / 1000));
            if (pn - lastPosSend.current > 140) {
              lastPosSend.current = pn;
              conn.sendGame({ a: "wl_pos", x: Math.round(h2.x), y: Math.round(h2.y) });
            }
          }
        }
      }
      // חלוץ: אוטו-תקיפה על האויב הקרוב (Archero-style)
      if (r0 === "infantry" && inWave && !shielding.current && pn - lastAutoSwing.current > 520) {
        const h2 = myHero();
        if (h2) {
          const sn = conn.serverNow();
          let bx = 0, by = 0, bd = 150;
          for (const e of enemies.current.values()) {
            if (e.deadAt !== undefined || e.state === "burrow") continue;
            const [ex, ey] = posOf(e, sn);
            const dd = Math.hypot(ex - h2.x, ey - h2.y);
            if (dd < bd) { bd = dd; bx = ex; by = ey; }
          }
          if (bd < 150) {
            lastAutoSwing.current = pn;
            const dir = Math.atan2(by - h2.y, bx - h2.x);
            conn.sendGame({ a: "wl_swing", dir });
            fxs.current.push({ kind: "slash", x: h2.x, y: h2.y, t0: pn, dir });
            lunges.current.set(me, { t0: pn, dir });
            Sfx.tick(); vibrate(20);
          }
        }
      }
      // קשת: אוטו-ירי כל עוד האצבע על המסך
      if (r0 === "archer" && inWave && ptr.current.down && aimRef.current && pn - lastAutoShot.current > 660) {
        lastAutoShot.current = pn;
        const a = aimRef.current;
        conn.sendGame({ a: "wl_shot", tx: Math.round(a.tx), ty: Math.round(a.ty), power: 1 });
        const h2 = myHero();
        projs.current.push({
          kind: "arrow", fx: h2?.slot[0] ?? 500, fy: h2?.slot[1] ?? WALL_Y + 60, tx: a.tx, ty: a.ty, t0: pn,
          T: 280 + Math.hypot(a.tx - (h2?.slot[0] ?? 500), a.ty - (h2?.slot[1] ?? 0)) * 0.35,
          fire: (h2?.tier ?? 1) >= 2, by: me,
        });
        Sfx.tick(); vibrate(12);
      }
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
    if (myRole() === "mg" && firing.current && aimRef.current) targetCam = aimRef.current.tx; // עוקבת אחרי הכוונת — כל השדה נגיש
    if (aimRef.current && (myRole() === "archer" || myRole() === "cannon")) targetCam = (aimRef.current.tx + (h?.slot[0] ?? 500)) / 2;
    camX.current += (targetCam - camX.current) * 0.08;
    const scale = cw / VIEW_W;
    const viewH = chh / scale;
    // מצלמה אנכית: לחלוץ שמעמיק בשדה — עוקבת אחריו
    const baseTop = Math.max(0, Math.min(WORLD_H - viewH, WALL_Y + 170 - viewH));
    let targetTop = baseTop;
    if (myRole() === "infantry" && h && !h.down) targetTop = Math.max(0, Math.min(baseTop, h.y - viewH * 0.58));
    camTopRef.current += (targetTop - camTopRef.current) * 0.08;
    const camTop = camTopRef.current;
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
      // זינוק בהנפת חרב
      let hx = hh.x, hy = hh.y, lungeRot = 0;
      const lg = lunges.current.get(pid);
      if (lg) {
        const lf = (pnow - lg.t0) / 220;
        if (lf < 1) {
          const k = Math.sin(lf * Math.PI) * 30;
          hx += Math.cos(lg.dir) * k; hy += Math.sin(lg.dir) * k;
          lungeRot = Math.sin(lf * Math.PI) * 0.28 * (Math.cos(lg.dir) >= 0 ? 1 : -1);
        } else lunges.current.delete(pid);
      }
      ctx.globalAlpha = hh.down ? 0.35 : 1;
      // הילה בצבע התפקיד
      ctx.beginPath();
      ctx.fillStyle = mine ? ROLE_COLOR[role] + "55" : ROLE_COLOR[role] + "22";
      ctx.arc(wx(hx), wy(hy + size * 0.3), size * 0.45 * scale, 0, 7);
      ctx.fill();
      if (im.complete && im.naturalWidth) {
        if (lungeRot !== 0) {
          ctx.save(); ctx.translate(wx(hx), wy(hy)); ctx.rotate(lungeRot);
          ctx.drawImage(im, -size / 2 * scale, -size / 2 * scale, size * scale, size * scale);
          ctx.restore();
        } else {
          ctx.drawImage(im, wx(hx - size / 2), wy(hy - size / 2), size * scale, size * scale);
        }
      } else {
        ctx.font = `${28 * scale}px sans-serif`; ctx.textAlign = "center";
        ctx.fillText(ROLE_ICON[role], wx(hx), wy(hy));
      }
      ctx.globalAlpha = 1;
      // מגן פעיל
      if (mine && shielding.current) {
        ctx.strokeStyle = "#ffffffcc"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(wx(hx), wy(hy), size * 0.55 * scale, 0, 7); ctx.stroke();
      }
      if (!mine) {
        ctx.font = `${11 * scale}px Rubik, sans-serif`;
        ctx.fillStyle = ROLE_COLOR[role];
        ctx.textAlign = "center";
        ctx.fillText(nameOf(pid), wx(hx), wy(hy - 45));
      }
    }

    // זרמי מקלע — עמודת פגיעה + נותבים + הבהק לוע
    for (const [pid, ax] of streams.current.entries()) {
      const hh = heroes.current.get(pid);
      if (!hh) continue;
      const mx = hh.x, my = hh.y - 24; // קצה הקנה
      // עמודת הפגיעה (זה מה שהמקלע באמת מכסה בשרת)
      const colW = 124;
      const cg = ctx.createLinearGradient(0, wy(60), 0, wy(my));
      cg.addColorStop(0, "#5c8aff2e"); cg.addColorStop(1, "#5c8aff05");
      ctx.fillStyle = cg;
      ctx.fillRect(wx(ax - colW / 2), wy(60), colW * scale, (my - 60) * scale);
      ctx.strokeStyle = "#5c8aff33"; ctx.lineWidth = 1;
      ctx.strokeRect(wx(ax - colW / 2), wy(60), colW * scale, (my - 60) * scale);
      // נותבים — קליעים בהירים שנוסעים במעלה העמודה
      ctx.globalCompositeOperation = "lighter";
      for (let t = 0; t < 5; t++) {
        const seed = ((pnow * 0.0022 + t * 0.2) % 1); // 0..1 לאורך המסלול
        const bx = mx + (ax - mx) * seed + (Math.random() - 0.5) * 18;
        const by = my + (60 - my) * seed;
        const nx2 = mx + (ax - mx) * Math.min(1, seed + 0.055);
        const ny2 = my + (60 - my) * Math.min(1, seed + 0.055);
        const tg = ctx.createLinearGradient(wx(bx), wy(by), wx(nx2), wy(ny2));
        tg.addColorStop(0, "#fff6d820"); tg.addColorStop(1, "#ffe9a8ff");
        ctx.strokeStyle = tg; ctx.lineWidth = 3 * scale;
        ctx.beginPath(); ctx.moveTo(wx(bx), wy(by)); ctx.lineTo(wx(nx2), wy(ny2)); ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(wx(nx2), wy(ny2), 2.2 * scale, 0, 7); ctx.fill();
      }
      // הבהק לוע
      const mz = wlImg("muzzle");
      const msz = (44 + Math.random() * 22) * scale;
      const mang = Math.atan2(60 - my, ax - mx);
      ctx.save(); ctx.translate(wx(mx), wy(my)); ctx.rotate(mang + Math.PI / 2);
      if (mz.complete && mz.naturalWidth) ctx.drawImage(mz, -msz / 2, -msz, msz, msz);
      else {
        const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, msz / 2);
        fg.addColorStop(0, "#fff"); fg.addColorStop(0.4, "#ffd24a"); fg.addColorStop(1, "#ff7a2f00");
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(0, 0, msz / 2, 0, 7); ctx.fill();
      }
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
    }

    // פרויקטילים
    projs.current = projs.current.filter((p) => pnow - p.t0 < p.T + 100);
    for (const p of projs.current) {
      const f = Math.min(1, (pnow - p.t0) / p.T);
      const px = p.fx + (p.tx - p.fx) * f;
      const arc = p.kind === "shell" ? 260 : 150;
      const py = p.fy + (p.ty - p.fy) * f - Math.sin(f * Math.PI) * arc;
      // טבעת נחיתה מהבהבת ביעד — כל עוד הקליע באוויר
      if (f < 1) {
        const pulse = 0.6 + 0.4 * Math.sin(pnow / 90);
        ctx.strokeStyle = p.kind === "shell" ? `rgba(255,206,60,${0.5 * pulse})` : `rgba(52,232,158,${0.45 * pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(wx(p.tx), wy(p.ty), (p.kind === "shell" ? 34 : 16) * scale * pulse, 0, 7); ctx.stroke();
      }
      if (p.kind === "arrow") {
        const dirAng = Math.atan2(p.ty - p.fy, p.tx - p.fx) + (f - 0.5) * 0.6;
        // שובל זוהר
        ctx.globalCompositeOperation = "lighter";
        for (let g = 1; g <= 3; g++) {
          const gf = Math.max(0, f - g * 0.05);
          const gx = p.fx + (p.tx - p.fx) * gf;
          const gy = p.fy + (p.ty - p.fy) * gf - Math.sin(gf * Math.PI) * arc;
          ctx.fillStyle = p.fire ? `rgba(255,150,60,${0.3 - g * 0.08})` : `rgba(120,255,190,${0.3 - g * 0.08})`;
          ctx.beginPath(); ctx.arc(wx(gx), wy(gy), (6 - g) * scale, 0, 7); ctx.fill();
        }
        // גוף החץ — שאפט בולט + ראש
        ctx.save();
        ctx.translate(wx(px), wy(py));
        ctx.rotate(dirAng);
        const L = 30 * scale;
        ctx.strokeStyle = p.fire ? "#ffb347" : "#e8fff2"; ctx.lineWidth = 3.2 * scale; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke();
        ctx.fillStyle = p.fire ? "#ffd24a" : "#ffffff";
        ctx.beginPath(); ctx.moveTo(L / 2 + 7 * scale, 0); ctx.lineTo(L / 2 - 2 * scale, -4 * scale); ctx.lineTo(L / 2 - 2 * scale, 4 * scale); ctx.closePath(); ctx.fill();
        // נוצות
        ctx.strokeStyle = p.fire ? "#ff7a2f" : "#34e89e"; ctx.lineWidth = 2 * scale;
        ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(-L / 2 - 5 * scale, -4 * scale);
        ctx.moveTo(-L / 2, 0); ctx.lineTo(-L / 2 - 5 * scale, 4 * scale); ctx.stroke();
        // ספרייט מעל (אם נטען) — מוגדל
        const im = wlImg(p.fire ? "arrowFire" : "arrow");
        if (im.complete && im.naturalWidth) {
          ctx.rotate(-Math.PI / 2);
          ctx.drawImage(im, -20 * scale, -32 * scale, 40 * scale, 64 * scale);
        }
        ctx.restore();
        ctx.globalCompositeOperation = "source-over"; // חובה אחרי restore — אחרת ה-lighter מודלף ומלבין את המסך
      } else {
        // פגז — עם שובל עשן
        ctx.globalAlpha = 0.35;
        for (let g = 1; g <= 4; g++) {
          const gf = Math.max(0, f - g * 0.06);
          const gx = p.fx + (p.tx - p.fx) * gf;
          const gy = p.fy + (p.ty - p.fy) * gf - Math.sin(gf * Math.PI) * arc;
          ctx.fillStyle = "#9a9aa5";
          ctx.beginPath(); ctx.arc(wx(gx), wy(gy), (7 - g) * scale, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#2c2c34";
        ctx.beginPath(); ctx.arc(wx(px), wy(py), 9 * scale, 0, 7); ctx.fill();
        ctx.fillStyle = "#ff9a2f";
        ctx.beginPath(); ctx.arc(wx(px), wy(py), 4.5 * scale, 0, 7); ctx.fill();
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
        const st = Math.min(1, (pnow - f.t0) / 300); // סלאש מהיר מהשאר
        const ang = f.dir ?? 0;
        const im2 = wlImg("slash");
        ctx.save();
        ctx.translate(wx(f.x + Math.cos(ang) * 42), wy(f.y + Math.sin(ang) * 42));
        ctx.rotate(ang + Math.PI / 2);
        ctx.globalAlpha = 1 - st;
        ctx.globalCompositeOperation = "lighter";
        const sz = 160 * (0.6 + st * 0.7) * scale;
        if (im2.complete && im2.naturalWidth) {
          ctx.drawImage(im2, -sz / 2, -sz / 2, sz, sz);
        } else {
          ctx.strokeStyle = "#bfe8ff"; ctx.lineWidth = 10 * scale; ctx.lineCap = "round";
          ctx.beginPath(); ctx.arc(0, 0, sz * 0.34, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
          ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4 * scale;
          ctx.beginPath(); ctx.arc(0, 0, sz * 0.34, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.restore();
      } else if (f.kind === "spark") {
        const hi = wlImg("hit");
        if (hi.complete && hi.naturalWidth && ft < 0.5) {
          const hsz = 52 * (0.6 + ft) * scale;
          ctx.globalAlpha = 1 - ft * 2;
          ctx.globalCompositeOperation = "lighter";
          ctx.drawImage(hi, wx(f.x) - hsz / 2, wy(f.y) - hsz / 2, hsz, hsz);
          ctx.globalCompositeOperation = "source-over";
        }
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
      } else if (f.kind === "dmg") {
        // מספר נזק צף — עולה ודוהה
        const fsz = (f.big ? 24 : 15) * scale;
        ctx.font = `900 ${fsz}px Rubik, sans-serif`;
        ctx.textAlign = "center";
        ctx.globalAlpha = Math.max(0, 1 - ft * 1.15);
        ctx.strokeStyle = "rgba(0,0,0,.75)"; ctx.lineWidth = 3;
        const dy2 = wy(f.y) - ft * 42 * scale;
        ctx.strokeText(f.txt ?? "", wx(f.x), dy2);
        ctx.fillStyle = f.color ?? "#fff";
        ctx.fillText(f.txt ?? "", wx(f.x), dy2);
        ctx.globalAlpha = 1;
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
        // עיגול יעד ממולא קלות + כוונת צלב
        const tr = (role === "cannon" ? 60 : 26) * scale;
        ctx.fillStyle = role === "archer" ? "#34e89e18" : "#ffce3c18";
        ctx.beginPath(); ctx.arc(wx(aim.tx), wy(aim.ty), tr, 0, 7); ctx.fill();
        ctx.strokeStyle = role === "archer" ? "#34e89e" : "#ffce3c";
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(wx(aim.tx), wy(aim.ty), tr, 0, 7); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(wx(aim.tx) - tr * 0.55, wy(aim.ty)); ctx.lineTo(wx(aim.tx) + tr * 0.55, wy(aim.ty));
        ctx.moveTo(wx(aim.tx), wy(aim.ty) - tr * 0.55); ctx.lineTo(wx(aim.tx), wy(aim.ty) + tr * 0.55);
        ctx.stroke();
      }
    }

    // ג'ויסטיק צף של החלוץ (קואורדינטות מסך)
    if (myRole() === "infantry" && joyRef.current.active) {
      const j = joyRef.current;
      const cvR = cv.getBoundingClientRect();
      const jox = j.ox - cvR.left, joy2 = j.oy - cvR.top;
      let jdx = j.kx - j.ox, jdy = j.ky - j.oy;
      const jd = Math.hypot(jdx, jdy);
      if (jd > 56) { jdx = (jdx / jd) * 56; jdy = (jdy / jd) * 56; }
      ctx.strokeStyle = "#ff5c5c66"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(jox, joy2, 56, 0, 7); ctx.stroke();
      ctx.fillStyle = "#ff5c5c22";
      ctx.beginPath(); ctx.arc(jox, joy2, 56, 0, 7); ctx.fill();
      ctx.fillStyle = "#ff5c5ccc";
      ctx.beginPath(); ctx.arc(jox + jdx, joy2 + jdy, 24, 0, 7); ctx.fill();
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
    const camTop = camTopRef.current;
    const camL = Math.max(0, Math.min(W - VIEW_W, camX.current - VIEW_W / 2));
    return [camL + (e.clientX - r.left) / scale, camTop + (e.clientY - r.top) / scale];
  }

  /** מקלען: מיפוי X של המסך → כל רוחב השדה (לא תלוי מצלמה) */
  function mgAimX(e: React.PointerEvent): number {
    const r = canvasRef.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    return 30 + f * (W - 60);
  }

  function onDown(e: React.PointerEvent) {
    if (phaseRef.current !== "wave" || down) return;
    (e.target as Element).setPointerCapture?.(e.pointerId); // גרירות לא בורחות לשכבות-על
    const [wx0, wy0] = toWorld(e);
    ptr.current = { down: true, x0: e.clientX, y0: e.clientY, t0: performance.now(), x: e.clientX, y: e.clientY, moved: false };
    const role = myRole();
    if (role === "mg") {
      if (Date.now() < jamUntil) return;
      firing.current = true;
      const ax = mgAimX(e);
      aimRef.current = { tx: ax, ty: 100, power: 1 };
      conn.sendGame({ a: "wl_fire", on: true });
      conn.sendGame({ a: "wl_aim", x: Math.round(ax) });
    } else if (role === "archer") {
      // גע והחזק על המטרה — יורה לבד (הירייה הראשונה מיידית דרך לולאת ה-RAF)
      aimRef.current = { tx: wx0, ty: Math.max(60, Math.min(wy0, WALL_Y - 60)), power: 1 };
      lastAutoShot.current = 0;
    } else if (role === "cannon") {
      aimRef.current = { tx: wx0, ty: Math.min(wy0, WALL_Y - 60), power: 0.7 };
    } else if (role === "infantry" && !shielding.current) {
      // ג'ויסטיק צף: הבסיס נולד איפה שנגעת
      joyRef.current = { active: true, ox: e.clientX, oy: e.clientY, kx: e.clientX, ky: e.clientY };
    }
  }

  function onMove(e: React.PointerEvent) {
    if (!ptr.current.down) return;
    const p = ptr.current;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 14) p.moved = true;
    const role = myRole();
    if (role === "infantry" && joyRef.current.active) {
      joyRef.current.kx = e.clientX; joyRef.current.ky = e.clientY;
    } else if (role === "mg" && firing.current) {
      const ax = mgAimX(e);
      aimRef.current = { tx: ax, ty: 100, power: 1 };
      const tn = performance.now();
      if (tn - lastAimSend.current > 160) {
        lastAimSend.current = tn;
        conn.sendGame({ a: "wl_aim", x: Math.round(ax) });
      }
    } else if (role === "archer" || role === "cannon") {
      const [wxp, wyp] = toWorld(e);
      aimRef.current = { tx: wxp, ty: Math.max(60, Math.min(wyp, WALL_Y - 60)), power: 1 };
    }
  }

  function onUp() {
    const p = ptr.current;
    if (!p.down) return;
    p.down = false;
    const role = myRole();
    joyRef.current.active = false;
    if (role === "mg") {
      firing.current = false;
      conn.sendGame({ a: "wl_fire", on: false });
      aimRef.current = null;
    } else if (role === "archer" || role === "cannon") {
      if (role === "cannon" && aimRef.current && Date.now() >= cannonReady.current) {
        conn.sendGame({ a: "wl_boom", tx: Math.round(aimRef.current.tx), ty: Math.round(aimRef.current.ty) });
        cannonReady.current = Date.now() + 3600;
        setUi((u) => u + 1);
      }
      aimRef.current = null;
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
            🛡️<small>מגן</small>
          </button>
        )}
        <div className="wl-hp"><div style={{ width: `${(myHp / Math.max(1, myMax)) * 100}%` }} /></div>
      </div>

      {banner && <div className="wl-banner popin">{banner}</div>}
      {hint && <div className="wl-hint popin">{hint}</div>}
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
