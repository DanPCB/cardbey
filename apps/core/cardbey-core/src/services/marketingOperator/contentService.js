/**
 * Marketing content lifecycle: create, version on edit, validate, approve/reject.
 * Material modification after APPROVED → invalidate to DRAFT/NEEDS_REVISION.
 */

import { Features } from '../../config/features.js';
import { appendMarketingAudit } from './audit.js';
import { validateProductClaims } from './claimValidator.js';
import { computeContentHash } from './contentHash.js';
import { CONTENT_STATES } from './constants.js';
import { marketingRepo } from './repository.js';
import { getPublishingProvider } from './publishing/index.js';
import {
  approvalStamp,
  assertApprovalSeparation,
} from '../marketingOperations/approvalDuties.js';
import { tryRecordContentPublished } from '../marketingOperations/attributionSpine.js';

export { computeContentHash } from './contentHash.js';

/**
 * Regenerate draft fields for an existing content item (never publishes).
 * @param {string} id
 * @param {{ actorId?: string, language?: string }} [ctx]
 */
export async function generateContentFields(id, ctx = {}) {
  const existing = await marketingRepo.content.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: 'not_found' };

  const campaign = await marketingRepo.campaign.findUnique({ where: { id: existing.campaignId } }).catch(() => null);
  const { generatePostDraft } = await import('./aiGeneration.js');
  const ai = await generatePostDraft({
    campaign,
    language: ctx.language || existing.language || 'en',
    contentType: existing.contentType || 'post',
    destination: existing.destination,
  });

  const updated = await updateContent(
    id,
    {
      title: ai.draft.title,
      body: ai.draft.body,
      language: ai.draft.language,
      structured: ai.draft.structured,
      generationMeta: ai.generationMeta,
      metadata: {
        ...(typeof existing.metadata === 'object' && existing.metadata ? existing.metadata : {}),
        generationMeta: ai.generationMeta,
        structured: ai.draft.structured,
      },
      changeNote: 'ai_generate',
    },
    { actorId: ctx.actorId },
  );

  return { ok: true, content: updated, generationMeta: ai.generationMeta };
}

/**
 * Latest non-invalidated APPROVED approval whose contentHash matches current material hash.
 * @param {string} contentId
 * @param {string} currentHash
 */
async function findValidApproval(contentId, currentHash) {
  const approval = await marketingRepo.approval.findFirst({
    where: {
      contentId,
      status: CONTENT_STATES.APPROVED,
      invalidatedAt: null,
    },
    orderBy: { decidedAt: 'desc' },
  }).catch(() => null);
  if (!approval) return null;
  if (approval.contentHash && approval.contentHash !== currentHash) return null;
  return approval;
}

/**
 * @param {object} input
 * @param {{ actorId?: string }} [ctx]
 */
export async function createContent(input, ctx = {}) {
  const campaignId = String(input.campaignId || '');
  if (!campaignId) throw new Error('campaignId required');

  const seed = {
    campaignId,
    title: input.title ?? null,
    channel: input.channel || 'facebook',
    language: input.language || 'en',
    contentType: input.contentType || 'post',
    status: CONTENT_STATES.DRAFT,
    body: input.body ?? null,
    mediaBrief: input.mediaBrief ?? null,
    destination: input.destination ?? null,
    trackingMeta: input.trackingMeta ?? null,
    parentContentId: input.parentContentId ?? null,
    metadata: input.metadata ?? null,
    structured: input.structured ?? null,
    generationMeta: input.generationMeta ?? null,
    createdBy: ctx.actorId ?? null,
    currentVersion: 1,
  };

  const contentHash = computeContentHash(seed);
  const content = await marketingRepo.content.create(seed);

  await marketingRepo.version.create({
    contentId: content.id,
    version: 1,
    body: content.body,
    mediaBrief: content.mediaBrief,
    destination: content.destination,
    changeNote: 'initial',
    contentHash,
    structured: content.structured ?? null,
    generationMeta: content.generationMeta ?? null,
    createdBy: ctx.actorId ?? null,
  });

  await appendMarketingAudit({
    entityType: 'MarketingContentItem',
    entityId: content.id,
    action: 'create',
    toStatus: CONTENT_STATES.DRAFT,
    actorId: ctx.actorId,
    campaignId,
    metadata: { contentHash },
  });

  return content;
}

