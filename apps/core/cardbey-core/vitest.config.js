import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['src/test/setupEnv.js'],
    // Keep scope narrow; Core has many heavy integration paths.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Route suites share one SQLite file (prisma/test.db); parallel files race on resetDb/seed.
    fileParallelism: false,
    // E2E closeout suites require a running API (localhost:3001). Keep them opt-in so `npm test`
    // remains hermetic for CI and local runs.
    exclude:
      String(process.env.RUN_E2E || '').toLowerCase() === 'true'
        ? configDefaults.exclude
        : [...configDefaults.exclude, 'src/test/e2e/**'],
  },
});

