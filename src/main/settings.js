'use strict';
// Tiny JSON settings store in Electron's userData folder. No dependencies.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  muted: false,     // Askin's animalese voice
  sfx: true,        // sound effects
  sfxVolume: 0.5,   // 0-1
  paused: false,
  deskMode: true,   // sit at the desk while the user writes or does labs
  slackNudges: true, // a rare comment after a long stretch of games or videos
  deskApps: null,   // override { writing: [...process names], lab: [...] }
  deskTitles: null, // override { writing: [...title keywords], lab: [...] }
  skin: '',         // '' = Kori; otherwise a folder name under skins/
  ultimateSeconds: 30, // how long the ultimate form lasts after a donation (a skin can override)
  autostart: false,
  // Plan-limit guard
  maxUtilization: 80,          // percent of the binding plan window the jar may use
  calibrationRunTokens: 20000, // max run/donation before the guard has learned tokens-per-percent
  autoBuild: false,            // start a run automatically once a goal is funded
  allowUsageEndpointFallback: false, // opt-in: read /usage numbers from the undocumented oauth endpoint
  upgradeModel: 'haiku',
  upgradeEffort: 'medium',
  maxTurns: 30,
};

class Settings {
  constructor(userDataDir) {
    this.file = path.join(userDataDir, 'settings.json');
    this.data = { ...DEFAULTS };
    try {
      if (fs.existsSync(this.file)) {
        // Strip a UTF-8 byte-order mark (Notepad and Windows PowerShell add one).
        const text = fs.readFileSync(this.file, 'utf8').replace(/^﻿/, '');
        this.data = { ...DEFAULTS, ...JSON.parse(text) };
      }
    } catch (e) {
      console.error('settings: failed to read, using defaults', e);
    }
  }
  get(key) { return this.data[key]; }
  all() { return { ...this.data }; }
  set(key, value) {
    this.data[key] = value;
    this.save();
    return this.data[key];
  }
  update(patch) {
    Object.assign(this.data, patch);
    this.save();
    return this.all();
  }
  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error('settings: failed to save', e);
    }
  }
}

module.exports = { Settings, DEFAULTS };
