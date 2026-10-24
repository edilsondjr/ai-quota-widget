// Tests for the safe expression subset used by custom-provider mappings.
const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateExpression, validateExpression } = require('../providers/expression');

const body = {
  credits: { type: 'usd', usd: 0 },
  subscription: {
    type: 'generations',
    status: 'active',
    plan: 'Tier 3: Pixel Architect',
    generations: 3101.99999999999,
    total: 9000,
  },
};

test('expression: arithmetic, paths and formatting', () => {
  assert.equal(evaluateExpression('Math.round(data.subscription.generations)', body), 3102);
  assert.equal(evaluateExpression('Math.round(data.subscription.generations).toLocaleString("en-US")', body), '3,102');
  assert.equal(evaluateExpression('subscription.plan', body), 'Tier 3: Pixel Architect');
  const pct = evaluateExpression('data.subscription.generations / data.subscription.total * 100', body);
  assert.ok(Math.abs(pct - 34.4666) < 0.01);
  assert.equal(evaluateExpression('data.items[0].value', { items: [{ value: 5 }] }), 5);
  assert.equal(evaluateExpression('Number("12") + 1', body), 13);
  assert.equal(evaluateExpression('data.subscription.status === "active" ? "on" : "off"', body), 'on');
  assert.equal(evaluateExpression('data.subscription.generations > 3000 && data.subscription.status === "active"', body), true);
});

test('expression: blocks constructors, prototypes and arbitrary calls', () => {
  for (const expr of [
    'data.constructor',
    'data["constructor"]',
    'data.__proto__',
    'data.prototype',
    'Function("return 1")()',
    'require("fs")',
    'data.constructor.constructor("return 1")()',
  ]) {
    assert.throws(() => evaluateExpression(expr, body));
    assert.equal(validateExpression(expr), false);
  }
});

test('expression: unknown globals fail at evaluation, not execution', () => {
  assert.throws(() => evaluateExpression('process', body));
  assert.throws(() => evaluateExpression('globalThis', body));
});

test('expression: validates syntax and unsupported methods', () => {
  assert.equal(validateExpression('Math.round(data.x)'), true);
  assert.equal(validateExpression('data.x.toFixed(2)'), true);
  assert.equal(validateExpression('data.foo()'), false);
  assert.equal(validateExpression('data.x = 1'), false);
  assert.equal(validateExpression('('), false);
});
