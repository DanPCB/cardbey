/**
 * Shared campaign write contract for Marketing Operations.
 * Channel-agnostic: facebook is the only active provider this phase.
 */

import { CHANNELS, resolveTargetType, TARGET_TYPES } from './constants.js';

export function normalizeCampaignWrite(input = {}, ctx = {}) {
  const targetType = resolveTargetType(input.targetType);
  const channel = String(input.channel || CHANNELS.FACEBOOK).trim() || CHANNELS.FACEBOOK;
  const objectiveId = input.objectiveId ? String(input.objectiveId) : null;
  const market = input.market != null ? String(input.market) : null;
  const offer = input.offer != null ? String(input.offer) : null;
  const cta = input.cta != null ? String(input.cta) : null;
  const baseMeta = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};

  return {
    name: String(input.name || '').trim() || 'Untitled campaign',
    description: input.description ?? null,
    objective: input.objective ?? null,
    objectiveId,
    status: input.status || 'DRAFT',
    language: input.language ?? null,
    targetType,
    channel,
    market,
    audience: input.audience ?? null,
    plan: input.plan ?? null,
    offer,
    cta,
    destination: input.destination ?? null,
    successCriteria: input.successCriteria ?? null,
    metadata: {
      ...baseMeta,
      targetType,
      channel,
      market,
      offer,
      cta,
      objectiveId,
      destination: input.destination ?? baseMeta.destination ?? null,
      successCriteria: input.successCriteria ?? baseMeta.successCriteria ?? null,
    },
    createdBy: ctx.actorId ?? input.createdBy ?? null,
  };
}

/**
 * Prisma clients that predate generate will reject unknown scalars.
 * Keep contract fields in metadata; omit optional top-level columns on retry.
 */
export function campaignCreateFallback(data) {
  const {
    objectiveId,
    market,
    offer,
    cta,
    destination,
    successCriteria,
    reviewedBy,
    approvedBy,
    reviewedAt,
    approvedAt,
    ...rest
  } = data;
  return {
    ...rest,
    metadata: {
      ...(data.metadata && typeof data.metadata === 'object' ? data.metadata : {}),
      objectiveId: objectiveId ?? null,
      market: market ?? null,
      offer: offer ?? null,
      cta: cta ?? null,
      destination: destination ?? null,
      successCriteria: successCriteria ?? null,
      reviewedBy: reviewedBy ?? null,
      approvedBy: approvedBy ?? null,
    },
  };
}

export function readCampaignTargetType(campaign) {
  if (!campaign) return TARGET_TYPES.USER_ACQUISITION;
  return resolveTargetType(
    campaign.targetType || campaign.metadata?.targetType || TARGET_TYPES.USER_ACQUISITION,
  );
}
