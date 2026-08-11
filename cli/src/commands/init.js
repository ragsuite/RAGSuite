'use strict';

const path = require('path');
const { writeConfig, readConfig } = require('../utils/config');
const {
  ensureRagsuiteDir,
  resolveRepoRoot,
  looksLikeRepoRoot,
  isDirEmptyOrMissing,
  isHomeDefaultCollidingWithSource,
} = require('../utils/paths');
const { setActiveInstall } = require('../utils/global-config');
const { assertSupportedInstall, installHint } = require('../utils/distribution');
const {
  DEFAULT_GIT_URL,
  defaultInstallDir,
  cloneGitToInstallDir,
} = require('../utils/git-install');
const { detectOs } = require('../utils/os-detect');
const { printPrereqs, resolvePreferredMode } = require('../utils/prereqs');
const { choose } = require('../utils/prompt');
const { info, warn, error } = require('../utils/log');
const {
  generateJwtSecret,
  isPlaceholderSecret,
  writeInstallEnv,
} = require('../utils/env-file');

const name = 'init';
const summary = 'First-time install — choose native (default) or Docker';

function printSuccess(repoRoot, mode) {
  const docker = mode === 'docker';
  info('');
  info('=== Install complete ===');
  info(`  Install dir : ${repoRoot}`);
  info(`  Mode        : ${mode}`);
  info('');
  info('  API  http://localhost:9090');
  info(docker ? '  Web  http://localhost:9191  (Docker nginx)' : '  Web  http://localhost:9191  (Expo)');
  info('');
  info('Next:');
  info('  ragsuite start');
  info('  ragsuite stop');
  info('  ragsuite update');
  info('');
  if (docker) {
    info('Same as: cd install && npm run start:docker   /   npm run down');
  } else {
    info('Same as: cd install && npm start   /   npm run stop');
  }
  info('');
  info(installHint());
}

function printAlreadyInstalled(repoRoot) {
  const cfg = readConfig(repoRoot);
  setActiveInstall(repoRoot);
  const mode = (cfg && cfg.mode) || 'native';
  info('');
  info('=== Already installed ===');
  info(`  ${repoRoot}`);
  info(`  mode=${mode}`);
  info('');
  info('  ragsuite start');
  info('  ragsuite update');
  info('  ragsuite stop');
  info('');
  info('Do NOT run init --force unless you intend to wipe and reinstall.');
}

function isInitializedInstall(dir) {
  return looksLikeRepoRoot(dir) && Boolean(readConfig(dir));
}

function help() {
  return `Usage: ragsuite init [options]

First-time setup. Pick a run mode once (saved in config):

  ragsuite init              # prompts: 1) native (default)  2) docker
  ragsuite init --yes        # native (non-interactive default)
  ragsuite init --docker     # Docker Compose stack
  ragsuite init --mode native|docker

Then:
  ragsuite start
  ragsuite stop
  ragsuite update

Options:
  --docker                 Same as --mode docker
  --mode <native|docker>   Run mode (stored for start/stop)
  --from-git [url]         Clone URL (default public repo)
  --repo-root <path>       Existing checkout
  --install-dir <path>     Default: ~/ragsuite
  --force                  Wipe install dir (destructive)
  --yes, -y                Non-interactive (default mode=native unless --docker)
`;
}

function optionalSmtpOverrides(g, env) {
  const host = g.smtpHost || env.RAGSUITE_TEST_SMTP_HOST || null;
  const user = g.smtpUser || env.RAGSUITE_TEST_SMTP_USER || null;
  const password = g.smtpPassword || env.RAGSUITE_TEST_SMTP_PASSWORD || null;
  const emailFrom = g.emailFrom || env.RAGSUITE_TEST_EMAIL_FROM || null;
  if (!host && !user && !password && !emailFrom) return null;
  return { host, user, password, emailFrom };
}

function resolveLlmOverride(g, env) {
  if (g.llmApiKey && !isPlaceholderSecret(g.llmApiKey)) return g.llmApiKey;
  if (env.RAGSUITE_TEST_LLM_API_KEY && !isPlaceholderSecret(env.RAGSUITE_TEST_LLM_API_KEY)) {
    return env.RAGSUITE_TEST_LLM_API_KEY;
  }
  return null;
}

function countSources(fromGit, repoRootFlag) {
  let n = 0;
  if (fromGit !== null && fromGit !== undefined) n += 1;
  if (repoRootFlag) n += 1;
  return n;
}

async function resolveInitMode(g) {
  if (g.docker || g.mode === 'docker') return 'docker';
  if (g.mode === 'native') return 'native';
  if (g.yes) return resolvePreferredMode(null);

  const picked = await choose(
    'Choose how to run RAGSuite:',
    [
      {
        value: 'native',
        label: 'native (default) — host API :9090 + Expo web :9191',
      },
      {
        value: 'docker',
        label: 'docker — Compose stack API :9090 + web :9191',
      },
    ],
    { defaultIndex: 0, yesMode: false },
  );
  return picked.value === 'docker' ? 'docker' : 'native';
}

