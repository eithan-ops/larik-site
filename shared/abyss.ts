/**
 * התהום 🕳️ — הליבה הדטרמיניסטית המשותפת לשרת וללקוח.
 *
 * העיקרון: "הטלפון בעלים של הנפילה, השרת בעלים של המדף".
 * כל לקוח מסמלץ את הנפילה שלו בעצמו מהזרע המשותף; השרת מייצר את *אותו* פיר
 * לבדיקות סבירות ולבוטים. לכן חייב להיות כאן מימוש אחד ויחיד — כל שינוי בסדר
 * שבו נצרך המחולל יפצל את הפיר בין הטלפונים.
 *
 * ⚠️ מתקמפל גם תחת ה-TS הקפדני של הלקוח: בלי enum, בלי namespaces, import type בלבד.
 */

/* ---------- קבועים ---------- */
export const AB = {
  W: 100,                 // רוחב הפיר ביחידות (x ∈ [0,100])
  PLAYER_R: 5.5,          // רדיוס הדמות המצוירת
  HIT_R: 3.8,             // היטבוקס סולח (~70%)
  X_VMAX: 220,            // תקרת מהירות צידית, יח'/שנ'
  DRAG_GAIN: 1.4,         // הגברת הגרירה
  V0: 70, RAMP: 0.13,     // מהירות הפלח: v_k = V0·(1+RAMP·k)
  ROW_SEC0: 1.15, ROW_SEC_DK: 0.065, ROW_SEC_MIN: 0.5,   // זמן בין שורות מכשולים
  CORRIDOR0: 32, CORRIDOR_MIN: 22,                        // רוחב המסדרון הפנוי המובטח
  TOP_CLEAR: 40, BOTTOM_CLEAR: 25,                        // רצועות נקיות אחרי/לפני מדף
  CRYSTAL_R: 3, CRYSTAL_VAL: 5, GEM_VAL: 15,
  MULT: [1, 1.6, 2.5, 4, 6, 9, 13, 20],
  HUNTER_PCT: 0.15, HELP_PCT: 0.10,
  THROW_LEAD_MS: 2000, THROW_CD_MS: 10000, INTAKE_MS: 5000, THROW_QUEUE_MAX: 2, THROW_BLOCK_BEFORE_LEDGE_MS: 2500,
  TRAP_R: 8, BUBBLE_R: 7, BURST_N: 5, BURST_R: 7, BURST_VAL: 5,
  GRACE_MS: 250, STALL_SKIP_MS: 200,
} as const;

export const abMult = (k: number): number => (k < AB.MULT.length ? AB.MULT[k] : AB.MULT[AB.MULT.length - 1] * Math.pow(1.5, k - AB.MULT.length + 1));
export const abPotBounty = (k: number): number => 100 * (k + 1);

/* ---------- RNG (FNV-1a → mulberry32, זהה ל-hfRng) ---------- */
export function abRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- קונפיג ---------- */
export interface AbTiming {
  segmentMs: number; voteMs: number; warnMs: number; revealOffsetMs: number;
  pauseMs: number; introMs: number; maxLedges: number;
}
export interface AbyssConfig extends AbTiming {
  descents: number;        // 1 | 3 | 5
  revealShowMs: number;
  resultsMs: number;
  draftMs: number;
  staleMs: number;
  throwLeadMs: number;     // כמה קדימה נוחת חפץ זרוק
  throwBlockMs: number;    // אין זריקות ב-X ms לפני מדף
  intakeMs: number;        // מטרה מקבלת חפץ אחד לכל X ms
  throwCdMs: number;       // קולדאון לזורק
  seed?: string;           // יומי
  solo?: boolean;
}

