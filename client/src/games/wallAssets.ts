/**
 * החומה 🏰 — מניפסט הנכסים. נכסי Recraft (כרומה-קי מג'נטה → WebP שקוף).
 * החלפת נכס = החלפת קובץ ב-public/wall, אפס שינויי קוד.
 */
export const WL_IMG = {
  heroInfantry: "/wall/hero-infantry.webp",
  heroArcher: "/wall/hero-archer.webp",
  heroCannon: "/wall/hero-cannon.webp",
  heroMg: "/wall/hero-mg.webp",
  eSwarm: "/wall/e-swarm.webp",
  eRunner: "/wall/e-runner.webp",
  eArmored: "/wall/e-armored.webp",
  eBomber: "/wall/e-bomber.webp",
  eSniper: "/wall/e-sniper.webp",
  eDigger: "/wall/e-digger.webp",
  eBoss: "/wall/e-boss.webp",
  cannon1: "/wall/cannon1.webp",
  cannon2: "/wall/cannon2.webp",
  cannon3: "/wall/cannon3.webp",
  mg1: "/wall/mg1.webp",
  mg2: "/wall/mg2.webp",
  walltex: "/wall/walltex.webp",
  tower: "/wall/tower.webp",
  gate: "/wall/gate.webp",
  bgfield: "/wall/bgfield.webp",
  boom: "/wall/boom.webp",
  crack: "/wall/crack.webp",
  arrow: "/wall/arrow.webp",
  arrowFire: "/wall/arrow-fire.webp",
  badgeInfantry: "/wall/badge-infantry.webp",
  badgeArcher: "/wall/badge-archer.webp",
  badgeCannon: "/wall/badge-cannon.webp",
  badgeMg: "/wall/badge-mg.webp",
  slash: "/wall/slash.webp",
  muzzle: "/wall/muzzle.webp",
  hit: "/wall/hit.webp",
  // אפקטי תכונה — כל שדרוג מקבל חתימה ויזואלית משלו, שנראית על האויב ברגע הפגיעה
  fxBurn: "/wall/fx-burn.webp",
  fxFrost: "/wall/fx-frost.webp",
  fxChain: "/wall/fx-chain.webp",
  fxPoison: "/wall/fx-poison.webp",
  fxBlast: "/wall/fx-blast.webp",
  fxPierce: "/wall/fx-pierce.webp",
  fxVamp: "/wall/fx-vamp.webp",
} as const;

export type WlImgKey = keyof typeof WL_IMG;

const cache = new Map<WlImgKey, HTMLImageElement>();
export function wlImg(k: WlImgKey): HTMLImageElement {
  let im = cache.get(k);
  if (!im) {
    im = new Image();
    im.src = WL_IMG[k];
    cache.set(k, im);
  }
  return im;
}
/** טעינה מוקדמת של הכול */
export function preloadWl() { (Object.keys(WL_IMG) as WlImgKey[]).forEach(wlImg); }
