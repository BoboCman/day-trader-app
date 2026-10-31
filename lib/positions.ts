/** Position tracking: pure logic for "day N of 7", P/L and sell-today flags. */
import { RULES, riskSettings } from "./config";

export interface Position {
  id: string;
  fund: string;
  /** Session the position was bought, YYYY-MM-DD (New York) */
  entryDate: string;
  entryPrice: number;
  shares: number;
  closedDate?: string;
  exitPrice?: number;
}

export type PositionAction = "SELL_TODAY" | "HOLD";

export interface PositionStatus {
  id: string;
  fund: string;
  entryDate: string;
  entryPrice: number;
  shares: number;
  /** Sessions completed since the entry session (entry day = 0) */
  day: number;
  maxDays: number;
  price: number;
  pnlPct: number;
  pnlUsd: number;
  stopPrice: number;
  stopLossPct: number;
  action: PositionAction;
  reasons: string[];
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export const disasterStop = (entryPrice: number, stopLossPct = riskSettings().stopLossPct) =>
  r2(entryPrice * (1 - stopLossPct / 100));

/** Count trading sessions after the entry date, given the dates of sessions so far (incl. today if trading). */
export function sessionsSince(entryDate: string, sessionDates: string[]): number {
  return sessionDates.filter((d) => d > entryDate).length;
}

export function evaluatePosition(
  p: Position,
  ctx: { price: number; day: number; rsi2Exit: boolean; double7Exit: boolean },
): PositionStatus {
  const pnlPct = (ctx.price / p.entryPrice - 1) * 100;
  const stopLossPct = riskSettings().stopLossPct;
  const stopPrice = disasterStop(p.entryPrice, stopLossPct);
  const reasons: string[] = [];
  if (ctx.rsi2Exit) reasons.push("Index closed above its 5-day average (RSI(2) exit)");
  if (ctx.double7Exit) reasons.push("Index at a 7-day high (Double 7s exit)");
  if (ctx.day >= RULES.timeStopSessions) reasons.push(`Time stop: session ${ctx.day} of ${RULES.timeStopSessions}`);
  if (pnlPct <= -stopLossPct) reasons.push(`Down ${r2(-pnlPct)}%, past your ${stopLossPct}% stop`);
  return {
    id: p.id,
    fund: p.fund,
    entryDate: p.entryDate,
    entryPrice: p.entryPrice,
    shares: p.shares,
    day: ctx.day,
    maxDays: RULES.timeStopSessions,
    price: r2(ctx.price),
    pnlPct: r2(pnlPct),
    pnlUsd: Math.round((ctx.price - p.entryPrice) * p.shares),
    stopPrice,
    stopLossPct,
    action: reasons.length ? "SELL_TODAY" : "HOLD",
    reasons,
  };
}
