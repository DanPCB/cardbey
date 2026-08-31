/**
 * Investor engagement 1G — profile, outreach pack, founder handoff.
 * Fail-open writes when flags off. Never sends. Never publishes. Never writes fundraising CRM records.
 */

import { Features } from '../../config/features.js';
import { appendMarketingAudit } from '../marketingOperator/audit.js';
import { listCampaigns } from '../marketingOperator/campaignService.js';
import { marketingRepo } from '../marketingOperator/repository.js';
import { TARGET_TYPES, CANONICAL_EVENTS } from './constants.js';
import { recordCanonicalEvent } from './attributionSpine.js';
import { getCampaignProposal } from './campaignProposalService.js';
import { PROPOSAL_STATES } from './campaignProposalContract.js';
import { getResearchOpportunity } from './opportunityService.js';
import {
  INVESTOR_HANDOFF_STATES,
  INVESTOR_PROFILE_KIND,
  buildCanonicalLandingProjection,
  buildInvestorEngagementProfile,
  buildLandingProjection,
  buildOutreachPack,
  evaluateInvestorReadiness,
  hashInvestorToken,
  issueInvestorToken,
} from './investorEngagementContract.js';
import {
  INVESTOR_ENGAGEMENT_EVENTS,
  INVESTOR_TRACKING_KIND,
  buildTrackingSnapshot,
  emptyTrackingDoc,
  normalizeManualEventInput,
  normalizePageEventInput,
  summarizeInvestorPipeline,
  trackingDedupeKey,
} from './investorEngagementTrackingContract.js';

function flagsOn() {
  return Features.investorEngagement?.v1 === true;
}

function profileFlagOn() {
  return flagsOn() && Features.investorEngagement?.profileV1 === true;
}

function trackingFlagOn() {
  return flagsOn() && Features.investorEngagement?.engagementTrackingV1 === true;
}

function landingFlagOn() {
  return flagsOn() && Features.investorEngagement?.landingProjectionV1 === true;
}

function readBundle(campaign) {
  const meta = campaign?.metadata && typeof campaign.metadata === 'object' ? campaign.metadata : {};
  return {
    meta,
    profile: meta.investorEngagementProfile?.kind === INVESTOR_PROFILE_KIND ? meta.investorEngagementProfile : null,
    pack: meta.investorOutreachPack || null,
    handoff: meta.investorHandoff || null,
    access: meta.investorAccess || null,
    tracking: meta.investorEngagementTracking?.kind === INVESTOR_TRACKING_KIND
      ? meta.investorEngagementTracking
      : null,
  };
}

async function persistInvestor(campaignId, patchMeta = {}) {
  const campaign = await marketingRepo.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return null;
  const meta = campaign.metadata && typeof campaign.metadata === 'object' ? campaign.metadata : {};
  return marketingRepo.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'DRAFT',
      metadata: {
        ...meta,
        ...patchMeta,
        publishes: false,
        liveMeta: false,
        investorSends: false,
      },
    },
  });
}

function publicInvestor(campaign, extra = {}) {
  const bundle = readBundle(campaign);
  const proposalWrap = extra.proposal || null;
  const accessPublic = bundle.access
    ? {
        hasToken: Boolean(bundle.access.tokenHash),
        revokedAt: bundle.access.revokedAt || null,
        expiresAt: bundle.access.expiresAt || null,
      }
    : null;
  const tracking = trackingFlagOn()
    ? buildTrackingSnapshot({
        profile: bundle.profile,
        pack: bundle.pack,
        proposal: proposalWrap,
        handoff: bundle.handoff,
        access: accessPublic,
        tracking: bundle.tracking,
      })
    : null;
  return {
    ok: true,
    campaignId: campaign.id,
    campaignStatus: campaign.status,
    targetType: campaign.targetType || campaign.metadata?.targetType,
    profile: bundle.profile,
    pack: bundle.pack,
    handoff: bundle.handoff,
    projection: bundle.profile ? buildLandingProjection(bundle.profile) : null,
    readiness: evaluateInvestorReadiness({
      proposal: proposalWrap,
      profile: bundle.profile,
      pack: bundle.pack,
      handoff: bundle.handoff,
    }),
    access: accessPublic,
    tracking,
    lifecycle: tracking?.lifecycle || null,
    nextAction: tracking?.nextAction || null,
    attention: tracking?.attention || [],
    publishes: false,
    liveMeta: false,
    sends: false,
    trackingEnabled: trackingFlagOn(),
    ...extra,
  };
}

