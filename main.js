const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { PROVIDERS, collect, clearSession, partitionFor, cleanUA, resetClaudeOrg } = require('./providers');

const WIDTH = 336;
const DEFAULTS = {
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
const state = { providers: {}, updatedAt: null, loading: false, pinned: true, version: '', config: {} };

const cfgPath = () => path.join(app.getPath('userData'), 'config.json');

function loadCfg() {
  try {
    cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(cfgPath(), 'utf8')) };
  } catch (_) {
    cfg = { ...DEFAULTS };
    saveCfg();
  }
  cfg.enabled = { ...DEFAULTS.enabled, ...(cfg.enabled || {}) };
  cfg.hiddenWindows = cfg.hiddenWindows && typeof cfg.hiddenWindows === 'object' ? cfg.hiddenWindows : {};
  state.pinned = !!cfg.pinned;
  state.config = publicConfig();
}

// Config enviada à interface: nunca inclui as chaves de API, só se existem.
function publicConfig() {
  return {
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
    fs.writeFileSync(cfgPath(), JSON.stringify(cfg, null, 2));
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
    { label: 'Mostrar / ocultar', click: toggleWindow },
    { label: 'Atualizar agora', click: () => refresh() },
    { type: 'separator' },
    { label: 'Sempre no topo', type: 'checkbox', checked: state.pinned, click: (i) => setPinned(i.checked) },
    {
      label: 'Iniciar com o Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }),
    },
    { label: 'Abrir pasta de configuração', click: () => shell.openPath(app.getPath('userData')) },
    { type: 'separator' },
    {
      label: 'Sair',
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
    title: `Entrar — ${p.name}`,
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
