import { useState } from "react";
import { navigate } from "../App";
import { createRoom } from "../lib/connection";
import QRScanner from "./QRScanner";

export default function Home() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function host() {
    setBusy(true);
    try {
      const c = await createRoom();
      navigate(`/r/${c}`);
    } catch {
      alert("השרת לא זמין כרגע");
    }
    setBusy(false);
  }

  function onScan(text: string) {
    setScanning(false);
    // תומך גם בקישור מלא (https://.../r/ABCD) וגם בקוד גולמי
    const m = text.match(/\/r\/([a-zA-Z]{4})/) || text.match(/^([a-zA-Z]{4})$/);
    if (m) navigate(`/r/${m[1].toUpperCase()}`);
  }

  return (
    <main style={{ justifyContent: "center", gap: 8 }}>
      {scanning && <QRScanner onScan={onScan} onClose={() => setScanning(false)} />}

      <div className="logo-big">LARIK</div>
      <p className="sub" style={{ textAlign: "center", marginBottom: 30, fontSize: 16 }}>
        משחקי חברה. הטלפון של כל אחד — אביזר במשחק. 🎮
      </p>

      <button className="btn" onClick={host} disabled={busy}>
        {busy ? "פותח חדר..." : "🎉 פתח חדר חדש"}
      </button>

      <button className="btn social" style={{ marginTop: 8 }} onClick={() => setScanning(true)}>
        📷 סרוק QR של המארח
      </button>

      <div className="sub" style={{ textAlign: "center", margin: "18px 0 10px" }}>או הצטרף עם קוד:</div>
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

      <p className="sub" style={{ textAlign: "center", marginTop: 40, fontSize: 11.5 }}>
        3–10 שחקנים · בלי התקנה · בלי הרשמה
      </p>
    </main>
  );
}
