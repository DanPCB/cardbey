/**
 * Read-only Marketing Operations overview. Never fabricates counts.
 */

import { Features } from '../../config/features.js';
import { marketingRepo } from '../marketingOperator/repository.js';
import { CANONICAL_EVENTS } from './constants.js';

const UNAVAILABLE = null;

function countByType(rows, type) {
  if (!Array.isArray(rows)) return UNAVAILABLE;
  return rows.filter((r) => r.eventType === type).length;
}

export async function getMarketingOperationsOverview() {
  const enabled = Features.marketingOperator?.v1 === true;
  const out = {
    ok: true,
    enabled,
    liveMeta: false,
    investorCrm: false,
    layer: 'marketing_operations',
    activeObjective: UNAVAILABLE,
    campaigns: UNAVAILABLE,
    metrics: {
      visits: UNAVAILABLE,
      eois: UNAVAILABLE,
      signups: UNAVAILABLE,
      businessesCreated: UNAVAILABLE,
      businessesClaimed: UNAVAILABLE,
      businessesPublished: UNAVAILABLE,
    },
    businessOperationFunnel: UNAVAILABLE,
    note: 'Visits are first-party CARDBEY_VISIT rows only. Missing values show as unavailable.',
  };

  if (!enabled) {
    out.note = 'ENABLE_MARKETING_OPERATOR_V1 is off.';
    return out;
  }

  try {
    const objectives = await marketingRepo.objective.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
    out.activeObjective = objectives[0]
      ? {
          id: objectives[0].id,
          name: objectives[0].name,
          targetType: objectives[0].targetType,
          market: objectives[0].market ?? null,
          language: objectives[0].language ?? null,
          status: objectives[0].status,
        }
      : null;
  } catch {
    out.activeObjective = UNAVAILABLE;
  }

  try {
    const campaigns = await marketingRepo.campaign.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    out.campaigns = campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      targetType: c.targetType || c.metadata?.targetType || null,
      channel: c.channel || c.metadata?.channel || null,
      status: c.status,
      approvalState: c.approvedBy || c.metadata?.approvedBy ? 'APPROVED' : c.status,
      createdBy: c.createdBy ?? null,
      approvedBy: c.approvedBy || c.metadata?.approvedBy || null,
    }));
  } catch {
    out.campaigns = UNAVAILABLE;
  }

  try {
    const conversions = await marketingRepo.conversion.findMany({
      take: 2000,
      orderBy: { createdAt: 'desc' },
    });
    out.metrics.visits = countByType(conversions, CANONICAL_EVENTS.CARDBEY_VISIT);
    out.metrics.eois = countByType(conversions, CANONICAL_EVENTS.EOI_SUBMITTED);
    out.metrics.signups =
      countByType(conversions, CANONICAL_EVENTS.SIGNUP) +
      countByType(conversions, 'REGISTRATION');
    out.metrics.businessesCreated = countByType(conversions, CANONICAL_EVENTS.BUSINESS_CREATED);
    out.metrics.businessesClaimed = countByType(conversions, CANONICAL_EVENTS.BUSINESS_CLAIMED);
    out.metrics.businessesPublished = countByType(conversions, CANONICAL_EVENTS.BUSINESS_PUBLISHED);

    out.businessOperationFunnel = {
      landingViewed: countByType(conversions, CANONICAL_EVENTS.BUSINESS_OPERATION_LANDING_VIEWED),
      analysisStarted: countByType(conversions, CANONICAL_EVENTS.BUSINESS_ANALYSIS_STARTED),
      contextConfirmed: countByType(conversions, CANONICAL_EVENTS.BUSINESS_CONTEXT_CONFIRMED),
      snapshotCompleted: countByType(conversions, CANONICAL_EVENTS.BUSINESS_SNAPSHOT_COMPLETED),
      snapshotViewed: countByType(conversions, CANONICAL_EVENTS.BUSINESS_SNAPSHOT_VIEWED),
      fullPreviewViewed: countByType(
        conversions,
        CANONICAL_EVENTS.BUSINESS_FULL_ANALYSIS_PREVIEW_VIEWED,
      ),
      unlockClicked: countByType(
        conversions,
        CANONICAL_EVENTS.BUSINESS_FULL_ANALYSIS_UNLOCK_CLICKED,
      ),
      pilotInterest: countByType(
        conversions,
        CANONICAL_EVENTS.BUSINESS_FULL_ANALYSIS_PILOT_INTEREST,
      ),
      feedback: countByType(conversions, CANONICAL_EVENTS.BUSINESS_OPERATION_FEEDBACK),
      signups: out.metrics.signups,
      businessesCreated: out.metrics.businessesCreated,
      businessesClaimed: out.metrics.businessesClaimed,
    };
  } catch {
    /* leave UNAVAILABLE */
  }

  return out;
}