function num(v: unknown, def: number, min: number, max = Infinity): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/** מפרש את הקונפיג מהמארח (מחרוזות!) ומכפה את הרצפות שציר הזמן דורש. */
export function abConfig(raw: unknown): AbyssConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const segmentMs = num(r.segmentMs, 20000, 1500);
  const voteMs = num(r.voteMs, 3000, 400);
  const warnMs = Math.min(num(r.warnMs, 1200, 200), segmentMs - 200);
  // חשיפה: חלון + חסד + עיבוד + CUE_LEAD_MS(350) + רווח
  const revealFloor = voteMs + AB.GRACE_MS + 50 + 350 + 150;
  const revealOffsetMs = Math.max(revealFloor, num(r.revealOffsetMs, 3800, 0));
  const revealShowMs = num(r.revealShowMs, 2500, 300);
  const d = num(r.descents, 3, 1, 9);
  return {
    descents: Math.round(d),
    segmentMs, voteMs, warnMs, revealOffsetMs, revealShowMs,
    pauseMs: revealOffsetMs + revealShowMs,
    introMs: num(r.introMs, 3500, 500),
    resultsMs: num(r.resultsMs, 4500, 300),
    draftMs: num(r.draftMs, 12000, 800),
    staleMs: num(r.staleMs, 4000, 500),
    throwLeadMs: num(r.throwLeadMs, AB.THROW_LEAD_MS, 200),
    throwBlockMs: num(r.throwBlockMs, AB.THROW_BLOCK_BEFORE_LEDGE_MS, 0),
    intakeMs: num(r.intakeMs, AB.INTAKE_MS, 0),
    throwCdMs: num(r.throwCdMs, AB.THROW_CD_MS, 0),
    maxLedges: Math.round(num(r.maxLedges, 8, 1, 30)),
    seed: typeof r.seed === "string" && r.seed ? r.seed : undefined,
    solo: r.solo === true || r.solo === "true",
  };
}

export const abTiming = (c: AbTiming): AbTiming => ({
  segmentMs: c.segmentMs, voteMs: c.voteMs, warnMs: c.warnMs, revealOffsetMs: c.revealOffsetMs,
  pauseMs: c.pauseMs, introMs: c.introMs, maxLedges: c.maxLedges,
});

/* ---------- ציר הזמן (זמן שרת, ms) ---------- */
export const abCycleMs = (c: AbTiming): number => c.segmentMs + c.pauseMs;
export const abFallStart = (c: AbTiming, startAt: number, k: number): number => startAt + k * abCycleMs(c);
export const abFreezeAt = (c: AbTiming, startAt: number, k: number): number => abFallStart(c, startAt, k) + c.segmentMs;
export const abRevealAt = (c: AbTiming, startAt: number, k: number): number => abFreezeAt(c, startAt, k) + c.revealOffsetMs;
export const abResumeAt = (c: AbTiming, startAt: number, k: number): number => abFreezeAt(c, startAt, k) + c.pauseMs;

export const abSegSpeed = (k: number): number => AB.V0 * (1 + AB.RAMP * k);
export const abSegLen = (c: AbTiming, k: number): number => abSegSpeed(k) * c.segmentMs / 1000;
/** עומק תחילת פלח k — צורה סגורה: V0·s·(k + RAMP·k(k−1)/2) */
export const abSegStartDepth = (c: AbTiming, k: number): number => AB.V0 * (c.segmentMs / 1000) * (k + AB.RAMP * k * (k - 1) / 2);
export const abLedgeDepth = (c: AbTiming, k: number): number => abSegStartDepth(c, k + 1);
export const abRowSec = (k: number): number => Math.max(AB.ROW_SEC_MIN, AB.ROW_SEC0 - AB.ROW_SEC_DK * k);
export const abCorridor = (k: number): number => Math.max(AB.CORRIDOR_MIN, AB.CORRIDOR0 - k);

