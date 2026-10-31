import { timingSafeEqual } from "node:crypto";

/** Checks "Authorization: Bearer <SIGNALS_API_KEY>" in constant time. */
export function authorized(req: Request): boolean {
  const expected = process.env.SIGNALS_API_KEY;
  if (!expected) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
