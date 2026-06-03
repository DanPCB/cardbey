/**
 * Runtime Target Readiness — operational state for stores, campaigns, devices.
 * Distinct from prerequisite resolution (missing resource vs existing-but-incomplete).
 */

import { getPrismaClient } from '../prisma.js';

export const STORE_READINESS = {
  MISSING: 'missing',
  DRAFT_CREATED: 'draft_created',
  DRAFT_READY: 'draft_ready',
  PUBLISHED: 'published',
  ACTIVE: 'active',
};

export const CAMPAIGN_READINESS = {
  PLANNED: 'planned',
  DRAFT_ASSETS_READY: 'draft_assets_ready',
  AWAITING_APPROVAL: 'awaiting_approval',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
};

export const DEVICE_READINESS = {
  PAIRED: 'paired',
  ONLINE: 'online',
  PLAYLIST_READY: 'playlist_ready',
  DEPLOYED: 'deployed',
};

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function asObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/** @param {string} userId */
export function draftOwnerWhere(userId) {
  const uid = str(userId);
  if (!uid) return { ownerUserId: '__none__' };
  if (uid.toLowerCase().startsWith('guest_')) {
    const guestSessionId = uid.slice(6);
    return {
      OR: [{ ownerUserId: uid }, ...(guestSessionId ? [{ guestSessionId }] : [])],
    };
  }
  return { ownerUserId: uid };
}

/**
 * @param {object|null|undefined} row MissionPipeline row or summary
 */
export function resolveTargetIdsFromMission(row) {
  if (!row) return { storeId: null, draftId: null, campaignId: null };
  const meta = asObj(row.metadataJson);
  const outputs = asObj(row.outputsJson);
  const metaCtx = asObj(meta.context);
  const structured = asObj(outputs.structured_store_build);

  const draftId =
    str(meta.draftId) ||
    str(metaCtx.draftId) ||
    str(outputs.draftId) ||
    str(structured.draftId) ||
    null;

  const storeId =
    str(meta.storeId) ||
    str(metaCtx.storeId) ||
    str(outputs.storeId) ||
    str(structured.storeId) ||
    (str(row.targetType) === 'store' ? str(row.targetId) : '') ||
    null;

  return {
    storeId: storeId && storeId !== 'temp' ? storeId : null,
    draftId,
    campaignId: str(meta.campaignId) || str(outputs.campaignId) || null,
  };
}

/**
 * @param {{ userId: string; storeId?: string|null; draftId?: string|null; mission?: object|null }} input
 */
