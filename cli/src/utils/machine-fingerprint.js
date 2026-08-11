'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Stable machine fingerprint for License Server activation (no PII beyond hostname hash).
 */
function machineFingerprint(env = process.env) {
  const override = env.RAGSUITE_MACHINE_FINGERPRINT && String(env.RAGSUITE_MACHINE_FINGERPRINT).trim();
  if (override) return override;
  const raw = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.homedir(),
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function activationMetaPath(repoRoot) {
  return path.join(repoRoot, '.ragsuite', 'license', 'activation.json');
}

function readActivationMeta(repoRoot) {
  const p = activationMetaPath(repoRoot);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeActivationMeta(repoRoot, meta) {
  const p = activationMetaPath(repoRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return p;
}

function clearActivationMeta(repoRoot) {
  const p = activationMetaPath(repoRoot);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    return true;
  }
  return false;
}

module.exports = {
  machineFingerprint,
  activationMetaPath,
  readActivationMeta,
  writeActivationMeta,
  clearActivationMeta,
};
