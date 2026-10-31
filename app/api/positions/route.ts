import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { riskSettings, WATCHLIST } from "@/lib/config";
import type { Position } from "@/lib/positions";
import { loadPositions, savePositions, storeConfigured } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FUNDS: readonly string[] = WATCHLIST.map((w) => w.fund);
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isPos = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!storeConfigured()) return NextResponse.json({ configured: false, positions: [] });
  return NextResponse.json({ configured: true, stopLossPct: riskSettings().stopLossPct, positions: await loadPositions() });
}

/**
 * Body: {action:"open", fund, entryDate, entryPrice, shares}
 *     | {action:"close", id, closedDate, exitPrice}
 *     | {action:"delete", id}
 */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!storeConfigured()) return NextResponse.json({ error: "storage not set up" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const list = await loadPositions();

  if (b.action === "open") {
    if (typeof b.fund !== "string" || !FUNDS.includes(b.fund) || !isDate(b.entryDate) || !isPos(b.entryPrice) || !isPos(b.shares)) {
      return NextResponse.json({ error: `need fund (${FUNDS.join("/")}), entryDate YYYY-MM-DD, entryPrice, shares` }, { status: 400 });
    }
    const p: Position = { id: randomUUID(), fund: b.fund, entryDate: b.entryDate, entryPrice: b.entryPrice, shares: Math.floor(b.shares) };
    list.push(p);
  } else if (b.action === "close") {
    const p = list.find((x) => x.id === b.id);
    if (!p || !isDate(b.closedDate) || !isPos(b.exitPrice)) {
      return NextResponse.json({ error: "need a valid id, closedDate and exitPrice" }, { status: 400 });
    }
    p.closedDate = b.closedDate;
    p.exitPrice = b.exitPrice;
  } else if (b.action === "delete") {
    const i = list.findIndex((x) => x.id === b.id);
    if (i < 0) return NextResponse.json({ error: "not found" }, { status: 404 });
    list.splice(i, 1);
  } else {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  await savePositions(list);
  return NextResponse.json({ ok: true, positions: list });
}
