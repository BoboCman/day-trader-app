# Day Trader App

Weekday alerts for dip-buys in 3x leveraged sector ETFs: TECL (tech), CURE (health care) and FAS (financials). Three sectors with little overlap, so signals rarely double up on the same stocks.

- **Next.js on Vercel** makes the call. `GET /api/signals` runs the rules in plain code and returns JSON.
- **n8n Cloud** runs at 3:40 PM ET on weekdays. It calls the endpoint, has Claude explain the result in plain English, and emails it.
- **Fidelity** stays manual. The email gives the ticker, a suggested limit price and share counts.

The AI never decides a trade. It only explains what the rules returned.

## Rules

Signals are computed on each fund's unleveraged underlying (XLK, XLV, XLF), using the live price near the close as "today's close".

| | RSI(2) | Double 7s |
|---|---|---|
| Filter | Price above 200-day average | Price above 200-day average |
| Buy | RSI(2) below 10 | Close at a 7-day low |
| Exit | Close above 5-day average | Close at a 7-day high |
| Safety | Exit after 7 sessions, or if the fund is down 25% | same |

The app does not track positions. Exit lines are reported as "if you are holding". Rule parameters live in `lib/config.ts`.

## Setup (one time)

### 1. Alpaca market data (free)
1. Sign up at [alpaca.markets](https://alpaca.markets). You don't need to fund an account or trade there.
2. In the paper trading dashboard, generate an API key and secret.

### 2. Vercel
1. In Vercel, choose **Add New → Project**, import `BoboCman/day-trader-app`, and keep the defaults (Next.js is detected automatically).
2. Under **Settings → Environment Variables**, add:
   - `ALPACA_KEY_ID`
   - `ALPACA_SECRET_KEY`
   - `SIGNALS_API_KEY`: a long random string. You can generate one with `openssl rand -hex 32`. Save it, because n8n needs it too.
   - `POSITION_SIZE_USD` (optional, defaults to 25000)
3. Redeploy. To check that it works:
   `curl -H "Authorization: Bearer YOUR_SIGNALS_API_KEY" https://YOUR-APP.vercel.app/api/signals`

Each merge to `main` redeploys automatically.

### 3. n8n Cloud
1. Go to **Workflows → Import from file** and choose `n8n/leveraged-etf-alerts.json`.
2. **Get signals** node: set the URL to your Vercel domain. Under Credential, create a **Header Auth** credential with Name `Authorization` and Value `Bearer YOUR_SIGNALS_API_KEY`.
3. **Claude** node: create an Anthropic credential with your API key from [console.anthropic.com](https://console.anthropic.com). Pick a model from the list if the default one isn't shown.
4. **Email me** node: connect your Gmail account and set the To address.
5. Workflow settings: confirm the timezone is `America/New_York`. Click **Execute workflow** once to test, then turn on **Active**.

On market holidays the endpoint returns `marketOpen: false` and no email is sent. To get alerted if a run fails, set an n8n error workflow.

## Local development

```bash
cp .env.example .env.local   # fill in keys
npm install
npm run dev                  # http://localhost:3000/api/signals
npm test                     # indicator and rule tests
```

Rules-based alerts, not financial advice.
