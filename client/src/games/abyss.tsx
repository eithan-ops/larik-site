/**
 * התהום 🕳️ — צד לקוח.
 *
 * "הטלפון בעלים של הנפילה, השרת בעלים של המדף": הנפילה שלך מסומלצת כאן, דטרמיניסטית מהזרע
 * המשותף (shared/abyss.ts), והעומק נגזר מזמן השרת — כל הטלפונים באותו עומק באותה שנייה.
 * ה-cues של השרת נושאים את התוכן (קרן, הצבעות); ציר הזמן עצמו מחושב מקומית, כך שגם cue מאוחר לא מזיז מדף.
 * ציור: abyssDraw.ts · סאונד: abyssAudio.ts · DOM: HUD ושכבות בלבד (abyss.css).
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { AbyssServerMsg, AbTiming, AbyssCard } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import {
  AB, abDepthAt, abFreezeAt, abLedgeDepth, abWorld, abAdvance, abNewSim, abBotX, abPerkMods, abMult, abSegSpeed,
} from "../../../shared/abyss";
import type { AbWorld, AbSim, AbThrowObj, AbPerkMods } from "../../../shared/abyss";
import {
  makeView, sx, visTop, visBottom, drawBackdrop, drawWalls, drawLedge, drawObstacle, drawCrystal, drawThrow, drawAvatar,
  drawParticles, drawTrail, drawSpeedLines, burst, PCOL, CYAN, GOLD, RED, PAPER,
} from "./abyssDraw";
import type { Particle } from "./abyssDraw";
import { abAudioInit, abAudioResume, abWhoosh, abSfx } from "./abyssAudio";
import { preloadAb, cardArt } from "./abyssAssets";
import { vibrate } from "../lib/audio";
import { track } from "../lib/analytics";
import { drawShaftCard, shareShaftCard } from "../lib/shaftcard";
import type { ShaftCardData } from "../lib/shaftcard";

type Phase = "wait" | "intro" | "fall" | "ledge" | "reveal" | "results" | "draft" | "over";
type MeState = "falling" | "stopped" | "caught" | "spectator";
type Vote = "stop" | "go";
type RevealMsg = Extract<AbyssServerMsg, { a: "ab_reveal" }>;
type ResultsMsg = Extract<AbyssServerMsg, { a: "ab_results" }>;
interface Pop { x: number; y: number; t: string; col: string; l: number; sz: number }
interface PState { state: "fall" | "stop" | "caught" | "pot"; k: number; amt: number }

const REPORT_MS = 100;
const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

declare global {
  interface Window { __abDbg?: unknown; __abFrames?: number; __abErr?: string; __abAuto?: boolean; __abCardUrl?: string }
}

export default function AbyssView({ room, me, conn, hub }: GameViewProps) {
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const cdRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<Phase>("wait");
  const [meState, setMeState] = useState<MeState>("falling");
  const [hud, setHud] = useState({ crystals: 0, shield: 0, k: 0, mult: 1, pot: 0, total: 0, d: 0, of: 3, frac: 0 });
  const [count, setCount] = useState<string | null>(null);
  const [ledge, setLedge] = useState<{ k: number; mult: number; nextMult: number; voteUntil: number; myVote: Vote | null; locked: boolean; n: number; of: number; potSeg: boolean } | null>(null);
  const [reveal, setReveal] = useState<RevealMsg | null>(null);
  const [results, setResults] = useState<ResultsMsg | null>(null);
  const [draft, setDraft] = useState<{ cards: AbyssCard[]; until: number; picked?: string } | null>(null);
  const [spec, setSpec] = useState<{ target: string | null; fallers: { pid: string; c: number; s: number }[]; status: string }>({ target: null, fallers: [], status: "" });
  const [toast, setToast] = useState("");
  const [feed, setFeed] = useState<{ id: number; tx: string }[]>([]);
  const [banner, setBanner] = useState<{ ic: string; t: string; s: string; cls?: string } | null>(null);
  const [flash, setFlash] = useState(0);
  const feedId = useRef(1);
  const card = useRef<{ data: ShaftCardData; blob: Blob | null } | null>(null);
  const [cardReady, setCardReady] = useState(false);

  const G = useRef({
    cfg: null as AbTiming | null, startAt: 0, seed: "", world: null as AbWorld | null,
    mods: abPerkMods([]) as AbPerkMods, sim: abNewSim() as AbSim,
    meState: "falling" as MeState, phase: "wait" as Phase, k: 0, d: 0, of: 3,
    descentEnded: false, ledgeShown: -1, revealSeen: -1,
    others: new Map<string, { x: number; tx: number; c: number; s: number }>(),
    pstate: new Map<string, PState>(),
    throws: new Map<number, AbThrowObj>(),
    fx: { parts: [] as Particle[], pops: [] as Pop[], shake: 0, flash: 0, flashCol: "#fff", stop: 0, trail: [] as { x: number; y: number }[], squash: 0, dust: 0, near: 0 },
    input: { down: false, lastX: 0, pendingDx: 0, key: 0 },
    spec: { target: null as string | null, x: 50, tx: 50 },
    players: [] as { id: string; name: string; emoji: string }[],
    lastReport: 0, lastSimAt: 0, prevDepth: 0, hudAt: 0, stripAt: 0,
    cdUntil: 0, pot: 0, potSeg: false, potRunner: "", totals: {} as Record<string, number>,
    voteLockSaid: false, warned: -1, reduced: reducedMotion(),
  });

  const pl = (pid: string) => G.current.players.find((p) => p.id === pid);
  const pname = (pid: string) => pl(pid)?.name ?? "מישהו";
  const pemoji = (pid: string) => pl(pid)?.emoji ?? "🙂";
  const pcol = (pid: string) => PCOL[Math.max(0, G.current.players.findIndex((p) => p.id === pid)) % PCOL.length];
  const fmt = (n: number) => Math.round(n).toLocaleString("he-IL");

  useEffect(() => { G.current.players = room.players.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })); }, [room.players]);
  // המשתמש כבר לחץ "מתחילים" בעמוד הזה — ההפעלה הדביקה מאפשרת ליצור AudioContext גם בלי מחווה נוספת (ובאייפון ישן — במגע הראשון)
  useEffect(() => { abAudioInit(); preloadAb(); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!banner) return; const t = setTimeout(() => setBanner(null), banner.cls === "long" ? 3200 : banner.cls === "short" ? 1250 : 2200); return () => clearTimeout(t); }, [banner]);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(0), 260); return () => clearTimeout(t); }, [flash]);

  function addFeed(tx: string) { setFeed((f) => [...f.slice(-2), { id: feedId.current++, tx }]); }
  function setPhaseBoth(p: Phase) { G.current.phase = p; setPhase(p); }
  function setMe(s: MeState) { G.current.meState = s; setMeState(s); }

  /** בחירת מטרה לצפייה: הנוכחית אם עדיין נופלת, אחרת הנופל העשיר */
  function pickTarget(): string | null {
    const g = G.current;
    if (g.spec.target && g.others.has(g.spec.target)) return g.spec.target;
    let best: string | null = null, bc = -1;
    for (const [pid, o] of g.others) if (pid !== me && o.c > bc) { bc = o.c; best = pid; }
    return best;
  }
  function enterSpectator(state: MeState) {
    const g = G.current;
    setMe(state);
    const t = pickTarget();
    g.spec.target = t; if (t) { const o = g.others.get(t); g.spec.x = o?.x ?? 50; g.spec.tx = g.spec.x; }
    const ps = g.pstate.get(me);
    const status = state === "stopped" ? `עצרת במדף ${(ps?.k ?? g.k) + 1} · בנקאי ${fmt(ps?.amt ?? 0)} · סה"כ ${fmt(g.totals[me] ?? 0)}` : state === "caught" ? `נתפסת — השלל הלך לקרן · סה"כ ${fmt(g.totals[me] ?? 0)}` : "מצטרפים בצניחה הבאה — בינתיים זורקים";
    setSpec({ target: t, fallers: [...g.others.entries()].filter(([p]) => p !== me).map(([pid, o]) => ({ pid, c: o.c, s: o.s })), status });
    if (t) conn.sendGame({ a: "ab_watch", target: t });
  }
  function switchTarget(pid: string) {
    const g = G.current;
    g.spec.target = pid; const o = g.others.get(pid); if (o) { g.spec.x = o.x; g.spec.tx = o.tx; }
    setSpec((s) => ({ ...s, target: pid }));
    conn.sendGame({ a: "ab_watch", target: pid });
  }
  function doThrow(kind: "trap" | "help") {
    const g = G.current;
    const t = g.spec.target; if (!t) { setToast("אין את מי לצפות…"); return; }
    const now = conn.serverNow();
    if (now < g.cdUntil) { setToast("עוד רגע… הקולדאון לא נגמר"); return; }
    if (!g.cfg || g.phase !== "fall") { setToast("לא בזמן מדף"); return; }
    if (now > abFreezeAt(g.cfg, g.startAt, g.k) - AB.THROW_BLOCK_BEFORE_LEDGE_MS) { setToast("המדף קרוב מדי"); return; }
    abAudioInit();
    const o = g.others.get(t);
    const k = kind === "trap" ? "trap" : (o?.s ?? 0) > 0 ? "burst" : "shield";
    conn.sendGame({ a: "ab_throw", target: t, kind: k });
    abSfx.throwWhoosh();
    track("ab_throw", { kind: k });
  }
  function vote(v: Vote) {
    const g = G.current;
    if (g.meState !== "falling" || g.phase !== "ledge") return;
    abAudioInit();
    conn.sendGame({ a: "ab_vote", k: g.k, v });
    abSfx.tick(); vibrate(15);
    setLedge((l) => (l ? { ...l, myVote: v } : l));
  }

  /* ---- הודעות מהשרת ---- */
  useEffect(() => {
    const g = G.current;
    const applyDescent = (d: Extract<AbyssServerMsg, { a: "ab_descent" }> | Extract<AbyssServerMsg, { a: "ab_sync" }>) => {
      g.cfg = d.cfg; g.startAt = d.startAt; g.seed = d.seed; g.world = abWorld(d.seed, d.cfg);
      g.mods = abPerkMods(d.perks[me]); g.totals = d.totals; g.d = d.d; g.of = d.of;
      g.sim = abNewSim(g.mods.shieldStart, g.mods.trapGuard);
      g.others.clear(); g.throws.clear(); g.pstate.clear();
      g.fx.parts.length = 0; g.fx.pops.length = 0; g.fx.trail.length = 0; g.fx.shake = 0; g.fx.flash = 0;
      g.descentEnded = false; g.ledgeShown = -1; g.revealSeen = -1; g.k = 0; g.pot = 0; g.potSeg = false; g.potRunner = "";
      g.prevDepth = 0; g.lastSimAt = 0; g.voteLockSaid = false; g.warned = -1;
      setLedge(null); setReveal(null); setResults(null); setDraft(null);
      setHud((h) => ({ ...h, crystals: 0, shield: g.mods.shieldStart, k: 0, mult: 1, pot: 0, total: d.totals[me] ?? 0, d: d.d, of: d.of, frac: 0 }));
    };
    return hub.subscribe((raw) => {
      const d = raw as AbyssServerMsg;
      switch (d.a) {
        case "ab_descent": {
          abAudioInit();
          applyDescent(d);
          const meFalls = d.players.find((p) => p[0] === me)?.[1] === "fall";
          for (const [pid, st] of d.players) g.pstate.set(pid, { state: st === "fall" ? "fall" : "stop", k: -1, amt: 0 });
          if (meFalls) setMe("falling"); else { setMe("spectator"); }
          setPhaseBoth("intro");
          setBanner({ ic: "🕳️", t: d.of > 1 ? `צניחה ${d.d + 1} מתוך ${d.of}` : "צונחים!", s: meFalls ? "מזיזים את האגודל להתחמק · אוספים גבישים" : "צופים — ותורמים" });
          const sched = (ms: number, fn: () => void) => setTimeout(fn, Math.max(0, conn.untilServer(d.startAt - ms)));
          sched(3000, () => { setCount("3"); abSfx.count(); });
          sched(2000, () => { setCount("2"); abSfx.count(); });
          sched(1000, () => { setCount("1"); abSfx.count(); });
          sched(0, () => { setCount("צונחים!"); abSfx.go(); vibrate(30); setTimeout(() => setCount(null), 700); if (!meFalls) enterSpectator("spectator"); });
          break;
        }
        case "ab_pos": {
          const seen = new Set<string>();
          for (const [pid, x, c, s] of d.ps) {
            if (pid === me) continue;
            seen.add(pid);
            const o = g.others.get(pid);
            if (o) { o.tx = x; o.c = c; o.s = s; } else g.others.set(pid, { x, tx: x, c, s });
          }
          for (const pid of [...g.others.keys()]) if (!seen.has(pid)) g.others.delete(pid);
          const now = performance.now();
          if (now - g.stripAt > 400) {
            g.stripAt = now;
            setSpec((sp) => {
              const fallers = [...g.others.entries()].filter(([p]) => p !== me).map(([pid, o]) => ({ pid, c: o.c, s: o.s }));
              let target = sp.target;
              if (g.meState !== "falling" && (!target || !g.others.has(target))) { target = pickTarget(); g.spec.target = target; }
              return { ...sp, fallers, target };
            });
          }
          break;
        }
        case "ab_ledge": {
          g.pot = d.pot; g.potSeg = d.potSeg;
          setHud((h) => ({ ...h, pot: d.pot }));
          if (g.warned !== d.k) {
            g.warned = d.k;
            abSfx.ledgeRiser(Math.max(0.6, (d.freezeAt - conn.serverNow()) / 1000));
            setBanner({ ic: "🪨", t: d.potSeg ? "מדף הקרן!" : `מדף ${d.k + 1} מתקרב`, s: d.potSeg ? `שורדים — ולוקחים ${fmt(d.pot)}` : `עוצרים ×${d.mult} · ממשיכים ל-×${abMult(d.k + 1)}`, cls: "short" });
          }
          break;
        }
        case "ab_votes": setLedge((l) => (l ? { ...l, n: d.n, of: d.of } : l)); break;
        case "ab_reveal": {
          if (g.revealSeen === d.k) break;
          g.revealSeen = d.k;
          g.pot = d.pot; g.potSeg = d.next === "pot"; g.potRunner = d.potRunner ?? "";
          setPhaseBoth("reveal"); setReveal(d); setLedge(null);
          abAudioInit(); abSfx.reveal(); vibrate([60, 40, 120]); setFlash(Date.now());
          for (const [pid, v] of Object.entries(d.votes)) {
            const amt = d.banked[pid] ?? 0;
            if (v === "stop") g.pstate.set(pid, { state: "stop", k: d.k, amt });
            else if (v === "pot") g.pstate.set(pid, { state: "pot", k: d.k, amt });
            else if (v === "caught") g.pstate.set(pid, { state: "caught", k: d.k, amt: 0 });
          }
          const mine = d.votes[me];
          const revealDur = Math.max(400, d.resumeAt - conn.serverNow());
          if (mine === "stop" || mine === "pot") {
            const amt = d.banked[me] ?? 0;
            g.sim.crystals = 0;
            const newTotal = (g.totals[me] ?? 0) + amt;
            g.totals[me] = newTotal;
            setTimeout(() => { if (mine === "pot") { abSfx.potWin(); vibrate([80, 60, 80, 60, 250]); setBanner({ ic: "🏆", t: "לקחת את הקרן!", s: `+${fmt(amt)}`, cls: "long" }); } else { abSfx.bank(); setToast(`✅ בנקאי ${fmt(amt)} · סה"כ ${fmt(newTotal)}`); } }, 900);
            setHud((h) => ({ ...h, crystals: 0, total: g.totals[me] ?? 0, pot: d.pot }));
            if (d.next !== "end") setTimeout(() => enterSpectator("stopped"), revealDur);
            else setMe("stopped");
          } else if (mine === "go") {
            setTimeout(() => { abSfx.multUp(); }, 900);
          }
          if (d.next === "end") {
            g.descentEnded = true;
            if (d.swallowed) setTimeout(() => { abSfx.swallow(); setBanner({ ic: "🕳️", t: "התהום בלעה את הקרן", s: `${fmt(d.swallowed!)} נעלמו לתמיד`, cls: "long" }); }, 1400);
            else if (d.potWon) setTimeout(() => setBanner({ ic: "🏆", t: `${pname(d.potWon!.pid)} לקח את הקרן!`, s: `+${fmt(d.potWon!.amount)}`, cls: "long" }), 1200);
          } else if (d.next === "pot") {
            setTimeout(() => setBanner({ ic: "🕳️", t: `${pname(d.potRunner!)} לבד מול הקרן`, s: `${fmt(d.pot)} — אם ישרוד מדף אחד נוסף`, cls: "long" }), 1500);
          }
          break;
        }
        case "ab_caught": {
          g.pstate.set(d.pid, { state: "caught", k: d.k, amt: 0 });
          g.others.delete(d.pid);
          g.pot = d.pot; setHud((h) => ({ ...h, pot: d.pot }));
          if (d.pid !== me) {
            addFeed(d.by ? `🪨 ${pname(d.by)} הפיל את ${pname(d.pid)} · ${fmt(d.lost)} לקרן` : d.why === "lost" ? `📵 ${pname(d.pid)} נעלם — ${fmt(d.lost)} לקרן` : `💀 ${pname(d.pid)} נתפס — ${fmt(d.lost)} לקרן`);
            if (g.spec.target === d.pid) setTimeout(() => { const t = pickTarget(); if (t) switchTarget(t); }, 700);
          }
          break;
        }
        case "ab_shielded": if (d.pid !== me) addFeed(`🛡️ המגן של ${pname(d.pid)} ספג`); break;
        case "ab_throw": {
          g.throws.set(d.id, { id: d.id, by: d.by, target: d.target, kind: d.kind, d: d.d, x: d.x, at: d.at });
          const what = d.kind === "trap" ? "🪨 מלכודת" : d.kind === "shield" ? "🛡️ מגן" : "💎 גבישים";
          if (d.target === me) { abSfx.incoming(); setToast(`${what} מ${pname(d.by)}!`); }
          else addFeed(`${what} מ${pname(d.by)} ל${pname(d.target)}`);
          break;
        }
        case "ab_throwok": g.cdUntil = d.readyAt; break;
        case "ab_throwfail": {
          const why = { cooldown: "עוד רגע — הקולדאון לא נגמר", busy: "יותר מדי דברים עפים עליו — חכו", ledge: "המדף קרוב מדי", target: "הוא כבר לא נופל", falling: "נופלים לא זורקים" }[d.reason];
          setToast(why); break;
        }
        case "ab_bonus": {
          if (d.pid === me) { g.totals[me] = (g.totals[me] ?? 0) + d.amount; setHud((h) => ({ ...h, total: g.totals[me] ?? 0 })); abSfx.bonus(); setToast(d.kind === "hunter" ? `🏹 בונוס צייד +${fmt(d.amount)} — הפלת את ${pname(d.from)}` : d.kind === "gift" ? `🫂 ${pname(d.from)} נתן לך מתנה +${fmt(d.amount)}!` : `🤝 בונוס עזרה +${fmt(d.amount)} — ${pname(d.from)} בנקאי`); }
          else { g.totals[d.pid] = (g.totals[d.pid] ?? 0) + d.amount; addFeed(d.kind === "hunter" ? `🏹 ${pname(d.pid)} +${fmt(d.amount)} על ${pname(d.from)}` : d.kind === "gift" ? `🫂 ${pname(d.from)} העניק ל${pname(d.pid)} +${fmt(d.amount)}` : `🤝 ${pname(d.pid)} +${fmt(d.amount)} מ${pname(d.from)}`); }
          break;
        }
        case "ab_swallow": {
          g.descentEnded = true; g.pot = 0;
          abSfx.swallow(); vibrate(200); g.fx.shake = 14;
          setBanner({ ic: "🕳️", t: "התהום בלעה את הקרן", s: `${pname(d.pid)} נפל עם ${fmt(d.pot)}`, cls: "long" });
          break;
        }
        case "ab_results": {
          g.descentEnded = true; g.totals = d.totals;
          setPhaseBoth("results"); setResults(d); setReveal(null); setLedge(null); setBanner(null); setToast("");
          setHud((h) => ({ ...h, total: d.totals[me] ?? 0 }));
          abWhoosh(false);
          track("ab_descent_end", { players: d.rows.length });
          // מפת הפיר — מציירים מיד כדי שהשיתוף יהיה בלחיצה אחת
          if (g.cfg) {
            const maxK = Math.max(0, ...d.rows.map((r) => r.at));
            const data: ShaftCardData = {
              me, rows: d.rows.map((r) => ({ pid: r.pid, name: pname(r.pid), emoji: pemoji(r.pid), banked: r.banked, at: r.at, caught: r.caught, pot: r.pot, caughtK: r.caught ? r.at : undefined })),
              ledgeDepths: Array.from({ length: maxK + 1 }, (_, k) => abLedgeDepth(g.cfg!, k)), mult: [...AB.MULT],
              potLost: d.potLost, descent: d.d, of: d.of, roomCode: room.code, joinUrl: `${location.origin}/r/${room.code}`,
              groupName: room.group?.name, groupEvening: room.group?.evenings,
            };
            card.current = { data, blob: null }; setCardReady(false);
            drawShaftCard(data).then((cv) => { window.__abCardUrl = cv.toDataURL("image/png"); cv.toBlob((b) => { if (card.current?.data === data) { card.current.blob = b; setCardReady(true); } }, "image/png"); }).catch(() => {});
          }
          break;
        }
        case "ab_draft": setPhaseBoth("draft"); setBanner(null); setDraft({ cards: d.cards, until: performance.now() + d.ms }); break;
        case "ab_draftopen": break;
        case "ab_took": if (d.pid !== me) addFeed(`${d.card.ic} ${pname(d.pid)} בחר ${d.card.t}`); break;
        case "ab_perks": if (d.pid === me) g.mods = abPerkMods(d.perks); break;
        case "ab_sync": {
          applyDescent(d);
          g.k = d.k; g.pot = d.pot; g.potSeg = d.potSeg; g.potRunner = d.potRunner;
          for (const p of d.players) g.pstate.set(p.pid, { state: p.state === "falling" ? "fall" : p.state === "caught" ? "caught" : "stop", k: -1, amt: p.banked });
          for (const p of d.players) if (p.state === "falling" && p.pid !== me) g.others.set(p.pid, { x: p.x, tx: p.x, c: p.c, s: p.s });
          for (const th of d.throws) g.throws.set(th.id, th);
          const T = abDepthAt(d.cfg, d.startAt, conn.serverNow());
          g.prevDepth = T.depth; g.sim.depth = T.depth;
          if (d.you.state === "falling") {
            g.sim.x = d.you.x; g.sim.crystals = d.you.c; g.sim.shield = d.you.s; g.sim.invulnUntil = conn.serverNow() + d.you.invulnMs;
            setMe("falling");
          } else enterSpectator(d.you.state === "caught" ? "caught" : d.you.state === "stopped" ? "stopped" : "spectator");
          const ph: Phase = d.phase === "results" ? "results" : d.phase === "draft" ? "draft" : d.phase === "over" ? "over" : d.phase === "intro" ? "intro" : "fall";
          setPhaseBoth(ph);
          if (d.phase === "ledge" || d.phase === "reveal") { g.ledgeShown = d.k; }
          if (d.phase === "results" || d.phase === "over") g.descentEnded = true;
          setHud((h) => ({ ...h, crystals: g.sim.crystals, shield: g.sim.shield, pot: d.pot, k: d.k, mult: abMult(d.k) }));
          break;
        }
        case "ab_left": g.others.delete(d.pid); addFeed(`🚪 ${pname(d.pid)} יצא`); break;
      }
    });
  }, [hub, me, conn]);

  /* ---- קלט: גרירה יחסית ---- */
  useEffect(() => {
    const g = G.current;
    const inp = g.input;
    const px = (e: TouchEvent | MouseEvent) => ((e as TouchEvent).touches?.[0] ?? (e as MouseEvent)).clientX;
    const down = (e: TouchEvent | MouseEvent) => {
      abAudioInit();
      const el = e.target as HTMLElement;
      if (el?.closest("button,.ab-vote,.ab-draft,.ab-targets,.exit-fab")) return;
      if (!document.fullscreenElement && /Android/i.test(navigator.userAgent)) document.documentElement.requestFullscreen?.().catch(() => {});
      inp.down = true; inp.lastX = px(e);
      if (e.cancelable) e.preventDefault();
    };
    const move = (e: TouchEvent | MouseEvent) => {
      if (!inp.down) return;
      const x = px(e); inp.pendingDx += x - inp.lastX; inp.lastX = x;
      if (e.cancelable) e.preventDefault();
    };
    const up = () => { inp.down = false; };
    const key = (e: KeyboardEvent, on: boolean) => {
      if (e.key === "ArrowLeft" || e.key === "a") inp.key = on ? -1 : 0;
      else if (e.key === "ArrowRight" || e.key === "d") inp.key = on ? 1 : 0;
      else return;
      e.preventDefault();
    };
    const kd = (e: KeyboardEvent) => key(e, true), ku = (e: KeyboardEvent) => key(e, false);
    const vis = () => { if (document.visibilityState === "visible") abAudioResume(); };
    window.addEventListener("touchstart", down, { passive: false });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up); window.addEventListener("touchcancel", up);
    window.addEventListener("mousedown", down); window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("touchstart", down); window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up); window.removeEventListener("touchcancel", up);
      window.removeEventListener("mousedown", down); window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku);
      document.removeEventListener("visibilitychange", vis);
      abWhoosh(false);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  /* ---- הלולאה ---- */
  useEffect(() => {
    const cv0 = cvRef.current; if (!cv0) return;
    const cv: HTMLCanvasElement = cv0;
    const c = cv.getContext("2d", { alpha: false })!;
    const g = G.current;
    let raf = 0, last = 0, W = 0, H = 0, DPR = 1, frames = 0;
    const resize = () => {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth || window.innerWidth; H = cv.clientHeight || window.innerHeight;
      cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
    };
    resize();
    window.addEventListener("resize", resize);
    window.__abFrames = 0;

    function enterLedge(k: number) {
      g.k = k; g.ledgeShown = k; setPhaseBoth("ledge");
      abWhoosh(false);
      const cfg = g.cfg!;
      const voteUntil = abFreezeAt(cfg, g.startAt, k) + cfg.voteMs;
      setLedge({ k, mult: abMult(k), nextMult: abMult(k + 1), voteUntil, myVote: null, locked: false, n: 0, of: g.others.size + (g.meState === "falling" ? 1 : 0), potSeg: g.potSeg });
      g.voteLockSaid = false;
      g.fx.squash = 1; g.fx.dust = 1; g.fx.shake = Math.max(g.fx.shake, 6);
      abSfx.land(); vibrate(25);
      setHud((h) => ({ ...h, k, mult: abMult(k) }));
      if (g.meState === "falling") track("ab_ledge", { k });
    }
    function resume(k: number) {
      g.k = k; setPhaseBoth("fall"); setLedge(null); setReveal(null);
      g.fx.trail.length = 0;
      if (g.meState === "falling") { abWhoosh(true, Math.min(1, (abSegSpeed(k) - AB.V0) / (AB.V0 * 1.05))); }
      setHud((h) => ({ ...h, k, mult: abMult(k) }));
    }
    function caughtMe(o?: number, th?: number) {
      const s = g.sim; s.alive = false;
      conn.sendGame({ a: "ab_caught", o, th });
      g.fx.stop = 0.25; g.fx.shake = 24; g.fx.flash = 1; g.fx.flashCol = RED;
      abSfx.caught(); vibrate(400); abWhoosh(false);
      g.pstate.set(me, { state: "caught", k: g.k, amt: 0 });
      track("ab_caught", { k: g.k });
      setToast(`💀 נתפסת! ${fmt(s.crystals)} גבישים הלכו לקרן`);
      s.crystals = 0;
      setTimeout(() => enterSpectator("caught"), 1200);
    }

    function frame(ts: number) {
      raf = requestAnimationFrame(frame);
      try {
        if (!last) last = ts;
        const wantW = cv.clientWidth || window.innerWidth, wantH = cv.clientHeight || window.innerHeight;
        if (wantW && wantH && (Math.abs(wantW - W) > 1 || Math.abs(wantH - H) > 1)) resize();
        let dt = Math.min(0.05, (ts - last) / 1000); last = ts;
        const realDt = dt;
        if (g.fx.stop > 0) { g.fx.stop -= realDt; dt *= 0.06; }
        c.setTransform(DPR, 0, 0, DPR, 0, 0);
        frames++; window.__abFrames = frames;

        const v = makeView(W, H, g.mods.py);
        const cfg = g.cfg;
        if (!cfg || !g.world) { c.fillStyle = "#12100E"; c.fillRect(0, 0, W, H); return; }
        const now = conn.serverNow();
        const T = abDepthAt(cfg, g.startAt, now);
        const kf = T.k + T.segFrac;

        /* מעברי פאזה מציר הזמן */
        if (g.phase === "intro" && now >= g.startAt) { setPhaseBoth("fall"); if (g.meState === "falling") abWhoosh(true, 0); }
        if (g.phase === "fall" && !T.falling && !g.descentEnded && g.ledgeShown < T.k) enterLedge(T.k);
        if ((g.phase === "ledge" || g.phase === "reveal") && T.falling && T.k > g.k && !g.descentEnded) resume(T.k);
        if (g.phase === "ledge" && !g.voteLockSaid && now > abFreezeAt(cfg, g.startAt, g.k) + cfg.voteMs) {
          g.voteLockSaid = true; setLedge((l) => (l ? { ...l, locked: true } : l)); abSfx.sealed();
        }

        const falling = g.meState === "falling" && g.phase === "fall" && T.falling && g.sim.alive;
        const s = g.sim;
        /* קלט + סימולציה */
        if (g.meState === "falling" && s.alive) {
          const inp = g.input;
          let dx = (inp.pendingDx * AB.DRAG_GAIN * g.mods.xGain) / v.ppu; inp.pendingDx = 0;
          if (inp.key) dx += inp.key * 140 * realDt;
          if (window.__abAuto) { const tx = abBotX(g.world, s.depth, T.tauMs, s.x); dx = Math.max(-AB.X_VMAX * 0.9 * realDt, Math.min(AB.X_VMAX * 0.9 * realDt, tx - s.x)); }
          const lim = AB.X_VMAX * g.mods.xGain * realDt;
          dx = Math.max(-lim, Math.min(lim, dx));
          const nx = Math.max(AB.PLAYER_R, Math.min(AB.W - AB.PLAYER_R, s.x + dx));
          g.fx.trail.push({ x: sx(v, s.x), y: v.py });
          s.x = nx;
          if (T.falling && g.phase === "fall") {
            const gap = g.lastSimAt ? now - g.lastSimAt : 0;
            g.lastSimAt = now;
            if (gap > AB.STALL_SKIP_MS || g.prevDepth === 0 && T.depth > 60) { s.depth = T.depth; g.prevDepth = T.depth; }
            else {
              const mine = [...g.throws.values()].filter((th) => th.target === me && !s.taken.has(th.id));
              const out = abAdvance(g.world, s, g.prevDepth, T.depth, T.tauMs, mine, g.mods, now);
              g.prevDepth = T.depth;
              for (const cr of out.crystals) {
                const gem = cr.v >= AB.GEM_VAL;
                if (gem) abSfx.gem(); else abSfx.crystal();
                burst(g.fx.parts, sx(v, cr.x), v.py, gem ? GOLD : CYAN, gem ? 14 : 7, 160, 2.5);
                g.fx.pops.push({ x: sx(v, cr.x), y: v.py - 14, t: `+${Math.round(cr.v * g.mods.valueMul * (gem ? g.mods.gemMul : 1))}`, col: gem ? GOLD : CYAN, l: 0.8, sz: gem ? 18 : 14 });
              }
              if (out.shieldTaken) { conn.sendGame({ a: "ab_took", th: out.shieldTaken.id }); abSfx.shieldTaken(); g.fx.flash = 0.5; g.fx.flashCol = CYAN; setToast(`🛡️ מגן מ${pname(out.shieldTaken.by)}!`); }
              if (out.burstTaken) { conn.sendGame({ a: "ab_took", th: out.burstTaken.id }); setToast(`💎 גבישים מ${pname(out.burstTaken.by)}!`); }
              // 🧤 כפפת אבן — המלכודת נתפסה ביד והפכה לגבישים
              if (out.trapCaught) {
                conn.sendGame({ a: "ab_took", th: out.trapCaught.id });
                abSfx.shieldPop(); vibrate(50); g.fx.flash = 0.5; g.fx.flashCol = GOLD; g.fx.stop = 0.06;
                burst(g.fx.parts, sx(v, s.x), v.py, GOLD, 14, 200, 3);
                setToast(`🧤 תפסת את הסלע של ${pname(out.trapCaught.by)} — ‎+15!`);
              }
              // 👁️ עין הנץ — כמעט-פגיעה שווה גבישים
              if (out.nearBonus) {
                g.fx.pops.push({ x: sx(v, s.x) + 22, y: v.py - 20, t: `+${out.nearBonus} 👁️`, col: GOLD, l: 0.8, sz: 15 });
              }
              if (out.hit) {
                if (s.shield > 0) {
                  s.shield--; s.invulnUntil = now + 800;
                  conn.sendGame({ a: "ab_shielded", o: out.hit.o?.id, th: out.hit.th?.id });
                  abSfx.shieldPop(); vibrate(60); g.fx.flash = 0.7; g.fx.flashCol = "#fff"; g.fx.shake = 10; g.fx.stop = 0.08;
                  burst(g.fx.parts, sx(v, s.x), v.py, CYAN, 16, 220, 3);
                  setToast("🛡️ המגן ספג!");
                } else caughtMe(out.hit.o?.id, out.hit.th?.id);
              } else if (out.nearMiss && ts - g.fx.near > 350) {
                g.fx.near = ts; abSfx.nearMiss(); g.fx.stop = Math.max(g.fx.stop, 0.05);
              }
            }
          } else { s.depth = T.depth; g.prevDepth = T.depth; g.lastSimAt = now; }
          if (falling && now - g.lastReport >= REPORT_MS) {
            g.lastReport = now;
            conn.sendGame({ a: "ab_state", x: Math.round(s.x * 10) / 10, d: Math.round(s.depth), c: s.crystals, s: s.shield });
          }
          if (falling) abWhoosh(true, Math.min(1, (abSegSpeed(T.k) - AB.V0) / (AB.V0 * 1.05)));
        }
        if (g.fx.trail.length > 14) g.fx.trail.splice(0, g.fx.trail.length - 14);

        /* רוחות + מטרה */
        for (const o of g.others.values()) o.x += (o.tx - o.x) * Math.min(1, dt * 12);
        if (g.spec.target) { const o = g.others.get(g.spec.target); if (o) { g.spec.x += (o.x - g.spec.x) * Math.min(1, dt * 12); } }

        /* HUD (מוגבל ל-10Hz) */
        if (ts - g.hudAt > 100) {
          g.hudAt = ts;
          const frac = T.falling ? T.segFrac : 1;
          setHud((h) => (h.crystals === s.crystals && h.shield === s.shield && Math.abs(h.frac - frac) < 0.01 ? h : { ...h, crystals: s.crystals, shield: s.shield, frac }));
          if (cdRef.current) {
            const left = Math.max(0, g.cdUntil - now);
            const cd = left > 0 ? Math.min(1, left / AB.THROW_CD_MS) : 0;
            cdRef.current.style.setProperty("--cd", `${Math.round(cd * 360)}deg`);
            cdRef.current.dataset.ready = left > 0 ? "0" : "1";
          }
        }

        /* ---- ציור ---- */
        const depth = T.depth;
        g.fx.shake = Math.max(0, g.fx.shake - realDt * 40);
        const shx = (Math.random() - 0.5) * g.fx.shake, shy = (Math.random() - 0.5) * g.fx.shake;
        drawBackdrop(c, v, kf, DPR, depth);
        c.save(); c.translate(shx, shy);
        drawWalls(c, v, g.seed, depth, kf, g.reduced);
        const top = visTop(v, depth), bottom = visBottom(v, depth);
        // מדפים בטווח
        for (let kk = Math.max(0, T.k - 1); kk <= T.k + 1; kk++) {
          const ld = abLedgeDepth(cfg, kk);
          if (ld > top - 30 && ld < bottom + 30) drawLedge(c, v, depth, ld, kf, kk + 1 >= cfg.maxLedges ? "הקרקעית" : `מדף ${kk + 1} · ×${abMult(kk)}`, kk + 1 >= cfg.maxLedges);
        }
        // מכשולים וגבישים
        const time = ts / 1000;
        const viewer = g.meState === "falling" ? me : g.spec.target;
        for (let kk = Math.max(0, T.k - 1); kk <= T.k + 1; kk++) {
          const seg = g.world.seg(kk);
          if (seg.d0 > bottom + 40 || seg.d1 < top - 40) continue;
          for (const o of seg.obs) if (o.d > top - 40 && o.d < bottom + 40) drawObstacle(c, v, o, depth, T.tauMs / 1000, time, DPR);
          for (const cr of seg.cry) {
            if (cr.d < top - 10 || cr.d > bottom + 10) continue;
            if (viewer === me && s.got.has(cr.id)) continue;
            drawCrystal(c, v, cr, depth, time, DPR);
          }
        }
        // חפצים זרוקים למי שרואים
        for (const th of [...g.throws.values()]) {
          if (th.d < depth - 60) { g.throws.delete(th.id); continue; }
          if (th.target !== viewer) continue;
          if (viewer === me && s.taken.has(th.id)) continue;
          drawThrow(c, v, th, depth, time, DPR, pemoji(th.by), now - th.at > 250);
        }
        // רוחות
        for (const [pid, o] of g.others) {
          if (pid === me || pid === viewer) continue;
          drawAvatar(c, sx(v, o.x), v.py, AB.PLAYER_R * v.ppu * 0.85, pemoji(pid), pcol(pid), 0.38, 0, 0, pname(pid));
        }
        // אני / המטרה
        const r = AB.PLAYER_R * v.ppu;
        if (g.meState === "falling") {
          if (s.alive) {
            drawTrail(c, g.fx.trail, pcol(me), r);
            const lean = Math.max(-1, Math.min(1, (g.fx.trail.length ? (sx(v, s.x) - g.fx.trail[g.fx.trail.length - 1].x) / 6 : 0)));
            const sq = g.fx.squash > 0 ? 1 - 0.25 * g.fx.squash : 1;
            c.save(); c.translate(sx(v, s.x), v.py); c.scale(1 / sq, sq); c.translate(-sx(v, s.x), -v.py);
            drawAvatar(c, sx(v, s.x), v.py, r, pemoji(me), pcol(me), now < s.invulnUntil ? 0.55 + 0.45 * Math.abs(Math.sin(ts / 60)) : 1, s.shield, T.falling ? lean : 0);
            c.restore();
          }
        } else if (viewer) {
          const o = g.others.get(viewer);
          drawAvatar(c, sx(v, g.spec.x), v.py, r, pemoji(viewer), pcol(viewer), 1, o?.s ?? 0, 0, pname(viewer));
        }
        g.fx.squash = Math.max(0, g.fx.squash - realDt * 4);
        if (g.fx.dust > 0) { g.fx.dust -= realDt * 3; if (g.fx.dust > 0.9) burst(g.fx.parts, sx(v, g.meState === "falling" ? s.x : g.spec.x), v.py + r, "rgba(220,200,170,.8)", 6, 90, 3); }
        drawParticles(c, g.fx.parts, realDt);
        // פופים
        for (let i = g.fx.pops.length - 1; i >= 0; i--) {
          const p = g.fx.pops[i]; p.l -= realDt; p.y -= realDt * 40;
          if (p.l <= 0) { g.fx.pops.splice(i, 1); continue; }
          c.globalAlpha = Math.min(1, p.l * 2); c.font = `700 ${p.sz}px "Suez One", Assistant, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
          c.lineWidth = 3; c.strokeStyle = "#0C0906"; c.strokeText(p.t, p.x, p.y); c.fillStyle = p.col; c.fillText(p.t, p.x, p.y);
        }
        c.globalAlpha = 1;
        c.restore();
        if (!g.reduced) drawSpeedLines(c, v, T.falling ? Math.max(0, (T.k - 2) / 5) : 0, time);
        if (g.fx.flash > 0) { c.globalAlpha = Math.min(0.55, g.fx.flash * 0.6); c.fillStyle = g.fx.flashCol; c.fillRect(0, 0, W, H); c.globalAlpha = 1; g.fx.flash -= realDt * 3; }
        // חסימת מבט לצופה בלי מטרה
        if (g.meState !== "falling" && !viewer && g.phase === "fall") {
          c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(0, 0, W, H);
          c.font = "700 16px Assistant, sans-serif"; c.fillStyle = PAPER; c.textAlign = "center"; c.direction = "rtl"; c.fillText("אין כבר מי שנופל…", W / 2, H / 2);
        }
        if (frames % 6 === 0) {
          window.__abDbg = { phase: g.phase, me: g.meState, k: T.k, depth: Math.round(depth), x: Math.round(s.x * 10) / 10, crystals: s.crystals, shield: s.shield, alive: s.alive, fallers: [...g.others.keys()], pot: g.pot, target: g.spec.target, frames, W, H };
        }
      } catch (e) {
        window.__abErr = String(e);
      }
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); abWhoosh(false); };
  }, [me, conn]);

  /* ---- DOM ---- */
  const potChip = `🕳️ קרן ${fmt(hud.pot)} · מדף ${hud.k + 1} · ×${hud.mult}`;
  const isSpec = meState !== "falling";
  const showVote = phase === "ledge" && !isSpec && ledge;
  const cardBoard = results;
  const orderPlayers = room.players.filter((p) => G.current.pstate.has(p.id) || (reveal && p.id in reveal.votes));

  return (
    <div className={"ab-wrap" + (isSpec ? " spec" : "")} style={{ "--gc": "#38C8E8" } as CSSProperties}>
      <canvas ref={cvRef} className="ab-cv" />
      {flash > 0 && <div className="ab-flash" key={flash} />}

      {/* HUD */}
      {(phase === "fall" || phase === "ledge" || phase === "reveal" || phase === "intro") && (
        <>
          <div className="ab-bar"><div className="ab-barfill" style={{ width: `${Math.round(hud.frac * 100)}%` }} /></div>
          <div className="ab-top">
            <div className="ab-pot">{potChip}</div>
          </div>
          {!isSpec && (
            <div className="ab-mine">
              <b>💠 {fmt(hud.crystals)}</b>
              {hud.shield > 0 && <span>🛡️{hud.shield > 1 ? "×2" : ""}</span>}
              <small>סה"כ {fmt(hud.total)}</small>
            </div>
          )}
          {spec.fallers.length > 0 && !isSpec && (
            <div className="ab-strip">
              {spec.fallers.slice(0, 7).map((f) => <span key={f.pid} className="ab-chip" style={{ "--pc": pcol(f.pid) } as CSSProperties}>{pemoji(f.pid)} {fmt(f.c)}</span>)}
            </div>
          )}
        </>
      )}

      {/* ספירה */}
      {count && <div className="ab-count" key={count}>{count}</div>}

      {/* הצבעה */}
      {showVote && ledge && (
        <div className={"ab-vote" + (ledge.locked ? " locked" : "")}>
          <div className="ab-votehead">
            <div className="ring"><VoteRing until={ledge.voteUntil} conn={conn} /></div>
            <div className="txt">{ledge.potSeg ? "מדף הקרן — שרדת!" : ledge.locked ? "נחתם…" : "עוצרים או ממשיכים?"}</div>
            <div className="sub">{ledge.n}/{ledge.of} הצביעו</div>
          </div>
          <div className="ab-slabs">
            <button className={"ab-slab stop" + (ledge.myVote === "stop" ? " sel" : "")} onClick={() => vote("stop")} disabled={ledge.locked}>
              <span className="ic">⬆️</span><b>עוצר</b><small>לוקח ×{ledge.mult} = {fmt(hud.crystals * ledge.mult)}</small>
            </button>
            <button className={"ab-slab go" + (ledge.myVote === "go" ? " sel" : "")} onClick={() => vote("go")} disabled={ledge.locked}>
              <span className="ic">⬇️</span><b>ממשיך</b><small>במדף הבא ×{ledge.nextMult}</small>
            </button>
          </div>
        </div>
      )}
      {phase === "ledge" && isSpec && ledge && (
        <div className="ab-specledge">🪨 המדף! {ledge.n}/{ledge.of} הצביעו…</div>
      )}

      {/* חשיפה */}
      {reveal && phase === "reveal" && (
        <div className="ab-reveal">
          <div className="ab-revhead">{reveal.next === "pot" ? "🕳️ נשאר אחד" : reveal.next === "end" ? "הצניחה נגמרה" : `מדף ${reveal.k + 1}`}</div>
          <div className="ab-grid">
            {orderPlayers.map((p, i) => {
              const v = reveal.votes[p.id];
              const ps = G.current.pstate.get(p.id);
              const fresh = v !== undefined;
              const kind = v ?? (ps?.state === "caught" ? "caught" : ps?.state === "pot" ? "pot" : ps?.state === "stop" ? "stop" : "go");
              const amt = reveal.banked[p.id] ?? 0;
              return (
                <div key={p.id} className={"ab-card" + (fresh ? " flip" : " old")} style={{ animationDelay: `${i * 120}ms`, "--pc": pcol(p.id) } as CSSProperties}>
                  <div className="face front"><span className="e">{p.emoji}</span><span className="n">{p.name}</span></div>
                  <div className={"face back " + kind}>
                    <span className="who">{p.emoji} {p.name}</span>
                    <span className="e">{kind === "stop" ? "⬆️" : kind === "go" ? "⬇️" : kind === "pot" ? "🏆" : "💀"}</span>
                    <span className="n">{kind === "stop" ? (fresh ? `+${fmt(amt)}` : `עצר במדף ${(ps?.k ?? 0) + 1}`) : kind === "go" ? "ממשיך" : kind === "pot" ? `+${fmt(reveal.potWon?.amount ?? amt)}` : "נתפס"}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <PotLine reveal={reveal} fmt={fmt} />
        </div>
      )}

      {/* צופה */}
      {isSpec && (phase === "fall" || phase === "ledge" || phase === "reveal") && (
        <div className="ab-targets">
          <span className="lbl">🎥 צופה ב:</span>
          {spec.fallers.map((f) => (
            <button key={f.pid} className={"tchip" + (spec.target === f.pid ? " on" : "")} style={{ "--pc": pcol(f.pid) } as CSSProperties} onClick={() => switchTarget(f.pid)}>
              {pemoji(f.pid)} {pname(f.pid)} <b>{fmt(f.c)}</b>{f.s > 0 && "🛡️"}
            </button>
          ))}
          {spec.fallers.length === 0 && <span className="lbl">אף אחד לא נופל עכשיו</span>}
        </div>
      )}
      {isSpec && (phase === "fall" || phase === "ledge" || phase === "reveal") && (
        <div className="ab-spec">
          <div className="status">{spec.status}</div>
          <div className="throws" ref={cdRef}>
            <button className="ab-throw trap" onClick={() => doThrow("trap")} disabled={!spec.target || phase !== "fall"}><span>🪨</span>מלכודת</button>
            <button className="ab-throw help" onClick={() => doThrow("help")} disabled={!spec.target || phase !== "fall"}><span>💎</span>עזרה</button>
          </div>
        </div>
      )}

      {/* תוצאות צניחה */}
      {phase === "results" && cardBoard && (
        <div className="ab-results">
          <h2>🕳️ {cardBoard.of > 1 ? `סיכום צניחה ${cardBoard.d + 1}/${cardBoard.of}` : "סיכום הצניחה"}</h2>
          {cardBoard.potLost > 0 && <div className="lost">התהום בלעה {fmt(cardBoard.potLost)}</div>}
          <div className="rows">
            {[...cardBoard.rows].sort((a, b) => (cardBoard.totals[b.pid] ?? 0) - (cardBoard.totals[a.pid] ?? 0)).map((r) => (
              <div key={r.pid} className={"row" + (r.pid === me ? " me" : "")} style={{ "--pc": pcol(r.pid) } as CSSProperties}>
                <span className="e">{pemoji(r.pid)}</span>
                <span className="n">{pname(r.pid)}</span>
                <span className="w">{r.pot > 0 ? "🏆" : r.caught ? "💀" : r.at >= 0 ? `⬆️ מדף ${r.at + 1}` : "—"}</span>
                <span className="b">+{fmt(r.banked)}</span>
                <b className="t">{fmt(cardBoard.totals[r.pid] ?? 0)}</b>
              </div>
            ))}
          </div>
          <button className="ab-share" disabled={!cardReady} onClick={async () => { if (!card.current) return; abAudioInit(); const r = await shareShaftCard(card.current.data, card.current.blob); if (r !== "failed") track("ab_shaft_shared"); setToast(r === "shared" ? "📸 מפת הפיר נשלחה" : r === "downloaded" ? "📸 מפת הפיר נשמרה" : ""); }}>
            📸 שתפו את מפת הפיר
          </button>
          {cardBoard.d + 1 < cardBoard.of && <div className="next">הדראפט עוד רגע…</div>}
        </div>
      )}

      {/* דראפט */}
      {phase === "draft" && draft && (
        <div className="ab-draft">
          <div className="card">
            <h2>🎁 בוחרים קלף לצניחה הבאה</h2>
            <DraftBar until={draft.until} />
            {draft.cards.map((cd) => (
              <button key={cd.id} className={"ab-pick" + (draft.picked === cd.id ? " sel" : "")} disabled={!!draft.picked} onClick={() => { abAudioInit(); abSfx.pick(); conn.sendGame({ a: "ab_pick", card: cd.id }); setDraft((d) => (d ? { ...d, picked: cd.id } : d)); }}>
                {/* 🎨 אמנות הקלף (Higgsfield); אם הקובץ חסר — האימוג'י חוזר */}
                <span className="ic">
                  <img className="ab-cardart" src={cardArt(cd.id)} alt="" loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).parentElement!.classList.add("noart"); }} />
                  <span className="emo">{cd.ic}</span>
                </span>
                <span className="tx"><b>{cd.t}</b><span>{cd.d}</span></span>
              </button>
            ))}
            {draft.picked && <div className="wait">מחכים לשאר…</div>}
          </div>
        </div>
      )}

      {toast && <div className="ab-toast">{toast}</div>}
      {feed.length > 0 && (phase === "fall" || phase === "ledge" || phase === "reveal") && (
        <div className="ab-feed">{feed.map((f) => <div key={f.id}>{f.tx}</div>)}</div>
      )}
      {banner && (
        <div className="ab-banner"><div className={"in" + (banner.cls ? " " + banner.cls : "")}>
          <div className="ic">{banner.ic}</div><div className="ti">{banner.t}</div><div className="su">{banner.s}</div>
        </div></div>
      )}
    </div>
  );
}

/** טבעת הספירה של חלון ההצבעה — מתעדכנת מזמן השרת */
function VoteRing({ until, conn }: { until: number; conn: GameViewProps["conn"] }) {
  const [left, setLeft] = useState(3);
  useEffect(() => {
    const iv = setInterval(() => setLeft(Math.max(0, (until - conn.serverNow()) / 1000)), 50);
    return () => clearInterval(iv);
  }, [until, conn]);
  const secs = Math.ceil(left);
  return <div className="vr" style={{ "--p": `${Math.min(1, left / 3) * 360}deg` } as CSSProperties}><span>{secs > 0 ? secs : "!"}</span></div>;
}

function DraftBar({ until }: { until: number }) {
  const [w, setW] = useState(100);
  useEffect(() => {
    const total = Math.max(1, until - performance.now());
    const iv = setInterval(() => setW(Math.max(0, ((until - performance.now()) / total) * 100)), 100);
    return () => clearInterval(iv);
  }, [until]);
  return <div className="ab-dbar"><div style={{ width: `${w}%` }} /></div>;
}

/** שורת הקרן בחשיפה — סופרת למעלה */
function PotLine({ reveal, fmt }: { reveal: RevealMsg; fmt: (n: number) => string }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const target = reveal.swallowed ?? reveal.pot;
    const t0 = performance.now(), dur = 700;
    let raf = 0, lastTick = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * e));
      if (t - lastTick > 60 && p < 1) { lastTick = t; abSfx.potTick(); }
      if (p < 1) raf = requestAnimationFrame(step);
    };
    const start = setTimeout(() => { raf = requestAnimationFrame(step); }, 900);
    return () => { clearTimeout(start); cancelAnimationFrame(raf); };
  }, [reveal]);
  if (reveal.potWon) return <div className="ab-potline win">🏆 {fmt(reveal.potWon.amount)} — הקרן נלקחה</div>;
  if (reveal.swallowed) return <div className="ab-potline lost">🕳️ התהום בלעה {fmt(val)}</div>;
  return <div className="ab-potline">🕳️ הקרן: <b>{fmt(val)}</b>{reveal.next === "pot" && " — למי שישרוד מדף אחד נוסף"}</div>;
}

