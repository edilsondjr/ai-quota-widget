// User-defined providers. A custom provider is a small data-driven spec stored in
// config.json; no user code is evaluated. Responses are mapped with dot/bracket paths.
const { num, toMs } = require('./util');
const { netFetch } = require('./browser');

const MAX_SPEC = 20000;

// Resolve "data.items[0].value" (or "$.data.items[0].value") against a JSON object.
function getPath(obj, path) {
  if (path == null || path === '') return undefined;
  const clean = String(path).replace(/^\$\.?/, '');
  if (!clean) return obj;
  let cur = obj;
  for (const part of clean.split('.')) {
    if (cur == null) return undefined;
    const m = /^([^[\]]+)(?:\[(\d+)\])?$/.exec(part);
    if (!m) return undefined;
    cur = cur[m[1]];
    if (m[2] != null) cur = Array.isArray(cur) ? cur[+m[2]] : undefined;
  }
  return cur;
}

function parseCustom(spec, body) {
  const mapping = (spec && spec.mapping) || {};
  const windows = [];
  for (const w of mapping.windows || []) {
    const value = num(getPath(body, w.percent));
    if (value == null) continue;
    const percent = w.scale === 'fraction' ? value * 100 : value;
    const reset = w.resetsAt ? getPath(body, w.resetsAt) : null;
    const detail = w.detail ? getPath(body, w.detail) : null;
    windows.push({
      key: w.key,
      label: w.label || null,
      percent: Math.min(100, Math.max(0, percent)),
      resetsAt: reset == null ? null : toMs(reset),
      detail: detail == null ? null : String(detail),
    });
  }

  let noteText = null;
  if (mapping.note && mapping.note.template) {
    const values = {};
    for (const [name, path] of Object.entries(mapping.note.values || {})) {
      const value = getPath(body, path);
      values[name] = value == null ? '' : String(value);
    }
    noteText = String(mapping.note.template).replace(/\{(\w+)\}/g, (m, name) => (values[name] != null ? values[name] : m));
  }

  const planValue = mapping.plan ? getPath(body, mapping.plan) : null;
  if (!windows.length && !noteText) return { error: 'custom_no_data' };
  return { windows, plan: planValue == null ? null : String(planValue), noteText };
}

const isPath = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 200;

