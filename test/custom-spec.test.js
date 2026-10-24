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
    windowKey: 'month',
    windowLabel: 'Month',
    percent: 'data.percent',
    scale: 'fraction',
    resetsAt: 'data.reset',
    detail: 'data.detail',
    noteTemplate: 'Balance: {amount}',
    noteAmountPath: 'data.balance',
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
  ]);
  assert.deepEqual(spec.mapping.note, { template: 'Balance: {amount}', values: { amount: 'data.balance' } });
  assert.equal(spec.mapping.plan, 'data.plan');
});

test('custom-spec: guided fields round-trip a simple spec', () => {
  const original = TEMPLATES.usage;
  const { guided, complex } = toGuided(original);
  assert.equal(complex, false);
  assert.deepEqual(buildSpec(guided), original);

  const balance = toGuided(TEMPLATES.balance);
  assert.equal(balance.complex, false);
  assert.deepEqual(buildSpec(balance.guided), TEMPLATES.balance);
});

test('custom-spec: marks multiple windows or note values as complex', () => {
  const twoWindows = { mapping: { windows: [{ key: 'a', percent: 'a' }, { key: 'b', percent: 'b' }] } };
  assert.equal(toGuided(twoWindows).complex, true);

  const twoValues = { mapping: { note: { template: '{a} {b}', values: { a: 'x', b: 'y' } } } };
  assert.equal(toGuided(twoValues).complex, true);
});

test('custom-spec: keeps optional fields out of the built spec', () => {
  const spec = buildSpec({ name: 'X', url: 'https://x.test', auth: 'none' });
  assert.equal(spec.auth, 'none');
  assert.equal(spec.authHeader, undefined);
  assert.equal(spec.authPrefix, undefined);
  assert.equal(spec.body, undefined);
  assert.deepEqual(spec.mapping.windows, []);
});
