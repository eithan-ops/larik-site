/**
 * החופרים — יצירת המכרה, משותפת לשרת וללקוח.
 *
 * זה הקובץ שמאפשר לעולם ההרסי לרוץ ברשת: השרת מגריל זרע ושולח אותו,
 * וכל לקוח מייצר מהזרע את *אותה* רשת בדיוק — 5,060 תאים בלי לשדר אף אחד מהם.
 * מכאן והלאה משדרים רק הפרשים ("התא הזה נשבר").
 *
 * ⚠️ בגלל זה חייבת להיות כאן מימוש אחד ויחיד: כל שינוי בסדר שבו נצרך
 * המחולל יפצל את המפה בין השרת ללקוח.
 */
export const HF_COLS = 46, HF_ROWS = 110;
export const HF_AIR = 0, HF_DIRT = 1, HF_CLAY = 2, HF_ROCK = 3, HF_HARD = 4, HF_BASALT = 5, HF_VEIN = 6, HF_WALL = 7, HF_LIFT = 8;
export const HF_LIFT_C = Math.floor(HF_COLS / 2);

/** קושי חציבה — זמן השבירה הוא קושי חלקי כוח המקדח. 999 = סלע-אם, לא נשבר */
export const HF_HARDNESS: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 4, 4: 6, 5: 8, 6: 10, 7: 999, 8: 0 };

export function hfRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hfIdx = (c: number, r: number) => r * HF_COLS + c;
export const hfDepthMul = (r: number) => (r < 26 ? 1 : r < 52 ? 1.4 : r < 82 ? 1.9 : 2.5);

export interface HfMine {
  grid: Uint8Array;
  item: Uint8Array;                                   // 1 = גביש, 2 = יהלום
  bags: { id: number; c: number; r: number }[];
  value: number;                                      // כמה זהב באמת קיים — היעד נגזר מזה
}

export function hfGenerate(seed: string): HfMine {
  const rng = hfRng(seed);
  const grid = new Uint8Array(HF_COLS * HF_ROWS);
  const item = new Uint8Array(HF_COLS * HF_ROWS);
  const bags: { id: number; c: number; r: number }[] = [];
  let value = 0;

  const band = (r: number) => {
    if (r < 4) return HF_AIR;
    if (r < 26) return rng() < 0.3 ? HF_CLAY : HF_DIRT;
    if (r < 52) return rng() < 0.3 ? HF_HARD : HF_ROCK;
    if (r < 82) return rng() < 0.25 ? HF_BASALT : HF_HARD;
    return rng() < 0.35 ? HF_VEIN : HF_BASALT;
  };

  for (let r = 0; r < HF_ROWS; r++) for (let c = 0; c < HF_COLS; c++) {
    grid[hfIdx(c, r)] = c === 0 || c === HF_COLS - 1 || r === HF_ROWS - 1 ? HF_WALL : r < 3 ? HF_AIR : band(r);
  }
  // פיר המעלית — נקודת ההתכנסות של כולם
  for (let r = 0; r < 5; r++) for (let c = HF_LIFT_C - 2; c <= HF_LIFT_C + 2; c++) grid[hfIdx(c, r)] = HF_AIR;
  for (let c = HF_LIFT_C - 2; c <= HF_LIFT_C + 2; c++) grid[hfIdx(c, 4)] = HF_LIFT;
  for (let r = 5; r < 9; r++) grid[hfIdx(HF_LIFT_C, r)] = HF_AIR;

  for (let r = 5; r < HF_ROWS - 1; r++) for (let c = 1; c < HF_COLS - 1; c++) {
    const i = hfIdx(c, r);
    if (grid[i] === HF_VEIN) { item[i] = 2; value += Math.round(150 * hfDepthMul(r)); continue; }
    if (grid[i] === HF_AIR || grid[i] === HF_WALL) continue;
    if (rng() < 0.28 + r * 0.0018) { item[i] = 1; value += Math.round(10 * hfDepthMul(r)); }
  }

  let id = 1;
  for (let r = 8; r < HF_ROWS - 4; r++) for (let c = 2; c < HF_COLS - 2; c++) {
    const i = hfIdx(c, r);
    if (rng() < (r < 34 ? 0.03 : 0.018) && grid[i] !== HF_AIR && grid[i] !== HF_WALL) {
      grid[i] = HF_AIR; item[i] = 0;
      bags.push({ id: id++, c, r });
      value += Math.round(60 * hfDepthMul(r));
    }
  }
  return { grid, item, bags, value };
}
