/**
 * הגנבים 🥷 — הליבה + שכבה 2/א: המגדל וסולם הנגדים.
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
 * שכבה 2/א — 🗼 המגדל (3.9): לכל מאורה מגדל בסיסי מהשנייה הראשונה. הוא לא הורג אף אחד —
 * הוא קונה זמן: יורה חלוק כל 1.5ש' על הזר הקרוב בטווח (סוחב שלל קודם), מכוון קדימה לפי
 * כיוון הריצה (פנייה חדה מפספסת — הנגד החינמי), פגיעה = ‎-30% מהירות ל-2ש' + הדף קטן.
 * שטח מת של 60° בגב המאורה (הצד הרחוק מההר) · חימום אחרי 8 יריות ⇒ 4ש' קירור.
 * נגדים בתשלום מהניקוד: השבתה (250, ערוץ 1.5ש', 15ש' כבוי) · הריסה (750, ערוץ 3ש' תחת אש —
 * יריות לא קוטעות, מגע של שחקן כן) · בנייה מחדש בבית בלחיצה אחת (חצי מההשקעה; במגדל בסיסי — חינם, 3ש').
 * הסקאלה: ההכנסה ירדה פי 5 (RATE) כדי שמחירי החנות (100–1,000) יהיו אמיתיים והניקוד יהיה באלפים.
 */
import type { GameCtx, GameInstance } from "../engine";
import type { GameClientMsg } from "../../../shared/protocol";

const TICK = 50;                    // 20Hz סימולציה
const POS_EVERY = 50;               // 20Hz שידור מיקומים — חצי מהדילאיי של "האחרים"
export const TH_W = 46;             // רוחב העולם בתאים
export const TH_H = 30;
const SPD = 6.0;                    // תאים לשנייה
const CARRY_CAP = 3;                // כמה צ'אנקים סוחבים מההר
const CARRY_SLOW = 0.05;            // האטה לכל צ'אנק
const STOLEN_SLOW = 0.74;           // סוחב שלל גנוב — איטי, "עומס"
const RAGE_MUL = 1.4;               // הזעם של הנשדד
const RAGE_SECS = 15;
const MINE_MS = 2500;               // צ'אנק לכל 2.5 שניות של חציבה
const MTN_PER = 27;                 // צ'אנקים לשחקן: ~9 נסיעות = ~9 אבנים בכל מאורה
const TIER_DEEP = 0.4, TIER_CORE = 0.15;   // מתחת ל-40% מההר הצ'אנקים שווים ×2, מתחת ל-15% — ×3
const DEN_R = 2.0;                  // רדיוס המאורה
const STEAL_TOL = 0.6;              // סובלנות לגניבה: המיקום בשרת ישן ב-~100ms מזה שהשחקן רואה
const TOUCH_R = 1.1;                // מגע שמפיל
const PICK_R = 0.9;                 // הרמת שלל מהרצפה
const GRAB_GRACE = 600;             // חסד אחרי גניבה — צעד החוצה לפני שאפשר להפיל
const PICK_GRACE = 700;             // חסד אחרי הרמה מהרצפה
const DROP_LOCK = 1200;             // מי שהופל לא חוטף מיד בחזרה
const DC_DROP_MS = 4000;            // סוחב שלל שהתנתק — השלל נופל אחרי 4 שניות
const GO_DELAY = 1500;              // "צאו!" משותף לכולם רגע אחרי ההתחלה
const HORN_HOLD = 900;              // הצפירה נשמעת אצל כולם לפני שהמסך מתחלף
const BELL_EVERY = 8000;            // פעמון הבשלה אחד למאורה
const RATE = [0.2, 0.6, 1.2];       // ⚡ לשנייה ליחידת ערך לפי דרגת הבשלה (÷5 מהגרייבוקס — הניקוד באלפים, המחירים אמיתיים)
const ALARM_MULT = 3;

