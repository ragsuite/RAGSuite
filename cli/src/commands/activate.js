'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveRepoRoot } = require('../utils/paths');
const { resolveBundlePath, bundleNotFoundMessage } = require('../utils/bundle-path');
const {
  writeLicenseKey,
  resolveLicenseKeyPath,
  readLicenseKey,
} = require('../utils/license-paths');
const { requireValidLicenseForEe } = require('../utils/license-gate');
const { runPythonModule } = require('../utils/python');
const licSrv = require('../utils/license-server');
const restartCmd = require('./restart');
const { info, error, warn } = require('../utils/log');
const { PRODUCTION_BUILD } = require('../production-marker');

const name = 'activate';
const summary = 'Install Enterprise from offline.key (+ emailed encrypted EE pack)';

function help() {
  return `Usage:
  ragsuite activate --key ./offline.key --bundle ./ragsuite-ee-<ver>.encbundle [--restart]
  ragsuite ee-activate ./offline.key --bundle ./ragsuite-ee-<ver>.encbundle [--restart]

First-time Enterprise only (do not use update for this step):
  1. Vendor emails offline.key + ragsuite-ee-<ver>.encbundle + manifest.enc.json
  2. Paste files into your install root (usually ~/ragsuite):
       offline.key                    -> <install>/.ragsuite/license/offline.key
       ragsuite-ee-<ver>.encbundle   -> <install>/ragsuite-ee-<ver>.encbundle
       manifest.enc.json             -> <install>/manifest.enc.json
  3. Run activate with those install paths:
       ragsuite activate --key <install>/.ragsuite/license/offline.key --bundle <install>/ragsuite-ee-<ver>.encbundle --restart

Later EE code (same key still valid):
  ragsuite update --bundle ./ragsuite-ee-<new>.encbundle --restart

Renew expired key (vendor sent a new offline.key):
  ragsuite update --key ./offline.key --restart

Do not edit <.ragsuite/license/offline.key> by hand.
Replacing a still-valid key requires update --key … --force (vendor/support).

Options:
  --repo-root <path>
  --dry-run
  --force            Replace an already-installed different key
  --bundle <file>    Local EE pack (.encbundle preferred; .tar.gz still supported)
  --encbundle <file> Alias of --bundle for encrypted packs
  --skip-compat      With --bundle only
  --no-download      Install key only (skip network EE fetch)
  --restart
`;
}

function takeFlag(args, flag) {
  const eq = `${flag}=`;
  for (let i = 0; i < args.length; i += 1) {
    const t = args[i];
    if (t === flag) {
      const v = args[i + 1];
      if (!v || String(v).startsWith('-')) {
        return { value: null, rest: args.filter((_, idx) => idx !== i), present: true };
      }
      return {
        value: v,
        rest: args.filter((_, idx) => idx !== i && idx !== i + 1),
        present: true,
      };
    }
    if (t.startsWith(eq)) {
      return {
        value: t.slice(eq.length),
        rest: args.filter((_, idx) => idx !== i),
        present: true,
      };
    }
  }
  return { value: undefined, rest: args, present: false };
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function looksLikeKeyBlob(text) {
  const t = String(text || '').trim();
  return t.length > 40 && t.includes('.') && !t.includes('\n') && !t.endsWith('.key');
}

function resolveKeyInput(args) {
  const keyPick = takeFlag(args, '--key');
  let rest = keyPick.rest;
  let raw = keyPick.value;

  if (!raw) {
    const positional = rest.find((a) => a && !String(a).startsWith('-'));
    if (positional) {
      raw = positional;
      rest = rest.filter((a) => a !== positional);
    }
  }
  return { raw, rest, present: Boolean(raw) };
}

function loadKeyBlob(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (looksLikeKeyBlob(value)) return value;
  const filePath = path.resolve(value);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return fs.readFileSync(filePath, 'utf8').trim();
  }
  if (value.includes('.')) return value;
  return null;
}

