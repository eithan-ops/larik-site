import { useEffect, useMemo, useState } from "react";
import type { RoomSnapshot } from "../../../shared/protocol";
import { Sfx, vibrate } from "../lib/audio";
import { shareEveningBoard } from "../lib/sharecard";
import { shareEndCard } from "../lib/endcard";
import { track } from "../lib/analytics";

const COLORS = ["#8b5cf6", "#ec4899", "#ffc93c", "#34e89e", "#5c8aff"];
const DRUMROLL_MS = 1700;

/** טקס הסיום האחיד — תיפוף מתח, ואז: המנצח מוזהב, הליצן מוכרז אצל כולם */
export default function Ceremony({ room, me, isHost, onBackToLobby }: {
  room: RoomSnapshot; me: string; isHost: boolean; onBackToLobby: () => void;
}) {
  const c = room.ceremony!;
  const winnerIds = c.winnerIds ?? (c.winnerId ? [c.winnerId] : []);
  const iWon = winnerIds.includes(me);
  const iLost = me === c.loserId;
  const winner = room.players.find((p) => p.id === c.winnerId);
  const winners = winnerIds.map((id) => room.players.find((p) => p.id === id)).filter(Boolean);
  const loser = room.players.find((p) => p.id === c.loserId);
  // דרמטורגיה: רגע של חושך ותיפוף לפני החשיפה — הציפייה היא חצי מהכיף
  const [revealed, setRevealed] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  const [carding, setCarding] = useState(false);
  const myAward = c.awards?.[me];

  useEffect(() => {
    Sfx.drumroll();
    vibrate([30, 40, 30, 40, 30]);
    const t = setTimeout(() => setRevealed(true), DRUMROLL_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!revealed) return;
    if (iWon) { Sfx.fanfare(); vibrate([80, 60, 80, 60, 200]); }
    else if (iLost) { Sfx.sadTrombone(); vibrate(400); }
    else Sfx.pop();
  }, [revealed]);

  async function share() {
    track("board_shared");
    const ranking0 = [...room.players]
      .filter((p) => c.eveningScores[p.id] !== undefined)
      .sort((a, b) => (c.eveningScores[b.id] ?? 0) - (c.eveningScores[a.id] ?? 0));
    const out = await shareEveningBoard({
      title: c.title,
      rows: ranking0.map((p) => ({ name: p.name, emoji: p.emoji, score: c.eveningScores[p.id] ?? 0 })),
      clownName: loser ? `${loser.emoji} ${loser.name}` : undefined,
    });
    if (out === "downloaded") { setShareMsg("התמונה ירדה — שלחו אותה לקבוצה 💬"); setTimeout(() => setShareMsg(""), 3000); }
  }

  /** הכרטיס האישי — לכל טלפון יש אחד משלו, וזה מה שמייצר את השיתופים */
  async function shareCard() {
    if (!myAward || carding) return;
    setCarding(true);
    track("card_shared");
    const meP = room.players.find((p) => p.id === me);
    const ranked = [...room.players]
      .filter((p) => c.eveningScores[p.id] !== undefined)
      .sort((a, b) => (c.eveningScores[b.id] ?? 0) - (c.eveningScores[a.id] ?? 0));
    try {
      const out = await shareEndCard({
        name: meP?.name ?? "שחקן",
        emoji: meP?.emoji ?? "🙂",
        award: myAward,
        points: c.eveningScores[me] ?? 0,
        place: Math.max(1, ranked.findIndex((p) => p.id === me) + 1),
        totalPlayers: ranked.length || room.players.length,
        gamesPlayed: c.gamesPlayed ?? 1,
        roomCode: room.code,
        joinUrl: `${location.origin}/r/${room.code}`,
      });
      if (out === "downloaded") { setShareMsg("הכרטיס ירד — שלחו אותו לחבר'ה 💬"); setTimeout(() => setShareMsg(""), 3000); }
    } finally {
      setCarding(false);
    }
  }

  const confetti = useMemo(() =>
    iLost ? [] : Array.from({ length: 50 }, (_, i) => ({
      right: Math.random() * 100,
      dur: 1.5 + Math.random() * 2,
      delay: Math.random() * 0.8,
      color: COLORS[i % COLORS.length],
    })), [iLost]);

  const bg = iWon
    ? "radial-gradient(circle at 50% 30%, #4a3b00, #0c0817)"
    : iLost
      ? "radial-gradient(circle at 50% 30%, #4a0b0b, #0c0817)"
      : "radial-gradient(circle at 50% 30%, #1d1435, #0c0817)";

  const ranking = [...room.players]
    .filter((p) => c.eveningScores[p.id] !== undefined)
    .sort((a, b) => (c.eveningScores[b.id] ?? 0) - (c.eveningScores[a.id] ?? 0));

  /* רגע המתח — חושך, תיפוף, ואז הכול מתפוצץ */
  if (!revealed) {
    return (
      <main className="fullscreen" style={{ background: "radial-gradient(circle at 50% 40%, #171029, #060411)" }}>
        <div className="huge shake">🥁</div>
        <div className="big" style={{ marginTop: 16, color: "var(--muted)" }}>ורגע האמת...</div>
      </main>
    );
  }

  return (
    <main className="fullscreen" style={{ background: bg, position: "relative", overflow: "hidden" }}>
      {confetti.map((cf, i) => (
        <span key={i} className="confetti" style={{
          right: cf.right + "%", background: cf.color,
          animationDuration: cf.dur + "s", animationDelay: cf.delay + "s",
          borderRadius: i % 2 ? "50%" : 2,
        }} />
      ))}

      {iWon ? (
        <>
          <div className="huge popin">👑</div>
          <div className="big" style={{ color: "var(--gold)" }}>{winnerIds.length > 1 ? "תיקו — ניצחתם ביחד!" : "ניצחת!"}</div>
          {winnerIds.length > 1 && (
            <p className="sub" style={{ marginTop: 8, fontSize: 16 }}>
              {winners.map((w) => `${w!.emoji} ${w!.name}`).join(" · ")}
            </p>
          )}
        </>
      ) : iLost ? (
        <>
          <div className="huge shake">🤡</div>
          <div className="big" style={{ color: "#ff8a8a" }}>הליצן של הסיבוב</div>
        </>
      ) : winner ? (
        <>
          <div className="huge popin">{winnerIds.length > 1 ? "🤝" : winner.emoji}</div>
          <div className="big">
            {winnerIds.length > 1
              ? `תיקו! ${winners.map((w) => w!.name).join(" ו")} ניצחו`
              : `${winner.name} ניצח!`}
          </div>
          {loser && <p className="sub" style={{ marginTop: 8, fontSize: 16 }}>
            הליצן של הסיבוב: <b style={{ color: "#ff8a8a" }}>{loser.emoji} {loser.name}</b> 🤡
          </p>}
        </>
      ) : (
        /* משחק שיתופי — אין מנצח יחיד, כולם ביחד */
        <>
          <div className="huge popin">🙌</div>
          <div className="big" style={{ fontSize: 26, padding: "0 10px" }}>{c.title}</div>
          <p className="sub" style={{ marginTop: 8, fontSize: 16 }}>שיחקתם כצוות — כל הכבוד!</p>
        </>
      )}

      <span className="chip popin" style={{ marginTop: 14 }}>{c.title}</span>

      {/* התואר האישי — מגיע אחרי ההכרזה הכללית, כי הוא ההפתעה השנייה של הרגע */}
      {myAward && (
        <div className="card popin" style={{
          marginTop: 14, width: "100%", maxWidth: 340, textAlign: "center",
          animationDelay: ".5s", animationFillMode: "backwards",
        }}>
          <div className="sub" style={{ fontSize: 12, letterSpacing: ".08em" }}>התואר שלך הערב</div>
          <div style={{ fontSize: 46, lineHeight: 1.1, marginTop: 4 }}>{myAward.emoji}</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 24, marginTop: 2 }}>{myAward.title}</div>
          {myAward.detail && (
            <div className="sub" style={{ marginTop: 4, fontSize: 14, fontWeight: 700 }}>{myAward.detail}</div>
          )}
          <button className="btn social" style={{ marginTop: 12 }} onClick={shareCard} disabled={carding}>
            {carding ? "מכין את הכרטיס…" : "📸 שתפו את הכרטיס שלכם"}
          </button>
        </div>
      )}

      <div className="card" style={{ marginTop: 14, width: "100%", maxWidth: 340 }}>
        <div className="sub" style={{ marginBottom: 6 }}>לוח הערב 🌙</div>
        {ranking.map((p, i) => {
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "·";
          return (
            <div key={p.id} className="popin" style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: i === 0 ? "8px 10px" : "5px 10px", fontSize: i === 0 ? 16.5 : 15,
              animationDelay: `${0.15 * i}s`, animationFillMode: "backwards",
              background: i === 0 ? "rgba(255,201,60,.1)" : undefined,
              borderRadius: 12, fontWeight: i === 0 ? 800 : 500,
            }}>
              <span>{medal} {p.emoji} {p.name}{p.id === me ? " (אני)" : ""}</span>
              <b style={{ color: i === 0 ? "var(--gold)" : "var(--money)" }}>{c.eveningScores[p.id] ?? 0}</b>
            </div>
          );
        })}
      </div>

      <button className="btn ghost" style={{ marginTop: 10, maxWidth: 340 }} onClick={share}>
        📤 שתפו את לוח הערב
      </button>
      {shareMsg && <p className="sub popin" style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700 }}>{shareMsg}</p>}

      {isHost ? (
        <button className="btn" style={{ marginTop: 10, maxWidth: 340 }} onClick={onBackToLobby}>
          עוד משחק! 🔁
        </button>
      ) : (
        <p className="sub popin" style={{ marginTop: 12, fontSize: 13 }}>
          👑 המארח בוחר את המשחק הבא...
        </p>
      )}
    </main>
  );
}
