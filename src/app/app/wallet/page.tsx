"use client";
import { useState } from "react";
import { useLarik, fmtIls } from "@/lib/store";
import CountUp from "@/components/CountUp";

const THRESHOLD = 10000; // ₪100 באגורות

export default function Wallet() {
  const { state, showToast } = useLarik();
  const [aiAnswer, setAiAnswer] = useState("");

  const answers = [
    `✨ קיבלת ₪3.53 כי @daniel (טבעת 1 שלך) קנה ב-₪200. העמלה הייתה ₪24 → 8% לפלטפורמה → מתוך היתרה אתה בטבעת 1 מקבל 16% = ₪3.53. פשוט.`,
    `✨ בקצב הנוכחי תגיע ל-₪100 בעוד כ-8 ימים. רוצה לזרז? שליחת דיל האוזניות ל-@noam (71% שיקנה) תוסיף ₪10.90 במכה.`,
  ];

  const pct = Math.min(100, Math.round((state.avail / THRESHOLD) * 100));

  return (
    <main>
      <h1>הארנק 💚</h1>
      <div className="hero" style={{ textAlign: "center" }}>
        <div className="sub">זמין למשיכה</div>
        <div className="big money"><CountUp agorot={state.avail} /></div>
        <div className="sub">+ {fmtIls(state.pending)} בהמתנה (תקופת ביטולים)</div>
        <div className="thresh"><i style={{ width: pct + "%" }} /></div>
        <div className="sub">
          {state.avail >= THRESHOLD
            ? "עברת את הסף — אפשר למשוך לביט 🎉"
            : <>עוד <b style={{ color: "var(--text)" }}>{fmtIls(THRESHOLD - state.avail)}</b> לביט (סף ₪100) · שוברים כבר מ-₪10</>}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn ghost" onClick={() => showToast("קטלוג השוברים ייפתח בפיילוט 🎟️")}>שובר מ-₪10</button>
          <button className="btn" onClick={() => showToast("אימות זהות קורה אצל ספק הסליקה — אנחנו לא רואים כלום 🕶️")}>
            משיכה לביט
          </button>
        </div>
      </div>

      <h2>תנועות</h2>
      <div className="card">
        {state.txs.map((t, i) => (
          <div className="tx" key={i}>
            <span>
              {t.label}
              <div className="hold">{t.status === "released" ? "שוחרר ✓" : "בהמתנה · תקופת ביטולים"}</div>
            </span>
            <span className="plus">+{fmtIls(t.amount)}</span>
          </div>
        ))}
        {state.txs.length === 0 && <div className="tx"><span className="sub">עוד אין תנועות — הקנייה הראשונה שלך תופיע כאן</span></div>}
      </div>

      <h2>שאל את לאריק ✨</h2>
      <div className="card" style={{ borderColor: "#3a2f6b" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <span className="chip" style={{ cursor: "pointer" }} onClick={() => setAiAnswer(answers[0])}>למה קיבלתי ₪3.53?</span>
          <span className="chip" style={{ cursor: "pointer" }} onClick={() => setAiAnswer(answers[1])}>מתי אגיע ל-₪100?</span>
        </div>
        {aiAnswer && (
          <div className="sub" style={{ background: "var(--card2)", borderRadius: 12, padding: "10px 12px", color: "var(--text)" }}>
            {aiAnswer}
          </div>
        )}
      </div>

      <div className="card" style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7 }}>
        🕶️ <b style={{ color: "#7dd8ff" }}>פרטיות:</b> אנונימי לגמרי — כינוי ואווטר בלבד. הפרטים האישיים מתחברים{" "}
        <b style={{ color: "var(--text)" }}>רק ברגע המשיכה</b>, אצל ספק אימות חיצוני. אלינו הם לא מגיעים.
        <br /><br />
        🧾 <b style={{ color: "var(--text)" }}>שקיפות:</b> 8% לפלטפורמה, 92% אליכם. תמיד. · 🛡️ כל עסקה נסרקת ע&quot;י AI נגד הונאות.
      </div>
    </main>
  );
}