export interface AbDepth { k: number; depth: number; falling: boolean; tauMs: number; segFrac: number }
/** איפה כולם עכשיו — נגזר מהזמן בלבד, ולכן זהה בכל טלפון. */
export function abDepthAt(c: AbTiming, startAt: number, t: number): AbDepth {
  const e = t - startAt;
  if (e < 0) return { k: 0, depth: 0, falling: false, tauMs: 0, segFrac: 0 };
  const cycle = abCycleMs(c);
  const k = Math.floor(e / cycle);
  const inCycle = e - k * cycle;
  const tauMs = Math.min(inCycle, c.segmentMs);
  return {
    k, tauMs,
    depth: abSegStartDepth(c, k) + abSegSpeed(k) * tauMs / 1000,
    falling: inCycle < c.segmentMs,
    segFrac: tauMs / c.segmentMs,
  };
}

/* ---------- הפיר ---------- */
/** 0 סלע (עיגול) · 1 זיז מהקיר (מלבן) · 2 עטלף (עיגול נע) · 3 מסור (פס אנכי נע) */
export type AbKind = 0 | 1 | 2 | 3;
export interface AbObstacle {
  id: number; kind: AbKind; d: number; x: number;
  w: number; h: number;                 // עיגול: w=h=רדיוס · מלבן: חצאי-גודל
  amp?: number; freq?: number; ph?: number;  // נעים: x(τ) = x + amp·sin(freq·τ + ph)
}
export interface AbCrystal { id: number; d: number; x: number; v: number }
export interface AbRow { d: number; cx: number; half: number; moving: boolean }
export interface AbSegment {
  k: number; d0: number; d1: number; v: number; rowGap: number;
  obs: AbObstacle[]; cry: AbCrystal[]; rows: AbRow[]; value: number;
}

export const abMovingX = (o: AbObstacle, tauSec: number): number =>
  o.amp ? o.x + o.amp * Math.sin((o.freq ?? 1) * tauSec + (o.ph ?? 0)) : o.x;

const MARGIN = AB.HIT_R + 1.5;   // רווח בין קצה המכשול לקצה המסדרון

