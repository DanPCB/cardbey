import { randomUUID } from 'node:crypto';
import type { ExternalMarketSignal, MarketIntentAnalysis } from './types.js';
import type { ResolvedMarketEntity, MarketEntityResearch } from './entityTypes.js';
import type { MarketOpportunityAssessment } from './opportunityTypes.js';
import type { OpportunityBrief, ProposedCardbeySolution } from './briefTypes.js';
import type { ConnectionPlan, G5Outcome } from './connectionTypes.js';
import { G5_GOVERNANCE_VERSION } from './connectionGovernance.js';
import { resolveContactTarget } from './resolveContactTarget.js';
import { selectConnectionChannel } from './selectConnectionChannel.js';
import { buildTrackedDestination } from './buildTrackedDestination.js';
import { composeConnectionMessage } from './composeConnectionMessage.js';
import { transitionToReview } from './connectionGovernance.js';

export const G5_PLANNER_VERSION = 'g5.0.0-composition';

export type PrepareConnectionPlanInput = {
  signal: ExternalMarketSignal;
  analysis: MarketIntentAnalysis;
  resolved: ResolvedMarketEntity;
  research: MarketEntityResearch | null;
  opportunity: MarketOpportunityAssessment;
  brief: OpportunityBrief;
  solution: ProposedCardbeySolution | null;
  explicitEmail?: string | null;
  leadEmail?: string | null;
  leadPhone?: string | null;
  permissionBasis?: string | null;
  emailExecutionAvailable?: boolean;
  forcePlan?: boolean;
};

function shouldSkipConnectionPlan(input: PrepareConnectionPlanInput): { skip: true; outcome: G5Outcome; reason: string } | { skip: false } {
  if (input.analysis.classification === 'NON_COMMERCIAL') {
    return { skip: true, outcome: 'NOT_APPLICABLE', reason: 'Non-commercial signal' };
  }

  if (!input.forcePlan) {
    const band = input.opportunity.overallFitBand;
    if (band === 'NOT_APPLICABLE' || band === 'NOT_A_CARDBEY_OPPORTUNITY' || band === 'LOW_FIT') {
      return { skip: true, outcome: 'CONNECTION_NOT_RECOMMENDED', reason: `Fit band ${band} — connection not recommended` };
    }
    if (input.brief.briefStatus === 'NO_SOLUTION_REQUIRED' && band !== 'HIGH_FIT' && band !== 'MEDIUM_FIT') {
      return { skip: true, outcome: 'CONNECTION_NOT_RECOMMENDED', reason: 'No solution required at current fit level' };
    }
  }

  return { skip: false };
}

export function prepareConnectionPlan(input: PrepareConnectionPlanInput): {
  plan: ConnectionPlan | null;
  outcome: G5Outcome;
  reason?: string;
} {
  const skipCheck = shouldSkipConnectionPlan(input);
  if (skipCheck.skip) {
    return { plan: null, outcome: skipCheck.outcome, reason: skipCheck.reason };
  }

  const connectionPlanId = `conn_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const entityName =
    input.resolved.canonicalName ??
    input.brief.businessContext.name ??
    input.analysis.businessHint ??
    'Prospect';

  const contactTarget = resolveContactTarget({
    research: input.research,
    explicitEmail: input.explicitEmail,
    leadEmail: input.leadEmail ?? (input.signal.metadata?.leadEmail as string | undefined),
    leadPhone: input.leadPhone,
    permissionBasis: input.permissionBasis ?? input.signal.provenance?.permissionBasis ?? null,
  });

  const channel = selectConnectionChannel({
    signal: input.signal,
    contactTarget,
    emailExecutionAvailable: input.emailExecutionAvailable ?? false,
  });

  const trackedDestination = buildTrackedDestination({
    signalId: input.signal.signalId,
    connectionPlanId,
    opportunityRef: input.brief.assessmentRef,
    solutionRef: input.solution?.solutionId ?? null,
  });

  const valuePrepared = [
    ...input.brief.opportunityCard.canPrepare,
    ...(input.solution?.previews.map((p) => p.label) ?? []),
  ].slice(0, 6);

  let messageDraft = null;
  if (contactTarget || channel.executionMode !== 'UNAVAILABLE') {
    messageDraft = composeConnectionMessage({
      signal: input.signal,
      analysis: input.analysis,
      opportunity: input.opportunity,
      brief: input.brief,
      solution: input.solution,
      trackedDestination,
      entityName,
    });
  }

  let connectionStatus = channel.executionMode === 'UNAVAILABLE' && !contactTarget
    ? 'CONTACT_TARGET_UNAVAILABLE'
    : 'PLAN_READY';

  if (!contactTarget && channel.executionMode === 'UNAVAILABLE') {
    return {
      plan: null,
      outcome: 'CONTACT_TARGET_UNAVAILABLE',
      reason: 'No verified contact target for connection',
    };
  }

  const plan: ConnectionPlan = {
    connectionPlanId,
    signalId: input.signal.signalId,
    opportunityRef: input.brief.assessmentRef,
    solutionRef: input.solution?.solutionId ?? null,
    objective: input.brief.recommendedSolutionSummary || input.brief.summary,
    recipient: {
      entityName,
      entityRef: input.resolved.resolvedEntityRef,
      contactTarget,
    },
    recommendedChannel: channel.recommendedChannel,
    alternativeChannels: channel.alternativeChannels,
    contactSource: contactTarget?.source ?? null,
    permissionBasis: input.permissionBasis ?? input.signal.provenance?.permissionBasis ?? null,
    messageDraft,
    valuePrepared,
    trackedDestination,
    executionMode: channel.executionMode,
    approvalRequired: true,
    governanceStatus: 'DRAFT',
    channelAvailability: channel.channelAvailability,
    connectionStatus,
    proposedAction: 'send_customer_message',
    limitations: [
      ...input.brief.limitations.slice(0, 5),
      channel.reason,
      'Human approval required before any external connection',
    ],
    evidence: input.opportunity.assessmentEvidence.slice(0, 8),
    preparedAt: new Date().toISOString(),
    plannerVersion: G5_PLANNER_VERSION,
  };

  const readyPlan = transitionToReview(plan);

  let outcome: G5Outcome = 'REVIEW_REQUIRED';
  if (channel.executionMode === 'MANUAL_HANDOFF') {
    outcome = 'REVIEW_REQUIRED';
    readyPlan.connectionStatus = 'REVIEW_REQUIRED';
  }

  return { plan: readyPlan, outcome };
}
