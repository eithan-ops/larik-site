/**
 * ספריית האולמות 🏟️ — "המערכת כבר מכירה את האולם".
 *
 * כל גוש (section) הוא מרובע (quad) של 4 פינות בקואורדינטות מנורמלות של האולם:
 * front-left → front-right (הצד הקרוב לבמה), back-right → back-left.
 * מיקום מושב = אינטרפולציה בילינארית של (שורה, מושב) בתוך המרובע.
 * לאפקטי אור מספיק דיוק של ±מושב — לכן מרובעים מספיקים גם לאולמות מעוגלים
 * (גוש מעוגל = מפצלים ל-2-3 מרובעים בכלי המיפוי).
 *
 * מוסיפים אולם: ממפים ב-/mapper (מעלים תרשים, מקליקים פינות) → מייצאים JSON → מדביקים כאן.
 */

export interface VenueSection {
  name: string;            // "גוש 1" / "יציע ימין"
  /** 4 פינות: [frontLeft, frontRight, backRight, backLeft] — כל אחת [x,y] ב-0..1 (y=0 בבמה) */
  quad: [number, number][];
  rows: number;            // מספר שורות בגוש
  seats: number;           // מושבים בשורה (מקסימלי)
}

export interface Venue {
  id: string;
  name: string;
  sections: VenueSection[];
}

/** מושב → קואורדינטה מנורמלת באולם. שורה 1 = הכי קרובה לבמה, מושב 1 = ימין הגוש. */
export function seatToXY(venue: Venue, sectionIdx: number, row: number, seat: number): { x: number; y: number } | null {
  const sec = venue.sections[sectionIdx];
  if (!sec) return null;
  const [fl, fr, br, bl] = sec.quad;
  // מנרמלים לתוך הגוש (שורות/מושבים הם 1-based בכרטיסים)
  const v = sec.rows > 1 ? Math.min(1, Math.max(0, (row - 1) / (sec.rows - 1))) : 0.5;   // 0=קדימה
  const u = sec.seats > 1 ? Math.min(1, Math.max(0, (seat - 1) / (sec.seats - 1))) : 0.5; // 0=שמאל הגוש
  // בילינארית: קו קדמי ← → קו אחורי
  const frontX = fl[0] + (fr[0] - fl[0]) * u, frontY = fl[1] + (fr[1] - fl[1]) * u;
  const backX = bl[0] + (br[0] - bl[0]) * u, backY = bl[1] + (br[1] - bl[1]) * u;
  return { x: frontX + (backX - frontX) * v, y: frontY + (backY - frontY) * v };
}

/** אולם דוגמה — תיאטרון קלאסי: 3 גושים קדמיים + יציע. משמש לפיילוטים ולהדגמה. */
export const VENUES: Venue[] = [
  {
    id: "demo-theater",
    name: "אולם דוגמה (תיאטרון ~600)",
    sections: [
      { name: "גוש שמאל", quad: [[0.06, 0.10], [0.30, 0.06], [0.24, 0.62], [0.02, 0.55]], rows: 14, seats: 10 },
      { name: "גוש מרכז", quad: [[0.34, 0.05], [0.66, 0.05], [0.70, 0.62], [0.30, 0.62]], rows: 16, seats: 16 },
      { name: "גוש ימין", quad: [[0.70, 0.06], [0.94, 0.10], [0.98, 0.55], [0.76, 0.62]], rows: 14, seats: 10 },
      { name: "יציע", quad: [[0.12, 0.72], [0.88, 0.72], [0.96, 0.97], [0.04, 0.97]], rows: 8, seats: 24 },
    ],
  },
];

export function getVenue(id: string | undefined): Venue | undefined {
  return VENUES.find((v) => v.id === id);
}
