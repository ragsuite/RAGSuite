'use strict';

const fs = require('fs');
const path = require('path');
const { resolveMode, readConfig } = require('../utils/config');
const { resolveRepoRoot } = require('../utils/paths');
const { licenseKeyExists, resolveLicenseKeyPath } = require('../utils/license-paths');
const { runPythonModule } = require('../utils/python');
const { info, error } = require('../utils/log');

const name = 'status';
const summary = 'Runtime / install status summary';

function help() {
  return `Usage: ragsuite status [options]

Show install root, mode, license presence, ACTIVE Enterprise bundle, and Extension counts.
Does not require the API. CE needs no license.

Options:
  --repo-root <path>
  --mode <native|docker>
  --docker
  --dry-run
`;
}

function flagMode(g) {
  if (g.docker || g.mode === 'docker') return 'docker';
  if (g.mode === 'native') return 'native';
  return null;
}

function readActiveBundle(repoRoot) {
  const active = path.join(repoRoot, 'extensions', 'installed', 'ee', 'ACTIVE');
  if (!fs.existsSync(active)) return null;
  return fs.readFileSync(active, 'utf8').trim() || null;
}

function run(ctx) {
  const repoRoot = resolveRepoRoot({
    cwd: ctx.cwd,
    repoRootFlag: ctx.globals.repoRoot,
  });
  const mode = resolveMode({
    flagMode: flagMode(ctx.globals),
    repoRoot,
    env: ctx.env,
  });
  const cfg = readConfig(repoRoot);
  const licPath = resolveLicenseKeyPath(repoRoot, ctx.env);
  const hasLic = licenseKeyExists(repoRoot, ctx.env);
  const active = readActiveBundle(repoRoot);

  info('RAGSuite Platform status');
  info(`  install:     ${repoRoot}`);
  info(`  mode:        ${mode}${cfg ? '' : ' (no .ragsuite-cli config)'}`);
  info(`  API:         http://localhost:9090`);
  info(`  web:         http://localhost:9191`);
  info(`  license:     ${hasLic ? `present (${licPath})` : 'absent (Community — OK)'}`);
  info(`  EE bundle:   ${active || '(none)'}`);

  if (ctx.globals.dryRun) {
    info('[dry-run] skip extension inventory');
    return 0;
  }

  const result = runPythonModule(repoRoot, 'app.platform.extension_inventory', [], {
    env: ctx.env,
    inherit: false,
  });
  if (result.status !== 0) {
    error(result.stderr || 'extension inventory failed');
    info('  extensions:  (inventory unavailable)');
    return 0; // status still useful without inventory
  }
  try {
    const payload = JSON.parse(result.stdout);
    const rows = payload.extensions || [];
    const bySource = {};
    for (const r of rows) {
      const s = r.source || 'unknown';
      bySource[s] = (bySource[s] || 0) + 1;
    }
    info(`  extensions:  ${rows.length} discovered`);
    for (const [k, v] of Object.entries(bySource).sort()) {
      info(`               ${k}: ${v}`);
    }
  } catch {
    info('  extensions:  (parse error)');
  }
  return 0;
}

module.exports = { name, summary, help, run };
