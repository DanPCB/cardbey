/**
 * Optional .env loader (ESM). Safe in production: no-op if no .env or dotenv missing.
 * Server imports this dynamically so a missing file does not crash the process.
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  try {
    const dotenv = await import('dotenv');
    dotenv.default.config({ path: envPath, override: false });
    console.log('[env] loaded .env');

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
      // Force the local binary engine; Data Proxy engines require prisma:// URLs.
      process.env.PRISMA_CLIENT_ENGINE_TYPE = 'binary';
      delete process.env.PRISMA_GENERATE_DATAPROXY;
    }
  } catch {
    console.log('[env] dotenv not installed, skipping .env load');
  }
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
