/**
 * "המתחזה" 🎭 — צד לקוח, מינימלי בכוונה.
 * הטלפון = הקלף הסודי שלך (hold-to-reveal). כל השאר קורה בקול סביב השולחן.
 * המארח: "חשוף את המתחזה" (כל המסכים מתהפכים יחד) + "סיבוב חדש".
 */
import { useEffect, useState } from "react";
import type { ImpostorServerMsg } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";
import { t } from "../lib/locale";

export default function ImpostorView({ room, me, conn, hub }: GameViewProps) {
  const [role, setRole] = useState<{ word: string; isImpostor: boolean; round: number } | null>(null);
  const [exposedInfo, setExposedInfo] = useState<{ impostorPid: string; word: string } | null>(null);
  const [holding, setHolding] = useState(false);
  const isHost = me === room.hostId;

  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? "";
  const emojiOf = (pid: string) => room.players.find((p) => p.id === pid)?.emoji ?? "🙂";

  useEffect(() => hub.subscribe((d) => {
    const m = d as ImpostorServerMsg;
    if (m.a === "im_role") {
      setRole({ word: m.word, isImpostor: m.isImpostor, round: m.round });
      setExposedInfo(null);
      Sfx.ding(); vibrate(40);
    } else if (m.a === "im_exposed") {
      setExposedInfo({ impostorPid: m.impostorPid, word: m.word });
      if (m.impostorPid === me) { Sfx.sadTrombone(); vibrate([100, 60, 300]); }
      else { Sfx.fanfare(); vibrate(80); }
    }
  }), [hub, me]);

  /* ---------- חשיפה — כל המסכים מתהפכים יחד ---------- */
  if (exposedInfo) {
    const itsMe = exposedInfo.impostorPid === me;
    return (
      <main className="fullscreen" style={{ background: itsMe ? "radial-gradient(circle at 50% 30%, #4a0b2a, var(--bg))" : "radial-gradient(circle at 50% 30%, #2b1a4d, var(--bg))" }}>
        <div style={{ fontSize: 80 }} className="popin">🎭</div>
        <div className="big" style={{ fontSize: 26, marginTop: 10 }}>
          {itsMe ? t("impostor.exposed_you") : t("impostor.the_impostor", { name: `${emojiOf(exposedInfo.impostorPid)} ${nameOf(exposedInfo.impostorPid)}` })}
        </div>
        <div className="card popin" style={{ marginTop: 16, maxWidth: 300, textAlign: "center" }}>
          <div className="sub">{t("impostor.word_was")}</div>
          <b style={{ fontSize: 28, color: "var(--gold)" }}>{exposedInfo.word}</b>
        </div>
        {isHost && (
          <button className="btn gold" style={{ maxWidth: 300, marginTop: 22 }}
            onPointerDown={() => conn.sendGame({ a: "im_next" })}>
            {t("impostor.new_round")}
          </button>
        )}
      </main>
    );
  }

  /* ---------- הקלף ---------- */
  return (
    <main className="fullscreen" style={{ justifyContent: "center", gap: 12, padding: "56px 18px 20px" }}>
      {role && <span className="chip">{t("impostor.round_n", { n: role.round })}</span>}
      <div style={{ fontSize: 44 }}>🎭</div>

      <div
        onPointerDown={() => { setHolding(true); vibrate(15); }}
        onPointerUp={() => setHolding(false)}
        onPointerLeave={() => setHolding(false)}
        className="card"
        style={{ textAlign: "center", padding: "26px 16px", userSelect: "none", touchAction: "none",
          width: "100%", maxWidth: 340, minHeight: 130, display: "flex", flexDirection: "column", justifyContent: "center",
          border: holding ? "1.5px solid var(--gold)" : undefined }}>
        {!role ? (
          <p className="sub">{t("impostor.dealing")}</p>
        ) : holding ? (
          role.isImpostor ? (
            <div>
              <div style={{ fontSize: 38 }}>🥸</div>
              <b style={{ color: "#ff8a8a", fontSize: 24 }}>{t("impostor.you_impostor")}</b>
              <p className="sub" style={{ marginTop: 8, fontSize: 12 }}>
                {t("impostor.no_word1")}<br />{t("impostor.no_word2")}
              </p>
            </div>
          ) : (
            <div>
              <div className="sub" style={{ fontSize: 12 }}>{t("impostor.secret_word")}</div>
              <b style={{ fontSize: 34, color: "var(--gold)" }}>{role.word}</b>
            </div>
          )
        ) : (
          <div>
            <div style={{ fontSize: 30 }}>👁️</div>
            <b style={{ fontSize: 16 }}>{t("impostor.hold_to_see")}</b>
            <p className="sub" style={{ marginTop: 4, fontSize: 11 }}>{t("impostor.secret_hint")}</p>
          </div>
        )}
      </div>

      <p className="sub" style={{ textAlign: "center", fontSize: 12.5, maxWidth: 320, lineHeight: 1.7 }}>
        {t("impostor.how1")}<br />
        {t("impostor.how2")}<br />
        {t("impostor.how3")}
      </p>

      {isHost && (
        <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 340 }}>
          <button className="btn gold" style={{ flex: 2 }} onPointerDown={() => conn.sendGame({ a: "im_expose" })}>
            {t("impostor.expose")}
          </button>
          <button className="btn ghost" style={{ flex: 1 }} onPointerDown={() => conn.sendGame({ a: "im_next" })}>
            {t("impostor.new")}
          </button>
        </div>
      )}
    </main>
  );
}
