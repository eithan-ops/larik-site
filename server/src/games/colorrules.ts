/**
 * "חוקי הצבע" — רפלקס מסונכרן.
 */
import type { GameCtx, GameInstance } from "../engine";
import type { ColorRulesClientMsg, GameClientMsg, LText } from "../../../shared/protocol";

interface Config { speed?: "normal" | "fast" }

/** הטקסט בלקוח: colorrules.rule.<id> */
const RULES: { color: string; label: LText; mustTap: boolean }[] = [
  { color: "#34e89e", label: { k: "colorrules.rule.green" }, mustTap: true },
  { color: "#5c8aff", label: { k: "colorrules.rule.blue" }, mustTap: true },
  { color: "#ffce3c", label: { k: "colorrules.rule.yellow" }, mustTap: true },
  { color: "#ff4d9d", label: { k: "colorrules.rule.pink" }, mustTap: true },
  { color: "#b26bff", label: { k: "colorrules.rule.purple" }, mustTap: true },
  { color: "#f4f6ff", label: { k: "colorrules.rule.white_freeze" }, mustTap: false },
  { color: "#f4f6ff", label: { k: "colorrules.rule.white_quiet" }, mustTap: false },
];

export function createColorRules(ctx: GameCtx): GameInstance {
  const fast = ((ctx.config ?? {}) as Config).speed === "fast";
  const lives: Record<string, number> = {};
  for (const p of ctx.connectedPlayers()) lives[p.id] = 3;
  let alive = ctx.connectedPlayers().map((p) => p.id);
  let roundId = 0;
  let windowMs = fast ? 2200 : 3000;
  const minWindow = fast ? 900 : 1300;
  let current: { id: number; mustTap: boolean; deadline: number } | null = null;
  const tapped = new Set<string>();
  let over = false;

  function scheduleNext(delay: number) { ctx.timer(delay, flash); }

  function flash() {
    if (over) return;
    if (alive.length <= 1) return finish();
    const rule = RULES[Math.floor(Math.random() * RULES.length)];
    roundId += 1;
    tapped.clear();
    const at = ctx.now() + 500;
    const until = at + windowMs;
    current = { id: roundId, mustTap: rule.mustTap, deadline: until };
    ctx.broadcast({ a: "cr_flash", roundId, color: rule.color, label: rule.label, mustTap: rule.mustTap, at, until });
    ctx.timer(until - ctx.now(), () => resolve(roundId));
  }

  function resolve(id: number) {
    if (over || !current || current.id !== id) return;
    const out: string[] = [];
    for (const pid of [...alive]) {
      const didTap = tapped.has(pid);
      const correct = current.mustTap ? didTap : !didTap;
      if (!correct) {
        lives[pid] = (lives[pid] ?? 1) - 1;
        ctx.broadcast({ a: "cr_lives", pid, lives: Math.max(0, lives[pid]) });
        if (lives[pid] <= 0) out.push(pid);
      }
    }
    alive = alive.filter((p) => !out.includes(p));
    current = null;
    ctx.broadcast({ a: "cr_resolve", roundId: id, out, alive: [...alive] });
    if (alive.length <= 1) return finish();
    windowMs = Math.max(minWindow, windowMs * 0.94);
    scheduleNext(1500);
  }

  function finish() {
    if (over) return;
    over = true;
    const winner = alive[0];
    const scores: Record<string, number> = {};
    for (const p of ctx.connectedPlayers()) scores[p.id] = Math.max(0, lives[p.id] ?? 0);
    const loser = ctx.connectedPlayers().map((p) => p.id).sort((a, b) => (lives[a] ?? 0) - (lives[b] ?? 0))[0];
    ctx.end({ title: { k: "colorrules.end.title" }, winnerId: winner, loserId: loser !== winner ? loser : undefined, scores });
  }

  return {
    onStart() { ctx.broadcast({ a: "cr_begin", lives: 3 }); scheduleNext(2600); },
    onMessage(pid: string, d: GameClientMsg) {
      const m = d as ColorRulesClientMsg;
      if (m.a === "cr_tap" && current && m.roundId === current.id && alive.includes(pid)) tapped.add(pid);
    },
    onRejoin(pid: string) {
      ctx.sendTo(pid, { a: "cr_begin", lives: 3 });
      ctx.sendTo(pid, { a: "cr_lives", pid, lives: Math.max(0, lives[pid] ?? 0) });
    },
    onLeave(pid: string, permanent?: boolean) {
      // ניתוק רגעי: נשאר במשחק ומאבד חיים טבעית עד שיחזור; עזיבה אמיתית: יוצא מיד
      if (!permanent) return;
      alive = alive.filter((p) => p !== pid);
      if (!over && alive.length <= 1) finish();
    },
    dispose() { over = true; },
  };
}
