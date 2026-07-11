# LARIK · לאריק — כסף עם חברים

אפליקציית web מובייל-פירסט (Next.js): קאשבק על קנייה שלך + עמלה כשחברים קונים דרכך.
חלוקה שקופה: 8% לפלטפורמה, 92% למשתמשים (60% למוביל, 16%→8%→4%→... לשרשרת, עד אינסוף).
אנונימי כברירת מחדל — פרטים אישיים רק ברגע משיכת מזומן, אצל ספק אימות חיצוני.

## הרצה מקומית
```bash
npm install
npm run dev
```

## בדיקות מנוע החלוקה
```bash
npx tsx scripts/split.test.ts
```

## פריסה ל-Vercel (בחשבון eithan-ops)
דרך א' — מהטרמינל:
```bash
npm i -g vercel
vercel login
vercel --prod
```
דרך ב' — דרך GitHub: לדחוף את התיקייה הזו לריפו (למשל eithan-ops/larik-site)
ו-Vercel יפרוס אוטומטית. אחר כך ב-Settings → Domains לחבר את larik.ai
(ב-GoDaddy: לעדכן A record ל-76.76.21.21 ו-CNAME של www ל-cname.vercel-dns.com).

## מבנה
- `src/lib/split.ts` — מנוע חלוקת העמלות (עם בדיקות ב-scripts/)
- `src/lib/store.tsx` — סטור צד-לקוח (דמו). מוחלף ב-Supabase בפרודקשן — אותו ממשק.
- `src/app/app/*` — הטאבים: דילים, גלקסיה, ליגה, ארנק, לעסקים
- `src/app/api/ai/*` — נקודות ה-AI (תבניות בפיילוט; לחבר LLM עם env key)

## מה עוד לא כאן (בכוונה — שלב הפיילוט הבא)
DB אמיתי (Supabase) · אימות SMS אופציונלי · חיבור רשתות affiliate · KYC ספק חיצוני · זיהוי הונאות
