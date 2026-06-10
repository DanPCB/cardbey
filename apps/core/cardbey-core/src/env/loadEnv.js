/**
 * Optional .env loader (ESM). Safe in production: no-op if no .env or dotenv missing.
 * Server imports this dynamically so a missing file does not crash the process.
 *
 * Load order (later wins):
 *   1. .env
 *   2. .env.local  (overrides .env)
 *
 * Paths are resolved from the cardbey-core package root, not process.cwd().
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

/** Vitest / integration runs pin DATABASE_URL in setupEnv — never let .env.local clobber test.db. */
function isVitestRun() {
  const vitest = String(process.env.VITEST ?? '').toLowerCase();
  return process.env.NODE_ENV === 'test' || vitest === 'true' || vitest === '1';
}

/**
 * @param {import('dotenv').DotenvConfigOptions['path']} envPath
 * @param {boolean} override
 * @param {typeof import('dotenv')['config']} configFn
 */
function loadEnvFile(envPath, override, configFn) {
  if (!fs.existsSync(envPath)) return false;
  configFn({ path: envPath, override });
  return true;
}

try {
  const dotenv = await import('dotenv');
  const configFn = dotenv.default.config;
  const envPath = path.join(PACKAGE_ROOT, '.env');
  const envLocalPath = path.join(PACKAGE_ROOT, '.env.local');
  const loaded = [];

  if (!isVitestRun()) {
    if (loadEnvFile(envPath, false, configFn)) loaded.push('.env');
    if (loadEnvFile(envLocalPath, true, configFn)) loaded.push('.env.local');
  } else if (process.env.NODE_ENV !== 'production') {
    console.log('[env] vitest run — skipping .env / .env.local (test DATABASE_URL pinned)');
  }

  if (loaded.length > 0) {
    console.log(`[env] loaded ${loaded.join(' → ')} (package root: ${PACKAGE_ROOT})`);
  } else if (process.env.NODE_ENV !== 'production') {
    console.log(`[env] no .env or .env.local at ${PACKAGE_ROOT}`);
  }

  // Local dev safeguard: if a .env sets Data Proxy engine type but DATABASE_URL is SQLite,
  // Prisma will reject `file:` URLs at runtime. Prefer the default binary engine locally.
  const dbUrl = String(process.env.DATABASE_URL || '').trim().toLowerCase();
  const engineType = String(process.env.PRISMA_CLIENT_ENGINE_TYPE || '').trim().toLowerCase();
  const isSqlite = dbUrl.startsWith('file:') || dbUrl.includes('.db');
  const isProxyEngine = engineType === 'dataproxy' || engineType === 'data-proxy' || engineType === 'edge';
  if (isSqlite) {
    if (isProxyEngine) {
      console.warn('[env] overriding PRISMA_CLIENT_ENGINE_TYPE for local SQLite (was %s)', engineType);
    }
    process.env.PRISMA_CLIENT_ENGINE_TYPE = 'binary';
    delete process.env.PRISMA_GENERATE_DATAPROXY;
  }
} catch {
  console.log('[env] dotenv not installed, skipping .env load');
}

export function loadEnv() {
  // Already run above; no-op
}

export function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const n = String(value).toLowerCase().trim();
  return n === 'true' || n === '1' || n === 'yes' || n === 'on';
}

export function getFeatureFlag(flagName, defaultValue = false) {
  const key = flagName.toUpperCase().replace(/-/g, '_');
  return parseBoolean(process.env[key], defaultValue);
}
