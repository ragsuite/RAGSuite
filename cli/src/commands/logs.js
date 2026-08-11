'use strict';

const fs = require('fs');
const path = require('path');
const { resolveMode } = require('../utils/config');
const { resolveRepoRoot, nativeLogDir, assertNativeDeploy } = require('../utils/paths');
const { runCommand } = require('../utils/spawn');
const { error, info } = require('../utils/log');

const name = 'logs';
const summary = 'Follow backend / frontend logs (native files or compose)';

const SERVICE_ALIASES = {
  api: 'api',
  backend: 'api',
  frontend: 'frontend',
  web: 'frontend',
  expo: 'frontend',
  worker: 'worker',
  chroma: 'chroma',
  all: null,
};

function help() {
  return `Usage: ragsuite logs [service…]

Native mode → tail .ragsuite/native/*.log
Docker mode → docker compose logs -f [services]

Services (native): api|backend, frontend|web|expo, worker, chroma, all
Services (docker): backend, frontend, worker, postgres, redis, chromadb (compose names)

Examples:
  ragsuite logs
  ragsuite logs api
  ragsuite logs frontend
  ragsuite logs --docker backend frontend

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

function resolveLogFiles(dir, requested) {
  const available = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.log'))
    : [];

  if (!requested.length) {
    return available.map((f) => path.join(dir, f)).sort();
  }

  const wanted = new Set();
  for (const raw of requested) {
    const key = String(raw).trim().toLowerCase();
    if (key === 'all') {
      return available.map((f) => path.join(dir, f)).sort();
    }
    const base = SERVICE_ALIASES[key];
    if (!base) {
      const err = new Error(
        `Unknown log service "${raw}". Use: api, frontend, worker, chroma, all`,
      );
      err.code = 'USAGE';
      throw err;
    }
    wanted.add(`${base}.log`);
  }

  return [...wanted]
    .filter((f) => available.includes(f))
    .map((f) => path.join(dir, f))
    .sort();
}

function mapDockerServices(args) {
  if (!args.length) return [];
  const out = [];
  for (const raw of args) {
    const key = String(raw).trim().toLowerCase();
    if (key === 'all') return [];
    if (key === 'api' || key === 'backend') out.push('backend');
    else if (key === 'frontend' || key === 'web' || key === 'expo') out.push('frontend');
    else if (key === 'worker') out.push('worker');
    else if (key === 'chroma' || key === 'chromadb') out.push('chromadb');
    else if (key === 'postgres' || key === 'redis') out.push(key);
    else out.push(raw);
  }
  return [...new Set(out)];
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

  if (mode === 'docker') {
    const services = mapDockerServices(ctx.commandArgs || []);
    info(`Following Docker compose logs${services.length ? `: ${services.join(', ')}` : ''}…`);
    return runCommand('docker', ['compose', 'logs', '-f', ...services], {
      cwd: repoRoot,
      dryRun: ctx.globals.dryRun,
      env: ctx.env,
    });
  }

  const dir = nativeLogDir(repoRoot);
  let logs;
  try {
    logs = resolveLogFiles(dir, ctx.commandArgs || []);
  } catch (err) {
    error(err.message);
    return 1;
  }

  if (logs.length === 0) {
    error(
      [
        `No matching log files under ${dir}.`,
        'Start first:  ragsuite start',
        'Then:         ragsuite logs api',
        '              ragsuite logs frontend',
      ].join('\n'),
    );
    return 1;
  }

  info(`Following ${logs.length} log file(s):`);
  for (const f of logs) info(`  ${path.basename(f)}`);

  return runCommand('tail', ['-f', ...logs], {
    cwd: repoRoot,
    dryRun: ctx.globals.dryRun,
    env: ctx.env,
  });
}

module.exports = { name, summary, help, run, SERVICE_ALIASES, resolveLogFiles };
