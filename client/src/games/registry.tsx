/**
 * רישום המשחקים בצד הלקוח — משחק חדש = קומפוננטה חדשה + שורה כאן.
 * GameHub: צינור האירועים מהחיבור אל מסך המשחק (כולל cues מתוזמנים).
 */
import type { ComponentType } from "react";
import { GameHub, type GameViewProps, type GameListener } from "../lib/gamehub";
import ForeheadView from "./forehead";
import PodsView from "./pods";
import BombsView from "./bombs";
import ColorRulesView from "./colorrules";
import SimonView from "./simon";
import DeathTouchView from "./deathtouch";
import DemonsView from "./demons";
import AliasView from "./alias";
import TriviaView from "./trivia";
import WhoMostView from "./whomost";
import ImpostorView from "./impostor";
import WallView from "./wall";
import HofrimView from "./hofrim";
import ThievesView from "./thieves";
import AbyssView from "./abyss";

// GameHub עבר ל-lib/gamehub (משותף לאפליקציית המופע) — מייצאים מחדש לתאימות
export { GameHub };
export type { GameViewProps, GameListener };

/** צבע החתימה של כל משחק — דיו דפוס אחד לכל אחד.
 *  משמש כצל הקשיח של המדבקה על הרקע הכהה וכגוון המילוי שלה,
 *  ולכן נבחר לפי נראות מול הרקע הכהה (כל הערכים ≥3:1 מול ‎#171310). */
export const GAME_COLORS: Record<string, string> = {
  whomost: "#FFC531",     // צהוב
  colorrules: "#E23FA0",  // מג'נטה
  simon: "#0FA958",       // ירוק
  deathtouch: "#FF4438",  // אדום
  demons: "#A78BFA",      // סגול בהיר
  alias: "#FF7A29",       // כתום
  trivia: "#4D86FF",      // כחול
  bombs: "#F2A007",       // ענבר
  forehead: "#0FA3A3",    // טורקיז
  pods: "#A855F7",        // ענבים
  show: "#E8A33D",        // זהב חם
  impostor: "#C05CE8",    // לילך
  wall: "#E0521B",        // חלודה
  hofrim: "#FF8A3D",      // כתום מנורה
  thieves: "#9B6BFF",     // סגול לילה
  abyss: "#38C8E8",       // תכלת-גביש
};

export const GAME_VIEWS: Record<string, ComponentType<GameViewProps>> = {
  forehead: ForeheadView,
  pods: PodsView,
  bombs: BombsView,
  colorrules: ColorRulesView,
  simon: SimonView,
  deathtouch: DeathTouchView,
  demons: DemonsView,
  alias: AliasView,
  trivia: TriviaView,
  whomost: WhoMostView,
  // show — עבר לאפליקציית המופע הנפרדת (/s)
  impostor: ImpostorView,
  wall: WallView,
  hofrim: HofrimView,
  thieves: ThievesView,
  abyss: AbyssView,
};
