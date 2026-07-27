/**
 * audit_store_completeness — score Business profile completeness (Round 3).
 * DANH: skill-round3-health
 *
 * AUDIT:
 * - audit_store_completeness: not found
 * - analyze_store: found — content analysis, not field checklist
 * - audit_local_presence: found — local growth audit, different scope
 * - audit_codebase: found — maintenance/i18n, unrelated
 */

import { getPrismaClient } from '../prisma.js';

const FIELD_CHECKS = [
  { key: 'name', label: 'name', critical: true, test: (b) => Boolean(b.name?.trim()) },
  { key: 'description', label: 'description', critical: false, test: (b) => Boolean(b.description?.trim()) },
  { key: 'phone', label: 'phone', critical: true, test: (b) => Boolean(b.phone?.trim()) },
  { key: 'address', label: 'address', critical: false, test: (b) => Boolean(b.address?.trim()) },
  { key: 'logo', label: 'logo', critical: false, test: (b) => Boolean(b.logo?.trim()) },
  { key: 'heroImageUrl', label: 'heroImageUrl', critical: true, test: (b) => Boolean(b.heroImageUrl?.trim()) },
  { key: 'category', label: 'category', critical: false, test: (b) => Boolean(b.type?.trim()) },
  {
    key: 'socialLinks',
    label: 'socialLinks',
    critical: false,
    test: (b) => {
      const links = b.socialLinks;
      if (!links || typeof links !== 'object') return false;
      return Object.values(links).some((v) => typeof v === 'string' && v.trim());
    },
  },
  { key: 'brandTone', label: 'brandTone', critical: false, test: (b) => Boolean(b.brandTone?.trim()) },
  { key: 'brandStyle', label: 'brandStyle', critical: false, test: (b) => Boolean(b.brandStyle?.trim()) },
];

/**
 * @param {object} business
 * @param {number} productCount
 */
export function scoreStoreCompleteness(business, productCount) {
  const present = [];
  const missing = [];
  const criticalMissing = [];

  for (const check of FIELD_CHECKS) {
    if (check.test(business)) {
      present.push(check.label);
    } else {
      missing.push(check.label);
      if (check.critical) criticalMissing.push(check.label);
    }
  }

  if (productCount >= 1) {
    present.push('products');
  } else {
    missing.push('products');
    criticalMissing.push('products');
  }

  const totalFields = FIELD_CHECKS.length + 1;
  const score = Math.round((present.length / totalFields) * 100);

  return { score, present, missing, criticalMissing, productCount };
}

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof context?.storeId === 'string' && context.storeId.trim()) ||
    null;

  if (!storeId) {
    return {
      status: 'failed',
      error: { code: 'VALIDATION_ERROR', message: 'storeId is required' },
      output: { ok: false, error: 'storeId is required' },
    };
  }

  const prisma = getPrismaClient();

  try {
    const business = await prisma.business.findFirst({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        description: true,
        phone: true,
        address: true,
        logo: true,
        heroImageUrl: true,
        type: true,
        socialLinks: true,
        brandTone: true,
        brandStyle: true,
      },
    });

    if (!business) {
      return {
        status: 'failed',
        error: { code: 'NOT_FOUND', message: 'Store not found' },
        output: { ok: false, error: 'store_not_found' },
      };
    }

    const productCount = await prisma.product.count({
      where: { businessId: storeId, deletedAt: null },
    });

    const audit = scoreStoreCompleteness(business, productCount);

    // Side effect: read-only DB fetch of Business + product count.
    return {
      status: 'ok',
      output: {
        ok: true,
        storeId,
        ...audit,
      },
    };
  } catch (err) {
    return {
      status: 'failed',
      error: { message: err?.message ?? String(err) },
      output: { ok: false },
    };
  }
}

export default execute;
