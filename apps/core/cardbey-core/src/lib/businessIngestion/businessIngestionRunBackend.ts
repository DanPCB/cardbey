/**
 * Business ingestion run storage backend — Postgres on Render, JSON fallback local only.
 */

import prisma from '../prisma.js';

export type IngestionRunBackend = 'db' | 'file';

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

export function ingestionRunsRequireDatabase(): boolean {
  if (process.env.BUSINESS_INGESTION_RUNS_BACKEND === 'file') return false;
  if (process.env.BUSINESS_INGESTION_RUNS_BACKEND === 'db') return true;
  if (process.env.BUSINESS_SEEDS_BACKEND === 'file') return false;
  if (process.env.BUSINESS_SEEDS_BACKEND === 'db') return true;
  if (process.env.NODE_ENV === 'production' && isRenderHost()) return true;
  if (isPostgresDatabaseUrl(process.env.DATABASE_URL)) return true;
  if (isPostgresDatabaseUrl(process.env.POSTGRES_DATABASE_URL)) return true;
  return false;
}

export function ingestionRunsPreferFileBackend(): boolean {
  if (process.env.BUSINESS_INGESTION_RUNS_BACKEND === 'file') return true;
  if (process.env.BUSINESS_INGESTION_RUNS_BACKEND === 'db') return false;
  if (process.env.BUSINESS_SEEDS_BACKEND === 'file') return true;
  if (process.env.BUSINESS_SEEDS_BACKEND === 'db') return false;
  if (process.env.BUSINESS_INGESTION_DIR) return true;
  return false;
}

async function probeIngestionRunTable(): Promise<boolean> {
  try {
    if (typeof prisma.businessIngestionRun?.findFirst !== 'function') return false;
    await prisma.businessIngestionRun.findFirst({ select: { id: true }, take: 1 });
    return true;
  } catch {
    return false;
  }
}

let cachedBackend: IngestionRunBackend | null = null;
let backendLogged = false;

export function resetIngestionRunBackendCacheForTests(): void {
  cachedBackend = null;
  backendLogged = false;
}

export async function resolveIngestionRunBackend(): Promise<IngestionRunBackend> {
  if (ingestionRunsPreferFileBackend()) return 'file';
  if (cachedBackend) return cachedBackend;

  const tableReady = await probeIngestionRunTable();
  const requireDb = ingestionRunsRequireDatabase();

  if (tableReady) {
    cachedBackend = 'db';
    if (!backendLogged) {
      console.info('[businessIngestionRunRepository] backend=postgres (business_ingestion_run)');
      backendLogged = true;
    }
    return 'db';
  }

  if (requireDb) {
    throw new Error(
      '[businessIngestionRunRepository] business_ingestion_run table is missing but Postgres/Render requires database-backed run history. ' +
        'Apply migration 20260620120000_add_business_ingestion_run (prisma migrate deploy).',
    );
  }

  cachedBackend = 'file';
  if (!backendLogged) {
    console.warn(
      '[businessIngestionRunRepository] backend=file (runs.json) — local dev only; not durable on Render',
    );
    backendLogged = true;
  }
  return 'file';
}
