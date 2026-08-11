'use strict';

const { resolveMode } = require('../utils/config');
const { resolveRepoRoot, assertNativeDeploy } = require('../utils/paths');
const stopCmd = require('./stop');
const startCmd = require('./start');
const { info, error } = require('../utils/log');

const name = 'restart';
const summary = 'Stop then start (clears ports; keeps DB volumes)';

function help() {
  return `Usage: ragsuite restart [options]

Stops the running stack, then starts it again using the saved mode
(native or docker). Safe for data (never down -v).

Typical after update:
  ragsuite update
  ragsuite restart

Options: same as start/stop (--mode, --docker, --repo-root, --dry-run)
`;
}

async function run(ctx) {
  let repoRoot;
  try {
    repoRoot = resolveRepoRoot({
      cwd: ctx.cwd,
      repoRootFlag: ctx.globals.repoRoot,
      env: ctx.env,
    });
    assertNativeDeploy(repoRoot);
  } catch (err) {
    error(err.message);
    return 1;
  }

  const mode = resolveMode({
    flagMode:
      ctx.globals.docker || ctx.globals.mode === 'docker'
        ? 'docker'
        : ctx.globals.mode === 'native'
          ? 'native'
          : null,
    repoRoot,
    env: ctx.env,
  });

  info(`Restarting install: ${repoRoot}`);
  info(`  mode=${mode}`);
  info('');

  if (ctx.globals.dryRun) {
    info('[dry-run] would stop then start');
    return 0;
  }

  const stopCode = await Promise.resolve(stopCmd.run(ctx));
  if (typeof stopCode === 'number' && stopCode !== 0) {
    // Continue to start anyway — stop may warn if already partially stopped
    info('Stop finished with warnings; continuing to start…');
  }

  info('');
  return startCmd.run(ctx);
}

module.exports = { name, summary, help, run };
