const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, shell, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const { PROVIDERS, collect, clearSession, partitionFor, cleanUA, resetClaudeOrg } = require('./providers');
const { translator } = require('./renderer/i18n');

// Idiomas = arquivos em locales/. Para acrescentar um, basta colocar <código>.json lá.
const LOCALES = {};
for (const f of fs.readdirSync(path.join(__dirname, 'locales'))) {
  if (f.endsWith('.json')) LOCALES[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', f), 'utf8'));
}
const FALLBACK_LANG = 'en';
let t = translator(LOCALES[FALLBACK_LANG]);

// Antes do suporte a idiomas, hiddenWindows guardava o texto em português da janela.
const LEGACY_WINDOW_KEYS = {
  claude: { '5 h': 'five_hour', Semana: 'seven_day', 'Sonnet (sem.)': 'seven_day_sonnet', 'Opus (sem.)': 'seven_day_opus', 'Design (sem.)': 'seven_day_omelette', 'Uso extra (mês)': 'extra_usage' },
  chatgpt: { '5 h': 'five_hour', Semana: 'weekly' },
  commandcode: { '5 h': 'five_hour', Semana: 'weekly' },
  ollama: { 'Sessão (5 h)': 'session', Semana: 'weekly', 'Mês (crédito)': 'month' },
};

const WIDTH = 336;
const DEFAULTS = {
  language: FALLBACK_LANG,
  intervalMin: 5,
  pinned: true,
  ollamaApiKey: '',
  commandcodeApiKey: '',
  bounds: null,
  enabled: { claude: true, chatgpt: true, commandcode: true, ollama: true },
  hiddenWindows: {},
  ollamaBillingDay: null,
  ollamaMonthlyCredits: null,
  claudeShowUnknown: false,
};

let win = null;
let tray = null;
let timer = null;
let cfg = { ...DEFAULTS };
const state = { providers: {}, updatedAt: null, loading: false, pinned: true, version: '', config: {}, lang: FALLBACK_LANG, strings: {}, languages: [] };

function applyLanguage() {
  if (!LOCALES[cfg.language]) cfg.language = FALLBACK_LANG;
  // chaves que faltarem num idioma caem para o inglês
  state.strings = { ...LOCALES[FALLBACK_LANG], ...LOCALES[cfg.language] };
  state.lang = cfg.language;
  state.languages = Object.entries(LOCALES).map(([code, l]) => ({ code, name: l._name || code }));
  t = translator(state.strings);
}

const cfgPath = () => path.join(app.getPath('userData'), 'config.json');

// Chaves de API ficam criptografadas em disco (safeStorage = DPAPI no Windows, atrelada ao usuário).
// Em memória (cfg) seguem em texto puro; no arquivo vão em `secrets` como base64.
const SECRET_KEYS = ['ollamaApiKey', 'commandcodeApiKey'];
const canEncrypt = () => safeStorage.isEncryptionAvailable();

function readSecrets(raw) {
  const out = {};
  const enc = raw.secrets && typeof raw.secrets === 'object' ? raw.secrets : {};
  for (const k of SECRET_KEYS) {
    if (typeof enc[k] === 'string' && enc[k] && canEncrypt()) {
      try {
        out[k] = safeStorage.decryptString(Buffer.from(enc[k], 'base64'));
      } catch (_) {
        out[k] = ''; // criptografado por outro usuário/máquina: precisa digitar de novo
      }
    } else if (typeof raw[k] === 'string' && raw[k]) {
      out[k] = raw[k]; // config antigo em texto puro: migrado no próximo saveCfg
    }
  }
  return out;
}

function loadCfg() {
  let needsSave = false;
  try {
    const raw = JSON.parse(fs.readFileSync(cfgPath(), 'utf8'));
    cfg = { ...DEFAULTS, ...raw, ...readSecrets(raw) };
    delete cfg.secrets;
    needsSave = canEncrypt() && SECRET_KEYS.some((k) => typeof raw[k] === 'string' && raw[k]);
  } catch (_) {
    cfg = { ...DEFAULTS };
    needsSave = true;
  }
  if (needsSave) saveCfg();
  cfg.enabled = { ...DEFAULTS.enabled, ...(cfg.enabled || {}) };
  cfg.hiddenWindows = cfg.hiddenWindows && typeof cfg.hiddenWindows === 'object' ? cfg.hiddenWindows : {};
  for (const [id, legacy] of Object.entries(LEGACY_WINDOW_KEYS)) {
    if (Array.isArray(cfg.hiddenWindows[id])) cfg.hiddenWindows[id] = cfg.hiddenWindows[id].map((k) => legacy[k] || k);
  }
  applyLanguage();
  state.pinned = !!cfg.pinned;
  state.config = publicConfig();
}

// Config enviada à interface: nunca inclui as chaves de API, só se existem.
function publicConfig() {
  return {
    language: cfg.language,
    intervalMin: cfg.intervalMin,
    enabled: cfg.enabled,
    hiddenWindows: cfg.hiddenWindows,
    ollamaBillingDay: cfg.ollamaBillingDay,
    ollamaMonthlyCredits: cfg.ollamaMonthlyCredits,
    claudeShowUnknown: !!cfg.claudeShowUnknown,
    hasOllamaKey: !!cfg.ollamaApiKey,
    hasCommandcodeKey: !!cfg.commandcodeApiKey,
    openAtLogin: app.getLoginItemSettings().openAtLogin,
  };
}

function saveCfg() {
  try {
    fs.mkdirSync(path.dirname(cfgPath()), { recursive: true });
    const out = { ...cfg };
    if (canEncrypt()) {
      out.secrets = {};
      for (const k of SECRET_KEYS) {
        if (cfg[k]) out.secrets[k] = safeStorage.encryptString(cfg[k]).toString('base64');
        out[k] = '';
      }
    }
    fs.writeFileSync(cfgPath(), JSON.stringify(out, null, 2));
  } catch (_) {}
}

function push() {
  if (win && !win.isDestroyed()) win.webContents.send('state', state);
}

async function refresh(ids) {
  const all = PROVIDERS.map((p) => p.id).filter((id) => cfg.enabled[id] !== false);
  const list = ids && ids.length ? ids.filter((id) => all.includes(id)) : all;
  state.loading = true;
  push();
  await Promise.allSettled(
    list.map(async (id) => {
      state.providers[id] = await collect(id, cfg);
      push();
    })
  );
  state.loading = false;
  state.updatedAt = Date.now();
  push();
}

function schedule() {
  clearInterval(timer);
  const ms = Math.max(1, Number(cfg.intervalMin) || 5) * 60 * 1000;
  timer = setInterval(() => refresh(), ms);
}

function defaultPosition() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - WIDTH - 12, y: wa.y + wa.height - 420 - 12 };
}

