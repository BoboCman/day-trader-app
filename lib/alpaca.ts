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
export async function dailyCloses(symbols: string[], todayNy: string): Promise<Record<string, Bar[]>> {
  const start = new Date(Date.now() - 420 * 86_400_000).toISOString().slice(0, 10);
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

/** Latest trade price per symbol (IEX feed on the free plan; real-time). */
export async function latestPrices(symbols: string[]): Promise<Record<string, number>> {
  const q = new URLSearchParams({ symbols: symbols.join(","), feed: "iex" });
  const body = await get<Record<string, { latestTrade?: { p: number }; dailyBar?: { c: number } }>>(
    `${DATA}/v2/stocks/snapshots?${q}`,
  );
  const out: Record<string, number> = {};
  for (const [s, snap] of Object.entries(body)) {
    const p = snap.latestTrade?.p ?? snap.dailyBar?.c;
    if (p) out[s] = p;
  }
  return out;
}

export async function marketClock(): Promise<{ is_open: boolean; next_close: string; next_open: string }> {
  return get(`${TRADING}/v2/clock`);
}

export function nyDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}
