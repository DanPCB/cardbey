/**
 * Facebook Marketing Operator — public service surface.
 */

export { Features } from '../../config/features.js';
export * from './constants.js';
export { getCardbeyCapabilityRegistry } from './capabilityRegistry.js';
export { validateProductClaims } from './claimValidator.js';
export {
  resolveMarketingPermissions,
  hasMarketingPermission,
  requireMarketingPermission,
  PERMISSIONS,
} from './permissions.js';
export { appendMarketingAudit, redactSecrets } from './audit.js';
export { marketingRepo, MarketingRepoError } from './repository.js';
export * as campaignService from './campaignService.js';
export * as contentService from './contentService.js';
export * as engagementService from './engagementService.js';
export * as attributionService from './attributionService.js';
export { getMetaIntegrationDiagnostics } from './diagnostics.js';
export {
  verifyChallenge,
  verifySignature,
  ingestWebhookEvent,
} from './webhookMeta.js';
export { marketingOperatorTools, executeMarketingTool } from './tools.js';
export { seedPilotCampaign } from './seedPilot.js';
export {
  getMarketingFacebookOverview,
  getMarketingAnalytics,
} from './operatorFacade.js';
export { getPublishingProvider } from './publishing/index.js';
export { computeContentHash } from './contentHash.js';
export * as aiGeneration from './aiGeneration.js';
export {
  processDueMarketingPublications,
  runMarketingWorkerCycle,
} from './schedulingWorker.js';
export {
  isWebhookVerificationConfigured,
  WEBHOOK_VERIFICATION_NOT_CONFIGURED,
} from './webhookMeta.js';
