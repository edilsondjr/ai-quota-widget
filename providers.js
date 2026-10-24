// Coleta de quotas. Todos os endpoints abaixo são NÃO oficiais (extraídos do que
// os próprios sites/CLIs usam). Se algum quebrar, o ajuste é só neste arquivo.
const { BrowserWindow, session, net, app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------- utilitários ----------
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : null);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

function toMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(v);
  return isNaN(t) ? null : t;
}

function humanSecs(s) {
  if (s % 604800 === 0) return `${s / 604800} sem.`;
  if (s % 86400 === 0) return `${s / 86400} d`;
  if (s % 3600 === 0) return `${s / 3600} h`;
  return `${Math.round(s / 60)} min`;
}

function partitionFor(id) {
  return `persist:qw-${id}`;
}

const uaDone = new Set();
function cleanUA(id) {
  if (uaDone.has(id)) return;
  const ses = session.fromPartition(partitionFor(id));
  const ua = ses
    .getUserAgent()
    .replace(/\s?Electron\/\S+/, '')
    .replace(new RegExp('\\s?' + esc(app.getName()) + '\\/\\S+'), '');
  ses.setUserAgent(ua);
  uaDone.add(id);
}

// ---------- fetch dentro de uma página real (cookies + TLS de Chromium) ----------
const hidden = new Map();

async function getHidden(id, origin) {
  let win = hidden.get(id);
  if (win && !win.isDestroyed()) return win;
  cleanUA(id);
  win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: { partition: partitionFor(id), contextIsolation: true, sandbox: true },
  });
  hidden.set(id, win);
  try {
    await win.loadURL(origin + '/robots.txt');
  } catch (_) {
    /* mesmo com erro de carga o contexto de origem pode servir */
  }
  return win;
}

async function pageFetch(id, origin, url, headers = {}) {
  const win = await getHidden(id, origin);
  const js = `(async () => {
    try {
      const r = await fetch(${JSON.stringify(url)}, { credentials: 'include', headers: ${JSON.stringify(headers)} });
      const t = await r.text();
      return { status: r.status, url: r.url, text: t };
    } catch (e) { return { status: 0, error: String(e) }; }
  })()`;
  return win.webContents.executeJavaScript(js);
}

function dropHidden(id) {
  const win = hidden.get(id);
  if (win && !win.isDestroyed()) win.destroy();
  hidden.delete(id);
}

async function clearSession(id) {
  dropHidden(id);
  await session.fromPartition(partitionFor(id)).clearStorageData();
}

const isCloudflare = (t) => /just a moment|cf-chl|challenge-platform/i.test(t || '');

function parseJson(r) {
  try {
    return JSON.parse(r.text);
  } catch (_) {
    return null;
  }
}

// ---------- Claude ----------
const CLAUDE_LABELS = {
  five_hour: '5 h',
  seven_day: 'Semana',
  seven_day_sonnet: 'Sonnet (sem.)',
  seven_day_opus: 'Opus (sem.)',
  seven_day_omelette: 'Design (sem.)',
  extra_usage: 'Uso extra (mês)',
};
const CLAUDE_ORDER = ['five_hour', 'seven_day', 'seven_day_sonnet', 'seven_day_opus'];

function collectWindows(obj, out = [], key = '') {
  if (!obj || typeof obj !== 'object') return out;
  const pct = num(obj.utilization ?? obj.used_percent);
  if (pct !== null && key) out.push({ key, percent: pct, resetsAt: toMs(obj.resets_at ?? obj.reset_at) });
  for (const [k, v] of Object.entries(obj)) if (v && typeof v === 'object') collectWindows(v, out, k);
  return out;
}

