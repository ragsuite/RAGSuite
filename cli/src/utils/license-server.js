'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const tls = require('tls');
const { URL } = require('url');

/**
 * Production License API (NITSAN-hosted). Customers never set this manually.
 * Vendor/dev override: RAGSUITE_LICENSE_URL
 */
const DEFAULT_LICENSE_URL = 'https://license.ragsuite.de';
const DEFAULT_DISCOVERY_URL = 'https://license.ragsuite.de/api/v1/public/license-endpoint';

function licenseConfig(env = process.env, overrides = {}) {
  const envUrl = (env.RAGSUITE_LICENSE_URL || '').trim();
  const baseUrl = String(overrides.baseUrl || envUrl || DEFAULT_LICENSE_URL).replace(/\/$/, '');
  return {
    baseUrl,
    discoveryUrl: (env.RAGSUITE_LICENSE_DISCOVERY_URL || '').trim() || DEFAULT_DISCOVERY_URL,
    // Admin token only for vendor/dev tooling — customer key-only flow does not need it.
    token: (env.RAGSUITE_LICENSE_ADMIN_TOKEN || '').trim(),
    licenseId: (env.RAGSUITE_LICENSE_ID || '').trim() || null,
    customerId: (env.RAGSUITE_CUSTOMER_ID || '').trim() || null,
    bundleVersion: (env.RAGSUITE_EE_BUNDLE_VERSION || '').trim() || null,
  };
}

/**
 * M9: Optional TLS certificate pinning.
 *
 * When ``RAGSUITE_LICENSE_TLS_PIN_SHA256`` is set (comma-separated SHA-256 hex
 * fingerprints of the server certificate's SPKI or the full DER cert), every
 * HTTPS request to the license server verifies the peer certificate against the
 * pin set and rejects connections with mismatching certificates.
 *
 * Leave unset for standard TLS verification (CA chain only).
 */
function _resolvePin(env) {
  const raw = (env || process.env).RAGSUITE_LICENSE_TLS_PIN_SHA256 || '';
  if (!raw.trim()) return null;
  return raw.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
}

function _certFingerprint(cert) {
  if (!cert) return null;
  // DER fingerprint
  const raw = cert.raw;
  if (raw) {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }
  // Fallback: fingerprint256 property (set by Node TLS)
  const fp = cert.fingerprint256;
  if (fp) return fp.replace(/:/g, '').toLowerCase();
  return null;
}

function _buildTlsCheckServerIdentity(pins) {
  return function checkServerIdentity(hostname, cert) {
    // Run default hostname check first
    const defaultErr = tls.checkServerIdentity(hostname, cert);
    if (defaultErr) return defaultErr;
    if (!pins || pins.length === 0) return undefined;
    const fp = _certFingerprint(cert);
    if (!fp) {
      return new Error('TLS pin check: could not extract certificate fingerprint');
    }
    if (!pins.includes(fp)) {
      return new Error(
        `TLS pin mismatch for ${hostname}: got ${fp}, expected one of [${pins.join(', ')}]. ` +
        'Unset RAGSUITE_LICENSE_TLS_PIN_SHA256 to disable pinning.',
      );
    }
    return undefined;
  };
}

