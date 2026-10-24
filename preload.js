const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qw', {
  getState: () => ipcRenderer.invoke('state'),
  refresh: (id) => ipcRenderer.invoke('refresh', id),
  login: (id) => ipcRenderer.invoke('login', id),
  logout: (id) => ipcRenderer.invoke('logout', id),
  openConfig: () => ipcRenderer.invoke('open-config'),
  setConfig: (patch) => ipcRenderer.invoke('set-config', patch),
  togglePin: () => ipcRenderer.invoke('toggle-pin'),
  hide: () => ipcRenderer.invoke('hide'),
  resize: (h) => ipcRenderer.send('resize', h),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
});
