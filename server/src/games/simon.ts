/**
 * "סימון מבוזר" — זיכרון קבוצתי שיתופי.
 */
import type { GameCtx, GameInstance } from "../engine";
import type { SimonClientMsg, GameClientMsg } from "../../../shared/protocol";

const COLORS = ["#00E676", "#b26bff", "#ff4d9d", "#ffce3c", "#5c8aff", "#2dd4bf", "#ff9d5c", "#f4f6ff"];
const LIVES = 3;

export function createSimon(ctx: GameCtx): GameInstance {
  let players = ctx.connectedPlayers().map((p) => p.id);
  const colorOf: Record<string, string> = {};
  players.forEach((p, i) => (colorOf[p] = COLORS[i % COLORS.length]));
  let lives = LIVES;
  let seq: string[] = [];
  let round = 0;
  let inputIdx = 0;
  let phase: "watch" | "input" | "idle" = "idle";
  let over = false;

  function nextRound() {
    if (over) return;
    round += 1;
    seq.push(players[Math.floor(Math.random() * players.length)]);
    replay(900);
  }

  /** משדר מחדש את הרצף כולו ואז פותח קלט — משמש גם אחרי טעות וגם אחרי עזיבת שחקן */
  function replay(lead = 700) {
    if (over) return;
    inputIdx = 0;
    phase = "watch";
    ctx.broadcast({ a: "sm_watch", round });
    const stepGap = Math.max(550, 1000 - round * 30);
    seq.forEach((pid, i) => { ctx.cue(lead + i * stepGap, { a: "sm_light", pid, step: i, at: 0 } as never); });
    ctx.timer(lead + seq.length * stepGap + 400, () => { if (over) return; phase = "input"; ctx.broadcast({ a: "sm_input", round }); });
  }

  function finish(won: boolean) {
    if (over) return;
    over = true;
    const scores: Record<string, number> = {};
    for (const p of players) scores[p] = seq.length - 1;
    ctx.end({ title: won ? `סימון מבוזר 🟩 הגעתם ל-${seq.length}!` : `סימון מבוזר 🟩 שרשרת של ${seq.length - 1}`, scores });
  }

  return {
    onStart() { ctx.broadcast({ a: "sm_setup", colors: { ...colorOf }, lives }); ctx.timer(1800, nextRound); },
    onMessage(pid: string, d: GameClientMsg) {
      const m = d as SimonClientMsg;
      if (m.a !== "sm_tap" || phase !== "input" || over) return;
      if (!players.includes(pid)) return; // מצטרף מאוחר/רפאים — נגיעה שלו לא מורידה חיים לקבוצה
      const expected = seq[inputIdx];
      if (pid === expected) {
        inputIdx += 1;
        ctx.broadcast({ a: "sm_progress", index: inputIdx, pid });
        if (inputIdx >= seq.length) { phase = "idle"; ctx.timer(1200, nextRound); }
      } else {
        lives -= 1;
        ctx.broadcast({ a: "sm_wrong", expected, got: pid, lives: Math.max(0, lives) });
        if (lives <= 0) return finish(false);
        phase = "idle"; inputIdx = 0;
        ctx.timer(1600, () => replay(700));
      }
    },
    onLeave(pid: string) {
      if (over || !players.includes(pid)) return;
      players = players.filter((p) => p !== pid);
      if (players.length < 2) return finish(false); // אין קבוצה — מסיימים בכבוד
      const before = seq.length;
      seq = seq.filter((p) => p !== pid); // הצעדים שלו יוצאים מהרצף — אי אפשר לגעת בטלפון שנעלם
      if (seq.length === 0) { phase = "idle"; ctx.timer(1500, nextRound); return; }
      // אם הרצף השתנה או שאנחנו באמצע קלט — מראים את הרצף המעודכן מחדש
      if (seq.length !== before || phase === "input") { phase = "idle"; ctx.timer(1500, () => replay(700)); }
    },
    dispose() { over = true; },
  };
}
