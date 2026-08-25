/**
 * "החומה" 🏰 — לוגיקת השרת. הגנת נחיל קו-אופ עם תפקידים אמיתיים.
 *
 * ארכיטקטורה: אויבים נעים על מסלולים דטרמיניסטיים (נוסחה שמשודרת ב-spawn) —
 * כל הלקוחות מציירים אותם מקומית ב-60fps בלי סנכרון רציף. השרת מריץ טיק פנימי
 * של 100ms על אותן נוסחאות, מכריע פגיעות/מצבים, ומשדר רק אירועים (cue).
 *
 * תפקידים (עיצוב לפי DRG/TF2/Vermintide — פועל+אחריות+חולשה לכל אחד):
 * ⚔️ חלוץ — בשטח, מגע, חוסם. 🏹 קשת — דיוק, נגד משוריינים/צלפים. 💣 תותחן — שטח,
 * נגד גושים. 🔫 מקלען — זרם נגד המונים, חסר אונים מול שריון, נענש על חום.
 * כפילויות מותרות; הגלים מסקיילים לפי מספר שחקנים. שדרוגים = דראפט אישי אינסופי.
 */
import type { GameCtx, GameInstance } from "../engine";
import type {
  GameClientMsg, WallClientMsg, WallRole, WallEnemyType, WallCard, WallStats,
} from "../../../shared/protocol";

interface Config { difficulty?: "normal" | "brutal" }

/* ---- עולם ---- */
const W = 1000;
const WALL_Y = 1250;          // קו החומה
const STRIP_TOP = 950;        // רצועת החלוץ
const GATE_X = 500;

/* ---- אויבים ---- */
const ETYPES: Record<WallEnemyType, { hp: number; speed: number; wallDps: number; heroHit: number; xp: number }> = {
  swarm:   { hp: 18,  speed: 95,  wallDps: 4,  heroHit: 6,  xp: 2 },
  runner:  { hp: 30,  speed: 150, wallDps: 6,  heroHit: 8,  xp: 3 },
  armored: { hp: 170, speed: 55,  wallDps: 14, heroHit: 14, xp: 8 },
  bomber:  { hp: 45,  speed: 85,  wallDps: 0,  heroHit: 0,  xp: 5 },
  sniper:  { hp: 55,  speed: 120, wallDps: 0,  heroHit: 0,  xp: 10 },
  digger:  { hp: 60,  speed: 115, wallDps: 8,  heroHit: 9,  xp: 6 },
  boss:    { hp: 950, speed: 42,  wallDps: 30, heroHit: 25, xp: 60 },
};

interface Enemy {
  id: number; type: WallEnemyType;
  hp: number; maxHp: number;
  x0: number; y0: number; speed: number; wob: number; at: number; // מסלול נוכחי
  state: "walk" | "fight" | "wall" | "burrow";
  target?: string;          // חלוץ שנלחמים בו / גיבור שהצלף נעל עליו
  lastHit: number;          // מתי הכה לאחרונה
  sniperFireAt?: number;
  resurfaceAt?: number;
}

/* ---- שחקנים ---- */
interface Mods {
  dmg: number; rate: number; hpMul: number; speed: number; range: number;
  crit: number; xpMul: number; pierce: number; multi: number; radius: number;
  heat: number; tracer: number; shieldStr: number; lifesteal: number;
}
const baseMods = (): Mods => ({ dmg: 1, rate: 1, hpMul: 1, speed: 1, range: 1, crit: 0, xpMul: 1, pierce: 0, multi: 0, radius: 1, heat: 1, tracer: 0, shieldStr: 0, lifesteal: 0 });

interface Hero {
  role: WallRole;
  slot: [number, number];
  x: number; y: number;
  hp: number; max: number;
  down: boolean; upAt: number;
  shield: boolean;
  mods: Mods; level: number; xp: number; tier: number;
  picks: Record<string, number>;
  // מקלען
  firing: boolean; aimX: number; heat: number; jamUntil: number; tracerRamp?: number;
  // קצבים
  lastSwing: number; lastShot: number; cannonReadyAt: number;
  lastXpMsg: number;
}