function claimField(verifyPayload, field) {
  const claims = verifyPayload && verifyPayload.claims;
  const url = claims && claims[field];
  if (!url || typeof url !== 'string') return null;
  const t = url.trim();
  if (!t || !/^https?:\/\//i.test(t)) return null;
  return t.replace(/\/$/, '');
}

function readActive(repoRoot) {
  const p = path.join(repoRoot, 'extensions', 'installed', 'ee', 'ACTIVE');
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8').trim() || null;
}

async function verifyLocal(repoRoot, env) {
  const result = runPythonModule(repoRoot, 'app.platform.license_cli', ['status'], {
    env,
    inherit: false,
  });
  if (result.status === 2) {
    error(result.stderr || result.stdout || 'license verify invalid');
    return { ok: false, payload: null };
  }
  let payload = null;
  try {
    payload = JSON.parse(result.stdout || '{}');
  } catch {
    /* ignore */
  }
  if (payload && (payload.state === 'expired' || payload.state === 'invalid')) {
    warn(`license state=${payload.state}${payload.detail ? `: ${payload.detail}` : ''}`);
  } else if (payload) {
    info(`license state=${payload.state}`);
    if (payload.claims) {
      info(`  seats=${payload.claims.seats}`);
    }
  }
  return { ok: result.status === 0, payload };
}

async function maybeRestart(ctx) {
  if (!hasFlag(ctx.commandArgs || [], '--restart') && !ctx.globals.restart) {
    info('Restart when ready: ragsuite restart');
    return 0;
  }
  info('Restarting stack…');
  return restartCmd.run(ctx);
}

/**
 * Build the environment for Python subprocess calls.
 * In production builds, bake RAGSUITE_PRODUCTION_BUILD=1 so Python-side
 * ee_guard.is_production_build() returns True.
 */
function buildPythonEnv(baseEnv) {
  if (!PRODUCTION_BUILD) return baseEnv;
  return { ...baseEnv, RAGSUITE_PRODUCTION_BUILD: '1' };
}

async function installBundleFile(repoRoot, bundlePath, env, skipCompat) {
  const pyArgs = [bundlePath];
  if (skipCompat) pyArgs.push('--skip-compat');
  return runPythonModule(repoRoot, 'app.platform.bundle_install', pyArgs, {
    env: buildPythonEnv(env),
    inherit: true,
  });
}

/**
 * Install an encrypted .encbundle via the Python encbundle module.
 * Requires the offline key blob to derive the KEK.
 */
async function installEncBundleFile(repoRoot, encBundlePath, keyBlob, env, skipCompat) {
  if (!keyBlob) {
    error('--encbundle requires an offline key (--key) to derive the decryption key');
    return 1;
  }
  const pyScript = [
    'from app.platform.encbundle import install_encbundle',
    'from pathlib import Path',
    `import sys`,
    `enc_path = Path(sys.argv[1])`,
    `key_blob = open(sys.argv[2]).read().strip() if sys.argv[2] != '-' else sys.argv[3]`,
    `skip_compat = '--skip-compat' in sys.argv`,
    `install_encbundle(enc_path, key_blob, skip_compat=skip_compat)`,
  ].join('; ');
  // Write key to a temp file so we don't leak it on the command line
  const tmpKeyFile = path.join(os.tmpdir(), `ragsuite-key-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmpKeyFile, keyBlob + '\n', { mode: 0o600 });
    const pyArgs = ['-c', pyScript, encBundlePath, tmpKeyFile];
    if (skipCompat) pyArgs.push('--skip-compat');
    return runPythonModule(repoRoot, null, pyArgs, {
      env: buildPythonEnv(env),
      inherit: true,
      raw: true,  // pass -c script directly
    });
  } finally {
    try { fs.unlinkSync(tmpKeyFile); } catch { /* ignore */ }
  }
}

async function connectLicenseServer(ctx, repoRoot, verifyPayload) {
  const candidates = await licSrv.resolveLicenseBaseUrl({
    env: ctx.env,
    repoRoot,
    claimServerUrl: claimField(verifyPayload, 'license_server_url'),
    claimDiscoveryUrl: claimField(verifyPayload, 'license_discovery_url'),
  });

  for (const baseUrl of candidates) {
    const tryCfg = licSrv.licenseConfig(ctx.env, { baseUrl });
    try {
      const tryHealth = await licSrv.health(tryCfg);
      if (tryHealth.status === 200) {
        licSrv.rememberServerUrl(repoRoot, baseUrl);
        info(`License Server: ${baseUrl}`);
        return tryCfg;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Primary customer path: key → License Server → auto EE download/install.
 */
async function keyActivate(ctx, repoRoot, keyBlob, { bundlePath, encBundlePath, noDownload, force }) {
  if (ctx.globals.dryRun) {
    info(`[dry-run] would install offline key → ${resolveLicenseKeyPath(repoRoot, ctx.env)}`);
    if (bundlePath) info(`[dry-run] would install local bundle ${bundlePath}`);
    else if (!noDownload) info('[dry-run] would auto-download EE from License Server');
    return 0;
  }

  let wrote;
  try {
    wrote = writeLicenseKey(repoRoot, keyBlob, ctx.env, { force: Boolean(force) });
  } catch (err) {
    if (err && err.code === 'LICENSE_EXISTS') {
      error(err.message);
      return 1;
    }
    throw err;
  }
  if (wrote.unchanged) {
    info(`Using installed license key → ${wrote.path}`);
  } else {
    info(`Offline license key → ${wrote.path}`);
  }

  const v = await verifyLocal(repoRoot, ctx.env);
  if (!v.ok || (v.payload && v.payload.state === 'invalid')) {
    return 1;
  }

  // Encrypted bundle path (.encbundle)
  if (encBundlePath) {
    if (requireValidLicenseForEe(repoRoot, ctx.env, { error, info }) !== 0) {
      return 1;
    }
    const eeDir = path.join(repoRoot, 'extensions', 'installed', 'ee');
    info(`Installing encrypted EE bundle into ${eeDir}…`);
    const code = await installEncBundleFile(
      repoRoot,
      encBundlePath,
      keyBlob,
      ctx.env,
      hasFlag(ctx.commandArgs || [], '--skip-compat'),
    );
    if (code !== 0) return code;
    info(`EE ACTIVE → ${readActive(repoRoot)}`);
    info(`Install root: ${repoRoot}`);
    info('Database and .env were not modified.');
    return maybeRestart(ctx);
  }

  if (bundlePath) {
    if (requireValidLicenseForEe(repoRoot, ctx.env, { error, info }) !== 0) {
      return 1;
    }
    const eeDir = path.join(repoRoot, 'extensions', 'installed', 'ee');
    info(`Installing EE into ${eeDir}…`);
    const code = await installBundleFile(
      repoRoot,
      bundlePath,
      ctx.env,
      hasFlag(ctx.commandArgs || [], '--skip-compat'),
    );
    if (code !== 0) return code;
    info(`EE ACTIVE → ${readActive(repoRoot)}`);
    info(`Install root: ${repoRoot}`);
    info('Database and .env were not modified.');
    return maybeRestart(ctx);
  }

  if (noDownload) {
    info('Key installed (--no-download). Run without --no-download to fetch EE.');
    return maybeRestart(ctx);
  }

  const cfg = await connectLicenseServer(ctx, repoRoot, v.payload);
  if (!cfg) {
    warn('License Server not reachable. Key is installed; EE auto-download skipped.');
    warn('Vendor must host License API at https://license.ragsuite.de (or set RAGSUITE_LICENSE_URL for lab).');
    warn('Air-gap: --bundle ./ragsuite-ee-<ver>.tar.gz');
    return maybeRestart(ctx);
  }

  const installed = readActive(repoRoot);
  info(`Requesting EE bundle (installed=${installed || 'none'})…`);
  let plan;
  try {
    plan = await licSrv.customerEePlan(cfg, {
      offlineKey: keyBlob,
      installedEeVersion: installed,
    });
  } catch (err) {
    warn(`License Server plan error: ${err.message || err}`);
    warn('Key is installed. EE auto-download skipped.');
    return maybeRestart(ctx);
  }
  if (plan.status === 401 || plan.status === 404) {
    warn(`License Server could not authorize EE download (${plan.status}). Key is installed.`);
    warn('Air-gap: --bundle ./ragsuite-ee-<ver>.tar.gz');
    return maybeRestart(ctx);
  }
  if (plan.status !== 200 || !plan.json) {
    error(`EE plan failed: ${plan.status} ${plan.text}`);
    return 1;
  }
  const p = plan.json;
  if (!p.ok || !p.download_allowed) {
    warn(p.detail || 'EE download not allowed for this key');
    warn('Key remains installed; existing EE/data left as-is.');
    return maybeRestart(ctx);
  }

  info(`Latest EE: ${p.latest_ee_version}`);
  if (!p.ee_update_needed && installed === p.latest_ee_version) {
    info(`Already on EE ${installed} — nothing to download`);
    return maybeRestart(ctx);
  }

  const tmp = path.join(os.tmpdir(), `ragsuite-ee-${p.latest_ee_version}.tar.gz`);
  info(`Downloading EE ${p.latest_ee_version}…`);
  try {
    await licSrv.customerEeDownload(cfg, p.download_token, tmp);
  } catch (err) {
    error(err.message || String(err));
    return 1;
  }

    info('Installing EE (replaces previous EE code under extensions/installed/ee/; data untouched)…');
  const code = await installBundleFile(
    repoRoot,
    tmp,
    ctx.env,
    hasFlag(ctx.commandArgs || [], '--skip-compat'),
  );
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  if (code !== 0) return code;

  info(`EE ACTIVE → ${readActive(repoRoot)}`);
  info('Database and .env were not modified.');
  return maybeRestart(ctx);
}

async function run(ctx) {
  const args = [...(ctx.commandArgs || [])];
  if (args.includes('--help') || args.includes('-h')) {
    info(help());
    return 0;
  }

  const { raw, rest } = resolveKeyInput(args);
  const bundlePick = takeFlag(rest, '--bundle');
  const encBundlePick = takeFlag(bundlePick.rest, '--encbundle');
  const noDownload = hasFlag(args, '--no-download');
  // --force is a global flag (stripped from commandArgs by the parser)
  const force = Boolean(ctx.globals.force) || hasFlag(args, '--force');

  const repoRoot = resolveRepoRoot({
    cwd: ctx.cwd,
    repoRootFlag: ctx.globals.repoRoot,
  });

  let resolvedBundle = null;
  if (bundlePick.value) {
    const found = resolveBundlePath(bundlePick.value, repoRoot);
    if (!found.path && !ctx.globals.dryRun) {
      error(bundleNotFoundMessage(bundlePick.value, found.tried, repoRoot));
      return 1;
    }
    resolvedBundle = found.path || path.resolve(bundlePick.value);
    if (found.path && path.resolve(bundlePick.value) !== found.path) {
      info(`Using bundle: ${found.path}`);
    }
  }

  // Handle encrypted bundle (.encbundle) path — also when --bundle points at .encbundle
  let resolvedEncBundle = null;
  if (encBundlePick.value) {
    const p = path.resolve(encBundlePick.value);
    if (!fs.existsSync(p) && !ctx.globals.dryRun) {
      error(`Encrypted bundle not found: ${p}`);
      return 1;
    }
    resolvedEncBundle = p;
    info(`Using encrypted bundle: ${p}`);
  } else if (resolvedBundle && String(resolvedBundle).toLowerCase().endsWith('.encbundle')) {
    resolvedEncBundle = resolvedBundle;
    resolvedBundle = null;
    info(`Using encrypted bundle: ${resolvedEncBundle}`);
  }

  if (!raw) {
    const existing = readLicenseKey(repoRoot, ctx.env);
    if (existing) {
      info('Using installed offline.key (do not replace unless vendor renews)');
      return keyActivate(ctx, repoRoot, existing, {
        bundlePath: resolvedBundle,
        encBundlePath: resolvedEncBundle,
        noDownload,
        force: false,
      });
    }
    error('Provide a license key: ragsuite ee-activate <install>/.ragsuite/license/offline.key');
    info('');
    info(help());
    return 1;
  }

  const blob = loadKeyBlob(raw);
  if (!blob) {
    error(`Could not read license key from: ${raw}`);
    return 1;
  }

  return keyActivate(ctx, repoRoot, blob, {
    bundlePath: resolvedBundle,
    encBundlePath: resolvedEncBundle,
    noDownload,
    force,
  });
}

module.exports = { name, summary, help, run, keyActivate, loadKeyBlob, readActive, installEncBundleFile };
