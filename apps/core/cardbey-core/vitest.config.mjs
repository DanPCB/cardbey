import { defineConfig } from 'vitest/config';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load .env.test explicitly before config
const envTestPath = path.resolve(process.cwd(), '.env.test');
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath });
}

// Safe fallbacks
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:../test.db';
}

// Debug log
console.log('[VitestEnv]', { NODE_ENV: process.env.NODE_ENV, DATABASE_URL: process.env.DATABASE_URL });

export default defineConfig(({ mode }) => {
  return {
    test: {
      environment: 'node',
      globals: false,
      threads: false,
      isolate: true,
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: true,
        },
      },
      coverage: {
        enabled: false,
      },
      // Setup file runs before any tests, loads .env.test
      setupFiles: ['./src/test/setupEnv.js'],
    },
    esbuild: {
      target: 'node18',
    },
    resolve: {
      extensions: ['.js', '.ts', '.mjs', '.cjs'],
    },
  };
});

