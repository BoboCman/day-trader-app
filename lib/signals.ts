import { RULES } from "./config";
import { highest, lowest, rsi, sma } from "./indicators";

export type Action = "BUY" | "EXIT_IF_HOLDING" | "NONE";

export interface UnderlyingEval {
  price: number;
  prevClose: number;
  dayChangePct: number;
  sma200: number;
  pctFromSma200: number;
  aboveTrend: boolean;
  rsi2: number;
  sma5: number;
  low7: number;
  high7: number;
  rsi2Entry: boolean;
  double7Entry: boolean;
  rsi2Exit: boolean;
  double7Exit: boolean;
  action: Action;
  reasons: string[];
}

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/**
 * Evaluate both rules on a series of closes, oldest first, where the last value is
 * today's price (live near the close). Pure and deterministic.
 */
export function evaluate(closes: number[]): UnderlyingEval {
  if (closes.length < RULES.trendSma + 1) {
    throw new Error(`need at least ${RULES.trendSma + 1} closes, got ${closes.length}`);
  }
  const price = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const sma200 = sma(closes, RULES.trendSma)!;
  const sma5 = sma(closes, RULES.rsiExitSma)!;
  const r = rsi(closes, RULES.rsiPeriod)!;
  const low7 = lowest(closes, RULES.double7Lookback)!;
  const high7 = highest(closes, RULES.double7Lookback)!;

  const aboveTrend = price > sma200;
  const rsi2Entry = aboveTrend && r < RULES.rsiEntryBelow;
  const double7Entry = aboveTrend && price <= low7;
  const rsi2Exit = price > sma5;
  const double7Exit = price >= high7;

  const reasons: string[] = [];
  if (!aboveTrend) reasons.push(`Below 200-day average (${round(sma200)}), so no new buys`);
  if (rsi2Entry) reasons.push(`RSI(2) is ${round(r, 1)}, under ${RULES.rsiEntryBelow}`);
  if (double7Entry) reasons.push(`Closing at a ${RULES.double7Lookback}-day low`);
  if (rsi2Exit) reasons.push(`Above 5-day average (${round(sma5)}): RSI(2) exit is met`);
  if (double7Exit) reasons.push(`At a ${RULES.double7Lookback}-day high: Double 7s exit is met`);

  const action: Action =
    rsi2Entry || double7Entry ? "BUY" : rsi2Exit || double7Exit ? "EXIT_IF_HOLDING" : "NONE";

  return {
    price: round(price),
    prevClose: round(prevClose),
    dayChangePct: round((price / prevClose - 1) * 100),
    sma200: round(sma200),
    pctFromSma200: round((price / sma200 - 1) * 100),
    aboveTrend,
    rsi2: round(r, 1),
    sma5: round(sma5),
    low7: round(low7),
    high7: round(high7),
    rsi2Entry,
    double7Entry,
    rsi2Exit,
    double7Exit,
    action,
    reasons,
  };
}
