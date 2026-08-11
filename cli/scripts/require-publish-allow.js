#!/usr/bin/env node
'use strict';

/**
 * Accidental-publish guard. Real publish requires:
 *   RAGSUITE_TEST_ALLOW_PUBLISH=1 npm publish --access public
 */

if (process.env.RAGSUITE_TEST_ALLOW_PUBLISH !== '1') {
  console.error(
    'error: npm publish blocked. Set RAGSUITE_TEST_ALLOW_PUBLISH=1 after running npm run prepublish:check.',
  );
  console.error('See cli/PUBLISH.md. Do not publish from CI push/PR.');
  process.exit(1);
}
