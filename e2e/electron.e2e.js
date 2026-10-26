// Electron UI smoke test. Runs against the source tree with an isolated data dir and a
// local fake provider, so it never touches real credentials or external services.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright-core');

const repo = path.join(__dirname, '..');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

test('settings: pin, custom provider test/cancel/save/delete', { timeout: 90000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qw-e2e-'));
  const home = path.join(root, 'home');
  const legacy = path.join(root, 'legacy');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(legacy, { recursive: true });
  writeJson(path.join(home, '.quotawidget', 'config.json'), {
    configVersion: 1,
    language: 'en-US',
    intervalMin: 240,
    pinned: true,
    enabled: { claude: false, chatgpt: false, commandcode: false, ollama: false },
    hiddenWindows: {},
    customProviders: [],
  });

  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: { percent: 42, reset: '2030-01-01T00:00:00Z', detail: 'x / y', balance: 12.5 } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  let app = null;
  t.after(async () => {
    if (app) await app.close().catch(() => {});
    await new Promise((resolve) => {
      server.close(resolve);
      if (server.closeAllConnections) server.closeAllConnections();
    });
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const env = {
    ...process.env,
    QUOTAWIDGET_HOME: home,
    QUOTAWIDGET_LEGACY_DIR: legacy,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  };
  // VS Code / Command Code may export this; Electron must run as Electron, not as Node.
  delete env.ELECTRON_RUN_AS_NODE;

  const packagedExecutable = process.env.QUOTAWIDGET_E2E_EXE;
  app = await electron.launch({
    executablePath: packagedExecutable || require('electron'),
    args: packagedExecutable ? [] : ['.'],
    cwd: repo,
    env,
    timeout: 30000,
  });

  const page = await app.firstWindow();
  assert.equal((await app.windows()).length, 1);
  await page.waitForSelector('#btn-config');
  await page.getByText('No providers yet', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open settings', exact: true }).waitFor();

  // Always-on-top reflects its state.
  const pin = page.locator('#btn-pin');
  await page.waitForFunction(() => document.querySelector('#btn-pin').getAttribute('aria-pressed') === 'true');
  await pin.click();
  await page.waitForFunction(() => document.querySelector('#btn-pin').getAttribute('aria-pressed') === 'false');
  assert.equal(await pin.evaluate((el) => el.classList.contains('on')), false);
  await pin.click();
  await page.waitForFunction(() => document.querySelector('#btn-pin').getAttribute('aria-pressed') === 'true');

  // Add -> Cancel returns to the settings list.
  await page.click('#btn-config');
  await page.getByText('Appearance', { exact: true }).waitFor();
  await page.locator('#density').selectOption('compact');
  await page.waitForFunction(() => document.documentElement.dataset.density === 'compact');
  await page.locator('#density').selectOption('comfortable');
  await page.waitForFunction(() => document.documentElement.dataset.density === 'comfortable');
  await page.locator('#sort').selectOption('custom');
  assert.equal(await page.locator('.service-group[data-configured="true"]').isVisible(), false);
  assert.ok(await page.locator('.service-group[data-configured="false"] .svc').count() > 0);
  assert.equal(await page.locator('.service-group[data-configured="false"] input:not(:disabled)').count(), 0);
  assert.equal(await page.locator('.svc-drag-handle:visible').count(), 0);
  await page.locator('.svc-main', { hasText: 'Claude' }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
  await page.locator('button.back').click();
  await page.locator('#sort').selectOption('default');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#settings').hidden === true);
  await page.click('#btn-config');
  await page.getByText('Appearance', { exact: true }).waitFor();
  await page.locator('.skin-option[data-skin="paper"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.skin === 'paper');
  assert.equal(await page.locator('#skin-css').getAttribute('href'), 'skins/paper.css');
  await page.locator('.skin-option[data-skin="classic"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.skin === 'classic');
  assert.equal(await page.locator('#skin-css').getAttribute('href'), 'skins/classic.css');
  const add = page.getByRole('button', { name: 'Add custom provider' });
  await add.waitFor();
  await add.click();
  await page.getByLabel('Name', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await add.waitFor();
  assert.equal(await page.locator('#custom-spec').count(), 0);
  await page.getByText('Notifications', { exact: true }).waitFor();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Back up config', exact: true }).click();
  const backups = path.join(home, '.quotawidget', 'backups');
  assert.ok(fs.existsSync(backups));
  assert.ok(fs.readdirSync(backups).some((f) => f.endsWith('.json')));

  // Add again using the guided form; the local server handles the test request.
  await add.click();
  await page.getByLabel('Name', { exact: true }).fill('Keep me');
  await page.locator('#custom-template').selectOption('balance');
  assert.equal(await page.getByLabel('Name', { exact: true }).inputValue(), 'Keep me');
  assert.equal(await page.locator('#custom-note-template').inputValue(), '');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#custom-template-apply').click();
  assert.equal(await page.getByLabel('Name', { exact: true }).inputValue(), 'Keep me');
  assert.equal(await page.getByLabel('URL', { exact: true }).inputValue(), 'https://api.example.com/usage');
  assert.equal(await page.locator('#custom-note-template').inputValue(), 'Balance: {amount}');
  assert.equal(await page.locator('#custom-window-0-key').count(), 0);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#custom-template').selectOption('usage');
  await page.locator('#custom-template-apply').click();
  assert.equal(await page.locator('#custom-window-0-key').inputValue(), 'month');
  await page.getByRole('button', { name: 'Expression help', exact: true }).click();
  await page.getByText('Safe expressions', { exact: true }).waitFor();
  await page.getByText('=Math.round(data.subscription.generations)', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Expression help', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Local test');
  await page.getByLabel('URL', { exact: true }).fill(`http://127.0.0.1:${port}/usage`);
  await page.locator('#custom-auth').selectOption('none');
  await page.locator('#custom-note-template').fill('Balance: {amount}');
  await page.locator('#custom-note-value-0-path').fill('=Math.round(data.data.balance)');
  await page.getByRole('button', { name: 'Add window', exact: true }).click();
  await page.locator('#custom-window-1-key').fill('week');
  await page.locator('#custom-window-1-label').fill('Week');
  await page.locator('#custom-window-1-percent').fill('data.percent');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await page.locator('#custom-spec').waitFor();
  assert.match(await page.locator('#custom-spec').inputValue(), /"name": "Local test"/);
  assert.match(await page.locator('#custom-spec').inputValue(), /"key": "week"/);
  assert.match(await page.locator('#custom-spec').inputValue(), /"amount": "=Math\.round\(data\.data\.balance\)"/);
  await page.getByRole('button', { name: 'Test' }).click();
  await page.getByText('Response parsed successfully:').waitFor();
  await page.getByText('Month: 42.0%').waitFor();
  await page.getByText('Week: 42.0%').waitFor();
  await page.getByText('Balance: 13').waitFor();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Local test').waitFor();
  await page.getByText('Edit custom provider').waitFor();
  await page.getByText('Last success').waitFor();
  await page.getByText('Refresh interval (minutes)').waitFor();

  // The custom spec (including headers/body) must not be stored in plain text.
  const rawCfg = fs.readFileSync(path.join(home, '.quotawidget', 'config.json'), 'utf8');
  assert.match(rawCfg, /"configVersion": 2/);
  assert.match(rawCfg, /"customProvidersEnc"/);
  assert.doesNotMatch(rawCfg, /"customProviders":/);
  assert.doesNotMatch(rawCfg, /Local test/);

  // Back to the settings list, close settings, and check the card.
  await page.locator('button.back').click();
  await page.getByRole('button', { name: 'Add custom provider' }).waitFor();
  await page.click('#btn-config');
  await page.locator('#list').getByText('Local test').waitFor();
  await page.locator('#list').getByText('Balance: 13').waitFor();

  // Unconfigured services stay in Settings; configured services can be reordered and hidden.
  assert.equal(await page.locator('#list .prov').count(), 1);
  const secondId = await page.evaluate(async () => {
    const state = await window.qw.getState();
    const result = await window.qw.saveCustomProvider({ spec: { ...state.config.customProviders[0], name: 'Second service', auth: 'bearer' } });
    return result.id;
  });
  await page.click('#btn-config');
  await page.locator('.service-group[data-configured="false"] .svc-main', { hasText: 'Second service' }).waitFor();
  await page.click('#btn-config');
  await page.evaluate(async (id) => {
    const state = await window.qw.getState();
    const spec = state.config.customProviders.find((provider) => provider.id === id);
    await window.qw.saveCustomProvider({ id, spec, apiKey: 'local-test-key' });
    const updated = await window.qw.getState();
    if (!updated.config.enabled[id]) throw new Error('Newly configured service was not enabled');
  }, secondId);
  await page.click('#btn-config');
  const configuredGroup = page.locator('.service-group[data-configured="true"]');
  assert.deepEqual(await configuredGroup.locator('.svc-name').allTextContents(), ['Local test', 'Second service']);
  await page.locator('#sort').selectOption('custom');
  await configuredGroup.locator('.svc-drag-handle').nth(1).dragTo(configuredGroup.locator('.svc').first(), { targetPosition: { x: 12, y: 2 } });
  await page.waitForFunction(() => document.querySelector('.service-group[data-configured="true"] .svc-name').textContent === 'Second service');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.click('#btn-config');
  assert.deepEqual(await configuredGroup.locator('.svc-name').allTextContents(), ['Second service', 'Local test']);
  await page.click('#btn-config');
  await page.evaluate(async () => {
    const state = await window.qw.getState();
    const second = state.providerMeta.find((meta) => meta.name === 'Second service');
    await window.qw.deleteCustomProvider(second.id);
  });
  await page.click('#btn-config');
  await configuredGroup.locator('input').uncheck();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('No providers yet', { exact: true }).waitFor();
  await page.click('#btn-config');
  await configuredGroup.locator('.svc-name').getByText('Local test', { exact: true }).waitFor();
  await configuredGroup.locator('input').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('#list').getByText('Balance: 13').waitFor();

  // Dock layout: top bar with consumption, settings panel, then back to the card.
  await page.click('#btn-config');
  await page.locator('#layout').selectOption('dock');
  await page.locator('#dock').selectOption('top');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.layout === 'dock' && document.documentElement.dataset.dock === 'top');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#list')).display), 'flex');
  assert.equal(await page.locator('#list .prov .win').count(), 2);
  assert.ok(await page.locator('#list .prov .win').first().isVisible());
  assert.ok(await page.locator('#list .prov .win').nth(1).isVisible());
  await page.locator('#list .prov').first().getByText('Month').waitFor();
  await page.locator('#list .prov').first().getByText('Week').waitFor();
  const topBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  assert.ok(topBounds.width > 336);
  assert.equal(topBounds.height, 128);

  await page.click('#btn-config');
  await page.waitForFunction(() => window.innerWidth === 360);
  const settingsBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  assert.equal(settingsBounds.width, 360);

  await page.locator('#layout').selectOption('card');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.layout === 'card');
  await page.waitForFunction(() => window.innerWidth === 336);
  const cardBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  assert.equal(cardBounds.width, 336);

  // Delete from the detail, accepting the confirm dialog.
  await page.click('#btn-config');
  await page.locator('.svc-main', { hasText: 'Local test' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete custom provider' }).click();
  await page.getByRole('button', { name: 'Add custom provider' }).waitFor();
  assert.equal(await page.locator('.svc-main', { hasText: 'Local test' }).count(), 0);
  await page.click('#btn-config');
  assert.equal(await page.locator('#list').getByText('Local test').count(), 0);
});
