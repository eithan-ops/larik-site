/**
 * החופרים ⛏️ — משחק חפירה שיתופי בהשראת Digger.
 *
 * המודל: השרת הוא הסמכות היחידה. המפה נוצרת מזרע משותף כך שכל לקוח
 * מייצר את אותה רשת בלי לשדר אותה — ומאותו רגע משדרים רק *הפרשים*:
 * "התא הזה נשבר", "המפלצת הזאת זזה". זה מה שמאפשר עולם הרסי של 5,060
 * תאים לרוץ על טלפונים בלי להציף את הרשת.
 *
 * הלולאה: משמרת = מכסת זהב משותפת + שעון. מפקידים במעלית (רק הפקדה
 * נספרת), עמדו במכסה — וכל שחקן בוחר שדרוג משלו. שלוש החמצות והמכרה קורס.
 */
import type { GameCtx, GameInstance } from "../engine";
import type { GameClientMsg, HofrimCard } from "../../../shared/protocol";
import {
  HF_COLS as COLS, HF_ROWS as ROWS, HF_AIR as AIR, HF_ROCK as ROCK, HF_WALL as WALL, HF_LIFT as LIFT,
  HF_LIFT_C as LIFT_C, HF_HARDNESS as HARDNESS, HF_HARDNESS, hfGenerate, hfIdx, hfDepthMul,
} from "../../../shared/hofrim";

const TICK = 50;                    // 20Hz סימולציה
const POS_EVERY = 66;               // 15Hz שידור מיקומים — מרווח קטן יותר לאינטרפולציה
const PLAYER_SPD = 5.6;             // תאים לשנייה
const BAG_FALL = 11;                // מהיר מהשחקן — בורחים הצידה, לא למטה
const WOBBLE = 1.0;
const GOLD_LIFE = 9;
const MON_CAP = 14;

type Kind = "crawl" | "armo" | "bat" | "golem";
const MK: Record<Kind, { hp: number; spd: number; armor: number; fly: boolean; gold: number }> = {
  crawl: { hp: 2, spd: 3.9, armor: 0, fly: false, gold: 10 },
  armo:  { hp: 7, spd: 2.9, armor: 1, fly: false, gold: 30 },
  bat:   { hp: 2, spd: 6.2, armor: 0, fly: true,  gold: 15 },
  golem: { hp: 16, spd: 1.7, armor: 2, fly: false, gold: 60 },
};

/* ---------- שדרוגים ---------- */
type Branch = "drill" | "fire" | "boom" | "sense" | "loot";
interface CardDef { id: string; b: Branch; ic: string; t: string; d: string; rank: number; wow?: boolean; apply(p: Miner): void }

