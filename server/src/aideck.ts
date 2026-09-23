/**
 * חפיסה אישית ✨ — יצירת חפיסת קלפים בהתאמה אישית עם LLM (בזמן ריצה, כמעט בחינם).
 *
 * העיקרון (ממסמך האיפיון): קריאת LLM אחת לחפיסה שלמה. שרשרת ספקים חינמיים:
 *   Gemini Flash-Lite (העברית הכי טובה בשכבת החינם) → Groq (Llama) כגיבוי.
 * המפתחות לעולם לא מגיעים ללקוח — הכול דרך הפרוקסי הזה.
 *
 * הפעלה: להגדיר ב-Render משתני סביבה GEMINI_API_KEY ו/או GROQ_API_KEY.
 * בלי מפתחות — ה-endpoint מחזיר 503 והלקוח פשוט לא מציג את האופציה כזמינה.
 */

import { LANG_NAMES, asLang, type Lang } from "../../shared/i18n";
import { spCleanKit, SP_KIT_MAX, type SpCustomMove } from "../../shared/spods";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export function aiDeckAvailable(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY);
}

/* ---------- מטמון + הגבלת קצב ---------- */
// אותו נושא = אותה חפיסה (מערבבים בצד המשחק ממילא) — חוסך קריאות וגם מגן מספאם
const cache = new Map<string, string[]>();
const CACHE_MAX = 300;

// הגבלת קצב פשוטה פר-IP: עד 6 חפיסות ב-10 דקות (ערב שלם לא צריך יותר)
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_MAX = 6;
const hits = new Map<string, number[]>();

function rateOk(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) { hits.set(ip, arr); return false; }
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 2000) hits.clear(); // הגנת זיכרון גסה — מספיק לפיילוט
  return true;
}

/* ---------- הפרומפט ---------- */
function buildPrompt(topic: string, lang: string): string {
  if (lang !== "he") {
    const name = LANG_NAMES[(asLang(lang) ?? "en") as Lang];
    return [
      `You are the helper of a party game ("Heads Up" / "Taboo" style) played by friends who speak ${name}.`,
      `The group asked for a deck of cards on the topic: "${topic}".`,
      `Create a list of 24 cards in ${name} related to the topic: people, characters, places, objects or concepts.`,
      `Important rules:`,
      `- Each card is short: one to four words.`,
      `- Well-known things most of the group will recognize, not niche concepts.`,
      `- Suitable for guessing with yes/no questions and for describing in words.`,
      `- No duplicates, no numbering, no explanations.`,
      `- Keep a fun tone, suitable for all ages.`,
      `Return ONLY a JSON array of strings, no other text. Example: ["card one","card two"]`,
    ].join("\n");
  }
  return [
    `אתה עוזר של משחק חברה ישראלי ("על המצח" / "על הלשון").`,
    `החבורה ביקשה חפיסת קלפים בנושא: "${topic}".`,
    `צור רשימה של 24 קלפים בעברית שקשורים לנושא: אנשים, דמויות, מקומות, חפצים או מושגים.`,
    `כללים חשובים:`,
    `- כל קלף קצר: מילה אחת עד ארבע מילים.`,
    `- דברים מוכרים שרוב החבורה תזהה, לא מושגים נישתיים מדי.`,
    `- מתאים לניחוש בשאלות כן/לא ולתיאור במילים.`,
    `- בלי כפילויות, בלי מספור, בלי הסברים.`,
    `- שמור על טון כיפי ומתאים לכל הגילאים.`,
    `החזר אך ורק מערך JSON של מחרוזות, בלי שום טקסט נוסף. דוגמה: ["קלף אחד","קלף שני"]`,
  ].join("\n");
}

/* ---------- פענוח תשובה ---------- */
function parseCards(text: string): string[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let arr: unknown;
  try { arr = JSON.parse(text.slice(start, end + 1)); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const cards: string[] = [];
  for (const c of arr) {
    if (typeof c !== "string") continue;
    const t = c.trim().replace(/^[-•\d.]+\s*/, "").slice(0, 40);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    cards.push(t);
  }
  return cards;
}

/* ---------- ספקים ---------- */
async function askGemini(prompt: string, maxTokens = 1200): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no gemini key");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: maxTokens },
      }),
      signal: AbortSignal.timeout(maxTokens > 2000 ? 60_000 : 20_000),
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

