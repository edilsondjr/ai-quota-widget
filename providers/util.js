// Funções puras compartilhadas pelos provedores (sem dependência do Electron).
// Convenção: os provedores não devolvem texto de interface. Janelas têm `key` estável
// (o texto vem de locales/*.json: "win.<key>"), e erros/notas são códigos
// ("err.<code>", "note.<code>") com parâmetros em `errorParams` / `noteParams`.
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : null);

function toMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(v);
  return isNaN(t) ? null : t;
}

function parseJson(r) {
  try {
    return JSON.parse(r.text);
  } catch (_) {
    return null;
  }
}

const isCloudflare = (t) => /just a moment|cf-chl|challenge-platform/i.test(t || '');

module.exports = { num, toMs, parseJson, isCloudflare };
