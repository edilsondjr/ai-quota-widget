// Tradutor mínimo, usado pela interface (script clássico) e pelo processo principal (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.i18n = factory();
})(this, function () {
  const format = (str, params) => str.replace(/\{(\w+)\}/g, (m, k) => (params && params[k] != null ? String(params[k]) : m));

  // strings = { chave: texto }. Chave ausente devolve a própria chave.
  const translator = (strings) => (key, params) => format(strings[key] != null ? strings[key] : key, params);

  return { format, translator };
});
