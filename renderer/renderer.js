const ORDER = ['claude', 'chatgpt', 'commandcode', 'ollama'];
const NAMES = { claude: 'Claude', chatgpt: 'ChatGPT', commandcode: 'Command Code', ollama: 'Ollama' };

const $ = (s) => document.querySelector(s);
const list = $('#list');
const foot = $('#foot');
const settings = $('#settings');
let last = null;
let inSettings = false;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function fmtReset(ms) {
  if (!ms) return '';
  const diff = ms - Date.now();
  if (diff <= 0) return 'renova agora';
  const m = Math.round(diff / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `renova em ${d} d ${h} h`;
  if (h > 0) return `renova em ${h} h ${mm} min`;
  return `renova em ${mm} min`;
}

function level(p) {
  return p >= 85 ? 'bad' : p >= 60 ? 'warn' : 'ok';
}

function windowEl(w) {
  const pct = Math.max(0, Math.min(100, w.percent || 0));
  const box = el('div', 'win');
  const row = el('div', 'row');
  row.append(el('span', 'lbl', w.label), el('span', 'pct', `${pct.toFixed(pct < 10 ? 1 : 0)}%`));
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
    const out = el('button', 'link dim', 'sair');
    out.title = 'Esquecer login deste serviço';
    out.onclick = () => window.qw.logout(id);
    head.append(out);
  }
  box.append(head);

  if (!p) {
    box.append(el('div', 'err', 'Carregando…'));
    return box;
  }

  if (p.windows && p.windows.length) p.windows.filter((w) => !hidden.includes(w.label)).forEach((w) => box.append(windowEl(w)));
  if (p.note) box.append(el('div', 'note', p.note));

  if (!p.ok) {
    const msg = el('div', 'err');
    if (p.action === 'login') msg.textContent = 'Faça login para ver as quotas.';
    else if (p.action === 'key') msg.textContent = p.error || 'Chave de API necessária.';
    else {
      const b = el('b', null, 'Erro: ');
      msg.append(b, document.createTextNode(p.error || 'falha ao consultar.'));
    }
    box.append(msg);
    const actions = el('div', 'actions');
    if (p.action === 'login' && p.canLogin) {
      const b = el('button', 'link', 'Entrar');
      b.onclick = () => window.qw.login(id);
      actions.append(b);
    } else if (p.action === 'key') {
      const b = el('button', 'link', 'Configurar chave');
      b.onclick = () => openSettings();
      actions.append(b);
    } else {
      const b = el('button', 'link', 'Tentar de novo');
      b.onclick = () => window.qw.refresh(id);
      actions.append(b);
      if (p.canLogin) {
        const l = el('button', 'link dim', 'Entrar de novo');
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
  const cfg = state.config || {};
  const enabled = cfg.enabled || {};
  $('#btn-pin').classList.toggle('on', !!state.pinned);
  $('#btn-refresh').classList.toggle('spin', !!state.loading);
  const when = state.updatedAt
    ? `Atualizado às ${new Date(state.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : 'Atualizando…';
  foot.textContent = state.version ? `${when} · v${state.version}` : when;
  if (inSettings) return; // não refaz o formulário enquanto o usuário edita
  const ids = ORDER.filter((id) => enabled[id] !== false);
  if (!ids.length) list.replaceChildren(el('div', 'err pad', 'Nenhum serviço ativo. Abra ⚙ para escolher.'));
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
  form.append(el('h3', null, 'O que exibir'));
  const provChecks = {};
  const winChecks = {};
  for (const id of ORDER) {
    const pc = check(NAMES[id], enabled[id] !== false, 'prov-chk');
    provChecks[id] = pc.input;
    form.append(pc.wrap);
    winChecks[id] = [];
    const labels = ((last.providers[id] && last.providers[id].windows) || []).map((w) => w.label);
    // inclui também janelas já ocultas que não vieram na última leitura
    for (const h of hidden[id] || []) if (!labels.includes(h)) labels.push(h);
    labels.forEach((lbl) => {
      const wc = check(lbl, !(hidden[id] || []).includes(lbl), 'win-chk');
      winChecks[id].push({ label: lbl, input: wc.input });
      form.append(wc.wrap);
    });
  }

  // 2) atualização
  form.append(el('h3', null, 'Atualização'));
  const interval = textInput('number', cfg.intervalMin, '5');
  interval.min = 1;
  interval.max = 240;
  form.append(field('Intervalo (minutos)', interval));

  // 3) contas e chaves
  form.append(el('h3', null, 'Chaves e contas'));
  const ollamaKey = textInput('password', '', cfg.hasOllamaKey ? '•••• definida (digite para trocar)' : 'ollama.com/settings/keys');
  form.append(field('Chave de API do Ollama', ollamaKey));
  const ollamaDay = textInput('number', cfg.ollamaBillingDay, 'automático');
  ollamaDay.min = 1;
  ollamaDay.max = 31;
  form.append(field('Ollama: dia da renovação', ollamaDay, 'Dia do mês em que sua assinatura renova. Vazio = estimar.'));
  const ollamaCredits = textInput('number', cfg.ollamaMonthlyCredits, 'pelo plano');
  ollamaCredits.min = 0;
  form.append(field('Ollama: crédito mensal (US$)', ollamaCredits, 'Vazio = Pro 60, Max 300.'));
  const ccKey = textInput('password', '', cfg.hasCommandcodeKey ? '•••• definida (digite para trocar)' : 'vazio = usar ~/.commandcode/auth.json');
  form.append(field('Chave do Command Code', ccKey));
  const clear = el('div', 'clear-row');
  if (cfg.hasOllamaKey) {
    const b = el('button', 'link dim', 'Remover chave do Ollama');
    b.type = 'button';
    b.onclick = () => {
      ollamaKey.dataset.clear = '1';
      ollamaKey.placeholder = 'será removida ao salvar';
      b.remove();
    };
    clear.append(b);
  }
  if (cfg.hasCommandcodeKey) {
    const b = el('button', 'link dim', 'Remover chave do Command Code');
    b.type = 'button';
    b.onclick = () => {
      ccKey.dataset.clear = '1';
      ccKey.placeholder = 'será removida ao salvar';
      b.remove();
    };
    clear.append(b);
  }
  if (clear.children.length) form.append(clear);

  // 4) geral
  form.append(el('h3', null, 'Geral'));
  const pin = check('Sempre no topo', last.pinned);
  const login = check('Iniciar com o Windows', cfg.openAtLogin);
  const unknown = check('Mostrar limites do Claude sem nome conhecido', cfg.claudeShowUnknown);
  form.append(pin.wrap, login.wrap, unknown.wrap);

  const actions = el('div', 'form-actions');
  const save = el('button', 'btn primary', 'Salvar');
  const cancel = el('button', 'btn', 'Cancelar');
  const file = el('button', 'link dim', 'Abrir config.json');
  save.onclick = async () => {
    const enabledOut = {};
    const hiddenOut = {};
    for (const id of ORDER) {
      enabledOut[id] = provChecks[id].checked;
      const off = winChecks[id].filter((w) => !w.input.checked).map((w) => w.label);
      if (off.length) hiddenOut[id] = off;
    }
    const patch = {
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
    save.textContent = 'Salvando…';
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
