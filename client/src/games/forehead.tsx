/**
 * "על המצח" — צד לקוח.
 * הטלפון על המצח = הקלף מוצג לכולם חוץ ממך; הג'ירו מזהה הנחה והצצות.
 */
import { useEffect, useRef, useState } from "react";
import type { ForeheadServerMsg } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";
import { t, lt } from "../lib/locale";
import { watchForehead } from "../lib/sensors";

type Phase = "deal" | "placing" | "playing" | "voting" | "done";

export default function ForeheadView({ room, me, conn, hub }: GameViewProps) {
  const [card, setCard] = useState("");
  const [deckName, setDeckName] = useState("");
  const [phase, setPhase] = useState<Phase>("deal");
  const [placedCount, setPlacedCount] = useState(0);
  const [total, setTotal] = useState(room.players.length);
  const [turnPid, setTurnPid] = useState("");
  const [until, setUntil] = useState(0); // דדליין התור/ההצבעה בזמן-שרת
  const [, setTick] = useState(0);
  const [voteReq, setVoteReq] = useState<{ pid: string; card: string } | null>(null);
  const [voted, setVoted] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [flash, setFlash] = useState<{ text: string; color: string } | null>(null);
  const [onForehead, setOnForehead] = useState(false);
  const sensorOk = useRef(false);
  const phaseRef = useRef<Phase>("deal");
  phaseRef.current = phase;

  function flashMsg(text: string, color: string, ms = 2200) {
    setFlash({ text, color });
    setTimeout(() => setFlash(null), ms);
  }

  /* ---- אירועי שרת ---- */
  useEffect(() => hub.subscribe((d) => {
    const m = d as ForeheadServerMsg;
    switch (m.a) {
      case "fh_deal": setCard(m.card); setDeckName(lt(m.deckName)); setPhase("placing"); return;
      case "fh_wait_placed": setPlacedCount(m.placed.length); setTotal(m.total); return;
      case "fh_begin": setPhase("playing"); Sfx.goBeep(); vibrate(120); return;
      case "fh_turn":
        setPhase("playing"); setVoteReq(null); setVoted(false); setTurnPid(m.pid); setUntil(m.until);
        if (m.pid === me) { Sfx.ding(); vibrate([60, 40, 60]); }
        return;
      case "fh_vote_req":
        setUntil(m.until);
        if (m.pid !== me) { setVoteReq({ pid: m.pid, card: m.card }); setVoted(false); setPhase("voting"); Sfx.tick(); }
        else setPhase("voting");
        return;
      case "fh_saved":
        setSaved((s) => [...s, m.pid]);
        setVoteReq(null);
        if (m.pid === me) { setPhase("playing"); Sfx.fanfare(); vibrate([80, 50, 80]); flashMsg(t("forehead.you_right", { card: m.card }), "#34e89e"); }
        else { Sfx.pop(); flashMsg(t("forehead.x_saved", { name: nameOf(m.pid), card: m.card }), "#8ff5cc"); }
        return;
      case "fh_wrong":
        setVoteReq(null);
        if (m.pid === me) { Sfx.sadTrombone(); vibrate(300); flashMsg(t("forehead.wrong"), "#ff8a8a"); }
        else flashMsg(t("forehead.x_wrong", { name: nameOf(m.pid) }), "#ff8a8a");
        return;
      case "fh_cheater":
        Sfx.alarm(); vibrate([100, 50, 100, 50, 100]);
        flashMsg(m.pid === me ? t("forehead.you_peeked") : t("forehead.x_peeked", { name: nameOf(m.pid) }), "#ff4d4d", 3000);
        return;
    }
  }), [hub, me]);

  function nameOf(pid: string) {
    return room.players.find((p) => p.id === pid)?.name ?? "";
  }

  // שעון מתקתק לתצוגת הספירה לאחור
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(iv);
  }, []);
  const secs = until ? Math.max(0, Math.ceil((until - conn.serverNow()) / 1000)) : 0;
  const timerChip = secs > 0 && (
    <span className="chip" style={{ position: "fixed", top: 14, right: "50%", transform: "translateX(50%)", zIndex: 20, color: secs <= 8 ? "#ff8a8a" : undefined }}>
      ⏱️ {secs}s
    </span>
  );

  /* ---- ג'ירו: הנחה על המצח + אנטי-הצצה ---- */
  useEffect(() => {
    const stop = watchForehead((s) => {
      sensorOk.current = true;
      if (s === "on-forehead") {
        setOnForehead(true);
        if (phaseRef.current === "placing") conn.sendGame({ a: "fh_placed" });
      } else {
        setOnForehead(false);
        if (phaseRef.current === "placing") conn.sendGame({ a: "fh_removed" });
        // הצצה באמצע משחק — הלשנה עצמית של הטלפון 🐀
        if (s === "peeking" && phaseRef.current === "playing" && !saved.includes(me)) {
          conn.sendGame({ a: "fh_peek" });
        }
      }
    });
    return stop;
  }, [conn, saved, me]);

  const iAmSaved = saved.includes(me);
  const myTurn = turnPid === me && !iAmSaved;
  // בלי חיישנים (מצב ידני) אין זיהוי הורדה — בתור שלך חייבים להראות את ממשק הניחוש,
  // אחרת כפתור "אני מנחש" לא מופיע לעולם
  const showCard = onForehead && !(myTurn && !sensorOk.current);

  /* ---------- מסכים ---------- */

  if (flash) {
    return (
      <main className="fullscreen" style={{ background: flash.color + "22" }}>
        <div className="big popin" style={{ color: flash.color }}>{flash.text}</div>
      </main>
    );
  }

  // הצבעה: אני שופט את הניחוש של מישהו
  if (voteReq && !voted) {
    return (
      <main className="fullscreen">
        {timerChip}
        <p className="sub">{t("forehead.x_guesses", { name: nameOf(voteReq.pid) })}</p>
        <div className="big" style={{ margin: "10px 0 26px", color: "var(--gold)" }}>{voteReq.card}</div>
        <p className="sub" style={{ marginBottom: 14 }}>{t("forehead.was_right")}</p>
        <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 340 }}>
          <button className="btn" onClick={() => { setVoted(true); conn.sendGame({ a: "fh_vote", ok: true }); }}>{t("forehead.vote_right")}</button>
          <button className="btn danger" onClick={() => { setVoted(true); conn.sendGame({ a: "fh_vote", ok: false }); }}>{t("forehead.vote_wrong")}</button>
        </div>
      </main>
    );
  }

  if (phase === "voting") {
    return (
      <main className="fullscreen">
        {timerChip}
        <div className="pulse" style={{ fontSize: 70 }}>⚖️</div>
        <p className="sub" style={{ marginTop: 10 }}>{voted ? t("forehead.voted_wait") : t("forehead.judging")}</p>
      </main>
    );
  }

  // שלב ההנחה על המצח
  if (phase === "placing" || phase === "deal") {
    return (
      <main className="fullscreen" style={{ background: onForehead ? "#0f3320" : "var(--bg)" }}>
        {onForehead ? (
          // המסך כלפי החברים — מציג את הקלף שלי בענק (אני לא רואה אותו!)
          <div className="huge" style={{ transform: "rotate(180deg)", fontSize: "min(18vw,90px)" }}>{card}</div>
        ) : (
          <>
            <div style={{ fontSize: 60 }}>🤳</div>
            <h1 style={{ margin: "12px 0 4px" }}>{t("forehead.put_me")}</h1>
            <p className="sub">{t("forehead.face_out")}</p>
            <p className="sub" style={{ marginTop: 18 }}>{t("forehead.deck_ready", { deck: deckName, n: placedCount, of: total })}</p>
            {!sensorOk.current && (
              <button className="btn ghost" style={{ marginTop: 20, maxWidth: 260 }}
                onClick={() => { setOnForehead(true); conn.sendGame({ a: "fh_placed" }); }}>
                {t("forehead.manual")}
              </button>
            )}
          </>
        )}
      </main>
    );
  }

  // ניצלתי — צופה
  if (iAmSaved) {
    return (
      <main className="fullscreen" style={{ background: "radial-gradient(circle at 50% 20%, #1d4030, #0c0817)" }}>
        <div style={{ fontSize: 60 }}>😎</div>
        <div className="big" style={{ color: "var(--money)" }}>{t("forehead.you_saved")}</div>
        <p className="sub" style={{ marginTop: 8 }}>{t("forehead.enjoy")}<br />{t("forehead.turn_of", { name: nameOf(turnPid) })}</p>
      </main>
    );
  }

  // משחק פעיל — הטלפון על המצח
  return (
    <main className="fullscreen" style={{
      background: myTurn ? "radial-gradient(circle at 50% 20%, #0f3320, #0c0817)" : "var(--bg)",
      border: myTurn ? "4px solid var(--money)" : "none",
    }}>
      {turnPid && !showCard && timerChip}
      {showCard ? (
        <div className="huge" style={{ transform: "rotate(180deg)", fontSize: "min(18vw,90px)" }}>{card}</div>
      ) : myTurn ? (
        <>
          <div className="big" style={{ color: "var(--money)" }}>{t("forehead.your_turn")}</div>
          <p className="sub" style={{ margin: "10px 0 20px" }}>{t("forehead.ask_yn")}<br />{t("forehead.know_who")}</p>
          <button className="btn gold" style={{ maxWidth: 300 }} onClick={() => conn.sendGame({ a: "fh_guess" })}>
            {t("forehead.i_guess")}
          </button>
          <p className="sub" style={{ marginTop: 14, fontSize: 11 }}>{t("forehead.back_to_forehead")}</p>
        </>
      ) : (
        <>
          <div style={{ fontSize: 46 }}>🤫</div>
          <p className="sub" style={{ marginTop: 10 }}>{t("forehead.help_x", { name: nameOf(turnPid) })}</p>
          <p className="sub" style={{ marginTop: 6, fontSize: 11 }}>{t("forehead.no_peek")}</p>
        </>
      )}
    </main>
  );
}
