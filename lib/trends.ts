/**
 * Rolling trend context (release 4): returns over several windows and the dip from a recent high,
 * plus a BUY / WATCH / PASS stance. Display only: the stance never creates an order. WATCH and PASS
 * thresholds are research candidates, not tested rules.
 */
import type { UnderlyingEval } from "./signals";

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Session counts: 5D always; the month windows only when no dates are given. */
export const TREND_WINDOWS = { d5: 5, m1: 21, m3: 63, m6: 126, m12: 252 } as const;

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
  /** % below the highest close of the last 3 months (0 = at the high) */
  offHigh3m: number | null;
  /** % below the highest close in each window, same windows as the returns plus 12 months */
  offHigh: { d5: number | null; m1: number | null; m3: number | null; m6: number | null; m12: number | null };
}

/** Date (YYYY-MM-DD) `months` calendar months before `d`, clamped to month end (Mar 31 -> Feb 28). */
function monthsBefore(d: string, months: number): string {
  const [y, m, day] = d.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Closes oldest first, last = today, with their dates. 5D counts 5 trading sessions; 1M, 3M and 6M
 * compare with the last close before the same date 1, 3 or 6 calendar months earlier, which is how
 * Yahoo's 1M/3M/6M charts measure their change. Without dates, falls back to session counts (21, 63, 126).
 */
export function trendStats(closes: number[], dates?: string[]): TrendStats {
  const n = closes.length;
  const last = closes[n - 1];
  const pctVs = (base: number | undefined) => (base ? r2((last / base - 1) * 100) : null);
  const ret = (k: number) => (n > k ? pctVs(closes[n - 1 - k]) : null);
  const baseIdx = (months: number, sessions: number): number | null => {
    if (!dates || dates.length !== n) return n > sessions ? n - 1 - sessions : null;
    const cutoff = monthsBefore(dates[n - 1], months);
    // Like Yahoo: the window starts on the same date a month earlier, and the change is measured
    // from the close before that day (as 5D is measured from the close before the 5 sessions).
    if (dates[0] >= cutoff) return null; // not enough history
    let i = n - 1;
    while (i > 0 && dates[i] >= cutoff) i--;
    return i;
  };
  const at = (months: number, sessions: number) => {
    const i = baseIdx(months, sessions);
    return i === null ? null : pctVs(closes[i]);
  };
  // Highest close from the window's start close through today.
  const offHighFrom = (i: number | null) => (i === null ? null : r2((last / Math.max(...closes.slice(i)) - 1) * 100));
  const offHigh = {
    d5: offHighFrom(n > TREND_WINDOWS.d5 ? n - 1 - TREND_WINDOWS.d5 : null),
    m1: offHighFrom(baseIdx(1, TREND_WINDOWS.m1)),
    m3: offHighFrom(baseIdx(3, TREND_WINDOWS.m3)),
    m6: offHighFrom(baseIdx(6, TREND_WINDOWS.m6)),
    m12: offHighFrom(baseIdx(12, TREND_WINDOWS.m12)),
  };
  return {
    d5: ret(TREND_WINDOWS.d5),
    m1: at(1, TREND_WINDOWS.m1),
    m3: at(3, TREND_WINDOWS.m3),
    m6: at(6, TREND_WINDOWS.m6),
    offHigh3m: offHigh.m3,
    offHigh,
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
