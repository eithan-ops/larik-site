/**
 * LARIK — שכבת אחסון מינימלית (מפתח → JSON).
 *
 * למה קיים: לשרת אין שום דבר שורד. החדרים בזיכרון, ו-`larik-stats.json`
 * נמחק בכל deploy או הרדמה של Render. "החבורה שלנו" ורצף ימים בסולו
 * מחייבים משהו שחי בין הפעלות.
 *
 * ארבעה מימושים מאחורי אותו ממשק, נבחרים לפי משתני הסביבה שקיימים:
 *   - **Supabase**  — SUPABASE_URL + SUPABASE_SERVICE_KEY   (טבלת kv דרך PostgREST)
 *   - **Upstash**   — UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *                    (או KV_REST_API_URL + KV_REST_API_TOKEN — כך וורסל מייצר אותם)
 *   - **libSQL/Turso** — LIBSQL_URL + LIBSQL_TOKEN
 *   - **זיכרון** אם אין אף אחד — כדי שהפיצ'ר יעבוד מיד בפיתוח ובבדיקות,
 *     וגם בפרודקשן לפני שהמפתחות הודבקו (מתנהג נכון, פשוט לא שורד ריסטארט).
 *
 * כולם מדברים HTTP דרך fetch — בלי אף תלות npm נוספת, וזה מה ששומר על
 * ההתקנה של השרת ריקה כמעט לגמרי ועל הבחירה הפיכה.
 *
 * ל-Supabase צריך ליצור את הטבלה פעם אחת ב-SQL Editor:
 *   create table if not exists kv (
 *     k text primary key, v jsonb not null, updated_at bigint not null);
 *   alter table kv enable row level security;   -- service key עוקף, הדפדפן לא ייגע
 */

export type StoreKind = "supabase" | "upstash" | "libsql" | "memory";

export interface Store {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T): Promise<void>;
  /** כל המפתחות שמתחילים בקידומת — לעמודי סטטוס ולתחזוקה, לא לנתיב חם */
  list(prefix: string, limit?: number): Promise<string[]>;
  readonly kind: StoreKind;
}

/* ---------- זיכרון ---------- */

class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private map = new Map<string, string>();
  async get<T>(key: string): Promise<T | null> {
    const raw = this.map.get(key);
    return raw === undefined ? null : (JSON.parse(raw) as T);
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.map.set(key, JSON.stringify(value));
  }
  async list(prefix: string, limit = 100): Promise<string[]> {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix)).sort().slice(0, limit);
  }
}

/* ---------- libSQL (Turso) ---------- */

interface LibsqlResult {
  results?: { type: string; response?: { result?: { rows?: { value: string }[][] } }; error?: { message: string } }[];
}

class LibsqlStore implements Store {
  readonly kind = "libsql" as const;
  private url: string;
  private token: string;
  private ready: Promise<void>;

  constructor(url: string, token: string) {
    // מקבלים גם libsql:// וגם https:// — הראשון הוא מה ש-Turso מציג בממשק
    this.url = url.replace(/^libsql:\/\//, "https://").replace(/\/+$/, "") + "/v2/pipeline";
    this.token = token;
    this.ready = this.exec(
      "CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER NOT NULL)"
    ).then(() => undefined);
  }

  private async exec(sql: string, args: string[] = []): Promise<LibsqlResult> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql, args: args.map((value) => ({ type: "text", value })) } },
          { type: "close" },
        ],
      }),
    });
    if (!res.ok) throw new Error(`libsql ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as LibsqlResult;
    const err = body.results?.find((r) => r.error)?.error;
    if (err) throw new Error(`libsql: ${err.message}`);
    return body;
  }

  private rows(body: LibsqlResult): string[][] {
    const raw = body.results?.[0]?.response?.result?.rows ?? [];
    return raw.map((row) => row.map((cell) => cell?.value ?? ""));
  }

  async get<T>(key: string): Promise<T | null> {
    await this.ready;
    const rows = this.rows(await this.exec("SELECT v FROM kv WHERE k = ?", [key]));
    if (!rows.length) return null;
    try { return JSON.parse(rows[0][0]) as T; } catch { return null; }
  }

  async put<T>(key: string, value: T): Promise<void> {
    await this.ready;
    await this.exec(
      "INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at",
      [key, JSON.stringify(value), String(Date.now())]
    );
  }

  async list(prefix: string, limit = 100): Promise<string[]> {
    await this.ready;
    const rows = this.rows(await this.exec("SELECT k FROM kv WHERE k LIKE ? ORDER BY k LIMIT ?", [prefix + "%", String(limit)]));
    return rows.map((r) => r[0]);
  }
}

/* ---------- Supabase (PostgREST) ---------- */

class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  private base: string;
  private headers: Record<string, string>;

  constructor(url: string, serviceKey: string) {
    this.base = url.replace(/\/+$/, "") + "/rest/v1/kv";
    this.headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };
  }

  async get<T>(key: string): Promise<T | null> {
    const res = await fetch(`${this.base}?k=eq.${encodeURIComponent(key)}&select=v`, { headers: this.headers });
    if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
    const rows = (await res.json()) as { v: T }[];
    return rows.length ? rows[0].v : null;
  }

  async put<T>(key: string, value: T): Promise<void> {
    const res = await fetch(this.base, {
      method: "POST",
      headers: { ...this.headers, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([{ k: key, v: value, updated_at: Date.now() }]),
    });
    if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
  }

  async list(prefix: string, limit = 100): Promise<string[]> {
    const res = await fetch(
      `${this.base}?k=like.${encodeURIComponent(prefix + "*")}&select=k&order=k&limit=${limit}`,
      { headers: this.headers }
    );
    if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
    return ((await res.json()) as { k: string }[]).map((r) => r.k);
  }
}

/* ---------- Upstash Redis (REST) ---------- */

class UpstashStore implements Store {
  readonly kind = "upstash" as const;
  private url: string;
  private token: string;

  constructor(url: string, token: string) {
    this.url = url.replace(/\/+$/, "");
    this.token = token;
  }

  private async cmd<T>(args: (string | number)[]): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`upstash ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { result?: T; error?: string };
    if (body.error) throw new Error(`upstash: ${body.error}`);
    return body.result as T;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.cmd<string | null>(["GET", key]);
    if (raw === null || raw === undefined) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }

  async put<T>(key: string, value: T): Promise<void> {
    await this.cmd(["SET", key, JSON.stringify(value)]);
  }

  async list(prefix: string, limit = 100): Promise<string[]> {
    // SCAN ולא KEYS — KEYS חוסם את השרת, וזה לא מחיר שכדאי לשלם על עמוד סטטוס
    const [, keys] = await this.cmd<[string, string[]]>(["SCAN", 0, "MATCH", prefix + "*", "COUNT", limit]);
    return (keys ?? []).sort().slice(0, limit);
  }
}

