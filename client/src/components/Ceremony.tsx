import { useEffect, useMemo } from "react";
import type { RoomSnapshot } from "../../../shared/protocol";
import { Sfx, vibrate } from "../lib/audio";

const COLORS = ["#00E676", "#b26bff", "#ffce3c", "#ff4d9d", "#5c8aff"];

/** טקס הסיום האחיד — המנצח מוזהב, הליצן מוכרז אצל כולם */
export default function Ceremony({ room, me, isHost, onBackToLobby }: {
  room: RoomSnapshot; me: string; isHost: boolean; onBackToLobby: () => void;
}) {
  const c = room.ceremony!;
  const iWon = me === c.winnerId;
  const iLost = me === c.loserId;
  const winner = room.players.find((p) => p.id === c.winnerId);
  const loser = room.players.find((p) => p.id === c.loserId);

  useEffect(() => {
    if (iWon) { Sfx.fanfare(); vibrate([80, 60, 80, 60, 200]); }
    else if (iLost) { Sfx.sadTrombone(); vibrate(400); }
    else Sfx.pop();
  }, []);

  const confetti = useMemo(() =>
    iLost ? [] : Array.from({ length: 50 }, (_, i) => ({
      right: Math.random() * 100,
      dur: 1.5 + Math.random() * 2,
      delay: Math.random() * 0.8,
      color: COLORS[i % COLORS.length],
    })), [iLost]);

  const bg = iWon
    ? "radial-gradient(circle at 50% 30%, #4a3b00, #0B0C11)"
    : iLost
      ? "radial-gradient(circle at 50% 30%, #4a0b0b, #0B0C11)"
      : "var(--bg)";

  const ranking = [...room.players]
    .filter((p) => c.eveningScores[p.id] !== undefined)
    .sort((a, b) => (c.eveningScores[b.id] ?? 0) - (c.eveningScores[a.id] ?? 0));

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
          <div className="big" style={{ color: "var(--gold)" }}>ניצחת!</div>
        </>
      ) : iLost ? (
        <>
          <div className="huge shake">🤡</div>
          <div className="big" style={{ color: "#ff8a8a" }}>הליצן של הסיבוב</div>
        </>
      ) : (
        <>
          <div className="huge popin">{winner?.emoji ?? "🏆"}</div>
          <div className="big">{winner?.name} ניצח!</div>
          {loser && <p className="sub" style={{ marginTop: 8, fontSize: 16 }}>
            הליצן של הסיבוב: <b style={{ color: "#ff8a8a" }}>{loser.emoji} {loser.name}</b> 🤡
          </p>}
        </>
      )}

      <div className="card" style={{ marginTop: 26, width: "100%", maxWidth: 340 }}>
        <div className="sub" style={{ marginBottom: 6 }}>לוח הערב 🌙</div>
        {ranking.map((p, i) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 2px", fontSize: 15 }}>
            <span>{i === 0 ? "👑 " : ""}{p.emoji} {p.name}</span>
            <b style={{ color: "var(--money)" }}>{c.eveningScores[p.id] ?? 0}</b>
          </div>
        ))}
      </div>

      {isHost && (
        <button className="btn" style={{ marginTop: 16, maxWidth: 340 }} onClick={onBackToLobby}>
          עוד משחק! 🔁
        </button>
      )}
    </main>
  );
}
