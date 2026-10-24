const $ = (s) => document.querySelector(s);
const list = $('#list');
const foot = $('#foot');
const settings = $('#settings');
let last = null;
let inSettings = false;
let t = (k) => k;
let lang = 'en-US';
let draft = null;
let view = 'main';

// Strings come from the main process (locales/*.json) along with the state.
function applyStrings(state) {
  if (!state.strings) return;
  t = i18n.translator(state.strings);
  lang = state.lang || 'en-US';
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((n) => (n.textContent = t(n.dataset.i18n)));
  document.querySelectorAll('[data-i18n-title]').forEach((n) => (n.title = t(n.dataset.i18nTitle)));
}

// Text for a code coming from a provider (`err.<code>` / `note.<code>`).
// A code with no translation (e.g. an exception message) is shown as-is.
function providerText(prefix, code, params) {
  const p = { ...params };
  if (p.since != null) p.since = new Date(p.since).toLocaleDateString(lang, { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  const key = `${prefix}.${code}`;
  const text = t(key, p);
  return text === key ? String(code) : text;
}

function winLabel(key) {
  const m = /^secs_(\d+)$/.exec(key);
  if (m) {
    const s = +m[1];
    if (s % 604800 === 0) return t('dur.week', { n: s / 604800 });
    if (s % 86400 === 0) return t('dur.day', { n: s / 86400 });
    if (s % 3600 === 0) return t('dur.hour', { n: s / 3600 });
    return t('dur.min', { n: Math.round(s / 60) });
  }
  const text = t(`win.${key}`);
  return text === `win.${key}` ? key.replace(/_/g, ' ') : text;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function fmtReset(ms) {
  if (!ms) return '';
  const diff = ms - Date.now();
  if (diff <= 0) return t('reset.now');
  const m = Math.round(diff / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return t('reset.in', { t: `${d} d ${h} h` });
  if (h > 0) return t('reset.in', { t: `${h} h ${mm} min` });
  return t('reset.in', { t: `${mm} min` });
}

function level(p) {
  return p >= 85 ? 'bad' : p >= 60 ? 'warn' : 'ok';
}

function windowEl(w) {
  const pct = Math.max(0, Math.min(100, w.percent || 0));
  const box = el('div', 'win');
  const row = el('div', 'row');
  row.append(el('span', 'lbl', w.label || winLabel(w.key)), el('span', 'pct', `${pct.toFixed(pct < 10 ? 1 : 0)}%`));
  const track = el('div', 'track');
  const fill = el('div', `fill ${level(pct)}`);
  fill.style.width = `${pct}%`;
  track.append(fill);
  box.append(row, track);
  const sub = [w.detail, fmtReset(w.resetsAt)].filter(Boolean).join(' · ');
  if (sub) box.append(el('div', 'sub', sub));
  return box;
}

function metaFor(id) {
  return ((last && last.providerMeta) || []).find((m) => m.id === id) || { id, name: id, canLogin: false, custom: false, fields: [], values: {}, secrets: {} };
}

function card(id, p, cfg) {
  const hidden = (cfg.hiddenWindows && cfg.hiddenWindows[id]) || [];
  const meta = metaFor(id);
  const box = el('div', 'prov');
  const head = el('div', 'head');
  head.append(el('span', 'name', meta.name));
  if (p && p.plan) head.append(el('span', 'plan', String(p.plan)));
  head.append(el('span', 'spacer'));
  if (p && p.ok && p.canLogin) {
    const out = el('button', 'link dim', t('card.logout'));
    out.title = t('card.logout.title');
    out.onclick = () => window.qw.logout(id);
    head.append(out);
  }
  box.append(head);

  if (!p) {
    box.append(el('div', 'err', t('card.loading')));
    return box;
  }

  if (p.windows && p.windows.length) p.windows.filter((w) => !hidden.includes(w.key)).forEach((w) => box.append(windowEl(w)));
  if (p.noteText) box.append(el('div', 'note', p.noteText));
  else if (p.note) box.append(el('div', 'note', providerText('note', p.note, p.noteParams)));
  if (p.stale) box.append(el('div', 'note', t('card.stale')));

  if (!p.ok) {
    const msg = el('div', 'err');
    const errText = p.error ? providerText('err', p.error, p.errorParams) : null;
    if (p.action === 'login') msg.textContent = t('card.login_needed');
    else if (p.action === 'key') msg.textContent = errText || t('card.key_needed');
    else {
      const b = el('b', null, t('card.error'));
      msg.append(b, document.createTextNode(errText || t('card.failed')));
    }
    box.append(msg);
    const actions = el('div', 'actions');
    if (p.action === 'login' && p.canLogin) {
      const b = el('button', 'link', t('card.signin'));
      b.onclick = () => window.qw.login(id);
      actions.append(b);
    } else if (p.action === 'key') {
      const b = el('button', 'link', t('card.configure_key'));
      b.onclick = () => openSettings(id);
      actions.append(b);
    } else {
      const b = el('button', 'link', t('card.retry'));
      b.onclick = () => window.qw.refresh(id);
      actions.append(b);
      if (p.canLogin) {
        const l = el('button', 'link dim', t('card.resignin'));
        l.onclick = () => window.qw.login(id);
        actions.append(l);
      }
    }
    box.append(actions);
  }
  return box;
}

function fitWindow() {
  requestAnimationFrame(() => window.qw.resize(document.body.scrollHeight));
}

function render(state) {
  last = state;
  applyStrings(state);
  const cfg = state.config || {};
  const enabled = cfg.enabled || {};
  const pin = $('#btn-pin');
  pin.classList.toggle('on', !!state.pinned);
  pin.setAttribute('aria-pressed', String(!!state.pinned));
  $('#btn-refresh').classList.toggle('spin', !!state.loading);
  const when = state.updatedAt
    ? t('foot.updated', { time: new Date(state.updatedAt).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) })
    : t('foot.updating');
  foot.textContent = state.version ? `${when} · v${state.version}` : when;
  if (inSettings) return; // don't rebuild the form while the user is editing
  const ids = (state.providerMeta || []).map((m) => m.id).filter((id) => enabled[id] !== false);
  if (!ids.length) list.replaceChildren(el('div', 'err pad', t('list.none')));
  else list.replaceChildren(...ids.map((id) => card(id, state.providers[id], cfg)));
  fitWindow();
}

// ---------- settings screen ----------
function check(label, checked, cls) {
  const wrap = el('label', `chk ${cls || ''}`);
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!checked;
  wrap.append(input, el('span', null, label));
  return { wrap, input };
}

function field(label, input, hint) {
  const wrap = el('label', 'fld');
  wrap.append(el('span', 'fl', label), input);
  if (hint) wrap.append(el('span', 'hint', hint));
  return wrap;
}

function textInput(type, value, placeholder) {
  const i = document.createElement('input');
  i.type = type;
  i.value = value == null ? '' : value;
  if (placeholder) i.placeholder = placeholder;
  i.autocomplete = 'off';
  i.spellcheck = false;
  return i;
}

function fieldText(meta, f, suffix) {
  const key = `p.${meta.id}.${f.key}${suffix}`;
  const text = t(key);
  return text === key ? null : text;
}

function statusText(meta, p) {
  const secretSet = (meta.fields || []).some((f) => f.type === 'secret' && meta.secrets && meta.secrets[f.key]);
  if (p && p.ok) return meta.canLogin ? t('s.status.signed_in') : t('s.status.key_set');
  if (p && p.action === 'login') return t('s.status.signin_needed');
  if (p && p.action === 'key') return t('s.status.needs_key');
  if (secretSet) return t('s.status.key_set');
  return meta.canLogin ? t('s.status.signin_needed') : t('s.status.needs_key');
}

function openSettings(providerId) {
  if (!last) return;
  inSettings = true;
  view = providerId || 'main';
  const cfg = last.config || {};
  draft = {
    language: cfg.language || last.lang,
    intervalMin: cfg.intervalMin == null ? 5 : cfg.intervalMin,
    pinned: !!last.pinned,
    openAtLogin: !!cfg.openAtLogin,
    notify: cfg.notify !== false,
    enabled: { ...(cfg.enabled || {}) },
    providerIntervals: { ...(cfg.providerIntervals || {}) },
    hiddenWindows: JSON.parse(JSON.stringify(cfg.hiddenWindows || {})),
    values: {},
    secrets: {},
    clear: {},
  };
  for (const m of last.providerMeta || []) {
    for (const [k, v] of Object.entries(m.values || {})) draft.values[k] = v;
  }
  renderSettings();
}

function renderSettings() {
  let content;
  if (view === 'main') content = mainScreen();
  else if (view === 'custom-new' || view.startsWith('custom:')) content = customScreen(view);
  else content = detailScreen(view);
  settings.replaceChildren(content);
  settings.hidden = false;
  list.hidden = true;
  $('#btn-config').classList.add('on');
  settings.scrollTop = 0;
  fitWindow();
}

function mainScreen() {
  const form = el('div', 'form');

  const langSel = document.createElement('select');
  for (const l of last.languages || []) {
    const o = el('option', null, l.name);
    o.value = l.code;
    o.selected = l.code === draft.language;
    langSel.append(o);
  }
  langSel.onchange = () => (draft.language = langSel.value);
  form.append(field(t('s.language'), langSel));

  const interval = textInput('number', draft.intervalMin, '5');
  interval.min = 1;
  interval.max = 240;
  interval.oninput = () => (draft.intervalMin = interval.value);
  form.append(field(t('s.interval'), interval));

  const pin = check(t('s.pin'), draft.pinned);
  pin.input.onchange = () => (draft.pinned = pin.input.checked);
  const login = check(t('s.autostart'), draft.openAtLogin);
  login.input.onchange = () => (draft.openAtLogin = login.input.checked);
  const notify = check(t('s.notifications'), draft.notify);
  notify.input.onchange = () => (draft.notify = notify.input.checked);
  form.append(pin.wrap, login.wrap, notify.wrap, el('div', 'hint', t('s.notifications_hint')));

  form.append(el('h3', null, t('s.services')));
  for (const meta of last.providerMeta || []) {
    const row = el('div', 'svc');
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = draft.enabled[meta.id] !== false;
    toggle.onchange = () => (draft.enabled[meta.id] = toggle.checked);

    const open = el('button', 'svc-main');
    open.type = 'button';
    open.append(
      el('span', 'svc-name', meta.name),
      el('span', 'spacer'),
      el('span', 'svc-status', statusText(meta, last.providers[meta.id])),
      el('span', 'svc-arrow', '›')
    );
    open.onclick = () => {
      view = meta.id;
      renderSettings();
    };

    row.append(toggle, open);
    form.append(row);
  }

  form.append(el('h3', null, t('s.custom')));
  form.append(el('div', 'hint', t('s.custom_hint')));
  const addCustom = el('button', 'btn', t('s.custom_add'));
  addCustom.type = 'button';
  addCustom.onclick = () => {
    view = 'custom-new';
    renderSettings();
  };
  form.append(addCustom);

  form.append(el('h3', null, t('s.config')));
  form.append(el('div', 'hint', t('s.config_hint')));
  const configActions = el('div', 'config-actions');
  const backup = el('button', 'btn', t('s.config_backup'));
  backup.type = 'button';
  backup.onclick = async () => {
    const res = await window.qw.backupConfig();
    if (res && res.ok) alert(t('s.config_backed_up', { path: res.path }));
    else alert(t('s.config_error', { error: (res && res.error) || 'unknown' }));
  };
  const exportBtn = el('button', 'btn', t('s.config_export'));
  exportBtn.type = 'button';
  exportBtn.onclick = async () => {
    const res = await window.qw.exportConfig();
    if (res && res.canceled) return;
    if (res && res.ok) alert(t('s.config_exported', { path: res.path }));
    else alert(t('s.config_error', { error: (res && res.error) || 'unknown' }));
  };
  const importBtn = el('button', 'btn', t('s.config_import'));
  importBtn.type = 'button';
  importBtn.onclick = async () => {
    if (!confirm(t('s.config_import_confirm'))) return;
    const res = await window.qw.importConfig();
    if (res && res.canceled) return;
    if (!res || !res.ok) {
      alert(t('s.config_error', { error: (res && res.error) || 'unknown' }));
      return;
    }
    alert(t('s.config_restarting'));
  };
  const resetBtn = el('button', 'btn danger', t('s.config_reset'));
  resetBtn.type = 'button';
  resetBtn.onclick = async () => {
    if (!confirm(t('s.config_reset_confirm'))) return;
    const res = await window.qw.resetConfig();
    if (!res || !res.ok) {
      alert(t('s.config_error', { error: (res && res.error) || 'unknown' }));
      return;
    }
    alert(t('s.config_restarting'));
  };
  configActions.append(backup, exportBtn, importBtn, resetBtn);
  form.append(configActions);

  form.append(actions());
  return form;
}

function detailScreen(id) {
  const meta = metaFor(id);
  const form = el('div', 'form');

  const head = el('div', 'form-head');
  const back = el('button', 'back', '‹');
  back.type = 'button';
  back.title = t('s.back');
  back.onclick = () => {
    view = 'main';
    renderSettings();
  };
  head.append(back, el('span', 'form-title', meta.name));
  form.append(head);

  const reading = last.providers[id];
  const windows = (reading && reading.windows) || [];
  const labels = {};
  for (const w of windows) if (w.label) labels[w.key] = w.label;
  const known = windows.map((w) => w.key);
  const hidden = draft.hiddenWindows[id] || [];
  for (const k of hidden) if (!known.includes(k)) known.push(k);

  form.append(el('h3', null, t('s.windows')));
  if (!known.length) form.append(el('div', 'hint', t('s.windows_empty')));
  for (const key of known) {
    const c = check(labels[key] || winLabel(key), !hidden.includes(key), 'win-chk');
    c.input.onchange = () => {
      const set = new Set(draft.hiddenWindows[id] || []);
      if (c.input.checked) set.delete(key);
      else set.add(key);
      if (set.size) draft.hiddenWindows[id] = [...set];
      else delete draft.hiddenWindows[id];
    };
    form.append(c.wrap);
  }

  form.append(el('h3', null, t('s.diagnostics')));
  if (!reading) {
    form.append(el('div', 'hint', t('s.diagnostics_empty')));
  } else {
    const rows = [];
    rows.push(`${t('s.diag_last')}: ${reading.lastSuccessAt ? new Date(reading.lastSuccessAt).toLocaleString(lang) : '—'}`);
    rows.push(`${t('s.diag_latency')}: ${reading.latencyMs != null ? `${reading.latencyMs} ms` : '—'}`);
    rows.push(`${t('s.diag_failures')}: ${reading.consecutiveFailures || 0}`);
    if (reading.nextRetryAt) rows.push(`${t('s.diag_retry')}: ${new Date(reading.nextRetryAt).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}`);
    if (reading.error) rows.push(`${t('s.diag_error')}: ${providerText('err', reading.error, reading.errorParams)}`);
    for (const row of rows) form.append(el('div', 'hint', row));
    const copyDiag = el('button', 'btn', t('s.diag_copy'));
    copyDiag.type = 'button';
    copyDiag.onclick = async () => {
      const diag = {
        id,
        name: meta.name,
        ok: !!reading.ok,
        stale: !!reading.stale,
        error: reading.error || null,
        errorParams: reading.errorParams || null,
        action: reading.action || null,
        lastSuccessAt: reading.lastSuccessAt || null,
        lastAttemptAt: reading.lastAttemptAt || null,
        latencyMs: reading.latencyMs == null ? null : reading.latencyMs,
        consecutiveFailures: reading.consecutiveFailures || 0,
        nextRetryAt: reading.nextRetryAt || null,
        updatedAt: last.updatedAt || null,
        windows: (reading.windows || []).map((w) => ({ key: w.key, label: w.label, percent: w.percent, resetsAt: w.resetsAt, detail: w.detail })),
      };
      try {
        await window.qw.copyText(JSON.stringify(diag, null, 2));
        copyDiag.textContent = t('s.copied');
        setTimeout(() => (copyDiag.textContent = t('s.diag_copy')), 1500);
      } catch (e) {
        alert(e && e.message ? e.message : String(e));
      }
    };
    form.append(copyDiag);
  }

  form.append(el('h3', null, t('s.refresh')));
  const interval = textInput(
    'number',
    draft.providerIntervals[id] == null ? '' : draft.providerIntervals[id],
    t('s.interval_default', { n: draft.intervalMin })
  );
  interval.min = 1;
  interval.max = 240;
  interval.oninput = () => {
    const v = interval.value.trim();
    if (v) draft.providerIntervals[id] = v;
    else delete draft.providerIntervals[id];
  };
  form.append(field(t('s.interval_provider'), interval, t('s.interval_provider_hint')));

  if (meta.custom) {
    form.append(el('h3', null, t('s.custom')));
    form.append(el('div', 'hint', t('s.custom_detail')));
    const row = el('div', 'custom-actions');
    const edit = el('button', 'btn', t('s.custom_edit_button'));
    edit.type = 'button';
    edit.onclick = () => {
      view = 'custom:' + id;
      renderSettings();
    };
    const del = el('button', 'btn', t('s.custom_delete'));
    del.type = 'button';
    del.onclick = () => deleteCustom(id);
    row.append(edit, del);
    form.append(row);
  } else {
    const fields = meta.fields || [];
    if (fields.length) {
      form.append(el('h3', null, t('s.fields')));
      for (const f of fields) form.append(fieldEl(meta, f));
      if (fields.some((f) => f.type === 'secret')) form.append(el('div', 'hint', t('s.keys_local')));
    }
  }

  form.append(actions());
  return form;
}

function customScreen(target) {
  const isNew = target === 'custom-new';
  const id = isNew ? null : target.slice('custom:'.length);
  const specs = (last.config && last.config.customProviders) || [];
  const spec = isNew ? null : specs.find((s) => s.id === id);
  const meta = isNew ? null : metaFor(id);
  const form = el('div', 'form');

  const head = el('div', 'form-head');
  const back = el('button', 'back', '‹');
  back.type = 'button';
  back.title = t('s.back');
  back.onclick = () => {
    view = isNew ? 'main' : id;
    renderSettings();
  };
  head.append(back, el('span', 'form-title', isNew ? t('s.custom_new') : t('s.custom_edit', { name: spec ? spec.name : id })));
  form.append(head);

  if (!isNew && !spec) {
    form.append(el('div', 'err', t('s.custom_missing')));
    form.append(actions());
    return form;
  }

  const editable = spec ? { ...spec } : JSON.parse(JSON.stringify(window.customSpec.TEMPLATES.usage));
  if (spec) {
    delete editable.id;
    delete editable.keyName;
  }
  const initial = window.customSpec.toGuided(editable);
  let mode = 'guided';
  let previousTemplate = 'usage';

  const modeRow = el('div', 'mode-row');
  const guidedBtn = el('button', 'btn', t('s.custom_guided'));
  guidedBtn.type = 'button';
  const jsonBtn = el('button', 'btn', t('s.custom_json_mode'));
  jsonBtn.type = 'button';
  modeRow.append(guidedBtn, jsonBtn);
  form.append(modeRow);

  const templateSel = document.createElement('select');
  for (const [key, label] of [['usage', t('s.custom_template_usage')], ['balance', t('s.custom_template_balance')], ['cost', t('s.custom_template_cost')]]) {
    const option = el('option', null, label);
    option.value = key;
    option.selected = key === 'usage';
    templateSel.append(option);
  }
  form.append(field(t('s.custom_template'), templateSel));

  const tools = el('div', 'custom-tools');
  const copy = el('button', 'btn', t('s.custom_copy'));
  copy.type = 'button';
  const load = el('button', 'btn', t('s.custom_load'));
  load.type = 'button';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.hidden = true;
  tools.append(copy, load);
  form.append(tools, fileInput);

  const guidedPanel = el('div', 'guided');
  const g = {};
  const select = (options, value) => {
    const s = document.createElement('select');
    for (const [v, label] of options) {
      const o = el('option', null, label);
      o.value = v;
      o.selected = v === value;
      s.append(o);
    }
    return s;
  };
  const textarea = (value, rows) => {
    const a = document.createElement('textarea');
    a.value = value || '';
    a.rows = rows;
    a.spellcheck = false;
    return a;
  };
  g.name = textInput('text', initial.guided.name, 'My provider');
  g.url = textInput('text', initial.guided.url, 'https://api.example.com/usage');
  g.method = select([['GET', 'GET'], ['POST', 'POST']], initial.guided.method);
  g.auth = select(
    [['bearer', t('s.custom_auth_bearer')], ['header', t('s.custom_auth_header')], ['none', t('s.custom_auth_none')]],
    initial.guided.auth
  );
  g.auth.id = 'custom-auth';
  g.authHeader = textInput('text', initial.guided.authHeader, 'Authorization');
  g.authPrefix = textInput('text', initial.guided.authPrefix, 'Bearer ');
  g.headers = textarea(initial.guided.headers, 3);
  g.body = textarea(initial.guided.body, 3);
  const windowsBox = el('div', 'guided-rows');
  const windows = [];
  let windowSeq = -1;
  const addWindow = (w = {}) => {
    const fields = {
      key: textInput('text', w.key || '', 'month'),
      label: textInput('text', w.label || '', 'Month'),
      percent: textInput('text', w.percent || '', 'data.percent'),
      scale: select(
        [['percent', t('s.custom_scale_percent')], ['fraction', t('s.custom_scale_fraction')]],
        w.scale === 'fraction' ? 'fraction' : 'percent'
      ),
      resetsAt: textInput('text', w.resetsAt || '', 'data.reset'),
      detail: textInput('text', w.detail || '', 'data.detail'),
    };
    const seq = ++windowSeq;
    for (const [name, input] of Object.entries(fields)) input.id = `custom-window-${seq}-${name}`;
    const row = el('div', 'guided-row');
    const remove = el('button', 'link dim', t('s.custom_remove'));
    remove.type = 'button';
    const entry = { row, fields };
    remove.onclick = () => {
      const i = windows.indexOf(entry);
      if (i >= 0) windows.splice(i, 1);
      row.remove();
      syncGuided();
      fitWindow();
    };
    row.append(
      field(t('s.custom_window_key'), fields.key),
      field(t('s.custom_window_label'), fields.label),
      field(t('s.custom_percent_path'), fields.percent),
      field(t('s.custom_scale'), fields.scale),
      field(t('s.custom_reset_path'), fields.resetsAt),
      field(t('s.custom_detail_path'), fields.detail),
      remove
    );
    for (const input of Object.values(fields)) {
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
        testBox.hidden = true;
        if (mode === 'guided') syncGuided();
      });
    }
    windowsBox.append(row);
    windows.push(entry);
    return entry;
  };
  const addWindowBtn = el('button', 'btn guided-add', t('s.custom_add_window'));
  addWindowBtn.type = 'button';
  addWindowBtn.onclick = () => {
    addWindow();
    syncGuided();
    testBox.hidden = true;
    fitWindow();
  };

  const noteBox = el('div', 'guided-rows');
  const noteValues = [];
  let noteSeq = -1;
  const addNoteValue = (v = {}) => {
    const fields = {
      name: textInput('text', v.name || '', 'amount'),
      path: textInput('text', v.path || '', 'data.balance'),
    };
    const seq = ++noteSeq;
    fields.name.id = `custom-note-value-${seq}-name`;
    fields.path.id = `custom-note-value-${seq}-path`;
    const row = el('div', 'guided-row');
    const remove = el('button', 'link dim', t('s.custom_remove'));
    remove.type = 'button';
    const entry = { row, fields };
    remove.onclick = () => {
      const i = noteValues.indexOf(entry);
      if (i >= 0) noteValues.splice(i, 1);
      row.remove();
      syncGuided();
      fitWindow();
    };
    row.append(
      field(t('s.custom_note_value_name'), fields.name),
      field(t('s.custom_note_value_path'), fields.path),
      remove
    );
    for (const input of Object.values(fields)) {
      input.addEventListener('input', () => {
        testBox.hidden = true;
        if (mode === 'guided') syncGuided();
      });
    }
    noteBox.append(row);
    noteValues.push(entry);
    return entry;
  };
  const addNoteValueBtn = el('button', 'btn guided-add', t('s.custom_add_value'));
  addNoteValueBtn.type = 'button';
  addNoteValueBtn.onclick = () => {
    addNoteValue({ name: 'amount' });
    syncGuided();
    testBox.hidden = true;
    fitWindow();
  };

  g.noteTemplate = textInput('text', initial.guided.noteTemplate, 'Balance: {amount}');
  g.plan = textInput('text', initial.guided.plan, 'data.plan');

  const authHeaderField = field(t('s.custom_auth_header_name'), g.authHeader);
  const authPrefixField = field(t('s.custom_auth_prefix'), g.authPrefix);
  const bodyField = field(t('s.custom_body'), g.body);
  guidedPanel.append(
    el('h3', null, t('s.custom_connection')),
    field(t('s.custom_name'), g.name),
    field(t('s.custom_url'), g.url),
    field(t('s.custom_method'), g.method),
    field(t('s.custom_auth'), g.auth),
    authHeaderField,
    authPrefixField,
    field(t('s.custom_headers'), g.headers, t('s.custom_headers_hint')),
    bodyField,
    el('h3', null, t('s.custom_window')),
    windowsBox,
    addWindowBtn,
    el('h3', null, t('s.custom_note')),
    field(t('s.custom_note_template'), g.noteTemplate),
    noteBox,
    addNoteValueBtn,
    field(t('s.custom_plan_path'), g.plan)
  );
  form.append(guidedPanel);

  const specInput = document.createElement('textarea');
  specInput.id = 'custom-spec';
  specInput.value = JSON.stringify(editable, null, 2);
  specInput.spellcheck = false;
  specInput.autocomplete = 'off';
  specInput.rows = 14;
  const specField = field(t('s.custom_json'), specInput, t('s.custom_mapping_hint'));
  form.append(specField);

  const hasKey = !!(meta && spec && meta.secrets && meta.secrets[spec.keyName]);
  const keyInput = textInput('password', '', hasKey ? t('s.key_set_ph') : t('s.custom_key_ph'));
  let keyValue = '';
  let clearKey = false;
  keyInput.oninput = () => {
    keyValue = keyInput.value;
    if (keyValue.trim()) clearKey = false;
  };
  const keyWrap = field(t('s.custom_key'), keyInput, t('s.custom_key_hint'));
  if (hasKey) {
    const remove = el('button', 'link dim remove-key', t('s.remove_key'));
    remove.type = 'button';
    remove.onclick = () => {
      clearKey = true;
      keyValue = '';
      keyInput.value = '';
      keyInput.placeholder = t('s.will_remove_ph');
      remove.remove();
    };
    keyWrap.append(remove);
  }
  form.append(keyWrap);

  const err = el('div', 'err');
  err.hidden = true;
  form.append(err);

  const testBox = el('div', 'test-result');
  testBox.hidden = true;
  form.append(testBox);

  const bar = el('div', 'form-actions');
  const save = el('button', 'btn primary', t('s.save'));
  save.type = 'button';
  const test = el('button', 'btn', t('s.custom_test'));
  test.type = 'button';
  const cancel = el('button', 'btn', t('s.cancel'));
  cancel.type = 'button';
  cancel.onclick = () => {
    view = isNew ? 'main' : id;
    renderSettings();
  };
  bar.append(save, test, cancel);
  if (!isNew) {
    const del = el('button', 'link dim', t('s.custom_delete_short'));
    del.type = 'button';
    del.onclick = () => deleteCustom(id);
    bar.append(el('span', 'spacer'), del);
  }
  form.append(bar);

  const showError = (text) => {
    testBox.hidden = true;
    err.textContent = text;
    err.hidden = false;
    fitWindow();
  };

  const parseSpec = () => {
    try {
      return { ok: true, spec: JSON.parse(specInput.value) };
    } catch (e) {
      showError(t('s.custom_invalid', { error: e && e.message ? e.message : String(e) }));
      return { ok: false };
    }
  };

  const refreshConditional = () => {
    const header = g.auth.value === 'header';
    authHeaderField.hidden = !header;
    authPrefixField.hidden = !header;
    bodyField.hidden = g.method.value !== 'POST';
  };

  const populateGuided = (guided) => {
    for (const key of ['name', 'url', 'method', 'auth', 'authHeader', 'authPrefix', 'headers', 'body', 'noteTemplate', 'plan']) {
      g[key].value = guided[key] == null ? '' : guided[key];
    }
    windowsBox.replaceChildren();
    windows.splice(0);
    for (const w of guided.windows || []) addWindow(w);
    noteBox.replaceChildren();
    noteValues.splice(0);
    for (const v of guided.noteValues || []) addNoteValue(v);
    if (!noteValues.length) addNoteValue({ name: 'amount' });
    refreshConditional();
  };

  const syncGuided = () => {
    let headers;
    try {
      headers = JSON.parse(g.headers.value.trim() || '{}');
    } catch (_) {
      showError(t('s.custom_headers_invalid'));
      return false;
    }
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
      showError(t('s.custom_headers_invalid'));
      return false;
    }
    const built = window.customSpec.buildSpec({
      name: g.name.value,
      url: g.url.value,
      method: g.method.value,
      auth: g.auth.value,
      authHeader: g.authHeader.value,
      authPrefix: g.authPrefix.value,
      headers,
      body: g.body.value,
      windows: windows.map((e) => ({
        key: e.fields.key.value,
        label: e.fields.label.value,
        percent: e.fields.percent.value,
        scale: e.fields.scale.value,
        resetsAt: e.fields.resetsAt.value,
        detail: e.fields.detail.value,
      })),
      noteTemplate: g.noteTemplate.value,
      noteValues: noteValues.map((e) => ({ name: e.fields.name.value, path: e.fields.path.value })),
      plan: g.plan.value,
    });
    specInput.value = JSON.stringify(built, null, 2);
    if (!err.hidden) {
      err.hidden = true;
      fitWindow();
    }
    return true;
  };

  const setMode = (next, sync = true) => {
    if (next === 'guided') {
      let parsed;
      try {
        parsed = JSON.parse(specInput.value);
      } catch (e) {
        showError(t('s.custom_invalid', { error: e && e.message ? e.message : String(e) }));
        return;
      }
      const info = window.customSpec.toGuided(parsed);
      populateGuided(info.guided);
      mode = 'guided';
      guidedPanel.hidden = false;
      specField.hidden = true;
      guidedBtn.classList.add('on');
      jsonBtn.classList.remove('on');
      syncGuided();
      fitWindow();
      return;
    }
    if (mode === 'guided' && sync && !syncGuided()) return;
    mode = 'json';
    guidedPanel.hidden = true;
    specField.hidden = false;
    jsonBtn.classList.add('on');
    guidedBtn.classList.remove('on');
    fitWindow();
  };

  const showTestResult = (res) => {
    testBox.replaceChildren();
    testBox.hidden = false;
    if (!res || !res.ok) {
      const text = res && res.error ? providerText('err', res.error, res.errorParams) : t('s.custom_test_failed');
      testBox.append(el('div', 'err', text));
    } else {
      testBox.append(el('div', 'test-title', t('s.custom_test_ok')));
      for (const w of res.windows || []) {
        const pct = Math.max(0, Math.min(100, w.percent || 0));
        const parts = [`${w.label || winLabel(w.key)}: ${pct.toFixed(1)}%`];
        if (w.detail) parts.push(w.detail);
        if (w.resetsAt) parts.push(fmtReset(w.resetsAt));
        testBox.append(el('div', 'test-window', parts.join(' · ')));
      }
      if (res.noteText) testBox.append(el('div', 'note', res.noteText));
      if (res.plan) testBox.append(el('div', 'note', `${t('s.custom_plan')}: ${res.plan}`));
      if (!(res.windows || []).length && !res.noteText) testBox.append(el('div', 'err', t('s.custom_test_empty')));
    }
    fitWindow();
  };

  for (const input of [g.name, g.url, g.authHeader, g.authPrefix, g.headers, g.body, g.noteTemplate, g.plan]) {
    input.addEventListener('input', () => {
      testBox.hidden = true;
      if (mode === 'guided') syncGuided();
    });
  }
  for (const input of [g.method, g.auth]) {
    input.addEventListener('change', () => {
      refreshConditional();
      testBox.hidden = true;
      if (mode === 'guided') syncGuided();
    });
  }

  guidedBtn.onclick = () => setMode('guided');
  jsonBtn.onclick = () => setMode('json');

  templateSel.onchange = () => {
    const key = templateSel.value;
    if (!confirm(t('s.custom_template_confirm'))) {
      templateSel.value = previousTemplate;
      return;
    }
    previousTemplate = key;
    const template = JSON.parse(JSON.stringify(window.customSpec.TEMPLATES[key]));
    specInput.value = JSON.stringify(template, null, 2);
    const info = window.customSpec.toGuided(template);
    populateGuided(info.guided);
    if (mode === 'guided') syncGuided();
    testBox.hidden = true;
    fitWindow();
  };

  copy.onclick = async () => {
    if (mode === 'guided' && !syncGuided()) return;
    try {
      await window.qw.copyText(specInput.value);
    } catch (e) {
      showError(e && e.message ? e.message : String(e));
      return;
    }
    copy.textContent = t('s.custom_copied');
    setTimeout(() => (copy.textContent = t('s.custom_copy')), 1500);
  };

  load.onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
        const info = window.customSpec.toGuided(parsed);
        specInput.value = JSON.stringify(parsed, null, 2);
        populateGuided(info.guided);
        if (mode === 'guided') syncGuided();
        testBox.hidden = true;
        fitWindow();
      } catch (_) {
        showError(t('s.custom_load_invalid'));
      }
      fileInput.value = '';
    };
    reader.onerror = () => {
      showError(t('s.custom_load_invalid'));
      fileInput.value = '';
    };
    reader.readAsText(file);
  };

  specInput.addEventListener('input', () => (testBox.hidden = true));
  keyInput.addEventListener('input', () => (testBox.hidden = true));

  test.onclick = async () => {
    if (mode === 'guided' && !syncGuided()) return;
    const parsed = parseSpec();
    if (!parsed.ok) return;
    test.disabled = true;
    test.textContent = t('s.custom_testing');
    let res;
    try {
      res = await window.qw.testCustomProvider({ id: id || undefined, spec: parsed.spec, apiKey: keyValue, clearKey });
    } catch (e) {
      res = { ok: false, error: e && e.message ? e.message : String(e) };
    }
    test.disabled = false;
    test.textContent = t('s.custom_test');
    showTestResult(res);
  };

  save.onclick = async () => {
    if (mode === 'guided' && !syncGuided()) return;
    const parsed = parseSpec();
    if (!parsed.ok) return;
    save.disabled = true;
    save.textContent = t('s.saving');
    let result;
    try {
      result = await window.qw.saveCustomProvider({ id: id || undefined, spec: parsed.spec, apiKey: keyValue, clearKey });
    } catch (e) {
      result = { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (!result || !result.ok) {
      save.disabled = false;
      save.textContent = t('s.save');
      showError(t('s.custom_invalid', { error: (result && result.error) || 'unknown' }));
      return;
    }
    try {
      last = await window.qw.getState();
    } catch (_) {}
    view = result.id || id || 'main';
    renderSettings();
  };

  refreshConditional();
  setMode(mode, false);
  return form;
}

async function deleteCustom(id) {
  const spec = ((last.config && last.config.customProviders) || []).find((s) => s.id === id);
  if (!spec) return;
  if (!confirm(t('s.custom_delete_confirm'))) return;
  let result;
  try {
    result = await window.qw.deleteCustomProvider(id);
  } catch (e) {
    result = { ok: false, error: e && e.message ? e.message : String(e) };
  }
  if (!result || !result.ok) {
    alert((result && result.error) || t('s.custom_failed'));
    return;
  }
  try {
    last = await window.qw.getState();
  } catch (_) {}
  view = 'main';
  renderSettings();
}

function fieldEl(meta, f) {
  const label = fieldText(meta, f, '') || f.key;
  const hint = fieldText(meta, f, '.hint');
  const ph = fieldText(meta, f, '.ph');

  if (f.type === 'boolean') {
    const c = check(label, !!draft.values[f.key]);
    c.input.onchange = () => (draft.values[f.key] = c.input.checked);
    return c.wrap;
  }

  if (f.type === 'number') {
    const value = draft.values[f.key];
    const input = textInput('number', value == null ? '' : value, ph || (f.default != null ? String(f.default) : ''));
    if (f.min != null) input.min = f.min;
    if (f.max != null) input.max = f.max;
    input.oninput = () => (draft.values[f.key] = input.value);
    return field(label, input, hint);
  }

  if (f.type === 'secret') {
    const input = textInput('password', '', meta.secrets[f.key] ? t('s.key_set_ph') : ph || '');
    input.oninput = () => {
      if (input.value.trim()) {
        draft.secrets[f.key] = input.value;
        delete draft.clear[f.key];
      } else {
        delete draft.secrets[f.key];
      }
    };
    const wrap = field(label, input, hint);
    if (meta.secrets[f.key] && !draft.clear[f.key]) {
      const remove = el('button', 'link dim remove-key', t('s.remove_key'));
      remove.type = 'button';
      remove.onclick = () => {
        draft.clear[f.key] = true;
        delete draft.secrets[f.key];
        input.value = '';
        input.placeholder = t('s.will_remove_ph');
        remove.remove();
      };
      wrap.append(remove);
    } else if (draft.clear[f.key]) {
      input.placeholder = t('s.will_remove_ph');
    }
    return wrap;
  }

  const input = textInput('text', draft.values[f.key] == null ? '' : draft.values[f.key], ph || '');
  input.oninput = () => (draft.values[f.key] = input.value);
  return field(label, input, hint);
}

function actions() {
  const box = el('div', 'form-actions');
  const save = el('button', 'btn primary', t('s.save'));
  save.type = 'button';
  save.onclick = () => saveSettings(save);
  const cancel = el('button', 'btn', t('s.cancel'));
  cancel.type = 'button';
  cancel.onclick = () => closeSettings();
  const file = el('button', 'link dim', t('s.open_config'));
  file.type = 'button';
  file.onclick = () => window.qw.openConfig();
  box.append(save, cancel, el('span', 'spacer'), file);
  return box;
}

async function saveSettings(button) {
  if (!draft) return;
  const patch = {
    language: draft.language,
    intervalMin: draft.intervalMin,
    pinned: draft.pinned,
    openAtLogin: draft.openAtLogin,
    enabled: { ...draft.enabled },
    providerIntervals: { ...draft.providerIntervals },
    notify: !!draft.notify,
    hiddenWindows: JSON.parse(JSON.stringify(draft.hiddenWindows)),
  };
  for (const meta of last.providerMeta || []) {
    for (const f of meta.fields || []) {
      if (f.type === 'secret') {
        const v = draft.secrets[f.key];
        if (v != null && v.trim()) patch[f.key] = v.trim();
        else if (draft.clear[f.key]) patch[f.key] = '';
      } else if (f.type === 'boolean') {
        patch[f.key] = !!draft.values[f.key];
      } else if (f.type === 'number') {
        patch[f.key] = draft.values[f.key] === '' || draft.values[f.key] == null ? null : draft.values[f.key];
      } else {
        patch[f.key] = draft.values[f.key] == null ? '' : String(draft.values[f.key]);
      }
    }
  }
  button.disabled = true;
  button.textContent = t('s.saving');
  closeSettings();
  await window.qw.setConfig(patch);
}

function closeSettings() {
  inSettings = false;
  draft = null;
  view = 'main';
  settings.hidden = true;
  list.hidden = false;
  $('#btn-config').classList.remove('on');
  if (last) render(last);
}

$('#btn-refresh').onclick = () => window.qw.refresh();
$('#btn-pin').onclick = () => window.qw.togglePin();
$('#btn-config').onclick = () => (inSettings ? closeSettings() : openSettings());
$('#btn-hide').onclick = () => window.qw.hide();

window.qw.onState(render);
window.qw.getState().then(render);
// keeps the reset countdowns live without re-running the requests
setInterval(() => last && render(last), 30000);
