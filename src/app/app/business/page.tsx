"use client";
import { useRef, useState } from "react";
import { useLarik } from "@/lib/store";

export default function Business() {
  const { showToast } = useLarik();
  const [name, setName] = useState("");
  const [discount, setDiscount] = useState("");
  const [img, setImg] = useState<string | null>(null);
  const [built, setBuilt] = useState(false);
  const [payReady, setPayReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setImg(r.result as string);
    r.readAsDataURL(f);
  }

  const canBuild = name.trim() && discount.trim();

  return (
    <main>
      <h1>לאריק לעסקים 🏪</h1>
      <p className="sub" style={{ margin: "4px 0 12px" }}>
        3 צעדים. <b style={{ color: "var(--text)" }}>משלמים רק אחרי שהלקוח מימש.</b>
      </p>

      {/* צעד 1 — הדיל */}
      <div className="card" style={{ borderColor: "#3a2f6b" }}>
        <b>1 · הדיל שלך</b>
        <div style={{ height: 8 }} />
        <button className="btn ghost" style={{ marginBottom: 8 }} onClick={() => fileRef.current?.click()}>
          {img ? "🖼️ החלף תמונה" : "📷 העלה תמונת מוצר"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onImage} />
        <input className="input" placeholder="שם העסק" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="ההנחה (למשל: מגש משפחתי ב-49.90 במקום 79)" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        <button className="btn social" disabled={!canBuild} style={{ opacity: canBuild ? 1 : 0.5 }}
          onClick={() => { setBuilt(true); showToast("✨ הקופון שלך מוכן"); }}>
          ✨ צור קופון
        </button>
      </div>

      {/* תצוגה מקדימה */}
      {built && (
        <>
          <div className="deal">
            <div className="im" style={{ background: img ? undefined : "linear-gradient(135deg,#2e1b4d,#12331f)", padding: 0, overflow: "hidden" }}>
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : ("🏪")}
              <span className="boost">קופון</span>
            </div>
            <div className="bd">
              <b>{name}</b>
              <div className="cb" style={{ marginTop: 3 }}>{discount}</div>
              <div className="chip" style={{ marginTop: 8, color: "var(--gold)" }}>🎟️ מימוש בעסק או בהזמנה · קוד חד-פעמי</div>
            </div>
          </div>

          {/* צעד 2 — פאנל הכסף */}
          <div className="card" style={{ borderColor: payReady ? "var(--money)" : "var(--gold)" }}>
            <b>2 · פאנל התשלום שלך 💳</b>
            <div className="tx" style={{ marginTop: 6 }}><span>מחיר ללקוח שמימש</span><b>₪ 6.90</b></div>
            <div className="tx"><span>תקרת תקציב חודשית</span><b>₪ 300 (עד ~43 מימושים)</b></div>
            <div className="tx" style={{ border: "none" }}><span>חיוב</span><b style={{ color: "var(--money)" }}>רק אחרי מימוש בפועל</b></div>
            {!payReady ? (
              <button className="btn" style={{ marginTop: 10 }} onClick={() => { setPayReady(true); showToast("אמצעי תשלום אושר ✓ (דמו)"); }}>
                חבר אמצעי תשלום
              </button>
            ) : (
              <div className="chip" style={{ marginTop: 10, color: "var(--money)" }}>✓ אמצעי תשלום מחובר — לא תחויב עד המימוש הראשון</div>
            )}
          </div>

          {/* צעד 3 — פרסום */}
          <button className="btn" disabled={!payReady} style={{ opacity: payReady ? 1 : 0.5 }}
            onClick={() => showToast("🚀 הקופון באוויר! תקבל עדכון על כל מימוש")}>
            3 · פרסם עכשיו
          </button>
        </>
      )}
    </main>
  );
}
