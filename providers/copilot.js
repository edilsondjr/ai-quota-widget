const { num } = require('./util');
const { netFetch } = require('./browser');

const DEFAULT_ALLOWANCE = 300;
const API_VERSION = '2026-03-10';

// The documented SKU is "Copilot Premium Request"; accept "premium_request" too.
const isPremiumSku = (sku) => {
  const s = String(sku || '').toLowerCase();
  return s.includes('premium') && s.includes('request');
};

function sumPremiumRequests(items) {
  let total = 0;
  for (const item of items || []) {
    if (!isPremiumSku(item && item.sku)) continue;
    total += num(item.grossQuantity) || 0;
  }
  return total;
}

const qty = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(2)));

// /users/<name>/settings/billing/premium_request/usage (current month) -> { windows } or { error }
function parseUsage(body, cfg = {}, now = Date.now()) {
  if (!body || !Array.isArray(body.usageItems)) return { error: 'copilot_format' };
  const allowance = num(cfg.copilotMonthlyRequests) || DEFAULT_ALLOWANCE;
  const used = sumPremiumRequests(body.usageItems);
  const d = new Date(now);
  return {
    windows: [
      {
        key: 'premium_requests',
        percent: Math.min(100, (used / allowance) * 100),
        resetsAt: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1),
        detail: `${qty(used)} / ${qty(allowance)}`,
      },
    ],
  };
}

async function run(cfg) {
  const token = cfg.githubToken;
  if (!token) return { action: 'key', error: 'copilot_nokey' };
  const username = typeof cfg.githubUsername === 'string' ? cfg.githubUsername.trim() : '';
  if (!username) return { action: 'key', error: 'copilot_nouser' };

  const url = `https://api.github.com/users/${encodeURIComponent(username)}/settings/billing/premium_request/usage`;
  const r = await netFetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'quota-widget',
    },
  });
  if (r.status === 401 || r.status === 403) return { action: 'key', error: 'copilot_badkey' };
  if (r.status === 404) return { error: 'copilot_notfound' };
  if (r.status !== 200) return { error: 'http', errorParams: { name: 'GitHub', status: r.status } };
  let body = null;
  try {
    body = await r.json();
  } catch (_) {}
  if (!body) return { error: 'copilot_format' };
  return parseUsage(body, cfg);
}

module.exports = {
  id: 'copilot',
  name: 'GitHub Copilot',
  loginUrl: null,
  settings: [
    { key: 'githubToken', type: 'secret' },
    { key: 'githubUsername', type: 'string' },
    { key: 'copilotMonthlyRequests', type: 'number', min: 1, default: DEFAULT_ALLOWANCE },
  ],
  run,
  parseUsage,
};
