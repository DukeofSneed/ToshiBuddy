'use strict';
// The tray icon: the snowflake from assets/icon.png (built by scripts/make-icon.js).
const path = require('path');
const { nativeImage } = require('electron');

const ICON_FILE = path.join(__dirname, '..', '..', 'assets', 'icon.png');

function trayIcon() {
  const img = nativeImage.createFromPath(ICON_FILE);
  return img.isEmpty() ? img : img.resize({ width: 32, height: 32, quality: 'best' });
}

module.exports = { trayIcon, ICON_FILE };
