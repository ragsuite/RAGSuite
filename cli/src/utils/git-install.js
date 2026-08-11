'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  defaultInstallDir,
  looksLikeFullBundleRoot,
  looksLikeRepoRoot,
  isHomeDefaultCollidingWithSource,
} = require('./paths');

/** Default public monorepo (when the GitHub repo is public). */
const DEFAULT_GIT_URL = 'https://github.com/ragsuite/RAGSuite.git';

function requireGit() {
  const which = spawnSync('which', ['git'], { encoding: 'utf8' });
  if (which.status !== 0) {
    const err = new Error(
      'git is required for --from-git. Install: macOS `xcode-select --install` or `brew install git`; Linux `sudo apt install git`',
    );
    err.code = 'MISSING_GIT';
    throw err;
  }
}

function isDirEmptyOrMissing(dir) {
  if (!fs.existsSync(dir)) return true;
  const items = fs.readdirSync(dir).filter((n) => n !== '.DS_Store');
  return items.length === 0;
}

/**
 * Shallow-clone a public (or authenticated) git repo into installDir.
 * @returns {{ repoRoot: string, gitUrl: string }}
 */
function cloneGitToInstallDir(gitUrl, options = {}) {
  const { installDir, force = false, depth = 1 } = options;
  requireGit();

  const url = String(gitUrl || DEFAULT_GIT_URL).trim();
  if (!url) {
    const err = new Error('--from-git requires a repository URL');
    err.code = 'GIT_URL_INVALID';
    throw err;
  }

  const target = path.resolve(installDir);
  if (isHomeDefaultCollidingWithSource(target)) {
    const err = new Error(
      [
        `Refusing to clone into the CLI source checkout: ${target}`,
        '  ragsuite init --repo-root <this-repo>',
        '  ragsuite init --install-dir <path>',
      ].join('\n'),
    );
    err.code = 'INSTALL_DIR_IS_SOURCE';
    throw err;
  }
  if (!isDirEmptyOrMissing(target)) {
    if (!force) {
      const err = new Error(
        [
          `Install directory is not empty: ${target}`,
          '  If already installed:  ragsuite start',
          '  To upgrade in place:   ragsuite update',
          '  To wipe & reinstall:   ragsuite init --force',
          '  Or use another path:   ragsuite init --install-dir <path>',
        ].join('\n'),
      );
      err.code = 'INSTALL_DIR_NONEMPTY';
      throw err;
    }
    fs.rmSync(target, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const args = ['clone', `--depth=${depth}`, url, target];
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const stderr = String(result.stderr || result.stdout || '').trim();
    const err = new Error(
      `git clone failed for ${url}: ${stderr || `exit ${result.status}`}. ` +
        'Repo must be public (or you must be authenticated). Or clone manually and use init --repo-root.',
    );
    err.code = 'GIT_CLONE_FAILED';
    throw err;
  }

  const repoRoot = target;
  if (!looksLikeRepoRoot(repoRoot) && !looksLikeFullBundleRoot(repoRoot)) {
    const err = new Error(
      `Cloned repo at ${repoRoot} does not look like a RAGSuite monorepo (missing scripts/native-start.sh or docker-start.sh).`,
    );
    err.code = 'GIT_INVALID_REPO';
    throw err;
  }

  return { repoRoot, gitUrl: url };
}

module.exports = {
  DEFAULT_GIT_URL,
  defaultInstallDir,
  requireGit,
  cloneGitToInstallDir,
};
