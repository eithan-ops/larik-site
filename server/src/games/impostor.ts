/**
 * "המתחזה" 🎭 — לוגיקת השרת, גרסה מינימלית בכוונה.
 * האפליקציה עושה רק את מה שקשה בלי אפליקציה: חלוקת תפקידים בסתר.
 * כולם מקבלים את אותה מילה — חוץ מאחד, שמקבל "אתה המתחזה".
 * הרמזים, הוויכוח וההצבעה — בקול, סביב השולחן, בעולם האמיתי.
 * המארח: "חשוף את המתחזה" (רגע דרמטי אצל כולם) ו"סיבוב חדש".
 */
import type { GameCtx, GameInstance } from "../engine";
import type { ImpostorClientMsg, GameClientMsg } from "../../../shared/protocol";
import { IMPOSTOR_PAIRS } from "../decks";

// מאגר מילים שטוח — כל המילים מהזוגות, בלי כפילויות
const WORDS = [...new Set(IMPOSTOR_PAIRS.flat())];

export function createImpostor(ctx: GameCtx): GameInstance {
  let round = 0;
  let word = "";
  let impostor = "";
  let exposed = false;
  const usedWords = new Set<string>();
  let over = false;

  const isHost = (pid: string) => ctx.players().find((p) => p.id === pid)?.isHost === true;
  const alive = () => ctx.participants().filter((p) => p.connected).map((p) => p.id);

  function pickWord(): string {
    const fresh = WORDS.filter((w) => !usedWords.has(w));
    const pool = fresh.length ? fresh : WORDS; // נגמרו? מתחילים מחזור חדש
    if (!fresh.length) usedWords.clear();
    const w = pool[Math.floor(Math.random() * pool.length)];
    usedWords.add(w);
    return w;
  }

  function deal() {
    const players = alive();
    if (players.length < 2) return;
    round += 1;
    exposed = false;
    word = pickWord();
    // מתחזה חדש — מנסים לא לחזור על הקודם
    const candidates = players.filter((p) => p !== impostor);
    impostor = (candidates.length ? candidates : players)[Math.floor(Math.random() * (candidates.length ? candidates.length : players.length))];
    for (const pid of players) sendRole(pid);
  }

  function sendRole(pid: string) {
    ctx.sendTo(pid, pid === impostor
      ? { a: "im_role", word: "", isImpostor: true, round }
      : { a: "im_role", word, isImpostor: false, round });
  }

  return {
    onStart() { deal(); },

    onMessage(pid: string, d: GameClientMsg) {
      if (over) return;
      const m = d as ImpostorClientMsg;
      if (m.a === "im_expose") {
        if (!isHost(pid) || exposed) return;
        exposed = true;
        // חשיפה מסונכרנת — כל המסכים מתהפכים יחד
        ctx.cue(600, { a: "im_exposed", impostorPid: impostor, word, round } as never);
      } else if (m.a === "im_next") {
        if (!isHost(pid)) return;
        deal();
      }
    },

    onRejoin(pid: string) {
      if (!round) return;
      sendRole(pid);
      if (exposed) ctx.sendTo(pid, { a: "im_exposed", impostorPid: impostor, word, round });
    },

    onLeave(pid: string, permanent?: boolean) {
      // המתחזה עזב באמצע? חושפים אוטומטית — שהחדר יידע
      if (over || !permanent || pid !== impostor || exposed) return;
      exposed = true;
      ctx.broadcast({ a: "im_exposed", impostorPid: impostor, word, round });
    },

    dispose() { over = true; },
  };
}
