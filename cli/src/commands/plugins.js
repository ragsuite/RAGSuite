'use strict';

/**
 * plugins — ADR-008 alias for marketplace-style Extensions (same discovery model).
 */
const extensions = require('./extensions');

const name = 'plugins';
const summary = 'Alias for extensions (marketplace-style Extension list)';

function help() {
  return `Usage: ragsuite plugins [options]

Alias of \`extensions\` — Platform uses one Extension model (ADR-003 / ADR-008).

${extensions.help()}`;
}

function run(ctx) {
  return extensions.run(ctx);
}

module.exports = { name, summary, help, run };
