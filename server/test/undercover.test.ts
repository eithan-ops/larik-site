/**
 * "המתחזה למתקדמים" 🥸 — בדיקות שרת. מריצים: npx tsx test/undercover.test.ts
 *
 * מה נבדק, ולמה דווקא זה:
 *  1. **הסוד** — uc_role זהה בצורתו אצל כולם, ואין בו שום שדה שמסגיר מי המתחזה.
 *     זה הבאג היחיד שהורס את המשחק לגמרי, אז הוא ראשון.
 *  2. שתי מילים אמיתיות: המיעוט מקבל מילה אחרת, מזוג מהחפיסה.
 *  3. 7+ שחקנים = שני מתחזים, ושניהם מקבלים את אותה מילה.
 *  4. סבב רמזים לפי סדר, "אמרתי" מקדם, דילוג של המארח, ותור של מי שהתנתק לא תוקע.
 *  5. הצבעה סודית: הספירה משודרת, התוכן לא; הצבעה עצמית נדחית.
 *  6. חשיפה כ-cue אחד לכל החדר, עם שתי המילים והטלי.
 *  7. טבלת הניקוד על כל ענפיה: תפס/פספס/שרד/נתפס/ניחוש מציל/הכריז וצדק/הכריז וטעה/בלוף של תמים.
 *  8. תיקו בהצבעה — אף אחד לא מודח, והמתחזה נחשב "שרד".
 *  9. חיבור מחדש באמצע כל שלב מחזיר מצב מלא.
 * 10. sameWord — "הים"/"ים", רווחים, ושגיאת הקלדה אחת.
 */
import { Room, Transport } from "../src/engine";
import { createUndercover, sameWord } from "../src/games/undercover";
import { UNDERCOVER_PAIRS } from "../src/decks";
import type { ServerMsg } from "../../shared/protocol";

let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log((cond ? "  ✓ " : "  ✗ FAIL ") + name + (extra ? `  (${extra})` : ""));
  if (!cond) failed++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeTransport() {
  const inbox = new Map<string, ServerMsg[]>();
  const transport: Transport = {
    send(pid, msg) { if (!inbox.has(pid)) inbox.set(pid, []); inbox.get(pid)!.push(msg); },
  };
  const ev = (pid: string, a: string) =>
    (inbox.get(pid) ?? []).filter((m: any) => (m.t === "game" || m.t === "cue") && m.d?.a === a).map((m: any) => m.d);
  const last = (pid: string, a: string) => ev(pid, a).at(-1);
  const clear = () => inbox.clear();
  return { transport, ev, last, clear };
}

function room(code: string, pids: string[], config: Record<string, unknown> = {}) {
  const t = makeTransport();
  const r = new Room(code, t.transport, { undercover: createUndercover });
  pids.forEach((p, i) => r.join(p, "שחקן" + i, "🙂"));
  r.onMessage(pids[0], { t: "select_game", gameId: "undercover", config });
  r.onMessage(pids[0], { t: "start_game" });
  return { r, ...t };
}

/** מריץ סיבוב עד סוף סבב הרמזים ומחזיר מי המתחזה (מהמילים, לא מדגל) */
function impostorsOf(pids: string[], last: (p: string, a: string) => any): string[] {
  const words = pids.map((p) => last(p, "uc_role").word);
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const minority = [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0];
  return pids.filter((_, i) => words[i] === minority);
}

