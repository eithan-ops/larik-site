"use client";
import { useState } from "react";
import { useLarik } from "@/lib/store";

interface Campaign { title: string; copy: string; cb: string; }

export default function Business() {
  const { showToast } = useLarik();
  const [name, setName] = useState("");
  const [offer, setOffer] = useState("");
  const [loading, setLoading] = useState(false);
  const [camp, setCamp] = useState<Campaign | null>(null);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, offer }),
      });
      setCamp(await res.json());
    } catch {
      showToast("שגיאה — נסה שוב");
    }
    setLoading(false);
  }

  return (
    <main>
      <h1>לאריק לעסקים 🏪</h1>
      <p className="sub" style={{ margin: "4px 0 12px" }}>
        ספר ל-AI מה אתה מוכר — הוא בונה לך קמפיין עם קופון שמימשים אצלך בעסק או בהזמנה.
      </p>
      <div className="card" style={{ borderColor: "#3a2f6b" }}>
        <input className="input" placeholder="שם העסק (למשל: פיצה עגבניה)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="מה ההצעה? (למשל: מגש משפחתי 49.90)" value={offer} onChange={(e) => setOffer(e.target.value)} />
        <button className="btn social" onClick={generate} disabled={loading}>
          {loading ? "✨ בונה קמפיין..." : "✨ צור לי קמפיין"}
        </button>
      </div>

      {camp && (
        <>
          <h2>ה-AI בנה לך את זה: 👇</h2>
          <div className="deal">
            <div className="im" style={{ background: "linear-gradient(135deg,#2e1b4d,#12331f)" }}>
              🏪<span className="boost">קופון חדש</span>
            </div>
            <div className="bd">
              <b>{camp.title}</b>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 3 }}>
                <span className="cb">{camp.cb}</span>
              </div>
              <div className="proof">{camp.copy}</div>
              <div className="chip" style={{ marginTop: 8, color: "var(--gold)" }}>
                🎟️ מימוש: בעסק או בהזמנה · קוד ללקוח בקופה
              </div>
            </div>
          </div>
          <div className="card" style={{ fontSize: 13 }}>
            <b>הצעת תקציב חכמה:</b>
            <div className="sub" style={{ marginTop: 6 }}>
              ₪300 → כ-45 לקוחות צפויים החודש · עלות ללקוח: ₪6.70 · ה-AI מטרגט לפי אזור והרגלי קנייה (אנונימי).
            </div>
            <div className="sub" style={{ marginTop: 6 }}>
              🛡️ כל מימוש מאומת בקוד חד-פעמי — אתה משלם רק על לקוחות אמיתיים.
            </div>
          </div>
          <button className="btn" onClick={() => showToast("הקמפיין נשלח לאישור — עולה לאוויר תוך שעה 🚀")}>
            פרסם · ₪300 לחודש
          </button>
        </>
      )}
    </main>
  );
}
