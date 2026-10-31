import { describe, expect, it } from "vitest";
import { avgAbsChangePct } from "../lib/indicators";
import { planOrders, rankBuys, sizeOrder } from "../lib/risk";

const s = { totalCapUsd: 25_000, riskPerDayUsd: 1_000, leverage: 3 };

describe("avgAbsChangePct", () => {
  it("averages absolute daily moves", () => {
    // +10%, -10% -> 10%
    expect(avgAbsChangePct([100, 110, 99], 2)).toBeCloseTo(10, 6);
  });
});

describe("risk layer", () => {
  const tecl = { fund: "TECL", fundPrice: 172.76, rsi2: 8.9, pctFromSma200: 6.07, dailyVolPct: 1.6 };
  const cure = { fund: "CURE", fundPrice: 100, rsi2: 8.9, pctFromSma200: 9.0, dailyVolPct: 0.8 };
  const fas = { fund: "FAS", fundPrice: 164.58, rsi2: 4.2, pctFromSma200: 2.0, dailyVolPct: 1.0 };

  it("ranks lowest RSI(2) first, ties by bigger 200-day cushion", () => {
    expect(rankBuys([tecl, cure, fas]).map((b) => b.fund)).toEqual(["FAS", "CURE", "TECL"]);
  });

  it("sizes by volatility and never exceeds the cap", () => {
    const o = sizeOrder(tecl, s, 1);
    // fund vol 4.8% -> $1,000 / 0.048 = $20,833
    expect(o.sizeUsd).toBe(20_833);
    expect(o.fullShares * o.suggestedLimit).toBeLessThanOrEqual(25_000);
    // quieter fund would want $41,667 but is capped
    expect(sizeOrder(cure, s, 2).sizeUsd).toBe(25_000);
  });

  it("recommends exactly one trade", () => {
    const plan = planOrders([tecl, cure, fas], s);
    expect([...plan.values()].filter((o) => o.recommended)).toHaveLength(1);
    expect(plan.get("FAS")!.recommended).toBe(true);
  });
});
