/**
 * "החומה" 🏰 — צד לקוח. רנדור canvas ב-60fps מעל סימולציה דטרמיניסטית:
 * אויבים נעים לפי הנוסחה ששודרה ב-spawn (זהה לשרת), אירועים (פגיעות/מצבים)
 * מגיעים כ-cue. לכל תפקיד פועל שליטה משלו:
 * ⚔️ חלוץ — גרירה=תנועה, החלקה מהירה=מכה לכיוון, כפתור מגן. 🏹 קשת — מתיחה
 * ושחרור (Angry Birds). 💣 תותחן — כיוון ושיגור עם קשת מסלול. 🔫 מקלען — החזקה
 * וגרירת כיוון עם מד חום. "עולם אחד, חלון אישי": מצלמה ממוקדת בעמדה שלך.
 */
import { useEffect, useRef, useState } from "react";
import type { WallServerMsg, WallRole, WallCard, WallStats, WallEnemyType, WallAffix } from "../../../shared/protocol";
import type { GameViewProps } from "./registry";
import { Sfx, vibrate } from "../lib/audio";
import { wlImg, preloadWl, type WlImgKey } from "./wallAssets";

/* ---- קבועי עולם (זהים לשרת) ---- */
const W = 1000, WORLD_H = 1600, WALL_Y = 1250, GATE_X = 500;
const VIEW_W = 660; // רוחב החלון האישי ביחידות עולם

const ROLE_NAME: Record<WallRole, string> = { heli: "הליקופטר", archer: "קשת", cannon: "תותחן", mg: "מקלען" };
const ROLE_ICON: Record<WallRole, string> = { heli: "🚁", archer: "🏹", cannon: "💣", mg: "🔫" };
const ROLE_COLOR: Record<WallRole, string> = { heli: "#ff5c5c", archer: "#34e89e", cannon: "#ffce3c", mg: "#5c8aff" };
const ROLE_DESC: Record<WallRole, string> = {
  heli: "גרור לטוס — מטיל פצצות לבד. הדלק נגמר באוויר: חוזרים לחומה לתדלק!",
  archer: "גע והחזק על המטרה — הקשת יורה לבד. הזז את האצבע לכוון",
  cannon: "כוון ושחרר — פגז שטח. כל פגז הוא החלטה",
  mg: "החזק וגרור לרסס כדורים על כל השדה. היזהר מהתחממות!",
};
const ROLE_HINT: Record<WallRole, string> = {
  heli: "🕹️ גרור לטוס — הפצצות נופלות לבד · ⛽ הדלק נשרף באוויר, רד לחומה לתדלק · 🎯 התחמק מאש נגד-מטוסים",
  archer: "👆 גע והחזק על אויב — הקשת יורה לבד · הזז את האצבע כדי לכוון",
  cannon: "🎯 גרור לכוון, שחרר — בום! כל פגז הוא החלטה",
  mg: "👆 החזק וגרור ימינה-שמאלה — מרסס על כל השדה · שים עין על מד החום",
};
const ETYPE_IMG: Record<WallEnemyType, WlImgKey> = {
  swarm: "eSwarm", runner: "eRunner", armored: "eArmored", bomber: "eBomber", sniper: "eSniper", digger: "eDigger", boss: "eBoss",
};
const ETYPE_SIZE: Record<WallEnemyType, number> = { swarm: 52, runner: 60, armored: 84, bomber: 64, sniper: 68, digger: 62, boss: 150 };

/* ---- 🏷️ תכונות עילית — טבעת צבע + אימוג'י, אפס נכסים. באנר בהופעה הראשונה. ---- */
const AFFIX_EMOJI: Record<WallAffix, string> = { roof: "🏠", healer: "💚", shield: "🌀" };
const AFFIX_COLOR: Record<WallAffix, string> = { roof: "#e0b64e", healer: "#8ee34a", shield: "#6ec6ff" };
const AFFIX_BANNER: Record<WallAffix, string> = {
  roof: "🏠 גג מבוצר — פצצות לא עובדות עליו! תפקידי הקרקע, זה עליכם",
  healer: "💚 מרפא — מרפא את הנחיל! תורידו אותו קודם",
  shield: "🌀 מגן קינטי — רק אש רציפה שוברת אותו!",
};

/* ---- שפת המראה של הנשק ----
 * המראה לא נבחר מרשימה — הוא *מורכב* מהתכונות שאספת: צבע ליבה, צבע שובל, אורך
 * שובל, עובי, זוהר, חלקיקים ואאורה. 8 תכונות × ערימות = צירופים בלי סוף, אפס נכסים.
 * כל השחקנים מקבלים wl_style של כולם — ולכן רואים את הנשק של החבר משתנה. */
const TRAIT_COLOR: Record<string, string> = {
  burn: "#ff7a2f", frost: "#5fd8ff", chain: "#bfe8ff", poison: "#8ee34a",
  blast: "#ff5c3d", pierce: "#e6edf5", multi: "#ffd24a", vamp: "#ff3b6b",
};
const TRAIT_EMOJI: Record<string, string> = {
  burn: "🔥", frost: "❄️", chain: "⚡", poison: "☠️", blast: "💥", pierce: "🗡️", multi: "✨", vamp: "🩸",
};
const TRAIT_ORDER = ["burn", "frost", "chain", "poison", "blast", "pierce", "multi", "vamp"];
/** נכס אפקט ייעודי לכל תכונה — זה מה שהופך כל שדרוג לחד-משמעי ברגע הפגיעה */
const EVO_ART = (t: string) => `/wall/evo-${t}.webp`;
const TRAIT_FX: Record<string, WlImgKey> = {
  burn: "fxBurn", frost: "fxFrost", chain: "fxChain", poison: "fxPoison",
  blast: "fxBlast", pierce: "fxPierce", vamp: "fxVamp",
};
/** צבע מספר הנזק לפי מקור הפגיעה — DoT ושרשרת נראים אחרת מפגיעה ישירה */
const KIND_COLOR: Record<string, string> = { burn: "#ff9a3c", poison: "#8ee34a", chain: "#bfe8ff", blast: "#ff6b4d" };
interface WStyle { traits: Record<string, number>; tier: number; evos: string[]; amps?: Record<string, number> }
interface Vis {
  color: string | null; second: string | null; top: string[]; total: number; glow: number; size: number; tier: number; evo: boolean;
  // ---- חתימות המגברים: כל קלף אחוזים מקבל קריאה ויזואלית שמתעצמת עם כל ערימה.
  //      בלי זה תשעה מתוך קלפי הדראפט לא משנים פיקסל אחד, ו"שדרוג" הוא מספר בלבד.
  amps: Record<string, number>;
  band: string;      // צבע רצועת הדרגה — הצללית שרואים מהצד השני של השדה
  power: number;     // סך הבחירות: הילת העוצמה סביב הגיבור
  muzzle: number;    // 💥 עוצמה + ⚡ קצב — גודל הבזק הלוע
  gold: number;      // 🎯 קטלניות — ריצוד זהב
  reach: number;     // 📏 טווח — טבעת טווח
  after: number;     // 👟 זריזות — שובל דמויות-צל
  plate: number;     // ❤️ חוסן — שכבת שריון
  vapor: number;     // ❄️ קירור-על — אדי כפור
  motes: number;     // 🧠 חוכמת קרב — חלקיקי XP
}
/** רצועות דרגה: ברזל → ארד → כסף → זהב → סגול → ורוד-קוסמי, ומעלה — פרוצדורלי */
/** צבע ייעודי לכל מגבר — קודם כל ה-amps הבזיקו באותו צהוב, אז "שדרוג" לא נקרא כאירוע */
const AMP_COLOR: Record<string, string> = {
  dmg: "#ff6b3d", rate: "#ffd24a", crit: "#ffd76a", range: "#8fd4ff", armor: "#c98a4b",
  exec: "#ff4d6d", momo: "#a0ff7a", xp: "#7fd8ff", wall: "#b9a06a", hp: "#ff8fa3",
  speed: "#9cff9c", sentry: "#dfe6ef", radius: "#ffab5c", heatc: "#9fe8ff",
  tracer: "#fff2a8", shieldstr: "#cfe4ff", lifesteal: "#ff5c8a",
  // 🚁 פצצות
  payload: "#ff6b3d", salvo: "#ffb347", blastr: "#ffab5c", fuse: "#ffd24a",
  napalm: "#ff7a2f", guided: "#8fd4ff", cluster: "#ff5c5c", shock: "#a0ffe0", plating: "#cfe4ff", tank: "#e0c36a",
};
const TIER_BAND = ["#9aa4b2", "#c98a4b", "#dfe6ef", "#ffce3c", "#b07dff", "#ff7ad9"];
const bandOf = (tier: number) =>
  tier <= TIER_BAND.length ? TIER_BAND[Math.max(0, tier - 1)]
    : `hsl(${(tier * 47) % 360} 90% 70%)`;   // מדרגה 7 והלאה: גוון חדש לכל דרגה, בלי תקרה
