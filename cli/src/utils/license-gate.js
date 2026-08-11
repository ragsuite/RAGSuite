'use strict';

const { runPythonModule } = require('./python');
const { licenseKeyExists } = require('./license-paths');

/**
 * Local offline key gate for Enterprise bundle install.
 * Does not contact License Server — Ed25519 verify only.
 *
 * @returns {{
 *   allowed: boolean,
 *   state: string,
 *   payload: object|null,
 *   message: string|null,
 * }}
 */
function assessEeLicense(repoRoot, env = process.env) {
  if (!licenseKeyExists(repoRoot, env)) {
    return {
      allowed: false,
      state: 'absent',
      payload: null,
      message:
        'No offline.key installed. Enterprise requires a prior activate.\n' +
        '\n' +
        '  First time:\n' +
        '    ragsuite activate --key <install>/.ragsuite/license/offline.key --bundle <install>/ragsuite-ee-<ver>.encbundle --restart\n' +
        '\n' +
        '  Later EE code (key already installed):\n' +
        '    ragsuite update --bundle <install>/ragsuite-ee-<ver>.encbundle --restart\n' +
        '\n' +
        '  Renew expired key:\n' +
        '    ragsuite update --key <install>/.ragsuite/license/offline.key --restart',
    };
  }

  const result = runPythonModule(repoRoot, 'app.platform.license_cli', ['status'], {
    env,
    inherit: false,
  });

  let payload = null;
  try {
    payload = JSON.parse(result.stdout || '{}');
  } catch {
    payload = null;
  }

  const state = (payload && payload.state) || (result.status === 2 ? 'invalid' : 'unknown');

  if (state === 'valid' || state === 'grace') {
    return { allowed: true, state, payload, message: null };
  }

  if (state === 'expired') {
    return {
      allowed: false,
      state,
      payload,
      message:
        'Your Enterprise license key has expired.\n' +
        '\n' +
        '  Enterprise modules were NOT installed or updated.\n' +
        '  Your Community app, database, and .env are unchanged.\n' +
        '\n' +
        '  Contact your vendor for a renewed offline.key, then run:\n' +
        '    ragsuite update --key <install>/.ragsuite/license/offline.key --restart',
    };
  }

  if (state === 'invalid' || result.status === 2) {
    const detail = (payload && payload.detail) || result.stderr || result.stdout || 'invalid signature or claims';
    return {
      allowed: false,
      state: 'invalid',
      payload,
      message:
        `Offline key is invalid — ${String(detail).trim()}\n` +
        '  Do not hand-edit valid_to / claims; only a vendor-signed key works.',
    };
  }

  if (state === 'absent') {
    return {
      allowed: false,
      state,
      payload,
      message: 'Offline key absent. Install a vendor-signed offline.key before Enterprise bundle ops.',
    };
  }

  return {
    allowed: false,
    state: state || 'unknown',
    payload,
    message: `Cannot verify offline key (state=${state}). Enterprise bundle install refused.`,
  };
}

/**
 * @returns {0|1} exit code: 0 allowed, 1 refused (message already printed via errorFn)
 */
function requireValidLicenseForEe(repoRoot, env, { error: errorFn, info: infoFn } = {}) {
  const assessment = assessEeLicense(repoRoot, env);
  if (assessment.allowed) {
    if (infoFn) {
      infoFn(`license state=${assessment.state} — EE install allowed`);
      if (assessment.payload && assessment.payload.claims && assessment.payload.claims.seats != null) {
        infoFn(`  seats=${assessment.payload.claims.seats}`);
      }
    }
    return 0;
  }
  if (errorFn) errorFn(assessment.message || 'EE install refused');
  return 1;
}

module.exports = {
  assessEeLicense,
  requireValidLicenseForEe,
};
