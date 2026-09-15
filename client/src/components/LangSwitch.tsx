import { useState } from "react";
import { LANGS, LANG_NAMES } from "../../../shared/i18n";
import { currentLang, setLang, t } from "../lib/locale";

/**
 * 🌐 — הדרך היחידה להחליף שפה ידנית. אין מסך בחירה בכניסה (השפה נקבעת לפי המדינה),
 * אבל בלי הכפתור הזה ישראלי בטוקיו נתקע עם יפנית. קטן, בפינה, לא מושך תשומת לב.
 */
export default function LangSwitch() {
  const [open, setOpen] = useState(false);
  const cur = currentLang();
  return (
    <div className="lang-corner">
      <button className="lang-btn" onClick={() => setOpen(!open)} aria-label={t("lang.switch")} aria-expanded={open}>
        🌐
      </button>
      {open && (
        <div className="lang-menu popin" role="menu">
          {LANGS.map((l) => (
            <button key={l} role="menuitem" className={"lang-item" + (l === cur ? " sel" : "")} lang={l}
              onClick={() => { if (l !== cur) setLang(l); else setOpen(false); }}>
              {LANG_NAMES[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
