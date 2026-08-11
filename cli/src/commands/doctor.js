'use strict';

const fs = require('fs');
const path = require('path');
const { resolveMode } = require('../utils/config');
const { resolveRepoRoot, assertNativeDeploy } = require('../utils/paths');
const { resolveLicenseKeyPath } = require('../utils/license-paths');
const { runPythonModule } = require('../utils/python');
const { runScript } = require('../utils/spawn');
const { error, info } = require('../utils/log');

const name = 'doctor';
const summary = 'Check prerequisites, license, and extensions';

function help() {
  return `Usage: ragsuite doctor [options]

Runs scripts/doctor.sh with RAGSUITE_MODE from init (or --mode / --docker).
Also reports offline license verify, ACTIVE EE bundle, and version compatibility
(platform ↔ ACTIVE platform_compat ↔ license schema). Exits non-zero when ACTIVE
bundle is incompatible with Platform or the offline key schema is unsupported.

CE needs no license. See docs/architecture/MIGRATION-GUIDE.md.

Options:
  --mode <native|docker>
  --docker
  --repo-root <path>
  --dry-run
`;
}

function flagMode(g) {
  if (g.docker || g.mode === 'docker') return 'docker';
  if (g.mode === 'native') return 'native';
  return null;
}

function run(ctx) {
  const repoRoot = resolveRepoRoot({
    cwd: ctx.cwd,
    repoRootFlag: ctx.globals.repoRoot,
  });
  try {
    assertNativeDeploy(repoRoot);
  } catch (err) {
    error(err.message);
    return 1;
  }

  const mode = resolveMode({
    flagMode: flagMode(ctx.globals),
    repoRoot,
    env: ctx.env,
  });

  const licPath = resolveLicenseKeyPath(repoRoot, ctx.env);
  if (ctx.globals.dryRun) {
    info(`[dry-run] license probe ${licPath}`);
  } else {
    const result = runPythonModule(repoRoot, 'app.platform.license_cli', ['status'], {
      env: ctx.env,
      inherit: false,
    });
    if (result.stdout) {
      try {
        const j = JSON.parse(result.stdout);
        info(`license: ${j.state} (${j.path || licPath})`);
        if (j.claims && j.claims.entitlements) {
          info(`  entitlements: ${j.claims.entitlements.join(', ')}`);
        }
        if (j.detail) info(`  detail: ${j.detail}`);
      } catch {
        info(result.stdout.trimEnd());
      }
    } else {
      info(`license: (probe failed) ${licPath}`);
    }
  }

  const activePath = path.join(repoRoot, 'extensions', 'installed', 'ee', 'ACTIVE');
  const active = fs.existsSync(activePath) ? fs.readFileSync(activePath, 'utf8').trim() : '';
  info(`EE ACTIVE: ${active || '(none)'}`);

  let compatFail = false;
  if (ctx.globals.dryRun) {
    info('[dry-run] compat report (platform / ACTIVE / license schema)');
  } else {
    const compat = runPythonModule(repoRoot, 'app.platform.compat_cli', ['report'], {
      env: ctx.env,
      inherit: false,
    });
    if (compat.stdout) {
      try {
        const j = JSON.parse(compat.stdout);
        info(`compat: platform=${j.platform_version} ok=${j.ok}`);
        for (const c of j.checks || []) {
          const tag = c.ok ? 'ok' : 'FAIL';
          info(`  [${tag}] ${c.name}: ${c.detail}`);
        }
        if (j.doctor_fail || compat.status !== 0) compatFail = true;
      } catch {
        info(compat.stdout.trimEnd());
        if (compat.status !== 0) compatFail = true;
      }
    } else if (compat.status !== 0) {
      // In lightweight CI smoke envs Python deps may be absent; only hard-fail
      // when an ACTIVE EE bundle exists and compatibility truly matters.
      if (active) {
        compatFail = true;
      }
      error('compat: probe failed');
    }
  }

  if (!ctx.globals.dryRun) {
    const inv = runPythonModule(repoRoot, 'app.platform.extension_inventory', [], {
      env: ctx.env,
      inherit: false,
    });
    if (inv.status === 0) {
      try {
        const payload = JSON.parse(inv.stdout);
        const rows = payload.extensions || [];
        const ee = rows.filter((r) => r.source === 'installed-ee' || r.edition === 'enterprise');
        info(`extensions discovered: ${rows.length} (enterprise/installed-ee: ${ee.length})`);
      } catch {
        /* ignore */
      }
    }
  }

  const scriptStatus = runScript(repoRoot, path.join('scripts', 'doctor.sh'), [], {
    dryRun: ctx.globals.dryRun,
    env: { ...ctx.env, RAGSUITE_MODE: mode },
  });
  if (compatFail) {
    error('doctor: incompatible platform / ACTIVE bundle / license schema');
    return 1;
  }
  return scriptStatus;
}

module.exports = { name, summary, help, run };
