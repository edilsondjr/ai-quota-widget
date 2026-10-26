(function (root) {
  function isConfigured(meta, reading) {
    if (meta.canLogin) return !!(meta.configured || (reading && (reading.ok || reading.lastSuccessAt)));
    const secrets = (meta.fields || []).filter((field) => field.type === 'secret');
    if (secrets.length) return secrets.every((field) => !!(meta.secrets && meta.secrets[field.key]));
    return !!meta.custom;
  }

  const api = { isConfigured };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.providerState = api;
})(typeof window === 'object' ? window : globalThis);
