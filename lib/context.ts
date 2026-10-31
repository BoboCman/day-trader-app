/**
 * Market context (release 2): pure functions for the fear gauge, look-through breadth,
 * news flags and the macro calendar, plus the caution flags they produce.
 */
import { MACRO_EVENTS } from "./config";

const r2 = (x: number) => Math.round(x * 100) / 100;

export type FearRegime = "calm" | "elevated" | "spiking";

export interface FearGauge {
  symbol: string;
  price: number;
  dayChangePct: number;
  pctVs20d: number;
  regime: FearRegime;
}

/** VIXY vs its 20-day average: spiking = 15%+ above and still rising today; elevated = 5%+ above. */
export function fearGauge(symbol: string, closes: number[]): FearGauge | null {
  if (closes.length < 21) return null;
  const price = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const avg20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const dayChangePct = (price / prev - 1) * 100;
  const pctVs20d = (price / avg20 - 1) * 100;
  const regime: FearRegime = pctVs20d >= 15 && dayChangePct > 0 ? "spiking" : pctVs20d >= 5 ? "elevated" : "calm";
  return { symbol, price: r2(price), dayChangePct: r2(dayChangePct), pctVs20d: r2(pctVs20d), regime };
}

export interface Breadth {
  down: number;
  total: number;
  /** "broad" = most top holdings fell with the index; "narrow" = a few names drove it */
  kind: "broad" | "narrow" | "n/a";
  worst: { symbol: string; pct: number }[];
  /** Top holdings down 8% or more today: usually news or earnings, not a liquidity dip */
  shocks: { symbol: string; pct: number }[];
}

export function breadth(changes: Record<string, number>, indexChangePct: number): Breadth {
  const entries = Object.entries(changes).map(([symbol, pct]) => ({ symbol, pct: r2(pct) }));
  const down = entries.filter((e) => e.pct < 0).length;
  const total = entries.length;
  const sorted = [...entries].sort((a, b) => a.pct - b.pct);
  const kind = total === 0 || indexChangePct >= 0 ? "n/a" : down / total >= 0.6 ? "broad" : "narrow";
  return { down, total, kind, worst: sorted.slice(0, 3), shocks: sorted.filter((e) => e.pct <= -8) };
}

const NEWS_RE =
  /\b(earnings|guidance|outlook|forecast|downgrade[sd]?|misses|miss|beats?|FDA|probe|investigation|lawsuit|recall|subpoena|SEC|antitrust|tariffs?|layoffs?|CEO)\b/i;

export interface NewsFlag {
  symbol: string;
  headline: string;
  url?: string;
}

/** Headlines that suggest a stock-specific reason for a move. At most `max` per fund. */
export function newsFlags(
  items: { headline: string; symbols: string[]; url?: string }[],
  symbols: string[],
  max = 3,
): NewsFlag[] {
  const out: NewsFlag[] = [];
  const seen = new Set<string>();
  for (const n of items) {
    if (!NEWS_RE.test(n.headline) || seen.has(n.headline)) continue;
    const sym = n.symbols.find((s) => symbols.includes(s));
    if (!sym) continue;
    seen.add(n.headline);
    out.push({ symbol: sym, headline: n.headline, url: n.url });
    if (out.length >= max) break;
  }
  return out;
}

/** First Friday of the month for the given YYYY-MM-DD's month and the next month. */
function firstFridays(today: string): string[] {
  const [y, m] = today.split("-").map(Number);
  return [0, 1].map((k) => {
    const d = new Date(Date.UTC(y, m - 1 + k, 1));
    while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  });
}

/** Macro events from today through the next `days` calendar days. */
export function upcomingEvents(today: string, days = 3): { date: string; name: string }[] {
  const end = new Date(Date.parse(today + "T12:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);
  const all = [...MACRO_EVENTS, ...firstFridays(today).map((date) => ({ date, name: "Jobs report (approx.)" }))];
  return all.filter((e) => e.date >= today && e.date <= end).sort((a, b) => a.date.localeCompare(b.date));
}

export interface Caution {
  sizeMultiplier: number;
  reasons: string[];
}

/** Any caution flag halves the suggested size. They don't stack below half. */
export function cautionFor(input: {
  fear: FearGauge | null;
  breadth: Breadth;
  news: NewsFlag[];
  events: { date: string; name: string }[];
}): Caution {
  const reasons: string[] = [];
  if (input.fear?.regime === "spiking") reasons.push(`Fear gauge spiking (${input.fear.symbol} ${input.fear.pctVs20d}% above its 20-day average)`);
  if (input.breadth.kind === "narrow") reasons.push(`Narrow drop: only ${input.breadth.down} of ${input.breadth.total} top holdings fell`);
  if (input.breadth.shocks.length) reasons.push(`Single-stock shock: ${input.breadth.shocks.map((s) => `${s.symbol} ${s.pct}%`).join(", ")}`);
  if (input.news.length) reasons.push(`News on top holdings: ${[...new Set(input.news.map((n) => n.symbol))].join(", ")}`);
  if (input.events.length) reasons.push(`Event in the next few days: ${input.events.map((e) => `${e.name} ${e.date}`).join("; ")}`);
  return { sizeMultiplier: reasons.length ? 0.5 : 1, reasons };
}
