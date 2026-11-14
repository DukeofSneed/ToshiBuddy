'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jar', {
  state: () => ipcRenderer.invoke('jar:state'),
  theme: () => ipcRenderer.invoke('app:theme'),
  donate: (tokens, goalId) => ipcRenderer.invoke('jar:donate', { tokens, goalId }),
  suggest: (text) => ipcRenderer.invoke('jar:suggest', { text }),
  ideas: () => ipcRenderer.invoke('jar:ideas'),
  pin: (goalId, pinned) => ipcRenderer.invoke('jar:pin', { goalId, pinned }),
  attachPending: (args) => ipcRenderer.invoke('jar:attach-pending', args || {}),
  attach: (args) => ipcRenderer.invoke('jar:attach', args || {}),
  fund: (goalId, tokens) => ipcRenderer.invoke('jar:fund', { goalId, tokens }),
  build: (goalId) => ipcRenderer.invoke('jar:build', { goalId }),
  resume: (goalId) => ipcRenderer.invoke('jar:resume', { goalId }),
  cancelRun: () => ipcRenderer.invoke('jar:cancel-run'),
  undo: (upgradeId) => ipcRenderer.invoke('jar:undo', { upgradeId }),
  removeGoal: (goalId) => ipcRenderer.invoke('jar:remove-goal', { goalId }),
  checkUsage: () => ipcRenderer.invoke('jar:check-usage'),
  updateSettings: (patch) => ipcRenderer.invoke('jar:settings', patch),
  openExternal: (url) => ipcRenderer.send('jar:open-external', url),
  close: () => ipcRenderer.send('jar:close'),
  on: (channel, handler) => {
    const allowed = new Set(['jar:changed', 'jar:run-log']);
    if (!allowed.has(channel)) return () => {};
    const wrapped = (_e, payload) => handler(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
