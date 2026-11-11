'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('askin', {
  setIgnoreMouse: (ignore) => ipcRenderer.send('overlay:set-ignore', !!ignore),
  popupMenu: (x, y) => ipcRenderer.send('overlay:popup-menu', { x, y }),
  openJar: () => ipcRenderer.send('jar:open'),
  getBootstrap: () => ipcRenderer.invoke('overlay:bootstrap'),
  getContent: () => ipcRenderer.invoke('overlay:content'),
  reportMod: (status) => ipcRenderer.send('overlay:mod-status', status),
  log: (...args) => ipcRenderer.send('overlay:log', args.map(String).join(' ')),
  on: (channel, handler) => {
    const allowed = new Set(['work-area', 'idle-seconds', 'say', 'animate', 'settings', 'reload-content', 'upgrade-event', 'sfx']);
    if (!allowed.has(channel)) return () => {};
    const wrapped = (_e, payload) => handler(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