/* ---- קלפי הדראפט — אוניברסליים חוזרים (אינסוף) + ייחודיים לתפקיד ---- */
const UCARDS: WallCard[] = [
  { id: "dmg",   name: "עוצמה",        emoji: "💥", desc: "‎+15% נזק לכל מכה/ירייה" },
  { id: "rate",  name: "קצב אש",       emoji: "⚡", desc: "‎+12% מהירות ירי/מכות" },
  { id: "hp",    name: "חוסן",         emoji: "❤️", desc: "‎+25% חיים מרביים + ריפוי מלא" },
  { id: "speed", name: "זריזות",       emoji: "👟", desc: "‎+10% מהירות תנועה/כיוון" },
  { id: "range", name: "טווח",         emoji: "📏", desc: "‎+10% טווח/רדיוס פגיעה" },
  { id: "crit",  name: "קטלניות",      emoji: "🎯", desc: "‎+8% סיכוי לנזק כפול" },
  { id: "xp",    name: "חוכמת קרב",    emoji: "🧠", desc: "‎+12% ניסיון מהריגות" },
  { id: "wall",  name: "בנאי החומה",   emoji: "🧱", desc: "מתקן מיד 12% מחיי החומה" },
];
const CCARDS: Record<WallRole, WallCard[]> = {
  archer: [
    { id: "pierce", name: "חץ חודר",   emoji: "🏹", desc: "החץ ממשיך דרך אויב נוסף" },
    { id: "multi",  name: "מטח כפול",  emoji: "🎯", desc: "כל מתיחה יורה חץ נוסף" },
  ],
  cannon: [
    { id: "radius", name: "פגז מצרר",  emoji: "💣", desc: "‎+25% רדיוס פיצוץ" },
    { id: "multi",  name: "לוע כפול",  emoji: "🔥", desc: "פגז נוסף בכל שיגור" },
  ],
  mg: [
    { id: "heatc",  name: "קירור-על",  emoji: "❄️", desc: "‎+30% קיבולת חום" },
    { id: "tracer", name: "קליעי נותב", emoji: "✨", desc: "הנזק גדל ככל שהצרור נמשך" },
  ],
  infantry: [
    { id: "shieldstr", name: "מגן קרב",   emoji: "🛡️", desc: "המגן חוסם עוד 10% ומכה בהדיפה" },
    { id: "lifesteal", name: "צמא דם",    emoji: "🩸", desc: "כל מכה מרפאת 3 חיים" },
  ],
};

const TIER_MULT = [1, 1, 1.5, 2.2]; // דרגת נשק (1-3) — אינדקס לפי דרגה
const TIER_LEVELS = [3, 7]; // רמה 3 → דרגה 2 · רמה 7 → דרגה 3 (הנשק מתחלף ויזואלית!)

