/**
 * הגנבים 🥷 — הליבה + המגדל + סבב 5: העצירה כל דקה, הקלפים והמודים.
 *
 * הליבה, לפי מסמכי העיצוב: הר אחד במרכז שנגמר · מאורה לכל שחקן ·
 * גביש שמופקד מבשיל ומייצר זהב כל שנייה · גניבה ממאורה של חבר · מרדף —
 * מגע מפיל את השלל וכל אחד יכול להרים · זעם לנשדד · דקת אזעקה ×3 בסוף.
 *
 * המודל זהה לחופרים: השרת סמכות יחידה, הלקוח מנבא את התנועה של עצמו.
 * בעלות על חפץ היא הכרעת שרת בלעדית — שני נוגעים באותו שלל = הראשון בטיק.
 *
 * סבב הזרימה (2.9): מיקומים ב-20Hz עם שעון-שרת ווקטור תנועה (ניבוי+פיוס בלקוח) ·
 * הרגעים המשותפים (צאו! / המלחמה / ההר נגמר / האזעקה / הצפירה) הם cue — כל הטלפונים
 * יחד ב-±20ms · חסד אחרי הרמה · סובלנות מרחק לגניבה · פעמון הבשלה אחד למאורה.
 *
 * 🗼 המגדל (3.9): לכל מאורה מגדל בסיסי. הוא לא הורג אף אחד — הוא קונה זמן: יורה חלוק על הזר
 * הקרוב בטווח (סוחב שלל קודם), מכוון קדימה לפי כיוון הריצה (פנייה חדה מפספסת), פגיעה = האטה + הדף.
 * שטח מת בגב המאורה · חימום אחרי 8 יריות ⇒ 4ש' קירור.
 *
 * 🃏 סבב 5 (7.9): 6 × (58 שנ' + עצירה 12 שנ') + דקת האזעקה = 8:00. בעצירה כולם קופאים (cue),
 * כל אחד מקבל מדף אישי של 4 קלפים במחיר שנגזר מהזהב החציוני (מטבע אחד — המחיר יורד מהניקוד),
 * וקונה אחד לכל היותר. הקלפים הם מודים (shared/thieves.ts): מהירות, שק, דאש, בועה, עוגה, מפתח שוודי,
 * מגדל 2/3/אחורי, גדר/חומה, דבש, פעמון, כספת, דשן, מדף, מוקש, גשם זהב, ריצת פרים, חושך, אבולוציות.
 * ההשבתה/ההריסה בתשלום ירדו — "מפתח שוודי" הוא קלף. בזמן העצירה הטיימרים עומדים (bump בחזרה).
 */
import type { GameCtx, GameInstance } from "../engine";
import type { GameClientMsg, GameServerMsg } from "../../../shared/protocol";
import { TH_CARDS, TH_TIMING, thCard, thMods, thButtons, thPlayMs, thPrice } from "../../../shared/thieves";
import type { ThCard, ThMods, ThShelfCard, ThTiming, ThievesServerMsg5 } from "../../../shared/thieves";

const TICK = 50;                    // 20Hz סימולציה
const POS_EVERY = 50;               // 20Hz שידור מיקומים
export const TH_W = 46;
export const TH_H = 30;
const SPD = 6.0;                    // תאים לשנייה
const RAGE_SECS_BASE = 15;
const MTN_PER = 24;                 // צ'אנקים לשחקן: ~8 נסיעות; ההר נגמר סביב דקה 5 של משחק נטו
const TIER_DEEP = 0.4, TIER_CORE = 0.15;
const DEN_R = 2.0;
const STEAL_TOL = 0.6;
const TOUCH_R = 1.1;
const GRAB_GRACE = 600;
const PICK_GRACE = 700;
const DROP_LOCK = 1200;
const DC_DROP_MS = 4000;
const GO_DELAY = 1500;
const HORN_HOLD = 900;
const BELL_EVERY = 8000;
const RATE = [0.2, 0.6, 1.2];
const ALARM_MULT = 3;
const RESUME_GRACE = 700;           // אחרי העצירה — רגע בלי הפלות, כולם מתעוררים יחד

/* ---------- 🗼 המגדל ---------- */
const TOWER_R = 5.5;
const DEAD_ARC = Math.PI / 3;
const FIRE_MS = [1500, 1000, 1000];         // לפי דרגה 1..3
const TOWER_R_BONUS = [0, 0.5, 0.5];
const PROJ_SPD = 13;
const LEAD_S = 0.32;
const HIT_R = 0.8;
const SLOW_MS = [2000, 2000, 3000], SLOW_MUL = [0.7, 0.7, 0.5];
const KNOCK = 0.5;
const HEAT_MAX = 8, COOL_MS = 4000;
const HEAT_IDLE_MS = 2000;
const WRENCH_OFF_MS = 8000;

/* ---------- 🃏 קלפים ---------- */
const DASH_MS = 300, DASH_MUL = 2.4;         // ~4.3 תאים
const BUBBLE_MS = 2000;
const PIE_SPD = 14, PIE_MS = 400, PIE_R = 0.9, PIE_STUN = 1000;
const GHOST_MS = 5000;
const HONEY_STUN = 1000, MINE_STUN = 1000, MINE_KNOCK = 3, BANANA_STUN = 800;
const BANANA_EVERY = 5000, BANANA_LIFE = 12000, BANANA_MAX = 3, BANANA_R = 0.7;
const BULL_MS = 15000, DARK_MS = 20000, RAIN_N = 10;
const SOFT_DROP = 0.9;

type TowerSt = "ok" | "hot" | "off";

interface Thief {
  x: number; y: number; dx: number; dy: number; fx: number; fy: number;   // fx/fy = הכיוון האחרון (לדאש/עוגה בעמידה)
  carry: number; carryVal: number; stolen: number;
  gold: number; spent: number;
  rageUntil: number; slowUntil: number; slowMul: number; stunUntil: number;
  dashUntil: number; dashDx: number; dashDy: number; bubbleUntil: number; ghostUntil: number;
  mineAt: number; stealCd: number;
  dropLockId: number; dropLockUntil: number; safeUntil: number; dcDropAt: number;
  cards: string[]; mods: ThMods; cd: Record<string, number>;
  bought: string | null;             // מה קניתי בעצירה הנוכחית
  honeyDen: string; honeyAt: number; bananaAt: number; bananas: number;
  thefts: number; robbed: number; tackles: number;
}
interface Item {
  id: number; lvl: number; sinceLvl: number; v: number;
  den: string; carrier: string; gx: number; gy: number; state: "den" | "carried" | "ground";
  nugget?: boolean;                  // צ'אנק חופשי (גשם זהב) — מי שמרים סוחב הביתה
}
interface Tower { st: TowerSt; until: number; heat: number; nextShot: number; lastShot: number; shots: number; back: number; inRange: Set<string>; mineArmed: boolean }
interface Shot { den: string; tgt: string; x: number; y: number; at: number }
interface Pie { id: number; by: string; x: number; y: number; dx: number; dy: number; at: number; until: number; hit: boolean }
interface Banana { id: number; x: number; y: number; by: string; until: number }