/* ---------- עטיפה עמידה ---------- */

/**
 * מסד שנופל לא מפיל ערב משחקים.
 * כתיבה שנכשלת נבלעת (ומדווחת ללוג), קריאה שנכשלת מחזירה null,
 * ובשני המקרים העותק בזיכרון ממשיך לשרת את הערב הנוכחי.
 */
class ResilientStore implements Store {
  readonly kind: StoreKind;
  private primary: Store;
  private cache = new MemoryStore();
  private failures = 0;

  constructor(primary: Store) {
    this.primary = primary;
    this.kind = primary.kind;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const v = await this.primary.get<T>(key);
      if (v !== null) await this.cache.put(key, v);
      return v ?? (await this.cache.get<T>(key));
    } catch (e) {
      this.note(e);
      return this.cache.get<T>(key);
    }
  }

  async put<T>(key: string, value: T): Promise<void> {
    await this.cache.put(key, value);
    try { await this.primary.put(key, value); } catch (e) { this.note(e); }
  }

  async list(prefix: string, limit = 100): Promise<string[]> {
    try { return await this.primary.list(prefix, limit); } catch (e) { this.note(e); return this.cache.list(prefix, limit); }
  }

  private note(e: unknown) {
    // מדווחים על העשר הראשונות בלבד — שרת שאיבד מסד לא צריך להציף את הלוג
    if (this.failures++ < 10) console.warn("[store] נפילה, ממשיכים מהזיכרון:", (e as Error).message);
  }
}

/**
 * וורסל מייצר את המשתנים של Upstash בשמות `KV_*` ולא בשמות של Upstash עצמה,
 * ומי שמדביק אותם כמו שהם היה מגלה שרת שממשיך לרוץ מהזיכרון בלי להתלונן.
 * מקבלים את שתי הצורות.
 *
 * ⚠️ במפורש *לא* KV_REST_API_READ_ONLY_TOKEN — הוא לקריאה בלבד,
 * וכל כתיבה של חבורה או שאלה חדשה הייתה נכשלת בשקט.
 */
function upstashUrl(env: NodeJS.ProcessEnv): string | undefined {
  return env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
}

function upstashToken(env: NodeJS.ProcessEnv): string | undefined {
  return env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
}

let instance: Store | null = null;

/**
 * בוחר מימוש לפי מה שמוגדר בסביבה. הסדר הוא סדר העדפה, לא סדר איכות —
 * מי שהגדיר שניים כנראה מהגר, ואז הראשון ברשימה הוא היעד.
 */
export function getStore(): Store {
  if (instance) return instance;
  const env = process.env;
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    console.log("[store] Supabase מחובר");
    instance = new ResilientStore(new SupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY));
  } else if (upstashUrl(env) && upstashToken(env)) {
    console.log("[store] Upstash מחובר");
    instance = new ResilientStore(new UpstashStore(upstashUrl(env)!, upstashToken(env)!));
  } else if (env.LIBSQL_URL && env.LIBSQL_TOKEN) {
    console.log("[store] libSQL מחובר");
    instance = new ResilientStore(new LibsqlStore(env.LIBSQL_URL, env.LIBSQL_TOKEN));
  } else {
    console.log("[store] אין מסד מוגדר — אחסון בזיכרון (לא שורד ריסטארט)");
    instance = new ResilientStore(new MemoryStore());
  }
  return instance;
}

/** לבדיקות: אחסון נקי בלי לגעת בסביבה */
export function makeMemoryStore(): Store {
  return new ResilientStore(new MemoryStore());
}

/** לבדיקות: אחסון שתמיד נכשל, כדי לוודא שהמוצר שורד מסד מת */
export function makeBrokenStore(): Store {
  const broken: Store = {
    kind: "libsql",
    async get() { throw new Error("מסד נפל"); },
    async put() { throw new Error("מסד נפל"); },
    async list() { throw new Error("מסד נפל"); },
  };
  return new ResilientStore(broken);
}
