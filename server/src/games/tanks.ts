/**
 * התותחים 💥 — שרת. "כולם יורים באותה שנייה."
 *
 * ציר הזמן: בחירת צבע → [קרב: הר חדש → (🎯 כיוון → 💥 סלבו (cue) → 🔧 מוסך) × עד 8 → סיום קרב] × קרבות → סיום.
 * השרת סמכותי על הכול: אוסף כיוונים, מריץ את הסלבו (shared/tanks.ts), משדר את הקלטים כ-cue
 * כדי שכל הטלפונים יריצו את אותה סימולציה יחד, ואחרי האנימציה שולח את המצב הסמכותי (tk_result).
 * זהב: נזק ×1 · הריגה 80 · שרידות 15 · ראש-בפרס 40 · ניצחון קרב 150. ניקוד: הריגה 3 · שרידות 1 · ניצחון 6 · נזק/40.
 */
import type { GameCtx, GameInstance } from "../engine";
import type { GameClientMsg, GameServerMsg } from "../../../shared/protocol";
import {
  TK, TK_CARDS, TK_RARITY_W, tkCard, tkConfig, tkMods, tkPrice, tkNewWorld, tkGenTerrain, tkPlaceTanks, tkNewTank, tkApplyMods, tkGround, tkCrater, tkMound, tkQuake, tkNewSalvo, tkRng, tkBotAim, TK_BASIC,
} from "../../../shared/tanks";
import type { TkConfig, TkMods, TkWorld, TkTank, TkTankWire, TkCardWire, TkWorldWire, TkCard, TkSalvoIn, TkShot, TkRow, TanksServerMsg } from "../../../shared/tanks";

type Phase = "pick" | "intro" | "aim" | "salvo" | "garage" | "battleover" | "over";
type Curse = "" | "wind" | "weak" | "blind" | "confetti";

interface P {
  pid: string; c: number;
  gold: number; earned: number; goldTotal: number;
  ammo: Record<string, number>; owned: Record<string, number>; mods: TkMods;
  score: number; kills: number; dmg: number; selfDmg: number; survived: number; wins: number;
  aim: { vx: number; vy: number; w: string } | null; lastAim: { vx: number; vy: number; w: string } | null; ready: boolean;
  fuelLeft: number; offer: string[]; sky: string[]; skyPick: { id: string; target?: string; x?: number } | null;
  spy: Set<string>; curse: Curse; ally: { with: string; until: number } | null; taunt: boolean;
}