export function createWall(ctx: GameCtx): GameInstance {
  const brutal = ((ctx.config ?? {}) as Config).difficulty === "brutal";
  const diff = brutal ? 1.3 : 1;

  let phase: "setup" | "wave" | "breath" | "over" | "done" = "setup";
  let token = 0;
  let wave = 0, bestWave = 0;
  let wallHp = 0, wallMax = 0;
  let waveEndsAt = 0;
  let eSeq = 0;
  let spawnsLeft = 0;

  const heroes = new Map<string, Hero>();
  const enemies = new Map<number, Enemy>();
  const stats: Record<string, WallStats> = {};
  const hands = new Map<string, WallCard[]>();
  const pendingLevels = new Map<string, number>(); // עליות רמה שמחכות לדראפט

  const alive = () => ctx.participants().filter((p) => p.connected).map((p) => p.id);
  const hostId = () => ctx.players().find((p) => p.isHost)?.id;
  const st = (pid: string) => (stats[pid] ??= { kills: 0, dmg: 0, saves: 0, deaths: 0 });
  const now = () => ctx.now();

  /* ---- מיקום אויב לפי נוסחה (זהה ללקוח!) ---- */
  const posOf = (e: Enemy, t: number): [number, number] => {
    if (e.state === "fight" || e.state === "wall") return [e.x0, e.y0];
    const dt = t - e.at;
    return [e.x0 + e.wob * Math.sin(dt / 700), e.y0 + (e.speed * dt) / 1000];
  };

  /* ---- הקצאת עמדות ---- */
  function assignSlots() {
    const ps = alive();
    const byRole: Record<WallRole, string[]> = { infantry: [], archer: [], cannon: [], mg: [] };
    for (const p of ps) byRole[heroes.get(p)!.role].push(p);
    // חלוצים — פרוסים ברצועה; תפקידי חומה — משבצות לאורך הקו
    byRole.infantry.forEach((p, i) => {
      const h = heroes.get(p)!;
      h.slot = [W * ((i + 1) / (byRole.infantry.length + 1)), 1100];
      [h.x, h.y] = h.slot;
    });
    const wallers = [...byRole.archer, ...byRole.mg, ...byRole.cannon];
    wallers.forEach((p, i) => {
      const h = heroes.get(p)!;
      h.slot = [W * ((i + 1) / (wallers.length + 1)), WALL_Y + 60];
      [h.x, h.y] = h.slot;
    });
  }
  const slotsMsg = () => Object.fromEntries([...heroes.entries()].map(([p, h]) => [p, h.slot]));
  const rolesMsg = () => Object.fromEntries([...heroes.entries()].map(([p, h]) => [p, h.role]));
  const tiersMsg = () => Object.fromEntries([...heroes.entries()].map(([p, h]) => [p, h.tier]));

  function stateMsg() {
    return {
      a: "wl_state" as const, wave, roles: rolesMsg(), slots: slotsMsg(),
      wallHp: Math.round(wallHp), wallMax, phase: phase === "done" ? ("over" as const) : phase, tiers: tiersMsg(),
    };
  }

  /* ---- גלים ---- */
  function waveCount(w: number) {
    const n = Math.max(2, alive().length);
    return Math.round((8 + 6 * w) * Math.max(1, n * 0.42) * diff);
  }
  function waveMix(w: number): WallEnemyType[] {
    const mix: WallEnemyType[] = ["swarm", "swarm", "runner"];
    if (w >= 2) mix.push("bomber");
    if (w >= 3) mix.push("armored", "swarm");
    if (w >= 4) mix.push("sniper");
    if (w >= 5) mix.push("digger");
    if (w >= 6) mix.push("armored", "runner");
    return mix;
  }
  const hpScale = (w: number) => (1 + 0.22 * (w - 1)) * (1 + 0.12 * (Math.max(2, alive().length) - 2)) * diff;

  function startWave(w: number, delayMs: number) {
    wave = w; bestWave = Math.max(bestWave, w);
    phase = "wave";
    const t = ++token;
    const duration = Math.min(45_000, 28_000 + w * 2500);
    const at = ctx.cue(delayMs, { a: "wl_wave", wave, wallHp: Math.round(wallHp), wallMax, duration });
    waveEndsAt = at + duration;
    // לוח ספאונים
    const mix = waveMix(w);
    const count = waveCount(w);
    spawnsLeft = count + (w % 5 === 0 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const delay = at - now() + 1200 + (duration * 0.72 * i) / count + Math.random() * 900;
      const type = mix[Math.floor(Math.random() * mix.length)];
      ctx.timer(delay, () => { if (token === t && phase === "wave") spawn(type, t); else spawnsLeft--; });
    }
    if (w % 5 === 0) ctx.timer(at - now() + duration * 0.35, () => { if (token === t && phase === "wave") spawn("boss", t); else spawnsLeft--; });
    // טיק
    ctx.timer(at - now(), function tick() {
      if (token !== t || phase !== "wave") return;
      simTick(t);
      ctx.timer(100, tick);
    });
    // סוף גל: כשנגמר הזמן וכל האויבים מתו
    ctx.timer(at - now() + duration, function checkEnd() {
      if (token !== t || phase !== "wave") return;
      if (enemies.size === 0 && spawnsLeft <= 0) waveClear();
      else ctx.timer(500, checkEnd);
    });
  }

  function spawn(type: WallEnemyType, t: number) {
    spawnsLeft--;
    const base = ETYPES[type];
    const id = ++eSeq;
    const hp = Math.round(base.hp * hpScale(wave));
    const e: Enemy = {
      id, type, hp, maxHp: hp,
      x0: 60 + Math.random() * (W - 120), y0: -60,
      speed: base.speed * (0.9 + Math.random() * 0.2),
      wob: type === "runner" ? 70 : type === "swarm" ? 45 : 20,
      at: now() + 400, state: "walk", lastHit: 0,
    };
    enemies.set(id, e);
    ctx.cue(400, { a: "wl_spawn", id, type, x0: e.x0, y0: e.y0, speed: e.speed, wob: e.wob, hp, maxHp: hp, at: e.at });
    void t;
  }

  function setPath(e: Enemy, x: number, y: number, state: Enemy["state"], speed?: number) {
    e.x0 = x; e.y0 = y; e.at = now(); e.state = state;
    if (speed !== undefined) e.speed = speed;
    ctx.broadcast({ a: "wl_estate", id: e.id, state: state === "burrow" ? "burrow" : state, x, y, at: e.at, speed: e.speed });
  }

  /* ---- הטיק המרכזי ---- */
  function simTick(t: number) {
    const tn = now();
    const infantry = alive().filter((p) => { const h = heroes.get(p); return h && h.role === "infantry" && !h.down; });

    for (const e of [...enemies.values()]) {
      const [ex, ey] = posOf(e, tn);

      if (e.state === "walk") {
        // צלף: נעצר ונועל על גיבור
        if (e.type === "sniper" && ey >= 470) {
          const targets = alive().filter((p) => !heroes.get(p)!.down);
          if (targets.length) {
            const target = targets[Math.floor(Math.random() * targets.length)];
            e.target = target; e.sniperFireAt = tn + 3200;
            setPath(e, ex, 470, "fight");
            ctx.broadcast({ a: "wl_sniper", id: e.id, target, fireAt: e.sniperFireAt });
            continue;
          }
        }
        // מחפר: צולל מתחת לרצועה
        if (e.type === "digger" && !e.resurfaceAt && ey >= 560) {
          e.resurfaceAt = tn + 2200;
          setPath(e, ex, 560, "burrow");
          continue;
        }
        // מפגש עם חלוץ
        const blocker = infantry.find((p) => {
          const h = heroes.get(p)!;
          return Math.abs(h.x - ex) < 80 && ey >= h.y - 70 && ey <= h.y + 40;
        });
        if (blocker && e.type !== "sniper") {
          if (e.type === "bomber") { explode(e, blocker); continue; }
          e.target = blocker;
          setPath(e, ex, Math.max(ey, heroes.get(blocker)!.y - 55), "fight");
          continue;
        }
        // הגעה לחומה
        if (ey >= WALL_Y - 45) {
          if (e.type === "bomber") { explode(e); continue; }
          setPath(e, ex, WALL_Y - 45, "wall");
          continue;
        }
      }

      if (e.state === "burrow" && e.resurfaceAt && tn >= e.resurfaceAt) {
        e.resurfaceAt = undefined;
        setPath(e, e.x0, 1150, "walk", e.speed * 1.1);
        continue;
      }

      if (e.state === "fight") {
        if (e.type === "sniper") {
          if (e.sniperFireAt && tn >= e.sniperFireAt) {
            const h = e.target && heroes.get(e.target);
            if (h && !h.down) hurtHero(e.target!, 38);
            e.sniperFireAt = tn + 4000; // טוען שוב
          }
          continue;
        }
        const h = e.target && heroes.get(e.target);
        if (!h || h.down || Math.abs(h.x - e.x0) > 130) {
          e.target = undefined;
          setPath(e, e.x0, e.y0, "walk");
          continue;
        }
        if (tn - e.lastHit > 750) {
          e.lastHit = tn;
          hurtHero(e.target!, Math.round(ETYPES[e.type].heroHit * (h.shield ? 0.2 - h.mods.shieldStr * 0.1 : 1) * hpScale(wave) ** 0.4));
          if (h.shield && h.mods.shieldStr > 0) damageEnemy(e, 8 * h.mods.shieldStr, e.target!); // הדיפה
        }
      }

      if (e.state === "wall" && tn - e.lastHit > 1000) {
        e.lastHit = tn;
        wallHp -= ETYPES[e.type].wallDps * diff;
        if (wallHp <= 0) return gameOver();
        ctx.broadcast({ a: "wl_wall", hp: Math.round(Math.max(0, wallHp)), max: wallMax });
      }
    }

    // מקלענים
    for (const p of alive()) {
      const h = heroes.get(p)!;
      if (h.role !== "mg" || h.down) continue;
      if (h.firing && tn < h.jamUntil) h.firing = false;
      if (h.firing) {
        h.heat += 1.7 / h.mods.heat;
        h.tracerRamp = Math.min(1, (h.tracerRamp ?? 0) + 0.035);
        if (h.heat >= 100) {
          h.heat = 100; h.firing = false; h.jamUntil = tn + 3000;
          ctx.broadcast({ a: "wl_jam", by: p, ms: 3000 });
          ctx.broadcast({ a: "wl_stream", by: p, x: h.aimX, on: false });
        } else {
          // פוגע באויב הקדמי בציר הכיוון (לא משוריינים!)
          const targets = [...enemies.values()]
            .filter((e) => e.type !== "armored" && e.state !== "burrow")
            .map((e) => ({ e, pos: posOf(e, tn) }))
            .filter(({ pos }) => Math.abs(pos[0] - h.aimX) < 62 * h.mods.range && pos[1] > 0 && pos[1] < WALL_Y)
            .sort((a, b) => b.pos[1] - a.pos[1]);
          if (targets.length) {
            const dmg = 4.6 * h.mods.dmg * TIER_MULT[h.tier] * (1 + (h.mods.tracer ? h.tracerRamp ?? 0 : 0));
            damageEnemy(targets[0].e, dmg, p);
          }
        }
      } else {
        h.heat = Math.max(0, h.heat - 2.2);
        h.tracerRamp = 0;
      }
    }

    // שידור מיקומי גיבורים (כל 300ms)
    if (Math.floor(tn / 300) !== Math.floor((tn - 100) / 300)) {
      ctx.broadcast({ a: "wl_ppos", ps: alive().map((p) => { const h = heroes.get(p)!; return [p, Math.round(h.x), Math.round(h.y)] as [string, number, number]; }) });
    }
  }

  function explode(e: Enemy, heroPid?: string) {
    const [ex, ey] = posOf(e, now());
    enemies.delete(e.id);
    ctx.broadcast({ a: "wl_hit", id: e.id, hp: 0, by: "" });
    ctx.broadcast({ a: "wl_boomfx", x: Math.round(ex), y: Math.round(ey), r: 130 });
    if (heroPid) hurtHero(heroPid, 45);
    else {
      wallHp -= 55 * diff;
      if (wallHp <= 0) return gameOver();
      ctx.broadcast({ a: "wl_wall", hp: Math.round(Math.max(0, wallHp)), max: wallMax });
    }
  }

  function hurtHero(pid: string, dmg: number) {
    const h = heroes.get(pid);
    if (!h || h.down) return;
    h.hp -= dmg;
    if (h.hp <= 0) {
      h.hp = 0; h.down = true; h.upAt = now() + 3500;
      st(pid).deaths++;
      ctx.broadcast({ a: "wl_hero", pid, hp: 0, max: h.max, down: true, upAt: h.upAt });
      const t = token;
      ctx.timer(3500, () => {
        if (token !== t || (phase !== "wave" && phase !== "breath")) return;
        h.down = false; h.hp = h.max;
        if (h.role === "infantry") { h.x = GATE_X; h.y = 1180; }
        ctx.broadcast({ a: "wl_hero", pid, hp: h.hp, max: h.max });
      });
    } else {
      ctx.broadcast({ a: "wl_hero", pid, hp: Math.round(h.hp), max: h.max });
    }
  }

  function damageEnemy(e: Enemy, dmg: number, by: string, crit = false) {
    if (!enemies.has(e.id)) return;
    const h = heroes.get(by);
    if (h && Math.random() < h.mods.crit) { dmg *= 2; crit = true; }
    e.hp -= dmg;
    st(by).dmg += dmg;
    if (h?.mods.lifesteal && h.role === "infantry" && !h.down) h.hp = Math.min(h.max, h.hp + 3 * h.mods.lifesteal);
    if (e.hp <= 0) {
      enemies.delete(e.id);
      ctx.broadcast({ a: "wl_hit", id: e.id, hp: 0, by, crit });
      st(by).kills++;
      if (h) giveXp(by, ETYPES[e.type].xp);
    } else {
      ctx.broadcast({ a: "wl_hit", id: e.id, hp: Math.round(e.hp), by, crit });
    }
  }

  /* ---- XP ודראפט ---- */
  const xpNeed = (lvl: number) => Math.round(10 * Math.pow(1.35, lvl - 1));
  function giveXp(pid: string, amount: number) {
    const h = heroes.get(pid)!;
    h.xp += amount * h.mods.xpMul;
    while (h.xp >= xpNeed(h.level)) {
      h.xp -= xpNeed(h.level);
      h.level++;
      // דרגת נשק אוטומטית
      const tierIdx = TIER_LEVELS.indexOf(h.level); // רמה 3 → דרגה 2, רמה 7 → דרגה 3
      if (tierIdx >= 0) {
        h.tier = tierIdx + 2;
        ctx.broadcast({ a: "wl_tier", pid, tier: h.tier });
      }
      queueDraft(pid);
    }
    const tn = now();
    if (tn - h.lastXpMsg > 900) {
      h.lastXpMsg = tn;
      ctx.sendTo(pid, { a: "wl_xp", xp: Math.round(h.xp), level: h.level, next: xpNeed(h.level) });
    }
  }

  function queueDraft(pid: string) {
    if (hands.has(pid)) { pendingLevels.set(pid, (pendingLevels.get(pid) ?? 0) + 1); return; }
    const h = heroes.get(pid)!;
    const pool = [...UCARDS, ...CCARDS[h.role]];
    const cards: WallCard[] = [];
    while (cards.length < 3 && pool.length) {
      const c = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const tier = (h.picks[c.id] ?? 0) + 1;
      cards.push({ ...c, tier, name: tier > 1 ? `${c.name} ${["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][Math.min(tier, 10)]}` : c.name });
    }
    hands.set(pid, cards);
    ctx.sendTo(pid, { a: "wl_levelup", level: h.level, cards });
  }

  function applyPick(pid: string, cardId: string) {
    const hand = hands.get(pid);
    const card = hand?.find((c) => c.id === cardId);
    if (!card) return;
    hands.delete(pid);
    const h = heroes.get(pid)!;
    h.picks[cardId] = (h.picks[cardId] ?? 0) + 1;
    const m = h.mods;
    switch (cardId) {
      case "dmg": m.dmg *= 1.15; break;
      case "rate": m.rate *= 1.12; break;
      case "hp": h.max = Math.round(h.max * 1.25); h.hp = h.max; ctx.broadcast({ a: "wl_hero", pid, hp: h.hp, max: h.max }); break;
      case "speed": m.speed *= 1.1; break;
      case "range": m.range *= 1.1; break;
      case "crit": m.crit = Math.min(0.6, m.crit + 0.08); break;
      case "xp": m.xpMul *= 1.12; break;
      case "wall": wallHp = Math.min(wallMax, wallHp + wallMax * 0.12); ctx.broadcast({ a: "wl_wall", hp: Math.round(wallHp), max: wallMax }); break;
      case "pierce": m.pierce += 1; break;
      case "multi": m.multi += 1; break;
      case "radius": m.radius *= 1.25; break;
      case "heatc": m.heat *= 1.3; break;
      case "tracer": m.tracer += 1; break;
      case "shieldstr": m.shieldStr += 1; break;
      case "lifesteal": m.lifesteal += 1; break;
    }
    const info = ctx.players().find((p) => p.id === pid);
    void info;
    ctx.broadcast({ a: "wl_picked", pid, name: card.name, emoji: card.emoji });
    // עוד רמה ממתינה?
    const pending = pendingLevels.get(pid) ?? 0;
    if (pending > 0) { pendingLevels.set(pid, pending - 1); queueDraft(pid); }
  }

  /* ---- סוף גל / משחק ---- */
  function waveClear() {
    phase = "breath";
    token++;
    ctx.broadcast({ a: "wl_clear", wave, wallHp: Math.round(wallHp) });
    // תיקון קטן בין גלים
    wallHp = Math.min(wallMax, wallHp + wallMax * 0.06);
    const t = token;
    ctx.timer(9000, () => { if (token === t && phase === "breath") startWave(wave + 1, 2500); });
  }

  function gameOver() {
    if (phase === "over" || phase === "done") return;
    phase = "over";
    token++;
    wallHp = 0;
    for (const id of [...enemies.keys()]) enemies.delete(id);
    ctx.broadcast({ a: "wl_wall", hp: 0, max: wallMax });
    const remainS = Math.ceil(Math.max(0, waveEndsAt - now()) / 1000);
    const nearMiss = remainS > 0 && remainS <= 12 ? `עוד ${remainS} שניות והייתם שורדים את גל ${wave}! 😩` : undefined;
    ctx.timer(2600, () => {
      if (phase !== "over") return;
      ctx.broadcast({
        a: "wl_over", wave, bestWave, nearMiss, mvp: mvpId(),
        stats: Object.fromEntries(alive().map((p) => [p, st(p)])),
      });
    });
  }

  const score = (p: string) => { const s = st(p); return s.kills * 3 + s.dmg / 50 + s.saves * 5 - s.deaths * 2; };
  function mvpId() { const ps = alive(); return [...ps].sort((a, b) => score(b) - score(a))[0]; }

  function finish() {
    phase = "done"; token++;
    const ps = alive();
    const winner = mvpId();
    const loser = [...ps].sort((a, b) => st(b).deaths - st(a).deaths || score(a) - score(b))[0];
    const scores: Record<string, number> = {};
    for (const p of ps) scores[p] = Math.round(Math.max(0, score(p)));
    ctx.end({
      title: `החומה 🏰 עמדתם עד גל ${bestWave}!`,
      winnerId: winner,
      loserId: loser !== winner ? loser : undefined,
      scores,
    });
  }

  function resetRun() {
    for (const p of alive()) {
      const h = heroes.get(p)!;
      const isInf = h.role === "infantry";
      h.hp = h.max = isInf ? 150 : 100;
      h.down = false; h.shield = false; h.firing = false; h.heat = 0; h.jamUntil = 0;
      h.mods = baseMods(); h.level = 1; h.xp = 0; h.tier = 1; h.picks = {};
      [h.x, h.y] = h.slot;
    }
    hands.clear(); pendingLevels.clear();
    const n = Math.max(2, alive().length);
    wallMax = wallHp = 600 + 160 * n;
    enemies.clear();
  }

  const defaultRole = (i: number): WallRole => (["infantry", "archer", "mg", "cannon", "infantry", "archer", "archer", "mg", "cannon", "infantry"] as WallRole[])[i % 10];

  return {
    onStart() {
      alive().forEach((p, i) => {
        heroes.set(p, {
          role: defaultRole(i), slot: [500, 1100], x: 500, y: 1100,
          hp: 150, max: 150, down: false, upAt: 0, shield: false,
          mods: baseMods(), level: 1, xp: 0, tier: 1, picks: {},
          firing: false, aimX: 500, heat: 0, jamUntil: 0,
          lastSwing: 0, lastShot: 0, cannonReadyAt: 0, lastXpMsg: 0,
        });
      });
      assignSlots();
      ctx.broadcast({ a: "wl_setup", roles: rolesMsg(), slots: slotsMsg() });
    },

    onRejoin(pid: string) {
      if (phase === "done") return;
      ctx.sendTo(pid, stateMsg());
    },

    onMessage(pid: string, d: GameClientMsg) {
      const m = d as WallClientMsg;
      const h = heroes.get(pid);
      if (!h) return;
      switch (m.a) {
        case "wl_role": {
          if (phase !== "setup") return;
          if (!["infantry", "archer", "cannon", "mg"].includes(m.role)) return;
          h.role = m.role;
          h.max = h.hp = m.role === "infantry" ? 150 : 100;
          assignSlots();
          ctx.broadcast({ a: "wl_setup", roles: rolesMsg(), slots: slotsMsg() });
          return;
        }
        case "wl_go": {
          if (phase !== "setup" || pid !== hostId()) return;
          resetRun();
          assignSlots();
          ctx.broadcast({ a: "wl_setup", roles: rolesMsg(), slots: slotsMsg() });
          startWave(1, 3000);
          return;
        }
        case "wl_pos": {
          if (h.role !== "infantry" || h.down) return;
          h.x = Math.max(30, Math.min(W - 30, m.x));
          h.y = Math.max(STRIP_TOP, Math.min(WALL_Y - 15, m.y));
          return;
        }
        case "wl_swing": {
          if (phase !== "wave" || h.role !== "infantry" || h.down || h.shield) return;
          const tn = now();
          if (tn - h.lastSwing < 480 / h.mods.rate) return;
          h.lastSwing = tn;
          const reach = 130 * h.mods.range * (1 + 0.15 * (h.tier - 1));
          const dmg = 34 * h.mods.dmg * TIER_MULT[h.tier];
          for (const e of [...enemies.values()]) {
            const [ex, ey] = posOf(e, tn);
            const dx = ex - h.x, dy = ey - h.y;
            const dist = Math.hypot(dx, dy);
            if (dist > reach) continue;
            const ang = Math.atan2(dy, dx);
            let dd = Math.abs(ang - m.dir);
            if (dd > Math.PI) dd = 2 * Math.PI - dd;
            if (dd < 1.15) damageEnemy(e, dmg, pid);
          }
          return;
        }
        case "wl_shield": {
          if (h.role !== "infantry") return;
          h.shield = m.on;
          return;
        }
        case "wl_shot": {
          if (phase !== "wave" || h.role !== "archer" || h.down) return;
          const tn = now();
          if (tn - h.lastShot < 650 / h.mods.rate) return;
          h.lastShot = tn;
          const shots = 1 + h.mods.multi;
          for (let s = 0; s < shots; s++) {
            const tx = Math.max(0, Math.min(W, m.tx + (s ? (s % 2 ? 70 : -70) * Math.ceil(s / 2) : 0)));
            const ty = Math.max(0, Math.min(WALL_Y, m.ty));
            const dist = Math.hypot(tx - h.slot[0], ty - h.slot[1]);
            const T = Math.round(280 + dist * 0.35);
            ctx.cue(300, { a: "wl_arrow", fx: Math.round(h.slot[0]), fy: Math.round(h.slot[1]), tx: Math.round(tx), ty: Math.round(ty), T, by: pid, fire: h.tier >= 2 });
            const t = token;
            ctx.timer(300 + T, () => {
              if (token !== t || phase !== "wave") return;
              const impactT = now();
              let hitsLeft = 1 + h.mods.pierce;
              const near = [...enemies.values()]
                .map((e) => ({ e, pos: posOf(e, impactT) }))
                .filter(({ e, pos }) => e.state !== "burrow" && Math.hypot(pos[0] - tx, pos[1] - ty) < 75 * h.mods.range)
                .sort((a, b) => Math.hypot(a.pos[0] - tx, a.pos[1] - ty) - Math.hypot(b.pos[0] - tx, b.pos[1] - ty));
              for (const { e } of near) {
                if (hitsLeft-- <= 0) break;
                damageEnemy(e, 26 * h.mods.dmg * TIER_MULT[h.tier] * (0.5 + 0.5 * m.power), pid);
                // צלף שנוטרל לפני הירייה = הצלה
                if (e.type === "sniper") st(pid).saves++;
              }
            });
          }
          return;
        }
        case "wl_boom": {
          if (phase !== "wave" || h.role !== "cannon" || h.down) return;
          const tn = now();
          if (tn < h.cannonReadyAt) return;
          h.cannonReadyAt = tn + 3600 / h.mods.rate;
          const shots = 1 + h.mods.multi;
          for (let s = 0; s < shots; s++) {
            const tx = Math.max(0, Math.min(W, m.tx + (s ? (s % 2 ? 90 : -90) : 0)));
            const ty = Math.max(60, Math.min(WALL_Y - 30, m.ty));
            const T = 1100;
            ctx.cue(300, { a: "wl_shell", fx: Math.round(h.slot[0]), fy: Math.round(h.slot[1]), tx: Math.round(tx), ty: Math.round(ty), T, by: pid });
            const t = token;
            ctx.timer(300 + T, () => {
              if (token !== t || phase !== "wave") return;
              const impactT = now();
              const r = 145 * h.mods.radius * (1 + 0.12 * (h.tier - 1));
              ctx.broadcast({ a: "wl_boomfx", x: Math.round(tx), y: Math.round(ty), r: Math.round(r) });
              for (const e of [...enemies.values()]) {
                const pos = posOf(e, impactT);
                if (e.state !== "burrow" && Math.hypot(pos[0] - tx, pos[1] - ty) < r) {
                  damageEnemy(e, 95 * h.mods.dmg * TIER_MULT[h.tier], pid);
                }
              }
            });
          }
          return;
        }
        case "wl_fire": {
          if (h.role !== "mg" || h.down) return;
          const tn = now();
          if (m.on && tn < h.jamUntil) return;
          h.firing = m.on && phase === "wave";
          ctx.broadcast({ a: "wl_stream", by: pid, x: Math.round(h.aimX), on: h.firing });
          return;
        }
        case "wl_aim": {
          if (h.role !== "mg") return;
          h.aimX = Math.max(0, Math.min(W, m.x));
          if (h.firing) ctx.broadcast({ a: "wl_stream", by: pid, x: Math.round(h.aimX), on: true });
          return;
        }
        case "wl_pick": applyPick(pid, m.cardId); return;
        case "wl_again": {
          if (phase !== "over" || pid !== hostId()) return;
          resetRun();
          phase = "setup";
          ctx.broadcast({ a: "wl_setup", roles: rolesMsg(), slots: slotsMsg() });
          return;
        }
        case "wl_finish": {
          if (phase !== "over" || pid !== hostId()) return;
          finish();
          return;
        }
      }
    },

    onLeave(pid: string, permanent?: boolean) {
      if (!permanent) return;
      heroes.delete(pid);
      if (phase === "setup") { assignSlots(); ctx.broadcast({ a: "wl_setup", roles: rolesMsg(), slots: slotsMsg() }); }
    },

    dispose() {
      phase = "done"; token++;
      enemies.clear();
    },
  };
}
