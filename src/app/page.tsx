"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Onboarding() {
  const router = useRouter();
  const [invite, setInvite] = useState("");
  const [nick, setNick] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("larik");
      if (raw && JSON.parse(raw).nickname) router.replace("/app");
    } catch {}
  }, [router]);

  function joinNow() {
    if (!nick.trim()) return;
    const code =
      (nick.replace(/[^a-zA-Z0-9א-ת]/g, "").slice(0, 6) || "LARIK").toUpperCase() +
      "-" + Math.floor(10 + Math.random() * 89);
    localStorage.setItem(
      "larik",
      JSON.stringify({
        nickname: nick.trim(),
        code,
        avail: 0, pending: 0, lifetime: 0, monthly: 0,
        chainLength: invite.trim() ? 1 : 0,
        networkSize: 0, feed: [], txs: [],
      })
    );
    router.push("/app");
  }

  return (
    <main>
      <div className="logo-big">LARIK</div>
      <p style={{ textAlign: "center", fontSize: 20, fontWeight: 800, marginBottom: 26 }}>
        חברים שווים כסף. 💸
      </p>

      <div className="card" style={{ fontSize: 15, lineHeight: 2.1 }}>
        🛍️ קנית — קיבלת כסף חזרה<br />
        📤 חבר קנה דרכך — הרווחת בגדול<br />
        👑 השושלת שלך קונה — אתה מרוויח. <b className="money">לנצח.</b>
      </div>

      <div className="card">
        <input className="input" placeholder="בחר כינוי" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={18} />
        <input className="input" placeholder="קוד הזמנה (אם יש)" value={invite} onChange={(e) => setInvite(e.target.value)} maxLength={12} />
        <button className="btn" onClick={joinNow}>מתחילים 🚀</button>
        <p className="sub" style={{ textAlign: "center", marginTop: 10, fontSize: 12 }}>
          🕶️ בלי שם. בלי טלפון. אנונימי.
        </p>
      </div>
    </main>
  );
}
