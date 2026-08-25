/**
 * Shared marketing inbox persistence (generic interaction model).
 * Backed by MarketingEngagement. Facebook operator consumes this; no auto-replies.
 */

import { Features } from '../../config/features.js';
import { appendMarketingAudit } from '../marketingOperator/audit.js';
import { marketingRepo } from '../marketingOperator/repository.js';
import {
  INGESTION_SOURCES,
  INTERACTION_STATUSES,
  INTERACTION_TYPES,
  isAllowedInboxAction,
  normalizeInboxStatus,
  normalizeInteractionWrite,
  statusFilterValues,
  stripUnknownInteractionColumns,
  toInboxRecord,
} from './interactionContract.js';

async function persistRow(row) {
  try {
    return await marketingRepo.engagement.create(row);
  } catch {
    return marketingRepo.engagement.create(stripUnknownInteractionColumns(row));
  }
}

/**
 * @param {object} input
 */
export async function persistInboxInteraction(input = {}) {
  const row = normalizeInteractionWrite({
    ...input,
    classification: input.classification || 'other',
    riskLevel: input.riskLevel || 'low',
  });

  if (row.externalId) {
    const existing = await marketingRepo.engagement
      .findFirst({
        where: { provider: row.provider, externalId: String(row.externalId) },
      })
      .catch(() => null);
    if (existing) {
      return { ok: true, engagement: existing, interaction: toInboxRecord(existing), duplicate: true };
    }
  }

  const engagement = await persistRow(row);
  return {
    ok: true,
    engagement,
    interaction: toInboxRecord(engagement),
    duplicate: false,
  };
}

/**
 * Admin-only test / mock injection. Never Meta.
 */
export async function injectTestInteraction(input = {}, ctx = {}) {
  const source = String(input.ingestionSource || input.source || INGESTION_SOURCES.TEST).toUpperCase();
  const ingestionSource = source === INGESTION_SOURCES.MOCK ? INGESTION_SOURCES.MOCK : INGESTION_SOURCES.TEST;
  const provider = ingestionSource === INGESTION_SOURCES.MOCK ? 'mock' : String(input.provider || 'facebook');
  const externalId =
    input.externalId ||
    input.externalInteractionId ||
    `${ingestionSource.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const result = await persistInboxInteraction({
    campaignId: input.campaignId || null,
    provider,
    channel: input.channel || 'facebook',
    accountId: input.accountId || input.pageId || 'test_page',
    contentId: input.contentId || null,
    postId: input.postId || null,
    externalId,
    interactionType: input.interactionType || INTERACTION_TYPES.COMMENT,
    engagementType: input.type || input.engagementType || input.interactionType || INTERACTION_TYPES.COMMENT,
    actorExternalId: input.actorExternalId || null,
    authorName: input.authorName || input.safeDisplayName || `${ingestionSource.toLowerCase()}_user`,
    body: input.body || 'Test inbox interaction (not live Meta)',
    classification: input.classification || null,
    riskLevel: input.riskLevel || 'low',
    ingestionSource,
    status: INTERACTION_STATUSES.NEW,
    metadata: {
      untrusted: true,
      source: ingestionSource === INGESTION_SOURCES.MOCK ? 'mock_inject' : 'test_inject',
      mock: ingestionSource === INGESTION_SOURCES.MOCK,
      test: ingestionSource === INGESTION_SOURCES.TEST,
      liveMeta: false,
      ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}),
    },
  });

  if (result.ok && result.engagement?.id) {
    await appendMarketingAudit({
      entityType: 'MarketingEngagement',
      entityId: result.engagement.id,
      action: ingestionSource === INGESTION_SOURCES.MOCK ? 'mock_inject' : 'test_inject',
      actorId: ctx.actorId || input.actorId,
      campaignId: input.campaignId || null,
      metadata: { ingestionSource, liveMeta: false },
    }).catch(() => {});
  }

  return result;
}

export async function listInboxInteractions(query = {}) {
  if (!Features.marketingOperator?.v1) {
    return { ok: true, interactions: [], disabled: true };
  }
  const where = {};
  if (query.status) {
    where.status = { in: statusFilterValues(query.status) };
  }
  if (query.campaignId) where.campaignId = String(query.campaignId);
  if (query.provider) where.provider = String(query.provider);
  if (query.interactionType) {
    const type = String(query.interactionType);
    where.OR = [{ interactionType: type }, { engagementType: type }];
  }

  const rows = await marketingRepo.engagement.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(query.take) || 50, 200),
    include: { campaign: { select: { id: true, name: true, targetType: true, metadata: true } }, responseDrafts: { take: 3, orderBy: { createdAt: 'desc' } } },
  }).catch(async () =>
    marketingRepo.engagement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(query.take) || 50, 200),
    }),
  );

  return {
    ok: true,
    liveMeta: false,
    interactions: (rows || []).map(toInboxRecord),
  };
}

export async function updateInboxStatus(id, status, ctx = {}) {
  if (!isAllowedInboxAction(status)) {
    return { ok: false, error: 'unsupported_status' };
  }
  const canonical = normalizeInboxStatus(status);
  const row = await marketingRepo.engagement.findUnique({ where: { id } });
  if (!row) return { ok: false, error: 'not_found' };

  const updated = await marketingRepo.engagement.update({
    where: { id },
    data: {
      status: canonical,
      metadata: {
        ...(typeof row.metadata === 'object' && row.metadata ? row.metadata : {}),
        inboxStatus: canonical,
        inboxStatusAt: new Date().toISOString(),
      },
    },
  });

  await appendMarketingAudit({
    entityType: 'MarketingEngagement',
    entityId: id,
    action: canonical === INTERACTION_STATUSES.DISMISSED ? 'inbox_dismiss' : 'inbox_review',
    actorId: ctx.actorId,
    metadata: { status: canonical },
  }).catch(() => {});

  return { ok: true, interaction: toInboxRecord(updated) };
}
