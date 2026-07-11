import { NextResponse } from "next/server";

/**
 * מחולל קמפיינים לעסקים קטנים.
 * גרסת פיילוט: תבנית. בפרודקשן: LLM שמנסח קופי, בוחר קטגוריה,
 * מציע אחוז קאשבק לפי מרווחי הענף, ומחשב תחזית לפי דאטת האזור.
 */
export async function POST(req: Request) {
  const { name, offer } = (await req.json().catch(() => ({}))) as {
    name?: string;
    offer?: string;
  };
  const bizName = (name || "").trim() || "העסק שלי";
  const bizOffer = (offer || "").trim() || "ההצעה שלך";
  return NextResponse.json({
    title: bizName,
    copy: `"${bizOffer}" — רק לחברי לאריק באזורך 🔥 · ה-AI ניסח, עיצב וטרגט`,
    cb: "10% חזרה",
  });
}
