// Tests for the response parsers. The fixtures in test/fixtures are SYNTHETIC: they follow the
// shape the parsers expect, with no real account data. If a service changes its format,
// update the fixture with an anonymized response and fix the parser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const json = (name) => JSON.parse(fixture(name));

const claude = require('../providers/claude');
const chatgpt = require('../providers/chatgpt');
const commandcode = require('../providers/commandcode');
const ollama = require('../providers/ollama');
const openrouter = require('../providers/openrouter');
const deepseek = require('../providers/deepseek');
const moonshot = require('../providers/moonshot');
const copilot = require('../providers/copilot');
const synthetic = require('../providers/synthetic');
const nanogpt = require('../providers/nanogpt');
const openai = require('../providers/openai');
const anthropic = require('../providers/anthropic');
const xai = require('../providers/xai');
const mistral = require('../providers/mistral');
const opencode = require('../providers/opencode');
const { money } = require('../providers/util');

const iso = (s) => Date.parse(s);

// ---------- Claude ----------
test('claude: picks the chat organization', () => {
  assert.equal(claude.parseOrgs(json('claude-orgs.json')), '00000000-0000-4000-8000-000000000002');
});

test('claude: falls back to the first org, and null when there are none', () => {
  assert.equal(claude.parseOrgs([{ uuid: 'abc', capabilities: [] }]), 'abc');
  assert.equal(claude.parseOrgs([]), null);
  assert.equal(claude.parseOrgs({ error: 'x' }), null);
});

test('claude: parses known windows in display order and hides unknown ones', () => {
  const r = claude.parseUsage(json('claude-usage.json'));
  assert.deepEqual(
    r.windows.map((w) => w.key),
    ['five_hour', 'seven_day', 'seven_day_sonnet']
  );
  assert.equal(r.windows[0].percent, 42);
  assert.equal(r.windows[0].resetsAt, iso('2030-01-01T10:00:00Z'));
  assert.equal(r.windows[2].percent, 7.5);
});

test('claude: skips windows with null utilization (extra_usage disabled)', () => {
  const keys = claude.parseUsage(json('claude-usage.json'), { claudeShowUnknown: true }).windows.map((w) => w.key);
  assert.ok(!keys.includes('extra_usage'));
});

test('claude: shows unknown limits when claudeShowUnknown is on', () => {
  const r = claude.parseUsage(json('claude-usage.json'), { claudeShowUnknown: true });
  const unknown = r.windows.find((w) => w.key === 'iguana_necktie');
  assert.equal(unknown.percent, 99);
  assert.equal(unknown.resetsAt, null);
});

test('claude: reports no_windows when nothing is recognizable', () => {
  assert.deepEqual(claude.parseUsage({ something_else: 1 }), { error: 'no_windows' });
});

// ---------- ChatGPT ----------
test('chatgpt: maps 5 h and weekly windows', () => {
  const r = chatgpt.parseUsage(json('chatgpt-usage.json'));
  assert.equal(r.plan, 'plus');
  assert.deepEqual(
    r.windows.map((w) => [w.key, w.percent, w.resetsAt]),
    [
      ['five_hour', 18, 1893492000 * 1000],
      ['weekly', 61, 1893690000 * 1000],
    ]
  );
});

test('chatgpt: derives the reset from reset_after_seconds when reset_at is missing', () => {
  const body = { rate_limit: { primary_window: { used_percent: 5, limit_window_seconds: 18000, reset_after_seconds: 60 } } };
  assert.equal(chatgpt.parseUsage(body, 1000).windows[0].resetsAt, 1000 + 60 * 1000);
});

test('chatgpt: unusual durations keep their length in the key', () => {
  const body = { rate_limit: { primary_window: { used_percent: 5, limit_window_seconds: 3600 } } };
  assert.equal(chatgpt.parseUsage(body).windows[0].key, 'secs_3600');
});

test('chatgpt: reports no_windows (keeping the plan) when rate_limit is empty', () => {
  assert.deepEqual(chatgpt.parseUsage({ plan_type: 'free', rate_limit: {} }), { error: 'no_windows', plan: 'free' });
});

