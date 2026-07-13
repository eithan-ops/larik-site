/**
 * "פודים" — לוגיקת השרת (בהשראת BlazePod)
 * הטלפונים מפוזרים כפודים של אור. שני מצבים:
 *  - king: מלך המהירות — כל שחקן בתורו, 30 שניות, כמה פודים חטף + זמן תגובה ממוצע.
 *  - survival: לכל שחקן צבע; הצבע שלך נדלק — יש לך חלון מתכווץ לגעת, אחרת נפסלת.
 *
 * הגינות תזמון: הלקוח שולח את זמן הנגיעה במונחי שעון-שרת (atServer),
 * וה-reaction נמדד מול זמן ההדלקה המתוזמן (cue at) — הרשת לא משנה את המדידה.
 */
import type { GameCtx, GameInstance } from "../engine";
import type { PodsClientMsg, GameClientMsg } from "../../../shared/protocol";

const KING_RUN_MS = 30_000;
const PLAYER_COLORS = ["#00E676", "#b26bff", "#ff4d9d", "#ffce3c", "#5c8aff", "#2dd4bf", "#ff9d5c", "#f4f6ff"];

interface Config { mode?: "king" | "survival" }

export function createPods(ctx: GameCtx): GameInstance {
  const mode = ((ctx.config ?? {}) as Config).mode === "survival" ? "survival" : "king";
  const players = ctx.connectedPlayers().map((p) => p.id);

  let lightSeq = 0;
  let activeLight: { id: number; podId: string; at: number; color: string; forPid?: string } | null = null;
  const scores: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  const reactions: Record<string, number[]> = Object.fromEntries(players.map((p) => [p, []]));
  let disposed = false;

  /* ---------- מלך המהירות ---------- */
  let runnerIdx = -1;
  let runEndsAt = 0;

  function nextRunner() {
    if (disposed) return;
    runnerIdx += 1;
    if (runnerIdx >= players.length) return finishKing();
    const pid = players[runnerIdx];
    runEndsAt = ctx.now() + KING_RUN_MS + 3000; // כולל ספירת פתיחה
    ctx.broadcast({ a: "pd_runner", pid, until: runEndsAt });
    ctx.timer(3000, () => lightRandomPod(pid));
    ctx.timer(KING_RUN_MS + 3000, () => {
      turnOffActive();
      ctx.broadcast({ a: "pd_score", scores: { ...scores }, avgMs: avgReactions() });
      ctx.timer(1500, nextRunner);
    });
  }

  function lightRandomPod(forPid: string) {
    if (disposed || ctx.now() >= runEndsAt) return;
    const pods = ctx.connectedPlayers().map((p) => p.id);
    const podId = pods[Math.floor(Math.random() * pods.length)];
    const id = ++lightSeq;
    const at = ctx.cue(400, { a: "pd_light", lightId: id, podId, color: "#00E676", at: 0 } as never);
    // הזמן האמיתי נקבע ע"י cue — נעדכן את הרשומה המקומית
    activeLight = { id, podId, at, color: "#00E676", forPid };
  }

  function finishKing() {
    const avg = avgReactions();
    const ranked = players
      .filter((p) => scores[p] > 0)
      .sort((a, b) => scores[b] - scores[a] || (avg[a] ?? 9e9) - (avg[b] ?? 9e9));
    const winner = ranked[0];
    const loser = [...players].sort((a, b) => scores[a] - scores[b])[0];
    ctx.end({ title: "פודים ⚡ מלך המהירות", winnerId: winner, loserId: loser, scores });
  }

  /* ---------- הישרדות ---------- */
  const colorOf: Record<string, string> = {};
  let alive = [...players];
  let windowMs = 3000;

  function survivalRound() {
    if (disposed) return;
    if (alive.length <= 1) {
      const winner = alive[0];
      const loser = players.find((p) => p !== winner && scores[p] === Math.min(...players.filter(x => x !== winner).map((x) => scores[x])));
      return ctx.end({ title: "פודים 💀 הישרדות", winnerId: winner, loserId: loser ?? undefined, scores });
    }
    const target = alive[Math.floor(Math.random() * alive.length)];
    const pods = ctx.connectedPlayers().map((p) => p.id);
    const podId = pods[Math.floor(Math.random() * pods.length)];
    const id = ++lightSeq;
    const at = ctx.cue(600, { a: "pd_light", lightId: id, podId, color: colorOf[target], at: 0 } as never);
    activeLight = { id, podId, at, color: colorOf[target], forPid: target };
    const thisWindow = windowMs;
    ctx.timer(600 + thisWindow, () => {
      if (activeLight?.id === id) {
        // לא נגע בזמן — הדחה
        turnOffActive();
        alive = alive.filter((p) => p !== target);
        ctx.broadcast({ a: "pd_miss", lightId: id, pid: target });
        ctx.broadcast({ a: "pd_eliminated", pid: target });
        ctx.timer(1800, survivalRound);
      }
    });
    windowMs = Math.max(1100, windowMs * 0.93); // הקצב מואץ
  }

  /* ---------- משותף ---------- */

  function turnOffActive() {
    if (activeLight) {
      ctx.broadcast({ a: "pd_off", lightId: activeLight.id });
      activeLight = null;
    }
  }

  function avgReactions(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [pid, arr] of Object.entries(reactions)) {
      if (arr.length) out[pid] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    }
    return out;
  }

  function handleTap(fromPod: string, m: PodsClientMsg & { a: "pd_tap" }) {
    if (!activeLight || m.lightId !== activeLight.id) return;
    if (fromPod !== activeLight.podId) return; // נגיעה בפוד לא נכון — מתעלמים
    const reaction = Math.max(0, m.atServer - activeLight.at);
    const credit = mode === "king" ? players[runnerIdx] : activeLight.forPid!;
    turnOffActive();
    scores[credit] = (scores[credit] ?? 0) + 1;
    reactions[credit]?.push(reaction);
    ctx.broadcast({ a: "pd_hit", lightId: m.lightId, pid: credit, reactionMs: reaction });
    if (mode === "king") {
      ctx.timer(250, () => lightRandomPod(credit));
    } else {
      ctx.timer(900, survivalRound);
    }
  }

  return {
    onStart() {
      if (mode === "survival") {
        alive.forEach((pid, i) => (colorOf[pid] = PLAYER_COLORS[i % PLAYER_COLORS.length]));
        ctx.broadcast({ a: "pd_mode", mode, colors: { ...colorOf } });
        ctx.timer(2500, survivalRound);
      } else {
        ctx.broadcast({ a: "pd_mode", mode });
        ctx.timer(1500, nextRunner);
      }
    },
    onMessage(pid: string, d: GameClientMsg) {
      const m = d as PodsClientMsg;
      if (m.a === "pd_tap") handleTap(pid, m);
    },
    onLeave(pid: string) {
      alive = alive.filter((p) => p !== pid);
    },
    dispose() { disposed = true; },
  };
}
