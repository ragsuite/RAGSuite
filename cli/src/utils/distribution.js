'use strict';

/**
 * Distribution for the testing CLI.
 * Deploy: git clone + native (default) or docker compose (--docker).
 */

const MODE_LOCAL = 'local-checkout';
const MODE_GIT = 'git-clone';

function assertSupportedInstall() {}

function resolveComposeBundle() {
  const err = new Error('Use: ragsuite init  or  ragsuite init --docker');
  err.code = 'DIST_NOT_READY';
  throw err;
}

function installHint() {
  return [
    'Day-to-day:',
    '  ragsuite start',
    '  ragsuite logs api',
    '  ragsuite logs frontend',
    '  ragsuite update',
    '  ragsuite stop',
  ].join('\n');
}

module.exports = {
  MODE_LOCAL,
  MODE_GIT,
  mode: MODE_GIT,
  assertSupportedInstall,
  resolveComposeBundle,
  installHint,
};