// ---------- Command Code ----------
test('commandcode: parses windows, rounds detail and sums credits', () => {
  const r = commandcode.parseCredits(json('commandcode-credits.json'), 'individual-example');
  assert.equal(r.plan, 'individual-example');
  assert.deepEqual(r.windows.map((w) => w.key), ['five_hour', 'weekly']);
  assert.equal(r.windows[0].detail, '0.53 / 14');
  assert.equal(r.windows[0].resetsAt, iso('2030-01-01T10:00:00Z'));
  assert.ok(Math.abs(r.windows[0].percent - (0.5309973759 / 14) * 100) < 1e-9);
  assert.equal(r.note, 'credits_left');
  assert.equal(r.noteParams.amount, '16.55');
});

test('commandcode: computes the monthly pool from spend, remaining credits and period end', () => {
  const r = commandcode.parseCredits(json('commandcode-credits.json'), 'individual-goat', {
    totalCost: 22.2592,
    resetAt: '2026-11-03T01:26:37.000Z',
  });
  const m = r.windows.find((w) => w.key === 'monthly');
  assert.ok(m);
  assert.ok(Math.abs(m.percent - (22.2592 / (22.2592 + 16.55)) * 100) < 1e-9);
  assert.equal(m.resetsAt, iso('2026-11-03T01:26:37Z'));
  assert.equal(m.detail, '$22.26 / $38.81');
});

test('commandcode: a fully spent monthly pool is 100%', () => {
  const r = commandcode.parseCredits({ credits: { monthlyCredits: 0, purchasedCredits: 0, freeCredits: 0 } }, null, { totalCost: 5 });
  assert.equal(r.windows[0].key, 'monthly');
  assert.equal(r.windows[0].percent, 100);
});

test('commandcode: caps percent at 100 and tolerates a zero cap', () => {
  const r = commandcode.parseCredits({ windowLimits: { fiveHour: { used: 20, cap: 10 }, weekly: { used: 1, cap: 0 } } });
  assert.equal(r.windows[0].percent, 100);
  assert.equal(r.windows[1].percent, 0);
  assert.equal(r.windows[1].detail, null);
  assert.equal(r.note, null);
});

test('commandcode: accepts month as an alias for the monthly window', () => {
  const r = commandcode.parseCredits({ windowLimits: { month: { used: 5, cap: 10, resetAt: '2030-02-01T10:00:00.000Z' } } });
  assert.equal(r.windows[0].key, 'monthly');
  assert.equal(r.windows[0].percent, 50);
});

test('commandcode: reads the plan id', () => {
  assert.equal(commandcode.parsePlan(json('commandcode-subscriptions.json')), 'individual-example');
  assert.equal(commandcode.parsePlan({}), null);
  assert.equal(commandcode.parsePlan(null), null);
});

// ---------- Ollama ----------
test('ollama: limits usage is a fraction and becomes a percent', () => {
  const w = ollama.parseLimits(json('ollama-usage-limits.json'));
  assert.deepEqual(
    w.map((x) => [x.key, x.percent, x.resetsAt]),
    [
      ['session', 21.3, iso('2030-01-01T10:00:00Z')],
      ['weekly', 50, iso('2030-01-05T10:00:00Z')],
    ]
  );
});

test('ollama: limits values above 1 are treated as percents already', () => {
  assert.equal(ollama.parseLimits({ limits: { session: { usage: 37 } } })[0].percent, 37);
});

test('ollama: limits ignores missing or invalid entries', () => {
  assert.deepEqual(ollama.parseLimits({}), []);
  assert.deepEqual(ollama.parseLimits({ limits: { session: { usage: 'n/a' } } }), []);
});

test('ollama: buckets sum only the current cycle against the plan allowance', () => {
  const now = new Date('2030-01-15T12:00:00Z');
  const r = ollama.parseBuckets(json('ollama-usage-buckets.json'), { ollamaBillingDay: 7 }, { plan: 'pro' }, now);
  const w = r.windows[0];
  assert.equal(w.key, 'month');
  assert.equal(w.detail, '$10.25 / $60');
  assert.ok(Math.abs(w.percent - (10.25 / 60) * 100) < 1e-9);
  assert.equal(w.resetsAt, Date.UTC(2030, 1, 7));
  assert.equal(r.note, 'requests_since');
  assert.deepEqual(r.noteParams, { since: Date.UTC(2030, 0, 7), spent: '10.25', requests: 25 });
});

test('ollama: billing day falls back to the account creation day', () => {
  const now = new Date('2030-01-15T12:00:00Z');
  const me = { plan: 'pro', createdAt: Date.UTC(2029, 5, 2) };
  const r = ollama.parseBuckets(json('ollama-usage-buckets.json'), {}, me, now);
  assert.equal(r.windows[0].detail, '$15.25 / $60'); // cycle starts Jan 2: all three buckets
});

