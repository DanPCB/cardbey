/**
 * Resolve extracted entity refs to DB records or typed resolution errors.
 */

import { getPrismaClient } from '../prisma.js';
import { getMissionById } from '../missionBlackboard.js';
import { resolveStoreIdFromContext } from '../tools/resolveStoreIdFromContext.js';
import { caseInsensitiveFilter } from '../dbCapabilities.js';
import { writeEpisodicEventAsync } from './episodicWriter.js';

/**
 * @typedef {{
 *   type: string;
 *   ref: string;
 *   pronoun?: boolean;
 *   position?: number;
 * }} EntityRef
 */

/**
 * @typedef {{
 *   entityType: string;
 *   ref: string;
 *   reason: 'NOT_FOUND' | 'AMBIGUOUS' | 'PRONOUN_UNRESOLVABLE';
 *   candidates?: { id: string; name: string }[];
 * }} ResolutionError
 */

/**
 * @typedef {{
 *   resolved: {
 *     store?: { id: string; name: string; slug?: string | null };
 *     product?: { id: string; name: string; storeId?: string | null };
 *     campaign?: { id: string; name: string; storeId?: string | null };
 *   };
 *   errors: ResolutionError[];
 *   confidence: 'high' | 'medium' | 'low';
 * }} ResolutionResult
 */

