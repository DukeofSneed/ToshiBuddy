'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('custom', {
  state: () => ipcRenderer.invoke('custom:state'),
  theme: () => ipcRenderer.invoke('app:theme'),
  setName: (name) => ipcRenderer.invoke('custom:set-name', { name }),
  add: (text, tags) => ipcRenderer.invoke('custom:add', { text, tags }),
  update: (key, text, tags) => ipcRenderer.invoke('custom:update', { key, text, tags }),
  remove: (key) => ipcRenderer.invoke('custom:remove', { key }),
  restore: (key) => ipcRenderer.invoke('custom:restore', { key }),
  say: (text) => ipcRenderer.send('custom:say', { text }),
  onChanged: (handler) => ipcRenderer.on('custom:changed', (_e, s) => handler(s)),
});
