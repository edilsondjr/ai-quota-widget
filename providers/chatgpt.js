const { num, toMs, humanSecs, parseJson, isCloudflare } = require('./util');
const { pageFetch } = require('./browser');

// /backend-api/wham/usage -> { windows, plan } ou { error }
function parseUsage(body, now = Date.now()) {
  const rl = body.rate_limit || {};
  const windows = [];
  for (const w of [rl.primary_window, rl.secondary_window]) {
    if (!w) continue;
    const secs = num(w.limit_window_seconds);
    const label = secs === 18000 ? '5 h' : secs === 604800 ? 'Semana' : secs ? humanSecs(secs) : 'Janela';
    const resetsAt = w.reset_at ? toMs(w.reset_at) : num(w.reset_after_seconds) != null ? now + w.reset_after_seconds * 1000 : null;
    windows.push({ label, percent: num(w.used_percent) ?? 0, resetsAt });
  }
  if (!windows.length) return { error: 'Resposta sem janelas de uso reconhecíveis (formato mudou?).', plan: body.plan_type };
  return { windows, plan: body.plan_type };
}

async function run() {
  const origin = 'https://chatgpt.com';
  const s = await pageFetch('chatgpt', origin, '/api/auth/session');
  if (isCloudflare(s.text)) return { error: 'Cloudflare bloqueou a consulta. Tente atualizar de novo em instantes.' };
  const sess = parseJson(s);
  if (!sess || !sess.accessToken) return { action: 'login' };
  const headers = { Authorization: `Bearer ${sess.accessToken}`, Accept: 'application/json' };
  const acct = sess.account?.id || sess.accountId;
  if (acct) headers['ChatGPT-Account-ID'] = acct;
  const r = await pageFetch('chatgpt', origin, '/backend-api/wham/usage', headers);
  if (r.status === 401 || r.status === 403) return { action: 'login' };
  const body = parseJson(r);
  if (r.status !== 200 || !body) return { error: `ChatGPT respondeu ${r.status}.` };
  return parseUsage(body);
}

module.exports = {
  id: 'chatgpt',
  name: 'ChatGPT',
  loginUrl: 'https://chatgpt.com/auth/login',
  run,
  parseUsage,
};
