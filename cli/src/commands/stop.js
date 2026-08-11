'use strict';

const path = require('path');
const { resolveMode } = require('../utils/config');
const { resolveRepoRoot, assertNativeDeploy } = require('../utils/paths');
const { runScript } = require('../utils/spawn');
const { error } = require('../utils/log');

const name = 'stop';
const summary = 'Stop app (native or Docker — keeps volumes)';

function help() {
  return `Usage: ragsuite stop [options]

  native → scripts/native-stop.sh  (host PIDs; may stop leftover app containers)
  docker → scripts/docker-stop.sh  (compose down, volumes kept — never -v)

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
  const scriptName = mode === 'docker' ? 'docker-stop.sh' : 'native-stop.sh';

  return runScript(repoRoot, path.join('scripts', scriptName), [], {
    dryRun: ctx.globals.dryRun,
    env: { ...ctx.env, RAGSUITE_MODE: mode },
  });
}

module.exports = { name, summary, help, run };
