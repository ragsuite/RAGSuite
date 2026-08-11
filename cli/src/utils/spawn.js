'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const { info } = require('./log');

/**
 * Run a repo script with inherited stdio. dry-run prints and returns 0.
 * @returns {number} exit code
 */
function runScript(repoRoot, relPath, args = [], options = {}) {
  const { dryRun = false, env = process.env, shell = false } = options;
  const abs = path.isAbsolute(relPath) ? relPath : path.join(repoRoot, relPath);
  const display = [abs, ...args].join(' ');

  if (dryRun) {
    info(`[dry-run] ${display}`);
    return 0;
  }

  const result = spawnSync('bash', [abs, ...args], {
    cwd: repoRoot,
    env: { ...env },
    stdio: 'inherit',
    shell,
  });

  if (result.error) {
    throw result.error;
  }
  return typeof result.status === 'number' ? result.status : 1;
}

/**
 * Run an arbitrary command (e.g. docker compose, git, tail).
 * @returns {number} exit code
 */
function runCommand(cmd, args, options = {}) {
  const { cwd = process.cwd(), dryRun = false, env = process.env } = options;
  const display = [cmd, ...args].join(' ');

  if (dryRun) {
    info(`[dry-run] ${display}`);
    return 0;
  }

  const result = spawnSync(cmd, args, {
    cwd,
    env: { ...env },
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  return typeof result.status === 'number' ? result.status : 1;
}

/**
 * Capture stdout/stderr (for git status, etc.).
 */
function captureCommand(cmd, args, options = {}) {
  const { cwd = process.cwd(), env = process.env } = options;
  const result = spawnSync(cmd, args, {
    cwd,
    env: { ...env },
    encoding: 'utf8',
  });
  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error || null,
  };
}

module.exports = { runScript, runCommand, captureCommand };
