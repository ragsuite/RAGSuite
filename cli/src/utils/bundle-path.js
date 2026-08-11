'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Resolve an EE vendor tar path for --bundle.
 *
 * Customers often keep the emailed tar in Downloads / home / the install root,
 * while the README "install paths" table describes where activate/update *write*
 * the key and extracted modules — not where the .tar.gz must live beforehand.
 */
function resolveBundlePath(raw, repoRoot) {
  const input = String(raw || '').trim();
  if (!input) return { path: null, tried: [] };

  const base = path.basename(input);
  const home = os.homedir();
  const candidates = [];

  function add(p) {
    if (!p) return;
    const abs = path.resolve(p);
    if (!candidates.includes(abs)) candidates.push(abs);
  }

  // As given (cwd-relative or absolute)
  add(input);
  // Install root (default ~/ragsuite) — common when docs say "under your install folder"
  if (repoRoot) {
    add(path.join(repoRoot, base));
    add(path.join(repoRoot, input));
  }
  // Home / Downloads / Desktop (typical download locations)
  add(path.join(home, base));
  add(path.join(home, 'Downloads', base));
  add(path.join(home, 'Desktop', base));

  const tried = [];
  for (const abs of candidates) {
    tried.push(abs);
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        return { path: abs, tried };
      }
    } catch {
      /* next */
    }
  }
  return { path: null, tried };
}

function bundleNotFoundMessage(raw, tried, repoRoot) {
  const base = path.basename(String(raw || '').trim() || 'ragsuite-ee-<ver>.encbundle');
  const lines = [
    `Bundle not found: ${raw}`,
    '',
    'Pass the path to the emailed .encbundle (or legacy .tar.gz) — not an extracted modules folder.',
    'Tried:',
    ...tried.map((p) => `  - ${p}`),
    '',
    'Put the vendor files in your install folder, then run e.g.:',
    `  ragsuite activate --key ./offline.key --bundle ./${base} --restart`,
    `  ragsuite update --bundle ./${base} --restart`,
    '',
    'Customer paste paths:',
    '  <install>/.ragsuite/license/offline.key',
    '  <install>/ragsuite-ee-<ver>.encbundle',
    '  <install>/manifest.enc.json',
    'Do not unpack the .encbundle — activate/update decrypts and installs for you.',
  ];
  return lines.join('\n');
}

module.exports = {
  resolveBundlePath,
  bundleNotFoundMessage,
};
