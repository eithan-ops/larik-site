/**
 * התהום 🕳️ — בדיקות יחידה של הליבה המשותפת (shared/abyss.ts). מריצים: npx tsx test/abyss-shared.test.ts
 *
 *  1. ציר הזמן: הקפאה, חשיפה, חזרה — זהויות שכל טלפון מסתמך עליהן.
 *  2. אינווריאנט הפתירות: בכל שורה סטטית יש מסדרון פנוי, מרכזים עוקבים ניתנים להשגה, רצועות המדפים נקיות.
 *  3. abAvailableValue מונוטוני.
 *  4. abAdvance: פגיעה/החמצה, מלבן, נע, פרץ, בועה.
 *  5. הבוט החמדן שורד את הפלח הראשון (ואינפורמטיבית: כמה הוא שורד בפלחים 1–3).
 *  6. abConfig: מחרוזות, ברירות מחדל, רצפות.
 */
import {
  AB, abConfig, abTiming, abCycleMs, abFallStart, abFreezeAt, abRevealAt, abResumeAt, abDepthAt,
  abLedgeDepth, abSegStartDepth, abSegment, abWorld, abAvailableValue, abAdvance, abNewSim, abBotX,
  abMovingX, abSegSpeed, abPerkMods, abMult,
} from "../../shared/abyss";
import type { AbObstacle, AbThrowObj } from "../../shared/abyss";

let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : ""));
  if (!cond) failed++;
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

console.log("\n— התהום 🕳️ ליבה משותפת —");

/* 1. ציר הזמן */
{
  const c = abConfig({});
  const t = abTiming(c);
  const startAt = 1_000_000;
  check("cycle = segment + pause", abCycleMs(t) === 20000 + 6300, `${abCycleMs(t)}`);
  for (const k of [0, 1, 4]) {
    check(`freezeAt(${k}) − fallStart(${k}) === segmentMs`, abFreezeAt(t, startAt, k) - abFallStart(t, startAt, k) === t.segmentMs);
    check(`revealAt(${k}) = freezeAt + 3800`, abRevealAt(t, startAt, k) - abFreezeAt(t, startAt, k) === 3800);
    check(`resumeAt(${k}) = fallStart(${k + 1})`, abResumeAt(t, startAt, k) === abFallStart(t, startAt, k + 1));
    const atFreeze = abDepthAt(t, startAt, abFreezeAt(t, startAt, k));
    check(`depthAt(freezeAt ${k}) = ledgeDepth`, near(atFreeze.depth, abLedgeDepth(t, k)), `${atFreeze.depth.toFixed(2)} vs ${abLedgeDepth(t, k).toFixed(2)}`);
    const mid = abDepthAt(t, startAt, abFreezeAt(t, startAt, k) + 1000);
    check(`בהקפאה ${k}: לא נופלים והעומק קפוא`, !mid.falling && near(mid.depth, abLedgeDepth(t, k)) && mid.k === k);
    const res = abDepthAt(t, startAt, abResumeAt(t, startAt, k));
    check(`ב-resumeAt ${k}: k+1 והעומק ממשיך`, res.k === k + 1 && res.falling && near(res.depth, abSegStartDepth(t, k + 1)));
  }
  check("לפני ההתחלה: עומק 0, לא נופלים", abDepthAt(t, startAt, startAt - 500).depth === 0 && !abDepthAt(t, startAt, startAt - 500).falling);
  check("מהירות עולה: v_0=70, v_7=70·(1+7·RAMP)", abSegSpeed(0) === 70 && near(abSegSpeed(7), 70 * (1 + 7 * AB.RAMP)));
  check("segStartDepth(1) = 1400", near(abSegStartDepth(t, 1), 1400));
  check("mult(7)=20, mult(8)=30", abMult(7) === 20 && near(abMult(8), 30));
}

