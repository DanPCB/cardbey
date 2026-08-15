/**
 * Seed-row claim locks: process mutex always; Postgres advisory lock for multi-instance.
 * (SELECT FOR UPDATE is used inside OTP transactions; claim activate/verify use advisory
 * locks so the critical section can span draft publish + seed upsert.)
 */

import { getPrismaClient } from '../prisma.js';
import { getDbCapabilities } from '../persistence/dbCapabilityRegistry.js';
import { withClaimLock, seedClaimLockKey } from './claimLock.js';

/**
 * @template T
 * @param {string} seedId
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withSeedClaimCriticalSection(seedId, fn) {
  const id = String(seedId || '').trim();
  return withClaimLock(seedClaimLockKey(id), async () => {
    const caps = getDbCapabilities();
    const prisma = getPrismaClient();
    let advisoryHeld = false;

    if (caps.isPostgres && prisma?.$executeRaw) {
      try {
        // Session-level lock keyed by seed id (hashtext → int4).
        await prisma.$executeRaw`SELECT pg_advisory_lock(hashtext(${id}))`;
        advisoryHeld = true;
      } catch (err) {
        console.warn('[claim] pg_advisory_lock skipped:', err?.message || err);
      }
    }

    try {
      return await fn();
    } finally {
      if (advisoryHeld) {
        try {
          await prisma.$executeRaw`SELECT pg_advisory_unlock(hashtext(${id}))`;
        } catch (err) {
          console.warn('[claim] pg_advisory_unlock failed:', err?.message || err);
        }
      }
    }
  });
}

/**
 * Lock business_seed row inside an open Postgres transaction (claim completion).
 * No-op on SQLite / non-Postgres.
 * @param {import('@prisma/client').Prisma.TransactionClient | object} tx
 * @param {string} seedId
 */
export async function lockBusinessSeedRowForUpdate(tx, seedId) {
  if (!getDbCapabilities().isPostgres) return null;
  if (!tx?.$queryRaw) return null;
  const id = String(seedId || '').trim();
  try {
    const rows = await tx.$queryRaw`
      SELECT id, status FROM business_seed WHERE id = ${id} FOR UPDATE
    `;
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (err) {
    console.warn('[claim] business_seed FOR UPDATE failed:', err?.message || err);
    return null;
  }
}

/**
 * @param {unknown} err
 */
export function isBusinessSeedIdUniqueViolation(err) {
  if (!err || typeof err !== 'object') return false;
  const e = /** @type {{ code?: string, meta?: { target?: string[] }, message?: string }} */ (err);
  if (e.code === 'P2002') {
    const target = e.meta?.target;
    if (Array.isArray(target) && target.some((t) => String(t).toLowerCase().includes('seedid'))) {
      return true;
    }
    if (typeof e.message === 'string' && /seedId/i.test(e.message)) return true;
  }
  const msg = String(e.message || '');
  return /Business_seedId_unique|UNIQUE.*["']?seedId/i.test(msg);
}
