/**
 * Discovery job storage backend selection.
 * Postgres / Render → database only (no ephemeral jobs.json).
 * Local SQLite dev → DB when table exists, else jobs.json for CLI/tests.
 */

import prisma from '../../prisma.js';

export type DiscoveryJobBackend = 'db' | 'file';

function isPostgresDatabaseUrl(url: string | undefined): boolean {
  const u = String(url ?? '').trim().toLowerCase();
  if (!u) return false;
  return (
    u.startsWith('postgres') ||
    u.startsWith('prisma://') ||
    u.startsWith('prisma+postgres://')
  );
}

function isRenderHost(): boolean {
  return !!(process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_ID);
}

/** True when jobs must live in Postgres — never jobs.json. */
export function discoveryJobsRequireDatabase(): boolean {
  if (process.env.DISCOVERY_JOBS_BACKEND === 'file') return false;
  if (process.env.DISCOVERY_JOBS_BACKEND === 'db') return true;
  if (process.env.NODE_ENV === 'production' && isRenderHost()) return true;
  if (isPostgresDatabaseUrl(process.env.DATABASE_URL)) return true;
  if (isPostgresDatabaseUrl(process.env.POSTGRES_DATABASE_URL)) return true;
  return false;
}

async function probeDiscoveryJobTable(): Promise<boolean> {
  try {
    if (typeof prisma.discoveryEngineJob?.findFirst !== 'function') {
      return false;
    }
    await prisma.discoveryEngineJob.findFirst({ select: { id: true }, take: 1 });
    return true;
  } catch {
    return false;
  }
}

let cachedBackend: DiscoveryJobBackend | null = null;
let backendLogged = false;

export function resetDiscoveryJobBackendCacheForTests(): void {
  cachedBackend = null;
  backendLogged = false;
}

export async function resolveDiscoveryJobBackend(): Promise<DiscoveryJobBackend> {
  if (process.env.DISCOVERY_JOBS_BACKEND === 'file') {
    return 'file';
  }
  if (cachedBackend) return cachedBackend;

  const tableReady = await probeDiscoveryJobTable();
  const requireDb = discoveryJobsRequireDatabase();

  if (tableReady) {
    cachedBackend = 'db';
    if (!backendLogged) {
      console.info('[discoveryJobRepository] backend=postgres (discovery_engine_job)');
      backendLogged = true;
    }
    return 'db';
  }

  if (requireDb) {
    throw new Error(
      '[discoveryJobRepository] discovery_engine_job table is missing but Postgres/Render requires database-backed jobs. ' +
        'Apply migration 20260616120000_add_discovery_engine_job (prisma migrate deploy) before running discovery.',
    );
  }

  cachedBackend = 'file';
  if (!backendLogged) {
    console.warn(
      '[discoveryJobRepository] backend=file (data/discoveryEngine/jobs.json) — local dev only; not durable on Render',
    );
    backendLogged = true;
  }
  return 'file';
}
