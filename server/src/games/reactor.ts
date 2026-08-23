/**
 * "הכור" ☢️ — לוגיקת השרת. קו-אופ תפקידים: הצוות מאכיל ליבה רעבה, גל אחרי גל.
 *
 * תפקידים (מתחלפים כל גל): מזינים (משגרים אורבים) · טוען (מזריק לליבה בתזמון
 * טבעת) · מתקן (רק הוא מנקה תקלות — מ-3 שחקנים ומעלה). הליבה נשחקת כל הזמן;
 * אורב שהוזרק מוסיף אנרגיה, אורב שאבד מוריד. HP=0 ⇒ התכה מסונכרנת אצל כולם.
 *
 * עקרונות מהמחקר (מסמך פולס-קטגוריית-קואופ):
 * - Near-miss: מסך הסיום מדגיש "עוד X שניות והייתם עוברים גל" + "עוד פעם" מיידי.
 * - אף ריצה לא מבוזבזת: שיא-ריצות נשמר; הטקס מדווח את השיא, לא את הכישלון.
 * - דראפט 3 קלפים בין גלים = התגמול המשתנה; הבסיס קשה בכוונה — השדרוג הכרחי.
 * - אורב הזהב: רגע קבוצתי מסונכרן (3-2-1 → כולם נוגעים יחד) — הרגע המצולם.
 */
import type { GameCtx, GameInstance } from "../engine";
import type {
  GameClientMsg, ReactorClientMsg, ReactorRole, ReactorCard, ReactorStats, ReactorQuality,
} from "../../../shared/protocol";

interface Config { difficulty?: "normal" | "brutal" }

interface Orb {
  id: number;
  feeder: string;
  state: "pending" | "travel";
  expireTimer?: NodeJS.Timeout;
}

/* ---- קלפי השדרוג — team-wide, נערמים ---- */
const CARDS: (ReactorCard & { key: UpgradeKey })[] = [
  { id: "enrich", key: "enrich", name: "אורב מועשר", emoji: "⚡", desc: "+1 אנרגיה לכל אורב שנכנס לליבה" },
  { id: "flow", key: "flow", name: "זרימה מהירה", emoji: "🌀", desc: "אורבים נוצרים מהר יותר אצל המזינים" },
  { id: "window", key: "window", name: "חלון זהב", emoji: "🎯", desc: "חלון ההזרקה המושלם גדל" },
  { id: "armor", key: "armor", name: "שריון ליבה", emoji: "🛡️", desc: "הליבה נשחקת לאט יותר" },
  { id: "absorb", key: "absorb", name: "ליבה סופגת", emoji: "🧽", desc: "אורב שאבד כואב פחות" },
  { id: "magnet", key: "magnet", name: "מגנט", emoji: "🧲", desc: "אורבים מחכים יותר זמן לפני שהם נעלמים" },
  { id: "buffer", key: "buffer", name: "מאגר מורחב", emoji: "📦", desc: "תור הליבה מכיל אורב נוסף" },
  { id: "lucky", key: "lucky", name: "מזל זהב", emoji: "✨", desc: "אורב הזהב מרפא יותר" },
];
type UpgradeKey = "enrich" | "flow" | "window" | "armor" | "absorb" | "magnet" | "buffer" | "lucky";

const WAVE_MS = 35_000;
const TRAVEL_MS = 900;
const DRAFT_MS = 12_000;
const GOLD_LEAD_MS = 3_000;
const GOLD_WINDOW_MS = 1_400;

