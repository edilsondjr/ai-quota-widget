// Provider registry. All endpoints used are UNOFFICIAL (taken from what the sites/CLIs
// themselves use). If one breaks, the fix is only in that provider's file.
//
// To add a provider: create providers/<id>.js exporting
//   { id, name, loginUrl, settings, run(cfg) -> { windows, plan?, note? } | { error } | { action } }
// and add it to the list below.
const { partitionFor, cleanUA, hardenSession, hardenWebContents, clearSession, dropHidden } = require('./browser');
const claude = require('./claude');

const BUILTIN_PROVIDERS = [
  claude,
  require('./chatgpt'),
  require('./commandcode'),
  require('./ollama'),
  require('./openrouter'),
  require('./deepseek'),
  require('./moonshot'),
  require('./copilot'),
  require('./synthetic'),
  require('./nanogpt'),
  require('./openai'),
  require('./anthropic'),
  require('./xai'),
  require('./mistral'),
  require('./opencode'),
];

let PROVIDERS = BUILTIN_PROVIDERS;

function setCustomProviders(list) {
  PROVIDERS = [...BUILTIN_PROVIDERS, ...(Array.isArray(list) ? list : [])];
}

function getProviders() {
  return PROVIDERS;
}

async function collect(id, cfg) {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) return { id, name: id, canLogin: false, fetchedAt: Date.now(), ok: false, error: 'unknown_provider' };
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

module.exports = {
  PROVIDERS: BUILTIN_PROVIDERS,
  BUILTIN_PROVIDERS,
  getProviders,
  setCustomProviders,
  collect,
  release,
  clearSession,
  partitionFor,
  cleanUA,
  hardenSession,
  hardenWebContents,
  resetClaudeOrg: claude.reset,
};
