const test = require('node:test');
const assert = require('node:assert/strict');
const { API_URL, RELEASES_URL, parseVersion, isNewer, checkForUpdates } = require('../update');

test('update: parses release versions', () => {
  assert.deepEqual(parseVersion('v0.13.0'), [0, 13, 0]);
  assert.deepEqual(parseVersion('1.2.3-beta.1'), [1, 2, 3]);
  assert.equal(parseVersion('latest'), null);
});

test('update: compares versions', () => {
  assert.equal(isNewer('0.14.0', '0.13.0'), true);
  assert.equal(isNewer('0.13.1', '0.13.0'), true);
  assert.equal(isNewer('0.13.0', '0.13.0'), false);
  assert.equal(isNewer('0.12.9', '0.13.0'), false);
  assert.equal(isNewer('bad', '0.13.0'), false);
});

test('update: reports an available release and sends GitHub headers', async () => {
  let request;
  const result = await checkForUpdates({
    currentVersion: '0.13.0',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ tag_name: 'v0.14.0' }) };
    },
  });
  assert.equal(request.url, API_URL);
  assert.equal(request.options.headers.Accept, 'application/vnd.github+json');
  assert.match(request.options.headers['User-Agent'], /Quota-Widget\/0\.13\.0/);
  assert.deepEqual(result, {
    current: '0.13.0',
    latest: '0.14.0',
    available: true,
    url: RELEASES_URL,
  });
});

test('update: reports the current release', async () => {
  const result = await checkForUpdates({
    currentVersion: '0.13.0',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ tag_name: 'v0.13.0' }) }),
  });
  assert.equal(result.available, false);
});

test('update: rejects GitHub errors and invalid tags', async () => {
  await assert.rejects(
    () =>
      checkForUpdates({
        currentVersion: '0.13.0',
        fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }),
      }),
    /403/
  );
  await assert.rejects(
    () =>
      checkForUpdates({
        currentVersion: '0.13.0',
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ tag_name: 'not-a-version' }) }),
      }),
    /invalid release tag/
  );
});