export async function resolveStoreReadiness(input) {
  const userId = str(input?.userId);
  let storeId = str(input?.storeId);
  let draftId = str(input?.draftId);
  const prisma = getPrismaClient();

  if (!storeId && !draftId && input?.mission) {
    const fromMission = resolveTargetIdsFromMission(input.mission);
    storeId = fromMission.storeId || storeId;
    draftId = fromMission.draftId || draftId;
  }

  if (draftId && !storeId) {
    const draft = await prisma.draftStore.findFirst({
      where: {
        id: draftId,
        OR: [{ ownerUserId: userId }, { committedUserId: userId }],
      },
      select: {
        id: true,
        status: true,
        committedStoreId: true,
        preview: true,
        publishSnapshot: true,
      },
    });
    if (draft?.committedStoreId) storeId = draft.committedStoreId;
    if (draft && !storeId) {
      const st = str(draft.status).toLowerCase();
      if (st === 'generating' || st === 'draft') {
        return buildStoreReadinessResult({
          exists: true,
          readinessState: STORE_READINESS.DRAFT_CREATED,
          storeId: null,
          draftId: draft.id,
          blockingIssues: [{ type: 'draft_generating', message: 'Your store draft is still being created.' }],
          recommendedActions: ['wait_for_draft'],
          operationalCapabilities: { canPreview: false, canPublish: false, canCampaign: false },
        });
      }
      if (st === 'ready' || st === 'committed') {
        return buildStoreReadinessResult({
          exists: true,
          readinessState: STORE_READINESS.DRAFT_READY,
          storeId: draft.committedStoreId || null,
          draftId: draft.id,
          blockingIssues: [{ type: 'unpublished', message: 'Your store is ready to publish.' }],
          recommendedActions: ['publish_store', 'connect_domain', 'review_store_draft'],
          operationalCapabilities: { canPreview: true, canPublish: true, canCampaign: false },
        });
      }
    }
  }

  if (!storeId && userId) {
    const latestDraft = await prisma.draftStore.findFirst({
      where: {
        ...draftOwnerWhere(userId),
        status: { in: ['ready', 'generating', 'draft', 'committed'] },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, status: true, committedStoreId: true },
    });
    if (latestDraft) {
      if (latestDraft.committedStoreId) {
        return resolveStoreReadiness({
          userId,
          storeId: latestDraft.committedStoreId,
          draftId: latestDraft.id,
        });
      }
      const st = str(latestDraft.status).toLowerCase();
      if (st === 'generating' || st === 'draft') {
        return buildStoreReadinessResult({
          exists: true,
          readinessState: STORE_READINESS.DRAFT_CREATED,
          storeId: null,
          draftId: latestDraft.id,
          blockingIssues: [{ type: 'draft_generating', message: 'Your store draft is still being created.' }],
          recommendedActions: ['wait_for_draft'],
          operationalCapabilities: { canPreview: false, canPublish: false, canCampaign: false },
        });
      }
      if (st === 'ready' || st === 'committed') {
        return buildStoreReadinessResult({
          exists: true,
          readinessState: STORE_READINESS.DRAFT_READY,
          storeId: latestDraft.committedStoreId || null,
          draftId: latestDraft.id,
          blockingIssues: [{ type: 'unpublished', message: 'Your store is ready to publish.' }],
          recommendedActions: ['publish_store', 'connect_domain', 'review_store_draft'],
          operationalCapabilities: { canPreview: true, canPublish: true, canCampaign: false },
        });
      }
    }
  }

  if (!storeId && userId) {
    const ownedStores = await prisma.business.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 2,
      select: { id: true },
    });
    if (ownedStores.length >= 2) {
      return buildStoreReadinessResult({
        exists: true,
        readinessState: STORE_READINESS.ACTIVE,
        storeId: null,
        draftId: null,
        blockingIssues: [{ type: 'store_selection_required', message: 'Choose which store to use.' }],
        recommendedActions: ['select_existing_store'],
        operationalCapabilities: { canPreview: false, canPublish: false, canCampaign: false },
      });
    }
    if (ownedStores.length === 1) {
      return resolveStoreReadiness({ userId, storeId: ownedStores[0].id, draftId });
    }
  }

  if (!storeId) {
    return buildStoreReadinessResult({
      exists: false,
      readinessState: STORE_READINESS.MISSING,
      storeId: null,
      draftId: null,
      blockingIssues: [{ type: 'store_missing', message: 'This action requires a store.' }],
      recommendedActions: ['create_store', 'select_existing_store'],
      operationalCapabilities: { canPreview: false, canPublish: false, canCampaign: false },
    });
  }

  const business = await prisma.business.findFirst({
    where: { id: storeId, userId },
    select: {
      id: true,
      name: true,
      slug: true,
      publishedAt: true,
      isActive: true,
    },
  });

  if (!business) {
    return buildStoreReadinessResult({
      exists: false,
      readinessState: STORE_READINESS.MISSING,
      storeId: null,
      draftId: draftId || null,
      blockingIssues: [{ type: 'store_not_accessible', message: 'Store not found or access denied.' }],
      recommendedActions: ['create_store', 'select_existing_store'],
      operationalCapabilities: { canPreview: false, canPublish: false, canCampaign: false },
    });
  }

  const [productCount, promoCount, deviceCount] = await Promise.all([
    prisma.product.count({ where: { businessId: storeId, deletedAt: null } }).catch(() => 0),
    prisma.storePromo.count({ where: { businessId: storeId } }).catch(() => 0),
    prisma.device.count({ where: { storeId } }).catch(() => 0),
  ]);

  const isPublished = business.publishedAt != null;
  const hasCatalog = productCount > 0;
  const hasPromo = promoCount > 0;
  const hasDevices = deviceCount > 0;

  if (!isPublished) {
    const linkedDraft = draftId
      ? null
      : await prisma.draftStore.findFirst({
          where: { committedStoreId: storeId, ownerUserId: userId },
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        });
    return buildStoreReadinessResult({
      exists: true,
      readinessState: STORE_READINESS.DRAFT_READY,
      storeId,
      draftId: draftId || linkedDraft?.id || null,
      blockingIssues: [{ type: 'unpublished', message: 'Your store is ready to publish.' }],
      recommendedActions: ['publish_store', 'connect_domain', 'launch_first_offer'],
      operationalCapabilities: { canPreview: true, canPublish: true, canCampaign: false },
      readinessScore: 0.45,
    });
  }

  if (hasCatalog || hasPromo || hasDevices) {
    /** @type {string[]} */
    const actions = ['review_store_performance', 'launch_campaign', 'analyze_store'];
    if (!hasDevices) actions.push('connect_signage_device');
    if (!hasPromo) actions.push('launch_first_offer');
    return buildStoreReadinessResult({
      exists: true,
      readinessState: STORE_READINESS.ACTIVE,
      storeId,
      draftId: draftId || null,
      blockingIssues: [],
      recommendedActions: actions,
      operationalCapabilities: { canPreview: true, canPublish: true, canCampaign: true, canSignage: hasDevices },
      readinessScore: 0.9,
    });
  }

  return buildStoreReadinessResult({
    exists: true,
    readinessState: STORE_READINESS.PUBLISHED,
    storeId,
    draftId: draftId || null,
    blockingIssues: [],
    recommendedActions: ['launch_first_offer', 'launch_campaign', 'analyze_store', 'connect_domain'],
    operationalCapabilities: { canPreview: true, canPublish: true, canCampaign: true },
    readinessScore: 0.7,
  });
}

