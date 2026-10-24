const { num } = require('./util');
const { netFetch } = require('./browser');

const money = (v) => (num(v) || 0).toFixed(2);

// /v1/users/me/balance -> { windows: [], note } or { error }
function parseBalance(body) {
  const d = body && body.data;
  if (!body || body.status === false || !d || typeof d !== 'object') return { error: 'moonshot_format' };
  if (body.code != null && Number(body.code) !== 0) return { error: 'moonshot_format' };
  const available = num(d.available_balance);
  if (available == null) return { error: 'moonshot_format' };
  return {
    windows: [],
    note: 'balance_detail',
    noteParams: { amount: money(available), cash: money(d.cash_balance), voucher: money(d.voucher_balance) },
  };
}

async function run(cfg) {
  const key = cfg.moonshotApiKey;
  if (!key) return { action: 'key', error: 'moonshot_nokey' };
  const r = await netFetch('https://api.moonshot.ai/v1/users/me/balance', { headers: { Authorization: `Bearer ${key}` } });
  if (r.status === 401 || r.status === 403) return { action: 'key', error: 'moonshot_badkey' };
  if (r.status !== 200) return { error: 'http', errorParams: { name: 'Moonshot', status: r.status } };
  let body = null;
  try {
    body = await r.json();
  } catch (_) {}
  if (!body) return { error: 'moonshot_format' };
  return parseBalance(body);
}

module.exports = {
  id: 'moonshot',
  name: 'Moonshot (Kimi)',
  loginUrl: null,
  settings: [{ key: 'moonshotApiKey', type: 'secret' }],
  run,
  parseBalance,
};
