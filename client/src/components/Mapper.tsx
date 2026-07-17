/**
 * כלי מיפוי אולמות 🗺️ — larik.ai/mapper (עמוד פנימי, לא מקושר מהבית).
 * מעלים צילום של תרשים האולם (ציבורי מאתר הכרטיסים) → לכל גוש מקליקים 4 פינות
 * (קדמי-שמאל → קדמי-ימין → אחורי-ימין → אחורי-שמאל) + שורות/מושבים →
 * רואים את המושבים המחושבים על התרשים → מייצאים JSON לספריית האולמות.
 */
import { useEffect, useRef, useState } from "react";
import type { Venue, VenueSection } from "../venues";
import { seatToXY } from "../venues";

const CORNER_LABELS = ["קדמי-שמאל", "קדמי-ימין", "אחורי-ימין", "אחורי-שמאל"];

export default function Mapper() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [sections, setSections] = useState<VenueSection[]>([]);
  const [corners, setCorners] = useState<[number, number][]>([]);
  const [name, setName] = useState("גוש 1");
  const [rows, setRows] = useState(12);
  const [seats, setSeats] = useState(14);
  const [venueName, setVenueName] = useState("");
  const [copied, setCopied] = useState(false);
  const cvRef = useRef<HTMLCanvasElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = url;
  }

  // ציור: תמונה + גושים קיימים (עם נקודות המושבים) + הפינות שנאספות עכשיו
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const W = 900;
    const H = img ? Math.round((img.height / img.width) * W) : 560;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#0c0817"; ctx.fillRect(0, 0, W, H);
    if (img) ctx.drawImage(img, 0, 0, W, H);
    const venue: Venue = { id: "tmp", name: "", sections };
    sections.forEach((sec, si) => {
      ctx.strokeStyle = "#ec4899"; ctx.lineWidth = 2;
      ctx.beginPath();
      sec.quad.forEach(([x, y], i) => { const px = x * W, py = (1 - y) * H; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.closePath(); ctx.stroke();
      for (let r = 1; r <= sec.rows; r++) for (let s = 1; s <= sec.seats; s++) {
        const p = seatToXY(venue, si, r, s);
        if (!p) continue;
        ctx.fillStyle = "#ffc93caa";
        ctx.fillRect(p.x * W - 1.5, (1 - p.y) * H - 1.5, 3, 3);
      }
      const c = sec.quad[0];
      ctx.fillStyle = "#fff"; ctx.font = "700 14px Rubik, Arial";
      ctx.fillText(sec.name, c[0] * W + 6, (1 - c[1]) * H - 6);
    });
    corners.forEach(([x, y], i) => {
      ctx.fillStyle = "#34e89e";
      ctx.beginPath(); ctx.arc(x * W, (1 - y) * H, 6, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "700 12px Rubik, Arial";
      ctx.fillText(String(i + 1), x * W + 8, (1 - y) * H + 4);
    });
  }, [img, sections, corners]);

  function onCanvasClick(e: React.MouseEvent) {
    const cv = cvRef.current!;
    const rect = cv.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height; // y=0 למטה (במה)
    const next = [...corners, [x, y] as [number, number]];
    if (next.length === 4) {
      setSections((s) => [...s, { name, quad: next as VenueSection["quad"], rows, seats }]);
      setCorners([]);
      setName(`גוש ${sections.length + 2}`);
    } else setCorners(next);
  }

  const json: Venue = {
    id: venueName.trim() ? venueName.trim().replace(/\s+/g, "-").toLowerCase() : "my-venue",
    name: venueName.trim() || "האולם שלי",
    sections,
  };
  const totalSeats = sections.reduce((a, s) => a + s.rows * s.seats, 0);

  return (
    <main style={{ maxWidth: 960, padding: 18 }}>
      <h1 className="brand">🗺️ מיפוי אולם</h1>
      <p className="sub" style={{ margin: "6px 0 12px" }}>
        1. העלה תרשים מושבים · 2. לכל גוש: 4 קליקים ({CORNER_LABELS.join(" → ")}) · 3. ייצא והדבק ב-venues.ts
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <input type="file" accept="image/*" onChange={onFile} style={{ color: "var(--muted)" }} />
        <input className="input" style={{ width: 180, padding: 8 }} placeholder="שם האולם" value={venueName} onChange={(e) => setVenueName(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <input className="input" style={{ width: 130, padding: 8 }} value={name} onChange={(e) => setName(e.target.value)} />
        <label className="sub">שורות <input className="input" type="number" style={{ width: 64, padding: 6 }} value={rows} onChange={(e) => setRows(+e.target.value || 1)} /></label>
        <label className="sub">מושבים בשורה <input className="input" type="number" style={{ width: 64, padding: 6 }} value={seats} onChange={(e) => setSeats(+e.target.value || 1)} /></label>
        <span className="chip">{corners.length ? `פינה ${corners.length + 1}/4: ${CORNER_LABELS[corners.length]}` : "קליק ראשון: " + CORNER_LABELS[0]}</span>
        {corners.length > 0 && <button className="btn ghost" style={{ width: "auto", padding: "8px 12px" }} onClick={() => setCorners([])}>בטל פינות</button>}
        {sections.length > 0 && <button className="btn ghost" style={{ width: "auto", padding: "8px 12px" }} onClick={() => setSections((s) => s.slice(0, -1))}>מחק גוש אחרון</button>}
      </div>
      <canvas ref={cvRef} onClick={onCanvasClick}
        style={{ width: "100%", borderRadius: 16, border: "1px solid var(--line2)", cursor: "crosshair", background: "#0c0817" }} />
      <p className="sub" style={{ margin: "10px 0" }}>
        {sections.length} גושים · {totalSeats.toLocaleString()} מושבים
      </p>
      <button className="btn" style={{ maxWidth: 340 }} disabled={!sections.length}
        onClick={() => { navigator.clipboard.writeText(JSON.stringify(json, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
        {copied ? "הועתק! ✓" : "📋 העתק JSON של האולם"}
      </button>
      <pre dir="ltr" style={{ marginTop: 12, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: 12, fontSize: 11, overflow: "auto", maxHeight: 220, color: "var(--muted)" }}>
        {JSON.stringify(json, null, 2)}
      </pre>
    </main>
  );
}
