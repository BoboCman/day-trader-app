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
            <span style="font-size:13px;color:${C.sub};padding-left:6px;">day ${p.day} of ${p.maxDays} · ${p.shares} sh @ ${money(p.entryPrice)}</span>
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
              `<b>Cancel your GTC stop</b> on ${esc(p.fund)} first`,
              `<b>Sell ${p.shares} ${esc(p.fund)}</b> · limit <b>${money(limit)}</b> · day order · place 3:45-3:55 PM ET`,
              `Mark it sold${appUrl ? ` at <a href="${esc(appUrl)}/positions" style="color:${C.brand};">${esc(appUrl.replace(/^https?:\/\//, ''))}/positions</a>` : ' on the positions page'}`,
            ])
          : `<div style="font-size:13px;color:${C.sub};padding-top:10px;">No exit rule met. Keep holding; your stop stays in place.</div>`}
      </td></tr>
    </table>
  </td></tr>`;
};

const buyCard = (r) => {
  const s = r.signal, o = r.order;
  const top = !o || o.recommended !== false;
  const accent = top ? C.green : '#c4c9d1';
  const orderRow = o
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:8px;border-collapse:separate;margin-top:12px;">
        <tr>
          ${stat('Limit price', money(o.suggestedLimit), `last ${money(o.fundPrice)}`)}
          ${stat('Size', `${o.fullShares} sh`, `≈ ${usd0(o.fullShares * o.suggestedLimit)} · typical day ±${usd0(o.typicalDayUsd ?? 0)}`)}
          <td style="padding:10px 12px;" valign="top">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:${C.sub};">Half size</div>
            <div style="font-size:18px;font-weight:700;color:${C.ink};padding-top:2px;">${o.halfShares} sh</div>
            <div style="font-size:12px;color:${C.sub};">≈ ${usd0(o.halfShares * o.suggestedLimit)}</div>
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
        ${orderRow}
        ${o && top && o.fullShares === 0 ? `<div style="margin-top:12px;font-size:13px;color:${C.amber};background:${C.amberBg};border-radius:8px;padding:10px 12px;">Your $${Math.round(data.risk?.totalCapUsd ?? 0).toLocaleString('en-US')} cap is already in use by open positions. Skip this one, or only take it after you sell.</div>` : ''}
        ${o && top && o.fullShares > 0 ? ticket([
          `<b>Buy ${o.fullShares} ${esc(r.fund)}</b> · limit <b>${money(o.suggestedLimit)}</b> · day order · place 3:45-3:55 PM ET`,
          `Once filled: <b>sell stop ${o.fullShares} sh at ${money(o.stopPrice ?? o.suggestedLimit * (1 - (o.stopLossPct ?? 25) / 100))}</b> · good 'til canceled (${o.stopLossPct ?? 25}% stop)`,
          `Log the fill${appUrl ? ` at <a href="${esc(appUrl)}/positions" style="color:${C.brand};">${esc(appUrl.replace(/^https?:\/\//, ''))}/positions</a>` : ' on the positions page'} so tomorrow's email tracks it`,
        ]) : ''}
      </td></tr>
    </table>
  </td></tr>`;
};

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
  if (!r.signal.aboveTrend) return pill('Below 200-day', C.grey, C.greyBg);
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
  ${positions.length ? section('Your positions') + positions.map(positionCard).join('') : ''}
  ${section(buys.length ? 'Buy signals' : 'Today')}
  ${buys.length ? buys.map(buyCard).join('') : noBuys}

  ${exits.length ? `${section('If you are holding')}
  <tr><td style="padding:0 0 14px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.amberBg};border:1px solid #f1d58a;border-radius:10px;">
      ${exits.map((r) => `<tr><td style="padding:12px 16px;font-size:14px;color:${C.ink};"><b>${esc(r.fund)}</b>: ${esc(r.signal.reasons.filter((x) => /exit/i.test(x)).join('; '))}</td></tr>`).join('')}
    </table>
  </td></tr>` : ''}

  ${section('Watchlist')}
  <tr><td style="padding:0 0 14px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-radius:10px;border-collapse:separate;overflow:hidden;">
      <tr>${th('Fund')}${th('Index')}${th('Day', 'right')}${th('vs 200d', 'right')}${th('RSI(2)', 'right')}${th('Status', 'right')}</tr>
      ${rows}
    </table>
  </td></tr>

  ${ai.backdrop ? `${section('Market backdrop')}
  <tr><td style="padding:0 0 14px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-radius:10px;">
      <tr><td style="padding:14px 16px;font-size:14px;line-height:1.55;color:${C.ink};">${esc(ai.backdrop)}</td></tr>
    </table>
  </td></tr>` : ''}

  ${errors.length ? `<tr><td style="padding:0 0 14px 0;font-size:13px;color:${C.red};">Data errors: ${errors.map((e) => esc(e.fund)).join(', ')}. Check those funds manually.</td></tr>` : ''}

  <tr><td style="padding:8px 4px 0 4px;font-size:12px;line-height:1.5;color:${C.sub};">
    ${data.risk ? esc(data.risk.description) + '<br><br>' : ''}Rules: buy when the index is above its 200-day average and RSI(2) is under 10 or it closes at a 7-day low. Exit on a close above the 5-day average (RSI) or a 7-day high (Double 7s), after 7 sessions, or if the fund is down 25%.<br><br>
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
