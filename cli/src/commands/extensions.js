'use strict';

const { resolveRepoRoot } = require('../utils/paths');
const { runPythonModule } = require('../utils/python');
const { info, error } = require('../utils/log');

const name = 'extensions';
const summary = 'List discovered Community modules and installed Extensions';

function help() {
  return `Usage: ragsuite extensions [options]

List Extensions discovered on disk (no API required):
  • CE modules/ (Community)
  • extensions/installed/ee/<ACTIVE>/modules (installed Enterprise bundle)
  • $RAGSUITE_EE_ROOT when attached (dev)

Does not start the stack. Runtime load status is owned by Platform.

Options:
  --repo-root <path>
  --dry-run
  --json                 Raw inventory JSON
`;
}

function wantsJson(commandArgs = []) {
  return commandArgs.includes('--json');
}

function run(ctx) {
  const repoRoot = resolveRepoRoot({
    cwd: ctx.cwd,
    repoRootFlag: ctx.globals.repoRoot,
  });

  if (ctx.globals.dryRun) {
    return runPythonModule(repoRoot, 'app.platform.extension_inventory', [], {
      dryRun: true,
      env: ctx.env,
    });
  }

  const result = runPythonModule(repoRoot, 'app.platform.extension_inventory', [], {
    dryRun: false,
    env: ctx.env,
    inherit: false,
  });

  if (result.status !== 0) {
    error(result.stderr || result.stdout || 'extension inventory failed');
    return result.status || 1;
  }

  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch (err) {
    error(`Invalid inventory JSON: ${err.message}`);
    if (result.stdout) info(result.stdout);
    return 1;
  }

  if (wantsJson(ctx.commandArgs)) {
    info(JSON.stringify(payload, null, 2));
    return 0;
  }

  const rows = Array.isArray(payload.extensions) ? payload.extensions : [];
  info(`Install: ${payload.repo_root || repoRoot}`);
  info(`Active EE bundle: ${payload.active_bundle || '(none)'}`);
  info(`Extensions: ${rows.length}`);
  info('');
  const hdr = `${'ID'.padEnd(22)} ${'EDITION'.padEnd(12)} ${'STATUS'.padEnd(10)} ${'SOURCE'.padEnd(14)} VERSION`;
  info(hdr);
  info('-'.repeat(hdr.length));
  for (const row of rows) {
    info(
      `${String(row.id || '').padEnd(22)} ${String(row.edition || '-').padEnd(12)} ${String(row.status || '-').padEnd(10)} ${String(row.source || '-').padEnd(14)} ${row.version || '-'}`,
    );
  }
  return 0;
}

module.exports = { name, summary, help, run };
