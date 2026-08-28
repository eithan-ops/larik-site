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

interface Config {
  difficulty?: "normal" | "brutal";
  /** זרע לאתגר היומי — כשהוא קיים כל האקראיות דטרמיניסטית, ואותו יום נותן
   *  לכל השחקנים בעולם בדיוק את אותם גלים. בלעדיו המשחק אקראי כרגיל. */
  seed?: string;
  /** מצב סולו — עוקף את מינימום השחקנים */
  solo?: boolean;
}

/**
 * mulberry32 — מחולל אקראי קטן ודטרמיניסטי.
 * בלי זה "אותו אתגר לכולם" הוא סיסמה: הגלים, המסלולים, הקריטים והדראפט
 * היו שונים לכל שחקן, ושום טבלה יומית לא הייתה אומרת כלום.
 */
export function makeRng(seed?: string): () => number {
  if (!seed) return Math.random;
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
  // ---- מצבים מתכונות נשק ----
  burnUntil?: number; burnDps?: number; burnBy?: string;
  poisonUntil?: number; poisonStacks?: number; poisonBy?: string;
  slowUntil?: number; fullSpeed?: number;   // fullSpeed = המהירות לפני ההאטה
  lastDot?: number;
}

/* ---- תכונות נשק (השכבה שבה חי ה"אינסוף") ----
 * כל תכונה נערמת בלי תקרה. הערימה הראשונה = התנהגות חדשה שאי אפשר לא לראות;
 * כל ערימה נוספת מעצימה גם את המספר וגם את הוויזואל (הלקוח מרכיב את המראה מהערימות). */
export type TraitId = "burn" | "frost" | "chain" | "poison" | "blast" | "pierce" | "multi" | "vamp";
const TRAIT_IDS: TraitId[] = ["burn", "frost", "chain", "poison", "blast", "pierce", "multi", "vamp"];
/** ערימה שמזכה באבולוציה (בתנאי שדרגת הנשק מספיקה) */
const EVO_STACKS = 5;
const EVO_TIER = 4;
const EVO: Record<TraitId, { name: string; emoji: string }> = {
  burn:   { name: "לשון הדרקון",   emoji: "🐉" },
  frost:  { name: "עידן הקרח",     emoji: "🧊" },
  chain:  { name: "זעם הסופה",     emoji: "⚡" },
  poison: { name: "נשימת הביצה",   emoji: "☣️" },
  blast:  { name: "יום הדין",      emoji: "☄️" },
  pierce: { name: "רומח הנצח",     emoji: "🔱" },
  multi:  { name: "גשם הכוכבים",   emoji: "🌠" },
  vamp:   { name: "צמא הנצח",      emoji: "🩸" },
};

/* ---- שחקנים ---- */
interface Mods {
  dmg: number; rate: number; speed: number; range: number;
  crit: number; xpMul: number; radius: number;
  heat: number; tracer: number; shieldStr: number; lifesteal: number;
  armor: number;    // שובר שריון — נזק נוסף למשוריין/בוס
  exec: number;     // מכת חסד — נזק נוסף לאויב פצוע
  momentum: number; // מומנטום — כל הריגה מוסיפה נזק זמני
  sentry: number;   // מוצב מבוצר — סופג את יריית הצלף הראשונה בגל
}
const baseMods = (): Mods => ({ dmg: 1, rate: 1, speed: 1, range: 1, crit: 0, xpMul: 1, radius: 1, heat: 1, tracer: 0, shieldStr: 0, lifesteal: 0, armor: 0, exec: 0, momentum: 0, sentry: 0 });
const baseTraits = (): Record<TraitId, number> => ({ burn: 0, frost: 0, chain: 0, poison: 0, blast: 0, pierce: 0, multi: 0, vamp: 0 });

interface Hero {
  role: WallRole;
  slot: [number, number];
  x: number; y: number;
  hp: number; max: number;
  down: boolean; upAt: number;
  shield: boolean;
  mods: Mods; level: number; xp: number; tier: number;
  traits: Record<TraitId, number>;
  evos: TraitId[];
  momoUntil: number; momoStacks: number; // מומנטום פעיל
  sentryUsed: boolean;
  picks: Record<string, number>;
  // מקלען
  firing: boolean; aimX: number; heat: number; jamUntil: number; tracerRamp?: number;
  // קצבים
  lastSwing: number; lastShot: number; cannonReadyAt: number;
  lastXpMsg: number;
  lastChainFx: number; lastBlastFx: number; // סינון אפקטים — הנזק תמיד מוחל
  fxTurn: number;   // תור האפקט: כל פגיעה מציגה תכונה *אחת*, בסבב
}

/* ---- קלפי הדראפט ----
 * שלוש משפחות: מגברים (אחוזים — אבל כאלה שרואים ומרגישים), תכונות (התנהגות+מראה),
 * וקלפי תפקיד. `roles` מגביל קלף לתפקידים שבהם הוא באמת עושה משהו — הדראפט
 * לעולם לא מציע קלף מת (זה מה שהפך את הבריכה של התותחן ל-6 קלפים בלבד). */
type Card = WallCard & { roles?: WallRole[]; kind: "amp" | "trait" | "role" };

