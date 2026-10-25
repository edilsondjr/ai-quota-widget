const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, shell, safeStorage, clipboard, dialog, Notification, net } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getProviders, setCustomProviders, collect, release, clearSession, partitionFor, cleanUA, hardenSession, hardenWebContents, resetClaudeOrg } = require('./providers');
const { fields: settingFields, secretKeys: secretKeysFor, meta: settingsMeta, coerce, hasPlaintextSecrets, configForDisk } = require('./providers/settings');
const { buildCustomProvider, normalizeSpec, runCustom } = require('./providers/custom');
const { mergeReading } = require('./providers/readings');
const { translator } = require('./renderer/i18n');
const { prepareDataDir, sanitizeLegacyConfig, writeJsonAtomic } = require('./app-data');
const { checkForUpdates, RELEASES_URL } = require('./update');

// The provider list = built-ins + user-defined custom providers from config.
// SETTING_FIELDS/SECRET_KEYS are rebuilt whenever the custom list changes.
let SETTING_FIELDS = [];
let SECRET_KEYS = [];
let customSpecsLocked = false;
function rebuildRegistry(specs) {
  setCustomProviders((Array.isArray(specs) ? specs : []).map(buildCustomProvider).filter(Boolean));
  const list = getProviders();
  SETTING_FIELDS = settingFields(list);
  SECRET_KEYS = secretKeysFor(list);
  return list;
}
rebuildRegistry([]);

// Everything the app writes lives under ~/.quotawidget: config.json at the root and
// the per-provider sign-in profiles under profiles/. The old Electron userData folder
// (%APPDATA%/quota-widget on Windows) is migrated once, before any session is created.
// QUOTAWIDGET_HOME/QUOTAWIDGET_LEGACY_DIR are test-only overrides used by the Electron
// E2E test so it never touches real user data.
const DATA_HOME = process.env.QUOTAWIDGET_HOME || os.homedir();
const LEGACY_DATA_DIR = process.env.QUOTAWIDGET_LEGACY_DIR || app.getPath('userData');
try {
  const paths = prepareDataDir(DATA_HOME, LEGACY_DATA_DIR);
  if (!paths.ok) console.warn('Some legacy data could not be migrated:', paths.errors.join('; '));
  app.setPath('userData', paths.dataDir);
  app.setPath('sessionData', paths.profilesDir);
} catch (e) {
  console.warn('Could not use ~/.quotawidget, falling back to the default userData:', e && e.message ? e.message : e);
}