/**
 * @param {{ campaignId?: string, status?: string, take?: number }} [query]
 */
export async function listContent(query = {}) {
  const where = {};
  if (query.campaignId) where.campaignId = query.campaignId;
  if (query.status) where.status = query.status;
  return marketingRepo.content.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: Math.min(Number(query.take) || 100, 300),
  });
}

/**
 * @param {string} id
 */
export async function getContent(id) {
  return marketingRepo.content.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { version: 'desc' }, take: 20 },
      approvals: { orderBy: { createdAt: 'desc' }, take: 10 },
      publications: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
}

function isMaterialChange(existing, patch) {
  const keys = ['body', 'mediaBrief', 'destination', 'title', 'language', 'contentType', 'structured'];
  return keys.some((k) => patch[k] !== undefined && JSON.stringify(patch[k]) !== JSON.stringify(existing[k]));
}

/**
 * Edit content — versions on material change; invalidates approval if was APPROVED.
 * @param {string} id
 * @param {object} patch
 * @param {{ actorId?: string }} [ctx]
 */
export async function updateContent(id, patch, ctx = {}) {
  const existing = await marketingRepo.content.findUnique({ where: { id } });
  if (!existing) return null;

  const material = isMaterialChange(existing, patch);
  const wasApproved = existing.status === CONTENT_STATES.APPROVED;
  const data = {};

  for (const key of [
    'title',
    'body',
    'mediaBrief',
    'destination',
    'trackingMeta',
    'metadata',
    'language',
    'contentType',
    'channel',
    'structured',
    'generationMeta',
  ]) {
    if (patch[key] !== undefined) data[key] = patch[key];
  }

  if (material) {
    const nextVersion = (existing.currentVersion || 1) + 1;
    data.currentVersion = nextVersion;
    if (wasApproved) {
      data.status = CONTENT_STATES.NEEDS_REVISION;
    } else if (existing.status === CONTENT_STATES.READY_FOR_APPROVAL) {
      data.status = CONTENT_STATES.DRAFT;
    }

    const merged = { ...existing, ...data };
    const contentHash = computeContentHash(merged);

    await marketingRepo.version.create({
      contentId: id,
      version: nextVersion,
      body: data.body !== undefined ? data.body : existing.body,
      mediaBrief: data.mediaBrief !== undefined ? data.mediaBrief : existing.mediaBrief,
      destination: data.destination !== undefined ? data.destination : existing.destination,
      changeNote: patch.changeNote || 'edit',
      contentHash,
      structured: data.structured !== undefined ? data.structured : existing.structured,
      generationMeta: data.generationMeta !== undefined ? data.generationMeta : existing.generationMeta,
      createdBy: ctx.actorId ?? null,
    });

    if (wasApproved) {
      await marketingRepo.approval.updateMany({
        where: { contentId: id, status: CONTENT_STATES.APPROVED, invalidatedAt: null },
        data: { invalidatedAt: new Date(), status: CONTENT_STATES.REJECTED },
      });
    }
  }

  const updated = await marketingRepo.content.update({ where: { id }, data });
  await appendMarketingAudit({
    entityType: 'MarketingContentItem',
    entityId: id,
    action: material && wasApproved ? 'invalidate_after_edit' : 'update',
    fromStatus: existing.status,
    toStatus: updated.status,
    actorId: ctx.actorId,
    campaignId: existing.campaignId,
    metadata: { material, wasApproved },
  });
  return updated;
}

/**
 * @param {string} id
 * @param {{ actorId?: string }} [ctx]
 */
export async function validateContent(id, ctx = {}) {
  const content = await marketingRepo.content.findUnique({ where: { id } });
  if (!content) return null;

  await marketingRepo.content.update({
    where: { id },
    data: { status: CONTENT_STATES.VALIDATING },
  });

  const result = validateProductClaims(content.body || '', content.language || 'en');
  const nextStatus = result.ok ? CONTENT_STATES.READY_FOR_APPROVAL : CONTENT_STATES.NEEDS_REVISION;

  const updated = await marketingRepo.content.update({
    where: { id },
    data: {
      status: nextStatus,
      metadata: {
        ...(typeof content.metadata === 'object' && content.metadata ? content.metadata : {}),
        lastValidation: result,
      },
    },
  });

  if (result.ok && Features.marketingOperator.approvalWorkflowV1) {
    await marketingRepo.approval.create({
      contentId: id,
      status: CONTENT_STATES.READY_FOR_APPROVAL,
      contentVersion: content.currentVersion,
      contentHash: computeContentHash(content),
    });
  }

  await appendMarketingAudit({
    entityType: 'MarketingContentItem',
    entityId: id,
    action: 'validate',
    fromStatus: content.status,
    toStatus: nextStatus,
    actorId: ctx.actorId,
    campaignId: content.campaignId,
    metadata: { ok: result.ok, status: result.status, findingCount: result.findings.length },
  });

  return { content: updated, validation: result };
}

