/**
 * Tiny position store on Upstash Redis (Vercel Marketplace, free tier) via its REST API.
 * Accepts either the Vercel integration's KV_REST_API_* names or Upstash's own names.
 */
import type { Position } from "./positions";

const KEY = "positions";

function creds() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export const storeConfigured = () => creds() !== null;

async function redis(command: (string | number)[]): Promise<unknown> {
  const c = creds();
  if (!c) throw new Error("Position storage is not set up (add Upstash Redis in Vercel → Storage)");
  const res = await fetch(c.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const body = (await res.json()) as { result?: unknown; error?: string };
  if (!res.ok || body.error) throw new Error(`Redis error: ${body.error ?? res.status}`);
  return body.result;
}

export async function loadPositions(): Promise<Position[]> {
  if (!storeConfigured()) return [];
  const raw = (await redis(["GET", KEY])) as string | null;
  return raw ? (JSON.parse(raw) as Position[]) : [];
}

/** Keep a copy of each trading day's run, keyed by date (one hash field per day), for later review. */
export async function saveSnapshot(date: string, snapshot: unknown): Promise<void> {
  if (!storeConfigured()) return;
  await redis(["HSET", "snapshots", date, JSON.stringify(snapshot)]);
}

export async function savePositions(positions: Position[]): Promise<void> {
  await redis(["SET", KEY, JSON.stringify(positions)]);
}
