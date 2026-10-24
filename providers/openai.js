const { num, money } = require('./util');
const { netFetch } = require('./browser');

function monthRange(now = Date.now()) {
  const d = new Date(now);
  return {
    start: Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000),
    end: Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000),
  };
}

// /organization/costs -> { windows: [], note } or { error }
function parseCosts(body) {
  if (!body || !Array.isArray(body.data)) return { error: 'openai_format' };
  const totals = new Map();
  for (const bucket of body.data) {
    for (const result of bucket.results || []) {
      const amount = result && result.amount;
      const value = amount ? num(amount.value) : null;
      if (value == null) continue;
      const currency = String(amount.currency || 'usd').toUpperCase();
      totals.set(currency, (totals.get(currency) || 0) + value);
    }
  }
  const amount = [...totals.entries()].map(([currency, value]) => money(currency, value)).join(' · ') || money('USD', 0);
  return { windows: [], note: 'cost_month', noteParams: { amount } };
}

async function run(cfg) {
  const key = cfg.openaiAdminKey;
  if (!key) return { action: 'key', error: 'openai_nokey' };
  const { start, end } = monthRange();
  const url = `https://api.openai.com/v1/organization/costs?start_time=${start}&end_time=${end}&bucket_width=1d&limit=31`;
  const r = await netFetch(url, { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } });
  if (r.status === 401 || r.status === 403) return { action: 'key', error: 'openai_badkey' };
  if (r.status !== 200) return { error: 'http', errorParams: { name: 'OpenAI', status: r.status } };
  let body = null;
  try {
    body = await r.json();
  } catch (_) {}
  if (!body) return { error: 'openai_format' };
  return parseCosts(body);
}

module.exports = {
  id: 'openai',
  name: 'OpenAI API',
  loginUrl: null,
  settings: [{ key: 'openaiAdminKey', type: 'secret' }],
  run,
  parseCosts,
  monthRange,
};
