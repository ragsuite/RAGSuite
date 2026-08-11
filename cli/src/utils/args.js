'use strict';

/**
 * Parse argv into global flags, command, and remaining args.
 */
function parseArgv(argv) {
  const tokens = argv.slice(2);
  const globals = {
    help: false,
    repoRoot: null,
    dryRun: false,
    mode: null,
    docker: false,
    fromGit: null,
    fromImages: false,
    fromRelease: null,
    installDir: null,
    force: false,
    yes: false,
    llmApiKey: null,
    smtpHost: null,
    smtpUser: null,
    smtpPassword: null,
    emailFrom: null,
  };
  const rest = [];
  let command = null;

  function takeValue(flag, t, i) {
    const eq = `${flag}=`;
    if (t.startsWith(eq)) return { value: t.slice(eq.length), nextI: i };
    const value = tokens[i + 1];
    return { value, nextI: i + 1 };
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];

    if (t === '--help' || t === '-h') {
      if (command) rest.push(t);
      else globals.help = true;
      continue;
    }

    if (t === '--dry-run') {
      globals.dryRun = true;
      continue;
    }

    if (t === '--force') {
      globals.force = true;
      continue;
    }

    if (t === '--yes' || t === '-y') {
      globals.yes = true;
      continue;
    }

    if (t === '--repo-root' || t.startsWith('--repo-root=')) {
      const { value, nextI } = takeValue('--repo-root', t, i);
      i = nextI;
      if (!value || value.startsWith('-')) {
        const err = new Error('--repo-root requires a path');
        err.code = 'USAGE';
        throw err;
      }
      globals.repoRoot = value;
      continue;
    }

    if (t === '--mode' || t.startsWith('--mode=')) {
      const { value, nextI } = takeValue('--mode', t, i);
      i = nextI;
      if (!value || String(value).startsWith('-')) {
        const err = new Error('--mode requires native or docker');
        err.code = 'USAGE';
        throw err;
      }
      globals.mode = normalizeMode(value);
      continue;
    }

    if (t === '--docker') {
      globals.docker = true;
      globals.mode = 'docker';
      continue;
    }

    if (t === '--from-images') {
      globals.fromImages = true;
      continue;
    }

    if (t === '--from-git' || t.startsWith('--from-git=')) {
      if (t === '--from-git') {
        const next = tokens[i + 1];
        if (next && !next.startsWith('-')) {
          globals.fromGit = next;
          i += 1;
        } else {
          globals.fromGit = ''; // use default URL
        }
      } else {
        globals.fromGit = t.slice('--from-git='.length);
      }
      continue;
    }

    if (t === '--from-zip' || t.startsWith('--from-zip=')) {
      const err = new Error(
        '--from-zip was removed. Use --from-git (public deploy) or --repo-root <checkout>.',
      );
      err.code = 'USAGE';
      throw err;
    }

    if (t === '--from-release' || t.startsWith('--from-release=')) {
      const { value, nextI } = takeValue('--from-release', t, i);
      i = nextI;
      if (!value || value.startsWith('-')) {
        const err = new Error('--from-release requires a tag or "latest"');
        err.code = 'USAGE';
        throw err;
      }
      globals.fromRelease = value;
      continue;
    }

    if (t === '--install-dir' || t.startsWith('--install-dir=')) {
      const { value, nextI } = takeValue('--install-dir', t, i);
      i = nextI;
      if (!value || value.startsWith('-')) {
        const err = new Error('--install-dir requires a path');
        err.code = 'USAGE';
        throw err;
      }
      globals.installDir = value;
      continue;
    }

    if (t === '--llm-api-key' || t.startsWith('--llm-api-key=')) {
      const { value, nextI } = takeValue('--llm-api-key', t, i);
      i = nextI;
      if (!value || value.startsWith('-')) {
        const err = new Error('--llm-api-key requires a value');
        err.code = 'USAGE';
        throw err;
      }
      globals.llmApiKey = value;
      continue;
    }

    if (t === '--smtp-host' || t.startsWith('--smtp-host=')) {
      const { value, nextI } = takeValue('--smtp-host', t, i);
      i = nextI;
      if (!value || value.startsWith('-')) {
        const err = new Error('--smtp-host requires a value');
        err.code = 'USAGE';
        throw err;
      }
      globals.smtpHost = value;
      continue;
    }

    if (t === '--smtp-user' || t.startsWith('--smtp-user=')) {
      const { value, nextI } = takeValue('--smtp-user', t, i);
      i = nextI;
      if (!value || value.startsWith('-')) {
        const err = new Error('--smtp-user requires a value');
        err.code = 'USAGE';
        throw err;
      }
      globals.smtpUser = value;
      continue;
    }

    if (t === '--smtp-password' || t.startsWith('--smtp-password=')) {
      const { value, nextI } = takeValue('--smtp-password', t, i);
      i = nextI;
      if (value === undefined || value === null || String(value).startsWith('-')) {
        const err = new Error('--smtp-password requires a value');
        err.code = 'USAGE';
        throw err;
      }
      globals.smtpPassword = value;
      continue;
    }

    if (t === '--email-from' || t.startsWith('--email-from=')) {
      const { value, nextI } = takeValue('--email-from', t, i);
      i = nextI;
      if (!value || value.startsWith('-')) {
        const err = new Error('--email-from requires a value');
        err.code = 'USAGE';
        throw err;
      }
      globals.emailFrom = value;
      continue;
    }

    if (!command && !t.startsWith('-')) {
      command = t;
      continue;
    }

    rest.push(t);
  }

  const commandHelp = rest.includes('--help') || rest.includes('-h');
  const commandArgs = rest.filter((a) => a !== '--help' && a !== '-h');

  return { globals, command, commandArgs, commandHelp };
}

function normalizeMode(value) {
  const m = String(value).trim().toLowerCase();
  if (m !== 'docker' && m !== 'native') {
    const err = new Error(`Invalid mode "${value}" (use native or docker)`);
    err.code = 'USAGE';
    throw err;
  }
  return m;
}

module.exports = { parseArgv, normalizeMode };