const AMPS: Card[] = [
  { kind: "amp", id: "dmg",    name: "עוצמה",        emoji: "💥", desc: "‎+18% נזק — והקליע מתעבה" },
  { kind: "amp", id: "rate",   name: "קצב אש",       emoji: "⚡", desc: "‎+12% מהירות ירי/מכות" },
  { kind: "amp", id: "crit",   name: "קטלניות",      emoji: "🎯", desc: "‎+8% סיכוי לנזק כפול" },
  { kind: "amp", id: "range",  name: "טווח",         emoji: "📏", desc: "‎+12% טווח ורדיוס פגיעה" },
  { kind: "amp", id: "armor",  name: "שובר שריון",   emoji: "🔨", desc: "‎+35% נזק למשוריינים ולבוס" },
  { kind: "amp", id: "exec",   name: "מכת חסד",      emoji: "💀", desc: "‎+45% נזק לאויב מתחת ל-35% חיים" },
  { kind: "amp", id: "momo",   name: "מומנטום",      emoji: "⏱️", desc: "כל הריגה ‎+4% נזק ל-4 שניות (מצטבר)" },
  { kind: "amp", id: "xp",     name: "חוכמת קרב",    emoji: "🧠", desc: "‎+12% ניסיון מהריגות" },
  { kind: "amp", id: "wall",   name: "בנאי החומה",   emoji: "🧱", desc: "מתקן מיד 12% מחיי החומה" },
  // חיים/תנועה רלוונטיים רק למי שבשטח
  { kind: "amp", id: "hp",     name: "חוסן",         emoji: "❤️", desc: "‎+25% חיים מרביים + ריפוי מלא", roles: ["infantry"] },
  { kind: "amp", id: "speed",  name: "זריזות",       emoji: "👟", desc: "‎+10% מהירות תנועה", roles: ["infantry"] },
  // ...ולמי שעל החומה יש מקבילה משלו
  { kind: "amp", id: "sentry", name: "מוצב מבוצר",   emoji: "🎖️", desc: "סופג את יריית הצלף הראשונה בכל גל", roles: ["archer", "cannon", "mg"] },
];

const TRAIT_CARDS: Card[] = [
  { kind: "trait", id: "burn",   name: "בעירה",      emoji: "🔥", desc: "הפגיעה מציתה — האויב ממשיך לבעור" },
  { kind: "trait", id: "frost",  name: "כפור",       emoji: "❄️", desc: "הפגיעה מקפיאה — האויב מאט" },
  { kind: "trait", id: "chain",  name: "שרשרת ברק",  emoji: "⚡", desc: "הפגיעה קופצת לאויב נוסף בקרבת מקום" },
  { kind: "trait", id: "poison", name: "רעל",        emoji: "☠️", desc: "רעל מצטבר שממשיך לכרסם" },
  { kind: "trait", id: "blast",  name: "נפץ",        emoji: "💥", desc: "כל הריגה מפוצצת פיצוץ קטן" },
  { kind: "trait", id: "pierce", name: "חדירה",      emoji: "🗡️", desc: "עובר דרך אויב נוסף ומתעלם משריון" },
  { kind: "trait", id: "multi",  name: "כפילות",     emoji: "✨", desc: "קליע נוסף בכל ירייה" },
  { kind: "trait", id: "vamp",   name: "ערפד",       emoji: "🩸", desc: "כל הריגה מרפאת אותך" },
];

const ROLE_CARDS: Card[] = [
  { kind: "role", id: "radius",    name: "פגז מצרר",   emoji: "💣", desc: "‎+25% רדיוס פיצוץ", roles: ["cannon"] },
  { kind: "role", id: "heatc",     name: "קירור-על",   emoji: "🧊", desc: "‎+30% קיבולת חום", roles: ["mg"] },
  { kind: "role", id: "tracer",    name: "קליעי נותב", emoji: "🌟", desc: "הנזק גדל ככל שהצרור נמשך", roles: ["mg"] },
  { kind: "role", id: "shieldstr", name: "מגן קרב",    emoji: "🛡️", desc: "המגן חוסם עוד ומכה בהדיפה", roles: ["infantry"] },
  { kind: "role", id: "lifesteal", name: "צמא דם",     emoji: "🫀", desc: "כל מכה מרפאת 3 חיים", roles: ["infantry"] },
];

const ALL_CARDS = [...AMPS, ...TRAIT_CARDS, ...ROLE_CARDS];
const cardsFor = (role: WallRole) => ALL_CARDS.filter((c) => !c.roles || c.roles.includes(role));

/* ---- דרגות נשק — בלי תקרה. כל 3 רמות הנשק מחליף גוף וגדל. ---- */
const tierOf = (level: number) => 1 + Math.floor(level / 3);
const tierMult = (tier: number) => 1 + 0.45 * (tier - 1);

