const { num, toMs } = require('./util');
const { netFetch } = require('./browser');

const WINDOWS = [
  ['nanogpt_daily_tokens', 'dailyInputTokens'],
  ['nanogpt_weekly_tokens', 'weeklyInputTokens'],
  ['nanogpt_daily_images', 'dailyImages'],
];

// GET /api/management/v1/subscription/usage -> { windows } or { error }
function parseUsage(body) {
  if (!body || typeof body !== 'object') return { error: 'nanogpt_format' };
  const windows = [];
  let degraded = !!body.degraded;
  for (const [key, field] of WINDOWS) {
    const q = body[field];
    if (!q || typeof q !== 'object') continue;
    if (q.degraded) degraded = true;
    const pct = num(q.percentUsed);
    if (pct == null) continue;
    const used = num(q.used);
    const remaining = num(q.remaining);
    const total = used != null && remaining != null ? used + remaining : null;
    windows.push({
      key,
      percent: Math.min(100, pct * 100),
      resetsAt: toMs(q.resetAt),
      detail: used != null && total != null ? `${used} / ${total}` : null,
    });
  }
  if (!windows.length) return { error: degraded ? 'nanogpt_degraded' : 'nanogpt_noquota' };
  return { windows, plan: body.state || null };
}

async function run(cfg) {
  const key = cfg.nanogptManagementToken;
  if (!key) return { action: 'key', error: 'nanogpt_nokey' };
  const r = await netFetch('https://nano-gpt.com/api/management/v1/subscription/usage', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (r.status === 401 || r.status === 403) return { action: 'key', error: 'nanogpt_badkey' };
  if (r.status !== 200) return { error: 'http', errorParams: { name: 'NanoGPT', status: r.status } };
  let body = null;
  try {
    body = await r.json();
  } catch (_) {}
  if (!body) return { error: 'nanogpt_format' };
  return parseUsage(body);
}

module.exports = {
  id: 'nanogpt',
  name: 'NanoGPT',
  loginUrl: null,
  settings: [{ key: 'nanogptManagementToken', type: 'secret' }],
  run,
  parseUsage,
};
