const fs = require('fs');
const os = require('os');
const path = require('path');
const { num, toMs } = require('./util');
const { netFetch } = require('./browser');

function readKey(cfg) {
  if (cfg.commandcodeApiKey) return cfg.commandcodeApiKey;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.commandcode', 'auth.json'), 'utf8'));
    return j.apiKey || j['command-code']?.key || j.commandcode || null;
  } catch (_) {
    return null;
  }
}

async function get(p, key) {
  const r = await netFetch('https://api.commandcode.ai' + p, { headers: { Authorization: `Bearer ${key}` } });
  const text = await r.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch (_) {}
  return { status: r.status, body };
}

// /alpha/billing/credits (+ plano opcional de /alpha/billing/subscriptions) -> { windows, plan, note }
function parseCredits(body, plan = null) {
  const wl = body.windowLimits || {};
  const windows = [];
  for (const [k, key] of [['fiveHour', 'five_hour'], ['weekly', 'weekly']]) {
    const w = wl[k];
    if (!w) continue;
    const used = num(w.used);
    const cap = num(w.cap);
    windows.push({ key, percent: cap ? Math.min(100, (used / cap) * 100) : 0, resetsAt: toMs(w.resetAt), detail: cap ? `${used != null ? +used.toFixed(2) : 0} / ${cap}` : null });
  }
  const cr = body.credits || {};
  const monthly = num(cr.monthlyCredits);
  const total = (monthly || 0) + (num(cr.purchasedCredits) || 0) + (num(cr.freeCredits) || 0);
  return { windows, plan, note: monthly != null ? 'credits_left' : null, noteParams: { amount: total.toFixed(2) } };
}

// /alpha/billing/subscriptions -> id do plano (ou null)
const parsePlan = (body) => body?.data?.planId || null;

async function run(cfg) {
  const key = readKey(cfg);
  if (!key) return { action: 'key', error: 'cc_nokey' };
  const c = await get('/alpha/billing/credits', key);
  if (c.status === 401 || c.status === 403) return { action: 'key', error: 'cc_invalid' };
  if (c.status !== 200 || !c.body) return { error: 'http', errorParams: { name: 'Command Code', status: c.status } };
  let plan = null;
  try {
    plan = parsePlan((await get('/alpha/billing/subscriptions', key)).body);
  } catch (_) {}
  return parseCredits(c.body, plan);
}

module.exports = {
  id: 'commandcode',
  name: 'Command Code',
  loginUrl: null,
  run,
  parseCredits,
  parsePlan,
};
