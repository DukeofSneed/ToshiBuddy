'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buddy', {
  setIgnoreMouse: (ignore) => ipcRenderer.send('overlay:set-ignore', !!ignore),
  popupMenu: (x, y) => ipcRenderer.send('overlay:popup-menu', { x, y }),
  openJar: () => ipcRenderer.send('jar:open'),
  quickDonate: () => ipcRenderer.invoke('jar:quick-donate'),
  getBootstrap: () => ipcRenderer.invoke('overlay:bootstrap'),
  getContent: () => ipcRenderer.invoke('overlay:content'),
  reportMod: (status) => ipcRenderer.send('overlay:mod-status', status),
  saveSheetIndex: (skin, kind, dataUrl, rows) => ipcRenderer.send('overlay:sheet-index', { skin, kind, dataUrl, rows }),
  log: (...args) => ipcRenderer.send('overlay:log', args.map(String).join(' ')),
  on: (channel, handler) => {
    const allowed = new Set(['work-area', 'idle-seconds', 'say', 'animate', 'settings', 'reload-content', 'upgrade-event', 'sfx', 'activity', 'quips', 'quip', 'jar-state', 'toast']);
    if (!allowed.has(channel)) return () => {};
    const wrapped = (_e, payload) => handler(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
