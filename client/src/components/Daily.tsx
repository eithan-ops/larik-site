/**
 * הטריוויה היומית — מצב סולו.
 *
 * למה זה קיים: היום, כשהערב נגמר — לאריק נגמר. שלוש דקות ביום הן הסיבה
 * לפתוח את האפליקציה גם כשאין חבורה בסלון, והן מה שמצדיק בהמשך התראה.
 *
 * שני כללים ששומרים על זה שלא יבלע את המוצר:
 *  1. **קצר.** עשר שאלות, פעם ביום, ונגמר. אין "עוד סיבוב".
 *  2. **מסתיים בהזמנה לחבורה.** סולו הוא מנוע חזרה, לא מוצר מתחרה.
 *
 * אותן עשר שאלות לכל השחקנים באותו יום (זרע לפי תאריך), כדי שאפשר יהיה
 * להשוות תוצאות — וכל שאלה נרשמת כ"נראתה" ולא תחזור בערב הקבוצתי.
 */
import { useEffect, useState } from "react";
import { navigate } from "../App";
import { Sfx, vibrate } from "../lib/audio";
import { markSeen } from "../lib/seen";
import { track } from "../lib/analytics";
import { loadStreak, saveStreak, todayISO, type Streak } from "../lib/daily";

interface Q { id: number; q: string; options: string[]; correct: number }

export default function Daily() {
  const [qs, setQs] = useState<Q[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [err, setErr] = useState("");
  const [streak, setStreak] = useState<Streak>(() => loadStreak());
  const today = todayISO();
  const done = streak.lastDay === today && qs !== null && idx >= qs.length;
  const alreadyPlayed = streak.lastDay === today && idx === 0 && chosen === null && streak.lastScore !== undefined;

  useEffect(() => {
    track("daily_open");
    fetch(`/api/daily-trivia?d=${today}`)
      .then((r) => r.json())
      .then((b: { questions: Q[] }) => {
        setQs(b.questions);
        markSeen(b.questions.map((q) => q.id)); // נרשמות מיד — גם מי שנטש לא יקבל אותן שוב
      })
      .catch(() => setErr("השרת מתעורר... נסו שוב עוד כמה שניות 😴"));
  }, [today]);

  function answer(i: number) {
    if (chosen !== null || !qs) return;
    setChosen(i);
    const right = i === qs[idx].correct;
    if (right) { setScore((s) => s + 1); Sfx.fanfare(); vibrate([40, 30, 80]); }
    else { Sfx.sadTrombone(); vibrate(200); }
    setTimeout(() => {
      const next = idx + 1;
      setChosen(null);
      setIdx(next);
      if (next >= qs.length) finish(right ? score + 1 : score);
    }, 1200);
  }

  function finish(finalScore: number) {
    const s = saveStreak(today, finalScore);
    setStreak(s);
    track("daily_done", { score: finalScore });
    Sfx.ding();
  }

  async function share() {
    const text = `🧠 הטריוויה היומית של לאריק — ${score}/${qs?.length ?? 10}\nרצף: ${streak.days} ימים\nlarik.ai/daily`;
    try {
      if (navigator.share) { await navigator.share({ title: "LARIK", text }); return; }
      await navigator.clipboard.writeText(text);
    } catch { /* בוטל — לא נורא */ }
  }

  if (err) return <main className="fullscreen"><p className="sub">{err}</p></main>;
  if (!qs) return <main className="fullscreen"><div className="huge">🧠</div><p className="sub">טוען את השאלות של היום…</p></main>;

  /* כבר שיחק היום — לא נותנים לשחק שוב, אחרת אין משמעות לרצף */
  if (alreadyPlayed) {
    return (
      <main className="fullscreen">
        <div className="huge popin">✅</div>
        <div className="big">כבר שיחקת היום</div>
        <p className="sub" style={{ marginTop: 8 }}>
          {streak.lastScore}/10 · רצף של {streak.days} ימים 🔥
        </p>
        <p className="sub" style={{ marginTop: 6, fontSize: 13 }}>השאלות הבאות מחכות מחר</p>
        <button className="btn gold" style={{ marginTop: 16, maxWidth: 320 }} onClick={() => navigate("/")}>
          🎉 לפתוח חדר עם החבורה
        </button>
      </main>
    );
  }

  if (done) {
    return (
      <main className="fullscreen">
        <div className="huge popin">{score >= 8 ? "🏆" : score >= 5 ? "👏" : "🙈"}</div>
        <div className="big">{score}/{qs.length}</div>
        <p className="sub" style={{ marginTop: 8 }}>רצף של {streak.days} ימים 🔥</p>
        <button className="btn social" style={{ marginTop: 14, maxWidth: 320 }} onClick={share}>
          📤 שתפו את התוצאה
        </button>
        <button className="btn gold" style={{ marginTop: 10, maxWidth: 320 }} onClick={() => navigate("/")}>
          🎉 עכשיו עם החבורה
        </button>
      </main>
    );
  }

  const q = qs[idx];
  return (
    <main className="fullscreen" style={{ padding: "0 16px" }}>
      <div className="sub" style={{ marginBottom: 4 }}>
        🧠 היומית · {idx + 1}/{qs.length} · רצף {streak.days} 🔥
      </div>
      <div className="card" style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 21, lineHeight: 1.25, textAlign: "center", padding: "6px 4px 14px" }}>
          {q.q}
        </div>
        {q.options.map((o, i) => {
          const isRight = chosen !== null && i === q.correct;
          const isWrong = chosen === i && i !== q.correct;
          return (
            <button
              key={i}
              className="btn"
              disabled={chosen !== null}
              onClick={() => answer(i)}
              style={{
                marginTop: 8, width: "100%",
                background: isRight ? "var(--money)" : isWrong ? "#ff5a4e" : undefined,
                color: isRight || isWrong ? "#fff" : undefined,
              }}
            >
              {o}
            </button>
          );
        })}
      </div>
    </main>
  );
}
