/**
 * הגנבים 🥷 — גרייבוקס הליבה (שער GO/NO-GO).
 *
 * הליבה בלבד, לפי מסמכי העיצוב: הר אחד במרכז שנגמר · מאורה לכל שחקן ·
 * גביש שמופקד מבשיל ומייצר זהב כל שנייה · גניבה ממאורה של חבר · מרדף —
 * מגע מפיל את השלל וכל אחד יכול להרים · זעם לנשדד · דקת אזעקה ×3 בסוף.
 * בלי שדרוגים, בלי מגדל, בלי הפקדות אצל חברים — זה נבדק אחרי ה-GO.
 *
 * המודל זהה לחופרים: השרת סמכות יחידה, הלקוח מנבא את התנועה של עצמו.
 * בעלות על חפץ היא הכרעת שרת בלעדית — שני נוגעים באותו שלל = הראשון בטיק.
 */
import type { GameCtx, GameInstance } from "../engine";
import type { GameClientMsg } from "../../../shared/protocol";

const TICK = 50;                    // 20Hz סימולציה
const POS_EVERY = 100;              // 10Hz שידור מיקומים
export const TH_W = 46;             // רוחב העולם בתאים
export const TH_H = 30;
const SPD = 6.0;                    // תאים לשנייה
const CARRY_CAP = 3;                // כמה צ'אנקים סוחבים מההר
const CARRY_SLOW = 0.05;            // האטה לכל צ'אנק
const STOLEN_SLOW = 0.74;           // סוחב שלל גנוב — איטי, "עומס"
const RAGE_MUL = 1.4;               // הזעם של הנשדד
const RAGE_SECS = 15;
const MINE_MS = 1500;               // צ'אנק לכל שנייה וחצי של חציבה
const DEN_R = 2.0;                  // רדיוס המאורה
const TOUCH_R = 0.95;               // מגע שמפיל
const PICK_R = 0.9;                 // הרמת שלל מהרצפה
const RATE = [1, 3, 6];             // ⚡ לשנייה לפי דרגת הבשלה
const ALARM_MULT = 3;

interface Thief {
  x: number; y: number; dx: number; dy: number;
  carry: number;                    // צ'אנקים מההר
  stolen: number;                   // id של שלל גנוב שהוא סוחב (0 = לא)
  gold: number;                     // הזהב שנצבר — זה הניקוד
  rageUntil: number;
  mineAt: number; stealCd: number;
  dropLockId: number; dropLockUntil: number;   // מי שהופל לא חוטף מיד בחזרה
  thefts: number; robbed: number; tackles: number;
}
/** פריט: או במאורה (den=pid), או נסחב (carrier=pid), או על הרצפה (ground) */
interface Item {
  id: number; lvl: number; sinceLvl: number;
  den: string; carrier: string; gx: number; gy: number; state: "den" | "carried" | "ground";
}

