'use strict';

/**
 * Production build marker for the RAGSuite CLI (C6/H4).
 *
 * In the CE source repository this constant is false.
 *
 * When publishing to npm, the `prepublishOnly` script (or a pack-time sed pass)
 * sets RAGSUITE_PRODUCTION_BUILD=1 and rewrites this file to export
 * `{ PRODUCTION_BUILD: true }`, or sets the constant directly.
 *
 * The Python backend honours the same env var (`RAGSUITE_PRODUCTION_BUILD=1`)
 * and the baked constant `PRODUCTION_BUILD_BAKED` in `ee_guard.py`.
 *
 * When `PRODUCTION_BUILD` is true the CLI activate path will:
 * - Set `RAGSUITE_PRODUCTION_BUILD=1` in the env passed to Python sub-processes.
 * - Refuse to pass `--allow-unsigned` to `app.platform.bundle_install`.
 * - Enforce TLS-pin checks if `RAGSUITE_LICENSE_TLS_PIN_SHA256` is set.
 */
const PRODUCTION_BUILD = false; // Rewritten to true at npm publish time

module.exports = { PRODUCTION_BUILD };
