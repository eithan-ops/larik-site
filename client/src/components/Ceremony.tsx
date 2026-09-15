import { useEffect, useMemo, useState } from "react";
import type { RoomSnapshot } from "../../../shared/protocol";
import { Sfx, vibrate } from "../lib/audio";
import { shareEveningBoard } from "../lib/sharecard";
import { shareEndCard } from "../lib/endcard";
import { rememberGroup } from "../lib/group";
import InstallPrompt from "./InstallPrompt";
import { track } from "../lib/analytics";
import { t, lt, roomUrl } from "../lib/locale";

const COLORS = ["#8b5cf6", "#ec4899", "#ffc93c", "#34e89e", "#5c8aff"];
const DRUMROLL_MS = 1700;

/** טקס הסיום האחיד — תיפוף מתח, ואז: המנצח מוזהב, הליצן מוכרז אצל כולם */
export default function Ceremony({ room, me, isHost, onSaveGroup, onBackToLobby }: {
  room: RoomSnapshot; me: string; isHost: boolean;
  onSaveGroup: (name: string) => void;
  onBackToLobby: () => void;
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
  const [groupName, setGroupName] = useState("");
  const [namingGroup, setNamingGroup] = useState(false);
  const raw = c.awards?.[me];
  // התואר מגיע כמפתחות — מתורגם כאן פעם אחת, וכרטיס השיתוף (canvas) מקבל טקסט מוכן
  const myAward = raw ? { ...raw, title: lt(raw.title), detail: raw.detail ? lt(raw.detail) : undefined, headline: raw.headline ? lt(raw.headline) : undefined } : undefined;
  const title = lt(c.title);
  const group = c.group ?? room.group;

  // חבורה שנוצרה או שוחקה — נשמרת במכשיר, כך שהיא תופיע במסך הבית בפעם הבאה
  useEffect(() => {
    if (group) rememberGroup(group.id, group.name);
  }, [group?.id, group?.name]);

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
      title,
      rows: ranking0.map((p) => ({ name: p.name, emoji: p.emoji, score: c.eveningScores[p.id] ?? 0 })),
      clownName: loser ? `${loser.emoji} ${loser.name}` : undefined,
    });
    if (out === "downloaded") { setShareMsg(t("ceremony.image_downloaded")); setTimeout(() => setShareMsg(""), 3000); }
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
        name: meP?.name ?? t("app.player"),
        emoji: meP?.emoji ?? "🙂",
        award: myAward,
        points: c.eveningScores[me] ?? 0,
        place: Math.max(1, ranked.findIndex((p) => p.id === me) + 1),
        totalPlayers: ranked.length || room.players.length,
        gamesPlayed: c.gamesPlayed ?? 1,
        roomCode: room.code,
        groupName: group?.name,
        groupEvening: group?.evenings,
        joinUrl: roomUrl(room.code),
      });
      if (out === "downloaded") { setShareMsg(t("ceremony.card_downloaded")); setTimeout(() => setShareMsg(""), 3000); }
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
        <div className="big" style={{ marginTop: 16, color: "var(--muted)" }}>{t("ceremony.drumroll")}</div>
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
          <div className="big" style={{ color: "var(--gold)" }}>{winnerIds.length > 1 ? t("ceremony.tie_won") : t("ceremony.you_won")}</div>
          {winnerIds.length > 1 && (
            <p className="sub" style={{ marginTop: 8, fontSize: 16 }}>
              {winners.map((w) => `${w!.emoji} ${w!.name}`).join(" · ")}
            </p>
          )}
        </>
      ) : iLost ? (
        <>
          <div className="huge shake">🤡</div>
          <div className="big" style={{ color: "#ff8a8a" }}>{t("ceremony.clown")}</div>
        </>
      ) : winner ? (
        <>
          <div className="huge popin">{winnerIds.length > 1 ? "🤝" : winner.emoji}</div>
          <div className="big">
            {winnerIds.length > 1
              ? t("ceremony.tie_named", { names: winners.map((w) => w!.name).join(t("ceremony.and")) })
              : t("ceremony.won_named", { name: winner.name })}
          </div>
          {loser && <p className="sub" style={{ marginTop: 8, fontSize: 16 }}>
            {t("ceremony.clown_named")}<b style={{ color: "#ff8a8a" }}>{loser.emoji} <bdi>{loser.name}</bdi></b> 🤡
          </p>}
        </>
      ) : (
        /* משחק שיתופי — אין מנצח יחיד, כולם ביחד */
        <>
          <div className="huge popin">🙌</div>
          <div className="big" style={{ fontSize: 26, padding: "0 10px" }}>{title}</div>
          <p className="sub" style={{ marginTop: 8, fontSize: 16 }}>{t("ceremony.coop_done")}</p>
        </>
      )}

      <span className="chip popin" style={{ marginTop: 14 }}>{title}</span>

      {/* התואר האישי — מגיע אחרי ההכרזה הכללית, כי הוא ההפתעה השנייה של הרגע */}
      {myAward && (
        <div className="card popin" style={{
          marginTop: 14, width: "100%", maxWidth: 340, textAlign: "center",
          animationDelay: ".5s", animationFillMode: "backwards",
        }}>
          <div className="sub" style={{ fontSize: 12, letterSpacing: ".08em" }}>{t("ceremony.your_award")}</div>
          <div style={{ fontSize: 46, lineHeight: 1.1, marginTop: 4 }}>{myAward.emoji}</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 24, marginTop: 2 }}>{myAward.title}</div>
          {myAward.detail && (
            <div className="sub" style={{ marginTop: 4, fontSize: 14, fontWeight: 700 }}>{myAward.detail}</div>
          )}
          <button className="btn social" style={{ marginTop: 12 }} onClick={shareCard} disabled={carding}>
            {carding ? t("ceremony.preparing_card") : t("ceremony.share_card")}
          </button>
        </div>
      )}

      <div className="card" style={{ marginTop: 14, width: "100%", maxWidth: 340 }}>
        <div className="sub" style={{ marginBottom: 6 }}>{t("ceremony.evening_board")}</div>
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
              <span>{medal} {p.emoji} <bdi>{p.name}</bdi>{p.id === me ? t("lobby.me") : ""}</span>
              <b style={{ color: i === 0 ? "var(--gold)" : "var(--money)" }}>{c.eveningScores[p.id] ?? 0}</b>
            </div>
          );
        })}
      </div>

      {/* החבורה: הרגע הנכון היחיד לבקש את זה הוא כאן, כשהערב הצליח וכולם עוד צוחקים */}
      {group ? (
        <div className="card popin" style={{ marginTop: 12, width: "100%", maxWidth: 340 }}>
          <div className="sub" style={{ marginBottom: 6 }}>
            {t("ceremony.group_line", { name: group.name, season: group.seasonNo, evening: group.evenings })}
          </div>
          {group.table.slice(0, 6).map((m, i) => (
            <div key={m.pid} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "4px 10px", fontSize: i === 0 ? 15.5 : 14.5,
              fontWeight: i === 0 ? 800 : 500,
              background: i === 0 ? "rgba(255,201,60,.1)" : undefined, borderRadius: 10,
            }}>
              <span>{i === 0 ? "🥇" : `${i + 1}.`} {m.emoji} {m.name}</span>
              <b style={{ color: i === 0 ? "var(--gold)" : "var(--money)" }}>{m.points}</b>
            </div>
          ))}
          {group.records[0] && (
            <p className="sub" style={{ marginTop: 6, fontSize: 12 }}>
              {group.records[0].label}: <b>{group.records[0].name}</b>
            </p>
          )}
          <p className="sub" style={{ marginTop: 4, fontSize: 11.5 }}>
            {t("ceremony.season_ends", { n: group.daysLeftInSeason })}
          </p>
        </div>
      ) : isHost && (
        namingGroup ? (
          <div className="card popin" style={{ marginTop: 12, width: "100%", maxWidth: 340 }}>
            <div className="sub" style={{ marginBottom: 6 }}>{t("ceremony.group_name_q")}</div>
            <input
              autoFocus value={groupName} maxLength={24}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={t("ceremony.group_name_ph")}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 12, fontSize: 16,
                border: "2px solid var(--line2)", background: "var(--card2)", color: "var(--text)",
              }}
            />
            <button
              className="btn gold" style={{ marginTop: 10 }}
              disabled={!groupName.trim()}
              onClick={() => { Sfx.ding(); onSaveGroup(groupName.trim()); setNamingGroup(false); }}
            >
              {t("ceremony.save_group")}
            </button>
          </div>
        ) : (
          <button className="btn gold" style={{ marginTop: 12, maxWidth: 340 }} onClick={() => setNamingGroup(true)}>
            {t("ceremony.save_group_open")}
          </button>
        )
      )}

      {/* ההזמנה להתקנה מגיעה רק כאן — אחרי ערב מוצלח, כשיש כבר סיבה */}
      <InstallPrompt />

      <button className="btn ghost" style={{ marginTop: 10, maxWidth: 340 }} onClick={share}>
        {t("ceremony.share_board")}
      </button>
      {shareMsg && <p className="sub popin" style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700 }}>{shareMsg}</p>}

      {isHost ? (
        <button className="btn" style={{ marginTop: 10, maxWidth: 340 }} onClick={onBackToLobby}>
          {t("ceremony.again")}
        </button>
      ) : (
        <p className="sub popin" style={{ marginTop: 12, fontSize: 13 }}>
          {t("ceremony.host_next")}
        </p>
      )}
    </main>
  );
}