/* ---------- 🗼 המגדל ---------- */
const TOWER_R = 5.5;                // רדיוס המגדל סביב המאורה (≈1.4 רוחב-מאורה). בחוץ הוא לא קיים
const DEAD_ARC = Math.PI / 3;       // 60° שטח מת בגב המאורה — הצד הרחוק מההר (אותה נוסחה בלקוח)
const FIRE_MS = 1500;               // ירייה כל 1.5 שניות
const PROJ_SPD = 13;                // מהירות החלוק (תאים/שנייה)
const LEAD_S = 0.32;                // ניבוי קדימה לפי כיוון הריצה — פנייה חדה מפספסת (הנגד החינמי)
const HIT_R = 0.8;                  // רדיוס פגיעה סביב נקודת הנחיתה
const SLOW_MS = 2000, SLOW_MUL = 0.7;   // פגיעה: ‎-30% מהירות ל-2 שניות
const KNOCK = 0.5;                  // הדף קטן מהמגדל והלאה
const HEAT_MAX = 8, COOL_MS = 4000; // 8 יריות ⇒ 4 שניות קירור
const HEAT_IDLE_MS = 2000;          // בלי יריות 2 שניות — החום יורד (1 לשנייה)
const ACT_R = DEN_R + 0.9;          // מרחק פעולה על מגדל זר (השבתה/הריסה)
const DISABLE_COST = 250, DISABLE_MS = 1500, OFF_MS = 15000;
const DESTROY_COST = 750, DESTROY_MS = 3000;
const BUILD_MS = 3000;              // בנייה מחדש — לחיצה אחת, ואז 3 שניות פטישים
const CHAN_GRACE = 250;             // רבע שנייה אחרי תחילת הערוץ — תזוזה עוד לא מבטלת (האגודל עוד על הג'ויסטיק)

type TowerSt = "ok" | "hot" | "off" | "ruin" | "build";
type ActKind = "disable" | "destroy" | "rebuild";

interface Thief {
  x: number; y: number; dx: number; dy: number;
  carry: number;                    // צ'אנקים מההר
  carryVal: number;                 // ערך הצ'אנקים ביד — הופך לערך האבן בהפקדה
  stolen: number;                   // id של שלל גנוב שהוא סוחב (0 = לא)
  gold: number;                     // הזהב שנצבר — זה הניקוד
  spent: number;                    // כמה מהזהב נשרף על נגדים/שדרוגים ("עבר דרכך")
  rageUntil: number;
  slowUntil: number;                // פגיעת מגדל — האטה
  mineAt: number; stealCd: number;
  dropLockId: number; dropLockUntil: number;
  safeUntil: number;                // חסינות קצרה להפלה אחרי גניבה/הרמה
  dcDropAt: number;                 // מתי השלל של מנותק נופל (0 = מחובר)
  chan: { kind: "disable" | "destroy"; den: string; startedAt: number; endsAt: number; cost: number } | null;   // ערוץ פעולה על מגדל זר
  thefts: number; robbed: number; tackles: number;
}
/** פריט: או במאורה (den=pid), או נסחב (carrier=pid), או על הרצפה (ground) */
interface Item {
  id: number; lvl: number; sinceLvl: number;
  v: number;                        // ערך האבן: סכום שכבות הצ'אנקים (1–9). ההכנסה = RATE[lvl] × v
  den: string; carrier: string; gx: number; gy: number; state: "den" | "carried" | "ground";
}
interface Tower {
  st: TowerSt; until: number;       // מצב זמני (hot/off/build) ומתי הוא נגמר
  heat: number; nextShot: number; lastShot: number; shots: number;
  invested: number;                 // כמה הושקע בשדרוגים (שלב B) — בנייה מחדש עולה חצי
  back: number;                     // זווית מרכז השטח המת (הגב — הצד הרחוק מההר)
}
interface Shot { den: string; tgt: string; x: number; y: number; at: number }