export function createThieves(ctx: GameCtx): GameInstance {
  const cfg = (ctx.config ?? {}) as { roundMs?: number; ripen1Ms?: number; ripen2Ms?: number; mtnPer?: number; startGold?: number; towerR?: number; timing?: Partial<ThTiming>; cards?: string[]; startCards?: Record<string, string[]> };
  // TH_FAST=1 — פלייטסט מהיר (דקות של 14 שנ', 2 עצירות) לצילומי מסך ובוטים; לא משפיע על פרודקשן
  const fast: Partial<ThTiming> = process.env.TH_FAST ? { segMs: 14_000, pauseMs: 12_000, pauses: 2, alarmMs: 20_000 } : {};
  const T: ThTiming = { ...TH_TIMING, ...fast, ...(cfg.timing ?? {}) };
  const ROUND_MS = cfg.roundMs ?? thPlayMs(T);          // זמן משחק נטו — העצירות נוספות מעליו (TH_FAST: 2×14+20 = 48 שנ')
  const RIPEN1 = cfg.ripen1Ms ?? (process.env.TH_FAST ? 6000 : 30_000);
  const RIPEN2 = cfg.ripen2Ms ?? (process.env.TH_FAST ? 15_000 : 90_000);
  const START_GOLD = cfg.startGold ?? (process.env.TH_FAST ? 200 : 0);
  const TW_R = cfg.towerR ?? TOWER_R;
  const CARD_POOL: ThCard[] = cfg.cards ? TH_CARDS.filter((c) => cfg.cards!.includes(c.id)) : TH_CARDS;

  const thieves = new Map<string, Thief>();
  const items = new Map<number, Item>();
  const dens = new Map<string, { x: number; y: number }>();
  const towers = new Map<string, Tower>();
  const shots: Shot[] = [];
  const pies: Pie[] = [];
  const bananas: Banana[] = [];
  const bellAt = new Map<string, number>();
  let nextId = 1;

  const mtn = { x: TH_W / 2, y: TH_H / 2, total: 0, left: 0 };
  let phase: "run" | "pause" | "over" | "done" = "run";
  let goAt = 0, endsAt = 0;
  let alarmed = false, emptied = false, firstSteal = false, horned = false;
  let bullUntil = 0;
  // ⏸ העצירות
  let k = 0;                                   // מספר העצירה האחרונה (1..pauses)
  let nextPauseAt = 0, pauseCued = false, pauseAt = 0, draftAt = 0, revealAt = 0, resumeAt = 0, revealCued = false, leftAtPause = 0;
  const shelves = new Map<string, ThShelfCard[]>();
  let loop: NodeJS.Timeout | null = null;
  let lastPos = 0, lastTick = 0, nextTick = 0;
  let conn = new Set<string>();

  const bc5 = (d: ThievesServerMsg5) => ctx.broadcast(d as unknown as GameServerMsg);
  const to5 = (pid: string, d: ThievesServerMsg5) => ctx.sendTo(pid, d as unknown as GameServerMsg);
  const cue5 = (ms: number, d: ThievesServerMsg5) => ctx.cue(ms, d as unknown as GameServerMsg);
  const alive = () => ctx.participants().filter((p) => p.connected).map((p) => p.id);
  const clampW = (v: number) => Math.max(1, Math.min(TH_W - 1, v));
  const clampH = (v: number) => Math.max(1, Math.min(TH_H - 1, v));
  const mtnR = () => (mtn.left <= 0 ? 0 : 1.6 + 2.8 * Math.sqrt(mtn.left / Math.max(1, mtn.total)));
  const rate = (lvl: number) => RATE[Math.min(lvl, RATE.length - 1)];
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const r2 = (v: number) => Math.round(v * 20) / 20;
  const angDiff = (a: number, b: number) => { let d = Math.abs(a - b) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d; return d; };
  const backOf = (d: { x: number; y: number }) => Math.atan2(d.y - mtn.y, d.x - mtn.x);
  const towerPos = (d: { x: number; y: number }) => { const side = Math.sign(mtn.x - d.x) || 1; return { x: d.x + 2.1 * side, y: d.y - 0.5 }; };
  const nope = (pid: string, why: "far" | "empty" | "busy" | "gold" | "tower") => ctx.sendTo(pid, { a: "th_nope", why });
  const towerRange = (tw: Tower, owner: string) => TW_R + TOWER_R_BONUS[(thieves.get(owner)?.mods.towerLvl ?? 1) - 1];

  const ANCHORS: [number, number][] = [
    [5, 5], [TH_W - 5, TH_H - 5], [TH_W - 5, 5], [5, TH_H - 5],
    [TH_W / 2, 3.5], [TH_W / 2, TH_H - 3.5], [3.5, TH_H / 2], [TH_W - 3.5, TH_H / 2],
  ];

  function newThief(pid: string): Thief {
    const d = dens.get(pid)!;
    return {
      x: d.x, y: d.y, dx: 0, dy: 0, fx: Math.sign(mtn.x - d.x) || 1, fy: 0, carry: 0, carryVal: 0, stolen: 0, gold: START_GOLD, spent: 0,
      rageUntil: 0, slowUntil: 0, slowMul: 0.7, stunUntil: 0, dashUntil: 0, dashDx: 1, dashDy: 0, bubbleUntil: 0, ghostUntil: 0,
      mineAt: 0, stealCd: 0, dropLockId: 0, dropLockUntil: 0, safeUntil: 0, dcDropAt: 0,
      cards: [...(cfg.startCards?.[pid] ?? [])], mods: thMods(cfg.startCards?.[pid] ?? []), cd: {}, bought: null, honeyDen: "", honeyAt: 0, bananaAt: 0, bananas: 0,
      thefts: 0, robbed: 0, tackles: 0,
    };
  }
  function newTower(pid: string): Tower {
    return { st: "ok", until: 0, heat: 0, nextShot: 0, lastShot: 0, shots: 0, back: backOf(dens.get(pid)!), inRange: new Set(), mineArmed: true };
  }
  /** המהירות — אותה נוסחה בדיוק בלקוח (ניבוי) */
  function speedOf(t: Thief, pid: string, now: number) {
    if (now < t.stunUntil) return 0;
    const m = t.mods;
    let s = SPD * m.speed * (1 - 0.05 * t.carry);
    if (t.stolen && now >= t.ghostUntil) s *= m.stolenSlow;
    if (now < t.ghostUntil) s *= 1.3;
    if (now < t.rageUntil) s *= m.rageMul;
    if (now < t.slowUntil) s *= t.slowMul;
    if (now < bullUntil) s *= 1.5;
    if (m.stretch && t.stolen) { const d = dens.get(pid); if (d && Math.hypot(t.x - d.x, t.y - d.y) <= 6) s *= 1.3; }
    // גדר/חומה של מאורה זרה — זרים זזים לאט בפנים (סולם מבטל)
    if (!m.ladder) for (const [p2, d] of dens.entries()) {
      if (p2 === pid) continue;
      const f = thieves.get(p2)?.mods.fence ?? 0; if (!f) continue;
      if (Math.hypot(t.x - d.x, t.y - d.y) <= DEN_R + 0.4) { s *= f === 2 ? 0.35 : 0.5; break; }
    }
    return s;
  }
  const towerMsg = (den: string, tw: Tower, by?: string) => ({ a: "th_tower" as const, den, st: tw.st as "ok" | "hot" | "off", until: tw.until || undefined, by });
  const stun = (pid: string, t: Thief, now: number, ms: number, why: "pie" | "banana" | "honey" | "mine" | "circus") => {
    t.stunUntil = Math.max(t.stunUntil, now + ms); t.dx = 0; t.dy = 0;
    bc5({ a: "th_stun", pid, ms, why });
  };

  /* ---------- חציבה והפקדה ---------- */
  function tryMine(pid: string, t: Thief, now: number) {
    if (t.stolen || t.carry >= t.mods.carryCap || mtn.left <= 0) return;
    if (Math.hypot(t.x - mtn.x, t.y - mtn.y) > mtnR() + 1.0) return;
    if (now < t.mineAt) return;
    t.mineAt = now + t.mods.mineMs;
    const frac = mtn.left / Math.max(1, mtn.total);
    const tier = frac <= TIER_CORE ? 3 : frac <= TIER_DEEP ? 2 : 1;
    t.carry++; t.carryVal += tier; mtn.left--;
    ctx.broadcast({ a: "th_mine", pid, carry: t.carry, left: mtn.left, tier });
    if (mtn.left <= 0 && !emptied) { emptied = true; ctx.cue(400, { a: "th_empty" }); }
  }
  function atDen(t: Thief, pid: string) {
    const d = dens.get(pid); if (!d) return false;
    return Math.hypot(t.x - d.x, t.y - d.y) <= DEN_R;
  }
  function deposit(pid: string, t: Thief, now: number) {
    if (t.carry > 0) {
      const it: Item = { id: nextId++, lvl: 0, sinceLvl: now, v: Math.max(1, t.carryVal), den: pid, carrier: "", gx: 0, gy: 0, state: "den" };
      items.set(it.id, it);
      t.carry = 0; t.carryVal = 0;
      ctx.broadcast({ a: "th_dep", pid, ids: [it.id], v: it.v });
    }
    if (t.stolen) {
      const it = items.get(t.stolen);
      if (it) {
        const from = it.den;
        it.den = pid; it.carrier = ""; it.state = "den"; it.sinceLvl = now;
        if (from !== pid) t.thefts++;
        ctx.broadcast({ a: "th_home", id: it.id, by: pid, from, lvl: it.lvl });
      }
      t.stolen = 0;
    }
  }
  /** 🔒 הכספת: הגביש הכי בשל של בעל כספת — חסין, מייצר חצי. אותו כלל בלקוח */
  function vaultedOf(owner: string): number {
    const o = thieves.get(owner); if (!o || !o.mods.vault) return 0;
    let best: Item | null = null;
    for (const it of items.values()) if (it.state === "den" && it.den === owner && (!best || it.lvl > best.lvl || (it.lvl === best.lvl && it.v > best.v))) best = it;
    return best?.id ?? 0;
  }

  /* ---------- גניבה ---------- */
  function trySteal(pid: string, t: Thief, now: number) {
    if (phase !== "run" || now < goAt) return;
    if (t.stolen) { nope(pid, "busy"); return; }
    if (now < t.stealCd) return;
    let victim = "", vd = 1e9, near = false;
    for (const [p2, d] of dens.entries()) {
      if (p2 === pid) continue;
      const dd = Math.hypot(t.x - d.x, t.y - d.y);
      if (dd > DEN_R + STEAL_TOL) continue;
      near = true;
      const safe = vaultedOf(p2);
      if (dd < vd && [...items.values()].some((it) => it.state === "den" && it.den === p2 && it.id !== safe)) { vd = dd; victim = p2; }
    }
    if (!victim) { nope(pid, near ? "empty" : "far"); t.stealCd = now + 250; return; }
    const safe = vaultedOf(victim);
    const pool = [...items.values()].filter((it) => it.state === "den" && it.den === victim && it.id !== safe);
    pool.sort((a, b) => b.lvl - a.lvl || b.v - a.v || a.sinceLvl - b.sinceLvl);
    const it = pool[0];
    it.lvl = Math.max(0, it.lvl - 1);
    it.sinceLvl = now; it.carrier = pid; it.state = "carried";
    t.stolen = it.id; t.stealCd = now + 1000; t.safeUntil = Math.max(t.safeUntil, now + GRAB_GRACE);
    const v = thieves.get(victim);
    if (v) { v.robbed++; v.rageUntil = now + v.mods.rageSecs * 1000; ctx.broadcast({ a: "th_rage", pid: victim, secs: v.mods.rageSecs }); }
    ctx.broadcast({ a: "th_grab", id: it.id, by: pid, from: victim, lvl: it.lvl, v: it.v });
    if (!firstSteal) { firstSteal = true; ctx.cue(400, { a: "th_first", by: pid, from: victim }); }
  }

  /* ---------- מגע מפיל ---------- */
  function dropAt(t: Thief, it: Item, now: number, awayFromX?: number, awayFromY?: number) {
    const base = awayFromX === undefined || awayFromY === undefined
      ? Math.random() * Math.PI * 2
      : Math.atan2(t.y - awayFromY, t.x - awayFromX) + (Math.random() - 0.5) * 1.2;
    const d = t.mods.soft ? SOFT_DROP : 2.6 + Math.random() * 0.8;
    it.gx = clampW(t.x + Math.cos(base) * d); it.gy = clampH(t.y + Math.sin(base) * d);
    it.carrier = ""; it.state = "ground";
    t.dropLockId = it.id; t.dropLockUntil = now + (t.mods.soft ? 500 : DROP_LOCK);
    t.stolen = 0;
    ctx.broadcast({ a: "th_drop", id: it.id, x: r1(it.gx), y: r1(it.gy), lvl: it.lvl });
  }
  function tackle(now: number) {
    for (const [pid, t] of thieves.entries()) {
      if (!t.stolen || !conn.has(pid) || now < t.safeUntil || now < t.bubbleUntil) continue;
      for (const [p2, o] of thieves.entries()) {
        if (p2 === pid || !conn.has(p2) || now < o.stunUntil) continue;
        if (Math.hypot(t.x - o.x, t.y - o.y) > TOUCH_R) continue;
        const it = items.get(t.stolen);
        o.tackles++;
        ctx.broadcast({ a: "th_tackle", by: p2, carrier: pid });
        if (it) dropAt(t, it, now, o.x, o.y); else t.stolen = 0;
        if (o.mods.circus) { stun(pid, t, now, PIE_STUN, "circus"); dropBanana(t.x, t.y, p2, now); }
        break;
      }
    }
  }
  function pickup(now: number) {
    for (const it of items.values()) {
      if (it.state !== "ground") continue;
      for (const [pid, t] of thieves.entries()) {
        if (!conn.has(pid) || t.stolen) continue;
        if (t.dropLockId === it.id && now < t.dropLockUntil) continue;
        if (Math.hypot(t.x - it.gx, t.y - it.gy) > t.mods.pickR) continue;
        if (it.nugget) {
          // צ'אנק חופשי — נכנס ליד (לא "שלל"), עד תקרת השק
          if (t.carry >= t.mods.carryCap) continue;
          t.carry++; t.carryVal += it.v; items.delete(it.id);
          bc5({ a: "th_nugget", id: it.id, by: pid, carry: t.carry });
          break;
        }
        it.carrier = pid; it.state = "carried";
        t.stolen = it.id; t.safeUntil = Math.max(t.safeUntil, now + PICK_GRACE);
        ctx.broadcast({ a: "th_pick", id: it.id, by: pid });
        break;
      }
    }
  }

  /* ---------- הבשלה והכנסה ---------- */
  function economy(dt: number, now: number) {
    const mult = alarmed ? ALARM_MULT : 1;
    const safeOf = new Map<string, number>();
    for (const it of items.values()) {
      if (it.state !== "den") continue;
      const owner = thieves.get(it.den);
      const rm = owner?.mods.ripenMul ?? 1;
      const aged = now - it.sinceLvl;
      if (it.lvl === 0 && aged >= RIPEN1 * rm) { it.lvl = 1; it.sinceLvl = now; ctx.broadcast({ a: "th_ripen", id: it.id, den: it.den, lvl: 1 }); }
      else if (it.lvl === 1 && aged >= RIPEN2 * rm) {
        it.lvl = 2; it.sinceLvl = now;
        const bell = now - (bellAt.get(it.den) ?? -1e9) >= BELL_EVERY;
        if (bell) bellAt.set(it.den, now);
        ctx.broadcast({ a: "th_ripen", id: it.id, den: it.den, lvl: 2, bell });
      }
      if (owner) {
        if (owner.mods.vault && !safeOf.has(it.den)) safeOf.set(it.den, vaultedOf(it.den));
        const vault = safeOf.get(it.den) === it.id ? 0.5 : 1;
        owner.gold += rate(it.lvl) * it.v * mult * dt * owner.mods.incomeMul * vault;
      }
    }
  }

  /* ---------- 🗼 המגדל ---------- */
  function towersStep(dt: number, now: number) {
    for (const [owner, tw] of towers.entries()) {
      const om = thieves.get(owner)?.mods ?? thMods([]);
      const R = towerRange(tw, owner);
      // 🔔 פעמון מוקדם / 🧨 מוקש / 🍯 דבש — כניסת זרים לטווח ולמאורה
      const d = dens.get(owner)!;
      for (const [pid, t] of thieves.entries()) {
        if (pid === owner || !conn.has(pid)) continue;
        const dist = Math.hypot(t.x - d.x, t.y - d.y);
        const inR = dist <= R;
        if (inR && !tw.inRange.has(pid)) { tw.inRange.add(pid); if (om.bell) to5(owner, { a: "th_warn", pid }); }
        else if (!inR && tw.inRange.has(pid)) tw.inRange.delete(pid);
        if (dist <= DEN_R + 0.4) {
          if (om.mine && tw.mineArmed) {
            tw.mineArmed = false;
            const kx = t.x - d.x, ky = t.y - d.y, kl = Math.hypot(kx, ky) || 1;
            t.x = clampW(t.x + (kx / kl) * MINE_KNOCK); t.y = clampH(t.y + (ky / kl) * MINE_KNOCK);
            stun(pid, t, now, MINE_STUN, "mine");
            bc5({ a: "th_fx", k: "boom", pid, x: r1(d.x), y: r1(d.y) });
          } else if (om.honey && t.honeyDen !== owner) {
            t.honeyDen = owner; t.honeyAt = now;
            stun(pid, t, now, HONEY_STUN, "honey");
            bc5({ a: "th_fx", k: "honey", pid, x: r1(t.x), y: r1(t.y) });
          }
        } else if (t.honeyDen === owner && now - t.honeyAt > 2000) t.honeyDen = "";
      }
      if ((tw.st === "hot" || tw.st === "off") && now >= tw.until) {
        tw.st = "ok"; tw.until = 0; tw.heat = 0; tw.nextShot = now + 300;
        ctx.broadcast(towerMsg(owner, tw));
      }
      if (tw.st !== "ok") continue;
      if (tw.heat > 0 && now - tw.lastShot > HEAT_IDLE_MS) tw.heat = Math.max(0, tw.heat - dt);
      if (now < tw.nextShot) continue;
      let best = "", bestKey = 1e9;
      for (const [pid, t] of thieves.entries()) {
        if (pid === owner || !conn.has(pid)) continue;
        const dx = t.x - d.x, dy = t.y - d.y, dist = Math.hypot(dx, dy);
        if (dist > R) continue;
        if (!om.rear && dist > 0.6 && angDiff(Math.atan2(dy, dx), tw.back) <= DEAD_ARC / 2) continue;
        const key = (t.stolen ? 0 : 100) + dist;
        if (key < bestKey) { bestKey = key; best = pid; }
      }
      if (best) fire(owner, tw, best, now);
    }
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]; if (now < s.at) continue;
      shots.splice(i, 1);
      let hit = "";
      const tg = thieves.get(s.tgt);
      if (tg && conn.has(s.tgt) && now >= tg.dashUntil && Math.hypot(tg.x - s.x, tg.y - s.y) <= HIT_R) hit = s.tgt;
      else for (const [pid, t] of thieves.entries()) { if (pid === s.den || !conn.has(pid) || now < t.dashUntil) continue; if (Math.hypot(t.x - s.x, t.y - s.y) <= HIT_R) { hit = pid; break; } }
      if (!hit) continue;
      const t = thieves.get(hit)!, tp = towerPos(dens.get(s.den)!);
      const lvl = (thieves.get(s.den)?.mods.towerLvl ?? 1) - 1;
      t.slowUntil = now + SLOW_MS[lvl]; t.slowMul = SLOW_MUL[lvl];
      const kx = t.x - tp.x, ky = t.y - tp.y, kl = Math.hypot(kx, ky) || 1;
      t.x = clampW(t.x + (kx / kl) * KNOCK); t.y = clampH(t.y + (ky / kl) * KNOCK);
      ctx.broadcast({ a: "th_hit", den: s.den, pid: hit, ms: SLOW_MS[lvl], x: r1(t.x), y: r1(t.y) });
    }
  }
  function fire(owner: string, tw: Tower, tgt: string, now: number) {
    const t = thieves.get(tgt)!, tp = towerPos(dens.get(owner)!);
    const sp = speedOf(t, tgt, now), vx = t.dx * sp, vy = t.dy * sp;
    let T = Math.hypot(t.x - tp.x, t.y - tp.y) / PROJ_SPD, ax = t.x, ay = t.y;
    for (let i = 0; i < 3; i++) {
      ax = clampW(t.x + vx * (LEAD_S + T)); ay = clampH(t.y + vy * (LEAD_S + T));
      T = Math.max(0.12, Math.min(0.65, Math.hypot(ax - tp.x, ay - tp.y) / PROJ_SPD));
    }
    ax = clampW(t.x + vx * (LEAD_S + T)); ay = clampH(t.y + vy * (LEAD_S + T));
    const ms = Math.round(T * 1000);
    const om = thieves.get(owner)?.mods ?? thMods([]);
    shots.push({ den: owner, tgt, x: ax, y: ay, at: now + ms });
    ctx.broadcast({ a: "th_shot", den: owner, x0: r1(tp.x), y0: r1(tp.y), x1: r1(ax), y1: r1(ay), ms, tgt });
    // 🛡️ מצודה: ירייה כפולה על מי שסוחב גביש *שלי*
    const carried = t.stolen ? items.get(t.stolen) : null;
    if (om.fort && carried && carried.den === owner) {
      const ax2 = clampW(ax + (Math.random() - 0.5) * 0.8), ay2 = clampH(ay + (Math.random() - 0.5) * 0.8);
      shots.push({ den: owner, tgt, x: ax2, y: ay2, at: now + ms + 180 });
      ctx.broadcast({ a: "th_shot", den: owner, x0: r1(tp.x), y0: r1(tp.y), x1: r1(ax2), y1: r1(ay2), ms: ms + 180, tgt });
    }
    tw.nextShot = now + FIRE_MS[om.towerLvl - 1]; tw.lastShot = now; tw.heat += 1; tw.shots++;
    if (tw.heat >= HEAT_MAX) { tw.st = "hot"; tw.until = now + COOL_MS; tw.heat = 0; ctx.broadcast(towerMsg(owner, tw)); }
  }
  /** 🔧 מפתח שוודי: נגיעה במגדל זר מכבה אותו — בלי ערוץ, בלי זהב */
  function wrenchStep(now: number) {
    for (const [pid, t] of thieves.entries()) {
      if (!t.mods.wrench || !conn.has(pid) || now < (t.cd.wrench ?? 0)) continue;
      for (const [owner, tw] of towers.entries()) {
        if (owner === pid || tw.st === "off") continue;
        const tp = towerPos(dens.get(owner)!);
        if (Math.hypot(t.x - tp.x, t.y - tp.y) > 1.3) continue;
        tw.st = "off"; tw.until = now + WRENCH_OFF_MS; tw.heat = 0;
        t.cd.wrench = now + (thCard("wrench")!.cd ?? 20000);
        ctx.broadcast(towerMsg(owner, tw, pid));
        ctx.broadcast({ a: "th_act_done", kind: "disable", den: owner, by: pid, cost: 0 });
        bc5({ a: "th_fx", k: "wrench", pid, x: r1(tp.x), y: r1(tp.y) });
        to5(pid, { a: "th_cd", id: "wrench", readyAt: t.cd.wrench });
        break;
      }
    }
  }

  /* ---------- 🥧 עוגות ו-🍌 בננות ---------- */
  function dropBanana(x: number, y: number, by: string, now: number) {
    const b: Banana = { id: nextId++, x: clampW(x), y: clampH(y), by, until: now + BANANA_LIFE };
    bananas.push(b);
    bc5({ a: "th_banana", id: b.id, x: r1(b.x), y: r1(b.y), by });
  }
  function projectilesStep(now: number) {
    for (let i = pies.length - 1; i >= 0; i--) {
      const p = pies[i];
      const u = Math.min(1, (now - p.at) / PIE_MS);
      const px = p.x + p.dx * PIE_SPD * (PIE_MS / 1000) * u, py = p.y + p.dy * PIE_SPD * (PIE_MS / 1000) * u;
      for (const [pid, t] of thieves.entries()) {
        if (pid === p.by || !conn.has(pid) || now < t.bubbleUntil) continue;
        if (Math.hypot(t.x - px, t.y - py) <= PIE_R) { stun(pid, t, now, PIE_STUN, "pie"); p.hit = true; break; }
      }
      if (p.hit || now >= p.until) pies.splice(i, 1);
    }
    for (let i = bananas.length - 1; i >= 0; i--) {
      const b = bananas[i];
      if (now >= b.until) { bananas.splice(i, 1); bc5({ a: "th_banana_gone", id: b.id }); const o = thieves.get(b.by); if (o) o.bananas = Math.max(0, o.bananas - 1); continue; }
      for (const [pid, t] of thieves.entries()) {
        if (pid === b.by || !conn.has(pid) || now < t.stunUntil) continue;
        if (Math.hypot(t.x - b.x, t.y - b.y) <= BANANA_R) {
          stun(pid, t, now, BANANA_STUN, "banana");
          bananas.splice(i, 1); bc5({ a: "th_banana_gone", id: b.id, by: pid });
          const o = thieves.get(b.by); if (o) o.bananas = Math.max(0, o.bananas - 1);
          break;
        }
      }
    }
    // 🍌 סוחב שלל עם קלף בננה מפזר בננות
    for (const [pid, t] of thieves.entries()) {
      if (!t.mods.banana || !t.stolen || !conn.has(pid) || t.bananas >= BANANA_MAX || now - t.bananaAt < BANANA_EVERY) continue;
      t.bananaAt = now; t.bananas++;
      dropBanana(t.x - t.fx * 0.8, t.y - t.fy * 0.8, pid, now);
    }
  }
  /* ---------- 🔘 כפתורים ---------- */
  function tryUse(pid: string, t: Thief, id: string, now: number) {
    if (phase !== "run" || now < goAt) return;
    const card = thCard(id); if (!card || card.kind !== "button" || !t.cards.includes(id)) return;
    if (now < (t.cd[id] ?? 0)) return;
    if (now < t.stunUntil) return;
    if (id === "dash") {
      const dx = t.dx || t.dy ? t.dx : t.fx, dy = t.dx || t.dy ? t.dy : t.fy, l = Math.hypot(dx, dy) || 1;
      t.dashUntil = now + DASH_MS; t.dashDx = dx / l; t.dashDy = dy / l;
      bc5({ a: "th_fx", k: "dash", pid, ms: DASH_MS, x: r2(t.dashDx), y: r2(t.dashDy) });
    } else if (id === "bubble") {
      t.bubbleUntil = now + BUBBLE_MS;
      bc5({ a: "th_fx", k: "bubble", pid, ms: BUBBLE_MS });
    } else if (id === "pie") {
      const dx = t.dx || t.fx, dy = t.dy || (t.dx ? 0 : t.fy), l = Math.hypot(dx, dy) || 1;
      const p: Pie = { id: nextId++, by: pid, x: t.x, y: t.y, dx: dx / l, dy: dy / l, at: now, until: now + PIE_MS, hit: false };
      pies.push(p);
      const dist = PIE_SPD * (PIE_MS / 1000);
      bc5({ a: "th_pie", id: p.id, by: pid, x0: r1(t.x), y0: r1(t.y), x1: r1(clampW(t.x + p.dx * dist)), y1: r1(clampH(t.y + p.dy * dist)), ms: PIE_MS });
    } else if (id === "ghost") {
      t.ghostUntil = now + GHOST_MS;
      bc5({ a: "th_fx", k: "ghost", pid, ms: GHOST_MS });
    } else return;
    t.cd[id] = now + (card.cd ?? 5000);
    to5(pid, { a: "th_cd", id, readyAt: t.cd[id] });
  }

  /* ---------- ⏸ העצירה והמדף ---------- */
  const ranked = () => [...thieves.entries()].sort((a, b) => b[1].gold - a[1].gold).map(([pid]) => pid);
  function offer(pid: string, t: Thief, kk: number, discount: boolean): ThShelfCard[] {
    const golds = [...thieves.values()].map((x) => x.gold).sort((a, b) => a - b);
    const median = golds.length ? golds[Math.floor(golds.length / 2)] : 0;
    const has = (id: string) => t.cards.filter((c) => c === id).length;
    const buttons = thButtons(t.cards).length;
    const ok = (c: ThCard) => {
      if (has(c.id) >= (c.stack ?? 1)) return false;
      if (c.needs && !c.needs.every((n) => has(n) > 0)) return false;
      if (c.evo && !(has(c.evo[0]) > 0 && has(c.evo[1]) > 0)) return false;
      if (!c.evo && c.rarity === "e") return false;
      if (c.kind === "button" && buttons >= 2 && !c.evo) return false;
      if (c.rarity === "r" && kk < 3) return false;                          // נדירים מהעצירה השלישית
      if (c.rarity === "x" && kk < 2) return false;                          // ג'וקרים מהשנייה
      return true;
    };
    const rank = ranked(); const n = rank.length; const idx = rank.indexOf(pid);
    const low = n >= 3 && idx >= n - Math.ceil(n / 3), high = n >= 3 && idx < Math.ceil(n / 3);
    const weight = (c: ThCard) => (c.pos === "low" && low ? 2 : c.pos === "high" && high ? 2 : c.pos === "low" && high ? 0.5 : 1) * (c.rarity === "c" ? 1 : c.rarity === "u" ? 0.7 : 0.5);
    const pickFrom = (pool: ThCard[], taken: Set<string>): ThCard | null => {
      const cands = pool.filter((c) => !taken.has(c.id) && ok(c));
      if (!cands.length) return null;
      let tot = 0; for (const c of cands) tot += weight(c);
      let r = Math.random() * tot;
      for (const c of cands) { r -= weight(c); if (r <= 0) return c; }
      return cands[cands.length - 1];
    };
    const taken = new Set<string>();
    const out: ThCard[] = [];
    const evo = CARD_POOL.find((c) => c.evo && ok(c));
    const pCount = t.cards.filter((id) => thCard(id)?.track === "p").length, hCount = t.cards.filter((id) => thCard(id)?.track === "h").length;
    const myTrack = hCount > pCount ? "h" : "p";
    // 1 🦝 · 2 🏠 · 3 המסלול שלך (אבולוציה אם יש) · 4 ג'וקר (מהעצירה השנייה; לפני כן עוד 🦝/🏠)
    const slots: (ThCard | null)[] = [
      pickFrom(CARD_POOL.filter((c) => c.track === "p" && !c.evo), taken),
      null, null, null,
    ];
    if (slots[0]) taken.add(slots[0].id);
    slots[1] = pickFrom(CARD_POOL.filter((c) => c.track === "h" && !c.evo), taken); if (slots[1]) taken.add(slots[1].id);
    slots[2] = evo ?? pickFrom(CARD_POOL.filter((c) => c.track === myTrack && !c.evo), taken); if (slots[2]) taken.add(slots[2].id);
    slots[3] = pickFrom(CARD_POOL.filter((c) => (kk >= 2 ? c.track === "j" : c.track !== "j") && !c.evo), taken);
    if (!slots[3]) slots[3] = pickFrom(CARD_POOL.filter((c) => !c.evo), taken);
    for (const s of slots) if (s && !out.some((o) => o.id === s.id)) out.push(s);
    // אין קלף מת: אם המדף ריק — קלף נחמה חינם
    const cards: ThShelfCard[] = out.map((c) => ({ id: c.id, price: thPrice(c, kk, median, discount) }));
    if (cards.length && !cards.some((c) => c.price <= t.gold)) {
      const cheapest = cards.reduce((a, b) => (b.price < a.price ? b : a));
      cheapest.price = 0;                                                    // 🎁 על חשבון הבית
    }
    return cards;
  }
  function startPause(now: number) {
    phase = "pause"; pauseAt = now; k++;
    draftAt = pauseAt + T.freezeMs; revealAt = draftAt + T.draftMs; resumeAt = pauseAt + T.pauseMs; revealCued = false;
    leftAtPause = Math.max(0, Math.round((endsAt - now) / 1000));
    for (const t of thieves.values()) { t.dx = 0; t.dy = 0; t.bought = null; }
    for (const [owner, tw] of towers.entries()) if (thieves.get(owner)?.mods.mine) tw.mineArmed = true;
    const rank = ranked(), n = rank.length;
    shelves.clear();
    for (const [pid, t] of thieves.entries()) {
      const discount = n >= 3 && rank.indexOf(pid) >= n - Math.ceil(n / 3);
      const cards = offer(pid, t, k, discount);
      shelves.set(pid, cards);
      to5(pid, { a: "th_shelf", k, cards, until: revealAt, discount });
    }
  }
  function tryBuy(pid: string, t: Thief, id: string, now: number) {
    if (phase !== "pause" || now < draftAt || now >= revealAt || t.bought) return;
    const sc = shelves.get(pid)?.find((c) => c.id === id); if (!sc) return;
    if (t.gold < sc.price) { nope(pid, "gold"); return; }
    t.gold -= sc.price; t.spent += sc.price; t.bought = id;
    t.cards.push(id); t.mods = thMods(t.cards);
    bc5({ a: "th_bought", pid, id, price: sc.price });
    bc5({ a: "th_cards", pid, cards: t.cards });
  }
  /** ג'וקרים מיידיים — מופעלים ברגע החזרה למשחק */
  function applyInstant(pid: string, id: string, now: number) {
    if (id === "rain") {
      const list: [number, number, number, number][] = [];
      for (let i = 0; i < RAIN_N; i++) {
        const it: Item = { id: nextId++, lvl: 0, sinceLvl: now, v: 1 + (Math.random() < 0.3 ? 1 : 0), den: "", carrier: "", gx: clampW(3 + Math.random() * (TH_W - 6)), gy: clampH(3 + Math.random() * (TH_H - 6)), state: "ground", nugget: true };
        items.set(it.id, it); list.push([it.id, r1(it.gx), r1(it.gy), it.v]);
      }
      bc5({ a: "th_rain", items: list });
    } else if (id === "bull") { bullUntil = now + BULL_MS; bc5({ a: "th_bull", ms: BULL_MS }); }
    else if (id === "dark") { bc5({ a: "th_dark", ms: DARK_MS }); }
  }
  /** החזרה: כל הטיימרים זזים באורך העצירה — כאילו לא הייתה */
  function resume(now: number) {
    const dms = now - pauseAt;
    const b = (v: number) => (v ? v + dms : v);
    for (const t of thieves.values()) {
      t.rageUntil = b(t.rageUntil); t.slowUntil = b(t.slowUntil); t.stunUntil = b(t.stunUntil); t.dashUntil = 0; t.bubbleUntil = b(t.bubbleUntil); t.ghostUntil = b(t.ghostUntil);
      t.mineAt = b(t.mineAt); t.stealCd = b(t.stealCd); t.dropLockUntil = b(t.dropLockUntil); t.safeUntil = Math.max(b(t.safeUntil), now + RESUME_GRACE); t.dcDropAt = b(t.dcDropAt);
      t.bananaAt = b(t.bananaAt); t.honeyAt = b(t.honeyAt);
      for (const id of Object.keys(t.cd)) t.cd[id] = b(t.cd[id]);
    }
    for (const tw of towers.values()) { tw.until = b(tw.until); tw.nextShot = b(tw.nextShot); tw.lastShot = b(tw.lastShot); }
    for (const it of items.values()) it.sinceLvl = b(it.sinceLvl);
    for (const s of shots) s.at = b(s.at);
    for (const p of pies) { p.at = b(p.at); p.until = b(p.until); }
    for (const bn of bananas) bn.until = b(bn.until);
    for (const [den, at] of bellAt.entries()) bellAt.set(den, b(at));
    bullUntil = b(bullUntil);
    endsAt += dms;
    phase = "run";
    nextPauseAt = k < T.pauses ? now + T.segMs : 0; pauseCued = false;
    for (const [pid, t] of thieves.entries()) if (t.bought && thCard(t.bought)?.kind === "instant") applyInstant(pid, t.bought, now);
    bc5({ a: "th_resume", endsAt, towers: towersSync(), nextPauseAt });
  }
  function pauseStep(now: number) {
    if (!pauseCued && nextPauseAt && now >= nextPauseAt - 400) {
      pauseCued = true;
      const at = nextPauseAt;
      const gold: Record<string, number> = {}; for (const [pid, t] of thieves.entries()) gold[pid] = Math.round(t.gold);
      cue5(Math.max(50, at - now), { a: "th_pause", k: k + 1, at, draftAt: at + T.freezeMs, revealAt: at + T.freezeMs + T.draftMs, resumeAt: at + T.pauseMs, rank: ranked(), gold });
    }
    if (phase === "run" && nextPauseAt && now >= nextPauseAt) startPause(now);
    if (phase === "pause") {
      if (!revealCued && now >= revealAt - 400) {
        revealCued = true;
        const picks: Record<string, string | null> = {}; for (const [pid, t] of thieves.entries()) picks[pid] = t.bought;
        cue5(Math.max(50, revealAt - now), { a: "th_reveal", k, picks, resumeAt });
      }
      if (now >= resumeAt) resume(now);
    }
  }

  /* ---------- טיק ---------- */
  let tickErrors = 0;
  function step() {
    try { stepBody(); tickErrors = 0; }
    catch (e) {
      tickErrors++;
      console.error(`[thieves] tick error #${tickErrors}:`, e);
      if (phase === "done") return;
      if (tickErrors >= 30) { try { finish(); } catch (e2) { console.error("[thieves] finish failed", e2); } return; }
      loop = ctx.timer(TICK, step);
    }
  }
  function stepBody() {
    const now = ctx.now();
    const dt = Math.min(0.2, (now - lastTick) / 1000) || TICK / 1000;
    lastTick = now;
    if (phase === "done") return;
    conn = new Set(alive());
    pauseStep(now);
    const running = phase === "run" && now >= goAt;

    for (const [pid, t] of thieves.entries()) {
      if (!conn.has(pid)) {
        t.dx = 0; t.dy = 0;
        if (t.stolen && running) {
          if (!t.dcDropAt) t.dcDropAt = now + DC_DROP_MS;
          else if (now >= t.dcDropAt) { const it = items.get(t.stolen); if (it) dropAt(t, it, now); else t.stolen = 0; t.dcDropAt = 0; }
        }
        continue;
      }
      t.dcDropAt = 0;
      if (!running) continue;
      let len = Math.hypot(t.dx, t.dy);
      const dashing = now < t.dashUntil;
      if (dashing || len > 0) {
        if (len > 1) { t.dx /= len; t.dy /= len; len = 1; }
        if (len > 0) { t.fx = t.dx; t.fy = t.dy; }
        // 💨 דאש: תנועה בכיוון הדאש במהירות ×2.4, בלי קשר לג'ויסטיק — אותה נוסחה בלקוח
        const s = dashing ? SPD * t.mods.speed * DASH_MUL : speedOf(t, pid, now);
        const mx = dashing ? t.dashDx : t.dx, my = dashing ? t.dashDy : t.dy;
        t.x = clampW(t.x + mx * s * dt);
        t.y = clampH(t.y + my * s * dt);
        const r = mtnR();
        if (r > 0) {
          const ddx = t.x - mtn.x, ddy = t.y - mtn.y, d = Math.hypot(ddx, ddy);
          if (d < r && d > 0.001) { t.x = clampW(mtn.x + (ddx / d) * r); t.y = clampH(mtn.y + (ddy / d) * r); }
        }
      }
      tryMine(pid, t, now);
      if (atDen(t, pid)) deposit(pid, t, now);
    }

    if (running) {
      towersStep(dt, now);
      wrenchStep(now);
      projectilesStep(now);
      tackle(now);
      pickup(now);
      economy(dt, now);
      if (!alarmed && endsAt - now <= T.alarmMs) { alarmed = true; ctx.cue(400, { a: "th_alarm", secs: Math.round(T.alarmMs / 1000) }); }
      if (!horned && endsAt - now <= 600) { horned = true; ctx.cue(Math.max(350, endsAt - now), { a: "th_horn" }); }
    }

    if (now - lastPos >= POS_EVERY - 8) {
      lastPos = now;
      ctx.broadcast({
        a: "th_pos", t: now,
        ps: [...thieves.entries()].filter(([p]) => conn.has(p)).map(([pid, t]) =>
          [pid, r1(t.x), r1(t.y), t.carry, t.stolen ? 1 : 0, Math.round(t.gold), now < t.rageUntil ? 1 : 0, r2(t.dx), r2(t.dy), now < t.slowUntil ? 1 : 0] as
          [string, number, number, number, number, number, number, number, number, number]),
        mtn: mtn.left,
        left: phase === "pause" ? leftAtPause : Math.max(0, Math.round((endsAt - now) / 1000)),
      });
    }

    if (phase === "run" && now >= endsAt) phase = "over";
    if (phase === "over" && now >= endsAt + HORN_HOLD) { finish(); return; }
    nextTick += TICK;
    if (nextTick < now - 1000) nextTick = now;
    loop = ctx.timer(Math.max(0, nextTick - now), step);
  }

  function finish() {
    phase = "done";
    if (loop) clearTimeout(loop);
    const scores: Record<string, number> = {};
    for (const [pid, t] of thieves.entries()) scores[pid] = Math.round(t.gold);
    const order = [...thieves.entries()].sort((a, b) => b[1].gold - a[1].gold);
    const total = order.reduce((s, [, t]) => s + t.gold, 0);
    ctx.end({
      title: `🥷 הצפירה! ${Math.round(total).toLocaleString()} זהב נשאר בחדר`,
      winnerId: order[0]?.[0],
      scores,
      facts: Object.fromEntries([...thieves.entries()].map(([pid, t]) => [pid, { points: Math.round(t.gold), spent: Math.round(t.spent), cards: t.cards.length, thefts: t.thefts, robbed: t.robbed, tackles: t.tackles }])),
    });
  }

  const initMsg = () => ({
    a: "th_init" as const,
    w: TH_W, h: TH_H,
    mtn: { x: mtn.x, y: mtn.y, total: mtn.total },
    dens: [...dens.entries()].map(([pid, d]) => [pid, d.x, d.y, Math.round(backOf(d) * 100) / 100] as [string, number, number, number]),
    players: [...dens.keys()],
    goAt, endsAt,
    tower: { r: TW_R, arc: DEAD_ARC, disable: 0, destroy: 0 },
    timing: T, nextPauseAt, k,
  });
  const towersSync = () => [...towers.entries()].map(([den, tw]) => [den, tw.st, tw.until] as [string, TowerSt, number]);
  const cardsSync = () => Object.fromEntries([...thieves.entries()].map(([pid, t]) => [pid, t.cards]));

  return {
    onStart() {
      const ids = alive();
      ids.forEach((pid, i) => { const [ax, ay] = ANCHORS[i % ANCHORS.length]; dens.set(pid, { x: ax, y: ay }); });
      mtn.total = (cfg.mtnPer ?? MTN_PER) * Math.max(2, ids.length);
      mtn.left = mtn.total;
      for (const pid of ids) { thieves.set(pid, newThief(pid)); towers.set(pid, newTower(pid)); }
      const now = ctx.now();
      lastTick = now; nextTick = now;
      goAt = now + GO_DELAY;
      endsAt = goAt + ROUND_MS;
      nextPauseAt = T.pauses > 0 ? goAt + T.segMs : 0;
      ctx.broadcast(initMsg());
      if (cfg.startCards) bc5({ a: "th_home_cards", cards: cardsSync() });
      ctx.cue(GO_DELAY, { a: "th_go" });
      loop = ctx.timer(TICK, step);
    },

    onRejoin(pid: string) {
      if (phase === "done") return;
      if (!dens.has(pid)) {
        const used = new Set([...dens.values()].map((d) => `${d.x},${d.y}`));
        const spot = ANCHORS.find(([ax, ay]) => !used.has(`${ax},${ay}`));
        if (!spot) { ctx.sendTo(pid, initMsg()); return; }      // אין מאורה פנויה — צופה (8 זה הגבול)
        dens.set(pid, { x: spot[0], y: spot[1] });
        thieves.set(pid, newThief(pid));
        towers.set(pid, newTower(pid));
        ctx.broadcast(initMsg());
      } else {
        ctx.sendTo(pid, initMsg());
      }
      ctx.sendTo(pid, {
        a: "th_sync",
        mtn: mtn.left,
        items: [...items.values()].filter((it) => it.state === "den").map((it) => [it.id, it.den, it.lvl, it.sinceLvl, it.v] as [number, string, number, number, number]),
        ground: [...items.values()].filter((it) => it.state === "ground").map((it) => [it.id, r1(it.gx), r1(it.gy), it.nugget ? -1 : it.lvl, it.v] as [number, number, number, number, number]),
        carried: [...items.values()].filter((it) => it.state === "carried").map((it) => [it.id, it.carrier, it.lvl, it.v] as [number, string, number, number]),
        towers: towersSync(),
        endsAt,
      });
      to5(pid, { a: "th_home_cards", cards: cardsSync() });
      if (phase === "pause") {
        const sh = shelves.get(pid);
        to5(pid, { a: "th_pause", k, at: pauseAt, draftAt, revealAt, resumeAt, rank: ranked(), gold: {} });
        if (sh) to5(pid, { a: "th_shelf", k, cards: sh, until: revealAt, discount: false });
      }
    },

    onMessage(pid: string, d: GameClientMsg) {
      const t = thieves.get(pid); if (!t || phase === "done" || phase === "over") return;
      const msg = d as { a: string; dx?: number; dy?: number; id?: string };
      const now = ctx.now();
      if (msg.a === "th_dir") {
        const dx = Math.max(-1, Math.min(1, msg.dx ?? 0)), dy = Math.max(-1, Math.min(1, msg.dy ?? 0));
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
        if (phase === "pause") return;                          // קפואים
        t.dx = dx; t.dy = dy;
      } else if (msg.a === "th_steal") {
        trySteal(pid, t, now);
      } else if (msg.a === "th_buy") {
        if (typeof msg.id === "string") tryBuy(pid, t, msg.id, now);
      } else if (msg.a === "th_use") {
        if (typeof msg.id === "string") tryUse(pid, t, msg.id, now);
      }
    },

    onLeave(pid: string, permanent?: boolean) {
      const t = thieves.get(pid);
      if (permanent && t?.stolen) {
        const it = items.get(t.stolen);
        if (it) dropAt(t, it, ctx.now()); else t.stolen = 0;
      }
      ctx.broadcast({ a: "th_left", pid });
    },

    dispose() { if (loop) clearTimeout(loop); },
  };
}
