const REPO = 'edilsondjr/ai-quota-widget';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(value || '').trim());
  return match ? match.slice(1, 4).map(Number) : null;
}

function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

async function checkForUpdates({ fetchImpl, currentVersion }) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');
  const response = await fetchImpl(API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Quota-Widget/${currentVersion || 'unknown'}`,
    },
  });
  if (!response || !response.ok) {
    throw new Error(`GitHub responded ${response ? response.status : 'without a response'}`);
  }
  const data = await response.json();
  const latest = data && typeof data.tag_name === 'string' ? data.tag_name.replace(/^v/, '') : '';
  if (!parseVersion(latest)) throw new Error('GitHub returned an invalid release tag');
  return {
    current: currentVersion,
    latest,
    available: isNewer(latest, currentVersion),
    url: RELEASES_URL,
  };
}

module.exports = { API_URL, RELEASES_URL, parseVersion, isNewer, checkForUpdates };
