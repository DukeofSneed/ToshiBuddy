'use strict';
// Window factories: the full-work-area transparent overlay the pet lives in,
// and the small focusable jar panel window.
const { BrowserWindow, screen } = require('electron');
const path = require('path');

const RENDERER = path.join(__dirname, '..', 'renderer');
const ICON = path.join(__dirname, '..', '..', 'assets', 'icon.png');

function createOverlay() {
  const { workArea } = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    icon: ICON,
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload-overlay.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setMenu(null);
  // Click-through by default; the renderer toggles this while the cursor is over the pet.
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(RENDERER, 'index.html'));
  win.once('ready-to-show', () => win.showInactive());

  // Keep the overlay matched to the work area if the taskbar or resolution changes.
  const refit = () => {
    if (win.isDestroyed()) return;
    const wa = screen.getPrimaryDisplay().workArea;
    win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });
    win.webContents.send('work-area', wa);
  };
  screen.on('display-metrics-changed', refit);
  screen.on('display-added', refit);
  screen.on('display-removed', refit);
  return win;
}

function createJarWindow(parent) {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 440;
  const height = 640;
  const win = new BrowserWindow({
    icon: ICON,
    width,
    height,
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + workArea.height - height - 24,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload-jar.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setMenu(null);
  win.loadFile(path.join(RENDERER, 'jar.html'));
  win.on('close', (e) => {
    // Hide instead of destroying so state and scroll survive.
    if (!win.__reallyClose) {
      e.preventDefault();
      win.hide();
    }
  });
  return win;
}

// A normal window for renaming the character and editing quips.
function createCustomizeWindow() {
  const win = new BrowserWindow({
    icon: ICON,
    width: 620,
    height: 720,
    minWidth: 460,
    minHeight: 420,
    title: 'Name and quips',
    backgroundColor: '#13203a',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-customize.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(RENDERER, 'customize.html'));
  win.once('ready-to-show', () => win.show());
  return win;
}

// Import a character / map its animations.
function createImportWindow(hash) {
  const win = new BrowserWindow({
    icon: ICON,
    width: 760,
    height: 820,
    minWidth: 560,
    minHeight: 480,
    title: 'Characters',
    backgroundColor: '#13203a',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-import.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(RENDERER, 'import.html'), hash ? { hash } : undefined);
  win.once('ready-to-show', () => win.show());
  return win;
}

module.exports = { createOverlay, createJarWindow, createCustomizeWindow, createImportWindow };
