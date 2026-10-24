const { num, toMs, parseJson, isCloudflare } = require('./util');
const { pageFetch, netFetch } = require('./browser');

// Real shape of ollama.com/api/usage: { limits: { session: { usage }, weekly: { usage } }, activity: {...} }
// "usage" is a fraction (0.213 = 21.3%).
function parseLimits(j) {
  const limits = (j && j.limits) || {};
  const out = [];
  for (const key of ['session', 'weekly']) {
    const o = limits[key];
    if (!o || typeof o !== 'object') continue;
    const raw = num(o.usage);
    if (raw === null) continue;
    const percent = Math.round((raw <= 1 ? raw * 100 : raw) * 10) / 10;
    // the reset field is undocumented: look for any key that looks like a reset date
    const rk = Object.keys(o).find((k) => /reset|end|until|expire/i.test(k) && toMs(o[k]) !== null && typeof o[k] !== 'boolean');
    out.push({ key, percent, resetsAt: rk ? toMs(o[rk]) : null });
  }
  return out;
}

// Fallback without an API key: reads the signed-in /settings page.
function parseHtml(html) {
  const clean = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
  const text = clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const out = [];
  for (const [re, key] of [[/session/i, 'session'], [/week/i, 'weekly']]) {
    const i = text.search(re);
    if (i < 0) continue;
    const m = text.slice(i, i + 160).match(/(\d+(?:\.\d+)?)\s*%/);
    if (!m) continue;
    const ri = clean.search(re);
    const t = ri >= 0 ? clean.slice(ri, ri + 800).match(/data-time="([^"]+)"/) : null;
    out.push({ key, percent: +m[1], resetsAt: t ? toMs(t[1]) : null });
  }
  const plan = text.match(/\b(Free|Pro|Max)\s+plan\b|\bplan[:\s]+(Free|Pro|Max)\b/i);
  return { windows: out, plan: plan ? (plan[1] || plan[2]).toLowerCase() : null };
}

// Ollama's newer plans meter a monthly USD credit (Pro = $60, Max = $300), renewed on the day
// the subscription started. The API only exposes daily spend (range = 24h | 7d | 30d).
const ALLOWANCE = { pro: 60, max: 300 };

function cycleBounds(day, now = new Date()) {
  const dim = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  let start = Date.UTC(y, m, Math.min(day, dim(y, m)));
  if (start > now.getTime()) {
    m--;
    if (m < 0) {
      m = 11;
      y--;
    }
    start = Date.UTC(y, m, Math.min(day, dim(y, m)));
  }
  let ny = y;
  let nm = m + 1;
  if (nm > 11) {
    nm = 0;
    ny++;
  }
  return { start, end: Date.UTC(ny, nm, Math.min(day, dim(ny, nm))) };
}

// Spend in the current cycle from j.buckets. `me` = { plan, createdAt } from /api/me (optional).
function parseBuckets(j, cfg = {}, me = {}, now = new Date()) {
  const day = Number(cfg.ollamaBillingDay) || (me.createdAt ? new Date(me.createdAt).getUTCDate() : 1);
  const { start, end } = cycleBounds(day, now);
  let spent = 0;
  let requests = 0;
  for (const b of j.buckets) {
    if (Date.parse(b.from) >= start) {
      spent += num(b.usage_usd) || 0;
      requests += num(b.request_count) || 0;
    }
  }
  const plan = me.plan || null;
  const allowance = num(cfg.ollamaMonthlyCredits) || ALLOWANCE[plan] || null;
  // `since` is in ms (UTC); the UI formats the date in the chosen language
  const noteParams = { since: start, spent: spent.toFixed(2), requests };
  if (!allowance) {
    return { plan, windows: [], note: 'cycle_spent', noteParams, error: 'ollama_nocredit' };
  }
  return {
    plan,
    windows: [
      {
        key: 'month',
        percent: Math.min(100, (spent / allowance) * 100),
        resetsAt: end,
        detail: `$${spent.toFixed(2)} / $${allowance}`,
      },
    ],
    note: 'requests_since',
    noteParams,
  };
}

async function runApi(key, cfg) {
  const headers = { Authorization: `Bearer ${key}` };
  const r = await netFetch('https://ollama.com/api/usage?range=30d', { headers });
  if (r.status === 401 || r.status === 403) return { action: 'key', error: 'ollama_badkey' };
  if (r.status !== 200) return { error: 'http', errorParams: { name: 'Ollama', status: r.status } };
  let j = null;
  try {
    j = await r.json();
  } catch (_) {}
  if (!j || typeof j !== 'object') return { error: 'ollama_notjson' };

  // older plans: session/weekly limits
  const legacy = parseLimits(j);
  if (legacy.length) return { windows: legacy };

  if (!Array.isArray(j.buckets)) {
    return { error: 'ollama_format', errorParams: { fields: Object.keys(j).join(', ') } };
  }

  const me = {};
  try {
    const res = await netFetch('https://ollama.com/api/me', { method: 'POST', headers });
    if (res.status === 200) {
      const m = await res.json();
      me.plan = m.Plan ? String(m.Plan).toLowerCase() : null;
      me.createdAt = m.CreatedAt ? Date.parse(m.CreatedAt) : null;
    }
  } catch (_) {}
  return parseBuckets(j, cfg, me);
}

async function run(cfg) {
  if (cfg.ollamaApiKey) return runApi(cfg.ollamaApiKey, cfg);
  const r = await pageFetch('ollama', 'https://ollama.com', '/settings');
  if (isCloudflare(r.text)) return { error: 'cloudflare' };
  if (r.status === 401 || r.status === 0 || /\/signin|\/login/.test(r.url || '')) return { action: 'login' };
  const { windows, plan } = parseHtml(r.text || '');
  if (!windows.length) return { error: 'ollama_page' };
  return { windows, plan };
}

module.exports = {
  id: 'ollama',
  name: 'Ollama',
  loginUrl: 'https://ollama.com/signin',
  run,
  parseLimits,
  parseHtml,
  parseBuckets,
  cycleBounds,
};
