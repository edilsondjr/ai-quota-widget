// Provider registry. All endpoints used are UNOFFICIAL (taken from what the sites/CLIs
// themselves use). If one breaks, the fix is only in that provider's file.
//
// To add a provider: create providers/<id>.js exporting
//   { id, name, loginUrl, run(cfg) -> { windows, plan?, note? } | { error } | { action } }
// and add it to the list below.
const { partitionFor, cleanUA, clearSession, dropHidden } = require('./browser');
const claude = require('./claude');

const PROVIDERS = [claude, require('./chatgpt'), require('./commandcode'), require('./ollama')];

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

// Frees what a provider keeps alive (its hidden browser window); used when it is turned off.
function release(id) {
  dropHidden(id);
  if (id === 'claude') claude.reset();
}

module.exports = { PROVIDERS, collect, release, clearSession, partitionFor, cleanUA, resetClaudeOrg: claude.reset };