test('ollama: configured monthly credit overrides the plan allowance', () => {
  const now = new Date('2030-01-15T12:00:00Z');
  const r = ollama.parseBuckets(json('ollama-usage-buckets.json'), { ollamaBillingDay: 7, ollamaMonthlyCredits: 20 }, { plan: 'max' }, now);
  assert.equal(r.windows[0].detail, '$10.25 / $20');
});

test('ollama: unknown allowance still reports the spend, with an error code', () => {
  const now = new Date('2030-01-15T12:00:00Z');
  const r = ollama.parseBuckets(json('ollama-usage-buckets.json'), { ollamaBillingDay: 7 }, {}, now);
  assert.deepEqual(r.windows, []);
  assert.equal(r.error, 'ollama_nocredit');
  assert.equal(r.note, 'cycle_spent');
});

test('ollama: cycleBounds handles short months and year rollover', () => {
  // day 31 in February is clamped to the 28th
  assert.deepEqual(ollama.cycleBounds(31, new Date('2030-02-28T12:00:00Z')), { start: Date.UTC(2030, 1, 28), end: Date.UTC(2030, 2, 31) });
  // before the billing day, the cycle started last month
  assert.deepEqual(ollama.cycleBounds(20, new Date('2030-01-05T00:00:00Z')), { start: Date.UTC(2029, 11, 20), end: Date.UTC(2030, 0, 20) });
  // after it, the cycle ends next year in December
  assert.deepEqual(ollama.cycleBounds(20, new Date('2029-12-25T00:00:00Z')), { start: Date.UTC(2029, 11, 20), end: Date.UTC(2030, 0, 20) });
});

// ---------- OpenRouter ----------
test('openrouter: uses the period spend for the key limit and the free daily window', () => {
  const now = Date.UTC(2030, 0, 15, 12);
  const r = openrouter.parseKey(json('openrouter-key.json'), now);
  const key = r.windows.find((w) => w.key === 'key_limit');
  assert.equal(key.detail, '$7.50 / $20.00');
  assert.ok(Math.abs(key.percent - (7.5 / 20) * 100) < 1e-9);
  assert.equal(key.resetsAt, Date.UTC(2030, 1, 1));
  const free = r.windows.find((w) => w.key === 'free_requests');
  assert.equal(free.detail, '12 / 50');
  assert.equal(free.percent, 24);
  assert.equal(free.resetsAt, Date.UTC(2030, 0, 16));
  assert.equal(r.note, undefined);
});

test('openrouter: resets are UTC', () => {
  assert.equal(openrouter.nextReset('daily', Date.UTC(2030, 0, 15, 23, 59)), Date.UTC(2030, 0, 16));
  // 2030-01-15 is a Tuesday; the next Monday is 2030-01-21
  assert.equal(openrouter.nextReset('weekly', Date.UTC(2030, 0, 15, 12)), Date.UTC(2030, 0, 21));
  assert.equal(openrouter.nextReset('monthly', Date.UTC(2030, 11, 31, 12)), Date.UTC(2031, 0, 1));
  assert.equal(openrouter.nextReset(null, Date.UTC(2030, 0, 15)), null);
});

test('openrouter: a key with no limit reports the month spend', () => {
  const body = { data: { limit: null, usage_monthly: 3.25, free_model_daily_requests: { used: 5, limit: 50 } } };
  const r = openrouter.parseKey(body, Date.UTC(2030, 0, 15, 12));
  assert.equal(r.note, 'spent_month');
  assert.deepEqual(r.noteParams, { amount: '3.25' });
  assert.deepEqual(r.windows.map((w) => w.key), ['free_requests']);
});

test('openrouter: a limit that never resets has no countdown', () => {
  const r = openrouter.parseKey({ data: { limit: 10, limit_reset: null, usage: 5 } }, Date.UTC(2030, 0, 15));
  assert.equal(r.windows[0].resetsAt, null);
  assert.equal(r.windows[0].detail, '$5.00 / $10.00');
});

test('openrouter: rejects a response with no data', () => {
  assert.deepEqual(openrouter.parseKey({}), { error: 'openrouter_format' });
});