/**
 * @param {string} id
 * @param {{ actorId?: string }} [ctx]
 */
export async function submitForApproval(id, ctx = {}) {
  const validated = await validateContent(id, ctx);
  if (!validated) return null;
  if (!validated.validation.ok) return validated;

  const updated = await marketingRepo.content.update({
    where: { id },
    data: { status: CONTENT_STATES.READY_FOR_APPROVAL },
  });
  void notifyCampaignOwner(updated.campaignId, {
    type: 'CAMPAIGN_APPROVAL_REQUIRED',
    category: 'marketing',
    priority: 'ACTION_REQUIRED',
    title: 'Campaign draft requires approval',
    message: 'A campaign draft is ready for review.',
    actionUrl: '/control-center/marketing',
    entityType: 'MarketingContentItem',
    entityId: id,
    i18nKey: 'notifications.types.CAMPAIGN_APPROVAL_REQUIRED.title',
    dedupeKey: `CAMPAIGN_APPROVAL_REQUIRED:${id}`,
    surface: 'system',
    recipientRole: 'owner',
  });
  return { content: updated, validation: validated.validation };
}

/**
 * @param {string} id
 * @param {{ note?: string, actorId?: string }} [ctx]
 */
export async function approveContent(id, ctx = {}) {
  if (!Features.marketingOperator.approvalWorkflowV1) {
    return { ok: false, error: 'approval_workflow_disabled' };
  }
  const content = await marketingRepo.content.findUnique({
    where: { id },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });
  if (!content) return null;

  const duties = assertApprovalSeparation({
    createdBy: content.createdBy,
    actorId: ctx.actorId,
  });
  if (!duties.ok) {
    return { ok: false, error: duties.error, message: duties.message };
  }

  const claims = validateProductClaims(content.body || '', content.language || 'en');
  if (!claims.ok || claims.status === 'BLOCKED' || claims.status === 'VALIDATOR_UNAVAILABLE') {
    return { ok: false, error: 'claims_invalid', validation: claims };
  }

  const contentHash = computeContentHash(content);
  const versionId = content.versions?.[0]?.id || null;

  const updated = await marketingRepo.content.update({
    where: { id },
    data: { status: CONTENT_STATES.APPROVED },
  });

  await marketingRepo.approval.create({
    contentId: id,
    status: CONTENT_STATES.APPROVED,
    decisionNote: ctx.note ?? null,
    decidedBy: ctx.actorId ?? null,
    decidedAt: new Date(),
    contentVersion: content.currentVersion,
    contentHash,
    versionId,
  });

  const stamp = approvalStamp(ctx.actorId);
  try {
    await marketingRepo.campaign.update({
      where: { id: content.campaignId },
      data: stamp,
    });
  } catch {
    try {
      const campaign = await marketingRepo.campaign.findUnique({ where: { id: content.campaignId } });
      await marketingRepo.campaign.update({
        where: { id: content.campaignId },
        data: {
          metadata: {
            ...(campaign?.metadata && typeof campaign.metadata === 'object' ? campaign.metadata : {}),
            ...stamp,
            selfApproveOverride: duties.selfApproveOverride === true,
          },
        },
      });
    } catch {
      /* non-fatal */
    }
  }

  await appendMarketingAudit({
    entityType: 'MarketingContentItem',
    entityId: id,
    action: 'approve',
    fromStatus: content.status,
    toStatus: CONTENT_STATES.APPROVED,
    actorId: ctx.actorId,
    campaignId: content.campaignId,
    metadata: {
      contentHash,
      versionId,
      reviewedBy: ctx.actorId,
      approvedBy: ctx.actorId,
      selfApproveOverride: duties.selfApproveOverride === true,
    },
  });

  return { ok: true, content: updated, contentHash };
}

