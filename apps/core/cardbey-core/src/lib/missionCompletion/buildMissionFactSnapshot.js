/**
 * Deterministic mission fact snapshot for next-step policy (no LLM).
 */

import { getPrismaClient } from '../prisma.js';

/** @param {unknown} raw */
function asObject(raw) {
  return raw != null && typeof raw === 'object' && !Array.isArray(raw) ? /** @type {Record<string, unknown>} */ (raw) : {};
}

/** @param {unknown} raw */
function normalizeBlackboardPayload(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return /** @type {Record<string, unknown>} */ (raw);
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p != null && typeof p === 'object' && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Checkpoint owner answers live on pipeline outputsJson (flattened), e.g. logoChoice / heroImageChoice.
 * @param {Record<string, unknown>} outputsJson
 */
export function extractCheckpointOutputs(outputsJson) {
  const o = asObject(outputsJson);
  const nested = asObject(o['mission.checkpoint']);
  const logoChoice =
    (o.logoChoice != null ? String(o.logoChoice) : null) ||
    (nested.logoChoice != null ? String(nested.logoChoice) : null) ||
    null;
  const heroImageChoice =
    (o.heroImageChoice != null ? String(o.heroImageChoice) : null) ||
    (nested.heroImageChoice != null ? String(nested.heroImageChoice) : null) ||
    null;
  return { logoChoice, heroImageChoice };
}

/**
 * @param {string} missionId
 * @returns {Promise<string[]>} stable keys: `tool` or `tool:actionId`
 */
export async function getCompletedActionKeys(missionId) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return [];
  const prisma = getPrismaClient();
  if (!prisma?.missionBlackboard?.findMany) return [];
  try {
    const rows = await prisma.missionBlackboard.findMany({
      where: { missionId: mid, eventType: 'completed_action' },
      orderBy: { seq: 'asc' },
      select: { payload: true },
    });
    const out = [];
    for (const r of rows) {
      const p = normalizeBlackboardPayload(r.payload);
      const tool = typeof p.tool === 'string' && p.tool.trim() ? p.tool.trim() : 'unknown';
      const actionId = typeof p.actionId === 'string' && p.actionId.trim() ? p.actionId.trim() : '';
      out.push(actionId ? `${tool}:${actionId}` : tool);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * @param {unknown} logoField — Business.logo is often JSON `{ url }`
 */
function hasLogoFromLogoField(logoField) {
  if (logoField == null) return false;
  if (typeof logoField === 'string' && logoField.trim()) {
    const t = logoField.trim();
    if (t.startsWith('http') || t.startsWith('data:')) return true;
    try {
      const j = JSON.parse(t);
      if (j && typeof j === 'object' && typeof j.url === 'string' && j.url.trim()) return true;
    } catch {
      return t.length > 10;
    }
  }
  return false;
}

/**
 * @param {{ missionId: string, outputsJson?: unknown, metadataJson?: unknown }} args
 */
export async function buildMissionFactSnapshot({ missionId, outputsJson, metadataJson }) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  const o = asObject(outputsJson);
  const meta = asObject(metadataJson);
  const ssb = asObject(o.structured_store_build);

  const storeId =
    (typeof o.storeId === 'string' && o.storeId.trim()) ||
    (typeof ssb.storeId === 'string' && ssb.storeId.trim()) ||
    (typeof ssb.businessId === 'string' && ssb.businessId.trim()) ||
    null;

  const draftId =
    (typeof o.draftId === 'string' && o.draftId.trim()) || (typeof ssb.draftId === 'string' && ssb.draftId.trim()) || null;

  const generationRunId =
    (typeof o.generationRunId === 'string' && o.generationRunId.trim()) ||
    (typeof ssb.generationRunId === 'string' && ssb.generationRunId.trim()) ||
    null;

  const storeName =
    (typeof o.storeName === 'string' && o.storeName.trim()) ||
    (typeof o.businessName === 'string' && o.businessName.trim()) ||
    (typeof meta.businessName === 'string' && meta.businessName.trim()) ||
    (typeof meta.storeName === 'string' && meta.storeName.trim()) ||
    null;

  const storeType =
    (typeof o.storeType === 'string' && o.storeType.trim()) ||
    (typeof o.businessType === 'string' && o.businessType.trim()) ||
    (typeof meta.businessType === 'string' && meta.businessType.trim()) ||
    (typeof meta.storeType === 'string' && meta.storeType.trim()) ||
    null;

  const catalogSourceRaw =
    (typeof o.catalogSource === 'string' && o.catalogSource.trim()) ||
    (typeof ssb.catalogSource === 'string' && ssb.catalogSource.trim()) ||
    'seed';

  const catalogSource = catalogSourceRaw.toLowerCase();
  const hasRealProducts = ['user', 'user_upload', 'ocr', 'ai'].includes(catalogSource);

  const itemCountRaw = ssb.itemCount ?? o.itemCount ?? 0;
  const itemCount = typeof itemCountRaw === 'number' && Number.isFinite(itemCountRaw) ? itemCountRaw : 0;

  const hasLogoFromOutputs = !!(
    (typeof o.logoUrl === 'string' && o.logoUrl.trim()) ||
    (typeof o.avatarUrl === 'string' && o.avatarUrl.trim()) ||
    (typeof ssb.avatarUrl === 'string' && ssb.avatarUrl.trim()) ||
    (typeof o.avatarImageUrl === 'string' && o.avatarImageUrl.trim())
  );

  const hasCustomHeroFromOutputs = !!(
    (typeof o.heroImageUrl === 'string' && o.heroImageUrl.trim()) ||
    (typeof ssb.heroImageUrl === 'string' && ssb.heroImageUrl.trim())
  );

  const isPublishedFromOutputs = !!(
    o.publishedAt ||
    ssb.publishedAt ||
    (typeof o.publishedAt === 'string' && String(o.publishedAt).trim()) ||
    (typeof ssb.publishedAt === 'string' && String(ssb.publishedAt).trim())
  );

  const hasCustomDomainFromOutputs = !!(typeof o.customDomain === 'string' && o.customDomain.trim());

  const cp = extractCheckpointOutputs(o);
  const logoSkipped = String(cp.logoChoice ?? '').toLowerCase() === 'skip';

  const completedActions = mid ? await getCompletedActionKeys(mid) : [];

  let storeRecord = null;
  if (storeId) {
    try {
      const prisma = getPrismaClient();
      storeRecord = await prisma.business
        .findUnique({
          where: { id: storeId },
          select: {
            publishedAt: true,
            logo: true,
            heroImageUrl: true,
            avatarImageUrl: true,
            storefrontSettings: true,
          },
        })
        .catch(() => null);
    } catch {
      storeRecord = null;
    }
  }

  const storefront = asObject(storeRecord?.storefrontSettings);
  const hasCustomDomain = !!(
    hasCustomDomainFromOutputs ||
    (typeof storefront.customDomain === 'string' && storefront.customDomain.trim()) ||
    (typeof storefront.domain === 'string' && storefront.domain.trim())
  );

  const hasLogo = !!(
    (typeof storeRecord?.avatarImageUrl === 'string' && storeRecord.avatarImageUrl.trim()) ||
    hasLogoFromLogoField(storeRecord?.logo) ||
    hasLogoFromOutputs
  );

  const hasCustomHero = !!(
    (typeof storeRecord?.heroImageUrl === 'string' && storeRecord.heroImageUrl.trim()) || hasCustomHeroFromOutputs
  );

  const isPublished = !!(storeRecord?.publishedAt ?? isPublishedFromOutputs);

  return {
    missionId: mid,
    storeId,
    draftId,
    generationRunId,
    storeName,
    storeType,
    hasLogo,
    hasCustomHero,
    hasRealProducts,
    itemCount,
    catalogSource,
    isPublished,
    hasCustomDomain,
    logoSkipped,
    completedActions,
  };
}