/** #rrggbb + אלפא → rgba() — כל הזוהר נגזר מזה */
const _rgbCache = new Map<string, [number, number, number]>();
function hexA(hex: string, a: number) {
  let c = _rgbCache.get(hex);
  if (!c) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    _rgbCache.set(hex, c);
  }
  return `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
}
const FX_CAP = 140; // תקציב חלקיקים — שומר 60fps גם על אנדרואיד חלש

interface EnemyV {
  id: number; type: WallEnemyType;
  hp: number; maxHp: number;
  x0: number; y0: number; speed: number; wob: number; at: number;
  state: "walk" | "fight" | "wall" | "burrow";
  deadAt?: number;
  affix?: WallAffix;
}
interface Proj { kind: "arrow" | "shell"; fx: number; fy: number; tx: number; ty: number; t0: number; T: number; fire?: boolean; by: string }
interface Fx { kind: "boom" | "slash" | "spark" | "levelup" | "dmg" | "trait"; x: number; y: number; t0: number; r?: number; dir?: number; color?: string; txt?: string; big?: boolean; trait?: string; sz?: number }
interface HeroV { role: WallRole; slot: [number, number]; x: number; y: number; hp: number; max: number; down: boolean; tier: number }

export default function WallView({ room, me, conn, hub }: GameViewProps) {
  const [phase, setPhase] = useState<"setup" | "wave" | "breath" | "over">("setup");
  const [wave, setWave] = useState(0);
  const [roles, setRoles] = useState<Record<string, WallRole>>({});
  const [wallHp, setWallHp] = useState(1);
  const [wallMax, setWallMax] = useState(1);
  const [myHp, setMyHp] = useState(150);
  const [myMax, setMyMax] = useState(150);
  const [down, setDown] = useState(false);
  const [xp, setXp] = useState({ xp: 0, level: 1, next: 10 });
  const [draft, setDraft] = useState<{ level: number; cards: WallCard[] } | null>(null);
  const [banner, setBanner] = useState("");
  const [toast, setToast] = useState("");
  const [jamUntil, setJamUntil] = useState(0);
  const [over, setOver] = useState<{ wave: number; bestWave: number; nearMiss?: string; mvp?: string; stats: Record<string, WallStats> } | null>(null);
  const [hint, setHint] = useState("");
  const [, setUi] = useState(0); // רענון קל ל-HUD

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const enemies = useRef(new Map<number, EnemyV>());
  const heroes = useRef(new Map<string, HeroV>());
  const projs = useRef<Proj[]>([]);
  const fxs = useRef<Fx[]>([]);
  const streams = useRef(new Map<string, { x: number; y: number }>()); // מקלען → נקודת הכיוון
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const waveRef = useRef(wave); waveRef.current = wave;
  // downRef מוגדר למטה עם שאר ה-refs — משוקף כאן אחרי ההגדרה
  const rolesRef = useRef(roles); rolesRef.current = roles;
  const camX = useRef(500);
  const viewWRef = useRef(VIEW_W);
  const dbgTick = useRef(0);
  const camTopRef = useRef(320);
  const joyRef = useRef({ active: false, ox: 0, oy: 0, kx: 0, ky: 0 }); // ג'ויסטיק צף (מסך)
  const lastAutoSwing = useRef(0);
  const lastBoomSfx = useRef(0);   // מגביל קול/רטט של פיצוצים — ההליקופטר מפוצץ עשרות פעמים בשנייה
  const bombs = useRef<{ x: number; y0: number; t0: number; fall: number; r: number; by: string }[]>([]); // 🚁 פצצות באוויר
  const flaks = useRef<{ id: number; x: number; y: number; at: number }[]>([]);                            // 🎯 סימוני אש נגד-מטוסים
  const lastAutoShot = useRef(0);
  const lastFrame = useRef(0);
  const downRef = useRef(false); downRef.current = down;
  const shake = useRef(0);
  const wallHpRef = useRef(1); // ה-closure של ה-subscribe נוצר פעם אחת — state כאן תמיד היה מיושן
  const modsRef = useRef({ rate: 1, speed: 1 }); // מגיע מהשרת: מכייל את שערי הקצב/המהירות המקומיים
  const hurtFlash = useRef(0);   // הבזק אדום כשהחומה חוטפת
  const styles = useRef(new Map<string, WStyle>());              // pid → איך הנשק שלו נראה
  const trails = useRef(new Map<string, { x: number; y: number }[]>()); // 👟 זריזות — דמויות-צל
  const surge = useRef<{ t0: number; color: string; big: boolean } | null>(null); // רגע השדרוג
  const wideUntil = useRef(0);   // אבולוציה — המצלמה של כולם נפתחת לרוחב מלא
  const parade = useRef(-1e9);   // מצעד הנשקים בסוף גל
  const chains = useRef<{ x1: number; y1: number; x2: number; y2: number; t0: number; c: string }[]>([]);
  const [evoBanner, setEvoBanner] = useState<{ name: string; emoji: string; who: string; trait: string } | null>(null);
  const [myStyle, setMyStyle] = useState<WStyle>({ traits: {}, tier: 1, evos: [] });
  const lastAlarm = useRef(0);
  const fuelRef = useRef({ fuel: 100, max: 100 });   // ⛽ הדלק מהשרת (הליקופטר)
  const lastFuelToast = useRef(0);
  const seenAffixes = useRef(new Set<string>());     // 🏷️ באנר פעם אחת לכל תכונה בריצה
  // קלט
  const ptr = useRef<{ down: boolean; x0: number; y0: number; t0: number; x: number; y: number; moved: boolean }>({ down: false, x0: 0, y0: 0, t0: 0, x: 0, y: 0, moved: false });
  const aimRef = useRef<{ tx: number; ty: number; power: number } | null>(null); // קשת/תותחן
  const heat = useRef(0);
  const firing = useRef(false);
  const lastPosSend = useRef(0);
  const lastAimSend = useRef(0);
  const cannonReady = useRef(0);

  /** מרכיב את הפרמטרים הוויזואליים מהתכונות של שחקן — הלב של "אינסוף בלי נכסים" */
  const visOf = (pid: string): Vis => {
    const s = styles.current.get(pid);
    const t = s?.traits ?? {};
    const list = TRAIT_ORDER.filter((k) => (t[k] ?? 0) > 0).sort((a, b) => (t[b] ?? 0) - (t[a] ?? 0));
    const total = list.reduce((a, k) => a + (t[k] ?? 0), 0);
    const tier = s?.tier ?? 1;
    const a = s?.amps ?? {};
    const n = (k: string) => a[k] ?? 0;
    const picks = Object.values(a).reduce((x, v) => x + v, 0);
    return {
      color: list[0] ? TRAIT_COLOR[list[0]] : null,
      second: list[1] ? TRAIT_COLOR[list[1]] : null,
      top: list.slice(0, 3), total,
      glow: Math.min(1, total / 7),
      // 💥 עוצמה מעבה את הקליע — עכשיו זה באמת נראה, לא רק מוסיף אחוזים
      size: 1 + Math.min(0.6, total * 0.05) + Math.min(0.4, (tier - 1) * 0.05) + Math.min(0.5, n("dmg") * 0.09),
      tier, evo: (s?.evos?.length ?? 0) > 0,
      amps: a,
      band: bandOf(tier),
      power: picks,
      muzzle: n("dmg") + n("rate"),
      gold: n("crit"),
      reach: n("range"),
      after: n("speed"),
      plate: n("hp"),
      vapor: n("heatc"),
      motes: n("xp"),
    };
  };

  /** משחזר את mods.range של השרת ממספר בחירות 📏 טווח — אותה נוסחת amp
   *  (תשואה פוחתת ‎1+0.12·0.88^(k-1) לעותק). משמש לצייר את קרן המקלען ברוחב האמיתי. */
  const rangeMulOf = (k: number) => { let m2 = 1; for (let i = 1; i <= k; i++) m2 *= 1 + 0.12 * Math.pow(0.88, i - 1); return m2; };

  const myRole = (): WallRole => rolesRef.current[me] ?? "heli";
  const myHero = () => heroes.current.get(me);
  const nameOf = (pid: string) => room.players.find((p) => p.id === pid)?.name ?? "";
  const isHost = room.hostId === me;

  function showToast(m: string) { setToast(m); window.setTimeout(() => setToast(""), 2200); }
  function showBanner(m: string, ms = 2200) { setBanner(m); window.setTimeout(() => setBanner(""), ms); }

  const posOf = (e: EnemyV, t: number): [number, number] => {
    if (e.state === "fight" || e.state === "wall") return [e.x0, e.y0];
    const dt = t - e.at;
    // clamp לקו החומה — גם אם השרת שותק, אויב לא ממשיך לרדת מתחת למסך (זהה לשרת)
    return [e.x0 + e.wob * Math.sin(dt / 700), Math.min(WALL_Y - 45, e.y0 + (e.speed * dt) / 1000)];
  };

  /* ---- אירועי שרת ---- */
  useEffect(() => {
    preloadWl();
    return hub.subscribe((d) => {
      const m = d as WallServerMsg;
      switch (m.a) {
        case "wl_setup": {
          setPhase("setup"); setOver(null); setDraft(null);
          setRoles(m.roles);
          heroes.current.clear(); styles.current.clear(); chains.current = [];
          seenAffixes.current.clear(); fuelRef.current = { fuel: 100, max: 100 };
          for (const [pid, role] of Object.entries(m.roles)) {
            const slot = m.slots[pid] ?? [500, 1100];
            heroes.current.set(pid, { role, slot, x: slot[0], y: slot[1], hp: 150, max: 150, down: false, tier: 1 });
          }
          enemies.current.clear(); projs.current = []; fxs.current = [];
          return;
        }
        case "wl_wave":
          setPhase("wave"); setWave(m.wave); setWallHp(m.wallHp); setWallMax(m.wallMax);
          heat.current = 0; firing.current = false;
          showBanner(`🌊 גל ${m.wave}`);
          if (m.wave === 1) {
            // מדריך 6 שניות בתחילת כל ריצה — איך מפעילים את הנשק שלך
            setHint(ROLE_HINT[rolesRef.current[me] ?? "heli"]);
            window.setTimeout(() => setHint(""), 6500);
          }
          Sfx.goBeep(); vibrate([60, 40, 60]);
          return;
        case "wl_spawn":
          enemies.current.set(m.id, { id: m.id, type: m.type, hp: m.hp, maxHp: m.maxHp, x0: m.x0, y0: m.y0, speed: m.speed, wob: m.wob, at: m.at, state: "walk", affix: m.affix });
          if (m.type === "boss") { showBanner("👹 הבוס מגיע!!!", 2600); Sfx.alarm(); vibrate([150, 80, 150]); }
          // 🏷️ תכונה חדשה נכנסת למשחק — מכריזים פעם אחת, שכולם ידעו מה התשובה
          if (m.affix && !seenAffixes.current.has(m.affix)) {
            seenAffixes.current.add(m.affix);
            showBanner(AFFIX_BANNER[m.affix], 3600);
            Sfx.alarm(); vibrate([60, 40, 60]);
          }
          return;
        case "wl_estate": {
          const e = enemies.current.get(m.id);
          if (!e) return;
          e.x0 = m.x; e.y0 = m.y; e.at = m.at; e.state = m.state;
          if (m.speed !== undefined) e.speed = m.speed;
          return;
        }
        case "wl_hit": {
          const e = enemies.current.get(m.id);
          if (!e) return;
          const prevHp = e.hp;
          const delta = Math.max(0, prevHp - m.hp);
          e.hp = m.hp;
          const [ex, ey] = posOf(e, conn.serverNow());
          // 🛡️ הפגיעה נחסמה (גג מבוצר / מגן קינטי) — פידבק במקום מספר נזק
          if (m.blocked) {
            if (fxs.current.length < FX_CAP) {
              fxs.current.push({ kind: "dmg", x: ex, y: ey - 24, t0: performance.now(), txt: "🛡️", color: "#cfe4ff" });
            }
            return;
          }
          // 💚 המרפא — החיים עלו: מספר ירוק, שרואים את הבעיה
          if (m.hp > prevHp + 0.5 && fxs.current.length < FX_CAP) {
            fxs.current.push({ kind: "dmg", x: ex, y: ey - 24, t0: performance.now(), txt: `+${Math.round(m.hp - prevHp)}`, color: "#8ee34a" });
          }
          // מספר נזק קופץ — כל פגיעה נראית
          // 🔥❄️⚡ חותמת התכונה על האויב — תכונה אחת בכל פגיעה (השרת בוחר בסבב)
          if (m.k && m.k !== "hit" && TRAIT_FX[m.k] && fxs.current.length < FX_CAP) {
            const st = styles.current.get(m.by)?.traits?.[m.k] ?? 1;
            fxs.current.push({
              kind: "trait", trait: m.k, x: ex, y: ey - 10, t0: performance.now(),
              sz: 46 + Math.min(34, st * 7),
            });
          }
          if (delta > 0 && fxs.current.length < FX_CAP) {
            const kc = m.k && m.k !== "hit" ? KIND_COLOR[m.k] : undefined;
            fxs.current.push({
              kind: "dmg", x: ex + (Math.random() - 0.5) * 26, y: ey - 20, t0: performance.now(),
              txt: String(Math.round(delta)), big: !!m.crit,
              color: kc ?? (m.crit ? "#ff5c5c" : m.by === me ? "#ffce3c" : "#ffffff"),
            });
          }
          if (m.hp <= 0) {
            e.deadAt = conn.serverNow();
            // ⚠️ by ריק = ניקוי מערכתי (סוף גל / רשת ביטחון), לא הריגה של שחקן.
            // בלי הסינון, סוף גל עם 30 שורדים ניגן 30 צלילי-הריגה באותו פריים.
            if (m.by) {
              fxs.current.push({ kind: "spark", x: ex, y: ey, t0: performance.now(), color: m.by === me ? "#ffce3c" : "#fff" });
              // צליל-הריגה אישי: פיץ' לפי השחקן — כולם שומעים מי קוטל 🎵
              const ki = room.players.findIndex((p) => p.id === m.by);
              Sfx.killNote(ki < 0 ? 0 : ki, m.by === me);
              if (m.by === me) vibrate(20);
            }
            window.setTimeout(() => enemies.current.delete(m.id), 400);
          } else if (m.crit && m.by === me) {
            fxs.current.push({ kind: "spark", x: ex, y: ey, t0: performance.now(), color: "#ff5c5c" });
          }
          return;
        }
        case "wl_arrow":
          if (m.by !== me) projs.current.push({ kind: "arrow", fx: m.fx, fy: m.fy, tx: m.tx, ty: m.ty, t0: performance.now(), T: m.T, fire: m.fire, by: m.by });
          return;
        case "wl_shell":
          projs.current.push({ kind: "shell", fx: m.fx, fy: m.fy, tx: m.tx, ty: m.ty, t0: performance.now(), T: m.T, by: m.by });
          if (m.by === me) { Sfx.boom(); vibrate(60); }
          return;
        case "wl_boomfx": {
          // ⚠️ קול+רטט על *כל* פיצוץ הקפיא טלפונים: פצצות ההליקופטר (מצרר×מטח)
          // מגיעות לעשרות בשנייה, וזה עשרות צלילי Web Audio ורטט רצוף.
          // הציור מכבד את תקציב החלקיקים; הקול והרטט מוגבלים ל-~5 בשנייה.
          if (fxs.current.length < FX_CAP) fxs.current.push({ kind: "boom", x: m.x, y: m.y, t0: performance.now(), r: m.r });
          const bt = performance.now();
          if (bt - lastBoomSfx.current > 190) {
            lastBoomSfx.current = bt;
            shake.current = Math.max(shake.current, 12);
            Sfx.boom(); vibrate(80);
          }
          return;
        }
        case "wl_stream":
          if (m.on) streams.current.set(m.by, { x: m.x, y: m.y ?? 100 }); else streams.current.delete(m.by);
          return;
        case "wl_drop": {
          // 🚁 פצצות בדרך למטה — כולם רואים אותן, כולל את המטח של החבר
          const pn2 = performance.now();
          for (let i = 0; i < m.n; i++) {
            const off = m.n === 1 ? 0 : (i - (m.n - 1) / 2) * 62;
            bombs.current.push({ x: m.x + off, y0: m.y, t0: pn2, fall: m.fall, r: m.r, by: m.pid });
          }
          if (bombs.current.length > 60) bombs.current.splice(0, bombs.current.length - 60);
          return;
        }
        case "wl_flak": {
          // סימון אש נגד-מטוסים — ההליקופטר יכול להתחמק עד at
          flaks.current.push({ id: m.id, x: m.x, y: m.y, at: m.at });
          if (flaks.current.length > 40) flaks.current.shift();
          if (myRole() === "heli") vibrate(12);
          return;
        }
        case "wl_jam":
          if (m.by === me) { setJamUntil(Date.now() + m.ms); firing.current = false; Sfx.sadTrombone(); vibrate(300); showToast("🥵 התחממות יתר!"); }
          return;
        case "wl_ppos":
          for (const [pid, x, y] of m.ps) {
            const h = heroes.current.get(pid);
            if (h && pid !== me) { h.x = x; h.y = y; }
          }
          return;
        case "wl_hero": {
          const h = heroes.current.get(m.pid);
          if (h) { h.hp = m.hp; h.max = m.max; h.down = !!m.down; }
          if (m.pid === me) {
            setMyHp(m.hp); setMyMax(m.max); setDown(!!m.down);
            if (m.down) { Sfx.sadTrombone(); vibrate(400); showToast("💀 נפלת! חוזר עוד 3 שניות..."); }
          } else if (m.down) showToast(`💀 ${nameOf(m.pid)} נפל!`);
          return;
        }
        case "wl_wall": {
          const prev = wallHpRef.current;
          wallHpRef.current = m.hp;
          setWallHp(m.hp); setWallMax(m.max);
          if (m.hp < prev) {
            // מכה בחומה חייבת להרגיש: רעידה + הבזק אדום, ואזעקה כשזה נהיה קריטי
            shake.current = Math.max(shake.current, 7);
            hurtFlash.current = 1;
            vibrate(25);
            if (m.hp / m.max < 0.25 && performance.now() - lastAlarm.current > 4000) {
              lastAlarm.current = performance.now();
              Sfx.alarm();
            }
          }
          return;
        }
        case "wl_sniper": {
          const e = enemies.current.get(m.id);
          showToast(m.target === me ? "🎯 צלף נעל עליך!! (הקשתים — תצילו!)" : `🎯 צלף נעל על ${nameOf(m.target)}!`);
          Sfx.alarm(); vibrate([80, 50, 80]);
          void e;
          return;
        }
        case "wl_levelup":
          setDraft({ level: m.level, cards: m.cards });
          fxs.current.push({ kind: "levelup", x: myHero()?.x ?? 500, y: myHero()?.y ?? 1100, t0: performance.now() });
          Sfx.fanfare(); vibrate([40, 30, 80]);
          return;
        case "wl_picked":
          if (m.pid !== me) showToast(`${m.emoji} ${nameOf(m.pid)} לקח ${m.name}`);
          return;
        case "wl_tier": {
          const h = heroes.current.get(m.pid);
          if (h) h.tier = m.tier;
          showBanner(m.pid === me ? `⬆️ הנשק שלך שודרג לדרגה ${m.tier}!` : `⬆️ ${nameOf(m.pid)} שידרג נשק!`, 1800);
          Sfx.fanfare();
          return;
        }
        case "wl_xp":
          setXp({ xp: m.xp, level: m.level, next: m.next });
          return;
        case "wl_style":
          styles.current.set(m.pid, { traits: m.traits, tier: m.tier, evos: m.evos, amps: m.amps ?? {} });
          if (m.pid === me) setMyStyle({ traits: m.traits, tier: m.tier, evos: m.evos, amps: m.amps ?? {} });
          return;
        case "wl_chain":
          if (chains.current.length < 40) {
            chains.current.push({ x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2, t0: performance.now(), c: TRAIT_COLOR.chain });
          }
          return;
        case "wl_evo": {
          // הרגע הגדול: המצלמה של *כולם* נפתחת לרוחב מלא, באנר, וריזר
          setEvoBanner({ name: m.name, emoji: m.emoji, who: m.pid === me ? "" : nameOf(m.pid), trait: m.trait });
          window.setTimeout(() => setEvoBanner(null), 3000);
          wideUntil.current = performance.now() + 1800;
          surge.current = { t0: performance.now(), color: TRAIT_COLOR[m.trait] ?? "#ffd24a", big: true };
          shake.current = Math.max(shake.current, 14);
          Sfx.evolve(); vibrate([60, 40, 60, 40, 160]);
          return;
        }
        case "wl_mods":
          modsRef.current = { rate: m.rate, speed: m.speed };
          return;
        case "wl_heat":
          heat.current = m.heat; // האמת מהשרת (מכבדת "קירור-על") — בין העדכונים ממשיכים להחליק מקומית
          return;
        case "wl_fuel": {
          const prevF = fuelRef.current.fuel;
          fuelRef.current = { fuel: m.fuel, max: m.max };
          if (m.fuel <= 1 && prevF > 1) { showToast("⛽ נגמר הדלק — רד לחומה לתדלק!"); vibrate([80, 50, 80]); }
          else if (m.fuel <= 25 && prevF > 25 && performance.now() - lastFuelToast.current > 6000) {
            lastFuelToast.current = performance.now();
            showToast("⛽ הדלק אוזל — תתחיל לחזור לחומה!"); vibrate(30);
          }
          return;
        }
        case "wl_clear":
          setPhase("breath"); setWallHp(m.wallHp);
          parade.current = performance.now(); // 🎖️ מצעד הנשקים — 2 שניות שרואים את כל הצוות
          showBanner(`🌊 גל ${m.wave} הושלם! ✨`, 2200);
          Sfx.fanfare(); vibrate([40, 30, 40, 30, 100]);
          return;
        case "wl_over":
          setPhase("over"); setOver(m); setDraft(null);
          shake.current = 20;
          Sfx.boom();
          window.setTimeout(() => Sfx.sadTrombone(), 700);
          vibrate(600);
          return;
        case "wl_state": {
          setPhase(m.phase === "over" ? "over" : m.phase);
          setWave(m.wave); setRoles(m.roles); setWallHp(m.wallHp); setWallMax(m.wallMax);
          for (const [pid, role] of Object.entries(m.roles)) {
            if (!heroes.current.has(pid)) {
              const slot = m.slots[pid] ?? [500, 1100];
              heroes.current.set(pid, { role, slot, x: slot[0], y: slot[1], hp: 100, max: 100, down: false, tier: m.tiers[pid] ?? 1 });
            }
          }
          return;
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, me]);

  /* ---- דופק HUD: מד החום, הקולדאון של התותח וספירת התקיעה נקראים מ-refs,
     ובלי רינדור יזום הם פשוט קופאים על המסך. 10Hz זה זול ומספיק. ---- */
  useEffect(() => {
    if (phase !== "wave" && phase !== "breath") return;
    const id = window.setInterval(() => setUi((u) => u + 1), 100);
    return () => window.clearInterval(id);
  }, [phase]);

  /* ---- לולאת רנדור ---- */
  useEffect(() => {
    let raf = 0;
    const step = () => {
      try {
        draw();
        (window as any).__wlFrames = ((window as any).__wlFrames || 0) + 1;
      } catch (err) {
        (window as any).__wlErr = String((err as Error)?.stack || err);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    // מראה מקומית של החום (השרת אוכף; זה רק ל-HUD)
    if (myRole() === "mg") {
      heat.current = firing.current ? Math.min(100, heat.current + 0.29) : Math.max(0, heat.current - 0.37);
    }
    /* ---- קלט רציף (אגודל אחד, כל השאר אוטומטי) ---- */
    {
      const pn = performance.now();
      const dtMs = Math.min(50, pn - (lastFrame.current || pn));
      lastFrame.current = pn;
      const r0 = myRole();
      const inWave = phaseRef.current === "wave" && !downRef.current;
      // חלוץ: תנועה בג'ויסטיק
      if (r0 === "heli" && inWave && joyRef.current.active) {
        const j = joyRef.current;
        const dx = j.kx - j.ox, dy = j.ky - j.oy;
        const d = Math.hypot(dx, dy);
        if (d > 8) {
          // ⛽ בלי דלק — טיסה איטית הביתה (לא עונש, תזכורת לתדלק)
          const sp = 360 * modsRef.current.speed * (fuelRef.current.fuel <= 1 ? 0.5 : 1) * Math.min(1, d / 64); // "זריזות" באמת מזיזה
          const h2 = myHero();
          if (h2) {
            h2.x = Math.max(30, Math.min(W - 30, h2.x + (dx / d) * (sp * dtMs) / 1000));
            h2.y = Math.max(90, Math.min(WALL_Y - 15, h2.y + (dy / d) * (sp * dtMs) / 1000));
            if (pn - lastPosSend.current > 140) {
              lastPosSend.current = pn;
              conn.sendGame({ a: "wl_pos", x: Math.round(h2.x), y: Math.round(h2.y) });
            }
          }
        }
      }
      // 🚁 הליקופטר: מטיל פצצות לבד תוך כדי טיסה — אצבע אחת, בדיוק כמו שהחלוץ עבד.
      // אין תנאי קרבה: אתה טס לאן שצריך והפצצות נופלות. השרת שוער את הקצב.
      if (r0 === "heli" && inWave && fuelRef.current.fuel > 1 && pn - lastAutoSwing.current > 620 / modsRef.current.rate) {
        if (myHero()) {
          lastAutoSwing.current = pn;
          conn.sendGame({ a: "wl_bomb" });
          Sfx.tick(); vibrate(14);
        }
      }
      // קשת: אוטו-ירי כל עוד האצבע על המסך
      if (r0 === "archer" && inWave && ptr.current.down && aimRef.current && pn - lastAutoShot.current > 660 / modsRef.current.rate) {
        lastAutoShot.current = pn;
        const a = aimRef.current;
        conn.sendGame({ a: "wl_shot", tx: Math.round(a.tx), ty: Math.round(a.ty), power: 1 });
        const h2 = myHero();
        projs.current.push({
          kind: "arrow", fx: h2?.slot[0] ?? 500, fy: h2?.slot[1] ?? WALL_Y + 60, tx: a.tx, ty: a.ty, t0: pn,
          // ⚠️ אותה נוסחת זמן-טיסה כמו בשרת (wl_shot). כאן נשארה הנוסחה הישנה
          // (280+dist·0.35) אחרי שהשרת קוצר ל-120+dist·0.14 — והפגיעה קפצה
          // על האויב לפני שהחץ המצויר הגיע אליו. הלקוח מסנן wl_arrow של עצמו,
          // אז זו התחזית היחידה שהקשת רואה.
          T: 120 + Math.hypot(a.tx - (h2?.slot[0] ?? 500), a.ty - (h2?.slot[1] ?? 0)) * 0.14,
          fire: (h2?.tier ?? 1) >= 2, by: me,
        });
        Sfx.tick(); vibrate(12);
      }
    }
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = cv.clientWidth, chh = cv.clientHeight;
    if (cv.width !== cw * dpr) { cv.width = cw * dpr; cv.height = chh * dpr; }
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const now = conn.serverNow();
    const pnow = performance.now();

    // מצלמה: עוקבת אחרי הגיבור/הכיוון שלי
    const h = myHero();
    let targetCam = h ? h.x : 500;
    if (myRole() === "mg" && firing.current && aimRef.current) targetCam = aimRef.current.tx; // עוקבת אחרי הכוונת — כל השדה נגיש
    if (aimRef.current && (myRole() === "archer" || myRole() === "cannon")) targetCam = (aimRef.current.tx + (h?.slot[0] ?? 500)) / 2;
    camX.current += (targetCam - camX.current) * 0.08;
    // רוחב תצוגה דינמי: באבולוציה ובמצעד הנשקים כולם רואים את כל החזית.
    // ובנוסף — אויב שנצמד לחומה מחוץ לחלון האישי היה בלתי-נראה *ובלתי-ניתן לכיוון*,
    // אז הוא כוסס את החומה לנצח. ברגע שיש כזה, החלון נפתח לכל החזית.
    const wallHugger = [...enemies.current.values()].some(
      (e) => e.state === "wall" && e.deadAt === undefined && Math.abs(e.x0 - camX.current) > VIEW_W / 2 - 40,
    );
    const wantWide = pnow < wideUntil.current || pnow - parade.current < 2200 || wallHugger;
    // פעימת זום קטנה ברגע שבחרת שדרוג — הגוף מרגיש את זה לפני שהעין מבינה
    let zoom = 1;
    if (surge.current) {
      const sf = (pnow - surge.current.t0) / (surge.current.big ? 1200 : 460);
      if (sf >= 1) surge.current = null; else zoom = 1 - Math.sin(sf * Math.PI) * (surge.current.big ? 0.09 : 0.05);
    }
    // תקרת ההרחבה: מעבר לרוחב הזה גובה התצוגה חורג מתחת לחומה ונפתחת רצועה ריקה.
    // (הופיע ברגע שההרחבה הפכה נפוצה — אויב שנצמד לחומה מחוץ לחלון.)
    const maxVw = Math.max(VIEW_W, ((WALL_Y + 170) * cw) / Math.max(1, chh));
    viewWRef.current += ((wantWide ? Math.min(W, maxVw) : VIEW_W) * zoom - viewWRef.current) * 0.09;
    const vw = viewWRef.current;
    const scale = cw / vw;
    const viewH = chh / scale;
    // מצלמה אנכית: לחלוץ שמעמיק בשדה — עוקבת אחריו
    const baseTop = Math.max(0, Math.min(WORLD_H - viewH, WALL_Y + 170 - viewH));
    let targetTop = baseTop;
    if (myRole() === "heli" && h && !h.down) targetTop = Math.max(0, Math.min(baseTop, h.y - viewH * 0.58));
    camTopRef.current += (targetTop - camTopRef.current) * 0.08;
    const camTop = camTopRef.current;
    let ox = 0, oy = 0;
    if (shake.current > 0.5) {
      ox = (Math.random() - 0.5) * shake.current;
      oy = (Math.random() - 0.5) * shake.current;
      shake.current *= 0.88;
    }
    const camL = Math.max(0, Math.min(W - vw, camX.current - vw / 2));
    const wx = (x: number) => (x - camL) * scale + ox;
    const wy = (y: number) => (y - camTop) * scale + oy;

    // רקע — שדה דשא בהיר (הדמויות כהות; על רקע לילי הן נבלעו)
    {
      const bgGrad = ctx.createLinearGradient(0, 0, 0, chh);
      bgGrad.addColorStop(0, "#7d9aa8");    // דמדומים באופק
      bgGrad.addColorStop(0.28, "#7f9c62");
      bgGrad.addColorStop(1, "#415c2b");    // דשא קרוב
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, cw, chh);
    }
    const bg = wlImg("bgfield");
    if (bg.complete && bg.naturalWidth) {
      ctx.globalAlpha = 0.95;
      ctx.drawImage(bg, wx(0), wy(-80), W * scale, (WALL_Y + 80) * scale);
      ctx.globalAlpha = 1;
    }

    // חומה
    const wt = wlImg("walltex");
    const wallHFrac = wallHp / Math.max(1, wallMax);
    if (wt.complete && wt.naturalWidth) {
      for (let x = 0; x < W; x += 250) ctx.drawImage(wt, wx(x), wy(WALL_Y), 250 * scale, 130 * scale);
    } else {
      ctx.fillStyle = "#3a3f4a";
      ctx.fillRect(wx(0), wy(WALL_Y), W * scale, 130 * scale);
    }
    // סדקים לפי מצב החומה
    if (wallHFrac < 0.6) {
      const ck = wlImg("crack");
      if (ck.complete && ck.naturalWidth) {
        ctx.globalAlpha = Math.min(0.9, (0.6 - wallHFrac) * 2);
        ctx.globalCompositeOperation = "screen";
        for (const cx of [180, 500, 820]) ctx.drawImage(ck, wx(cx - 90), wy(WALL_Y - 10), 180 * scale, 140 * scale);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
    }
    const gt = wlImg("gate");
    if (gt.complete && gt.naturalWidth) ctx.drawImage(gt, wx(GATE_X - 70), wy(WALL_Y - 30), 140 * scale, 160 * scale);

    // אויבים
    for (const e of enemies.current.values()) {
      const [ex, ey] = posOf(e, now);
      if (ey < camTop - 100) { // מעל החלון — חץ התרעה קטן למעלה
        continue;
      }
      const size = ETYPE_SIZE[e.type];
      const im = wlImg(ETYPE_IMG[e.type]);
      const dying = e.deadAt !== undefined;
      const alpha = dying ? Math.max(0, 1 - (now - e.deadAt!) / 350) : e.state === "burrow" ? 0.25 : 1;
      ctx.globalAlpha = alpha;
      // צל מגע — מקרקע את היצור ומפריד אותו מהדשא
      if (!dying && e.state !== "burrow") {
        ctx.save();
        ctx.globalAlpha = alpha * 0.32;
        ctx.fillStyle = "#0d1a08";
        ctx.beginPath();
        ctx.ellipse(wx(ex), wy(ey + size * 0.34), size * 0.33 * scale, size * 0.12 * scale, 0, 0, 7);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = alpha;
      }
      if (im.complete && im.naturalWidth) {
        const bob = e.state === "walk" ? Math.sin((now - e.at) / 120) * 2 : 0;
        ctx.drawImage(im, wx(ex - size / 2), wy(ey - size / 2 + bob), size * scale, size * scale);
      } else {
        ctx.fillStyle = "#7a4aa0";
        ctx.beginPath(); ctx.arc(wx(ex), wy(ey), (size / 2) * scale, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!dying && e.hp < e.maxHp) {
        const bw = size * scale * 0.8;
        ctx.fillStyle = "rgba(0,0,0,.6)";
        ctx.fillRect(wx(ex) - bw / 2, wy(ey - size / 2 - 10), bw, 4);
        // אדום/כתום — ירוק על דשא ירוק לא נקרא
        ctx.fillStyle = e.type === "armored" ? "#ffce3c" : "#ff4d4d";
        ctx.fillRect(wx(ex) - bw / 2, wy(ey - size / 2 - 10), bw * (e.hp / e.maxHp), 4);
      }
      // 🏷️ עילית: טבעת בצבע התכונה + אימוג'י מעל — קוראים את "הבעיה" ממרחק
      if (e.affix && !dying && e.state !== "burrow") {
        const ac = AFFIX_COLOR[e.affix];
        const pulse = e.affix === "healer" ? 0.5 + 0.3 * Math.sin(pnow / 260) : 0.75;
        ctx.strokeStyle = hexA(ac, pulse);
        ctx.lineWidth = 2.4 * scale;
        ctx.beginPath();
        ctx.ellipse(wx(ex), wy(ey + size * 0.3), size * 0.52 * scale, size * 0.2 * scale, 0, 0, 7);
        ctx.stroke();
        ctx.font = `${14 * scale}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(AFFIX_EMOJI[e.affix], wx(ex), wy(ey - size / 2 - 14));
      }
    }

    // גיבורים
    for (const [pid, hh] of heroes.current.entries()) {
      const mine = pid === me;
      // היסטוריית מיקום לשובל 👟 זריזות (נשמר גם בלי הקלף — זול, ומונע קפיצה כשנבחר)
      let tr = trails.current.get(pid);
      if (!tr) trails.current.set(pid, (tr = []));
      const lastQ = tr[tr.length - 1];
      if (!lastQ || Math.hypot(hh.x - lastQ.x, hh.y - lastQ.y) > 4) {
        tr.push({ x: hh.x, y: hh.y });
        if (tr.length > 14) tr.shift();
      }
      const role = hh.role;
      let im: HTMLImageElement;
      if (role === "cannon") im = wlImg(hh.tier >= 3 ? "cannon3" : hh.tier === 2 ? "cannon2" : "cannon1");
      else if (role === "mg") im = wlImg(hh.tier >= 2 ? "mg2" : "mg1");
      else if (role === "archer") im = wlImg("heroArcher");
      else im = wlImg("heroHeli");
      const hv = visOf(pid);
      // הנשק גדל עם הדרגה — לכל התפקידים, כולל החלוץ והקשת שעד היום לא השתנו בכלל
      const tg2 = Math.min(6, hh.tier);
      const size = role === "cannon" ? 95 + tg2 * 12 : role === "mg" ? 85 + tg2 * 8 : 72 + (tg2 - 1) * 5;
      // (זינוק-החרב של החלוץ הוסר יחד עם התפקיד — ההליקופטר לא מזנק)
      const hx = hh.x, hy = hh.y;
      ctx.globalAlpha = hh.down ? 0.35 : 1;
      // צל מגע + טבעת בצבע התפקיד (על דשא בהיר טבעת קוראת טוב מהילה מלאה)
      ctx.save();
      ctx.globalAlpha = (hh.down ? 0.35 : 1) * 0.3;
      ctx.fillStyle = "#0d1a08";
      ctx.beginPath();
      ctx.ellipse(wx(hx), wy(hy + size * 0.36), size * 0.34 * scale, size * 0.12 * scale, 0, 0, 7);
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.fillStyle = mine ? ROLE_COLOR[role] + "44" : ROLE_COLOR[role] + "1c";
      ctx.arc(wx(hx), wy(hy + size * 0.3), size * 0.45 * scale, 0, 7);
      ctx.fill();
      ctx.strokeStyle = ROLE_COLOR[role] + (mine ? "ee" : "88");
      ctx.lineWidth = (mine ? 2.6 : 1.6) * scale;
      ctx.beginPath();
      ctx.ellipse(wx(hx), wy(hy + size * 0.34), size * 0.36 * scale, size * 0.14 * scale, 0, 0, 7);
      ctx.stroke();
      /* ---- חתימות המגברים: כל קלף אחוזים חייב להיראות ----
       * עד היום 9 קלפים לא שינו פיקסל אחד. כאן כל אחד מקבל קריאה תמידית
       * שמתעצמת עם כל ערימה — וזה גם מה שהחבר על המסך השני רואה. */
      // 📏 טווח — טבעת טווח שגדלה
      if (hv.reach > 0) {
        ctx.save();
        ctx.setLineDash([5 * scale, 7 * scale]);
        ctx.strokeStyle = hexA(hv.band, 0.10 + 0.05 * Math.min(4, hv.reach));
        ctx.lineWidth = 1.4 * scale;
        ctx.beginPath();
        ctx.ellipse(wx(hx), wy(hy + size * 0.3), size * (0.7 + 0.17 * hv.reach) * scale, size * (0.3 + 0.07 * hv.reach) * scale, 0, 0, 7);
        ctx.stroke();
        ctx.restore();
      }
      // 👟 זריזות — שובל דמויות-צל מאחורי הגיבור בתנועה
      if (hv.after > 0 && !hh.down) {
        const tr = trails.current.get(pid);
        if (tr && tr.length > 1) {
          ctx.globalCompositeOperation = "lighter";
          for (let i = 1; i < Math.min(tr.length, 2 + hv.after * 2); i++) {
            const q = tr[tr.length - 1 - i];
            if (!q) break;
            ctx.globalAlpha = Math.max(0, 0.20 - i * 0.03);
            if (im.complete && im.naturalWidth) ctx.drawImage(im, wx(q.x - size / 2), wy(q.y - size / 2), size * scale, size * scale);
          }
          ctx.globalAlpha = hh.down ? 0.35 : 1;
          ctx.globalCompositeOperation = "source-over";
        }
      }
      // 🧠 חוכמת קרב — חלקיקי ניסיון שמקיפים את הגיבור
      if (hv.motes > 0) {
        ctx.globalCompositeOperation = "lighter";
        const mn = Math.min(8, 2 + hv.motes);
        for (let i = 0; i < mn; i++) {
          const a2 = pnow / 900 + (i * 2 * Math.PI) / mn;
          const rr = size * 0.5 * scale;
          ctx.fillStyle = hexA("#7fd8ff", 0.55);
          ctx.beginPath();
          ctx.arc(wx(hx) + Math.cos(a2) * rr, wy(hy + size * 0.1) + Math.sin(a2) * rr * 0.45, 2.1 * scale, 0, 7);
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      }
      // אאורת התכונות — ככה רואים ממרחק שלחבר שלך יש משהו
      if (hv.total > 0) {
        const pulse = 0.72 + 0.28 * Math.sin(pnow / (hv.evo ? 220 : 380));
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = hexA(hv.color!, (0.28 + 0.42 * hv.glow) * pulse);
        ctx.lineWidth = (1.6 + 2.4 * hv.glow) * scale;
        ctx.beginPath();
        ctx.ellipse(wx(hx), wy(hy + size * 0.3), size * (0.46 + 0.08 * hv.glow) * scale, size * (0.2 + 0.05 * hv.glow) * scale, 0, 0, 7);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
      if (im.complete && im.naturalWidth) {
        ctx.drawImage(im, wx(hx - size / 2), wy(hy - size / 2), size * scale, size * scale);
      } else {
        ctx.font = `${28 * scale}px sans-serif`; ctx.textAlign = "center";
        ctx.fillText(ROLE_ICON[role], wx(hx), wy(hy));
      }
      // 🚁 להב מסתובב + צל קרקע נמוך — קורא מיד כ"טס", לא כ"עומד"
      if (role === "heli" && !hh.down) {
        const spin = (pnow / 42) % (Math.PI * 2);
        ctx.save();
        ctx.strokeStyle = "rgba(235,242,255,.75)";
        ctx.lineWidth = 2.2 * scale; ctx.lineCap = "round";
        const rl = size * 0.62 * scale;
        for (let b = 0; b < 2; b++) {
          const a2 = spin + b * Math.PI / 2;
          ctx.globalAlpha = 0.30 + 0.3 * Math.abs(Math.cos(a2));
          ctx.beginPath();
          ctx.moveTo(wx(hx) - Math.cos(a2) * rl, wy(hy - size * 0.42) - Math.sin(a2) * rl * 0.22);
          ctx.lineTo(wx(hx) + Math.cos(a2) * rl, wy(hy - size * 0.42) + Math.sin(a2) * rl * 0.22);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      // ❤️ חוסן — שכבת שריון על הספרייט (מתעבה עם הערימה)
      if (hv.plate > 0 && !hh.down) {
        ctx.save();
        ctx.strokeStyle = hexA("#e6f0ff", Math.min(0.65, 0.22 + 0.13 * hv.plate));
        ctx.lineWidth = (1.5 + 0.9 * Math.min(4, hv.plate)) * scale;
        ctx.beginPath();
        ctx.arc(wx(hx), wy(hy + size * 0.02), size * 0.33 * scale, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        ctx.restore();
      }
      // ❄️ קירור-על — אדי כפור עולים מהקנה
      if (hv.vapor > 0) {
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < Math.min(6, 2 + hv.vapor); i++) {
          const ph = ((pnow / 1400 + i * 0.29) % 1);
          ctx.fillStyle = hexA("#9fe8ff", (1 - ph) * 0.22);
          ctx.beginPath();
          ctx.arc(wx(hx + (i % 2 ? 9 : -9)), wy(hy - 18 - ph * 40), (3 + ph * 7) * scale, 0, 7);
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      }
      // 🎯 קטלניות — ריצוד זהב על הנשק
      if (hv.gold > 0) {
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < Math.min(7, 2 + hv.gold); i++) {
          const sp = ((pnow / 520 + i * 0.37) % 1);
          ctx.fillStyle = hexA("#ffd76a", (1 - Math.abs(sp - 0.5) * 2) * 0.7);
          ctx.beginPath();
          ctx.arc(wx(hx - size * 0.26 + sp * size * 0.52), wy(hy - size * 0.1 + Math.sin(sp * 6) * 7), 1.7 * scale, 0, 7);
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      }
      // 🔩 רצועת הדרגה + הילת העוצמה — הצללית שרואים מהצד השני של השדה
      if (hh.tier > 1 || hv.power >= 4) {
        ctx.globalCompositeOperation = "lighter";
        const pw = Math.min(1, hv.power / 12);
        const bp = 0.8 + 0.2 * Math.sin(pnow / 520);
        // זוהר קרקע בצבע הדרגה — נקרא מהצד השני של השדה
        const gg = ctx.createRadialGradient(wx(hx), wy(hy + size * 0.3), 0, wx(hx), wy(hy + size * 0.3), size * 0.75 * scale);
        gg.addColorStop(0, hexA(hv.band, (0.10 + 0.22 * pw) * bp));
        gg.addColorStop(1, hexA(hv.band, 0));
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.ellipse(wx(hx), wy(hy + size * 0.3), size * 0.75 * scale, size * 0.3 * scale, 0, 0, 7);
        ctx.fill();
        ctx.strokeStyle = hexA(hv.band, (0.42 + 0.42 * pw) * bp);
        ctx.lineWidth = (1.8 + 3.4 * pw) * scale;
        ctx.beginPath();
        ctx.ellipse(wx(hx), wy(hy + size * 0.33), size * 0.40 * scale, size * 0.16 * scale, 0, 0, 7);
        ctx.stroke();
        if (pw > 0.28) {  // בילד חזק — קרני עוצמה שמסתחררות, זה ה"מטורף"
          const rays = 4 + Math.round(pw * 7);
          ctx.strokeStyle = hexA(hv.band, (0.28 + 0.40 * pw) * bp);
          ctx.lineWidth = (1.6 + 1.6 * pw) * scale;
          ctx.lineCap = "round";
          for (let i = 0; i < rays; i++) {
            const a2 = pnow / 1400 + (i * 2 * Math.PI) / rays;
            const r0 = size * 0.44 * scale, r1 = size * (0.56 + 0.30 * pw) * scale;
            ctx.beginPath();
            ctx.moveTo(wx(hx) + Math.cos(a2) * r0, wy(hy + size * 0.2) + Math.sin(a2) * r0 * 0.5);
            ctx.lineTo(wx(hx) + Math.cos(a2) * r1, wy(hy + size * 0.2) + Math.sin(a2) * r1 * 0.5);
            ctx.stroke();
          }
        }
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = 1;
      // 🏷️ שבב הבנייה — שתי התכונות החזקות + כתר לאבולוציה. זה מה שמייצר קנאה.
      if (hv.top.length) {
        const chip = (hv.evo ? "👑" : "") + hv.top.slice(0, 2).map((k) => TRAIT_EMOJI[k]).join("");
        ctx.font = `${13 * scale}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(8,14,6,.55)";
        const cwid = chip.length * 8 * scale;
        ctx.fillRect(wx(hx) - cwid / 2, wy(hy - 68), cwid, 17 * scale);
        ctx.fillText(chip, wx(hx), wy(hy - 56));
      }
      if (!mine) {
        ctx.font = `700 ${11 * scale}px Rubik, sans-serif`;
        ctx.textAlign = "center";
        ctx.strokeStyle = "rgba(8,16,6,.8)"; ctx.lineWidth = 3 * scale; // קונטור — על דשא בהיר בלעדיו לא קוראים
        ctx.strokeText(nameOf(pid), wx(hx), wy(hy - 45));
        ctx.fillStyle = ROLE_COLOR[role];
        ctx.fillText(nameOf(pid), wx(hx), wy(hy - 45));
      }
    }

    // זרמי מקלע — מניפה מהקנה אל נקודת הכיוון + נותבים + הבהק לוע
    for (const [pid, aim] of streams.current.entries()) {
      const hh = heroes.current.get(pid);
      if (!hh) continue;
      const sv = visOf(pid);
      const mx = hh.x, my = hh.y - 24; // קצה הקנה
      const ax = aim.x, ay = aim.y;
      const colC = sv.color ?? "#5c8aff";
      // קו הירי שהשרת באמת מכסה: רצועה צרה מהקנה אל הכוונת (לא מניפה)
      const ang = Math.atan2(ay - my, ax - mx);
      // ⚠️ תואם לשרת *באמת*: 46·mods.range. קודם צוירה ‎46·(1+0.06·סך־תכונות) —
      // תכונות לא משנות רוחב בשרת, וקלף 📏 טווח (שכן משנה) לא צויר. התוצאה:
      // מקלען עם טווח פגע הרבה מחוץ לקרן, ומקלען עם תכונות ראה קרן שחציה לא פוגע.
      const halfW = 46 * rangeMulOf(sv.reach);
      const reach = Math.hypot(W, WALL_Y);        // עד קצה השדה — הקו לא נחתך באמצע
      ctx.save();
      ctx.translate(wx(mx), wy(my));
      ctx.rotate(ang);
      const lg = ctx.createLinearGradient(0, 0, reach * scale, 0);
      lg.addColorStop(0, hexA(colC, 0.26)); lg.addColorStop(1, hexA(colC, 0.02));
      ctx.fillStyle = lg;
      ctx.fillRect(0, -halfW * scale, reach * scale, halfW * 2 * scale);
      ctx.strokeStyle = hexA(colC, 0.22); ctx.lineWidth = 1;
      ctx.strokeRect(0, -halfW * scale, reach * scale, halfW * 2 * scale);
      ctx.restore();
      // נותבים — קליעים בהירים שנוסעים לאורך הקו
      ctx.globalCompositeOperation = "lighter";
      const trLen = Math.min(reach, Math.hypot(ax - mx, ay - my) * 1.6 + 220);
      for (let t = 0; t < Math.min(9, 5 + sv.total); t++) {
        const seed = ((pnow * 0.0022 + t * 0.2) % 1); // 0..1 לאורך המסלול
        // פיזור קטן *לרוחב הקו*, לא בזווית — הכדורים נוסעים במקביל
        const off = (((t * 2654435761) % 1000) / 1000 - 0.5) * halfW * 1.3;
        const px0 = mx - Math.sin(ang) * off, py0 = my + Math.cos(ang) * off;
        const d0 = trLen * seed, d1 = trLen * Math.min(1, seed + 0.055);
        const bx = px0 + Math.cos(ang) * d0, by = py0 + Math.sin(ang) * d0;
        const nx2 = px0 + Math.cos(ang) * d1, ny2 = py0 + Math.sin(ang) * d1;
        const tg = ctx.createLinearGradient(wx(bx), wy(by), wx(nx2), wy(ny2));
        tg.addColorStop(0, hexA(colC, 0.12)); tg.addColorStop(1, colC);
        ctx.strokeStyle = tg; ctx.lineWidth = 3 * sv.size * scale;
        ctx.beginPath(); ctx.moveTo(wx(bx), wy(by)); ctx.lineTo(wx(nx2), wy(ny2)); ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(wx(nx2), wy(ny2), 2.2 * scale, 0, 7); ctx.fill();
      }
      // הבהק לוע
      const mz = wlImg("muzzle");
      // 💥 עוצמה + ⚡ קצב אש — הבזק הלוע גדל עם הערימות. אחת מחתימות המגברים.
      const msz = (44 + Math.random() * 22) * (1 + Math.min(0.9, sv.muzzle * 0.14)) * scale;
      const mang = ang;
      ctx.save(); ctx.translate(wx(mx), wy(my)); ctx.rotate(mang + Math.PI / 2);
      if (mz.complete && mz.naturalWidth) ctx.drawImage(mz, -msz / 2, -msz, msz, msz);
      else {
        const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, msz / 2);
        fg.addColorStop(0, "#fff"); fg.addColorStop(0.4, "#ffd24a"); fg.addColorStop(1, "#ff7a2f00");
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(0, 0, msz / 2, 0, 7); ctx.fill();
      }
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
    }

    // 🚁 פצצות בדרך למטה — נופלות מגובה ההליקופטר אל הקרקע, עם צל שמתכווץ
    bombs.current = bombs.current.filter((b) => pnow - b.t0 < b.fall + 120);
    for (const b of bombs.current) {
      const f = Math.min(1, (pnow - b.t0) / b.fall);
      // ⚠️ הפצצה נוחתת ממש מתחת להליקופטר, לא על החומה. קודם היא תמיד ירדה
      // ל-WALL_Y-90, אז נראה היה שהוא מפציץ רק צמוד לחומה בכל מקום שהוא טס.
      const gy = Math.min(WALL_Y - 45, b.y0 + 40);
      const by = b.y0 + (gy - b.y0) * (f * f);      // תאוצה — נופל, לא מרחף
      const bv = visOf(b.by);
      // סמן נחיתה: טבעת שמתכווצת אל נקודת הפגיעה — הקריאה הכי חשובה לכולם
      ctx.strokeStyle = hexA(bv.color ?? "#ff9a4d", 0.25 + 0.5 * f);
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.ellipse(wx(b.x), wy(gy), b.r * (1.25 - 0.25 * f) * scale, b.r * 0.32 * scale, 0, 0, 7);
      ctx.stroke();
      if (f < 1) {
        // גוף הפצצה + סנפירים
        ctx.save();
        ctx.translate(wx(b.x), wy(by));
        const bs = (7 + 3 * f) * scale;
        ctx.fillStyle = "#2b3138";
        ctx.beginPath(); ctx.ellipse(0, 0, bs * 0.62, bs, 0, 0, 7); ctx.fill();
        ctx.fillStyle = hexA(bv.color ?? "#ff9a4d", 0.9);
        ctx.beginPath(); ctx.ellipse(0, -bs * 0.45, bs * 0.42, bs * 0.34, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = "#161a1e"; ctx.lineWidth = 1.6 * scale;
        ctx.beginPath();
        ctx.moveTo(-bs * 0.7, bs * 0.85); ctx.lineTo(0, bs * 0.35); ctx.lineTo(bs * 0.7, bs * 0.85);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 🎯 אש נגד-מטוסים — סימון שמתמלא; כשהוא נסגר, מי שנשאר שם חוטף
    flaks.current = flaks.current.filter((k) => conn.serverNow() < k.at + 260);
    for (const k of flaks.current) {
      const left = k.at - conn.serverNow();
      const f = Math.max(0, Math.min(1, 1 - left / 850));
      if (left < 0) {
        // הפיצוץ עצמו
        const bf = Math.min(1, -left / 260);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = hexA("#ffd24a", (1 - bf) * 0.55);
        ctx.beginPath(); ctx.arc(wx(k.x), wy(k.y), 78 * (0.6 + bf * 0.9) * scale, 0, 7); ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        continue;
      }
      ctx.strokeStyle = `rgba(255,92,92,${0.35 + 0.5 * f})`;
      ctx.lineWidth = (1.6 + 2.2 * f) * scale;
      ctx.setLineDash([6 * scale, 6 * scale]);
      ctx.beginPath(); ctx.arc(wx(k.x), wy(k.y), 78 * scale, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      // טבעת שמתכווצת פנימה = כמה זמן נשאר להתחמק
      ctx.strokeStyle = `rgba(255,92,92,${0.5 + 0.4 * f})`;
      ctx.lineWidth = 2.4 * scale;
      ctx.beginPath(); ctx.arc(wx(k.x), wy(k.y), 78 * (1 - f) * scale, 0, 7); ctx.stroke();
    }

    // פרויקטילים
    projs.current = projs.current.filter((p) => pnow - p.t0 < p.T + 100);
    for (const p of projs.current) {
      const f = Math.min(1, (pnow - p.t0) / p.T);
      const px = p.fx + (p.tx - p.fx) * f;
      // הפגז מתנדנד גבוה (מרגמה); החץ טס כמעט שטוח — זה ההבדל שגרם לשניהם להיראות זהים
      const arc = p.kind === "shell" ? 260 : 28;
      const py = p.fy + (p.ty - p.fy) * f - Math.sin(f * Math.PI) * arc;
      if (f < 1) {
        if (p.kind === "shell") {
          // טבעת נחיתה מהבהבת — שפת ה"מרגמה", נשארת לתותחן בלבד
          const pulse = 0.6 + 0.4 * Math.sin(pnow / 90);
          ctx.strokeStyle = `rgba(255,206,60,${0.5 * pulse})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(wx(p.tx), wy(p.ty), 34 * scale * pulse, 0, 7); ctx.stroke();
        } else {
          // חץ: צלב כוונת קטן, לא עיגול נחיתה
          const c = 7 * scale;
          ctx.strokeStyle = "rgba(52,232,158,.5)"; ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(wx(p.tx) - c, wy(p.ty)); ctx.lineTo(wx(p.tx) + c, wy(p.ty));
          ctx.moveTo(wx(p.tx), wy(p.ty) - c); ctx.lineTo(wx(p.tx), wy(p.ty) + c);
          ctx.stroke();
        }
      }
      const pv = visOf(p.by);
      if (p.kind === "arrow") {
        // זווית לפי המהירות האמיתית על המסלול — החץ מצביע לאן שהוא באמת טס
        const dirAng = Math.atan2((p.ty - p.fy) - Math.PI * Math.cos(f * Math.PI) * arc, p.tx - p.fx);
        // תכונה דומיננטית אחת בלבד צובעת את הקליע — ערבוב שני צבעים ב-lighter
        // מתכנס מתמטית ללבן, וזה בדיוק מה שהפך את הנשקים לבלתי-מובחנים.
        const core = pv.color ?? (p.fire ? "#ffb347" : "#e8fff2");
        const tail = core;
        const gw = pv.size;
        // שובל: פס טשטוש-תנועה דק ומתחדד לאחור (לא כדורי זוהר — אלה נראו כמו פגז).
        // מתארך ומתעבה עם כל ערימה שאספת.
        ctx.globalCompositeOperation = "lighter";
        const segs = Math.min(7, 4 + (pv.top.length ? 2 : 0));
        ctx.lineCap = "round";
        for (let g = 1; g <= segs; g++) {
          const gf0 = Math.max(0, f - (g - 1) * 0.05), gf1 = Math.max(0, f - g * 0.05);
          if (gf1 <= 0) break;
          const gx0 = p.fx + (p.tx - p.fx) * gf0, gy0 = p.fy + (p.ty - p.fy) * gf0 - Math.sin(gf0 * Math.PI) * arc;
          const gx1 = p.fx + (p.tx - p.fx) * gf1, gy1 = p.fy + (p.ty - p.fy) * gf1 - Math.sin(gf1 * Math.PI) * arc;
          ctx.strokeStyle = hexA(core, Math.max(0, 0.30 - g * 0.04) * (0.7 + pv.glow * 0.6));
          ctx.lineWidth = Math.max(0.6, 4.2 - g * 0.55) * gw * scale;
          ctx.beginPath(); ctx.moveTo(wx(gx0), wy(gy0)); ctx.lineTo(wx(gx1), wy(gy1)); ctx.stroke();
        }
        // גוף החץ — שאפט בולט + ראש
        ctx.save();
        ctx.translate(wx(px), wy(py));
        ctx.rotate(dirAng);
        const L = 38 * gw * scale;  // ארוך ודק — צללית של חץ, לא של פגז
        ctx.strokeStyle = core; ctx.lineWidth = 2.6 * gw * scale; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.moveTo(L / 2 + 7 * scale, 0); ctx.lineTo(L / 2 - 2 * scale, -4 * gw * scale); ctx.lineTo(L / 2 - 2 * scale, 4 * gw * scale); ctx.closePath(); ctx.fill();
        // נוצות
        ctx.strokeStyle = tail; ctx.lineWidth = 2 * scale;
        ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(-L / 2 - 7 * scale, -5 * scale);
        ctx.moveTo(-L / 2, 0); ctx.lineTo(-L / 2 - 7 * scale, 5 * scale);
        ctx.moveTo(-L / 2 + 5 * scale, 0); ctx.lineTo(-L / 2 - 2 * scale, -4 * scale);
        ctx.moveTo(-L / 2 + 5 * scale, 0); ctx.lineTo(-L / 2 - 2 * scale, 4 * scale); ctx.stroke();
        // ספרייט מעל (אם נטען) — צר, כדי שהצללית שנקראת תישאר של החץ ולא של כדור
        const im = wlImg(p.fire ? "arrowFire" : "arrow");
        if (im.complete && im.naturalWidth) {
          ctx.rotate(-Math.PI / 2);
          ctx.drawImage(im, -9 * scale, -26 * scale, 18 * scale, 52 * scale);
        }
        ctx.restore();
        ctx.globalCompositeOperation = "source-over"; // חובה אחרי restore — אחרת ה-lighter מודלף ומלבין את המסך
      } else {
        // פגז — עם שובל עשן
        ctx.globalAlpha = 0.35;
        for (let g = 1; g <= 4; g++) {
          const gf = Math.max(0, f - g * 0.06);
          const gx = p.fx + (p.tx - p.fx) * gf;
          const gy = p.fy + (p.ty - p.fy) * gf - Math.sin(gf * Math.PI) * arc;
          ctx.fillStyle = "#9a9aa5";
          ctx.beginPath(); ctx.arc(wx(gx), wy(gy), (7 - g) * scale, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#2c2c34";
        ctx.beginPath(); ctx.arc(wx(px), wy(py), 9 * pv.size * scale, 0, 7); ctx.fill();
        ctx.fillStyle = pv.color ?? "#ff9a2f";
        ctx.beginPath(); ctx.arc(wx(px), wy(py), 4.5 * pv.size * scale, 0, 7); ctx.fill();
        if (pv.glow > 0) {
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = hexA(pv.color ?? "#ff9a2f", 0.35 * pv.glow);
          ctx.beginPath(); ctx.arc(wx(px), wy(py), 16 * pv.size * scale, 0, 7); ctx.fill();
          ctx.globalCompositeOperation = "source-over";
        }
      }
    }

    const myVis = visOf(me);
    // ⚡ קשתות שרשרת בין אויבים
    chains.current = chains.current.filter((c) => pnow - c.t0 < 260);
    for (const c of chains.current) {
      const cf = (pnow - c.t0) / 260;
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = hexA(c.c, 1 - cf);
      ctx.lineWidth = (3.5 - cf * 2) * scale;
      ctx.beginPath();
      ctx.moveTo(wx(c.x1), wy(c.y1));
      const segs = 4;
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const jx = i === segs ? 0 : (Math.sin(i * 12.9898 + c.t0) * 0.5) * 26;
        const jy = i === segs ? 0 : (Math.cos(i * 78.233 + c.t0) * 0.5) * 26;
        ctx.lineTo(wx(c.x1 + (c.x2 - c.x1) * t + jx), wy(c.y1 + (c.y2 - c.y1) * t + jy));
      }
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }

    // אפקטים
    if (fxs.current.length > FX_CAP) fxs.current.splice(0, fxs.current.length - FX_CAP);
    fxs.current = fxs.current.filter((f) => pnow - f.t0 < 600);
    for (const f of fxs.current) {
      const ft = (pnow - f.t0) / 600;
      if (f.kind === "boom") {
        const im = wlImg("boom");
        const r = (f.r ?? 120) * (0.6 + ft * 0.9);
        ctx.globalAlpha = 1 - ft;
        ctx.globalCompositeOperation = "screen";
        if (im.complete && im.naturalWidth) ctx.drawImage(im, wx(f.x - r), wy(f.y - r), r * 2 * scale, r * 2 * scale);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      } else if (f.kind === "slash") {
        const st = Math.min(1, (pnow - f.t0) / 300); // סלאש מהיר מהשאר
        const ang = f.dir ?? 0;
        const im2 = wlImg("slash");
        ctx.save();
        ctx.translate(wx(f.x + Math.cos(ang) * 42), wy(f.y + Math.sin(ang) * 42));
        ctx.rotate(ang + Math.PI / 2);
        ctx.globalAlpha = 1 - st;
        ctx.globalCompositeOperation = "lighter";
        const sz = 160 * (0.6 + st * 0.7) * scale;
        if (im2.complete && im2.naturalWidth) {
          ctx.drawImage(im2, -sz / 2, -sz / 2, sz, sz);
        } else {
          ctx.strokeStyle = myVis.color ?? "#bfe8ff"; ctx.lineWidth = 10 * scale; ctx.lineCap = "round";
          ctx.beginPath(); ctx.arc(0, 0, sz * 0.34, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
          ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4 * scale;
          ctx.beginPath(); ctx.arc(0, 0, sz * 0.34, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.restore();
      } else if (f.kind === "spark") {
        const hi = wlImg("hit");
        if (hi.complete && hi.naturalWidth && ft < 0.5) {
          const hsz = 52 * (0.6 + ft) * scale;
          ctx.globalAlpha = 1 - ft * 2;
          ctx.globalCompositeOperation = "lighter";
          ctx.drawImage(hi, wx(f.x) - hsz / 2, wy(f.y) - hsz / 2, hsz, hsz);
          ctx.globalCompositeOperation = "source-over";
        }
        ctx.fillStyle = f.color ?? "#fff";
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const rr = ft * 34;
          ctx.globalAlpha = 1 - ft;
          ctx.fillRect(wx(f.x + Math.cos(a) * rr), wy(f.y + Math.sin(a) * rr), 3, 3);
        }
        ctx.globalAlpha = 1;
      } else if (f.kind === "levelup") {
        ctx.strokeStyle = `rgba(255,206,60,${1 - ft})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(wx(f.x), wy(f.y), 30 + ft * 120, 0, 7); ctx.stroke();
      } else if (f.kind === "trait") {
        // גדל מהר, דוהה — נקרא מיד ולא נשאר לטנף את המסך
        const tf = Math.min(1, (pnow - f.t0) / 420);
        const im3 = wlImg(TRAIT_FX[f.trait!]);
        if (im3.complete && im3.naturalWidth) {
          const sz = (f.sz ?? 52) * (0.55 + tf * 0.75) * scale;
          ctx.globalAlpha = Math.max(0, 1 - tf * tf);
          ctx.globalCompositeOperation = "screen";
          ctx.drawImage(im3, wx(f.x) - sz / 2, wy(f.y) - sz / 2 - tf * 14 * scale, sz, sz);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        }
      } else if (f.kind === "dmg") {
        // מספר נזק צף — עולה ודוהה
        const fsz = (f.big ? 24 : 15) * scale;
        ctx.font = `900 ${fsz}px Rubik, sans-serif`;
        ctx.textAlign = "center";
        ctx.globalAlpha = Math.max(0, 1 - ft * 1.15);
        ctx.strokeStyle = "rgba(0,0,0,.75)"; ctx.lineWidth = 3;
        const dy2 = wy(f.y) - ft * 42 * scale;
        ctx.strokeText(f.txt ?? "", wx(f.x), dy2);
        ctx.fillStyle = f.color ?? "#fff";
        ctx.fillText(f.txt ?? "", wx(f.x), dy2);
        ctx.globalAlpha = 1;
      }
    }

    // כיוון (קשת/תותחן)
    const aim = aimRef.current;
    if (aim && !down) {
      const role = myRole();
      if (role === "archer" || role === "cannon") {
        const from = h?.slot ?? [500, WALL_Y + 60];
        ctx.setLineDash([6, 8]);
        ctx.strokeStyle = role === "archer" ? "#34e89ecc" : "#ffce3ccc";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(wx(from[0]), wy(from[1]));
        // קשת מסלול
        for (let i = 1; i <= 12; i++) {
          const f = i / 12;
          const px = from[0] + (aim.tx - from[0]) * f;
          const py = from[1] + (aim.ty - from[1]) * f - Math.sin(f * Math.PI) * (role === "cannon" ? 260 : 28);
          ctx.lineTo(wx(px), wy(py));
        }
        ctx.stroke();
        ctx.setLineDash([]);
        // התותחן: עיגול הדף גדול וממולא (שטח). הקשת: צלב דיוק דק בלבד —
        // עיגול ההדף היה חלק ממה שגרם לשני הנשקים להיראות אותו דבר.
        if (role === "cannon") {
          const tr = 60 * scale;
          ctx.fillStyle = "#ffce3c18";
          ctx.beginPath(); ctx.arc(wx(aim.tx), wy(aim.ty), tr, 0, 7); ctx.fill();
          ctx.strokeStyle = "#ffce3c"; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(wx(aim.tx), wy(aim.ty), tr, 0, 7); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(wx(aim.tx) - tr * 0.55, wy(aim.ty)); ctx.lineTo(wx(aim.tx) + tr * 0.55, wy(aim.ty));
          ctx.moveTo(wx(aim.tx), wy(aim.ty) - tr * 0.55); ctx.lineTo(wx(aim.tx), wy(aim.ty) + tr * 0.55);
          ctx.stroke();
        } else {
          const c = 13 * scale, g = 4 * scale;
          ctx.strokeStyle = "#34e89e"; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(wx(aim.tx) - c, wy(aim.ty)); ctx.lineTo(wx(aim.tx) - g, wy(aim.ty));
          ctx.moveTo(wx(aim.tx) + g, wy(aim.ty)); ctx.lineTo(wx(aim.tx) + c, wy(aim.ty));
          ctx.moveTo(wx(aim.tx), wy(aim.ty) - c); ctx.lineTo(wx(aim.tx), wy(aim.ty) - g);
          ctx.moveTo(wx(aim.tx), wy(aim.ty) + g); ctx.lineTo(wx(aim.tx), wy(aim.ty) + c);
          ctx.stroke();
          ctx.fillStyle = "#34e89e"; ctx.beginPath(); ctx.arc(wx(aim.tx), wy(aim.ty), 1.6 * scale, 0, 7); ctx.fill();
        }
      }
    }

    // ג'ויסטיק צף של החלוץ (קואורדינטות מסך)
    if (myRole() === "heli" && joyRef.current.active) {
      const j = joyRef.current;
      const cvR = cv.getBoundingClientRect();
      const jox = j.ox - cvR.left, joy2 = j.oy - cvR.top;
      let jdx = j.kx - j.ox, jdy = j.ky - j.oy;
      const jd = Math.hypot(jdx, jdy);
      if (jd > 56) { jdx = (jdx / jd) * 56; jdy = (jdy / jd) * 56; }
      ctx.strokeStyle = "#ff5c5c66"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(jox, joy2, 56, 0, 7); ctx.stroke();
      ctx.fillStyle = "#ff5c5c22";
      ctx.beginPath(); ctx.arc(jox, joy2, 56, 0, 7); ctx.fill();
      ctx.fillStyle = "#ff5c5ccc";
      ctx.beginPath(); ctx.arc(jox + jdx, joy2 + jdy, 24, 0, 7); ctx.fill();
    }

    // הבזק בצבע התכונה ברגע השדרוג/האבולוציה
    if (surge.current) {
      const sf = (pnow - surge.current.t0) / (surge.current.big ? 1200 : 460);
      ctx.fillStyle = hexA(surge.current.color, (1 - sf) * (surge.current.big ? 0.3 : 0.18));
      ctx.fillRect(0, 0, cw, chh);
    }

    // הבזק אדום כשהחומה חוטפת — עכשיו באמת מרגישים שמפסידים
    if (hurtFlash.current > 0.02) {
      ctx.fillStyle = `rgba(255,45,45,${0.17 * hurtFlash.current})`;
      ctx.fillRect(0, 0, cw, chh);
      hurtFlash.current *= 0.88;
    }

    // דיבאג/בדיקות: מצב חשוף לבוטים של ה-E2E. נבנה כל 6 פריימים ולא כל פריים —
    // אותה API בדיוק, בלי להקצות מיפוי מלא של הנחיל 60 פעם בשנייה.
    dbgTick.current++;
    if (dbgTick.current % 6 === 0) {
      (window as unknown as { __wlBombs?: number }).__wlBombs = bombs.current.length;
      (window as unknown as { __wlFlaks?: number }).__wlFlaks = flaks.current.length;
      (window as unknown as { __wlDbg?: unknown }).__wlDbg = {
        wave: waveRef.current, phase: phaseRef.current, vw: cw, vh: chh,
        bombs: bombs.current.length, flaks: flaks.current.length,
        styles: Object.fromEntries([...styles.current.entries()]),
        enemies: [...enemies.current.values()].filter((e) => e.deadAt === undefined).map((e) => {
          const [x, y] = posOf(e, now);
          return { x, y, sx: wx(x), sy: wy(y), type: e.type };
        }),
      };
    }

    // ⛽ רצועת התדלוק — קו מקווקו שמזכיר לטייס לאן לחזור, מופיע כשהדלק יורד
    if (myRole() === "heli" && fuelRef.current.fuel < 55 && phaseRef.current === "wave") {
      ctx.setLineDash([12 * scale, 9 * scale]);
      ctx.strokeStyle = `rgba(255,206,60,${fuelRef.current.fuel <= 1 ? 0.8 : 0.4})`;
      ctx.lineWidth = 2 * scale;
      ctx.beginPath(); ctx.moveTo(wx(0), wy(1080)); ctx.lineTo(wx(W), wy(1080)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `${12 * scale}px sans-serif`; ctx.textAlign = "center";
      ctx.fillStyle = `rgba(255,206,60,${fuelRef.current.fuel <= 1 ? 0.95 : 0.55})`;
      ctx.fillText("⛽ אזור תדלוק ⛽", wx(500), wy(1080) - 6 * scale);
    }

    // מיני-מפה: פס עליון של כל החזית
    const mmH = 34;
    ctx.fillStyle = "rgba(5,7,12,.82)";
    ctx.fillRect(0, 0, cw, mmH);
    ctx.fillStyle = "#39e75f";
    for (const e of enemies.current.values()) {
      if (e.deadAt) continue;
      const [ex, ey] = posOf(e, now);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = e.type === "boss" ? "#ff5c5c" : e.type === "armored" ? "#ff8a3c" : "#39e75f";
      ctx.fillRect((ex / W) * cw - 1.5, 4 + (ey / WALL_Y) * (mmH - 10), e.type === "boss" ? 6 : 3, e.type === "boss" ? 6 : 3);
    }
    ctx.globalAlpha = 1;
    for (const [pid, hh] of heroes.current.entries()) {
      ctx.fillStyle = ROLE_COLOR[hh.role];
      const y = mmH - 5;
      ctx.fillRect((hh.x / W) * cw - 2, y, pid === me ? 6 : 4, 4);
    }
    // חלון המצלמה שלי
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.strokeRect((camL / W) * cw, 1, (vw / W) * cw, mmH - 2);
  }

  /* ---- קלט ---- */
  function toWorld(e: React.PointerEvent): [number, number] {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    const vw = viewWRef.current;
    const scale = r.width / vw;
    const camTop = camTopRef.current;
    const camL = Math.max(0, Math.min(W - vw, camX.current - vw / 2));
    return [camL + (e.clientX - r.left) / scale, camTop + (e.clientY - r.top) / scale];
  }

  /** מקלען: הכוונת היא בדיוק איפה שהאצבע — אותה המרה שהקשת והתותחן משתמשים בה.
   *  קודם זה מיפה את רוחב המסך על *כל* השדה (1000) בזמן שהמצלמה מציגה חלון של 660
   *  עם היסט — אז הרובה כיוון למקום אחר לגמרי ממה שנגעת בו. */
  function mgAim(e: React.PointerEvent): [number, number] {
    const [ax, ay] = toWorld(e);
    return [Math.max(0, Math.min(W, ax)), Math.max(40, Math.min(ay, WALL_Y - 30))];
  }

  function onDown(e: React.PointerEvent) {
    if (phaseRef.current !== "wave" || down) return;
    (e.target as Element).setPointerCapture?.(e.pointerId); // גרירות לא בורחות לשכבות-על
    const [wx0, wy0] = toWorld(e);
    ptr.current = { down: true, x0: e.clientX, y0: e.clientY, t0: performance.now(), x: e.clientX, y: e.clientY, moved: false };
    const role = myRole();
    if (role === "mg") {
      if (Date.now() < jamUntil) return;
      firing.current = true;
      const [ax, ay] = mgAim(e);
      aimRef.current = { tx: ax, ty: ay, power: 1 };
      conn.sendGame({ a: "wl_fire", on: true });
      conn.sendGame({ a: "wl_aim", x: Math.round(ax), y: Math.round(ay) });
    } else if (role === "archer") {
      // גע והחזק על המטרה — יורה לבד (הירייה הראשונה מיידית דרך לולאת ה-RAF)
      aimRef.current = { tx: wx0, ty: Math.max(60, Math.min(wy0, WALL_Y - 60)), power: 1 };
      lastAutoShot.current = 0;
    } else if (role === "cannon") {
      aimRef.current = { tx: wx0, ty: Math.min(wy0, WALL_Y - 60), power: 0.7 };
    } else if (role === "heli") {
      // ג'ויסטיק צף: הבסיס נולד איפה שנגעת
      joyRef.current = { active: true, ox: e.clientX, oy: e.clientY, kx: e.clientX, ky: e.clientY };
    }
  }

  function onMove(e: React.PointerEvent) {
    if (!ptr.current.down) return;
    const p = ptr.current;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 14) p.moved = true;
    const role = myRole();
    if (role === "heli" && joyRef.current.active) {
      joyRef.current.kx = e.clientX; joyRef.current.ky = e.clientY;
    } else if (role === "mg" && firing.current) {
      const [ax, ay] = mgAim(e);
      aimRef.current = { tx: ax, ty: ay, power: 1 };
      const tn = performance.now();
      if (tn - lastAimSend.current > 160) {
        lastAimSend.current = tn;
        conn.sendGame({ a: "wl_aim", x: Math.round(ax), y: Math.round(ay) });
      }
    } else if (role === "archer" || role === "cannon") {
      const [wxp, wyp] = toWorld(e);
      aimRef.current = { tx: wxp, ty: Math.max(60, Math.min(wyp, WALL_Y - 60)), power: 1 };
    }
  }

  function onUp() {
    const p = ptr.current;
    if (!p.down) return;
    p.down = false;
    const role = myRole();
    joyRef.current.active = false;
    if (role === "mg") {
      firing.current = false;
      conn.sendGame({ a: "wl_fire", on: false });
      aimRef.current = null;
    } else if (role === "archer" || role === "cannon") {
      if (role === "cannon" && aimRef.current && Date.now() >= cannonReady.current) {
        conn.sendGame({ a: "wl_boom", tx: Math.round(aimRef.current.tx), ty: Math.round(aimRef.current.ty) });
        cannonReady.current = Date.now() + 3600 / modsRef.current.rate; // תואם לשרת — "קצב אש" מקצר טעינה
        setUi((u) => u + 1);
      }
      aimRef.current = null;
    }
  }

  /* ---- מסכי-על ---- */
  const roleCounts: Record<WallRole, number> = { heli: 0, archer: 0, cannon: 0, mg: 0 };
  for (const r of Object.values(roles)) roleCounts[r]++;

  if (phase === "setup") {
    return (
      <main className="wl-arena">
        <div className="wl-setup">
          <h2 style={{ margin: "6px 0" }}>🏰 החומה — בחרו תפקיד</h2>
          <p className="sub" style={{ fontSize: 12.5 }}>הגלים מתחזקים — הצוות צריך את כל התפקידים. אפשר כפילויות!</p>
          <div className="wl-rolegrid">
            {(["heli", "archer", "cannon", "mg"] as WallRole[]).map((r) => (
              <button key={r}
                className={"wl-rolecard" + (roles[me] === r ? " sel" : "")}
                style={{ "--rc": ROLE_COLOR[r] } as React.CSSProperties}
                onClick={() => { conn.sendGame({ a: "wl_role", role: r }); Sfx.pop(); vibrate(25); }}>
                <img src={`/wall/badge-${r === "heli" ? "infantry" : r === "archer" ? "archer" : r === "cannon" ? "cannon" : "mg"}.webp`} alt=""
                  onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; }} />
                <b>{ROLE_ICON[r]} {ROLE_NAME[r]}</b>
                <span className="sub" style={{ fontSize: 11.5 }}>{ROLE_DESC[r]}</span>
                <span className="wl-count">{roleCounts[r] > 0 ? `×${roleCounts[r]}` : " "}</span>
              </button>
            ))}
          </div>
          <div className="wl-team">
            {room.players.filter((p) => p.connected).map((p) => (
              <span key={p.id} className="chip" style={{ borderColor: ROLE_COLOR[roles[p.id] ?? "heli"] }}>
                {p.emoji} {p.name} {ROLE_ICON[roles[p.id] ?? "heli"]}
              </span>
            ))}
          </div>
          {isHost ? (
            <button className="btn" style={{ marginTop: 14 }} onClick={() => conn.sendGame({ a: "wl_go" })}>
              ⚔️ אל החומות!
            </button>
          ) : (
            <p className="sub pulse" style={{ marginTop: 14 }}>המארח פותח את הקרב...</p>
          )}
        </div>
      </main>
    );
  }

  const role = myRole();
  const cdLeft = Math.max(0, cannonReady.current - Date.now());
  const jamLeft = Math.max(0, jamUntil - Date.now());

  return (
    <main className="wl-arena">
      <canvas ref={canvasRef} className="wl-canvas"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />

      {/* HUD עליון */}
      <div className="wl-hud">
        <span className="chip" style={{ fontWeight: 900 }}>🌊 {wave}</span>
        <div className="wl-wallbar">
          <div style={{ width: `${(wallHp / Math.max(1, wallMax)) * 100}%`, background: wallHp / wallMax > 0.5 ? "#39e75f" : wallHp / wallMax > 0.22 ? "#ffce3c" : "#ff4d4d" }} />
          <span>🏰 {Math.round(wallHp)}</span>
        </div>
        <span className="chip" style={{ color: ROLE_COLOR[role] }}>{ROLE_ICON[role]} {xp.level}</span>
      </div>
      {/* מד XP */}
      <div className="wl-xpbar"><div style={{ width: `${Math.min(100, (xp.xp / xp.next) * 100)}%` }} /></div>
      {/* 🧬 הבנייה שלי — מה שאספתי, תמיד מול העיניים */}
      {(() => {
        const t = myStyle.traits ?? {};
        const list = TRAIT_ORDER.filter((k) => (t[k] ?? 0) > 0).sort((a, b) => (t[b] ?? 0) - (t[a] ?? 0));
        if (!list.length && myStyle.tier <= 1) return null;
        return (
          <div className="wl-build">
            <span className="wl-tierchip">🔩{myStyle.tier}</span>
            {list.map((k) => (
              <span key={k} className={"wl-tchip" + (myStyle.evos.includes(k) ? " evo" : "")}
                style={{ "--tc": TRAIT_COLOR[k] } as React.CSSProperties}>
                {TRAIT_EMOJI[k]}<b>{t[k]}</b>
              </span>
            ))}
          </div>
        );
      })()}

      {/* HUD תפקיד */}
      <div className="wl-rolehud">
        {role === "heli" && (
          <div className="wl-heatwrap">
            {fuelRef.current.fuel <= 1
              ? <b style={{ color: "#ffce3c" }}>⛽!</b>
              : <span className="sub" style={{ fontSize: 10 }}>⛽ דלק</span>}
            <div className="wl-heat">
              <div style={{
                height: `${Math.min(100, (fuelRef.current.fuel / Math.max(1, fuelRef.current.max)) * 100)}%`,
                background: fuelRef.current.fuel <= 25 ? "#ff8a3c" : "#ffce3c",
              }} />
            </div>
          </div>
        )}
        {role === "mg" && (
          <div className="wl-heatwrap">
            {jamLeft > 0 ? <b style={{ color: "#ff5c5c" }}>🥵 {Math.ceil(jamLeft / 1000)}</b> : <span className="sub" style={{ fontSize: 10 }}>חום</span>}
            <div className="wl-heat"><div style={{ height: `${Math.min(100, heat.current)}%` }} /></div>
          </div>
        )}
        {role === "cannon" && (
          <div className="wl-cd" style={{ opacity: cdLeft > 0 ? 1 : 0.4 }}>
            {cdLeft > 0 ? `⏳ ${(cdLeft / 1000).toFixed(1)}` : "💣 מוכן!"}
          </div>
        )}
        <div className="wl-hp"><div style={{ width: `${(myHp / Math.max(1, myMax)) * 100}%` }} /></div>
      </div>

      {evoBanner && (
        <div className="wl-evobanner popin">
          <img className="wl-evoart" src={EVO_ART(evoBanner.trait)} alt=""
            style={{ "--ec": TRAIT_COLOR[evoBanner.trait] ?? "#ffce3c" } as React.CSSProperties}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <b>{evoBanner.who ? `${evoBanner.who} פיתח:` : "פיתחת:"}</b>
          <span className="wl-evoname">{evoBanner.emoji} {evoBanner.name}</span>
        </div>
      )}
      {banner && <div className="wl-banner popin">{banner}</div>}
      {hint && <div className="wl-hint popin">{hint}</div>}
      {toast && <div className="toast" style={{ zIndex: 70 }}>{toast}</div>}
      {down && <div className="wl-downveil"><b>💀 נפלת!</b><span className="sub">חוזר בעוד רגע...</span></div>}

      {/* דראפט — צף, המשחק ממשיך ברקע! */}
      {draft && (
        <div className="wl-draft popin">
          <b>⬆️ רמה {draft.level}! בחר שדרוג:</b>
          <div className="wl-draftrow">
            {draft.cards.map((c) => (
              <button key={c.id} className="wl-card" onClick={() => {
                conn.sendGame({ a: "wl_pick", cardId: c.id });
                setDraft(null);
                // הרגע: הבזק בצבע הקלף, פעימת זום, רטט וצליל ייעודי — שדרוג הוא אירוע.
                // ערימה גבוהה = הבזק גדול יותר, כדי שהשדרוג ה-6 ירגיש חזק מהראשון.
                const isTrait = TRAIT_ORDER.includes(c.id);
                const col = TRAIT_COLOR[c.id] ?? AMP_COLOR[c.id] ?? "#ffd24a";
                const big = (c.tier ?? 1) >= 4 || /אבולוציה/.test(c.desc ?? "");
                surge.current = { t0: performance.now(), color: col, big };
                shake.current = Math.max(shake.current, big ? 16 : 8 + (c.tier ?? 1));
                Sfx.upgrade(isTrait ? TRAIT_ORDER.indexOf(c.id) + 1 : (Object.keys(AMP_COLOR).indexOf(c.id) % 8) + 1);
                vibrate(big ? [40, 30, 60, 30, 90] : [25, 30, 45]);
                // מה השתנה — צף מעל הגיבור, כדי שהשדרוג ייראה ולא רק יורגש
                const hme = heroes.current.get(me);
                if (hme) {
                  fxs.current.push({
                    kind: "dmg", x: hme.x, y: hme.y - 54, t0: performance.now(),
                    txt: `${c.emoji} ${c.name}`, color: col, big: true,
                  });
                }
              }}>
                <span style={{ fontSize: 26 }}>{c.emoji}</span>
                <b style={{ fontSize: 12 }}>{c.name}</b>
                <span className="sub" style={{ fontSize: 10 }}>{c.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* סוף ריצה */}
      {phase === "over" && over && (
        <div className="wl-overlay">
          <div style={{ fontSize: 15, opacity: 0.85 }}>🏰 החומה נפלה בגל</div>
          <div className="wl-bigwave">{over.wave}</div>
          {over.nearMiss && <div className="wl-nearmiss popin">{over.nearMiss}</div>}
          {over.bestWave > over.wave && <p className="sub">🏆 שיא הערב: גל {over.bestWave}</p>}
          <div className="wl-stats">
            {Object.entries(over.stats).map(([pid, s]) => {
              const st2 = styles.current.get(pid);
              const tt = st2?.traits ?? {};
              const list = TRAIT_ORDER.filter((k) => (tt[k] ?? 0) > 0).sort((a, b) => (tt[b] ?? 0) - (tt[a] ?? 0));
              return (
                <div key={pid} className="wl-statrow">
                  <span>{ROLE_ICON[roles[pid] ?? "heli"]} {nameOf(pid)} {over.mvp === pid && "👑"}</span>
                  {/* 🗡️ כרטיס הנשק — הבילד שנבנה בריצה הזאת, וזה מה ששולחים לחברים */}
                  <span className="wl-weapon">
                    {(st2?.evos ?? []).slice(0, 2).map((ev) => (
                      <img key={ev} className="wl-evomini" src={EVO_ART(ev)} alt=""
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ))}
                    <span className="wl-tierchip">🔩{st2?.tier ?? 1}</span>
                    {list.slice(0, 4).map((k) => (
                      <span key={k} className={"wl-tchip" + (st2?.evos?.includes(k) ? " evo" : "")}
                        style={{ "--tc": TRAIT_COLOR[k] } as React.CSSProperties}>{TRAIT_EMOJI[k]}<b>{tt[k]}</b></span>
                    ))}
                  </span>
                  <span className="sub" style={{ fontSize: 12 }}>⚔️{s.kills} · 💥{Math.round(s.dmg)} · 🛟{s.saves} · 💀{s.deaths}</span>
                </div>
              );
            })}
          </div>
          {isHost ? (
            <>
              <button className="btn wl-again" onClick={() => { conn.sendGame({ a: "wl_again" }); Sfx.goBeep(); }}>
                🔁 עוד פעם! (הפעם נחזיק)
              </button>
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => conn.sendGame({ a: "wl_finish" })}>
                🏁 סיימנו — לטקס
              </button>
            </>
          ) : (
            <p className="sub pulse" style={{ marginTop: 14 }}>המארח מחליט: עוד קרב או טקס... 👀</p>
          )}
        </div>
      )}
    </main>
  );
}
