import { useState, type CSSProperties } from "react";
import { navigate } from "../App";
import { createRoom } from "../lib/connection";
import { track } from "../lib/analytics";
import { CATALOG } from "../../../shared/protocol";
import { GAME_COLORS } from "../games/registry";

/**
 * מדף המשחקים 🗂️ — כל משחק הוא פוסטר-מדבקה בצבע החתימה שלו.
 * לחיצה "מקלפת" את המדבקה (flip תלת-ממדי) ומראה את הצד האחורי:
 * ההסבר המלא איך משחקים + "שחקו בזה" שפותח חדר מיד.
 */
/** משחקים שיש להם פוסטר מצויר ב-public/stickers — לשאר מציגים אייקון ענק על צבע החתימה */
const POSTER_IDS = new Set([
  "whomost", "wall", "alias", "bombs", "forehead", "deathtouch",
  "demons", "trivia", "colorrules", "impostor", "simon", "hofrim", "thieves", "abyss",
]);

export default function GamesShelf() {
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function host() {
    if (busy) return;
    setBusy(true);
    try {
      const c = await createRoom();
      track("room_created", { from: "shelf" });
      navigate(`/r/${c}`);
    } catch {
      setBusy(false);
    }
  }

  return (
    <main className="shelf">
      <div className="shelf-head">
        <button className="shelf-back" onClick={() => navigate("/")} aria-label="חזרה">→</button>
        <h1 className="shelf-title">כל המשחקים</h1>
      </div>
      <p className="sub shelf-sub">לחצו על מדבקה כדי לקלף אותה ולקרוא איך משחקים 👆</p>

      <div className="shelf-grid">
        {CATALOG.map((g) => {
          const color = GAME_COLORS[g.id] ?? "#FFC531";
          const flipped = open === g.id;
          return (
            <div
              key={g.id}
              className={"poster-wrap" + (flipped ? " flipped" : "")}
              onClick={() => setOpen(flipped ? null : g.id)}
            >
              <div className="poster-inner">
                {/* קדמי — הפוסטר */}
                <div className="poster-face poster-front" style={{ "--gc": color } as CSSProperties}>
                  {POSTER_IDS.has(g.id) ? (
                    <img className="poster-art" src={`/stickers/poster-${g.id}.webp`} alt="" loading="lazy" />
                  ) : (
                    <div className="poster-art poster-art-fb">{g.icon}</div>
                  )}
                  <div className="poster-meta">
                    <b className="poster-name">{g.icon} {g.name}</b>
                    <span className="poster-tag">{g.tagline}</span>
                    <span className="poster-chip">👥 {g.minPlayers}-{g.maxPlayers}</span>
                  </div>
                </div>
                {/* אחורי — ההסבר */}
                <div className="poster-face poster-back" style={{ "--gc": color } as CSSProperties}>
                  <b className="poster-name">{g.icon} {g.name}</b>
                  <p className="poster-howto">{g.howTo ?? g.tagline}</p>
                  <span className="poster-chip">👥 {g.minPlayers}-{g.maxPlayers} שחקנים</span>
                  <button className="btn wa poster-play" disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      // משחק שחי כעמוד נפרד (המופע, החופרים) — לא חדר רגיל
                      if (g.external) { location.href = g.external; return; }
                      if (g.id === "show") { location.href = "/s"; return; }
                      host();
                    }}>
                    {busy ? "פותחים חדר..." : "🎉 שחקו בזה"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card shelf-how">
        <b>איך זה עובד?</b>
        <p className="sub">1️⃣ אחד פותח חדר ומקבל קוד ו-QR &nbsp;·&nbsp; 2️⃣ החברים סורקים עם המצלמה &nbsp;·&nbsp; 3️⃣ בוחרים משחק ומשחקים. בלי הורדות, בלי הרשמה, חינם.</p>
      </div>

      <button className="btn" onClick={host} disabled={busy} style={{ marginTop: 12 }}>
        {busy ? "פותח חדר..." : "🎉 פתח חדר חדש"}
      </button>
    </main>
  );
}
