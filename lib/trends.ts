/**
 * Rolling trend context (release 4): returns over several windows and the dip from a recent high,
 * plus a BUY / WATCH / PASS stance. Display only: the stance never creates an order. WATCH and PASS
 * thresholds are research candidates, not tested rules.
 */
import type { UnderlyingEval } from "./signals";

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Windows in trading sessions: 1 week, ~1 month, ~3 months, ~6 months. */
export const TREND_WINDOWS = { d5: 5, m1: 21, m3: 63, m6: 126 } as const;

export const STANCE_RULES = {
  /** WATCH: a pullback of at least this much from the 3-month high, while the 3- and 6-month returns are positive */
  watchDipPct: -4,
  /** PASS: 6-month return below this, or 3-month return below this */
  passM6Pct: 0,
  passM3Pct: -5,
} as const;

export interface TrendStats {
  d5: number | null;
  m1: number | null;
  m3: number | null;
  m6: number | null;
  /** % below the highest close of the last 63 sessions (0 = at the high) */
  offHigh3m: number | null;
}

/** Closes oldest first, last = today. */
export function trendStats(closes: number[]): TrendStats {
  const n = closes.length;
  const last = closes[n - 1];
  const ret = (k: number) => (n > k ? r2((last / closes[n - 1 - k] - 1) * 100) : null);
  const hi = n >= TREND_WINDOWS.m3 ? Math.max(...closes.slice(-TREND_WINDOWS.m3)) : null;
  return {
    d5: ret(TREND_WINDOWS.d5),
    m1: ret(TREND_WINDOWS.m1),
    m3: ret(TREND_WINDOWS.m3),
    m6: ret(TREND_WINDOWS.m6),
    offHigh3m: hi ? r2((last / hi - 1) * 100) : null,
  };
}

export type Stance = "BUY" | "WATCH" | "PASS" | "NONE";

export interface StanceResult {
  stance: Stance;
  reason: string;
  /** For WATCH: what would turn it into a BUY */
  trigger?: string;
}

/** Stance from the existing signal plus the index's trend. Only BUY is ever actionable. */
export function stanceFor(s: UnderlyingEval, t: TrendStats, underlying: string): StanceResult {
  const weak6m = t.m6 !== null && t.m6 < STANCE_RULES.passM6Pct;
  if (s.action === "BUY") {
    return {
      stance: "BUY",
      reason: weak6m
        ? `Buy rules met, but ${underlying}'s 6-month trend is negative (${t.m6}%): treat with extra care`
        : "Buy rules met within the 200-day uptrend",
    };
  }
  if (!s.aboveTrend) return { stance: "PASS", reason: `${underlying} is below its 200-day average: falling market, not a dip` };
  if (weak6m) return { stance: "PASS", reason: `${underlying}'s 6-month return is ${t.m6}%: the trend is weakening` };
  if (t.m3 !== null && t.m3 < STANCE_RULES.passM3Pct) {
    return { stance: "PASS", reason: `${underlying} is down ${t.m3}% over 3 months: more than a pullback` };
  }
  if (t.offHigh3m !== null && t.offHigh3m <= STANCE_RULES.watchDipPct && (t.m3 ?? 0) > 0 && (t.m6 ?? 0) > 0) {
    return {
      stance: "WATCH",
      reason: `${underlying} is ${t.offHigh3m}% off its 3-month high while the 3- and 6-month trends are up`,
      trigger: `Buy triggers on RSI(2) under 10 (now ${s.rsi2}) or a close at or below ${s.low7} (7-day low)`,
    };
  }
  return { stance: "NONE", reason: "No setup" };
}
