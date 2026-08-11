'use strict';

const fs = require('fs');
const path = require('path');
const { resolveRepoRoot } = require('../utils/paths');
const { runPythonModule } = require('../utils/python');
const { info, error } = require('../utils/log');
const { requireValidLicenseForEe } = require('../utils/license-gate');

const name = 'bundle';
const summary = 'Install / verify / list / use Enterprise bundles';

function help() {
  return `Usage: ragsuite bundle <subcommand> [args]

Subcommands:
  list                         Show ACTIVE + installed versions under extensions/installed/ee/
  verify <path>                Verify checksums / signature / platform_compat
  install <path>               Install .tar.gz or extracted bundle dir
                               (requires valid offline.key; vendor-signed tar)
  use <version>                Point ACTIVE at an installed version (rollback-friendly)
  rollback <version>           Alias for use

Options:
  --repo-root <path>
  --dry-run
  --skip-compat                install only: skip platform_compat check
  --allow-unsigned             install only: lab — empty/missing signature OK
`;
}

function listBundles(repoRoot) {
  const base = path.join(repoRoot, 'extensions', 'installed', 'ee');
  if (!fs.existsSync(base)) {
    info('No extensions/installed/ee/ directory');
    return 0;
  }
  const activePath = path.join(base, 'ACTIVE');
  const active = fs.existsSync(activePath) ? fs.readFileSync(activePath, 'utf8').trim() : null;
  info(`ACTIVE: ${active || '(none)'}`);
  const versions = fs
    .readdirSync(base)
    .filter((n) => n !== 'ACTIVE' && fs.statSync(path.join(base, n)).isDirectory())
    .sort();
  if (!versions.length) {
    info('Installed versions: (none)');
    return 0;
  }
  info('Installed versions:');
  for (const v of versions) {
    const man = path.join(base, v, 'manifest.json');
    let extra = '';
    if (fs.existsSync(man)) {
      try {
        const j = JSON.parse(fs.readFileSync(man, 'utf8'));
        const mods = (j.modules || []).map((m) => m.id || m).filter(Boolean);
        extra = ` modules=${mods.length}`;
      } catch {
        /* ignore */
      }
    }
    const mark = v === active ? ' *' : '';
    info(`  ${v}${mark}${extra}`);
  }
  return 0;
}

function useVersion(repoRoot, version, dryRun) {
  if (!version) {
    error('Usage: ragsuite bundle use <version>');
    return 1;
  }
  if (dryRun) {
    info(`[dry-run] would set ACTIVE → ${version}`);
    return 0;
  }
  const target = path.join(repoRoot, 'extensions', 'installed', 'ee', version);
  if (!fs.existsSync(target)) {
    error(`Installed version not found: ${version}`);
    return 1;
  }
  const active = path.join(repoRoot, 'extensions', 'installed', 'ee', 'ACTIVE');
  const markerDir = path.join(repoRoot, 'backend', 'data', 'extensions');
  const marker = path.join(markerDir, 'ee-current');
  fs.mkdirSync(path.dirname(active), { recursive: true });
  fs.writeFileSync(active, `${version}\n`, 'utf8');
  fs.mkdirSync(markerDir, { recursive: true });
  fs.writeFileSync(marker, `${version}\n`, 'utf8');
  info(`ACTIVE → ${version}`);
  info('Restart to load: ragsuite restart');
  return 0;
}

function run(ctx) {
  const args = ctx.commandArgs || [];
  const sub = args[0];
  if (!sub || sub === '--help' || sub === '-h') {
    info(help());
    return sub ? 0 : 1;
  }

  const repoRoot = resolveRepoRoot({
    cwd: ctx.cwd,
    repoRootFlag: ctx.globals.repoRoot,
  });

  if (sub === 'list') {
    return listBundles(repoRoot);
  }

  if (sub === 'use' || sub === 'rollback') {
    return useVersion(repoRoot, args[1], ctx.globals.dryRun);
  }

  if (sub === 'verify') {
    const target = args[1];
    if (!target) {
      error('Usage: ragsuite bundle verify <path>');
      return 1;
    }
    return runPythonModule(repoRoot, 'app.platform.bundle_verify', [path.resolve(target)], {
      dryRun: ctx.globals.dryRun,
      env: ctx.env,
      inherit: true,
    });
  }

  if (sub === 'install') {
    const target = args[1];
    if (!target) {
      error('Usage: ragsuite bundle install <path>');
      return 1;
    }
    const allowUnsigned =
      args.includes('--allow-unsigned') || ctx.commandArgs.includes('--allow-unsigned');
    const gated = requireValidLicenseForEe(repoRoot, ctx.env, { error, info });
    if (gated !== 0) return gated;
    const pyArgs = [path.resolve(target)];
    if (args.includes('--skip-compat') || ctx.commandArgs.includes('--skip-compat')) {
      pyArgs.push('--skip-compat');
    }
    if (allowUnsigned) pyArgs.push('--allow-unsigned');
    return runPythonModule(repoRoot, 'app.platform.bundle_install', pyArgs, {
      dryRun: ctx.globals.dryRun,
      env: ctx.env,
      inherit: true,
    });
  }

  error(`Unknown bundle subcommand: ${sub}`);
  info(help());
  return 1;
}

module.exports = { name, summary, help, run };
