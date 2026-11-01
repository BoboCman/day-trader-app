/**
 * One-time historical replay of the current rules, no tuning. Pure functions so it can be tested.
 *
 * Assumptions (stated in the output too):
 * - Signals use the underlying's daily close (the live app uses the 3:40 PM price).
 * - Entries and rule exits fill at the 3x fund's close that day (or, with fill "nextOpen", at the
 *   next session's open, which removes the look-ahead of knowing the close), minus a cost per side.
 * - The stop is a GTC sell stop: if the fund's low reaches it, the fill is the stop price,
 *   or the open if the fund gaps below it.
 * - Each fund trades on its own (one lot at a time per fund); the portfolio view takes only one
 *   trade at a time across all funds, picking the lowest RSI(2), like the live top pick.
 */
import { RULES } from "./config";
import { evaluate } from "./signals";

export interface DayBar { t: string; o: number; l: number; c: number }

export interface Trade {
  fund: string;
  entryDate: string;
  exitDate: string;
  entryRule: "RSI2" | "DOUBLE7" | "BOTH";
  exitReason: "rsi2 exit" | "double7 exit" | "time stop" | "stop loss" | "end of data";
  days: number;
  returnPct: number;
  /** Worst point (fund low) between entry and exit, vs entry, in % */
  maePct: number;
}

export interface ReplayOptions {
  stopLossPct: number | null;
  costPctPerSide: number;
  /** Variant for comparison: only buy when RSI(2) < 10 AND a 7-day low on the same day */
  requireBoth?: boolean;
  /** "close" (default): fill at the signal day's close. "nextOpen": fill at the next session's open. */
  fill?: "close" | "nextOpen";
  /** Only take entries on or after / before these dates (YYYY-MM-DD) */
  from?: string;
  to?: string;
}

type Sig = NonNullable<ReturnType<typeof evaluate>>;
const isEntry = (s: Sig | null, date: string, opt: ReplayOptions) =>
  !!s && s.action === "BUY" && (!opt.requireBoth || (s.rsi2Entry && s.double7Entry)) &&
  (!opt.from || date >= opt.from) && (!opt.to || date < opt.to);

interface Aligned {
  date: string;
  under: number;
  fund: DayBar;
}

/** Join underlying closes and fund bars on date. */
export function align(under: DayBar[], fund: DayBar[]): Aligned[] {
  const f = new Map(fund.map((b) => [b.t.slice(0, 10), b]));
  return under.flatMap((u) => {
    const d = u.t.slice(0, 10);
    const fb = f.get(d);
    return fb ? [{ date: d, under: u.c, fund: fb }] : [];
  });
}

const WINDOW = 290; // same history length the live app evaluates

/** Signal for every day that has enough history. */
export function dailySignals(rows: Aligned[]) {
  return rows.map((_, i) => {
    if (i < RULES.trendSma) return null;
    const closes = rows.slice(Math.max(0, i - WINDOW + 1), i + 1).map((r) => r.under);
    return evaluate(closes);
  });
}

/** Trades for one fund, one lot at a time. */
export function replayFund(fund: string, rows: Aligned[], opt: ReplayOptions): Trade[] {
  const sig = dailySignals(rows);
  const trades: Trade[] = [];
  let i = 0;
  while (i < rows.length) {
    if (!isEntry(sig[i], rows[i].date, opt)) { i++; continue; }
    const t = runTrade(fund, rows, sig, i, opt);
    trades.push(t.trade);
    i = t.exitIndex + 1;
  }
  return trades;
}

function runTrade(
  fund: string,
  rows: Aligned[],
  sig: ReturnType<typeof dailySignals>,
  i: number,
  opt: ReplayOptions,
): { trade: Trade; exitIndex: number } {
  const s = sig[i]!;
  const nextOpen = opt.fill === "nextOpen";
  const last = rows.length - 1;
  const entryRule = s.rsi2Entry && s.double7Entry ? "BOTH" : s.rsi2Entry ? "RSI2" : "DOUBLE7";
  // "close": buy at the signal day's close. "nextOpen": buy at the next session's open (no look-ahead).
  const entryIdx = nextOpen ? Math.min(i + 1, last) : i;
  const entry = nextOpen ? rows[entryIdx].fund.o : rows[i].fund.c;
  const stop = opt.stopLossPct ? entry * (1 - opt.stopLossPct / 100) : null;
  let low = entry;

  const mk = (px: number, exitIdx: number, exitReason: Trade["exitReason"]): Trade => {
    const gross = px / entry - 1;
    const net = (1 + gross) * (1 - opt.costPctPerSide / 100) / (1 + opt.costPctPerSide / 100) - 1;
    return {
      fund, entryDate: rows[i].date, exitDate: rows[exitIdx].date, entryRule, exitReason,
      days: exitIdx - i, returnPct: r2(net * 100), maePct: r2((Math.min(low, px) / entry - 1) * 100),
    };
  };

  // With next-open fills the stop is live from the entry session itself (bought at its open).
  for (let j = nextOpen ? entryIdx : i + 1; j <= last; j++) {
    const b = rows[j].fund;
    if (stop !== null && b.l <= stop) {
      return { trade: mk(Math.min(stop, b.o), j, "stop loss"), exitIndex: j };
    }
    low = Math.min(low, b.l);
    if (j === i) continue; // signal day of a next-open entry: no exit decisions yet
    const e = sig[j]!;
    const reason: Trade["exitReason"] | null =
      e.rsi2Exit ? "rsi2 exit" : e.double7Exit ? "double7 exit" : j - i >= RULES.timeStopSessions ? "time stop" : null;
    if (reason) {
      // Exit decided on day j's close: fill at that close, or at the next open.
      if (!nextOpen) return { trade: mk(b.c, j, reason), exitIndex: j };
      const k = Math.min(j + 1, last);
      return { trade: mk(rows[k].fund.o, k, reason), exitIndex: k };
    }
  }
  return { trade: { ...mk(rows[last].fund.c, last, "end of data") }, exitIndex: last };
}

