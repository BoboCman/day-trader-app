import { NextResponse } from "next/server";
import { dailyCloses, latestPrices, marketClock, nyDate, recentNews, type NewsItem } from "@/lib/alpaca";
import { FEAR_PROXY, riskSettings, RULES, TOP_HOLDINGS, WATCHLIST } from "@/lib/config";
import { breadth, cautionFor, fearGauge, newsFlags, upcomingEvents } from "@/lib/context";
import { authorized } from "@/lib/auth";
import { evaluatePosition, sessionsSince } from "@/lib/positions";
import { planOrders } from "@/lib/risk";
import { loadPositions, storeConfigured } from "@/lib/store";
import { evaluate } from "@/lib/signals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Bar = { t: string; c: number };
type Quote = { price: number; date: string } | undefined;

/** Closes with today's live price appended, unless the live trade belongs to the last bar (weekends, holidays). */
function withLive(bars: Bar[], q: Quote): { closes: number[]; dates: string[] } {
  const dates = bars.map((b) => nyDate(new Date(b.t)));
  const closes = bars.map((b) => b.c);
  if (q && (!dates.length || q.date > dates[dates.length - 1])) {
    closes.push(q.price);
    dates.push(q.date);
  }
  return { closes, dates };
}

const pct = (closes: number[]) =>
  closes.length >= 2 ? (closes[closes.length - 1] / closes[closes.length - 2] - 1) * 100 : null;

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const now = new Date();
    const today = nyDate(now);
    const clock = await marketClock();

    const underlyings = WATCHLIST.map((w) => w.underlying);
    const funds = WATCHLIST.map((w) => w.fund);
    const holdings = [...new Set(Object.values(TOP_HOLDINGS).flat())];
    // Context data is best-effort: a failure there must never block the core signals.
    const [history, live, positions, holdingBars, holdingLive, news] = await Promise.all([
      dailyCloses([...underlyings, FEAR_PROXY], today),
      latestPrices([...underlyings, ...funds, FEAR_PROXY]),
      loadPositions().catch(() => null),
      dailyCloses(holdings, today, 10).catch(() => ({}) as Record<string, Bar[]>),
      latestPrices(holdings).catch(() => ({}) as Record<string, { price: number; date: string }>),
      recentNews([...holdings, ...underlyings, ...funds]).catch(() => [] as NewsItem[]),
    ]);

    const fear = fearGauge(FEAR_PROXY, withLive(history[FEAR_PROXY] ?? [], live[FEAR_PROXY]).closes);
    const events = upcomingEvents(today);
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
      const { closes, dates } = withLive(bars, liveQuote);
      sessionDates[w.fund] = dates;
      const signal = evaluate(closes);

      // Look-through: did the top holdings fall together, or did a few names drive the move?
      const top = TOP_HOLDINGS[w.underlying] ?? [];
      const changes: Record<string, number> = {};
      for (const sym of top) {
        const c = pct(withLive(holdingBars[sym] ?? [], holdingLive[sym]).closes);
        if (c !== null) changes[sym] = c;
      }
      const b = breadth(changes, signal.dayChangePct);
      const flags = newsFlags(news, [...top, w.underlying, w.fund]);
      const caution = cautionFor({ fear, breadth: b, news: flags, events });
      return { ...w, fundPrice: live[w.fund]?.price ?? null, signal, context: { breadth: b, news: flags, caution } };
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
               pctFromSma200: r.signal.pctFromSma200, dailyVolPct: r.signal.dailyVolPct,
               sizeMultiplier: r.context.caution.sizeMultiplier }]
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
              cautioned: r.context.caution.sizeMultiplier < 1,
              instructions:
                `Buy ${o.fullShares} ${r.fund}, limit $${o.suggestedLimit.toFixed(2)}, day order, placed 3:45-3:55 PM ET. ` +
                `Once filled, place a sell stop (GTC) at $${o.stopPrice.toFixed(2)} for the same ${o.fullShares} shares (${o.stopLossPct}% stop).`,
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
            (r.signal.reasons.length ? `. ${r.signal.reasons.join("; ")}` : "") +
            (r.context.caution.reasons.length ? `. Caution (half size): ${r.context.caution.reasons.join("; ")}` : ""),
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
      context: {
        fear,
        events,
        description:
          "Caution flags halve the suggested size: fear gauge spiking, a narrow drop driven by a few top " +
          "holdings, a single-stock shock (top holding down 8%+), stock-specific news, or a Fed meeting or " +
          "jobs report within 3 days. Top-holdings lists are approximate.",
      },
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
          `sessions or if the fund is down ${risk.stopLossPct}% from entry.`,
      },
      results,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
