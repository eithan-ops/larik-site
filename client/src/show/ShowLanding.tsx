/** לנדינג הדיג'י 🎛️ — "Start a show in 10 seconds". דו-לשוני, בלי הרשמה. */
import { useState } from "react";
import { navigate } from "./ShowApp";
import { createRoom } from "../lib/connection";
import { track } from "../lib/analytics";
import { t, BRAND, getLang, setLang, showPrefix } from "../lib/i18n";

export default function ShowLanding() {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const pfx = showPrefix();

  async function start() {
    setBusy(true);
    setErr("");
    try {
      const c = await createRoom();
      track("show_opened");
      navigate(`${pfx}/r/${c}?dj=1`);
    } catch {
      setErr(t("landErr"));
    }
    setBusy(false);
  }

  return (
    <main style={{ justifyContent: "center", gap: 8 }}>
      <button className="chip sc-chipbtn" style={{ position: "fixed", top: 14, insetInlineEnd: 14, zIndex: 5 }}
        onClick={() => setLang(getLang() === "he" ? "en" : "he")}>
        🌐 {getLang() === "he" ? "English" : "עברית"}
      </button>

      <div className="hero">
        <div className="hero-emojis" aria-hidden>
          <span>🕯️</span><span>🌊</span><span>✨</span><span>🥁</span><span>💜</span>
        </div>
        <div className="logo-big" style={{ fontSize: 44 }}>{BRAND}</div>
        <p style={{ fontSize: 19, fontWeight: 800, marginTop: 8 }}>🕯️ {t("landTagline")}</p>
        <p className="sub" style={{ fontSize: 14.5, marginTop: 6, maxWidth: 330 }}>{t("landSub")}</p>
      </div>

      <button className="btn" onClick={start} disabled={busy}>
        {busy ? t("landOpening") : t("landStart")}
      </button>
      <p className="sub" style={{ textAlign: "center", fontSize: 12, marginTop: 2 }}>{t("landHint")}</p>

      {err && (
        <p className="sub popin" style={{ textAlign: "center", marginTop: 8, color: "#ff8a8a", fontWeight: 700 }}>{err}</p>
      )}

      <div className="divider">{t("landHaveCode")}</div>
      <input
        className="input"
        placeholder={t("landCodePh")}
        maxLength={4}
        value={code}
        style={{ letterSpacing: 5, fontWeight: 900, fontSize: 20, textTransform: "uppercase", textAlign: "center" }}
        onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())}
        onKeyDown={(e) => { if (e.key === "Enter" && code.length === 4) navigate(`${pfx}/r/${code}`); }}
      />
      <button className="btn ghost" disabled={code.length !== 4} style={{ marginTop: 8 }}
        onClick={() => navigate(`${pfx}/r/${code}`)}>
        ✨ {t("landJoin")}
      </button>
    </main>
  );
}
