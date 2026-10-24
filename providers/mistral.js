const { num, money } = require('./util');
const { netFetch } = require('./browser');

const pad = (n) => String(n).padStart(2, '0');

function monthRange(now = Date.now()) {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return {
    start: `${y}-${pad(m + 1)}-01`,
    end: `${y}-${pad(m + 1)}-${pad(d.getUTCDate())}`,
    nextMonth: Date.UTC(y, m + 1, 1),
  };
}

function parseSubscription(body) {
  if (!body || typeof body !== 'object') return { error: 'mistral_format' };
  const budget = num(body.monthly_budget);
  const currency = String(body.currency || 'EUR').toUpperCase();
  return { monthlyBudget: budget != null && budget > 0 ? budget : null, currency };
}

// /v1/billing/usage -> { spent, input, output } or { error }
function parseUsage(body) {
  if (!body || !Array.isArray(body.data)) return { error: 'mistral_format' };
  let spent = 0;
  let input = 0;
  let output = 0;
  for (const row of body.data) {
    spent += num(row.total_cost) || 0;
    input += num(row.input_tokens) || 0;
    output += num(row.output_tokens) || 0;
  }
  return { spent, input, output };
}

async function run(cfg) {
  const key = cfg.mistralApiKey;
  if (!key) return { action: 'key', error: 'mistral_nokey' };
  const { start, end, nextMonth } = monthRange();
  const headers = { Authorization: `Bearer ${key}` };

  const subRes = await netFetch('https://api.mistral.ai/v1/billing/subscription', { headers });
  if (subRes.status === 401 || subRes.status === 403) return { action: 'key', error: 'mistral_badkey' };
  if (subRes.status !== 200) return { error: 'http', errorParams: { name: 'Mistral', status: subRes.status } };
  let subBody = null;
  try {
    subBody = await subRes.json();
  } catch (_) {}
  const sub = parseSubscription(subBody);
  if (sub.error) return sub;

  const usageRes = await netFetch(
    `https://api.mistral.ai/v1/billing/usage?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`,
    { headers }
  );
  if (usageRes.status === 401 || usageRes.status === 403) return { action: 'key', error: 'mistral_badkey' };
  if (usageRes.status !== 200) return { error: 'http', errorParams: { name: 'Mistral', status: usageRes.status } };
  let usageBody = null;
  try {
    usageBody = await usageRes.json();
  } catch (_) {}
  const usage = parseUsage(usageBody);
  if (usage.error) return usage;

  const detail = `${money(sub.currency, usage.spent)} / ${money(sub.currency, sub.monthlyBudget)}`;
  const windows = sub.monthlyBudget
    ? [
        {
          key: 'mistral_month',
          percent: Math.min(100, (usage.spent / sub.monthlyBudget) * 100),
          resetsAt: nextMonth,
          detail,
        },
      ]
    : [];
  return {
    windows,
    note: sub.monthlyBudget ? 'mistral_tokens' : 'mistral_usage',
    noteParams: {
      amount: money(sub.currency, usage.spent),
      input: usage.input,
      output: usage.output,
    },
  };
}

module.exports = {
  id: 'mistral',
  name: 'Mistral',
  loginUrl: null,
  settings: [{ key: 'mistralApiKey', type: 'secret' }],
  run,
  parseSubscription,
  parseUsage,
  monthRange,
};
