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
