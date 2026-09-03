/**
 * התהום 🕳️ — סימולטור איזון (מונטה-קרלו). מריצים: npx tsx test/abyss-balance.ts
 *
 * שחקן-מודל אנושי: זמן תגובה N(0.28s, 0.08) חתוך [0.12, 0.6], מיומנות 0.8–1.0×X_VMAX,
 * רעש היגוי, שכחה (לא מגיב לשורה) בהסתברות 0.02+0.01k, חמדנות 0.3 לאבני חן, ורדיפת גבישים במסדרון.
 * לכל k: P(שורד את הפלח | הגיע), P(מגיע למדף k), E[גבישים], EV_stop(k)=P·E·mult ויחס EV(k+1)/EV(k).
 * מטרות: P(שורד 0) ≥ 0.95 · P(מגיע 3) ≈ 0.55–0.65 · יחסי EV ב-[0.9,1.15] עד k≤5 (אין אסטרטגיה דומיננטית).
 *
 * כפתורי env: RUNS (600) · SEEDS
 */
import {
  AB, abConfig, abTiming, abDepthAt, abFallStart, abFreezeAt, abWorld, abAdvance, abNewSim,
  abPerkMods, abMult, abMovingX, abSegSpeed, abPotBounty, abSegStartDepth,
} from "../../shared/abyss";
import type { AbWorld, AbRow } from "../../shared/abyss";

const RUNS = Number(process.env.RUNS ?? 600);
const LEDGES = 9;
const c = abTiming(abConfig({}));
const mods = abPerkMods([]);

// RNG פשוט לסימולציה (לא הזרע של הפיר)
let s = 12345;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

interface Human { react: number; skill: number; greed: number; noise: number }
const newHuman = (): Human => ({
  react: Math.min(0.6, Math.max(0.12, 0.28 + 0.08 * gauss())),
  skill: 0.8 + 0.2 * rnd(),
  greed: rnd() < 0.3 ? 1 : 0,
  noise: 1.5 + rnd() * 2,
});

const LOOK = 134;   // יחידות ראייה קדימה (390×844, PY=0.38)

/** מריץ צניחה שלמה (תמיד "ממשיך") ומחזיר לכל מדף: האם חי, וכמה גבישים. */
function runDescent(w: AbWorld, h: Human): { alive: boolean[]; crystals: number[] } {
  const sim = abNewSim();
  const alive: boolean[] = [], crystals: number[] = [];
  const startAt = 0;
  let prev = 0;
  let targetX = 50;
  let plannedRow: AbRow | null = null, seenAt = 0, lapse = false;
  const dt = 1 / 60;
  for (let k = 0; k < LEDGES; k++) {
    const t0 = abFallStart(c, startAt, k), t1 = abFreezeAt(c, startAt, k);
    const seg = w.seg(k);
    const v = abSegSpeed(k);
    for (let t = t0; t <= t1 && sim.alive; t += dt * 1000) {
      const T = abDepthAt(c, startAt, t);
      // השורה הבאה שנראית
      const row = seg.rows.find((r) => r.d > sim.depth - 2 && r.d <= sim.depth + LOOK) ?? null;
      if (row && row !== plannedRow) {
        plannedRow = row; seenAt = t / 1000; lapse = rnd() < 0.02 + 0.01 * k;   // "שכחה" = תגובה מאוחרת ב-0.45 שנ'
        // יעד: מרכז המסדרון + רעש; נע → הצד הרחוק מהמכשול בזמן החצייה; חמדן → אבן חן
        if (row.moving) {
          const o = seg.obs.find((ob) => ob.d === row.d && ob.amp);
          if (o) {
            const tCross = T.tauMs / 1000 + (row.d - sim.depth) / v;
            const ox = abMovingX(o, tCross);
            targetX = (ox < 50 ? Math.min(90, ox + o.w + 26) : Math.max(10, ox - o.w - 26)) + gauss() * h.noise;
          }
        } else if (row.half < 50) {
          const gem = h.greed ? seg.cry.find((cr) => cr.v === AB.GEM_VAL && Math.abs(cr.d - row.d) < 1) : undefined;
          targetX = (gem ? gem.x : row.cx) + gauss() * h.noise;
        } else {
          // שורה ריקה — רודפים גביש
          const cr = seg.cry.find((x) => x.d > sim.depth && x.d < sim.depth + LOOK);
          if (cr) targetX = cr.x + gauss() * h.noise * 0.5;
        }
      }
      // רדיפת גבישים בין השורות (בתוך המסדרון בלבד)
      if (plannedRow && !plannedRow.moving && plannedRow.half < 50 && t / 1000 - seenAt >= h.react) {
        const gap = plannedRow.d - sim.depth;
        if (gap > 25) {
          const cr = seg.cry.find((x) => x.d > sim.depth + 3 && x.d < plannedRow!.d - 8 && !sim.got.has(x.id) &&
            Math.abs(x.x - plannedRow!.cx) <= plannedRow!.half - AB.HIT_R - 2);
          if (cr) targetX = cr.x;
        }
      }
      // היגוי אחרי זמן התגובה
      if (t / 1000 - seenAt >= h.react + (lapse ? 0.45 : 0)) {
        const maxStep = AB.X_VMAX * h.skill * dt;
        sim.x += Math.max(-maxStep, Math.min(maxStep, targetX - sim.x));
        sim.x = Math.max(AB.PLAYER_R, Math.min(AB.W - AB.PLAYER_R, sim.x));
      }
      const out = abAdvance(w, sim, prev, T.depth, T.tauMs, [], mods, t);
      prev = T.depth;
      if (out.hit) sim.alive = false;
    }
    alive.push(sim.alive);
    crystals.push(sim.crystals);
    if (!sim.alive) break;
    prev = abSegStartDepth(c, k + 1); sim.depth = prev; plannedRow = null;
  }
  return { alive, crystals };
}

