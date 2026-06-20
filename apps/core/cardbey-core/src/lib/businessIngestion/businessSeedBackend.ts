/**
 * BusinessSeed storage backend selection.
 * Postgres / Render → database only (no ephemeral seeds.json).
 */

import prisma from '../prisma.js';

export type BusinessSeedBackend = 'db' | 'file';

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

/** True when seeds must live in Postgres — never seeds.json. */
export function businessSeedsRequireDatabase(): boolean {
  if (process.env.BUSINESS_SEEDS_BACKEND === 'file') return false;
  if (process.env.BUSINESS_SEEDS_BACKEND === 'db') return true;
  if (process.env.NODE_ENV === 'production' && isRenderHost()) return true;
  if (isPostgresDatabaseUrl(process.env.DATABASE_URL)) return true;
  if (isPostgresDatabaseUrl(process.env.POSTGRES_DATABASE_URL)) return true;
  return false;
}

/** Isolated test dirs should keep file backend unless forced to db. */
export function businessSeedsPreferFileBackend(): boolean {
  if (process.env.BUSINESS_SEEDS_BACKEND === 'file') return true;
  if (process.env.BUSINESS_SEEDS_BACKEND === 'db') return false;
  if (process.env.BUSINESS_INGESTION_DIR) return true;
  return false;
}

async function probeBusinessSeedTable(): Promise<boolean> {
  try {
    if (typeof prisma.businessSeed?.findFirst !== 'function') {
      return false;
    }
    await prisma.businessSeed.findFirst({ select: { id: true }, take: 1 });
    return true;
  } catch {
    return false;
  }
}

let cachedBackend: BusinessSeedBackend | null = null;
let backendLogged = false;

export function resetBusinessSeedBackendCacheForTests(): void {
  cachedBackend = null;
  backendLogged = false;
}

export async function resolveBusinessSeedBackend(): Promise<BusinessSeedBackend> {
  if (businessSeedsPreferFileBackend()) {
    return 'file';
  }
  if (cachedBackend) return cachedBackend;

  const tableReady = await probeBusinessSeedTable();
  const requireDb = businessSeedsRequireDatabase();

  if (tableReady) {
    cachedBackend = 'db';
    if (!backendLogged) {
      console.info('[businessSeedRepository] backend=postgres (business_seed)');
      backendLogged = true;
    }
    return 'db';
  }

  if (requireDb) {
    throw new Error(
      '[businessSeedRepository] business_seed table is missing but Postgres/Render requires database-backed seeds. ' +
        'Apply migration 20260619120000_add_business_seed_table (prisma migrate deploy) and run backfill if needed.',
    );
  }

  cachedBackend = 'file';
  if (!backendLogged) {
    console.warn(
      '[businessSeedRepository] backend=file (data/businessIngestion/seeds.json) — local dev only; not durable on Render',
    );
    backendLogged = true;
  }
  return 'file';
}
