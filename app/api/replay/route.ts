import { NextResponse } from "next/server";
import { dailyBars, nyDate } from "@/lib/alpaca";
import { authorized } from "@/lib/auth";
import { riskSettings, WATCHLIST } from "@/lib/config";
import { align, replayFund, replayPortfolio, summarize, type Trade } from "@/lib/replay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const COST_PCT_PER_SIDE = 0.1;
const START = "2016-01-01";

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const today = nyDate(new Date());
    const bars = await dailyBars([...WATCHLIST.flatMap((w) => [w.underlying, w.fund])], START, today);
    const rows = Object.fromEntries(WATCHLIST.map((w) => [w.fund, align(bars[w.underlying] ?? [], bars[w.fund] ?? [])]));
    const stop = riskSettings().stopLossPct;
    const opt = (stopLossPct: number | null) => ({ stopLossPct, costPctPerSide: COST_PCT_PER_SIDE });

    const perFund = Object.fromEntries(WATCHLIST.map((w) => [w.fund, replayFund(w.fund, rows[w.fund], opt(stop))]));
    const all: Trade[] = Object.values(perFund).flat();
    const byRule = (r: Trade["entryRule"]) => summarize(all.filter((t) => t.entryRule === r));
    const portfolio = replayPortfolio(rows, opt(stop));

    return NextResponse.json({
      period: { from: rows[WATCHLIST[0].fund][200]?.date ?? START, to: rows[WATCHLIST[0].fund].at(-1)?.date },
      assumptions: [
        "Current rules exactly as live, no tuning; signals on the underlying's daily close (live uses 3:40 PM).",
        "Buys and rule-based sells fill at the 3x fund's close that day.",
        `Stop is a GTC sell stop ${stop}% below entry: fills at the stop, or at the open on a gap below it.`,
        `Cost ${COST_PCT_PER_SIDE}% per side for spread and slippage. No caution-flag halving (no historical news).`,
        "Past results don't predict future ones; this checks whether the rules' payoff shape is plausible.",
      ],
      stopLossPct: stop,
      portfolio: summarize(portfolio),
      perFund: Object.fromEntries(Object.entries(perFund).map(([f, t]) => [f, summarize(t)])),
      byEntryRule: { RSI2: byRule("RSI2"), DOUBLE7: byRule("DOUBLE7"), BOTH: byRule("BOTH") },
      stopComparison: Object.fromEntries(
        [...new Set([10, stop, 30]), null].map((s) => [s === null ? "none" : `${s}%`, summarize(replayPortfolio(rows, opt(s)))]),
      ),
      recentTrades: portfolio.slice(-15).reverse(),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
