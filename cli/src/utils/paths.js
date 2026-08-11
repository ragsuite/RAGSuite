'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readConfig, CONFIG_DIR } = require('./config');
const { getActiveInstall, setActiveInstall } = require('./global-config');

/** Default app install dir (npm-CLI style home install). */
function defaultInstallDir() {
  return path.join(os.homedir(), 'ragsuite');
}

function sameFilesystemPath(a, b) {
  if (!a || !b) return false;
  try {
    if (fs.existsSync(a) && fs.existsSync(b)) {
      return fs.realpathSync(a) === fs.realpathSync(b);
    }
  } catch {
    /* compare resolved paths */
  }
  return path.resolve(a) === path.resolve(b);
}

/**
 * Repo this CLI was launched from (source tree). Null for a global npm install.
 * Used so ~/ragsuite does not collide with ~/RAGSUITE on case-insensitive disks.
 */
function launchedFromSourceRoot() {
  const candidate = path.resolve(__dirname, '..', '..', '..');
  if (
    looksLikeGitCheckout(candidate) &&
    fs.existsSync(path.join(candidate, 'cli', 'src', 'utils', 'paths.js'))
  ) {
    return candidate;
  }
  return null;
}

function isHomeDefaultCollidingWithSource(dir) {
  const src = launchedFromSourceRoot();
  return Boolean(src && sameFilesystemPath(dir, src));
}

function looksLikeGitCheckout(dir) {
  const pkg = path.join(dir, 'package.json');
  const native = path.join(dir, 'scripts', 'native-start.sh');
  const docker = path.join(dir, 'scripts', 'docker-start.sh');
  return fs.existsSync(pkg) && (fs.existsSync(native) || fs.existsSync(docker));
}

function looksLikeImagesInstall(dir) {
  const compose = path.join(dir, 'docker-compose.yml');
  const start = path.join(dir, 'scripts', 'docker-start-images.sh');
  if (!fs.existsSync(compose) || !fs.existsSync(start)) return false;
  const cfgPath = path.join(dir, CONFIG_DIR, 'config.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.source === 'images') return true;
    } catch {
      /* fall through */
    }
  }
  return !fs.existsSync(path.join(dir, 'scripts', 'native-start.sh'));
}

function looksLikeRepoRoot(dir) {
  return looksLikeGitCheckout(dir);
}

function looksLikeFullBundleRoot(dir) {
  return looksLikeGitCheckout(dir);
}

function hasCliConfig(dir) {
  return Boolean(readConfig(dir));
}

function walkUpForRepoRoot(startDir) {
  let current = path.resolve(startDir);
  for (;;) {
    if (looksLikeRepoRoot(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function envRepoRoot(env = process.env) {
  for (const raw of [env.RAGSUITE_REPO_ROOT, env.RAGSUITE_INSTALL_DIR]) {
    if (!raw || !String(raw).trim()) continue;
    const root = path.resolve(String(raw).trim());
    if (looksLikeRepoRoot(root)) return root;
  }
  return null;
}

/**
 * Resolve install root (end-user CLI):
 * --repo-root → env → ~/.ragsuite active → ~/ragsuite (if CLI-inited) → cwd walk-up
 *
 * Walk-up is last so sitting in a monorepo checkout does not steal the
 * remembered ~/ragsuite install (and never overwrites active from walk-up).
 * A bare ~/ragsuite source checkout (no .ragsuite-cli) is not auto-selected.
 */
function resolveRepoRoot({
  cwd = process.cwd(),
  repoRootFlag,
  searchConfig = true,
  env = process.env,
} = {}) {
  if (repoRootFlag) {
    const root = path.resolve(repoRootFlag);
    if (!looksLikeRepoRoot(root)) {
      const err = new Error(
        `Not a RAGSuite install: ${root}. Run: ragsuite init`,
      );
      err.code = 'NOT_REPO_ROOT';
      throw err;
    }
    setActiveInstall(root);
    return root;
  }

  const fromEnv = envRepoRoot(env);
  if (fromEnv) {
    setActiveInstall(fromEnv);
    return fromEnv;
  }

  const active = getActiveInstall();
  const fallback = defaultInstallDir();

  // Prefer default home install when it is a real CLI init (has config)
  if (looksLikeRepoRoot(fallback) && hasCliConfig(fallback)) {
    if (!active || path.resolve(active) !== path.resolve(fallback)) {
      setActiveInstall(fallback);
    }
    return path.resolve(fallback);
  }

  if (active && looksLikeRepoRoot(active)) {
    return active;
  }

  if (searchConfig) {
    const walked = walkUpForRepoRoot(cwd);
    if (walked && hasCliConfig(walked)) {
      setActiveInstall(walked);
      return walked;
    }
    if (walked) {
      // Dev checkout without CLI config — use but do not overwrite a prior active
      return walked;
    }
  }

  const err = new Error(
    [
      'No RAGSuite install found.',
      '  First time:  ragsuite init',
      '  Then:        ragsuite start',
    ].join('\n'),
  );
  err.code = 'NOT_REPO_ROOT';
  throw err;
}

function scriptPath(repoRoot, name) {
  return path.join(repoRoot, 'scripts', name);
}

function ensureRagsuiteDir(repoRoot) {
  const dir = path.join(repoRoot, CONFIG_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function nativeLogDir(repoRoot) {
  return path.join(repoRoot, '.ragsuite', 'native');
}

function isImagesInstall(repoRoot) {
  const cfg = readConfig(repoRoot);
  if (cfg && cfg.source === 'images') return true;
  return looksLikeImagesInstall(repoRoot) && !looksLikeGitCheckout(repoRoot);
}

function assertNativeDeploy(repoRoot) {
  if (isImagesInstall(repoRoot)) {
    const err = new Error(
      [
        'This install was created with --from-images (Docker). That path was removed.',
        '  Your Docker volumes were NOT touched.',
        '  Reinstall with: ragsuite init',
      ].join('\n'),
    );
    err.code = 'IMAGES_REMOVED';
    throw err;
  }
  const native = path.join(repoRoot, 'scripts', 'native-start.sh');
  if (!fs.existsSync(native)) {
    const err = new Error(
      `Missing scripts/native-start.sh in ${repoRoot}. Run: ragsuite update`,
    );
    err.code = 'NATIVE_SCRIPT_MISSING';
    throw err;
  }
}

function isDirEmptyOrMissing(dir) {
  if (!fs.existsSync(dir)) return true;
  return fs.readdirSync(dir).filter((n) => n !== '.DS_Store').length === 0;
}

module.exports = {
  defaultInstallDir,
  sameFilesystemPath,
  launchedFromSourceRoot,
  isHomeDefaultCollidingWithSource,
  looksLikeRepoRoot,
  looksLikeGitCheckout,
  looksLikeImagesInstall,
  looksLikeFullBundleRoot,
  walkUpForRepoRoot,
  envRepoRoot,
  resolveRepoRoot,
  scriptPath,
  ensureRagsuiteDir,
  nativeLogDir,
  isImagesInstall,
  assertNativeDeploy,
  isDirEmptyOrMissing,
  hasCliConfig,
};