export function createReactor(ctx: GameCtx): GameInstance {
  const brutal = ((ctx.config ?? {}) as Config).difficulty === "brutal";
  const diff = brutal ? 1.22 : 1;

  let phase: "warmup" | "wave" | "draft" | "runover" | "done" = "warmup";
  let token = 0; // גדל בכל מעבר פאזה — טיימרים ישנים בודקים ומתים
  let wave = 0;
  let bestWave = 0;
  let hp = 100;
  let hpTicks = 0;
  let waveEndsAt = 0;
  let ringMs = 2100;
  let ringEpoch = 0;
  let orbSeq = 0;

  const roles: Record<string, ReactorRole> = {};
  const orbs = new Map<number, Orb>();
  let queue: number[] = [];
  const jams = new Set<string>();
  const up: Record<UpgradeKey, number> = { enrich: 0, flow: 0, window: 0, armor: 0, absorb: 0, magnet: 0, buffer: 0, lucky: 0 };
  const stats: Record<string, ReactorStats> = {};
  const hands = new Map<string, ReactorCard[]>(); // דראפט: היד של כל שחקן
  const picked = new Set<string>();
  let gold: { openAt: number; closeAt: number; need: number; taps: Set<string> } | null = null;

  const alive = () => ctx.participants().filter((p) => p.connected).map((p) => p.id);
  const hostId = () => ctx.players().find((p) => p.isHost)?.id;
  const st = (pid: string) => (stats[pid] ??= { fed: 0, perfect: 0, fixed: 0, lost: 0 });

  /* ---- פרמטרי גל (כיול: גל 1-2 נעים, מגל 3 לחץ, צוות בסיסי בקושי שורד גל 4) ---- */
  const nFeeders = () => Object.values(roles).filter((r) => r === "feeder").length || 1;
  const spawnMs = () => Math.max(1500, (3300 - 240 * (wave - 1)) * Math.pow(0.9, up.flow)) / diff;
  const orbLifeMs = () => Math.max(2500, 4800 - 200 * (wave - 1)) + 800 * up.magnet;
  const queueMax = () => 4 + up.buffer;
  const perfectFrac = () => Math.min(0.2, 0.09 + 0.03 * up.window);
  const goodFrac = () => Math.min(0.38, 0.22 + 0.04 * up.window);
  const drainPerSec = () =>
    (0.85 + 0.5 * (wave - 1)) * (0.55 + 0.45 * nFeeders()) * diff * Math.max(0.55, 1 - 0.12 * up.armor);
  const lostDmg = () => Math.max(1.5, 6 * (1 - 0.25 * up.absorb));
  const gainOf = (q: ReactorQuality) => (q === "perfect" ? 6 : q === "good" ? 3 : 1) + (q === "weak" ? 0 : up.enrich);

  function setHp(v: number) { hp = Math.max(0, Math.min(100, v)); }

  /* ---- חלוקת תפקידים — רוטציה כל גל ---- */
  function assignRoles() {
    for (const k of Object.keys(roles)) delete roles[k];
    const ps = alive();
    const n = ps.length;
    if (!n) return;
    const off = wave - 1;
    roles[ps[off % n]] = "loader";
    if (n >= 3) roles[ps[(off + 1) % n]] = "fixer";
    for (const p of ps) if (!roles[p]) roles[p] = "feeder";
  }

  function broadcastState() {
    ctx.broadcast(stateMsg());
  }
  function stateMsg() {
    return {
      a: "rx_state" as const, wave, roles: { ...roles }, hp: Math.round(hp), ringMs, ringEpoch,
      pf: perfectFrac(), gf: goodFrac(), queue: queue.length, jams: [...jams],
      phase: phase === "wave" ? ("wave" as const) : phase === "draft" ? ("draft" as const) : ("runover" as const),
    };
  }

  /* ---- מחזור גל ---- */
  function startWave(w: number, delayMs: number) {
    wave = w;
    bestWave = Math.max(bestWave, wave);
    assignRoles();
    phase = "wave";
    const t = ++token;
    ringMs = Math.max(950, 2100 - 90 * (wave - 1));
    queue = [];
    jams.clear();
    orbs.clear();
    const at = ctx.cue(delayMs, {
      a: "rx_wave", wave, roles: { ...roles }, hp: Math.round(hp),
      waveMs: WAVE_MS, ringMs, ringEpoch: 0, pf: perfectFrac(), gf: goodFrac(),
    });
    // ringEpoch = רגע פתיחת הגל — הלקוח מקבל אותו בתוך ההודעה? הוא מחושב כאן אחרי ה-cue,
    // לכן שולחים עדכון state קטן מיד אחרי הפתיחה (הלקוח משתמש ב-at של ה-cue כ-epoch בינתיים).
    ringEpoch = at;
    waveEndsAt = at + WAVE_MS;
    const startIn = at - ctx.now();
    // ניקוז HP
    ctx.timer(startIn, function tick() {
      if (token !== t || phase !== "wave") return;
      setHp(hp - drainPerSec() / 2);
      hpTicks++;
      if (hp <= 0) return meltdown();
      if (hpTicks % 2 === 0) ctx.broadcast({ a: "rx_hp", hp: Math.round(hp) });
      ctx.timer(500, tick);
    });
    // ספאון לכל מזין
    for (const p of alive()) if (roles[p] === "feeder") feederLoop(p, t, startIn + 600 + Math.random() * 800);
    // תקלות — רק כשיש מתקן, מגל 2
    if (wave >= 2 && Object.values(roles).includes("fixer")) {
      scheduleJam(t, startIn + 6000 + Math.random() * 4000);
    }
    // אורב הזהב — פעם בגל
    ctx.timer(startIn + WAVE_MS * (0.45 + Math.random() * 0.2), () => openGold(t));
    // סוף גל
    ctx.timer(startIn + WAVE_MS, () => {
      if (token !== t || phase !== "wave") return;
      waveClear();
    });
  }

  function feederLoop(pid: string, t: number, delayMs: number) {
    ctx.timer(delayMs, () => {
      if (token !== t || phase !== "wave") return;
      if (roles[pid] !== "feeder" || !alive().includes(pid)) return;
      if (!jams.has(pid)) spawnOrb(pid, t);
      feederLoop(pid, t, spawnMs() * (0.85 + Math.random() * 0.3));
    });
  }

  function spawnOrb(feeder: string, t: number) {
    const id = ++orbSeq;
    const life = orbLifeMs();
    // אורב נוגע רק למזין שלו — אין צורך בבו-זמניות של cue; שולחים מיידית עם זמן-תפוגה מוחלט
    const expireAt = ctx.now() + life;
    const orb: Orb = { id, feeder, state: "pending" };
    orbs.set(id, orb);
    orb.expireTimer = ctx.timer(life, () => {
      if (token !== t || phase !== "wave") return;
      const o = orbs.get(id);
      if (!o || o.state !== "pending") return;
      loseOrb(id, feeder);
    });
    ctx.broadcast({ a: "rx_orb", orbId: id, feeder, expireAt });
  }

  function loseOrb(id: number, where: string) {
    const o = orbs.get(id);
    if (o) { clearTimeout(o.expireTimer!); orbs.delete(id); }
    queue = queue.filter((q) => q !== id);
    setHp(hp - lostDmg());
    st(where === "loader" ? (Object.keys(roles).find((p) => roles[p] === "loader") ?? where) : where).lost++;
    ctx.broadcast({ a: "rx_lost", orbId: id, where, hp: Math.round(hp) });
    if (hp <= 0) meltdown();
  }

  function scheduleJam(t: number, delayMs: number) {
    ctx.timer(delayMs, () => {
      if (token !== t || phase !== "wave") return;
      const feeders = alive().filter((p) => roles[p] === "feeder" && !jams.has(p));
      if (feeders.length) {
        const victim = feeders[Math.floor(Math.random() * feeders.length)];
        jams.add(victim);
        ctx.broadcast({ a: "rx_jam", station: victim });
      }
      scheduleJam(t, Math.max(5000, 12_000 - wave * 800) * (0.8 + Math.random() * 0.4));
    });
  }

  function openGold(t: number) {
    if (token !== t || phase !== "wave") return;
    const need = Math.max(2, Math.ceil(alive().length * 0.7));
    const at = ctx.cue(400, { a: "rx_gold", leadMs: GOLD_LEAD_MS, windowMs: GOLD_WINDOW_MS, need });
    gold = { openAt: at + GOLD_LEAD_MS, closeAt: at + GOLD_LEAD_MS + GOLD_WINDOW_MS, need, taps: new Set() };
    ctx.timer(at + GOLD_LEAD_MS + GOLD_WINDOW_MS + 300 - ctx.now(), () => {
      if (token !== t || !gold) return;
      const success = gold.taps.size >= gold.need;
      if (success) setHp(hp + 12 + 4 * up.lucky);
      ctx.broadcast({ a: "rx_gold_res", success, count: gold.taps.size, need: gold.need, hp: Math.round(hp) });
      gold = null;
    });
  }

  function waveClear() {
    phase = "draft";
    token++;
    gold = null;
    for (const o of orbs.values()) clearTimeout(o.expireTimer!);
    orbs.clear();
    ctx.broadcast({ a: "rx_wave_clear", wave, hp: Math.round(hp) });
    // דראפט: 3 קלפים אקראיים לכל שחקן
    hands.clear();
    picked.clear();
    const until = ctx.now() + DRAFT_MS;
    for (const p of alive()) {
      const pool = [...CARDS].sort(() => Math.random() - 0.5).slice(0, 3);
      hands.set(p, pool);
      ctx.sendTo(p, { a: "rx_draft", cards: pool.map(({ id, name, emoji, desc }) => ({ id, name, emoji, desc })), until });
    }
    const t = token;
    ctx.timer(DRAFT_MS + 400, () => {
      if (token !== t || phase !== "draft") return;
      // מי שלא בחר — בחירה אוטומטית
      for (const p of alive()) if (!picked.has(p)) applyPick(p, hands.get(p)?.[0]?.id ?? "armor", true);
      nextWaveAfterDraft();
    });
  }

  function applyPick(pid: string, cardId: string, auto = false) {
    if (picked.has(pid)) return;
    const hand = hands.get(pid);
    const card = hand?.find((c) => c.id === cardId) ?? (auto ? CARDS.find((c) => c.id === cardId) : undefined);
    if (!card) return;
    picked.add(pid);
    up[(card as { key?: UpgradeKey }).key ?? (card.id as UpgradeKey)]++;
    const info = ctx.players().find((p) => p.id === pid);
    ctx.broadcast({ a: "rx_picked", pid, name: card.name, emoji: card.emoji });
    void info;
  }

  function nextWaveAfterDraft() {
    if (phase !== "draft") return;
    startWave(wave + 1, 2200);
  }

  function meltdown() {
    if (phase !== "wave") return;
    phase = "runover";
    token++;
    for (const o of orbs.values()) clearTimeout(o.expireTimer!);
    orbs.clear();
    gold = null;
    const remainS = Math.ceil(Math.max(0, waveEndsAt - ctx.now()) / 1000);
    ctx.cue(500, { a: "rx_meltdown", wave });
    const nearMiss = remainS <= 10 && remainS > 0
      ? `עוד ${remainS} שניות והייתם עוברים לגל ${wave + 1}! 😩`
      : undefined;
    ctx.timer(3000, () => {
      if (phase !== "runover") return;
      ctx.broadcast({
        a: "rx_run_over", wave, bestWave, nearMiss, mvp: mvpId(),
        stats: Object.fromEntries(alive().map((p) => [p, st(p)])),
      });
    });
  }

  const score = (p: string) => { const s = st(p); return s.perfect * 3 + s.fed + s.fixed * 2 - s.lost; };
  function mvpId() { const ps = alive(); return [...ps].sort((a, b) => score(b) - score(a))[0]; }

  function finish() {
    phase = "done";
    token++;
    const ps = alive();
    const winner = mvpId();
    const loser = [...ps].sort((a, b) => st(b).lost - st(a).lost || score(a) - score(b))[0];
    const scores: Record<string, number> = {};
    for (const p of ps) scores[p] = Math.max(0, score(p));
    ctx.end({
      title: `הכור ☢️ הגעתם לגל ${bestWave}!`,
      winnerId: winner,
      loserId: loser !== winner ? loser : undefined,
      scores,
    });
  }

  return {
    onStart() {
      setHp(100);
      startWave(1, 3200); // הלקוחות מציגים "הכור מתחמם..." עד ה-cue
    },

    onRejoin(pid: string) {
      if (phase === "done") return;
      ctx.sendTo(pid, stateMsg());
    },

    onMessage(pid: string, d: GameClientMsg) {
      const m = d as ReactorClientMsg;
      switch (m.a) {
        case "rx_feed": {
          if (phase !== "wave") return;
          const o = orbs.get(m.orbId);
          if (!o || o.feeder !== pid || o.state !== "pending" || jams.has(pid)) return;
          o.state = "travel";
          clearTimeout(o.expireTimer!);
          st(pid).fed++;
          const arriveAt = ctx.now() + 400 + TRAVEL_MS;
          ctx.cue(400, { a: "rx_sent", orbId: o.id, feeder: pid, arriveAt });
          const t = token;
          ctx.timer(arriveAt - ctx.now(), () => {
            if (token !== t || phase !== "wave" || !orbs.has(o.id)) return;
            if (queue.length >= queueMax()) { loseOrb(o.id, "loader"); return; }
            queue.push(o.id);
            ctx.broadcast({ a: "rx_queue", queue: queue.length });
          });
          return;
        }
        case "rx_inject": {
          if (phase !== "wave" || roles[pid] !== "loader" || !queue.length) return;
          const orbId = queue.shift()!;
          orbs.delete(orbId);
          const ph = (((m.atServer - ringEpoch) % ringMs) + ringMs) % ringMs / ringMs;
          const dist = Math.min(ph, 1 - ph);
          const quality: ReactorQuality = dist <= perfectFrac() / 2 ? "perfect" : dist <= goodFrac() / 2 ? "good" : "weak";
          const gain = gainOf(quality);
          setHp(hp + gain);
          if (quality === "perfect") st(pid).perfect++;
          ctx.broadcast({ a: "rx_injected", orbId, by: pid, quality, gain, hp: Math.round(hp), queue: queue.length });
          return;
        }
        case "rx_fixed": {
          if (phase !== "wave" || roles[pid] !== "fixer" || !jams.has(m.station)) return;
          jams.delete(m.station);
          st(pid).fixed++;
          ctx.broadcast({ a: "rx_unjam", station: m.station, by: pid });
          return;
        }
        case "rx_gold_tap": {
          if (!gold) return;
          const now = ctx.now();
          if (now >= gold.openAt - 250 && now <= gold.closeAt + 250) gold.taps.add(pid);
          return;
        }
        case "rx_pick": {
          if (phase !== "draft") return;
          applyPick(pid, m.cardId);
          if (alive().every((p) => picked.has(p))) nextWaveAfterDraft();
          return;
        }
        case "rx_again": {
          if (phase !== "runover" || pid !== hostId()) return;
          for (const k of Object.keys(up) as UpgradeKey[]) up[k] = 0;
          setHp(100);
          startWave(1, 2500);
          return;
        }
        case "rx_finish": {
          if (phase !== "runover" || pid !== hostId()) return;
          finish();
          return;
        }
      }
    },

    onLeave(pid: string, permanent?: boolean) {
      if (!permanent || phase === "done") return;
      // אורבים של מי שעזב נעלמים בשקט (בלי נזק)
      for (const o of [...orbs.values()]) {
        if (o.feeder === pid) { clearTimeout(o.expireTimer!); orbs.delete(o.id); ctx.broadcast({ a: "rx_lost", orbId: o.id, where: pid, hp: Math.round(hp) }); }
      }
      jams.delete(pid);
      // תפקיד קריטי שהתפנה — מקצים מחדש ומעדכנים את כולם
      if (phase === "wave" && (roles[pid] === "loader" || roles[pid] === "fixer")) {
        const role = roles[pid];
        delete roles[pid];
        const candidate = alive().find((p) => roles[p] === "feeder") ?? alive()[0];
        if (candidate) roles[candidate] = role;
        broadcastState();
      } else {
        delete roles[pid];
      }
      if (phase === "draft" && alive().every((p) => picked.has(p))) nextWaveAfterDraft();
    },

    dispose() {
      phase = "done";
      token++;
      for (const o of orbs.values()) clearTimeout(o.expireTimer!);
      orbs.clear();
    },
  };
}
