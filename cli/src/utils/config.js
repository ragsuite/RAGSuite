'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_VERSION = 1;
const CONFIG_DIR = '.ragsuite-cli';

function configPath(repoRoot) {
  return path.join(repoRoot, CONFIG_DIR, 'config.json');
}

function normalizeMode(raw) {
  return String(raw || '').trim().toLowerCase() === 'docker' ? 'docker' : 'native';
}

function defaultConfig(repoRoot, mode = 'native') {
  const root = path.resolve(repoRoot);
  return {
    version: CONFIG_VERSION,
    mode: normalizeMode(mode),
    source: 'checkout',
    repoRoot: root,
    installDir: root,
  };
}

function normalizeSource(raw) {
  const s = String(raw || '').trim();
  if (s === 'git' || s === 'checkout' || s === 'zip') return s === 'zip' ? 'checkout' : s;
  if (s === 'images') return 'images';
  return 'checkout';
}

function readConfig(repoRoot) {
  const file = configPath(repoRoot);
  if (!fs.existsSync(file)) {
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    return {
      version: Number(raw.version) || CONFIG_VERSION,
      mode: normalizeMode(raw.mode),
      source: normalizeSource(raw.source),
      repoRoot: path.resolve(String(raw.repoRoot || repoRoot)),
      installDir: path.resolve(String(raw.installDir || raw.repoRoot || repoRoot)),
    };
  } catch {
    return null;
  }
}

function writeConfig(repoRoot, partial = {}) {
  const dir = path.join(repoRoot, CONFIG_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const existing = readConfig(repoRoot) || defaultConfig(repoRoot);
  const source = normalizeSource(
    partial.source !== undefined && partial.source !== null
      ? partial.source
      : existing.source || 'checkout',
  );
  const next = {
    ...existing,
    ...partial,
    version: CONFIG_VERSION,
    source: source === 'images' ? 'git' : source,
    repoRoot: path.resolve(partial.repoRoot || existing.repoRoot || repoRoot),
    installDir: path.resolve(
      partial.installDir || existing.installDir || partial.repoRoot || existing.repoRoot || repoRoot,
    ),
    mode: normalizeMode(
      partial.mode !== undefined && partial.mode !== null ? partial.mode : existing.mode,
    ),
  };
  fs.writeFileSync(configPath(repoRoot), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

/**
 * Resolve runtime mode: CLI --docker / --mode > config > RAGSUITE_MODE > native.
 */
function resolveMode({ flagMode, repoRoot, env = process.env } = {}) {
  if (flagMode === 'docker' || flagMode === 'native') {
    return flagMode;
  }
  if (repoRoot) {
    const cfg = readConfig(repoRoot);
    if (cfg && (cfg.mode === 'docker' || cfg.mode === 'native')) {
      return cfg.mode;
    }
  }
  const fromEnv = String(env.RAGSUITE_MODE || '')
    .trim()
    .toLowerCase();
  if (fromEnv === 'docker' || fromEnv === 'native') {
    return fromEnv;
  }
  return 'native';
}

module.exports = {
  CONFIG_VERSION,
  CONFIG_DIR,
  configPath,
  defaultConfig,
  readConfig,
  writeConfig,
  resolveMode,
  normalizeMode,
};
