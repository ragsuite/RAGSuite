'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { info, warn } = require('./log');

function generateJwtSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function generateCiLlmKey() {
  return `ci-test-llm-key-${crypto.randomBytes(8).toString('hex')}`;
}

function isPlaceholderSecret(value) {
  const v = String(value || '').trim();
  return !v || v.startsWith('change-me') || v.startsWith('your-smtp-');
}

function isSmokeSmtpValue(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === 'smoke-smtp@localhost' || v === 'ci-smoke-smtp-not-for-production';
}

/**
 * Build .env content from .env.example with overrides.
 */
function buildEnvFromExample(examplePath, overrides = {}) {
  if (!fs.existsSync(examplePath)) {
    const err = new Error(`Missing .env.example at ${examplePath}`);
    err.code = 'ENV_EXAMPLE_MISSING';
    throw err;
  }
  const raw = fs.readFileSync(examplePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const keysSet = new Set(Object.keys(overrides));
  const out = [];
  const seen = new Set();

  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) {
      out.push(line);
      continue;
    }
    const key = m[1];
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      out.push(`${key}=${overrides[key]}`);
      seen.add(key);
    } else {
      out.push(line);
    }
  }

  for (const key of keysSet) {
    if (!seen.has(key)) {
      out.push(`${key}=${overrides[key]}`);
    }
  }

  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