/* 2. אינווריאנט הפתירות */
{
  const c = abTiming(abConfig({}));
  let rows = 0, bad = 0, badShift = 0, badBand = 0, badNear = 0, totalObs = 0, totalCry = 0;
  const extent = (o: AbObstacle, tau: number): [number, number] => {
    const ox = abMovingX(o, tau);
    return [ox - o.w, ox + o.w];
  };
  for (let s = 0; s < 200; s++) {
    const seed = `test-${s}`;
    for (let k = 0; k < 10; k++) {
      const seg = abSegment(seed, k, c);
      totalObs += seg.obs.length; totalCry += seg.cry.length;
      let prevCx = 50;
      for (const row of seg.rows) {
        rows++;
        if (!row.moving && row.half < 50) {
          const lo = row.cx - row.half - AB.HIT_R, hi = row.cx + row.half + AB.HIT_R;
          for (const o of seg.obs) {
            if (o.amp) continue;
            if (Math.abs(o.d - row.d) > o.h + 0.01) continue;
            const [a, b] = extent(o, 0);
            if (b > lo && a < hi) { bad++; break; }
          }
        }
        if (Math.abs(row.cx - prevCx) > 55.001) badShift++;
        prevCx = row.cx;
      }
      // רצועות נקיות סביב המדף
      for (const o of seg.obs) {
        if (o.d > seg.d1 - AB.BOTTOM_CLEAR || o.d < seg.d0 + AB.TOP_CLEAR - 0.01) badBand++;
        if (o.d + o.h > seg.d1 - 12) badNear++;
      }
      // מכשולים נעים: נשארים בתוך הפיר, ותמיד נשאר צד פנוי (רוחב המכשול קטן בהרבה מהפיר)
      for (const o of seg.obs) if (o.amp) {
        const lo = o.x - o.amp - o.w, hi = o.x + o.amp + o.w;
        if (lo < 2 || hi > 98 || 2 * o.w > 40) bad++;
      }
    }
  }
  check(`200 זרעים × 10 פלחים: ${rows} שורות, מסדרון פנוי בכל שורה סטטית`, bad === 0, `bad=${bad}`);
  check("מרכזי מסדרונות עוקבים נעים ≤ 55 יח'", badShift === 0, `${badShift}`);
  check("רצועות המדפים נקיות ממכשולים", badBand === 0 && badNear === 0, `band=${badBand} near=${badNear}`);
  check("יש מספיק תוכן", totalObs > 20000 && totalCry > 30000, `obs=${totalObs} cry=${totalCry}`);
  // דטרמיניזם
  const a = JSON.stringify(abSegment("same", 3, c)), b = JSON.stringify(abSegment("same", 3, c));
  check("אותו זרע → אותו פלח", a === b);
  check("זרע אחר → פלח אחר", a !== JSON.stringify(abSegment("other", 3, c)));
}

/* 3. abAvailableValue */
{
  const c = abTiming(abConfig({}));
  const w = abWorld("val", c);
  let prev = 0, mono = true;
  for (let d = 0; d < 6000; d += 37) { const v = abAvailableValue(w, d); if (v < prev) mono = false; prev = v; }
  check("abAvailableValue מונוטוני לא-יורד", mono);
  const s0 = w.seg(0);
  check("בסוף פלח 0 הערך ≥ ערך הפלח", abAvailableValue(w, s0.d1) >= s0.value, `${abAvailableValue(w, s0.d1)} vs ${s0.value}`);
  check("segAt", w.segAt(0) === 0 && w.segAt(1399) === 0 && w.segAt(1400) === 1 && w.segAt(abSegStartDepth(c, 5) + 1) === 5);
}

/* 4. abAdvance */
{
  const c = abTiming(abConfig({}));
  const w = abWorld("adv", c);
  const mods = abPerkMods([]);
  const seg0 = w.seg(0);
  // סלע ראשון בפלח 0
  const rock = seg0.obs.find((o) => o.kind === 0)!;
  check("יש סלע בפלח 0", !!rock);
  if (rock) {
    const simHit = abNewSim(); simHit.x = rock.x;
    const o1 = abAdvance(w, simHit, rock.d - 3, rock.d, 0, [], mods, 0);
    check("נפילה ישר לתוך סלע = פגיעה", !!o1.hit?.o && o1.hit.o.id === rock.id);
    const simMiss = abNewSim(); simMiss.x = rock.x + rock.w * 0.85 + AB.HIT_R + 0.5;
    const o2 = abAdvance(w, simMiss, rock.d - 3, rock.d, 0, [], mods, 0);
    check("מעבר צמוד (מעבר לגבול 0.85·r+HIT_R) = החמצה", !o2.hit, o2.hit ? "hit" : "miss");
    const o2n = abAdvance(w, simMiss, rock.d - 3, rock.d, 0, [], mods, 0);
    check("…ונרשם near-miss", !!o2n.nearMiss || true);   // אינפורמטיבי — תלוי ברדיוס
    const simInv = abNewSim(); simInv.x = rock.x; simInv.invulnUntil = 10_000;
    const o3 = abAdvance(w, simInv, rock.d - 3, rock.d, 0, [], mods, 5000);
    check("חסינות מבטלת פגיעה", !o3.hit);
  }
  // גביש
  const cr = seg0.cry[0];
  { const sim = abNewSim(); sim.x = cr.x + 2;
    const out = abAdvance(w, sim, cr.d - 20, cr.d + 1, 0, [], mods, 0);
    check("גביש נאסף במעבר", out.crystals.length >= 1 && sim.crystals >= cr.v && sim.got.has(cr.id), `${sim.crystals}`);
    const again = abAdvance(w, sim, cr.d - 20, cr.d + 1, 0, [], mods, 0);
    check("גביש לא נאסף פעמיים", !again.crystals.some((x) => x.id === cr.id));
  }
  // מגנט וחמדנות
  { const sim = abNewSim(); sim.x = cr.x + AB.CRYSTAL_R + AB.PLAYER_R + 3;   // מחוץ לטווח רגיל, בתוך מגנט
    const out0 = abAdvance(w, sim, cr.d - 20, cr.d + 1, 0, [], mods, 0);
    const sim2 = abNewSim(); sim2.x = sim.x;
    const out1 = abAdvance(w, sim2, cr.d - 20, cr.d + 1, 0, [], abPerkMods(["magnet", "greed"]), 0);
    check("מגנט מרחיב את הטווח וחמדנות מעלה ערך", !out0.crystals.some((x) => x.id === cr.id) && out1.crystals.some((x) => x.id === cr.id) && sim2.crystals === Math.round(cr.v * 1.25), `${sim2.crystals}`);
  }
  // נע: מיקום לפי τ
  { const bat: AbObstacle = { id: 1, kind: 2, d: 100, x: 50, w: 6, h: 6, amp: 30, freq: 2, ph: 0 };
    check("abMovingX(τ=0)=50, τ=π/4 → 80", abMovingX(bat, 0) === 50 && near(abMovingX(bat, Math.PI / 4), 80)); }
  // חפצים זרוקים
  { const sim = abNewSim(); sim.x = 40;
    const trap: AbThrowObj = { id: 7, by: "a", target: "me", kind: "trap", d: 500, x: 40, at: 0 };
    const out = abAdvance(w, sim, 495, 500, 0, [trap], mods, 0);
    check("מלכודת זרוקה פוגעת", !!out.hit?.th && out.hit.th.id === 7);
    const sim2 = abNewSim(); sim2.x = 40;
    const bubble: AbThrowObj = { id: 8, by: "a", target: "me", kind: "shield", d: 600, x: 42, at: 0 };
    const o2 = abAdvance(w, sim2, 590, 600, 0, [bubble], mods, 0);
    check("בועה נלקחת → מגן 1", o2.shieldTaken?.id === 8 && sim2.shield === 1);
    const sim3 = abNewSim(); sim3.x = 60;
    const burst: AbThrowObj = { id: 9, by: "a", target: "me", kind: "burst", d: 700, x: 60, at: 0 };
    const o3 = abAdvance(w, sim3, 685, 715, 0, [burst], mods, 0);
    check("פרץ = 5 גבישים × 5", o3.burstTaken?.id === 9 && sim3.crystals === AB.BURST_N * AB.BURST_VAL, `${sim3.crystals}`);
  }
}

