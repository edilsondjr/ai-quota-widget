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

  app = await electron.launch({
    executablePath: require('electron'),
    args: ['.'],
    cwd: repo,
    env,
    timeout: 30000,
  });

  const page = await app.firstWindow();
  await page.waitForSelector('#btn-config');

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
  await page.getByRole('button', { name: 'Expression help', exact: true }).click();
  await page.getByText('Safe expressions', { exact: true }).waitFor();
  await page.getByText('=Math.round(data.subscription.generations)', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Expression help', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Local test');
  await page.getByLabel('URL', { exact: true }).fill(`http://127.0.0.1:${port}/usage`);
  await page.locator('#custom-auth').selectOption('none');
  await page.getByLabel('Note template', { exact: true }).fill('Balance: {amount}');
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
