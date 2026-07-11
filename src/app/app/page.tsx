"use client";
import { useState } from "react";
import { useLarik } from "@/lib/store";
import CountUp from "@/components/CountUp";
import Celebrate from "@/components/Celebrate";
import { ShareSheet, MatchSheet, InviteSheet } from "@/components/Sheets";
import type { SplitResult } from "@/lib/split";

const DEALS = [
  { id: "pizza", emoji: "🍕", bg: "linear-gradient(135deg,#2e1b4d,#12331f)", boost: "קאשבק x2", timer: "⏱ 03:12:44", title: "פיצה עגבניה · רעננה", strike: "6%", cb: "12% חזרה", proof: "🛒 37 קנו היום · מישהי מהגלקסיה שלך קנתה לפני שעה", commission: 2400, share: "₪13+" },
  { id: "sound", emoji: "🎧", bg: "linear-gradient(135deg,#0f2c3e,#241442)", boost: "חדש", timer: "", title: "אוזניות SoundPro · אונליין", strike: "", cb: "9% חזרה", proof: "🛒 214 קנו השבוע", commission: 1800, share: "₪10+" },
  { id: "gym", emoji: "💪", bg: "linear-gradient(135deg,#3e1b0f,#141442)", boost: "מקומי", timer: "", title: "חדר כושר FitZone · חודש ראשון", strike: "", cb: "₪40 חזרה", proof: "🛒 12 נרשמו החודש דרך לאריק", commission: 4000, share: "₪22+" },
];

export default function Deals() {
  const { state, purchase, showToast } = useLarik();
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [q, setQ] = useState("");
  const [share, setShare] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);
  const [match, setMatch] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<SplitResult | null>(null);

  async function aiSearch() {
    setAiLoading(true);
    setAiAnswer("");
    try {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q }),
      });
      const data = await res.json();
      setAiAnswer(data.answer);
    } catch {
      setAiAnswer("משהו השתבש — נסה שוב ✨");
    }
    setAiLoading(false);
  }

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h1 className="brand">LARIK</h1>
          <div className="sub">היי @{state.nickname || "חבר"} · ליגת רעננה 🏆 #3</div>
        </div>
        <span className="chip">🔥 <b>5</b></span>
      </div>
      <div className="hero">
        <div className="sub">הרווחת החודש</div>
        <div className="big money"><CountUp agorot={state.monthly} /></div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <span className="chip">סה&quot;כ: <b className="money">₪ {(state.lifetime / 100).toFixed(0)}</b></span>
          <span className="chip privacy">🕶️ אנונימי</span>
        </div>
      </div>

      <div className="card" style={{ borderColor: "var(--gold)", background: "linear-gradient(135deg,#1d1830,#15171f)" }}>
        <b style={{ fontSize: 15 }}>👑 השושלת שלך = הכנסה לנצח</b>
        <p className="sub" style={{ margin: "6px 0 10px" }}>
          כל קנייה של מי שתצרף — ושל מי שהם יצרפו — מכניסה לך.
        </p>
        <button className="btn gold-btn" style={{ background: "linear-gradient(135deg,#ffb62e,#ffd76a)", color: "#3a2a00", boxShadow: "0 8px 24px rgba(255,182,46,.25)" }}
          onClick={() => setInvite(true)}>
          🚀 צרף חברים עכשיו
        </button>
      </div>

      <div className="card" style={{ padding: "10px 12px", display: "flex", gap: 8, alignItems: "center", borderColor: "#3a2f6b" }}>
        <span style={{ fontSize: 20 }}>✨</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && aiSearch()}
          placeholder="ספר ללאריק מה אתה מחפש..."
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text)", fontSize: 13.5 }} />
        <button className="btn" style={{ width: "auto", padding: "9px 14px", fontSize: 13, borderRadius: 12 }} onClick={aiSearch}>
          חפש
        </button>
      </div>
      {(aiLoading || aiAnswer) && (
        <div className="card" style={{ borderColor: "var(--social)", fontSize: 13.5, lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: aiLoading ? "✨ מחפש לך..." : aiAnswer }} />
      )}

      <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        הדילים של היום <span className="chip" style={{ color: "var(--gold)" }}>⚡ יום כפול</span>
      </h2>

      {DEALS.map((d) => (
        <div className="deal" key={d.id}>
          <div className="im" style={{ background: d.bg }}>
            {d.emoji}
            <span className="boost">{d.boost}</span>
            {d.timer && <span className="timer">{d.timer}</span>}
          </div>
          <div className="bd">
            <b>{d.title}</b>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 3 }}>
              {d.strike && <span className="strike">{d.strike}</span>}
              <span className="cb">{d.cb}</span>
            </div>
            <div className="proof">{d.proof}</div>
          </div>
          <div className="row">
            <button className="btn" onClick={() => setCelebrate(purchase(d.commission, "קאשבק — " + d.title))}>
              קנה עם קאשבק
            </button>
            <button className="btn social" onClick={() => setShare(d.title)}>שתף · {d.share}</button>
            <button className="btn ghost" style={{ flex: "0 0 52px" }} onClick={() => setMatch(d.title)} title="למי לשלוח?">✨</button>
          </div>
        </div>
      ))}

      <h2>המשימות של היום 🎁</h2>
      <div className="quest"><div className="qi">🛍️</div><div style={{ flex: 1 }}><b style={{ fontSize: 14 }}>קנייה ראשונה היום</b><div className="qbar"><i style={{ width: "0%" }} /></div></div><span className="chip">+₪2</span></div>
      <div className="quest"><div className="qi">📤</div><div style={{ flex: 1 }}><b style={{ fontSize: 14 }}>שתף 2 דילים</b><div className="qbar"><i style={{ width: "50%" }} /></div></div><span className="chip">1/2</span></div>
      <div className="quest"><div className="qi">🧊</div><div style={{ flex: 1 }}><b style={{ fontSize: 14 }}>הרצף שלך מוגן</b><div className="sub" style={{ fontSize: 11 }}>נשארה הקפאה אחת השבוע</div></div><span className="chip">🔥5</span></div>

      {share && <ShareSheet deal={share} onClose={() => setShare(null)} />}
      {invite && <InviteSheet onClose={() => setInvite(false)} />}
      {match && (
        <MatchSheet deal={match} onClose={() => setMatch(null)}
          onSend={() => { setMatch(null); showToast("נשלח לנועם עם הודעה שה-AI ניסח 💬"); }} />
      )}
      {celebrate && <Celebrate result={celebrate} onClose={() => setCelebrate(null)} />}
    </main>
  );
}