/** מחולל פלח k מהזרע. צריכת ה-rng בסדר קבוע — לא לשנות סדר קריאות. */
export function abSegment(seed: string, k: number, c: AbTiming): AbSegment {
  const rng = abRng(`${seed}|${k}`);
  const v = abSegSpeed(k);
  const d0 = abSegStartDepth(c, k), d1 = d0 + abSegLen(c, k);
  const rowSec = abRowSec(k);
  const rowGap = v * rowSec;
  const CORR = abCorridor(k);
  const maxShift = Math.min(45, 0.6 * AB.X_VMAX * rowSec);
  const density = k === 0 ? 0.62 : 1;               // הפלח הראשון דליל — הטוטוריאל הוא המשחק
  const obs: AbObstacle[] = [], cry: AbCrystal[] = [], rows: AbRow[] = [];
  let oi = 0, ci = 0;
  let d = d0 + AB.TOP_CLEAR, cx = 50, prevMoving = false, first = true;
  const end = d1 - AB.BOTTOM_CLEAR - rowGap * 0.3;

  const pushRock = (x: number, r: number, depth: number) => obs.push({ id: k * 10000 + oi++, kind: 0, d: depth, x, w: r, h: r });
  const pushJut = (side: -1 | 1, edge: number, depth: number, hh: number) => {
    // מלבן מהקיר עד קצה המסדרון (edge = ה-x של קצה המסדרון + מרווח)
    const x0 = side < 0 ? 0 : edge, x1 = side < 0 ? edge : AB.W;
    const hw = (x1 - x0) / 2;
    if (hw < 3) return;
    obs.push({ id: k * 10000 + oi++, kind: 1, d: depth, x: (x0 + x1) / 2, w: hw, h: hh });
  };

  while (d < end) {
    // בחירת תבנית — משקלים עולים עם k
    const wRock = 5, wJut = 3 + 0.3 * k, wPair = k >= 1 ? 2 : 0, wGate = k >= 3 ? 1.5 : 0,
      wBat = k >= 2 ? 1.5 + 0.2 * k : 0, wSweep = k >= 4 ? 1 + 0.2 * k : 0;
    let pick = rng() * (wRock + wJut + wPair + wGate + wBat + wSweep);
    let pat: "rock" | "jut" | "pair" | "gate" | "bat" | "sweep" = "rock";
    if ((pick -= wRock) >= 0) { if ((pick -= wJut) >= 0) { if ((pick -= wPair) >= 0) { if ((pick -= wGate) >= 0) { pat = (pick -= wBat) >= 0 ? "sweep" : "bat"; } else pat = "gate"; } else pat = "pair"; } else pat = "jut"; }
    // דלילות בפלח 0: לפעמים מדלגים על שורה (ה-rng נצרך בכל מקרה כדי לא לפצל)
    const skip = rng() > density;
    const moving = pat === "bat" || pat === "sweep";
    const corr = first || prevMoving ? Math.max(CORR, 40) : pat === "gate" ? Math.max(18, CORR - 6) : CORR;
    const half = corr / 2;

    if (skip) {
      rows.push({ d, cx, half: 50, moving: false });
      cry.push({ id: k * 10000 + 5000 + ci++, d: d + rowGap * 0.45, x: cx + (rng() * 2 - 1) * 10, v: AB.CRYSTAL_VAL });
      rng(); rng();
      d += rowGap * (0.9 + 0.2 * rng()); prevMoving = false; first = false;
      continue;
    }

    if (moving) {
      // שורה נעה: בלי מכשול סטטי, המסדרון = כל הרוחב
      if (pat === "bat") {
        const amp = 30 + rng() * 10, freq = 1.6 + rng(), ph = rng() * Math.PI * 2;
        obs.push({ id: k * 10000 + oi++, kind: 2, d, x: 50, w: 6, h: 6, amp, freq, ph });
      } else {
        const freq = 1.2 + rng() * 0.8, ph = rng() * Math.PI * 2; rng();
        obs.push({ id: k * 10000 + oi++, kind: 3, d, x: 50, w: 3, h: 18, amp: 44, freq, ph });
      }
      rows.push({ d, cx, half: 50, moving: true });
      // גביש אחד באמצע — מפתה לחצות
      cry.push({ id: k * 10000 + 5000 + ci++, d: d + rowGap * 0.5, x: 30 + rng() * 40, v: AB.CRYSTAL_VAL });
      d += rowGap * (1.0 + 0.2 * rng()); prevMoving = true; first = false;
      continue;
    }

    // שורה סטטית: מסדרון חדש שאפשר להגיע אליו
    const lo = half + 3, hi = AB.W - half - 3;
    const ncx = Math.min(hi, Math.max(lo, cx + (rng() * 2 - 1) * maxShift));
    const leftEdge = ncx - half - MARGIN, rightEdge = ncx + half + MARGIN;   // עד כאן המסדרון פנוי (עם מרווח)
    const roomL = leftEdge, roomR = AB.W - rightEdge;
    const bigSide: -1 | 1 = roomL >= roomR ? -1 : 1;
    const hh = 4 + rng() * 3;

    if (pat === "rock") {
      const room = bigSide < 0 ? roomL : roomR;
      const r = Math.min(11, Math.max(4, Math.min(7 + rng() * 4, room / 2 - 0.5)));
      if (room >= 2 * r + 1) {
        const x = bigSide < 0 ? leftEdge - r - (rng() * Math.max(0, room - 2 * r)) : rightEdge + r + (rng() * Math.max(0, room - 2 * r));
        pushRock(x, r, d);
      } else { rng(); }
    } else if (pat === "jut") {
      rng();
      pushJut(bigSide, bigSide < 0 ? leftEdge : rightEdge, d, hh);
    } else if (pat === "pair") {
      const rl = Math.min(9, Math.max(4, Math.min(6 + rng() * 3, roomL / 2 - 0.5)));
      const rr = Math.min(9, Math.max(4, Math.min(6 + rng() * 3, roomR / 2 - 0.5)));
      if (roomL >= 2 * rl + 1) pushRock(leftEdge - rl, rl, d);
      if (roomR >= 2 * rr + 1) pushRock(rightEdge + rr, rr, d);
    } else { // gate
      rng();
      pushJut(-1, leftEdge, d, hh);
      pushJut(1, rightEdge, d, hh);
    }
    rows.push({ d, cx: ncx, half, moving: false });

    // גבישים: 1–2 באמצע המסדרון, בין השורות
    const n = 1 + (rng() < 0.45 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const cxx = ncx + (half / 2) * (rng() * 2 - 1);
      cry.push({ id: k * 10000 + 5000 + ci++, d: d + rowGap * (0.45 + i * 0.2), x: cxx, v: AB.CRYSTAL_VAL });
    }
    // אבן חן: צמוד לקצה המסדרון, בצד המכשול — מפתה ומסוכנת (Downwell)
    if (k >= 1 && rng() < 0.22) {
      cry.push({ id: k * 10000 + 5000 + ci++, d, x: ncx + bigSide * (half - 3), v: AB.GEM_VAL });
    }
    d += rowGap * (0.9 + 0.2 * rng());
    cx = ncx; prevMoving = false; first = false;
  }
  const value = cry.reduce((s, c2) => s + c2.v, 0);
  return { k, d0, d1, v, rowGap, obs, cry, rows, value };
}