function eventProvenance(profile, proposal) {
  return {
    objectiveId: profile?.objectiveId || proposal?.objectiveId || null,
    researchTaskId: profile?.researchTaskId || proposal?.researchTaskId || null,
    opportunityId: profile?.opportunityId || proposal?.opportunityId || null,
    campaignId: profile?.campaignId || proposal?.provenance?.campaignId || null,
  };
}

function appendEventToTracking(bundle, event, dedupeKey) {
  const doc = bundle.tracking?.kind === INVESTOR_TRACKING_KIND ? bundle.tracking : emptyTrackingDoc();
  const events = Array.isArray(doc.events) ? [...doc.events] : [];
  const existing = events.find((e) => e.dedupeKey === dedupeKey);
  if (existing) return { tracking: { ...doc, events }, reused: true, event: existing };
  const row = { id: dedupeKey, dedupeKey, ...event };
  events.push(row);
  return {
    tracking: { ...doc, kind: INVESTOR_TRACKING_KIND, events, updatedAt: new Date().toISOString() },
    reused: false,
    event: row,
  };
}

export async function listInvestorEngagements(query = {}) {
  const campaigns = await listCampaigns({ take: query.take || 80 });
  const rows = [];
  for (const campaign of campaigns || []) {
    const target = campaign.targetType || campaign.metadata?.targetType;
    const bundle = readBundle(campaign);
    if (target !== TARGET_TYPES.INVESTOR_DISCOVERY && !bundle.profile) continue;
    const proposal = campaign.metadata?.campaignProposal || null;
    const accessPublic = bundle.access
      ? { hasToken: Boolean(bundle.access.tokenHash), revokedAt: bundle.access.revokedAt || null }
      : null;
    const snap = trackingFlagOn()
      ? buildTrackingSnapshot({
          profile: bundle.profile,
          pack: bundle.pack,
          proposal,
          handoff: bundle.handoff,
          access: accessPublic,
          tracking: bundle.tracking,
        })
      : null;
    const fallbackNext = !bundle.profile
      ? 'Prepare investor profile'
      : !bundle.pack
        ? 'Prepare outreach pack'
        : bundle.handoff?.status === INVESTOR_HANDOFF_STATES.APPROVED_FOR_HANDOFF
          ? 'Handoff approved — founder-controlled outreach only'
          : 'Founder review required';
    rows.push({
      campaignId: campaign.id,
      name: campaign.name,
      investorName: bundle.profile?.investorName || campaign.name,
      investorType: bundle.profile?.investorType || null,
      geography: bundle.profile?.geography || campaign.market,
      fitScore: bundle.profile?.fitScore ?? null,
      proposalStatus: campaign.metadata?.proposalStatus || campaign.status,
      profileReady: Boolean(bundle.profile),
      packReady: Boolean(bundle.pack),
      handoffStatus: bundle.handoff?.status || INVESTOR_HANDOFF_STATES.NOT_STARTED,
      founderDecisionRequired: snap
        ? Boolean(snap.nextAction?.founderActionRequired)
        : Boolean(bundle.pack && bundle.handoff?.status !== INVESTOR_HANDOFF_STATES.APPROVED_FOR_HANDOFF),
      nextAction: snap?.nextAction?.recommendedAction || fallbackNext,
      nextActionDetail: snap?.nextAction || null,
      lifecycle: snap?.lifecycle || null,
      attention: snap?.attention || [],
      lastEventType: snap?.nextAction?.lastEventType || null,
      lastEventAt: snap?.nextAction?.lastEventAt || null,
      dueAt: snap?.nextAction?.dueAt || null,
      liveMeta: false,
    });
  }
  const summary = trackingFlagOn() ? summarizeInvestorPipeline(rows) : { pipeline: null, attention: null, needsAttention: [] };
  return {
    ok: true,
    engagements: rows,
    pipeline: summary.pipeline,
    attention: summary.attention,
    needsAttention: summary.needsAttention,
    trackingEnabled: trackingFlagOn(),
    liveMeta: false,
    sends: false,
  };
}

export async function getInvestorEngagement(campaignId) {
  const loaded = await getCampaignProposal(campaignId);
  if (!loaded.ok && loaded.error === 'not_found') return loaded;
  const campaign = loaded.campaign || (await marketingRepo.campaign.findUnique({ where: { id: campaignId } }));
  if (!campaign) return { ok: false, error: 'not_found' };
  return publicInvestor(campaign, { proposal: loaded.proposal || null });
}

