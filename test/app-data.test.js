// Tests for the ~/.quotawidget layout and legacy data migration (pure filesystem, no Electron).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { dataPaths, prepareDataDir, sanitizeLegacyConfig, writeJsonAtomic } = require('../app-data');

const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'quota-widget-data-'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
};

test('prepareDataDir creates ~/.quotawidget and copies provider profiles', (t) => {
  const root = tempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const legacy = path.join(root, 'legacy');
  const profile = path.join(legacy, 'Partitions', 'qw-claude', 'marker.txt');
  fs.mkdirSync(path.dirname(profile), { recursive: true });
  fs.writeFileSync(profile, 'profile-ok');
  writeJson(path.join(legacy, 'config.json'), { language: 'pt-BR', ollamaApiKey: 'sk-plain' });

  const paths = dataPaths(home);
  const result = prepareDataDir(home, legacy);
  assert.equal(result.ok, true);
  assert.equal(result.migrated, true);
  assert.ok(fs.existsSync(paths.profilesDir));
  assert.ok(fs.existsSync(paths.marker));
  assert.ok(fs.existsSync(path.join(paths.profilesDir, 'Partitions', 'qw-claude', 'marker.txt')));
  // config.json is read from the legacy folder by loadCfg, never copied in plain text.
  assert.equal(fs.existsSync(paths.config), false);
});

test('prepareDataDir is a one-time migration', (t) => {
  const root = tempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const legacy = path.join(root, 'legacy');
  const original = path.join(legacy, 'Partitions', 'qw-claude', 'marker.txt');
  fs.mkdirSync(path.dirname(original), { recursive: true });
  fs.writeFileSync(original, 'first');

  const paths = dataPaths(home);
  prepareDataDir(home, legacy);
  fs.writeFileSync(original, 'second');
  const result = prepareDataDir(home, legacy);

  assert.equal(result.migrated, false);
  assert.equal(fs.readFileSync(path.join(paths.profilesDir, 'Partitions', 'qw-claude', 'marker.txt'), 'utf8'), 'first');
});

test('prepareDataDir with no legacy data only creates the layout', (t) => {
  const root = tempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const paths = dataPaths(home);
  const result = prepareDataDir(home, path.join(root, 'missing'));

  assert.equal(result.ok, true);
  assert.equal(result.migrated, true);
  assert.ok(fs.existsSync(paths.profilesDir));
  assert.ok(fs.existsSync(paths.marker));
  assert.equal(fs.existsSync(paths.config), false);
});

test('prepareDataDir ignores a legacy dir equal to the data dir', (t) => {
  const root = tempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const paths = dataPaths(home);
  const result = prepareDataDir(home, paths.dataDir);
  assert.equal(result.migrated, false);
  assert.ok(fs.existsSync(paths.profilesDir));
});

test('sanitizeLegacyConfig removes plaintext secret keys only', (t) => {
  const root = tempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'config.json');
  writeJson(file, {
    language: 'pt-BR',
    ollamaApiKey: 'sk-plain',
    commandcodeApiKey: 'cc-plain',
    secrets: { openrouterApiKey: 'encrypted' },
    enabled: { claude: true },
  });

  assert.equal(sanitizeLegacyConfig(file, ['ollamaApiKey', 'commandcodeApiKey']), true);
  const out = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(out.ollamaApiKey, undefined);
  assert.equal(out.commandcodeApiKey, undefined);
  assert.deepEqual(out.secrets, { openrouterApiKey: 'encrypted' });
  assert.equal(out.language, 'pt-BR');
  assert.deepEqual(out.enabled, { claude: true });
  assert.equal(sanitizeLegacyConfig(file, ['ollamaApiKey', 'commandcodeApiKey']), false);
});

test('writeJsonAtomic replaces the file and leaves no temp file', (t) => {
  const root = tempRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'nested', 'config.json');

  writeJsonAtomic(file, { a: 1 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { a: 1 });

  writeJsonAtomic(file, { a: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { a: 2 });
  assert.deepEqual(fs.readdirSync(path.dirname(file)).filter((f) => f.endsWith('.tmp')), []);
});
