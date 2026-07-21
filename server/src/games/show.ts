/**
 * "מופע" 🕯️ — הקהל כמסך.
 * המארח = קונסולת המפעיל; כל שאר הטלפונים = פיקסלים ממוענים.
 * מיקום: שיבוץ אוטומטי לרשת (לפי סדר הצטרפות), או מושב אמיתי מכרטיס (sh_seat מה-QR).
 * אפקט = cue מסונכרן; כל טלפון מחשב את הצבע שלו לוקאלית: צבע = f(x, y, t).
 * המשחק לא "נגמר" מעצמו — המפעיל מסיים דרך "סיום משחק".
 */
import type { GameCtx, GameInstance } from "../engine";
import type { ShowClientMsg, GameClientMsg, ShowFx, ShowShape } from "../../../shared/protocol";

export function createShow(ctx: GameCtx): GameInstance {
  const operator = ctx.players().find((p) => p.isHost)?.id ?? "";
  const seats = new Map<string, { r: number; c: number }>();
  let current: { fx: ShowFx; text?: string; bpm?: number; color?: string; anchor?: number; shape?: ShowShape } = { fx: "candles", shape: "full" };
  let dim = 1; // עוצמה ראשית (Grand Master) — נשמרת כדי לשחזר למצטרפים
  let over = false;

  const isOperator = (pid: string) => ctx.players().find((p) => p.id === pid)?.isHost === true;

  /** שיבוץ אוטומטי: רשת שמתרחבת לפי מספר המשתתפים (בערך ריבועית) */
  function autoAssign() {
    const pixels = ctx.participants().filter((p) => !isOperator(p.id)).map((p) => p.id);
    const cols = Math.max(1, Math.ceil(Math.sqrt(pixels.length)));
    pixels.forEach((pid, i) => {
      if (!seats.has(pid)) seats.set(pid, { r: Math.floor(i / cols), c: i % cols });
    });
  }

  function bounds() {
    let maxR = 1, maxC = 1;
    for (const s of seats.values()) { if (s.r > maxR) maxR = s.r; if (s.c > maxC) maxC = s.c; }
    return { maxR, maxC };
  }

  function sendPos(pid: string) {
    const s = seats.get(pid);
    if (!s) return;
    const { maxR, maxC } = bounds();
    ctx.sendTo(pid, { a: "sh_pos", r: s.r, c: s.c, maxR, maxC });
  }

  function broadcastPositions() {
    for (const pid of seats.keys()) sendPos(pid);
    const total = ctx.participants().filter((p) => p.connected && !isOperator(p.id)).length;
    for (const p of ctx.players()) if (isOperator(p.id)) ctx.sendTo(p.id, { a: "sh_count", total });
  }

  function fire(fx: ShowFx, text?: string, bpm?: number, color?: string, anchor?: number, shape?: ShowShape) {
    current = { fx, text, bpm, color, anchor, shape: shape ?? current.shape ?? "full" };
    ctx.cue(600, { a: "sh_fx", ...current, at: 0 } as never);
  }

  return {
    allowMidJoin: true, // הקהל מגיע בטפטוף — כל סורק חדש נהיה פיקסל מיד

    onStart() {
      autoAssign();
      broadcastPositions();
      fire("candles"); // פתיחה: כולם נרות
    },

    onMessage(pid: string, d: GameClientMsg) {
      if (over) return;
      const m = d as ShowClientMsg;
      if (m.a === "sh_set") {
        if (!isOperator(pid)) return;
        fire(m.fx, (m.text ?? "").slice(0, 24), m.bpm, m.color, m.anchor, m.shape);
      } else if (m.a === "sh_dim") {
        // פיידר עוצמה ראשי — cue קצר, כל הקהל מתעמעם יחד
        if (!isOperator(pid)) return;
        dim = Math.max(0, Math.min(1, Number(m.v) || 0));
        ctx.cue(150, { a: "sh_dim", v: dim, at: 0 } as never);
      } else if (m.a === "sh_seat") {
        // מושב אמיתי מכרטיס — דורס את השיבוץ האוטומטי
        const r = Math.max(0, Math.min(500, Math.floor(m.r)));
        const c = Math.max(0, Math.min(500, Math.floor(m.c)));
        seats.set(pid, { r, c });
        broadcastPositions(); // הגבולות אולי השתנו — מעדכנים את כולם
      }
    },

    onRejoin(pid: string) {
      if (!seats.has(pid) && !isOperator(pid)) { autoAssign(); }
      sendPos(pid);
      // משחזרים את האפקט הנוכחי + העוצמה מיד
      ctx.cue(400, { a: "sh_fx", ...current, at: 0 } as never, [pid]);
      if (dim < 1) ctx.cue(400, { a: "sh_dim", v: dim, at: 0 } as never, [pid]);
      const total = ctx.participants().filter((p) => p.connected && !isOperator(p.id)).length;
      if (isOperator(pid)) ctx.sendTo(pid, { a: "sh_count", total });
    },

    onLeave(_pid: string, permanent?: boolean) {
      if (permanent) broadcastPositions();
    },

    dispose() { over = true; },
  };
}
