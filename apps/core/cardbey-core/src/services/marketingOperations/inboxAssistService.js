/**
 * Human-confirmed inbox assist: classify, suggest reply, approve draft (never sends).
 */

import { appendMarketingAudit } from '../marketingOperator/audit.js';
import { marketingRepo } from '../marketingOperator/repository.js';
import { CANONICAL_EVENTS } from './constants.js';
import { recordCanonicalEvent } from './attributionSpine.js';
import { readCampaignTargetType } from './campaignContract.js';
import { resolveDestinationForIntent } from './destinationGuard.js';
import { classifyMarketingIntent, recommendedAction } from './intentClassifier.js';
import { INTERACTION_STATUSES, normalizeInboxStatus, toInboxRecord } from './interactionContract.js';
import { detectInboxLanguage } from './languageDetect.js';
import { isInvestorReservedIntent, normalizeMarketingIntent } from './intentTaxonomy.js';
import { buildSuggestedReply } from './suggestedReply.js';

function metaOf(row) {
  return row?.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {};
}

function assistOf(row) {
  const meta = metaOf(row);
  return meta.assist && typeof meta.assist === 'object' ? { ...meta.assist } : {};
}

async function loadRow(id) {
  const row = await marketingRepo.engagement.findUnique({
    where: { id },
    include: {
      campaign: { select: { id: true, name: true, targetType: true, metadata: true, channel: true } },
      responseDrafts: { take: 5, orderBy: { createdAt: 'desc' } },
    },
  }).catch(async () => marketingRepo.engagement.findUnique({ where: { id } }));
  return row;
}

function targetTypeOf(row) {
  if (row?.campaign) return readCampaignTargetType(row.campaign);
  return row?.metadata?.targetType || 'USER_ACQUISITION';
}

function effectiveIntent(assist, allowInvestor) {
  if (assist.intentConfirmed) {
    return normalizeMarketingIntent(assist.intentConfirmed, { allowInvestor });
  }
  return normalizeMarketingIntent(assist.intentPrimary || 'UNKNOWN', { allowInvestor });
}

async function saveAssist(row, assistPatch, status) {
  const metadata = {
    ...metaOf(row),
    assist: {
      ...assistOf(row),
      ...assistPatch,
    },
  };
  const data = { metadata };
  if (status) data.status = status;
  const updated = await marketingRepo.engagement.update({
    where: { id: row.id },
    data,
  });
  return { ...row, ...updated, metadata };
}

export async function classifyInboxInteraction(id, ctx = {}) {
  const row = await loadRow(id);
  if (!row) return { ok: false, error: 'not_found' };
  const allowInvestor = targetTypeOf(row) === 'INVESTOR_DISCOVERY';
  const classified = await classifyMarketingIntent({
    text: row.body,
    targetType: targetTypeOf(row),
    language: row.metadata?.language,
  });
  const intent = classified.primaryIntent;
  const destination = resolveDestinationForIntent({ intent, targetType: targetTypeOf(row) });
  const updated = await saveAssist(
    row,
    {
      intentPrimary: intent,
      intentSecondary: classified.secondaryIntents,
      confidence: classified.confidence,
      reasoning: classified.reasoning,
      recommendedAction: recommendedAction(intent, destination.available),
      language: classified.language,
      classifier: classified.generationMeta || { mode: classified.mode },
      classifiedAt: classified.classifiedAt,
      destinationPreview: destination,
    },
    normalizeInboxStatus(row.status) === INTERACTION_STATUSES.NEW ? 'CLASSIFIED' : undefined,
  );
  await appendMarketingAudit({
    entityType: 'MarketingEngagement',
    entityId: id,
    action: 'inbox_classify',
    actorId: ctx.actorId,
    metadata: { intent, mode: classified.mode, liveMeta: false },
  }).catch(() => {});
  return {
    ok: true,
    interaction: toInboxRecord(updated),
    sendsExternally: false,
    liveMeta: false,
  };
}