async function askGroq(prompt: string, maxTokens = 1200): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("no groq key");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(maxTokens > 2000 ? 60_000 : 20_000),
  });
  if (!res.ok) throw new Error(`groq ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * שאילתה גנרית למודל — Gemini ואם הוא נופל אז Groq.
 * חשוף כדי שמפעל השאלות ישתמש באותם מפתחות ובאותה נפילה, במקום לשכפל.
 */
export async function askModel(prompt: string, maxTokens = 1200): Promise<string> {
  try { return await askGemini(prompt, maxTokens); }
  catch { return await askGroq(prompt, maxTokens); }
}

/* ---------- ה-API ---------- */
/** `error` הוא מפתח תרגום (deck.err.*) — הלקוח מציג אותו בשפה שלו */
export interface AiDeckResult {
  status: number;
  body: { name: string; cards: string[] } | { error: string };
}

export async function generateAiDeck(rawTopic: string, ip: string, lang = "he"): Promise<AiDeckResult> {
  const topic = rawTopic.trim().replace(/\s+/g, " ").slice(0, 60);
  if (topic.length < 2) return { status: 400, body: { error: "deck.err.short" } };
  if (!aiDeckAvailable()) return { status: 503, body: { error: "deck.err.off" } };

  const cacheKey = `${lang}:${topic.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return { status: 200, body: { name: topic, cards: cached } };

  if (!rateOk(ip)) return { status: 429, body: { error: "deck.err.rate" } };

  const prompt = buildPrompt(topic, lang);
  let cards: string[] = [];
  for (const provider of [askGemini, askGroq]) {
    try {
      cards = parseCards(await provider(prompt));
      if (cards.length >= 10) break;
    } catch { /* עוברים לספק הבא */ }
  }
  if (cards.length < 10) return { status: 502, body: { error: "deck.err.confused" } };

  cards = cards.slice(0, 30);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, cards);
  return { status: 200, body: { name: topic, cards } };
}

/* ---------- ✨ בונה האימון של ספורט-פודים (תחנות אש) ---------- */
/**
 * המאמן כותב טקסט חופשי ("אימון 5 דקות ל-3 ילדים בני 7–10 בחצר") ומקבל 6–10 תרגילים לפודים:
 * שם קצר + הנחיה של שורה, בשפת החדר. אותו מטמון/הגבלת קצב/ספקים של החפיסה האישית — אין צורך במפתח נוסף.
 * השגיאות הן מפתחות deck.err.* (הלקוח מתרגם).
 */
export interface SpKitResult { status: number; body: { moves: SpCustomMove[] } | { error: string } }
const kitCache = new Map<string, SpCustomMove[]>();

function buildKitPrompt(topic: string, lang: string): string {
  const name = lang === "he" ? "Hebrew" : LANG_NAMES[(asLang(lang) ?? "en") as Lang];
  return [
    `You are a kids' fitness coach. Phones are placed around a yard as light-up "pods"; each pod lights up with an exercise, the kid does it, touches the pod, and runs to the next one.`,
    `The coach asked for: "${topic}".`,
    `Create 8 exercise stations in ${name} that fit the request (age, duration, place, equipment). Bodyweight only unless the request names equipment. Safe, fun, doable on grass or a floor, no jumping from heights.`,
    `Each station: "ic" = one emoji, "txt" = the exercise in 2-5 words with a count or seconds (e.g. "10 squats", "Plank 20 s"), "sub" = one short coaching cue (max 8 words).`,
    `Return ONLY a JSON array of objects {"ic","txt","sub"}, no other text.`,
  ].join("\n");
}
function parseKit(raw: string): SpCustomMove[] {
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { return spCleanKit(JSON.parse(m[0])); } catch { return []; }
}
export async function generateSpKit(rawTopic: string, ip: string, lang = "he"): Promise<SpKitResult> {
  const topic = rawTopic.trim().replace(/\s+/g, " ").slice(0, 120);
  if (topic.length < 3) return { status: 400, body: { error: "deck.err.short" } };
  if (!aiDeckAvailable()) return { status: 503, body: { error: "deck.err.off" } };
  const key = `${lang}:${topic.toLowerCase()}`;
  const cached = kitCache.get(key);
  if (cached) return { status: 200, body: { moves: cached } };
  if (!rateOk(ip)) return { status: 429, body: { error: "deck.err.rate" } };
  const prompt = buildKitPrompt(topic, lang);
  let moves: SpCustomMove[] = [];
  for (const provider of [askGemini, askGroq]) {
    try { moves = parseKit(await provider(prompt, 900)); if (moves.length >= 4) break; } catch { /* הספק הבא */ }
  }
  if (moves.length < 4) return { status: 502, body: { error: "deck.err.confused" } };
  moves = moves.slice(0, SP_KIT_MAX);
  if (kitCache.size >= CACHE_MAX) kitCache.delete(kitCache.keys().next().value!);
  kitCache.set(key, moves);
  return { status: 200, body: { moves } };
}
