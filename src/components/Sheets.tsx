"use client";
import { useLarik } from "@/lib/store";

/** הזמנה לאפליקציה עצמה — בלי דיל. מנוע הוויראליות המרכזי. */
export function InviteSheet({ onClose }: { onClose: () => void }) {
  const { state, showToast } = useLarik();
  const link = `https://larik-site.vercel.app/?i=${state.code || "LARIK-10"}`;
  const msg = encodeURIComponent(
    `מצאתי דרך לעשות כסף מקניות 🤑 קאשבק על הכול, אנונימי לגמרי וחינם. תצטרף דרכי:\n${link}`
  );
  return (
    <div className="sheet" onClick={onClose}>
      <div className="inner" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>צרף חברים. תרוויח מהם לנצח 👑</h2>
        <p className="sub" style={{ marginBottom: 12 }}>
          כל קנייה שלהם — ושל מי שהם יצרפו — מכניסה לך. בלי תקרה. בלי הגבלת זמן.
        </p>
        <div className="share-card">
          <div className="sub">@{state.nickname || "אתה"} מזמין אותך ללאריק</div>
          <div style={{ fontSize: 17, fontWeight: 800, margin: "4px 0" }}>
            💸 קאשבק על כל קנייה · אנונימי · חינם
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

export function ShareSheet({ deal, onClose }: { deal: string; onClose: () => void }) {
  const { state, showToast } = useLarik();
  const link = `https://larik-site.vercel.app/?d=${state.code || "LARIK-10"}`;
  const msg = encodeURIComponent(
    `יש לי בשבילך ${deal} עם קאשבק בלאריק 🤑 מצטרפים בלי להזדהות:\n${link}`
  );
  return (
    <div className="sheet" onClick={onClose}>
      <div className="inner" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>שתף — וקח 60% מהעמלה 💜</h2>
        <div className="share-card">
          <div className="sub">@{state.nickname || "אתה"} שולח לך דיל</div>
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
        <h2 style={{ marginTop: 0 }}>✨ למי לשלוח את {deal}?</h2>
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, borderColor: "var(--money)" }}>
          <b style={{ fontSize: 20 }}>🥇</b>
          <div style={{ flex: 1 }}><b>@noam</b><div className="sub">קונה בקטגוריה הזו כל חודש</div></div>
          <b className="money">71%</b>
        </div>
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <b style={{ fontSize: 20 }}>🥈</b>
          <div style={{ flex: 1 }}><b>@daniel</b><div className="sub">חיפש דיל דומה השבוע</div></div>
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