export interface AbWorld { seed: string; c: AbTiming; seg(k: number): AbSegment; segAt(depth: number): number }
/** עולם עצל — מייצר פלח רק כשמבקשים אותו (הזרע קובע הכול). */
export function abWorld(seed: string, c: AbTiming): AbWorld {
  const segs = new Map<number, AbSegment>();
  return {
    seed, c,
    seg(k) { let s = segs.get(k); if (!s) { s = abSegment(seed, k, c); segs.set(k, s); } return s; },
    segAt(depth) {
      // k הגדול ביותר שבו segStartDepth(k) ≤ depth
      let k = 0;
      while (abSegStartDepth(c, k + 1) <= depth) k++;
      return k;
    },
  };
}

/** סך הגבישים שקיימים עד עומק נתון (+רווח) — לבדיקת סבירות בשרת. */
export function abAvailableValue(w: AbWorld, depth: number): number {
  const lim = depth + 12;
  let sum = 0;
  for (let k = 0; abSegStartDepth(w.c, k) <= lim; k++) {
    const s = w.seg(k);
    if (s.d1 <= lim) { sum += s.value; continue; }
    for (const c of s.cry) if (c.d <= lim) sum += c.v;
  }
  return sum;
}

/* ---------- סימולציה ---------- */
export interface AbThrowObj { id: number; by: string; target: string; kind: "trap" | "shield" | "burst"; d: number; x: number; at: number }
export interface AbSim {
  x: number; depth: number; crystals: number; shield: number; alive: boolean;
  got: Set<number>;        // גבישים שנאספו (וחתיכות פרץ כ-ids שליליים)
  taken: Set<number>;      // חפצים זרוקים שנצרכו
  invulnUntil: number;     // זמן שרת
}
export interface AbPerkMods { shieldStart: number; magnet: number; valueMul: number; xGain: number; py: number; helpPct: number; huntPct: number; cdMul: number }
export interface AbAdvanceOut {
  crystals: AbCrystal[];
  burstTaken?: AbThrowObj; shieldTaken?: AbThrowObj;
  hit?: { o?: AbObstacle; th?: AbThrowObj };
  nearMiss?: boolean;
}

export function abNewSim(shield = 0): AbSim {
  return { x: 50, depth: 0, crystals: 0, shield, alive: true, got: new Set(), taken: new Set(), invulnUntil: 0 };
}

const circleHit = (px: number, py: number, cx: number, cy: number, r: number): boolean => {
  const dx = px - cx, dy = py - cy; return dx * dx + dy * dy < r * r;
};
const rectHit = (px: number, py: number, o: AbObstacle, ox: number, shrink: number, pad: number): boolean => {
  const hw = Math.max(0.5, o.w - shrink), hh = Math.max(0.5, o.h - shrink);
  const dx = Math.max(Math.abs(px - ox) - hw, 0), dy = Math.max(Math.abs(py - o.d) - hh, 0);
  return dx * dx + dy * dy < pad * pad;
};

