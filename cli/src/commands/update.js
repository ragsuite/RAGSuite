'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveRepoRoot, assertNativeDeploy, looksLikeGitCheckout } = require('../utils/paths');
const { readConfig } = require('../utils/config');
const { setActiveInstall } = require('../utils/global-config');
const { upgradeGlobalCli } = require('../utils/cli-self-update');
const { captureCommand } = require('../utils/spawn');
const { runPythonModule } = require('../utils/python');
const { readLicenseKey, writeLicenseKey, licenseKeyExists } = require('../utils/license-paths');
const { assessEeLicense, requireValidLicenseForEe } = require('../utils/license-gate');
const licSrv = require('../utils/license-server');
const { loadKeyBlob, readActive } = require('./activate');
const restartCmd = require('./restart');
const { info, warn, error } = require('../utils/log');
const { resolveBundlePath, bundleNotFoundMessage } = require('../utils/bundle-path');

const name = 'update';
const summary = 'Upgrade CE (+ EE via emailed encbundle when licensed — never wipes data)';

function hasFlag(args, flag) {
  return (args || []).includes(flag);
}

function help() {
  return `Usage:
  ragsuite update [--restart]
  ragsuite update --bundle <install>/ragsuite-ee-<ver>.encbundle [--restart]
  ragsuite update --key <install>/.ragsuite/license/offline.key [--restart]
  ragsuite update --key <install>/.ragsuite/license/offline.key --bundle <install>/ragsuite-ee-<ver>.encbundle [--restart]

Safe upgrade (never wipes DB / volumes / .env):
  1. Refresh CLI + pull Community in your install folder
  2. Enterprise (optional — never for first-time Activate):
       First Enterprise → use activate (not update):
         ragsuite activate --key <install>/.ragsuite/license/offline.key --bundle <install>/ragsuite-ee-<ver>.encbundle
       Later EE code (same key still valid):
         ragsuite update --bundle <install>/ragsuite-ee-<ver>.encbundle
       Renew expired key (vendor sent a new offline.key):
         ragsuite update --key <install>/.ragsuite/license/offline.key
         (auto-replaces when installed key is expired/invalid; --force if still valid)
  3. Optional --restart

Options:
  --repo-root <path>
  --dry-run
  --bundle <file>    New EE pack (.encbundle preferred; .tar.gz still supported)
  --key <file>       Renew offline.key (key must already exist from activate)
  --force            Replace a still-valid installed key
  --restart
  --skip-ee
`;
}

function takeFlag(args, flag) {
  const eq = `${flag}=`;
  for (let i = 0; i < args.length; i += 1) {
    const t = args[i];
    if (t === flag) {
      const v = args[i + 1];
      if (!v || String(v).startsWith('-')) return { value: null, rest: args };
      return { value: v, rest: args.filter((_, idx) => idx !== i && idx !== i + 1) };
    }
    if (t.startsWith(eq)) {
      return { value: t.slice(eq.length), rest: args.filter((_, idx) => idx !== i) };
    }
  }
  return { value: undefined, rest: args };
}

