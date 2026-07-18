/**
 * "המתחזה" 🎭 — צד לקוח.
 * המילה בהחזקה (hold-to-reveal) שאף אחד לא יציץ · תורות בקול · הצבעה חשאית ·
 * חשיפה דרמטית · ניחוש ההצלה של המתחזה.
 */
import { useEffect, useRef, useState } from "react";
import type { ImpostorServerMsg } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";

export default function ImpostorView({ room, me, conn, hub }: GameViewProps) {
  const [role, setRole] = useState<{ word: string; knowsImpostor: boolean } | null>(null);
  const [turn, setTurn] = useState<{ pid: string; until: number; round: number; totalRounds: number; order: string[] } | null>(null);
  const [voteOpen, setVoteOpen] = useState<{ until: number; candidates: string[] } | null>(null);
  const [votes, setVotes] = useState({ count: 0, total: 0 });
  const [myVote, setMyVote] = useState("");
  const [accused, setAccused] = useState<{ pid: string; wasImpostor: boolean } | null>(null);
  const [lastGuess, setLastGuess] = useState<{ pid: string; until: number } | null>(null);
  const [result, setResult] = useState<{ impostorWon: boolean; impostorPid: string; word: string; decoy?: string; guess?: string } | null>(null);
  const [guessDraft, setGuessDraft] = useState("");
  const [holding, setHolding] = useState(false);
  const [, setTick] = useState(0);
  const saidRef = useRef(false);

  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? "";
  const emojiOf = (pid: string) => room.players.find((p) => p.id === pid)?.emoji ?? "🙂";

  useEffect(() => hub.subscribe((d) => {
    const m = d as ImpostorServerMsg;
    switch (m.a) {
      case "im_role": setRole({ word: m.word, knowsImpostor: m.knowsImpostor }); Sfx.ding(); return;
      case "im_turn":
        setTurn({ pid: m.pid, until: m.until, round: m.round, totalRounds: m.totalRounds, order: m.order });
        setVoteOpen(null);
        saidRef.current = false;
        if (m.pid === me) { Sfx.goBeep(); vibrate([70, 40, 70]); }
        return;
      case "im_vote_open": setVoteOpen({ until: m.until, candidates: m.candidates }); setTurn(null); setMyVote(""); Sfx.tick(); return;
      case "im_votes": setVotes({ count: m.count, total: m.total }); return;
      case "im_accused":
        setAccused({ pid: m.pid, wasImpostor: m.wasImpostor });
        setVoteOpen(null);
        if (m.wasImpostor) { Sfx.fanfare(); } else { Sfx.sadTrombone(); }
        return;
      case "im_lastguess": setLastGuess({ pid: m.pid, until: m.until }); setAccused(null); Sfx.tick(); vibrate(80); return;
      case "im_result":
        setResult({ impostorWon: m.impostorWon, impostorPid: m.impostorPid, word: m.word, decoy: m.decoy, guess: m.guess });
        setLastGuess(null); setAccused(null);
        return;
    }
  }), [hub, me]);

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 300);
    return () => clearInterval(iv);
  }, []);

  const secsOf = (until: number) => Math.max(0, Math.ceil((until - conn.serverNow()) / 1000));

  /* ---------- קלף המילה (hold to reveal) ---------- */
  const wordCard = role && (
    <div
      onPointerDown={() => { setHolding(true); vibrate(15); }}
      onPointerUp={() => setHolding(false)}
      onPointerLeave={() => setHolding(false)}
      className="card"
      style={{ textAlign: "center", padding: "18px 14px", userSelect: "none", touchAction: "none",
        border: holding ? "1.5px solid var(--gold)" : undefined, width: "100%", maxWidth: 340 }}>
      {holding ? (
        role.knowsImpostor
          ? <div><div style={{ fontSize: 34 }}>🎭</div><b style={{ color: "#ff8a8a", fontSize: 20 }}>אתה המתחזה!</b>
              <p className="sub" style={{ marginTop: 6, fontSize: 12 }}>אין לך מילה. הקשב לרמזים וזייף כאילו יש.</p></div>
          : <div><div className="sub" style={{ fontSize: 11 }}>המילה שלך:</div>
              <b style={{ fontSize: 30, color: "var(--gold)" }}>{role.word}</b></div>
      ) : (
        <div><div style={{ fontSize: 26 }}>👁️</div><b style={{ fontSize: 15 }}>החזק כדי לראות את המילה</b>
          <p className="sub" style={{ marginTop: 4, fontSize: 11 }}>בסתר! שאף אחד לא יציץ</p></div>
      )}
    </div>
  );

  /* ---------- תוצאה ---------- */
  if (result) {
    const iAmImpostor = result.impostorPid === me;
    return (
      <main className="fullscreen" style={{ background: result.impostorWon ? "radial-gradient(circle at 50% 30%, #3a1040, var(--bg))" : "radial-gradient(circle at 50% 30%, #103a2a, var(--bg))" }}>
        <div style={{ fontSize: 70 }} className="popin">🎭</div>
        <div className="big" style={{ fontSize: 24, marginTop: 8 }}>
          המתחזה: {emojiOf(result.impostorPid)} {nameOf(result.impostorPid)}{iAmImpostor ? " (אתה!)" : ""}
        </div>
        <div className="card" style={{ marginTop: 14, maxWidth: 320, textAlign: "center" }}>
          <p style={{ fontSize: 15 }}>המילה של כולם: <b style={{ color: "var(--gold)" }}>{result.word}</b></p>
          {result.decoy && <p style={{ fontSize: 15, marginTop: 4 }}>המתחזה קיבל: <b style={{ color: "#ff8a8a" }}>{result.decoy}</b></p>}
          {result.guess !== undefined && <p className="sub" style={{ marginTop: 6 }}>ניחוש ההצלה: "{result.guess}" {result.impostorWon ? "✓ פגע!" : "✗"}</p>}
        </div>
        <div className="big popin" style={{ marginTop: 16, fontSize: 22, color: result.impostorWon ? "#ff8a8a" : "var(--money)" }}>
          {result.impostorWon ? "המתחזה ניצח! 😏" : "תפסתם אותו! 🎉"}
        </div>
      </main>
    );
  }

  /* ---------- ניחוש ההצלה ---------- */
  if (lastGuess) {
    const secs = secsOf(lastGuess.until);
    if (lastGuess.pid === me) {
      return (
        <main className="fullscreen">
          <div style={{ fontSize: 54 }} className="pulse">🎯</div>
          <div className="big" style={{ fontSize: 22, margin: "10px 0 4px" }}>נתפסת! הזדמנות אחרונה:</div>
          <p className="sub" style={{ marginBottom: 14 }}>נחש את המילה של כולם — ותגנוב את הניצחון ({secs}s)</p>
          <input className="input" style={{ maxWidth: 300 }} placeholder="המילה שלהם..." value={guessDraft}
            maxLength={40} onChange={(e) => setGuessDraft(e.target.value)} />
          <button className="btn gold" style={{ maxWidth: 300, marginTop: 10 }} disabled={!guessDraft.trim()}
            onPointerDown={() => conn.sendGame({ a: "im_guess", word: guessDraft })}>
            🎯 זה הניחוש שלי!
          </button>
        </main>
      );
    }
    return (
      <main className="fullscreen">
        <div style={{ fontSize: 60 }} className="shake">😰</div>
        <div className="big" style={{ fontSize: 20, marginTop: 8 }}>{nameOf(lastGuess.pid)} נתפס!</div>
        <p className="sub" style={{ marginTop: 8 }}>עכשיו הוא מנסה לנחש את המילה... ({secsOf(lastGuess.until)}s)<br />אם יצליח — הוא גונב את הניצחון 😱</p>
      </main>
    );
  }

  /* ---------- הכרזת המודח ---------- */
  if (accused) {
    return (
      <main className="fullscreen">
        <div style={{ fontSize: 64 }} className="popin">{accused.pid ? "☝️" : "🌫️"}</div>
        <div className="big" style={{ fontSize: 22, marginTop: 10 }}>
          {accused.pid ? `הקהל בחר: ${emojiOf(accused.pid)} ${nameOf(accused.pid)}` : "אין רוב — אף אחד לא הודח"}
        </div>
        <p className="sub pulse" style={{ marginTop: 12, fontSize: 16 }}>רגע האמת...</p>
      </main>
    );
  }

  /* ---------- הצבעה ---------- */
  if (voteOpen) {
    return (
      <main style={{ minHeight: "100dvh", padding: 18 }}>
        <h1 className="brand" style={{ textAlign: "center" }}>מי המתחזה? 🎭</h1>
        <p className="sub" style={{ textAlign: "center", marginBottom: 4 }}>הצבעה חשאית · {secsOf(voteOpen.until)}s</p>
        <p className="sub" style={{ textAlign: "center", marginBottom: 14 }}>הצביעו {votes.count}/{votes.total}</p>
        <div className="players-grid">
          {voteOpen.candidates.filter((p) => p !== me).map((pid) => (
            <button key={pid} className={"pbadge" + (myVote === pid ? " armed" : "")}
              style={{ borderColor: myVote === pid ? "var(--gold)" : undefined }}
              onPointerDown={() => { if (!myVote) { setMyVote(pid); conn.sendGame({ a: "im_vote", target: pid }); vibrate(40); } }}>
              <span className="em">{emojiOf(pid)}</span>
              <span className="nm">{nameOf(pid)}</span>
            </button>
          ))}
        </div>
        {myVote && <p className="sub" style={{ textAlign: "center", marginTop: 16 }}>הצבעת על {nameOf(myVote)} ✓ מחכים לשאר...</p>}
      </main>
    );
  }

  /* ---------- סבב הרמזים ---------- */
  if (turn) {
    const myTurn = turn.pid === me;
    const secs = secsOf(turn.until);
    return (
      <main className="fullscreen" style={{ background: myTurn ? "radial-gradient(circle at 50% 25%, #2b1a4d, var(--bg))" : "var(--bg)", justifyContent: "space-between", padding: "56px 18px 20px" }}>
        <div style={{ textAlign: "center" }}>
          <span className="chip">סבב {turn.round}/{turn.totalRounds}</span>
          <span className="chip" style={{ marginRight: 8, color: secs <= 8 ? "#ff8a8a" : undefined }}>⏱️ {secs}s</span>
        </div>
        <div style={{ textAlign: "center" }}>
          {myTurn ? (
            <>
              <div style={{ fontSize: 46 }}>🎤</div>
              <div className="big" style={{ fontSize: 24, margin: "8px 0" }}>תורך!</div>
              <p className="sub">אמור בקול רם מילה אחת שקשורה למילה שלך.<br />לא את המילה עצמה!</p>
              <button className="btn" style={{ maxWidth: 280, margin: "16px auto 0" }}
                onPointerDown={() => { if (!saidRef.current) { saidRef.current = true; conn.sendGame({ a: "im_said" }); } }}>
                אמרתי ✓
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 46 }} className="pulse">👂</div>
              <div className="big" style={{ fontSize: 22, margin: "8px 0" }}>{emojiOf(turn.pid)} {nameOf(turn.pid)} אומר מילה</div>
              <p className="sub">הקשיבו טוב... מי נשמע חשוד? 🤨</p>
            </>
          )}
          <div style={{ display: "flex", gap: 5, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
            {turn.order.map((pid, i) => (
              <span key={pid} style={{ fontSize: 18, opacity: order2op(i, turn) }}>{emojiOf(pid)}</span>
            ))}
          </div>
        </div>
        <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>{wordCard}</div>
      </main>
    );
  }

  /* ---------- פתיחה: קבלת המילה ---------- */
  return (
    <main className="fullscreen" style={{ justifyContent: "center", gap: 14 }}>
      <div style={{ fontSize: 56 }} className="pulse">🎭</div>
      <div className="big" style={{ fontSize: 22 }}>המתחזה</div>
      <p className="sub" style={{ textAlign: "center", padding: "0 20px" }}>
        לכולם אותה מילה — חוץ מאחד. 🤫<br />קראו את המילה בסתר. הסבב מתחיל עוד רגע...
      </p>
      {wordCard}
    </main>
  );
}

function order2op(i: number, turn: { pid: string; order: string[] }): number {
  const cur = turn.order.indexOf(turn.pid);
  if (i < cur) return 0.25;
  if (i === cur) return 1;
  return 0.6;
}
