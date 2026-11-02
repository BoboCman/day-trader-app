import { describe, expect, it } from "vitest";
import { TOP_HOLDINGS, TRADABLE, WATCHLIST } from "../lib/config";

describe("watchlist", () => {
  it("covers all 11 S&P 500 sectors once", () => {
    const sectors = WATCHLIST.map((w) => w.underlying);
    expect(new Set(sectors).size).toBe(11);
    expect(sectors).toEqual(expect.arrayContaining(["XLK", "XLV", "XLF", "XLY", "XLI", "XLU", "XLRE", "XLE", "XLB", "XLP", "XLC"]));
  });
  it("trades only 3x funds; watch-only sectors use the sector fund itself", () => {
    expect(TRADABLE.map((w) => w.fund)).toEqual(["TECL", "CURE", "FAS", "WANT", "DUSL", "UTSL", "DRN"]);
    for (const w of TRADABLE) expect(w.leverage).toBe(3);
    for (const w of WATCHLIST.filter((x) => !x.tradable)) expect(w.fund).toBe(w.underlying);
  });
  it("has top holdings for every sector", () => {
    for (const w of WATCHLIST) expect(TOP_HOLDINGS[w.underlying]?.length).toBeGreaterThanOrEqual(5);
  });
});
