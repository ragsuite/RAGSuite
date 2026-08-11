'use strict';

const path = require('path');
const { captureCommand } = require('./spawn');
const { info, warn, error } = require('./log');

const PACKAGE_NAME = '@ragsuite/ragsuite';

function localCliVersion() {
  try {
    const pkg = require(path.join(__dirname, '..', '..', 'package.json'));
    return String(pkg.version || '');
  } catch {
    return '';
  }
}

/**
 * Upgrade the global CLI binary (npm install -g).
 * Safe for end users; does not touch app data or Docker volumes.
 * @returns {{ status: number, versionBefore: string, versionAfter: string|null }}
 */
function upgradeGlobalCli({ dryRun = false, env = process.env } = {}) {
  const versionBefore = localCliVersion();
  info(`Updating CLI package: npm install -g ${PACKAGE_NAME}@latest`);
  info('  (must use -g so the ragsuite command stays on your PATH)');

  if (dryRun) {
    info(`[dry-run] would run: npm install -g ${PACKAGE_NAME}@latest`);
    return { status: 0, versionBefore, versionAfter: versionBefore };
  }

  const result = captureCommand(
    'npm',
    ['install', '-g', `${PACKAGE_NAME}@latest`],
    { env },
  );
  if (result.status !== 0) {
    error(`CLI update failed (exit ${result.status}).`);
    if (result.stderr) error(String(result.stderr).trimEnd());
    if (result.stdout) warn(String(result.stdout).trimEnd());
    error(`Fix: npm install -g ${PACKAGE_NAME}@latest`);
    return { status: result.status || 1, versionBefore, versionAfter: null };
  }
  if (result.stdout) info(String(result.stdout).trimEnd());

  // Re-read from the newly installed global package when possible
  let versionAfter = null;
  const which = captureCommand('npm', ['root', '-g'], { env });
  if (which.status === 0 && which.stdout) {
    const root = String(which.stdout).trim();
    try {
      const pkg = require(path.join(root, PACKAGE_NAME, 'package.json'));
      versionAfter = String(pkg.version || '');
    } catch {
      versionAfter = null;
    }
  }

  if (versionAfter) {
    info(`CLI is now ${PACKAGE_NAME}@${versionAfter}`);
  } else {
    info(`CLI update finished. Check: ragsuite version`);
  }
  return { status: 0, versionBefore, versionAfter };
}

module.exports = {
  PACKAGE_NAME,
  localCliVersion,
  upgradeGlobalCli,
};
