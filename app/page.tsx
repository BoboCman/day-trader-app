export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Day Trader App</h1>
      <p>
        Signal service for leveraged ETF dip alerts. n8n calls <code>/api/signals</code> each weekday at
        3:40 PM ET. Trades are placed manually at Fidelity.
      </p>
      <p><a href="/positions">My positions</a></p>
    </main>
  );
}
