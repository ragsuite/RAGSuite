'use strict';

/**
 * CLI smoke tests — no Jest. Exit 0 on success.
 */

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { assertPortsFree } = require('../src/utils/port');
const { readEnvValue } = require('../src/utils/env-file');
const {
  defaultInstallDir,
  isHomeDefaultCollidingWithSource,
} = require('../src/utils/paths');

const CLI_ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(CLI_ROOT, 'src', 'index.js');
const BIN = path.join(CLI_ROOT, 'bin', 'ragsuite.js');

function findMonorepoRoot() {
  const fromEnv = process.env.RAGSUITE_REPO_ROOT || process.env.GITHUB_WORKSPACE;
  if (fromEnv && fs.existsSync(path.join(fromEnv, 'scripts', 'native-start.sh'))) {
    return path.resolve(fromEnv);
  }
  let current = path.resolve(CLI_ROOT, '..');
  for (;;) {
    if (fs.existsSync(path.join(current, 'scripts', 'native-start.sh'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [INDEX, ...args], {
    cwd: options.cwd || CLI_ROOT,
    env: {
      ...process.env,
      RAGSUITE_TEST_SKIP_PORT_CHECK: '1',
      ...(options.env || {}),
    },
    encoding: 'utf8',
  });
  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function runBin(args, options = {}) {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd: options.cwd || CLI_ROOT,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
  });
  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function assert(cond, message) {
  if (!cond) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ragsuite-cli-'));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  for (const name of [
    'docker-start.sh',
    'docker-stop.sh',
    'native-start.sh',
    'native-stop.sh',
    'doctor.sh',
  ]) {
    const p = path.join(dir, 'scripts', name);
    fs.writeFileSync(p, `#!/bin/bash\necho stub-${name}\nexit 0\n`, 'utf8');
    fs.chmodSync(p, 0o755);
  }
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'ragsuite-fixture', private: true }, null, 2),
  );
  fs.writeFileSync(path.join(dir, 'docker-compose.yml'), 'services: {}\n');
  fs.writeFileSync(
    path.join(dir, '.env.example'),
    [
      'JWT_SECRET_KEY=change-me-use-a-long-random-secret-in-production',
      'CUSTOM_LLM_INTERNAL_API_KEY=ragsuite-default-llm-internal-key',
      'SMTP_HOST=smtp.gmail.com',
      'SMTP_PORT=587',
      'SMTP_USER=smoke@example.com',
      'SMTP_PASSWORD=smoke-smtp-password',
      'SMTP_USE_TLS=true',
      'EMAIL_FROM=smoke@example.com',
      '',
    ].join('\n'),
  );
  return dir;
}