export function createWall(ctx: GameCtx): GameInstance {
  const cfg = (ctx.config ?? {}) as Config;
  const brutal = cfg.difficulty === "brutal";
  const rnd = makeRng(cfg.seed);
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
  /** רק שחקנים שיש להם גיבור — מצטרף באמצע קרב הוא צופה עד הריצה הבאה (מגן מקריסת הטיק!) */
  const fighters = () => alive().filter((p) => heroes.has(p));
  const hostId = () => ctx.players().find((p) => p.isHost)?.id;
  const st = (pid: string) => (stats[pid] ??= { kills: 0, dmg: 0, saves: 0, deaths: 0 });
  const now = () => ctx.now();

  /* ---- מיקום אויב לפי נוסחה (זהה ללקוח!) ---- */
  const posOf = (e: Enemy, t: number): [number, number] => {
    if (e.state === "fight" || e.state === "wall") return [e.x0, e.y0];
    const dt = t - e.at;
    // clamp לקו החומה — אויב לעולם לא "בורח" מתחת למסך (זהה ללקוח)
    return [e.x0 + e.wob * Math.sin(dt / 700), Math.min(WALL_Y - 45, e.y0 + (e.speed * dt) / 1000)];
  };

  /* ---- הקצאת עמדות ---- */
  function assignSlots() {
    const ps = fighters();
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
      const delay = at - now() + 1200 + (duration * 0.72 * i) / count + rnd() * 900;
      const type = mix[Math.floor(rnd() * mix.length)];
      ctx.timer(delay, () => { if (token === t && phase === "wave") spawn(type, t); else spawnsLeft--; });
    }
    if (w % 5 === 0) ctx.timer(at - now() + duration * 0.35, () => { if (token === t && phase === "wave") spawn("boss", t); else spawnsLeft--; });
    // טיק — עמיד לשגיאות: חריגה בפריים אחד לעולם לא מקפיאה את המשחק
    ctx.timer(at - now(), function tick() {
      if (token !== t || phase !== "wave") return;
      try { simTick(t); } catch (err) { console.error("[wall] simTick error:", err); }
      ctx.timer(100, tick);
    });
    // סוף גל: כשנגמר הזמן וכל האויבים מתו; רשת ביטחון נגד תקועים
    ctx.timer(at - now() + duration, function checkEnd() {
      if (token !== t || phase !== "wave") return;
      if (enemies.size === 0 && spawnsLeft <= 0) return waveClear();
      // רשת ביטחון: 25 שניות אחרי סוף הזמן — מפנים שאריות תקועות ומסיימים את הגל
      if (now() > waveEndsAt + 25_000) {
        for (const e of [...enemies.values()]) {
          enemies.delete(e.id);
          ctx.broadcast({ a: "wl_hit", id: e.id, hp: 0, by: "" });
        }
        spawnsLeft = 0;
        return waveClear();
      }
      ctx.timer(500, checkEnd);
    });
  }

  function spawn(type: WallEnemyType, t: number) {
    spawnsLeft--;
    const base = ETYPES[type];
    const id = ++eSeq;
    const hp = Math.round(base.hp * hpScale(wave));
    const e: Enemy = {
      id, type, hp, maxHp: hp,
      x0: 60 + rnd() * (W - 120), y0: -60,
      speed: base.speed * (0.9 + rnd() * 0.2),
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
    // הקמת נפולים — לפי שעון, לא לפי טיימר תלוי-token
    for (const p of fighters()) {
      const h = heroes.get(p)!;
      if (h.down && tn >= h.upAt) reviveHero(p, h);
    }
    tickDots(tn);
    const infantry = fighters().filter((p) => { const h = heroes.get(p); return h && h.role === "infantry" && !h.down; });

    for (const e of [...enemies.values()]) {
      const [ex, ey] = posOf(e, tn);

      if (e.state === "walk") {
        // צלף: נעצר ונועל על גיבור
        if (e.type === "sniper" && ey >= 470) {
          const targets = fighters().filter((p) => !heroes.get(p)!.down);
          if (targets.length) {
            const target = targets[Math.floor(rnd() * targets.length)];
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
            if (h && !h.down) {
              if (h.mods.sentry > 0 && !h.sentryUsed) {
                h.sentryUsed = true; // 🎖️ המוצב ספג — הבזק במקום נזק
                ctx.broadcast({ a: "wl_boomfx", x: Math.round(h.x), y: Math.round(h.y), r: 50 });
              } else hurtHero(e.target!, 38);
            }
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
    for (const p of fighters()) {
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
          const canArmor = h.traits.pierce > 0; // 🗡️ חדירה = סוף-סוף אפשר לפגוע במשוריין
          const targets = [...enemies.values()]
            .filter((e) => (canArmor || e.type !== "armored") && e.state !== "burrow")
            .map((e) => ({ e, pos: posOf(e, tn) }))
            .filter(({ pos }) => Math.abs(pos[0] - h.aimX) < 62 * h.mods.range && pos[1] > 0 && pos[1] < WALL_Y)
            .sort((a, b) => b.pos[1] - a.pos[1]);
          if (targets.length) {
            const dmg = 4.6 * h.mods.dmg * tierMult(h.tier) * (1 + (h.mods.tracer ? h.tracerRamp ?? 0 : 0));
            for (let i = 0; i < 1 + h.traits.multi && i < targets.length; i++) damageEnemy(targets[i].e, dmg, p);
          }
        }
      } else {
        h.heat = Math.max(0, h.heat - 2.2);
        h.tracerRamp = 0;
      }
    }

    // שידור מיקומי גיבורים (כל 300ms)
    if (Math.floor(tn / 300) !== Math.floor((tn - 100) / 300)) {
      ctx.broadcast({ a: "wl_ppos", ps: fighters().map((p) => { const h = heroes.get(p)!; return [p, Math.round(h.x), Math.round(h.y)] as [string, number, number]; }) });
    }
    // חום אמיתי למקלענים (5Hz) — המד בלקוח כבר לא מנחש ולא משקר עם "קירור-על"
    if (Math.floor(tn / 200) !== Math.floor((tn - 100) / 200)) {
      for (const p of fighters()) {
        const h = heroes.get(p)!;
        if (h.role === "mg") ctx.sendTo(p, { a: "wl_heat", heat: Math.round(h.heat) });
      }
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
      // ההקמה נעשית בטיק לפי upAt (ולא בטיימר תלוי-token) — אחרת נפילה בסוף גל
      // הייתה משאירה את השחקן מת עד סוף הריצה. רשת נוספת: waveClear מקים את כולם.
    } else {
      ctx.broadcast({ a: "wl_hero", pid, hp: Math.round(h.hp), max: h.max });
    }
  }

  /** מקים גיבור שנפל (בטיק או בסוף גל) */
  function reviveHero(pid: string, h: Hero, hpFrac = 1) {
    h.down = false;
    h.hp = Math.max(1, Math.round(h.max * hpFrac));
    if (h.role === "infantry") { h.x = GATE_X; h.y = 1180; }
    ctx.broadcast({ a: "wl_hero", pid, hp: h.hp, max: h.max, down: false });
  }

  /* ================= צנרת הנזק + תכונות הנשק =================
   * כל התכונות חיות כאן, בצינור אחד, ולא בקוד נפרד לכל תפקיד — ככה הן עובדות
   * אוטומטית לארבעת התפקידים, וגם ל-DoT ולשרשרת. `kind` נשלח ללקוח כדי שידע
   * לצבוע את מספר הנזק ולירות את החלקיק הנכון. */
  type HitKind = "hit" | "burn" | "poison" | "chain" | "blast" | "frost" | "pierce" | "vamp";

  /** מכפיל הנזק של המגברים שתלויים במצב (שריון/גסיסה/מומנטום) */
  function ampMul(h: Hero | undefined, e: Enemy): number {
    if (!h) return 1;
    let mul = 1;
    if (h.mods.armor && (e.type === "armored" || e.type === "boss")) mul *= 1 + 0.35 * h.mods.armor;
    if (h.traits.pierce && (e.type === "armored" || e.type === "boss")) mul *= 1 + 0.22 * h.traits.pierce;
    if (h.mods.exec && e.hp / e.maxHp < 0.35) mul *= 1 + 0.45 * h.mods.exec;
    if (h.mods.momentum && now() < h.momoUntil) mul *= 1 + 0.04 * h.momoStacks;
    return mul;
  }

  /** האטה מכפור — משנה מהירות ומשדרת מסלול חדש (מסונן כדי לא להציף) */
  function applySlow(e: Enemy, stacks: number) {
    if (e.state !== "walk") return;
    const tn = now();
    if (e.slowUntil && tn < e.slowUntil - 400) return; // כבר מואט — לא משדרים שוב
    if (e.fullSpeed === undefined) e.fullSpeed = e.speed;
    const mul = Math.max(0.35, 1 - 0.18 * stacks);
    e.slowUntil = tn + 1600;
    const [ex, ey] = posOf(e, tn);
    setPath(e, ex, ey, "walk", e.fullSpeed * mul);
  }

  function damageEnemy(e: Enemy, dmg: number, by: string, crit = false, kind: HitKind = "hit", depth = 0) {
    if (!enemies.has(e.id)) return;
    const h = heroes.get(by);
    dmg *= ampMul(h, e);
    if (h && kind === "hit" && rnd() < h.mods.crit) { dmg *= 2; crit = true; }
    e.hp -= dmg;
    st(by).dmg += dmg;
    if (h?.mods.lifesteal && h.role === "infantry" && !h.down) h.hp = Math.min(h.max, h.hp + 3 * h.mods.lifesteal);

    // ---- תכונות שנדלקות על פגיעה ישירה ----
    if (h && kind === "hit" && depth < 2) {
      const t = h.traits;
      const evo = (id: TraitId) => (h.evos.includes(id) ? 2 : 1); // אבולוציה = כפול
      if (t.burn > 0) {
        e.burnUntil = now() + 3000;
        e.burnDps = 3.5 * t.burn * evo("burn") * tierMult(h.tier);
        e.burnBy = by;
      }
      if (t.poison > 0) {
        e.poisonStacks = Math.min(20, (e.poisonStacks ?? 0) + t.poison * evo("poison"));
        e.poisonUntil = now() + 5000;
        e.poisonBy = by;
      }
      if (t.frost > 0) applySlow(e, t.frost * evo("frost"));
      if (t.chain > 0 && enemies.has(e.id)) {
        const tn = now();
        const [ex, ey] = posOf(e, tn);
        const reach = 150 + 25 * t.chain;
        let best: Enemy | undefined; let bd = reach;
        for (const o of enemies.values()) {
          if (o.id === e.id || o.state === "burrow") continue;
          const [ox, oy] = posOf(o, tn);
          const d = Math.hypot(ox - ex, oy - ey);
          if (d < bd) { bd = d; best = o; }
        }
        if (best) {
          const [bx, by2] = posOf(best, tn);
          if (tn - h.lastChainFx > 150) { // אפקט מסונן — במקלען זה 10 פעמים בשנייה
            h.lastChainFx = tn;
            ctx.broadcast({ a: "wl_chain", x1: Math.round(ex), y1: Math.round(ey), x2: Math.round(bx), y2: Math.round(by2), by });
          }
          damageEnemy(best, dmg * (0.35 + 0.08 * t.chain) * evo("chain"), by, false, "chain", depth + 1);
        }
      }
    }

    // 🎯 כלל הקריאוּת: פגיעה ישירה מציגה את האפקט של *תכונה אחת*, בסבב מחזורי —
    // ולא ערבוב של כל התכונות יחד (שמתכנס לכתם לבן ולא אומר כלום).
    let showKind: HitKind = kind;
    if (h && kind === "hit") {
      const owned = TRAIT_IDS.filter((t) => h.traits[t] > 0);
      if (owned.length) showKind = owned[h.fxTurn++ % owned.length] as HitKind;
    }
    if (e.hp <= 0) {
      enemies.delete(e.id);
      ctx.broadcast({ a: "wl_hit", id: e.id, hp: 0, by, crit, k: showKind });
      st(by).kills++;
      if (h) {
        // XP מסקיילי עם הגל — בלי זה אויב בגל 15 שווה כמו בגל 1 והפרוגרסיה נעצרת
        giveXp(by, ETYPES[e.type].xp * (0.6 + 0.4 * hpScale(wave)));
        // ---- תכונות שנדלקות על הריגה ----
        const t = h.traits;
        const evo = (id: TraitId) => (h.evos.includes(id) ? 2 : 1);
        if (h.mods.momentum) {
          h.momoStacks = Math.min(12, (now() < h.momoUntil ? h.momoStacks : 0) + h.mods.momentum);
          h.momoUntil = now() + 4000;
        }
        if (t.vamp > 0 && !h.down) {
          h.hp = Math.min(h.max, h.hp + 2 * t.vamp * evo("vamp"));
          ctx.broadcast({ a: "wl_hero", pid: by, hp: Math.round(h.hp), max: h.max, down: false });
        }
        if (t.blast > 0 && depth < 2) {
          const tn = now();
          const [ex, ey] = posOf(e, tn);
          const r = (70 + 18 * t.blast) * evo("blast");
          if (tn - h.lastBlastFx > 130) {
            h.lastBlastFx = tn;
            ctx.broadcast({ a: "wl_boomfx", x: Math.round(ex), y: Math.round(ey), r: Math.round(r) });
          }
          for (const o of [...enemies.values()]) {
            const [ox, oy] = posOf(o, tn);
            if (Math.hypot(ox - ex, oy - ey) < r) {
              damageEnemy(o, (14 + 7 * t.blast) * tierMult(h.tier) * evo("blast"), by, false, "blast", depth + 1);
            }
          }
        }
      }
    } else {
      ctx.broadcast({ a: "wl_hit", id: e.id, hp: Math.round(e.hp), by, crit, k: showKind });
    }
  }

  /** DoT — רץ פעם בשנייה מתוך הטיק (ולא בטיימר לכל אויב) כדי לא להציף הודעות */
  function tickDots(tn: number) {
    for (const e of [...enemies.values()]) {
      // שחרור האטה שפגה — קודם, ובלי תלות בשעון ה-DoT
      if (e.slowUntil && tn > e.slowUntil && e.fullSpeed !== undefined && e.state === "walk") {
        const [ex, ey] = posOf(e, tn);
        e.slowUntil = undefined;
        setPath(e, ex, ey, "walk", e.fullSpeed);
      }
      if (e.lastDot && tn - e.lastDot < 1000) continue;
      const burning = e.burnUntil && tn < e.burnUntil;
      const poisoned = e.poisonUntil && tn < e.poisonUntil;
      if (!burning && !poisoned) continue;
      e.lastDot = tn;
      if (burning) damageEnemy(e, e.burnDps ?? 0, e.burnBy ?? "", false, "burn");
      if (poisoned && enemies.has(e.id)) damageEnemy(e, 2.2 * (e.poisonStacks ?? 0), e.poisonBy ?? "", false, "poison");
    }
  }

  /* ---- XP ודראפט ---- */
  /** הלקוח מכייל איתם את שערי הקלט שלו — בלעדיהם "קצב אש" ו"זריזות" לא מורגשים בכלל */
  function sendMods(pid: string) {
    const h = heroes.get(pid);
    if (!h) return;
    ctx.sendTo(pid, { a: "wl_mods", rate: h.mods.rate, speed: h.mods.speed });
  }
  /** עקומה מתונה (1.16 במקום 1.35): בריצת ערב מגיעים לרמה ~20 במקום ~9,
   *  כלומר פי 2 בחירות שדרוג — בלי זה אין מספיק ערימות בשביל שהתכונות יורגשו. */
  const xpNeed = (lvl: number) => Math.round(10 * Math.pow(1.16, lvl - 1));

  /** משדר לכל החדר איך הנשק של השחקן נראה — מכאן הלקוח מרכיב את המראה */
  function sendStyle(pid: string) {
    const h = heroes.get(pid);
    if (!h) return;
    ctx.broadcast({ a: "wl_style", pid, traits: { ...h.traits }, tier: h.tier, evos: [...h.evos] });
  }

  function giveXp(pid: string, amount: number) {
    const h = heroes.get(pid)!;
    h.xp += amount * h.mods.xpMul;
    let tiered = false;
    while (h.xp >= xpNeed(h.level)) {
      h.xp -= xpNeed(h.level);
      h.level++;
      // דרגת נשק כל 3 רמות — בלי תקרה
      const nt = tierOf(h.level);
      if (nt > h.tier) { h.tier = nt; tiered = true; ctx.broadcast({ a: "wl_tier", pid, tier: h.tier }); }
      queueDraft(pid);
    }
    if (tiered) { checkEvos(pid); sendStyle(pid); }
    const tn = now();
    if (tn - h.lastXpMsg > 900) {
      h.lastXpMsg = tn;
      ctx.sendTo(pid, { a: "wl_xp", xp: Math.round(h.xp), level: h.level, next: xpNeed(h.level) });
    }
  }

  /** אבולוציה: תכונה בערימה 5 + דרגת נשק 4 → נשק עם שם, והכרזה לכל החדר */
  function checkEvos(pid: string) {
    const h = heroes.get(pid);
    if (!h || h.tier < EVO_TIER) return;
    for (const t of TRAIT_IDS) {
      if (h.traits[t] >= EVO_STACKS && !h.evos.includes(t)) {
        h.evos.push(t);
        ctx.broadcast({ a: "wl_evo", pid, trait: t, name: EVO[t].name, emoji: EVO[t].emoji });
      }
    }
  }

  function queueDraft(pid: string) {
    if (hands.has(pid)) { pendingLevels.set(pid, (pendingLevels.get(pid) ?? 0) + 1); return; }
    const h = heroes.get(pid)!;
    const pool = [...cardsFor(h.role)];
    const cards: WallCard[] = [];
    while (cards.length < 3 && pool.length) {
      const c = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const tier = (h.picks[c.id] ?? 0) + 1;
      // תכונה שעל סף אבולוציה מסומנת — זה מה שגורם לרדוף אחרי בילד
      const nextIsEvo = c.kind === "trait" && tier >= EVO_STACKS && h.tier >= EVO_TIER && !h.evos.includes(c.id as TraitId);
      cards.push({
        id: c.id, emoji: nextIsEvo ? EVO[c.id as TraitId].emoji : c.emoji, tier,
        name: nextIsEvo ? EVO[c.id as TraitId].name : (tier > 1 ? `${c.name} ${["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][Math.min(tier, 10)]}` : c.name),
        desc: nextIsEvo ? "🌟 אבולוציה! הנשק שלך משתנה" : c.desc,
      });
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
    if ((TRAIT_IDS as string[]).includes(cardId)) {
      h.traits[cardId as TraitId]++;
      checkEvos(pid);
    } else {
      switch (cardId) {
        case "dmg": m.dmg *= 1.18; break;
        case "rate": m.rate *= 1.12; break;
        case "hp": h.max = Math.round(h.max * 1.25); h.hp = h.max; ctx.broadcast({ a: "wl_hero", pid, hp: h.hp, max: h.max, down: h.down }); break;
        case "speed": m.speed *= 1.1; break;
        case "range": m.range *= 1.12; break;
        case "crit": m.crit = Math.min(0.6, m.crit + 0.08); break;
        case "xp": m.xpMul *= 1.12; break;
        case "wall": wallHp = Math.min(wallMax, wallHp + wallMax * 0.12); ctx.broadcast({ a: "wl_wall", hp: Math.round(wallHp), max: wallMax }); break;
        case "armor": m.armor += 1; break;
        case "exec": m.exec += 1; break;
        case "momo": m.momentum += 1; break;
        case "sentry": m.sentry += 1; h.sentryUsed = false; break;
        case "radius": m.radius *= 1.25; break;
        case "heatc": m.heat *= 1.3; break;
        case "tracer": m.tracer += 1; break;
        case "shieldstr": m.shieldStr += 1; break;
        case "lifesteal": m.lifesteal += 1; break;
      }
    }
    sendMods(pid); // הלקוח חייב לדעת — אחרת שערי הקצב/מהירות שלו חוסמים את השדרוג
    sendStyle(pid); // ...וכל החדר צריך לדעת, כדי שיראו את הנשק שלך משתנה
    ctx.broadcast({ a: "wl_picked", pid, name: card.name, emoji: card.emoji });
    // עוד רמה ממתינה?
    const pending = pendingLevels.get(pid) ?? 0;
    if (pending > 0) { pendingLevels.set(pid, pending - 1); queueDraft(pid); }
  }

  /* ---- סוף גל / משחק ---- */
  function waveClear() {
    phase = "breath";
    token++;
    // נשימה = התאוששות: כל מי שנפל קם, וכולם מתאוששים 35%.
    // בלי זה החלוץ מדמם לאורך כל הריצה בלי שום מקור ריפוי.
    for (const p of fighters()) {
      const h = heroes.get(p)!;
      if (h.down) reviveHero(p, h, 0.6);
      else if (h.hp < h.max) {
        h.hp = Math.min(h.max, h.hp + h.max * 0.35);
        ctx.broadcast({ a: "wl_hero", pid: p, hp: Math.round(h.hp), max: h.max, down: false });
      }
      h.heat = 0; h.firing = false; h.jamUntil = 0;
      h.sentryUsed = false; // המוצב טעון מחדש בכל גל
    }
    // תיקון קטן בין גלים — קודם מרפאים, ואז משדרים את המספר האמיתי
    wallHp = Math.min(wallMax, wallHp + wallMax * 0.06);
    ctx.broadcast({ a: "wl_clear", wave, wallHp: Math.round(wallHp) });
    ctx.broadcast({ a: "wl_wall", hp: Math.round(wallHp), max: wallMax });
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
    // ריצה יומית נרשמת כאן ולא ב-finish(): בסולו אין מי שילחץ "סיימנו",
    // ושחקן שמת וסגר את הלשונית היה מאבד בדיוק את הריצה שבאנו לספור.
    if (cfg.seed) {
      const sc: Record<string, number> = {};
      for (const p of alive()) sc[p] = Math.round(Math.max(0, score(p)));
      ctx.reportDaily({ seed: cfg.seed, wave: bestWave, scores: sc });
    }
    ctx.timer(2600, () => {
      if (phase !== "over") return;
      ctx.broadcast({
        a: "wl_over", wave, bestWave, nearMiss, mvp: mvpId(),
        stats: Object.fromEntries(fighters().map((p) => [p, st(p)])),
      });
    });
  }

  const score = (p: string) => { const s = st(p); return s.kills * 3 + s.dmg / 50 + s.saves * 5 - s.deaths * 2; };
  function mvpId() { const ps = fighters(); return [...ps].sort((a, b) => score(b) - score(a))[0]; }

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
      // ריצה יומית — הניקוד מגיע מהשרת, ולכן אין מה לזייף בלקוח
      daily: cfg.seed ? { seed: cfg.seed, wave: bestWave } : undefined,
    });
  }

  function resetRun() {
    alive().forEach((p, i) => {
      // מי שהצטרף אחרי ההתחלה מקבל גיבור עכשיו — אף אחד לא נשאר בלי
      if (!heroes.has(p)) {
        heroes.set(p, {
          role: defaultRole(i), slot: [GATE_X, 1100], x: GATE_X, y: 1100,
          hp: 150, max: 150, down: false, upAt: 0, shield: false,
          mods: baseMods(), level: 1, xp: 0, tier: 1, picks: {},
          traits: baseTraits(), evos: [], momoUntil: 0, momoStacks: 0, sentryUsed: false,
          firing: false, aimX: GATE_X, heat: 0, jamUntil: 0,
          lastSwing: 0, lastShot: 0, cannonReadyAt: 0, lastXpMsg: 0, lastChainFx: 0, lastBlastFx: 0, fxTurn: 0,
        });
      }
    });
    for (const p of fighters()) {
      const h = heroes.get(p)!;
      const isInf = h.role === "infantry";
      h.hp = h.max = isInf ? 150 : 100;
      h.down = false; h.shield = false; h.firing = false; h.heat = 0; h.jamUntil = 0;
      h.mods = baseMods(); h.level = 1; h.xp = 0; h.tier = 1; h.picks = {};
      h.traits = baseTraits(); h.evos = []; h.momoUntil = 0; h.momoStacks = 0; h.sentryUsed = false;
      [h.x, h.y] = h.slot;
      sendMods(p);
      sendStyle(p);
      ctx.sendTo(p, { a: "wl_xp", xp: 0, level: 1, next: xpNeed(1) });
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
          traits: baseTraits(), evos: [], momoUntil: 0, momoStacks: 0, sentryUsed: false,
          firing: false, aimX: 500, heat: 0, jamUntil: 0,
          lastSwing: 0, lastShot: 0, cannonReadyAt: 0, lastXpMsg: 0, lastChainFx: 0, lastBlastFx: 0, fxTurn: 0,
        });
      });
      assignSlots();
      ctx.broadcast({ a: "wl_setup", roles: rolesMsg(), slots: slotsMsg() });
    },

    onRejoin(pid: string) {
      if (phase === "done") return;
      ctx.sendTo(pid, stateMsg());
      // משחזרים גם את המצב האישי — אחרת החוזר רואה HUD של רמה 1 עם חיים מלאים
      const h = heroes.get(pid);
      if (h) {
        ctx.sendTo(pid, { a: "wl_hero", pid, hp: Math.round(h.hp), max: h.max, down: h.down, upAt: h.upAt });
        ctx.sendTo(pid, { a: "wl_xp", xp: Math.round(h.xp), level: h.level, next: xpNeed(h.level) });
        sendMods(pid);
      }
      for (const [p2, h2] of heroes.entries()) {
        ctx.sendTo(pid, { a: "wl_style", pid: p2, traits: { ...h2.traits }, tier: h2.tier, evos: [...h2.evos] });
      }
    },

    onMessage(pid: string, d: GameClientMsg) {
      const m = d as WallClientMsg;
      let h = heroes.get(pid);
      if (!h && phase === "setup") {
        // מצטרף בזמן מסך ההיערכות — מקבל גיבור ויכול לבחור תפקיד
        h = {
          role: defaultRole(heroes.size), slot: [GATE_X, 1100], x: GATE_X, y: 1100,
          hp: 150, max: 150, down: false, upAt: 0, shield: false,
          mods: baseMods(), level: 1, xp: 0, tier: 1, picks: {},
          traits: baseTraits(), evos: [], momoUntil: 0, momoStacks: 0, sentryUsed: false,
          firing: false, aimX: GATE_X, heat: 0, jamUntil: 0,
          lastSwing: 0, lastShot: 0, cannonReadyAt: 0, lastXpMsg: 0, lastChainFx: 0, lastBlastFx: 0, fxTurn: 0,
        };
        heroes.set(pid, h);
      }
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
          h.y = Math.max(90, Math.min(WALL_Y - 15, m.y)); // כל שדה הקרב פתוח לחלוץ
          return;
        }
        case "wl_swing": {
          if (phase !== "wave" || h.role !== "infantry" || h.down || h.shield) return;
          const tn = now();
          if (tn - h.lastSwing < 480 / h.mods.rate) return;
          h.lastSwing = tn;
          ctx.broadcast({ a: "wl_slash", pid, x: Math.round(h.x), y: Math.round(h.y), dir: m.dir }); // שכולם יראו את ההנפה
          const reach = 130 * h.mods.range * (1 + 0.15 * (h.tier - 1));
          const dmg = 34 * h.mods.dmg * tierMult(h.tier);
          const swing = (mul: number) => {
            const t2 = now();
            for (const e of [...enemies.values()]) {
              const [ex, ey] = posOf(e, t2);
              const dx = ex - h.x, dy = ey - h.y;
              if (Math.hypot(dx, dy) > reach) continue;
              const ang = Math.atan2(dy, dx);
              let dd = Math.abs(ang - m.dir);
              if (dd > Math.PI) dd = 2 * Math.PI - dd;
              if (dd < 1.15) damageEnemy(e, dmg * mul, pid);
            }
          };
          swing(1);
          // ✨ כפילות לחלוץ = הנפות הד — כל ערימה מוסיפה סיבוב נוסף ב-70% נזק
          const t0 = token;
          for (let k = 1; k <= h.traits.multi; k++) {
            ctx.timer(140 * k, () => {
              if (token !== t0 || phase !== "wave" || h.down) return;
              ctx.broadcast({ a: "wl_slash", pid, x: Math.round(h.x), y: Math.round(h.y), dir: m.dir });
              swing(0.7);
            });
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
          const shots = 1 + h.traits.multi;
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
              let hitsLeft = 1 + h.traits.pierce;
              const near = [...enemies.values()]
                .map((e) => ({ e, pos: posOf(e, impactT) }))
                .filter(({ e, pos }) => e.state !== "burrow" && Math.hypot(pos[0] - tx, pos[1] - ty) < 75 * h.mods.range)
                .sort((a, b) => Math.hypot(a.pos[0] - tx, a.pos[1] - ty) - Math.hypot(b.pos[0] - tx, b.pos[1] - ty));
              for (const { e } of near) {
                if (hitsLeft-- <= 0) break;
                damageEnemy(e, 26 * h.mods.dmg * tierMult(h.tier) * (0.5 + 0.5 * m.power), pid);
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
          const shots = 1 + h.traits.multi;
          for (let s = 0; s < shots; s++) {
            const tx = Math.max(0, Math.min(W, m.tx + (s ? (s % 2 ? 90 : -90) : 0)));
            const ty = Math.max(60, Math.min(WALL_Y - 30, m.ty));
            const T = 1100;
            ctx.cue(300, { a: "wl_shell", fx: Math.round(h.slot[0]), fy: Math.round(h.slot[1]), tx: Math.round(tx), ty: Math.round(ty), T, by: pid });
            const t = token;
            ctx.timer(300 + T, () => {
              if (token !== t || phase !== "wave") return;
              const impactT = now();
              const r = 145 * h.mods.radius * h.mods.range * (1 + 0.12 * (h.tier - 1));
              ctx.broadcast({ a: "wl_boomfx", x: Math.round(tx), y: Math.round(ty), r: Math.round(r) });
              for (const e of [...enemies.values()]) {
                const pos = posOf(e, impactT);
                if (e.state !== "burrow" && Math.hypot(pos[0] - tx, pos[1] - ty) < r) {
                  damageEnemy(e, 95 * h.mods.dmg * tierMult(h.tier), pid);
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
