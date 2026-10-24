// Tests for user-defined providers: path resolution, mapping and spec validation.
const test = require('node:test');
const assert = require('node:assert/strict');

const { getPath, parseCustom, normalizeSpec, buildCustomProvider } = require('../providers/custom');

test('custom: getPath supports dot and array paths', () => {
  const body = { data: { items: [{ value: 42 }], nested: { x: 'y' } } };
  assert.equal(getPath(body, 'data.items[0].value'), 42);
  assert.equal(getPath(body, '$.data.nested.x'), 'y');
  assert.equal(getPath(body, 'data.missing.value'), undefined);
  assert.equal(getPath(body, 'data.items[9].value'), undefined);
});

test('custom: parseCustom maps windows, fraction scales, note and plan', () => {
  const spec = {
    mapping: {
      windows: [
        { key: 'month', label: 'Month', percent: 'data.used', scale: 'percent', resetsAt: 'data.reset', detail: 'data.detail' },
        { key: 'week', percent: 'data.week', scale: 'fraction' },
      ],
      note: { template: 'Balance: {amount} ({currency})', values: { amount: 'data.balance', currency: 'data.currency' } },
      plan: 'data.plan',
    },
  };
  const body = {
    data: {
      used: 42,
      week: 0.25,
      reset: '2030-01-01T00:00:00Z',
      detail: 'x / y',
      balance: 12.5,
      currency: 'USD',
      plan: 'pro',
    },
  };
  const r = parseCustom(spec, body);
  assert.deepEqual(
    r.windows.map((w) => [w.key, w.label, w.percent, w.resetsAt, w.detail]),
    [
      ['month', 'Month', 42, Date.parse('2030-01-01T00:00:00Z'), 'x / y'],
      ['week', null, 25, null, null],
    ]
  );
  assert.equal(r.noteText, 'Balance: 12.5 (USD)');
  assert.equal(r.plan, 'pro');
});

test('custom: parseCustom caps percentages and reports no data', () => {
  const spec = { mapping: { windows: [{ key: 'x', percent: 'data.p' }] } };
  assert.equal(parseCustom(spec, { data: { p: 150 } }).windows[0].percent, 100);
  assert.equal(parseCustom(spec, { data: {} }).error, 'custom_no_data');
});

test('custom: normalizeSpec applies defaults and validates URLs and mappings', () => {
  const ok = normalizeSpec({
    name: 'My API',
    url: 'https://api.example.com/usage',
    mapping: { windows: [{ key: 'month', percent: 'data.percent' }] },
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.spec.method, 'GET');
  assert.equal(ok.spec.auth, 'bearer');
  assert.equal(ok.spec.mapping.windows[0].scale, 'percent');

  assert.equal(normalizeSpec({ name: 'x', url: 'http://example.com', mapping: { windows: [{ key: 'm', percent: 'p' }] } }).ok, false);
  assert.equal(normalizeSpec({ name: 'x', url: 'http://localhost/usage', mapping: { windows: [{ key: 'm', percent: 'p' }] } }).ok, true);
  assert.equal(normalizeSpec({ name: 'x', url: 'https://x.test', mapping: {} }).ok, false);
  assert.equal(
    normalizeSpec({ name: 'x', url: 'https://x.test', method: 'POST', mapping: { windows: [{ key: 'm', percent: 'p' }] }, body: '{bad' }).ok,
    false
  );
  assert.equal(
    normalizeSpec({ name: 'x', url: 'https://x.test', mapping: { windows: [{ key: 'm', percent: 'p' }] }, auth: 'header', authHeader: 'bad header' }).ok,
    false
  );
});

test('custom: buildCustomProvider declares the API key only when auth is used', () => {
  const base = { id: 'custom_x', name: 'X', keyName: 'custom_xApiKey' };
  assert.deepEqual(buildCustomProvider({ ...base, auth: 'bearer' }).settings, [{ key: 'custom_xApiKey', type: 'secret' }]);
  assert.deepEqual(buildCustomProvider({ ...base, auth: 'none' }).settings, []);
});