const CARDS: CardDef[] = [
  { id: "carbide", b: "drill", ic: "⛏️", t: "ראש קרביד", d: "+2 כוח חפירה — סלע קשה נשבר בשליש מהזמן", rank: 0, apply: (p) => { p.pow += 2; } },
  { id: "boots",   b: "drill", ic: "👟", t: "נעליים קלות", d: "+16% מהירות תנועה", rank: 0, apply: (p) => { p.spd *= 1.16; } },
  { id: "helmet",  b: "drill", ic: "❤️", t: "קסדה", d: "+1 לב, ומתמלא", rank: 0, apply: (p) => { p.maxhp++; p.hp = p.maxhp; } },
  { id: "sweep",   b: "drill", ic: "🌀", t: "מקדח סחרור", d: "חופר שלושה תאים ברוחב — מנהרה, לא חור", rank: 2, wow: true, apply: (p) => { p.sweep = 1; } },
  { id: "blastdig",b: "drill", ic: "💥", t: "מקדח נפץ", d: "כל תא שאתה שובר מתפוצץ ופוגע במה שסביבו", rank: 2, wow: true, apply: (p) => { p.blastDig += 2; } },
  { id: "vest",    b: "drill", ic: "🛡️", t: "אפוד", d: "סיכוי לספוג מכה בלי נזק", rank: 2, wow: true, apply: (p) => { p.armor += 1; } },

  { id: "muzzle",  b: "fire", ic: "☄️", t: "לוע רחב", d: "+1 נזק לכל יריה", rank: 0, apply: (p) => { p.dmg += 1; } },
  { id: "reload",  b: "fire", ic: "⚡", t: "טעינה מהירה", d: "−35% זמן טעינה — הירי הופך לזרם", rank: 0, apply: (p) => { p.cd *= 0.65; } },
  { id: "salvo",   b: "fire", ic: "🎯", t: "מטח כפול", d: "יורה לשני כיוונים בו-זמנית", rank: 1, wow: true, apply: (p) => { p.dirs += 1; } },
  { id: "pierce",  b: "fire", ic: "🗡️", t: "חודר", d: "הקליע עובר דרך מפלצות במקום להיעצר", rank: 1, wow: true, apply: (p) => { p.pierce += 2; } },
  { id: "homing",  b: "fire", ic: "🏹", t: "קליע מכוון", d: "הקליע מתעקל אל המפלצת הקרובה", rank: 1, wow: true, apply: (p) => { p.homing += 1; } },
  { id: "burn",    b: "fire", ic: "🔥", t: "תבערה", d: "מפלצת שנפגעה ממשיכה לבעור", rank: 2, wow: true, apply: (p) => { p.burn = 1; } },
  { id: "frost",   b: "fire", ic: "❄️", t: "כפור", d: "פגיעה מקפיאה את המפלצת לחצי מהירות", rank: 2, wow: true, apply: (p) => { p.frost = 1; } },
  { id: "heavy",   b: "fire", ic: "🔨", t: "פטיש שריון", d: "מתעלם משריון — המשוריין והגולם מפסיקים להיות חסינים", rank: 2, wow: true, apply: (p) => { p.heavy = 1; p.dmg += 1; } },
  { id: "chain",   b: "fire", ic: "🌩️", t: "ברק שרשרת", d: "הפגיעה קופצת למפלצות נוספות", rank: 3, wow: true, apply: (p) => { p.chain += 2; } },
  { id: "boomshot",b: "fire", ic: "💣", t: "קליע נפץ", d: "כל פגיעה מתפוצצת ופוגעת בכל מי שסביב", rank: 3, wow: true, apply: (p) => { p.sboom += 3; } },

  { id: "charge",  b: "boom", ic: "🧨", t: "מטען ראשון", d: "כפתור פצצה: פותחת חדר שלם בשנייה", rank: 0, wow: true, apply: (p) => { p.bomb = Math.max(1, p.bomb); } },
  { id: "heavycharge", b: "boom", ic: "🎆", t: "מטען כבד", d: "רדיוס פיצוץ גדול יותר וקירור קצר", rank: 1, apply: (p) => { p.bombR += 1; p.bomb += 1; } },
  { id: "drillex", b: "boom", ic: "⛏️", t: "חומר נפץ קידוח", d: "הפצצה שוברת גם בזלת", rank: 2, wow: true, apply: (p) => { p.bombPow = 10; } },
  { id: "alchemy", b: "boom", ic: "⚗️", t: "כור היתוך", d: "סלע ששבר הנפץ הופך לזהב", rank: 3, wow: true, apply: (p) => { p.alchemy = 1; } },

  { id: "lamp",    b: "sense", ic: "🔦", t: "פנס חזק", d: "+45% רדיוס אור", rank: 0, apply: (p) => { p.light *= 1.45; } },
  { id: "xray",    b: "sense", ic: "👁️", t: "ראיית רנטגן", d: "רואה גבישים ומפלצות דרך האדמה", rank: 1, wow: true, apply: (p) => { p.xray = 1; } },
  { id: "glow",    b: "sense", ic: "🕯️", t: "שובל זוהר", d: "כל מנהרה שחפרת נשארת מוארת — כל הצוות רואה איפה היית", rank: 2, wow: true, apply: (p) => { p.glow = 1; } },

  { id: "sack",    b: "loot", ic: "🎒", t: "שק גדול", d: "+3 חריצים", rank: 0, apply: (p) => { p.slots += 3; } },
  { id: "magnet",  b: "loot", ic: "🧲", t: "מגנט", d: "שלל עף אליך מרחוק", rank: 0, wow: true, apply: (p) => { p.magnet += 2.2; } },
  { id: "greed",   b: "loot", ic: "💰", t: "חמדנות", d: "+40% ערך לכל הפקדה", rank: 1, apply: (p) => { p.depoMul *= 1.4; } },
  { id: "double",  b: "loot", ic: "💎", t: "כורה כפול", d: "רבע מהתאים נותנים שלל פעמיים", rank: 2, wow: true, apply: (p) => { p.dbl += 0.25; } },
  { id: "share",   b: "loot", ic: "🤝", t: "חלוקה", d: "10% מכל הפקדה שלך נספרים גם לחבר הקרוב", rank: 2, wow: true, apply: (p) => { p.share = 1; } },
];

/* ---------- ישויות ---------- */
interface Miner {
  c: number; r: number; x: number; y: number; tc: number; tr: number; mv: boolean;
  dx: number; dy: number; dir: number;
  hp: number; maxhp: number; inv: number; down: number;
  bag: number; bagVal: number; slots: number;
  pow: number; spd: number; light: number; magnet: number; depoMul: number;
  sweep: number; blastDig: number; armor: number; glow: number; xray: number; dbl: number; share: number;
  dmg: number; cd: number; dirs: number; pierce: number; homing: number;
  burn: number; frost: number; chain: number; sboom: number; heavy: number;
  bomb: number; bombR: number; bombPow: number; bombCd: number; alchemy: number;
  shotCd: number; level: number; xp: number; banked: number; picks: string[];
  digC: number; digR: number; callAt: number;
}
interface Mon { id: number; k: Kind; c: number; r: number; x: number; y: number; tc: number; tr: number; mv: boolean; hp: number; max: number; slow: number; burn: number; dot: number }
interface Bag { id: number; c: number; y: number; st: 0 | 1 | 2; w: number; from: number }
interface Pick { id: number; x: number; y: number; k: 0 | 1 | 2; life: number }
interface Shot { x: number; y: number; dx: number; dy: number; life: number; by: string; pierce: number }

