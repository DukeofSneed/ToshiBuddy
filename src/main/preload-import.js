'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('chars', {
  pick: (kind) => ipcRenderer.invoke('import:pick', { kind }),
  // A dropped file's path on disk (for drag and drop).
  pathFor: (file) => { try { return webUtils.getPathForFile(file); } catch (_) { return ''; } },
  importFiles: (args) => ipcRenderer.invoke('import:files', args),
  importPack: (source) => ipcRenderer.invoke('import:pack', { source }),
  list: () => ipcRenderer.invoke('import:characters'),
  theme: () => ipcRenderer.invoke('app:theme'),
  details: (id) => ipcRenderer.invoke('import:details', { id }),
  save: (id, patch) => ipcRenderer.invoke('import:save', { id, patch }),
  switchTo: (id) => ipcRenderer.invoke('import:switch', { id }),
  choose: (id) => ipcRenderer.invoke('import:choose', { id }),
  exportPack: (id) => ipcRenderer.invoke('import:export', { id }),
  autoMap: (id, kind, from) => ipcRenderer.invoke('import:automap', { id, kind, from }),
  check: (id, draft) => ipcRenderer.invoke('import:check', { id, draft }),
  preview: (id) => ipcRenderer.invoke('import:preview', { id }),
  onGoto: (fn) => ipcRenderer.on('import:goto', (_e, hash) => fn(hash)),
});