// Languages = files in locales/. To add one, just drop <code>.json in there.
const LOCALES = {};
for (const f of fs.readdirSync(path.join(__dirname, 'locales'))) {
  if (f.endsWith('.json')) LOCALES[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', f), 'utf8'));
}
const FALLBACK_LANG = 'en-US';
let t = translator(LOCALES[FALLBACK_LANG]);

// Before language support, hiddenWindows stored the (Portuguese) window label.
const LEGACY_WINDOW_KEYS = {
  claude: { '5 h': 'five_hour', Semana: 'seven_day', 'Sonnet (sem.)': 'seven_day_sonnet', 'Opus (sem.)': 'seven_day_opus', 'Design (sem.)': 'seven_day_omelette', 'Uso extra (mês)': 'extra_usage' },
  chatgpt: { '5 h': 'five_hour', Semana: 'weekly' },
  commandcode: { '5 h': 'five_hour', Semana: 'weekly' },
  ollama: { 'Sessão (5 h)': 'session', Semana: 'weekly', 'Mês (crédito)': 'month' },
};

const WIDTH = 336;
const DOCK_TOP_HEIGHT = 128;
const DOCK_SIDE_WIDTH = 300;
const DOCK_SETTINGS_WIDTH = 360;
const DOCK_MARGIN = 12;
const CONFIG_VERSION = 2;
const APP_ID = 'com.beamglyph.quotawidget';
const SKINS = ['classic', 'paper'];
app.setAppUserModelId(APP_ID);
const DEFAULTS = {
  configVersion: CONFIG_VERSION,
  language: FALLBACK_LANG,
  intervalMin: 5,
  pinned: true,
  ollamaApiKey: '',
  commandcodeApiKey: '',
  customProviders: [],
  bounds: null,
  enabled: {
    claude: true,
    chatgpt: true,
    commandcode: true,
    ollama: true,
    openrouter: false,
    deepseek: false,
    moonshot: false,
    copilot: false,
    synthetic: false,
    nanogpt: false,
    openai: false,
    anthropic: false,
    xai: false,
    mistral: false,
    opencode: false,
  },
  hiddenWindows: {},
  providerIntervals: {},
  notify: true,
  skin: 'classic',
  layout: 'card',
  dock: 'top',
  ollamaBillingDay: null,
  ollamaMonthlyCredits: null,
  claudeShowUnknown: false,
};

let win = null;
let tray = null;
let timer = null;
let windowMode = 'widget';
let contentHeight = 420;
let cfg = { ...DEFAULTS };
const notifiedWindows = new Map();
const NOTIFY_AT = 90;
const state = { providers: {}, updatedAt: null, loading: false, pinned: true, version: '', config: {}, lang: FALLBACK_LANG, strings: {}, languages: [], providerMeta: [] };

function applyLanguage() {
  if (!LOCALES[cfg.language]) cfg.language = FALLBACK_LANG;
  // keys missing from a language fall back to English
  state.strings = { ...LOCALES[FALLBACK_LANG], ...LOCALES[cfg.language] };
  state.lang = cfg.language;
  state.languages = Object.entries(LOCALES).map(([code, l]) => ({ code, name: l._name || code }));
  t = translator(state.strings);
}

function intervalFor(id) {
  const v = Number(cfg.providerIntervals && cfg.providerIntervals[id]);
  if (Number.isFinite(v) && v >= 1 && v <= 240) return v;
  return Math.max(1, Math.min(240, Number(cfg.intervalMin) || 5));
}

function backoffMs(id, failures) {
  const base = intervalFor(id) * 60000;
  return Math.min(base * Math.pow(2, Math.max(0, failures - 1)), 60 * 60000);
}

function windowName(key) {
  const text = t(`win.${key}`);
  return text === `win.${key}` ? String(key || '').replace(/_/g, ' ') : text;
}

function notify(title, body) {
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body });
    n.on('click', () => {
      if (win && !win.isDestroyed()) {
        win.show();
        win.focus();
      }
    });
    n.show();
  } catch (_) {}
}

function maybeNotify(id, name, prev, next) {
  if (!cfg.notify || !next || !next.ok || !Notification.isSupported()) return;
  const oldByKey = new Map(((prev && prev.ok ? prev.windows : []) || []).map((w) => [w.key, w]));
  const now = Date.now();
  for (const w of next.windows || []) {
    const mapKey = `${id}:${w.key}`;
    const old = oldByKey.get(w.key);
    const last = notifiedWindows.get(mapKey);
    const label = w.label || windowName(w.key);
    const renewed = old && old.resetsAt && w.resetsAt && old.resetsAt !== w.resetsAt && old.resetsAt <= now && w.resetsAt > now;
    if (renewed) {
      notify(t('notify.renew.title', { name }), t('notify.renew.body', { window: label }));
      notifiedWindows.delete(mapKey);
    }
    if ((w.percent || 0) >= NOTIFY_AT && (!last || last.resetAt !== w.resetsAt)) {
      notify(t('notify.high.title', { name }), t('notify.high.body', { window: label, percent: Math.round(w.percent) }));
      notifiedWindows.set(mapKey, { resetAt: w.resetsAt, percent: w.percent });
    } else if ((w.percent || 0) < NOTIFY_AT && last) {
      notifiedWindows.delete(mapKey);
    }
  }
}

const cfgPath = () => path.join(app.getPath('userData'), 'config.json');

// API keys are encrypted on disk (safeStorage = DPAPI on Windows, tied to the user).
// In memory (cfg) they stay plain text; on disk only `secrets` holds base64 blobs.
// If safeStorage is unavailable, secrets are not written at all (never plain text).
const canEncrypt = () => safeStorage.isEncryptionAvailable();