/**
 * @param {string} id
 * @param {{ note?: string, actorId?: string }} [ctx]
 */
export async function rejectContent(id, ctx = {}) {
  const content = await marketingRepo.content.findUnique({ where: { id } });
  if (!content) return null;

  const updated = await marketingRepo.content.update({
    where: { id },
    data: { status: CONTENT_STATES.REJECTED },
  });

  await marketingRepo.approval.create({
    contentId: id,
    status: CONTENT_STATES.REJECTED,
    decisionNote: ctx.note ?? null,
    decidedBy: ctx.actorId ?? null,
    decidedAt: new Date(),
    contentVersion: content.currentVersion,
    contentHash: computeContentHash(content),
  });

  await appendMarketingAudit({
    entityType: 'MarketingContentItem',
    entityId: id,
    action: 'reject',
    fromStatus: content.status,
    toStatus: CONTENT_STATES.REJECTED,
    actorId: ctx.actorId,
    campaignId: content.campaignId,
  });

  return { ok: true, content: updated };
}

/**
 * Schedule approved content (provider may be mock). Does not live-publish unless flags allow.
 * @param {string} id
 * @param {{ scheduledAt?: string|Date, idempotencyKey?: string, actorId?: string }} [opts]
 */
export async function scheduleContent(id, opts = {}) {
  const content = await marketingRepo.content.findUnique({ where: { id } });
  if (!content) return { ok: false, error: 'not_found' };
  if (content.status !== CONTENT_STATES.APPROVED) {
    return { ok: false, error: 'not_approved', status: content.status };
  }

  const currentHash = computeContentHash(content);
  const approval = await findValidApproval(id, currentHash);
  if (!approval) {
    return { ok: false, error: 'approval_invalidated' };
  }

  const idempotencyKey =
    opts.idempotencyKey || `sched:${id}:v${content.currentVersion}:${opts.scheduledAt || 'asap'}`;

  const existing = await marketingRepo.publication.findUnique({
    where: { idempotencyKey },
  }).catch(() => null);
  if (existing) {
    return { ok: true, publication: existing, idempotent: true };
  }

  const provider = getPublishingProvider();
  const scheduledAt = opts.scheduledAt ? new Date(opts.scheduledAt) : new Date();

  const result = await provider.schedule({
    contentId: id,
    pageId: process.env.CARDBEY_FACEBOOK_PAGE_ID || null,
    body: content.body,
    scheduledAt,
    idempotencyKey,
  });

  const publication = await marketingRepo.publication.create({
    campaignId: content.campaignId,
    contentId: id,
    provider: provider.name || 'mock',
    pageId: process.env.CARDBEY_FACEBOOK_PAGE_ID || null,
    status: result.ok ? CONTENT_STATES.SCHEDULED : CONTENT_STATES.FAILED,
    idempotencyKey,
    scheduledAt,
    failureClass: result.ok ? null : result.code || 'SCHEDULE_FAILED',
    responseMeta: { ...(result.meta || { code: result.code }), approvalId: approval.id, contentHash: currentHash },
  });

  if (result.ok) {
    await marketingRepo.content.update({
      where: { id },
      data: { status: CONTENT_STATES.SCHEDULED },
    });
  }

  await appendMarketingAudit({
    entityType: 'MarketingPublication',
    entityId: publication.id,
    action: 'schedule',
    toStatus: publication.status,
    actorId: opts.actorId,
    campaignId: content.campaignId,
    metadata: { provider: provider.name, ok: result.ok, code: result.code, contentHash: currentHash },
  });

  return { ok: result.ok, publication, providerResult: result };
}

/**
 * Publish approved content. Live path gated by Features.marketingOperator.livePublishingV1.
 * @param {string} id
 * @param {{ idempotencyKey?: string, actorId?: string }} [opts]
 */
