// Tests for the guided <-> JSON custom-provider spec conversion.
const test = require('node:test');
const assert = require('node:assert/strict');

const { toGuided, buildSpec, TEMPLATES } = require('../renderer/custom-spec');

test('custom-spec: builds a spec from guided fields', () => {
  const spec = buildSpec({
    name: '  My API  ',
    url: ' https://api.example.com/usage ',
    method: 'POST',
    auth: 'header',
    authHeader: 'X-API-Key',
    authPrefix: 'Token ',
    headers: { Accept: 'application/json' },
    body: '{"range":"30d"}',
    windows: [
      { key: 'month', label: 'Month', percent: 'data.percent', scale: 'fraction', resetsAt: 'data.reset', detail: 'data.detail' },
      { key: 'week', label: 'Week', percent: 'data.week' },
    ],
    noteTemplate: 'Balance: {amount} / {currency}',
    noteValues: [
      { name: 'amount', path: 'data.balance' },
      { name: 'currency', path: 'data.currency' },
      { name: 'ignored', path: '' },
    ],
    plan: 'data.plan',
  });
  assert.equal(spec.name, 'My API');
  assert.equal(spec.url, 'https://api.example.com/usage');
  assert.equal(spec.method, 'POST');
  assert.equal(spec.auth, 'header');
  assert.equal(spec.authHeader, 'X-API-Key');
  assert.equal(spec.authPrefix, 'Token ');
  assert.deepEqual(spec.headers, { Accept: 'application/json' });
  assert.equal(spec.body, '{"range":"30d"}');
  assert.deepEqual(spec.mapping.windows, [
    { key: 'month', label: 'Month', percent: 'data.percent', scale: 'fraction', resetsAt: 'data.reset', detail: 'data.detail' },
    { key: 'week', label: 'Week', percent: 'data.week', resetsAt: null, detail: null },
  ]);
  assert.deepEqual(spec.mapping.note, {
    template: 'Balance: {amount} / {currency}',
    values: { amount: 'data.balance', currency: 'data.currency' },
  });
  assert.equal(spec.mapping.plan, 'data.plan');
});

test('custom-spec: guided fields round-trip simple specs', () => {
  for (const original of [TEMPLATES.usage, TEMPLATES.balance, TEMPLATES.cost]) {
    const { guided } = toGuided(original);
    assert.deepEqual(buildSpec(guided), original);
  }
});

test('custom-spec: keeps multiple windows and note values', () => {
  const spec = {
    mapping: {
      windows: [
        { key: 'five_hour', label: '5 h', percent: 'a', scale: 'fraction' },
        { key: 'week', label: 'Week', percent: 'b' },
      ],
      note: { template: '{used} / {limit}', values: { used: 'u', limit: 'l' } },
    },
  };
  const { guided } = toGuided(spec);
  assert.equal(guided.windows.length, 2);
  assert.equal(guided.noteValues.length, 2);
  assert.deepEqual(buildSpec(guided), {
    name: '',
    url: '',
    method: 'GET',
    auth: 'bearer',
    headers: {},
    mapping: {
      windows: [
        { key: 'five_hour', label: '5 h', percent: 'a', scale: 'fraction', resetsAt: null, detail: null },
        { key: 'week', label: 'Week', percent: 'b', resetsAt: null, detail: null },
      ],
      note: { template: '{used} / {limit}', values: { used: 'u', limit: 'l' } },
    },
  });
});

test('custom-spec: keeps optional fields out of the built spec', () => {
  const spec = buildSpec({ name: 'X', url: 'https://x.test', auth: 'none' });
  assert.equal(spec.auth, 'none');
  assert.equal(spec.authHeader, undefined);
  assert.equal(spec.authPrefix, undefined);
  assert.equal(spec.body, undefined);
  assert.deepEqual(spec.mapping.windows, []);
});