function buildStoreReadinessResult(partial) {
  const readinessState = partial.readinessState ?? STORE_READINESS.MISSING;
  const guidanceMessage = guidanceForStoreState(readinessState);
  return {
    targetType: 'store',
    exists: Boolean(partial.exists),
    readinessState,
    readinessScore: partial.readinessScore ?? scoreForState(readinessState),
    blockingIssues: partial.blockingIssues ?? [],
    recommendedActions: partial.recommendedActions ?? [],
    operationalCapabilities: partial.operationalCapabilities ?? {},
    guidanceMessage,
    storeId: partial.storeId ?? null,
    draftId: partial.draftId ?? null,
  };
}

function guidanceForStoreState(state) {
  switch (state) {
    case STORE_READINESS.MISSING:
      return 'To run this mission, you need a store first.';
    case STORE_READINESS.DRAFT_CREATED:
      return 'Your store draft is being created. Preview will appear when ready.';
    case STORE_READINESS.DRAFT_READY:
      return 'Your store is ready to publish.';
    case STORE_READINESS.PUBLISHED:
      return 'Your store is published and ready for campaigns.';
    case STORE_READINESS.ACTIVE:
      return 'Your store is active. Consider scaling with campaigns or signage.';
    default:
      return null;
  }
}

function scoreForState(state) {
  switch (state) {
    case STORE_READINESS.MISSING:
      return 0;
    case STORE_READINESS.DRAFT_CREATED:
      return 0.25;
    case STORE_READINESS.DRAFT_READY:
      return 0.5;
    case STORE_READINESS.PUBLISHED:
      return 0.75;
    case STORE_READINESS.ACTIVE:
      return 1;
    default:
      return 0;
  }
}

/**
 * @param {{
 *   targetType?: string|null;
 *   targetId?: string|null;
 *   mission?: object|null;
 *   runtimeContext?: object|null;
 *   userId?: string|null;
 * }} input
 */
export async function resolveTargetReadiness(input) {
  const targetType = str(input?.targetType) || 'store';
  const userId = str(input?.userId);
  const ctx = asObj(input?.runtimeContext);
  const mission = input?.mission ?? null;

  if (targetType === 'store' || targetType === 'draft_store' || targetType === 'business') {
    const ids = resolveTargetIdsFromMission(mission);
    return resolveStoreReadiness({
      userId,
      storeId: str(input?.targetId) || str(ctx.storeId) || str(ctx.activeStoreId) || ids.storeId,
      draftId: str(ctx.draftId) || ids.draftId,
      mission,
    });
  }

  if (targetType === 'campaign') {
    return {
      targetType: 'campaign',
      exists: Boolean(str(input?.targetId)),
      readinessState: CAMPAIGN_READINESS.PLANNED,
      readinessScore: 0.3,
      blockingIssues: [],
      recommendedActions: ['launch_campaign'],
      operationalCapabilities: {},
      guidanceMessage: 'Preparing your campaign.',
    };
  }

  if (targetType === 'device') {
    return {
      targetType: 'device',
      exists: Boolean(str(input?.targetId)),
      readinessState: DEVICE_READINESS.PAIRED,
      readinessScore: 0.4,
      blockingIssues: [],
      recommendedActions: ['connect_signage_device'],
      operationalCapabilities: {},
      guidanceMessage: null,
    };
  }

  return resolveStoreReadiness({ userId, mission });
}

export default {
  resolveTargetReadiness,
  resolveStoreReadiness,
  resolveTargetIdsFromMission,
  STORE_READINESS,
  CAMPAIGN_READINESS,
  DEVICE_READINESS,
};