/** בודק פגיעה של הדמות ב-(x, depth) במכשול o בזמן τ. */
export function abHitObstacle(o: AbObstacle, x: number, depth: number, tauSec: number, pad: number = AB.HIT_R): boolean {
  const ox = abMovingX(o, tauSec);
  if (o.kind === 0 || o.kind === 2) return circleHit(x, depth, ox, o.d, o.w * 0.85 + pad);
  return rectHit(x, depth, o, ox, 1.5, pad);
}

/**
 * צעד טהור: מזיז את הדמות מ-fromDepth ל-toDepth ומחזיר מה קרה.
 * הקורא מחליט מה לעשות עם פגיעה (מגן / נתפס) ומדווח לשרת.
 */
export function abAdvance(
  w: AbWorld, sim: AbSim, fromDepth: number, toDepth: number, tauMs: number,
  throwsForMe: AbThrowObj[], mods: AbPerkMods, nowMs: number,
): AbAdvanceOut {
  const out: AbAdvanceOut = { crystals: [] };
  sim.depth = toDepth;
  if (!sim.alive) return out;
  const tau = tauMs / 1000;
  const pickR = AB.CRYSTAL_R + AB.PLAYER_R + mods.magnet;
  const k0 = w.segAt(Math.max(0, fromDepth - pickR)), k1 = w.segAt(toDepth + pickR);
  const invuln = nowMs < sim.invulnUntil;
  let hit: AbAdvanceOut["hit"] | undefined;
  let near = false;

  for (let k = k0; k <= k1; k++) {
    const s = w.seg(k);
    // גבישים — מעבר (swept) בעומק, קרבה ב-x
    for (const c of s.cry) {
      if (sim.got.has(c.id)) continue;
      if (c.d < fromDepth - pickR || c.d > toDepth + pickR) continue;
      if (Math.abs(c.x - sim.x) <= pickR) {
        sim.got.add(c.id);
        sim.crystals += Math.round(c.v * mods.valueMul);
        out.crystals.push(c);
      }
    }
    // מכשולים — רק שורות קרובות
    if (!invuln && !hit) {
      for (const o of s.obs) {
        const reach = o.h + AB.HIT_R + 2;
        if (o.d < toDepth - reach || o.d > toDepth + reach) continue;
        if (abHitObstacle(o, sim.x, toDepth, tau)) { hit = { o }; break; }
        if (!near && abHitObstacle(o, sim.x, toDepth, tau, AB.HIT_R + 1.5)) near = true;
      }
    }
  }
  // חפצים שנזרקו אליי
  for (const th of throwsForMe) {
    if (sim.taken.has(th.id)) continue;
    if (th.kind === "trap") {
      if (!invuln && !hit && th.d >= toDepth - AB.TRAP_R - AB.HIT_R && th.d <= toDepth + AB.TRAP_R + AB.HIT_R &&
          circleHit(sim.x, toDepth, th.x, th.d, AB.TRAP_R * 0.85 + AB.HIT_R)) { hit = { th }; sim.taken.add(th.id); }
    } else if (th.kind === "shield") {
      const r = AB.BUBBLE_R + AB.PLAYER_R;
      if (th.d >= fromDepth - r && th.d <= toDepth + r && Math.abs(th.x - sim.x) <= r) {
        sim.taken.add(th.id); sim.shield = Math.min(2, sim.shield + 1); out.shieldTaken = th;
      }
    } else { // burst — 5 גבישים סביב הנקודה
      let any = false, all = true;
      for (let i = 0; i < AB.BURST_N; i++) {
        const gid = -(th.id * 10 + i);
        if (sim.got.has(gid)) continue;
        const ang = (i / AB.BURST_N) * Math.PI * 2;
        const gx = th.x + Math.cos(ang) * AB.BURST_R, gd = th.d + Math.sin(ang) * AB.BURST_R;
        if (gd >= fromDepth - pickR && gd <= toDepth + pickR && Math.abs(gx - sim.x) <= pickR) {
          sim.got.add(gid); sim.crystals += AB.BURST_VAL; any = true;
          out.crystals.push({ id: gid, d: gd, x: gx, v: AB.BURST_VAL });
        } else all = false;
      }
      if (any && !sim.taken.has(th.id)) { sim.taken.add(th.id); out.burstTaken = th; }
      if (all) sim.taken.add(th.id);
    }
  }
  if (hit) out.hit = hit; else if (near) out.nearMiss = true;
  return out;
}

