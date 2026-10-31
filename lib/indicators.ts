/** Pure indicator math on arrays of closes, oldest first. */

export function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  let sum = 0;
  for (let i = values.length - n; i < values.length; i++) sum += values[i];
  return sum / n;
}

/**
 * Wilder-style RSI using an exponential average with alpha = 1/n, seeded on the
 * first change (matches pandas ewm(alpha=1/n, adjust=False) used in the backtest script).
 */
export function rsi(values: number[], n = 2): number | null {
  if (values.length < n + 1) return null;
  const a = 1 / n;
  let up = 0;
  let down = 0;
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const u = Math.max(d, 0);
    const dn = Math.max(-d, 0);
    if (i === 1) {
      up = u;
      down = dn;
    } else {
      up = (1 - a) * up + a * u;
      down = (1 - a) * down + a * dn;
    }
  }
  if (down === 0) return up === 0 ? 50 : 100;
  return 100 - 100 / (1 + up / down);
}

export function lowest(values: number[], n: number): number | null {
  if (values.length < n) return null;
  return Math.min(...values.slice(-n));
}

export function highest(values: number[], n: number): number | null {
  if (values.length < n) return null;
  return Math.max(...values.slice(-n));
}

/** Average absolute daily % change over the last n sessions (a simple "typical day" volatility). */
export function avgAbsChangePct(values: number[], n: number): number | null {
  if (values.length < n + 1) return null;
  let sum = 0;
  for (let i = values.length - n; i < values.length; i++) {
    sum += Math.abs(values[i] / values[i - 1] - 1);
  }
  return (sum / n) * 100;
}
