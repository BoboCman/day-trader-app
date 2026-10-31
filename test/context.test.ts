import { describe, expect, it } from "vitest";
import { breadth, cautionFor, fearGauge, newsFlags, upcomingEvents } from "../lib/context";
import { planOrders } from "../lib/risk";

describe("fearGauge", () => {
  it("flags a spike when VIXY is 15%+ above its 20-day average and rising", () => {
    const closes = [...Array(20).fill(30), 36];
    expect(fearGauge("VIXY", closes)?.regime).toBe("spiking");
  });
  it("is calm near its average and null without enough data", () => {
    expect(fearGauge("VIXY", Array(21).fill(30))?.regime).toBe("calm");
    expect(fearGauge("VIXY", [1, 2, 3])).toBeNull();
  });
});

describe("breadth", () => {
  it("calls a drop broad when most top holdings fell", () => {
    const b = breadth({ A: -2, B: -1, C: -3, D: 0.5 }, -1.5);
    expect(b.kind).toBe("broad");
    expect(b.worst[0]).toEqual({ symbol: "C", pct: -3 });
  });
  it("calls it narrow and records shocks when one name drove it", () => {
    const b = breadth({ A: -12, B: 0.4, C: 0.2, D: -0.1 }, -1.2);
    expect(b.kind).toBe("narrow");
    expect(b.shocks.map((s) => s.symbol)).toEqual(["A"]);
  });
});

describe("newsFlags", () => {
  it("keeps only stock-specific headlines for the fund's holdings", () => {
    const items = [
      { headline: "UnitedHealth cuts outlook", symbols: ["UNH"] },
      { headline: "Stocks drift higher", symbols: ["UNH"] },
      { headline: "Apple earnings beat", symbols: ["AAPL"] },
    ];
    expect(newsFlags(items, ["UNH", "LLY"]).map((n) => n.symbol)).toEqual(["UNH"]);
  });
});

describe("upcomingEvents", () => {
  it("finds an FOMC decision and the first-Friday jobs report within 3 days", () => {
    expect(upcomingEvents("2026-10-26").map((e) => e.date)).toContain("2026-10-28");
    expect(upcomingEvents("2026-11-04").map((e) => e.date)).toContain("2026-11-06");
    expect(upcomingEvents("2026-11-16")).toEqual([]);
  });
});

describe("cautionFor", () => {
  const calm = { down: 9, total: 10, kind: "broad" as const, worst: [], shocks: [] };
  it("halves size when any flag is raised, and not otherwise", () => {
    expect(cautionFor({ fear: null, breadth: calm, news: [], events: [] }).sizeMultiplier).toBe(1);
    const c = cautionFor({ fear: null, breadth: calm, news: [], events: [{ date: "2026-11-06", name: "Jobs report" }] });
    expect(c.sizeMultiplier).toBe(0.5);
    expect(c.reasons[0]).toMatch(/Jobs report/);
  });
  it("feeds through to a smaller order", () => {
    const base = { fund: "TECL", fundPrice: 100, rsi2: 5, pctFromSma200: 10, dailyVolPct: 1 };
    const s = { totalCapUsd: 25000, riskPerDayUsd: 1000, leverage: 3, stopLossPct: 20 };
    const full = planOrders([base], s).get("TECL")!;
    const half = planOrders([{ ...base, sizeMultiplier: 0.5 }], s).get("TECL")!;
    expect(half.sizeUsd).toBe(Math.round(full.sizeUsd / 2));
  });
});
