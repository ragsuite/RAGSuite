'use strict';

const path = require('path');
const { info } = require('../utils/log');
const { PACKAGE_NAME } = require('../utils/cli-self-update');

const name = 'version';
const summary = 'Print CLI package version';

function help() {
  return `Usage: ragsuite version

Print ${PACKAGE_NAME} version from package.json.

Upgrade:
  npm install -g ${PACKAGE_NAME}@latest
  # or: ragsuite update
`;
}

function run() {
  const pkgPath = path.join(__dirname, '..', '..', 'package.json');
  const pkg = require(pkgPath);
  info(`${pkg.name}@${pkg.version}`);
  info(`Upgrade: npm install -g ${PACKAGE_NAME}@latest`);
  return 0;
}

module.exports = { name, summary, help, run };