function claimFromLocalKey(repoRoot, env, field) {
  try {
    const result = runPythonModule(repoRoot, 'app.platform.license_cli', ['status'], {
      env,
      inherit: false,
    });
    if (result.status !== 0 || !result.stdout) return null;
    const payload = JSON.parse(result.stdout);
    const url = payload && payload.claims && payload.claims[field];
    if (!url || typeof url !== 'string') return null;
    const t = url.trim();
    if (!t || !/^https?:\/\//i.test(t)) return null;
    return t.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function updateAppSource(repoRoot, env, dryRun) {
  info(`Updating CE install: ${repoRoot}`);
  info('  (.env, database, and license key are kept)');
  info('');

  if (dryRun) {
    info('[dry-run] would update via git pull --ff-only');
    return 0;
  }

  if (!looksLikeGitCheckout(repoRoot) && !fs.existsSync(path.join(repoRoot, '.git'))) {
    error('This install has no .git directory. Re-run: ragsuite init --force');
    return 1;
  }

  info('Fetching and pulling latest CE from git (non-destructive)…');
  const pull = captureCommand('git', ['pull', '--ff-only'], {
    cwd: repoRoot,
    env,
  });
  if (pull.status !== 0) {
    warn(`git pull --ff-only failed (exit ${pull.status}).`);
    if (pull.stderr) warn(String(pull.stderr).trimEnd());
    captureCommand('git', ['fetch', '--all', '--prune'], { cwd: repoRoot, env });
    const st = captureCommand('git', ['status', '-sb'], { cwd: repoRoot, env });
    if (st.stdout) info(String(st.stdout).trimEnd());
    error('Could not fast-forward. Fix local commits or stash, then: cd install && git pull');
    return 1;
  }
  if (pull.stdout) info(String(pull.stdout).trimEnd());
  info('CE git pull OK.');
  return 0;
}

const FIRST_TIME_ACTIVATE =
  '  First Enterprise install (required):\n' +
  '    ragsuite activate --key <install>/.ragsuite/license/offline.key --bundle <install>/ragsuite-ee-<ver>.encbundle --restart';

async function renewOrRefuseKey(ctx, repoRoot, keyPath, { force, hadInstalledKey }) {
  const keyBlob = loadKeyBlob(keyPath);
  if (!keyBlob) {
    error(`Could not read --key ${keyPath}`);
    return { ok: false };
  }

  if (!hadInstalledKey) {
    error(
      'No offline.key is installed yet — update cannot activate Enterprise for the first time.\n' +
        '\n' +
        FIRST_TIME_ACTIVATE +
        '\n' +
        '\n' +
        '  After activate, renew an expired key with:\n' +
        '    ragsuite update --key <install>/.ragsuite/license/offline.key --restart',
    );
    return { ok: false };
  }

  const before = assessEeLicense(repoRoot, ctx.env);
  const autoRenew = before.state === 'expired' || before.state === 'invalid';
  const allowReplace = Boolean(force) || autoRenew;

  if (ctx.globals.dryRun) {
    info(
      `[dry-run] would renew offline.key` +
        (autoRenew ? ' (expired/invalid — auto-replace)' : force ? ' (--force)' : ''),
    );
    return { ok: true, keyBlob, renewed: true };
  }

  try {
    const wrote = writeLicenseKey(repoRoot, keyBlob, ctx.env, { force: allowReplace });
    if (wrote.unchanged) {
      info('License key unchanged (same file already installed)');
    } else if (autoRenew && !force) {
      info(`License key renewed (previous was ${before.state}) → ${wrote.path}`);
    } else {
      info(`License key replaced → ${wrote.path}`);
    }
  } catch (err) {
    if (err && err.code === 'LICENSE_EXISTS') {
      error(
        'A valid license key is already installed. Refusing to overwrite.\n' +
          '  Renewals when expired: ragsuite update --key <install>/.ragsuite/license/offline.key\n' +
          '  Replace a still-valid key (vendor/support): add --force',
      );
      return { ok: false };
    }
    throw err;
  }

  const after = assessEeLicense(repoRoot, ctx.env);
  if (!after.allowed) {
    error(after.message || 'Renewed key is not usable for Enterprise.');
    return { ok: false };
  }
  info(`license state=${after.state} — renewal accepted`);
  if (after.payload && after.payload.claims && after.payload.claims.valid_to) {
    info(`  valid_to=${after.payload.claims.valid_to}`);
  }
  return { ok: true, keyBlob, renewed: true };
}

async function updateEeBundle(ctx, repoRoot) {
  if ((ctx.commandArgs || []).includes('--skip-ee')) {
    info('EE update: skipped (--skip-ee)');
    return 0;
  }

  const force = Boolean(ctx.globals.force) || (ctx.commandArgs || []).includes('--force');
  const keyPick = takeFlag(ctx.commandArgs || [], '--key');
  const bundlePick = takeFlag(ctx.commandArgs || [], '--bundle');
  const hadInstalledKey = licenseKeyExists(repoRoot, ctx.env);

  let keyBlob = null;

  if (keyPick.value) {
    const renewed = await renewOrRefuseKey(ctx, repoRoot, keyPick.value, {
      force,
      hadInstalledKey,
    });
    if (!renewed.ok) return 1;
    keyBlob = renewed.keyBlob;
  } else {
    keyBlob = readLicenseKey(repoRoot, ctx.env);
  }

  if (!bundlePick.value) {
    if (keyPick.value) {
      // Renewal-only path: key updated; EE code on disk unchanged.
      if (ctx.globals.dryRun) return 0;
      info('Enterprise expiry/key updated. Restart to apply: ragsuite restart');
      return 0;
    }
    if (!keyBlob) {
      info('EE update: skipped (Community Edition — no offline.key)');
      info('  First Enterprise:');
      info('    ragsuite activate --key ./offline.key --bundle ./ragsuite-ee-<ver>.encbundle --restart');
      return 0;
    }
    if (ctx.globals.dryRun) {
      info('[dry-run] would try License Server for EE (or pass --bundle for a vendor tar)');
      return 0;
    }
    if (requireValidLicenseForEe(repoRoot, ctx.env, { error, info }) !== 0) {
      warn('CE update already applied; online EE check skipped (key not usable).');
      warn('Expired? Renew: ragsuite update --key <install>/.ragsuite/license/offline.key --restart');
      return 0;
    }

    const candidates = await licSrv.resolveLicenseBaseUrl({
      env: ctx.env,
      repoRoot,
      claimServerUrl: claimFromLocalKey(repoRoot, ctx.env, 'license_server_url'),
      claimDiscoveryUrl: claimFromLocalKey(repoRoot, ctx.env, 'license_discovery_url'),
    });

    let cfg = null;
    for (const baseUrl of candidates) {
      const tryCfg = licSrv.licenseConfig(ctx.env, { baseUrl });
      try {
        const hh = await licSrv.health(tryCfg);
        if (hh.status === 200) {
          cfg = tryCfg;
          licSrv.rememberServerUrl(repoRoot, baseUrl);
          info(`License Server: ${baseUrl}`);
          break;
        }
      } catch {
        /* next */
      }
    }
    if (!cfg) {
      warn('No --bundle and License Server unreachable — CE updated; EE left as-is.');
      if (!readActive(repoRoot)) {
        warn('No Enterprise installed yet.');
        warn(FIRST_TIME_ACTIVATE.trim());
      } else {
        warn('New EE pack from vendor: ragsuite update --bundle <install>/ragsuite-ee-<ver>.encbundle --restart');
      }
      return 0;
    }

    const installed = readActive(repoRoot);
    info(`Checking EE updates (installed=${installed || 'none'})…`);
    const plan = await licSrv.customerEePlan(cfg, {
      offlineKey: keyBlob,
      installedEeVersion: installed,
    });
    if (plan.status !== 200 || !plan.json) {
      warn(`EE plan failed: ${plan.status} ${plan.text} — leaving EE as-is`);
      return 0;
    }
    const p = plan.json;
    if (!p.ok) {
      warn(p.detail || 'EE update not allowed — leaving existing EE/data as-is');
      return 0;
    }
    if (!p.download_allowed || !p.ee_update_needed) {
      info(p.detail || `EE already current (${installed || p.latest_ee_version})`);
      return 0;
    }

    const tmp = path.join(os.tmpdir(), `ragsuite-ee-${p.latest_ee_version}.tar.gz`);
    info(`Downloading EE ${installed || '(none)'} → ${p.latest_ee_version}…`);
    try {
      await licSrv.customerEeDownload(cfg, p.download_token, tmp);
    } catch (err) {
      warn(err.message || String(err));
      warn('EE download failed — previous EE version remains ACTIVE (no data loss)');
      return 0;
    }

    const code = runPythonModule(repoRoot, 'app.platform.bundle_install', [tmp], {
      env: ctx.env,
      inherit: true,
    });
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    if (code !== 0) {
      warn('EE install failed — previous ACTIVE version unchanged');
      return code;
    }
    info(`EE ACTIVE → ${readActive(repoRoot)}`);
    return 0;
  }

  // --bundle path: never first-time activate; require installed (or just-renewed) key
  const resolved = resolveBundlePath(bundlePick.value, repoRoot);
  const bundlePath = resolved.path || path.resolve(bundlePick.value);
  if (!resolved.path && !ctx.globals.dryRun) {
    error(bundleNotFoundMessage(bundlePick.value, resolved.tried, repoRoot));
    return 1;
  }
  if (resolved.path && path.resolve(bundlePick.value) !== resolved.path) {
    info(`Using bundle: ${resolved.path}`);
  }

  if (!hadInstalledKey && !keyPick.value) {
    error(
      'No offline.key installed — Enterprise bundle was NOT installed.\n' +
        '\n' +
        FIRST_TIME_ACTIVATE +
        '\n' +
        '\n' +
        '  Later EE code updates (after activate):\n' +
        '    ragsuite update --bundle <install>/ragsuite-ee-<ver>.encbundle --restart\n' +
        '\n' +
        '  Community update above already ran; database and .env are unchanged.',
    );
    return 1;
  }

  if (!hadInstalledKey && keyPick.value) {
    // renewOrRefuseKey already refused when !hadInstalledKey — unreachable, but keep safe
    error(
      'update cannot install Enterprise for the first time.\n' + FIRST_TIME_ACTIVATE,
    );
    return 1;
  }

  if (ctx.globals.dryRun) {
    info(`[dry-run] would verify offline.key then install EE from ${bundlePath}`);
    info('[dry-run] (replace previous EE code if any; keep DB/.env)');
    return 0;
  }

  if (requireValidLicenseForEe(repoRoot, ctx.env, { error, info }) !== 0) {
    warn('CE update already applied; Enterprise bundle was not installed.');
    warn('Expired key? Renew first: ragsuite update --key <install>/.ragsuite/license/offline.key --restart');
    return 1;
  }

  info(keyPick.value ? 'Using renewed license key' : 'Using installed license key (unchanged)');
  const before = readActive(repoRoot);
  const eeDir = path.join(repoRoot, 'extensions', 'installed', 'ee');
  info(`Installing EE into ${eeDir}${before ? ` (replaces ${before})` : ''}…`);

  let code;
  if (String(bundlePath).toLowerCase().endsWith('.encbundle')) {
    const keyBlob = readLicenseKey(repoRoot, ctx.env);
    if (!keyBlob) {
      error('offline.key required to decrypt .encbundle');
      return 1;
    }
    const { installEncBundleFile } = require('./activate');
    code = await installEncBundleFile(
      repoRoot,
      bundlePath,
      keyBlob,
      ctx.env,
      hasFlag(ctx.commandArgs || [], '--skip-compat'),
    );
  } else {
    code = runPythonModule(repoRoot, 'app.platform.bundle_install', [bundlePath], {
      env: ctx.env,
      inherit: true,
    });
  }
  if (code !== 0) {
    warn('EE install failed — previous ACTIVE version left unchanged (no data loss)');
    return code;
  }
  info(`EE ACTIVE → ${readActive(repoRoot)}`);
  info(`Install root: ${repoRoot}`);
  info('Database, .env were not wiped.');
  return 0;
}

async function run(ctx) {
  info('=== Upgrade ===');
  info('');

  const cliResult = upgradeGlobalCli({
    dryRun: ctx.globals.dryRun,
    env: ctx.env,
  });
  if (cliResult.status !== 0) {
    return cliResult.status;
  }

  info('');

  let repoRoot = null;
  try {
    repoRoot = resolveRepoRoot({
      cwd: ctx.cwd,
      repoRootFlag: ctx.globals.repoRoot,
      env: ctx.env,
    });
    assertNativeDeploy(repoRoot);
  } catch (err) {
    warn('No app install found yet — CLI was updated only.');
    info('First time?  ragsuite init && ragsuite start');
    return 0;
  }

  setActiveInstall(repoRoot);
  const cfg = readConfig(repoRoot);
  const source = (cfg && cfg.source) || 'git';
  const mode = (cfg && cfg.mode) || 'native';
  info(`App source=${source} mode=${mode}`);
  info('');

  const appCode = updateAppSource(repoRoot, ctx.env, ctx.globals.dryRun);
  if (appCode !== 0) return appCode;

  info('');
  const eeCode = await updateEeBundle(ctx, repoRoot);
  if (eeCode !== 0) return eeCode;

  info('');
  if ((ctx.commandArgs || []).includes('--restart')) {
    return restartCmd.run(ctx);
  }
  info('Done. Apply changes with:');
  info('  ragsuite restart');
  return 0;
}

module.exports = { name, summary, help, run };
