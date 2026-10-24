// Testes dos leitores de resposta. As fixtures em test/fixtures são SINTÉTICAS: seguem o
// formato que os parsers esperam, sem dados de conta reais. Se um serviço mudar o formato,
// atualize a fixture com uma resposta anonimizada e ajuste o parser.
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

test('commandcode: caps percent at 100 and tolerates a zero cap', () => {
  const r = commandcode.parseCredits({ windowLimits: { fiveHour: { used: 20, cap: 10 }, weekly: { used: 1, cap: 0 } } });
  assert.equal(r.windows[0].percent, 100);
  assert.equal(r.windows[1].percent, 0);
  assert.equal(r.windows[1].detail, null);
  assert.equal(r.note, null);
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

test('ollama: settings page fallback extracts windows, plan and reset', () => {
  const r = ollama.parseHtml(fixture('ollama-settings.html'));
  assert.equal(r.plan, 'pro');
  assert.deepEqual(
    r.windows.map((w) => [w.key, w.percent, w.resetsAt]),
    [
      ['session', 21.5, iso('2030-01-01T10:00:00Z')],
      ['weekly', 8, iso('2030-01-05T10:00:00Z')],
    ]
  );
});

test('ollama: settings page without usage yields no windows', () => {
  assert.deepEqual(ollama.parseHtml('<html><body>Hello</body></html>'), { windows: [], plan: null });
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
