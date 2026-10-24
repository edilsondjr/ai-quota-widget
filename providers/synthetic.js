const { num, toMs } = require('./util');
const { netFetch } = require('./browser');

// GET /v2/quotas -> { windows } or { error }
function parseQuotas(body) {
  const s = body && body.subscription;
  if (!s || typeof s !== 'object') return { error: 'synthetic_format' };
  const limit = num(s.limit);
  const used = num(s.requests) ?? 0;
  if (limit == null || limit <= 0) return { error: 'synthetic_format' };
  return {
    windows: [
      {
        key: 'synthetic_requests',
        percent: Math.min(100, (used / limit) * 100),
        resetsAt: toMs(s.renewsAt),
        detail: `${used} / ${limit}`,
      },
    ],
  };
}

async function run(cfg) {
  const key = cfg.syntheticApiKey;
  if (!key) return { action: 'key', error: 'synthetic_nokey' };
  const r = await netFetch('https://api.synthetic.new/v2/quotas', { headers: { Authorization: `Bearer ${key}` } });
  if (r.status === 401 || r.status === 403) return { action: 'key', error: 'synthetic_badkey' };
  if (r.status !== 200) return { error: 'http', errorParams: { name: 'Synthetic', status: r.status } };
  let body = null;
  try {
    body = await r.json();
  } catch (_) {}
  if (!body) return { error: 'synthetic_format' };
  return parseQuotas(body);
}

module.exports = {
  id: 'synthetic',
  name: 'Synthetic',
  loginUrl: null,
  settings: [{ key: 'syntheticApiKey', type: 'secret' }],
  run,
  parseQuotas,
};
