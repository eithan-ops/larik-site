/**
 * התהום 🕳️ — נכסי התמונה (Higgsfield, 3.9.2026).
 * כל נכס הוא תוספת מעל הציור הפרוצדורלי: אם התמונה לא נטענה — הקוד הישן מצייר,
 * והמשחק שלם גם בלי אף קובץ. WebP קטנים, ספרייטים עם אלפא בינארי (הלקח מהחומה).
 *
 * ארבעה ביומים לפי עומק (פלחים): 🌱 שורשים (0-1) → 💜 מערת הגבישים (2-3) →
 * 🧊 הקרח (4-5) → 🌋 הלבה (6+). לכל ביום רקע + טקסטורת קיר.
 */
export type AbImgKey =
  | "rock0" | "rock1" | "rock2"
  | "bat" | "saw" | "spike" | "trap"
  | "crystal" | "gem" | "ledgeTex"
  | "bg0" | "bg1" | "bg2" | "bg3"
  | "wallTex0" | "wallTex1" | "wallTex2" | "wallTex3";

const FILES: Record<AbImgKey, string> = {
  rock0: "rock0.webp", rock1: "rock1.webp", rock2: "rock2.webp",
  bat: "bat.webp", saw: "saw.webp", spike: "spike.webp", trap: "trap.webp",
  crystal: "crystal.webp", gem: "gem.webp", ledgeTex: "ledge.webp",
  bg0: "bg-roots.webp", bg1: "bg-crystal.webp", bg2: "bg-ice.webp", bg3: "bg-lava.webp",
  wallTex0: "wall-roots.webp", wallTex1: "wall-crystal.webp", wallTex2: "wall-ice.webp", wallTex3: "wall-lava.webp",
};

const cache = new Map<AbImgKey, HTMLImageElement>();
export function abImg(k: AbImgKey): HTMLImageElement {
  let im = cache.get(k);
  if (!im) {
    im = new Image();
    im.src = `/abyss/${FILES[k]}`;
    cache.set(k, im);
  }
  return im;
}
export const abReady = (k: AbImgKey): boolean => {
  const im = abImg(k);
  return im.complete && im.naturalWidth > 0;
};
export function preloadAb() {
  (Object.keys(FILES) as AbImgKey[]).forEach(abImg);
}

/** אינדקס הביום לפי הפלח (kf רציף) — וגם השבר למעבר הדרגתי */
export const biomeOf = (kf: number): { i: number; f: number } => {
  const t = Math.max(0, kf) / 2;
  const i = Math.min(3, Math.floor(t));
  const f = i >= 3 ? 0 : Math.max(0, Math.min(1, t - i));
  return { i, f };
};

/** אמנות קלף הדראפט — <img> עם fallback לאימוג'י דרך onError */
export const cardArt = (id: string) => `/abyss/card-${id}.webp`;
