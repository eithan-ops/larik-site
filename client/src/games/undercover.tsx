/**
 * "המתחזה למתקדמים" 🥸 — צד לקוח.
 *
 * הכלל הקדוש של המסך הזה: **שום פיקסל לא מסגיר מי המתחזה.**
 * מסך הקלף זהה בדיוק אצל כולם — אותו טקסט, אותו צבע, אותה אנימציה.
 * הידיעה היחידה שיש לך היא המילה שלך, וזה כל המשחק.
 *
 * מסכים: קלף → סבב רמזים (תור מואר) → דיון → הצבעה סודית →
 * חשיפה מסונכרנת → ניחוש אחרון → לוח ניקוד.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { UndercoverServerMsg, UcPhase, UcDeclare, UcScoreRow } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";
import { UC_ART, type UcArtKey } from "./ucAssets";

/** איור מהמניפסט, עם נפילה חזרה לאימוג'י אם הקובץ לא נטען — המשחק אף פעם לא נשבר בגלל נכס */
function Art({ k, size, alt, fallback }: { k: UcArtKey; size: number; alt: string; fallback: string }) {
  const [bad, setBad] = useState(false);
  if (bad) return <div style={{ fontSize: size * 0.72 }} aria-label={alt}>{fallback}</div>;
  return <img src={UC_ART[k]} alt={alt} width={size} height={size} loading="lazy"
    onError={() => setBad(true)} style={{ width: size, height: size, objectFit: "contain" }} />;
}

type Role = { word: string; round: number; order: string[]; impostors: number; declareOn: boolean };
type Reveal = {
  round: number; majorityWord: string; impostorWord: string; impostors: string[];
  votes: Record<string, string>; tally: Record<string, number>;
  ejected: string | null; tie: boolean; declares: UcDeclare[];
};

const WHY: Record<UcScoreRow["why"], { t: string; e: string }> = {
  declared: { t: "הכריז שהוא המתחזה — וניחש נכון!", e: "🥸" },
  safe:     { t: "מתחזה ששרד", e: "😈" },
  saved:    { t: "נתפס — אבל ניחש את המילה", e: "🪄" },
  caught:   { t: "נתפס", e: "🎯" },
  bluff:    { t: "הכריז וטעה במילה", e: "💨" },
  hit:      { t: "הצביע נכון", e: "✅" },
  miss:     { t: "הצביע לא נכון", e: "❌" },
  fooled:   { t: "היה בטוח שהוא המתחזה 😅", e: "🤡" },
};
/** לכל תוצאה האיור שלה. "bluff" (מתחזה שהכריז וטעה) נשאר על האימוג'י —
 *  זו התוצאה היחידה שאין לה תמונה, והיא גם הנדירה ביותר. */
const ART_FOR: Partial<Record<UcScoreRow["why"], UcArtKey>> = {
  declared: "genius", safe: "safe", saved: "genius", caught: "caught",
  hit: "hit", miss: "miss", fooled: "fooled",
};

