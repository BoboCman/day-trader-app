import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dailyCloses, latestPrices, marketClock, nyDate } from "@/lib/alpaca";
import { positionSize, RULES, WATCHLIST } from "@/lib/config";
import { evaluate } from "@/lib/signals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(req: Request): boolean {
  const expected = process.env.SIGNALS_API_KEY;
  if (!expected) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const now = new Date();
    const today = nyDate(now);
    const clock = await marketClock();

    const underlyings = WATCHLIST.map((w) => w.underlying);
    const funds = WATCHLIST.map((w) => w.fund);
    const [history, live] = await Promise.all([
      dailyCloses(underlyings, today),
      latestPrices([...underlyings, ...funds]),
    ]);

    const size = positionSize();
    const results = WATCHLIST.map((w) => {
      const bars = history[w.underlying] ?? [];
      const liveQuote = live[w.underlying];
      if (!liveQuote || bars.length < RULES.trendSma) {
        return { ...w, error: `not enough data (${bars.length} bars, live=${liveQuote?.price ?? "none"})` };
      }
      // On weekends and holidays the latest trade belongs to the last completed bar, so
      // re-evaluate that session instead of appending a duplicate close.
      const lastBarDate = nyDate(new Date(bars[bars.length - 1].t));
      const closes =
        liveQuote.date > lastBarDate
          ? [...bars.map((b) => b.c), liveQuote.price]
          : bars.map((b) => b.c);
      const sig = evaluate(closes);
      const fundPrice = live[w.fund]?.price;
      const order =
        sig.action === "BUY" && fundPrice
          ? {
              fundPrice,
              suggestedLimit: Math.round(fundPrice * 1.005 * 100) / 100,
              fullShares: Math.floor(size / fundPrice),
              halfShares: Math.floor(size / 2 / fundPrice),
              positionSizeUsd: size,
            }
          : null;
      return { ...w, fundPrice: fundPrice ?? null, signal: sig, order };
    });

    const buys = results.filter((r) => "signal" in r && r.signal.action === "BUY");
    const exits = results.filter((r) => "signal" in r && r.signal.action === "EXIT_IF_HOLDING");
    const errors = results.filter((r) => "error" in r);

    const subject = !clock.is_open
      ? `Market closed today (${today})`
      : buys.length
        ? `BUY signal: ${buys.map((b) => b.fund).join(", ")} (${today})`
        : `No buy signals today (${today})`;

    const summary = results
      .map((r) =>
        "error" in r
          ? `${r.fund}: data error, ${r.error}`
          : `${r.fund} (${r.underlying} ${r.signal.price}, ${r.signal.dayChangePct}% today, ` +
            `${r.signal.pctFromSma200}% vs 200d, RSI2 ${r.signal.rsi2}): ${r.signal.action}` +
            (r.signal.reasons.length ? `. ${r.signal.reasons.join("; ")}` : ""),
      )
      .join("\n");

    return NextResponse.json({
      asOf: now.toISOString(),
      date: today,
      marketOpen: clock.is_open,
      nextClose: clock.next_close,
      anyBuy: buys.length > 0,
      buyCount: buys.length,
      exitCount: exits.length,
      errorCount: errors.length,
      subject,
      summary,
      rules: {
        ...RULES,
        description:
          "Signals use the unleveraged underlying. Buy only if price is above its 200-day average and " +
          "either RSI(2) < 10 or price is at a 7-day closing low. Exits: RSI(2) trade exits on a close " +
          "above the 5-day average; Double 7s exits at a 7-day closing high; either way, exit after 7 " +
          "sessions or if the fund is down 25% from entry.",
      },
      results,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