// ---------- DeepSeek ----------
test('deepseek: reports one balance per currency and no windows', () => {
  const r = deepseek.parseBalance(json('deepseek-balance.json'));
  assert.deepEqual(r.windows, []);
  assert.equal(r.note, 'balance');
  assert.equal(r.noteParams.amount, 'CNY 110.00 · USD 5.50');
  assert.equal(r.error, undefined);
});

test('deepseek: marks an unavailable balance as an error but keeps the note', () => {
  const r = deepseek.parseBalance({ is_available: false, balance_infos: [{ currency: 'USD', total_balance: '0.00' }] });
  assert.equal(r.error, 'deepseek_unavailable');
  assert.equal(r.noteParams.amount, 'USD 0.00');
});

test('deepseek: rejects malformed responses', () => {
  assert.equal(deepseek.parseBalance({ is_available: true }).error, 'deepseek_format');
});

// ---------- Moonshot ----------
test('moonshot: reports the balance with cash and voucher detail', () => {
  const r = moonshot.parseBalance(json('moonshot-balance.json'));
  assert.deepEqual(r.windows, []);
  assert.equal(r.note, 'balance_detail');
  assert.deepEqual(r.noteParams, { amount: '49.59', cash: '3.00', voucher: '46.59' });
});

test('moonshot: rejects unsuccessful or incomplete responses', () => {
  assert.equal(moonshot.parseBalance({ status: false, data: {} }).error, 'moonshot_format');
  assert.equal(moonshot.parseBalance({ status: true, data: {} }).error, 'moonshot_format');
  assert.equal(moonshot.parseBalance({ status: true, code: 1, data: { available_balance: 1 } }).error, 'moonshot_format');
});

// ---------- GitHub Copilot ----------
test('copilot: sums only premium requests and divides by the allowance', () => {
  const r = copilot.parseUsage(json('copilot-premium-usage.json'), {}, Date.UTC(2030, 0, 15, 12));
  const w = r.windows[0];
  assert.equal(w.key, 'premium_requests');
  assert.equal(w.detail, '100 / 300');
  assert.ok(Math.abs(w.percent - (100 / 300) * 100) < 1e-9);
  assert.equal(w.resetsAt, Date.UTC(2030, 1, 1));
});

test('copilot: accepts the premium_request SKU and a configured allowance', () => {
  const body = { usageItems: [{ sku: 'premium_request', grossQuantity: 50 }] };
  const w = copilot.parseUsage(body, { copilotMonthlyRequests: 500 }, Date.UTC(2030, 0, 15)).windows[0];
  assert.equal(w.detail, '50 / 500');
  assert.equal(w.percent, 10);
});

test('copilot: no premium items reports zero usage', () => {
  assert.equal(copilot.parseUsage({ usageItems: [] }).windows[0].detail, '0 / 300');
});

test('copilot: rejects malformed responses', () => {
  assert.equal(copilot.parseUsage({}).error, 'copilot_format');
});

// ---------- Synthetic ----------
test('synthetic: subscription requests become a quota window', () => {
  const r = synthetic.parseQuotas(json('synthetic-quotas.json'));
  assert.equal(r.windows[0].key, 'synthetic_requests');
  assert.equal(r.windows[0].percent, 20);
  assert.equal(r.windows[0].detail, '27 / 135');
  assert.equal(r.windows[0].resetsAt, iso('2030-01-21T14:36:14.288Z'));
});

test('synthetic: rejects missing or empty subscriptions', () => {
  assert.equal(synthetic.parseQuotas({}).error, 'synthetic_format');
  assert.equal(synthetic.parseQuotas({ subscription: { limit: 0, requests: 1 } }).error, 'synthetic_format');
});

// ---------- NanoGPT ----------
test('nanogpt: maps the three subscription quota windows', () => {
  const r = nanogpt.parseUsage(json('nanogpt-usage.json'));
  assert.equal(r.plan, 'active');
  assert.deepEqual(
    r.windows.map((w) => [w.key, w.percent, w.detail, w.resetsAt]),
    [
      ['nanogpt_daily_tokens', 25, '250000 / 1000000', 1893456000000],
      ['nanogpt_weekly_tokens', 25, '1500000 / 6000000', 1893542400000],
      ['nanogpt_daily_images', 20, '2 / 10', 1893456000000],
    ]
  );
});

test('nanogpt: distinguishes degraded from missing quota', () => {
  assert.equal(nanogpt.parseUsage({ degraded: true }).error, 'nanogpt_degraded');
  assert.equal(nanogpt.parseUsage({ dailyInputTokens: { degraded: true } }).error, 'nanogpt_degraded');
  assert.equal(nanogpt.parseUsage({}).error, 'nanogpt_noquota');
});

