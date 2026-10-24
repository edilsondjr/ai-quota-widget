const ORDER = ['claude', 'chatgpt', 'commandcode', 'ollama'];
const NAMES = { claude: 'Claude', chatgpt: 'ChatGPT', commandcode: 'Command Code', ollama: 'Ollama' };

const $ = (s) => document.querySelector(s);
const list = $('#list');
const foot = $('#foot');
const settings = $('#settings');
let last = null;
let inSettings = false;
let t = (k) => k;
let lang = 'en';

// Textos vêm do processo principal (locales/*.json) junto com o estado.
function applyStrings(state) {
  if (!state.strings) return;
  t = i18n.translator(state.strings);
  lang = state.lang || 'en';
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((n) => (n.textContent = t(n.dataset.i18n)));
  document.querySelectorAll('[data-i18n-title]').forEach((n) => (n.title = t(n.dataset.i18nTitle)));
}

// Texto de um código vindo de um provedor (`err.<código>` / `note.<código>`).
// Código sem tradução (ex.: mensagem de exceção) é mostrado como veio.
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
  row.append(el('span', 'lbl', winLabel(w.key)), el('span', 'pct', `${pct.toFixed(pct < 10 ? 1 : 0)}%`));
  const track = el('div', 'track');
  const fill = el('div', `fill ${level(pct)}`);
  fill.style.width = `${pct}%`;
  track.append(fill);
  box.append(row, track);
  const sub = [w.detail, fmtReset(w.resetsAt)].filter(Boolean).join(' · ');
  if (sub) box.append(el('div', 'sub', sub));
  return box;
}

function card(id, p, cfg) {
  const hidden = (cfg.hiddenWindows && cfg.hiddenWindows[id]) || [];
  const box = el('div', 'prov');
  const head = el('div', 'head');
  head.append(el('span', 'name', NAMES[id]));
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
  if (p.note) box.append(el('div', 'note', providerText('note', p.note, p.noteParams)));

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
      b.onclick = () => openSettings();
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
  $('#btn-pin').classList.toggle('on', !!state.pinned);
  $('#btn-refresh').classList.toggle('spin', !!state.loading);
  const when = state.updatedAt
    ? t('foot.updated', { time: new Date(state.updatedAt).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) })
    : t('foot.updating');
  foot.textContent = state.version ? `${when} · v${state.version}` : when;
  if (inSettings) return; // não refaz o formulário enquanto o usuário edita
  const ids = ORDER.filter((id) => enabled[id] !== false);
  if (!ids.length) list.replaceChildren(el('div', 'err pad', t('list.none')));
  else list.replaceChildren(...ids.map((id) => card(id, state.providers[id], cfg)));
  fitWindow();
}

// ---------- tela de configuração ----------
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