export function createTanks(ctx: GameCtx): GameInstance {
  // TK_FAST=1 — פלייטסט מהיר לבדיקות ולצילומים; לא משפיע על פרודקשן
  const fast = process.env.TK_FAST ? { aimMs: 5000, garageMs: 4000, introMs: 800, pickMs: 4000, endMs: 800 } : {};
  const cfg: TkConfig = tkConfig({ ...((ctx.config as object) ?? {}), ...fast });
  const ps = new Map<string, P>();
  const tanks = new Map<string, TkTank>();
  let world: TkWorld = tkNewWorld("x");
  let phase: Phase = "pick";
  let seed = "", bseed = "";
  let b = 0, k = 0;
  let wind = 0;
  let until = 0;
  let salvoAt = 0;
  let token = 0;
  let bountyPid = "";
  const eff = { gravK: 1, gravUntil: 0, windK: 1, windUntil: 0, night: 0, meteorsNext: 0, doom: 0, wallsUntil: 0, oil: 0 };
  const pend = new Set<NodeJS.Timeout>();
  const now = () => ctx.now();
  const bc = (d: TanksServerMsg) => ctx.broadcast(d as unknown as GameServerMsg);
  const to = (pid: string, d: TanksServerMsg) => ctx.sendTo(pid, d as unknown as GameServerMsg);
  const cue = (ms: number, d: TanksServerMsg) => ctx.cue(ms, d as unknown as GameServerMsg);
  function later(ms: number, fn: () => void) { const t = ctx.timer(Math.max(0, ms), () => { pend.delete(t); fn(); }); pend.add(t); return t; }
  function at(target: number, fn: () => void) { const tk = token; later(target - now(), () => { if (token === tk) fn(); }); }
  const nameOf = (pid: string) => ctx.players().find((p) => p.id === pid)?.name ?? "?";
  const connected = (pid: string) => ctx.players().find((p) => p.id === pid)?.connected ?? false;
  const alive = () => [...tanks.values()].filter((t) => t.alive);
  const ranked = () => [...ps.values()].sort((a, c) => c.score - a.score || c.kills - a.kills || c.dmg - a.dmg);
  const feed = (tx: string) => bc({ a: "tk_feed", tx });
  const rng = tkRng("server:" + Math.random());

  const wireTank = (t: TkTank): TkTankWire => ({ pid: t.pid, c: t.c, x: Math.round(t.x), y: Math.round(t.y), hp: Math.round(t.hp), hpMax: t.hpMax, sh: Math.round(t.shield), alive: t.alive, bounty: t.bounty >= k || t.pid === bountyPid, frozen: t.frozen });
  const wireTanks = () => [...tanks.values()].map(wireTank);
  const wireWorld = (): TkWorldWire => ({ water: world.water, gravK: world.gravK, windK: world.windK, walls: world.walls, night: world.night, fires: world.fires, theme: world.theme });
  const wireCard = (c: TkCard, m?: TkMods): TkCardWire => ({ id: c.id, ic: c.ic, t: c.t, d: c.d, r: c.r, cat: c.cat, kind: c.kind, price: m ? tkPrice(c, m) : c.price, tg: c.tg, n: c.n });
  const you = (p: P) => to(p.pid, { a: "tk_you", gold: Math.round(p.gold), ammo: p.ammo, owned: p.owned, fuel: p.fuelLeft, blind: p.curse === "blind" || world.night, spy: [...p.spy], curse: p.curse });
  const timing = () => ({ aimMs: cfg.aimMs, garageMs: cfg.garageMs });

  function newP(pid: string, c: number): P {
    return {
      pid, c, gold: TK.GOLD_START, earned: 0, goldTotal: 0, ammo: {}, owned: {}, mods: tkMods({}),
      score: 0, kills: 0, dmg: 0, selfDmg: 0, survived: 0, wins: 0,
      aim: null, lastAim: null, ready: false, fuelLeft: 0, offer: [], sky: [], skyPick: null, spy: new Set(), curse: "", ally: null, taunt: false,
    };
  }

  /* ---------- בחירת צבע ---------- */
  const taken = (): Record<string, number> => Object.fromEntries([...ps.values()].filter((p) => p.c >= 0).map((p) => [p.pid, p.c]));
  function pickPhase() {
    phase = "pick";
    bc({ a: "tk_pickphase", taken: taken(), until: now() + cfg.pickMs });
    later(cfg.pickMs, begin);
  }
  function autoAssign() {
    const used = new Set([...ps.values()].filter((p) => p.c >= 0).map((p) => p.c));
    for (const p of ps.values()) if (p.c < 0) { let c = 0; while (used.has(c) && c < 7) c++; used.add(c); p.c = c; }
  }
  function begin() {
    if (phase !== "pick") return;
    autoAssign();
    seed = cfg.seed ?? Math.random().toString(36).slice(2, 10);
    bc({ a: "tk_go", chars: taken(), battles: cfg.battles, cfg: timing() });
    later(600, () => startBattle(0));
  }

  /* ---------- קרב ---------- */
  function startBattle(bb: number) {
    b = bb; k = 0; phase = "intro";
    bseed = `${seed}:${b}`;
    const theme = TK.THEMES[(b + Math.floor(tkRng(bseed)() * 4)) % 4];
    world = tkNewWorld(bseed, theme);
    const list = [...ps.values()];
    const xs = tkPlaceTanks(bseed, world.h, list.length);
    tanks.clear();
    list.forEach((p, i) => { p.mods = tkMods(p.owned); tanks.set(p.pid, tkNewTank(p.pid, p.c, xs[i], world.h, p.mods)); p.ally = null; p.curse = ""; p.taunt = false; p.spy.clear(); });
    Object.assign(eff, { gravK: 1, gravUntil: 0, windK: 1, windUntil: 0, night: 0, meteorsNext: 0, doom: 0, wallsUntil: 0, oil: 0 });
    wind = rollWind();
    bountyPid = "";
    const startAt = now() + cfg.introMs;
    bc({ a: "tk_battle", b, seed: bseed, h: world.h, world: wireWorld(), tanks: wireTanks(), wind, startAt });
    at(startAt, () => startAim(1));
  }
  const rollWind = () => Math.round((rng() * 2 - 1) * TK.WIND_MAX * (0.4 + rng() * 0.6));

  /* ---------- 🎯 כיוון ---------- */
  function startAim(kk: number) {
    k = kk; phase = "aim";
    // אפקטי עולם לסלבו הזה
    world.gravK = (world.theme === "space" ? 0.55 : 1) * (k <= eff.gravUntil ? eff.gravK : 1);
    world.windK = k <= eff.windUntil ? eff.windK : 1;
    world.walls = k <= eff.wallsUntil;
    world.night = eff.night === k;
    if (eff.oil === k) { for (const t of alive()) { const sl = tkGround(world.h, t.x + 6) - tkGround(world.h, t.x - 6); const dir = sl > 0 ? -1 : 1; t.x = Math.max(12, Math.min(TK.W - 12, t.x + dir * 40)); t.y = tkGround(world.h, t.x); bc({ a: "tk_tank", tank: wireTank(t) }); } }
    // ראש בפרס = המוביל (רק כשיש ניקוד)
    const r = ranked();
    bountyPid = r.length > 1 && r[0].score > 0 && r[0].score > r[1].score && tanks.get(r[0].pid)?.alive ? r[0].pid : "";
    const sudden = k >= TK.SUDDEN_FROM;
    const meteors = (sudden ? 2 : 0) + (eff.meteorsNext > 0 ? eff.meteorsNext : 0);
    until = now() + cfg.aimMs;
    for (const p of ps.values()) { p.aim = null; p.ready = false; p.fuelLeft = p.mods.fuel; p.skyPick = null; p.earned = 0; }
    bc({ a: "tk_aim", k, until, wind, bounty: bountyPid, sudden, meteors, night: world.night, doom: eff.doom === k });
    for (const p of ps.values()) {
      if (!connected(p.pid)) continue;
      const t = tanks.get(p.pid);
      if (t?.alive) you(p);
      else { p.sky = pickSky(); to(p.pid, { a: "tk_sky", k, cards: p.sky.map((id) => wireCard(tkCard(id)!)) }); }
    }
    at(until, runSalvo);
  }
  function pickSky(): string[] {
    const pool = TK_CARDS.filter((c) => c.kind === "sky").map((c) => c.id);
    const out: string[] = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out;
  }
  function maybeEarly() {
    if (phase !== "aim") return;
    const need = [...ps.values()].filter((p) => connected(p.pid));
    if (need.length && need.every((p) => p.ready)) { token++; until = now() + 1200; bc({ a: "tk_aim", k, until, wind, bounty: bountyPid, sudden: k >= TK.SUDDEN_FROM, meteors: 0, night: world.night, doom: eff.doom === k }); at(until, runSalvo); }
  }

  /* ---------- 💥 סלבו ---------- */
  function runSalvo() {
    if (phase !== "aim") return;
    phase = "salvo"; token++;
    const pre: string[] = [];
    const meteors: number[] = [], dirts: number[] = [];
    if (k >= TK.SUDDEN_FROM) for (let i = 0; i < 2; i++) meteors.push(Math.round(30 + rng() * (TK.W - 60)));
    if (eff.meteorsNext > 0) { for (let i = 0; i < eff.meteorsNext; i++) meteors.push(Math.round(30 + rng() * (TK.W - 60))); eff.meteorsNext = 0; }
    // קלפי שמיים (מתים) — שינויי מצב לפני הסלבו
    for (const p of ps.values()) {
      const sp = p.skyPick; if (!sp) continue;
      const tg = sp.target ? tanks.get(sp.target) : undefined; const tp = sp.target ? ps.get(sp.target) : undefined;
      const nm = nameOf(p.pid), tn = sp.target ? nameOf(sp.target) : "";
      switch (sp.id) {
        case "skymeteor": meteors.push(Math.max(20, Math.min(TK.W - 20, Math.round(sp.x ?? TK.W / 2)))); pre.push(`☄️ ${nm} הזמין מטאור משמיים`); break;
        case "skydirt": dirts.push(Math.max(20, Math.min(TK.W - 20, Math.round(sp.x ?? TK.W / 2)))); pre.push(`🌫️ ${nm} הפיל ענן אדמה`); break;
        case "skybless": if (tg?.alive) { tg.shield += 40; pre.push(`😇 ${nm} בירך את ${tn} (+40 מגן)`); } break;
        case "skyheal": if (tg?.alive) { tg.hp = Math.min(tg.hpMax, tg.hp + 30); pre.push(`💚 ${nm} ריפא את ${tn}`); } break;
        case "skywind": wind = (rng() < 0.5 ? -1 : 1) * Math.round(6 + rng() * 4); pre.push(`🌬️ ${nm} שינה את הרוח!`); break;
        case "skycurse": if (tp) { tp.curse = "wind"; pre.push(`😈 ${nm} קילל את ${tn}`); } break;
        case "skyweak": if (tp) { tp.curse = "weak"; pre.push(`🐌 ${nm} הטביע את ${tn} בבוץ`); } break;
        case "skygift": { const last = ranked().filter((q) => q.pid !== p.pid).at(-1); if (last) { last.gold += 60; last.earned += 60; pre.push(`🎁 ${nm} נתן 60 זהב ל${nameOf(last.pid)}`); } break; }
      }
      p.skyPick = null;
    }
    const shots: TkShot[] = [];
    for (const p of ps.values()) {
      const t = tanks.get(p.pid); if (!t?.alive) continue;
      if (t.frozen) { t.frozen = false; pre.push(`🧊 ${nameOf(p.pid)} קפוא — מדלג על הירייה`); continue; }
      let a = p.aim ?? p.lastAim;
      if (!a && process.env.TK_BOTS) { const tg = alive().filter((q) => q.pid !== p.pid)[0]; if (tg) a = { ...tkBotAim(world, t, tg, wind, p.mods.power, rng), w: TK_BASIC }; }
      if (!a) continue;
      p.lastAim = a;
      let w = a.w;
      if (w !== TK_BASIC) { if ((p.ammo[w] ?? 0) > 0) { p.ammo[w]--; if (p.ammo[w] <= 0) delete p.ammo[w]; } else w = TK_BASIC; }
      const sh: TkShot = { pid: p.pid, vx: a.vx, vy: a.vy, w, dbl: p.mods.dbl || undefined, sk: p.mods.stabilizer || undefined };
      if (p.curse === "wind") { sh.wind = Math.round((rng() * 2 - 1) * TK.WIND_MAX); pre.push(`🌪️ הקללה תפסה את ${nameOf(p.pid)}`); }
      if (p.curse === "weak") { sh.vx *= 0.5; sh.vy *= 0.5; pre.push(`🐌 ${nameOf(p.pid)} ירה בחצי כוח`); }
      if (p.curse === "confetti") { sh.w = "confetti"; pre.push(`🤡 הירייה של ${nameOf(p.pid)} הפכה לקונפטי`); }
      p.curse = "";
      shots.push(sh);
    }
    const noDmg: [string, string][] = [];
    for (const p of ps.values()) if (p.ally && p.ally.until >= k) noDmg.push([p.pid, p.ally.with]);
    const revenge: Record<string, string> = {};
    for (const p of ps.values()) { const t = tanks.get(p.pid); if (p.mods.revenge && t?.lastHitBy) revenge[p.pid] = t.lastHitBy; }
    const input: TkSalvoIn = { seed: bseed, k, wind, shots, meteors, dirts, noDmg, betray: [...ps.values()].filter((p) => p.mods.betray).map((p) => p.pid), revenge, doom: eff.doom === k };
    const snapshot = wireTanks();
    const sim = tkNewSalvo(world, tanks, input);
    let guard = 0; while (!sim.step() && guard++ < 5000) { /* */ }
    const ticks = sim.tick;
    // חשבונאות
    const hitsByPid = new Map<string, Set<string>>();
    for (const e of sim.events) {
      if (e.t === "hit" && e.dmg > 0) {
        const victim = ps.get(e.pid), by = e.by ? ps.get(e.by) : undefined;
        if (by && e.by !== e.pid) {
          const g = Math.round(e.dmg * by.mods.gold);
          by.gold += g; by.earned += g; by.dmg += e.dmg;
          const tv = tanks.get(e.pid);
          const isBounty = e.pid === bountyPid || (tv && tv.bounty >= k);
          if (isBounty && !hitsByPid.get(e.by)?.has(e.pid)) { const bg = TK.GOLD_BOUNTY * (by.mods.hunter ? 2 : 1); by.gold += bg; by.earned += bg; if (!hitsByPid.has(e.by)) hitsByPid.set(e.by, new Set()); hitsByPid.get(e.by)!.add(e.pid); }
        } else if (victim && e.by === e.pid) victim.selfDmg += e.dmg;
      }
      if (e.t === "die") {
        const by = e.by ? ps.get(e.by) : undefined;
        if (by && e.by !== e.pid) { const g = TK.GOLD_KILL + by.mods.killBonus; by.gold += g; by.earned += g; by.kills++; by.score += 3; }
      }
    }
    salvoAt = now() + 700;
    cue(700, { a: "tk_salvo", k, at: salvoAt, input, ticks, tanks: snapshot, pre });
    at(salvoAt + ticks * TK.TICK_MS + 1300, afterSalvo);
  }
  function afterSalvo() {
    if (phase !== "salvo") return;
    const lines: string[] = [];
    for (const p of ps.values()) {
      const t = tanks.get(p.pid); if (!t) continue;
      if (t.alive) {
        p.survived++; p.score += 1;
        const s = Math.round(TK.GOLD_SURVIVE * p.mods.surviveMul); p.gold += s; p.earned += s;
        if (p.taunt) { p.gold += 100; p.earned += 100; lines.push(`😜 ${nameOf(p.pid)} התגרה ושרד — +100`); p.taunt = false; }
        if (p.ally && p.ally.until >= k) { p.gold += 25; p.earned += 25; }
        if (p.mods.interest > 0) { const i = Math.round(p.gold * p.mods.interest); p.gold += i; p.earned += i; }
        if (p.mods.repair > 0 && t.hp < t.hpMax) t.hp = Math.min(t.hpMax, t.hp + p.mods.repair);
        if (p.mods.shield > 0 && t.emp !== k) t.shield = Math.max(t.shield, p.mods.shield);
      } else p.taunt = false;
      p.goldTotal += p.earned;
    }
    world.fires = world.fires.filter((f) => f.until >= k + 1);
    const gold = Object.fromEntries([...ps.values()].map((p) => [p.pid, Math.round(p.gold)]));
    const earned = Object.fromEntries([...ps.values()].map((p) => [p.pid, Math.round(p.earned)]));
    bc({ a: "tk_result", k, h: world.h, world: wireWorld(), tanks: wireTanks(), gold, earned, feed: lines });
    const live = alive();
    if (live.length <= 1 || k >= cfg.maxSalvos) later(900, battleOver);
    else later(900, garage);
  }

  /* ---------- 🔧 המוסך ---------- */
  function weightOf(c: TkCard, p: P): number {
    if (c.kind === "sky") return 0;
    if (c.req && !c.req.every((r) => (p.owned[r] ?? 0) > 0 || (p.ammo[r] ?? 0) > 0)) return 0;
    if (c.kind === "passive" && (p.owned[c.id] ?? 0) >= (c.n ?? 1)) return 0;
    let w = TK_RARITY_W[c.r];
    if (c.r === "u") w *= 1 + p.mods.luck * 0.5;
    if (c.r === "r") w *= 1 + p.mods.luck;
    if (c.r === "e") w *= 2.5;                       // האבולוציה מופיעה — זה הפרס על הבסיס
    if (c.r === "r" && k < 2 && b === 0) w *= 0.3;
    if (c.cat === "S" && ps.size < 3) w *= 0.3;
    if (c.id === "betray" && !(p.ally && p.ally.until >= k + 1)) return 0;
    return w;
  }
  function offerFor(p: P): string[] {
    const n = p.mods.offerN;
    const buckets: string[][] = [["W"], ["W"], ["D"], ["T", "E"], ["S", "X"], [], [], []].slice(0, n);
    const out: string[] = [];
    for (const cats of buckets) {
      let list = TK_CARDS.filter((c) => !out.includes(c.id) && (cats.length === 0 || cats.includes(c.cat)) && weightOf(c, p) > 0);
      if (!list.length) list = TK_CARDS.filter((c) => !out.includes(c.id) && weightOf(c, p) > 0);
      if (!list.length) break;
      let tot = 0; for (const c of list) tot += weightOf(c, p);
      let x = rng() * tot; let chosen = list[list.length - 1];
      for (const c of list) { x -= weightOf(c, p); if (x <= 0) { chosen = c; break; } }
      out.push(chosen.id);
    }
    return out;
  }
  function garage() {
    phase = "garage"; token++;
    until = now() + cfg.garageMs;
    for (const p of ps.values()) {
      p.ready = false;
      if (!connected(p.pid)) continue;
      p.offer = offerFor(p);
      to(p.pid, { a: "tk_garage", k, until, gold: Math.round(p.gold), cards: p.offer.map((id) => wireCard(tkCard(id)!, p.mods)), sudden: k + 1 >= TK.SUDDEN_FROM });
    }
    at(until, () => startAim(k + 1));
  }
  function maybeEarlyGarage() {
    if (phase !== "garage") return;
    const need = [...ps.values()].filter((p) => connected(p.pid));
    if (need.length && need.every((p) => p.ready)) { token++; later(600, () => startAim(k + 1)); }
  }
  function buy(p: P, id: string, target?: string, x?: number) {
    if (phase !== "garage") return;
    const c = tkCard(id); if (!c || !p.offer.includes(id)) return;
    const price = tkPrice(c, p.mods);
    if (p.gold < price) return;
    if (c.tg === "player" && (!target || !ps.has(target) || target === p.pid)) return;
    p.gold -= price;
    p.offer = p.offer.filter((o) => o !== id);
    const t = tanks.get(p.pid);
    const nm = nameOf(p.pid), tn = target ? nameOf(target) : "";
    let tx = `${nm} קנה ${c.ic} ${c.t}`;
    if (c.kind === "ammo") p.ammo[id] = (p.ammo[id] ?? 0) + (c.n ?? 1);
    else if (c.kind === "passive") { p.owned[id] = (p.owned[id] ?? 0) + 1; p.mods = tkMods(p.owned); if (t) tkApplyMods(t, p.mods); }
    else if (c.kind === "instant") tx = instant(p, c, t, target, x) ?? tx;
    bc({ a: "tk_bought", pid: p.pid, card: wireCard(c, p.mods), target, tx: c.cat === "S" && target ? `${tx} ← ${tn}` : tx });
    you(p);
  }
  /** קלפים מיידיים — מחזיר טקסט לפיד (או undefined לברירת המחדל) */
  function instant(p: P, c: TkCard, t: TkTank | undefined, target?: string, x?: number): string | undefined {
    const nm = nameOf(p.pid), tn = target ? nameOf(target) : "";
    const tg = target ? tanks.get(target) : undefined, tp = target ? ps.get(target) : undefined;
    const fx = c.fx ?? "";
    const terrain = () => bc({ a: "tk_terrain", h: world.h, world: wireWorld() });
    const settle = (tk: TkTank) => { tk.y = tkGround(world.h, tk.x); bc({ a: "tk_tank", tank: wireTank(tk) }); };
    switch (fx) {
      case "heal40": if (t?.alive) { t.hp = Math.min(t.hpMax, t.hp + 40); settle(t); } return;
      case "healfull": if (t?.alive) { t.hp = t.hpMax; settle(t); } return;
      case "bunker": if (t?.alive) { tkMound(world.h, t.x - 40, t.y + 30, 24); tkMound(world.h, t.x + 40, t.y + 30, 24); terrain(); settle(t); } return;
      case "digin": if (t?.alive) { tkCrater(world.h, t.x, t.y - 4, 22); terrain(); settle(t); } return;
      case "tele": if (t?.alive) { t.x = freeX(); settle(t); } return `✨ ${nm} עשה טלפורט`;
      case "jump": if (t?.alive) { const d = (rng() < 0.5 ? -1 : 1) * (60 + rng() * 60); t.x = Math.max(12, Math.min(TK.W - 12, t.x + d)); settle(t); } return;
      case "ammobox": for (const id of Object.keys(p.ammo)) p.ammo[id]++; return;
      case "gold80": p.gold += 80; return;
      case "bounty": if (tg) { tg.bounty = k + 2; bc({ a: "tk_tank", tank: wireTank(tg) }); } return `🎯 ${nm} שם ראש בפרס על ${tn}!`;
      case "steal": if (tp) { const g = Math.min(40, Math.round(tp.gold)); tp.gold -= g; p.gold += g; you(tp); } return `🦝 ${nm} גנב 40 זהב מ${tn}`;
      case "robin": { const lead = ranked().find((q) => q.pid !== p.pid); if (lead) { const g = Math.min(60, Math.round(lead.gold)); lead.gold -= g; p.gold += g; you(lead); return `🏹 ${nm} שדד 60 זהב מהמוביל ${nameOf(lead.pid)}`; } return; }
      case "curse:wind": case "curse:weak": case "curse:blind": case "curse:confetti": if (tp) { tp.curse = fx.slice(6) as Curse; you(tp); } return `${c.ic} ${nm} הטיל ${c.t} על ${tn}`;
      case "swap": if (t?.alive && tg?.alive) { const x0 = t.x; t.x = tg.x; tg.x = x0; settle(t); settle(tg); } return `🔀 ${nm} התחלף במקום עם ${tn}`;
      case "ally": if (tp) { p.ally = { with: target!, until: k + 2 }; tp.ally = { with: p.pid, until: k + 2 }; } return `🤝 ${nm} ו-${tn} כרתו ברית ל-2 סיבובים`;
      case "spy": if (target) p.spy.add(target); return `🕵️ ${nm} מרגל אחרי מישהו…`;
      case "taunt": p.taunt = true; return `😜 ${nm} מתגרה בכולם: "תנסו לפגוע בי!"`;
      case "sabotage": if (tg && tp) { tg.shield = 0; const ids = Object.keys(tp.ammo); if (ids.length) { const id = ids[Math.floor(rng() * ids.length)]; delete tp.ammo[id]; } bc({ a: "tk_tank", tank: wireTank(tg) }); you(tp); } return `🔧 ${nm} חיבל בטנק של ${tn}`;
      case "gift": if (tp) { tp.gold += 60; you(tp); } return `🎁 ${nm} נתן 60 זהב ל${tn}`;
      case "world:quake": { tkQuake(world.h, rng); terrain(); for (const tk of alive()) { const gy = tkGround(world.h, tk.x); const drop = tk.y - gy; if (drop > TK.FALL_FREE && !tk.chute) tk.hp = Math.max(1, tk.hp - Math.round((drop - TK.FALL_FREE) / TK.FALL_DIV)); settle(tk); } return `🌍 ${nm} הרעיד את כל ההר!`; }
      case "world:flood": world.water = Math.min(420, Math.max(world.water, 60) + 70); terrain(); return `🌊 ${nm} הציף את העולם — המים עולים!`;
      case "world:lowgrav": eff.gravK = 0.5; eff.gravUntil = k + 2; return `🌙 ${nm} הוריד את הכבידה ל-2 סיבובים`;
      case "world:highgrav": eff.gravK = 1.6; eff.gravUntil = k + 2; return `🪐 ${nm} הכביד את הכבידה ל-2 סיבובים`;
      case "world:storm": eff.windK = 2.5; eff.windUntil = k + 2; return `🌀 ${nm} הזמין סופה!`;
      case "world:calm": eff.windK = 0; eff.windUntil = k + 2; return `🍃 ${nm} השתיק את הרוח`;
      case "world:night": eff.night = k + 1; return `🌚 ${nm} כיבה את האור — בסיבוב הבא בלי תחזית`;
      case "world:meteors": eff.meteorsNext = 4; return `☄️ ${nm} הזמין גשם מטאורים!`;
      case "world:newmap": { world.h = tkGenTerrain(bseed + ":map" + k + rng()); terrain(); for (const tk of alive()) settle(tk); return `🗺️ ${nm} החליף את ההר!`; }
      case "world:oil": eff.oil = k + 1; return `🛢️ ${nm} שפך שמן — כולם יחליקו`;
      case "world:walls": eff.wallsUntil = k + 2; return `🧱 ${nm} הקים קירות — הפגזים חוזרים מהקצוות`;
      case "world:doom": eff.doom = k + 1; return `🔔 ${nm} הכריז על יום הדין — נזק כפול בסלבו הבא!`;
      case "world:healall": for (const tk of alive()) { tk.hp = Math.min(tk.hpMax, tk.hp + 25); bc({ a: "tk_tank", tank: wireTank(tk) }); } return `🌦️ ${nm} הוריד גשם מרפא לכולם`;
      case "world:shuffle": { const xs = tkPlaceTanks(bseed + ":sh" + k + rng(), world.h, tanks.size); [...tanks.values()].forEach((tk, i) => { tk.x = xs[i]; settle(tk); }); terrain(); return `🎲 ${nm} ערבב את כולם!`; }
    }
    return;
  }
  function freeX(): number {
    for (let i = 0; i < 20; i++) { const x = Math.round(30 + rng() * (TK.W - 60)); if (alive().every((t) => Math.abs(t.x - x) > 45)) return x; }
    return Math.round(30 + rng() * (TK.W - 60));
  }

  /* ---------- סיום קרב / משחק ---------- */
  const rows = (): TkRow[] => ranked().map((p) => ({ pid: p.pid, c: p.c, score: p.score, kills: p.kills, dmg: Math.round(p.dmg), gold: Math.round(p.goldTotal), wins: p.wins, cards: Object.keys(p.owned) }));
  function battleOver() {
    if (phase !== "salvo") return;
    phase = "battleover"; token++;
    const live = alive();
    let winner: TkTank | null = null;
    if (live.length === 1) winner = live[0];
    else if (live.length > 1) winner = live.sort((a, c) => (c.hp + c.shield) - (a.hp + a.shield))[0];
    const wp = winner ? ps.get(winner.pid) : undefined;
    if (wp) { wp.wins++; wp.score += 6; wp.gold += TK.GOLD_BATTLE; wp.goldTotal += TK.GOLD_BATTLE; }
    const last = b + 1 >= cfg.battles;
    bc({ a: "tk_battleover", b, winner: winner?.pid ?? null, rows: rows(), last });
    later(last ? cfg.endMs : cfg.endMs + 1200, () => (last ? finish() : startBattle(b + 1)));
  }
  function finish() {
    if (phase === "over") return;
    phase = "over"; token++;
    const rs = rows();
    const titles: { pid: string; ic: string; t: string }[] = [];
    const by = (f: (p: P) => number, ic: string, t: string, min = 1) => { const best = [...ps.values()].sort((a, c) => f(c) - f(a))[0]; if (best && f(best) >= min && !titles.some((x) => x.pid === best.pid)) titles.push({ pid: best.pid, ic, t }); };
    by((p) => p.dmg, "🎯", "הצלף", 30);
    by((p) => p.kills, "💀", "הקטלן", 1);
    by((p) => p.survived, "🌵", "השורד", 3);
    by((p) => p.goldTotal, "💰", "המיליונר", 100);
    by((p) => p.selfDmg, "🤡", "הקמיקזה", 20);
    bc({ a: "tk_over", rows: rs, titles });
    later(cfg.endMs < 2000 ? 1200 : 7000, () => {
      const facts: Record<string, Record<string, number>> = {};
      for (const p of ps.values()) facts[p.pid] = { tkKills: p.kills, tkDmg: Math.round(p.dmg), tkWins: p.wins, tkSelf: p.selfDmg };
      const w = rs[0]; const clown = titles.find((t) => t.ic === "🤡");
      ctx.end({
        title: w ? `💥 התותחים — ${nameOf(w.pid)} עם ${w.kills} הריגות` : "💥 התותחים",
        winnerId: w?.pid, loserId: clown?.pid,
        scores: Object.fromEntries(rs.map((r) => [r.pid, r.score])),
        facts: facts as any,
      });
    });
  }

  function sync(pid: string) {
    const p = ps.get(pid); const t = tanks.get(pid);
    to(pid, {
      a: "tk_sync", phase, b, k, chars: taken(), seed: bseed, h: world.h, world: wireWorld(), tanks: wireTanks(), wind, until, cfg: timing(), battles: cfg.battles,
      you: { gold: Math.round(p?.gold ?? 0), ammo: p?.ammo ?? {}, owned: p?.owned ?? {}, fuel: p?.fuelLeft ?? 0, alive: t?.alive ?? false },
    });
    if (p && phase === "garage" && p.offer.length) to(pid, { a: "tk_garage", k, until, gold: Math.round(p.gold), cards: p.offer.map((id) => wireCard(tkCard(id)!, p.mods)), sudden: k + 1 >= TK.SUDDEN_FROM });
    if (p && phase === "aim" && t && !t.alive && p.sky.length) to(pid, { a: "tk_sky", k, cards: p.sky.map((id) => wireCard(tkCard(id)!)) });
  }

  return {
    onStart() {
      for (const p of ctx.participants()) if (p.connected) ps.set(p.id, newP(p.id, -1));
      pickPhase();
    },
    onMessage(pid, d0: GameClientMsg) {
      const d = d0 as any;
      if (typeof d?.a !== "string" || !d.a.startsWith("tk_")) return;
      const p = ps.get(pid); if (!p) return;
      const t = tanks.get(pid);
      switch (d.a) {
        case "tk_char": {
          if (phase !== "pick") return;
          const c = Number(d.c);
          if (!Number.isInteger(c) || c < 0 || c > 7) return;
          if ([...ps.values()].some((q) => q.pid !== pid && q.c === c)) return;
          p.c = c;
          bc({ a: "tk_pickphase", taken: taken(), until: 0 });
          if ([...ps.values()].every((q) => q.c >= 0 || !connected(q.pid))) { token++; later(800, begin); }
          return;
        }
        case "tk_aimset": {
          if (phase !== "aim" || !t?.alive) return;
          const vx = Number(d.vx) || 0, vy = Number(d.vy) || 0;
          const vmax = TK.VMAX * p.mods.power + 0.01;
          const v = Math.hypot(vx, vy); if (v < 0.5) return;
          const s = v > vmax ? vmax / v : 1;
          const w = typeof d.w === "string" && (d.w === TK_BASIC || (p.ammo[d.w] ?? 0) > 0) ? d.w : TK_BASIC;
          p.aim = { vx: vx * s, vy: vy * s, w };
          for (const q of ps.values()) if (q.spy.has(pid) && connected(q.pid)) to(q.pid, { a: "tk_spy", pid, vx: p.aim.vx, vy: p.aim.vy });
          return;
        }
        case "tk_ready": {
          if (phase === "aim") { p.ready = true; maybeEarly(); }
          else if (phase === "garage") { p.ready = true; maybeEarlyGarage(); }
          return;
        }
        case "tk_movereq": {
          if (phase !== "aim" || !t?.alive || p.fuelLeft <= 0) return;
          const dir = Math.sign(Number(d.dir) || 0); if (!dir) return;
          p.fuelLeft--;
          t.x = Math.max(12, Math.min(TK.W - 12, t.x + dir * p.mods.moveStep)); t.y = tkGround(world.h, t.x);
          bc({ a: "tk_move", pid, x: Math.round(t.x), y: Math.round(t.y), fuel: p.fuelLeft });
          return;
        }
        case "tk_buy": buy(p, String(d.id), typeof d.target === "string" ? d.target : undefined, Number.isFinite(Number(d.x)) ? Number(d.x) : undefined); return;
        case "tk_skypick": {
          if (phase !== "aim" || t?.alive || !p.sky.includes(String(d.id))) return;
          const c = tkCard(String(d.id)); if (!c) return;
          if (c.tg === "player" && (!d.target || !tanks.get(String(d.target))?.alive)) return;
          p.skyPick = { id: c.id, target: typeof d.target === "string" ? d.target : undefined, x: Number.isFinite(Number(d.x)) ? Number(d.x) : undefined };
          p.sky = []; p.ready = true; maybeEarly();
          return;
        }
      }
    },
    onLeave(pid, permanent) {
      const p = ps.get(pid); if (!p || !permanent) return;
      const t = tanks.get(pid); if (t?.alive) { t.alive = false; t.hp = 0; bc({ a: "tk_tank", tank: wireTank(t) }); feed(`👋 ${nameOf(pid)} עזב את הקרב`); }
    },
    onRejoin(pid) { sync(pid); },
    dispose() { token++; for (const t of pend) clearTimeout(t); pend.clear(); },
  };
}
