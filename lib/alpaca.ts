/** Minimal Alpaca market-data client (free plan friendly). */

const DATA = "https://data.alpaca.markets";
const TRADING = "https://paper-api.alpaca.markets";

function headers() {
  const key = process.env.ALPACA_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) throw new Error("ALPACA_KEY_ID and ALPACA_SECRET_KEY must be set");
  return { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret };
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`Alpaca ${res.status} on ${new URL(url).pathname}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

interface Bar { t: string; c: number }

/**
 * Daily closes for completed sessions before today (split/dividend adjusted).
 * The free plan allows SIP history that ends 15+ minutes ago, which covers all prior days.
 */
export async function dailyCloses(
  symbols: string[],
  todayNy: string,
  calendarDays = 420,
): Promise<Record<string, Bar[]>> {
  const start = new Date(Date.now() - calendarDays * 86_400_000).toISOString().slice(0, 10);
  const end = new Date(Date.now() - 16 * 60_000).toISOString();
  const out: Record<string, Bar[]> = {};
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({
      symbols: symbols.join(","),
      timeframe: "1Day",
      start,
      end,
      adjustment: "all",
      feed: "sip",
      limit: "10000",
    });
    if (pageToken) q.set("page_token", pageToken);
    const body = await get<{ bars: Record<string, Bar[]>; next_page_token?: string }>(
      `${DATA}/v2/stocks/bars?${q}`,
    );
    for (const [s, bars] of Object.entries(body.bars ?? {})) (out[s] ??= []).push(...bars);
    pageToken = body.next_page_token ?? undefined;
  } while (pageToken);

  // Drop today's partial bar; the live price is appended separately.
  for (const s of Object.keys(out)) out[s] = out[s].filter((b) => nyDate(new Date(b.t)) < todayNy);
  return out;
}

/** Last trade (time = ISO timestamp) plus the IEX top-of-book bid/ask when present. */
export interface Quote {
  price: number;
  date: string;
  time: string;
  bid?: number;
  ask?: number;
}

/** Latest trade price per symbol (IEX feed on the free plan; real-time). */
export async function latestPrices(
  symbols: string[],
): Promise<Record<string, Quote>> {
  const q = new URLSearchParams({ symbols: symbols.join(","), feed: "iex" });
  const body = await get<
    Record<string, {
      latestTrade?: { p: number; t: string };
      latestQuote?: { ap: number; bp: number; t: string };
      dailyBar?: { c: number; t: string };
    }>
  >(`${DATA}/v2/stocks/snapshots?${q}`);
  const out: Record<string, Quote> = {};
  for (const [s, snap] of Object.entries(body)) {
    const src = snap.latestTrade
      ? { p: snap.latestTrade.p, t: snap.latestTrade.t }
      : snap.dailyBar
        ? { p: snap.dailyBar.c, t: snap.dailyBar.t }
        : null;
    if (!src?.p) continue;
    const lq = snap.latestQuote;
    out[s] = {
      price: src.p,
      date: nyDate(new Date(src.t)),
      time: src.t,
      ...(lq && lq.ap > 0 && lq.bp > 0 ? { bid: lq.bp, ask: lq.ap } : {}),
    };
  }
  return out;
}

export interface NewsItem {
  headline: string;
  symbols: string[];
  created_at: string;
  url?: string;
  source?: string;
}

/** Recent headlines for the given symbols (Alpaca news API, included in the free plan). */
export async function recentNews(symbols: string[], sinceHours = 30): Promise<NewsItem[]> {
  const q = new URLSearchParams({
    symbols: symbols.join(","),
    start: new Date(Date.now() - sinceHours * 3_600_000).toISOString(),
    limit: "50",
    sort: "desc",
  });
  const body = await get<{ news?: NewsItem[] }>(`${DATA}/v1beta1/news?${q}`);
  return body.news ?? [];
}

export async function marketClock(): Promise<{ is_open: boolean; next_close: string; next_open: string }> {
  return get(`${TRADING}/v2/clock`);
}

export function nyDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}
