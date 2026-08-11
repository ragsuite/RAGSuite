'use strict';

const fs = require('fs');
const path = require('path');
const { resolveRepoRoot } = require('../utils/paths');
const {
  clearLicenseKey,
  licenseKeyExists,
  resolveLicenseKeyPath,
  writeLicenseKey,
} = require('../utils/license-paths');
const { runPythonModule } = require('../utils/python');
const { info, error } = require('../utils/log');

const name = 'license';
const summary = 'Install / verify / clear offline license key';

function help() {
  return `Usage: ragsuite license <subcommand> [args]

Offline verify locally (no network). Prefer emailed-pack activate:
  ragsuite activate --key <install>/.ragsuite/license/offline.key --bundle <install>/ragsuite-ee-<ver>.encbundle --restart

Subcommands:
  status             Verify installed key
  install <file>     Install key (refuses overwrite unless --force)
  clear --force      Remove key (protected — requires --force)

Do not hand-edit <.ragsuite/license/offline.key>.

Options:
  --repo-root <path>
  --dry-run
  --force
`;
}

function run(ctx) {
  const args = ctx.commandArgs || [];
  const sub = args[0];
  if (!sub || sub === '--help' || sub === '-h') {
    info(help());
    return sub ? 0 : 1;
  }

  // --force is a global flag (stripped from commandArgs by the parser)
  const force = Boolean(ctx.globals.force) || args.includes('--force');
  const repoRoot = resolveRepoRoot({
    cwd: ctx.cwd,
    repoRootFlag: ctx.globals.repoRoot,
  });
  const keyPath = resolveLicenseKeyPath(repoRoot, ctx.env);

  if (sub === 'status') {
    if (!licenseKeyExists(repoRoot, ctx.env)) {
      info('license: absent (Community — OK)');
      info(`path: ${keyPath}`);
      return 0;
    }
    if (ctx.globals.dryRun) {
      info(`[dry-run] would verify ${keyPath}`);
      return 0;
    }
    const result = runPythonModule(repoRoot, 'app.platform.license_cli', ['status', '--pretty'], {
      env: ctx.env,
      inherit: false,
    });
    if (result.status === 0 || result.status === 2) {
      if (result.stdout) info(result.stdout.trimEnd());
      if (result.stderr) error(result.stderr.trimEnd());
      return result.status;
    }
    const detail = (result.stderr || result.stdout || 'license verifier unavailable').trim();
    info(JSON.stringify({
      state: 'invalid',
      path: keyPath,
      claims: null,
      detail,
      skipped_extensions: {},
    }, null, 2));
    return 2;
  }

  if (sub === 'install') {
    const src = args.find((a, i) => i > 0 && !String(a).startsWith('-'));
    if (!src) {
      error('Usage: ragsuite license install <file> [--force]');
      return 1;
    }
    const abs = path.resolve(src);
    if (!fs.existsSync(abs)) {
      error(`File not found: ${abs}`);
      return 1;
    }
    const blob = fs.readFileSync(abs, 'utf8');
    if (ctx.globals.dryRun) {
      info(`[dry-run] would write offline key → ${keyPath}`);
      return 0;
    }
    try {
      const wrote = writeLicenseKey(repoRoot, blob, ctx.env, { force });
      info(wrote.unchanged
        ? `License key already installed → ${wrote.path}`
        : `Installed offline license key → ${wrote.path}`);
    } catch (err) {
      if (err && err.code === 'LICENSE_EXISTS') {
        error(err.message);
        return 1;
      }
      throw err;
    }
    const result = runPythonModule(repoRoot, 'app.platform.license_cli', ['status'], {
      env: ctx.env,
      inherit: false,
    });
    if (result.status === 0 || result.status === 2) {
      if (result.stdout) info(result.stdout.trimEnd());
      return result.status;
    }
    const detail = (result.stderr || result.stdout || 'license verifier unavailable').trim();
    info(JSON.stringify({
      state: 'invalid',
      path: keyPath,
      claims: null,
      detail,
      skipped_extensions: {},
    }, null, 2));
    return 2;
  }

  if (sub === 'clear') {
    if (ctx.globals.dryRun) {
      info(`[dry-run] would clear ${keyPath}`);
      return 0;
    }
    try {
      const removed = clearLicenseKey(repoRoot, ctx.env, { force });
      info(removed ? `Cleared ${keyPath}` : `No license file at ${keyPath}`);
      return 0;
    } catch (err) {
      if (err && err.code === 'LICENSE_PROTECTED') {
        error(err.message);
        return 1;
      }
      throw err;
    }
  }

  error(`Unknown license subcommand: ${sub}`);
  info(help());
  return 1;
}

module.exports = { name, summary, help, run };
