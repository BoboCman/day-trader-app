import { describe, expect, it } from "vitest";
import { evaluate } from "../lib/signals";
import { stanceFor, trendStats } from "../lib/trends";

const rising = (n: number, step = 0.003) => Array.from({ length: n }, (_, i) => 100 * (1 + step) ** i);

describe("trendStats", () => {
  it("computes returns and the dip from the 3-month high", () => {
    const closes = rising(300);
    const t = trendStats(closes);
    expect(t.d5).toBeCloseTo((1.003 ** 5 - 1) * 100, 1);
    expect(t.m6).toBeGreaterThan(t.m3!);
    expect(t.offHigh3m).toBe(0);
    const dipped = [...closes, closes.at(-1)! * 0.94];
    expect(trendStats(dipped).offHigh3m).toBeCloseTo(-6, 1);
  });

  it("returns nulls when history is short", () => {
    expect(trendStats([1, 2, 3])).toEqual({ d5: null, m1: null, m3: null, m6: null, offHigh3m: null });
  });
});

describe("stanceFor", () => {
  it("WATCH on a pullback in an uptrend that has not triggered yet", () => {
    const closes = [...rising(300), 100 * 1.003 ** 299 * 0.95];
    const s = { ...evaluate(closes), action: "NONE" as const, aboveTrend: true };
    const res = stanceFor(s, trendStats(closes), "XLK");
    expect(res.stance).toBe("WATCH");
    expect(res.trigger).toMatch(/RSI\(2\)/);
    // A shallow pullback is no setup
    const shallow = [...rising(300), 100 * 1.003 ** 299 * 0.98];
    expect(stanceFor(s, trendStats(shallow), "XLK").stance).toBe("NONE");
  });

  it("PASS below the 200-day average, and BUY passes through untouched", () => {
    const falling = rising(300, -0.003);
    const s = evaluate(falling);
    expect(stanceFor(s, trendStats(falling), "XLF").stance).toBe("PASS");
    const buy = { ...s, action: "BUY" as const };
    expect(stanceFor(buy, trendStats(falling), "XLF").stance).toBe("BUY");
    expect(stanceFor(buy, trendStats(falling), "XLF").reason).toMatch(/negative/);
  });
});
