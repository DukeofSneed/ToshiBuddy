'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buddy', {
  // Where the clickable things are (page coordinates) and whether a drag is on.
  reportHitAreas: (rects, dragging) => ipcRenderer.send('overlay:hit-areas', { rects, dragging: !!dragging }),
  popupMenu: (x, y) => ipcRenderer.send('overlay:popup-menu', { x, y }),
  openJar: () => ipcRenderer.send('jar:open'),
  quickDonate: () => ipcRenderer.invoke('jar:quick-donate'),
  getBootstrap: () => ipcRenderer.invoke('overlay:bootstrap'),
  // The pet has drawn its first frame (used to swap windows without a flicker).
  ready: () => ipcRenderer.send('overlay:ready'),
  getContent: () => ipcRenderer.invoke('overlay:content'),
  reportMod: (status) => ipcRenderer.send('overlay:mod-status', status),
  saveSheetIndex: (skin, kind, dataUrl, rows) => ipcRenderer.send('overlay:sheet-index', { skin, kind, dataUrl, rows }),
  log: (...args) => ipcRenderer.send('overlay:log', args.map(String).join(' ')),
  on: (channel, handler) => {
    const allowed = new Set(['work-area', 'idle-seconds', 'say', 'animate', 'settings', 'reload-content', 'upgrade-event', 'sfx', 'activity', 'quips', 'quip', 'jar-state', 'toast', 'pointer-reset']);
    if (!allowed.has(channel)) return () => {};
    const wrapped = (_e, payload) => handler(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
