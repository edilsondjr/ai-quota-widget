const { num, toMs, parseJson, isCloudflare } = require('./util');
const { pageFetch } = require('./browser');

const KNOWN = new Set(['five_hour', 'seven_day', 'seven_day_sonnet', 'seven_day_opus', 'seven_day_omelette', 'extra_usage']);
const ORDER = ['five_hour', 'seven_day', 'seven_day_sonnet', 'seven_day_opus'];

function collectWindows(obj, out = [], key = '') {
  if (!obj || typeof obj !== 'object') return out;
  const pct = num(obj.utilization ?? obj.used_percent);
  if (pct !== null && key) out.push({ key, percent: pct, resetsAt: toMs(obj.resets_at ?? obj.reset_at) });
  for (const [k, v] of Object.entries(obj)) if (v && typeof v === 'object') collectWindows(v, out, k);
  return out;
}

// /api/organizations -> uuid da organização de chat (ou null)
function parseOrgs(orgs) {
  if (!Array.isArray(orgs) || !orgs.length) return null;
  const chat = orgs.find((o) => (o.capabilities || []).includes('chat')) || orgs[0];
  return chat.uuid || null;
}

// /api/organizations/<uuid>/usage -> { windows } ou { error }
function parseUsage(body, cfg = {}) {
  const seen = new Map();
  for (const w of collectWindows(body)) if (!seen.has(w.key)) seen.set(w.key, w);
  // chaves internas sem rótulo conhecido (ex.: iguana_necktie) ficam ocultas, a menos que claudeShowUnknown seja true
  const windows = [...seen.values()]
    .filter((w) => KNOWN.has(w.key) || cfg.claudeShowUnknown)
    .sort((a, b) => {
      const ia = ORDER.indexOf(a.key);
      const ib = ORDER.indexOf(b.key);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map((w) => ({ key: w.key, percent: w.percent, resetsAt: w.resetsAt }));
  if (!windows.length) return { error: 'no_windows' };
  return { windows };
}

let org = null;
async function run(cfg = {}) {
  const origin = 'https://claude.ai';
  if (!org) {
    const r = await pageFetch('claude', origin, '/api/organizations');
    if (isCloudflare(r.text)) return { error: 'cloudflare' };
    if (r.status === 401 || r.status === 403 || r.status === 0) return { action: 'login' };
    org = parseOrgs(parseJson(r));
    if (!org) return { action: 'login' };
  }
  const r = await pageFetch('claude', origin, `/api/organizations/${org}/usage`);
  if (r.status === 401 || r.status === 403) {
    org = null;
    return { action: 'login' };
  }
  const body = parseJson(r);
  if (r.status !== 200 || !body) return { error: 'http', errorParams: { name: 'Claude', status: r.status } };
  return parseUsage(body, cfg);
}

module.exports = {
  id: 'claude',
  name: 'Claude',
  loginUrl: 'https://claude.ai/login',
  run,
  reset: () => (org = null),
  parseOrgs,
  parseUsage,
};
