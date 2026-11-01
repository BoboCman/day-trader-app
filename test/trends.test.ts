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
    expect(trendStats([1, 2, 3])).toEqual({ d5: null, m1: null, m3: null, m6: null, offHigh3m: null,
      offHigh: { d5: null, m1: null, m3: null, m6: null, m12: null } });
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

describe("calendar-month windows", () => {
  it("1M compares with the last close on or before the same date a month earlier", () => {
    // Weekday closes from 2026-08-03 to 2026-10-30, each day +1 so the base close is identifiable.
    const dates: string[] = [], closes: number[] = [];
    for (let t = Date.UTC(2026, 6, 1); t <= Date.UTC(2026, 9, 30); t += 86_400_000) {
      const d = new Date(t);
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      dates.push(d.toISOString().slice(0, 10));
      closes.push(100 + closes.length);
    }
    const t = trendStats(closes, dates);
    const base = closes[dates.indexOf("2026-09-30")];
    expect(t.m1).toBeCloseTo((closes.at(-1)! / base - 1) * 100, 2);
    const base3 = closes[dates.indexOf("2026-07-30")];
    expect(t.m3).toBeCloseTo((closes.at(-1)! / base3 - 1) * 100, 2);
    expect(t.m6).toBeNull(); // not enough history
  });
});

describe("off-high windows", () => {
  it("measures the drop from the highest close in each window", () => {
    // 300 sessions: rise to 200 at session 150, fall to 150 by session 250, then rise slowly.
    const closes = Array.from({ length: 300 }, (_, i) => (i <= 150 ? 50 + i : i <= 250 ? 200 - (i - 150) * 0.5 : 150 + (i - 250) * 0.2));
    const t = trendStats(closes);
    expect(t.offHigh.d5).toBe(0); // still rising
    expect(t.offHigh.m12).toBeCloseTo((closes.at(-1)! / 200 - 1) * 100, 1);
    expect(t.offHigh.m3).toBe(t.offHigh3m);
    expect(t.offHigh.m12!).toBeLessThanOrEqual(t.offHigh.m6!);
  });
});
