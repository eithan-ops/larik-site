import { useState } from "react";
import { navigate } from "../App";
import { createRoom } from "../lib/connection";
import { track } from "../lib/analytics";
import QRScanner from "./QRScanner";

export default function Home() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState("");

  async function host() {
    setBusy(true);
    setErr("");
    try {
      const c = await createRoom();
      track("room_created");
      navigate(`/r/${c}`);
    } catch {
      setErr("השרת מתעורר... נסו שוב עוד כמה שניות 😴");
    }
    setBusy(false);
  }

  function onScan(text: string) {
    setScanning(false);
    // תומך גם בקישור מלא (https://.../r/ABCD) וגם בקוד גולמי
    const m = text.match(/\/r\/([a-zA-Z]{4})/) || text.match(/^([a-zA-Z]{4})$/);
    if (m) { setErr(""); navigate(`/r/${m[1].toUpperCase()}`); }
    else setErr("זה לא QR של חדר LARIK 🤔 — סרקו את הקוד מהמסך של המארח");
  }

  return (
    <main style={{ justifyContent: "center", gap: 8 }}>
      {scanning && <QRScanner onScan={onScan} onClose={() => setScanning(false)} />}

      <div className="hero">
        <div className="hero-emojis" aria-hidden>
          <span>🎭</span><span>💣</span><span>🫵</span><span>🧠</span><span>🕯️</span>
        </div>
        <div className="logo-big">LARIK</div>
        <p style={{ fontSize: 19, fontWeight: 800, marginTop: 8 }}>ברוכים הבאים ללאריק 👋</p>
        <p className="sub" style={{ fontSize: 15, marginTop: 6, maxWidth: 320 }}>
          ערב משחקים שלם — בלי קופסה, בלי חלקים, בלי הורדות.
          הטלפון של כל אחד הופך לאביזר במשחק.
        </p>
      </div>

      <div className="bento">
        <div className="bento-card primary" role="button" tabIndex={0}
          onClick={() => document.getElementById("game-actions")?.scrollIntoView({ behavior: "smooth" })}>
          <span className="big">🎮</span>
          <b>ערב משחקים</b>
          <span className="sub">11 משחקים · 3-15 חברים<br />סביב שולחן אחד</span>
        </div>
        <div className="bento-card" role="button" tabIndex={0} onClick={() => navigate("/show")}>
          <span className="big">🕯️</span>
          <b>מופע</b>
          <span className="sub">הקהל הוא המסך<br />לאירועים והופעות</span>
        </div>
      </div>

      <div className="card" style={{ padding: "14px 16px", marginBottom: 4 }} id="game-actions">
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
          <span style={{ fontSize: 20 }}>1️⃣</span>
          <p className="sub" style={{ fontSize: 13.5 }}><b style={{ color: "var(--text)" }}>אחד פותח חדר</b> — ומקבל קוד ו-QR להראות לכולם.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
          <span style={{ fontSize: 20 }}>2️⃣</span>
          <p className="sub" style={{ fontSize: 13.5 }}><b style={{ color: "var(--text)" }}>החברים סורקים</b> עם המצלמה — ותוך 5 שניות כולם בפנים.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 20 }}>3️⃣</span>
          <p className="sub" style={{ fontSize: 13.5 }}><b style={{ color: "var(--text)" }}>בוחרים משחק ומשחקים</b> — טריוויה, מתחזה, פצצות ועוד 9.</p>
        </div>
      </div>

      <button className="btn" onClick={host} disabled={busy}>
        {busy ? "פותח חדר..." : "🎉 פתח חדר חדש"}
      </button>

      <button className="btn social" style={{ marginTop: 8 }} onClick={() => { setErr(""); setScanning(true); }}>
        📷 סרוק QR של המארח
      </button>

      {err && (
        <p className="sub popin" style={{ textAlign: "center", marginTop: 10, color: "#ff8a8a", fontWeight: 700 }}>
          {err}
        </p>
      )}

      <div className="divider">או הצטרף עם קוד</div>
      <input
        className="input"
        placeholder="ABCD"
        maxLength={4}
        value={code}
        style={{ letterSpacing: 8, fontWeight: 900, fontSize: 24, textTransform: "uppercase" }}
        onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())}
      />
      <button className="btn ghost" style={{ marginTop: 8 }} disabled={code.length !== 4}
        onClick={() => navigate(`/r/${code}`)}>
        הצטרף 🚪
      </button>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 34, flexWrap: "wrap" }}>
        <span className="chip">👥 3–10 שחקנים</span>
        <span className="chip">⚡ בלי התקנה</span>
        <span className="chip">🔒 בלי הרשמה</span>
      </div>
    </main>
  );
}
