module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Prefer real EE voice sources in unit tests when the sibling tree is present.
    '^@ragsuite-ee/modules/voice/(.*)$': '<rootDir>/../../RAGSUITE_EE/modules/voice/$1',
    '^@ragsuite-ee/(.*)$': '<rootDir>/src/platform/ee-stubs/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};
