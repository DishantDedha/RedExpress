/**
 * The integration suite: real Express app, real Postgres, real JWTs.
 *
 * Split from jest.config.mjs on purpose. The unit tests import only pure modules and run
 * anywhere in under a second; these need a migrated database and would turn `npm test` on a
 * fresh clone into a failure about Docker rather than about the code. Run them with
 *
 *     npm run test:integration        (needs a database — see backend/README.md)
 *     npm run test:all                both suites, unit first
 *
 * `maxWorkers: 1` because every file in here shares one database. Jest's default is a worker
 * per core, and two workers creating a donor with the same phone number is a unique-constraint
 * failure that looks like a bug in the code under test.
 */
export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/tests/integration/**/*.test.js'],
  // Sets NODE_ENV, forces the console SMS/push providers, and loads backend/.env — before
  // any src/ module reads process.env.
  setupFiles: ['<rootDir>/tests/integration/setupEnv.js'],
  maxWorkers: 1,
  // Real HTTP and real bcrypt against a database; the 5 s default is too tight on a cold pool.
  testTimeout: 30_000,
};