function readSecrets(raw) {
  const out = {};
  const enc = raw.secrets && typeof raw.secrets === 'object' ? raw.secrets : {};
  for (const k of SECRET_KEYS) {
    if (typeof enc[k] === 'string' && enc[k] && canEncrypt()) {
      try {
        out[k] = safeStorage.decryptString(Buffer.from(enc[k], 'base64'));
      } catch (_) {
        out[k] = ''; // encrypted by another user/machine: has to be entered again
      }
    } else if (typeof raw[k] === 'string' && raw[k]) {
      out[k] = raw[k]; // old plaintext config: migrated on the next saveCfg
    }
  }
  return out;
}

function loadCfg() {
  let needsSave = false;
  const newPath = cfgPath();
  const legacyPath = path.join(LEGACY_DATA_DIR, 'config.json');
  const fromLegacy = !fs.existsSync(newPath) && fs.existsSync(legacyPath);
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(fromLegacy ? legacyPath : newPath, 'utf8'));
  } catch (_) {}

  // Custom providers are stored encrypted. The plaintext field is only read to
  // migrate configs written before version 2. Decrypt before readSecrets so custom
  // key names join the dynamic secret list.
  let customSpecs = [];
  let encryptedSpecs = null;
  customSpecsLocked = false;
  if (raw) {
    if (typeof raw.customProvidersEnc === 'string' && raw.customProvidersEnc) {
      encryptedSpecs = raw.customProvidersEnc;
      if (canEncrypt()) {
        try {
          const decoded = JSON.parse(safeStorage.decryptString(Buffer.from(raw.customProvidersEnc, 'base64')));
          if (Array.isArray(decoded)) customSpecs = decoded;
        } catch (_) {
          customSpecsLocked = true;
        }
      } else {
        customSpecsLocked = true;
      }
    }
    if (!customSpecs.length && !customSpecsLocked && Array.isArray(raw.customProviders)) customSpecs = raw.customProviders;
  }
  const list = rebuildRegistry(customSpecs);
  if (raw) {
    cfg = { ...DEFAULTS, ...raw, ...readSecrets(raw) };
    delete cfg.secrets;
    delete cfg.customProvidersEnc;
    cfg.customProviders = customSpecs;
    if (encryptedSpecs) cfg.customProvidersEnc = encryptedSpecs;
    needsSave = fromLegacy || raw.configVersion !== CONFIG_VERSION || customSpecsLocked ||
      (Array.isArray(raw.customProviders) && raw.customProviders.length > 0) ||
      SECRET_KEYS.some((k) => typeof raw[k] === 'string' && raw[k]);
  } else {
    cfg = { ...DEFAULTS };
    needsSave = true;
  }
  cfg.configVersion = CONFIG_VERSION;
  cfg.customProviders = Array.isArray(cfg.customProviders) ? cfg.customProviders : [];
  if (needsSave && raw && !fromLegacy && fs.existsSync(newPath) &&
      (raw.configVersion !== CONFIG_VERSION || (Array.isArray(raw.customProviders) && raw.customProviders.length))) {
    backupConfig('before-migration');
  }
  if (needsSave) saveCfg();
  // The new config only ever gets written by saveCfg (encrypted). Once it exists,
  // remove any plaintext keys left in the old location.
  if (legacyPath !== newPath && fs.existsSync(newPath) && fs.existsSync(legacyPath)) {
    try {
      sanitizeLegacyConfig(legacyPath, SECRET_KEYS);
    } catch (_) {}
  }
  cfg.enabled = { ...DEFAULTS.enabled, ...(cfg.enabled || {}) };
  cfg.providerIntervals = cfg.providerIntervals && typeof cfg.providerIntervals === 'object' && !Array.isArray(cfg.providerIntervals) ? cfg.providerIntervals : {};
  cfg.notify = cfg.notify !== false;
  if (!SKINS.includes(cfg.skin)) cfg.skin = 'classic';
  cfg.layout = cfg.layout === 'dock' ? 'dock' : 'card';
  cfg.dock = ['top', 'left', 'right'].includes(cfg.dock) ? cfg.dock : 'top';
  cfg.hiddenWindows = cfg.hiddenWindows && typeof cfg.hiddenWindows === 'object' ? cfg.hiddenWindows : {};
  for (const [id, legacy] of Object.entries(LEGACY_WINDOW_KEYS)) {
    if (Array.isArray(cfg.hiddenWindows[id])) cfg.hiddenWindows[id] = cfg.hiddenWindows[id].map((k) => legacy[k] || k);
  }
  if (cfg.language === 'en') cfg.language = FALLBACK_LANG; // v0.3.0 stored 'en'
  applyLanguage();
  state.pinned = !!cfg.pinned;
  state.config = publicConfig();
  state.providerMeta = settingsMeta(list, cfg);
}