// Validate and normalize the spec sent by the settings UI. Returns { ok, spec } or { ok: false, error }.
function normalizeSpec(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Invalid spec' };
  let size = 0;
  try {
    size = JSON.stringify(input).length;
  } catch (_) {
    return { ok: false, error: 'Invalid spec' };
  }
  if (size > MAX_SPEC) return { ok: false, error: 'Spec is too large' };

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 60) return { ok: false, error: 'Name is required (max 60 characters)' };

  const url = typeof input.url === 'string' ? input.url.trim() : '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return { ok: false, error: 'URL is invalid' };
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
    return { ok: false, error: 'URL must use https (http is allowed only for localhost)' };
  }

  const method = String(input.method || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET';
  const rawAuth = String(input.auth || 'bearer').toLowerCase();
  const auth = ['bearer', 'header', 'none'].includes(rawAuth) ? rawAuth : 'bearer';
  const authHeader = typeof input.authHeader === 'string' && input.authHeader.trim() ? input.authHeader.trim() : 'Authorization';
  if (auth === 'header' && !/^[A-Za-z0-9-]+$/.test(authHeader)) return { ok: false, error: 'Header name is invalid' };
  const authPrefix = typeof input.authPrefix === 'string' ? input.authPrefix : '';

  const headers = {};
  if (input.headers != null) {
    if (typeof input.headers !== 'object' || Array.isArray(input.headers)) return { ok: false, error: 'Headers must be an object' };
    for (const [key, value] of Object.entries(input.headers)) {
      if (!/^[A-Za-z0-9-]+$/.test(key)) return { ok: false, error: `Invalid header: ${key}` };
      if (typeof value !== 'string') return { ok: false, error: `Header ${key} must be a string` };
      headers[key] = value;
      if (Object.keys(headers).length > 30) return { ok: false, error: 'Too many headers' };
    }
  }

  const body = typeof input.body === 'string' ? input.body : '';
  if (method === 'POST' && body) {
    try {
      JSON.parse(body);
    } catch (_) {
      return { ok: false, error: 'Body must be valid JSON' };
    }
  }

  const mapping = input.mapping;
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return { ok: false, error: 'Mapping is required' };
  if (mapping.windows != null && !Array.isArray(mapping.windows)) return { ok: false, error: 'mapping.windows must be an array' };

  const windows = [];
  const seen = new Set();
  for (const w of mapping.windows || []) {
    if (!w || typeof w !== 'object' || Array.isArray(w)) return { ok: false, error: 'Each window must be an object' };
    const key = typeof w.key === 'string' ? w.key.trim() : '';
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(key)) return { ok: false, error: 'Window key is invalid' };
    if (seen.has(key)) return { ok: false, error: `Duplicate window key: ${key}` };
    seen.add(key);
    if (!isPath(w.percent)) return { ok: false, error: `Window ${key}: percent path is required` };
    const label = typeof w.label === 'string' ? w.label.trim().slice(0, 40) : '';
    windows.push({
      key,
      label: label || null,
      percent: w.percent.trim(),
      scale: String(w.scale || '').toLowerCase() === 'fraction' ? 'fraction' : 'percent',
      resetsAt: isPath(w.resetsAt) ? w.resetsAt.trim() : null,
      detail: isPath(w.detail) ? w.detail.trim() : null,
    });
  }

  let note = null;
  if (mapping.note != null) {
    if (typeof mapping.note !== 'object' || Array.isArray(mapping.note)) return { ok: false, error: 'mapping.note must be an object' };
    const template = typeof mapping.note.template === 'string' ? mapping.note.template.trim() : '';
    if (!template || template.length > 200) return { ok: false, error: 'Note template is required (max 200 characters)' };
    const values = {};
    if (mapping.note.values != null) {
      if (typeof mapping.note.values !== 'object' || Array.isArray(mapping.note.values)) {
        return { ok: false, error: 'mapping.note.values must be an object' };
      }
      for (const [key, path] of Object.entries(mapping.note.values)) {
        if (!/^\w+$/.test(key)) return { ok: false, error: `Invalid note value name: ${key}` };
        if (!isPath(path)) return { ok: false, error: `Note value ${key} needs a path` };
        values[key] = path.trim();
      }
    }
    note = { template, values };
  }

  if (!windows.length && !note) return { ok: false, error: 'Add at least one window or a note' };
  const plan = isPath(mapping.plan) ? mapping.plan.trim() : null;
  return { ok: true, spec: { name, url, method, auth, authHeader, authPrefix, headers, body, mapping: { windows, note, plan } } };
}

async function runCustom(spec, cfg) {
  const key = spec.keyName ? cfg[spec.keyName] : '';
  if (spec.auth !== 'none' && !key) return { action: 'key', error: 'custom_nokey' };

  const headers = { ...(spec.headers || {}) };
  if (spec.auth === 'bearer') headers.Authorization = `Bearer ${key}`;
  else if (spec.auth === 'header') {
    headers[spec.authHeader || 'Authorization'] = `${spec.authPrefix || ''}${key}`;
  }
  const method = spec.method || 'GET';
  if (method === 'POST' && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }

  const init = { method, headers, signal: AbortSignal.timeout(15000) };
  if (method === 'POST' && spec.body) init.body = spec.body;

  let res;
  try {
    res = await netFetch(spec.url, init);
  } catch (e) {
    return { error: 'custom_network', errorParams: { message: e && e.message ? e.message : String(e) } };
  }
  if (res.status === 401 || res.status === 403) return { action: 'key', error: 'custom_badkey' };
  if (res.status !== 200) return { error: 'http', errorParams: { name: spec.name, status: res.status } };

  let body = null;
  try {
    body = await res.json();
  } catch (_) {}
  if (!body) return { error: 'custom_notjson' };
  return parseCustom(spec, body);
}

function buildCustomProvider(spec) {
  if (!spec || typeof spec !== 'object' || !spec.id || !spec.name) return null;
  return {
    id: spec.id,
    name: spec.name,
    loginUrl: null,
    custom: true,
    settings: spec.auth === 'none' || !spec.keyName ? [] : [{ key: spec.keyName, type: 'secret' }],
    run: (cfg) => runCustom(spec, cfg),
  };
}

module.exports = { getPath, parseCustom, normalizeSpec, runCustom, buildCustomProvider };