export async function prepareInvestorProfile(campaignId, ctx = {}) {
  if (!profileFlagOn()) {
    return { ok: true, skipped: true, reason: 'flag_off', publishes: false, sends: false };
  }
  const loaded = await getCampaignProposal(campaignId);
  if (!loaded.ok) return { ...loaded, sends: false, liveMeta: false };
  if (loaded.proposal?.targetType !== TARGET_TYPES.INVESTOR_DISCOVERY && loaded.proposal?.purpose !== 'INVESTOR') {
    return { ok: false, error: 'not_investor_proposal', liveMeta: false };
  }
  if (loaded.proposal?.status !== PROPOSAL_STATES.APPROVED) {
    return { ok: false, error: 'proposal_not_approved', liveMeta: false };
  }
  const existing = readBundle(loaded.campaign).profile;
  if (existing) {
    return publicInvestor(loaded.campaign, { proposal: loaded.proposal, reused: true });
  }
  const opportunity = loaded.proposal.opportunityId
    ? await getResearchOpportunity(loaded.proposal.opportunityId)
    : null;
  const profile = buildInvestorEngagementProfile({
    opportunity: opportunity || { id: loaded.proposal.opportunityId, title: loaded.proposal.workingTitle },
    proposal: loaded.proposal,
    campaignId,
    actorId: ctx.actorId,
  });
  const campaign = await persistInvestor(campaignId, { investorEngagementProfile: profile });
  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: campaignId,
    action: 'prepare_investor_profile',
    actorId: ctx.actorId,
    campaignId,
    metadata: { sends: false, liveMeta: false, opportunityId: profile.opportunityId },
  }).catch(() => {});
  return publicInvestor(campaign, { proposal: loaded.proposal, reused: false });
}

export async function prepareInvestorOutreachPack(campaignId, ctx = {}) {
  if (!flagsOn()) return { ok: true, skipped: true, reason: 'flag_off', sends: false };
  const loaded = await getCampaignProposal(campaignId);
  if (!loaded.ok) return { ...loaded, sends: false };
  const bundle = readBundle(loaded.campaign);
  if (!bundle.profile) return { ok: false, error: 'profile_required', sends: false };
  if (bundle.pack) {
    return publicInvestor(loaded.campaign, { proposal: loaded.proposal, reused: true });
  }
  const projection = buildLandingProjection(bundle.profile);
  const pack = buildOutreachPack(bundle.profile, projection);
  const campaign = await persistInvestor(campaignId, { investorOutreachPack: pack });
  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: campaignId,
    action: 'prepare_investor_outreach_pack',
    actorId: ctx.actorId,
    campaignId,
    metadata: { sends: false, watermark: pack.watermark },
  }).catch(() => {});
  return publicInvestor(campaign, { proposal: loaded.proposal, reused: false });
}

