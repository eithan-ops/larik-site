/**
 * "מי הכי?" — צד לקוח.
 *  write:  המארח מקליד שאלות (או שולף מוכנות) ומפרסם.
 *  answer: כל אחד מצביע בסתר מי מתאים לכל שאלה → "סיימתי".
 *  reveal: הטלפונים על השולחן; המארח מגלה → הטלפון של הנבחר נדלק בזהב.
 */
import { useEffect, useState } from "react";
import type { WhoMostServerMsg } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";

const SUGGESTIONS = [
  "מי הכי מאחר תמיד?",
  "מי הכי יישרוד באי בודד?",
  "מי הכי מצחיק בחבורה?",
  "מי הכי יהפוך למיליונר?",
  "מי הכי ביישן?",
  "מי הכי יאכל את כל החטיפים לבד?",
  "מי הכי מבולגן?",
  "מי הכי ייתן לך עצה טובה?",
  "מי הכי דרמטי?",
  "מי הכי יירדם באמצע סרט?",
  "מי הכי עקשן?",
  "מי הכי יעשה משהו מטורף על התערבות?",
  "מי הכי יבכה בחתונה?",
  "מי הכי מכור לטלפון?",
  "מי הכי יאחר לטיסה?",
  "מי הכי טוב בבישול?",
  "מי הכי יתחיל ויכוח מיותר?",
  "מי הכי נדיב?",
  "מי הכי יזכה בתחרות ריקוד?",
  "מי הכי סומך על אחרים?",
];

