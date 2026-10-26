const test = require('node:test');
const assert = require('node:assert/strict');
const { isConfigured } = require('../renderer/provider-state');

test('API configuration depends on credentials, including during request failures', () => {
  const meta = { fields: [{ key: 'token', type: 'secret' }], secrets: {} };
  assert.equal(isConfigured(meta), false);
  assert.equal(isConfigured({ ...meta, secrets: { token: true } }, { ok: false, error: 'network' }), true);
  assert.equal(isConfigured(meta, { ok: true }), false);
});

test('a Custom provider without authentication is configured without a key', () => {
  assert.equal(isConfigured({ custom: true, fields: [] }), true);
  assert.equal(isConfigured({ custom: true, fields: [{ key: 'token', type: 'secret' }] }), false);
});

test('browser providers retain configuration while disabled or reconnecting', () => {
  assert.equal(isConfigured({ canLogin: true }), false);
  assert.equal(isConfigured({ canLogin: true }, { ok: true }), true);
  assert.equal(isConfigured({ canLogin: true }, { ok: false, lastSuccessAt: 100 }), true);
  assert.equal(isConfigured({ canLogin: true, configured: true }), true);
  assert.equal(isConfigured({ canLogin: true, configured: false }, { action: 'login' }), false);
});
