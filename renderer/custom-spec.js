// Guided <-> JSON spec conversion for custom providers. Kept as a UMD module so the
// renderer can use it directly and Node tests can require it.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.customSpec = factory();
})(this, function () {
  const AUTH = ['bearer', 'header', 'none'];

  function toGuided(spec = {}) {
    const mapping = spec.mapping || {};
    const windows = Array.isArray(mapping.windows) ? mapping.windows : [];
    const w = windows[0] || {};
    const note = mapping.note || {};
    const values = note.values && typeof note.values === 'object' ? note.values : {};
    const valueNames = Object.keys(values);
    return {
      complex: windows.length > 1 || valueNames.length > 1,
      guided: {
        name: spec.name || '',
        url: spec.url || '',
        method: spec.method === 'POST' ? 'POST' : 'GET',
        auth: AUTH.includes(spec.auth) ? spec.auth : 'bearer',
        authHeader: spec.authHeader || 'Authorization',
        authPrefix: spec.authPrefix || '',
        headers: JSON.stringify(spec.headers || {}, null, 2),
        body: spec.body || '',
        windowKey: w.key || '',
        windowLabel: w.label || '',
        percent: w.percent || '',
        scale: w.scale === 'fraction' ? 'fraction' : 'percent',
        resetsAt: w.resetsAt || '',
        detail: w.detail || '',
        noteTemplate: note.template || '',
        noteAmountPath: valueNames.length ? values[valueNames[0]] : '',
        plan: mapping.plan || '',
      },
    };
  }

  function buildSpec(g = {}) {
    const spec = {
      name: String(g.name || '').trim(),
      url: String(g.url || '').trim(),
      method: g.method === 'POST' ? 'POST' : 'GET',
      auth: AUTH.includes(g.auth) ? g.auth : 'bearer',
      headers: g.headers && typeof g.headers === 'object' && !Array.isArray(g.headers) ? g.headers : {},
      mapping: { windows: [] },
    };
    if (spec.auth === 'header') {
      spec.authHeader = String(g.authHeader || 'Authorization').trim();
      spec.authPrefix = String(g.authPrefix || '');
    }
    if (spec.method === 'POST' && g.body) spec.body = String(g.body);
    if (g.windowKey && g.percent) {
      const window = {
        key: String(g.windowKey).trim(),
        label: String(g.windowLabel || '').trim() || null,
        percent: String(g.percent).trim(),
        resetsAt: String(g.resetsAt || '').trim() || null,
        detail: String(g.detail || '').trim() || null,
      };
      if (g.scale === 'fraction') window.scale = 'fraction';
      spec.mapping.windows.push(window);
    }
    if (g.noteTemplate) {
      const values = {};
      if (g.noteAmountPath) values.amount = String(g.noteAmountPath).trim();
      spec.mapping.note = { template: String(g.noteTemplate).trim(), values };
    }
    if (g.plan) spec.mapping.plan = String(g.plan).trim();
    return spec;
  }

  const TEMPLATES = {
    usage: {
      name: 'My provider',
      url: 'https://api.example.com/usage',
      method: 'GET',
      auth: 'bearer',
      headers: {},
      mapping: {
        windows: [{ key: 'month', label: 'Month', percent: 'data.percent', resetsAt: 'data.reset', detail: 'data.detail' }],
      },
    },
    balance: {
      name: 'My provider',
      url: 'https://api.example.com/balance',
      method: 'GET',
      auth: 'bearer',
      headers: {},
      mapping: {
        windows: [],
        note: { template: 'Balance: {amount}', values: { amount: 'data.balance' } },
      },
    },
    cost: {
      name: 'My provider',
      url: 'https://api.example.com/cost',
      method: 'GET',
      auth: 'bearer',
      headers: {},
      mapping: {
        windows: [],
        note: { template: 'Cost this month: {amount}', values: { amount: 'data.total' } },
      },
    },
  };

  return { toGuided, buildSpec, TEMPLATES };
});
