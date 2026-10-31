import { NextResponse } from "next/server";
import { dailyCloses, latestPrices, marketClock, nyDate } from "@/lib/alpaca";
import { riskSettings, RULES, WATCHLIST } from "@/lib/config";
import { authorized } from "@/lib/auth";
import { evaluatePosition, sessionsSince } from "@/lib/positions";
import { planOrders } from "@/lib/risk";
import { loadPositions, storeConfigured } from "@/lib/store";
import { evaluate } from "@/lib/signals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const now = new Date();
    const today = nyDate(now);
    const clock = await marketClock();

    const underlyings = WATCHLIST.map((w) => w.underlying);
    const funds = WATCHLIST.map((w) => w.fund);
    const [history, live, positions] = await Promise.all([
      dailyCloses(underlyings, today),
      latestPrices([...underlyings, ...funds]),
      loadPositions().catch(() => null),
    ]);
    const sessionDates: Record<string, string[]> = {};

    const risk = riskSettings();
    const evaluated = WATCHLIST.map((w) => {
      const bars = history[w.underlying] ?? [];
      const liveQuote = live[w.underlying];
      if (!liveQuote || bars.length < RULES.trendSma) {
        return { ...w, error: `not enough data (${bars.length} bars, live=${liveQuote?.price ?? "none"})` };
      }
      // On weekends and holidays the latest trade belongs to the last completed bar, so
      // re-evaluate that session instead of appending a duplicate close.
      const lastBarDate = nyDate(new Date(bars[bars.length - 1].t));
      sessionDates[w.fund] = [
        ...bars.map((b) => nyDate(new Date(b.t))),
        ...(liveQuote.date > lastBarDate ? [liveQuote.date] : []),
      ];
      const closes =
        liveQuote.date > lastBarDate
          ? [...bars.map((b) => b.c), liveQuote.price]
          : bars.map((b) => b.c);
      return { ...w, fundPrice: live[w.fund]?.price ?? null, signal: evaluate(closes) };
    });

    // Open positions you logged: day N of 7, P/L, and whether any exit rule says sell today.
    const held = (positions ?? [])
      .filter((p) => !p.closedDate)
      .map((p) => {
        const r = evaluated.find((e) => e.fund === p.fund);
        if (!r || !("signal" in r) || !r.fundPrice) {
          return { id: p.id, fund: p.fund, error: "fund not in watchlist or no live price" };
        }
        return evaluatePosition(p, {
          price: r.fundPrice,
          day: sessionsSince(p.entryDate, sessionDates[p.fund] ?? []),
          rsi2Exit: r.signal.rsi2Exit,
          double7Exit: r.signal.double7Exit,
        });
      });
    const sellToday = held.filter((h) => "action" in h && h.action === "SELL_TODAY");

    // Capital still tied up in positions you keep holding counts against the shared cap.
    const capInUse = (positions ?? [])
      .filter((p) => !p.closedDate && !sellToday.some((h) => h.id === p.id))
      .reduce((t, p) => t + p.entryPrice * p.shares, 0);
    const capRemainingUsd = Math.max(0, Math.round(risk.totalCapUsd - capInUse));

    // Risk layer: rank the buys, size each by volatility, recommend only the top one
    // because all signals share one capital cap.
    const plan = planOrders(
      evaluated.flatMap((r) =>
        "signal" in r && r.signal.action === "BUY" && r.fundPrice
          ? [{ fund: r.fund, fundPrice: r.fundPrice, rsi2: r.signal.rsi2,
               pctFromSma200: r.signal.pctFromSma200, dailyVolPct: r.signal.dailyVolPct }]
          : [],
      ),
      { ...risk, totalCapUsd: capRemainingUsd },
    );
    const results = evaluated.map((r) => {
      if (!("signal" in r)) return r;
      const o = plan.get(r.fund);
      return {
        ...r,
        order: o
          ? {
              ...o,
              instructions:
                `Buy ${o.fullShares} ${r.fund}, limit $${o.suggestedLimit.toFixed(2)}, day order, placed 3:45-3:55 PM ET. ` +
                `Once filled, place a sell stop (GTC) at $${o.stopPrice.toFixed(2)} for the same ${o.fullShares} shares (-25% disaster stop).`,
            }
          : null,
      };
    });

    const topPick = [...plan.entries()].find(([, o]) => o.recommended)?.[0] ?? null;

    const buys = results.filter((r) => "signal" in r && r.signal.action === "BUY");
    const exits = results.filter((r) => "signal" in r && r.signal.action === "EXIT_IF_HOLDING");
    const errors = results.filter((r) => "error" in r);

    const subject = !clock.is_open
      ? `Market closed today (${today})`
      : sellToday.length
        ? `SELL ${sellToday.map((h) => h.fund).join(", ")}${buys.length ? ` · BUY ${topPick}` : ""} (${today})`
        : buys.length
        ? `BUY ${topPick}${buys.length > 1 ? ` (top pick of ${buys.length})` : ""} (${today})`
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
      topPick,
      appUrl: new URL(req.url).origin,
      positions: held,
      positionsEnabled: storeConfigured(),
      capInUseUsd: Math.round(capInUse),
      capRemainingUsd,
      sellTodayCount: sellToday.length,
      risk: {
        ...risk,
        description:
          `One trade at a time, up to $${risk.totalCapUsd.toLocaleString("en-US")} total. Size is set so a typical ` +
          `day's move in the 3x fund is about $${risk.riskPerDayUsd.toLocaleString("en-US")}. When several funds ` +
          "signal, the top pick is the most oversold (lowest RSI(2)); the others are alternatives, not extra trades.",
      },
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
