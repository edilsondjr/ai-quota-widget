// Acesso web via Chromium do Electron (cookies + TLS reais). O Electron é carregado
// sob demanda para que os provedores possam ser importados em testes, fora do app.
const electron = () => require('electron');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

function partitionFor(id) {
  return `persist:qw-${id}`;
}

const uaDone = new Set();
function cleanUA(id) {
  if (uaDone.has(id)) return;
  const { session, app } = electron();
  const ses = session.fromPartition(partitionFor(id));
  const ua = ses
    .getUserAgent()
    .replace(/\s?Electron\/\S+/, '')
    .replace(new RegExp('\\s?' + esc(app.getName()) + '\\/\\S+'), '');
  ses.setUserAgent(ua);
  uaDone.add(id);
}

// ---------- fetch dentro de uma página real ----------
const hidden = new Map();

async function getHidden(id, origin) {
  let win = hidden.get(id);
  if (win && !win.isDestroyed()) return win;
  cleanUA(id);
  const { BrowserWindow } = electron();
  win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: { partition: partitionFor(id), contextIsolation: true, sandbox: true },
  });
  hidden.set(id, win);
  try {
    await win.loadURL(origin + '/robots.txt');
  } catch (_) {
    /* mesmo com erro de carga o contexto de origem pode servir */
  }
  return win;
}

async function pageFetch(id, origin, url, headers = {}) {
  const win = await getHidden(id, origin);
  const js = `(async () => {
    try {
      const r = await fetch(${JSON.stringify(url)}, { credentials: 'include', headers: ${JSON.stringify(headers)} });
      const t = await r.text();
      return { status: r.status, url: r.url, text: t };
    } catch (e) { return { status: 0, error: String(e) }; }
  })()`;
  return win.webContents.executeJavaScript(js);
}

function dropHidden(id) {
  const win = hidden.get(id);
  if (win && !win.isDestroyed()) win.destroy();
  hidden.delete(id);
}

async function clearSession(id) {
  dropHidden(id);
  await electron().session.fromPartition(partitionFor(id)).clearStorageData();
}

// fetch com a pilha de rede do Electron (para APIs com chave, sem cookies)
const netFetch = (...args) => electron().net.fetch(...args);

module.exports = { partitionFor, cleanUA, pageFetch, clearSession, netFetch };