export function createThieves(ctx: GameCtx): GameInstance {
  const cfg = (ctx.config ?? {}) as { roundMs?: number; ripen1Ms?: number; ripen2Ms?: number; mtnPer?: number };
  const ROUND_MS = cfg.roundMs ?? 8 * 60 * 1000;
  const RIPEN1 = cfg.ripen1Ms ?? 30_000;
  const RIPEN2 = cfg.ripen2Ms ?? 90_000;

  const thieves = new Map<string, Thief>();
  const items = new Map<number, Item>();
  const dens = new Map<string, { x: number; y: number }>();
  let nextId = 1;

  const mtn = { x: TH_W / 2, y: TH_H / 2, total: 0, left: 0 };
  let phase: "run" | "done" = "run";
  let endsAt = 0, startedAt = 0;
  let alarmed = false, emptied = false, firstSteal = false;
  let loop: NodeJS.Timeout | null = null;
  let lastPos = 0, lastTick = 0;
  let conn = new Set<string>();

  const alive = () => ctx.participants().filter((p) => p.connected).map((p) => p.id);
  const clampW = (v: number) => Math.max(1, Math.min(TH_W - 1, v));
  const clampH = (v: number) => Math.max(1, Math.min(TH_H - 1, v));
  const mtnR = () => (mtn.left <= 0 ? 0 : 1.6 + 2.8 * Math.sqrt(mtn.left / Math.max(1, mtn.total)));
  const rate = (lvl: number) => RATE[Math.min(lvl, RATE.length - 1)];
  const r1 = (v: number) => Math.round(v * 10) / 10;

  /** שמונה עוגני מאורות סביב השדה — פינות קודם, אחר כך אמצעי צלעות */
  const ANCHORS: [number, number][] = [
    [5, 5], [TH_W - 5, TH_H - 5], [TH_W - 5, 5], [5, TH_H - 5],
    [TH_W / 2, 3.5], [TH_W / 2, TH_H - 3.5], [3.5, TH_H / 2], [TH_W - 3.5, TH_H / 2],
  ];

  function newThief(pid: string): Thief {
    const d = dens.get(pid)!;
    return {
      x: d.x, y: d.y, dx: 0, dy: 0, carry: 0, stolen: 0, gold: 0,
      rageUntil: 0, mineAt: 0, stealCd: 0, dropLockId: 0, dropLockUntil: 0,
      thefts: 0, robbed: 0, tackles: 0,
    };
  }

  /* ---------- חציבה והפקדה ---------- */
  function tryMine(pid: string, t: Thief, now: number) {
    if (t.stolen || t.carry >= CARRY_CAP || mtn.left <= 0) return;
    if (Math.hypot(t.x - mtn.x, t.y - mtn.y) > mtnR() + 1.0) return;
    if (now < t.mineAt) return;
    t.mineAt = now + MINE_MS;
    t.carry++; mtn.left--;
    ctx.broadcast({ a: "th_mine", pid, carry: t.carry, left: mtn.left });
    if (mtn.left <= 0 && !emptied) { emptied = true; ctx.broadcast({ a: "th_empty" }); }
  }

  function atDen(t: Thief, pid: string) {
    const d = dens.get(pid); if (!d) return false;
    return Math.hypot(t.x - d.x, t.y - d.y) <= DEN_R;
  }

  function deposit(pid: string, t: Thief, now: number) {
    // צ'אנקים מההר הופכים לגבישים טריים
    if (t.carry > 0) {
      const ids: number[] = [];
      for (let i = 0; i < t.carry; i++) {
        const it: Item = { id: nextId++, lvl: 0, sinceLvl: now, den: pid, carrier: "", gx: 0, gy: 0, state: "den" };
        items.set(it.id, it); ids.push(it.id);
      }
      t.carry = 0;
      ctx.broadcast({ a: "th_dep", pid, ids });
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
    if (phase !== "run" || t.stolen || now < t.stealCd) return;
    // המאורה הזרה הקרובה שיש בה משהו
    let victim = "", vd = 1e9;
    for (const [p2, d] of dens.entries()) {
      if (p2 === pid) continue;
      const dd = Math.hypot(t.x - d.x, t.y - d.y);
      if (dd <= DEN_R && dd < vd && [...items.values()].some((it) => it.state === "den" && it.den === p2)) { vd = dd; victim = p2; }
    }
    if (!victim) return;
    // הפריט הכי בשל, ואם שווים — הוותיק
    const pool = [...items.values()].filter((it) => it.state === "den" && it.den === victim);
    pool.sort((a, b) => b.lvl - a.lvl || a.sinceLvl - b.sinceLvl);
    const it = pool[0];
    it.lvl = Math.max(0, it.lvl - 1);        // "התנער בדרך" — יורד דרגה אחת
    it.sinceLvl = now; it.carrier = pid; it.state = "carried";
    // it.den נשאר הבעלים הקודם עד שהשלל מגיע לבית של מישהו — ככה יודעים ממי נגנב
    t.stolen = it.id; t.stealCd = now + 1000;
    const v = thieves.get(victim);
    if (v) { v.robbed++; v.rageUntil = now + RAGE_SECS * 1000; ctx.broadcast({ a: "th_rage", pid: victim, secs: RAGE_SECS }); }
    ctx.broadcast({ a: "th_grab", id: it.id, by: pid, from: victim, lvl: it.lvl });
    if (!firstSteal) { firstSteal = true; ctx.broadcast({ a: "th_first", by: pid, from: victim }); }
  }

  /* ---------- מגע מפיל ---------- */
  function tackle(now: number) {
    for (const [pid, t] of thieves.entries()) {
      if (!t.stolen || !conn.has(pid)) continue;
      for (const [p2, o] of thieves.entries()) {
        if (p2 === pid || !conn.has(p2)) continue;
        if (Math.hypot(t.x - o.x, t.y - o.y) > TOUCH_R) continue;
        const it = items.get(t.stolen);
        t.stolen = 0;
        o.tackles++;
        if (it) {
          // השלל מתעופף קצת הצידה — מרדף של שלושה על חפץ אחד
          const a = Math.random() * Math.PI * 2, d = 1.8 + Math.random();
          it.gx = clampW(t.x + Math.cos(a) * d); it.gy = clampH(t.y + Math.sin(a) * d);
          it.carrier = ""; it.state = "ground";
          t.dropLockId = it.id; t.dropLockUntil = now + 1200;
          ctx.broadcast({ a: "th_tackle", by: p2, carrier: pid });
          ctx.broadcast({ a: "th_drop", id: it.id, x: r1(it.gx), y: r1(it.gy), lvl: it.lvl });
        }
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
        if (Math.hypot(t.x - it.gx, t.y - it.gy) > PICK_R) continue;
        it.carrier = pid; it.state = "carried";
        t.stolen = it.id;
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
      else if (it.lvl === 1 && aged >= RIPEN2) { it.lvl = 2; it.sinceLvl = now; ctx.broadcast({ a: "th_ripen", id: it.id, den: it.den, lvl: 2 }); }
      const owner = thieves.get(it.den);
      if (owner) owner.gold += rate(it.lvl) * mult * dt;
    }
  }

  /* ---------- טיק ---------- */
  function step() {
    const now = ctx.now();
    const dt = Math.min(0.2, (now - lastTick) / 1000) || TICK / 1000;
    lastTick = now;
    if (phase !== "run") return;
    conn = new Set(alive());

    for (const [pid, t] of thieves.entries()) {
      if (!conn.has(pid)) { t.dx = 0; t.dy = 0; continue; }
      // תנועה — אותה נוסחה בדיוק רצה בלקוח לניבוי
      let len = Math.hypot(t.dx, t.dy);
      if (len > 0) {
        if (len > 1) { t.dx /= len; t.dy /= len; len = 1; }
        let s = SPD * (1 - CARRY_SLOW * t.carry);
        if (t.stolen) s *= STOLEN_SLOW;
        if (now < t.rageUntil) s *= RAGE_MUL;
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

    tackle(now);
    pickup(now);
    economy(dt, now);

    if (!alarmed && endsAt - now <= 60_000) { alarmed = true; ctx.broadcast({ a: "th_alarm", secs: 60 }); }

    if (now - lastPos >= POS_EVERY) {
      lastPos = now;
      ctx.broadcast({
        a: "th_pos",
        ps: [...thieves.entries()].filter(([p]) => conn.has(p)).map(([pid, t]) =>
          [pid, r1(t.x), r1(t.y), t.carry, t.stolen ? 1 : 0, Math.round(t.gold), now < t.rageUntil ? 1 : 0] as
          [string, number, number, number, number, number, number]),
        mtn: mtn.left,
        left: Math.max(0, Math.round((endsAt - now) / 1000)),
      });
    }

    if (now >= endsAt) { finish(); return; }
    loop = ctx.timer(TICK, step);
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
      facts: Object.fromEntries([...thieves.entries()].map(([pid, t]) => [pid, { points: Math.round(t.gold) }])),
    });
  }

  const initMsg = () => ({
    a: "th_init" as const,
    w: TH_W, h: TH_H,
    mtn: { x: mtn.x, y: mtn.y, total: mtn.total },
    dens: [...dens.entries()].map(([pid, d]) => [pid, d.x, d.y] as [string, number, number]),
    players: [...dens.keys()],
    endsAt,
  });

  return {
    onStart() {
      const ids = alive();
      ids.forEach((pid, i) => { const [ax, ay] = ANCHORS[i % ANCHORS.length]; dens.set(pid, { x: ax, y: ay }); });
      // ההר מכויל כך שייגמר בסביבות דקה 5 — ואז מתחילה המלחמה
      mtn.total = (cfg.mtnPer ?? 45) * Math.max(2, ids.length);
      mtn.left = mtn.total;
      for (const pid of ids) thieves.set(pid, newThief(pid));
      startedAt = ctx.now(); lastTick = startedAt;
      endsAt = startedAt + ROUND_MS;
      ctx.broadcast(initMsg());
      loop = ctx.timer(TICK, step);
    },

    onRejoin(pid: string) {
      if (phase === "done") return;
      if (!dens.has(pid)) {           // הצטרף אחרי ההתחלה — מקבל מאורה פנויה
        const used = new Set([...dens.values()].map((d) => `${d.x},${d.y}`));
        const spot = ANCHORS.find(([ax, ay]) => !used.has(`${ax},${ay}`)) ?? ANCHORS[0];
        dens.set(pid, { x: spot[0], y: spot[1] });
        thieves.set(pid, newThief(pid));
        ctx.broadcast(initMsg());     // כולם צריכים לראות את המאורה החדשה
      } else {
        ctx.sendTo(pid, initMsg());
      }
      ctx.sendTo(pid, {
        a: "th_sync",
        mtn: mtn.left,
        items: [...items.values()].filter((it) => it.state === "den").map((it) => [it.id, it.den, it.lvl, it.sinceLvl] as [number, string, number, number]),
        ground: [...items.values()].filter((it) => it.state === "ground").map((it) => [it.id, r1(it.gx), r1(it.gy), it.lvl] as [number, number, number, number]),
        carried: [...items.values()].filter((it) => it.state === "carried").map((it) => [it.id, it.carrier, it.lvl] as [number, string, number]),
        endsAt,
      });
    },

    onMessage(pid: string, d: GameClientMsg) {
      const t = thieves.get(pid); if (!t || phase !== "run") return;
      const msg = d as { a: string; dx?: number; dy?: number };
      if (msg.a === "th_dir") {
        const dx = Math.max(-1, Math.min(1, msg.dx ?? 0)), dy = Math.max(-1, Math.min(1, msg.dy ?? 0));
        if (Number.isFinite(dx) && Number.isFinite(dy)) { t.dx = dx; t.dy = dy; }
      } else if (msg.a === "th_steal") {
        trySteal(pid, t, ctx.now());
      }
    },

    onLeave(pid: string, permanent?: boolean) {
      const t = thieves.get(pid);
      // עוזב לצמיתות עם שלל ביד — השלל נופל, לא נעלם
      if (permanent && t?.stolen) {
        const it = items.get(t.stolen);
        if (it) {
          it.gx = clampW(t.x); it.gy = clampH(t.y); it.carrier = ""; it.state = "ground";
          ctx.broadcast({ a: "th_drop", id: it.id, x: r1(it.gx), y: r1(it.gy), lvl: it.lvl });
        }
        t.stolen = 0;
      }
      ctx.broadcast({ a: "th_left", pid });
    },

    dispose() { if (loop) clearTimeout(loop); },
  };
}
