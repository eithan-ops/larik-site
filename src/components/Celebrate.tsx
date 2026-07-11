"use client";
import { fmtIls } from "@/lib/store";
import type { SplitResult } from "@/lib/split";

const COLORS = ["#00E676", "#b26bff", "#ffce3c", "#ff4d9d", "#5c8aff"];

export default function Celebrate({
  result,
  onClose,
}: {
  result: SplitResult;
  onClose: () => void;
}) {
  return (
    <div className="celebrate" onClick={onClose}>
      {Array.from({ length: 60 }).map((_, i) => (
        <span
          key={i}
          className="confetti"
          style={{
            right: Math.random() * 100 + "%",
            background: COLORS[i % COLORS.length],
            animationDuration: 1.4 + Math.random() * 1.8 + "s",
            animationDelay: Math.random() * 0.6 + "s",
            borderRadius: i % 2 ? "50%" : "2px",
          }}
        />
      ))}
      <div className="sub">הקנייה אושרה! הקאשבק שלך:</div>
      <div className="amount">+{fmtIls(result.driver)}</div>
      <p className="sub" style={{ marginTop: 10 }}>
        הגלקסיה שלך הרוויחה גם:
        <br />
        <span style={{ color: "var(--social)", fontWeight: 700 }}>
          {result.chain.map((a, i) => `טבעת ${i + 1}: +${fmtIls(a)}`).join(" · ")}
          {result.chain.length === 0 && "אין עדיין שרשרת מעליך — השארית לקופת הליגה 🏆"}
        </span>
      </p>
      <p className="sub" style={{ marginTop: 6, fontSize: 11 }}>
        הסכום בהמתנה עד תום תקופת הביטולים — ואז משתחרר לארנק.
      </p>
      <button className="btn" style={{ maxWidth: 220, marginTop: 18 }} onClick={onClose}>
        מטורף 🤑
      </button>
    </div>
  );
}