function parseEnvFile(envPath) {
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * Short “how to get / fix” hints when a config value is missing or still a placeholder.
 */
function printConfigHints(issues) {
  if (!issues.length) return;
  warn('');
  warn('Missing or placeholder configuration — how to fix:');
  for (const issue of issues) {
    warn(`  ✗ ${issue.title}`);
    for (const step of issue.steps) warn(`    → ${step}`);
  }
  warn('');
}

function collectEnvConfigIssues(envMap) {
  const issues = [];
  if (isPlaceholderSecret(envMap.JWT_SECRET_KEY)) {
    issues.push({
      title: 'JWT_SECRET_KEY',
      steps: [
        'Re-run: ragsuite init --force … (auto-generates JWT)',
        'Or set JWT_SECRET_KEY in .env (never commit .env)',
      ],
    });
  }
  if (isPlaceholderSecret(envMap.CUSTOM_LLM_INTERNAL_API_KEY)) {
    issues.push({
      title: 'CUSTOM_LLM_INTERNAL_API_KEY',
      steps: [
        'Edit .env and set CUSTOM_LLM_INTERNAL_API_KEY=…',
        'Or: ragsuite init --force --llm-api-key YOUR_KEY',
      ],
    });
  }
  const smtpOk =
    envMap.SMTP_HOST &&
    envMap.SMTP_USER &&
    envMap.SMTP_PASSWORD &&
    !isPlaceholderSecret(envMap.SMTP_PASSWORD) &&
    !isPlaceholderSecret(envMap.SMTP_USER) &&
    !isSmokeSmtpValue(envMap.SMTP_USER) &&
    !isSmokeSmtpValue(envMap.SMTP_PASSWORD) &&
    !isSmokeSmtpValue(envMap.EMAIL_FROM) &&
    (envMap.EMAIL_FROM || envMap.SMTP_USER);
  if (!smtpOk) {
    issues.push({
      title: 'SMTP (real mail)',
      steps: [
        'Put real values only in .env (gitignored) — never in .env.example',
        'Gmail: Google Account → Security → App passwords → Mail',
        'Set SMTP_USER, SMTP_PASSWORD, EMAIL_FROM in .env, then: ragsuite restart',
        'Smoke SMTP (smoke-smtp@localhost) cannot send invites / forgot-password / 2FA',
      ],
    });
  }
  return issues;
}

/**
 * Write .env from .env.example. Never prompts.
 * - Always regenerates JWT
 * - Keeps LLM default from example (or generates if placeholder)
 * - If SMTP in example is still a placeholder, writes a non-empty smoke SMTP
 *   so the backend can start; real mail requires editing local .env
 * - Optional flag overrides only
 */
function writeInstallEnv(repoRoot, options = {}) {
  const {
    force = false,
    jwtSecret = generateJwtSecret(),
    llmApiKey,
    smtp,
  } = options;

  const envPath = path.join(repoRoot, '.env');
  const examplePath = path.join(repoRoot, '.env.example');

  if (fs.existsSync(envPath) && !force) {
    const err = new Error(
      `.env already exists at ${envPath}. Pass --force to regenerate from .env.example (will overwrite).`,
    );
    err.code = 'ENV_EXISTS';
    throw err;
  }

  const example = parseEnvFile(examplePath);
  const overrides = {
    JWT_SECRET_KEY: jwtSecret,
  };

  if (llmApiKey && !isPlaceholderSecret(llmApiKey)) {
    overrides.CUSTOM_LLM_INTERNAL_API_KEY = llmApiKey;
  } else if (isPlaceholderSecret(example.CUSTOM_LLM_INTERNAL_API_KEY)) {
    overrides.CUSTOM_LLM_INTERNAL_API_KEY = generateCiLlmKey();
  }

  if (smtp) {
    if (smtp.host) overrides.SMTP_HOST = smtp.host;
    if (smtp.user) overrides.SMTP_USER = smtp.user;
    if (smtp.password) overrides.SMTP_PASSWORD = smtp.password;
    if (smtp.emailFrom) overrides.EMAIL_FROM = smtp.emailFrom;
  } else {
    // No prompts: if template SMTP is placeholder, use smoke values so API can boot.
    // Real Gmail credentials must live only in local .env (never commit).
    const smtpUser = example.SMTP_USER || '';
    const smtpPass = example.SMTP_PASSWORD || '';
    if (isPlaceholderSecret(smtpPass) || isPlaceholderSecret(smtpUser)) {
      overrides.SMTP_HOST = example.SMTP_HOST || 'smtp.gmail.com';
      overrides.SMTP_PORT = example.SMTP_PORT || '587';
      overrides.SMTP_USER = 'smoke-smtp@localhost';
      overrides.SMTP_PASSWORD = 'ci-smoke-smtp-not-for-production';
      overrides.SMTP_USE_TLS = example.SMTP_USE_TLS || 'true';
      overrides.EMAIL_FROM = 'smoke-smtp@localhost';
      warn('SMTP template was placeholder — wrote smoke SMTP into .env so the app can start.');
      warn(
        'IMPORTANT: Smoke SMTP cannot send mail. Invites, forgot-password, and 2FA need real SMTP_* + EMAIL_FROM in .env, then: ragsuite restart',
      );
    }
  }

  const content = buildEnvFromExample(examplePath, overrides);
  fs.writeFileSync(envPath, content, 'utf8');

  const written = parseEnvFile(envPath);
  if (isPlaceholderSecret(written.JWT_SECRET_KEY) || isPlaceholderSecret(written.CUSTOM_LLM_INTERNAL_API_KEY)) {
    printConfigHints(collectEnvConfigIssues(written));
    const err = new Error('Install .env is incomplete (see hints above).');
    err.code = 'ENV_INCOMPLETE';
    throw err;
  }

  // Soft hint only for smoke SMTP (do not fail init — backend can start)
  if (
    written.SMTP_PASSWORD === 'ci-smoke-smtp-not-for-production' ||
    isSmokeSmtpValue(written.SMTP_USER) ||
    isSmokeSmtpValue(written.EMAIL_FROM)
  ) {
    warn('SMTP: smoke defaults in .env (app starts, mail will NOT deliver).');
    printConfigHints(collectEnvConfigIssues(written));
  } else {
    info('SMTP + LLM loaded into .env (no interactive prompts).');
  }

  return {
    jwt: written.JWT_SECRET_KEY,
    llmKey: written.CUSTOM_LLM_INTERNAL_API_KEY,
    envPath,
  };
}

function readEnvValue(envPath, key) {
  if (!fs.existsSync(envPath)) return null;
  const text = fs.readFileSync(envPath, 'utf8');
  const re = new RegExp(`^${key}=(.*)$`, 'm');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

module.exports = {
  generateJwtSecret,
  generateCiLlmKey,
  isPlaceholderSecret,
  isSmokeSmtpValue,
  buildEnvFromExample,
  parseEnvFile,
  collectEnvConfigIssues,
  printConfigHints,
  writeInstallEnv,
  readEnvValue,
};
