const { num } = require('./util');
const { netFetch } = require('./browser');

const money = (v) => (num(v) || 0).toFixed(2);

// /user/balance -> { windows: [], note } or { error }
function parseBalance(body) {
  if (!body || !Array.isArray(body.balance_infos) || !body.balance_infos.length) return { error: 'deepseek_format' };
  const amounts = body.balance_infos
    .filter((b) => b && b.currency != null)
    .map((b) => `${String(b.currency).toUpperCase()} ${money(b.total_balance)}`);
  const noteParams = { amount: amounts.join(' · ') };
  if (body.is_available === false) return { windows: [], note: 'balance', noteParams, error: 'deepseek_unavailable' };
  return { windows: [], note: 'balance', noteParams };
}

async function run(cfg) {
  const key = cfg.deepseekApiKey;
  if (!key) return { action: 'key', error: 'deepseek_nokey' };
  const r = await netFetch('https://api.deepseek.com/user/balance', { headers: { Authorization: `Bearer ${key}` } });
  if (r.status === 401 || r.status === 403) return { action: 'key', error: 'deepseek_badkey' };
  if (r.status !== 200) return { error: 'http', errorParams: { name: 'DeepSeek', status: r.status } };
  let body = null;
  try {
    body = await r.json();
  } catch (_) {}
  if (!body) return { error: 'deepseek_format' };
  return parseBalance(body);
}

module.exports = {
  id: 'deepseek',
  name: 'DeepSeek',
  loginUrl: null,
  settings: [{ key: 'deepseekApiKey', type: 'secret' }],
  run,
  parseBalance,
};
