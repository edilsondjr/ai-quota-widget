const { num, money } = require('./util');
const { netFetch } = require('./browser');

function monthRange(now = Date.now()) {
  const d = new Date(now);
  return {
    start: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(),
    end: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString(),
  };
}

// /v1/organizations/cost_report -> { windows: [], note } or { error }
// The cost_report amount is a decimal string in cents; convert it to dollars.
function parseCosts(body) {
  if (!body || !Array.isArray(body.data)) return { error: 'anthropic_format' };
  const totals = new Map();
  for (const bucket of body.data) {
    for (const result of bucket.results || []) {
      const cents = num(result && result.amount);
      if (cents == null) continue;
      const currency = String(result.currency || 'USD').toUpperCase();
      totals.set(currency, (totals.get(currency) || 0) + cents / 100);
    }
  }
  const amount = [...totals.entries()].map(([currency, value]) => money(currency, value)).join(' · ') || money('USD', 0);
  return { windows: [], note: 'cost_month', noteParams: { amount } };
}

async function run(cfg) {
  const key = cfg.anthropicAdminKey;
  if (!key) return { action: 'key', error: 'anthropic_nokey' };
  const { start, end } = monthRange();
  const all = { data: [] };
  let page = null;

  for (let i = 0; i < 10; i++) {
    const query = [
      `starting_at=${encodeURIComponent(start)}`,
      `ending_at=${encodeURIComponent(end)}`,
      'bucket_width=1d',
      'limit=31',
    ];
    if (page) query.push(`page=${encodeURIComponent(page)}`);

    const r = await netFetch(`https://api.anthropic.com/v1/organizations/cost_report?${query.join('&')}`, {
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'User-Agent': 'quota-widget',
      },
    });
    if (r.status === 401 || r.status === 403) return { action: 'key', error: 'anthropic_badkey' };
    if (r.status !== 200) return { error: 'http', errorParams: { name: 'Anthropic', status: r.status } };

    let body = null;
    try {
      body = await r.json();
    } catch (_) {}
    if (!body) return { error: 'anthropic_format' };
    if (Array.isArray(body.data)) all.data.push(...body.data);
    if (!body.has_more || !body.next_page) break;
    page = body.next_page;
  }

  return parseCosts(all);
}

module.exports = {
  id: 'anthropic',
  name: 'Anthropic API',
  loginUrl: null,
  settings: [{ key: 'anthropicAdminKey', type: 'secret' }],
  run,
  parseCosts,
  monthRange,
};
