import { useState } from "react";
import { navigate } from "../App";
import { createRoom } from "../lib/connection";
import { track } from "../lib/analytics";
import QRScanner from "./QRScanner";
import { myGroups, openRoomForGroup, type SavedGroup } from "../lib/group";
import { loadStreak } from "../lib/daily";

/**
 * מסך הבית — "אלבום המדבקות קם לחיים" 🎪
 * כפתור ענק אחד ששולט במסך (פתח חדר), מדף המשחקים ("מה משחקים כאן?"),
 * והצטרפות לחברים בעדיפות שלישית. הרקע חי: דמויות המשחקים מציצות מהקצוות.
 */
/** הטקסט שנשלח לחברים עם הקישור — בקול של המותג */
const SHARE_TEXT = "ערב משחקים שלם בטלפון 🎉 בלי קופסה, בלי הורדות, בלי תירוצים. משחקים. צוחקים. מתחברים 👇";
const SHARE_URL = "https://larik.ai";

export default function Home() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [joining, setJoining] = useState(false);
  const [err, setErr] = useState("");
  const [shared, setShared] = useState("");
  // נקרא פעם אחת — רשימת החבורות לא משתנה תוך כדי שהמסך פתוח
  const [groups] = useState<SavedGroup[]>(() => myGroups());
  const [streak] = useState(() => loadStreak());

  /** שיתוף: תמונת ההירו + משפט + קישור. נופל ברכות לוואטסאפ / העתקה. */
  async function share() {
    track("share_click");
    try {
      // ניסיון לצרף את תמונת ההירו לשיתוף עצמו (נתמך ברוב הטלפונים)
      let files: File[] | undefined;
      try {
        const blob = await (await fetch("/og-share.jpg")).blob();
        const f = new File([blob], "larik.jpg", { type: "image/jpeg" });
        if (navigator.canShare?.({ files: [f] })) files = [f];
      } catch { /* בלי תמונה — עדיין משתפים */ }
      if (navigator.share) {
        await navigator.share({ title: "LARIK", text: `${SHARE_TEXT}\n${SHARE_URL}`, url: SHARE_URL, ...(files ? { files } : {}) });
        track("share_done");
        return;
      }
    } catch { /* המשתמש ביטל או שהשיתוף נכשל — לא נורא */ return; }
    // דפדפן בלי Web Share — וואטסאפ, ואם לא אז העתקה
    const wa = `https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT}\n${SHARE_URL}`)}`;
    const w = window.open(wa, "_blank");
    if (!w) {
      try {
        await navigator.clipboard.writeText(`${SHARE_TEXT}\n${SHARE_URL}`);
        setShared("הקישור הועתק! 📋 שלחו לחברים");
        setTimeout(() => setShared(""), 2500);
      } catch { /* אין מה לעשות */ }
    }
  }

  async function host() {
    setBusy(true);
    setErr("");
    try {
      const c = await createRoom();
      track("room_created");
      navigate(`/r/${c}`);
    } catch {
      setErr("השרת מתעורר... נסו שוב עוד כמה שניות 😴");
    }
    setBusy(false);
  }

  /** ערב נוסף לחבורה קיימת — הנקודות ייזקפו לאותה עונה */
  async function hostForGroup(g: SavedGroup) {
    setBusy(true);
    setErr("");
    const c = await openRoomForGroup(g.id);
    if (c) { track("room_created", { from: "group" }); navigate(`/r/${c}`); }
    else setErr("השרת מתעורר... נסו שוב עוד כמה שניות 😴");
    setBusy(false);
  }

  function onScan(text: string) {
    setScanning(false);
    const m = text.match(/\/r\/([a-zA-Z]{4})/) || text.match(/^([a-zA-Z]{4})$/);
    if (m) { setErr(""); navigate(`/r/${m[1].toUpperCase()}`); }
    else setErr("זה לא QR של חדר LARIK 🤔 — סרקו את הקוד מהמסך של המארח");
  }

  return (
    <main className="home-live">
      {scanning && <QRScanner onScan={onScan} onClose={() => setScanning(false)} />}

      <button className="show-corner" onClick={() => { location.href = "/s"; }} aria-label="מופע">
        🕯️<small>מופע</small>
      </button>

      <button className="share-corner" onClick={share} aria-label="שתפו חברים">
        📤<small>שתפו</small>
      </button>
      {shared && <div className="share-toast popin">{shared}</div>}

      <div className="home-hero">
        <img className="logo-sticker" src="/stickers/logo-larik.webp" alt="LARIK" />
        <p className="logo-sub">משחקים. צוחקים. מתחברים.</p>
        <p className="home-pitch">
          ערב משחקים שלם — בלי קופסה, בלי חלקים, בלי הורדות.
          <br />הטלפון של כל אחד הופך לחלק מהמשחק.
        </p>
      </div>

      <div className="home-actions">
        {/* חבורה שנשמרה עולה מעל "חדר חדש" — למי שכבר יש עונה, זו הפעולה שהוא בא בשבילה */}
        {groups.length > 0 && (
          <button className="mega-cta" onClick={() => hostForGroup(groups[0])} disabled={busy}>
            {busy ? "פותח חדר..." : <>🏅 ערב של {groups[0].name}</>}
          </button>
        )}

        <button className={groups.length ? "shelf-cta" : "mega-cta"} onClick={host} disabled={busy}>
          {busy && !groups.length ? "פותח חדר..." : <>🎉 פתח חדר חדש</>}
        </button>

        <button className="shelf-cta" onClick={() => { track("shelf_open"); navigate("/play"); }}>
          👀 מה משחקים כאן?
        </button>

        <button className="join-cta" onClick={() => { setErr(""); setJoining(!joining); }}>
          📷 הצטרפו לחברים
        </button>

        {/* סולו: שלוש דקות לבד, וסיבה לפתוח את האפליקציה גם בלי חבורה בסלון */}
        <button className="join-cta" onClick={() => navigate("/daily")}>
          🧠 הטריוויה היומית{streak.days > 0 && <> · רצף {streak.days} 🔥</>}
        </button>
      </div>

      {joining && (
        <div className="card join-panel popin">
          <button className="btn social" onClick={() => { setJoining(false); setScanning(true); }}>
            📷 סרוק QR של המארח
          </button>
          <div className="divider">או הצטרף עם קוד</div>
          <input
            className="input"
            placeholder="ABCD"
            maxLength={4}
            value={code}
            style={{ letterSpacing: 8, fontWeight: 900, fontSize: 24, textTransform: "uppercase" }}
            onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())}
          />
          <button className="btn ghost" style={{ marginTop: 8 }} disabled={code.length !== 4}
            onClick={() => navigate(`/r/${code}`)}>
            הצטרף 🚪
          </button>
        </div>
      )}

      {err && (
        <p className="sub popin" style={{ textAlign: "center", marginTop: 10, color: "#ff8a8a", fontWeight: 700 }}>
          {err}
        </p>
      )}

      <p className="sub home-foot">⚡ בלי התקנה · 🔒 בלי הרשמה · חינם</p>
    </main>
  );
}