export default function WhoMostView({ room, me, conn, hub }: GameViewProps) {
  const isHost = me === room.hostId;
  const [phase, setPhase] = useState<"write" | "answer" | "reveal">("write");
  const [questions, setQuestions] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [myVotes, setMyVotes] = useState<Record<number, string>>({});
  const [iDone, setIDone] = useState(false);
  const [reveal, setReveal] = useState<{ idx: number; total: number; text: string } | null>(null);
  const [result, setResult] = useState<{ idx: number; winners: string[]; tally: Record<string, number>; voters: number } | null>(null);
  const [lit, setLit] = useState(false);

  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? "";
  const emojiOf = (pid: string) => room.players.find((p) => p.id === pid)?.emoji ?? "🙂";
  const candidates = room.players.filter((p) => p.connected && (room.gamePids?.includes(p.id) ?? true));

  useEffect(() => hub.subscribe((d) => {
    const m = d as WhoMostServerMsg;
    switch (m.a) {
      case "wm_phase":
        setPhase(m.phase);
        if (m.phase === "reveal") { setResult(null); setLit(false); }
        return;
      case "wm_questions": setQuestions(m.questions); return;
      case "wm_progress": setProgress({ done: m.done, total: m.total }); return;
      case "wm_reveal_q":
        setReveal({ idx: m.idx, total: m.total, text: m.text });
        setResult(null); setLit(false);
        Sfx.ding();
        return;
      case "wm_result":
        setResult({ idx: m.idx, winners: m.winners, tally: m.tally, voters: m.voters });
        return;
      case "wm_lit":
        if (m.pids.includes(me)) { setLit(true); Sfx.fanfare(); vibrate([80, 60, 80, 60, 250]); }
        else Sfx.pop();
        return;
    }
  }), [hub, me]);

  /* ---------- WRITE ---------- */
  if (phase === "write") {
    if (!isHost) {
      return (
        <main className="fullscreen">
          <div style={{ fontSize: 56 }} className="pulse">📝</div>
          <div className="big" style={{ marginTop: 8 }}>המארח מכין שאלות...</div>
          <p className="sub" style={{ marginTop: 10 }}>{questions.length} שאלות עד כה</p>
        </main>
      );
    }
    function add(text: string) {
      const t = text.trim();
      if (!t) return;
      conn.sendGame({ a: "wm_add", text: t });
      setDraft("");
    }
    return (
      <main style={{ minHeight: "100dvh", padding: 18 }}>
        <h1 className="brand" style={{ textAlign: "center" }}>מי הכי? 🫵</h1>
        <p className="sub" style={{ textAlign: "center", marginBottom: 14 }}>כתוב שאלות "מי הכי..." — או שלוף מוכנות</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" placeholder="מי הכי...?" value={draft} maxLength={120}
            style={{ textAlign: "right" }}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(draft); }} />
          <button className="btn" style={{ width: "auto", padding: "0 18px" }} disabled={!draft.trim()} onPointerDown={() => add(draft)}>➕</button>
        </div>
        <button className="btn ghost" style={{ marginTop: 8 }}
          onPointerDown={() => add(SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)])}>
          🎲 הוסף שאלה מוכנה
        </button>

        <div style={{ marginTop: 16 }}>
          {questions.map((q, i) => (
            <div key={i} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", marginBottom: 8 }}>
              <span style={{ fontSize: 15, flex: 1 }}>{i + 1}. {q}</span>
              <button className="chip" style={{ border: "none", background: "#ff4d4d33", color: "#ff8a8a" }}
                onPointerDown={() => conn.sendGame({ a: "wm_remove", idx: i })}>✕</button>
            </div>
          ))}
          {questions.length === 0 && <p className="sub" style={{ textAlign: "center", marginTop: 20 }}>עדיין אין שאלות — הוסף לפחות אחת 👆</p>}
        </div>

        <button className="btn" style={{ marginTop: 14 }} disabled={questions.length < 1}
          onPointerDown={() => conn.sendGame({ a: "wm_publish" })}>
          🚀 פרסם לכולם ({questions.length})
        </button>
      </main>
    );
  }

  /* ---------- ANSWER ---------- */
  if (phase === "answer") {
    const allAnswered = questions.every((_, i) => myVotes[i]);
    if (iDone) {
      return (
        <main className="fullscreen">
          <div style={{ fontSize: 56 }}>✅</div>
          <div className="big" style={{ marginTop: 8 }}>סיימת!</div>
          <p className="sub" style={{ marginTop: 10 }}>מחכים לשאר... {progress.done}/{progress.total}</p>
          {isHost && (
            <button className="btn gold" style={{ marginTop: 20, maxWidth: 300 }}
              onPointerDown={() => conn.sendGame({ a: "wm_start" })}>
              🎬 התחל את הגילוי {progress.done >= progress.total ? "(כולם מוכנים!)" : `(${progress.done}/${progress.total})`}
            </button>
          )}
        </main>
      );
    }
    return (
      <main style={{ minHeight: "100dvh", padding: 18 }}>
        <h1 className="brand" style={{ textAlign: "center" }}>מי הכי? 🫵</h1>
        <p className="sub" style={{ textAlign: "center", marginBottom: 14 }}>בסתר: בחר מי הכי מתאים לכל שאלה</p>
        {questions.map((q, i) => (
          <div key={i} className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>{i + 1}. {q}</div>
            <div className="throw-row" style={{ justifyContent: "flex-start", flexWrap: "wrap", overflowX: "visible" }}>
              {candidates.map((p) => (
                <button key={p.id}
                  className={"throw-chip" + (myVotes[i] === p.id ? " loaded" : "")}
                  style={{ borderColor: myVotes[i] === p.id ? "var(--gold)" : undefined }}
                  onPointerDown={() => { setMyVotes((v) => ({ ...v, [i]: p.id })); conn.sendGame({ a: "wm_vote", qIdx: i, target: p.id }); vibrate(20); }}>
                  <span style={{ fontSize: 22 }}>{p.emoji}</span>
                  <span className="nm">{p.name}{p.id === me ? " (אני)" : ""}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <button className="btn" style={{ marginTop: 8, marginBottom: 20 }} disabled={!allAnswered}
          onPointerDown={() => { conn.sendGame({ a: "wm_done" }); setIDone(true); Sfx.ding(); }}>
          {allAnswered ? "✅ סיימתי!" : `ענה על כל השאלות (${Object.keys(myVotes).length}/${questions.length})`}
        </button>
      </main>
    );
  }

  /* ---------- REVEAL ---------- */
  // הטלפון שלי נבחר — מסך זהב
  if (lit) {
    const n = result ? (result.tally[me] ?? 0) : 0;
    return (
      <main className="fullscreen" style={{ background: "linear-gradient(160deg,#ffce3c,#ff9d3c)" }}>
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} className="confetti" style={{ left: `${(i * 4.1) % 100}%`, background: ["#fff", "#ff4d9d", "#5c8aff", "#34e89e"][i % 4], animationDuration: `${1.2 + (i % 5) * 0.25}s` }} />
        ))}
        <div style={{ fontSize: 90 }} className="popin">👑</div>
        <div className="big" style={{ color: "#3a2a00", fontSize: 34 }}>זה אתה!</div>
        <p style={{ color: "#3a2a00", fontWeight: 800, marginTop: 10, fontSize: 18 }}>
          {n > 0 ? `${n} מתוך ${result?.voters} בחרו בך` : "נבחרת!"}
        </p>
        {/* גם כשהמארח עצמו נבחר — הוא חייב כפתור להמשיך, אחרת המשחק נתקע */}
        {isHost && reveal && (
          <button className="btn" style={{ marginTop: 26, maxWidth: 320, background: "#2b1a4d", boxShadow: "0 8px 24px rgba(0,0,0,.3)" }}
            onPointerDown={() => conn.sendGame({ a: "wm_next" })}>
            {reveal.idx + 1 >= reveal.total ? "🏆 סיום וטקס" : "➡️ השאלה הבאה"}
          </button>
        )}
      </main>
    );
  }

  if (reveal) {
    return (
      <main className="fullscreen" style={{ background: "var(--bg)", justifyContent: "space-between", padding: "24px 18px" }}>
        <span className="chip">{reveal.idx + 1}/{reveal.total}</span>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>🫵</div>
          <div className="big" style={{ marginTop: 14, fontSize: 26, lineHeight: 1.3 }}>{reveal.text}</div>

          {result ? (
            <div className="popin" style={{ marginTop: 20 }}>
              <div className="sub">הנבחר{result.winners.length > 1 ? "ים" : ""}:</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "var(--gold)", marginTop: 6 }}>
                {result.winners.length ? result.winners.map((p) => `${emojiOf(p)} ${nameOf(p)}`).join(" · ") : "אף אחד לא הצביע 🤷"}
              </div>
              {result.winners.length > 0 && (
                <div className="sub" style={{ marginTop: 6 }}>{result.tally[result.winners[0]]} מתוך {result.voters} קולות</div>
              )}
            </div>
          ) : (
            <p className="sub" style={{ marginTop: 18 }}>
              {isHost ? "קרא בקול, תנו לחדר לנחש — ואז גלה 👇" : "הניחו את הטלפון על השולחן 👀"}
            </p>
          )}
        </div>

        {isHost ? (
          <div style={{ width: "100%" }}>
            {!result ? (
              <button className="btn gold" onPointerDown={() => conn.sendGame({ a: "wm_reveal" })}>🔦 גלה!</button>
            ) : (
              <button className="btn" onPointerDown={() => conn.sendGame({ a: "wm_next" })}>
                {reveal.idx + 1 >= reveal.total ? "🏆 סיום וטקס" : "➡️ השאלה הבאה"}
              </button>
            )}
          </div>
        ) : <div style={{ height: 8 }} />}
      </main>
    );
  }

  return (
    <main className="fullscreen">
      <div style={{ fontSize: 54 }} className="pulse">🫵</div>
      <p className="sub" style={{ marginTop: 10 }}>מתכוננים...</p>
    </main>
  );
}
