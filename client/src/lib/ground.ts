/** הרקע של שפת "המדבקות" — שלושה מצבים, אותה שפה עיצובית.
 *
 *  night-paper  קליפה (בית, לובי): רקע דיו, מדבקות נייר בהירות.
 *               הרקע לא מאיר את החדר, המדבקות שומרות על כל הצבע.
 *  night-ink    בתוך משחק: גם המדבקות כהות. העין קופצת בין המילה,
 *               הטיימר והניקוד עשרות פעמים בדקה — שטח לבן גדול עולה
 *               בזמן הסתגלות בכל קפיצה.
 *  day          טקס סיום, כרטיס השיתוף, דף הנחיתה: נייר מלא.
 *               הבזק האור אחרי משחק כהה הוא חלק מהדרמה של סוף הערב.
 *
 *  ההחלטה היא של המוצר לפי הרגע, לא של המשתמש דרך הגדרה.
 */
export type Ground = "night-paper" | "night-ink" | "day";

const THEME_COLOR: Record<Ground, string> = {
  "night-paper": "#171310",
  "night-ink": "#12100E",
  day: "#FFF3DC",
};

export function setGround(g: Ground) {
  const root = document.documentElement;
  if (g === "night-paper") root.removeAttribute("data-ground");
  else root.setAttribute("data-ground", g);

  // סרגל הדפדפן בנייד צובע את עצמו לפי theme-color — בלי זה נשאר פס בצבע הישן
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[g]);
}
