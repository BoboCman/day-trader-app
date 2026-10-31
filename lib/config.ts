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

export function positionSize(): number {
  const v = Number(process.env.POSITION_SIZE_USD);
  return Number.isFinite(v) && v > 0 ? v : 25_000;
}