/* ---------- בוט חמדן (טסטים, E2E, איזון) ---------- */
/** לאן לכוון את x: השורה הבאה בטווח הראייה → המרווח הפנוי; נע → הצד הרחוק מהמכשול בזמן החצייה. */
export function abBotX(w: AbWorld, depth: number, tauMs: number, x: number, lookAhead = 70): number {
  const k = w.segAt(depth);
  const v = abSegSpeed(k);
  const tau = tauMs / 1000;
  for (let kk = k; kk <= k + 1; kk++) {
    const s = w.seg(kk);
    for (const row of s.rows) {
      if (row.d <= depth - 4) continue;
      if (row.d > depth + lookAhead) return x;
      if (!row.moving) {
        if (row.half >= 50) continue;               // שורה ריקה
        const lo = row.cx - row.half + AB.HIT_R + 1, hi = row.cx + row.half - AB.HIT_R - 1;
        return x >= lo && x <= hi ? x : row.cx;
      }
      const o = s.obs.find((ob) => ob.d === row.d && ob.amp);
      if (!o) continue;
      const tCross = tau + (row.d - depth) / v;
      const ox = abMovingX(o, tCross);
      return ox < 50 ? Math.min(92, ox + o.w + AB.HIT_R + 26) : Math.max(8, ox - o.w - AB.HIT_R - 26);
    }
  }
  return x;
}

/* ---------- דראפט ---------- */
export interface AbyssCardDef { id: string; ic: string; t: string; d: string }
export const AB_CARDS: AbyssCardDef[] = [
  { id: "shield",  ic: "🛡️", t: "מגן",       d: "מתחילים כל צניחה עם מגן שסופג פגיעה אחת" },
  { id: "magnet",  ic: "🧲", t: "מגנט",      d: "גבישים נמשכים אליך מרחוק" },
  { id: "greed",   ic: "💎", t: "חמדנות",    d: "כל גביש שווה 25% יותר" },
  { id: "feather", ic: "🪶", t: "נוצה",      d: "שליטה צידית מהירה ב-15%" },
  { id: "scout",   ic: "🔭", t: "צופה",      d: "רואים רחוק יותר למטה" },
  { id: "patron",  ic: "🤝", t: "פטרון",     d: "בונוס עזרה כפול: 20% ממה שהחבר בנקאי" },
  { id: "hunter",  ic: "🏹", t: "צייד",      d: "בונוס מלכודת כפול: 30% ממה שהקורבן הפסיד" },
  { id: "haste",   ic: "⏱️", t: "יד מהירה",  d: "קולדאון זריקה 6 שניות במקום 10" },
];

export function abPerkMods(perks: readonly string[] | undefined): AbPerkMods {
  const p = perks ?? [];
  const count = (id: string) => p.filter((x) => x === id).length;
  return {
    shieldStart: count("shield") > 0 ? 1 : 0,
    magnet: 5 * count("magnet"),
    valueMul: Math.pow(1.25, count("greed")),
    xGain: count("feather") > 0 ? 1.15 : 1,
    py: count("scout") > 0 ? 0.30 : 0.38,
    helpPct: count("patron") > 0 ? 0.20 : AB.HELP_PCT,
    huntPct: count("hunter") > 0 ? 0.30 : AB.HUNTER_PCT,
    cdMul: count("haste") > 0 ? 0.6 : 1,
  };
}
