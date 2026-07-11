"use client";
import { useLarik } from "@/lib/store";

const ROWS = [
  { pos: 1, name: "@maya_c", amt: "₪ 212" },
  { pos: 2, name: "@yossi_l", amt: "₪ 186" },
  { pos: 3, name: "", amt: "₪ 154", me: true },
  { pos: 4, name: "@hila_b", amt: "₪ 149" },
  { pos: 5, name: "@guy_r", amt: "₪ 131" },
];

export default function League() {
  const { state } = useLarik();
  return (
    <main>
      <h1>ליגת השבוע 🏆</h1>
      <p className="sub" style={{ margin: "4px 0 14px" }}>
        30 שחקנים ברמה שלך · 7 עולים, 5 יורדים · הפרסים ממומנים מקופת הקהילה
      </p>
      <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", borderColor: "var(--gold)" }}>
        <div style={{ fontSize: 26 }}>🥇🥈🥉</div>
        <div className="sub">
          <b style={{ color: "var(--text)" }}>₪500 / ₪250 / ₪100 השבוע</b>
          <br />לפי ביצועים (תחרות, לא הגרלה)
        </div>
      </div>
      <div className="card">
        {ROWS.map((r) => (
          <div key={r.pos} className="tx" style={r.me ? { background: "rgba(0,230,118,.07)", borderRadius: 10, padding: "11px 8px" } : undefined}>
            <span>{r.me ? <b>{r.pos} · @{state.nickname || "אתה"} (אתה) 🔺</b> : `${r.pos} · ${r.name}`}</span>
            <b className="money">{r.amt}</b>
          </div>
        ))}
      </div>
      <div className="card" style={{ textAlign: "center", borderColor: "var(--social)" }}>
        <b>עוד ₪33 ואתה שני 👀</b>
        <div className="sub" style={{ marginTop: 4 }}>שיתוף אחד שמוביל לקנייה סוגר את זה</div>
      </div>
    </main>
  );
}
