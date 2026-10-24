// Índice dos provedores. Todos os endpoints usados são NÃO oficiais (extraídos do que
// os próprios sites/CLIs usam). Se algum quebrar, o ajuste é só no arquivo do provedor.
//
// Para adicionar um provedor: crie providers/<id>.js exportando
//   { id, name, loginUrl, run(cfg) -> { windows, plan?, note? } | { error } | { action } }
// e acrescente-o na lista abaixo.
const { partitionFor, cleanUA, clearSession } = require('./browser');
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

module.exports = { PROVIDERS, collect, clearSession, partitionFor, cleanUA, resetClaudeOrg: claude.reset };
