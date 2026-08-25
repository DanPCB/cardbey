/**
 * Marketing campaign CRUD + structured plan generation (never auto-publishes).
 */

import { Features } from '../../config/features.js';
import { generateCampaignPlan, generatePostDraft } from './aiGeneration.js';
import { appendMarketingAudit } from './audit.js';
import { CONTENT_STATES, INTENTS, TARGET_TYPES } from './constants.js';
import * as contentService from './contentService.js';
import { marketingRepo } from './repository.js';
import {
  campaignCreateFallback,
  normalizeCampaignWrite,
} from '../marketingOperations/campaignContract.js';
import { ensureDefaultUserAcquisitionObjective } from '../marketingOperations/objectiveService.js';

/**
 * @param {object} input
 * @param {{ actorId?: string }} [ctx]
 */
export async function createCampaign(input, ctx = {}) {
  const data = normalizeCampaignWrite(input, ctx);
  if (!data.objectiveId && data.targetType === TARGET_TYPES.USER_ACQUISITION) {
    try {
      const objective = await ensureDefaultUserAcquisitionObjective(ctx);
      data.objectiveId = objective?.id || null;
      if (data.metadata && typeof data.metadata === 'object') {
        data.metadata.objectiveId = data.objectiveId;
      }
    } catch {
      /* objective table may be missing */
    }
  }
  let campaign;
  try {
    campaign = await marketingRepo.campaign.create(data);
  } catch {
    campaign = await marketingRepo.campaign.create(campaignCreateFallback(data));
  }
  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: campaign.id,
    action: 'create',
    toStatus: CONTENT_STATES.DRAFT,
    actorId: ctx.actorId,
    campaignId: campaign.id,
    reason: 'CAMPAIGN_CREATE',
  });
  return campaign;
}

/**
 * @param {{ status?: string, take?: number, skip?: number }} [query]
 */
export async function listCampaigns(query = {}) {
  const where = {};
  if (query.status) where.status = query.status;
  return marketingRepo.campaign.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(query.take) || 50, 200),
    skip: Number(query.skip) || 0,
    include: {
      _count: { select: { contentItems: true, publications: true } },
    },
  });
}

/**
 * @param {string} id
 */
export async function getCampaign(id) {
  return marketingRepo.campaign.findUnique({
    where: { id },
    include: {
      contentItems: { orderBy: { createdAt: 'asc' } },
      publications: { take: 20, orderBy: { createdAt: 'desc' } },
    },
  });
}

/**
 * @param {string} id
 * @param {object} patch
 * @param {{ actorId?: string }} [ctx]
 */
export async function patchCampaign(id, patch, ctx = {}) {
  const existing = await marketingRepo.campaign.findUnique({ where: { id } });
  if (!existing) return null;

  const data = {};
  if (patch.name != null) data.name = String(patch.name).trim();
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.objective !== undefined) data.objective = patch.objective;
  if (patch.language !== undefined) data.language = patch.language;
  if (patch.audience !== undefined) data.audience = patch.audience;
  if (patch.plan !== undefined) data.plan = patch.plan;
  if (patch.metadata !== undefined) data.metadata = patch.metadata;
  if (patch.status != null) data.status = String(patch.status);

  const updated = await marketingRepo.campaign.update({ where: { id }, data });
  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: id,
    action: 'patch',
    fromStatus: existing.status,
    toStatus: updated.status,
    actorId: ctx.actorId,
    campaignId: id,
    metadata: { keys: Object.keys(data) },
  });
  return updated;
}

/**
 * @param {string} id
 * @param {{ actorId?: string }} [ctx]
 */
export async function pauseCampaign(id, ctx = {}) {
  return patchCampaign(id, { status: CONTENT_STATES.PAUSED }, ctx);
}

/**
 * Soft archive via status ARCHIVED + archivedAt.
 * @param {string} id
 * @param {{ actorId?: string }} [ctx]
 */
