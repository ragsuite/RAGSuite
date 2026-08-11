module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@ragsuite-ee/(.*)$': '<rootDir>/src/platform/ee-stubs/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};
