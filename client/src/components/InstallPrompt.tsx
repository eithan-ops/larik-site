/**
 * "הוסיפו למסך הבית" — מוצג בסוף ערב מוצלח בלבד.
 *
 * למה דווקא שם: בכניסה הראשונה אין עדיין סיבה להתקין, והבקשה נקראת
 * כמו פרסומת. אחרי שכולם צחקו וקיבלו כרטיס — יש סיבה, והיא מובנת מאליה.
 */
import { useState } from "react";
import { Sfx, vibrate } from "../lib/audio";
import { track } from "../lib/analytics";
import { installMode, runInstall, dismissInstall } from "../lib/install";
import { t } from "../lib/locale";

export default function InstallPrompt() {
  const [mode] = useState(installMode);
  const [gone, setGone] = useState(false);
  const [howTo, setHowTo] = useState(false);

  if (mode === "none" || gone) return null;

  function close() {
    dismissInstall();
    track("install_dismissed");
    setGone(true);
  }

  async function install() {
    track("install_click");
    const ok = await runInstall();
    if (ok) { Sfx.fanfare(); vibrate([60, 40, 60]); track("install_done"); }
    setGone(true);
  }

  return (
    <div className="card popin" style={{ marginTop: 12, width: "100%", maxWidth: 340, position: "relative" }}>
      <button
        onClick={close}
        aria-label={t("install.not_now")}
        style={{
          position: "absolute", top: 6, insetInlineEnd: 8, background: "none", border: "none",
          color: "var(--muted)", fontSize: 18, lineHeight: 1, padding: 4,
        }}
      >
        ✕
      </button>

      <div style={{ fontSize: 32, textAlign: "center" }}>📲</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 19, textAlign: "center", marginTop: 2 }}>
        {t("install.title")}
      </div>
      <p className="sub" style={{ textAlign: "center", marginTop: 4, fontSize: 13 }}>
        {t("install.sub")}
      </p>

      {mode === "prompt" ? (
        <button className="btn gold" style={{ marginTop: 10 }} onClick={install}>
          {t("install.add")}
        </button>
      ) : howTo ? (
        /* אייפון לא נותן דיאלוג התקנה — אפשר רק להראות את שני הצעדים */
        <div style={{ marginTop: 10, fontSize: 14.5, lineHeight: 1.7 }}>
          <div>{t("install.ios1", { icon: "􀈂" })}</div>
          <div>{t("install.ios2")}</div>
          <p className="sub" style={{ marginTop: 6, fontSize: 12 }}>
            {t("install.ios_note")}
          </p>
        </div>
      ) : (
        <button className="btn gold" style={{ marginTop: 10 }} onClick={() => { setHowTo(true); track("install_ios_howto"); }}>
          {t("install.how")}
        </button>
      )}
    </div>
  );
}
