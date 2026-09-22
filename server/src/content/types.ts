/**
 * תוכן המשחקים לפי שפה — חפיסות, זוגות המתחזה, זוגות המתחזה למתקדמים, וזרע הטריוויה.
 * לכל שפה קובץ משלה (he.ts, en.ts, …) עם *תוכן מקומי* — לא תרגום: מפורסמים, אוכל, ערים
 * וחגים של המדינות שמדברות את השפה, וקטגוריית הטריוויה "local" עוסקת באזור הזה.
 */
export interface DeckDef { cards: string[] }
export type DeckKey = "animals" | "celebs" | "food" | "cartoons";

/** הקטגוריה "israel" היא "מקומי" — ישראל בעברית, ספרד+אמריקה הלטינית בספרדית, וכו' (המזהה נשמר לתאימות) */
export type TriviaCat = "israel" | "world" | "science" | "weird";
export interface TriviaQ { q: string; options: string[]; correct: number; cat: TriviaCat }

/** זוג ל"המתחזה למתקדמים": d:2 רגיל (אותה קטגוריה, 2–3 תכונות שונות) · d:1 קשה (כמעט חופפות) */
export interface UcPair { a: string; b: string; d: 1 | 2 }

export interface LangContent {
  decks: Record<DeckKey, DeckDef>;
  /** [המילה של כולם, המילה הדומה של המתחזה] */
  impostorPairs: [string, string][];
  undercoverPairs: UcPair[];
  trivia: TriviaQ[];
}
