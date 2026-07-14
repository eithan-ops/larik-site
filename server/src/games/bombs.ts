/**
 * "מטר הפצצות" — לוגיקת השרת. משחק שיתופי: כל החדר צוות אחד נגד המחשב.
 *
 * פצצה נוחתת על טלפון אקראי (cue מסונכרן — כולם רואים אותה נוחתת יחד).
 * מי שאצלו — מעביר לחבר לפני שהפתיל נגמר. פצצה שמתפוצצת = הצוות מאבד לב.
 * הקצב מאיץ; סוגי פצצות מכריחים תיאום בקול ("אל תזרוק עליי, יש לי שתיים!").
 *
 * סוגים: classic (מעבירים) · sticky (משפשפים לשחרור ואז מעבירים)
 *        chain (בהעברה הראשונה נולדת פצצונת נוספת) · duo (שניים מחזיקים יחד לנטרול)
 */
import type { GameCtx, GameInstance } from "../engine";
import type { BombsClientMsg, GameClientMsg, BombType } from "../../../shared/protocol";

interface Config { difficulty?: "chill" | "wild" }

interface Bomb {
  id: number;
  type: BombType;
  holder: string;
  explodeAt: number;
  stuck: boolean;
  split: boolean;
  partner?: string;
  holds: Set<string>;
  fuseTimer?: NodeJS.Timeout;
  defuseTimer?: NodeJS.Timeout;
}

const LIVES = 3;
const DUO_HOLD_MS = 700;

