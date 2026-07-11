import { NextResponse } from "next/server";
import { splitCommission } from "@/lib/split";

/**
 * API לחישוב חלוקת עמלה — משמש גם לשקיפות מלאה מול המשתמשים:
 * GET /api/split?commission=2400&chain=5
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const commission = parseInt(url.searchParams.get("commission") || "0", 10);
  const chain = parseInt(url.searchParams.get("chain") || "0", 10);
  try {
    return NextResponse.json(splitCommission(commission, chain));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