console.log(`\n— התהום 🕳️ איזון · ${RUNS} ריצות · V0=${AB.V0} RAMP=${AB.RAMP} ROW_SEC0=${AB.ROW_SEC0} CORR0=${AB.CORRIDOR0} —`);
const reach = new Array(LEDGES).fill(0), sumCr = new Array(LEDGES).fill(0), survivedGiven = new Array(LEDGES).fill(0), reachedSeg = new Array(LEDGES).fill(0);
for (let r = 0; r < RUNS; r++) {
  const w = abWorld(`bal-${r}`, c);
  const h = newHuman();
  const res = runDescent(w, h);
  for (let k = 0; k < res.alive.length; k++) {
    reachedSeg[k]++;
    if (res.alive[k]) { survivedGiven[k]++; reach[k]++; sumCr[k] += res.crystals[k]; }
  }
}
console.log("\n k | P(שורד|הגיע) | P(מגיע למדף k) | E[גבישים] |  EV_stop  | EV(k)/EV(k−1)");
let prevEV = 0;
for (let k = 0; k < LEDGES; k++) {
  const pS = reachedSeg[k] ? survivedGiven[k] / reachedSeg[k] : 0;
  const pR = reach[k] / RUNS;
  const eC = reach[k] ? sumCr[k] / reach[k] : 0;
  const ev = pR * eC * abMult(k);
  console.log(` ${k} |    ${(100 * pS).toFixed(0).padStart(3)}%      |     ${(100 * pR).toFixed(0).padStart(3)}%       |   ${eC.toFixed(0).padStart(4)}    |  ${ev.toFixed(0).padStart(6)}   |  ${prevEV ? (ev / prevEV).toFixed(2) : "  —"}`);
  prevEV = ev;
}

// מודל קרן: 5 שחקנים, הסתברות עצירה שעולה עם k
const N = 5, stopP = [0.1, 0.25, 0.35, 0.45, 0.55, 0.7, 0.85, 0.95, 1];
let potSum = new Array(LEDGES).fill(0), potN = new Array(LEDGES).fill(0), lastTakes = 0, swallowed = 0, games = 0;
for (let g = 0; g < Math.min(RUNS, 300); g++) {
  const w = abWorld(`pot-${g}`, c);
  const players = Array.from({ length: N }, () => runDescent(w, newHuman()));
  let pot = 0; const going = new Set(players.map((_, i) => i));
  let potSeg = false, runner = -1;
  games++;
  for (let k = 0; k < LEDGES && going.size; k++) {
    // נפילות בפלח k
    for (const i of [...going]) if (!players[i].alive[k]) { pot += players[i].crystals[k]; going.delete(i); }
    if (potSeg) { if (going.has(runner)) { lastTakes++; going.clear(); } else swallowed++; break; }
    if (!going.size) { swallowed++; break; }
    // הצבעות
    for (const i of [...going]) if (rnd() < stopP[k]) going.delete(i);
    pot += abPotBounty(k);
    potSum[k] += pot; potN[k]++;
    if (going.size === 1) { potSeg = true; runner = [...going][0]; }
    if (going.size === 0) { swallowed++; break; }
  }
}
console.log(`\nקרן ממוצעת אחרי מדף k (5 שחקנים): ` + potSum.map((p, k) => potN[k] ? `k${k}=${(p / potN[k]).toFixed(0)}` : "").filter(Boolean).join(" · "));
console.log(`נלקחה על ידי האחרון: ${(100 * lastTakes / games).toFixed(0)}% · נבלעה: ${(100 * swallowed / games).toFixed(0)}% · אחרת (כולם עצרו/נגמר): ${(100 * (games - lastTakes - swallowed) / games).toFixed(0)}%`);
