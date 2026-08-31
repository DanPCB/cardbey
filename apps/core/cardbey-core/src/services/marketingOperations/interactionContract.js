/**
 * Provider-neutral marketing interaction / inbox contract.
 * Facebook is the only active provider this phase; schema is generic.
 */

export const INTERACTION_TYPES = Object.freeze({
  COMMENT: 'comment',
  REPLY: 'reply',
  MESSAGE: 'message',
  MENTION: 'mention',
  REACTION: 'reaction',
  OTHER: 'other',
});

export const INTERACTION_STATUSES = Object.freeze({
  NEW: 'NEW',
  CLASSIFIED: 'CLASSIFIED',
  REVIEWED: 'REVIEWED',
  REPLY_APPROVED: 'REPLY_APPROVED',
  ACTIONED: 'ACTIONED',
  DISMISSED: 'DISMISSED',
});

export const INGESTION_SOURCES = Object.freeze({
  LIVE: 'LIVE',
  TEST: 'TEST',
  MOCK: 'MOCK',
});

const TYPE_ALIASES = Object.freeze({
  comment: INTERACTION_TYPES.COMMENT,
  comments: INTERACTION_TYPES.COMMENT,
  reply: INTERACTION_TYPES.REPLY,
  replies: INTERACTION_TYPES.REPLY,
  message: INTERACTION_TYPES.MESSAGE,
  messages: INTERACTION_TYPES.MESSAGE,
  mention: INTERACTION_TYPES.MENTION,
  reaction: INTERACTION_TYPES.REACTION,
  like: INTERACTION_TYPES.REACTION,
  other: INTERACTION_TYPES.OTHER,
});

const STATUS_ALIASES = Object.freeze({
  NEW: INTERACTION_STATUSES.NEW,
  OPEN: INTERACTION_STATUSES.NEW,
  CLASSIFIED: INTERACTION_STATUSES.CLASSIFIED,
  REVIEWED: INTERACTION_STATUSES.REVIEWED,
  ESCALATED: INTERACTION_STATUSES.REVIEWED,
  REPLY_APPROVED: INTERACTION_STATUSES.REPLY_APPROVED,
  ACTIONED: INTERACTION_STATUSES.ACTIONED,
  RESPONDED: INTERACTION_STATUSES.ACTIONED,
  DISMISSED: INTERACTION_STATUSES.DISMISSED,
});

const ACTIONABLE_STATUSES = new Set([
  INTERACTION_STATUSES.REVIEWED,
  INTERACTION_STATUSES.DISMISSED,
]);

export function normalizeInteractionType(raw) {
  const key = String(raw || '')
    .trim()
    .toLowerCase();
  if (TYPE_ALIASES[key]) return TYPE_ALIASES[key];
  const compact = key.replace(/[^a-z]/g, '');
  if (TYPE_ALIASES[compact]) return TYPE_ALIASES[compact];
  return INTERACTION_TYPES.OTHER;
}

export function normalizeInboxStatus(raw) {
  const key = String(raw || 'NEW')
    .trim()
    .toUpperCase();
  return STATUS_ALIASES[key] || INTERACTION_STATUSES.NEW;
}

export function statusFilterValues(status) {
  const canonical = normalizeInboxStatus(status);
  if (canonical === INTERACTION_STATUSES.NEW) return ['NEW', 'OPEN'];
  if (canonical === INTERACTION_STATUSES.CLASSIFIED) return ['CLASSIFIED'];
  if (canonical === INTERACTION_STATUSES.REVIEWED) return ['REVIEWED', 'ESCALATED'];
  if (canonical === INTERACTION_STATUSES.REPLY_APPROVED) return ['REPLY_APPROVED'];
  if (canonical === INTERACTION_STATUSES.ACTIONED) return ['ACTIONED', 'RESPONDED'];
  if (canonical === INTERACTION_STATUSES.DISMISSED) return ['DISMISSED'];
  return [canonical];
}

export function isAllowedInboxAction(status) {
  return ACTIONABLE_STATUSES.has(normalizeInboxStatus(status));
}

