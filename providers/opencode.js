const { num, toMs } = require('./util');
const { netFetch } = require('./browser');

const WINDOWS = [
  ['five_hour', 'rolling'],
  ['weekly', 'weekly'],
  ['monthly', 'monthly'],
];

// GET /zen/go/v1/usage -> { windows } or { error }
// The endpoint returns used percentages (0-100), not fractions.
function parseUsage(body) {
  const u = body && body.usage;
  if (!u || typeof u !== 'object') return { error: 'opencode_format' };
  const windows = [];
  for (const [key, field] of WINDOWS) {
    const w = u[field];
    if (!w || typeof w !== 'object') continue;
    const pct = num(w.percent);
    if (pct == null) continue;
    windows.push({
      key,
      percent: w.status === 'rate-limited' ? 100 : Math.min(100, Math.max(0, pct)),
      resetsAt: toMs(w.resetsAt),
    });
  }
  if (!windows.length) return { error: 'opencode_noquota' };
  return { windows };
}

async function run(cfg) {
  const key = cfg.opencodeApiKey;
  if (!key) return { action: 'key', error: 'opencode_nokey' };
  const r = await netFetch('https://opencode.ai/zen/go/v1/usage', { headers: { Authorization: `Bearer ${key}` } });
  if (r.status === 401) return { action: 'key', error: 'opencode_badkey' };
  if (r.status === 403) return { action: 'key', error: 'opencode_nosub' };
  if (r.status === 404) return { error: 'opencode_format' };
  if (r.status !== 200) return { error: 'http', errorParams: { name: 'OpenCode', status: r.status } };
  let body = null;
  try {
    body = await r.json();
  } catch (_) {}
  if (!body) return { error: 'opencode_format' };
  return parseUsage(body);
}

module.exports = {
  id: 'opencode',
  name: 'OpenCode Go',
  loginUrl: null,
  settings: [{ key: 'opencodeApiKey', type: 'secret' }],
  run,
  parseUsage,
};
