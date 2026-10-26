// Tests for the generic provider settings helpers (validation and UI metadata).
const test = require('node:test');
const assert = require('node:assert/strict');

const { PROVIDERS } = require('../providers');
const { fields, secretKeys, meta, coerce, hasPlaintextSecrets, configForDisk } = require('../providers/settings');

test('only Claude and ChatGPT expose browser sign-in', () => {
  assert.deepEqual(PROVIDERS.filter((p) => p.loginUrl).map((p) => p.id), ['claude', 'chatgpt']);
});

test('secret keys are derived from the provider declarations', () => {
  assert.deepEqual(secretKeys(PROVIDERS), [
    'commandcodeApiKey',
    'ollamaApiKey',
    'openrouterApiKey',
    'deepseekApiKey',
    'moonshotApiKey',
    'githubToken',
    'syntheticApiKey',
    'nanogptManagementToken',
    'openaiAdminKey',
    'anthropicAdminKey',
    'xaiManagementKey',
    'mistralApiKey',
    'opencodeApiKey',
  ]);
});

test('setting keys are unique across providers', () => {
  const keys = fields(PROVIDERS).map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('meta hides secrets and keeps non-secret values', () => {
  const list = meta(PROVIDERS, { openrouterApiKey: 'sk-or-secret', ollamaBillingDay: 7, claudeShowUnknown: true });
  const openrouter = list.find((m) => m.id === 'openrouter');
  assert.equal(openrouter.secrets.openrouterApiKey, true);
  assert.equal(openrouter.values.openrouterApiKey, undefined);
  assert.equal(list.find((m) => m.id === 'ollama').values.ollamaBillingDay, 7);
  assert.equal(list.find((m) => m.id === 'claude').values.claudeShowUnknown, true);
  assert.equal(list.find((m) => m.id === 'copilot').values.githubUsername, null);
});

test('meta remembers browser setup independently of whether the provider is enabled', () => {
  const list = meta(PROVIDERS, { connectedProviders: ['claude'], enabled: { claude: false } });
  assert.equal(list.find((provider) => provider.id === 'claude').configured, true);
  assert.equal(list.find((provider) => provider.id === 'chatgpt').configured, false);
  assert.equal(list.find((provider) => provider.id === 'openrouter').configured, false);
});

test('coerce validates by type and range', () => {
  const secret = { key: 'k', type: 'secret' };
  assert.deepEqual(coerce(secret, '  abc  '), { ok: true, value: 'abc' });
  assert.deepEqual(coerce(secret, ''), { ok: true, value: '' });
  assert.deepEqual(coerce(secret, 3), { ok: false });

  const day = { key: 'd', type: 'number', min: 1, max: 31 };
  assert.deepEqual(coerce(day, '7'), { ok: true, value: 7 });
  assert.deepEqual(coerce(day, ''), { ok: true, value: null });
  assert.deepEqual(coerce(day, 0), { ok: false });
  assert.deepEqual(coerce(day, 32), { ok: false });
  assert.deepEqual(coerce(day, 'x'), { ok: false });

  const flag = { key: 'f', type: 'boolean' };
  assert.deepEqual(coerce(flag, 1), { ok: true, value: true });
  assert.deepEqual(coerce({ key: 'u', type: 'nope' }, 'x'), { ok: false });
});

test('hasPlaintextSecrets detects all known secret fields, not only API keys', () => {
  assert.equal(hasPlaintextSecrets({ githubToken: 'ghp_secret' }, ['githubToken']), true);
  assert.equal(hasPlaintextSecrets({ openaiAdminKey: 'sk-admin' }, ['openaiAdminKey']), true);
  assert.equal(hasPlaintextSecrets({ githubToken: '' }, ['githubToken']), false);
  assert.equal(hasPlaintextSecrets({ language: 'en-US' }, ['githubToken']), false);
});

test('configForDisk never writes plaintext secrets', () => {
  const cfg = { language: 'en-US', ollamaApiKey: 'sk-ollama', githubToken: 'ghp_secret' };
  const out = configForDisk(cfg, ['ollamaApiKey', 'githubToken'], null);
  assert.equal(out.ollamaApiKey, undefined);
  assert.equal(out.githubToken, undefined);
  assert.deepEqual(out.secrets, {});
  assert.equal(out.language, 'en-US');
  const text = JSON.stringify(out);
  assert.ok(!text.includes('sk-ollama'));
  assert.ok(!text.includes('ghp_secret'));
});

test('configForDisk writes only encrypted secret blobs', () => {
  const out = configForDisk({ ollamaApiKey: 'sk-ollama' }, ['ollamaApiKey'], (v) => `enc:${v}`);
  assert.equal(out.ollamaApiKey, undefined);
  assert.deepEqual(out.secrets, { ollamaApiKey: 'enc:sk-ollama' });
  assert.ok(!JSON.stringify(out).includes('"sk-ollama"'));
});
