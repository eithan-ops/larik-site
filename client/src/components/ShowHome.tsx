import { useState } from "react";
import { navigate } from "../App";
import { createRoom } from "../lib/connection";
import { track } from "../lib/analytics";

/** עולם המופע — כניסה נפרדת מערב המשחקים */
export default function ShowHome() {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  async function openShow() {
    setBusy(true);
    setErr("");
    try {
      const c = await createRoom();
      track("show_opened");
      navigate(`/r/${c}?show=1`);
    } catch {
      setErr("השרת מתעורר... נסו שוב עוד כמה שניות 😴");
    }
    setBusy(false);
  }

  return (
    <main style={{ justifyContent: "center", gap: 8 }}>
      <div className="hero">
        <div className="hero-emojis" aria-hidden>
          <span>🕯️</span><span>🌊</span><span>✨</span><span>🥁</span><span>💜</span>
        </div>
        <div className="logo-big">LARIK</div>
        <p style={{ fontSize: 19, fontWeight: 800, marginTop: 8 }}>מופע 🕯️ הקהל הוא המסך</p>
        <p className="sub" style={{ fontSize: 14.5, marginTop: 6, maxWidth: 330 }}>
          כל טלפון בקהל הופך לפיקסל אחד במסך ענק —
          גלים, נרות, מקצב שבטי וציורים על אלפי אנשים, בסנכרון מושלם.
        </p>
      </div>

      <button className="btn" onClick={openShow} disabled={busy}>
        {busy ? "פותח..." : "🎛️ אני המפעיל — פתח מופע"}
      </button>
      <p className="sub" style={{ textAlign: "center", fontSize: 12, marginTop: 2 }}>
        תקבלו QR וקונסולת אפקטים — הקהל סורק ומצטרף
      </p>

      {err && (
        <p className="sub popin" style={{ textAlign: "center", marginTop: 8, color: "#ff8a8a", fontWeight: 700 }}>{err}</p>
      )}

      <div className="divider">יש לכם כרטיס לאירוע?</div>
      <p className="sub" style={{ textAlign: "center", fontSize: 13, marginBottom: 8 }}>
        סרקו את ה-QR שעל הכרטיס, או הקלידו את קוד האירוע:
      </p>
      <input
        className="input"
        placeholder="קוד אירוע"
        maxLength={10}
        value={code}
        style={{ letterSpacing: 5, fontWeight: 900, fontSize: 20, textTransform: "uppercase", textAlign: "center" }}
        onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())}
      />
      <button className="btn ghost" style={{ marginTop: 8 }} disabled={code.length < 3}
        onClick={() => navigate(`/show/${code}`)}>
        🎫 כניסה למופע
      </button>

      <button className="btn ghost" style={{ marginTop: 22, opacity: 0.7 }} onClick={() => navigate("/")}>
        → חזרה לערב משחקים
      </button>
    </main>
  );
}