/** One trade at a time across funds; when several signal the same day, lowest RSI(2) wins. */
export function replayPortfolio(byFund: Record<string, Aligned[]>, opt: ReplayOptions): Trade[] {
  const funds = Object.keys(byFund);
  const sigs = Object.fromEntries(funds.map((f) => [f, dailySignals(byFund[f])]));
  const idx = Object.fromEntries(funds.map((f) => [f, new Map(byFund[f].map((r, i) => [r.date, i]))]));
  const dates = [...new Set(funds.flatMap((f) => byFund[f].map((r) => r.date)))].sort();
  const trades: Trade[] = [];
  let busyUntil = "";
  for (const d of dates) {
    if (d <= busyUntil) continue;
    const cands = funds.flatMap((f) => {
      const i = idx[f].get(d);
      const s = i === undefined ? null : sigs[f][i];
      return s && isEntry(s, d, opt) ? [{ f, i: i!, s }] : [];
    });
    if (!cands.length) continue;
    cands.sort((a, b) => a.s.rsi2 - b.s.rsi2 || b.s.pctFromSma200 - a.s.pctFromSma200);
    const c = cands[0];
    const t = runTrade(c.f, byFund[c.f], sigs[c.f], c.i, opt);
    trades.push(t.trade);
    busyUntil = t.trade.exitDate;
  }
  return trades;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function summarize(trades: Trade[]) {
  const n = trades.length;
  const wins = trades.filter((t) => t.returnPct > 0);
  const losses = trades.filter((t) => t.returnPct <= 0);
  const avg = (a: Trade[]) => (a.length ? r2(a.reduce((s, t) => s + t.returnPct, 0) / a.length) : 0);
  const sumW = wins.reduce((s, t) => s + t.returnPct, 0);
  const sumL = -losses.reduce((s, t) => s + t.returnPct, 0);
  let equity = 1, peak = 1, maxDd = 0;
  for (const t of trades) {
    equity *= 1 + t.returnPct / 100;
    peak = Math.max(peak, equity);
    maxDd = Math.min(maxDd, equity / peak - 1);
  }
  const sorted = [...trades].sort((a, b) => a.returnPct - b.returnPct);
  const count = (r: Trade["exitReason"]) => trades.filter((t) => t.exitReason === r).length;
  return {
    trades: n,
    winRatePct: n ? r2((wins.length / n) * 100) : 0,
    avgWinPct: avg(wins),
    avgLossPct: avg(losses),
    expectancyPct: avg(trades),
    profitFactor: sumL > 0 ? r2(sumW / sumL) : null,
    avgDays: n ? r2(trades.reduce((s, t) => s + t.days, 0) / n) : 0,
    worst: sorted.slice(0, 3),
    best: sorted.slice(-3).reverse(),
    /** Compounded, full size every trade: a stress view, not a forecast */
    compoundedReturnPct: r2((equity - 1) * 100),
    maxDrawdownPct: r2(maxDd * 100),
    /** How far winners dipped before recovering: would a tighter stop have cut them? */
    winnersDipped: {
      avgMaePct: wins.length ? r2(wins.reduce((a, t) => a + t.maePct, 0) / wins.length) : 0,
      pastMinus5Pct: wins.length ? r2((wins.filter((t) => t.maePct <= -5).length / wins.length) * 100) : 0,
      pastMinus7_5Pct: wins.length ? r2((wins.filter((t) => t.maePct <= -7.5).length / wins.length) * 100) : 0,
      pastMinus10Pct: wins.length ? r2((wins.filter((t) => t.maePct <= -10).length / wins.length) * 100) : 0,
    },
    exits: {
      rsi2: count("rsi2 exit"), double7: count("double7 exit"), timeStop: count("time stop"),
      stopLoss: count("stop loss"), open: count("end of data"),
    },
  };
}
