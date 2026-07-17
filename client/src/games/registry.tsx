/**
 * רישום המשחקים בצד הלקוח — משחק חדש = קומפוננטה חדשה + שורה כאן.
 * GameHub: צינור האירועים מהחיבור אל מסך המשחק (כולל cues מתוזמנים).
 */
import type { ComponentType } from "react";
import type { RoomSnapshot, GameServerMsg } from "../../../shared/protocol";
import type { Connection } from "../lib/connection";
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

export type GameListener = (d: GameServerMsg, at: number) => void;

export class GameHub {
  private listeners = new Set<GameListener>();
  /** הודעות שהגיעו לפני שמסך המשחק הספיק להירשם (מרוץ mount) — נשמרות ומוזרמות ברישום הראשון */
  private pending: Array<[GameServerMsg, number]> = [];
  subscribe(fn: GameListener): () => void {
    this.listeners.add(fn);
    if (this.pending.length) {
      const q = this.pending;
      this.pending = [];
      for (const [d, at] of q) fn(d, at);
    }
    return () => this.listeners.delete(fn);
  }
  emit(d: GameServerMsg, at: number) {
    if (this.listeners.size === 0) { this.pending.push([d, at]); return; }
    for (const fn of this.listeners) fn(d, at);
  }
  /** ניקוי בין משחקים — שלא יזלגו הודעות ישנות למשחק הבא */
  reset() { this.pending = []; }
}

export interface GameViewProps {
  room: RoomSnapshot;
  me: string;
  conn: Connection;
  hub: GameHub;
}

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
};
