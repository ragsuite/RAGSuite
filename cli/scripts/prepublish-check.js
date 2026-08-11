#!/usr/bin/env node
'use strict';

/**
 * Pre-publish checklist (Phase 9). Prints PASS/FAIL; exits non-zero on failure.
 * Does not run npm publish.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI_ROOT = path.resolve(__dirname, '..');
const ROOT_PKG = path.resolve(CLI_ROOT, '..', 'package.json');

let failed = 0;

function check(label, cond, detail = '') {
  if (cond) {
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function scanForLocalPaths(dir, relBase) {
  const hits = [];
  const skip = new Set(['node_modules', '.git', 'ragsuite-ragsuite']);
  function walk(d, rel) {
    for (const name of fs.readdirSync(d)) {
      if (skip.has(name) || name.endsWith('.tgz')) continue;
      const full = path.join(d, name);
      const r = rel ? `${rel}/${name}` : name;
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        walk(full, r);
        continue;
      }
      if (!/\.(js|md|json)$/i.test(name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      if (/\/Users\/[^\s"'`]+/.test(text) || /C:\\Users\\/i.test(text)) {
        hits.push(r);
      }
    }
  }
  walk(dir, relBase);
  return hits;
}

function main() {
  console.log('==> RAGSuite Platform Manager CLI prepublish checklist\n');

  const pkg = JSON.parse(fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'));
  const rootPkg = JSON.parse(fs.readFileSync(ROOT_PKG, 'utf8'));

  check(
    'version semver (not 0.0.0)',
    /^\d+\.\d+\.\d+$/.test(pkg.version) && pkg.version !== '0.0.0',
    pkg.version,
  );
  check('name @ragsuite/ragsuite', pkg.name === '@ragsuite/ragsuite', pkg.name);
  check('CLI private === false', pkg.private === false, String(pkg.private));
  check('root monorepo private === true', rootPkg.private === true, String(rootPkg.private));
  check(
    'bin.ragsuite',
    Boolean(pkg.bin && pkg.bin.ragsuite === 'bin/ragsuite.js' && !pkg.bin['ragsuite-test']),
    JSON.stringify(pkg.bin),
  );
  check('files allowlist', Array.isArray(pkg.files) && pkg.files.includes('bin/'), JSON.stringify(pkg.files));
  check('license Apache-2.0', pkg.license === 'Apache-2.0', pkg.license);
  const licenseText = fs.existsSync(path.join(CLI_ROOT, 'LICENSE'))
    ? fs.readFileSync(path.join(CLI_ROOT, 'LICENSE'), 'utf8')
    : '';
  check(
    'LICENSE is Apache License 2.0',
    licenseText.includes('Apache License') && licenseText.includes('Version 2.0, January 2004'),
  );
  check('NOTICE present', fs.existsSync(path.join(CLI_ROOT, 'NOTICE')));
  check('engines.node >=18', Boolean(pkg.engines && pkg.engines.node), pkg.engines && pkg.engines.node);
  check('publishConfig.access public', pkg.publishConfig && pkg.publishConfig.access === 'public');

  const dist = require(path.join(CLI_ROOT, 'src', 'utils', 'distribution.js'));
  check(
    "distribution.mode === 'git-clone'",
    dist.mode === 'git-clone',
    dist.mode,
  );

  const scanRoots = [
    path.join(CLI_ROOT, 'src'),
    path.join(CLI_ROOT, 'bin'),
    path.join(CLI_ROOT, 'README.md'),
    path.join(CLI_ROOT, 'PUBLISH.md'),
  ];
  const hits = [];
  for (const p of scanRoots) {
    if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isDirectory()) {
      hits.push(...scanForLocalPaths(p, path.relative(CLI_ROOT, p)));
    } else {
      const text = fs.readFileSync(p, 'utf8');
      if (/\/Users\/[^\s"'`]+/.test(text) || /C:\\Users\\/i.test(text)) {
        hits.push(path.relative(CLI_ROOT, p));
      }
    }
  }
  check('no machine-local paths in cli src/bin/docs', hits.length === 0, hits.join(', ') || 'clean');

  const pack = spawnSync('npm', ['pack'], {
    cwd: CLI_ROOT,
    encoding: 'utf8',
  });
  check('npm pack', pack.status === 0, pack.status === 0 ? 'ok' : pack.stderr || pack.stdout);

  let tgz = null;
  if (pack.status === 0) {
    const out = String(pack.stdout || '')
      .trim()
      .split('\n')
      .filter(Boolean);
    tgz = out[out.length - 1];
    if (tgz && !path.isAbsolute(tgz)) tgz = path.join(CLI_ROOT, tgz);
  }

  if (tgz && fs.existsSync(tgz)) {
    const assert = spawnSync(process.execPath, [path.join(CLI_ROOT, 'test', 'pack-assert.js'), tgz], {
      cwd: CLI_ROOT,
      encoding: 'utf8',
    });
    check('pack-assert', assert.status === 0, assert.status === 0 ? 'ok' : assert.stderr || assert.stdout);
    try {
      fs.unlinkSync(tgz);
    } catch {
      /* ignore */
    }
  } else {
    check('pack-assert', false, 'no tarball');
  }

  console.log('');
  if (failed) {
    console.log(`Checklist: ${failed} FAIL(s). Do not publish.`);
    process.exit(1);
  }
  console.log('Checklist: all PASS.');
  console.log('Future publish (do not run unless approved):');
  console.log('  cd cli && RAGSUITE_TEST_ALLOW_PUBLISH=1 npm publish --access public');
  process.exit(0);
}

main();
