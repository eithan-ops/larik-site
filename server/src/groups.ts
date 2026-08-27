/**
 * LARIK — "החבורה שלנו".
 *
 * הבעיה שזה פותר: היום, כשהערב נגמר — לאריק נגמר. כל ערב מתחיל מאפס,
 * ואין שום סיבה לחזור. חבורה שנשמרת הופכת ערב חד-פעמי לעונה שממשיכה,
 * והיא גם מה שמחליף את "חדר BGPN" בשם אמיתי על כרטיס הסיום.
 *
 * שני עקרונות:
 *  1. **בלי הרשמה.** החבורה חיה בקישור קבוע; מזהה השחקן נשמר במכשיר.
 *     מי שאיבד אותו בוחר את עצמו מרשימת החבורה ("מי אתה?") וממשיך.
 *  2. **מסד שנפל לא מפיל ערב.** כל פעולה כאן היא best-effort:
 *     אם האחסון מת, המשחק ממשיך בדיוק כמו היום, פשוט בלי עונה.
 */
import type { PlayerFacts, GroupSummary, GroupRecord } from "../../shared/protocol";
import { getStore, type Store } from "./store";

export type { GroupSummary, GroupRecord };

const SEASON_DAYS = 90;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // בלי I ו-O — מתבלבלים עם 1 ו-0

export interface GroupMember {
  pid: string;      // מזהה יציב בין ערבים (לא מזהה החדר)
  name: string;
  emoji: string;
  points: number;   // נקודות עונה מצטברות
  evenings: number; // בכמה ערבים השתתף
  wins: number;
  clown: number;
  lastSeen: number;
}

export interface Group {
  id: string;
  name: string;
  createdAt: number;
  seasonStartedAt: number;
  seasonNo: number;
  evenings: number;
  lastPlayedAt: number;
  members: Record<string, GroupMember>;
  records: Record<string, GroupRecord>;
}

const key = (id: string) => `group:${id}`;

function code(len = 5): string {
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

export class Groups {
  private store: Store;
  private now: () => number;

  constructor(store: Store = getStore(), now: () => number = () => Date.now()) {
    this.store = store;
    this.now = now;
  }

  async get(id: string): Promise<Group | null> {
    if (!id) return null;
    return this.store.get<Group>(key(id.toUpperCase()));
  }

  /** יוצר חבורה חדשה עם החברים שהיו בערב. מחזיר null אם האחסון לא זמין בכלל. */
  async create(name: string, members: { pid: string; name: string; emoji: string }[]): Promise<Group> {
    // התנגשות קודים היא נדירה, אבל חבורה שדורסת חבורה אחרת היא באג שאי אפשר לתקן בדיעבד
    let id = code();
    for (let i = 0; i < 5 && (await this.get(id)); i++) id = code();
    const t = this.now();
    const group: Group = {
      id,
      name: (name || "החבורה").trim().slice(0, 24),
      createdAt: t,
      seasonStartedAt: t,
      seasonNo: 1,
      evenings: 0,
      lastPlayedAt: t,
      members: {},
      records: {},
    };
    for (const m of members) group.members[m.pid] = this.blank(m);
    await this.store.put(key(id), group);
    return group;
  }

  private blank(m: { pid: string; name: string; emoji: string }): GroupMember {
    return {
      pid: m.pid,
      name: (m.name || "שחקן").slice(0, 16),
      emoji: m.emoji || "🙂",
      points: 0, evenings: 0, wins: 0, clown: 0,
      lastSeen: this.now(),
    };
  }

  /**
   * מחיל משחק שנגמר על העונה.
   *
   * נקרא אחרי *כל* משחק כדי שהטבלה תתעדכן חי בטקס — ולכן הקלט הוא
   * **הדלתא** של המשחק ולא הסכום המצטבר; אחרת ערב של חמישה משחקים
   * היה נספר חמש פעמים. מונה הערבים עולה רק במשחק הראשון של החדר.
   *
   * `facts` הוא המצטבר של הערב, וזה בסדר: השיאים הם מינימום/מקסימום,
   * כלומר להחיל אותם שוב ושוב לא משנה את התוצאה.
   */
  async applyGame(
    id: string,
    players: { pid: string; name: string; emoji: string; points: number; won: boolean; clown: boolean }[],
    facts: Record<string, PlayerFacts>,
    firstGameOfEvening: boolean
  ): Promise<Group | null> {
    const group = await this.get(id);
    if (!group) return null;
    const t = this.now();

    // עונה שנגמרה מתאפסת מעצמה — הכתרת אלוף היא עוד רגע שיתוף מובנה
    if (t - group.seasonStartedAt > SEASON_DAYS * 864e5) {
      for (const m of Object.values(group.members)) { m.points = 0; m.evenings = 0; m.wins = 0; m.clown = 0; }
      group.seasonStartedAt = t;
      group.seasonNo += 1;
    }

    for (const p of players) {
      const m = (group.members[p.pid] ??= this.blank(p));
      m.name = p.name || m.name;
      m.emoji = p.emoji || m.emoji;
      m.points += p.points;
      if (firstGameOfEvening) m.evenings += 1;
      if (p.won) m.wins += 1;
      if (p.clown) m.clown += 1;
      m.lastSeen = t;
      this.updateRecords(group, m, facts[p.pid] ?? {}, t);
    }

    if (firstGameOfEvening) group.evenings += 1;
    group.lastPlayedAt = t;
    await this.store.put(key(group.id), group);
    return group;
  }

  /** שיאים שנשברים בפועל — כל אחד מהם הוא שורה שאפשר להתגאות בה */
  private updateRecords(group: Group, m: GroupMember, f: PlayerFacts, t: number) {
    const beat = (k: string, label: string, value: number | undefined, lower = false) => {
      if (value === undefined || !Number.isFinite(value)) return;
      const cur = group.records[k];
      const better = !cur || (lower ? value < cur.value : value > cur.value);
      if (better) group.records[k] = { label, pid: m.pid, name: m.name, value, at: t };
    };
    beat("fastest", "האצבע הכי מהירה", f.bestReactionMs, true);
    beat("streak", "רצף הניצחונות הארוך", f.bestStreak);
    beat("brain", "הכי הרבה תשובות נכונות בערב", f.correct);
    beat("taps", "הכי הרבה פודים בערב", f.taps);
    beat("peeks", "הכי הרבה הצצות בערב", f.peeks);
  }

  /** מייצר את התקציר ללקוח — ממוין, חתוך, ובלי שדות פנימיים */
  summarize(group: Group, now = this.now()): GroupSummary {
    const table = Object.values(group.members)
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "he"))
      .slice(0, 20)
      .map((m) => ({ pid: m.pid, name: m.name, emoji: m.emoji, points: m.points, evenings: m.evenings }));
    const daysLeft = Math.max(0, Math.ceil((group.seasonStartedAt + SEASON_DAYS * 864e5 - now) / 864e5));
    return {
      id: group.id,
      name: group.name,
      evenings: group.evenings,
      seasonNo: group.seasonNo,
      daysLeftInSeason: daysLeft,
      table,
      records: Object.values(group.records).sort((a, b) => b.at - a.at),
    };
  }

  /** שינוי שם — המארח בלבד, מהלקוח */
  async rename(id: string, name: string): Promise<Group | null> {
    const group = await this.get(id);
    if (!group) return null;
    group.name = (name || group.name).trim().slice(0, 24);
    await this.store.put(key(group.id), group);
    return group;
  }
}
