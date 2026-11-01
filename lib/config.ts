/**
 * Watchlist: three low-overlap sectors (tech, health care, financials). Each leveraged fund is signalled off its unleveraged underlying,
 * which has cleaner price history and is what the fund actually tracks.
 */
export const WATCHLIST = [
  { fund: "TECL", underlying: "XLK", name: "Technology 3x" },
  { fund: "CURE", underlying: "XLV", name: "Health Care 3x" },
  { fund: "FAS", underlying: "XLF", name: "Financials 3x" },
] as const;

/**
 * Largest holdings of each underlying, used for the look-through (breadth and single-stock shocks).
 * Approximate and hand-maintained: refresh a few times a year from the fund pages.
 */
export const TOP_HOLDINGS: Record<string, string[]> = {
  XLK: ["NVDA", "AAPL", "MSFT", "AVGO", "ORCL", "CRM", "CSCO", "AMD", "IBM", "NOW"],
  XLV: ["LLY", "UNH", "JNJ", "ABBV", "MRK", "TMO", "ABT", "ISRG", "AMGN", "DHR"],
  XLF: ["BRK.B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "AXP", "SPGI"],
};

/** Proxy for the VIX fear gauge (VIX itself is an index Alpaca doesn't carry). */
export const FEAR_PROXY = "VIXY";

/**
 * Scheduled macro events that often move markets. FOMC = Fed rate decision day.
 * Jobs reports are added automatically as the first Friday of each month (approximate).
 * Verify against federalreserve.gov and add CPI dates here if you want them flagged.
 */
export const MACRO_EVENTS: { date: string; name: string }[] = [
  { date: "2026-01-28", name: "Fed decision (FOMC)" },
  { date: "2026-03-18", name: "Fed decision (FOMC)" },
  { date: "2026-04-29", name: "Fed decision (FOMC)" },
  { date: "2026-06-17", name: "Fed decision (FOMC)" },
  { date: "2026-07-29", name: "Fed decision (FOMC)" },
  { date: "2026-09-16", name: "Fed decision (FOMC)" },
  { date: "2026-10-28", name: "Fed decision (FOMC)" },
  { date: "2026-12-09", name: "Fed decision (FOMC)" },
];

export const RULES = {
  trendSma: 200,
  rsiPeriod: 2,
  rsiEntryBelow: 10,
  rsiExitSma: 5,
  double7Lookback: 7,
  timeStopSessions: 7,
  /** Default stop-loss below entry, in %; override with STOP_LOSS_PCT */
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
    /** Protective GTC stop distance below the entry, in % (positive number) */
    stopLossPct: envNum("STOP_LOSS_PCT", -RULES.disasterStopPct),
    volLookback: 20,
    /** Most you're willing to lose per trade if the stop is hit; 0 = off */
    maxLossPerTradeUsd: envNum("MAX_LOSS_PER_TRADE_USD", 0),
  };
}