export function normalizeIngestionSource(raw, { mockProvider = false } = {}) {
  const key = String(raw || '')
    .trim()
    .toUpperCase();
  if (INGESTION_SOURCES[key]) return INGESTION_SOURCES[key];
  if (mockProvider || key === 'MOCK_INJECT' || key === 'MOCK') return INGESTION_SOURCES.MOCK;
  if (key === 'WEBHOOK' || key === 'FACEBOOK') return INGESTION_SOURCES.LIVE;
  return INGESTION_SOURCES.TEST;
}

/**
 * Shape used for persist. Extra fields copied into metadata for older Prisma clients.
 */
export function normalizeInteractionWrite(input = {}) {
  const provider = String(input.provider || 'facebook').trim() || 'facebook';
  const channel = String(input.channel || provider || 'facebook').trim() || 'facebook';
  const interactionType = normalizeInteractionType(
    input.interactionType || input.engagementType || INTERACTION_TYPES.OTHER,
  );
  const ingestionSource = normalizeIngestionSource(input.ingestionSource || input.source, {
    mockProvider: provider === 'mock',
  });
  const status = input.status ? normalizeInboxStatus(input.status) : INTERACTION_STATUSES.NEW;
  const accountId = input.accountId || input.pageId || null;
  const contentId = input.contentId || null;
  const postId = input.postId || input.externalPostId || null;
  const actorExternalId = input.actorExternalId || input.fromId || null;
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  const baseMeta = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};

  return {
    campaignId: input.campaignId || null,
    provider,
    pageId: accountId,
    externalId: input.externalInteractionId || input.externalId || null,
    engagementType: input.engagementType || interactionType,
    authorName: input.authorName || input.safeDisplayName || null,
    body: input.body != null ? String(input.body).slice(0, 4000) : null,
    classification: input.classification || null,
    riskLevel: input.riskLevel || 'low',
    status,
    channel,
    accountId,
    contentId,
    postId,
    interactionType,
    actorExternalId,
    occurredAt,
    ingestionSource,
    metadata: {
      ...baseMeta,
      channel,
      accountId,
      contentId,
      postId,
      interactionType,
      actorExternalId,
      ingestionSource,
      untrusted: baseMeta.untrusted !== false,
    },
  };
}

export function stripUnknownInteractionColumns(row) {
  const {
    channel,
    accountId,
    contentId,
    postId,
    interactionType,
    actorExternalId,
    occurredAt,
    ingestionSource,
    ...rest
  } = row;
  return rest;
}

export function toInboxRecord(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const source = normalizeIngestionSource(
    row.ingestionSource || meta.ingestionSource || (row.provider === 'mock' ? 'MOCK' : meta.source),
    { mockProvider: row.provider === 'mock' },
  );
  return {
    id: row.id,
    provider: row.provider,
    channel: row.channel || meta.channel || row.provider,
    accountId: row.accountId || row.pageId || meta.accountId || null,
    campaignId: row.campaignId || null,
    campaignName: row.campaign?.name || null,
    contentId: row.contentId || meta.contentId || null,
    postId: row.postId || meta.postId || null,
    externalInteractionId: row.externalId || null,
    interactionType: normalizeInteractionType(
      row.interactionType || meta.interactionType || row.engagementType,
    ),
    actorExternalId: row.actorExternalId || meta.actorExternalId || null,
    authorName: row.authorName || null,
    body: row.body || null,
    occurredAt: row.occurredAt || row.createdAt || null,
    ingestionSource: source,
    status: normalizeInboxStatus(row.status),
    intentPrimary: meta.assist?.intentConfirmed || meta.assist?.intentPrimary || null,
    intentConfirmed: meta.assist?.intentConfirmed || null,
    intentConfidence: meta.assist?.confidence ?? null,
    intentSummary: meta.assist?.reasoning || null,
    recommendedAction: meta.assist?.recommendedAction || meta.assist?.suggestion?.recommendedAction || null,
    suggestedReply: meta.assist?.suggestion?.reply || row.responseDrafts?.[0]?.body || null,
    destinationPreview: meta.assist?.suggestion?.destination || meta.assist?.destinationPreview || null,
    handoffPreview: meta.assist?.suggestion?.handoffPreview || null,
    handoffIssued: meta.assist?.suggestion?.issued === true,
    classifierMode: meta.assist?.classifier?.mode || null,
    language: meta.assist?.language || meta.language || null,
    sendsExternally: false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