export function createBombs(ctx: GameCtx): GameInstance {
  const wild = ((ctx.config ?? {}) as Config).difficulty === "wild";
  let lives = LIVES;
  let bombSeq = 0;
  let over = false;
  const bombs = new Map<number, Bomb>();
  const actions: Record<string, number> = {}; // העברות + נטרולים×2
  const boomed: Record<string, number> = {}; // פיצוצים "על המשמרת"
  const startedAt = ctx.now();

  let spawnMs = wild ? 4200 : 6200;
  const minSpawn = wild ? 1600 : 2400;
  let fuseMs = wild ? 7500 : 10_000;
  const minFuse = wild ? 4200 : 6000;

  const alive = () => ctx.connectedPlayers().map((p) => p.id);

  function loadOf(pid: string) {
    let n = 0;
    for (const b of bombs.values()) if (b.holder === pid || b.partner === pid) n++;
    return n;
  }

  /** בוחר מחזיק — משקל גבוה יותר למי שפנוי (מפזר את העומס) */
  function pickHolder(exclude?: string): string | undefined {
    let ps = alive().filter((p) => p !== exclude);
    if (!ps.length) ps = alive();
    if (!ps.length) return undefined;
    const weights = ps.map((p) => 1 / (1 + loadOf(p) * 2));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < ps.length; i++) { r -= weights[i]; if (r <= 0) return ps[i]; }
    return ps[ps.length - 1];
  }

  function pickType(): BombType {
    const canDuo = alive().length >= 2;
    const r = Math.random();
    if (r < 0.5) return "classic";
    if (r < 0.7) return "sticky";
    if (r < 0.85) return "chain";
    return canDuo ? "duo" : "classic";
  }

  function spawn(type?: BombType, fuseOverride?: number, exclude?: string) {
    if (over) return;
    const t = type ?? pickType();
    const holder = pickHolder(exclude);
    if (!holder) return;
    const id = ++bombSeq;
    const fuse = Math.round(fuseOverride ?? fuseMs * (0.9 + Math.random() * 0.25));
    const partner = t === "duo" ? pickHolder(holder) : undefined;
    const at = ctx.cue(600, { a: "bm_spawn", bombId: id, type: t, holder, fuseMs: fuse, partner });
    const bomb: Bomb = { id, type: t, holder, explodeAt: at + fuse, stuck: t === "sticky", split: false, partner, holds: new Set() };
    bombs.set(id, bomb);
    bomb.fuseTimer = ctx.timer(at + fuse - ctx.now(), () => explode(id));
  }

  function explode(id: number) {
    const b = bombs.get(id);
    if (!b || over) return;
    removeBomb(b);
    lives -= 1;
    boomed[b.holder] = (boomed[b.holder] ?? 0) + 1;
    ctx.cue(400, { a: "bm_explode", bombId: id, holder: b.holder });
    ctx.broadcast({ a: "bm_lives", lives });
    if (lives <= 0) {
      over = true;
      for (const bb of [...bombs.values()]) removeBomb(bb);
      ctx.timer(2600, finish);
    }
  }

  function removeBomb(b: Bomb) {
    clearTimeout(b.fuseTimer!);
    clearTimeout(b.defuseTimer!);
    bombs.delete(b.id);
  }

  function finish() {
    const survivedS = Math.round((ctx.now() - startedAt) / 1000);
    const ps = alive();
    const score = (p: string) => actions[p] ?? 0;
    const winner = [...ps].sort((a, b) => score(b) - score(a) || (boomed[a] ?? 0) - (boomed[b] ?? 0))[0];
    const loser = [...ps].sort((a, b) => (boomed[b] ?? 0) - (boomed[a] ?? 0) || score(a) - score(b))[0];
    const scores: Record<string, number> = {};
    for (const p of ps) scores[p] = score(p);
    ctx.end({
      title: `מטר הפצצות 💣 שרדתם ${survivedS} שניות`,
      winnerId: winner,
      loserId: loser !== winner ? loser : undefined,
      scores,
    });
  }

  function loop() {
    if (over) return;
    spawn();
    spawnMs = Math.max(minSpawn, spawnMs * 0.93);
    fuseMs = Math.max(minFuse, fuseMs * 0.97);
    ctx.timer(spawnMs, loop);
  }

  return {
    onStart() {
      ctx.broadcast({ a: "bm_start", lives });
      ctx.timer(2800, loop); // ספירת פתיחה אצל הלקוחות
    },

    onMessage(pid: string, d: GameClientMsg) {
      if (over) return;
      const m = d as BombsClientMsg;
      switch (m.a) {
        case "bm_pass": {
          const b = bombs.get(m.bombId);
          if (!b || b.holder !== pid || b.stuck || b.type === "duo") return;
          if (m.to === pid || !alive().includes(m.to)) return;
          const from = b.holder;
          b.holder = m.to;
          actions[from] = (actions[from] ?? 0) + 1;
          ctx.cue(350, { a: "bm_pass", bombId: b.id, from, to: m.to });
          // שרשרת: ההעברה הראשונה מולידה פצצונת
          if (b.type === "chain" && !b.split) {
            b.split = true;
            const remaining = Math.max(2500, b.explodeAt - ctx.now());
            spawn("classic", Math.min(remaining, 6000), m.to);
          }
          return;
        }
        case "bm_unstuck": {
          const b = bombs.get(m.bombId);
          if (!b || b.holder !== pid || !b.stuck) return;
          b.stuck = false;
          ctx.broadcast({ a: "bm_unstuck", bombId: b.id });
          return;
        }
        case "bm_hold": {
          const b = bombs.get(m.bombId);
          if (!b || b.type !== "duo") return;
          if (pid !== b.holder && pid !== b.partner) return;
          if (m.down) b.holds.add(pid); else b.holds.delete(pid);
          ctx.broadcast({ a: "bm_hold", bombId: b.id, pid, down: m.down });
          clearTimeout(b.defuseTimer!);
          if (b.holds.size === 2) {
            b.defuseTimer = ctx.timer(DUO_HOLD_MS, () => {
              if (!bombs.has(b.id) || b.holds.size !== 2) return;
              const by = [b.holder, b.partner!];
              removeBomb(b);
              for (const p of by) actions[p] = (actions[p] ?? 0) + 2;
              ctx.cue(300, { a: "bm_defused", bombId: b.id, by });
            });
          }
          return;
        }
      }
    },

    onLeave(pid: string) {
      // פצצות של מי שהתנתק עוברות הלאה; שותף-תאומה מוחלף
      for (const b of bombs.values()) {
        if (b.holder === pid) {
          const to = pickHolder(pid);
          if (to && to !== pid) {
            b.holder = to;
            ctx.cue(350, { a: "bm_pass", bombId: b.id, from: pid, to });
          }
        }
        if (b.partner === pid) {
          b.partner = pickHolder(b.holder) ?? b.holder;
          b.holds.delete(pid);
        }
      }
    },

    dispose() {
      over = true;
      for (const b of [...bombs.values()]) removeBomb(b);
    },
  };
}
