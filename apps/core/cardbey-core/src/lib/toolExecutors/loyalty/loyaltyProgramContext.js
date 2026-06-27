/**
 * Store context for intelligent loyalty program drafting.
 */

import { getPrismaClient } from '../../prisma.js';
import segmentLoyalCustomers from './segment_loyal_customers.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function nestedOutput(result) {
  if (!result || typeof result !== 'object') return {};
  const bag = result.output && typeof result.output === 'object' ? result.output : result;
  return bag && typeof bag === 'object' ? bag : {};
}

/**
 * @param {{ storeId: string, userId?: string | null, tenantId?: string | null }} params
 */
export async function gatherLoyaltyProgramContext(params) {
  const storeId = pickString(params.storeId);
  const tenantId = pickString(params.tenantId, params.userId);
  const prisma = getPrismaClient();

  const segmentResult = await segmentLoyalCustomers({ storeId }, {});
  const segmentOut = nestedOutput(segmentResult);
  const customerCount = Number(segmentOut.customerCount) || 0;

  let products = [];
  try {
    if (prisma?.product?.findMany) {
      products = await prisma.product.findMany({
        where: { businessId: storeId, deletedAt: null },
        select: { name: true, category: true, itemType: true, description: true },
        take: 12,
        orderBy: { updatedAt: 'desc' },
      });
    }
  } catch {
    products = [];
  }

  let existingProgram = null;
  try {
    existingProgram = await prisma.loyaltyProgram.findFirst({
      where: { storeId, ...(tenantId ? { tenantId } : {}) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, stampsRequired: true, reward: true },
    });
  } catch {
    existingProgram = null;
  }

  let promoHistory = [];
  try {
    promoHistory = await prisma.storePromo.findMany({
      where: { storeId },
      select: { id: true, title: true, promoType: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
  } catch {
    promoHistory = [];
  }

  return {
    customerCount,
    segmentOut,
    products,
    existingProgram,
    promoHistory,
    evidence: {
      productCount: products.length,
      loyalCustomerCount: customerCount,
      hasExistingProgram: Boolean(existingProgram?.id),
      promoCount: promoHistory.length,
    },
  };
}

/**
 * Category-aware reward copy from catalog signals.
 *
 * @param {{ businessCategory?: string, products?: Array<{ name?: string, category?: string, itemType?: string }> }} params
 */
export function inferRewardFromCatalog(params) {
  const category = pickString(params.businessCategory, 'General').toLowerCase();
  const products = Array.isArray(params.products) ? params.products : [];
  const names = products.map((p) => pickString(p?.name).toLowerCase()).filter(Boolean);
  const joined = `${category} ${names.join(' ')}`;

  if (/coffee|cafe|espresso|latte|bakery|food|restaurant|bar/.test(joined)) {
    const item = names.find((n) => /coffee|latte|drink|meal|item/.test(n)) || 'coffee';
    return { productHint: item, rewardTemplate: (n) => `Buy 9 ${n}s, get 1 free ${n}` };
  }
  if (/nail|salon|spa|beauty|hair/.test(joined)) {
    return {
      productHint: 'visit',
      rewardTemplate: () => 'Complete 5 visits, get $15 off your next appointment',
    };
  }
  if (/signage|design|print|graphic/.test(joined)) {
    return {
      productHint: 'spend',
      rewardTemplate: () => 'Spend $500 total, get $50 design credit',
    };
  }
  if (/fitness|gym|sport|yoga/.test(joined)) {
    return { productHint: 'session', rewardTemplate: () => 'Complete 8 sessions, get 1 free session' };
  }
  if (names.length > 0) {
    const top = names[0];
    return { productHint: top, rewardTemplate: (n) => `Buy 9, get 1 free ${n}` };
  }
  return null;
}
