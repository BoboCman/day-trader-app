"use client";

import { useCallback, useEffect, useState } from "react";

interface Position {
  id: string;
  fund: string;
  entryDate: string;
  entryPrice: number;
  shares: number;
  closedDate?: string;
  exitPrice?: number;
  entryRule?: string;
  suggestedLimit?: number;
  exitReason?: string;
}

const FUNDS = [
  { fund: "TECL", name: "Technology 3x", index: "XLK" },
  { fund: "CURE", name: "Health care 3x", index: "XLV" },
  { fund: "FAS", name: "Financials 3x", index: "XLF" },
];
const RULE_LABELS: Record<string, string> = { RSI2: "RSI(2) < 10", DOUBLE7: "7-day low", BOTH: "Both" };
const REASONS: [string, string][] = [
  ["rsi2 exit", "Rule exit (5-day average)"], ["double7 exit", "Rule exit (7-day high)"], ["time stop", "7-day time stop"],
  ["stop loss", "Stop loss"], ["profit target", "Profit target"], ["manual", "My call"],
];
const todayNy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const shortDate = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const C = { ink: "#111827", sub: "#57606a", line: "#e5e7eb", brand: "#0b1f3a", green: "#0f7b4a", red: "#c0392b", bg: "#f3f4f6" };
const card: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, marginBottom: 14, background: "#fff" };
const input: React.CSSProperties = { padding: "10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 16, width: "100%", boxSizing: "border-box", marginTop: 4 };
const btn: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: "none", background: C.brand, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" };
const ghost: React.CSSProperties = { ...btn, background: "#eef0f3", color: C.ink, fontWeight: 500 };
const label: React.CSSProperties = { fontSize: 13, color: C.sub, display: "block" };

type AddForm = { fund: string; entryDate: string; entryPrice: string; shares: string; entryRule: string; suggestedLimit: string };
const emptyForm = (fund: string): AddForm => ({ fund, entryDate: todayNy(), entryPrice: "", shares: "", entryRule: "", suggestedLimit: "" });

export default function PositionsPage() {
  const [key, setKey] = useState("");
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [msg, setMsg] = useState("");
  const [stopPct, setStopPct] = useState(25);
  const [capUsd, setCapUsd] = useState<number | null>(null);
  const [adding, setAdding] = useState<AddForm | null>(null);
  const [selling, setSelling] = useState<{ id: string; price: string; reason: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const call = useCallback(async (k: string, body?: object) => {
    const res = await fetch("/api/positions", {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? res.statusText);
    if ("configured" in data) setConfigured(data.configured);
    if (typeof data.stopLossPct === "number") setStopPct(data.stopLossPct);
    if (typeof data.totalCapUsd === "number") setCapUsd(data.totalCapUsd);
    setPositions(data.positions);
    return data;
  }, []);

  const unlock = useCallback(async (k: string) => {
    setMsg("");
    try {
      await call(k);
      try { localStorage.setItem("signalsKey", k); } catch {}
    } catch (e) {
      setMsg((e as Error).message === "unauthorized" ? "That key didn't work." : (e as Error).message);
    }
  }, [call]);

  useEffect(() => {
    let saved = "";
    try { saved = localStorage.getItem("signalsKey") ?? ""; } catch {}
    setKey(saved);
    // The email's "log the fill" link pre-fills the fund, signal, suggested limit and shares.
    const q = new URLSearchParams(window.location.search);
    const fund = q.get("fund");
    if (fund && FUNDS.some((f) => f.fund === fund)) {
      setAdding({ ...emptyForm(fund), entryRule: q.get("rule") ?? "", suggestedLimit: q.get("limit") ?? "", shares: q.get("shares") ?? "" });
    }
    if (saved) unlock(saved); // saved key: open straight to the positions
  }, [unlock]);

  const run = async (body: object, done?: string) => {
    setMsg("");
    try { await call(key, body); if (done) setMsg(done); return true; } catch (e) { setMsg((e as Error).message); return false; }
  };

  const saveBuy = async () => {
    if (!adding) return;
    if (!(Number(adding.entryPrice) > 0) || !(Number(adding.shares) > 0)) { setMsg("Enter the fill price and shares."); return; }
    const ok = await run({
      action: "open", fund: adding.fund, entryDate: adding.entryDate, entryPrice: Number(adding.entryPrice), shares: Number(adding.shares),
      ...(adding.entryRule ? { entryRule: adding.entryRule } : {}),
      ...(Number(adding.suggestedLimit) > 0 ? { suggestedLimit: Number(adding.suggestedLimit) } : {}),
    }, `Saved ${adding.fund}. The next alert email will track it.`);
    if (ok) setAdding(null);
  };

  const saveSell = async () => {
    if (!selling || !(Number(selling.price) > 0)) { setMsg("Enter the sell price."); return; }
    const ok = await run({ action: "close", id: selling.id, closedDate: todayNy(), exitPrice: Number(selling.price), exitReason: selling.reason });
    if (ok) setSelling(null);
  };

  const remove = async (p: Position) => {
    if (!confirm(`Delete this ${p.fund} entry? Use this only for mistakes.`)) return;
    await run({ action: "delete", id: p.id });
  };

  const open = (positions ?? []).filter((p) => !p.closedDate);
  const closed = (positions ?? []).filter((p) => p.closedDate).reverse();
  const inUse = open.reduce((s, p) => s + p.entryPrice * p.shares, 0);

  return (
    <main style={{ background: C.bg, minHeight: "100vh", fontFamily: "system-ui, sans-serif", color: C.ink }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 0 14px" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>My positions</h1>
          <a href="/" style={{ color: C.brand, fontSize: 14 }}>Home</a>
        </div>

        {positions === null ? (
          <div style={card}>
            <label style={label}>Your app key (SIGNALS_API_KEY). Saved on this device after the first unlock.</label>
            <input style={{ ...input, margin: "8px 0 12px" }} type="password" value={key} onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && unlock(key)} />
            <button style={btn} onClick={() => unlock(key)}>Unlock</button>
          </div>
        ) : !configured ? (
          <div style={card}>Storage isn&apos;t set up yet. In Vercel, open Storage, add Upstash Redis (free), connect it to this project, then redeploy.</div>
        ) : (
          <>
            {capUsd !== null && (
              <div style={{ ...card, padding: "12px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span>Cap in use</span><b>{usd0(inUse)} of {usd0(capUsd)}</b>
                </div>
                <div style={{ height: 8, background: "#eef0f3", borderRadius: 99, marginTop: 8, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, (inUse / capUsd) * 100)}%`, background: inUse >= capUsd ? C.red : C.brand }} />
                </div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>At cost. Stops shown at {stopPct}% below each fill.</div>
              </div>
            )}

            {FUNDS.map(({ fund, name, index }) => {
              const lots = open.filter((p) => p.fund === fund);
              const shares = lots.reduce((s, p) => s + p.shares, 0);
              const cost = lots.reduce((s, p) => s + p.entryPrice * p.shares, 0);
              const isAdding = adding?.fund === fund;
              return (
                <div key={fund} style={{ ...card, borderLeft: `4px solid ${lots.length ? C.brand : "#c4c9d1"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 20, fontWeight: 800 }}>{fund}</span>
                      <span style={{ fontSize: 13, color: C.sub, paddingLeft: 8 }}>{name} · {index}</span>
                    </div>
                    {!isAdding && <button style={lots.length ? ghost : btn} onClick={() => { setSelling(null); setAdding(emptyForm(fund)); }}>+ Buy</button>}
                  </div>

                  {lots.length === 0 && !isAdding && <div style={{ color: C.sub, fontSize: 14, marginTop: 8 }}>Not holding.</div>}
                  {lots.length > 0 && (
                    <div style={{ fontSize: 14, marginTop: 6 }}>
                      <b>{shares} sh</b> · {usd0(cost)} at cost{lots.length > 1 ? ` · avg ${money(cost / shares)}` : ""}
                    </div>
                  )}

                  {lots.map((p) => (
                    <div key={p.id} style={{ padding: "10px 0 2px", borderTop: `1px solid ${C.line}`, marginTop: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ fontSize: 14 }}>
                          {p.shares} sh @ <b>{money(p.entryPrice)}</b>
                          <div style={{ fontSize: 12, color: C.sub }}>
                            bought {shortDate(p.entryDate)}{p.entryRule ? ` · ${RULE_LABELS[p.entryRule] ?? p.entryRule}` : ""} · stop {money(p.entryPrice * (1 - stopPct / 100))}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button style={btn} onClick={() => { setAdding(null); setSelling({ id: p.id, price: "", reason: "rsi2 exit" }); }}>Sold</button>
                          <button style={ghost} onClick={() => remove(p)} aria-label="Delete">✕</button>
                        </div>
                      </div>
                      {selling?.id === p.id && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                          <label style={label}>Sell price<input style={input} inputMode="decimal" autoFocus value={selling.price} onChange={(e) => setSelling({ ...selling, price: e.target.value })} /></label>
                          <label style={label}>Why<select style={input} value={selling.reason} onChange={(e) => setSelling({ ...selling, reason: e.target.value })}>{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                            <button style={btn} onClick={saveSell}>Save sale</button><button style={ghost} onClick={() => setSelling(null)}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {isAdding && adding && (
                    <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 10, paddingTop: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <label style={label}>Fill price<input style={input} inputMode="decimal" autoFocus placeholder="168.05" value={adding.entryPrice} onChange={(e) => setAdding({ ...adding, entryPrice: e.target.value })} /></label>
                        <label style={label}>Shares<input style={input} inputMode="numeric" placeholder="148" value={adding.shares} onChange={(e) => setAdding({ ...adding, shares: e.target.value })} /></label>
                        <label style={label}>Date bought<input style={input} type="date" value={adding.entryDate} onChange={(e) => setAdding({ ...adding, entryDate: e.target.value })} /></label>
                        <label style={label}>Signal (optional)<select style={input} value={adding.entryRule} onChange={(e) => setAdding({ ...adding, entryRule: e.target.value })}><option value="">Not sure</option>{Object.entries(RULE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                      </div>
                      {adding.suggestedLimit && <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>Email&apos;s suggested limit: {money(Number(adding.suggestedLimit))}</div>}
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button style={btn} onClick={saveBuy}>Save buy</button><button style={ghost} onClick={() => setAdding(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {msg && <div style={{ ...card, background: "#fff4d6", borderColor: "#f1d58a" }}>{msg}</div>}

            {closed.length > 0 && (
              <div style={card}>
                <button style={{ ...ghost, width: "100%", textAlign: "left" }} onClick={() => setShowHistory(!showHistory)}>
                  {showHistory ? "▾" : "▸"} History ({closed.length} closed)
                </button>
                {showHistory && closed.map((p) => {
                  const pnl = (p.exitPrice! / p.entryPrice - 1) * 100;
                  const slip = p.suggestedLimit ? (p.entryPrice / p.suggestedLimit - 1) * 100 : null;
                  return (
                    <div key={p.id} style={{ padding: "8px 0", borderTop: `1px solid ${C.line}`, fontSize: 14, marginTop: 8 }}>
                      <b>{p.fund}</b> {shortDate(p.entryDate)} → {shortDate(p.closedDate!)} · {money(p.entryPrice)} → {money(p.exitPrice!)} ·{" "}
                      <span style={{ color: pnl >= 0 ? C.green : C.red, fontWeight: 600 }}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}% ({money((p.exitPrice! - p.entryPrice) * p.shares)})</span>
                      {(p.exitReason || slip !== null) && (
                        <div style={{ fontSize: 12, color: C.sub }}>
                          {p.entryRule ? `${RULE_LABELS[p.entryRule] ?? p.entryRule} · ` : ""}{p.exitReason ?? ""}{slip !== null ? ` · fill ${slip >= 0 ? "+" : ""}${slip.toFixed(2)}% vs suggested limit` : ""}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        {positions === null && msg && <div style={{ ...card, background: "#fff4d6" }}>{msg}</div>}
      </div>
    </main>
  );
}