export function createThieves(ctx: GameCtx): GameInstance {
  const cfg = (ctx.config ?? {}) as { roundMs?: number; ripen1Ms?: number; ripen2Ms?: number; mtnPer?: number; startGold?: number; towerR?: number };
  const ROUND_MS = cfg.roundMs ?? 8 * 60 * 1000;
  const RIPEN1 = cfg.ripen1Ms ?? 30_000;
  const RIPEN2 = cfg.ripen2Ms ?? 90_000;
  const TW_R = cfg.towerR ?? TOWER_R;

  const thieves = new Map<string, Thief>();
  const items = new Map<number, Item>();
  const dens = new Map<string, { x: number; y: number }>();
  const towers = new Map<string, Tower>();
  const shots: Shot[] = [];
  const bellAt = new Map<string, number>();   // הפעמון האחרון לכל מאורה
  let nextId = 1;

  const mtn = { x: TH_W / 2, y: TH_H / 2, total: 0, left: 0 };
  let phase: "run" | "over" | "done" = "run";
  let goAt = 0, endsAt = 0;
  let alarmed = false, emptied = false, firstSteal = false, horned = false;
  let loop: NodeJS.Timeout | null = null;
  let lastPos = 0, lastTick = 0, nextTick = 0;
  let conn = new Set<string>();

  const alive = () => ctx.participants().filter((p) => p.connected).map((p) => p.id);
  const clampW = (v: number) => Math.max(1, Math.min(TH_W - 1, v));
  const clampH = (v: number) => Math.max(1, Math.min(TH_H - 1, v));
  const mtnR = () => (mtn.left <= 0 ? 0 : 1.6 + 2.8 * Math.sqrt(mtn.left / Math.max(1, mtn.total)));
  const rate = (lvl: number) => RATE[Math.min(lvl, RATE.length - 1)];
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const r2 = (v: number) => Math.round(v * 20) / 20;
  const angDiff = (a: number, b: number) => { let d = Math.abs(a - b) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d; return d; };
  /** הגב של המאורה = הכיוון ממרכז ההר החוצה — שם השטח המת. אותה נוסחה בלקוח */
  const backOf = (d: { x: number; y: number }) => Math.atan2(d.y - mtn.y, d.x - mtn.x);
  /** המגדל עומד ליד המאורה, בצד שפונה להר (אותו היסט בלקוח) */
  const towerPos = (d: { x: number; y: number }) => { const side = Math.sign(mtn.x - d.x) || 1; return { x: d.x + 2.1 * side, y: d.y - 0.5 }; };
  const nope = (pid: string, why: "far" | "empty" | "busy" | "gold" | "tower") => ctx.sendTo(pid, { a: "th_nope", why });

  /** שמונה עוגני מאורות סביב השדה — פינות קודם, אחר כך אמצעי צלעות */
  const ANCHORS: [number, number][] = [
    [5, 5], [TH_W - 5, TH_H - 5], [TH_W - 5, 5], [5, TH_H - 5],
    [TH_W / 2, 3.5], [TH_W / 2, TH_H - 3.5], [3.5, TH_H / 2], [TH_W - 3.5, TH_H / 2],
  ];

  function newThief(pid: string): Thief {
    const d = dens.get(pid)!;
    return {
      x: d.x, y: d.y, dx: 0, dy: 0, carry: 0, carryVal: 0, stolen: 0, gold: cfg.startGold ?? 0, spent: 0,
      rageUntil: 0, slowUntil: 0, mineAt: 0, stealCd: 0, dropLockId: 0, dropLockUntil: 0, safeUntil: 0, dcDropAt: 0, chan: null,
      thefts: 0, robbed: 0, tackles: 0,
    };
  }
  function newTower(pid: string): Tower {
    return { st: "ok", until: 0, heat: 0, nextShot: 0, lastShot: 0, shots: 0, invested: 0, back: backOf(dens.get(pid)!) };
  }
  /** המהירות — אותה נוסחה בדיוק בלקוח (ניבוי) */
  function speedOf(t: Thief, now: number) {
    let s = SPD * (1 - CARRY_SLOW * t.carry);
    if (t.stolen) s *= STOLEN_SLOW;
    if (now < t.rageUntil) s *= RAGE_MUL;
    if (now < t.slowUntil) s *= SLOW_MUL;
    return s;
  }
  const towerMsg = (den: string, tw: Tower, by?: string) => ({ a: "th_tower" as const, den, st: tw.st, until: tw.until || undefined, by });

  /* ---------- חציבה והפקדה ---------- */
  function tryMine(pid: string, t: Thief, now: number) {
    if (t.stolen || t.carry >= CARRY_CAP || mtn.left <= 0) return;
    if (Math.hypot(t.x - mtn.x, t.y - mtn.y) > mtnR() + 1.0) return;
    if (now < t.mineAt) return;
    t.mineAt = now + MINE_MS;
    const frac = mtn.left / Math.max(1, mtn.total);
    const tier = frac <= TIER_CORE ? 3 : frac <= TIER_DEEP ? 2 : 1;
    t.carry++; t.carryVal += tier; mtn.left--;
    ctx.broadcast({ a: "th_mine", pid, carry: t.carry, left: mtn.left, tier });
    // ההר נגמר — רגע משותף: כולם רואים ושומעים את זה יחד
    if (mtn.left <= 0 && !emptied) { emptied = true; ctx.cue(400, { a: "th_empty" }); }
  }

  function atDen(t: Thief, pid: string) {
    const d = dens.get(pid); if (!d) return false;
    return Math.hypot(t.x - d.x, t.y - d.y) <= DEN_R;
  }

  function deposit(pid: string, t: Thief, now: number) {
    // הצ'אנקים שביד מתמזגים לאבן אחת — נסיעה אחת = אבן אחת, וערכה לפי השכבות שנחצבו
    if (t.carry > 0) {
      const it: Item = { id: nextId++, lvl: 0, sinceLvl: now, v: Math.max(1, t.carryVal), den: pid, carrier: "", gx: 0, gy: 0, state: "den" };
      items.set(it.id, it);
      t.carry = 0; t.carryVal = 0;
      ctx.broadcast({ a: "th_dep", pid, ids: [it.id], v: it.v });
    }
    // שלל גנוב שהגיע הביתה — עכשיו הוא שלך
    if (t.stolen) {
      const it = items.get(t.stolen);
      if (it) {
        const from = it.den;                 // הבעלים הקודם (נשאר עד הרגע הזה לצורך ההצגה)
        it.den = pid; it.carrier = ""; it.state = "den"; it.sinceLvl = now;
        if (from !== pid) t.thefts++;
        ctx.broadcast({ a: "th_home", id: it.id, by: pid, from, lvl: it.lvl });
      }
      t.stolen = 0;
    }
  }

  /* ---------- גניבה ---------- */
  function trySteal(pid: string, t: Thief, now: number) {
    if (phase !== "run" || now < goAt) return;
    if (t.stolen || t.chan) { nope(pid, "busy"); return; }
    if (now < t.stealCd) return;
    // המאורה הזרה הקרובה שיש בה משהו. סובלנות: המיקום כאן מאחר ב-~100ms לזה שעל המסך
    let victim = "", vd = 1e9, near = false;
    for (const [p2, d] of dens.entries()) {
      if (p2 === pid) continue;
      const dd = Math.hypot(t.x - d.x, t.y - d.y);
      if (dd > DEN_R + STEAL_TOL) continue;
      near = true;
      if (dd < vd && [...items.values()].some((it) => it.state === "den" && it.den === p2)) { vd = dd; victim = p2; }
    }
    if (!victim) { nope(pid, near ? "empty" : "far"); t.stealCd = now + 250; return; }
    // הפריט הכי בשל, ואם שווים — הוותיק
    const pool = [...items.values()].filter((it) => it.state === "den" && it.den === victim);
    pool.sort((a, b) => b.lvl - a.lvl || b.v - a.v || a.sinceLvl - b.sinceLvl);
    const it = pool[0];
    it.lvl = Math.max(0, it.lvl - 1);        // "התנער בדרך" — יורד דרגה אחת
    it.sinceLvl = now; it.carrier = pid; it.state = "carried";
    // it.den נשאר הבעלים הקודם עד שהשלל מגיע לבית של מישהו — ככה יודעים ממי נגנב
    t.stolen = it.id; t.stealCd = now + 1000; t.safeUntil = now + GRAB_GRACE;
    const v = thieves.get(victim);
    if (v) { v.robbed++; v.rageUntil = now + RAGE_SECS * 1000; ctx.broadcast({ a: "th_rage", pid: victim, secs: RAGE_SECS }); }
    ctx.broadcast({ a: "th_grab", id: it.id, by: pid, from: victim, lvl: it.lvl, v: it.v });
    // הגניבה הראשונה של הסבב — "פתח את המלחמה" — רגע משותף לכל החדר, בבת אחת
    if (!firstSteal) { firstSteal = true; ctx.cue(400, { a: "th_first", by: pid, from: victim }); }
  }

  /* ---------- מגע מפיל ---------- */
  function dropAt(t: Thief, it: Item, now: number, awayFromX?: number, awayFromY?: number) {
    // השלל מתעופף הצידה — הרחק מהמפיל, כדי שייווצר מרדף ולא ערימה
    const base = awayFromX === undefined || awayFromY === undefined
      ? Math.random() * Math.PI * 2
      : Math.atan2(t.y - awayFromY, t.x - awayFromX) + (Math.random() - 0.5) * 1.2;
    const d = 2.6 + Math.random() * 0.8;
    it.gx = clampW(t.x + Math.cos(base) * d); it.gy = clampH(t.y + Math.sin(base) * d);
    it.carrier = ""; it.state = "ground";
    t.dropLockId = it.id; t.dropLockUntil = now + DROP_LOCK;
    t.stolen = 0;
    ctx.broadcast({ a: "th_drop", id: it.id, x: r1(it.gx), y: r1(it.gy), lvl: it.lvl });
  }

  function tackle(now: number) {
    for (const [pid, t] of thieves.entries()) {
      if (!t.stolen || !conn.has(pid) || now < t.safeUntil) continue;
      for (const [p2, o] of thieves.entries()) {
        if (p2 === pid || !conn.has(p2)) continue;
        if (Math.hypot(t.x - o.x, t.y - o.y) > TOUCH_R) continue;
        const it = items.get(t.stolen);
        o.tackles++;
        ctx.broadcast({ a: "th_tackle", by: p2, carrier: pid });
        if (it) dropAt(t, it, now, o.x, o.y); else t.stolen = 0;
        break;
      }
    }
  }

  function pickup(now: number) {
    for (const it of items.values()) {
      if (it.state !== "ground") continue;
      for (const [pid, t] of thieves.entries()) {
        if (!conn.has(pid) || t.stolen || t.chan) continue;
        if (t.dropLockId === it.id && now < t.dropLockUntil) continue;
        if (Math.hypot(t.x - it.gx, t.y - it.gy) > PICK_R) continue;
        it.carrier = pid; it.state = "carried";
        t.stolen = it.id; t.safeUntil = now + PICK_GRACE;
        ctx.broadcast({ a: "th_pick", id: it.id, by: pid });
        break;
      }
    }
  }

  /* ---------- הבשלה והכנסה ---------- */
  function economy(dt: number, now: number) {
    const mult = alarmed ? ALARM_MULT : 1;
    for (const it of items.values()) {
      if (it.state !== "den") continue;
      const aged = now - it.sinceLvl;
      if (it.lvl === 0 && aged >= RIPEN1) { it.lvl = 1; it.sinceLvl = now; ctx.broadcast({ a: "th_ripen", id: it.id, den: it.den, lvl: 1 }); }
      else if (it.lvl === 1 && aged >= RIPEN2) {
        it.lvl = 2; it.sinceLvl = now;
        // 🔔 הפעמון הפומבי — פעם אחת למאורה בכמה שניות, לא אחד לכל גביש
        const bell = now - (bellAt.get(it.den) ?? -1e9) >= BELL_EVERY;
        if (bell) bellAt.set(it.den, now);
        ctx.broadcast({ a: "th_ripen", id: it.id, den: it.den, lvl: 2, bell });
      }
      const owner = thieves.get(it.den);
      if (owner) owner.gold += rate(it.lvl) * it.v * mult * dt;
    }
  }

  /* ---------- 🗼 המגדל ---------- */
  function towersStep(dt: number, now: number) {
    for (const [owner, tw] of towers.entries()) {
      // מצבים זמניים שנגמרים: קירור / כבוי / בנייה ⇒ פעיל
      if ((tw.st === "hot" || tw.st === "off" || tw.st === "build") && now >= tw.until) {
        tw.st = "ok"; tw.until = 0; tw.heat = 0; tw.nextShot = now + 300;
        ctx.broadcast(towerMsg(owner, tw));
      }
      if (tw.st !== "ok") continue;
      if (tw.heat > 0 && now - tw.lastShot > HEAT_IDLE_MS) tw.heat = Math.max(0, tw.heat - dt);
      if (now < tw.nextShot) continue;
      const d = dens.get(owner)!;
      // המטרה: זר, מחובר, בטווח, מחוץ לשטח המת. סוחב שלל קודם, ואז הקרוב
      let best = "", bestKey = 1e9;
      for (const [pid, t] of thieves.entries()) {
        if (pid === owner || !conn.has(pid)) continue;
        const dx = t.x - d.x, dy = t.y - d.y, dist = Math.hypot(dx, dy);
        if (dist > TW_R) continue;
        if (dist > 0.6 && angDiff(Math.atan2(dy, dx), tw.back) <= DEAD_ARC / 2) continue;
        const key = (t.stolen ? 0 : 100) + dist;
        if (key < bestKey) { bestKey = key; best = pid; }
      }
      if (best) fire(owner, tw, best, now);
    }
    // חלוקים שנוחתים
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]; if (now < s.at) continue;
      shots.splice(i, 1);
      // פגיעה: קודם מי שכוונו אליו, ואחר כך כל זר אחר ברדיוס הנחיתה
      let hit = "";
      const tg = thieves.get(s.tgt);
      if (tg && conn.has(s.tgt) && Math.hypot(tg.x - s.x, tg.y - s.y) <= HIT_R) hit = s.tgt;
      else for (const [pid, t] of thieves.entries()) { if (pid === s.den || !conn.has(pid)) continue; if (Math.hypot(t.x - s.x, t.y - s.y) <= HIT_R) { hit = pid; break; } }
      if (!hit) continue;
      const t = thieves.get(hit)!, tp = towerPos(dens.get(s.den)!);
      t.slowUntil = now + SLOW_MS;
      const kx = t.x - tp.x, ky = t.y - tp.y, kl = Math.hypot(kx, ky) || 1;
      t.x = clampW(t.x + (kx / kl) * KNOCK); t.y = clampH(t.y + (ky / kl) * KNOCK);
      ctx.broadcast({ a: "th_hit", den: s.den, pid: hit, ms: SLOW_MS, x: r1(t.x), y: r1(t.y) });
    }
  }
  function fire(owner: string, tw: Tower, tgt: string, now: number) {
    const t = thieves.get(tgt)!, tp = towerPos(dens.get(owner)!);
    // ניבוי: לאן הוא יגיע עד שהחלוק ינחת — לפי הווקטור והמהירות שלו עכשיו. פנייה חדה = החטאה.
    // זמן המעוף תלוי בנקודת הנחיתה, והנחיתה תלויה בזמן המעוף — שני סיבובים של קירוב מספיקים
    const sp = speedOf(t, now), vx = t.dx * sp, vy = t.dy * sp;
    let T = Math.hypot(t.x - tp.x, t.y - tp.y) / PROJ_SPD, ax = t.x, ay = t.y;
    for (let i = 0; i < 3; i++) {
      ax = clampW(t.x + vx * (LEAD_S + T)); ay = clampH(t.y + vy * (LEAD_S + T));
      T = Math.max(0.12, Math.min(0.65, Math.hypot(ax - tp.x, ay - tp.y) / PROJ_SPD));
    }
    ax = clampW(t.x + vx * (LEAD_S + T)); ay = clampH(t.y + vy * (LEAD_S + T));
    const ms = Math.round(T * 1000);
    shots.push({ den: owner, tgt, x: ax, y: ay, at: now + ms });
    tw.nextShot = now + FIRE_MS; tw.lastShot = now; tw.heat += 1; tw.shots++;
    ctx.broadcast({ a: "th_shot", den: owner, x0: r1(tp.x), y0: r1(tp.y), x1: r1(ax), y1: r1(ay), ms, tgt });
    // חימום: 8 יריות רצופות ⇒ 4 שניות קירור. אי אפשר לעמוד מאחוריו לנצח
    if (tw.heat >= HEAT_MAX) { tw.st = "hot"; tw.until = now + COOL_MS; tw.heat = 0; ctx.broadcast(towerMsg(owner, tw)); }
  }

  /* ---------- הנגדים: השבתה / הריסה / בנייה מחדש ---------- */
  function tryAct(pid: string, t: Thief, kind: ActKind, now: number) {
    if (phase !== "run" || now < goAt) return;
    if (t.chan) { nope(pid, "busy"); return; }
    if (kind === "rebuild") {
      const tw = towers.get(pid); if (!tw || tw.st !== "ruin") { nope(pid, "tower"); return; }
      if (!atDen(t, pid)) { nope(pid, "far"); return; }
      const cost = Math.round(tw.invested / 2);
      if (t.gold < cost) { nope(pid, "gold"); return; }
      t.gold -= cost; t.spent += cost;
      tw.st = "build"; tw.until = now + BUILD_MS; tw.heat = 0;
      ctx.broadcast(towerMsg(pid, tw, pid));
      ctx.broadcast({ a: "th_act_done", kind, den: pid, by: pid, cost });
      return;
    }
    if (t.stolen) { nope(pid, "busy"); return; }
    // המגדל הזר הקרוב
    let den = "", bd = 1e9;
    for (const [p2, d] of dens.entries()) {
      if (p2 === pid) continue;
      const dd = Math.hypot(t.x - d.x, t.y - d.y);
      if (dd <= ACT_R && dd < bd) { bd = dd; den = p2; }
    }
    if (!den) { nope(pid, "far"); return; }
    const tw = towers.get(den)!;
    if (tw.st === "ruin" || tw.st === "build" || (kind === "disable" && tw.st === "off")) { nope(pid, "tower"); return; }
    const cost = kind === "disable" ? DISABLE_COST : DESTROY_COST;
    if (t.gold < cost) { nope(pid, "gold"); return; }
    const ms = kind === "disable" ? DISABLE_MS : DESTROY_MS;
    t.chan = { kind, den, startedAt: now, endsAt: now + ms, cost };
    t.dx = 0; t.dy = 0;                       // עומדים במקום — הערוץ פומבי, כל החדר רואה את הפס
    ctx.broadcast({ a: "th_channel", by: pid, den, kind, ms, cost });
  }
  function endChannel(pid: string, t: Thief, why: "moved" | "touched" | "gone" | "gold", who?: string) {
    const c = t.chan; if (!c) return; t.chan = null;
    ctx.broadcast({ a: "th_channel_end", by: pid, den: c.den, kind: c.kind, ok: false, why, who });
  }
  function channelsStep(now: number) {
    for (const [pid, t] of thieves.entries()) {
      const c = t.chan; if (!c) continue;
      if (!conn.has(pid)) { endChannel(pid, t, "gone"); continue; }
      // מגע של שחקן אחר קוטע — זו ההגנה: לרוץ הביתה ולגעת בחבלן
      let toucher = "";
      for (const [p2, o] of thieves.entries()) { if (p2 === pid || !conn.has(p2)) continue; if (Math.hypot(t.x - o.x, t.y - o.y) <= TOUCH_R) { toucher = p2; break; } }
      if (toucher) { endChannel(pid, t, "touched", toucher); continue; }
      if (now < c.endsAt) continue;
      // הערוץ הושלם — החיוב עכשיו, מהניקוד
      if (t.gold < c.cost) { endChannel(pid, t, "gold"); continue; }
      t.gold -= c.cost; t.spent += c.cost; t.chan = null;
      const tw = towers.get(c.den)!;
      if (c.kind === "disable") { tw.st = "off"; tw.until = now + OFF_MS; } else { tw.st = "ruin"; tw.until = 0; }
      tw.heat = 0;
      ctx.broadcast({ a: "th_channel_end", by: pid, den: c.den, kind: c.kind, ok: true });
      ctx.broadcast(towerMsg(c.den, tw, pid));
      ctx.broadcast({ a: "th_act_done", kind: c.kind, den: c.den, by: pid, cost: c.cost });
    }
  }

  /* ---------- טיק ---------- */
  // שום חריגה בטיק לא מפילה את החדר (ואת התהליך): תופסים, רושמים, וממשיכים; אחרי 30 רצופות — מסיימים בכבוד.
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
    const running = phase === "run" && now >= goAt;

    for (const [pid, t] of thieves.entries()) {
      if (!conn.has(pid)) {
        t.dx = 0; t.dy = 0;
        // סוחב שלל שהתנתק (נעילת מסך באמצע בריחה) — השלל נופל במקום, לא נעלם עם הטלפון
        if (t.stolen) {
          if (!t.dcDropAt) t.dcDropAt = now + DC_DROP_MS;
          else if (now >= t.dcDropAt) { const it = items.get(t.stolen); if (it) dropAt(t, it, now); else t.stolen = 0; t.dcDropAt = 0; }
        }
        continue;
      }
      t.dcDropAt = 0;
      if (!running) continue;
      if (t.chan) { t.dx = 0; t.dy = 0; }
      // תנועה — אותה נוסחה בדיוק רצה בלקוח לניבוי
      let len = Math.hypot(t.dx, t.dy);
      if (len > 0) {
        if (len > 1) { t.dx /= len; t.dy /= len; len = 1; }
        const s = speedOf(t, now);
        t.x = clampW(t.x + t.dx * s * dt);
        t.y = clampH(t.y + t.dy * s * dt);
        // ההר מוצק — נדחפים החוצה
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
      channelsStep(now);
      tackle(now);
      pickup(now);
      economy(dt, now);
      if (!alarmed && endsAt - now <= 60_000) { alarmed = true; ctx.cue(400, { a: "th_alarm", secs: 60 }); }
      // 🔔 הצפירה — cue מדויק לזמן הסיום, ואז הקפאה קצרה כדי שכולם ישמעו אותה יחד לפני הטקס
      if (!horned && endsAt - now <= 600) { horned = true; ctx.cue(Math.max(350, endsAt - now), { a: "th_horn" }); }
    }

    // טיק שהגיע 1-2ms מוקדם מהלוח לא מדלג על שידור (אחרת מקבלים חורים של 100ms)
    if (now - lastPos >= POS_EVERY - 8) {
      lastPos = now;
      ctx.broadcast({
        a: "th_pos", t: now,
        ps: [...thieves.entries()].filter(([p]) => conn.has(p)).map(([pid, t]) =>
          [pid, r1(t.x), r1(t.y), t.carry, t.stolen ? 1 : 0, Math.round(t.gold), now < t.rageUntil ? 1 : 0, r2(t.dx), r2(t.dy), now < t.slowUntil ? 1 : 0] as
          [string, number, number, number, number, number, number, number, number, number]),
        mtn: mtn.left,
        left: Math.max(0, Math.round((endsAt - now) / 1000)),
      });
    }

    if (phase === "run" && now >= endsAt) phase = "over";           // הקפאה — הצפירה מתנגנת
    if (phase === "over" && now >= endsAt + HORN_HOLD) { finish(); return; }
    // קצב קבוע: מתזמנים לפי לוח ולא "עוד 50ms מעכשיו" — אחרת הטיק זוחל ל-52-55ms
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
      facts: Object.fromEntries([...thieves.entries()].map(([pid, t]) => [pid, { points: Math.round(t.gold), spent: Math.round(t.spent) }])),
    });
  }

  const initMsg = () => ({
    a: "th_init" as const,
    w: TH_W, h: TH_H,
    mtn: { x: mtn.x, y: mtn.y, total: mtn.total },
    dens: [...dens.entries()].map(([pid, d]) => [pid, d.x, d.y, Math.round(backOf(d) * 100) / 100] as [string, number, number, number]),
    players: [...dens.keys()],
    goAt, endsAt,
    tower: { r: TW_R, arc: DEAD_ARC, disable: DISABLE_COST, destroy: DESTROY_COST },
  });
  const towersSync = () => [...towers.entries()].map(([den, tw]) => [den, tw.st, tw.until] as [string, TowerSt, number]);

  return {
    onStart() {
      const ids = alive();
      ids.forEach((pid, i) => { const [ax, ay] = ANCHORS[i % ANCHORS.length]; dens.set(pid, { x: ax, y: ay }); });
      // ההר מכויל כך שייגמר בסביבות דקה 5 — ואז מתחילה המלחמה
      mtn.total = (cfg.mtnPer ?? MTN_PER) * Math.max(2, ids.length);
      mtn.left = mtn.total;
      for (const pid of ids) { thieves.set(pid, newThief(pid)); towers.set(pid, newTower(pid)); }
      const now = ctx.now();
      lastTick = now; nextTick = now;
      goAt = now + GO_DELAY;                       // "צאו!" — כולם יוצאים לדרך באותה שנייה
      endsAt = goAt + ROUND_MS;
      ctx.broadcast(initMsg());
      ctx.cue(GO_DELAY, { a: "th_go" });
      loop = ctx.timer(TICK, step);
    },

    onRejoin(pid: string) {
      if (phase === "done") return;
      if (!dens.has(pid)) {           // הצטרף אחרי ההתחלה — מקבל מאורה פנויה (ומגדל)
        const used = new Set([...dens.values()].map((d) => `${d.x},${d.y}`));
        const spot = ANCHORS.find(([ax, ay]) => !used.has(`${ax},${ay}`)) ?? ANCHORS[0];
        dens.set(pid, { x: spot[0], y: spot[1] });
        thieves.set(pid, newThief(pid));
        towers.set(pid, newTower(pid));
        ctx.broadcast(initMsg());     // כולם צריכים לראות את המאורה החדשה
      } else {
        ctx.sendTo(pid, initMsg());
      }
      ctx.sendTo(pid, {
        a: "th_sync",
        mtn: mtn.left,
        items: [...items.values()].filter((it) => it.state === "den").map((it) => [it.id, it.den, it.lvl, it.sinceLvl, it.v] as [number, string, number, number, number]),
        ground: [...items.values()].filter((it) => it.state === "ground").map((it) => [it.id, r1(it.gx), r1(it.gy), it.lvl, it.v] as [number, number, number, number, number]),
        carried: [...items.values()].filter((it) => it.state === "carried").map((it) => [it.id, it.carrier, it.lvl, it.v] as [number, string, number, number]),
        towers: towersSync(),
        endsAt,
      });
    },

    onMessage(pid: string, d: GameClientMsg) {
      const t = thieves.get(pid); if (!t || phase !== "run") return;
      const msg = d as { a: string; dx?: number; dy?: number; kind?: ActKind };
      if (msg.a === "th_dir") {
        const dx = Math.max(-1, Math.min(1, msg.dx ?? 0)), dy = Math.max(-1, Math.min(1, msg.dy ?? 0));
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
        if (t.chan) {
          // ערוץ = עמידה במקום. תזוזה מבטלת אותו (אחרי רבע שנייה של חסד — האגודל עוד על הג'ויסטיק)
          if (!dx && !dy) return;
          if (ctx.now() - t.chan.startedAt < CHAN_GRACE) return;
          endChannel(pid, t, "moved");
        }
        t.dx = dx; t.dy = dy;
      } else if (msg.a === "th_steal") {
        trySteal(pid, t, ctx.now());
      } else if (msg.a === "th_act") {
        const k = msg.kind;
        if (k === "disable" || k === "destroy" || k === "rebuild") tryAct(pid, t, k, ctx.now());
      }
    },

    onLeave(pid: string, permanent?: boolean) {
      const t = thieves.get(pid);
      // עוזב לצמיתות עם שלל ביד — השלל נופל, לא נעלם
      if (permanent && t?.stolen) {
        const it = items.get(t.stolen);
        if (it) dropAt(t, it, ctx.now()); else t.stolen = 0;
      }
      if (t?.chan) endChannel(pid, t, "gone");
      ctx.broadcast({ a: "th_left", pid });
    },

    dispose() { if (loop) clearTimeout(loop); },
  };
}