function openSettings() {
  if (!last) return;
  inSettings = true;
  const cfg = last.config || {};
  const enabled = cfg.enabled || {};
  const hidden = cfg.hiddenWindows || {};

  const form = el('div', 'form');

  // 1) o que exibir
  form.append(el('h3', null, t('s.show')));
  const provChecks = {};
  const winChecks = {};
  for (const id of ORDER) {
    const pc = check(NAMES[id], enabled[id] !== false, 'prov-chk');
    provChecks[id] = pc.input;
    form.append(pc.wrap);
    winChecks[id] = [];
    const keys = ((last.providers[id] && last.providers[id].windows) || []).map((w) => w.key);
    // inclui também janelas já ocultas que não vieram na última leitura
    for (const h of hidden[id] || []) if (!keys.includes(h)) keys.push(h);
    keys.forEach((key) => {
      const wc = check(winLabel(key), !(hidden[id] || []).includes(key), 'win-chk');
      winChecks[id].push({ key, input: wc.input });
      form.append(wc.wrap);
    });
  }

  // 2) atualização
  form.append(el('h3', null, t('s.refresh')));
  const interval = textInput('number', cfg.intervalMin, '5');
  interval.min = 1;
  interval.max = 240;
  form.append(field(t('s.interval'), interval));

  // 3) contas e chaves
  form.append(el('h3', null, t('s.keys')));
  const ollamaKey = textInput('password', '', cfg.hasOllamaKey ? t('s.key_set_ph') : t('s.ollama_key_ph'));
  form.append(field(t('s.ollama_key'), ollamaKey));
  const ollamaDay = textInput('number', cfg.ollamaBillingDay, t('s.auto'));
  ollamaDay.min = 1;
  ollamaDay.max = 31;
  form.append(field(t('s.ollama_day'), ollamaDay, t('s.ollama_day_hint')));
  const ollamaCredits = textInput('number', cfg.ollamaMonthlyCredits, t('s.by_plan'));
  ollamaCredits.min = 0;
  form.append(field(t('s.ollama_credits'), ollamaCredits, t('s.ollama_credits_hint')));
  const ccKey = textInput('password', '', cfg.hasCommandcodeKey ? t('s.key_set_ph') : t('s.cc_key_ph'));
  form.append(field(t('s.cc_key'), ccKey));
  const clear = el('div', 'clear-row');
  if (cfg.hasOllamaKey) {
    const b = el('button', 'link dim', t('s.remove_ollama'));
    b.type = 'button';
    b.onclick = () => {
      ollamaKey.dataset.clear = '1';
      ollamaKey.placeholder = t('s.will_remove_ph');
      b.remove();
    };
    clear.append(b);
  }
  if (cfg.hasCommandcodeKey) {
    const b = el('button', 'link dim', t('s.remove_cc'));
    b.type = 'button';
    b.onclick = () => {
      ccKey.dataset.clear = '1';
      ccKey.placeholder = t('s.will_remove_ph');
      b.remove();
    };
    clear.append(b);
  }
  if (clear.children.length) form.append(clear);

  // 4) geral
  form.append(el('h3', null, t('s.general')));
  const langSel = document.createElement('select');
  for (const l of last.languages || []) {
    const o = el('option', null, l.name);
    o.value = l.code;
    o.selected = l.code === last.lang;
    langSel.append(o);
  }
  form.append(field(t('s.language'), langSel));
  const pin = check(t('s.pin'), last.pinned);
  const login = check(t('s.autostart'), cfg.openAtLogin);
  const unknown = check(t('s.unknown'), cfg.claudeShowUnknown);
  form.append(pin.wrap, login.wrap, unknown.wrap);

  const actions = el('div', 'form-actions');
  const save = el('button', 'btn primary', t('s.save'));
  const cancel = el('button', 'btn', t('s.cancel'));
  const file = el('button', 'link dim', t('s.open_config'));
  save.onclick = async () => {
    const enabledOut = {};
    const hiddenOut = {};
    for (const id of ORDER) {
      enabledOut[id] = provChecks[id].checked;
      const off = winChecks[id].filter((w) => !w.input.checked).map((w) => w.key);
      if (off.length) hiddenOut[id] = off;
    }
    const patch = {
      language: langSel.value,
      enabled: enabledOut,
      hiddenWindows: hiddenOut,
      intervalMin: interval.value,
      ollamaBillingDay: ollamaDay.value,
      ollamaMonthlyCredits: ollamaCredits.value,
      pinned: pin.input.checked,
      openAtLogin: login.input.checked,
      claudeShowUnknown: unknown.input.checked,
    };
    if (ollamaKey.value.trim()) patch.ollamaApiKey = ollamaKey.value;
    else if (ollamaKey.dataset.clear) patch.ollamaApiKey = '';
    if (ccKey.value.trim()) patch.commandcodeApiKey = ccKey.value;
    else if (ccKey.dataset.clear) patch.commandcodeApiKey = '';
    save.disabled = true;
    save.textContent = t('s.saving');
    closeSettings();
    await window.qw.setConfig(patch);
  };
  cancel.onclick = () => closeSettings();
  file.onclick = () => window.qw.openConfig();
  actions.append(save, cancel, el('span', 'spacer'), file);
  form.append(actions);

  settings.replaceChildren(form);
  settings.hidden = false;
  list.hidden = true;
  $('#btn-config').classList.add('on');
  fitWindow();
}

function closeSettings() {
  inSettings = false;
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
// mantém os contadores de renovação vivos sem refazer as requisições
setInterval(() => last && render(last), 30000);
