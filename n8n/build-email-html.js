// n8n Code node: "Build email HTML" (mode: Run Once for All Items).
// Numbers come straight from the signals API; Claude only supplies the prose
// (headline, one note per buy, market backdrop) via the Structured Output Parser.
// Email-safe: table layout and inline styles only, which Gmail and Outlook render.

const data = $('Get signals').first().json;
const ai = $input.first().json.output ?? {};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = (n) => '$' + Math.round(Number(n)).toLocaleString('en-US');
const pct = (n) => (n > 0 ? '+' : '') + Number(n).toFixed(2) + '%';
const tone = (n) => (n > 0 ? '#0f7b4a' : n < 0 ? '#c0392b' : '#57606a');

const C = {
  bg: '#f3f4f6', card: '#ffffff', ink: '#111827', sub: '#57606a', line: '#e5e7eb',
  brand: '#0b1f3a', green: '#0f7b4a', greenBg: '#e7f6ee', amber: '#9a6700', amberBg: '#fff4d6',
  grey: '#57606a', greyBg: '#eef0f3', red: '#c0392b',
};
const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const results = data.results ?? [];
const buys = results
  .filter((r) => r.signal?.action === 'BUY')
  .sort((a, b) => (a.order?.rank ?? 99) - (b.order?.rank ?? 99));
const positions = (data.positions ?? []);
const heldFunds = new Set(positions.map((p) => p.fund));
const sells = positions.filter((p) => p.action === 'SELL_TODAY');
const exits = results.filter((r) => r.signal?.action === 'EXIT_IF_HOLDING' && !heldFunds.has(r.fund));
const appUrl = data.appUrl || '';
const errors = results.filter((r) => r.error);
const noteFor = (fund) => (ai.buyNotes ?? []).find((n) => n.fund === fund)?.note ?? '';

const dateLabel = new Date(data.date + 'T12:00:00Z').toLocaleDateString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});
const asOf = new Date(data.asOf).toLocaleTimeString('en-US', {
  hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
});

const pill = (text, fg, bg) =>
  `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${bg};color:${fg};font-size:12px;font-weight:600;letter-spacing:.2px;">${esc(text)}</span>`;

const status = !data.marketOpen
  ? pill('Market closed', C.grey, C.greyBg)
  : sells.length
    ? pill(`Sell ${sells.map((p) => p.fund).join(', ')} today`, '#ffffff', C.red)
    : buys.length
    ? pill(`${buys.length} buy signal${buys.length > 1 ? 's' : ''}`, C.green, C.greenBg)
    : pill('No new buys', C.grey, C.greyBg);

const headline = ai.headline || (buys.length ? `Buy: ${buys.map((b) => b.fund).join(', ')}` : 'No new buys today');