function clampToScreen() {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const x = Math.min(Math.max(b.x, wa.x), wa.x + wa.width - b.width);
  const y = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - b.height);
  if (x !== b.x || y !== b.y) win.setPosition(x, y);
}

function createWindow() {
  const pos = cfg.bounds && typeof cfg.bounds.x === 'number' ? cfg.bounds : defaultPosition();
  win = new BrowserWindow({
    width: WIDTH,
    height: 420,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: state.pinned,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
    clampToScreen();
  });
  win.on('moved', () => {
    const b = win.getBounds();
    cfg.bounds = { x: b.x, y: b.y };
    saveCfg();
  });
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function makeTrayIcon() {
  // Ícone gerado em código (quadrado arredondado), sem depender de arquivo.
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = Math.min(x, size - 1 - x);
      const dy = Math.min(y, size - 1 - y);
      const corner = dx < 3 && dy < 3 && dx + dy < 3;
      const bar = y >= 5 && y <= 10 && x >= 3 && x <= 12;
      const filled = !corner;
      const fillBar = bar && (x - 3) / 9 < 0.65;
      const [b, g, r] = fillBar ? [255, 255, 255] : bar ? [90, 60, 40] : [235, 140, 60];
      buf[i] = b;
      buf[i + 1] = g;
      buf[i + 2] = r;
      buf[i + 3] = filled ? 255 : 0;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function toggleWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) win.hide();
  else {
    win.show();
    clampToScreen();
  }
}

function setPinned(v) {
  state.pinned = v;
  cfg.pinned = v;
  saveCfg();
  if (win && !win.isDestroyed()) win.setAlwaysOnTop(v);
  push();
  buildTrayMenu();
}

function buildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: t('tray.toggle'), click: toggleWindow },
    { label: t('tray.refresh'), click: () => refresh() },
    { type: 'separator' },
    { label: t('tray.pin'), type: 'checkbox', checked: state.pinned, click: (i) => setPinned(i.checked) },
    {
      label: t('tray.autostart'),
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }),
    },
    { label: t('tray.open_folder'), click: () => shell.openPath(app.getPath('userData')) },
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function openLogin(id) {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p || !p.loginUrl) return;
  cleanUA(id);
  const w = new BrowserWindow({
    width: 480,
    height: 740,
    title: t('login.title', { name: p.name }),
    autoHideMenuBar: true,
    webPreferences: { partition: partitionFor(id), contextIsolation: true, sandbox: true },
  });
  w.loadURL(p.loginUrl);
  w.on('closed', () => {
    if (id === 'claude') resetClaudeOrg();
    refresh([id]);
  });
}

// ---------- IPC ----------
ipcMain.handle('state', () => state);
ipcMain.handle('refresh', (_e, id) => refresh(id ? [id] : undefined));
ipcMain.handle('login', (_e, id) => openLogin(id));
ipcMain.handle('logout', async (_e, id) => {
  await clearSession(id);
  if (id === 'claude') resetClaudeOrg();
  await refresh([id]);
});
ipcMain.handle('open-config', async () => {
  if (!fs.existsSync(cfgPath())) saveCfg();
  shell.showItemInFolder(cfgPath());
});
ipcMain.handle('toggle-pin', () => setPinned(!state.pinned));
ipcMain.handle('set-config', async (_e, patch) => {
  if (!patch || typeof patch !== 'object') return;
  if (typeof patch.language === 'string' && LOCALES[patch.language]) {
    cfg.language = patch.language;
    applyLanguage();
  }
  const num = (v) => (v === null || v === '' || v === undefined ? null : Number.isFinite(+v) ? +v : undefined);
  if ('intervalMin' in patch) {
    const v = num(patch.intervalMin);
    if (v && v >= 1 && v <= 240) cfg.intervalMin = v;
  }
  if (patch.enabled && typeof patch.enabled === 'object') {
    for (const p of PROVIDERS) if (p.id in patch.enabled) cfg.enabled[p.id] = !!patch.enabled[p.id];
  }
  if (patch.hiddenWindows && typeof patch.hiddenWindows === 'object') {
    const clean = {};
    for (const p of PROVIDERS) {
      const arr = patch.hiddenWindows[p.id];
      if (Array.isArray(arr) && arr.length) clean[p.id] = arr.filter((x) => typeof x === 'string').slice(0, 20);
    }
    cfg.hiddenWindows = clean;
  }
  if ('ollamaBillingDay' in patch) {
    const v = num(patch.ollamaBillingDay);
    cfg.ollamaBillingDay = v && v >= 1 && v <= 31 ? Math.round(v) : null;
  }
  if ('ollamaMonthlyCredits' in patch) {
    const v = num(patch.ollamaMonthlyCredits);
    cfg.ollamaMonthlyCredits = v && v > 0 ? v : null;
  }
  if ('claudeShowUnknown' in patch) cfg.claudeShowUnknown = !!patch.claudeShowUnknown;
  // chaves: só mudam se vierem no patch; string vazia apaga
  for (const k of ['ollamaApiKey', 'commandcodeApiKey']) {
    if (typeof patch[k] === 'string') cfg[k] = patch[k].trim();
  }
  if ('openAtLogin' in patch) app.setLoginItemSettings({ openAtLogin: !!patch.openAtLogin });
  if ('pinned' in patch && !!patch.pinned !== state.pinned) setPinned(!!patch.pinned);
  saveCfg();
  schedule();
  state.config = publicConfig();
  push();
  buildTrayMenu();
  await refresh();
});
ipcMain.handle('hide', () => win && win.hide());
ipcMain.on('resize', (_e, h) => {
  if (!win || win.isDestroyed()) return;
  const height = Math.max(120, Math.min(900, Math.ceil(h)));
  win.setContentSize(WIDTH, height);
  clampToScreen();
});

// ---------- ciclo de vida ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Pode disparar enquanto a instância anterior ainda está encerrando.
    if (app.isQuitting || !win || win.isDestroyed()) return;
    win.show();
    clampToScreen();
  });

  app.whenReady().then(() => {
    loadCfg();
    state.version = app.getVersion();
    createWindow();
    tray = new Tray(makeTrayIcon());
    tray.setToolTip('Quota Widget');
    tray.on('click', toggleWindow);
    buildTrayMenu();
    refresh();
    schedule();
  });

  app.on('window-all-closed', (e) => e.preventDefault());
  app.on('before-quit', () => {
    app.isQuitting = true;
  });
}
