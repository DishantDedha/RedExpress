/**
 * Jest against native ESM.
 *
 * The project is `"type": "module"` with no build step, so there is no transform: Jest
 * loads the source as-is through Node's ESM loader. That needs
 * NODE_OPTIONS=--experimental-vm-modules, which the `test` script sets via cross-env so
 * it works the same in PowerShell and in a POSIX shell.
 *
 * The unit tests here deliberately import only the pure modules (services/geo.js,
 * services/matching.js, services/pushMessages.js) — no Prisma, no env, no database, so
 * `npm test` works on a fresh clone with nothing running.
 *
 * The tests that DO boot the app and talk to Postgres live in tests/integration and have
 * their own config (jest.integration.config.mjs), run with `npm run test:integration`.
 * Keeping them out of the default run means a failing `npm test` is always a failure of
 * the code, never of a missing Docker container.
 */
export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/integration/'],
  collectCoverageFrom: [
    'src/services/geo.js',
    'src/services/matching.js',
    'src/services/pushMessages.js',
  ],
};