// Config sent to the UI: never includes the API keys, only whether they exist.
function publicConfig() {
  return {
    language: cfg.language,
    intervalMin: cfg.intervalMin,
    enabled: cfg.enabled,
    hiddenWindows: cfg.hiddenWindows,
    customProviders: cfg.customProviders,
    providerIntervals: cfg.providerIntervals,
    notify: cfg.notify !== false,
    skin: cfg.skin,
    layout: cfg.layout,
    dock: cfg.dock,
    openAtLogin: app.getLoginItemSettings().openAtLogin,
  };
}

function saveCfg() {
  try {
    const encrypt = canEncrypt() ? (v) => safeStorage.encryptString(v).toString('base64') : null;
    if (!encrypt && SECRET_KEYS.some((k) => cfg[k])) {
      console.warn('safeStorage unavailable: API keys will not be written to disk');
    }
    if (!encrypt && (cfg.customProviders || []).length) {
      console.warn('safeStorage unavailable: custom providers will not be written to disk');
    }
    const out = configForDisk(cfg, SECRET_KEYS, encrypt);
    delete out.customProviders;
    delete out.customProvidersEnc;
    if (encrypt) {
      if (customSpecsLocked && typeof cfg.customProvidersEnc === 'string' && cfg.customProvidersEnc) {
        out.customProvidersEnc = cfg.customProvidersEnc;
      } else {
        out.customProvidersEnc = safeStorage.encryptString(JSON.stringify(cfg.customProviders || [])).toString('base64');
      }
    } else if (typeof cfg.customProvidersEnc === 'string' && cfg.customProvidersEnc) {
      out.customProvidersEnc = cfg.customProvidersEnc;
    }
    writeJsonAtomic(cfgPath(), out);
    if (out.customProvidersEnc) cfg.customProvidersEnc = out.customProvidersEnc;
    else delete cfg.customProvidersEnc;
  } catch (_) {}
}

function push() {
  if (win && !win.isDestroyed()) win.webContents.send('state', state);
}

async function refresh(ids, manual = false) {
  const all = getProviders().map((p) => p.id).filter((id) => cfg.enabled[id] !== false);
  const requested = ids && ids.length ? ids.filter((id) => all.includes(id)) : all;
  const now = Date.now();
  const list = manual ? requested : requested.filter((id) => {
    const prev = state.providers[id];
    if (prev && prev.nextRetryAt && prev.nextRetryAt > now) return false;
    if (prev && prev.lastAttemptAt && now - prev.lastAttemptAt < intervalFor(id) * 60000) return false;
    return true;
  });
  if (!list.length) return;

  state.loading = true;
  push();

  const queue = [...list];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift();
      const prev = state.providers[id];
      const started = Date.now();
      const next = await collect(id, cfg);
      next.latencyMs = Date.now() - started;
      next.lastAttemptAt = Date.now();
      const merged = mergeReading(prev, next);
      const failures = next.ok ? 0 : (prev && prev.consecutiveFailures ? prev.consecutiveFailures : 0) + 1;
      merged.consecutiveFailures = failures;
      merged.nextRetryAt = next.ok ? null : Date.now() + backoffMs(id, failures);
      state.providers[id] = merged;
      maybeNotify(id, next.name || id, prev, next);
      push();
    }
  });
  await Promise.all(workers);

  state.loading = false;
  state.updatedAt = Date.now();
  push();
}

