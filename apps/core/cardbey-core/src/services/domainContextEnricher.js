/**
 * Enriches mission-related flows with domain context from the database (Business, Product, MissionContext).
 */

import { getPrismaClient } from '../lib/prisma.js';

function baseResult(storeId, overrides = {}) {
  const sid = storeId != null ? String(storeId) : '';
  return {
    storeId: sid,
    storeProfile: null,
    recentMissions: [],
    productCatalog: [],
    enrichedAt: new Date().toISOString(),
    ...overrides,
  };
}

function parseObjectJson(str) {
  try {
    const v = JSON.parse(str == null ? '{}' : str);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    return {};
  } catch {
    return {};
  }
}

function parseOutcomeJson(str) {
  if (str == null || str === '') return {};
  try {
    const v = JSON.parse(str);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    return {};
  } catch {
    return {};
  }
}

function pickCanonicalIntent(context) {
  if (!context || typeof context !== 'object') return null;
  const c =
    context.canonicalIntent ??
    context.intentType ??
    context.intent ??
    context.type ??
    null;
  if (c == null) return null;
  const s = String(c).trim();
  return s.length ? s : null;
}

function pickSuccess(outcome) {
  if (!outcome || typeof outcome !== 'object') return null;
  if (typeof outcome.success === 'boolean') return outcome.success;
  return null;
}

function pickCapturedAt(outcome, updatedAt) {
  try {
    const ca = outcome?.completedAt;
    if (ca instanceof Date && !Number.isNaN(ca.getTime())) return ca.toISOString();
    if (typeof ca === 'string' && ca.trim()) return new Date(ca).toISOString();
  } catch {
    // fall through
  }
  try {
    return new Date(updatedAt).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

async function loadRecentMissions(storeId) {
  try {
    const prisma = getPrismaClient();
    const rows = await prisma.missionContext.findMany({
      where: {
        contextJson: { contains: storeId },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
    return rows.map((ctx) => {
      const context = parseObjectJson(ctx.contextJson);
      const outcome = parseOutcomeJson(ctx.outcomeJson);
      try {
        JSON.parse(ctx.snapshotsJson == null ? '[]' : ctx.snapshotsJson);
      } catch {
        // invalid snapshotsJson — still emit row from context/outcome
      }
      return {
        missionId: ctx.missionId,
        canonicalIntent: pickCanonicalIntent(context),
        success: pickSuccess(outcome),
        capturedAt: pickCapturedAt(outcome, ctx.updatedAt),
      };
    });
  } catch {
    return [];
  }
}

async function loadProductCatalog(storeId) {
  try {
    const prisma = getPrismaClient();
    const products = await prisma.product.findMany({
      where: { businessId: storeId, deletedAt: null },
      select: { id: true, name: true, price: true, category: true, imageUrl: true },
      take: 10,
    });
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      category: p.category,
      imageUrl: p.imageUrl,
    }));
  } catch {
    return [];
  }
}

async function loadStoreProfile(storeId) {
  try {
    const prisma = getPrismaClient();
    const b = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, type: true },
    });
    if (!b) return null;
    return {
      storeId: b.id,
      storeName: b.name,
      storeType: b.type,
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} storeId - Business id (store id in API terms)
 * @returns {Promise<{
 *   storeId: string,
 *   storeProfile: { storeId: string, storeName: string, storeType: string } | null,
 *   recentMissions: Array<{ missionId: string, canonicalIntent: string | null, success: boolean | null, capturedAt: string }>,
 *   productCatalog: Array<{ id: string, name: string, price: number | null, category: string | null, imageUrl: string | null }>,
 *   enrichedAt: string
 * }>}
 */
export async function enrichDomainContext(storeId) {
  try {
    const sid = typeof storeId === 'string' ? storeId.trim() : String(storeId ?? '').trim();
    if (!sid) {
      return baseResult('');
    }

    const [recentMissions, productCatalog, storeProfile] = await Promise.all([
      loadRecentMissions(sid),
      loadProductCatalog(sid),
      loadStoreProfile(sid),
    ]);

    return {
      storeId: sid,
      storeProfile,
      recentMissions: Array.isArray(recentMissions) ? recentMissions : [],
      productCatalog: Array.isArray(productCatalog) ? productCatalog : [],
      enrichedAt: new Date().toISOString(),
    };
  } catch {
    const sid = storeId != null ? String(storeId) : '';
    return baseResult(sid);
  }
}
