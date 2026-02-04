module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      isolatedModules: true,
      useESM: false,
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Handle dynamic imports in Langfuse
  transformIgnorePatterns: [
    'node_modules/(?!(langfuse|langfuse-core)/)',
  ],
  // Mock Langfuse to avoid dynamic import issues in tests
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};