function schedule() {
  clearInterval(timer);
  const enabled = getProviders().filter((p) => cfg.enabled[p.id] !== false);
  const minutes = enabled.length ? Math.min(...enabled.map((p) => intervalFor(p.id))) : Math.max(1, Number(cfg.intervalMin) || 5);
  const jitter = 0.9 + Math.random() * 0.2;
  timer = setInterval(() => refresh(), Math.max(60000, minutes * 60000 * jitter));
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

function workAreaForWindow() {
  const display = win && !win.isDestroyed() ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay();
  return display.workArea;
}

function dockBounds(mode, wa) {
  if (mode === 'settings') {
    const width = DOCK_SETTINGS_WIDTH;
    const height = Math.min(Math.max(420, contentHeight), Math.max(200, wa.height - DOCK_MARGIN * 2));
    const x = cfg.dock === 'right'
      ? wa.x + wa.width - width - DOCK_MARGIN
      : cfg.dock === 'left'
        ? wa.x + DOCK_MARGIN
        : wa.x + Math.round((wa.width - width) / 2);
    return { x, y: wa.y + DOCK_MARGIN, width, height };
  }
  if (cfg.dock === 'top') {
    const width = Math.min(1100, wa.width - DOCK_MARGIN * 2);
    return { x: wa.x + Math.round((wa.width - width) / 2), y: wa.y + DOCK_MARGIN, width, height: DOCK_TOP_HEIGHT };
  }
  return {
    x: cfg.dock === 'right' ? wa.x + wa.width - DOCK_SIDE_WIDTH - DOCK_MARGIN : wa.x + DOCK_MARGIN,
    y: wa.y + DOCK_MARGIN,
    width: DOCK_SIDE_WIDTH,
    height: wa.height - DOCK_MARGIN * 2,
  };
}

function applyWindowLayout() {
  if (!win || win.isDestroyed()) return;
  if (cfg.layout === 'dock') {
    win.setMovable(false);
    win.setBounds(dockBounds(windowMode, workAreaForWindow()));
  } else {
    win.setMovable(true);
    win.setContentSize(WIDTH, Math.max(120, Math.min(900, contentHeight)));
    clampToScreen();
  }
}

function setWindowMode(mode) {
  windowMode = mode === 'settings' ? 'settings' : 'widget';
  if (cfg.layout === 'dock') applyWindowLayout();
}

function createWindow() {
  const dock = cfg.layout === 'dock';
  const pos = cfg.bounds && typeof cfg.bounds.x === 'number' ? cfg.bounds : defaultPosition();
  const dockB = dock ? dockBounds('widget', screen.getPrimaryDisplay().workArea) : null;
  win = new BrowserWindow({
    width: dockB ? dockB.width : WIDTH,
    height: dockB ? dockB.height : 420,
    x: dockB ? dockB.x : pos.x,
    y: dockB ? dockB.y : pos.y,
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
      webviewTag: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('will-redirect', (event) => event.preventDefault());
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.setMovable(!dock);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
    if (cfg.layout !== 'dock') clampToScreen();
  });
  win.on('moved', () => {
    if (cfg.layout !== 'card' || windowMode === 'settings') return;
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
  // Icon generated in code (rounded square), no file needed.
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

function setSkin(skin) {
  if (!SKINS.includes(skin)) return;
  cfg.skin = skin;
  saveCfg();
  state.config = publicConfig();
  push();
  buildTrayMenu();
}

function buildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: t('tray.toggle'), click: toggleWindow },
    { label: t('tray.refresh'), click: () => refresh(undefined, true) },
    { type: 'separator' },
    { label: t('tray.pin'), type: 'checkbox', checked: state.pinned, click: (i) => setPinned(i.checked) },
    {
      label: t('tray.autostart'),
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }),
    },
    {
      label: t('tray.mute'),
      type: 'checkbox',
      checked: !cfg.notify,
      click: (i) => {
        cfg.notify = !i.checked;
        saveCfg();
        push();
        buildTrayMenu();
      },
    },
    {
      label: t('tray.skin'),
      submenu: [
        { label: t('skin.classic'), type: 'radio', checked: cfg.skin === 'classic', click: () => setSkin('classic') },
        { label: t('skin.paper'), type: 'radio', checked: cfg.skin === 'paper', click: () => setSkin('paper') },
      ],
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
  const p = getProviders().find((x) => x.id === id);
  if (!p || !p.loginUrl) return;
  cleanUA(id);
  hardenSession(id);
  const partition = partitionFor(id);
  const w = new BrowserWindow({
    width: 480,
    height: 740,
    title: t('login.title', { name: p.name }),
    autoHideMenuBar: true,
    webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false },
  });
  hardenWebContents(w.webContents, { allowHttpsPopups: true, partition });
  w.loadURL(p.loginUrl);
  w.on('closed', () => {
    if (id === 'claude') resetClaudeOrg();
    refresh([id], true);
  });
}

