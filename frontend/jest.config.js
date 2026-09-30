const fs = require('fs');
const path = require('path');

/** Prefer real EE compare_models pure utils when the sibling tree is present (stubs mirror them for CE-alone CI). */
const eeCompareUtilsRoot = path.resolve(__dirname, '../../RAGSUITE_EE/modules/compare_models/frontend/utils');
const eeCompareUtilsPresent = fs.existsSync(path.join(eeCompareUtilsRoot, 'compare-models-messages.ts'));

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
    ...(eeCompareUtilsPresent
      ? {
          '^@ragsuite-ee/modules/compare_models/frontend/utils/(.*)$':
            '<rootDir>/../../RAGSUITE_EE/modules/compare_models/frontend/utils/$1',
        }
      : {}),
    // CE-alone / CI without EE: resolve all @ragsuite-ee/* to platform stubs.
    '^@ragsuite-ee/(.*)$': '<rootDir>/src/platform/ee-stubs/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};
