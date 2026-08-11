'use strict';

const path = require('path');
const { resolveMode } = require('../utils/config');
const { resolveRepoRoot, assertNativeDeploy } = require('../utils/paths');
const { runScript } = require('../utils/spawn');
const { assertApiPortFree } = require('../utils/port');
const { error, info } = require('../utils/log');

const name = 'start';
const summary = 'Start app (native or Docker — from init config)';

function help() {
  return `Usage: ragsuite start [options]

Uses the mode saved by init (override with --mode / --docker).

  native → scripts/native-start.sh
           API http://localhost:9090 · Expo http://localhost:9191
  docker → scripts/docker-start.sh --detach
           API http://localhost:9090 · Web  http://localhost:9191

Options:
  --mode <native|docker>   Override saved mode
  --docker                 Same as --mode docker
  --repo-root <path>
  --dry-run
  --detach, -d             (docker) already default for CLI start
`;
}

function flagMode(g) {
  if (g.docker || g.mode === 'docker') return 'docker';
  if (g.mode === 'native') return 'native';
  return null;
}

async function run(ctx) {
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

  const scriptName = mode === 'docker' ? 'docker-start.sh' : 'native-start.sh';
  const forward = mode === 'docker' ? ['--detach'] : [];

  if (!ctx.globals.dryRun) {
    try {
      await assertApiPortFree(ctx.env);
    } catch (err) {
      error(err.message);
      return 1;
    }
  } else {
    info(`[dry-run] would run scripts/${scriptName}${forward.length ? ' --detach' : ''}`);
  }

  return runScript(repoRoot, path.join('scripts', scriptName), forward, {
    dryRun: ctx.globals.dryRun,
    env: { ...ctx.env, RAGSUITE_MODE: mode },
  });
}

module.exports = { name, summary, help, run };
