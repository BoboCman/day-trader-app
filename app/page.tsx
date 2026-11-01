const card: React.CSSProperties = {
  maxWidth: 420, margin: "48px auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 24,
};
const big: React.CSSProperties = {
  display: "block", textAlign: "center", padding: "16px 18px", borderRadius: 10, background: "#0b1f3a", color: "#fff",
  fontSize: 18, fontWeight: 600, textDecoration: "none", marginTop: 20,
};
const small: React.CSSProperties = { ...big, background: "#eef0f3", color: "#111827", fontSize: 15, padding: "12px 16px", marginTop: 10 };

export default function Home() {
  return (
    <main style={{ background: "#f3f4f6", minHeight: "100vh", padding: "1px 16px" }}>
      <div style={card}>
        <div style={{ fontSize: 13, color: "#57606a", textTransform: "uppercase", letterSpacing: 0.8 }}>Leveraged ETF dip alerts</div>
        <h1 style={{ fontSize: 24, margin: "6px 0 4px" }}>Day Trader App</h1>
        <div style={{ fontSize: 14, color: "#57606a" }}>TECL · CURE · FAS. Alerts at 3:40 PM ET; you trade at Fidelity.</div>
        <a href="/positions" style={big}>My positions</a>
        <a href="/replay" style={small}>Replay (historical test)</a>
      </div>
    </main>
  );
}
