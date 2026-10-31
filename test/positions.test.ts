import { describe, expect, it } from "vitest";
import { disasterStop, evaluatePosition, sessionsSince } from "../lib/positions";

const p = { id: "1", fund: "TECL", entryDate: "2026-10-30", entryPrice: 172.76, shares: 144 };

describe("positions", () => {
  it("counts sessions after the entry day", () => {
    expect(sessionsSince("2026-10-30", ["2026-10-29", "2026-10-30"])).toBe(0);
    expect(sessionsSince("2026-10-30", ["2026-10-30", "2026-11-02", "2026-11-03"])).toBe(2);
  });

  it("sets the disaster stop 25% under entry", () => {
    expect(disasterStop(172.76)).toBe(129.57);
  });

  it("holds when no exit rule is met", () => {
    const s = evaluatePosition(p, { price: 180, day: 2, rsi2Exit: false, double7Exit: false });
    expect(s.action).toBe("HOLD");
    expect(s.pnlPct).toBeCloseTo(4.19, 2);
    expect(s.pnlUsd).toBe(1043);
  });

  it("flags sell today on an exit rule, the time stop, or the disaster stop", () => {
    expect(evaluatePosition(p, { price: 180, day: 2, rsi2Exit: true, double7Exit: false }).action).toBe("SELL_TODAY");
    expect(evaluatePosition(p, { price: 170, day: 7, rsi2Exit: false, double7Exit: false }).action).toBe("SELL_TODAY");
    expect(evaluatePosition(p, { price: 120, day: 1, rsi2Exit: false, double7Exit: false }).reasons[0]).toMatch(/disaster/);
  });
});
