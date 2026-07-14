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

export type GameListener = (d: GameServerMsg, at: number) => void;

export class GameHub {
  private listeners = new Set<GameListener>();
  subscribe(fn: GameListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(d: GameServerMsg, at: number) {
    for (const fn of this.listeners) fn(d, at);
  }
}

export interface GameViewProps {
  room: RoomSnapshot;
  me: string;
  conn: Connection;
  hub: GameHub;
}

export const GAME_VIEWS: Record<string, ComponentType<GameViewProps>> = {
  forehead: ForeheadView,
  pods: PodsView,
  bombs: BombsView,
};
