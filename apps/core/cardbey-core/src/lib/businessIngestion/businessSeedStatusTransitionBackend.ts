/**
 * BusinessSeed status transition storage — Postgres on Render, JSON fallback local only.
 */

import prisma from '../prisma.js';
import { businessSeedsPreferFileBackend, businessSeedsRequireDatabase } from './businessSeedBackend.js';

export type TransitionBackend = 'db' | 'file';

async function probeTransitionTable(): Promise<boolean> {
  try {
    if (typeof prisma.businessSeedStatusTransition?.findFirst !== 'function') return false;
    await prisma.businessSeedStatusTransition.findFirst({ select: { id: true }, take: 1 });
    return true;
  } catch {
    return false;
  }
}

let cachedBackend: TransitionBackend | null = null;
let backendLogged = false;

export function resetSeedTransitionBackendCacheForTests(): void {
  cachedBackend = null;
  backendLogged = false;
}

export async function resolveSeedTransitionBackend(): Promise<TransitionBackend> {
  if (businessSeedsPreferFileBackend()) return 'file';
  if (cachedBackend) return cachedBackend;

  const tableReady = await probeTransitionTable();
  const requireDb = businessSeedsRequireDatabase();

  if (tableReady) {
    cachedBackend = 'db';
    if (!backendLogged) {
      console.info(
        '[seedLifecycleTransition] backend=postgres (business_seed_status_transition)',
      );
      backendLogged = true;
    }
    return 'db';
  }

  if (requireDb) {
    throw new Error(
      '[seedLifecycleTransition] business_seed_status_transition table is missing but Postgres/Render requires database-backed lifecycle audit. ' +
        'Apply migration 20260621120000_add_business_seed_status_transition.',
    );
  }

  cachedBackend = 'file';
  if (!backendLogged) {
    console.warn(
      '[seedLifecycleTransition] backend=file — local dev only; not durable on Render',
    );
    backendLogged = true;
  }
  return 'file';
}
