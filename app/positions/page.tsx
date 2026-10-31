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
}

const FUNDS = ["TECL", "CURE", "FAS"];
const todayNy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const box: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16, background: "#fff" };
const input: React.CSSProperties = { padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 15, width: "100%", boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: "9px 14px", borderRadius: 6, border: "none", background: "#0b1f3a", color: "#fff", fontSize: 15, cursor: "pointer" };
const ghost: React.CSSProperties = { ...btn, background: "#eef0f3", color: "#111827" };

export default function PositionsPage() {
  const [key, setKey] = useState("");
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [msg, setMsg] = useState("");
  const [stopPct, setStopPct] = useState(25);
  const [form, setForm] = useState({ fund: "TECL", entryDate: todayNy(), entryPrice: "", shares: "" });

  useEffect(() => {
    try { setKey(localStorage.getItem("signalsKey") ?? ""); } catch {}
  }, []);

  const call = useCallback(
    async (body?: object) => {
      const res = await fetch("/api/positions", {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      if ("configured" in data) setConfigured(data.configured);
      if (typeof data.stopLossPct === "number") setStopPct(data.stopLossPct);
      setPositions(data.positions);
      return data;
    },
    [key],
  );

  const load = async () => {
    setMsg("");
    try {
      try { localStorage.setItem("signalsKey", key); } catch {}
      await call();
    } catch (e) {
      setMsg((e as Error).message === "unauthorized" ? "That key didn't work." : (e as Error).message);
    }
  };

  const add = async () => {
    setMsg("");
    try {
      await call({ action: "open", fund: form.fund, entryDate: form.entryDate, entryPrice: Number(form.entryPrice), shares: Number(form.shares) });
      setForm({ ...form, entryPrice: "", shares: "" });
      setMsg("Saved. The next alert email will track it.");
    } catch (e) { setMsg((e as Error).message); }
  };

  const close = async (p: Position) => {
    const price = prompt(`Sell price for ${p.shares} ${p.fund}?`);
    if (!price) return;
    try { await call({ action: "close", id: p.id, closedDate: todayNy(), exitPrice: Number(price) }); }
    catch (e) { setMsg((e as Error).message); }
  };

  const remove = async (p: Position) => {
    if (!confirm(`Delete this ${p.fund} entry? Use this only for mistakes.`)) return;
    try { await call({ action: "delete", id: p.id }); } catch (e) { setMsg((e as Error).message); }
  };

  const open = (positions ?? []).filter((p) => !p.closedDate);
  const closed = (positions ?? []).filter((p) => p.closedDate).reverse();

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", fontFamily: "system-ui, sans-serif", color: "#111827", background: "#f3f4f6", padding: 16, minHeight: "100vh" }}>
      <h1 style={{ fontSize: 22 }}>My positions</h1>

      {positions === null ? (
        <div style={box}>
          <label>Your app key (SIGNALS_API_KEY)</label>
          <input style={{ ...input, margin: "8px 0 12px" }} type="password" value={key} onChange={(e) => setKey(e.target.value)} />
          <button style={btn} onClick={load}>Unlock</button>
        </div>
      ) : !configured ? (
        <div style={box}>Storage isn&apos;t set up yet. In Vercel, open Storage, add Upstash Redis (free), connect it to this project, then redeploy.</div>
      ) : (
        <>
          <div style={box}>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>Log a buy</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label>Fund<select style={input} value={form.fund} onChange={(e) => setForm({ ...form, fund: e.target.value })}>{FUNDS.map((f) => <option key={f}>{f}</option>)}</select></label>
              <label>Date bought<input style={input} type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} /></label>
              <label>Fill price<input style={input} inputMode="decimal" placeholder="172.76" value={form.entryPrice} onChange={(e) => setForm({ ...form, entryPrice: e.target.value })} /></label>
              <label>Shares<input style={input} inputMode="numeric" placeholder="144" value={form.shares} onChange={(e) => setForm({ ...form, shares: e.target.value })} /></label>
            </div>
            <button style={{ ...btn, marginTop: 12 }} onClick={add}>Save</button>
          </div>

          <div style={box}>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>Open</h2>
            {open.length === 0 && <div style={{ color: "#57606a" }}>Nothing open.</div>}
            {open.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid #e5e7eb", gap: 8 }}>
                <div><b>{p.fund}</b> · {p.shares} sh @ {money(p.entryPrice)}<div style={{ fontSize: 13, color: "#57606a" }}>bought {p.entryDate} · stop {money(p.entryPrice * (1 - stopPct / 100))}</div></div>
                <div style={{ display: "flex", gap: 6 }}><button style={btn} onClick={() => close(p)}>Sold</button><button style={ghost} onClick={() => remove(p)}>Delete</button></div>
              </div>
            ))}
          </div>

          {closed.length > 0 && (
            <div style={box}>
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Closed</h2>
              {closed.map((p) => {
                const pnl = ((p.exitPrice! / p.entryPrice) - 1) * 100;
                return (
                  <div key={p.id} style={{ padding: "8px 0", borderTop: "1px solid #e5e7eb", fontSize: 14 }}>
                    <b>{p.fund}</b> {p.entryDate} → {p.closedDate} · {money(p.entryPrice)} → {money(p.exitPrice!)} ·{" "}
                    <span style={{ color: pnl >= 0 ? "#0f7b4a" : "#c0392b", fontWeight: 600 }}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}% ({money((p.exitPrice! - p.entryPrice) * p.shares)})</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      {msg && <div style={{ ...box, background: "#fff4d6" }}>{msg}</div>}
    </main>
  );
}
