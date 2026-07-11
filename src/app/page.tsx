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
      <p className="sub" style={{ textAlign: "center", marginBottom: 30 }}>
        כסף עם חברים. קאשבק על כל קנייה,<br />ועמלה כשחברים קונים דרכך.
      </p>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>נכנסים בלי להזדהות 🕶️</h2>
        <p className="sub" style={{ marginBottom: 12 }}>
          בלי שם, בלי טלפון, בלי אנשי קשר. רק כינוי.
          פרטים אישיים? רק אם תרצה למשוך מזומן — ואז מול ספק אימות חיצוני, לא מולנו.
        </p>
        <input className="input" placeholder="בחר כינוי (למשל eitan_k)" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={18} />
        <input className="input" placeholder="קוד הזמנה מחבר (לא חובה בפיילוט)" value={invite} onChange={(e) => setInvite(e.target.value)} maxLength={12} />
        <button className="btn" onClick={joinNow}>יאללה, תראה לי את הכסף 💸</button>
      </div>
      <div className="card" style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
        <b style={{ color: "var(--text)" }}>איך זה עובד?</b><br />
        🛍️ קונים דרך לאריק — מקבלים קאשבק אמיתי.<br />
        📤 משתפים דיל וחבר קונה — מקבלים 60% מהעמלה.<br />
        🪐 החברים שהזמנתם קונים — אתם מקבלים 16%, ומהחברים שלהם 8%, וכן הלאה לנצח.<br />
        🧾 אנחנו לוקחים 8% בלבד. תמיד. שקוף.
      </div>
    </main>
  );
}
