const { num } = require('./util');
const { netFetch } = require('./browser');

const money = (v) => (num(v) || 0).toFixed(2);

// Window rollover in UTC. A weekly limit resets on Monday 00:00 UTC.
function nextReset(kind, now = Date.now()) {
  const d = new Date(now);
  if (kind === 'daily') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  if (kind === 'weekly') {
    const add = 7 - ((d.getUTCDay() + 6) % 7);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + add);
  }
  if (kind === 'monthly') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return null;
}

function periodUsage(d) {
  if (d.limit_reset === 'daily') return num(d.usage_daily) ?? num(d.usage) ?? 0;
  if (d.limit_reset === 'weekly') return num(d.usage_weekly) ?? num(d.usage) ?? 0;
  if (d.limit_reset === 'monthly') return num(d.usage_monthly) ?? num(d.usage) ?? 0;
  return num(d.usage) ?? 0;
}

// /api/v1/key -> { windows, note? } or { error }
function parseKey(body, now = Date.now()) {
  const d = body && body.data;
  if (!d || typeof d !== 'object') return { error: 'openrouter_format' };

  const windows = [];
  const limit = num(d.limit);
  if (limit != null && limit > 0) {
    const used = periodUsage(d);
    windows.push({
      key: 'key_limit',
      percent: Math.min(100, (used / limit) * 100),
      resetsAt: nextReset(d.limit_reset, now),
      detail: `$${money(used)} / $${money(limit)}`,
    });
  }

  const free = d.free_model_daily_requests;
  if (free && typeof free === 'object') {
    const used = num(free.used) || 0;
    const cap = num(free.limit);
    if (cap != null && cap > 0) {
      windows.push({
        key: 'free_requests',
        percent: Math.min(100, (used / cap) * 100),
        resetsAt: nextReset('daily', now),
        detail: `${used} / ${cap}`,
      });
    }
  }

  if (limit == null) {
    const spent = num(d.usage_monthly) ?? num(d.usage) ?? 0;
    return { windows, note: 'spent_month', noteParams: { amount: money(spent) } };
  }
  if (!windows.length) return { error: 'openrouter_format' };
  return { windows };
}

async function run(cfg) {
  const key = cfg.openrouterApiKey;
  if (!key) return { action: 'key', error: 'openrouter_nokey' };
  const r = await netFetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` } });
  if (r.status === 401 || r.status === 403) return { action: 'key', error: 'openrouter_badkey' };
  if (r.status !== 200) return { error: 'http', errorParams: { name: 'OpenRouter', status: r.status } };
  let body = null;
  try {
    body = await r.json();
  } catch (_) {}
  if (!body) return { error: 'openrouter_format' };
  return parseKey(body);
}

module.exports = {
  id: 'openrouter',
  name: 'OpenRouter',
  loginUrl: null,
  settings: [{ key: 'openrouterApiKey', type: 'secret' }],
  run,
  parseKey,
  nextReset,
};