function str(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

/** True when ref has no specific store name (e.g. "the store", "update the store"). */
function isGenericStoreRef(ref) {
  const raw = str(ref);
  if (!raw) return true;
  const basicNorm = raw.replace(/\b(my|the|store|shop|web|business)\b/gi, '').trim();
  if (!basicNorm) return true;
  const stripped = raw
    .replace(
      /\b(my|the|a|store|shop|web|business|update|analyze|analyse|change|edit|fix|open|show|view|manage|refresh|please)\b/gi,
      '',
    )
    .trim();
  if (stripped.length < 2) return true;
  return /^(?:update|change|edit|fix|analyze|analyse)\s+(?:the\s+)?(?:my\s+)?(?:store|shop|business)\s*$/i.test(
    raw,
  );
}

function emptyResult() {
  return { resolved: {}, errors: [], confidence: 'low' };
}

/**
 * @param {ResolutionResult} result
 * @param {'high' | 'medium' | 'low'} level
 */
function bumpConfidence(result, level) {
  const order = { low: 0, medium: 1, high: 2 };
  if (order[level] > order[result.confidence]) {
    result.confidence = level;
  }
}

/**
 * @param {string} userId
 * @param {string} ref
 * @param {boolean} pronoun
 * @param {Record<string, unknown>} episodicContext
 * @param {string | null} missionId
 * @param {string | null} activeStoreId
 */
async function resolveStoreRef(userId, ref, pronoun, episodicContext, missionId, activeStoreId) {
  const prisma = getPrismaClient();

  if (pronoun) {
    const last =
      episodicContext?.lastResolvedStore ??
      episodicContext?.lastStore ??
      null;
    if (last?.id) {
      const row = await prisma.business.findFirst({
        where: { id: String(last.id), userId },
        select: { id: true, name: true, slug: true },
      });
      if (row) {
        return { store: row, confidence: 'low', error: null };
      }
    }
    if (activeStoreId) {
      const row = await prisma.business.findFirst({
        where: { id: String(activeStoreId), userId },
        select: { id: true, name: true, slug: true },
      });
      if (row) {
        return { store: row, confidence: 'high', error: null };
      }
    }
    return {
      store: null,
      confidence: 'low',
      error: {
        entityType: 'store',
        ref,
        reason: 'PRONOUN_UNRESOLVABLE',
      },
    };
  }

  if (missionId) {
    const mission = await getMissionById(missionId);
    const sid = str(mission?.storeId);
    if (sid) {
      const row = await prisma.business.findFirst({
        where: { id: sid, userId },
        select: { id: true, name: true, slug: true },
      });
      if (row) {
        return { store: row, confidence: 'high', error: null };
      }
    }
  }

  const fromContext = await resolveStoreIdFromContext({
    missionId,
    storeContext: activeStoreId ? { storeId: activeStoreId } : null,
    blackboardContext: null,
  });
  if (fromContext) {
    const row = await prisma.business.findFirst({
      where: { id: fromContext, userId },
      select: { id: true, name: true, slug: true },
    });
    if (row) {
      return { store: row, confidence: 'high', error: null };
    }
  }

  const refNorm = ref.replace(/\b(my|the|store|shop|web)\b/gi, '').trim();
  const owned = await prisma.business.findMany({
    where: { userId },
    select: { id: true, name: true, slug: true },
    orderBy: { updatedAt: 'desc' },
  });

  if (!pronoun && isGenericStoreRef(ref) && owned.length >= 2) {
    return {
      store: null,
      confidence: 'low',
      error: {
        entityType: 'store',
        ref: ref || 'store',
        reason: 'AMBIGUOUS',
        candidates: owned.map((r) => ({ id: r.id, name: r.name })),
      },
    };
  }

  if (refNorm.length >= 2) {
    const exact = await prisma.business.findMany({
      where: {
        userId,
        name: caseInsensitiveFilter(refNorm, 'equals'),
      },
      select: { id: true, name: true, slug: true },
      take: 5,
    });
    if (exact.length === 1) {
      return { store: exact[0], confidence: 'high', error: null };
    }
    if (exact.length > 1) {
      return {
        store: null,
        confidence: 'low',
        error: {
          entityType: 'store',
          ref,
          reason: 'AMBIGUOUS',
          candidates: exact.map((r) => ({ id: r.id, name: r.name })),
        },
      };
    }

    const fuzzy = await prisma.business.findMany({
      where: {
        userId,
        name: { contains: refNorm.slice(0, 40) },
      },
      select: { id: true, name: true, slug: true },
      take: 6,
    });
    const filtered = fuzzy.filter((r) =>
      r.name.toLowerCase().includes(refNorm.toLowerCase()),
    );
    if (filtered.length === 1) {
      return { store: filtered[0], confidence: 'medium', error: null };
    }
    if (filtered.length > 1) {
      return {
        store: null,
        confidence: 'low',
        error: {
          entityType: 'store',
          ref,
          reason: 'AMBIGUOUS',
          candidates: filtered.map((r) => ({ id: r.id, name: r.name })),
        },
      };
    }
  }

  if (owned.length === 1) {
    return { store: owned[0], confidence: 'medium', error: null };
  }
  if (owned.length > 1 && !refNorm) {
    return {
      store: null,
      confidence: 'low',
      error: {
        entityType: 'store',
        ref: ref || 'store',
        reason: 'AMBIGUOUS',
        candidates: owned.map((r) => ({ id: r.id, name: r.name })),
      },
    };
  }

  return {
    store: null,
    confidence: 'low',
    error: {
      entityType: 'store',
      ref,
      reason: 'NOT_FOUND',
      candidates: owned.slice(0, 3).map((r) => ({ id: r.id, name: r.name })),
    },
  };
}

/**
 * @param {string} storeId
 * @param {string} ref
 * @param {boolean} pronoun
 * @param {Record<string, unknown>} episodicContext
 */
async function resolveProductRef(storeId, ref, pronoun, episodicContext) {
  const prisma = getPrismaClient();
  if (!storeId) {
    return {
      product: null,
      confidence: 'low',
      error: { entityType: 'product', ref, reason: 'NOT_FOUND' },
    };
  }

  if (pronoun) {
    const last = episodicContext?.lastResolvedProduct ?? episodicContext?.lastProduct ?? null;
    if (last?.id) {
      const row = await prisma.product.findFirst({
        where: { id: String(last.id), businessId: storeId },
        select: { id: true, name: true, businessId: true },
      });
      if (row) {
        return {
          product: { id: row.id, name: row.name, storeId: row.businessId },
          confidence: 'low',
          error: null,
        };
      }
    }
    return {
      product: null,
      confidence: 'low',
      error: { entityType: 'product', ref, reason: 'PRONOUN_UNRESOLVABLE' },
    };
  }

  const name = ref.replace(/\b(the|product|item|menu)\b/gi, '').trim();
  if (name.length < 2) {
    return { product: null, confidence: 'low', error: null };
  }

  const exact = await prisma.product.findMany({
    where: { businessId: storeId, name: caseInsensitiveFilter(name, 'equals') },
    select: { id: true, name: true, businessId: true },
    take: 5,
  });
  if (exact.length === 1) {
    return {
      product: { id: exact[0].id, name: exact[0].name, storeId: exact[0].businessId },
      confidence: 'high',
      error: null,
    };
  }
  if (exact.length > 1) {
    return {
      product: null,
      confidence: 'low',
      error: {
        entityType: 'product',
        ref,
        reason: 'AMBIGUOUS',
        candidates: exact.map((r) => ({ id: r.id, name: r.name })),
      },
    };
  }

  const fuzzy = await prisma.product.findMany({
    where: { businessId: storeId, name: { contains: name.slice(0, 60) } },
    select: { id: true, name: true, businessId: true },
    take: 6,
  });
  if (fuzzy.length === 1) {
    return {
      product: { id: fuzzy[0].id, name: fuzzy[0].name, storeId: fuzzy[0].businessId },
      confidence: 'medium',
      error: null,
    };
  }
  if (fuzzy.length > 1) {
    return {
      product: null,
      confidence: 'low',
      error: {
        entityType: 'product',
        ref,
        reason: 'AMBIGUOUS',
        candidates: fuzzy.map((r) => ({ id: r.id, name: r.name })),
      },
    };
  }

  return {
    product: null,
    confidence: 'low',
    error: { entityType: 'product', ref, reason: 'NOT_FOUND' },
  };
}

/**
 * @param {string} userId
 * @param {string} ref
 * @param {boolean} pronoun
 * @param {Record<string, unknown>} episodicContext
 * @param {string | null} missionId
 */
async function resolveCampaignRef(userId, ref, pronoun, episodicContext, missionId) {
  const prisma = getPrismaClient();

  if (pronoun) {
    const last = episodicContext?.lastResolvedCampaign ?? episodicContext?.lastCampaign ?? null;
    if (last?.id) {
      return {
        campaign: { id: String(last.id), name: String(last.name ?? 'Campaign'), storeId: null },
        confidence: 'low',
        error: null,
      };
    }
    return {
      campaign: null,
      confidence: 'low',
      error: { entityType: 'campaign', ref, reason: 'PRONOUN_UNRESOLVABLE' },
    };
  }

  const active = await prisma.missionPipeline.findFirst({
    where: {
      createdBy: userId,
      ...(missionId ? { id: missionId } : {}),
      type: { contains: 'campaign' },
      status: { in: ['requested', 'running', 'executing', 'awaiting_approval', 'active'] },
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, targetId: true },
  });
  if (active) {
    return {
      campaign: {
        id: active.id,
        name: active.title,
        storeId: active.targetId ?? null,
      },
      confidence: 'high',
      error: null,
    };
  }

  const recent = await prisma.missionPipeline.findMany({
    where: {
      createdBy: userId,
      OR: [{ type: { contains: 'campaign' } }, { type: { contains: 'promotion' } }],
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, targetId: true },
    take: 5,
  });
  if (recent.length === 1) {
    return {
      campaign: {
        id: recent[0].id,
        name: recent[0].title,
        storeId: recent[0].targetId ?? null,
      },
      confidence: 'medium',
      error: null,
    };
  }
  if (recent.length > 1) {
    return {
      campaign: null,
      confidence: 'low',
      error: {
        entityType: 'campaign',
        ref,
        reason: 'AMBIGUOUS',
        candidates: recent.map((r) => ({ id: r.id, name: r.title })),
      },
    };
  }

  return {
    campaign: null,
    confidence: 'low',
    error: { entityType: 'campaign', ref, reason: 'NOT_FOUND' },
  };
}

/**
 * @param {EntityRef[]} entityRefs
 * @param {string} userId
 * @param {Record<string, unknown>} [episodicContext]
 * @param {{ missionId?: string | null; activeStoreId?: string | null }} [opts]
 * @returns {Promise<ResolutionResult>}
 */
export async function resolveEntities(entityRefs, userId, episodicContext = {}, opts = {}) {
  const uid = str(userId);
  if (!uid) return emptyResult();

  const refs = Array.isArray(entityRefs) ? entityRefs : [];
  const result = emptyResult();
  const missionId = str(opts.missionId);
  const activeStoreId = str(opts.activeStoreId);

  const storeRefs = refs.filter((r) => r.type === 'store');
  const productRefs = refs.filter((r) => r.type === 'product');
  const campaignRefs = refs.filter((r) => r.type === 'campaign');

  for (const sr of storeRefs) {
    const { store, confidence, error } = await resolveStoreRef(
      uid,
      sr.ref,
      Boolean(sr.pronoun),
      episodicContext,
      missionId,
      activeStoreId,
    );
    if (store) {
      result.resolved.store = store;
      bumpConfidence(result, confidence);
      writeEpisodicEventAsync({
        userId: uid,
        missionId: missionId || null,
        type: 'entity_resolved',
        entityType: 'store',
        entityRef: sr.ref,
        resolvedId: store.id,
        storeId: store.id,
      });
    } else if (error) {
      result.errors.push(error);
    }
  }

  if (!result.resolved.store && (activeStoreId || missionId)) {
    const fallback = await resolveStoreRef(uid, '', false, episodicContext, missionId, activeStoreId);
    if (fallback.store) {
      result.resolved.store = fallback.store;
      bumpConfidence(result, fallback.confidence);
    }
  }

  const storeId = result.resolved.store?.id ?? activeStoreId ?? null;

  for (const pr of productRefs) {
    const { product, confidence, error } = await resolveProductRef(
      storeId,
      pr.ref,
      Boolean(pr.pronoun),
      episodicContext,
    );
    if (product) {
      result.resolved.product = product;
      bumpConfidence(result, confidence);
      writeEpisodicEventAsync({
        userId: uid,
        missionId: missionId || null,
        type: 'entity_resolved',
        entityType: 'product',
        entityRef: pr.ref,
        resolvedId: product.id,
        storeId: product.storeId ?? storeId,
      });
    } else if (error) {
      result.errors.push(error);
    }
  }

  for (const cr of campaignRefs) {
    const { campaign, confidence, error } = await resolveCampaignRef(
      uid,
      cr.ref,
      Boolean(cr.pronoun),
      episodicContext,
      missionId,
    );
    if (campaign) {
      result.resolved.campaign = campaign;
      bumpConfidence(result, confidence);
      writeEpisodicEventAsync({
        userId: uid,
        missionId: missionId || null,
        type: 'entity_resolved',
        entityType: 'campaign',
        entityRef: cr.ref,
        resolvedId: campaign.id,
        storeId: campaign.storeId ?? storeId,
      });
    } else if (error) {
      result.errors.push(error);
    }
  }

  if (result.resolved.store && result.confidence === 'low' && !result.errors.length) {
    result.confidence = 'medium';
  }

  return result;
}