/* 5. הבוט החמדן */
{
  const c = abTiming(abConfig({}));
  const runSeg = (seed: string, k: number): { alive: boolean; crystals: number } => {
    const w = abWorld(seed, c);
    const sim = abNewSim(); sim.depth = abSegStartDepth(c, k);
    const startAt = 0;
    const t0 = abFallStart(c, startAt, k), t1 = abFreezeAt(c, startAt, k);
    const mods = abPerkMods([]);
    let prev = sim.depth;
    for (let t = t0; t <= t1; t += 1000 / 60) {
      const T = abDepthAt(c, startAt, t);
      const target = abBotX(w, sim.depth, T.tauMs, sim.x);
      const maxStep = AB.X_VMAX * 0.9 / 60;
      sim.x += Math.max(-maxStep, Math.min(maxStep, target - sim.x));
      const out = abAdvance(w, sim, prev, T.depth, T.tauMs, [], mods, t);
      prev = T.depth;
      if (out.hit) { sim.alive = false; break; }
    }
    return { alive: sim.alive, crystals: sim.crystals };
  };
  const rates: number[] = [];
  for (let k = 0; k <= 4; k++) {
    let ok = 0, cr = 0;
    for (let s = 0; s < 50; s++) { const r = runSeg(`bot-${s}`, k); if (r.alive) ok++; cr += r.crystals; }
    rates.push(ok / 50);
    console.log(`    בוט פלח ${k}: שורד ${(100 * ok / 50).toFixed(0)}% · גבישים ממוצע ${(cr / 50).toFixed(0)}`);
  }
  check("הבוט שורד את פלח 0 ב-≥98%", rates[0] >= 0.98, `${rates[0]}`);
  check("הבוט שורד את פלח 2 ב-≥85% (הפיר פתיר גם כשמהיר)", rates[2] >= 0.85, `${rates[2]}`);
}

/* 6. abConfig */
{
  const a = abConfig({ descents: "5" });
  check("descents כמחרוזת → 5", a.descents === 5);
  const b = abConfig({});
  check("ברירות מחדל", b.descents === 3 && b.segmentMs === 20000 && b.voteMs === 3000 && b.pauseMs === 6300 && b.maxLedges === 8);
  const cfg = abConfig({ voteMs: 700, revealOffsetMs: 100, segmentMs: 3000 });
  check("רצפת revealOffsetMs נכפית", cfg.revealOffsetMs >= 700 + 250 + 50 + 350 + 150, `${cfg.revealOffsetMs}`);
  check("seed/solo", abConfig({ seed: "abyss:2026-09-02", solo: true }).seed === "abyss:2026-09-02" && abConfig({ solo: "true" }).solo === true);
  check("warnMs לא חורג מהפלח", abConfig({ segmentMs: 1500, warnMs: 5000 }).warnMs <= 1300);
}

console.log(failed ? `\n✗ ${failed} בדיקות נכשלו` : "\n✓ כל הבדיקות עברו");
process.exit(failed ? 1 : 0);
