// Tests for keeping the last known reading when a refresh fails.
const test = require('node:test');
const assert = require('node:assert/strict');

const { mergeReading } = require('../providers/readings');

test('readings: keeps the last reading and note when an update fails', () => {
  const prev = {
    ok: true,
    windows: [{ key: 'month', percent: 42 }],
    note: 'balance',
    noteParams: { amount: '$1.00' },
    noteText: 'Balance: $1.00',
    plan: 'pro',
    fetchedAt: 100,
    lastSuccessAt: 90,
  };
  const next = { ok: false, error: 'http', errorParams: { name: 'X', status: 500 }, fetchedAt: 200 };
  const merged = mergeReading(prev, next);

  assert.equal(merged.stale, true);
  assert.equal(merged.error, 'http');
  assert.deepEqual(merged.windows, prev.windows);
  assert.equal(merged.note, 'balance');
  assert.deepEqual(merged.noteParams, { amount: '$1.00' });
  assert.equal(merged.noteText, 'Balance: $1.00');
  assert.equal(merged.plan, 'pro');
  assert.equal(merged.lastSuccessAt, 90);
});

test('readings: records lastSuccessAt on a successful update', () => {
  const merged = mergeReading({ ok: true, fetchedAt: 100 }, { ok: true, windows: [], fetchedAt: 200 });
  assert.equal(merged.lastSuccessAt, 200);
  assert.equal(merged.stale, undefined);
});

test('readings: does not mark stale without a previous success', () => {
  const next = { ok: false, error: 'http', fetchedAt: 200 };
  assert.deepEqual(mergeReading(null, next), next);
  assert.deepEqual(mergeReading({ ok: false, error: 'old', fetchedAt: 100 }, next), next);
});
