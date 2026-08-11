// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
    },
    rules: {
      // EE modules are optional in CE CI; Metro resolves @ragsuite-ee at runtime.
      // pptx-preview is web-only ESM; installed via yarn but not resolvable by eslint-import-resolver-node.
      'import/no-unresolved': ['error', { ignore: ['^@ragsuite-ee/', '^pptx-preview$'] }],
      // Re-export checks fail against CE stub placeholders for optional EE modules.
      'import/export': 'off',
    },
  },
]);
