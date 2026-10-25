// Generic provider settings: validation, secret discovery and the metadata the UI
// needs. Pure functions (no Electron), so they can be tested outside the app.

function fields(providers) {
  return providers.flatMap((p) => (p.settings || []).map((f) => ({ ...f, providerId: p.id })));
}

function secretKeys(providers) {
  return fields(providers)
    .filter((f) => f.type === 'secret')
    .map((f) => f.key);
}

// Current values sent to the UI: secrets are reduced to an "is set" flag.
function meta(providers, cfg) {
  return providers.map((p) => {
    const values = {};
    const secrets = {};
    for (const f of p.settings || []) {
      if (f.type === 'secret') secrets[f.key] = !!cfg[f.key];
      else values[f.key] = cfg[f.key] == null ? (f.type === 'boolean' ? false : null) : cfg[f.key];
    }
    return { id: p.id, name: p.name, canLogin: !!p.loginUrl, custom: !!p.custom, fields: p.settings || [], values, secrets };
  });
}

// { ok, value } for a declared field; { ok: false } leaves the stored value untouched.
function coerce(field, value) {
  if (field.type === 'secret' || field.type === 'string') {
    if (typeof value !== 'string') return { ok: false };
    return { ok: true, value: value.trim() };
  }
  if (field.type === 'number') {
    if (value === null || value === '' || value === undefined) return { ok: true, value: null };
    const n = Number(value);
    if (!Number.isFinite(n)) return { ok: false };
    if (field.min != null && n < field.min) return { ok: false };
    if (field.max != null && n > field.max) return { ok: false };
    return { ok: true, value: n };
  }
  if (field.type === 'boolean') return { ok: true, value: !!value };
  return { ok: false };
}

// Config written to disk. Secret values never leave this function in plain text:
// they are either encrypted by `encrypt` or dropped (when encryption is unavailable).
function hasPlaintextSecrets(raw, secretKeys) {
  if (!raw || typeof raw !== 'object') return false;
  return secretKeys.some((key) => typeof raw[key] === 'string' && raw[key]);
}

function configForDisk(cfg, secretKeys, encrypt) {
  const out = { ...cfg };
  for (const k of secretKeys) delete out[k];
  delete out.secrets;
  out.secrets = {};
  if (!encrypt) return out;
  for (const k of secretKeys) {
    if (cfg[k]) out.secrets[k] = encrypt(cfg[k]);
  }
  return out;
}

module.exports = { fields, secretKeys, meta, coerce, hasPlaintextSecrets, configForDisk };