export async function archiveCampaign(id, ctx = {}) {
  const existing = await marketingRepo.campaign.findUnique({ where: { id } });
  if (!existing) return null;
  const updated = await marketingRepo.campaign.update({
    where: { id },
    data: { status: CONTENT_STATES.ARCHIVED, archivedAt: new Date() },
  });
  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: id,
    action: 'archive',
    fromStatus: existing.status,
    toStatus: CONTENT_STATES.ARCHIVED,
    actorId: ctx.actorId,
    campaignId: id,
  });
  return updated;
}

/**
 * Structured plan only — never schedules or publishes.
 * @param {string} id
 * @param {{ actorId?: string }} [ctx]
 */
export async function generatePlan(id, ctx = {}) {
  const campaign = await marketingRepo.campaign.findUnique({ where: { id } });
  if (!campaign) return null;

  const ai = await generateCampaignPlan(campaign);
  const existingMeta = typeof campaign.metadata === 'object' && campaign.metadata ? campaign.metadata : {};
  const fromPlan = campaign.plan?.kind === 'CAMPAIGN_PROPOSAL_V1'
    ? campaign.plan
    : campaign.plan?.campaignProposal;
  const preservedProposal = existingMeta.campaignProposal?.kind === 'CAMPAIGN_PROPOSAL_V1'
    ? existingMeta.campaignProposal
    : fromPlan?.kind === 'CAMPAIGN_PROPOSAL_V1'
      ? fromPlan
      : null;
  const plan = {
    ...ai.plan,
    intents: [INTENTS.AWARENESS, INTENTS.EDUCATION, INTENTS.PILOT_INVITE, INTENTS.FAQ],
    channels: ['facebook_page'],
    languages: ai.plan?.languages || ['vi', 'en'],
    livePublishingEnabled: Features.marketingOperator.livePublishingV1 === true,
    autoPublish: false,
    generationMeta: ai.generationMeta,
    campaignProposal: preservedProposal,
  };

  const updated = await marketingRepo.campaign.update({
    where: { id },
    data: {
      plan,
      status: campaign.status === CONTENT_STATES.DRAFT ? CONTENT_STATES.DRAFT : campaign.status,
      metadata: {
        ...existingMeta,
        campaignProposal: preservedProposal || existingMeta.campaignProposal || null,
        planGenerationMeta: ai.generationMeta,
      },
    },
  });

  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: id,
    action: 'generate_plan',
    actorId: ctx.actorId,
    campaignId: id,
    reason: 'PLAN_GENERATED',
    metadata: { autoPublish: false, mode: ai.generationMeta?.mode },
    createOperatorRun: true,
    runType: 'generate_plan',
  });

  return updated;
}

/**
 * Generate content draft(s) for a campaign (never publishes).
 * @param {string} campaignId
 * @param {{ language?: string, contentType?: string, actorId?: string }} [opts]
 */
export async function generateCampaignContent(campaignId, opts = {}) {
  const campaign = await marketingRepo.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { ok: false, error: 'not_found' };

  const languages = opts.language ? [opts.language] : ['vi', 'en'];
  const created = [];

  for (const language of languages) {
    const ai = await generatePostDraft({
      campaign,
      language,
      contentType: opts.contentType || 'post',
      destination: opts.destination || null,
    });
    const content = await contentService.createContent(
      {
        campaignId,
        title: ai.draft.title,
        body: ai.draft.body,
        language: ai.draft.language,
        contentType: ai.draft.contentType || 'post',
        destination: ai.draft.destination,
        structured: ai.draft.structured,
        generationMeta: ai.generationMeta,
        metadata: {
          generationMeta: ai.generationMeta,
          structured: ai.draft.structured,
        },
      },
      { actorId: opts.actorId },
    );
    created.push(content);
  }

  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: campaignId,
    action: 'generate_content',
    actorId: opts.actorId,
    campaignId,
    metadata: { count: created.length },
    createOperatorRun: true,
    runType: 'generate_content',
  });

  return { ok: true, content: created };
}