export async function approveInvestorHandoff(campaignId, ctx = {}) {
  if (!flagsOn()) return { ok: true, skipped: true, reason: 'flag_off', sends: false };
  const loaded = await getCampaignProposal(campaignId);
  if (!loaded.ok) return { ...loaded, sends: false };
  const bundle = readBundle(loaded.campaign);
  if (!bundle.profile || !bundle.pack) {
    return { ok: false, error: 'pack_required', sends: false };
  }
  if (bundle.handoff?.status === INVESTOR_HANDOFF_STATES.APPROVED_FOR_HANDOFF && !bundle.access?.revokedAt) {
    return publicInvestor(loaded.campaign, { proposal: loaded.proposal, reused: true, note: 'Handoff already approved. No send.' });
  }
  let access = bundle.access;
  let issuedToken = null;
  const alreadyApproved = bundle.handoff?.status === INVESTOR_HANDOFF_STATES.APPROVED_FOR_HANDOFF;
  if (!access?.tokenHash || access?.revokedAt) {
    const issued = issueInvestorToken();
    issuedToken = issued.token;
    access = {
      tokenHash: issued.tokenHash,
      createdAt: new Date().toISOString(),
      expiresAt: null,
      revokedAt: null,
    };
  }
  const handoff = {
    status: INVESTOR_HANDOFF_STATES.APPROVED_FOR_HANDOFF,
    approvedBy: ctx.actorId || null,
    approvedAt: new Date().toISOString(),
    eventType: CANONICAL_EVENTS.INVESTOR_HANDOFF,
    sends: false,
    liveMeta: false,
    note: 'Approved for founder-controlled outreach. No email, LinkedIn, or application was sent.',
  };
  const pack = { ...bundle.pack, approvalState: 'APPROVED_FOR_HANDOFF' };
  let trackingDoc = bundle.tracking;
  if (trackingFlagOn() && !alreadyApproved) {
    const merged = appendEventToTracking(
      bundle,
      {
        eventType: INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_HANDOFF,
        occurredAt: handoff.approvedAt,
        recordedAt: handoff.approvedAt,
        recordedBy: ctx.actorId || null,
        source: 'HANDOFF',
        recordKind: 'HUMAN_RECORD',
        note: 'Founder approved handoff readiness. Not CONTACTED.',
        meetingPhase: null,
        dueAt: null,
        provenance: eventProvenance(bundle.profile, loaded.proposal),
        sends: false,
        inferredContacted: false,
      },
      trackingDedupeKey({ campaignId, eventType: INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_HANDOFF }),
    );
    trackingDoc = merged.tracking;
  }
  const campaign = await persistInvestor(campaignId, {
    investorHandoff: alreadyApproved ? bundle.handoff : handoff,
    investorOutreachPack: pack,
    investorAccess: access,
    ...(trackingDoc ? { investorEngagementTracking: trackingDoc } : {}),
  });
  if (!alreadyApproved) {
    await recordCanonicalEvent({
      eventType: CANONICAL_EVENTS.INVESTOR_HANDOFF,
      campaignId,
      targetType: TARGET_TYPES.INVESTOR_DISCOVERY,
      dedupeKey: `investor_handoff:${campaignId}`,
      metadata: {
        opportunityId: bundle.profile.opportunityId,
        objectiveId: bundle.profile.objectiveId,
        researchTaskId: bundle.profile.researchTaskId,
        investorAnonymous: true,
        sends: false,
      },
    }).catch(() => {});
  }
  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: campaignId,
    action: 'approve_investor_handoff',
    actorId: ctx.actorId,
    campaignId,
    metadata: { sends: false, liveMeta: false, eventType: CANONICAL_EVENTS.INVESTOR_HANDOFF },
  }).catch(() => {});
  return publicInvestor(campaign, {
    proposal: loaded.proposal,
    shareToken: issuedToken,
    sharePath: issuedToken ? `/investors/r/${issuedToken}` : null,
    landingPublished: landingFlagOn(),
    note: alreadyApproved
      ? 'Access token re-issued. Handoff was already approved. No communication was sent.'
      : 'Handoff approved. No communication was sent.',
  });
}

export async function reviseInvestorHandoff(campaignId, ctx = {}) {
  const loaded = await getCampaignProposal(campaignId);
  if (!loaded.ok) return loaded;
  const bundle = readBundle(loaded.campaign);
  const handoff = { ...(bundle.handoff || {}), status: INVESTOR_HANDOFF_STATES.NEEDS_REVISION };
  const campaign = await persistInvestor(campaignId, { investorHandoff: handoff });
  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: campaignId,
    action: 'revise_investor_handoff',
    actorId: ctx.actorId,
    campaignId,
    metadata: { sends: false },
  }).catch(() => {});
  return publicInvestor(campaign, { proposal: loaded.proposal });
}

export async function rejectInvestorHandoff(campaignId, ctx = {}) {
  const loaded = await getCampaignProposal(campaignId);
  if (!loaded.ok) return loaded;
  const handoff = { status: INVESTOR_HANDOFF_STATES.REJECTED, rejectedBy: ctx.actorId || null };
  const campaign = await persistInvestor(campaignId, { investorHandoff: handoff });
  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: campaignId,
    action: 'reject_investor_handoff',
    actorId: ctx.actorId,
    campaignId,
    metadata: { sends: false },
  }).catch(() => {});
  return publicInvestor(campaign, { proposal: loaded.proposal });
}

export async function revokeInvestorAccess(campaignId, ctx = {}) {
  const loaded = await getCampaignProposal(campaignId);
  if (!loaded.ok) return loaded;
  const bundle = readBundle(loaded.campaign);
  const access = { ...(bundle.access || {}), revokedAt: new Date().toISOString() };
  const campaign = await persistInvestor(campaignId, { investorAccess: access });
  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: campaignId,
    action: 'revoke_investor_access_token',
    actorId: ctx.actorId,
    campaignId,
    metadata: { sends: false },
  }).catch(() => {});
  return publicInvestor(campaign, { proposal: loaded.proposal });
}

export function getCanonicalInvestorLanding() {
  if (!landingFlagOn()) return { ok: false, error: 'flag_off' };
  return {
    ok: true,
    projection: buildCanonicalLandingProjection(),
    restricted: false,
    confidential: false,
  };
}

