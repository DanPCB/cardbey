import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig, configDefaults } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const TSX_LOADER = pathToFileURL(
  path.join(path.dirname(require.resolve('tsx/package.json')), 'dist/loader.mjs'),
).href;

/** Vitest/Vite: resolve `import './foo.js'` to `foo.ts` when only the TS source exists (tsx runtime parity). */
function jsToTsResolver() {
  return {
    name: 'js-to-ts-resolver',
    resolveId(source, importer) {
      if (!importer || !source.endsWith('.js') || source.includes('node_modules')) return null;
      const resolved = path.resolve(path.dirname(importer), source);
      if (fs.existsSync(resolved)) return null;
      const tsPath = resolved.replace(/\.js$/, '.ts');
      if (fs.existsSync(tsPath)) return tsPath;
      return null;
    },
  };
}

export default defineConfig({
  plugins: [jsToTsResolver()],
  resolve: {
    alias: {
      // Tests and scripts import @prisma/client; SQLite schema generates to client-gen.
      '@prisma/client': path.resolve(__dirname, 'node_modules/.prisma/client-gen/index.js'),
    },
  },
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
    },
    setupFiles: ['src/test/setupEnv.js'],
    globalTeardown: ['src/test/vitestGlobalTeardown.js'],
    // Match production runtime: resolve .js imports to TypeScript sources (e.g. businessDiscovery/index.ts).
    pool: 'forks',
    poolOptions: {
      forks: {
        execArgv: ['--import', TSX_LOADER],
      },
    },
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