export async function confirmInboxIntent(id, input = {}, ctx = {}) {
  const row = await loadRow(id);
  if (!row) return { ok: false, error: 'not_found' };
  const allowInvestor = targetTypeOf(row) === 'INVESTOR_DISCOVERY';
  const intent = normalizeMarketingIntent(input.intent, { allowInvestor });
  const destination = resolveDestinationForIntent({ intent, targetType: targetTypeOf(row) });
  const updated = await saveAssist(row, {
    intentConfirmed: intent,
    intentConfirmedAt: new Date().toISOString(),
    intentConfirmedBy: ctx.actorId || null,
    recommendedAction: recommendedAction(intent, destination.available),
    destinationPreview: destination,
    humanOverride: true,
  });
  await appendMarketingAudit({
    entityType: 'MarketingEngagement',
    entityId: id,
    action: 'inbox_confirm_intent',
    actorId: ctx.actorId,
    metadata: { intent, humanOverride: true },
  }).catch(() => {});
  return { ok: true, interaction: toInboxRecord(updated), liveMeta: false };
}

export async function generateInboxSuggestion(id, input = {}, ctx = {}) {
  let row = await loadRow(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (!assistOf(row).intentPrimary && !assistOf(row).intentConfirmed) {
    await classifyInboxInteraction(id, ctx);
    row = await loadRow(id);
  }
  const allowInvestor = targetTypeOf(row) === 'INVESTOR_DISCOVERY';
  const intent = effectiveIntent(assistOf(row), allowInvestor);
  const language = input.language || assistOf(row).language || detectInboxLanguage(row.body);
  const destination = resolveDestinationForIntent({ intent, targetType: targetTypeOf(row) });
  const suggestion = buildSuggestedReply({
    intent,
    language,
    destination,
    interaction: row,
  });
  if (input.reply) suggestion.reply = String(input.reply).slice(0, 2000);

  const draft = await marketingRepo.responseDraft.create({
    engagementId: id,
    body: suggestion.reply,
    status: 'DRAFT',
    riskLevel: 'low',
    createdBy: ctx.actorId || null,
    metadata: {
      mock: true,
      meta: false,
      sendsExternally: false,
      intent,
      language,
      destination: suggestion.destination,
      handoffPreview: suggestion.handoffPreview,
      issued: false,
    },
  });

  const updated = await saveAssist(row, {
    suggestion: {
      draftId: draft.id,
      reply: suggestion.reply,
      recommendedAction: suggestion.recommendedAction,
      destination: suggestion.destination,
      handoffPreview: suggestion.handoffPreview,
      language,
      generatedAt: new Date().toISOString(),
      issued: false,
      rejected: false,
    },
  });

  await appendMarketingAudit({
    entityType: 'MarketingResponseDraft',
    entityId: draft.id,
    action: 'inbox_suggest_reply',
    actorId: ctx.actorId,
    metadata: { engagementId: id, intent, sendsExternally: false },
  }).catch(() => {});

  return {
    ok: true,
    interaction: toInboxRecord(updated),
    draft,
    suggestion,
    sendsExternally: false,
    liveMeta: false,
  };
}

export async function editInboxSuggestion(id, input = {}, ctx = {}) {
  const row = await loadRow(id);
  if (!row) return { ok: false, error: 'not_found' };
  const reply = String(input.reply || '').slice(0, 2000);
  if (!reply) return { ok: false, error: 'reply_required' };
  const assist = assistOf(row);
  const draftId = assist.suggestion?.draftId;
  if (draftId) {
    await marketingRepo.responseDraft.update({
      where: { id: draftId },
      data: {
        body: reply,
        metadata: {
          ...(assist.suggestion || {}),
          edited: true,
          sendsExternally: false,
        },
      },
    }).catch(() => {});
  }
  const updated = await saveAssist(row, {
    suggestion: {
      ...(assist.suggestion || {}),
      reply,
      edited: true,
      editedAt: new Date().toISOString(),
      issued: false,
    },
  });
  await appendMarketingAudit({
    entityType: 'MarketingEngagement',
    entityId: id,
    action: 'inbox_edit_reply',
    actorId: ctx.actorId,
    metadata: { sendsExternally: false },
  }).catch(() => {});
  return { ok: true, interaction: toInboxRecord(updated), liveMeta: false };
}

export async function approveInboxReply(id, ctx = {}) {
  const row = await loadRow(id);
  if (!row) return { ok: false, error: 'not_found' };
  const assist = assistOf(row);
  const suggestion = assist.suggestion;
  if (!suggestion?.reply) return { ok: false, error: 'suggestion_required' };

  let handoffEvent = { skipped: true, reason: 'no_valid_destination' };
  const destination = suggestion.destination || assist.destinationPreview;
  const preview = suggestion.handoffPreview;
  if (destination?.available && preview?.url) {
    handoffEvent = await recordCanonicalEvent({
      eventType: CANONICAL_EVENTS.CARDBEY_HANDOFF,
      campaignId: row.campaignId,
      contentId: row.contentId || row.postId,
      channel: row.channel || 'facebook',
      provider: row.provider || 'facebook',
      source: 'inbox_handoff_approved',
      correlationId: row.id,
      targetType: targetTypeOf(row),
      dedupeKey: `handoff_issued:${id}`,
      destinationUrl: preview.url,
      metadata: {
        interactionId: id,
        intent: assist.intentConfirmed || assist.intentPrimary,
        issued: true,
        draft: false,
        sendsExternally: false,
      },
    });
  }

  if (suggestion.draftId) {
    await marketingRepo.responseDraft.update({
      where: { id: suggestion.draftId },
      data: {
        status: 'APPROVED',
        metadata: {
          ...(suggestion || {}),
          approved: true,
          issued: Boolean(preview?.url && destination?.available),
          sendsExternally: false,
          meta: false,
        },
      },
    }).catch(() => {});
  }

  const updated = await saveAssist(
    row,
    {
      suggestion: {
        ...suggestion,
        approved: true,
        issued: Boolean(handoffEvent?.ok && !handoffEvent?.skipped),
        approvedAt: new Date().toISOString(),
      },
    },
    'REPLY_APPROVED',
  );

  await appendMarketingAudit({
    entityType: 'MarketingEngagement',
    entityId: id,
    action: 'inbox_approve_reply_draft',
    actorId: ctx.actorId,
    metadata: { sendsExternally: false, liveMeta: false, handoffIssued: updated.metadata?.assist?.suggestion?.issued },
  }).catch(() => {});

  return {
    ok: true,
    interaction: toInboxRecord(updated),
    sendsExternally: false,
    liveMeta: false,
    sent: false,
    handoff: handoffEvent,
  };
}

export async function rejectInboxSuggestion(id, ctx = {}) {
  const row = await loadRow(id);
  if (!row) return { ok: false, error: 'not_found' };
  const assist = assistOf(row);
  if (assist.suggestion?.draftId) {
    await marketingRepo.responseDraft.update({
      where: { id: assist.suggestion.draftId },
      data: { status: 'REJECTED', metadata: { rejected: true, issued: false, sendsExternally: false } },
    }).catch(() => {});
  }
  const updated = await saveAssist(row, {
    suggestion: {
      ...(assist.suggestion || {}),
      rejected: true,
      issued: false,
      rejectedAt: new Date().toISOString(),
    },
  });
  await appendMarketingAudit({
    entityType: 'MarketingEngagement',
    entityId: id,
    action: 'inbox_reject_suggestion',
    actorId: ctx.actorId,
    metadata: { sendsExternally: false, handoffIssued: false },
  }).catch(() => {});
  return { ok: true, interaction: toInboxRecord(updated), liveMeta: false };
}

export { isInvestorReservedIntent };