let claudeOrg = null;
async function claude(cfg = {}) {
  const origin = 'https://claude.ai';
  if (!claudeOrg) {
    const r = await pageFetch('claude', origin, '/api/organizations');
    if (isCloudflare(r.text)) return { error: 'Cloudflare bloqueou a consulta. Tente atualizar de novo em instantes.' };
    if (r.status === 401 || r.status === 403 || r.status === 0) return { action: 'login' };
    const orgs = parseJson(r);
    if (!Array.isArray(orgs) || !orgs.length) return { action: 'login' };
    const chat = orgs.find((o) => (o.capabilities || []).includes('chat')) || orgs[0];
    claudeOrg = chat.uuid;
  }
  const r = await pageFetch('claude', origin, `/api/organizations/${claudeOrg}/usage`);
  if (r.status === 401 || r.status === 403) {
    claudeOrg = null;
    return { action: 'login' };
  }
  const body = parseJson(r);
  if (r.status !== 200 || !body) return { error: `Claude respondeu ${r.status}.` };
  const seen = new Map();
  for (const w of collectWindows(body)) if (!seen.has(w.key)) seen.set(w.key, w);
  // chaves internas sem rótulo conhecido (ex.: iguana_necktie) ficam ocultas, a menos que claudeShowUnknown seja true
  const windows = [...seen.values()]
    .filter((w) => CLAUDE_LABELS[w.key] || cfg.claudeShowUnknown)
    .sort((a, b) => {
      const ia = CLAUDE_ORDER.indexOf(a.key);
      const ib = CLAUDE_ORDER.indexOf(b.key);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map((w) => ({ label: CLAUDE_LABELS[w.key] || w.key.replace(/_/g, ' '), percent: w.percent, resetsAt: w.resetsAt }));
  if (!windows.length) return { error: 'Resposta sem janelas de uso reconhecíveis (formato mudou?).' };
  return { windows };
}

// ---------- ChatGPT (Codex / wham) ----------
async function chatgpt() {
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
  const rl = body.rate_limit || {};
  const windows = [];
  for (const w of [rl.primary_window, rl.secondary_window]) {
    if (!w) continue;
    const secs = num(w.limit_window_seconds);
    const label = secs === 18000 ? '5 h' : secs === 604800 ? 'Semana' : secs ? humanSecs(secs) : 'Janela';
    const resetsAt = w.reset_at ? toMs(w.reset_at) : num(w.reset_after_seconds) != null ? Date.now() + w.reset_after_seconds * 1000 : null;
    windows.push({ label, percent: num(w.used_percent) ?? 0, resetsAt });
  }
  if (!windows.length) return { error: 'Resposta sem janelas de uso reconhecíveis (formato mudou?).', plan: body.plan_type };
  return { windows, plan: body.plan_type };
}

// ---------- Command Code ----------
function commandCodeKey(cfg) {
  if (cfg.commandcodeApiKey) return cfg.commandcodeApiKey;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.commandcode', 'auth.json'), 'utf8'));
    return j.apiKey || j['command-code']?.key || j.commandcode || null;
  } catch (_) {
    return null;
  }
}

async function ccGet(p, key) {
  const r = await net.fetch('https://api.commandcode.ai' + p, { headers: { Authorization: `Bearer ${key}` } });
  const text = await r.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch (_) {}
  return { status: r.status, body };
}

async function commandcode(cfg) {
  const key = commandCodeKey(cfg);
  if (!key) return { action: 'key', error: 'Sem chave. Rode "cmd login" ou preencha commandcodeApiKey no config.' };
  const c = await ccGet('/alpha/billing/credits', key);
  if (c.status === 401 || c.status === 403) return { action: 'key', error: 'Chave do Command Code inválida ou expirada.' };
  if (c.status !== 200 || !c.body) return { error: `Command Code respondeu ${c.status}.` };
  const wl = c.body.windowLimits || {};
  const windows = [];
  for (const [k, label] of [['fiveHour', '5 h'], ['weekly', 'Semana']]) {
    const w = wl[k];
    if (!w) continue;
    const used = num(w.used);
    const cap = num(w.cap);
    windows.push({ label, percent: cap ? Math.min(100, (used / cap) * 100) : 0, resetsAt: toMs(w.resetAt), detail: cap ? `${used} / ${cap}` : null });
  }
  const cr = c.body.credits || {};
  const monthly = num(cr.monthlyCredits);
  const total = (monthly || 0) + (num(cr.purchasedCredits) || 0) + (num(cr.freeCredits) || 0);
  let plan = null;
  try {
    const s = await ccGet('/alpha/billing/subscriptions', key);
    plan = s.body?.data?.planId || null;
  } catch (_) {}
  return { windows, plan, note: monthly != null ? `Créditos restantes: $${total.toFixed(2)}` : null };
}

// ---------- Ollama ----------
function flatten(obj, prefix = '', out = []) {
  if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  else out.push([prefix, obj]);
  return out;
}

// Formato real de ollama.com/api/usage: { limits: { session: { usage }, weekly: { usage } }, activity: {...} }
// "usage" vem como fração (0.213 = 21,3%).
function ollamaFromJson(j) {
  const limits = (j && j.limits) || {};
  const out = [];
  for (const [key, label] of [['session', 'Sessão (5 h)'], ['weekly', 'Semana']]) {
    const o = limits[key];
    if (!o || typeof o !== 'object') continue;
    const raw = num(o.usage);
    if (raw === null) continue;
    const percent = Math.round((raw <= 1 ? raw * 100 : raw) * 10) / 10;
    // o campo de renovação não é documentado: procura qualquer chave com cara de data de reset
    const rk = Object.keys(o).find((k) => /reset|end|until|expire/i.test(k) && toMs(o[k]) !== null && typeof o[k] !== 'boolean');
    out.push({ label, percent, resetsAt: rk ? toMs(o[rk]) : null });
  }
  return out;
}

function ollamaFromHtml(html) {
  const clean = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
  const text = clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const out = [];
  for (const [re, label] of [[/session/i, 'Sessão (5 h)'], [/week/i, 'Semana']]) {
    const i = text.search(re);
    if (i < 0) continue;
    const m = text.slice(i, i + 160).match(/(\d+(?:\.\d+)?)\s*%/);
    if (!m) continue;
    const ri = clean.search(re);
    const t = ri >= 0 ? clean.slice(ri, ri + 800).match(/data-time="([^"]+)"/) : null;
    out.push({ label, percent: +m[1], resetsAt: t ? toMs(t[1]) : null });
  }
  const plan = text.match(/\b(Free|Pro|Max)\s+plan\b|\bplan[:\s]+(Free|Pro|Max)\b/i);
  return { windows: out, plan: plan ? (plan[1] || plan[2]).toLowerCase() : null };
}

