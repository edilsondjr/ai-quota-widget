// Funções puras compartilhadas pelos provedores (sem dependência do Electron).
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : null);

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

function parseJson(r) {
  try {
    return JSON.parse(r.text);
  } catch (_) {
    return null;
  }
}

const isCloudflare = (t) => /just a moment|cf-chl|challenge-platform/i.test(t || '');

module.exports = { num, toMs, humanSecs, parseJson, isCloudflare };
