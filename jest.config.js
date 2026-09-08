// jest.config.js
export default {
  testEnvironment: 'jest-environment-jsdom',
  setupFiles: ['./jest.setup.js'],
  transform: {},
  // Archive branch only. These two suites assert the print.css contract that the
  // pagination engine was built against; the branch it was cut from replaced that
  // stylesheet along with the whole approach. The files are kept because they are
  // the clearest statement of what the engine guaranteed — running them against
  // the current CSS measures nothing.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/tests/PrintLayout.test.js',
    '<rootDir>/tests/SeparatorPlacement.test.js'
  ]
};
