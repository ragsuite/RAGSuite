const fs = require('fs');
const path = require('path');

/** Prefer real EE voice sources when the sibling tree is present (local DX). */
const eeVoiceRoot = path.resolve(__dirname, '../../RAGSUITE_EE/modules/voice');
const eeVoicePresent = fs.existsSync(
  path.join(eeVoiceRoot, 'frontend/voice-utterance.test.ts'),
);

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    ...(eeVoicePresent
      ? {
          '^@ragsuite-ee/modules/voice/(.*)$':
            '<rootDir>/../../RAGSUITE_EE/modules/voice/$1',
        }
      : {}),
    // CE-alone / CI without EE: resolve all @ragsuite-ee/* to platform stubs.
    '^@ragsuite-ee/(.*)$': '<rootDir>/src/platform/ee-stubs/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};
