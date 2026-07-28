/**
 * GameHub + GameViewProps — צינור האירועים מהחיבור אל מסך המשחק/המופע.
 * חי במודול נפרד (לא ב-registry) כדי שאפליקציית המופע הרזה לא תגרור את כל המשחקים.
 */
import type { RoomSnapshot, GameServerMsg } from "../../../shared/protocol";
import type { Connection } from "./connection";

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
