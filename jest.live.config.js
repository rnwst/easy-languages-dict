import config from './jest.config.js';

/** @type {import('jest').Config} */
export default {
  ...config,
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['<rootDir>/__tests__/background/translators/live/**/*.ts'],
  testTimeout: 30000,
};
