// Minimal translator, used by the UI (classic script) and the main process (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.i18n = factory();
})(this, function () {
  const format = (str, params) => str.replace(/\{(\w+)\}/g, (m, k) => (params && params[k] != null ? String(params[k]) : m));

  // strings = { key: text }. A missing key returns the key itself.
  const translator = (strings) => (key, params) => format(strings[key] != null ? strings[key] : key, params);

  return { format, translator };
});
