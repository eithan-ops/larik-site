import { useState } from "react";
import { navigate } from "../App";
import { createRoom } from "../lib/connection";
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
          <span>🎉</span><span>💣</span><span>🫵</span><span>🧠</span><span>👹</span>
        </div>
        <div className="logo-big">LARIK</div>
        <p className="sub" style={{ fontSize: 16, marginTop: 6 }}>
          משחקי חברה. הטלפון של כל אחד — אביזר במשחק.
        </p>
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