// ---------- custom providers ----------
function saveCustomProvider(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid payload' };
  const normalized = normalizeSpec(input.spec);
  if (!normalized.ok) return normalized;

  const specs = Array.isArray(cfg.customProviders) ? [...cfg.customProviders] : [];
  const index = input.id ? specs.findIndex((s) => s.id === input.id) : -1;
  if (input.id && index < 0) return { ok: false, error: 'Custom provider not found' };

  const existing = index >= 0 ? specs[index] : null;
  const id = existing ? existing.id : `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const keyName = existing && existing.keyName ? existing.keyName : `${id}ApiKey`;
  const spec = { ...normalized.spec, id, keyName };
  if (index >= 0) specs[index] = spec;
  else specs.push(spec);
  cfg.customProviders = specs;

  if (spec.auth === 'none') {
    delete cfg[keyName];
  } else {
    if (typeof input.apiKey === 'string' && input.apiKey.trim()) cfg[keyName] = input.apiKey.trim();
    if (input.clearKey) delete cfg[keyName];
  }

  cfg.enabled[id] = index >= 0 ? cfg.enabled[id] !== false : true;

  const list = rebuildRegistry(specs);
  state.config = publicConfig();
  state.providerMeta = settingsMeta(list, cfg);
  saveCfg();
  push();
  return { ok: true, id };
}

function deleteCustomProvider(id) {
  const specs = Array.isArray(cfg.customProviders) ? cfg.customProviders : [];
  const spec = specs.find((s) => s.id === id);
  if (!spec) return { ok: false, error: 'Custom provider not found' };
  cfg.customProviders = specs.filter((s) => s.id !== id);
  if (spec.keyName) delete cfg[spec.keyName];
  delete cfg.enabled[id];
  delete cfg.hiddenWindows[id];
  delete state.providers[id];
  const list = rebuildRegistry(cfg.customProviders);
  state.config = publicConfig();
  state.providerMeta = settingsMeta(list, cfg);
  saveCfg();
  push();
  return { ok: true };
}

async function testCustomProvider(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid payload' };
  const normalized = normalizeSpec(input.spec);
  if (!normalized.ok) return normalized;

  const specs = Array.isArray(cfg.customProviders) ? cfg.customProviders : [];
  const existing = input.id ? specs.find((s) => s.id === input.id) : null;
  const keyName = existing && existing.keyName ? existing.keyName : '__custom_test_key__';
  const typed = typeof input.apiKey === 'string' && input.apiKey.trim() ? input.apiKey.trim() : '';
  const key = input.clearKey ? '' : typed || (existing ? cfg[keyName] : '');
  const testCfg = { ...cfg, [keyName]: key };
  const spec = { ...normalized.spec, id: existing ? existing.id : '__custom_test__', keyName };
  if (spec.auth === 'none') delete testCfg[keyName];

  const result = await runCustom(spec, testCfg);
  if (result.action || result.error) return { ok: false, ...result };
  return { ok: true, ...result };
}

function backupConfig(reason = 'manual') {
  try {
    if (!fs.existsSync(cfgPath())) saveCfg();
    if (!fs.existsSync(cfgPath())) return null;
    const dir = path.join(app.getPath('userData'), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(dir, `config-${stamp}-${reason}.json`);
    fs.copyFileSync(cfgPath(), dest);
    pruneBackups(dir);
    return dest;
  } catch (_) {
    return null;
  }
}

function pruneBackups(dir) {
  try {
    const files = fs.readdirSync(dir).filter((f) => /^config-.*\.json$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 10))) {
      try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
    }
  } catch (_) {}
}

function restartSoon() {
  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 500);
}

async function exportConfig(event) {
  try {
    if (!fs.existsSync(cfgPath())) saveCfg();
    const parent = BrowserWindow.fromWebContents(event.sender);
    const date = new Date().toISOString().slice(0, 10);
    const options = {
      title: t('s.config_export_title'),
      defaultPath: path.join(app.getPath('documents'), `quota-widget-config-${date}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    fs.copyFileSync(cfgPath(), result.filePath);
    return { ok: true, path: result.filePath };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

async function importConfig(event) {
  try {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: t('s.config_import_title'),
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    } catch (_) {
      return { ok: false, error: 'Invalid JSON file' };
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Invalid config file' };
    if (raw.configVersion && Number(raw.configVersion) > CONFIG_VERSION) {
      return { ok: false, error: 'This config was written by a newer version' };
    }
    const plaintextApiKey = Object.entries(raw).some(
      ([k, v]) => /(apiKey|ApiKey)$/.test(k) && typeof v === 'string' && v
    );
    if (plaintextApiKey || hasPlaintextSecrets(raw, SECRET_KEYS)) {
      return { ok: false, error: 'This config contains plaintext API keys or tokens. Export it from the current app first.' };
    }
    if (Array.isArray(raw.customProviders) && raw.customProviders.length) {
      return { ok: false, error: 'This config contains plaintext custom providers. Export it from the current app first.' };
    }
    if (!canEncrypt()) return { ok: false, error: 'Encryption is unavailable on this machine' };
    if (raw.secrets != null) {
      if (typeof raw.secrets !== 'object' || Array.isArray(raw.secrets)) return { ok: false, error: 'Invalid secrets block' };
      for (const value of Object.values(raw.secrets)) {
        if (typeof value !== 'string' || !value) continue;
        try {
          safeStorage.decryptString(Buffer.from(value, 'base64'));
        } catch (_) {
          return { ok: false, error: 'This config was encrypted by another Windows user or machine' };
        }
      }
    }
    if (typeof raw.customProvidersEnc === 'string' && raw.customProvidersEnc) {
      try {
        const specs = JSON.parse(safeStorage.decryptString(Buffer.from(raw.customProvidersEnc, 'base64')));
        if (!Array.isArray(specs)) throw new Error('not an array');
      } catch (_) {
        return { ok: false, error: 'This config was encrypted by another Windows user or machine' };
      }
    }
    backupConfig('before-import');
    writeJsonAtomic(cfgPath(), raw);
    restartSoon();
    return { ok: true, restarting: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function resetConfig() {
  try {
    backupConfig('before-reset');
    cfg = { ...DEFAULTS, configVersion: CONFIG_VERSION, enabled: { ...DEFAULTS.enabled }, customProviders: [], hiddenWindows: {} };
    customSpecsLocked = false;
    rebuildRegistry([]);
    delete cfg.customProvidersEnc;
    app.setLoginItemSettings({ openAtLogin: false });
    saveCfg();
    restartSoon();
    return { ok: true, restarting: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

// ---------- IPC ----------
ipcMain.handle('state', () => state);
ipcMain.handle('refresh', (_e, id) => refresh(id ? [id] : undefined, true));
ipcMain.handle('login', (_e, id) => openLogin(id));
ipcMain.handle('logout', async (_e, id) => {
  await clearSession(id);
  if (id === 'claude') resetClaudeOrg();
  await refresh([id], true);
});
ipcMain.handle('open-config', async () => {
  if (!fs.existsSync(cfgPath())) saveCfg();
  shell.showItemInFolder(cfgPath());
});
ipcMain.handle('backup-config', () => {
  const file = backupConfig('manual');
  return file ? { ok: true, path: file } : { ok: false, error: 'Could not create a backup' };
});
ipcMain.handle('export-config', (event) => exportConfig(event));
ipcMain.handle('import-config', (event) => importConfig(event));
ipcMain.handle('reset-config', () => resetConfig());
ipcMain.handle('check-update', async () => {
  try {
    return {
      ok: true,
      ...(await checkForUpdates({
        currentVersion: app.getVersion(),
        fetchImpl: (url, options) => net.fetch(url, options),
      })),
    };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});
ipcMain.handle('open-release', () => shell.openExternal(RELEASES_URL));
ipcMain.handle('save-custom-provider', async (_e, input) => {
  const result = saveCustomProvider(input);
  if (result.ok) await refresh(undefined, true);
  return result;
});
ipcMain.handle('test-custom-provider', (_e, input) => testCustomProvider(input));
ipcMain.handle('copy-text', (_e, text) => {
  if (typeof text === 'string') clipboard.writeText(text);
});
ipcMain.handle('delete-custom-provider', async (_e, id) => {
  const result = deleteCustomProvider(id);
  if (result.ok) await refresh(undefined, true);
  return result;
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
    for (const p of getProviders()) {
      if (!(p.id in patch.enabled)) continue;
      cfg.enabled[p.id] = !!patch.enabled[p.id];
      if (!cfg.enabled[p.id]) {
        // turned off: stop holding its hidden window and drop its stale reading
        release(p.id);
        delete state.providers[p.id];
      }
    }
  }
  if (patch.hiddenWindows && typeof patch.hiddenWindows === 'object') {
    const clean = {};
    for (const p of getProviders()) {
      const arr = patch.hiddenWindows[p.id];
      if (Array.isArray(arr) && arr.length) clean[p.id] = arr.filter((x) => typeof x === 'string').slice(0, 20);
    }
    cfg.hiddenWindows = clean;
  }
  if (patch.providerIntervals && typeof patch.providerIntervals === 'object') {
    const clean = {};
    for (const p of getProviders()) {
      if (!(p.id in patch.providerIntervals)) continue;
      const v = num(patch.providerIntervals[p.id]);
      if (v && v >= 1 && v <= 240) clean[p.id] = v;
    }
    cfg.providerIntervals = clean;
  }
  if ('notify' in patch) cfg.notify = !!patch.notify;
  if (typeof patch.skin === 'string' && SKINS.includes(patch.skin)) cfg.skin = patch.skin;
  if (patch.layout === 'card' || patch.layout === 'dock') cfg.layout = patch.layout;
  if (['top', 'left', 'right'].includes(patch.dock)) cfg.dock = patch.dock;
  // Provider-declared settings: only known keys are accepted and validated by type.
  for (const field of SETTING_FIELDS) {
    if (!(field.key in patch)) continue;
    const r = coerce(field, patch[field.key]);
    if (r.ok) cfg[field.key] = r.value;
  }
  if ('openAtLogin' in patch) app.setLoginItemSettings({ openAtLogin: !!patch.openAtLogin });
  if ('pinned' in patch && !!patch.pinned !== state.pinned) setPinned(!!patch.pinned);
  applyWindowLayout();
  saveCfg();
  schedule();
  state.config = publicConfig();
  state.providerMeta = settingsMeta(getProviders(), cfg);
  push();
  buildTrayMenu();
  await refresh(undefined, true);
});
ipcMain.handle('hide', () => win && win.hide());
ipcMain.handle('set-window-mode', (_e, mode) => setWindowMode(mode));
ipcMain.on('resize', (_e, h) => {
  if (!win || win.isDestroyed()) return;
  contentHeight = Math.max(120, Math.min(900, Math.ceil(h)));
  if (cfg.layout === 'dock') {
    applyWindowLayout();
  } else {
    win.setContentSize(WIDTH, contentHeight);
    clampToScreen();
  }
});

// ---------- lifecycle ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // May fire while the previous instance is still shutting down.
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
    screen.on('display-metrics-changed', () => {
      if (cfg.layout === 'dock') applyWindowLayout();
    });
  });

  app.on('window-all-closed', (e) => e.preventDefault());
  app.on('before-quit', () => {
    app.isQuitting = true;
  });
}
