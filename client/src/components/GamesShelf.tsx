import { useState, type CSSProperties } from "react";
import { navigate } from "../App";
import { createRoom } from "../lib/connection";
import { track } from "../lib/analytics";
import { CATALOG, SPODS_CATEGORY } from "../../../shared/protocol";
import { GAME_COLORS } from "../games/registry";
import { t, gameText } from "../lib/locale";

/**
 * מדף המשחקים 🗂️ — כל משחק הוא פוסטר-מדבקה בצבע החתימה שלו.
 * לחיצה "מקלפת" את המדבקה (flip תלת-ממדי) ומראה את הצד האחורי:
 * ההסבר המלא איך משחקים + "שחקו בזה" שפותח חדר מיד.
 */
/** משחקים שיש להם פוסטר מצויר ב-public/stickers — לשאר מציגים אייקון ענק על צבע החתימה */
const POSTER_IDS = new Set([
  "whomost", "wall", "alias", "bombs", "forehead", "deathtouch",
  "demons", "trivia", "colorrules", "impostor", "undercover", "simon", "hofrim", "thieves", "abyss", "tanks", "metro",
  "sp_colors", "sp_duel", "sp_star", "sp_beep", "sp_steal", "sp_survive", "sp_relay", "sp_stations", "sp_statue", "sp_pacer",
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
        <button className="shelf-back mirror" onClick={() => navigate("/")} aria-label={t("shelf.back")}>→</button>
        <h1 className="shelf-title">{t("shelf.all_games")}</h1>
      </div>
      <p className="sub shelf-sub">{t("shelf.tap_hint")}</p>

      <div className="shelf-grid">
        {CATALOG.filter((g) => g.category !== SPODS_CATEGORY).map((g) => renderPoster(g))}
      </div>

      <div className="shelf-head" style={{ marginTop: 18 }}>
        <h2 className="shelf-title" style={{ fontSize: 22 }}>🏃 {t("games.spods.category")}</h2>
      </div>
      <p className="sub shelf-sub">{t("shelf.spods_sub")}</p>
      <div className="shelf-grid">
        {CATALOG.filter((g) => g.category === SPODS_CATEGORY).map((g) => renderPoster(g))}
      </div>
      <ShelfFooter host={host} busy={busy} />
    </main>
  );

  function renderPoster(g: (typeof CATALOG)[number]) {
    {
          const color = GAME_COLORS[g.id] ?? "#FFC531";
          const flipped = open === g.id;
          const gt = gameText(g);
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
                    <b className="poster-name">{g.icon} {gt.name}</b>
                    <span className="poster-tag">{gt.tagline}</span>
                    <span className="poster-chip">👥 {g.minPlayers}-{g.maxPlayers}</span>
                  </div>
                </div>
                {/* אחורי — ההסבר */}
                <div className="poster-face poster-back" style={{ "--gc": color } as CSSProperties}>
                  <b className="poster-name">{g.icon} {gt.name}</b>
                  <p className="poster-howto">{gt.howTo}</p>
                  <span className="poster-chip">{t("shelf.players_chip", { min: g.minPlayers, max: g.maxPlayers })}</span>
                  <button className="btn wa poster-play" disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      // משחק שחי כעמוד נפרד (המופע, החופרים) — לא חדר רגיל
                      if (g.external) { location.href = g.external; return; }
                      if (g.id === "show") { location.href = "/s"; return; }
                      host();
                    }}>
                    {busy ? t("shelf.opening") : t("shelf.play_this")}
                  </button>
                </div>
              </div>
            </div>
          );
    }
  }
}

function ShelfFooter({ host, busy }: { host: () => void; busy: boolean }) {
  return (
    <>
      <div className="card shelf-how">
        <b>{t("shelf.how_title")}</b>
        <p className="sub">{t("shelf.how_body")}</p>
      </div>

      <button className="btn" onClick={host} disabled={busy} style={{ marginTop: 12 }}>
        {busy ? t("home.opening") : t("home.new_room")}
      </button>
    </>
  );
}
