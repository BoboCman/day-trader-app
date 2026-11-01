/**
 * Portfolio risk layer: pure functions that turn BUY signals into at most one
 * recommended, volatility-sized trade under a single total capital cap.
 */

export interface BuyCandidate {
  fund: string;
  fundPrice: number;
  rsi2: number;
  pctFromSma200: number;
  /** Typical daily move of the underlying, in % */
  dailyVolPct: number;
  /** 0.5 when a caution flag is up (release 2), else 1 */
  sizeMultiplier?: number;
}

export interface SizedOrder {
  fundPrice: number;
  suggestedLimit: number;
  /** Expected typical daily move of the 3x fund, in % */
  fundDailyVolPct: number;
  /** Dollar size from the risk budget, capped at the total cap */
  sizeUsd: number;
  fullShares: number;
  halfShares: number;
  /** Rough dollar swing on a typical day at full size */
  typicalDayUsd: number;
  rank: number;
  recommended: boolean;
  /** Protective sell stop to place (GTC) right after the buy fills */
  stopPrice: number;
  stopLossPct: number;
  /** Dollars lost at full size if the stop fills exactly at its price */
  lossAtStopUsd: number;
  /** What set the size before any caution cut */
  sizeLimitedBy: "cap" | "volatility" | "loss budget";
}

export interface RiskSettings {
  totalCapUsd: number;
  riskPerDayUsd: number;
  leverage: number;
  /** GTC stop distance below the limit, in % */
  stopLossPct?: number;
  /** Size so a stop-out loses at most this; 0 or absent = off */
  maxLossPerTradeUsd?: number;
}

/** Deepest oversold first (lowest RSI(2)); ties go to the larger cushion above the 200-day. */
export function rankBuys<T extends BuyCandidate>(buys: T[]): T[] {
  return [...buys].sort((a, b) => a.rsi2 - b.rsi2 || b.pctFromSma200 - a.pctFromSma200);
}

export function sizeOrder(c: BuyCandidate, s: RiskSettings, rank: number): SizedOrder {
  const suggestedLimit = Math.round(c.fundPrice * 1.005 * 100) / 100;
  const fundDailyVolPct = c.dailyVolPct * s.leverage;
  const riskSized = fundDailyVolPct > 0 ? s.riskPerDayUsd / (fundDailyVolPct / 100) : s.totalCapUsd;
  const stopLossPct = s.stopLossPct ?? 25;
  const lossSized = s.maxLossPerTradeUsd ? s.maxLossPerTradeUsd / (stopLossPct / 100) : Infinity;
  const base = Math.min(s.totalCapUsd, riskSized, lossSized);
  const sizeLimitedBy = base === s.totalCapUsd ? "cap" : base === lossSized ? "loss budget" : "volatility";
  const sizeUsd = Math.round(base * (c.sizeMultiplier ?? 1));
  const fullShares = Math.floor(sizeUsd / suggestedLimit);
  const stopPrice = Math.round(suggestedLimit * (1 - stopLossPct / 100) * 100) / 100;
  return {
    fundPrice: c.fundPrice,
    suggestedLimit,
    fundDailyVolPct: Math.round(fundDailyVolPct * 100) / 100,
    sizeUsd,
    fullShares,
    halfShares: Math.floor(fullShares / 2),
    typicalDayUsd: Math.round(fullShares * suggestedLimit * (fundDailyVolPct / 100)),
    rank,
    recommended: rank === 1,
    stopPrice,
    stopLossPct,
    lossAtStopUsd: Math.round(fullShares * (suggestedLimit - stopPrice)),
    sizeLimitedBy,
  };
}

/** Rank the candidates and size each; only rank 1 is recommended because the cap is shared. */
export function planOrders(buys: BuyCandidate[], s: RiskSettings): Map<string, SizedOrder> {
  const out = new Map<string, SizedOrder>();
  rankBuys(buys).forEach((c, i) => out.set(c.fund, sizeOrder(c, s, i + 1)));
  return out;
}
