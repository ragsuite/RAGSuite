'use strict';

/**
 * Alias: ragsuite ee-activate <key> [--bundle …] [--restart]
 * Same implementation as activate with emailed pack support.
 */

const activate = require('./activate');

const name = 'ee-activate';
const summary = 'Enterprise: offline.key + emailed EE encbundle (alias of activate)';

function help() {
  return `Usage: ragsuite ee-activate <key-file> [--bundle ./ragsuite-ee-<ver>.encbundle] [--restart]

Same as: ragsuite activate --key <key> [--bundle …]

Recommended:
  ragsuite ee-activate ./offline.key --bundle ./ragsuite-ee-0.1.0.encbundle --restart

Later (same key, new encbundle only):
  ragsuite update --bundle ./ragsuite-ee-0.2.0.encbundle --restart
`;
}

function run(ctx) {
  return activate.run(ctx);
}

module.exports = { name, summary, help, run };