function requestJson(method, urlStr, { token, body, timeoutMs = 30000, env } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body != null ? JSON.stringify(body) : null;
    const headers = {
      Accept: 'application/json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    // M9: build optional TLS pin options
    const pins = _resolvePin(env);
    const tlsOpts = pins ? { checkServerIdentity: _buildTlsCheckServerIdentity(pins) } : {};

    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method,
        headers,
        timeout: timeoutMs,
        ...tlsOpts,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          if (text) {
            try {
              json = JSON.parse(text);
            } catch {
              json = null;
            }
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            text,
            json,
          });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout talking to ${urlStr}`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function health(cfg) {
  return requestJson('GET', `${cfg.baseUrl}/api/v1/health`);
}

/**
 * Resolve current license URL from a stable discovery URL.
 * Supports JSON {"license_url":"https://..."} or plain text URL.
 */
async function discoverLicenseUrl(discoveryUrl) {
  if (!discoveryUrl) return null;
  const res = await requestJson('GET', String(discoveryUrl), { timeoutMs: 15000 });
  if (res.status !== 200) return null;
  if (res.json && typeof res.json.license_url === 'string') {
    return res.json.license_url.trim().replace(/\/$/, '');
  }
  const text = String(res.text || '').trim();
  if (/^https?:\/\//i.test(text)) return text.replace(/\/$/, '');
  return null;
}

/**
 * Build ordered candidate License URLs for activate/update.
 * Never falls back to localhost unless vendor explicitly set RAGSUITE_LICENSE_URL.
 */
async function resolveLicenseBaseUrl({ env = process.env, repoRoot, claimServerUrl, claimDiscoveryUrl } = {}) {
  const envUrl = (env.RAGSUITE_LICENSE_URL || '').trim().replace(/\/$/, '');
  const candidates = [];
  const seen = new Set();
  const push = (u) => {
    const v = (u || '').trim().replace(/\/$/, '');
    if (!v || seen.has(v)) return;
    seen.add(v);
    candidates.push(v);
  };

  push(envUrl);

  if (repoRoot) {
    try {
      const hintPath = path.join(repoRoot, '.ragsuite', 'license', 'server-url');
      if (fs.existsSync(hintPath)) {
        push(fs.readFileSync(hintPath, 'utf8').trim());
      }
    } catch {
      /* ignore */
    }
  }

  push(claimServerUrl);

  const discoveryCandidates = [];
  if (claimDiscoveryUrl) discoveryCandidates.push(claimDiscoveryUrl);
  discoveryCandidates.push((env.RAGSUITE_LICENSE_DISCOVERY_URL || '').trim() || DEFAULT_DISCOVERY_URL);

  for (const d of discoveryCandidates) {
    if (!d) continue;
    try {
      const discovered = await discoverLicenseUrl(d);
      push(discovered);
    } catch {
      /* ignore */
    }
  }

  push(DEFAULT_LICENSE_URL);

  return candidates;
}

function rememberServerUrl(repoRoot, url) {
  try {
    const p = path.join(repoRoot, '.ragsuite', 'license', 'server-url');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `${String(url || '').replace(/\/$/, '')}\n`, 'utf8');
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(p, 0o600);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* non-fatal */
  }
}

/**
 * Key-only EE plan (no admin token, no machine fingerprint).
 */
async function customerEePlan(cfg, { offlineKey, installedEeVersion }) {
  return requestJson('POST', `${cfg.baseUrl}/api/v1/customer/ee/plan`, {
    body: {
      offline_key: offlineKey,
      installed_ee_version: installedEeVersion || null,
    },
    timeoutMs: 30000,
  });
}

/**
 * Stream EE tar from License Server (proxies private GitHub) into destPath.
 */
function customerEeDownload(cfg, downloadToken, destPath) {
  return new Promise((resolve, reject) => {
    const urlStr = `${cfg.baseUrl}/api/v1/customer/ee/download/${encodeURIComponent(downloadToken)}`;
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const out = fs.createWriteStream(destPath);
    const req = lib.get(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        timeout: 600000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let detail = text;
            try {
              detail = JSON.parse(text).detail || text;
            } catch {
              /* ignore */
            }
            reject(new Error(`EE download failed HTTP ${res.statusCode}: ${detail}`));
          });
          return;
        }
        res.pipe(out);
        out.on('finish', () => resolve(destPath));
        out.on('error', reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('EE download timed out'));
    });
  });
}

module.exports = {
  DEFAULT_LICENSE_URL,
  DEFAULT_DISCOVERY_URL,
  licenseConfig,
  requestJson,
  health,
  discoverLicenseUrl,
  resolveLicenseBaseUrl,
  rememberServerUrl,
  customerEePlan,
  customerEeDownload,
};
