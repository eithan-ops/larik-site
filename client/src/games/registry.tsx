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

// GameHub עבר ל-lib/gamehub (משותף לאפליקציית המופע) — מייצאים מחדש לתאימות
export { GameHub };
export type { GameViewProps, GameListener };

/** צבע מזהה לכל משחק — לקטלוג, לכרטיסים ולהדגשות */
export const GAME_COLORS: Record<string, string> = {
  whomost: "#ffc93c",
  colorrules: "#ec4899",
  simon: "#34e89e",
  deathtouch: "#ff5c5c",
  demons: "#a78bfa",
  alias: "#ff7854",
  trivia: "#5c8aff",
  bombs: "#ffb62e",
  forehead: "#2dd4bf",
  pods: "#8b5cf6",
  show: "#ffb46b",
  impostor: "#c084fc",
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
};
