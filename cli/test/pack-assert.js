'use strict';

/**
 * Assert an npm-pack tarball only contains the CLI surface (no monorepo secrets/data).
 *
 * Usage: node test/pack-assert.js [path-to.tgz]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI_ROOT = path.resolve(__dirname, '..');

const REQUIRED_SUBSTR = [
  'bin/ragsuite.js',
  'src/index.js',
  'package.json',
  'LICENSE',
  'NOTICE',
  'README.md',
];

const FORBIDDEN_PATTERNS = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.local$/,
  /(^|\/)backend\//,
  /(^|\/)frontend\//,
  /(^|\/)node_modules\//,
  /\.pem$/i,
  /(^|\/)credentials/i,
  /(^|\/)data\//,
  /(^|\/)\.ragsuite\//,
  /(^|\/)\.ragsuite-cli\//,
  /(^|\/)\.ragsuite-test\//,
  /docker-compose/i,
  /(^|\/)templates\//,
];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function resolveTarball(arg) {
  if (arg) {
    const p = path.resolve(arg);
    if (!fs.existsSync(p)) fail(`tarball not found: ${p}`);
    return p;
  }
  const dirs = [process.cwd(), CLI_ROOT];
  const matches = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (/^ragsuite-ragsuite-.*\.tgz$/.test(name)) {
        matches.push(path.join(dir, name));
      }
    }
  }
  if (matches.length === 0) {
    fail('No ragsuite-ragsuite-*.tgz found. Run: cd cli && npm pack');
  }
  matches.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return matches[0];
}

function listTarball(tgz) {
  const result = spawnSync('tar', ['-tzf', tgz], { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`tar -tzf failed: ${result.stderr || result.stdout}`);
  }
  return String(result.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function main() {
  const tgz = resolveTarball(process.argv[2]);
  console.log(`==> pack-assert ${tgz}`);
  const entries = listTarball(tgz);

  for (const need of REQUIRED_SUBSTR) {
    if (!entries.some((e) => e.includes(need))) {
      fail(`missing required path containing: ${need}`);
    }
  }

  for (const entry of entries) {
    for (const re of FORBIDDEN_PATTERNS) {
      if (re.test(entry)) {
        fail(`forbidden path in tarball: ${entry}`);
      }
    }
  }

  console.log(`pack-assert: OK (${entries.length} entries)`);
}

main();