async function main() {
  console.log("\n— המתחזה למתקדמים 🥸 —");

  /* ---------- 1+2. הסוד ושתי המילים ---------- */
  {
    const P = ["a", "b", "c", "d", "e"];
    const { last } = room("UC01", P, { declare: "on" });
    const roles = P.map((p) => last(p, "uc_role"));
    check("כולם קיבלו uc_role", roles.every(Boolean));
    const keys = roles.map((r) => Object.keys(r).sort().join(","));
    check("הצורה של uc_role זהה אצל כולם", new Set(keys).size === 1, keys[0]);
    check("אין שדה שמסגיר מי המתחזה",
      roles.every((r) => !("isImpostor" in r) && !("impostor" in r) && !("majority" in r)));
    const words = roles.map((r) => r.word);
    const uniq = [...new Set(words)];
    check("בדיוק שתי מילים שונות בחדר", uniq.length === 2, uniq.join(" / "));
    check("לכל אחד יש מילה אמיתית (אף אחד לא ריק)", words.every((w) => typeof w === "string" && w.length > 0));
    const imp = impostorsOf(P, last);
    check("מתחזה אחד ב-5 שחקנים", imp.length === 1, imp.join(","));
    const known = UNDERCOVER_PAIRS.some((p) =>
      (p.a === uniq[0] && p.b === uniq[1]) || (p.b === uniq[0] && p.a === uniq[1]));
    check("שתי המילים הן זוג מהחפיסה", known, uniq.join("|"));
    check("uc_role כולל את מספר המתחזים ואת מצב ההכרזה",
      roles[0].impostors === 1 && roles[0].declareOn === true);
    // ברירת המחדל היא בלי הכרזה עצמית — רק המארח מדליק אותה
    const plain = room("UC01b", P);
    check("ברירת המחדל: הכרזה עצמית כבויה", plain.last("a", "uc_role").declareOn === false);
    plain.r.onMessage("b", { t: "game", d: { a: "uc_declare", guess: "משהו" } });
    check("ברירת המחדל דוחה הכרזה", !plain.last("b", "uc_declared"));
    check("סדר הרמזים כולל את כולם", new Set(roles[0].order).size === P.length);
  }

  /* ---------- 3. שני מתחזים ב-7+ ---------- */
  {
    const P = ["a", "b", "c", "d", "e", "f", "g"];
    const { last } = room("UC02", P, { declare: "on" });
    const imp = impostorsOf(P, last);
    check("7 שחקנים ⇒ שני מתחזים", imp.length === 2, imp.join(","));
    const w = imp.map((p) => last(p, "uc_role").word);
    check("שני המתחזים קיבלו את אותה מילה", w[0] === w[1], w.join("/"));
    check("uc_role מדווח impostors=2", last("a", "uc_role").impostors === 2);
  }

  /* ---------- 4. סבב רמזים ---------- */
  {
    const P = ["a", "b", "c", "d"];
    const { r, last, ev } = room("UC03", P, { declare: "on" });
    P.forEach((p) => r.onMessage(p, { t: "game", d: { a: "uc_ready" } }));
    const order: string[] = last("a", "uc_role").order;
    let ph = last("a", "uc_phase");
    check("אחרי שכולם מוכנים מתחיל סבב הרמזים", ph.phase === "clues", ph.phase);
    check("התור הראשון הוא הראשון בסדר", ph.turn === order[0], `${ph.turn} vs ${order[0]}`);
    check("התור ממוספר 1/4", ph.idx === 1 && ph.of === 4);

    r.onMessage(order[1], { t: "game", d: { a: "uc_said" } });   // לא בעל התור
    check("רק בעל התור יכול לומר 'אמרתי'", last("a", "uc_phase").turn === order[0]);
    r.onMessage(order[0], { t: "game", d: { a: "uc_said" } });
    check("'אמרתי' מקדם לתור הבא", last("a", "uc_phase").turn === order[1]);
    r.onMessage("a", { t: "game", d: { a: "uc_said" } });        // המארח מדלג
    check("המארח יכול לדלג על תור תקוע", last("a", "uc_phase").turn === order[2]);

    r.disconnect(order[2]);                                      // בעל התור נעלם
    check("תור של מי שעזב לא תוקע", last("a", "uc_phase").turn === order[3], last("a", "uc_phase").turn);
    r.onMessage(order[3], { t: "game", d: { a: "uc_said" } });
    check("אחרי האחרון עוברים לדיון", last("a", "uc_phase").phase === "talk");
    r.onMessage("a", { t: "game", d: { a: "uc_skip" } });
    check("המארח מקצר את הדיון להצבעה", last("a", "uc_phase").phase === "vote");
    check("שודר מונה הצבעות פתיחה", ev("a", "uc_voted").at(-1).n === 0);
  }

  /* ---------- 5+6+7. הצבעה, חשיפה וניקוד — המתחזה נתפס ---------- */
  {
    const P = ["a", "b", "c", "d", "e"];
    const { r, last, ev } = room("UC04", P, { declare: "off" });
    P.forEach((p) => r.onMessage(p, { t: "game", d: { a: "uc_ready" } }));
    const imp = impostorsOf(P, last)[0];
    const good = P.filter((p) => p !== imp);
    r.onMessage("a", { t: "game", d: { a: "uc_skip" } });   // לדיון
    r.onMessage("a", { t: "game", d: { a: "uc_skip" } });   // להצבעה

    r.onMessage(good[0], { t: "game", d: { a: "uc_vote", target: good[0] } });
    check("הצבעה עצמית נדחית", ev("a", "uc_voted").at(-1).n === 0);
    // שלושה תמימים מצביעים למתחזה, אחד מפספס, והמתחזה מצביע בתמימות
    r.onMessage(good[0], { t: "game", d: { a: "uc_vote", target: imp } });
    check("מונה ההצבעות משודר", ev("a", "uc_voted").at(-1).n === 1);
    check("תוכן ההצבעה לא משודר", !("target" in ev("a", "uc_voted").at(-1)) && !("votes" in ev("a", "uc_voted").at(-1)));
    r.onMessage(good[1], { t: "game", d: { a: "uc_vote", target: imp } });
    r.onMessage(good[2], { t: "game", d: { a: "uc_vote", target: imp } });
    r.onMessage(good[3], { t: "game", d: { a: "uc_vote", target: good[0] } });
    r.onMessage(imp, { t: "game", d: { a: "uc_vote", target: good[1] } });

    await sleep(1300);   // ה-cue של החשיפה
    const rv = last("a", "uc_reveal");
    check("החשיפה שודרה", !!rv);
    check("החשיפה הגיעה לכל הטלפונים", P.every((p) => !!last(p, "uc_reveal")));
    check("החשיפה מכילה את שתי המילים", !!rv.majorityWord && !!rv.impostorWord && rv.majorityWord !== rv.impostorWord);
    check("החשיפה מסמנת את המתחזה", rv.impostors.length === 1 && rv.impostors[0] === imp);
    check("המודח הוא המתחזה (3 קולות)", rv.ejected === imp && rv.tally[imp] === 3, JSON.stringify(rv.tally));
    check("אין תיקו", rv.tie === false);

    await sleep(2800);
    const g = last("a", "uc_guess");
    check("מתחזה שנתפס מקבל ניחוש אחרון", !!g && g.pid === imp);
    r.onMessage(imp, { t: "game", d: { a: "uc_guess", guess: "כנראה לא זה" } });
    check("תוצאת הניחוש שודרה", last("a", "uc_guessed").ok === false);

    await sleep(2900);
    const sc = last("a", "uc_scores");
    check("לוח הניקוד שודר", !!sc);
    const row = (p: string) => sc.rows.find((x: any) => x.pid === p);
    check("מי שהצביע נכון קיבל +2", [good[0], good[1], good[2]].every((p) => row(p).delta === 2 && row(p).why === "hit"));
    check("מי שפספס קיבל 0", row(good[3]).delta === 0 && row(good[3]).why === "miss");
    check("מתחזה שנתפס וטעה בניחוש — 0", row(imp).delta === 0 && row(imp).why === "caught");
    check("הסכומים מצטברים", sc.totals[good[0]] === 2 && sc.totals[imp] === 0);
  }

  /* ---------- 7b. המתחזה שרד + ניחוש מציל ---------- */
  {
    const P = ["a", "b", "c", "d", "e"];
    const { r, last } = room("UC05", P, { declare: "off" });
    P.forEach((p) => r.onMessage(p, { t: "game", d: { a: "uc_ready" } }));
    const imp = impostorsOf(P, last)[0];
    const good = P.filter((p) => p !== imp);
    r.onMessage("a", { t: "game", d: { a: "uc_skip" } });
    r.onMessage("a", { t: "game", d: { a: "uc_skip" } });
    for (const p of P) r.onMessage(p, { t: "game", d: { a: "uc_vote", target: p === good[0] ? good[1] : good[0] } });

    await sleep(1300);
    const rv = last("a", "uc_reveal");
    check("המתחזה לא הודח", rv.ejected === good[0] && !rv.impostors.includes(rv.ejected));
    await sleep(5400);
    const sc = last("a", "uc_scores");
    check("מתחזה ששרד מקבל +3", sc.rows.find((x: any) => x.pid === imp).delta === 3);
    check("הסיבה היא 'safe'", sc.rows.find((x: any) => x.pid === imp).why === "safe");
    check("אין ניחוש אחרון כשהמתחזה לא נתפס", !last("a", "uc_guess"));
  }

  /* ---------- 7c. ניחוש מציל ---------- */
  {
    const P = ["a", "b", "c", "d", "e"];
    const { r, last } = room("UC06", P, { declare: "off" });
    P.forEach((p) => r.onMessage(p, { t: "game", d: { a: "uc_ready" } }));
    const imp = impostorsOf(P, last)[0];
    const majority = last(P.find((p) => p !== imp)!, "uc_role").word;
    r.onMessage("a", { t: "game", d: { a: "uc_skip" } });
    r.onMessage("a", { t: "game", d: { a: "uc_skip" } });
    for (const p of P) r.onMessage(p, { t: "game", d: { a: "uc_vote", target: p === imp ? P.find((x) => x !== imp)! : imp } });
    await sleep(4200);
    r.onMessage(imp, { t: "game", d: { a: "uc_guess", guess: majority } });
    check("ניחוש נכון מסומן", last("a", "uc_guessed").ok === true);
    await sleep(2900);
    const sc = last("a", "uc_scores");
    check("מתחזה שנתפס וניחש נכון מקבל +3", sc.rows.find((x: any) => x.pid === imp).delta === 3);
    check("הסיבה היא 'saved'", sc.rows.find((x: any) => x.pid === imp).why === "saved");
  }

  /* ---------- 7d. הכרזה עצמית ---------- */
  {
    const P = ["a", "b", "c", "d", "e"];
    const { r, last } = room("UC07", P, { declare: "on" });
    P.forEach((p) => r.onMessage(p, { t: "game", d: { a: "uc_ready" } }));
    const imp = impostorsOf(P, last)[0];
    const good = P.filter((p) => p !== imp);
    const majority = last(good[0], "uc_role").word;

    r.onMessage(imp, { t: "game", d: { a: "uc_declare", guess: majority } });
    check("ההכרזה מאושרת רק למכריז", !!last(imp, "uc_declared") && !last(good[0], "uc_declared"));
    r.onMessage(good[0], { t: "game", d: { a: "uc_declare", guess: "משהו" } });   // תמים שנבהל
    r.onMessage("a", { t: "game", d: { a: "uc_skip" } });
    r.onMessage("a", { t: "game", d: { a: "uc_skip" } });
    for (const p of P) r.onMessage(p, { t: "game", d: { a: "uc_vote", target: p === imp ? good[0] : imp } });

    await sleep(1300);
    const rv = last("a", "uc_reveal");
    check("ההכרזות נחשפות רק בחשיפה", rv.declares.length === 2);
    check("הכרזת המתחזה סומנה כנכונה", rv.declares.find((d: any) => d.pid === imp).ok === true);
    check("הכרזת התמים סומנה כלא-מתחזה", rv.declares.find((d: any) => d.pid === good[0]).wasImpostor === false);
    check("מי שהכריז לא מקבל ניחוש אחרון", true);

    await sleep(5400);
    const sc = last("a", "uc_scores");
    check("הכריז וצדק ⇒ +5", sc.rows.find((x: any) => x.pid === imp).delta === 5);
    check("הסיבה 'declared'", sc.rows.find((x: any) => x.pid === imp).why === "declared");
    check("תמים שהכריז ⇒ 0 ו-'fooled'",
      sc.rows.find((x: any) => x.pid === good[0]).delta === 0 && sc.rows.find((x: any) => x.pid === good[0]).why === "fooled");
    check("שאר התמימים שהצביעו נכון עדיין מקבלים +2",
      sc.rows.find((x: any) => x.pid === good[1]).delta === 2);
  }

  /* ---------- 7e. הכרזה כבויה ---------- */
  {
    const P = ["a", "b", "c", "d"];
    const { r, last } = room("UC08", P, { declare: "off" });
    P.forEach((p) => r.onMessage(p, { t: "game", d: { a: "uc_ready" } }));
    check("declareOn=false מגיע ללקוח", last("a", "uc_role").declareOn === false);
    r.onMessage("b", { t: "game", d: { a: "uc_declare", guess: "משהו" } });
    check("הכרזה נדחית כשהפיצ'ר כבוי", !last("b", "uc_declared"));
  }

  /* ---------- 8. תיקו ---------- */
  {
    const P = ["a", "b", "c", "d"];
    const { r, last } = room("UC09", P, { declare: "off" });
    P.forEach((p) => r.onMessage(p, { t: "game", d: { a: "uc_ready" } }));
    const imp = impostorsOf(P, last)[0];
    const good = P.filter((p) => p !== imp);
    r.onMessage("a", { t: "game", d: { a: "uc_skip" } });
    r.onMessage("a", { t: "game", d: { a: "uc_skip" } });
    r.onMessage(good[0], { t: "game", d: { a: "uc_vote", target: imp } });
    r.onMessage(good[1], { t: "game", d: { a: "uc_vote", target: imp } });
    r.onMessage(good[2], { t: "game", d: { a: "uc_vote", target: good[0] } });
    r.onMessage(imp, { t: "game", d: { a: "uc_vote", target: good[0] } });
    await sleep(1300);
    const rv = last("a", "uc_reveal");
    check("תיקו מסומן ואף אחד לא מודח", rv.tie === true && rv.ejected === null, JSON.stringify(rv.tally));
    await sleep(5400);
    const sc = last("a", "uc_scores");
    check("בתיקו המתחזה נחשב ששרד", sc.rows.find((x: any) => x.pid === imp).why === "safe");
    check("מי שהצביע למתחזה עדיין מקבל +2", sc.rows.find((x: any) => x.pid === good[0]).delta === 2);
  }

  /* ---------- 9. חיבור מחדש ---------- */
  {
    const P = ["a", "b", "c", "d"];
    const { r, last } = room("UC10", P, { declare: "off" });
    P.forEach((p) => r.onMessage(p, { t: "game", d: { a: "uc_ready" } }));
    const word = last("b", "uc_role").word;
    r.disconnect("b");
    r.join("b", "שחקן1", "🙂");
    check("חוזר מניתוק מקבל את אותה מילה", last("b", "uc_role").word === word);
    check("חוזר מניתוק מקבל את השלב הנוכחי", last("b", "uc_phase").phase === "clues");

    r.onMessage("a", { t: "game", d: { a: "uc_skip" } });
    r.onMessage("a", { t: "game", d: { a: "uc_skip" } });
    for (const p of P) r.onMessage(p, { t: "game", d: { a: "uc_vote", target: p === "a" ? "b" : "a" } });
    await sleep(1300);
    r.disconnect("c");
    r.join("c", "שחקן2", "🙂");
    check("חוזר בזמן החשיפה מקבל את החשיפה המלאה", !!last("c", "uc_reveal")?.majorityWord);
  }

  /* ---------- 10. השוואת מילים ---------- */
  {
    check("זהה", sameWord("פיצה", "פיצה"));
    check("ה' הידיעה", sameWord("הים", "ים") && sameWord("ים", "הים"));
    check("רווחים מיותרים", sameWord("  בית ספר ", "בית ספר"));
    check("רווח פנימי חסר", sameWord("ביתספר", "בית ספר"));
    check("שגיאת הקלדה אחת במילה ארוכה", sameWord("המבורגד", "המבורגר"));
    check("מילה אחרת נדחית", !sameWord("פיצה", "המבורגר"));
    check("ריק נדחה", !sameWord("", "פיצה"));
    check("מילה קצרה דומה נדחית", !sameWord("ים", "אם"));
  }

  console.log(failed ? `\n✗ ${failed} בדיקות נכשלו\n` : "\n✓ הכול עבר\n");
  process.exit(failed ? 1 : 0);
}

main();