// ---------- buy cards
const ruleChips = (s) =>
  [s.rsi2Entry && `RSI(2) ${s.rsi2}`, s.double7Entry && '7-day low']
    .filter(Boolean)
    .map((t) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:2px 8px;border:1px solid ${C.line};border-radius:6px;font-size:12px;color:${C.sub};">${esc(t)}</span>`)
    .join('');

const stat = (label, value, sub) => `
  <td style="padding:10px 12px;border-right:1px solid ${C.line};" valign="top">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:${C.sub};">${label}</div>
    <div style="font-size:18px;font-weight:700;color:${C.ink};padding-top:2px;">${value}</div>
    ${sub ? `<div style="font-size:12px;color:${C.sub};">${sub}</div>` : ''}
  </td>`;

const ticket = (steps) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;background:#f6f8fb;border:1px solid ${C.line};border-radius:8px;">
    <tr><td style="padding:12px 14px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${C.sub};padding-bottom:6px;">Order ticket</div>
      ${steps.map((t, i) => `<div style="font-size:13px;line-height:1.5;color:${C.ink};padding:2px 0;">${i + 1}. ${t}</div>`).join('')}
    </td></tr>
  </table>`;

// Profit-target limit prices (+3/+5/+8%) for the optional OCO sell.
const TARGETS = [3, 5, 8];
const targetPx = (base, t) => Math.round(base * (1 + t / 100) * 100) / 100;
const targetList = (base) => TARGETS.map((t) => `+${t}% <b>${money(targetPx(base, t))}</b>`).join(' · ');
// For an open lot: a limit below the current price would fill at once, so flag targets already passed.
const heldTargets = (p) => TARGETS.map((t) => {
  const px = targetPx(p.entryPrice, t);
  return px <= p.price ? `<span style="color:${C.sub};">+${t}% ${money(px)} (already above)</span>` : `+${t}% <b>${money(px)}</b>`;
}).join(' · ');

const positionCard = (p) => {
  if (p.error) return `<tr><td style="padding:0 0 10px 0;font-size:13px;color:${C.red};">${esc(p.fund)}: ${esc(p.error)}</td></tr>`;
  const sell = p.action === 'SELL_TODAY';
  const limit = Math.round(p.price * 0.995 * 100) / 100;
  return `
  <tr><td style="padding:0 0 14px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-left:4px solid ${sell ? C.red : '#c4c9d1'};border-radius:10px;">
      <tr><td style="padding:16px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle">
            <span style="font-size:20px;font-weight:800;color:${C.ink};">${esc(p.fund)}</span>
            <span style="font-size:13px;color:${C.sub};padding-left:6px;">${p.day === 0 ? `bought last session · 0 of ${p.maxDays} days held` : `day ${p.day} of ${p.maxDays}`} · ${p.shares} sh @ ${money(p.entryPrice)}</span>
          </td>
          <td align="right" valign="middle">${sell ? pill('SELL TODAY', '#ffffff', C.red) : pill('HOLD', C.grey, C.greyBg)}</td>
        </tr></table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:8px;border-collapse:separate;margin-top:12px;"><tr>
          ${stat('Now', money(p.price), '')}
          ${stat('P/L', `<span style="color:${tone(p.pnlPct)};">${pct(p.pnlPct)}</span>`, `${p.pnlUsd >= 0 ? '+' : '-'}${usd0(Math.abs(p.pnlUsd))}`)}
          <td style="padding:10px 12px;" valign="top">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:${C.sub};">Stop</div>
            <div style="font-size:18px;font-weight:700;color:${C.ink};padding-top:2px;">${money(p.stopPrice)}</div>
            <div style="font-size:12px;color:${C.sub};">GTC, -${p.stopLossPct ?? 25}%</div>
          </td>
        </tr></table>
        ${sell
          ? `<div style="font-size:13px;color:${C.ink};padding-top:10px;">${esc(p.reasons.join('. '))}.</div>` + ticket([
              `<b>Cancel your GTC stop</b> (or One-Cancels-the-Other order) on ${esc(p.fund)} first`,
              `<b>Sell ${p.shares} ${esc(p.fund)}</b> · limit <b>${money(limit)}</b> · day order · place 3:45-3:55 PM ET`,
              `Mark it sold${appUrl ? ` at <a href="${esc(appUrl)}/positions" style="color:${C.brand};">${esc(appUrl.replace(/^https?:\/\//, ''))}/positions</a>` : ' on the positions page'}`,
            ])
          : `<div style="font-size:13px;color:${C.sub};padding-top:10px;">No exit rule met. Keep holding; your stop stays in place.</div>
             <div style="font-size:13px;color:${C.ink};padding-top:6px;">Optional profit targets from your ${money(p.entryPrice)} fill: ${heldTargets(p)}. Use one as the limit side of a One-Cancels-the-Other order with your ${money(p.stopPrice)} stop.</div>`}
      </td></tr>
    </table>
  </td></tr>`;
};

const buyCard = (r) => {
  const s = r.signal, o = r.order;
  const top = !o || o.recommended !== false;
  const accent = top ? C.green : '#c4c9d1';
  const waiting = !!o && o.fullShares === 0 && !!o.afterSells?.fullShares;
  const full = o ? (waiting ? o.afterSells.fullShares : o.fullShares) : 0;
  const half = o ? (waiting ? o.afterSells.halfShares : o.halfShares) : 0;
  // Cap fully in use and no sale pending: show the limit only, not a row of zero-share sizes.
  const capFull = !!o && full === 0;
  const orderRow = capFull
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:8px;border-collapse:separate;margin-top:12px;">
        <tr>${stat('Limit price', money(o.suggestedLimit), `last ${money(o.fundPrice)}`)}
          <td style="padding:10px 12px;" valign="top">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:${C.sub};">Size</div>
            <div style="font-size:18px;font-weight:700;color:${C.sub};padding-top:2px;">None</div>
            <div style="font-size:12px;color:${C.sub};">cap in use</div>
          </td></tr>
      </table>`
    : o
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:8px;border-collapse:separate;margin-top:12px;">
        <tr>
          ${stat('Limit price', money(o.suggestedLimit), `last ${money(o.fundPrice)}`)}
          ${stat((waiting ? 'After sale' : 'Size') + (o.cautioned ? ' (halved)' : o.sizeLimitedBy === 'loss budget' ? ' (loss budget)' : ''), `${full} sh`, `≈ ${usd0(full * o.suggestedLimit)} · loss at stop ≈ ${usd0(full * (o.suggestedLimit - (o.stopPrice ?? 0)))}`)}
          <td style="padding:10px 12px;" valign="top">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:${C.sub};">Half size</div>
            <div style="font-size:18px;font-weight:700;color:${C.ink};padding-top:2px;">${half} sh</div>
            <div style="font-size:12px;color:${C.sub};">≈ ${usd0(half * o.suggestedLimit)}</div>
          </td>
        </tr>
      </table>`
    : `<div style="margin-top:12px;font-size:13px;color:${C.red};">No live fund price, check before ordering.</div>`;
  return `
  <tr><td style="padding:0 0 14px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-left:4px solid ${accent};border-radius:10px;${top ? '' : 'opacity:.85;'}">
      <tr><td style="padding:16px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle">
            <span style="font-size:22px;font-weight:800;color:${C.ink};letter-spacing:.3px;">${esc(r.fund)}</span>
            <span style="font-size:13px;color:${C.sub};padding-left:6px;">${esc(r.name)}</span>
          </td>
          <td align="right" valign="middle">${top ? pill(buys.length > 1 ? 'TOP PICK' : 'BUY', '#ffffff', C.green) : pill('ALTERNATIVE', C.grey, C.greyBg)}</td>
        </tr></table>
        ${top ? '' : `<div style="font-size:12px;color:${C.sub};padding-top:6px;">Only if you pass on the top pick. One trade at a time.</div>`}
        <div style="padding-top:8px;">${ruleChips(s)}</div>
        <div style="font-size:14px;line-height:1.5;color:${C.ink};">${esc(noteFor(r.fund) || s.reasons.join('. '))}</div>
        <div style="font-size:12px;color:${C.sub};padding-top:6px;">${esc(r.underlying)} ${s.price} · <span style="color:${tone(s.dayChangePct)};">${pct(s.dayChangePct)}</span> today · ${pct(s.pctFromSma200)} vs 200-day</div>
        ${lookThrough(r)}
        ${cautionBox(r)}
        ${buyCaution(r) ? `<div style="margin-top:10px;font-size:13px;color:${C.amber};background:${C.amberBg};border-radius:8px;padding:10px 12px;">${esc(buyCaution(r))}.</div>` : ''}
        ${orderRow}
        ${qualityBox(r)}
        ${o && top && o.fullShares === 0 ? `<div style="margin-top:12px;font-size:13px;color:${C.amber};background:${C.amberBg};border-radius:8px;padding:10px 12px;">${
          data.positionsUnavailable
            ? 'Couldn\'t load your positions, so no size is given. Check the positions page before buying anything.'
            : o.afterSells?.fullShares
              ? `Your cap stays committed until your ${esc(sells.map((p) => p.fund).join(', '))} sale fills. Only once it has: buy up to <b>${o.afterSells.fullShares} sh</b> (half: ${o.afterSells.halfShares}).`
              : `Your $${Math.round(data.risk?.totalCapUsd ?? 0).toLocaleString('en-US')} cap is already in use by open positions. Skip this one, or only take it after you sell.`
        }</div>` : ''}
        ${o && top && (o.fullShares > 0 || o.afterSells?.fullShares) ? ((n) => ticket([
          ...(o.fullShares === 0 ? [`<b>Wait until your sell fills</b>, then mark it sold`] : []),
          `<b>Buy ${n} ${esc(r.fund)}</b> · limit <b>${money(o.suggestedLimit)}</b> · day order · place 3:45-3:55 PM ET`,
          `Once filled: <b>sell stop ${n} sh at ${money(o.stopPrice ?? o.suggestedLimit * (1 - (o.stopLossPct ?? 25) / 100))}</b> · good 'til canceled (${o.stopLossPct ?? 25}% stop)`,
          `Optional profit target: make it a <b>One-Cancels-the-Other</b> order (Fidelity conditional orders) with a GTC sell limit at ${targetList(o.suggestedLimit)}. Prices assume a fill at the limit; recompute from your fill. Untested until the replay says so; stop only follows the tested rules`,
          `Log the fill${appUrl ? ` at <a href="${esc(logUrl(r, o, n))}" style="color:${C.brand};">${esc(appUrl.replace(/^https?:\/\//, ''))}/positions</a> (pre-filled)` : ' on the positions page'} so tomorrow's email tracks it`,
        ]))(o.fullShares || o.afterSells.fullShares) : ''}
      </td></tr>
    </table>
  </td></tr>`;
};

// ---------- market context (release 2)
const ctx = data.context ?? {};
const fear = ctx.fear;
const fearPill = fear
  ? fear.regime === 'spiking' ? pill('Spiking', '#ffffff', C.red)
    : fear.regime === 'elevated' ? pill('Elevated', C.amber, C.amberBg)
    : pill('Calm', C.green, C.greenBg)
  : '';
const events = ctx.events ?? [];
const eventDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const contextStrip = fear || events.length ? `
  <tr><td style="padding:0 0 14px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-radius:10px;border-collapse:separate;"><tr>
      ${fear ? `<td style="padding:12px 14px;border-right:1px solid ${C.line};" valign="top" width="50%">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:${C.sub};">Fear gauge (${esc(fear.symbol)})</div>
        <div style="padding-top:4px;">${fearPill} <span style="font-size:13px;color:${C.ink};padding-left:4px;">${pct(fear.pctVs20d)} vs 20-day</span></div>
        <div style="font-size:12px;color:${C.sub};padding-top:2px;">${money(fear.price)} · <span style="color:${tone(fear.dayChangePct)};">${pct(fear.dayChangePct)}</span> today</div>
      </td>` : ''}
      <td style="padding:12px 14px;" valign="top">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:${C.sub};">Next 3 days</div>
        ${events.length
          ? events.map((e) => `<div style="font-size:13px;color:${C.ink};padding-top:4px;"><b>${esc(eventDate(e.date))}</b> · ${esc(e.name)}</div>`).join('')
          : `<div style="font-size:13px;color:${C.sub};padding-top:4px;">No Fed meeting or jobs report</div>`}
      </td>
    </tr></table>
  </td></tr>` : '';

const lookThrough = (r) => {
  const c = r.context;
  if (!c) return '';
  const b = c.breadth;
  const breadthLine = b && b.total
    ? `<div style="font-size:12px;color:${C.sub};padding-top:6px;">Top 10 holdings: <b style="color:${C.ink};">${b.down} of ${b.total} down</b>${b.kind === 'broad' ? ' (broad selloff)' : b.kind === 'narrow' ? ' (narrow, a few names)' : ''} · weakest ${b.worst.map((w) => `${esc(w.symbol)} <span style="color:${tone(w.pct)};">${pct(w.pct)}</span>`).join(', ')}</div>`
    : '';
  const news = (c.news ?? []).map((n) =>
    `<div style="font-size:12px;line-height:1.45;color:${C.ink};padding-top:4px;"><b>${esc(n.symbol)}</b> · ${n.url ? `<a href="${esc(n.url)}" style="color:${C.brand};text-decoration:none;">${esc(n.headline)}</a>` : esc(n.headline)}</div>`).join('');
  return breadthLine + (news ? `<div style="padding-top:6px;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:${C.sub};">Headlines</div>${news}</div>` : '');
};

const cautionBox = (r) => {
  const reasons = r.context?.caution?.reasons ?? [];
  if (!reasons.length) return '';
  return `<div style="margin-top:12px;background:${C.amberBg};border:1px solid #f1d58a;border-radius:8px;padding:10px 12px;">
    <div style="font-size:12px;font-weight:700;color:${C.amber};text-transform:uppercase;letter-spacing:.6px;">Caution · size halved</div>
    ${reasons.map((x) => `<div style="font-size:13px;line-height:1.45;color:${C.ink};padding-top:3px;">• ${esc(x)}</div>`).join('')}
  </div>`;
};

const qualityBox = (r) => {
  const w = r.quality?.warnings ?? [];
  return w.length
    ? `<div style="margin-top:10px;font-size:12px;color:${C.red};">${w.map((x) => `⚠ ${esc(x)}`).join('<br>')}</div>`
    : '';
};
const logUrl = (r, o, n) =>
  `${appUrl}/positions?${new URLSearchParams({ fund: r.fund, rule: o.entryRule ?? '', limit: String(o.suggestedLimit), shares: String(n) })}`;

const noBuys = `
  <tr><td style="padding:0 0 14px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-radius:10px;">
      <tr><td style="padding:18px;font-size:15px;color:${C.sub};">No fund met an entry rule today. Nothing to do.</td></tr>
    </table>
  </td></tr>`;

// ---------- watchlist table
const statusCell = (r) => {
  if (r.error) return pill('Data error', C.red, '#fdecea');
  const a = r.signal.action;
  if (a === 'BUY') return pill('Buy', C.green, C.greenBg);
  if (a === 'EXIT_IF_HOLDING') return pill('Exit if holding', C.amber, C.amberBg);
  const st = r.trend?.stance;
  if (st === 'WATCH') return pill('Watch', C.amber, C.amberBg);
  if (st === 'PASS' || !r.signal.aboveTrend) return pill('Pass', C.grey, C.greyBg);
  return pill('Wait', C.grey, C.greyBg);
};
const th = (t, align = 'left') =>
  `<th align="${align}" style="padding:8px 10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:${C.sub};border-bottom:1px solid ${C.line};">${t}</th>`;
const td = (v, align = 'left', color = C.ink, weight = 400) =>
  `<td align="${align}" style="padding:10px;font-size:13px;color:${color};font-weight:${weight};border-bottom:1px solid ${C.line};">${v}</td>`;

const rows = results
  .map((r) =>
    r.error
      ? `<tr>${td(`<b>${esc(r.fund)}</b>`)}${td(esc(r.underlying))}<td colspan="3" style="padding:10px;font-size:12px;color:${C.red};border-bottom:1px solid ${C.line};">${esc(r.error)}</td><td align="right" style="padding:10px;border-bottom:1px solid ${C.line};">${statusCell(r)}</td></tr>`
      : `<tr>
          ${td(`<b>${esc(r.fund)}</b>`)}
          ${td(esc(r.underlying), 'left', C.sub)}
          ${td(pct(r.signal.dayChangePct), 'right', tone(r.signal.dayChangePct), 600)}
          ${td(pct(r.signal.pctFromSma200), 'right', tone(r.signal.pctFromSma200))}
          ${td(r.signal.rsi2, 'right', r.signal.rsi2 < 10 ? C.green : C.ink, r.signal.rsi2 < 10 ? 700 : 400)}
          <td align="right" style="padding:10px;border-bottom:1px solid ${C.line};white-space:nowrap;">${statusCell(r)}</td>
        </tr>`,
  )
  .join('');

// ---------- trends table: fund return in bold, index beneath. Context only, never an order.
const trendNum = (n) => (n === null || n === undefined ? '–' : (n > 0 ? '+' : '') + Number(n).toFixed(1) + '%');
const trendCell = (r, k) => {
  const f = r.trend?.fund?.[k], i = r.trend?.index?.[k];
  return `<td align="right" style="padding:8px 10px;border-bottom:1px solid ${C.line};white-space:nowrap;">
    <div style="font-size:13px;font-weight:600;color:${tone(f ?? 0)};">${trendNum(f)}</div>
    <div style="font-size:11px;color:${C.sub};">${trendNum(i)}</div></td>`;
};
const withTrend = results.filter((r) => !r.error && r.trend);
const trendRows = withTrend
  .map((r) => `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid ${C.line};"><div style="font-size:13px;font-weight:700;color:${C.ink};">${esc(r.fund)}</div><div style="font-size:11px;color:${C.sub};">${esc(r.underlying)}</div></td>
      ${['d5', 'm1', 'm3', 'm6'].map((k) => trendCell(r, k)).join('')}
    </tr>`)
  .join('');
// Off-the-high card: how far below the highest close of each window (0% = at the high).
const offCell = (r, k) => {
  const f = r.trend?.fund?.offHigh?.[k], i = r.trend?.index?.offHigh?.[k];
  const shade = (v) => (v === null || v === undefined ? C.sub : v <= -10 ? C.red : v < 0 ? C.amber : C.green);
  return `<td align="right" style="padding:8px 10px;border-bottom:1px solid ${C.line};white-space:nowrap;">
    <div style="font-size:13px;font-weight:600;color:${shade(f)};">${trendNum(f)}</div>
    <div style="font-size:11px;color:${C.sub};">${trendNum(i)}</div></td>`;
};
// Where each fund's highs were: windows that share the same high are merged ("1M–3M high").
const WIN_LABEL = { d5: '5D', m1: '1M', m3: '3M', m6: '6M', m12: '12M' };
const shortDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const highLine = (r) => {
  const h = r.trend?.fund?.highs;
  if (!h) return '';
  const groups = [];
  for (const k of ['d5', 'm1', 'm3', 'm6', 'm12']) {
    const x = h[k];
    if (!x) continue;
    const g = groups.at(-1);
    if (g && g.date === x.date && g.close === x.close) g.to = k;
    else groups.push({ from: k, to: k, date: x.date, close: x.close, off: r.trend.fund.offHigh?.[k] });
  }
  if (!groups.length) return '';
  const parts = groups.map((g) =>
    `${g.from === g.to ? WIN_LABEL[g.from] : `${WIN_LABEL[g.from]}–${WIN_LABEL[g.to]}`} high <b>${money(g.close)}</b>${g.date ? ` on ${shortDate(g.date)}` : ''} (<span style="color:${tone(g.off ?? 0)};">${trendNum(g.off)}</span>)`);
  return `<b>${esc(r.fund)}</b>: ${parts.join(' · ')}`;
};
const highLines = withTrend.map(highLine).filter(Boolean).join('<br>');
const offRows = withTrend.filter((r) => r.trend.fund?.offHigh)
  .map((r) => `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid ${C.line};"><div style="font-size:13px;font-weight:700;color:${C.ink};">${esc(r.fund)}</div><div style="font-size:11px;color:${C.sub};">${esc(r.underlying)}</div></td>
      ${['d5', 'm1', 'm3', 'm6', 'm12'].map((k) => offCell(r, k)).join('')}
    </tr>`)
  .join('');
const watches = withTrend.filter((r) => r.trend.stance === 'WATCH');
const buyCaution = (r) => (r.trend?.stance === 'BUY' && /negative/.test(r.trend.reason) ? r.trend.reason : '');

const section = (title) =>
  `<tr><td style="padding:10px 2px 8px 2px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${C.sub};">${title}</td></tr>`;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(headline)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${font};">
<div style="display:none;max-height:0;overflow:hidden;">${esc(headline)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;">

  <tr><td style="background:${C.brand};border-radius:12px 12px 0 0;padding:18px 22px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:.3px;">Leveraged ETF Dip Alert</td>
      <td align="right" style="color:#c7d2e0;font-size:12px;">${esc(dateLabel)} · ${esc(asOf)} ET</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:${C.card};padding:20px 22px;border-radius:0 0 12px 12px;border:1px solid ${C.line};border-top:none;">
    <div style="padding-bottom:8px;">${status}</div>
    <div style="font-size:22px;line-height:1.3;font-weight:700;color:${C.ink};">${esc(headline)}</div>
    ${buys.length > 1 ? `<div style="font-size:13px;color:${C.sub};padding-top:6px;">${buys.length} funds signalled. Top pick: <b style="color:${C.ink};">${esc(data.topPick ?? buys[0].fund)}</b>, the most oversold. One trade at a time${data.risk ? `, up to ${usd0(data.risk.totalCapUsd)}` : ''}.</div>` : ''}
  </td></tr>

  <tr><td style="height:18px;"></td></tr>
  ${contextStrip}
  ${positions.length ? section('Your positions') + positions.map(positionCard).join('') : ''}
  ${section(buys.length ? 'Buy signals' : 'Today')}
  ${buys.length ? buys.map(buyCard).join('') : noBuys}

  ${exits.length ? `${section('If you are holding')}
  <tr><td style="padding:0 0 14px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.amberBg};border:1px solid #f1d58a;border-radius:10px;">
      ${exits.map((r) => `<tr><td style="padding:12px 16px;font-size:14px;color:${C.ink};"><b>${esc(r.fund)}</b>: ${esc(r.signal.reasons.filter((x) => /exit/i.test(x)).join('; '))}</td></tr>`).join('')}
    </table>
  </td></tr>` : ''}

  ${watches.length ? `${section('On watch')}
  <tr><td style="padding:0 0 14px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-left:4px solid #f1d58a;border-radius:10px;">
      ${watches.map((r) => `<tr><td style="padding:12px 16px;font-size:14px;line-height:1.5;color:${C.ink};border-bottom:1px solid ${C.line};"><b>${esc(r.fund)}</b>: ${esc(r.trend.reason)}.<div style="font-size:13px;color:${C.sub};">${esc(r.trend.trigger ?? '')}. No order until then.</div></td></tr>`).join('')}
    </table>
  </td></tr>` : ''}

  ${section('Watchlist')}
  <tr><td style="padding:0 0 14px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-radius:10px;border-collapse:separate;overflow:hidden;">
      <tr>${th('Fund')}${th('Index')}${th('Day', 'right')}${th('vs 200d', 'right')}${th('RSI(2)', 'right')}${th('Status', 'right')}</tr>
      ${rows}
    </table>
  </td></tr>

  ${trendRows ? `${section(`Trends${withTrend[0]?.trend?.asOf ? ` · closes through ${new Date(withTrend[0].trend.asOf + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}` : ''}`)}
  <tr><td style="padding:0 0 14px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-radius:10px;border-collapse:separate;overflow:hidden;">
      <tr>${th('Fund / index')}${th('5D', 'right')}${th('1M', 'right')}${th('3M', 'right')}${th('6M', 'right')}</tr>
      ${trendRows}
    </table>
    <div style="font-size:11px;color:${C.sub};padding:6px 4px 0 4px;">Fund in bold, its index beneath. Returns: 5D = 5 trading sessions; 1M, 3M and 6M are calendar months, as on Yahoo. Ends at the latest close (live price during market hours), dividend-adjusted. Watch and Pass are context only: only a Buy gets an order ticket.</div>
  </td></tr>` : ''}
  ${offRows ? `${section('Off the high')}
  <tr><td style="padding:0 0 14px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-radius:10px;border-collapse:separate;overflow:hidden;">
      <tr>${th('Fund / index')}${th('5D', 'right')}${th('1M', 'right')}${th('3M', 'right')}${th('6M', 'right')}${th('12M', 'right')}</tr>
      ${offRows}
    </table>
    ${highLines ? `<div style="font-size:12px;line-height:1.6;color:${C.ink};padding:8px 4px 0 4px;">${highLines}</div>` : ''}
    <div style="font-size:11px;color:${C.sub};padding:6px 4px 0 4px;">How far below the highest close in each period (0% = at the high). The highs are daily closes, so they can sit below the intraday highs on Yahoo's chart. A longer period repeats a shorter one's number when its high falls in the shorter period.</div>
  </td></tr>` : ''}

  ${ai.backdrop ? `${section('Market backdrop')}
  <tr><td style="padding:0 0 14px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-radius:10px;">
      <tr><td style="padding:14px 16px;font-size:14px;line-height:1.55;color:${C.ink};">${esc(ai.backdrop)}</td></tr>
    </table>
  </td></tr>` : ''}

  ${errors.length ? `<tr><td style="padding:0 0 14px 0;font-size:13px;color:${C.red};">Data errors: ${errors.map((e) => esc(e.fund)).join(', ')}. Check those funds manually.</td></tr>` : ''}

  <tr><td style="padding:8px 4px 0 4px;font-size:12px;line-height:1.5;color:${C.sub};">
    ${data.risk ? esc(data.risk.description) + '<br><br>' : ''}Rules: buy when the index is above its 200-day average and RSI(2) is under 10 or it closes at a 7-day low. Exit on a close above the 5-day average (RSI) or a 7-day high (Double 7s), after 7 sessions, or if the fund is down ${data.risk?.stopLossPct ?? 25}%.<br><br>
    ${ctx.description ? esc(ctx.description) + '<br><br>' : ''}
    Rules-based alert, not advice. Check the live price before placing the order.
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

const subject = !data.marketOpen
  ? `Market closed · ${data.date}`
  : sells.length
    ? `SELL ${sells.map((p) => p.fund).join(', ')}${buys.length ? ` · BUY ${data.topPick ?? buys[0].fund}` : ''} · ${data.date}`
    : buys.length
    ? `BUY ${data.topPick ?? buys[0].fund}${buys.length > 1 ? ` (top pick of ${buys.length})` : ''} · ${data.date}`
    : `No new buys · ${data.date}`;

return [{ json: { html, subject } }];
