"use client";

import { useEffect, useState } from "react";

interface Summary {
  trades: number; winRatePct: number; avgWinPct: number; avgLossPct: number; expectancyPct: number;
  profitFactor: number | null; avgDays: number; compoundedReturnPct: number; maxDrawdownPct: number;
  exits: { rsi2: number; double7: number; timeStop: number; stopLoss: number; open: number };
  worst: Trade[];
}
interface Trade { fund: string; entryDate: string; exitDate: string; entryRule: string; exitReason: string; days: number; returnPct: number }
interface Result {
  period: { from: string; to: string }; assumptions: string[]; stopLossPct: number;
  portfolio: Summary; perFund: Record<string, Summary>; byEntryRule: Record<string, Summary>;
  stopComparison: Record<string, Summary>; recentTrades: Trade[];
  robustness?: { entry: string; stop: string; period: string; trades: number; winRatePct: number; expectancyPct: number; profitFactor: number | null; maxDrawdownPct: number }[];
}

const box: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16, background: "#fff", overflowX: "auto" };
const input: React.CSSProperties = { padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 15, width: "100%", boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: "9px 14px", borderRadius: 6, border: "none", background: "#0b1f3a", color: "#fff", fontSize: 15, cursor: "pointer" };
const th: React.CSSProperties = { textAlign: "right", padding: "6px 8px", fontSize: 12, color: "#57606a", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" };
const td: React.CSSProperties = { textAlign: "right", padding: "6px 8px", fontSize: 14, borderBottom: "1px solid #f0f1f3", whiteSpace: "nowrap" };
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const tone = (n: number) => (n > 0 ? "#0f7b4a" : n < 0 ? "#c0392b" : "#111827");

function Table({ rows }: { rows: [string, Summary][] }) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead><tr>
        <th style={{ ...th, textAlign: "left" }}></th><th style={th}>Trades</th><th style={th}>Win rate</th><th style={th}>Avg win</th>
        <th style={th}>Avg loss</th><th style={th}>Per trade</th><th style={th}>Profit factor</th><th style={th}>Stop-outs</th><th style={th}>Max drawdown</th>
      </tr></thead>
      <tbody>{rows.map(([k, s]) => (
        <tr key={k}>
          <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{k}</td><td style={td}>{s.trades}</td><td style={td}>{s.winRatePct}%</td>
          <td style={{ ...td, color: tone(s.avgWinPct) }}>{pct(s.avgWinPct)}</td><td style={{ ...td, color: tone(s.avgLossPct) }}>{pct(s.avgLossPct)}</td>
          <td style={{ ...td, color: tone(s.expectancyPct), fontWeight: 600 }}>{pct(s.expectancyPct)}</td><td style={td}>{s.profitFactor ?? "n/a"}</td>
          <td style={td}>{s.exits.stopLoss}</td><td style={{ ...td, color: "#c0392b" }}>{pct(s.maxDrawdownPct)}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

export default function ReplayPage() {
  const [key, setKey] = useState("");
  const [data, setData] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { try { setKey(localStorage.getItem("signalsKey") ?? ""); } catch {} }, []);

  const run = async () => {
    setBusy(true); setMsg("");
    try {
      try { localStorage.setItem("signalsKey", key); } catch {}
      const res = await fetch("/api/replay", { headers: { Authorization: `Bearer ${key}` } });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error === "unauthorized" ? "That key didn't work." : body.error ?? res.statusText);
      setData(body);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(data, null, 2)); setMsg("Copied. Paste it into the chat."); }
    catch { setMsg("Couldn't copy; select the text below instead."); }
  };

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, sans-serif", color: "#111827", background: "#f3f4f6", padding: 16, minHeight: "100vh" }}>
      <h1 style={{ fontSize: 22 }}>Historical replay</h1>
      <div style={box}>
        <p style={{ marginTop: 0 }}>Replays today&apos;s exact rules on daily data since 2016. It takes about 10 to 30 seconds.</p>
        <label>Your app key (SIGNALS_API_KEY)</label>
        <input style={{ ...input, margin: "8px 0 12px" }} type="password" value={key} onChange={(e) => setKey(e.target.value)} />
        <button style={btn} onClick={run} disabled={busy}>{busy ? "Running..." : "Run replay"}</button>
        {data && <button style={{ ...btn, marginLeft: 8, background: "#eef0f3", color: "#111827" }} onClick={copy}>Copy results</button>}
      </div>
      {msg && <div style={{ ...box, background: "#fff4d6" }}>{msg}</div>}
      {data && (
        <>
          <div style={box}>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>One trade at a time (as the app recommends), {data.stopLossPct}% stop</h2>
            <div style={{ fontSize: 13, color: "#57606a", marginBottom: 8 }}>{data.period.from} to {data.period.to}</div>
            <Table rows={[["Portfolio", data.portfolio]]} />
          </div>
          <div style={box}><h2 style={{ fontSize: 16, marginTop: 0 }}>Each fund on its own</h2><Table rows={Object.entries(data.perFund)} /></div>
          <div style={box}><h2 style={{ fontSize: 16, marginTop: 0 }}>By entry signal (all funds)</h2><Table rows={Object.entries(data.byEntryRule)} /></div>
          <div style={box}><h2 style={{ fontSize: 16, marginTop: 0 }}>Stop distance, for comparison only</h2><Table rows={Object.entries(data.stopComparison)} /></div>
          {data.robustness && (
            <div style={box}>
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Does it hold in both halves?</h2>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: "left" }}>Entry</th><th style={th}>Stop</th><th style={th}>Period</th><th style={th}>Trades</th>
                  <th style={th}>Win rate</th><th style={th}>Per trade</th><th style={th}>Profit factor</th><th style={th}>Max drawdown</th>
                </tr></thead>
                <tbody>{data.robustness.map((r) => (
                  <tr key={r.entry + r.stop + r.period}>
                    <td style={{ ...td, textAlign: "left" }}>{r.entry}</td><td style={td}>{r.stop}</td><td style={td}>{r.period}</td><td style={td}>{r.trades}</td>
                    <td style={td}>{r.winRatePct}%</td><td style={{ ...td, color: tone(r.expectancyPct), fontWeight: 600 }}>{pct(r.expectancyPct)}</td>
                    <td style={td}>{r.profitFactor ?? "n/a"}</td><td style={{ ...td, color: "#c0392b" }}>{pct(r.maxDrawdownPct)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div style={box}>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>Worst trades</h2>
            {data.portfolio.worst.map((t) => (
              <div key={t.entryDate + t.fund} style={{ fontSize: 14, padding: "4px 0" }}>
                <b>{t.fund}</b> {t.entryDate} to {t.exitDate} · {t.entryRule} · {t.exitReason} · <span style={{ color: tone(t.returnPct), fontWeight: 600 }}>{pct(t.returnPct)}</span>
              </div>
            ))}
          </div>
          <div style={{ ...box, fontSize: 13, color: "#57606a" }}>
            <b>Assumptions</b>
            <ul>{data.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            &quot;Max drawdown&quot; compounds full size every trade: a stress view, not a forecast.
          </div>
        </>
      )}
    </main>
  );
}
