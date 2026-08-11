'use strict';

const { spawnSync } = require('child_process');
const { info, error } = require('./log');

function commandExists(cmd) {
  const r = spawnSync('which', [cmd], { encoding: 'utf8' });
  return r.status === 0;
}

function dockerDaemonRunning() {
  const r = spawnSync('docker', ['info'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return r.status === 0;
}

function nodeMajorOk() {
  const major = Number(String(process.versions.node).split('.')[0]);
  return Number.isFinite(major) && major >= 18;
}

function installHintFor(issueKey) {
  const hints = {
    node: 'Install Node 18+ (20/22 LTS recommended): https://nodejs.org/',
    python3: 'Install Python 3.14 as python3.14 (backend). See README prerequisites.',
    yarn: '`corepack enable && corepack prepare yarn@1.22.22 --activate`',
    git: 'Install git: macOS `xcode-select --install` / `brew install git`; Linux `sudo apt install git`',
    docker: 'Install Docker Desktop (or Engine) and start the daemon.',
    'docker-compose': 'Install Docker Compose v2 plugin (`docker compose version`).',
    postgres:
      'Native: Postgres on localhost:5436, db ragsuite_v3. Or let start auto-run compose postgres.',
    redis: 'Native: Redis on localhost:6382. Or let start auto-run compose redis.',
  };
  return hints[issueKey] || null;
}

/** Default when flags omit mode: native. */
function resolvePreferredMode(flagMode) {
  if (flagMode === 'docker' || flagMode === 'native') return flagMode;
  return 'native';
}

/**
 * @param {'native'|'docker'} mode
 */
function checkPrereqs(mode = 'native', options = {}) {
  const { needGit = false } = options;
  const issues = [];
  const notes = [];
  const hints = [];
  const m = mode === 'docker' ? 'docker' : 'native';

  function pushIssue(msg, hintKey) {
    issues.push(msg);
    const h = installHintFor(hintKey);
    if (h) hints.push(h);
  }

  if (!nodeMajorOk()) {
    pushIssue(`Node.js 18+ required (current: ${process.version})`, 'node');
  } else {
    notes.push(`Node.js ${process.version}`);
  }

  if (needGit) {
    if (!commandExists('git')) {
      pushIssue('git not found (required for init)', 'git');
    } else {
      notes.push('git present');
    }
  }

  if (m === 'docker') {
    notes.push('Deploy mode=docker (Compose stack)');
    if (!commandExists('docker')) {
      pushIssue('Docker CLI not found', 'docker');
    } else if (!dockerDaemonRunning()) {
      pushIssue('Docker daemon not running — start Docker Desktop / dockerd', 'docker');
    } else {
      notes.push('Docker CLI + daemon OK');
      const compose = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' });
      if (compose.status !== 0) {
        pushIssue('docker compose plugin not available', 'docker-compose');
      } else {
        notes.push('docker compose OK');
      }
    }
  } else {
    notes.push('Deploy mode=native (host npm scripts)');
    if (!commandExists('python3') && !commandExists('python3.14')) {
      pushIssue('python3 / python3.14 not found', 'python3');
    } else {
      notes.push('python3 present');
    }
    if (!commandExists('yarn')) {
      notes.push('yarn missing — enable with corepack');
      const h = installHintFor('yarn');
      if (h) hints.push(h);
    } else {
      notes.push('yarn present');
    }
    notes.push('Need Postgres :5436 (ragsuite_v3) and Redis :6382 (host or compose data services)');
    hints.push(installHintFor('postgres'));
    hints.push(installHintFor('redis'));
  }

  if (process.platform === 'win32') {
    notes.push('Windows: use WSL2 or Git Bash for start/stop scripts');
  }

  return {
    ok: issues.length === 0,
    issues,
    notes,
    hints: [...new Set(hints.filter(Boolean))],
  };
}

function printPrereqs(mode = 'native', options = {}) {
  const m = mode === 'docker' ? 'docker' : 'native';
  const { ok, issues, notes, hints } = checkPrereqs(m, options);
  info(`Prerequisites (mode=${m}):`);
  for (const n of notes) info(`  ✓ ${n}`);
  for (const i of issues) error(`  ✗ ${i}`);
  if (hints.length) {
    info('');
    info('How to get missing pieces:');
    for (const h of hints) info(`  → ${h}`);
  }
  return ok;
}

module.exports = {
  commandExists,
  dockerDaemonRunning,
  nodeMajorOk,
  installHintFor,
  resolvePreferredMode,
  checkPrereqs,
  printPrereqs,
};
