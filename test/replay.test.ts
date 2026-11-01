import { describe, expect, it } from "vitest";
import { align, replayFund, summarize, type DayBar } from "../lib/replay";

// 260 rising days, then a 3-day dip, then a recovery.
function series(): { under: DayBar[]; fund: DayBar[] } {
  const under: DayBar[] = [], fund: DayBar[] = [];
  let u = 100, f = 100;
  for (let i = 0; i < 280; i++) {
    const move = i >= 260 && i < 263 ? -0.02 : 0.003;
    u *= 1 + move; f *= 1 + 3 * move;
    const t = new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
    under.push({ t, o: u, l: u, c: u });
    fund.push({ t, o: f, l: f * 0.99, c: f });
  }
  return { under, fund };
}

describe("replay", () => {
  it("buys the dip in an uptrend and exits on the bounce", () => {
    const { under, fund } = series();
    const trades = replayFund("TECL", align(under, fund), { stopLossPct: 20, costPctPerSide: 0 });
    expect(trades.length).toBeGreaterThan(0);
    const first = trades[0];
    expect(first.exitReason).toMatch(/exit|time stop/);
    expect(summarize(trades).trades).toBe(trades.length);
  });

  it("fills a gap through the stop at the open", () => {
    const { under, fund } = series();
    // Crash the fund right after the first entry: open far below the stop.
    const rows = align(under, fund);
    const entry = replayFund("TECL", rows, { stopLossPct: 20, costPctPerSide: 0 })[0];
    const k = fund.findIndex((b) => b.t === entry.entryDate) + 1;
    fund[k] = { ...fund[k], o: fund[k - 1].c * 0.6, l: fund[k - 1].c * 0.55 };
    const t = replayFund("TECL", align(under, fund), { stopLossPct: 20, costPctPerSide: 0 })[0];
    expect(t.exitReason).toBe("stop loss");
    expect(t.returnPct).toBeCloseTo(-40, 0);
  });
});

describe("replay variants", () => {
  it("both-signals and date windows only ever remove entries", () => {
    const { under, fund } = series();
    const rows = align(under, fund);
    const all = replayFund("TECL", rows, { stopLossPct: 20, costPctPerSide: 0 });
    const both = replayFund("TECL", rows, { stopLossPct: 20, costPctPerSide: 0, requireBoth: true });
    const none = replayFund("TECL", rows, { stopLossPct: 20, costPctPerSide: 0, from: "2099-01-01" });
    expect(both.length).toBeLessThanOrEqual(all.length);
    expect(none).toEqual([]);
  });
});
