# -*- coding: utf-8 -*-
"""מחולל עמודי SEO סטטיים — נכתבים ל-client/public/games/ (מועתקים ל-dist כמו שהם).
הרצה: python3 tools/genpages.py (מתוך שורש הריפו)"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "client" / "public" / "games"
OUT.mkdir(parents=True, exist_ok=True)

BASE = "https://larik.ai"

GAMES = [
  dict(id="whomost", name="מי הכי?", icon="🫵", players="3–15", minutes="10–20",
    title="מי הכי? — משחק ההצבעות שמדליק את הערב | LARIK",
    desc="משחק מי הכי אונליין לטלפון: המארח שואל \"מי הכי...?\", כולם מצביעים בסתר — והטלפון של הנבחר נדלק בזהב. בלי אפליקציה, בחינם.",
    h1="מי הכי? — משחק ההצבעות למסיבה",
    intro="\"מי הכי צפוי להירדם ראשון?\" \"מי הכי דרמה קווין?\" מי הכי הוא משחק החברה שהופך את השאלות האלה לרגעים הכי מצחיקים של הערב: כולם מצביעים בסתר מהטלפון, ואז מניחים את הטלפונים על השולחן — והטלפון של מי שנבחר נדלק בזהב מול כולם.",
    steps=["המארח פותח חדר ב-larik.ai וכולם סורקים QR — בלי להוריד כלום.","המארח כותב שאלת \"מי הכי...\" (או בוחר מהמוכנות).","כולם מצביעים בסתר בטלפון מי הכי מתאים.","מניחים טלפונים על השולחן — והטלפון של הנבחר נדלק! בסוף הערב מוכרז כוכב הערב."],
    tips=["שאלות מביכות-בעדינות עובדות הכי טוב: \"מי הכי ישרוד באי בודד?\"","משחק פתיחה מושלם לערב — הוא משבר את הקרח תוך שתי דקות."],
    related=["impostor","alias","trivia"]),
  dict(id="impostor", name="המתחזה", icon="🎭", players="3–15", minutes="15–30",
    title="המתחזה — משחק המילה הסודית | משחק חברה לטלפון | LARIK",
    desc="משחק המתחזה אונליין: כולם מקבלים מילה סודית חוץ מאחד. רמזים, חשדות והצבעה — מי המתחזה ביניכם? בלי אפליקציה, ישר מהדפדפן.",
    h1="המתחזה — מצאו את מי שלא יודע",
    intro="כולם מקבלים בטלפון את אותה מילה סודית — חוץ מאחד, שמגלה שהוא המתחזה. עכשיו כל אחד בתורו אומר מילה שקשורה למילה הסודית: מדויק מדי — עזרת למתחזה, מעורפל מדי — יחשדו בך. משחק הרמאות והפסיכולוגיה שמייצר את הוויכוחים הכי טובים בערב.",
    steps=["פותחים חדר וסורקים QR.","כל אחד מציץ בטלפון: לכולם מילה — לאחד \"אתה המתחזה\".","סבב רמזים: מילה אחת כל אחד, בקול.","מתווכחים, מצביעים — והמארח חושף את האמת."],
    tips=["המתחזה החכם מקשיב לרמזים ומעתיק את הסגנון — אל תיחשפו ראשונים.","מעולה גם למשפחות: אין ידע נדרש, רק אינטואיציה."],
    related=["whomost","deathtouch","alias"]),
  dict(id="colorrules", name="חוקי הצבע", icon="🎨", players="2–12", minutes="5–15",
    title="חוקי הצבע — משחק רפלקסים מטורף לטלפון | LARIK",
    desc="המסך מצווה ואתם מצייתים: גע! צעק! קום! וצבע לבן — אסור לגעת. משחק רפלקסים לחבורה, בלי אפליקציה ובחינם.",
    h1="חוקי הצבע — המסך מצווה, אתם מצייתים",
    intro="המסך של כל אחד מתמלא בצבע עם פקודה: גע! צעק! קום! אבל שימו לב — צבע לבן אומר אל תיגע בכלל. מי שטועה או מהסס מאבד לב, ומי ששורד אחרון מנצח. משחק אנרגיה מהיר שמרים כל מסיבה תוך שניות.",
    steps=["פותחים חדר, כולם סורקים QR.","המסך מתחלף בין צבעים ופקודות בקצב עולה.","טעית או היססת? ירד לך לב. יש שלושה.","האחרון ששורד — המלך."],
    tips=["מצב \"מהיר 🔥\" הוא כאוס מוחלט — מומלץ רק אחרי סיבוב חימום.","עובד מצוין גם בשולחן מסעדה בזמן שמחכים לאוכל."],
    related=["simon","bombs","pods"]),
  dict(id="simon", name="סימון מבוזר", icon="🟩", players="2–8", minutes="10–15",
    title="סימון מבוזר — משחק זיכרון קבוצתי על כמה טלפונים | LARIK",
    desc="הטלפונים נדלקים ברצף הולך ומתארך — וכולכם צריכים לשחזר אותו ביחד. משחק זיכרון שיתופי בלי אפליקציה.",
    h1="סימון מבוזר — זיכרון של קבוצה אחת",
    intro="קחו את משחק הזיכרון הקלאסי ופזרו אותו על כל הטלפונים בחדר: המסכים נדלקים בזה אחר זה ברצף שהולך ומתארך, ואתם — כקבוצה אחת — צריכים לשחזר אותו בדיוק. כל אחד נוגע במסך שלו בדיוק כשהתור שלו מגיע. נשמע פשוט? חכו לרצף העשירי.",
    steps=["פותחים חדר וסורקים QR.","מניחים את הטלפונים במעגל שכולם רואים.","הטלפונים נדלקים ברצף — זכרו את הסדר.","משחזרים ביחד: כל אחד נוגע כשהתור של הטלפון שלו. 3 חיים לקבוצה."],
    tips=["תנו שמות לטלפונים (\"הכחול של דנה\") — זה משנה הכול.","המשחק הכי טוב לגיבוש: או שכולם מנצחים או שאף אחד."],
    related=["colorrules","bombs","pods"]),
  dict(id="deathtouch", name="נגיעת המוות", icon="🔪", players="4–12", minutes="15–25",
    title="נגיעת המוות — משחק הרוצח לטלפונים | LARIK",
    desc="רוצח סודי מסתובב בחדר ונוגע בטלפונים — בלי להיתפס. משחק המאפיה/רוצח בגרסת טלפונים, בלי אפליקציה.",
    h1="נגיעת המוות — רוצח מסתובב בחדר",
    intro="גרסת הטלפונים למשחק הרוצח הקלאסי: אחד מכם מקבל בסתר את תפקיד הרוצח. בחלון הציד כל הטלפונים על השולחן והידיים באוויר — והרוצח צריך לגעת במסך של קורבן בלי שאף אחד ישים לב. אחר כך: סבב האשמות סוער, הצבעה, וחשיפה.",
    steps=["פותחים חדר וסורקים QR — אחד מקבל בסתר: רוצח 🔪","חלון ציד: טלפונים על השולחן, ידיים למעלה, עיניים פקוחות.","הרוצח נוגע בקורבן בלי להיתפס. המסך של הקורבן \"נרצח\".","האשמות, הצבעה — ובדיקה אם צדקתם."],
    tips=["עמעמו את האורות בחדר — זה משדרג את המתח פי עשרה.","רוצח טוב מאשים אחרים בקול רם. רוצח מעולה מגן על קורבן."],
    related=["impostor","whomost","demons"]),
  dict(id="demons", name="השדים הקטנים", icon="👹", players="2–10", minutes="5–10",
    title="השדים הקטנים — משחק מהירות ותחרות בין טלפונים | LARIK",
    desc="אספו כוכבים על המסך ושגרו שדים למסכים של החברים. דקה אחת של תחרות מטורפת — בלי אפליקציה.",
    h1="השדים הקטנים — תחרות של דקה אחת",
    intro="דקה אחת על השעון: כוכבים צצים על המסך שלכם ואתם קוטפים אותם בנגיעה. אבל הטוויסט — כשהמד מתמלא, אתם משגרים שד 👹 למסך של יריב, והוא מסתיר לו את הכוכבים לכמה שניות. משחק קצר, רועש ומושלם בין סבבים של משחקים אחרים.",
    steps=["פותחים חדר וסורקים QR.","גו! כוכבים צצים — קטפו כמה שיותר.","המד התמלא? בחרו יריב ושגרו שד.","אחרי 60 שניות: טבלת התוצאות מוכרזת."],
    tips=["שמרו את השדים לעשר השניות האחרונות — שם נקבע המשחק.","שחקו 3 סיבובים: הפסדת? אתה מוזג לכולם."],
    related=["colorrules","pods","bombs"]),
  dict(id="alias", name="על הלשון", icon="👅", players="3–12", minutes="10–20",
    title="על הלשון — משחק תיאור מילים בעברית לטלפון | LARIK",
    desc="תארו את המילה בלי להגיד אותה — והחברים צועקים ניחושים. כולל חפיסה אישית שה-AI בונה לכל נושא. בלי אפליקציה.",
    h1="על הלשון — תארו בלי להגיד",
    intro="על המסך שלכם מופיעה מילה — ואתם צריכים לגרום לחברים לצעוק אותה בלי להגיד אותה בעצמכם (וגם לא באנגלית!). 45 שניות, כמה שיותר מילים. ואם תרצו — ה-AI שלנו ירקח לכם חפיסה אישית לכל נושא: החתונה של דנה, הקיבוץ, שנות ה-90.",
    steps=["פותחים חדר, בוחרים חפיסה (או יוצרים אישית ✨).","בתורך: מילה על המסך — תאר בקול.","החברים צועקים. ניחשו? ✓ והבאה בתור.","45 שניות לסבב — מי צבר הכי הרבה?"],
    tips=["החפיסה האישית היא הקסם: כתבו \"בדיחות פנימיות של החבורה\" וצפו במה שיוצא.","חוק בית מומלץ: תנועות ידיים מותרות, צלילים אסורים."],
    related=["forehead","trivia","whomost"]),
  dict(id="trivia", name="טריוויה", icon="🧠", players="2–20", minutes="10–15",
    title="טריוויה קבוצתית אונליין מהטלפון — בעברית | LARIK",
    desc="משחק טריוויה בעברית לכל החבורה: שאלה אצל כולם באותה שנייה, המהיר והצודק מנצח. בלי אפליקציה ובחינם.",
    h1="טריוויה — המהיר והצודק מנצח",
    intro="שאלה מופיעה אצל כולם באותה שנייה בדיוק — ומי שעונה נכון ומהר מקבל יותר נקודות. שמונה שאלות, טבלת מובילים חיה, ובסוף אלוף אחד. נושאים: ישראל, עולם, מדע או מיקס — בעברית, בלי אפליקציה ובלי הרשמה.",
    steps=["פותחים חדר ב-larik.ai, בוחרים נושא.","כולם סורקים QR מהטלפון.","שאלה אצל כולם בו-זמנית — עונים מהר!","אחרי 8 שאלות: האלוף מוכרז."],
    tips=["מצב \"ישראל 🇮🇱\" הוא שובר השוויון המושלם בין דור ה-X לדור Z.","שחקו טורניר: שלושה סבבים, נושא שונה כל פעם."],
    related=["alias","whomost","forehead"]),
  dict(id="bombs", name="מטר הפצצות", icon="💣", players="2–10", minutes="5–15",
    title="מטר הפצצות — משחק שיתופי מטורף לטלפונים | LARIK",
    desc="פצצות נופלות על המסכים — והחבורה כולה צוות אחד: העבירו, שפשפו, החזיקו ביחד. משחק קואופרטיבי בלי אפליקציה.",
    h1="מטר הפצצות — כולם צוות אחד",
    intro="כאן לא מתחרים — שורדים ביחד. פצצות נופלות על המסכים של כולם, וכל סוג דורש טיפול אחר: רגילה מעבירים בהחלקה לחבר, דביקה משפשפים, כפולה מחזיקים ביחד בשני טלפונים. ככל שעובר הזמן הקצב עולה, והצוות ששורד הכי הרבה — נכנס להיסטוריה.",
    steps=["פותחים חדר וסורקים QR.","פצצה על המסך? נטרלו לפי הסוג — או העבירו לחבר.","דביקה: שפשפו. כפולה: שני טלפונים ביחד.","הקצב עולה עד שמישהו נשבר. כמה זמן תשרדו?"],
    tips=["לשבת במעגל צפוף — ההעברות הן חצי מהכיף.","מצב \"מטורף 🔥\" אחרי שהצוות מתחמם."],
    related=["simon","colorrules","demons"]),
  dict(id="forehead", name="על המצח", icon="🤳", players="3–10", minutes="10–20",
    title="על המצח — נחשו מי אתם | משחק חברה לטלפון | LARIK",
    desc="שימו את הטלפון על המצח — כולם רואים מי אתם חוץ מכם. שאלות כן/לא וניחושים. כולל חפיסה אישית מה-AI. בלי אפליקציה.",
    h1="על המצח — כולם יודעים מי אתה, חוץ ממך",
    intro="הקלאסיקה בגרסה שלא צריך פתקים ומדבקות: שימו את הטלפון על המצח והמסך מציג לכולם מי אתם — דמות, חיה או מפורסם. שאלו שאלות כן/לא, צמצמו אפשרויות, וכשאתם בטוחים — נחשו. עם חפיסות מוכנות או חפיסה אישית שה-AI בונה לחבורה שלכם.",
    steps=["פותחים חדר, בוחרים חפיסה (או יוצרים אישית ✨).","בתורך: טלפון על המצח, מסך החוצה.","שאל שאלות כן/לא — החברים עונים.","בטוח? נחש! החברים שופטים אם צדקת."],
    tips=["חפיסה אישית של \"אנשים מהכיתה\" — ערב שלם של צחוק מובטח.","חוק: מותר לשקר פעם אחת בערב בתשובות. גלו מתי."],
    related=["alias","whomost","trivia"]),
  dict(id="pods", name="פודים", icon="⚡", players="2–10", minutes="5–10",
    title="פודים — משחק מהירות פיזי עם טלפונים על השולחן | LARIK",
    desc="הטלפונים מפוזרים על השולחן כפודים של אור — פוד נדלק ורצים לגעת בו ראשונים. מדידת מילישניות אמיתית. בלי אפליקציה.",
    h1="פודים — מי הכי מהיר בחדר?",
    intro="מפזרים את כל הטלפונים על השולחן והם הופכים לפודים של אור. פוד נדלק — כולם מזנקים לגעת בו ראשונים, והמערכת מודדת את זמן התגובה במילישניות. מלך המהירות או הישרדות: משחק פיזי אמיתי שמרים את הדופק של כל החדר.",
    steps=["פותחים חדר וסורקים QR בכל הטלפונים.","מפזרים את הטלפונים על השולחן — מסכים למעלה.","פוד נדלק? געו בו ראשונים!","המערכת מציגה מי הכי מהיר — במילישניות."],
    tips=["הרחיקו כוסות מהשולחן. ברצינות.","מצב הישרדות 💀: האיטי בכל סבב נופל — עד שנשאר אחד."],
    related=["demons","colorrules","simon"]),
]

CSS = """
:root{--bg:#0c0817;--card:#171226;--green:#34e89e;--purple:#786cff;--text:#f0f0f8;--dim:#a8a4be}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:'Rubik','Segoe UI',-apple-system,Arial,sans-serif;line-height:1.7}
a{color:var(--green);text-decoration:none}
.wrap{max-width:760px;margin:0 auto;padding:24px 20px 60px}
header.top{display:flex;justify-content:space-between;align-items:center;padding-bottom:20px}
.logo{font-weight:800;font-size:1.3rem;color:var(--text);letter-spacing:1px}
.logo b{color:var(--green)}
.cta{display:inline-block;background:var(--green);color:#06281a;font-weight:700;padding:12px 26px;border-radius:14px;font-size:1.05rem}
.cta:hover{filter:brightness(1.1)}
.hero-icon{font-size:3.2rem;line-height:1}
h1{font-size:1.9rem;font-weight:800;margin:10px 0 6px}
.tag{color:var(--dim);font-size:1.05rem}
.facts{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}
.fact{background:var(--card);border:1px solid #2a2440;border-radius:12px;padding:8px 14px;font-size:.95rem}
.fact b{color:var(--green)}
section{margin-top:30px}
h2{font-size:1.25rem;font-weight:700;margin-bottom:10px;color:var(--green)}
ol.steps{padding-inline-start:0;list-style:none;counter-reset:s}
ol.steps li{counter-increment:s;background:var(--card);border:1px solid #2a2440;border-radius:12px;padding:12px 14px;margin-bottom:8px;display:flex;gap:12px;align-items:baseline}
ol.steps li::before{content:counter(s);background:var(--green);color:#06281a;font-weight:800;min-width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:.9rem}
ul.tips{padding-inline-start:0;list-style:none}
ul.tips li{margin-bottom:8px;padding-inline-start:26px;position:relative}
ul.tips li::before{content:"💡";position:absolute;inset-inline-start:0}
.ctabox{margin-top:34px;text-align:center;background:linear-gradient(135deg,#14301f,#171226);border:1px solid #2a5c40;border-radius:18px;padding:28px 20px}
.ctabox p{color:var(--dim);margin-bottom:14px}
.related{display:flex;gap:10px;flex-wrap:wrap}
.related a{background:var(--card);border:1px solid #2a2440;border-radius:12px;padding:10px 14px;color:var(--text)}
.related a:hover{border-color:var(--green)}
footer{margin-top:44px;padding-top:18px;border-top:1px solid #2a2440;color:var(--dim);font-size:.9rem;display:flex;gap:14px;flex-wrap:wrap}
footer a{color:var(--dim)}
footer a:hover{color:var(--green)}
"""

def page(slug, title, desc, body, canonical, og_title=None, lang="he", direction="rtl"):
    return f"""<!doctype html>
<html lang="{lang}" dir="{direction}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="theme-color" content="#0c0817"/>
<title>{title}</title>
<meta name="description" content="{desc}"/>
<link rel="canonical" href="{canonical}"/>
<meta property="og:type" content="article"/>
<meta property="og:site_name" content="LARIK"/>
<meta property="og:title" content="{og_title or title}"/>
<meta property="og:description" content="{desc}"/>
<meta property="og:url" content="{canonical}"/>
<meta property="og:image" content="{BASE}/og-games.png"/>
<meta name="twitter:card" content="summary_large_image"/>
<link rel="icon" type="image/png" href="/icon-192.png"/>
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
{body}
</div>
</body>
</html>"""

FOOTER = """<footer>
<a href="/">🎮 פתיחת חדר</a>
<a href="/games">כל המשחקים</a>
<a href="/games/party">משחקים למסיבה</a>
<a href="/games/friends-night">ערב חברים</a>
<a href="/games/events">חתונות ואירועים</a>
</footer>"""

HEADER = """<header class="top"><a class="logo" href="/">LARIK<b>.</b></a><a class="cta" href="/">פתחו חדר ›</a></header>"""

by_id = {g["id"]: g for g in GAMES}

# ---- עמודי משחק ----
for g in GAMES:
    can = f"{BASE}/games/{g['id']}"
    steps = "\n".join(f"<li><span>{s}</span></li>" for s in g["steps"])
    tips = "\n".join(f"<li>{t}</li>" for t in g["tips"])
    rel = "\n".join(f'<a href="/games/{r}">{by_id[r]["icon"]} {by_id[r]["name"]}</a>' for r in g["related"])
    jsonld = json.dumps({
        "@context": "https://schema.org", "@type": "Game",
        "name": g["name"], "url": can, "inLanguage": "he",
        "description": g["desc"],
        "numberOfPlayers": {"@type": "QuantitativeValue", "minValue": int(g["players"].split("–")[0]), "maxValue": int(g["players"].split("–")[1])},
        "gamePlatform": "Web browser", "isAccessibleForFree": True,
    }, ensure_ascii=False)
    body = f"""{HEADER}
<div class="hero-icon">{g['icon']}</div>
<h1>{g['h1']}</h1>
<p class="tag">{g['intro']}</p>
<div class="facts">
<span class="fact">👥 <b>{g['players']}</b> שחקנים</span>
<span class="fact">⏱️ <b>{g['minutes']}</b> דקות</span>
<span class="fact">📱 בלי אפליקציה</span>
<span class="fact">🆓 בחינם</span>
</div>
<section><h2>איך משחקים?</h2><ol class="steps">{steps}</ol></section>
<section><h2>טיפים מהבית של LARIK</h2><ul class="tips">{tips}</ul></section>
<div class="ctabox"><p>כל מה שצריך זה טלפון אחד לכל שחקן ו-30 שניות.</p><a class="cta" href="/">פתחו חדר עכשיו — בחינם ›</a></div>
<section><h2>עוד משחקים שתאהבו</h2><div class="related">{rel}</div></section>
{FOOTER}
<script type="application/ld+json">{jsonld}</script>"""
    (OUT / f"{g['id']}.html").write_text(page(g["id"], g["title"], g["desc"], body, can), encoding="utf-8")

# ---- עמוד hub: כל המשחקים ----
cards = "\n".join(
    f'<a class="gamecard" href="/games/{g["id"]}"><span class="gi">{g["icon"]}</span><b>{g["name"]}</b><span class="gd">{g["desc"].split("׃")[0].split(":")[0][:90]}</span><span class="gp">👥 {g["players"]} · ⏱️ {g["minutes"]} דק׳</span></a>'
    for g in GAMES)
hub_css = """<style>
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-top:20px}
.gamecard{display:flex;flex-direction:column;gap:6px;background:var(--card);border:1px solid #2a2440;border-radius:16px;padding:16px;color:var(--text)}
.gamecard:hover{border-color:var(--green)}
.gi{font-size:2rem}.gd{color:var(--dim);font-size:.9rem;line-height:1.5}.gp{color:var(--green);font-size:.85rem}
</style>"""
hub_body = f"""{HEADER}
<h1>משחקי חברה לטלפון — בלי אפליקציה</h1>
<p class="tag">11 משחקים לחבורה שנמצאת באותו חדר: המארח פותח חדר, כולם סורקים QR מהטלפון — ותוך 30 שניות משחקים. בלי הורדות, בלי הרשמה, בעברית ובחינם. מ"מי הכי?" ועד טריוויה, ממשחקי רפלקסים ועד משחק הרוצח.</p>
{hub_css}
<div class="grid">{cards}</div>
<div class="ctabox"><p>ערב חברים מתחיל בסריקה אחת.</p><a class="cta" href="/">פתחו חדר עכשיו — בחינם ›</a></div>
<section><h2>אוספים לפי אירוע</h2><div class="related">
<a href="/games/party">🎉 משחקים למסיבה</a>
<a href="/games/friends-night">🛋️ משחקים לערב חברים</a>
<a href="/games/events">💍 משחקים לחתונה ואירועים</a>
</div></section>
{FOOTER}
<script type="application/ld+json">{json.dumps({"@context":"https://schema.org","@type":"CollectionPage","name":"משחקי חברה לטלפון — LARIK","url":BASE+"/games","inLanguage":"he"}, ensure_ascii=False)}</script>"""
(OUT / "index.html").write_text(page("games", "משחקי חברה לטלפון בלי אפליקציה — 11 משחקים בחינם | LARIK",
    "כל משחקי החברה של LARIK: מי הכי, המתחזה, על המצח, על הלשון, טריוויה ועוד — סורקים QR ומשחקים. בלי אפליקציה, בלי הרשמה, בעברית ובחינם.",
    hub_body, f"{BASE}/games"), encoding="utf-8")

# ---- עמודי אוסף ----
def collection(slug, title, desc, h1, intro, picks, extra=""):
    rel = "\n".join(f'<a href="/games/{r}">{by_id[r]["icon"]} {by_id[r]["name"]}</a>' for r in picks)
    items = "\n".join(
        f'<li><a href="/games/{r}"><b>{by_id[r]["icon"]} {by_id[r]["name"]}</b></a> — {by_id[r]["desc"]}</li>'
        for r in picks)
    body = f"""{HEADER}
<h1>{h1}</h1>
<p class="tag">{intro}</p>
<section><h2>המומלצים שלנו</h2><ul class="tips" style="list-style:none">{items}</ul></section>
{extra}
<div class="ctabox"><p>בלי ציוד, בלי הכנות — רק הטלפונים שכבר בכיס של כולם.</p><a class="cta" href="/">פתחו חדר עכשיו — בחינם ›</a></div>
<section><h2>עוד באתר</h2><div class="related"><a href="/games">🎮 כל המשחקים</a>{rel_others(slug)}</div></section>
{FOOTER}"""
    (OUT / f"{slug}.html").write_text(page(slug, title, desc, body, f"{BASE}/games/{slug}"), encoding="utf-8")

def rel_others(slug):
    m = {"party": [("friends-night","🛋️ ערב חברים"),("events","💍 אירועים")],
         "friends-night": [("party","🎉 מסיבה"),("events","💍 אירועים")],
         "events": [("party","🎉 מסיבה"),("friends-night","🛋️ ערב חברים")]}
    return "".join(f'<a href="/games/{s}">{t}</a>' for s, t in m[slug])

collection("party",
    "משחקים למסיבה מהטלפון — בלי ציוד ובלי אפליקציה | LARIK",
    "משחקי מסיבה שמרימים את האווירה תוך דקה: חוקי הצבע, פודים, השדים הקטנים ועוד. כולם סורקים QR — ומשחקים. בחינם.",
    "משחקים למסיבה — מהטלפון, בלי ציוד",
    "מסיבה שנתקעה? שלושה סבבים של משחקי אנרגיה יעשו את העבודה. המשחקים כאן קצרים, רועשים ולא דורשים שום דבר חוץ מהטלפונים שכבר אצל כולם ביד: פותחים חדר ב-larik.ai, כולם סורקים QR מהמסך — ותוך 30 שניות כל המסיבה משחקת.",
    ["colorrules","pods","demons","bombs","whomost"])

collection("friends-night",
    "משחקים לערב עם חברים — בסלון, מהטלפון | LARIK",
    "ערב חברים בסלון? מי הכי, המתחזה, על המצח וטריוויה — משחקי החברה שהופכים ערב רגיל ללילה בלתי נשכח. בלי אפליקציה.",
    "משחקים לערב עם חברים",
    "פיצה בדרך, כולם בסלון — ועכשיו מה? במקום לגלול בטלפונים, תנו לטלפונים לעבוד בשבילכם. אלה המשחקים שעובדים הכי טוב סביב שולחן סלון: משחקי היכרות והצחקה שנמשכים כל הערב, בלי קופסאות ובלי הסברים ארוכים.",
    ["whomost","impostor","forehead","alias","trivia"])

collection("events",
    "משחק לחתונה, מסיבת רווקות ואירועים — עם חפיסה אישית | LARIK",
    "משחקים לאירועים עם טוויסט אישי: ה-AI בונה חפיסת קלפים על החתן והכלה, על הקיבוץ או על החבורה. סורקים QR ומשחקים — בלי אפליקציה.",
    "משחקים לחתונה, רווקות ואירועים",
    "הסוד של אירוע בלתי נשכח הוא משחק שכולו על בעלי השמחה. עם החפיסה האישית של LARIK, ה-AI בונה בשניות חפיסת \"על המצח\" או \"על הלשון\" סביב כל נושא: \"החתונה של דנה ויוסי\", \"מסיבת הרווקות של שיר\", \"30 שנה לקיבוץ\". כל קלף הוא בדיחה פנימית — וכל סבב הוא סיפור.",
    ["forehead","alias","whomost","trivia"],
    extra="""<section><h2>איך עובדת החפיסה האישית?</h2><ol class="steps">
<li><span>פותחים חדר ובוחרים \"על המצח\" או \"על הלשון\".</span></li>
<li><span>בוחרים \"✨ חפיסה שלנו\" וכותבים נושא — למשל \"החתונה של דנה ויוסי\".</span></li>
<li><span>ה-AI רוקח 24 קלפים תפורים אישית תוך שניות.</span></li>
<li><span>משחקים — וכל החדר צוחק על בדיחות שרק אתם מבינים.</span></li>
</ol></section>""")

print("generated:", sorted(p.name for p in OUT.iterdir()))