// Planos novos do Ollama: crédito mensal em USD (Pro = US$ 60, Max = US$ 300), renovado no dia
// em que a assinatura começou. A API só expõe o gasto diário (range = 24h | 7d | 30d).
const OLLAMA_ALLOWANCE = { pro: 60, max: 300 };

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

async function ollamaApi(key) {
  const headers = { Authorization: `Bearer ${key}` };
  const r = await net.fetch('https://ollama.com/api/usage?range=30d', { headers });
  if (r.status === 401 || r.status === 403) return { action: 'key', error: 'ollamaApiKey inválida ou sem permissão.' };
  if (r.status !== 200) return { error: `API do Ollama respondeu ${r.status}.` };
  let j = null;
  try {
    j = await r.json();
  } catch (_) {}
  if (!j || typeof j !== 'object') return { error: 'API do Ollama devolveu algo que não é JSON.' };

  // planos antigos: limites de sessão/semana
  const legacy = ollamaFromJson(j);
  if (legacy.length) return { windows: legacy };

  if (!Array.isArray(j.buckets)) {
    return { error: `API do Ollama respondeu, mas em formato desconhecido (campos: ${Object.keys(j).join(', ')}).` };
  }

  let plan = null;
  let createdAt = null;
  try {
    const me = await net.fetch('https://ollama.com/api/me', { method: 'POST', headers });
    if (me.status === 200) {
      const m = await me.json();
      plan = m.Plan ? String(m.Plan).toLowerCase() : null;
      createdAt = m.CreatedAt ? Date.parse(m.CreatedAt) : null;
    }
  } catch (_) {}

  const day = Number(cfgRef.ollamaBillingDay) || (createdAt ? new Date(createdAt).getUTCDate() : 1);
  const { start, end } = cycleBounds(day);
  let spent = 0;
  let requests = 0;
  for (const b of j.buckets) {
    if (Date.parse(b.from) >= start) {
      spent += num(b.usage_usd) || 0;
      requests += num(b.request_count) || 0;
    }
  }
  const allowance = num(cfgRef.ollamaMonthlyCredits) || OLLAMA_ALLOWANCE[plan] || null;
  const since = new Date(start).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  if (!allowance) {
    return { plan, windows: [], note: `Gasto no ciclo (desde ${since}): $${spent.toFixed(2)} · ${requests} req`, error: 'Sem valor de crédito mensal conhecido: defina ollamaMonthlyCredits no config.' };
  }
  return {
    plan,
    windows: [
      {
        label: 'Mês (crédito)',
        percent: Math.min(100, (spent / allowance) * 100),
        resetsAt: end,
        detail: `$${spent.toFixed(2)} / $${allowance}`,
      },
    ],
    note: `${requests} requisições desde ${since}`,
  };
}

let cfgRef = {};
async function ollama(cfg) {
  cfgRef = cfg;
  if (cfg.ollamaApiKey) return ollamaApi(cfg.ollamaApiKey);
  const r = await pageFetch('ollama', 'https://ollama.com', '/settings');
  if (isCloudflare(r.text)) return { error: 'Cloudflare bloqueou a consulta. Tente atualizar de novo em instantes.' };
  if (r.status === 401 || r.status === 0 || /\/signin|\/login/.test(r.url || '')) return { action: 'login' };
  const { windows, plan } = ollamaFromHtml(r.text || '');
  if (!windows.length) return { error: 'Não consegui ler o uso na página de settings (layout mudou?). Alternativa: ollamaApiKey no config.' };
  return { windows, plan };
}

// ---------- registro ----------
const PROVIDERS = [
  { id: 'claude', name: 'Claude', run: (cfg) => claude(cfg), loginUrl: 'https://claude.ai/login' },
  { id: 'chatgpt', name: 'ChatGPT', run: () => chatgpt(), loginUrl: 'https://chatgpt.com/auth/login' },
  { id: 'commandcode', name: 'Command Code', run: (cfg) => commandcode(cfg), loginUrl: null },
  { id: 'ollama', name: 'Ollama', run: (cfg) => ollama(cfg), loginUrl: 'https://ollama.com/signin' },
];

async function collect(id, cfg) {
  const p = PROVIDERS.find((x) => x.id === id);
  const base = { id: p.id, name: p.name, canLogin: !!p.loginUrl, fetchedAt: Date.now() };
  try {
    const r = await p.run(cfg);
    return { ...base, ...r, ok: !!r.windows && !r.error };
  } catch (e) {
    return { ...base, ok: false, error: String(e && e.message ? e.message : e) };
  }
}

module.exports = { PROVIDERS, collect, clearSession, partitionFor, cleanUA, resetClaudeOrg: () => (claudeOrg = null) };
