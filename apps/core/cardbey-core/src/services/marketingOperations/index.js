/**
 * Shared Marketing Operations layer (above Facebook operator).
 */

export {
  TARGET_TYPES,
  OBJECTIVE_STATES,
  CHANNELS,
  CANONICAL_EVENTS,
  SME_LIFECYCLE_EVENTS,
  resolveTargetType,
  isInvestorDiscovery,
  allowsSmeLifecycle,
  normalizeCanonicalEvent,
} from './constants.js';
export { normalizeCampaignWrite, campaignCreateFallback, readCampaignTargetType } from './campaignContract.js';
export { assertApprovalSeparation, allowSelfApproveOverride, approvalStamp } from './approvalDuties.js';
export { createTrackedHandoff } from './trackedHandoff.js';
export {
  recordCanonicalEvent,
  tryRecordSignup,
  tryRecordBusinessCreated,
  tryRecordBusinessClaimed,
  tryRecordBusinessPublished,
  tryRecordContentPublished,
  extractAttrContext,
} from './attributionSpine.js';
export {
  createObjective,
  listObjectives,
  getObjective,
  ensureDefaultUserAcquisitionObjective,
} from './objectiveService.js';
export { ingestGlobalLiveEoi } from './eoiAdapter.js';
export { ingestFirstPartyVisit, VISIT_CAPTURE_WINDOWS } from './visitCapture.js';
export {
  INTERACTION_TYPES,
  INTERACTION_STATUSES,
  INGESTION_SOURCES,
  normalizeInteractionType,
  normalizeInboxStatus,
  normalizeInteractionWrite,
  toInboxRecord,
} from './interactionContract.js';
export {
  persistInboxInteraction,
  injectTestInteraction,
  listInboxInteractions,
  updateInboxStatus,
} from './inboxService.js';
export {
  USER_ACQUISITION_INTENTS,
  INVESTOR_RESERVED_INTENTS,
  normalizeMarketingIntent,
} from './intentTaxonomy.js';
export { classifyMarketingIntent } from './intentClassifier.js';
export { resolveDestinationForIntent, resolveGlobalLiveAvailability } from './destinationGuard.js';
export { buildSuggestedReply } from './suggestedReply.js';
export {
  classifyInboxInteraction,
  confirmInboxIntent,
  generateInboxSuggestion,
  editInboxSuggestion,
  approveInboxReply,
  rejectInboxSuggestion,
} from './inboxAssistService.js';
export { runObjectiveResearch, listResearchTasks } from './researchOrchestrator.js';
export {
  listResearchOpportunities,
  getResearchOpportunity,
  reviewOpportunity,
  approveOpportunity,
  rejectOpportunity,
  archiveOpportunity,
  prepareCampaignFromOpportunity,
} from './opportunityService.js';
export {
  prepareCampaignProposalFromOpportunity,
  getCampaignProposal,
  listCampaignProposals,
  patchCampaignProposal,
  submitCampaignProposal,
  approveCampaignProposal,
  reviseCampaignProposal,
  getCampaignProposalReadiness,
} from './campaignProposalService.js';
export {
  PROPOSAL_KIND,
  PROPOSAL_STATES,
  PROVENANCE_CHAIN,
  purposeFromOpportunity,
} from './campaignProposalContract.js';
export { getMarketingOperationsOverview } from './overviewService.js';
export { ensurePilotResearchObjectives } from './seedPilotObjectives.js';
export {
  EVIDENCE_KIND,
  RESEARCH_TASK_STATES,
  OPPORTUNITY_STATES,
  PILOT_OBJECTIVE_SEEDS,
  ACQUISITION_OPPORTUNITY_TYPES,
  INVESTOR_OPPORTUNITY_TYPES,
} from './researchContract.js';
export {
  INVESTOR_PROFILE_KIND,
  INVESTOR_OUTREACH_KIND,
  INVESTOR_PROJECTION_KIND,
  INVESTOR_HANDOFF_STATES,
  INVESTOR_PROVENANCE_CHAIN,
} from './investorEngagementContract.js';
export {
  INVESTOR_LIFECYCLE,
  INVESTOR_ENGAGEMENT_EVENTS,
  INVESTOR_TRACKING_KIND,
} from './investorEngagementTrackingContract.js';
export {
  listInvestorEngagements,
  getInvestorEngagement,
  prepareInvestorProfile,
  prepareInvestorOutreachPack,
  approveInvestorHandoff,
  reviseInvestorHandoff,
  rejectInvestorHandoff,
  revokeInvestorAccess,
  getCanonicalInvestorLanding,
  resolveInvestorProjectionByToken,
  recordManualInvestorEvent,
  recordPublicInvestorPageEvent,
  recordTokenPageView,
} from './investorEngagementService.js';