async function run(ctx) {
  assertSupportedInstall();
  const g = ctx.globals;

  if (g.fromRelease) {
    error('--from-release is not supported.');
    return 1;
  }

  if (g.fromImages) {
    error(
      [
        '--from-images was removed.',
        '  Use:  ragsuite init --docker',
        '  Or:   ragsuite init           # native (default)',
      ].join('\n'),
    );
    return 1;
  }

  if (countSources(g.fromGit, g.repoRoot) > 1) {
    error('Use only one of --from-git or --repo-root');
    return 1;
  }

  const osInfo = detectOs();
  info(`OS: ${osInfo.label} (${osInfo.platform})`);

  let fromGit = g.fromGit;
  let repoRootFlag = g.repoRoot;
  const installDir = path.resolve(g.installDir || defaultInstallDir());
  const userChoseInstallDir = Boolean(g.installDir);

  if (!g.force) {
    if (repoRootFlag && isInitializedInstall(path.resolve(repoRootFlag))) {
      printAlreadyInstalled(path.resolve(repoRootFlag));
      return 0;
    }
    if (!repoRootFlag && isInitializedInstall(installDir)) {
      printAlreadyInstalled(installDir);
      return 0;
    }
  }

  if (
    !userChoseInstallDir &&
    !repoRootFlag &&
    isHomeDefaultCollidingWithSource(installDir) &&
    !isInitializedInstall(installDir)
  ) {
    error(
      [
        `Default install path ${installDir} is this source checkout.`,
        '  Use this tree:     ragsuite init --repo-root <path-to-this-repo>',
        '  Separate install:  ragsuite init --install-dir <path>',
      ].join('\n'),
    );
    return 1;
  }

  if (fromGit === null && !repoRootFlag) {
    fromGit = '';
    info(`First-time install (git): ${DEFAULT_GIT_URL}`);
    info(`  → ${installDir}`);
  }

  if (
    !g.force &&
    !repoRootFlag &&
    looksLikeRepoRoot(installDir) &&
    !readConfig(installDir)
  ) {
    info(`Found existing source at ${installDir} — finishing setup (no re-clone).`);
    repoRootFlag = installDir;
    fromGit = null;
  }

  if (!g.force && !isDirEmptyOrMissing(installDir) && !looksLikeRepoRoot(installDir) && !repoRootFlag) {
    error(
      [
        `Directory exists but is not a RAGSuite install: ${installDir}`,
        '  ragsuite init --force',
        '  ragsuite init --install-dir ~/ragsuite-2',
      ].join('\n'),
    );
    return 1;
  }

  const mode = await resolveInitMode(g);
  info(`Run mode: ${mode}`);

  const needGit = fromGit !== null && fromGit !== undefined;
  if (!printPrereqs(mode, { needGit })) {
    error('Fix prerequisites above and re-run init');
    return 1;
  }

  const jwtSecret = generateJwtSecret();
  info(`JWT_SECRET_KEY will be auto-generated (…${jwtSecret.slice(-8)})`);

  const llmKey = resolveLlmOverride(g, ctx.env);
  const smtp = optionalSmtpOverrides(g, ctx.env);

  let repoRoot;
  let source = 'checkout';

  try {
    if (fromGit !== null && fromGit !== undefined) {
      const url = fromGit === '' ? DEFAULT_GIT_URL : fromGit;
      const result = cloneGitToInstallDir(url, { installDir, force: g.force });
      repoRoot = result.repoRoot;
      source = 'git';
    } else {
      repoRoot = resolveRepoRoot({
        cwd: ctx.cwd,
        repoRootFlag,
        env: ctx.env,
      });
    }
  } catch (err) {
    error(err.message || String(err));
    return 1;
  }

  ensureRagsuiteDir(repoRoot);
  const cfg = writeConfig(repoRoot, {
    mode,
    source,
    repoRoot,
    installDir: repoRoot,
  });
  setActiveInstall(repoRoot);

  try {
    writeInstallEnv(repoRoot, {
      force: g.force,
      jwtSecret,
      llmApiKey: llmKey,
      smtp,
    });
  } catch (err) {
    if (err.code === 'ENV_EXISTS') {
      warn('.env already present — keeping it.');
    } else if (err.code === 'ENV_INCOMPLETE') {
      error(err.message);
      return 1;
    } else {
      error(err.message || String(err));
      return 1;
    }
  }

  info(`Config: mode=${cfg.mode} source=${cfg.source}`);
  printSuccess(repoRoot, mode);
  return 0;
}

module.exports = { name, summary, help, run };
