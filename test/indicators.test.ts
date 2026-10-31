import { describe, expect, it } from "vitest";
import { highest, lowest, rsi, sma } from "../lib/indicators";
import { evaluate } from "../lib/signals";

describe("indicators", () => {
  it("sma averages the last n values", () => {
    expect(sma([1, 2, 3, 4, 5], 2)).toBe(4.5);
    expect(sma([1], 2)).toBeNull();
  });

  it("rsi matches pandas ewm(alpha=1/n, adjust=False)", () => {
    // closes 10, 11, 10.5, 10 -> diffs +1, -0.5, -0.5
    // up: 1, 0.5, 0.25 ; down: 0, 0.25, 0.375 -> rs = 0.6667 -> rsi = 40
    expect(rsi([10, 11, 10.5, 10], 2)).toBeCloseTo(40, 6);
    expect(rsi([1, 2, 3], 2)).toBe(100);
  });

  it("lowest/highest look at the trailing window", () => {
    expect(lowest([5, 1, 3, 4], 3)).toBe(1);
    expect(highest([9, 1, 3, 4], 3)).toBe(4);
  });
});

describe("evaluate", () => {
  const uptrend = Array.from({ length: 250 }, (_, i) => 100 + i * 0.5);

  it("flags a buy on a sharp pullback in an uptrend", () => {
    const closes = [...uptrend, 220, 218, 216];
    const e = evaluate(closes);
    expect(e.aboveTrend).toBe(true);
    expect(e.rsi2Entry).toBe(true);
    expect(e.double7Entry).toBe(true);
    expect(e.action).toBe("BUY");
  });

  it("does not buy below the 200-day average", () => {
    const down = Array.from({ length: 250 }, (_, i) => 300 - i * 0.5);
    expect(evaluate(down).action).not.toBe("BUY");
    expect(evaluate(down).aboveTrend).toBe(false);
  });

  it("reports exit conditions when making new highs", () => {
    const e = evaluate(uptrend);
    expect(e.action).toBe("EXIT_IF_HOLDING");
    expect(e.double7Exit).toBe(true);
  });
});