// ---------- OpenAI ----------
test('openai: sums the month costs by currency', () => {
  const r = openai.parseCosts(json('openai-costs.json'));
  assert.deepEqual(r.windows, []);
  assert.equal(r.note, 'cost_month');
  assert.equal(r.noteParams.amount, '$1.56');
});

test('openai: monthRange covers the current UTC month', () => {
  assert.deepEqual(openai.monthRange(Date.UTC(2030, 0, 15, 12)), {
    start: Date.UTC(2030, 0, 1) / 1000,
    end: Date.UTC(2030, 1, 1) / 1000,
  });
});

test('openai: rejects malformed responses', () => {
  assert.equal(openai.parseCosts({}).error, 'openai_format');
});

// ---------- Anthropic API ----------
test('anthropic: converts cost_report cents to dollars', () => {
  const r = anthropic.parseCosts(json('anthropic-cost-report.json'));
  assert.deepEqual(r.windows, []);
  assert.equal(r.note, 'cost_month');
  assert.equal(r.noteParams.amount, '$1.24');
});

test('anthropic: monthRange uses RFC 3339 boundaries', () => {
  assert.deepEqual(anthropic.monthRange(Date.UTC(2030, 0, 15, 12)), {
    start: '2030-01-01T00:00:00.000Z',
    end: '2030-02-01T00:00:00.000Z',
  });
});

test('anthropic: rejects malformed responses', () => {
  assert.equal(anthropic.parseCosts({}).error, 'anthropic_format');
});

// ---------- xAI ----------
test('xai: sums every usage time series in USD', () => {
  const r = xai.parseUsage(json('xai-usage.json'));
  assert.deepEqual(r.windows, []);
  assert.equal(r.note, 'cost_month');
  assert.equal(r.noteParams.amount, '$2.00');
});

test('xai: monthRange uses the management API timestamp format', () => {
  assert.deepEqual(xai.monthRange(Date.UTC(2030, 0, 15, 12, 34, 56)), {
    startTime: '2030-01-01 00:00:00',
    endTime: '2030-01-15 12:34:56',
  });
});

test('xai: rejects malformed responses', () => {
  assert.equal(xai.parseUsage({}).error, 'xai_format');
});

// ---------- Mistral ----------
test('mistral: reads the monthly budget and sums billing usage', () => {
  const sub = mistral.parseSubscription(json('mistral-subscription.json'));
  assert.deepEqual(sub, { monthlyBudget: 100, currency: 'EUR' });
  const usage = mistral.parseUsage(json('mistral-usage.json'));
  assert.deepEqual(usage, { spent: 15, input: 1500, output: 300 });
});

test('mistral: monthRange uses date-only bounds', () => {
  assert.deepEqual(mistral.monthRange(Date.UTC(2030, 0, 15)), {
    start: '2030-01-01',
    end: '2030-01-15',
    nextMonth: Date.UTC(2030, 1, 1),
  });
});

test('mistral: rejects malformed responses', () => {
  assert.equal(mistral.parseSubscription(null).error, 'mistral_format');
  assert.equal(mistral.parseUsage({}).error, 'mistral_format');
});

// ---------- OpenCode Go ----------
test('opencode: maps rolling, weekly and monthly usage windows', () => {
  const r = opencode.parseUsage(json('opencode-usage.json'));
  assert.deepEqual(
    r.windows.map((w) => [w.key, w.percent, w.resetsAt]),
    [
      ['five_hour', 12, iso('2030-01-01T18:00:00Z')],
      ['weekly', 78, iso('2030-01-05T00:00:00Z')],
      ['monthly', 100, iso('2030-02-01T00:00:00Z')],
    ]
  );
});

test('opencode: rejects malformed or empty responses', () => {
  assert.equal(opencode.parseUsage({}).error, 'opencode_format');
  assert.equal(opencode.parseUsage({ usage: {} }).error, 'opencode_noquota');
});

// ---------- currency helper ----------
test('money: formats USD, EUR and other currencies', () => {
  assert.equal(money('USD', 1.5), '$1.50');
  assert.equal(money('usd', 1.5), '$1.50');
  assert.equal(money('EUR', 2), '€2.00');
  assert.equal(money('GBP', 3), 'GBP 3.00');
  assert.equal(money(null, 0), '$0.00');
});
