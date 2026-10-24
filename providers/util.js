// Pure helpers shared by the providers (no Electron dependency).
// Convention: providers never return UI text. Windows carry a stable `key`
// (its text comes from locales/*.json as "win.<key>"), and errors/notes are codes
// ("err.<code>", "note.<code>") with parameters in `errorParams` / `noteParams`.
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
