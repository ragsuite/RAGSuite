'use strict';

const fs = require('fs');
const path = require('path');
const { captureCommand, runCommand } = require('./spawn');

/**
 * Resolve Python for Platform helpers under an install root.
 * Prefers backend/.venv, then python3.14, then python3.
 */
function resolvePython(repoRoot) {
  const venvPy = path.join(repoRoot, 'backend', '.venv', 'bin', 'python');
  if (fs.existsSync(venvPy)) return venvPy;
  return 'python3';
}

function backendEnv(repoRoot, env = process.env) {
  const backend = path.join(repoRoot, 'backend');
  const prev = env.PYTHONPATH ? String(env.PYTHONPATH) : '';
  const parts = [backend, prev].filter(Boolean);
  return {
    ...env,
    PYTHONPATH: parts.join(path.delimiter),
    RAGSUITE_REPO_ROOT: repoRoot,
  };
}

function runPythonModule(repoRoot, moduleName, args = [], options = {}) {
  const { dryRun = false, env = process.env, inherit = true } = options;
  const py = resolvePython(repoRoot);
  const fullArgs = ['-m', moduleName, ...args];
  const runEnv = backendEnv(repoRoot, env);

  if (dryRun) {
    const { info } = require('./log');
    info(`[dry-run] ${py} ${fullArgs.join(' ')}`);
    return 0;
  }

  if (inherit) {
    return runCommand(py, fullArgs, { cwd: path.join(repoRoot, 'backend'), env: runEnv });
  }
  return captureCommand(py, fullArgs, { cwd: path.join(repoRoot, 'backend'), env: runEnv });
}

module.exports = { resolvePython, backendEnv, runPythonModule };
