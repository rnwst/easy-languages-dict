/** @type {import('jest').Config} */
export default {
  moduleNameMapper: {
    // When an import ends with ".js", let Jest also try the same path without
    // the extension, which allows it to resolve the .ts source file during
    // tests.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: './FixedJSDOMEnvironment.js',
};
