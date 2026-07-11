"use client";
import { useLarik } from "@/lib/store";

export function ShareSheet({ deal, onClose }: { deal: string; onClose: () => void }) {
  const { state, showToast } = useLarik();
  const link = `https://larik.ai/d/${state.code || "LARIK-10"}`;
  const msg = encodeURIComponent(
    `יש לי בשבילך ${deal} עם קאשבק בלאריק 🤑 מצטרפים בלי להזדהות: ${link}`
  );
  return (
    <div className="sheet" onClick={onClose}>
      <div className="inner" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>שתף וקבל 60% מהעמלה 💜</h2>
        <div className="share-card">
          <div className="sub">@{state.nickname || "אתה"} מזמין אותך ללאריק</div>
          <div style={{ fontSize: 17, fontWeight: 800, margin: "4px 0" }}>
            {deal} + ₪10 מתנה לך
          </div>
          <div className="code">{state.code || "LARIK-10"}</div>
          <div className="sub" dir="ltr">{link}</div>
        </div>
        <a className="btn" style={{ background: "linear-gradient(135deg,#25D366,#5cffa9)", textDecoration: "none" }}
           href={`https://wa.me/?text=${msg}`} target="_blank" rel="noreferrer">
          שתף בוואטסאפ
        </a>
        <div style={{ height: 8 }} />
        <button className="btn social" onClick={() => { navigator.clipboard?.writeText(link); showToast("הקישור הועתק 📋"); onClose(); }}>
          העתק קישור
        </button>
        <div style={{ height: 8 }} />
        <button className="btn ghost" onClick={onClose}>סגור</button>
      </div>
    </div>
  );
}

export function MatchSheet({ deal, onClose, onSend }: { deal: string; onClose: () => void; onSend: () => void }) {
  return (
    <div className="sheet" onClick={onClose}>
      <div className="inner" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>✨ למי הכי שווה לשלוח את {deal}?</h2>
        <p className="sub" style={{ marginBottom: 12 }}>לאריק ניתח (אנונימית) מה הגלקסיה שלך אוהבת:</p>
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, borderColor: "var(--money)" }}>
          <b style={{ fontSize: 20 }}>🥇</b>
          <div style={{ flex: 1 }}><b>@noam</b><div className="sub">קונה בקטגוריה הזו כל חודש · פתח את האפליקציה היום</div></div>
          <b className="money">71%</b>
        </div>
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <b style={{ fontSize: 20 }}>🥈</b>
          <div style={{ flex: 1 }}><b>@daniel</b><div className="sub">התעניין בדיל דומה בשבוע שעבר</div></div>
          <b style={{ color: "var(--gold)" }}>43%</b>
        </div>
        <button className="btn" style={{ background: "linear-gradient(135deg,#25D366,#5cffa9)" }} onClick={onSend}>
          שלח ל-@noam בוואטסאפ
        </button>
        <div style={{ height: 8 }} />
        <button className="btn ghost" onClick={onClose}>סגור</button>
      </div>
    </div>
  );
}
