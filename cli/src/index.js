#!/usr/bin/env node
'use strict';

const { parseArgv } = require('./utils/args');
const { error, info } = require('./utils/log');

const commands = {
  init: require('./commands/init'),
  start: require('./commands/start'),
  stop: require('./commands/stop'),
  restart: require('./commands/restart'),
  doctor: require('./commands/doctor'),
  logs: require('./commands/logs'),
  update: require('./commands/update'),
  version: require('./commands/version'),
  activate: require('./commands/activate'),
  'ee-activate': require('./commands/ee-activate'),
  license: require('./commands/license'),
  bundle: require('./commands/bundle'),
  status: require('./commands/status'),
  extensions: require('./commands/extensions'),
  plugins: require('./commands/plugins'),
};

function globalHelp() {
  const lines = [
    'RAGSuite Platform Manager (CLI)',
    '',
    'Install / upgrade (global — required for the ragsuite command):',
    '  npm install -g @ragsuite/ragsuite@latest',
    '',
    'Usage: ragsuite <command> [options]',
    '',
    'Typical Community flow (no offline key required):',
    '  ragsuite init              # native (default) or --docker',
    '  ragsuite start             # API :9090 · UI :9191',
    '  ragsuite doctor',
    '  ragsuite stop',
    '',
    'Enterprise (optional — vendor emails offline.key + EE encbundle):',
    '  ragsuite activate --key ./offline.key --bundle ./ragsuite-ee-0.1.2.encbundle --restart',
    '  ragsuite update --bundle ./ragsuite-ee-0.2.0.encbundle --restart   # same key, new pack',
    '  ragsuite status · extensions · bundle list · license status',
    '',
    'Also: logs · restart · version · plugins · ee-activate',
    '',
    'Commands:',
  ];
  for (const cmd of Object.values(commands)) {
    lines.push(`  ${cmd.name.padEnd(12)} ${cmd.summary}`);
  }
  lines.push(
    '',
    'Global options:',
    '  --help, -h              Show help',
    '  --repo-root <path>      Override active install',
    '  --from-git [url]        init: clone source (default public repo)',
    '  --install-dir <path>    init: install target (default ~/ragsuite)',
    '  --docker                init/start/stop: Docker Compose mode',
    '  --mode <native|docker>  Override run mode',
    '  --llm-api-key <key>     init: optional LLM key override',
    '  --smtp-host <host>      init: optional SMTP override',
    '  --smtp-user <user>      init: optional SMTP override',
    '  --smtp-password <pass>  init: optional SMTP override',
    '  --email-from <email>    init: optional SMTP override',
    '  --force                 Destructive/support: init wipe; replace/clear offline key',
    '  --yes, -y               Non-interactive (init default = native)',
    '  --dry-run               Print actions without running',
    '',
    'Active install: ~/.ragsuite/config.json (set by init)',
    'Env: RAGSUITE_REPO_ROOT or RAGSUITE_INSTALL_DIR',
    'Offline key: <install>/.ragsuite/license/offline.key (optional)',
    '',
    'Run ragsuite <command> --help for command details.',
  );
  return lines.join('\n');
}

async function main(argv = process.argv) {
  let parsed;
  try {
    parsed = parseArgv(argv);
  } catch (err) {
    error(err.message || String(err));
    return 1;
  }

  const { globals, command, commandArgs, commandHelp } = parsed;

  if (!command) {
    info(globalHelp());
    return 0;
  }

  const cmd = commands[command];
  if (!cmd) {
    error(`Unknown command: ${command}`);
    info('');
    info(globalHelp());
    return 1;
  }

  if (globals.help || commandHelp) {
    info(cmd.help());
    return 0;
  }

  const ctx = {
    cwd: process.cwd(),
    env: process.env,
    globals,
    commandArgs,
  };

  try {
    const result = cmd.run(ctx);
    const code = typeof result?.then === 'function' ? await result : result;
    return typeof code === 'number' ? code : 0;
  } catch (err) {
    if (err && (err.code === 'NOT_REPO_ROOT' || err.code === 'USAGE' || err.code === 'INSTALL_DIR_NONEMPTY' || err.code === 'ENV_EXISTS' || err.code === 'ENV_INCOMPLETE' || err.code === 'PORT_IN_USE' || err.code === 'LLM_KEY_INVALID' || err.code === 'SMTP_REQUIRED' || err.code === 'GIT_CLONE_FAILED' || err.code === 'MISSING_GIT' || err.code === 'IMAGES_REMOVED' || err.code === 'NATIVE_SCRIPT_MISSING')) {
      error(err.message);
      return 1;
    }
    error(err.message || String(err));
    return 1;
  }
}

if (require.main === module) {
  main().then((code) => {
    process.exit(code);
  });
}

module.exports = { main, commands, globalHelp };
