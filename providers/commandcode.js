const { num, toMs } = require('./util');
const { netFetch } = require('./browser');

async function get(p, key) {
  const r = await netFetch('https://api.commandcode.ai' + p, { headers: { Authorization: `Bearer ${key}` } });
  const text = await r.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch (_) {}
  return { status: r.status, body };
}

// /alpha/billing/credits + /alpha/usage/summary + /alpha/billing/subscriptions
// -> { windows, plan, note }
function parseCredits(body, plan = null, monthly = {}) {
  const wl = body.windowLimits || {};
  const windows = [];
  // `month` is accepted as an alias in case the endpoint names the monthly window that way.
  for (const [k, key] of [['fiveHour', 'five_hour'], ['weekly', 'weekly'], ['monthly', 'monthly'], ['month', 'monthly']]) {
    const w = wl[k];
    if (!w) continue;
    if (windows.some((x) => x.key === key)) continue;
    const used = num(w.used);
    const cap = num(w.cap);
    windows.push({ key, percent: cap ? Math.min(100, (used / cap) * 100) : 0, resetsAt: toMs(w.resetAt), detail: cap ? `${used != null ? +used.toFixed(2) : 0} / ${cap}` : null });
  }
  const cr = body.credits || {};
  const monthlyCredits = num(cr.monthlyCredits);
  const remaining = [cr.monthlyCredits, cr.purchasedCredits, cr.freeCredits]
    .map((v) => num(v))
    .filter((v) => v != null && v > 0)
    .reduce((sum, v) => sum + v, 0);

  // The monthly pool is not a windowLimits entry: it is spend from /alpha/usage/summary
  // over (spend + remaining credits), resetting at the subscription period end.
  if (!windows.some((w) => w.key === 'monthly')) {
    const spent = num(monthly.totalCost);
    const pool = (spent || 0) + remaining;
    if (spent != null && spent >= 0 && pool > 0) {
      windows.push({
        key: 'monthly',
        percent: Math.min(100, (spent / pool) * 100),
        resetsAt: toMs(monthly.resetAt),
        detail: `$${spent.toFixed(2)} / $${pool.toFixed(2)}`,
      });
    }
  }

  return { windows, plan, note: monthlyCredits != null ? 'credits_left' : null, noteParams: { amount: remaining.toFixed(2) } };
}

// /alpha/billing/subscriptions -> plan id (or null)
const parsePlan = (body) => body?.data?.planId || null;

async function run(cfg) {
  const key = cfg.commandcodeApiKey;
  if (!key) return { action: 'key', error: 'cc_nokey' };
  const c = await get('/alpha/billing/credits', key);
  if (c.status === 401 || c.status === 403) return { action: 'key', error: 'cc_invalid' };
  if (c.status !== 200 || !c.body) return { error: 'http', errorParams: { name: 'Command Code', status: c.status } };

  let plan = null;
  const monthly = {};
  try {
    const sub = await get('/alpha/billing/subscriptions', key);
    const data = sub.body && sub.body.data;
    plan = parsePlan(sub.body);
    if (data && data.currentPeriodEnd) monthly.resetAt = data.currentPeriodEnd;
    if (data && data.currentPeriodStart) {
      const summary = await get(`/alpha/usage/summary?since=${encodeURIComponent(data.currentPeriodStart)}`, key);
      if (summary.status === 200 && summary.body) monthly.totalCost = num(summary.body.totalCost);
    }
  } catch (_) {}

  return parseCredits(c.body, plan, monthly);
}

module.exports = {
  id: 'commandcode',
  name: 'Command Code',
  loginUrl: null,
  settings: [{ key: 'commandcodeApiKey', type: 'secret' }],
  run,
  parseCredits,
  parsePlan,
};
