/**
 * Safe Business.findMany for public routes — avoids P2022 when optional columns are missing.
 */
import { businessPublicReadSelect } from '../../lib/dbCapabilities.js';
import { getBusinessColumnSupport } from '../../lib/businessColumnCapabilities.js';

/** Feed/list where clause — omits publishedAt filter when column is missing. */
export function publicStoreListWhere() {
  const support = getBusinessColumnSupport();
  if (support.publishedAt) {
    return {
      OR: [{ isActive: true }, { publishedAt: { not: null } }],
    };
  }
  return { isActive: true };
}

/**
 * @param {unknown} error
 * @returns {string | null}
 */
export function parseMissingBusinessColumn(error) {
  const metaColumn = error?.meta?.column;
  if (metaColumn) {
    return String(metaColumn).split('.').pop() || null;
  }
  const message = String(error?.message ?? '');
  const match = message.match(/column `[^`]*\.([^`]+)` does not exist/i)
    || message.match(/column [`']?main\.Business\.([^`'\s]+)[`']? does not exist/i);
  return match?.[1] ?? null;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {'findMany' | 'findUnique'} method
 * @param {object} args
 * @param {Record<string, true>} select
 */
async function queryBusinessWithColumnDriftRetry(prisma, method, args, select) {
  let currentSelect = { ...select };
  const maxAttempts = 24;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await prisma.business[method]({ ...args, select: currentSelect });
    } catch (error) {
      if (String(error?.code ?? '') !== 'P2022') throw error;
      const missing = parseMissingBusinessColumn(error);
      if (!missing || currentSelect[missing] === undefined) throw error;
      console.warn(`[findPublicBusinesses] P2022 — omitting missing Business column: ${missing}`);
      const next = { ...currentSelect };
      delete next[missing];
      currentSelect = next;
    }
  }

  throw new Error('[findPublicBusinesses] exceeded P2022 column drift retry limit');
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {import('@prisma/client').Prisma.BusinessFindManyArgs} args
 */
export async function findPublicBusinesses(prisma, args = {}) {
  const { select: selectExtra, ...rest } = args;
  const select = {
    ...businessPublicReadSelect(),
    ...(selectExtra && typeof selectExtra === 'object' ? selectExtra : {}),
  };
  return queryBusinessWithColumnDriftRetry(prisma, 'findMany', rest, select);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {import('@prisma/client').Prisma.BusinessFindUniqueArgs} args
 */
export async function findPublicBusinessByUnique(prisma, args = {}) {
  const { select: selectExtra, ...rest } = args;
  const select = {
    ...businessPublicReadSelect(),
    ...(selectExtra && typeof selectExtra === 'object' ? selectExtra : {}),
  };
  return queryBusinessWithColumnDriftRetry(prisma, 'findUnique', rest, select);
}
