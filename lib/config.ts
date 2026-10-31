/**
 * Watchlist: three low-overlap sectors (tech, health care, financials). Each leveraged fund is signalled off its unleveraged underlying,
 * which has cleaner price history and is what the fund actually tracks.
 */
export const WATCHLIST = [
  { fund: "TECL", underlying: "XLK", name: "Technology 3x" },
  { fund: "CURE", underlying: "XLV", name: "Health Care 3x" },
  { fund: "FAS", underlying: "XLF", name: "Financials 3x" },
] as const;

export const RULES = {
  trendSma: 200,
  rsiPeriod: 2,
  rsiEntryBelow: 10,
  rsiExitSma: 5,
  double7Lookback: 7,
  timeStopSessions: 7,
  disasterStopPct: -25,
} as const;

const envNum = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/**
 * Portfolio risk settings.
 * - totalCapUsd: most capital in play at once, across all signals (one trade at a time).
 * - riskPerDayUsd: size each trade so a typical day's move in the 3x fund is about this many dollars.
 */
export function riskSettings() {
  return {
    totalCapUsd: envNum("POSITION_SIZE_USD", 25_000),
    riskPerDayUsd: envNum("RISK_PER_DAY_USD", 1_000),
    leverage: 3,
    volLookback: 20,
  };
}
