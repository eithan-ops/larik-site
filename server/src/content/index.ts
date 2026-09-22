/** תוכן לפי שפת החדר — נופל לאנגלית לשפה לא מוכרת, ולעברית כשאין אנגלית (לא אמור לקרות) */
import type { Lang } from "../../../shared/i18n";
import type { LangContent } from "./types";
import { he } from "./he";
import { en } from "./en";
import { es } from "./es";
import { pt } from "./pt";
import { ko } from "./ko";
import { ja } from "./ja";
import { ar } from "./ar";

export type { LangContent, TriviaQ, TriviaCat, UcPair, DeckKey, DeckDef } from "./types";

const ALL: Record<Lang, LangContent> = { he, en, es, pt, ko, ja, ar };

export function contentFor(lang: string | undefined): LangContent {
  return ALL[(lang ?? "he") as Lang] ?? ALL.en;
}
export const CONTENT_LANGS = Object.keys(ALL) as Lang[];