export function createHofrim(ctx: GameCtx): GameInstance {
  const cfg = (ctx.config ?? {}) as { shifts?: string };
  const TOTAL_SHIFTS = cfg.shifts === "long" ? 10 : 6;

  const seed = Math.random().toString(36).slice(2, 10);
  const mine = hfGenerate(seed);                  // אותו מחולל בדיוק רץ אצל כל לקוח
  const grid = mine.grid, item = mine.item;
  const prog = new Float32Array(COLS * ROWS);
  const lit = new Uint8Array(COLS * ROWS);
  const rng = Math.random;

  const miners = new Map<string, Miner>();
  const mons: Mon[] = [];
  const bags: Bag[] = [];
  const picks: Pick[] = [];
  const shots: Shot[] = [];
  let nextId = 1;

  let phase: "run" | "draft" | "done" = "run";
  let shift = 1, target = 0, banked = 0, shiftEndsAt = 0, misses = 0;
  const spawnedValue = mine.value;      // כמה זהב באמת קיים במפה — היעד הוא אחוז ממנו
  let loop: NodeJS.Timeout | null = null;
  let lastPos = 0, lastTick = 0;
  const drafts = new Map<string, string[]>();
  const picked = new Set<string>();
  let draftTimer: NodeJS.Timeout | null = null;

  const idx = hfIdx;
  const inB = (c: number, r: number) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
  const at = (c: number, r: number) => (inB(c, r) ? grid[idx(c, r)] : WALL);
  const solid = (c: number, r: number) => { const t = at(c, r); return t !== AIR && t !== LIFT; };
  const alive = () => ctx.participants().filter((p) => p.connected).map((p) => p.id);
  const depthMul = hfDepthMul;
  const bagAt = (c: number, r: number) => bags.find((b) => b.c === c && Math.round(b.y) === r);

  function newMiner(): Miner {
    return {
      c: LIFT_C, r: 3, x: LIFT_C, y: 3, tc: LIFT_C, tr: 3, mv: false, dx: 0, dy: 0, dir: 2,
      hp: 3, maxhp: 3, inv: 0, down: 0, bag: 0, bagVal: 0, slots: 8,
      pow: 2, spd: 1, light: 5.2, magnet: 1.3, depoMul: 1,
      sweep: 0, blastDig: 0, armor: 0, glow: 0, xray: 0, dbl: 0, share: 0,
      dmg: 1, cd: 2.6, dirs: 1, pierce: 0, homing: 0,
      burn: 0, frost: 0, chain: 0, sboom: 0, heavy: 0,
      bomb: 0, bombR: 1, bombPow: 6, bombCd: 0, alchemy: 0,
      shotCd: 0, level: 1, xp: 0, banked: 0, picks: [],
      digC: -1, digR: -1, callAt: 0,
    };
  }

  /* ---------- מכסת המשמרת ---------- */
  function shiftTarget(n: number) {
    // היעד הוא אחוז ממה שבאמת נוצר במפה — כך משמרת בלתי-אפשרית היא מתמטית בלתי-אפשרית
    const ratio = Math.min(0.75, 0.1 + 0.028 * (n - 1));
    const per = Math.max(1, alive().length);
    return Math.max(150, Math.round((spawnedValue * ratio * Math.min(1, per / 4)) / 10) * 10);
  }
  const shiftMs = (n: number) => Math.min(240, 90 + 14 * (n - 1)) * 1000;

  function openShift() {
    target = shiftTarget(shift);
    banked = 0;
    shiftEndsAt = ctx.now() + shiftMs(shift);
    phase = "run";
    ctx.broadcast({ a: "hf_shift", n: shift, target, endsAt: shiftEndsAt, of: TOTAL_SHIFTS });
  }

  function closeShift() {
    const ok = banked >= target;
    const partial = !ok && banked >= target * 0.7;
    if (!ok && !partial) misses++;
    ctx.broadcast({ a: "hf_shiftend", ok, partial, banked, target, misses });
    if (misses >= 3 || shift >= TOTAL_SHIFTS) { finish(ok || partial); return; }
    shift++;
    phase = "draft";
    openDraft(ok ? 3 : partial ? 2 : 0);
  }

  /* ---------- דראפט ---------- */
  function offer(p: Miner, n: number): string[] {
    const owned = new Map<Branch, number>();
    p.picks.forEach((id) => { const c = CARDS.find((x) => x.id === id); if (c) owned.set(c.b, (owned.get(c.b) ?? 0) + 1); });
    const pool = CARDS.filter((c) => (owned.get(c.b) ?? 0) >= c.rank && (c.id === "carbide" || c.id === "muzzle" || c.id === "sack" || c.id === "reload" || !p.picks.includes(c.id)));
    // הטיה למסלול שכבר השקעת בו — כך בילד מעמיק במקום להתפזר
    pool.sort((a, b) => (Math.random() + (owned.get(b.b) ?? 0) * 0.22) - (Math.random() + (owned.get(a.b) ?? 0) * 0.22));
    return pool.slice(0, n).map((c) => c.id);
  }
  function openDraft(n: number) {
    drafts.clear(); picked.clear();
    if (n === 0) { setTimeout(() => openShift(), 1200); return; }
    for (const pid of alive()) {
      const m = miners.get(pid); if (!m) continue;
      const ids = offer(m, n);
      drafts.set(pid, ids);
      ctx.sendTo(pid, { a: "hf_draft", cards: ids.map(cardMsg), ms: 12000 });
    }
    ctx.broadcast({ a: "hf_draftopen", ids: alive() });
    draftTimer = ctx.timer(12500, () => { for (const pid of drafts.keys()) if (!picked.has(pid)) choose(pid, drafts.get(pid)![0]); });
  }
  const cardMsg = (id: string): HofrimCard => {
    const c = CARDS.find((x) => x.id === id)!;
    return { id: c.id, ic: c.ic, t: c.t, d: c.d, b: c.b, wow: !!c.wow };
  };
  function choose(pid: string, id: string) {
    if (!drafts.has(pid) || picked.has(pid)) return;
    if (!drafts.get(pid)!.includes(id)) return;
    picked.add(pid);
    const m = miners.get(pid), card = CARDS.find((x) => x.id === id);
    if (m && card) { card.apply(m); m.picks.push(id); sendStats(pid); ctx.broadcast({ a: "hf_took", pid, card: cardMsg(id) }); }
    if (picked.size >= drafts.size) {
      if (draftTimer) clearTimeout(draftTimer);
      ctx.timer(1600, () => openShift());
    }
  }

  function sendStats(pid: string) {
    const m = miners.get(pid); if (!m) return;
    ctx.sendTo(pid, { a: "hf_stats", pow: m.pow, slots: m.slots, light: m.light, magnet: m.magnet, spd: m.spd,
      bomb: m.bomb, xray: m.xray, glow: m.glow, level: m.level });
    ctx.broadcast({ a: "hf_build", pid, picks: m.picks.map((id) => CARDS.find((c) => c.id === id)!.ic), level: m.level });
  }

  /* ---------- חפירה ---------- */
  function breakTile(c: number, r: number, by: string, quiet = false) {
    if (!inB(c, r)) return;
    const i = idx(c, r), was = grid[i], it = item[i];
    if (was === AIR || was === WALL || was === LIFT) return;
    grid[i] = AIR; prog[i] = 0; item[i] = 0;
    const m = miners.get(by);
    if (m?.glow) lit[i] = 1;
    ctx.broadcast({ a: "hf_dig", c, r, by, mat: was, lit: m?.glow ? 1 : 0 });
    if (it) {
      dropPick(c + 0.5, r + 0.5, it === 2 ? 2 : 1);
      if (m && m.dbl > 0 && rng() < m.dbl) dropPick(c + 0.5, r + 0.5, it === 2 ? 2 : 1);
    } else if (m?.alchemy && was >= ROCK && rng() < 0.35) dropPick(c + 0.5, r + 0.5, 0);
    if (m && m.blastDig > 0 && !quiet) {
      for (const mo of [...mons]) if (Math.hypot(mo.x - c, mo.y - r) < 1.7) hurt(mo, m.blastDig, by, "blast");
    }
  }

  function dropPick(x: number, y: number, k: 0 | 1 | 2) {
    const p: Pick = { id: nextId++, x, y, k, life: k === 0 ? GOLD_LIFE : 26 };
    picks.push(p);
    ctx.broadcast({ a: "hf_item", id: p.id, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, k });
  }

  function digPower(pid: string, m: Miner) {
    // שני כורים על אותו תא מחברים כוחות — רגע הקו-אופ
    let pw = m.pow;
    for (const [p2, m2] of miners.entries()) if (p2 !== pid && m2.down <= 0 && m2.digC === m.digC && m2.digR === m.digR) pw += m2.pow;
    return pw;
  }

  /* ---------- נזק ---------- */
  function hurt(mo: Mon, d: number, by: string, src: string) {
    const K = MK[mo.k];
    const m = miners.get(by);
    if (K.armor > 0 && src !== "pierce" && src !== "blast" && src !== "crush" && !(m && m.heavy)) {
      d = Math.max(K.armor > 1 ? 0 : 1, d - K.armor * 2);
      if (d <= 0) { ctx.broadcast({ a: "hf_mhit", id: mo.id, hp: mo.hp, res: 1 }); return; }
    }
    mo.hp -= d;
    ctx.broadcast({ a: "hf_mhit", id: mo.id, hp: Math.max(0, Math.round(mo.hp)), by, k: src });
    if (m) { if (m.burn) mo.burn = Math.max(mo.burn, 2.5); if (m.frost) mo.slow = Math.max(mo.slow, 2.5); }
    if (mo.hp <= 0) {
      const i = mons.indexOf(mo); if (i >= 0) mons.splice(i, 1);
      ctx.broadcast({ a: "hf_mdie", id: mo.id, x: Math.round(mo.x * 10) / 10, y: Math.round(mo.y * 10) / 10, k: mo.k });
      if (rng() < 0.6) dropPick(mo.x + 0.5, mo.y + 0.5, 1);
      if (mo.k === "golem" || mo.k === "armo") dropPick(mo.x + 0.5, mo.y + 0.5, 0);
      if (m && m.chain > 0) chain(mo, m.chain, by);
    }
  }
  function chain(from: Mon, n: number, by: string) {
    let cur = from;
    for (let k = 0; k < n; k++) {
      let best: Mon | null = null, bd = 5;
      for (const mo of mons) { const d = Math.hypot(mo.x - cur.x, mo.y - cur.y); if (mo !== cur && d < bd) { bd = d; best = mo; } }
      if (!best) return;
      ctx.broadcast({ a: "hf_chain", x1: cur.x, y1: cur.y, x2: best.x, y2: best.y });
      hurt(best, 1, by, "chain"); cur = best;
    }
  }
  function hitMiner(pid: string, m: Miner, why: string) {
    if (m.inv > 0 || m.down > 0) return;
    if (m.armor > 0 && rng() < m.armor * 0.25) { m.inv = 0.8; return; }
    m.hp--; m.inv = 1.4;
    ctx.broadcast({ a: "hf_hp", pid, hp: m.hp, max: m.maxhp, why });
    if (m.hp <= 0) {
      m.down = 3; m.hp = 0;
      // התיק נשאר בשטח — כל אחד יכול לאסוף ולהציל את השלל
      if (m.bag > 0) { for (let i = 0; i < Math.min(6, m.bag); i++) dropPick(m.x + 0.5 + (rng() - 0.5), m.y + 0.5, 1); }
      m.bag = 0; m.bagVal = 0;
      ctx.broadcast({ a: "hf_down", pid });
    }
  }

  /* ---------- מפלצות ---------- */
  function pickKind(t: number): Kind {
    const r = rng();
    if (t < 25) return "crawl";
    if (t < 60) return r < 0.75 ? "crawl" : "bat";
    if (t < 110) return r < 0.5 ? "crawl" : r < 0.75 ? "bat" : "armo";
    return r < 0.34 ? "crawl" : r < 0.58 ? "bat" : r < 0.85 ? "armo" : "golem";
  }
  function spawnMon(elapsed: number) {
    if (mons.length >= MON_CAP) return;
    const ps = [...miners.entries()].filter(([, m]) => m.down <= 0);
    if (!ps.length) return;
    for (let tries = 0; tries < 200; tries++) {
      const c = 1 + Math.floor(rng() * (COLS - 2)), r = 9 + Math.floor(rng() * (ROWS - 12));
      if (at(c, r) !== AIR) continue;
      const near = ps.some(([, m]) => Math.hypot(c - m.x, r - m.y) < 9);
      const seen = ps.some(([, m]) => Math.hypot(c - m.x, r - m.y) < 26);
      if (near || !seen) continue;
      const k = pickKind(elapsed), K = MK[k];
      const mo: Mon = { id: nextId++, k, c, r, x: c, y: r, tc: c, tr: r, mv: false, hp: K.hp + Math.floor(elapsed / 80), max: K.hp + Math.floor(elapsed / 80), slow: 0, burn: 0, dot: 0 };
      mons.push(mo);
      ctx.broadcast({ a: "hf_mon", id: mo.id, k, c, r, hp: mo.hp, max: mo.max });
      return;
    }
  }

  /* ---------- הפקדה ---------- */
  const onLift = (m: Miner) => m.r <= 4 && Math.abs(m.c - LIFT_C) <= 2;
  function deposit(pid: string, m: Miner) {
    if (m.bag <= 0) return;
    const v = Math.round(m.bagVal * m.depoMul);
    m.banked += v; banked += v; m.bag = 0; m.bagVal = 0;
    m.xp += v;
    while (m.xp >= xpNeed(m.level)) { m.xp -= xpNeed(m.level); m.level++; }
    if (m.share) {
      let best: string | null = null, bd = 6;
      for (const [p2, m2] of miners.entries()) if (p2 !== pid) { const d = Math.hypot(m2.x - m.x, m2.y - m.y); if (d < bd) { bd = d; best = p2; } }
      if (best) { const b = miners.get(best)!; b.banked += Math.round(v * 0.1); banked += Math.round(v * 0.1); ctx.broadcast({ a: "hf_bank", pid: best, v: Math.round(v * 0.1), total: b.banked, team: banked, share: pid }); }
    }
    ctx.broadcast({ a: "hf_bank", pid, v, total: m.banked, team: banked });
    sendStats(pid);
    if (banked >= target && phase === "run") { shiftEndsAt = Math.min(shiftEndsAt, ctx.now() + 3000); ctx.broadcast({ a: "hf_quota" }); }
  }
  const xpNeed = (lvl: number) => Math.round(60 * Math.pow(1.16, lvl - 1));

  /* ---------- טיק ---------- */
  function step() {
    const now = ctx.now();
    const dt = Math.min(0.2, (now - lastTick) / 1000) || TICK / 1000;
    lastTick = now;
    if (phase !== "run") { loop = ctx.timer(TICK, step); return; }
    const elapsed = (now - startedAt) / 1000;

    for (const [pid, m] of miners.entries()) {
      if (m.down > 0) { m.down -= dt; if (m.down <= 0) { m.hp = m.maxhp; m.c = LIFT_C; m.r = 3; m.x = LIFT_C; m.y = 3; m.mv = false; m.inv = 2.5; ctx.broadcast({ a: "hf_up", pid, hp: m.hp }); } continue; }
      if (m.inv > 0) m.inv -= dt;

      // תנועה בצעדי תא
      if (m.mv) {
        const ddx = m.tc - m.x, ddy = m.tr - m.y, d = Math.hypot(ddx, ddy), s = PLAYER_SPD * m.spd * (m.bag >= m.slots ? 0.82 : 1) * dt;
        if (d <= s) { m.x = m.tc; m.y = m.tr; m.c = m.tc; m.r = m.tr; m.mv = false; }
        else { m.x += (ddx / d) * s; m.y += (ddy / d) * s; }
      }
      if (!m.mv && (m.dx || m.dy)) {
        const nc = m.c + m.dx, nr = m.r + m.dy;
        m.dir = m.dy < 0 ? 0 : m.dy > 0 ? 2 : m.dx > 0 ? 1 : 3;
        if (inB(nc, nr) && !solid(nc, nr) && !bagAt(nc, nr)) { m.tc = nc; m.tr = nr; m.mv = true; m.digC = -1; m.digR = -1; }
        else if (inB(nc, nr) && solid(nc, nr)) {
          // חופרים: מד הקושי מתקדם, ואף פעם לא נעצר לגמרי
          m.digC = nc; m.digR = nr;
          const i = idx(nc, nr), h = HARDNESS[grid[i]];
          if (h < 999) {
            prog[i] += Math.max(0.06, digPower(pid, m) / h) * dt;
            if (prog[i] >= 1) {
              breakTile(nc, nr, pid);
              if (m.sweep) {
                if (m.dy === 0) { breakTile(nc, nr - 1, pid, true); breakTile(nc, nr + 1, pid, true); }
                else { breakTile(nc - 1, nr, pid, true); breakTile(nc + 1, nr, pid, true); }
              }
            }
          }
        }
      } else if (!m.dx && !m.dy) { m.digC = -1; m.digR = -1; }

      if (onLift(m)) deposit(pid, m);

      // ירי אוטומטי לאורך מנהרה פתוחה
      m.shotCd -= dt;
      if (m.shotCd <= 0) {
        const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        const found: [number, number][] = [];
        for (const d of DIRS) {
          for (let i = 1; i <= 11; i++) {
            const c2 = m.c + d[0] * i, r2 = m.r + d[1] * i;
            if (!inB(c2, r2) || solid(c2, r2)) break;
            if (mons.some((mo) => mo.c === c2 && mo.r === r2)) { found.push(d); break; }
          }
        }
        if (found.length) {
          m.shotCd = m.cd;
          for (let k = 0; k < Math.min(m.dirs, found.length || 1); k++) {
            const d = found[k] ?? found[0];
            shots.push({ x: m.x + 0.5, y: m.y + 0.5, dx: d[0], dy: d[1], life: 2, by: pid, pierce: m.pierce });
            ctx.broadcast({ a: "hf_shot", x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10, dx: d[0], dy: d[1], by: pid });
          }
        }
      }
      if (m.bombCd > 0) m.bombCd -= dt;
    }

    // קליעים
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      const owner = miners.get(s.by);
      if (owner && owner.homing) {
        let tg: Mon | null = null, td = 9;
        for (const mo of mons) { const d = Math.hypot(mo.x + 0.5 - s.x, mo.y + 0.5 - s.y); if (d < td) { td = d; tg = mo; } }
        if (tg) { const ax = tg.x + 0.5 - s.x, ay = tg.y + 0.5 - s.y, al = Math.hypot(ax, ay) || 1, k = Math.min(1, dt * owner.homing * 3.4);
          s.dx += (ax / al - s.dx) * k; s.dy += (ay / al - s.dy) * k;
          const nl = Math.hypot(s.dx, s.dy) || 1; s.dx /= nl; s.dy /= nl; }
      }
      s.x += s.dx * 11 * dt; s.y += s.dy * 11 * dt; s.life -= dt;
      const c = Math.floor(s.x), r = Math.floor(s.y);
      if (!inB(c, r) || s.life <= 0 || solid(c, r)) { shots.splice(i, 1); continue; }
      const hit = mons.find((mo) => Math.hypot(mo.x + 0.5 - s.x, mo.y + 0.5 - s.y) < 0.62);
      if (hit) {
        const o = miners.get(s.by);
        hurt(hit, o?.dmg ?? 1, s.by, o && o.pierce > 0 ? "pierce" : "plain");
        if (o && o.sboom > 0) for (const mo of [...mons]) if (mo !== hit && Math.hypot(mo.x - hit.x, mo.y - hit.y) < 1.8) hurt(mo, o.sboom, s.by, "blast");
        if (s.pierce > 0) s.pierce--; else shots.splice(i, 1);
      }
    }

    // שקי זהב — הכלל מהמקור: נשבר רק אחרי נפילה של יותר משורה
    for (let i = bags.length - 1; i >= 0; i--) {
      const b = bags[i], br = Math.round(b.y);
      if (b.st === 0) {
        if (!solid(b.c, br + 1) && !bagAt(b.c, br + 1)) { b.st = 1; b.w = WOBBLE; b.from = br; ctx.broadcast({ a: "hf_bag", id: b.id, c: b.c, y: br, st: 1 }); }
      } else if (b.st === 1) {
        b.w -= dt;
        if (b.w <= 0) { b.st = 2; ctx.broadcast({ a: "hf_bag", id: b.id, c: b.c, y: br, st: 2 }); }
        else if (solid(b.c, br + 1)) { b.st = 0; ctx.broadcast({ a: "hf_bag", id: b.id, c: b.c, y: br, st: 0 }); }
      } else {
        b.y += BAG_FALL * dt;
        const nr = Math.round(b.y);
        for (const [pid, m] of miners.entries()) if (m.down <= 0 && m.c === b.c && Math.abs(m.y - b.y) < 0.6) hitMiner(pid, m, "שק");
        for (const mo of [...mons]) if (mo.c === b.c && Math.abs(mo.y - b.y) < 0.7) hurt(mo, 999, "", "crush");
        if (solid(b.c, nr + 1) || bagAt(b.c, nr + 1) || nr >= ROWS - 2) {
          b.y = nr; b.st = 0;
          const fell = nr - b.from;
          ctx.broadcast({ a: "hf_bagland", id: b.id, c: b.c, y: nr, broke: fell > 1 ? 1 : 0 });
          if (fell > 1) { bags.splice(i, 1); dropPick(b.c + 0.5, nr + 0.5, 0); }
        }
      }
    }

    // שלל — נשאב לכורה הקרוב שיש לו מקום
    for (let i = picks.length - 1; i >= 0; i--) {
      const p = picks[i]; p.life -= dt;
      if (p.life <= 0) { picks.splice(i, 1); ctx.broadcast({ a: "hf_gone", id: p.id }); continue; }
      for (const [pid, m] of miners.entries()) {
        if (m.down > 0 || m.bag >= m.slots) continue;
        if (Math.hypot(p.x - (m.x + 0.5), p.y - (m.y + 0.5)) < m.magnet) {
          const base = p.k === 2 ? 150 : p.k === 0 ? 60 : 10;
          m.bag++; m.bagVal += Math.round(base * depthMul(Math.round(p.y)));
          picks.splice(i, 1);
          ctx.broadcast({ a: "hf_take", id: p.id, pid, bag: m.bag, slots: m.slots });
          break;
        }
      }
    }

    // מפלצות — רדיפה בסגנון המקור: ציר גדול קודם, ורק דרך מנהרות
    for (const mo of mons) {
      if (mo.slow > 0) mo.slow -= dt;
      if (mo.burn > 0) { mo.burn -= dt; mo.dot += dt; if (mo.dot > 0.5) { mo.dot = 0; hurt(mo, 1, "", "burn"); if (!mons.includes(mo)) continue; } }
      if (mo.mv) {
        const ddx = mo.tc - mo.x, ddy = mo.tr - mo.y, d = Math.hypot(ddx, ddy), s = MK[mo.k].spd * (mo.slow > 0 ? 0.5 : 1) * dt;
        if (d <= s) { mo.x = mo.tc; mo.y = mo.tr; mo.c = mo.tc; mo.r = mo.tr; mo.mv = false; }
        else { mo.x += (ddx / d) * s; mo.y += (ddy / d) * s; }
      }
      if (!mo.mv) {
        let tx = 0, ty = 0, bd = 1e9;
        for (const m of miners.values()) if (m.down <= 0) { const d = Math.hypot(m.x - mo.c, m.y - mo.r); if (d < bd) { bd = d; tx = m.x; ty = m.y; } }
        if (bd < 1e9) {
          const dx = tx - mo.c, dy = ty - mo.r;
          const order: [number, number][] = Math.abs(dx) > Math.abs(dy)
            ? [[Math.sign(dx), 0], [0, Math.sign(dy)], [0, -Math.sign(dy)], [-Math.sign(dx), 0]]
            : [[0, Math.sign(dy)], [Math.sign(dx), 0], [-Math.sign(dx), 0], [0, -Math.sign(dy)]];
          if (MK[mo.k].fly) order.unshift([Math.sign(dx) || 0, Math.sign(dy) || 0]);
          for (const o of order) {
            if (!o[0] && !o[1]) continue;
            const nc = mo.c + o[0], nr = mo.r + o[1];
            if (nr >= 6 && inB(nc, nr) && !solid(nc, nr)) { mo.tc = nc; mo.tr = nr; mo.mv = true; break; }
          }
        }
      }
      for (const [pid, m] of miners.entries()) if (m.down <= 0 && Math.hypot(mo.x - m.x, mo.y - m.y) < 0.72) hitMiner(pid, m, mo.k);
    }

    if (elapsed > nextSpawn) { nextSpawn = elapsed + Math.max(3, 8 - elapsed / 45); spawnMon(elapsed); }

    if (now - lastPos >= POS_EVERY) {
      lastPos = now;
      ctx.broadcast({ a: "hf_pos",
        ps: [...miners.entries()].map(([pid, m]) => [pid, Math.round(m.x * 10) / 10, Math.round(m.y * 10) / 10, m.dir, m.digC >= 0 ? 1 : 0] as [string, number, number, number, number]),
        ms: mons.map((mo) => [mo.id, Math.round(mo.x * 10) / 10, Math.round(mo.y * 10) / 10] as [number, number, number]),
        left: Math.max(0, Math.round((shiftEndsAt - now) / 1000)), banked });
    }

    if (now >= shiftEndsAt) closeShift();
    if ((phase as "run" | "draft" | "done") === "done") return; // finish() ניקה את הטיימר — לא לחמש מחדש (cast כי TS צמצם ל-"run")
    loop = ctx.timer(TICK, step);
  }

  let startedAt = 0, nextSpawn = 6;

  function finish(won: boolean) {
    phase = "done";
    if (loop) clearTimeout(loop);
    const scores: Record<string, number> = {};
    for (const [pid, m] of miners.entries()) scores[pid] = m.banked;
    const best = [...miners.entries()].sort((a, b) => b[1].banked - a[1].banked)[0];
    ctx.end({
      title: won ? `⛏️ המכרה נכבש — ${banked.toLocaleString()} זהב` : "💥 המכרה קרס",
      winnerId: won ? best?.[0] : undefined,
      scores,
      facts: Object.fromEntries([...miners.entries()].map(([pid, m]) => [pid, { points: m.banked }])),
    });
  }

  return {
    onStart() {
      for (const b of mine.bags) bags.push({ id: b.id, c: b.c, y: b.r, st: 0, w: 0, from: b.r });
      nextId = mine.bags.length + 100;
      for (const pid of alive()) miners.set(pid, newMiner());
      startedAt = ctx.now(); lastTick = startedAt;
      ctx.broadcast({ a: "hf_init", seed, cols: COLS, rows: ROWS, lift: LIFT_C, players: alive() });
      for (const pid of alive()) sendStats(pid);
      openShift();
      loop = ctx.timer(TICK, step);
    },

    onRejoin(pid: string) {
      if (phase === "done") return;
      if (!miners.has(pid)) miners.set(pid, newMiner());
      ctx.sendTo(pid, { a: "hf_init", seed, cols: COLS, rows: ROWS, lift: LIFT_C, players: [...miners.keys()] });
      // המפה השתנתה מאז הזרע — שולחים את רשימת התאים שכבר נחפרו
      const dug: number[] = [];
      for (let i = 0; i < grid.length; i++) if (grid[i] === AIR && i >= 3 * COLS) dug.push(i);
      ctx.sendTo(pid, { a: "hf_sync", dug, bags: bags.map((b) => [b.id, b.c, Math.round(b.y)] as [number, number, number]),
        mons: mons.map((m) => [m.id, m.k, Math.round(m.hp), m.max, Math.round(m.x), Math.round(m.y)] as [number, string, number, number, number, number]) });
      ctx.sendTo(pid, { a: "hf_shift", n: shift, target, endsAt: shiftEndsAt, of: TOTAL_SHIFTS });
      sendStats(pid);
    },

    onMessage(pid: string, d: GameClientMsg) {
      const m = miners.get(pid);
      const msg = d as { a: string; dx?: number; dy?: number; card?: string };
      if (msg.a === "hf_dir" && m) { m.dx = Math.sign(msg.dx ?? 0); m.dy = Math.sign(msg.dy ?? 0); }
      else if (msg.a === "hf_pick" && msg.card) choose(pid, msg.card);
      else if (msg.a === "hf_call" && m) {
        if (ctx.now() - m.callAt < 8000) return;
        m.callAt = ctx.now();
        ctx.broadcast({ a: "hf_called", pid, x: Math.round(m.x), y: Math.round(m.y),
          why: m.bag >= m.slots ? "full" : m.digC >= 0 ? "hard" : "here" });
      } else if (msg.a === "hf_bomb" && m && m.bomb > 0 && m.bombCd <= 0) {
        m.bombCd = Math.max(2.2, 6 - m.bomb * 1.2);
        const bc = m.c, br = m.r, R = m.bombR;
        ctx.broadcast({ a: "hf_bombset", c: bc, r: br, R, by: pid });
        ctx.timer(1100, () => {
          for (let dc = -R; dc <= R; dc++) for (let dr = -R; dr <= R; dr++) {
            if (Math.hypot(dc, dr) > R + 0.3) continue;
            const c2 = bc + dc, r2 = br + dr;
            if (inB(c2, r2) && HF_HARDNESS[at(c2, r2)] <= m.bombPow) breakTile(c2, r2, pid, true);
          }
          for (const mo of [...mons]) if (Math.hypot(mo.x - bc, mo.y - br) < R + 1) hurt(mo, 6, pid, "blast");
          ctx.broadcast({ a: "hf_boom", c: bc, r: br, R });
        });
      }
    },

    onLeave(pid: string, permanent?: boolean) {
      if (permanent) { miners.delete(pid); ctx.broadcast({ a: "hf_left", pid }); }
    },

    dispose() { if (loop) clearTimeout(loop); if (draftTimer) clearTimeout(draftTimer); },
  };
}