export async function publishContent(id, opts = {}) {
  const content = await marketingRepo.content.findUnique({ where: { id } });
  if (!content) return { ok: false, error: 'not_found' };
  if (content.status !== CONTENT_STATES.APPROVED && content.status !== CONTENT_STATES.SCHEDULED) {
    return { ok: false, error: 'not_publishable', status: content.status };
  }

  const currentHash = computeContentHash(content);
  const approval = await findValidApproval(id, currentHash);
  if (!approval) {
    return { ok: false, error: 'approval_invalidated' };
  }

  const idempotencyKey =
    opts.idempotencyKey || `pub:${id}:v${content.currentVersion}`;

  const existing = await marketingRepo.publication.findUnique({
    where: { idempotencyKey },
  }).catch(() => null);
  if (existing && existing.status === CONTENT_STATES.PUBLISHED) {
    return { ok: true, publication: existing, idempotent: true };
  }

  const provider = getPublishingProvider();
  await marketingRepo.content.update({
    where: { id },
    data: { status: CONTENT_STATES.PUBLISHING },
  });

  const result = await provider.publish({
    contentId: id,
    pageId: process.env.CARDBEY_FACEBOOK_PAGE_ID || null,
    body: content.body,
    idempotencyKey,
  });

  let publication;
  if (existing) {
    publication = await marketingRepo.publication.update({
      where: { id: existing.id },
      data: {
        status: result.ok ? CONTENT_STATES.PUBLISHED : CONTENT_STATES.FAILED,
        externalPostId: result.externalPostId || null,
        publishedUrl: result.publishedUrl || null,
        publishedAt: result.ok ? new Date() : null,
        failureClass: result.ok ? null : result.code || 'PUBLISH_FAILED',
        retryCount: (existing.retryCount || 0) + (result.ok ? 0 : 1),
        lastError: result.ok ? null : result.message || result.code || 'PUBLISH_FAILED',
        responseMeta: result.meta || { code: result.code },
      },
    });
  } else {
    publication = await marketingRepo.publication.create({
      campaignId: content.campaignId,
      contentId: id,
      provider: provider.name || 'mock',
      pageId: process.env.CARDBEY_FACEBOOK_PAGE_ID || null,
      status: result.ok ? CONTENT_STATES.PUBLISHED : CONTENT_STATES.FAILED,
      idempotencyKey,
      externalPostId: result.externalPostId || null,
      publishedUrl: result.publishedUrl || null,
      publishedAt: result.ok ? new Date() : null,
      failureClass: result.ok ? null : result.code || 'PUBLISH_FAILED',
      lastError: result.ok ? null : result.message || result.code || 'PUBLISH_FAILED',
      responseMeta: result.meta || { code: result.code },
    });
  }

  await marketingRepo.content.update({
    where: { id },
    data: { status: result.ok ? CONTENT_STATES.PUBLISHED : CONTENT_STATES.FAILED },
  });

  await appendMarketingAudit({
    entityType: 'MarketingPublication',
    entityId: publication.id,
    action: 'publish',
    toStatus: publication.status,
    actorId: opts.actorId,
    campaignId: content.campaignId,
    metadata: { provider: provider.name, ok: result.ok, code: result.code, contentHash: currentHash },
    createOperatorRun: true,
    runType: 'publish',
  });

  if (result.ok) {
    void tryRecordContentPublished({
      campaignId: content.campaignId,
      contentId: id,
      channel: content.channel,
      userId: opts.actorId,
    });
  } else {
    void notifyCampaignOwner(content.campaignId, {
      type: 'CAMPAIGN_PUBLISH_FAILED',
      category: 'marketing',
      priority: 'WARNING',
      title: 'Campaign publishing failed',
      message: 'Publishing did not complete. Review the campaign and try again.',
      actionUrl: '/control-center/marketing',
      entityType: 'MarketingContentItem',
      entityId: id,
      i18nKey: 'notifications.types.CAMPAIGN_PUBLISH_FAILED.title',
      dedupeKey: `CAMPAIGN_PUBLISH_FAILED:${id}`,
      surface: 'admin',
      recipientRole: 'owner',
    });
  }

  return { ok: result.ok, publication, providerResult: result };
}

async function notifyCampaignOwner(campaignId, payload) {
  try {
    if (!campaignId) return;
    const campaign = await marketingRepo.campaign.findUnique({ where: { id: campaignId } });
    const userId = campaign?.createdBy;
    if (!userId) return;
    const { emitInAppNotification } = await import('../notifications/inAppNotificationService.js');
    await emitInAppNotification({ ...payload, recipientUserId: userId });
  } catch {
    /* fail-open */
  }
}