async function main() {
  console.log('==> CLI smoke');

  const homeDefault = defaultInstallDir();
  assert(homeDefault === path.join(os.homedir(), 'ragsuite'), `default install must be ~/ragsuite: ${homeDefault}`);
  assert(!/ragsuite-app|ragsuite-test/.test(homeDefault), `default install must not use legacy names: ${homeDefault}`);

  assert(fs.existsSync(BIN), 'bin/ragsuite.js missing');
  const shebang = fs.readFileSync(BIN, 'utf8').split('\n')[0];
  assert(shebang.startsWith('#!/usr/bin/env node'), `bad shebang: ${shebang}`);

  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.on('error', reject);
  });
  const busyPort = server.address().port;
  let threw = false;
  try {
    await assertPortsFree([{ port: busyPort, label: 'test' }]);
  } catch (err) {
    threw = err && err.code === 'PORT_IN_USE';
  }
  server.close();
  assert(threw, 'assertPortsFree should fail when port busy');

  if (isHomeDefaultCollidingWithSource(homeDefault)) {
    const blocked = runCli(['init', '--yes']);
    assert(blocked.status !== 0, 'bare init must not target this source checkout as ~/ragsuite');
    assert(
      /source checkout/i.test(`${blocked.stdout}\n${blocked.stderr}`),
      `collision hint: ${blocked.stdout}\n${blocked.stderr}`,
    );
  }

  let r = runBin(['version']);
  assert(r.status === 0, `bin version exit ${r.status}: ${r.stderr}`);
  assert(r.stdout.includes('@ragsuite/ragsuite@'), `bin version: ${r.stdout}`);
  assert(/npm install -g/i.test(r.stdout), `version should show npm -g upgrade hint: ${r.stdout}`);

  r = runCli(['--help']);
  assert(r.status === 0, `--help exit ${r.status}`);
  assert(r.stdout.includes('Commands:'), '--help missing Commands');
  assert(r.stdout.includes('Usage: ragsuite'), '--help should prefer ragsuite usage');
  assert(/Platform Manager/i.test(r.stdout), 'help should brand Platform Manager');
  assert(/npm install -g/i.test(r.stdout), 'help must show global npm install');
  assert(r.stdout.includes('no Docker') || /native/i.test(r.stdout) || /Typical Community flow/i.test(r.stdout), 'help should mention flow/native');
  assert(!r.stdout.includes('--from-images'), 'help must not document --from-images');
  assert(!r.stdout.includes('--from-zip'), 'help must not document --from-zip');
  assert(/no offline key required/i.test(r.stdout), 'help must state Community needs no offline key');
  for (const cmd of ['extensions', 'status', 'bundle', 'license', 'activate', 'plugins']) {
    assert(r.stdout.includes(cmd), `--help must list ${cmd}`);
  }

  r = runCli(['init', '--yes', '--from-git', '--repo-root', '/tmp/x']);
  assert(r.status !== 0, 'from-git + repo-root together should fail');

  r = runCli(['init', '--from-images', '--yes']);
  assert(r.status !== 0, '--from-images should fail (removed)');
  assert(/from-images was removed/i.test(r.stderr + r.stdout), `from-images error: ${r.stderr}`);

  r = runCli(['init', '--help']);
  assert(r.status === 0, 'init --help');
  assert(
    r.stdout.includes('--docker') || r.stdout.includes('docker'),
    'init help should document docker option',
  );
  assert(!r.stdout.includes('--from-images'), 'init help must not document --from-images');
  assert(!r.stdout.includes('--from-zip'), 'init help must not document --from-zip');

  r = runCli(['version']);
  assert(r.status === 0, `version exit ${r.status}`);

  r = runCli(['not-a-command']);
  assert(r.status !== 0, 'invalid command should be non-zero');

  const fixture = makeFixture();
  try {
    r = runCli([
      'init',
      '--yes',
      '--repo-root',
      fixture,
    ]);
    assert(r.status === 0, `init exit ${r.status}: ${r.stderr}\n${r.stdout}`);
    const cfgPath = path.join(fixture, '.ragsuite-cli', 'config.json');
    assert(fs.existsSync(cfgPath), 'config.json missing after init');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    assert(cfg.mode === 'native', 'config mode must be native');
    assert(cfg.source === 'checkout', 'config source');
    assert(fs.existsSync(path.join(fixture, '.env')), '.env should be created');
    const jwt = readEnvValue(path.join(fixture, '.env'), 'JWT_SECRET_KEY');
    assert(jwt && !jwt.startsWith('change-me'), `JWT should be generated: ${jwt}`);
    const llm = readEnvValue(path.join(fixture, '.env'), 'CUSTOM_LLM_INTERNAL_API_KEY');
    assert(llm === 'ragsuite-default-llm-internal-key', `LLM key from example: ${llm}`);
    const smtpPw = readEnvValue(path.join(fixture, '.env'), 'SMTP_PASSWORD');
    assert(smtpPw === 'smoke-smtp-password', `SMTP_PASSWORD from example: ${smtpPw}`);

    // Switch saved mode to docker without re-clone
    cfg.mode = 'docker';
    fs.writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);
    r = runCli(['start', '--dry-run', '--repo-root', fixture]);
    assert(r.status === 0, `docker start dry-run ${r.status}`);
    assert(r.stdout.includes('docker-start.sh'), `docker start script: ${r.stdout}`);

    r = runCli(['start', '--dry-run', '--mode', 'native', '--repo-root', fixture]);
    assert(r.status === 0, `native override dry-run ${r.status}`);
    assert(r.stdout.includes('native-start.sh'), `native override: ${r.stdout}`);

    // Restore native mode for remaining tests
    cfg.mode = 'native';
    fs.writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);

    fs.writeFileSync(path.join(fixture, '.env'), 'EXISTING=1\nJWT_SECRET_KEY=keep\n');
    r = runCli([
      'init',
      '--yes',
      '--repo-root',
      fixture,
    ]);
    assert(r.status === 0, `re-init on existing install should exit 0: ${r.stderr}\n${r.stdout}`);
    assert(/Already installed/i.test(r.stdout), `expected Already installed: ${r.stdout}`);
    assert(
      fs.readFileSync(path.join(fixture, '.env'), 'utf8').includes('EXISTING=1'),
      'init must not clobber .env',
    );

    r = runCli(['start', '--dry-run'], { cwd: os.tmpdir() });
    assert(r.status === 0, `start via active install exit ${r.status}: ${r.stderr}\n${r.stdout}`);
    assert(r.stdout.includes('native-start.sh'), `start dry-run path: ${r.stdout}`);

    r = runCli(['restart', '--dry-run'], { cwd: os.tmpdir() });
    assert(r.status === 0, `restart dry-run exit ${r.status}: ${r.stderr}\n${r.stdout}`);
    assert(/would stop then start/i.test(r.stdout), `restart dry-run: ${r.stdout}`);

    r = runCli(['update', '--dry-run'], { cwd: os.tmpdir() });
    assert(r.status === 0, `update dry-run exit ${r.status}: ${r.stderr}\n${r.stdout}`);
    assert(/npm install -g/i.test(r.stdout), `update should upgrade CLI: ${r.stdout}`);
    assert(/git pull|would update/i.test(r.stdout), `update dry-run app: ${r.stdout}`);

    r = runCli(['logs', '--help']);
    assert(r.status === 0, 'logs --help');
    assert(/frontend/i.test(r.stdout) && /api/i.test(r.stdout), `logs help services: ${r.stdout}`);

    r = runCli(['start', '--dry-run', '--repo-root', fixture]);
    assert(r.status === 0, `start dry-run exit ${r.status}`);
    assert(r.stdout.includes('native-start.sh'), `start dry-run path: ${r.stdout}`);

    r = runCli(['stop', '--dry-run', '--repo-root', fixture]);
    assert(r.status === 0, `stop dry-run exit ${r.status}`);
    assert(r.stdout.includes('native-stop.sh'), `stop dry-run path: ${r.stdout}`);

    const nonempty = fs.mkdtempSync(path.join(os.tmpdir(), 'ragsuite-ne-'));
    fs.writeFileSync(path.join(nonempty, 'keep.txt'), 'x');
    r = runCli([
      'init',
      '--yes',
      '--from-git',
      'file:///no/such/repo',
      '--install-dir',
      nonempty,
    ]);
    assert(r.status !== 0, 'nonempty install without --force should fail');
    fs.rmSync(nonempty, { recursive: true, force: true });
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }

  const repoRoot = findMonorepoRoot();
  assert(repoRoot, 'could not find monorepo root for doctor smoke');

  r = runCli(['start', '--dry-run', '--repo-root', repoRoot]);
  assert(r.status === 0, `repo start dry-run exit ${r.status}`);
  assert(r.stdout.includes('native-start.sh'), `repo start dry-run: ${r.stdout}`);

  r = runCli(['doctor', '--repo-root', repoRoot]);
  assert(r.status === 0 || r.status === 1, `doctor unexpected exit ${r.status}`);

  // Phase 9 — Platform Manager surface (offline)
  // Use an isolated key path so smoke never overwrites/clears a real customer key.
  const smokeLicPath = path.join(os.tmpdir(), `ragsuite-smoke-offline-${Date.now()}.key`);
  const smokeLicEnv = {
    RAGSUITE_LICENSE_FILE: smokeLicPath,
    // Ephemeral smoke keypairs swap public.pem; skip pin only in non-production.
    RAGSUITE_SKIP_PUBLIC_KEY_PIN: '1',
  };

  r = runCli(['status', '--repo-root', repoRoot], { env: smokeLicEnv });
  assert(r.status === 0, `status exit ${r.status}: ${r.stderr}\n${r.stdout}`);
  assert(/license:.*absent/i.test(r.stdout), `status should show absent license: ${r.stdout}`);

  r = runCli(['bundle', 'list', '--repo-root', repoRoot]);
  assert(r.status === 0, `bundle list exit ${r.status}: ${r.stderr}\n${r.stdout}`);

  r = runCli(['extensions', '--repo-root', repoRoot]);
  assert(r.status === 0, `extensions exit ${r.status}: ${r.stderr}\n${r.stdout}`);
  assert(/documents|system_health|chat/i.test(r.stdout), `extensions should list CE modules: ${r.stdout}`);

  r = runCli(['plugins', '--repo-root', repoRoot, '--json']);
  assert(r.status === 0, `plugins --json exit ${r.status}: ${r.stderr}`);

  const keyFile = path.join(os.tmpdir(), `ragsuite-dummy-key-${Date.now()}.key`);
  fs.writeFileSync(keyFile, 'dummy.offline.key.blob.for.phase9\n', 'utf8');
  try {
    r = runCli(['license', 'install', keyFile, '--repo-root', repoRoot], { env: smokeLicEnv });
    // Invalid blob may exit 2 after verify — install itself should write file first
    assert(r.status === 0 || r.status === 2, `license install exit ${r.status}: ${r.stderr}\n${r.stdout}`);
    r = runCli(['license', 'status', '--repo-root', repoRoot], { env: smokeLicEnv });
    assert(r.status === 0 || r.status === 2, `license status exit ${r.status}: ${r.stderr}\n${r.stdout}`);
    assert(/absent|invalid|present|expired|valid|grace|state/i.test(r.stdout), `license status: ${r.stdout}`);
    r = runCli(['license', 'clear', '--repo-root', repoRoot], { env: smokeLicEnv });
    assert(r.status !== 0, `license clear without --force should refuse: ${r.stdout}\n${r.stderr}`);
    r = runCli(['license', 'clear', '--force', '--repo-root', repoRoot], { env: smokeLicEnv });
    assert(r.status === 0, `license clear --force exit ${r.status}: ${r.stderr}\n${r.stdout}`);
  } finally {
    try {
      fs.unlinkSync(keyFile);
    } catch {
      /* ignore */
    }
    try {
      if (fs.existsSync(smokeLicPath)) fs.unlinkSync(smokeLicPath);
    } catch {
      /* ignore */
    }
  }

  // Phase 10 — signed offline activate (ephemeral keypair + temporary public.pem)
  const pubPath = path.join(repoRoot, 'backend', 'vendor', 'ragsuite_license_verify', 'keys', 'public.pem');
  const pubBackup = `${pubPath}.smoke-bak`;
  let signedKeyFile = path.join(os.tmpdir(), `ragsuite-signed-${Date.now()}.key`);
  const pyBin = path.join(repoRoot, 'backend', '.venv', 'bin', 'python');
  const pyOk = fs.existsSync(pyBin);
  try {
  if (pyOk && fs.existsSync(path.dirname(pubPath))) {
    if (fs.existsSync(pubPath)) fs.copyFileSync(pubPath, pubBackup);
    const genScript = `
import base64, json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
key = Ed25519PrivateKey.generate()
pub = key.public_key().public_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PublicFormat.SubjectPublicKeyInfo,
)
Path(${JSON.stringify(pubPath)}).write_bytes(pub)
now = datetime.now(timezone.utc)
claims = {
  "schema": "ragsuite.license.v1",
  "license_id": "smoke-lic",
  "customer_id": "smoke-cust",
  "seats": 2,
  "entitlements": ["sso", "organization"],
  "valid_from": (now - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "valid_to": (now + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "grace_days": 14,
}
payload = json.dumps(claims, sort_keys=True, separators=(",", ":")).encode()
sig = key.sign(payload)
def b64(d):
  return base64.urlsafe_b64encode(d).rstrip(b"=").decode()
print(b64(payload) + "." + b64(sig))
`;
    const signed = spawnSync(pyBin, ['-c', genScript], { encoding: 'utf8' });
    assert(signed.status === 0, `sign smoke key failed: ${signed.stderr}`);
    fs.writeFileSync(signedKeyFile, `${signed.stdout.trim()}\n`, 'utf8');
    r = runCli(
      ['activate', '--key', signedKeyFile, '--no-download', '--repo-root', repoRoot],
      { env: smokeLicEnv },
    );
    assert(r.status === 0, `activate --key exit ${r.status}: ${r.stderr}\n${r.stdout}`);
    r = runCli(['license', 'status', '--repo-root', repoRoot], { env: smokeLicEnv });
    assert(r.status === 0, `license status after activate: ${r.status} ${r.stderr}\n${r.stdout}`);
    assert(/valid|grace/i.test(r.stdout), `expected valid license: ${r.stdout}`);

    // Gate helper: valid key allows EE
    const { assessEeLicense } = require('../src/utils/license-gate');
    const okGate = assessEeLicense(repoRoot, { ...process.env, ...smokeLicEnv });
    assert(okGate.allowed && (okGate.state === 'valid' || okGate.state === 'grace'), `valid gate: ${JSON.stringify(okGate)}`);

    // Expired signed key → EE install refused
    const expiredScript = `
import base64, json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
key = Ed25519PrivateKey.generate()
pub = key.public_key().public_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PublicFormat.SubjectPublicKeyInfo,
)
Path(${JSON.stringify(pubPath)}).write_bytes(pub)
now = datetime.now(timezone.utc)
claims = {
  "schema": "ragsuite.license.v1",
  "license_id": "smoke-expired",
  "customer_id": "smoke-cust",
  "seats": 1,
  "entitlements": ["sso"],
  "valid_from": (now - timedelta(days=60)).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "valid_to": (now - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "grace_days": 0,
}
payload = json.dumps(claims, sort_keys=True, separators=(",", ":")).encode()
sig = key.sign(payload)
def b64(d):
  return base64.urlsafe_b64encode(d).rstrip(b"=").decode()
print(b64(payload) + "." + b64(sig))
`;
    const expiredSigned = spawnSync(pyBin, ['-c', expiredScript], { encoding: 'utf8' });
    assert(expiredSigned.status === 0, `sign expired key failed: ${expiredSigned.stderr}`);
    const expiredKeyFile = path.join(os.tmpdir(), `ragsuite-expired-${Date.now()}.key`);
    fs.writeFileSync(expiredKeyFile, `${expiredSigned.stdout.trim()}\n`, 'utf8');
    r = runCli(
      ['license', 'install', expiredKeyFile, '--force', '--repo-root', repoRoot],
      { env: smokeLicEnv },
    );
    assert(r.status === 0 || r.status === 2, `install expired key: ${r.status} ${r.stderr}`);
    const expGate = assessEeLicense(repoRoot, { ...process.env, ...smokeLicEnv });
    assert(!expGate.allowed && expGate.state === 'expired', `expired gate: ${JSON.stringify(expGate)}`);

    const fakeTar = path.join(os.tmpdir(), `ragsuite-ee-9.9.9-smoke.tar.gz`);
    fs.writeFileSync(fakeTar, 'not-a-real-tar');
    r = runCli(
      ['activate', '--key', expiredKeyFile, '--force', '--bundle', fakeTar, '--repo-root', repoRoot],
      { env: smokeLicEnv },
    );
    assert(r.status !== 0, `activate --bundle with expired key must refuse: ${r.stdout}\n${r.stderr}`);
    assert(/expired|refused|invalid/i.test(`${r.stdout}\n${r.stderr}`), `expired refuse msg: ${r.stdout}\n${r.stderr}`);
    try { fs.unlinkSync(expiredKeyFile); } catch { /* ignore */ }
    try { fs.unlinkSync(fakeTar); } catch { /* ignore */ }

    r = runCli(['license', 'clear', '--repo-root', repoRoot], { env: smokeLicEnv });
    assert(r.status !== 0, `clear without --force should refuse: ${r.status}`);
    r = runCli(['license', 'clear', '--force', '--repo-root', repoRoot], { env: smokeLicEnv });
    assert(r.status === 0, `clear after activate: ${r.status}`);

    const absentGate = assessEeLicense(repoRoot, { ...process.env, ...smokeLicEnv });
    assert(!absentGate.allowed && absentGate.state === 'absent', `absent gate: ${JSON.stringify(absentGate)}`);

    r = runCli(
      ['update', '--bundle', path.join(os.tmpdir(), 'missing-ee.tar.gz'), '--dry-run', '--repo-root', repoRoot],
      { env: smokeLicEnv },
    );
    assert(r.status !== 0, `update --bundle without key must refuse: ${r.stdout}\n${r.stderr}`);
    assert(
      /activate --key/i.test(`${r.stdout}\n${r.stderr}`),
      `absent update --bundle must point to activate: ${r.stdout}\n${r.stderr}`,
    );

    // First-time must NOT work via update --key (activate only)
    const firstKey = path.join(os.tmpdir(), `ragsuite-first-${Date.now()}.key`);
    fs.writeFileSync(firstKey, 'dummy.notavalidkeybutpresent', 'utf8');
    r = runCli(
      [
        'update',
        '--key',
        firstKey,
        '--bundle',
        path.join(os.tmpdir(), 'missing-ee.tar.gz'),
        '--dry-run',
        '--repo-root',
        repoRoot,
      ],
      { env: smokeLicEnv },
    );
    assert(r.status !== 0, `update --key without prior activate must refuse: ${r.stdout}\n${r.stderr}`);
    assert(/activate/i.test(`${r.stdout}\n${r.stderr}`), `must mention activate: ${r.stdout}\n${r.stderr}`);
    try { fs.unlinkSync(firstKey); } catch { /* ignore */ }
  }
  } finally {
    try {
      if (fs.existsSync(pubBackup)) {
        fs.copyFileSync(pubBackup, pubPath);
        fs.unlinkSync(pubBackup);
      }
    } catch {
      /* ignore */
    }
    try {
      if (signedKeyFile && fs.existsSync(signedKeyFile)) fs.unlinkSync(signedKeyFile);
    } catch {
      /* ignore */
    }
  }
  try {
    if (fs.existsSync(smokeLicPath)) fs.unlinkSync(smokeLicPath);
  } catch {
    /* ignore */
  }

  r = runCli(['bundle', 'install', path.join(os.tmpdir(), 'missing-ee.tar.gz'), '--dry-run', '--repo-root', repoRoot], {
    env: { RAGSUITE_LICENSE_FILE: path.join(os.tmpdir(), `ragsuite-absent-${Date.now()}.key`) },
  });
  assert(r.status !== 0, `bundle install without key must refuse: ${r.stdout}\n${r.stderr}`);

  r = runCli(['bundle', 'use', '0.1.0', '--dry-run', '--repo-root', repoRoot]);
  assert(r.status === 0, `bundle use dry-run ${r.status}`);

  r = runCli(['update', '--dry-run', '--repo-root', repoRoot]);
  assert(r.status === 0, `update dry-run ${r.status}: ${r.stderr}\n${r.stdout}`);

  const missingLic = path.join(os.tmpdir(), `ragsuite-missing-${Date.now()}.key`);
  r = runCli(['activate', '--repo-root', repoRoot], {
    env: { RAGSUITE_LICENSE_FILE: missingLic },
  });
  assert(r.status !== 0, 'bare activate should fail without a key');
  const readme = fs.readFileSync(path.join(CLI_ROOT, 'README.md'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'));
  assert(pkg.version === '1.0.1', `expected CLI 1.0.1, got ${pkg.version}`);
  const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert(rootPkg.version === pkg.version, `root ${rootPkg.version} must match CLI ${pkg.version}`);
  const platformPy = fs.readFileSync(path.join(repoRoot, 'backend', 'app', 'platform', 'version.py'), 'utf8');
  assert(
    platformPy.includes(`PLATFORM_VERSION = "${pkg.version}"`),
    `PLATFORM_VERSION must be ${pkg.version}`,
  );
  assert(Array.isArray(pkg.keywords) && pkg.keywords.includes('ragsuite'), 'package.json must include keywords');
  assert(pkg.keywords.includes('self-hosted'), 'keywords must include self-hosted');

  assert(/activate --key/i.test(readme) && /--bundle/i.test(readme), 'README must document activate --bundle');
  assert(/\.encbundle/i.test(readme), 'README must document emailed .encbundle pack');
  assert(/update --bundle/i.test(readme), 'README must document update --bundle for EE bumps');
  assert(/update --key/i.test(readme), 'README must document update --key for renewals');
  assert(/First-time Enterprise — always `activate`/i.test(readme), 'README must say first-time uses activate');
  assert(!/update --key .*--bundle.*First/i.test(readme), 'README must not list update as first-time activate');
  assert(!/license activation/i.test(readme), 'README must not say "license activation" (CI wording gate)');
  assert(!/\bCE\/EE\b/.test(readme), 'README must not say CE/EE (CI wording gate)');
  assert(!/--from-zip/.test(readme), 'README must not document --from-zip');
  assert(!/--from-images/.test(readme), 'README must not document --from-images');
  assert(/ragsuite update/i.test(readme), 'README must document update');
  assert(/npm install -g @ragsuite\/ragsuite/i.test(readme), 'README must show npm -g install');
  assert(/Prerequisites/i.test(readme), 'README must have Prerequisites');
  assert(/9191/.test(readme), 'README must document Expo/Docker web :9191');
  assert(!/docker → http:\/\/localhost:9091/.test(readme), 'README must not say docker UI is :9091');
  assert(/--docker/.test(readme), 'README must document --docker');
  assert(/ragsuite logs/i.test(readme), 'README must document logs');
  assert(/ragsuite extensions/i.test(readme), 'README must document extensions');
  assert(/ragsuite license/i.test(readme), 'README must document license');
  assert(/https:\/\/www\.ragsuite\.de/.test(readme), 'README must link the official website');
  assert(
    /https:\/\/github\.com\/ragsuite\/RAGSuite/.test(readme),
    'README must link the Community Edition GitHub repo',
  );
  const { DEFAULT_GIT_URL } = require('../src/utils/git-install');
  assert(
    DEFAULT_GIT_URL === 'https://github.com/ragsuite/RAGSuite.git',
    `DEFAULT_GIT_URL must be the CE repo: ${DEFAULT_GIT_URL}`,
  );
  assert(
    /https:\/\/github\.com\/ragsuite\/RAGSuite\/blob\/main\/cli\/LICENSE/.test(readme),
    'README license link must be a GitHub URL (npm-safe)',
  );
  assert(
    /https:\/\/github\.com\/ragsuite\/RAGSuite\/blob\/main\/cli\/NOTICE/.test(readme),
    'README NOTICE link must be a GitHub URL (npm-safe)',
  );
  assert(/Windows/i.test(readme) && /macOS/i.test(readme) && /Linux/i.test(readme), 'README must cover OS');
  assert(/Python.*3\.14/i.test(readme), 'README must document Python 3.14');
  assert(/SMTP/i.test(readme), 'README must document SMTP setup');
  assert(/smoke/i.test(readme), 'README must mention smoke SMTP vs real mail');
  assert(fs.existsSync(path.join(CLI_ROOT, 'TEST_DISTRIBUTION.md')), 'TEST_DISTRIBUTION.md missing');

  // Command surface smoke — each published command must answer --help
  const cmds = [
    'init', 'start', 'stop', 'restart', 'logs', 'doctor', 'update', 'version',
    'status', 'extensions', 'plugins', 'bundle', 'license', 'activate', 'ee-activate',
  ];
  for (const cmd of cmds) {
    const hr = runCli([cmd, '--help']);
    assert(hr.status === 0, `${cmd} --help exit ${hr.status}: ${hr.stderr}`);
    assert(/Usage:/i.test(hr.stdout), `${cmd} --help missing Usage: ${hr.stdout.slice(0, 200)}`);
  }

  const updHelp = runCli(['update', '--help']);
  assert(/--bundle/i.test(updHelp.stdout), 'update --help must document --bundle');

  const actHelp = runCli(['activate', '--help']);
  assert(/--bundle/i.test(actHelp.stdout), 'activate --help must document --bundle');

  const { collectEnvConfigIssues, isSmokeSmtpValue } = require('../src/utils/env-file');
  assert(isSmokeSmtpValue('smoke-smtp@localhost'), 'isSmokeSmtpValue should flag smoke user');
  const smokeIssues = collectEnvConfigIssues({
    JWT_SECRET_KEY: 'a'.repeat(40),
    CUSTOM_LLM_INTERNAL_API_KEY: 'ragsuite-default-llm-internal-key',
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_USER: 'smoke-smtp@localhost',
    SMTP_PASSWORD: 'ci-smoke-smtp-not-for-production',
    EMAIL_FROM: 'smoke-smtp@localhost',
  });
  assert(
    smokeIssues.some((i) => /SMTP/i.test(i.title)),
    'collectEnvConfigIssues must flag smoke SMTP as not OK',
  );

  console.log('CLI smoke: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
