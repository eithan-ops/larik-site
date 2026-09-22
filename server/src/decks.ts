/**
 * LARIK — חפיסות, זוגות מילים וזרע הטריוויה, לפי שפת החדר.
 * התוכן עצמו (מקומי לכל שפה) יושב ב-content/<lang>.ts; כאן רק הבחירה וההגרלה.
 */
import type { LText } from "../../shared/protocol";
import { contentFor } from "./content";
import type { TriviaQ, UcPair } from "./content";
export type { TriviaQ, UcPair } from "./content";

/** id = מפתח החפיסה (animals/…); custom = חפיסה של החבורה, name = השם שהקלידו (או ריק → games.<g>.opt.deck.custom) */
export interface Deck { id: string; name: string; cards: string[] }

export interface DeckConfig { deck?: string; customName?: string; customCards?: string[] }

export function resolveDeck(cfg: DeckConfig, lang?: string): Deck {
  if (cfg.deck === "custom" && Array.isArray(cfg.customCards)) {
    const seen = new Set<string>();
    const cards: string[] = [];
    for (const c of cfg.customCards) {
      if (typeof c !== "string") continue;
      const t = c.trim().slice(0, 40);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      cards.push(t);
      if (cards.length >= 60) break;
    }
    if (cards.length >= 8) {
      const name = String(cfg.customName ?? "").trim().slice(0, 30);
      return { id: "custom", name: name ? `✨ ${name}` : "", cards };
    }
  }
  const decks = contentFor(lang).decks;
  const key = (cfg.deck && cfg.deck in decks ? cfg.deck : "animals") as keyof typeof decks;
  return { id: key, name: "", cards: decks[key].cards };
}

/** שם החפיסה לתצוגה — מפתח תרגום לחפיסה מובנית, או השם שהחבורה הקלידה */
export function deckLabel(game: string, deck: Deck): LText {
  return deck.id === "custom" && deck.name ? deck.name : { k: `games.${game}.opt.deck.${deck.id}` };
}

/* ---------- טריוויה — הזרע הסטטי לפי שפה (המאגר הגדל יושב ב-triviaBank) ---------- */
export const triviaSeed = (lang?: string): TriviaQ[] => contentFor(lang).trivia;

export function pickTrivia(cat: string, n: number, lang?: string): TriviaQ[] {
  const all = triviaSeed(lang);
  const pool = cat === "mix" ? [...all] : all.filter((t) => t.cat === cat);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

/* ---- המתחזה 🎭 — זוגות מילים: [המילה של כולם, המילה הדומה של המתחזה] ---- */
export function pickImpostorPair(lang?: string): [string, string] {
  const pairs = contentFor(lang).impostorPairs;
  const p = pairs[Math.floor(Math.random() * pairs.length)];
  return Math.random() < 0.5 ? p : [p[1], p[0]]; // לפעמים הופכים — שהמילה "הראשית" תתחלף
}

/* ---- "המתחזה למתקדמים" 🥸 — זוגות מדורגים: d:2 רגיל · d:1 קשה (ראו content/types.ts) ---- */
/** מגריל זוג לפי רמת קושי; מחזיר [מילת הרוב, מילת המתחזה] בסדר אקראי. */
export function pickUndercoverPair(level: "normal" | "hard", used: Set<string>, lang?: string): { pair: [string, string]; key: string } {
  const all: UcPair[] = contentFor(lang).undercoverPairs;
  const wanted = level === "hard" ? 1 : 2;
  let pool = all.filter((p) => p.d === wanted && !used.has(p.a + "|" + p.b));
  if (!pool.length) {
    used.clear();
    pool = all.filter((p) => p.d === wanted);
  }
  const p = pool[Math.floor(Math.random() * pool.length)];
  const key = p.a + "|" + p.b;
  used.add(key);
  // מי מהשניים הוא "מילת הרוב" מתחלף — אחרת אפשר ללמוד את החפיסה
  return { pair: Math.random() < 0.5 ? [p.a, p.b] : [p.b, p.a], key };
}
