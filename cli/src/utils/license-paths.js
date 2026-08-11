'use strict';

const fs = require('fs');
const path = require('path');

/**
 * On-disk offline license contract:
 *   <install>/.ragsuite/license/offline.key
 * Override: RAGSUITE_LICENSE_FILE
 *
 * Customer must not casually overwrite/replace an installed key.
 * Same-key re-activate is allowed; different key requires --force.
 */

function licenseDir(repoRoot) {
  return path.join(repoRoot, '.ragsuite', 'license');
}

function defaultLicenseKeyPath(repoRoot) {
  return path.join(licenseDir(repoRoot), 'offline.key');
}

function resolveLicenseKeyPath(repoRoot, env = process.env) {
  const override = env.RAGSUITE_LICENSE_FILE && String(env.RAGSUITE_LICENSE_FILE).trim();
  if (override) return path.resolve(override);
  return defaultLicenseKeyPath(repoRoot);
}

function licenseKeyExists(repoRoot, env = process.env) {
  const p = resolveLicenseKeyPath(repoRoot, env);
  return fs.existsSync(p) && fs.statSync(p).isFile();
}

function readLicenseKey(repoRoot, env = process.env) {
  const p = resolveLicenseKeyPath(repoRoot, env);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8').trim();
}

function _hardenKeyFile(dest) {
  try {
    if (process.platform !== 'win32') {
      fs.chmodSync(dest, 0o600);
      fs.chmodSync(path.dirname(dest), 0o700);
    }
  } catch {
    /* best-effort */
  }
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.force] Replace an existing different key (vendor renew / support only)
 * @returns {{ path: string, written: boolean, unchanged: boolean }}
 */
function writeLicenseKey(repoRoot, blob, env = process.env, opts = {}) {
  const force = Boolean(opts.force);
  const text = String(blob || '').trim();
  if (!text) {
    const err = new Error('License key blob is empty');
    err.code = 'USAGE';
    throw err;
  }
  const override = env.RAGSUITE_LICENSE_FILE && String(env.RAGSUITE_LICENSE_FILE).trim();
  const dest = override ? path.resolve(override) : defaultLicenseKeyPath(repoRoot);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (fs.existsSync(dest)) {
    const existing = fs.readFileSync(dest, 'utf8').trim();
    if (existing === text) {
      _hardenKeyFile(dest);
      return { path: dest, written: false, unchanged: true };
    }
    if (!force) {
      const err = new Error(
        'A license key is already installed. Refusing to overwrite.\n' +
          '  Use the installed key (omit a new --key), or ask your vendor for renewal guidance.\n' +
          '  Support/vendor only: pass --force to replace the key.',
      );
      err.code = 'LICENSE_EXISTS';
      throw err;
    }
  }

  fs.writeFileSync(dest, `${text}\n`, 'utf8');
  _hardenKeyFile(dest);
  return { path: dest, written: true, unchanged: false };
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.force] Required to delete an installed key
 */
function clearLicenseKey(repoRoot, env = process.env, opts = {}) {
  const force = Boolean(opts.force);
  const p = resolveLicenseKeyPath(repoRoot, env);
  if (!fs.existsSync(p)) return false;
  if (!force) {
    const err = new Error(
      'Refusing to remove installed license key without --force (protects Enterprise install).',
    );
    err.code = 'LICENSE_PROTECTED';
    throw err;
  }
  fs.unlinkSync(p);
  return true;
}

module.exports = {
  licenseDir,
  defaultLicenseKeyPath,
  resolveLicenseKeyPath,
  licenseKeyExists,
  readLicenseKey,
  writeLicenseKey,
  clearLicenseKey,
};