export default function UndercoverView({ room, me, conn, hub }: GameViewProps) {
  const [role, setRole] = useState<Role | null>(null);
  const [phase, setPhase] = useState<UcPhase>("deal");
  const [until, setUntil] = useState(0);
  const [turn, setTurn] = useState<string | undefined>();
  const [turnIdx, setTurnIdx] = useState<{ i: number; of: number } | null>(null);
  const [readyN, setReadyN] = useState({ n: 0, of: 0 });
  const [votedN, setVotedN] = useState({ n: 0, of: 0 });
  const [iAmReady, setIAmReady] = useState(false);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [declared, setDeclared] = useState(false);
  const [declareOpen, setDeclareOpen] = useState(false);
  const [declareText, setDeclareText] = useState("");
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [step, setStep] = useState(0);                     // שלבי האנימציה בחשיפה
  const [guess, setGuess] = useState<{ pid: string; until: number } | null>(null);
  const [guessText, setGuessText] = useState("");
  const [guessed, setGuessed] = useState<{ pid: string; guess: string; ok: boolean } | null>(null);
  const [scores, setScores] = useState<{ rows: UcScoreRow[]; totals: Record<string, number> } | null>(null);
  const [holding, setHolding] = useState(false);
  const [left, setLeft] = useState(0);
  const [need, setNeed] = useState<{ have: number; need: number } | null>(null);
  const stepTimers = useRef<number[]>([]);

  const isHost = me === room.hostId;
  const pl = (pid: string) => room.players.find((p) => p.id === pid);
  const nameOf = (pid: string) => pl(pid)?.name ?? "";
  const emojiOf = (pid: string) => pl(pid)?.emoji ?? "🙂";

  /* ---------- הודעות מהשרת ---------- */
  useEffect(() => hub.subscribe((d) => {
    const m = d as UndercoverServerMsg;
    switch (m.a) {
      case "uc_role":
        setRole({ word: m.word, round: m.round, order: m.order, impostors: m.impostors, declareOn: m.declareOn });
        setReveal(null); setScores(null); setGuess(null); setGuessed(null); setStep(0);
        setIAmReady(false); setMyVote(null); setPick(null); setDeclared(false); setNeed(null);
        setDeclareOpen(false); setDeclareText(""); setGuessText("");
        Sfx.ding(); vibrate(40);
        return;
      case "uc_phase":
        setPhase(m.phase);
        setUntil(m.until ?? 0);
        setTurn(m.turn);
        setTurnIdx(m.idx && m.of ? { i: m.idx, of: m.of } : null);
        if (m.phase === "clues" && m.turn === me) { Sfx.goBeep(); vibrate([60, 40, 120]); }
        else if (m.phase === "vote") { Sfx.tick(); vibrate(30); }
        return;
      case "uc_ready": setReadyN({ n: m.n, of: m.of }); return;
      case "uc_voted":
        setVotedN({ n: m.n, of: m.of });
        if (m.you) { setMyVote(m.you); setPick(m.you); }   // חזרה מניתוק — ההצבעה כבר ננעלה בשרת
        return;
      case "uc_declared": setDeclared(true); setDeclareOpen(false); Sfx.pop(); vibrate([30, 30, 30]); return;
      case "uc_reveal":
        setReveal({ ...m });
        setPhase("reveal");
        setStep(0);
        Sfx.drumroll(); vibrate([40, 60, 40, 60, 200]);
        return;
      case "uc_guess":
        setGuess({ pid: m.pid, until: m.until });
        setPhase("guess");
        if (m.pid === me) { Sfx.alarm(); vibrate([120, 60, 120]); }
        return;
      case "uc_guessed":
        setGuessed({ pid: m.pid, guess: m.guess, ok: m.ok });
        if (m.ok) Sfx.fanfare(); else Sfx.sadTrombone();
        return;
      case "uc_need": setNeed({ have: m.have, need: m.need }); return;
      case "uc_scores": {
        setScores({ rows: m.rows, totals: m.totals });
        setPhase("scores");
        const mine = m.rows.find((r) => r.pid === me);
        if (mine) { if (mine.delta > 0) { Sfx.upgrade(mine.delta); vibrate(80); } else vibrate(25); }
        return;
      }
    }
  }), [hub, me]);

  /* ---------- שעון יורד ---------- */
  useEffect(() => {
    const target = phase === "guess" && guess ? guess.until : until;
    if (!target) { setLeft(0); return; }
    const tick = () => setLeft(Math.max(0, Math.ceil(conn.untilServer(target) / 1000)));
    tick();
    const h = window.setInterval(tick, 250);
    return () => window.clearInterval(h);
  }, [until, phase, guess, conn]);

  /* ---------- כוריאוגרפיית החשיפה ---------- */
  useEffect(() => {
    stepTimers.current.forEach(window.clearTimeout);
    stepTimers.current = [];
    if (!reveal) return;
    const at = (ms: number, n: number, sfx?: () => void) => {
      stepTimers.current.push(window.setTimeout(() => { setStep(n); sfx?.(); }, ms));
    };
    at(1500, 1, () => { Sfx.boom(); vibrate(90); });   // מילת הרוב
    at(2300, 2, () => Sfx.pop());                       // מילת המתחזה
    at(3100, 3, () => { Sfx.evolve(); vibrate([60, 50, 160]); }); // מי הצביע למי + מי המתחזה
    return () => { stepTimers.current.forEach(window.clearTimeout); stepTimers.current = []; };
  }, [reveal]);

  // רק משתתפי הסיבוב — מצטרף באמצע נראה בלובי אבל אינו יעד הצבעה חוקי בשרת
  const alive = room.players.filter((p) => p.connected && (room.gamePids?.includes(p.id) ?? true));
  const iAmImpostor = reveal ? reveal.impostors.includes(me) : false;

  /* ================= הקלף (משותף לכל השלבים) ================= */
  const renderCard = (small?: boolean) => (
    <div
      onPointerDown={() => { setHolding(true); vibrate(15); }}
      onPointerUp={() => setHolding(false)}
      onPointerLeave={() => setHolding(false)}
      onPointerCancel={() => setHolding(false)}
      className="card"
      style={{
        textAlign: "center", padding: small ? "14px 14px" : "24px 16px", userSelect: "none",
        touchAction: "none", width: "100%", maxWidth: 340, minHeight: small ? 78 : 132,
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 4,
        borderColor: holding ? "var(--gold)" : undefined,
      }}
    >
      {!role ? <p className="sub">מחלק מילים…</p> : holding ? (
        <>
          <div className="sub" style={{ fontSize: 11.5 }}>המילה שלך</div>
          <b style={{ fontSize: small ? 26 : 36, color: "var(--gold)", lineHeight: 1.2 }}>{role.word}</b>
        </>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Art k="card" size={small ? 34 : 58} alt="קלף סודי" fallback="👁️" />
          </div>
          <b style={{ fontSize: small ? 13 : 16 }}>החזק כדי לראות</b>
          {!small && <p className="sub" style={{ fontSize: 11 }}>בסתר! שאף אחד לא יציץ</p>}
        </>
      )}
    </div>
  );

  /* ================= כפתור ההכרזה העצמית ================= */
  const renderDeclareChip = () => {
    if (!role?.declareOn) return null;
    if (declared) {
      return <span className="chip" style={{ borderColor: "var(--gold)", color: "var(--gold)" }}>🥸 הכרזת. נראה בחשיפה…</span>;
    }
    if (!declareOpen) {
      return (
        <button className="btn ghost" style={{ fontSize: 13, padding: "9px 14px", maxWidth: 260 }}
          onPointerDown={() => { setDeclareOpen(true); vibrate(20); }}>
          🥸 רגע… אני המתחזה?
        </button>
      );
    }
    return (
      <div className="card" style={{ width: "100%", maxWidth: 340, padding: 14, display: "grid", gap: 8 }}>
        <b style={{ fontSize: 14 }}>אז מה מילת הרוב?</b>
        <p className="sub" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
          סודי לגמרי — אף אחד לא רואה. צדקת: <b style={{ color: "var(--gold)" }}>+5</b>. טעית: 0 לסיבוב.
        </p>
        <input className="input" value={declareText} maxLength={40} autoFocus
          placeholder="המילה שכולם קיבלו…" onChange={(e) => setDeclareText(e.target.value)} />
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn gold" style={{ flex: 2 }} disabled={!declareText.trim()}
            onPointerDown={() => conn.sendGame({ a: "uc_declare", guess: declareText })}>
            🔒 נועל
          </button>
          <button className="btn ghost" style={{ flex: 1 }} onPointerDown={() => setDeclareOpen(false)}>ביטול</button>
        </div>
      </div>
    );
  };

  const renderOrderStrip = () => {
    if (!role) return null;
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", maxWidth: 340 }}>
        {role.order.map((pid, i) => {
          const now = turn === pid;
          const done = turnIdx ? i < turnIdx.i - 1 : false;
          return (
            <span key={pid} className="chip" style={{
              fontSize: 12, padding: "5px 9px", opacity: done ? 0.4 : 1,
              borderColor: now ? "var(--gold)" : undefined, color: now ? "var(--gold)" : undefined,
              fontWeight: now ? 700 : undefined,
            }}>
              {i + 1}. {emojiOf(pid)} {nameOf(pid)}
            </span>
          );
        })}
      </div>
    );
  };

  const renderTimer = () => left > 0 ? <span className="chip" style={{ fontSize: 12 }}>⏱️ {left}</span> : null;

  const head = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
      {role && <span className="chip" style={{ fontSize: 12 }}>סיבוב {role.round}</span>}
      {role && <span className="chip" style={{ fontSize: 12 }}>
        🥸 {role.impostors === 1 ? "מתחזה אחד בחדר" : `${role.impostors} מתחזים בחדר`}
      </span>}
      {renderTimer()}
    </div>
  );

  /* ================= 1. קלף ================= */
  if (phase === "deal") {
    return (
      <main className="fullscreen" style={{ justifyContent: "center", gap: 12, padding: "52px 18px 20px" }}>
        {head}
        <div style={{ fontSize: 40 }}>🥸</div>
        {renderCard()}
        <p className="sub" style={{ textAlign: "center", fontSize: 12.5, maxWidth: 320, lineHeight: 1.7 }}>
          לכולם יש מילה — אבל לאחד מכם היא <b>אחרת</b>.<br />
          גם הוא לא יודע שזה הוא. תגלו לפי הרמזים.
        </p>
        {renderOrderStrip()}
        {iAmReady
          ? <span className="chip">מוכנים {readyN.n}/{readyN.of} ⏳</span>
          : <button className="mega-cta" style={{ maxWidth: 340, width: "100%" }}
              onPointerDown={() => { setIAmReady(true); conn.sendGame({ a: "uc_ready" }); Sfx.tick(); vibrate(25); }}>
              קראתי ✓
            </button>}
        {isHost && <button className="btn ghost" style={{ maxWidth: 200, fontSize: 13 }}
          onPointerDown={() => conn.sendGame({ a: "uc_skip" })}>מתחילים בלי לחכות ▶</button>}
      </main>
    );
  }

  /* ================= 2. סבב רמזים ================= */
  if (phase === "clues") {
    const mine = turn === me;
    return (
      <main className="fullscreen" style={{
        justifyContent: "center", gap: 12, padding: "52px 18px 20px",
        background: mine ? "radial-gradient(circle at 50% 25%, rgba(255,206,74,.22), var(--bg))" : undefined,
      }}>
        {head}
        {mine ? (
          <>
            <div style={{ fontSize: 46 }} className="popin">🎤</div>
            <div className="big" style={{ fontSize: 26, color: "var(--gold)" }}>התור שלך!</div>
            <p className="sub" style={{ textAlign: "center", fontSize: 13, maxWidth: 300, lineHeight: 1.7 }}>
              תגיד בקול <b>מילה אחת</b> שקשורה למילה שלך.<br />לא ברור מדי, לא מעורפל מדי.
            </p>
            {renderCard(true)}
            <button className="mega-cta" style={{ maxWidth: 340, width: "100%" }}
              onPointerDown={() => { conn.sendGame({ a: "uc_said", idx: (turnIdx?.i ?? 1) - 1 }); Sfx.tick(); vibrate(30); }}>
              אמרתי ✓
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 40 }}>{emojiOf(turn ?? "")}</div>
            <div className="big" style={{ fontSize: 22 }}>{nameOf(turn ?? "")} אומר רמז 🎤</div>
            {turnIdx && <span className="chip" style={{ fontSize: 12 }}>{turnIdx.i} מתוך {turnIdx.of}</span>}
            {renderCard(true)}
          </>
        )}
        {renderOrderStrip()}
        {renderDeclareChip()}
        {isHost && !mine && <button className="btn ghost" style={{ maxWidth: 180, fontSize: 12.5 }}
          onPointerDown={() => conn.sendGame({ a: "uc_said", idx: (turnIdx?.i ?? 1) - 1 })}>דלג לתור הבא ⏭</button>}
      </main>
    );
  }

  /* ================= 3. דיון ================= */
  if (phase === "talk") {
    return (
      <main className="fullscreen" style={{ justifyContent: "center", gap: 14, padding: "52px 18px 20px" }}>
        {head}
        <div style={{ fontSize: 46 }}>🗣️</div>
        <div className="big" style={{ fontSize: 24 }}>מתווכחים!</div>
        <p className="sub" style={{ textAlign: "center", fontSize: 13, maxWidth: 320, lineHeight: 1.7 }}>
          מי נשמע לכם חשוד? מי אמר משהו כללי מדי?<br />
          <b>שימו לב</b> — גם אתם אולי המתחזה.
        </p>
        {renderCard(true)}
        {renderDeclareChip()}
        {isHost && <button className="mega-cta" style={{ maxWidth: 340, width: "100%" }}
          onPointerDown={() => conn.sendGame({ a: "uc_skip" })}>🗳️ להצבעה</button>}
      </main>
    );
  }

  /* ================= 4. הצבעה ================= */
  if (phase === "vote") {
    const locked = !!myVote;
    return (
      <main className="fullscreen" style={{ justifyContent: "flex-start", gap: 12, padding: "52px 16px 20px" }}>
        {head}
        <div className="big" style={{ fontSize: 24 }}>🗳️ מי המתחזה?</div>
        <span className="chip" style={{ fontSize: 12.5 }}>הצביעו {votedN.n}/{votedN.of}</span>
        <div className="players-grid" style={{ maxWidth: 380 }}>
          {alive.filter((p) => p.id !== me).map((p) => {
            const sel = (locked ? myVote : pick) === p.id;
            return (
              <button key={p.id} className="pbadge" disabled={locked}
                style={{
                  cursor: "pointer", opacity: locked && !sel ? 0.45 : 1,
                  borderColor: sel ? "var(--gold)" : undefined,
                  borderWidth: sel ? 3 : undefined,
                  boxShadow: sel ? "var(--hard-x) var(--hard-y) 0 var(--gold)" : undefined,
                } as CSSProperties}
                onPointerDown={() => { if (!locked) { setPick(p.id); Sfx.tick(); vibrate(15); } }}>
                <span style={{ fontSize: 28 }}>{p.emoji}</span>
                <span style={{ fontSize: 12.5 }}>{p.name}</span>
              </button>
            );
          })}
        </div>
        {renderCard(true)}
        {locked ? (
          <span className="chip" style={{ borderColor: "var(--gold)", color: "var(--gold)" }}>
            🔒 הצבעת ל{emojiOf(myVote!)} {nameOf(myVote!)} — מחכים לשאר
          </span>
        ) : (
          <button className="mega-cta" style={{ maxWidth: 340, width: "100%" }} disabled={!pick}
            onPointerDown={() => {
              if (!pick) return;
              setMyVote(pick);
              conn.sendGame({ a: "uc_vote", target: pick });
              Sfx.pop(); vibrate([40, 40, 40]);
            }}>
            🔒 נועל הצבעה
          </button>
        )}
        {isHost && !locked && <button className="btn ghost" style={{ maxWidth: 180, fontSize: 12.5 }}
          onPointerDown={() => conn.sendGame({ a: "uc_skip" })}>סוגר הצבעה ⏭</button>}
      </main>
    );
  }

  /* ================= 5. חשיפה + 6. ניחוש אחרון ================= */
  if ((phase === "reveal" || phase === "guess") && reveal) {
    const iGuess = phase === "guess" && guess?.pid === me;
    return (
      <main className="fullscreen" style={{
        justifyContent: "flex-start", gap: 12, padding: "48px 16px 20px",
        background: step >= 3
          ? (iAmImpostor ? "radial-gradient(circle at 50% 25%, #4a0b2a, var(--bg))" : "radial-gradient(circle at 50% 25%, #2b1a4d, var(--bg))")
          : undefined,
      }}>
        <div style={{ fontSize: 40 }} className={step === 0 ? "pulse" : "popin"}>🥸</div>
        {step === 0 && <div className="big" style={{ fontSize: 22 }}>החשיפה…</div>}

        {step >= 1 && (
          <div className="card popin" style={{ width: "100%", maxWidth: 340, textAlign: "center", padding: "14px 12px" }}>
            <div className="sub" style={{ fontSize: 11.5 }}>מילת הרוב</div>
            <b style={{ fontSize: 30, color: "var(--gold)" }}>{reveal.majorityWord}</b>
          </div>
        )}
        {step >= 2 && (
          <div className="card popin" style={{ width: "100%", maxWidth: 340, textAlign: "center", padding: "14px 12px" }}>
            <div className="sub" style={{ fontSize: 11.5 }}>ומילת המתחזה הייתה…</div>
            <b style={{ fontSize: 30, color: "#ff8a8a" }}>{reveal.impostorWord}</b>
          </div>
        )}

        {step >= 3 && (
          <>
            <div className="big popin" style={{ fontSize: 21 }}>
              {reveal.impostors.length === 1
                ? <>המתחזה: {emojiOf(reveal.impostors[0])} {nameOf(reveal.impostors[0])}</>
                : <>המתחזים: {reveal.impostors.map((p) => `${emojiOf(p)} ${nameOf(p)}`).join(" · ")}</>}
            </div>
            {iAmImpostor && (() => {
              const myDeclare = reveal.declares.find((d) => d.pid === me);
              const art: UcArtKey = myDeclare?.ok ? "genius" : reveal.ejected === me ? "caught" : "safe";
              const txt = myDeclare?.ok ? "הבנת לבד — וניחשת! 🥸" : reveal.ejected === me ? "זה היית אתה — ונתפסת 🫣" : "זה היית אתה… ושרדת 😈";
              return (
                <div className="popin" style={{ display: "grid", justifyItems: "center", gap: 4 }}>
                  <Art k={art} size={116} alt={txt} fallback={art === "caught" ? "🫣" : art === "safe" ? "😈" : "💡"} />
                  <span className="chip" style={{ borderColor: "#ff8a8a", color: "#ff8a8a" }}>{txt}</span>
                </div>
              );
            })()}

            <div className="players-grid" style={{ maxWidth: 380 }}>
              {alive.map((p) => {
                const imp = reveal.impostors.includes(p.id);
                const n = reveal.tally[p.id] ?? 0;
                const votedFor = reveal.votes[p.id];
                return (
                  <div key={p.id} className="pbadge" style={{
                    borderColor: imp ? "#ff8a8a" : undefined,
                    borderWidth: imp ? 3 : undefined,
                    opacity: reveal.ejected === p.id ? 1 : 0.9,
                  }}>
                    <span style={{ fontSize: 24 }}>{imp ? "🥸" : p.emoji}</span>
                    <span style={{ fontSize: 12 }}>{p.name}</span>
                    <span className="sub" style={{ fontSize: 10.5 }}>
                      {n > 0 ? `${n} קולות` : "—"}{votedFor ? ` · →${emojiOf(votedFor)}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>

            {reveal.tie
              ? <span className="chip">🤝 תיקו בהצבעה — אף אחד לא הודח</span>
              : reveal.ejected
                ? <span className="chip" style={{ fontSize: 13 }}>
                    הכי הרבה קולות: {emojiOf(reveal.ejected)} {nameOf(reveal.ejected)}
                    {reveal.impostors.includes(reveal.ejected) ? " — תפסתם! 🎯" : " — טעיתם 😬"}
                  </span>
                : null}

            {reveal.declares.map((d) => (
              <span key={d.pid} className="chip" style={{ fontSize: 12.5, borderColor: d.ok ? "var(--gold)" : undefined }}>
                {d.ok ? "🥸" : d.wasImpostor ? "💨" : "🤡"} {emojiOf(d.pid)} {nameOf(d.pid)} הכריז "{d.guess}"
                {d.ok ? " — בול! " : d.wasImpostor ? " — היה מתחזה, אבל פספס" : " — ולא היה המתחזה 😅"}
              </span>
            ))}
          </>
        )}

        {/* ---- הניחוש האחרון ---- */}
        {phase === "guess" && guess && !guessed && (
          iGuess ? (
            <div className="card" style={{ width: "100%", maxWidth: 340, padding: 14, display: "grid", gap: 8 }}>
              <b style={{ fontSize: 15 }}>נתפסת! 🫣 ניחוש אחד להציל את הסיבוב:</b>
              <p className="sub" style={{ fontSize: 11.5 }}>מה הייתה מילת הרוב? ⏱️ {left}</p>
              <input className="input" value={guessText} maxLength={40} autoFocus
                placeholder="המילה של כולם…" onChange={(e) => setGuessText(e.target.value)} />
              <button className="btn gold" disabled={!guessText.trim()}
                onPointerDown={() => conn.sendGame({ a: "uc_guess", guess: guessText })}>🎲 זו המילה!</button>
            </div>
          ) : (
            <span className="chip pulse" style={{ fontSize: 13 }}>
              🥸 {nameOf(guess.pid)} מנחש את מילת הרוב… ⏱️ {left}
            </span>
          )
        )}
        {guessed && (
          <span className="chip popin" style={{ fontSize: 13, borderColor: guessed.ok ? "var(--gold)" : "#ff8a8a" }}>
            {guessed.ok ? "🪄" : "💨"} {nameOf(guessed.pid)} ניחש "{guessed.guess}" — {guessed.ok ? "נכון! ברח ברגע האחרון" : "לא נכון"}
          </span>
        )}
      </main>
    );
  }

  /* ================= 7. ניקוד ================= */
  if (phase === "scores") {
    const totals = scores?.totals ?? {};
    const ranked = [...alive].sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0));
    const myRow = scores?.rows.find((r) => r.pid === me);
    return (
      <main className="fullscreen" style={{ justifyContent: "flex-start", gap: 12, padding: "48px 16px 20px" }}>
        <div style={{ fontSize: 36 }}>🏅</div>
        <div className="big" style={{ fontSize: 22 }}>סיבוב {reveal?.round ?? role?.round} — הניקוד</div>
        {myRow && (
          <div className="card popin" style={{ width: "100%", maxWidth: 340, textAlign: "center", padding: "12px 14px", display: "grid", justifyItems: "center", gap: 2 }}>
            {ART_FOR[myRow.why]
              ? <Art k={ART_FOR[myRow.why]!} size={92} alt={WHY[myRow.why].t} fallback={WHY[myRow.why].e} />
              : <div style={{ fontSize: 26 }}>{WHY[myRow.why].e}</div>}
            <b style={{ fontSize: 16 }}>{WHY[myRow.why].t}</b>
            <div style={{ fontSize: 30, color: myRow.delta > 0 ? "var(--gold)" : "var(--muted)", fontWeight: 700 }}>
              {myRow.delta > 0 ? `+${myRow.delta}` : "0"}
            </div>
          </div>
        )}
        <div style={{ width: "100%", maxWidth: 340, display: "grid", gap: 6 }}>
          {ranked.map((p, i) => {
            const row = scores?.rows.find((r) => r.pid === p.id);
            return (
              <div key={p.id} className="card" style={{
                display: "flex", alignItems: "center", gap: 8, padding: "9px 12px",
                borderColor: p.id === me ? "var(--gold)" : undefined,
              }}>
                <span style={{ fontSize: 13, width: 18, opacity: 0.6 }}>{i + 1}</span>
                <span style={{ fontSize: 20 }}>{p.emoji}</span>
                <b style={{ fontSize: 14, flex: 1 }}>{p.name}</b>
                {row && <span className="sub" style={{ fontSize: 11.5 }}>{WHY[row.why].e} {row.delta > 0 ? `+${row.delta}` : ""}</span>}
                <b style={{ fontSize: 18, color: "var(--gold)", minWidth: 26, textAlign: "left" }}>{totals[p.id] ?? 0}</b>
              </div>
            );
          })}
        </div>
        {need && (
          <span className="chip" style={{ borderColor: "#ff8a8a", color: "#ff8a8a" }}>
            צריך לפחות {need.need} שחקנים — יש {need.have}
          </span>
        )}
        {isHost ? (
          <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 340, marginTop: 4 }}>
            <button className="btn gold" style={{ flex: 2 }} onPointerDown={() => conn.sendGame({ a: "uc_next" })}>
              🔄 סיבוב חדש
            </button>
            <button className="btn ghost" style={{ flex: 1 }} onPointerDown={() => conn.sendGame({ a: "uc_end" })}>
              🏁 סיימנו
            </button>
          </div>
        ) : (
          <span className="chip">מחכים למארח… ⏳</span>
        )}
      </main>
    );
  }

  return (
    <main className="fullscreen" style={{ justifyContent: "center", gap: 12 }}>
      <div style={{ fontSize: 40 }} className="pulse">🥸</div>
      <p className="sub">מתכוננים…</p>
    </main>
  );
}
