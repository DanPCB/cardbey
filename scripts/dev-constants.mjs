/**
 * Canonical local dev ports and paths for Cardbey monorepo.
 * Keep in sync with package.json dev scripts and CORS allowlists.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(__dirname, '..');

export const CORE_PORT = Number(process.env.CARDBEY_CORE_PORT || 3001);
export const DASHBOARD_PORT = Number(process.env.CARDBEY_DASHBOARD_PORT || 5174);

export const CORE_DIR = path.join(REPO_ROOT, 'apps', 'core', 'cardbey-core');
export const DASHBOARD_DIR = path.join(REPO_ROOT, 'apps', 'dashboard', 'cardbey-marketing-dashboard');

/** Canonical SQLite schema for local Core API dev. */
export const SQLITE_SCHEMA_REL = 'prisma/sqlite/schema.prisma';
export const SQLITE_SCHEMA = path.join(CORE_DIR, SQLITE_SCHEMA_REL);

export const PRISMA_CLIENT_GEN = path.join(CORE_DIR, 'node_modules', '.prisma', 'client-gen');

export const CORE_HEALTH_URL = `http://127.0.0.1:${CORE_PORT}/api/health`;
export const DASHBOARD_URL = `http://127.0.0.1:${DASHBOARD_PORT}/`;

/** Env vars to report presence only (never log values). */
export const CORE_ENV_KEYS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'PUBLIC_BASE_URL',
  'NODE_ENV',
  'ROLE',
  'PORT',
];

export const DASHBOARD_ENV_KEYS = [
  'VITE_CORE_PROXY_TARGET',
  'VITE_API_BASE',
  'NODE_ENV',
];
