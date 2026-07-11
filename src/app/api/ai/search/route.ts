import { NextResponse } from "next/server";

/**
 * הסוכן האישי — חיפוש דילים.
 * גרסת פיילוט: תשובה תבניתית. בפרודקשן: חיבור ל-LLM (Anthropic/OpenAI)
 * עם קטלוג הדילים בקונטקסט + היסטוריית מחירים.
 * הוסיפו ANTHROPIC_API_KEY ב-Vercel env והחליפו את המימוש כאן.
 */
export async function POST(req: Request) {
  const { q } = (await req.json().catch(() => ({}))) as { q?: string };
  const query = (q || "").trim() || "משהו שווה";
  const answer = `✨ <b>מצאתי:</b> "${query}" הכי משתלם עכשיו ב-<b>SportZone</b> — ₪249 אחרי קופון, ועוד <b style="color:#00E676">9% חזרה (₪22.40)</b>. המחיר ירד 12% השבוע — זה הזמן. <u>רוצה שאעקוב אם ירד עוד?</u>`;
  return NextResponse.json({ answer });
}
