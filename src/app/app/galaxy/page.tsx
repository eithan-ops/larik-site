"use client";
import { useState } from "react";
import GalaxyCanvas from "@/components/GalaxyCanvas";
import { InviteSheet } from "@/components/Sheets";
import { useLarik, fmtIls } from "@/lib/store";

export default function Galaxy() {
  const { state } = useLarik();
  const [earned, setEarned] = useState(9640);
  const [share, setShare] = useState(false);

  return (
    <main>
      <h1>הגלקסיה שלך 🪐</h1>
      <p className="sub" style={{ marginTop: 4 }}>
        כל חבר הוא כוכב שמסתובב סביבך. כשמישהו קונה — הכסף עף אליך.
      </p>
      <div className="gwrap">
        <GalaxyCanvas onEarn={(a) => setEarned((e) => e + a)} />
        <div className="gstat">
          ברשת: <b>{state.networkSize || 13}</b> · פעילים: <b className="money">5</b>
          <br />
          החודש: <b className="money">{fmtIls(earned)}</b>
        </div>
        <div className="glegend">
          <span>טבעת 1 · 16%</span><span>טבעת 2 · 8%</span><span>טבעת 3 · 4%</span><span>∞ · נחצה בכל טבעת</span>
        </div>
      </div>

      <h2>קורה עכשיו ⚡</h2>
      <div className="feed">
        {state.feed.map((f, i) => (
          <div className="fitem" key={i}>
            <span>
              {f.text}
              <span className="gen-chip" style={{ background: f.color + "22", color: f.color }}>{f.gen}</span>
            </span>
            <b className="money">+{fmtIls(f.amount)}</b>
          </div>
        ))}
        {state.feed.length === 0 && <div className="fitem"><span className="sub">עוד אין פעילות — הזמן את הכוכב הראשון שלך 🚀</span></div>}
      </div>

      <h2>הסולם — שקוף עד הסוף</h2>
      <div className="card">
        <div className="lrow" style={{ color: "var(--muted)", fontSize: 11, borderBottom: "1px solid var(--line)" }}>
          <span>דור</span><span></span><span>אחוז</span><span>החודש</span>
        </div>
        <div className="lrow"><b>1</b><div className="lbar" style={{ width: "100%" }} /><b>16%</b><b className="money">₪58</b></div>
        <div className="lrow"><b>2</b><div className="lbar" style={{ width: "50%" }} /><b>8%</b><b className="money">₪27</b></div>
        <div className="lrow"><b>3</b><div className="lbar" style={{ width: "25%" }} /><b>4%</b><b className="money">₪11</b></div>
        <div className="lrow" style={{ border: "none", color: "var(--muted)" }}><b>4+</b><div className="lbar" style={{ width: "12%", opacity: 0.5 }} /><b>2%→∞</b><b>₪0</b></div>
      </div>
      <button className="btn social" onClick={() => setShare(true)}>🚀 הוסף כוכב — תרוויח ממנו לנצח</button>
      {share && <InviteSheet onClose={() => setShare(false)} />}
    </main>
  );
}
