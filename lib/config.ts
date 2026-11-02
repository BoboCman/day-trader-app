export interface WatchItem {
  /** Symbol you would buy. For a watch-only sector it is the sector fund itself (nothing to buy). */
  fund: string;
  /** Unleveraged Select Sector SPDR the signal runs on */
  underlying: string;
  name: string;
  /** Daily leverage of `fund`, used for sizing */
  leverage: number;
  /** false = watch-only: the dip is reported, but no order is ever sized for it */
  tradable: boolean;
  /**
   * Tradable fund that gets no buy ticket until its replay validates it (second-opinion review,
   * 2026-11-02). Unlock without a code change by listing it in ENABLED_FUNDS, e.g. "WANT,DRN".
   */
  gated?: boolean;
}

/**
 * Watchlist: all 11 S&P 500 sectors. Each leveraged fund is signalled off its unleveraged Select Sector
 * SPDR, which has cleaner price history and is what the fund actually tracks.
 * Sectors with no usable 3x fund (energy: only ERX at 2x; materials: none; staples and communication:
 * only 3x ETNs launched Sep 2026 with little volume) are watch-only.
 * TECL, CURE and FAS are the most liquid; WANT, DUSL, UTSL and DRN are thin, so use limit orders only.
 */
export const WATCHLIST: readonly WatchItem[] = [
  { fund: "TECL", underlying: "XLK", name: "Technology 3x", leverage: 3, tradable: true },
  { fund: "CURE", underlying: "XLV", name: "Health Care 3x", leverage: 3, tradable: true },
  { fund: "FAS", underlying: "XLF", name: "Financials 3x", leverage: 3, tradable: true },
  { fund: "WANT", underlying: "XLY", name: "Consumer Discretionary 3x", leverage: 3, tradable: true, gated: true },
  { fund: "DUSL", underlying: "XLI", name: "Industrials 3x", leverage: 3, tradable: true, gated: true },
  { fund: "UTSL", underlying: "XLU", name: "Utilities 3x", leverage: 3, tradable: true, gated: true },
  { fund: "DRN", underlying: "XLRE", name: "Real Estate 3x", leverage: 3, tradable: true, gated: true },
  { fund: "XLE", underlying: "XLE", name: "Energy (no 3x fund)", leverage: 1, tradable: false },
  { fund: "XLB", underlying: "XLB", name: "Materials (no 3x fund)", leverage: 1, tradable: false },
  { fund: "XLP", underlying: "XLP", name: "Consumer Staples (no 3x fund)", leverage: 1, tradable: false },
  { fund: "XLC", underlying: "XLC", name: "Communication Services (no 3x fund)", leverage: 1, tradable: false },
];

/** Funds with a 3x fund (positions page, replay). */
export const TRADABLE = WATCHLIST.filter((w) => w.tradable);

/** Funds the app may write a buy ticket for today: tradable and not gated (or unlocked via ENABLED_FUNDS). */
export function ticketsEnabled(w: WatchItem, env: string | undefined = process.env.ENABLED_FUNDS): boolean {
  if (!w.tradable) return false;
  if (!w.gated) return true;
  const unlocked = (env ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  return unlocked.includes(w.fund);
}

/**
 * Largest holdings of each underlying, used for the look-through (breadth and single-stock shocks).
 * Approximate and hand-maintained: refresh a few times a year from the fund pages.
 */
export const TOP_HOLDINGS: Record<string, string[]> = {
  XLK: ["NVDA", "AAPL", "MSFT", "AVGO", "ORCL", "CRM", "CSCO", "AMD", "IBM", "NOW"],
  XLV: ["LLY", "UNH", "JNJ", "ABBV", "MRK", "TMO", "ABT", "ISRG", "AMGN", "DHR"],
  XLF: ["BRK.B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "AXP", "SPGI"],
  XLY: ["AMZN", "TSLA", "HD", "MCD", "BKNG", "TJX", "LOW", "SBUX", "ORLY", "NKE"],
  XLI: ["GE", "CAT", "RTX", "GEV", "UBER", "HON", "ETN", "UNP", "BA", "DE"],
  XLU: ["NEE", "SO", "CEG", "DUK", "VST", "AEP", "SRE", "D", "EXC", "PEG"],
  XLRE: ["WELL", "PLD", "AMT", "EQIX", "SPG", "O", "DLR", "PSA", "CCI", "CBRE"],
  XLE: ["XOM", "CVX", "COP", "WMB", "EOG", "KMI", "SLB", "PSX", "MPC", "OKE"],
  XLB: ["LIN", "SHW", "ECL", "NEM", "APD", "FCX", "CTVA", "MLM", "VMC", "NUE"],
  XLP: ["COST", "WMT", "PG", "KO", "PM", "PEP", "MDLZ", "MO", "CL", "TGT"],
  XLC: ["META", "GOOGL", "NFLX", "TMUS", "DIS", "EA", "T", "VZ", "CMCSA", "TTWO"],
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
    /** Default leverage; each watchlist entry carries its own */
    leverage: 3,
    /** Protective GTC stop distance below the entry, in % (positive number) */
    stopLossPct: envNum("STOP_LOSS_PCT", -RULES.disasterStopPct),
    volLookback: 20,
    /** Most you're willing to lose per trade if the stop is hit; 0 = off */
    maxLossPerTradeUsd: envNum("MAX_LOSS_PER_TRADE_USD", 0),
    /** Most of the total cap any one fund may hold, all open lots together, in % */
    maxFundPct: envNum("MAX_FUND_PCT", 50),
    /** Largest order as a % of the fund's 20-day average dollar volume */
    maxAdvPct: envNum("MAX_ADV_PCT", 1),
    /** Most you could lose if every open stop filled at once (open lots + the new trade); 0 = off */
    maxTotalStopRiskUsd: envNum("MAX_TOTAL_STOP_RISK_USD", 5_000),
  };
}