export async function resolveInvestorProjectionByToken(rawToken) {
  if (!landingFlagOn()) return { ok: false, error: 'flag_off' };
  const token = String(rawToken || '').trim();
  if (!token || token.length < 16) return { ok: false, error: 'not_found' };
  const tokenHash = hashInvestorToken(token);
  const campaigns = await listCampaigns({ take: 200 });
  const campaign = (campaigns || []).find((c) => readBundle(c).access?.tokenHash === tokenHash);
  if (!campaign) return { ok: false, error: 'not_found' };
  const bundle = readBundle(campaign);
  if (bundle.access?.revokedAt) return { ok: false, error: 'revoked' };
  if (bundle.access?.expiresAt && new Date(bundle.access.expiresAt) < new Date()) {
    return { ok: false, error: 'expired' };
  }
  if (bundle.handoff?.status !== INVESTOR_HANDOFF_STATES.APPROVED_FOR_HANDOFF) {
    return { ok: false, error: 'not_found' };
  }
  const projection = bundle.profile ? buildLandingProjection(bundle.profile) : null;
  if (projection?.restrictedOmitted && projection.sections) {
    const blocked = new Set(projection.restrictedOmitted);
    projection.sections = projection.sections.filter((s) => !blocked.has(s.key));
  }
  return {
    ok: true,
    projection,
    restricted: false,
    confidential: false,
    tracking: false,
  };
}

export async function recordManualInvestorEvent(campaignId, input = {}, ctx = {}) {
  if (!trackingFlagOn()) return { ok: true, skipped: true, reason: 'flag_off', sends: false };
  const loaded = await getCampaignProposal(campaignId);
  if (!loaded.ok) return { ...loaded, sends: false };
  const normalized = normalizeManualEventInput(input, ctx);
  if (!normalized.ok) return { ...normalized, sends: false };
  const bundle = readBundle(loaded.campaign);
  const event = {
    ...normalized.event,
    provenance: eventProvenance(bundle.profile, loaded.proposal),
  };
  const dedupeKey = trackingDedupeKey({
    campaignId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    idempotencyKey: input.idempotencyKey,
  });
  const merged = appendEventToTracking(bundle, event, dedupeKey);
  const campaign = await persistInvestor(campaignId, { investorEngagementTracking: merged.tracking });
  if (!merged.reused && CANONICAL_EVENTS[event.eventType]) {
    await recordCanonicalEvent({
      eventType: event.eventType,
      campaignId,
      targetType: TARGET_TYPES.INVESTOR_DISCOVERY,
      dedupeKey,
      metadata: {
        ...event.provenance,
        investorAnonymous: true,
        sends: false,
        inferredContacted: false,
      },
    }).catch(() => {});
  }
  await appendMarketingAudit({
    entityType: 'MarketingCampaign',
    entityId: campaignId,
    action: 'record_investor_engagement_event',
    actorId: ctx.actorId,
    campaignId,
    metadata: { eventType: event.eventType, sends: false, reused: merged.reused },
  }).catch(() => {});
  return publicInvestor(campaign, {
    proposal: loaded.proposal,
    reused: merged.reused,
    recordedEvent: merged.event,
    note: 'Event recorded. No communication was sent.',
  });
}

export async function recordPublicInvestorPageEvent(rawToken, input = {}) {
  if (!landingFlagOn()) return { ok: false, error: 'flag_off' };
  if (!trackingFlagOn()) return { ok: false, error: 'flag_off' };
  const resolved = await resolveInvestorProjectionByToken(rawToken);
  if (!resolved.ok) return resolved;
  const token = String(rawToken || '').trim();
  const tokenHash = hashInvestorToken(token);
  const campaigns = await listCampaigns({ take: 200 });
  const campaign = (campaigns || []).find((c) => readBundle(c).access?.tokenHash === tokenHash);
  if (!campaign) return { ok: false, error: 'not_found' };
  const normalized = normalizePageEventInput(input);
  if (!normalized.ok) return { ...normalized, tracking: false };
  const bundle = readBundle(campaign);
  const event = { ...normalized.event, provenance: eventProvenance(bundle.profile, null) };
  const dedupeKey = trackingDedupeKey({
    campaignId: campaign.id,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    sectionKey: event.sectionKey,
  });
  const merged = appendEventToTracking(bundle, event, dedupeKey);
  if (!merged.reused) {
    await persistInvestor(campaign.id, { investorEngagementTracking: merged.tracking }).catch(() => {});
  }
  return {
    ok: true,
    recorded: !merged.reused,
    eventType: event.eventType,
    inferredContacted: false,
    lifecycleUnchangedByPageView: true,
    tracking: true,
    visitorIdentity: false,
  };
}

export async function recordTokenPageView(rawToken) {
  return recordPublicInvestorPageEvent(rawToken, {
    eventType: INVESTOR_ENGAGEMENT_EVENTS.INVESTOR_PAGE_VIEWED,
  });
}
