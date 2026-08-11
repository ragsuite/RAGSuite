'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/** User-level CLI state (not inside the app install). Like other npm CLIs. */
function globalConfigDir() {
  return path.join(os.homedir(), '.ragsuite');
}

function globalConfigPath() {
  return path.join(globalConfigDir(), 'config.json');
}

function readGlobalConfig() {
  const file = globalConfigPath();
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    return {
      installDir: raw.installDir ? path.resolve(String(raw.installDir)) : null,
      updatedAt: raw.updatedAt || null,
    };
  } catch {
    return null;
  }
}

function writeGlobalConfig(partial = {}) {
  const dir = globalConfigDir();
  fs.mkdirSync(dir, { recursive: true });
  const existing = readGlobalConfig() || {};
  const next = {
    ...existing,
    ...partial,
    updatedAt: new Date().toISOString(),
  };
  if (next.installDir) next.installDir = path.resolve(String(next.installDir));
  fs.writeFileSync(globalConfigPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

function setActiveInstall(installDir) {
  return writeGlobalConfig({ installDir: path.resolve(installDir) });
}

function getActiveInstall() {
  const g = readGlobalConfig();
  return g && g.installDir ? g.installDir : null;
}

module.exports = {
  globalConfigDir,
  globalConfigPath,
  readGlobalConfig,
  writeGlobalConfig,
  setActiveInstall,
  getActiveInstall,
};
