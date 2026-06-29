/**
 * POST /api/performer/intake/v2
 *
 * Layers: shortcut context → IntentReasoner → contract validation → plan normalize → kernel dispatch → response.
 *
 * Error shape (route layer): { error: string, detail?: string }
 */

import express from 'express';
import crypto from 'node:crypto';
import { requireUserOrGuest } from '../middleware/guestAuth.js';
import { guestSessionId } from '../middleware/guestSession.js';
import { isCampaignOrchestrationIntent } from '../lib/intent/campaignOrchestrationIntent.js';
import {
  validateCreateStorePayload,
  detectPosterEditIntent,
  detectDeviceIntent,
  isPromotionGraphicIntent,
  blockCreateStoreOnCompletedMission,
} from '../lib/intake/intakeSystemShortcuts.js';
import {
  guardClassificationForActiveMission,
  shouldSkipAgentLoopForActiveMission,
} from '../lib/intake/activeMissionIntakeGuard.js';
import {
  formatDuplicateStoreIntakeResponse,
  formatValidationErrorResponse,
} from '../lib/intake/intakeErrorTypes.js';
import {
  messageLooksLikeWebsiteCreate,
  messageLooksLikeStoreCreate,
} from '../lib/intake/storeWebsiteRunwayClassifier.js';
import {
  shouldBlockServiceRequestForStoreCreate,
} from '../lib/intent/storeCreateFastPath.js';
import { resolveIntakeShortcutContext } from '../lib/intake/intakeShortcutContext.js';
import {
  buildCreateStoreDraftIntakeResponseFromUpload,
  dispatchCreateStoreCheckpointPipeline,
  respondCreateStoreCheckpointDispatch,
  runCreateStoreViaUnifiedDispatch,
  shouldForceCreateStoreCheckpointDispatch,
  shouldSkipDynamicPlannerForUploadCreateStore,
} from '../lib/intake/createStoreCheckpointDispatch.js';
import { applyIntakePayloadGuard } from '../lib/intake/intakePayloadGuard.js';
import { handleFreshStoreCreationDraftSubmit } from '../lib/intake/freshStoreCreationFastPath.js';
import { diagLog, isIntakeDiagEnabled } from '../lib/diagnostics/storeCreationDiagnostics.js';
import {
  respondCreateCampaignCheckpointDispatch,
  runCreateCampaignViaUnifiedDispatch,
} from '../lib/intake/createCampaignCheckpointDispatch.js';
import { isCampaignCheckpointKernelTool } from '../lib/intake/campaignKernelRouting.js';
import {
  shouldRouteToAssetIntentDetection,
  detectExplicitAssetIntent,
  detectExplicitStoreIntent,
  detectCreateStoreFromUploadedAssetIntent,
  hasExplicitUploadCreateStoreOrWebsiteIntent,
  isExplicitCreateStoreFromUploadContext,
  shouldAutoSubmitCreateStoreClassification,
  shouldAnalyzeUploadedAssetForStoreCreation,
  shouldBlockStoreCheckWithoutContext,
  shouldDeferCreateStoreDraftForAssetIngest,
  hasRecentUploadedAssetInContext,
} from '../lib/intake/assetUploadGuard.js';
import {
  buildAssetIntentDetectionClassification,
  buildAnalyzeUploadedAssetForStoreCreationClassification,
} from '../lib/intake/assetIntentIngestService.js';
import {
  createModeResponseMeta,
  resolveManualIntakeRequest,
  resolvePerformerMode,
} from '../lib/mode/modeRouter.js';
import { unifiedDispatch, mapUnifiedDispatchToIntakeResponse } from '../lib/intake/unifiedDispatch.js';
import { dispatchIntakeToolViaUnifiedKernel } from '../lib/intake/intakeKernelToolDispatch.js';
import {
  isDeviceIntentPreClassifyAllowed,
  isKernelOnlyIntakeTool,
  getKernelOnlyIntakeToolMessage,
  isPerformeeSlideshowOverrideAllowed,
} from '../lib/intake/intakeShortcutPolicy.js';
import { resolveIntakeLocale } from '../lib/localePrompt.js';
import { areIntakeShortcutsAllowed, isKernelMandatoryEnabled, normalizeClassificationForKernel } from '../lib/runtime/kernelMandatory.js';
import {
  validateIntakeClassification,
  mergeStoreCreateFormIntoParameters,
  isContextFreeTool,
  CONTEXT_FREE_TOOLS,
} from '../lib/intake/intakeContractValidate.js';
import {
  buildStoreCreationDraft,
  formatStoreCreationDraftResponse,
  isStoreCreationDraftConfirmationSubmit,
  resolveStoreCreateFormFromDraftSubmitBody,
} from '../lib/intake/storeCreationDraft.js';
import { validateCreateStoreIntakeSource, findUnknownStoreCreateFormFields } from '../lib/intake/createStoreIntakeMetadata.js';
import {
  buildAssetExtractionInput,
  buildOcrHintsFromImageText,
  extractFirstUrlFromText,
  formatAssetStoreDraftResponse,
  formatStoreCreationDraftResponseForBundle,
  hasMeaningfulAssetExtraction,
  mergeAssetExtraction,
  enrichAssetExtractionWithUploadOcr,
  resolveWebsiteMetadataForStoreDraft,
  shouldAttachDraftToAssetSelection,
  shouldRouteIngestToStoreCreationDraft,
} from '../lib/intake/storeCreationDraftAssetBridge.js';
import {
  buildAssetIngestFromCardExtraction,
  loadPersistedAssetIngestFromMission,
  persistAttachmentOcrToMission,
  stashVisionExtractionForSession,
} from '../lib/intake/attachmentOcrPersistence.js';
import {
  buildDocumentExtractionArtifact,
  persistDocumentExtractionToMission,
  resolveStoreCandidateForHandoff,
  peekPendingDocumentExtraction,
  storeCandidateToAssetExtraction,
} from '../lib/intake/storeCandidate.js';
import {
  hydrateIntentSourceFromWorkflow,
  persistUploadedAssetWorkflow,
  resolveIntakeAssetSessionKey,
  stashIntakeWorkflowContext,
  workflowPatchFromIntakePayload,
} from '../lib/intake/intakeWorkflowContext.js';
import {
  UPLOAD_INTAKE_PHASE,
  applyUploadPhaseRouting,
  buildUploadAttachmentGuardCtx,
  clearStaleAssetAction,
  enforceUploadAskIntentClassification,
  injectUploadImageIntoBody,
  isUploadOnlyAskTurn,
  logUploadIntakePhaseIfDev,
  resolveUploadIntakePhase,
} from '../lib/intake/uploadIntakePhase.js';
import {
  runIntakeBeliefShadow,
  runIntakeShadowRank,
  runDecisionLoopAuthority,
  isIntakeDecisionLoopAuthorityEnabled,
  tryEarlyDecisionLoopGate,
  shouldSkipCreateStoreEarlyDraftForDecisionLoop,
  shouldSkipPlannersForDecisionLoop,
  buildUploadAskClarifyFallback,
  shouldForceUploadAskPanel,
  shouldRequireUploadAskPanel,
  loadBelief,
  hydrateBeliefForDecisionLoop,
  recordIntakeBypass,
  INTAKE_BYPASS_IDS,
} from '../lib/decision/index.js';
import { runIntakeAuthorityTurn } from '../lib/intake/intakeV2AuthorityTurn.js';

/** Tools that don't require an active store context (confirm + dispatch). */
const STORE_CONTEXT_FREE_TOOLS = CONTEXT_FREE_TOOLS;
import { normalizePlan, mergePlanLevelParametersIntoSteps } from '../lib/intake/intakeNormalizePlan.js';
import { mergeProactivePlanBundleIntoMetadata } from '../lib/runtime/runtimeOrchestrationState.js';
import { evaluateExecutionPolicy, CONFIDENCE_MEDIUM, CONFIDENCE_HIGH } from '../lib/intake/intakeExecutionPolicy.js';
import { emitIntakeV2Telemetry } from '../lib/intake/intakeTelemetry.js';
import { getToolEntry, isRegisteredTool, PLAN_ROLE, RISK } from '../lib/intake/intakeToolRegistry.js';
import { attemptIntentRecovery, mergeRecoveredClassification } from '../lib/intake/intakeIntentRecovery.js';
import { mergeClarifyOptionsFromResolution } from '../lib/intake/intakeClarifyOptions.js';
import { resolveIntent } from '../lib/intake/intakeIntentResolver.js';
import { intentResolutionTelemetryFields } from '../lib/intake/intakeIntentTelemetry.js';
import {
  isHeroImageChangeMessage,
  hasIntakeImageAttachment,
  isHeroUiInstructionFallback,
  tryHeroAutoVisualDirectAction,
} from '../lib/intake/intakeHeroImageClarify.js';
import { getTenantId, resolveAccessibleMission } from '../lib/missionAccess.js';
import { getPrismaClient } from '../lib/prisma.js';
import { inferCurrencyFromLocationText } from '../services/draftStore/currencyInfer.js';
import { buildCard } from '../lib/cards/buildCard.js';
import { createEmitContextUpdate } from '../lib/missionPlan/agentMemory.js';
import { mergeMissionContext } from '../lib/mission.js';
import { appendEvent as appendMissionBlackboardEvent } from '../lib/missionBlackboard.js';
import { handleUploadStoreAsset } from '../lib/tools/handlers/uploadStoreAsset.js';
import { handleReplaceStoreCatalog } from '../lib/tools/handlers/replaceStoreCatalog.js';
import { handleUpdateStoreHero } from '../lib/tools/handlers/updateStoreHero.js';
import { handlePublishStore } from '../lib/tools/handlers/publishStore.js';
import { buildApprovalPayload } from '../lib/intake/intakeApprovalPayload.js';
import {
  putIntakeApprovalPreview,
  getIntakeApprovalPreview,
  deleteIntakeApprovalPreview,
} from '../lib/intake/intakeApprovalPreviewStore.js';
import { resolveIntakeV2ActorKey, resolveIntakeV2TenantKey } from '../lib/intake/intakeV2ActorContext.js';
import {
  getPersistedIntentResolution,
  maybePersistIntakeIntentResolution,
} from '../lib/intake/intakePersistedIntentStore.js';
import {
  resolveStoreAmbiguity,
  tryAutoResolveSingleStoreId,
  validateUserStoreId,
} from '../lib/intake/resolveStoreAmbiguity.js';
import {
  buildStoreClarifyOptionsFromHydratedContext,
  tryReplayPendingStoreSelection,
} from '../lib/intake/storeSelectionReplay.js';
import {
  bootstrapIntakeContext,
  finalizeIntakeContext,
  resolveContextSessionId,
  resolveContextUserId,
} from '../lib/context/contextIntakeBridge.js';
import { isContextEngineEnabled } from '../lib/context/contextEngine.js';
import {
  enrichPendingIntentForDocumentIngestion,
  mergePendingDocumentIntoForcedParams,
  PENDING_SKILL_DOCUMENT_INGESTION,
  readPendingSkillContext,
} from '../lib/intake/pendingSkillResume.js';
import {
  COMMERCIAL_INTENT_RE,
  detectCapabilityGap,
  isIntakeV2CapabilityGapEnabled,
} from '../lib/intake/intakeCapabilityGap.js';
import { buildCapabilityProposalFromGap } from '../lib/intake/intakeCapabilityProposal.js';
import { spawnChildAgentForMissionTask } from '../lib/agents/childAgentBridge.js';
import { ocrExtractText } from '../lib/ocr/ocrProvider.js';
import { buildCapabilityAssessmentSummary } from '../lib/capabilityAware/buildCapabilityAssessment.ts';
import { extractRequirements } from '../lib/capabilityAware/requirementExtractor.ts';
import { resolveCapabilityGaps, summarizeGaps } from '../lib/capabilityAware/gapModel.ts';
import {
  deriveIntakeSuccessFromToolResult,
  normalizeArtifact,
  resolveIntakeMessageFromToolResult,
} from '../lib/artifacts/artifactContract.js';
import { resolveRequestedCapability } from '../lib/capabilities/capabilityRegistry.js';
import {
  intakeSuccessFromCapabilityPlan,
  resolveCapabilityExecutionPlan,
} from '../lib/capabilities/capabilityResolver.js';
import { deriveRole, derivePhase } from '../lib/capabilityAware/roleContext.ts';
import { selectStrategy, summarizeStrategy } from '../lib/capabilityAware/strategySelector.ts';
import { getDefaultPremiumPolicy } from '../lib/capabilityAware/premiumRouting.ts';
import { buildAcquisitionMap } from '../lib/capabilityAware/acquisitionState.ts';
import { buildSmartDocument } from '../lib/smartDocument/buildSmartDocument.js';
import { getOrCreateCardbeyTraceId, CARDBEY_TRACE_HEADER } from '../lib/trace/cardbeyTraceId.js';
import {
  resolveCapability,
  maybeEnhanceGeneralChatResponse,
  CAPABILITY_FAMILIES,
  signalsServiceRequest,
} from '../lib/capabilityResolver/resolveCapability.js';
import { maybeBuildCapabilityBridgeArtifact } from '../lib/capabilityResolver/maybeBuildCapabilityBridgeArtifact.js';
import { buildIntakeV2AgentLoopChatCapabilityExtras } from '../lib/capabilityResolver/buildIntakeV2AgentLoopChatCapabilityExtras.js';
import {
  buildServiceRequestCaptureResponse,
  collectUserTextsForServiceDraft,
  formatServiceRequestWithProviderSearch,
  formatSelectedServiceProviderBlock,
  isServiceRequestDraftComplete,
  mergeServiceRequestDraftFromTurns,
} from '../lib/capabilityResolver/serviceRequestDraft.js';
import {
  searchServiceProviders,
  resolveSeedProviderCandidateById,
} from '../lib/capabilityResolver/serviceProviderSearch.js';
import { planNextSteps } from '../lib/missionCompletion/nextStepPlanner.js';
import { executionGateway } from '../lib/intake/executionGateway.js';
import { superAdminOnly } from '../lib/intake/guardPolicy.js';
import { buildMaintenanceContext } from '../lib/intake/buildMaintenanceContext.js';
import { mapPlannerDecisionToIntakeResponse } from '../lib/intake/mapPlannerDecisionToIntakeResponse.js';
import { getMissionById } from '../lib/missionBlackboard.js';
import { dispatchTool } from '../lib/toolDispatcher.js';
// DANH: skill-runtime-phase4
// skillRegistry is imported (read-only) alongside skillRouter so the cooperative
// gate can test for a legacy match WITHOUT executing it (see gate note below).
import { skillRouter, skillRegistry } from '../lib/skills/index.js';
// DANH: skill-runtime-phase3
// Explicit .ts extension: this is a .js file importing a .ts module; that is
// the resolution pattern that works under both tsx (runtime) and vitest in
// this repo (see src/routes/stores.js importing artifactMemory.ts).
import { dispatchWithRuntime } from '../lib/skill_runtime/dispatchWithRuntime.ts';
import { reactPlanner } from '../lib/intake/reactPlanner.js';
import {
  isReactPlannerAskDecision,
  isReactPlannerConfirmDecision,
  mergePlannerParameters,
  runPostClassifyReactPlanner,
} from '../lib/intake/reactPlannerBridge.js';
import { isRuntimeCapabilityEnabled } from '../lib/runtime/runtimeCapabilitiesService.js';
import { hydrateContext, hydratedContextToPlannerContext, enrichHydratedContextWithIntentEntities } from '../lib/memory/memoryHydrator.js';
import { formatControlTowerSummary } from '../lib/intake/controlTowerQuery.js';
import { normalizeLocale } from '../lib/localePrompt.js';
import { intakeMessage } from '../lib/intake/performerIntakeMessageCatalog.js';
import { shouldGateGuestPostDraftStoreAction } from '../lib/intake/guestDraftSignInGate.js';
import { shouldClarifyGuestDraftAddProduct } from '../lib/intake/guestDraftProductClarify.js';
import { getIntentIntegration } from '../lib/intent/intentIntegration.js';
import {
  applyDynamicPlanToClassification,
  getPlannerIntegration,
} from '../lib/planner/plannerIntegration.js';
import { getContextProvider } from '../lib/context/contextEngine.js';
import {
  buildRunwayContext,
  formatContextGapMessage,
  formatSuggestedActionsForContextGap,
  resolveEditableTarget,
} from '../lib/runwayContext.js';
import {
  attachIntakeMemoryFields,
  extractMemoryLoadStatus,
  hydrateContextFromMemoryBundle,
  loadIntakeMemoryBundle,
  pickMemorySummary,
  pickUnifiedMemory,
  resolveIntakeDraftId,
  resolveIntakeMissionId,
  resolveIntakeStoreId,
  resolveStoreIdFromIntakeSelection,
} from '../lib/intake/intakeMemoryContext.js';
import { enrichClassificationWithMemoryPlan } from '../lib/intake/dispatchPlanAction.js';
import fs from 'node:fs';
import path from 'node:path';
import {
  createMissionPipelineForIntakeRoute,
  isMissionCreateBusyError,
  isMissionCreateTimeoutError,
  respondMissionCreateBusy,
  respondMissionCreateTimeout,
} from '../lib/mission/missionCreateWrite.js';
import {
  bootstrapConversationForIntake,
  finalizeConversationIntakeResponse,
  attachConversationToMissionMetadata,
  getIntakeConversationHistoryLimit,
  persistConversationSessionStoreId,
} from '../services/conversation/conversationIntakeBridge.js';

function getIntakeIntentIntegration() {
  return getIntentIntegration({ contextProvider: getContextProvider() });
}

function withPipelineLocale(metadata, locale) {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata } : {};
  return { ...base, locale: normalizeLocale(locale ?? base.locale ?? base.preferredLocale ?? base.lang) };
}

function withConversationMetadata(metadata, conversationState) {
  if (!conversationState?.session?.id) return metadata;
  return attachConversationToMissionMetadata(
    metadata,
    conversationState.context,
    conversationState.session.id,
  );
}

const VALID_MISSION_TYPES = new Set([
  'STORE_MANAGEMENT',
  'MARKETING',
  'PROMOTION',
  'MAINTENANCE',
]);

const VALID_USER_ROLES = new Set(['operator', 'owner', 'guest', 'super_admin', 'generic_operator']);

function resolveMissionType(req, existingMission) {
  const from = (req.body?.missionType ?? existingMission?.missionType ?? 'STORE_MANAGEMENT').toUpperCase();
  return VALID_MISSION_TYPES.has(from) ? from : 'STORE_MANAGEMENT';
}

function resolveUserRole(req) {
  const from =
    req.body?.userRole ??
    req.headers?.['x-performer-role'] ??
    req.user?.role ??
    'owner';
  const normalized = String(from ?? '').toLowerCase();
  return VALID_USER_ROLES.has(normalized) ? normalized : 'owner';
}

async function buildContext(req, existingMission) {
  const userMessage = String(req.body?.text ?? req.body?.goal ?? req.body?.message ?? '').trim();
  const locale = resolveIntakeLocale(
    req.body?.locale ?? req.headers?.['x-locale'] ?? req.headers?.['accept-language'],
    userMessage,
  );
  return {
    missionId: req.body?.missionId ?? existingMission?.id ?? null,
    storeId: req.body?.storeId ?? existingMission?.storeId ?? null,
    userId: req.body?.userId ?? null,
    missionType: resolveMissionType(req, existingMission),
    userRole: resolveUserRole(req),
    locale,
    rawUserMessage: req.body?.userMessage ?? '',
    intakeV2Selection: req.body?.intakeV2Selection ?? null,
    originalGoal: req.body?.intakeV2Selection?.originalGoal ?? req.body?.userMessage ?? '',
    mission: existingMission ?? null,
  };
}

async function maintenanceDispatchTool(toolName, parameters, toolContext) {
  if (isKernelOnlyIntakeTool(toolName)) {
    return {
      status: 'blocked',
      blocker: {
        code: 'KERNEL_EXECUTION_REQUIRED',
        message: getKernelOnlyIntakeToolMessage(toolName),
      },
    };
  }
  if (isKernelMandatoryEnabled()) {
    const { toolResult } = await dispatchIntakeToolViaUnifiedKernel(toolName, parameters, {
      missionId: toolContext?.missionId ?? parameters?.missionId ?? null,
      storeId: toolContext?.storeId ?? parameters?.storeId ?? null,
      userId: toolContext?.userId ?? null,
      tenantId: toolContext?.tenantId ?? null,
      locale: toolContext?.locale ?? 'en',
      source: 'intake_v2_unified',
      confirmed: true,
    });
    if (toolResult?.status === 'ok' && toolResult.output != null) {
      return typeof toolResult.output === 'object' ? toolResult.output : { value: toolResult.output };
    }
    return toolResult;
  }
  console.warn(
    '[KERNEL_BYPASS DETECTED] tool=%s is executing outside the unified kernel. This path should be migrated.',
    toolName,
  );
  const result = await dispatchTool(toolName, parameters, toolContext);
  if (result?.status === 'ok' && result.output != null) {
    return typeof result.output === 'object' ? result.output : { value: result.output };
  }
  return result;
}

const router = express.Router();
/** Stable guest session id (cookie / X-Guest-Session) for cross-origin performer intake. */
router.use(guestSessionId);
const isDev = process.env.NODE_ENV !== 'production';
const CREATE_CARD_RE =
  /(create\s+.*card|make\s+.*card|loyalty\s+card|promo\s+card|promotion\s+card|gift\s+card|event\s+card|invitation|invite|profile\s+card|business\s+card)/i;

function performerIntakeV2ActorId(req) {
  const raw = req.user?.id ?? req.userId ?? req.guestId ?? req.guest?.id;
  if (raw == null) return '';
  return String(raw).trim();
}

function performerIntakeV2UserLike(req) {
  if (req.user?.id) return req.user;
  const gid = performerIntakeV2ActorId(req);
  if (!gid) return null;
  return { id: gid, role: 'guest', isGuest: true };
}

async function dispatchCampaignOrchestrationFromIntake(
  req,
  res,
  { body, currentContext, userMessage, locale, cardbeyTraceId, storeContext = null },
) {
  const actorId = performerIntakeV2ActorId(req);
  const result = await unifiedDispatch(
    {
      type: 'campaign_orchestration',
      payload: {
        body,
        currentContext,
        userMessage,
        locale,
        cardbeyTraceId,
        storeContext,
        actorId,
        user: req.user,
      },
    },
    { requireConfirmation: false, source: 'agent_orchestration' },
  );
  return res.json(mapUnifiedDispatchToIntakeResponse(result));
}

/** Block only exact duplicate display names for same owner — multiple stores per user are allowed. */
async function findDuplicateBusinessNameForUser(prisma, userId, businessName) {
  const bn = String(businessName ?? '').trim();
  const bnLower = bn.toLowerCase();
  const uid = typeof userId === 'string' ? userId.trim() : '';
  if (!bn || !uid) return null;
  try {
    const rows = await prisma.business.findMany({
      where: { userId: uid },
      select: { id: true, name: true },
    });
    return rows.find((row) => String(row?.name ?? '').trim().toLowerCase() === bnLower) ?? null;
  } catch {
    return null;
  }
}

// ── SmartDocument intent patterns (CC-4) ──────────────────────────────────
const SD_CARD_LOYALTY_RE = /loyalty.{0,10}card|card.{0,10}loyalty/i;
const SD_CARD_GIFT_RE = /gift.{0,10}card|card.{0,10}gift/i;
const SD_CARD_PROMO_RE = /promo.{0,10}card|discount.{0,10}card|card.{0,10}promo/i;
const SD_CARD_INVITE_RE = /invitation|invite.{0,15}card|event.{0,10}invitation/i;
const SD_CARD_EVENT_RE = /event.{0,10}card|card.{0,10}event/i;
const SD_CARD_PROFILE_RE = /profile.{0,10}card|digital.{0,10}business.{0,10}card|business.{0,10}card.{0,10}digital/i;
const SD_CARD_GENERIC_RE = /(create|make|design).{0,10}card/i;
const SD_TICKET_CONCERT_RE = /concert.{0,10}ticket|ticket.{0,10}concert/i;
const SD_TICKET_FLIGHT_RE = /flight.{0,10}ticket|ticket.{0,10}flight/i;
const SD_TICKET_GENERIC_RE = /(create|make|design).{0,10}ticket/i;
const SD_REPORT_RE = /smart.{0,10}report|intelligent.{0,10}report|interactive.{0,10}report/i;
const SD_QUOTE_RE = /smart.{0,10}quote|interactive.{0,10}quote|smart.{0,10}proposal/i;

function looksWebsiteCreateIntent(raw) {
  return messageLooksLikeWebsiteCreate(raw);
}

function looksStoreCreateIntent(raw) {
  return messageLooksLikeStoreCreate(raw);
}

/**
 * Detect SmartDocument type + subtype from a user message.
 * Returns { sdType, sdSubtype } or { sdType: null, sdSubtype: null } if no match.
 */
function detectSmartDocumentIntent(text) {
  if (SD_CARD_LOYALTY_RE.test(text)) return { sdType: 'card', sdSubtype: 'loyalty' };
  if (SD_CARD_GIFT_RE.test(text)) return { sdType: 'card', sdSubtype: 'gift' };
  if (SD_CARD_PROMO_RE.test(text)) return { sdType: 'card', sdSubtype: 'promo' };
  if (SD_CARD_INVITE_RE.test(text)) return { sdType: 'card', sdSubtype: 'invitation' };
  if (SD_CARD_EVENT_RE.test(text)) return { sdType: 'card', sdSubtype: 'event' };
  if (SD_CARD_PROFILE_RE.test(text)) return { sdType: 'card', sdSubtype: 'profile' };
  if (SD_TICKET_CONCERT_RE.test(text)) return { sdType: 'ticket', sdSubtype: 'concert' };
  if (SD_TICKET_FLIGHT_RE.test(text)) return { sdType: 'ticket', sdSubtype: 'boarding' };
  if (SD_TICKET_GENERIC_RE.test(text)) return { sdType: 'ticket', sdSubtype: 'event' };
  if (SD_REPORT_RE.test(text)) return { sdType: 'report', sdSubtype: 'business' };
  if (SD_QUOTE_RE.test(text)) return { sdType: 'report', sdSubtype: 'proposal' };
  if (SD_CARD_GENERIC_RE.test(text)) return { sdType: 'card', sdSubtype: 'profile' };
  return { sdType: null, sdSubtype: null };
}

/** Extract event date from message text. */
function extractEventDate(text) {
  const m = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2})/i);
  return m ? m[0] : null;
}

/** Extract event venue from message text. */
function extractEventVenue(text) {
  const m = text.match(/(?:at|venue|location)[:\s]+([^,\n.]{3,50})/i);
  return m ? m[1].trim() : null;
}

/** Extract stamp threshold from message text. */
function extractStampThreshold(text) {
  const m = text.match(/every\s+(\d+)|(\d+)\s+stamp/i);
  return m ? parseInt(m[1] ?? m[2]) : null;
}

/** Extract offer text from message. */
function extractOffer(text) {
  const m = text.match(/(\d+)%\s*off|\$(\d+)\s*off|(\d+)\s*percent/i);
  return m ? m[0] : null;
}

function resolveCardTypeFromMessage(msg) {
  const s = String(msg ?? '').toLowerCase();
  if (/\bloyalty\b/.test(s)) return 'loyalty';
  if (/\bpromo\b|\bpromotion\b|\bdiscount\b/.test(s)) return 'promo';
  if (/\bgift\b/.test(s)) return 'gift';
  if (/\bevent\b/.test(s)) return 'event';
  if (/\binvitation\b|\binvite\b/.test(s)) return 'invitation';
  if (/\bprofile\b|\bbusiness\s+card\b/.test(s)) return 'profile';
  return 'profile';
}

/** Strip straight and curly quotes / backticks wrapping LLM or UI intent text. */
const INTENT_WRAP_QUOTE_RE = /^[\s"'`]+|[\s"'`]+$/g;
const INTENT_WRAP_QUOTE_RE_FULL =
  /^[\s"'`\u201c\u201d\u2018\u2019]+|[\s"'`\u201c\u201d\u2018\u2019]+$/g;

function stripIntentWrappingQuotes(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const once = s.replace(INTENT_WRAP_QUOTE_RE_FULL, '').trim();
  return once.replace(INTENT_WRAP_QUOTE_RE, '').trim() || null;
}

/**
 * CreateStoreCardPlaceholder submit line: "StoreName · mini website · Category · Location"
 * (middle dot U+00B7). Machine-generated — prefer over NL/LLM extraction.
 * @param {string} message
 * @returns {{ storeName: string | null, intentMode: 'store' | 'website' | null, category: string | null, location: string | null } | null}
 */
function parsePillMessage(message) {
  const raw = String(message ?? '').trim();
  if (!raw || !raw.includes('·')) return null;
  const parts = raw.split('·').map((s) => String(s ?? '').trim()).filter((p) => p.length > 0);
  if (parts.length < 2) return null;
  const typeRaw = (parts[1] ?? '').toLowerCase().replace(/\s+/g, ' ');
  let intentMode = null;
  if (typeRaw.includes('mini') && typeRaw.includes('website')) intentMode = 'website';
  else if (/\bwebsite\b|\bmicrosite\b|\bweb\s*site\b/i.test(parts[1] ?? '')) intentMode = 'website';
  else if (/\bstore\b|\bshop\b/i.test(parts[1] ?? '')) intentMode = 'store';
  return {
    storeName: parts[0] ? stripIntentWrappingQuotes(parts[0]) : null,
    intentMode,
    category: parts[2] ? stripIntentWrappingQuotes(parts[2]) : null,
    location: parts[3] ? stripIntentWrappingQuotes(parts[3]) : null,
  };
}

function resolveStoreId(ctx) {
  return resolveIntakeStoreId(ctx);
}

function resolveDraftId(ctx) {
  return resolveIntakeDraftId(ctx);
}

/**
 * Resolve a single image reference for OCR/vision (data URL, https URL, or relative URI).
 * Matches client attachment shape: { type: 'image'|'photo', uri | url | data | dataUrl | imageDataUrl }.
 * @param {Record<string, unknown>} body
 * @returns {string | null}
 */
function resolveIntakeImageRefForOcr(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  if (typeof b.imageDataUrl === 'string' && b.imageDataUrl.trim()) return b.imageDataUrl.trim();
  if (typeof b.image === 'string' && b.image.trim()) return b.image.trim();
  const raw = b.attachments;
  if (!Array.isArray(raw)) return null;
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const type = String(a.type || '').toLowerCase();
    if (type !== 'image' && type !== 'photo' && !type.includes('image')) continue;
    const candidates = [a.data, a.dataUrl, a.uri, a.url, a.imageDataUrl].filter(
      (x) => typeof x === 'string' && x.trim().length > 0,
    );
    if (!candidates.length) continue;
    candidates.sort((u, v) => v.length - u.length);
    return candidates[0].trim();
  }
  return null;
}

function buildTelemetryBase({
  userMessage,
  missionId,
  storeId,
  startMs,
  traceId,
  classification,
  validated,
  downgraded,
  downgradeReason,
  validationErrors,
  riskLevel,
  result,
  planMeta,
}) {
  return {
    message: userMessage,
    missionId,
    storeId,
    traceId: traceId ?? null,
    executionPath: classification?.executionPath ?? null,
    tool: classification?.tool ?? null,
    confidence: classification?.confidence ?? null,
    validated,
    downgraded,
    downgradeReason,
    validationErrors,
    riskLevel,
    result,
    latencyMs: Date.now() - startMs,
    destinationTool: planMeta?.destinationTool ?? null,
    llmPlanLength: planMeta?.llmPlanLength ?? null,
    normalizedPlanLength: planMeta?.normalizedPlanLength ?? null,
    injectedTools: planMeta?.injectedTools ?? null,
    droppedTools: planMeta?.droppedTools ?? null,
  };
}

/**
 * @param {import('express').Request} req
 * @param {object} args
 */
function issueApprovalRequired({ req, safeJson, tool, cleanedParams, storeId, userMessage, locale, classification, riskLevel }) {
  const execParams = { ...cleanedParams };
  if (storeId && !execParams.storeId && !isContextFreeTool(tool)) execParams.storeId = storeId;
  const actorKey = resolveIntakeV2ActorKey(req);
  const scopeTenantKey = resolveIntakeV2TenantKey(req);
  if (!actorKey) {
    return safeJson(
      {
        success: true,
        action: 'chat',
        response: intakeMessage('signInToContinue', locale),
      },
      {
        classification: { ...classification, parameters: cleanedParams },
        validated: true,
        downgraded: true,
        downgradeReason: 'no_actor',
        validationErrors: [],
        riskLevel,
        result: 'fallback',
      },
    );
  }
  const approval = buildApprovalPayload({
    tool,
    parameters: execParams,
    context: { locale, userMessage },
  });
  putIntakeApprovalPreview({
    previewId: approval.previewId,
    tool,
    executionParameters: execParams,
    actorKey,
    tenantKey: scopeTenantKey,
    resolvedStoreIdAtPreview: storeId,
  });
  return safeJson(
    {
      success: true,
      action: 'approval_required',
      tool,
      confidence: classification.confidence,
      riskLevel,
      approval,
      response: intakeMessage('approvalReviewConfirm', locale),
      reasoning: classification._reasoning,
    },
    {
      classification: { ...classification, parameters: cleanedParams },
      validated: true,
      downgraded: false,
      validationErrors: [],
      riskLevel,
      result: 'success',
    },
  );
}

/**
 * Guest with a draft but no store id — prompt sign-in instead of "create store again".
 *
 * @param {object} args
 */
function respondGuestDraftSignInGate({
  req,
  safeJson,
  locale,
  classification,
  runway,
  riskLevel,
  validationErrors = [],
}) {
  const isGuest = Boolean(req.isGuest) || !req.user?.id;
  return safeJson(
    {
      success: true,
      action: 'chat',
      response: intakeMessage('signInToAddProducts', locale),
      _requiresStore: true,
      _requiresSignIn: true,
      suggestedActions: formatSuggestedActionsForContextGap(runway, { isGuest }),
      runwayContext: runway,
    },
    {
      classification,
      validated: false,
      downgraded: true,
      downgradeReason: 'guest_sign_in_required',
      validationErrors,
      riskLevel,
      result: 'fallback',
    },
  );
}

/**
 * Resolve persisted / client attachment ingest for create_store when the follow-up has no image body.
 * @param {{
 *   intentSourceContext?: Record<string, unknown> | null;
 *   missionId?: string | null;
 * }} input
 */
async function resolveAssetIngestContextForStoreDraft(input = {}) {
  const ctx =
    input.intentSourceContext && typeof input.intentSourceContext === 'object'
      ? input.intentSourceContext
      : null;
  if (ctx?.assetIngestResult && typeof ctx.assetIngestResult === 'object') {
    return ctx.assetIngestResult;
  }
  if (ctx?.cardExtraction) {
    const fromCard = buildAssetIngestFromCardExtraction(ctx.cardExtraction);
    if (fromCard) return fromCard;
  }
  const mid = String(input.missionId ?? '').trim();
  if (mid) {
    return loadPersistedAssetIngestFromMission(getPrismaClient(), mid);
  }
  return null;
}

function respondGuestDraftProductClarify({
  safeJson,
  locale,
  classification,
  runway,
  draftId,
  riskLevel,
}) {
  const effectiveDraftId =
    (typeof draftId === 'string' && draftId.trim()) ||
    (typeof runway?.activeDraftId === 'string' && runway.activeDraftId.trim()) ||
    '';
  const catalogParams = effectiveDraftId ? { draftId: effectiveDraftId } : {};
  return safeJson(
    {
      success: true,
      action: 'clarify',
      response: intakeMessage('guestDraftAddProductClarify', locale),
      options: [
        {
          label: intakeMessage('guestDraftAddProductCatalogOption', locale),
          tool: 'replace_store_catalog',
          parameters: catalogParams,
        },
        {
          label: intakeMessage('guestDraftAddProductSomethingElse', locale),
          tool: 'general_chat',
          parameters: {},
        },
      ],
    },
    {
      classification: {
        executionPath: 'clarify',
        tool: 'replace_store_catalog',
        confidence: classification?.confidence ?? 0.85,
        parameters: catalogParams,
      },
      validated: true,
      downgraded: false,
      downgradeReason: null,
      validationErrors: [],
      riskLevel,
      result: 'clarify_guest_add_product',
    },
  );
}

/**
 * @param {object} args
 */
function maybeRespondGuestDraftProductClarify({
  req,
  safeJson,
  locale,
  classification,
  runway,
  draftId,
  missionId,
  userMessage,
  hasAttachment,
  effectiveStoreId,
  forcedTool,
  riskLevel,
}) {
  if (forcedTool) return null;
  if (
    !shouldClarifyGuestDraftAddProduct({
      req,
      effectiveStoreId,
      draftId,
      runway,
      missionId,
      userMessage,
      hasAttachment,
      tool: classification?.tool,
    })
  ) {
    return null;
  }
  return respondGuestDraftProductClarify({
    safeJson,
    locale,
    classification,
    runway,
    draftId,
    riskLevel: riskLevel ?? RISK.SAFE_READ,
  });
}

const POST_BUILD_CHIP_HANDLERS = {
  upload_store_asset: handleUploadStoreAsset,
  replace_store_catalog: handleReplaceStoreCatalog,
  update_store_hero: handleUpdateStoreHero,
  publish_store: handlePublishStore,
  /** Classifier may still emit `improve_hero`; same handler opens the hero customizer without a prior asset. */
  improve_hero: handleUpdateStoreHero,
};

async function guardClassificationAgainstCompletedCreateStore(classification, missionId) {
  if (!classification || classification.tool !== 'create_store') return classification;
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return classification;
  const prisma = getPrismaClient();
  const row = await prisma.missionPipeline.findUnique({ where: { id: mid }, select: { status: true } });
  const blocked = blockCreateStoreOnCompletedMission(row?.status, 'create_store');
  if (!blocked) return classification;
  return {
    ...classification,
    executionPath: 'direct_action',
    tool: blocked.tool,
    confidence: blocked.confidence,
    parameters: classification.parameters ?? {},
    message:
      classification.message ||
      'Your store is already built. Use the next-step suggestions to update your hero, catalog, or publish — or tell me what you want to change.',
  };
}

/** After intake opens post-build UI, mirror chip flow: append `completed_action` for replan when mission-scoped. */
async function maybeAppendOpenUiCompletedAction(missionId, tool, cleanedParams) {
  const rid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!rid) return;
  try {
    const actionIdFromParams =
      cleanedParams &&
      typeof cleanedParams === 'object' &&
      !Array.isArray(cleanedParams) &&
      typeof cleanedParams.actionId === 'string' &&
      cleanedParams.actionId.trim()
        ? cleanedParams.actionId.trim()
        : '';
    const completedPayload = actionIdFromParams ? { tool, actionId: actionIdFromParams } : { tool };
    const appended = await appendMissionBlackboardEvent(rid, 'completed_action', completedPayload);
    if (!appended?.ok && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[IntakeV2] completed_action append not ok', appended?.error);
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[IntakeV2] completed_action append failed', e?.message || e);
    }
  }
}

function resolveIntakeUserMessageFromReq(req) {
  const text = String(
    req?.body?.text ?? req?.body?.goal ?? req?.body?.message ?? req?.body?.userMessage ?? '',
  ).trim();
  return text || null;
}

function directToolResultFromFactoryRoute(factoryRoute, payload, dispatchMissionId) {
  if (factoryRoute.checkpoint === 'store_selection') {
    const response =
      factoryRoute.response ??
      factoryRoute.error?.message ??
      'Please select a store first so I can create the promotional video for it.';
    return {
      intakeOverride: {
        success: true,
        action: 'clarify',
        clarifyType: factoryRoute.clarifyType ?? 'store_picker',
        response,
        options: factoryRoute.options ?? [],
        pendingIntent: factoryRoute.pendingIntent ?? null,
        missionId: dispatchMissionId ?? null,
        parameters: payload,
      },
      toolResult: {
        status: 'checkpoint',
        checkpoint: 'store_selection',
        blocker: {
          code: factoryRoute.error?.code ?? 'STORE_SELECTION_REQUIRED',
          message: response,
        },
      },
      payload,
    };
  }
  if (factoryRoute.blocked) {
    return {
      toolResult: {
        status: 'blocked',
        blocker: {
          code: factoryRoute.error?.code ?? 'MISSING_CONTEXT',
          message: factoryRoute.error?.message ?? 'Factory routing blocked',
        },
      },
      payload,
    };
  }
  const awaitingFactory = factoryRoute.status === 'awaiting_factory_approval';
  const ok =
    factoryRoute.ok ||
    awaitingFactory ||
    factoryRoute.status === 'running' ||
    factoryRoute.status === 'completed';
  return {
    toolResult: {
      status: ok ? 'ok' : 'failed',
      output: {
        dispatchedVia: 'factory_runtime',
        actionType: 'run_factory',
        factoryId: factoryRoute.factoryId,
        factoryExecution: factoryRoute.factoryExecution,
        generatedArtifacts: factoryRoute.generatedArtifacts ?? [],
        duplicate: Boolean(factoryRoute.duplicate),
        plan: factoryRoute.plan ?? null,
        ...(awaitingFactory ? { awaitingFactoryApproval: true } : {}),
      },
      ...(ok
        ? {}
        : {
            error: {
              code: 'FACTORY_FAILED',
              message: factoryRoute.error?.message ?? 'Factory execution failed',
            },
          }),
    },
    payload: {
      ...payload,
      missionId: factoryRoute.missionId ?? dispatchMissionId ?? payload.missionId ?? null,
      dispatchedVia: 'factory_runtime',
      actionType: 'run_factory',
      factoryId: factoryRoute.factoryId,
      factoryExecution: factoryRoute.factoryExecution,
      generatedArtifacts: factoryRoute.generatedArtifacts ?? [],
      duplicate: Boolean(factoryRoute.duplicate),
    },
  };
}

async function dispatchIntakeV2DirectTool(tool, cleanedParams, { missionId, storeId, req, hydratedContext = null }) {
  const toolName = String(tool ?? '').trim();
  if (isKernelOnlyIntakeTool(toolName)) {
    return {
      toolResult: {
        status: 'blocked',
        blocker: {
          code: 'KERNEL_EXECUTION_REQUIRED',
          message: getKernelOnlyIntakeToolMessage(toolName),
        },
      },
      payload: { ...cleanedParams, missionId: missionId ?? null },
    };
  }

  if (isKernelMandatoryEnabled()) {
    const intakeLocale = String(req.body?.locale ?? 'en').trim().toLowerCase().split('-')[0] || 'en';
    const dispatchMissionId =
      (typeof missionId === 'string' && missionId.trim()) ||
      (typeof cleanedParams?.missionId === 'string' && cleanedParams.missionId.trim()) ||
      null;
    const intakeUserMessage = resolveIntakeUserMessageFromReq(req);
    try {
      const { tryRouteCreativeFactoryIntent } = await import('../lib/factoryRuntime/factoryIntentRouter.js');
      const factoryRoute = await tryRouteCreativeFactoryIntent({
        intentLabel: toolName,
        userMessage: intakeUserMessage,
        missionId: dispatchMissionId,
        userId: req.user?.id ?? performerIntakeV2ActorId(req) ?? null,
        storeId: storeId ?? null,
        tenantId: getTenantId(req.user),
        context: {
          ...(hydratedContext && typeof hydratedContext === 'object' ? hydratedContext : {}),
          locale: intakeLocale,
          toolInput: cleanedParams,
        },
      });
      if (factoryRoute) {
        const factoryResult = await unifiedDispatch(
          {
            type: 'run_factory',
            payload: {
              factoryId: factoryRoute.factoryId,
              intent: intakeUserMessage,
              missionId: factoryRoute.missionId ?? dispatchMissionId,
              userId: req.user?.id ?? performerIntakeV2ActorId(req) ?? null,
              storeId: storeId ?? null,
              tenantId: getTenantId(req.user),
              context: {
                ...(hydratedContext && typeof hydratedContext === 'object' ? hydratedContext : {}),
                locale: intakeLocale,
                toolInput: cleanedParams,
              },
              resumeState: factoryRoute.resumeState ?? null,
            },
          },
          { source: 'intake_v2_unified', requireConfirmation: false, confirmed: true },
        );
        if (factoryResult?.ok) {
          return directToolResultFromFactoryRoute(
            {
              ...factoryRoute,
              missionId: factoryResult.missionId ?? factoryRoute.missionId ?? dispatchMissionId,
            },
            { ...cleanedParams, missionId: factoryResult.missionId ?? dispatchMissionId },
            factoryResult.missionId ?? dispatchMissionId,
          );
        }
      }
    } catch (factoryRouteErr) {
      console.warn(
        '[IntakeV2] factory kernel route failed (falling through):',
        factoryRouteErr?.message ?? factoryRouteErr,
      );
    }

    return dispatchIntakeToolViaUnifiedKernel(toolName, cleanedParams, {
      missionId: dispatchMissionId,
      storeId: storeId ?? undefined,
      userId: req.user?.id ?? performerIntakeV2ActorId(req) ?? null,
      tenantId: getTenantId(req.user),
      locale: intakeLocale,
      source: 'intake_v2_unified',
      confirmed: true,
      context: {
        ...(hydratedContext && typeof hydratedContext === 'object' ? { hydratedContext } : {}),
        locale: intakeLocale,
        missionId: dispatchMissionId,
        runtimeOwned: true,
        performerRuntimeOwned: true,
        source: 'intake_v2_unified',
      },
    });
  }

  console.warn(
    '[KERNEL_BYPASS DETECTED] tool=%s is executing outside the unified kernel. This path should be migrated.',
    tool,
  );

  const dispatchMissionId =
    (typeof missionId === 'string' && missionId.trim()) ||
    (typeof cleanedParams?.missionId === 'string' && cleanedParams.missionId.trim()) ||
    null;

  if (!dispatchMissionId) {
    console.error('[MISSION] Missing missionId at direct tool dispatch', { tool });
  }

  const payload = { ...cleanedParams };
  if (dispatchMissionId) payload.missionId = dispatchMissionId;
  if (storeId && !payload.storeId) payload.storeId = storeId;
  const intakeImageRef = resolveIntakeImageRefForOcr(req?.body);
  if (intakeImageRef && !payload.imageUrl && !payload.imageDataUrl) {
    payload.imageUrl = intakeImageRef;
    payload.imageDataUrl = intakeImageRef;
  }
  const intakeLocale = String(req.body?.locale ?? 'en').trim().toLowerCase().split('-')[0] || 'en';
  const toolCtx = {
    missionId: dispatchMissionId,
    activeMissionId: dispatchMissionId,
    userId: req.user?.id ?? performerIntakeV2ActorId(req) ?? null,
    createdBy: req.user?.id ?? null,
    tenantId: getTenantId(req.user),
    storeId: storeId ?? undefined,
    locale: intakeLocale,
    missionType: resolveMissionType(req, null),
    source: 'intake_v2',
  };

  const intentLabel = typeof tool === 'string' ? tool.trim() : '';
  const intakeUserMessage = resolveIntakeUserMessageFromReq(req);

  // Runtime-owned factory path — before Stage D direct-action broker guard.
  try {
    const { tryRouteCreativeFactoryIntent } = await import('../lib/factoryRuntime/factoryIntentRouter.js');
    const factoryRoute = await tryRouteCreativeFactoryIntent({
      intentLabel,
      userMessage: intakeUserMessage,
      missionId: dispatchMissionId,
      userId: toolCtx.userId,
      storeId: storeId ?? toolCtx.storeId ?? null,
      tenantId: getTenantId(req.user),
      context: {
        ...(hydratedContext && typeof hydratedContext === 'object' ? hydratedContext : {}),
        locale: intakeLocale,
        toolInput: payload,
      },
    });
    if (factoryRoute) {
      const resolvedMissionId = factoryRoute.missionId ?? dispatchMissionId;
      if (resolvedMissionId) {
        payload.missionId = resolvedMissionId;
        toolCtx.missionId = resolvedMissionId;
        toolCtx.activeMissionId = resolvedMissionId;
      }
      return directToolResultFromFactoryRoute(factoryRoute, payload, resolvedMissionId ?? dispatchMissionId);
    }
  } catch (factoryRouteErr) {
    console.warn(
      '[IntakeV2] factory intent route failed (falling through):',
      factoryRouteErr?.message ?? factoryRouteErr,
    );
  }

  const { guardBrokerDirectAction } = await import('../lib/broker/brokerRunwayGuard.js');
  const directGuard = guardBrokerDirectAction();
  if (directGuard.blocked) {
    return {
      toolResult: {
        status: 'blocked',
        blocker: {
          code: directGuard.code,
          message: directGuard.message,
        },
      },
      payload: { ...cleanedParams, missionId: missionId ?? null },
    };
  }

  // DANH: skill-runtime-phase4
  // Cooperative gate: the runtime only intercepts when the legacy keyword router
  // has NO matching skill — preventing the Phase 3 no-op regression where a
  // matching intent bypassed real legacy execution and ran a no-op planning skill.
  //
  // IMPORTANT — why findByTrigger() and not skillRouter.route():
  //   skillRouter.route() is async AND has side effects (on a match it calls
  //   skillExecutor.execute, i.e. it *runs* the skill). Calling it here just to
  //   probe for a match would (a) execute prematurely with the wrong ctx and
  //   (b) double-execute once the real route(intentLabel, fullCtx) call below
  //   runs. route() decides `matched` solely from skillRegistry.findByTrigger()
  //   (see SkillRouter.route), so this lookup is the exact, side-effect-free
  //   equivalent of the legacy match decision. The single legacy route() call
  //   below remains the only execution point (no double-call).

  const legacyWouldMatch = Boolean(skillRegistry.findByTrigger(intentLabel));
  if (!legacyWouldMatch && isRuntimeCapabilityEnabled('runtimeSkillRuntime')) {
    const runtimeResult = await dispatchWithRuntime(
      {
        intentLabel,
        userMessage: intakeUserMessage,
        storeId: storeId ?? toolCtx.storeId ?? null,
        userId: toolCtx.userId,
        sessionId: null,
      },
      getPrismaClient(),
    );
    // DANH: skill-runtime-phase8
    if (runtimeResult) {
      const checkpoint = runtimeResult.result;

      const stepResults =
        checkpoint?.stepResults instanceof Map
          ? Object.fromEntries(checkpoint.stepResults)
          : checkpoint?.stepResults ?? {};

      const lastStepOutput = Object.values(stepResults).at(-1);
      const summaryMessage =
        lastStepOutput?.output?.message ??
        lastStepOutput?.output?.summary ??
        lastStepOutput?.output?.topAction ??
        (runtimeResult.state === 'completed'
          ? 'Your store analytics are ready.'
          : `Skill ended in state: ${runtimeResult.state}`);

      const ok = runtimeResult.state === 'completed';

      return {
        toolResult: {
          status: ok ? 'ok' : 'failed',
          output: {
            dispatchedVia: 'skill_runtime',
            skillId: runtimeResult.skillId,
            state: runtimeResult.state,
            stepResults,
            message: summaryMessage,
          },
          ...(ok
            ? {}
            : {
                error: {
                  code: 'SKILL_RUNTIME_FAILED',
                  message: `Skill ended in state: ${runtimeResult.state}`,
                },
              }),
        },
        payload: {
          missionId: dispatchMissionId ?? null,
          dispatchedVia: 'skill_runtime',
          skillId: runtimeResult.skillId,
          state: runtimeResult.state,
          result: runtimeResult.result,
          stepResults,
        },
      };
    }
  }

  try {
    // DANH: fix-runtime-ownership
    const skillCtx = {
      ...toolCtx,
      missionId: dispatchMissionId,
      storeId: storeId ?? toolCtx.storeId ?? null,
      userId: toolCtx.userId,
      intentLabel,
      toolInput: payload,
      hydratedContext,
      blackboard: null,
      runtimeOwned: true,
      performerRuntimeOwned: true,
      source: 'skill_executor',
    };
    const skillRouterResult = await skillRouter.route(intentLabel, skillCtx);

    if (skillRouterResult.matched) {
      console.log(
        `[SkillRouter] skill "${skillRouterResult.skillName}" executed via ${skillRouterResult.executionId ?? 'n/a'}`,
      );

      if (skillRouterResult.result?.reason === 'MISSING_CONTEXT') {
        return {
          toolResult: {
            status: 'blocked',
            blocker: {
              code: 'MISSING_CONTEXT',
              message: `Skill requires: ${(skillRouterResult.result.missing ?? []).join(', ')}`,
            },
          },
          payload,
        };
      }

      const execution = skillRouterResult.result;
      const awaitingPlan = execution?.status === 'awaiting_plan_approval';
      const ok = execution?.status === 'completed' || awaitingPlan;
      return {
        toolResult: {
          status: ok ? 'ok' : 'failed',
          output: {
            skillExecution: execution,
            dispatchedVia: 'skill',
            skillName: skillRouterResult.skillName,
            executionId: skillRouterResult.executionId,
            ...(awaitingPlan && execution?.planArtifact
              ? { planArtifact: execution.planArtifact, awaitingPlanApproval: true }
              : {}),
          },
          ...(ok
            ? {}
            : {
                error: {
                  code: 'SKILL_FAILED',
                  message: execution?.failedReason ?? 'Skill execution failed',
                },
              }),
        },
        payload,
      };
    }
  } catch (skillRouteErr) {
    console.warn('[SkillRouter] route failed (falling through to tool):', skillRouteErr?.message ?? skillRouteErr);
  }

  const { performerRuntime } = await import('../lib/runtime/performerRuntime/performerRuntime.js');
  const { recordRuntimeAuthorityPathUsed } = await import(
    '../lib/runtime/performerRuntime/runtimeAuthorityGuard.js'
  );

  recordRuntimeAuthorityPathUsed({
    route: 'performer_intake_v2',
    toolName: tool,
    userId: toolCtx.userId,
    missionId: dispatchMissionId,
    source: 'intake_v2',
  });

  const runtimeResult = await performerRuntime.execute({
    actionType: 'dispatch_tool',
    missionId: dispatchMissionId,
    userId: req.user?.id ?? toolCtx.userId ?? null,
    tenantId: getTenantId(req.user),
    storeId: storeId ?? undefined,
    source: 'intake_v2',
    payload: {
      toolName: tool,
      input: payload,
      context: { ...toolCtx, source: 'intake_v2' },
    },
  });

  const toolResult = {
    status: runtimeResult.status,
    ...(runtimeResult.output !== undefined && { output: runtimeResult.output }),
    ...(runtimeResult.error !== undefined && { error: runtimeResult.error }),
    ...(runtimeResult.blocker !== undefined && { blocker: runtimeResult.blocker }),
  };
  return { toolResult, payload };
}

function buildDirectToolIntakeResponse(tool, toolResult, payload, locale, extras = {}) {
  const artifact = normalizeArtifact(toolResult?.output?.artifact);
  const ok = deriveIntakeSuccessFromToolResult(toolResult);
  const response = resolveIntakeMessageFromToolResult(toolResult, locale);

  return {
    body: {
      success: ok,
      action: ok ? 'tool_call' : 'chat',
      tool,
      missionId: payload.missionId ?? null,
      parameters: payload,
      reasoning: extras.reasoning,
      response,
      result: artifact ? { ...toolResult?.output, artifact } : toolResult?.output ?? null,
      artifacts: artifact ? [artifact] : toolResult?.output?.artifacts ?? [],
      riskLevel: extras.riskLevel,
    },
    telemetryResult: ok ? 'success' : 'error',
  };
}

function buildDirectToolDispatchResponse(tool, dispatchResult, locale, extras = {}) {
  if (dispatchResult?.intakeOverride) {
    return {
      body: dispatchResult.intakeOverride,
      telemetryResult:
        dispatchResult.intakeOverride.action === 'clarify' ? 'clarify_store' : 'error',
    };
  }
  return buildDirectToolIntakeResponse(tool, dispatchResult.toolResult, dispatchResult.payload, locale, extras);
}

/**
 * Capability resolution for direct tools (promo video → slideshow/poster fallback offer).
 * Does not auto-execute fallbacks.
 *
 * @returns {object | null} intake body when execution should stop before dispatch
 */
function buildCapabilityResolvedDirectToolBody(tool, cleanedParams, ctx) {
  if (tool !== 'video_generate_multimodal') return null;

  const {
    userMessage,
    locale,
    missionId,
    storeId,
    currentContext,
    classification,
    riskLevel,
  } = ctx;

  const resolved = resolveRequestedCapability(userMessage, [tool], currentContext);
  const capability = resolved === 'unknown' ? 'promo_video' : resolved;

  const payload = { ...cleanedParams };
  if (missionId) payload.missionId = missionId;
  if (storeId && !payload.storeId) payload.storeId = storeId;

  const plan = resolveCapabilityExecutionPlan({
    capability,
    requestedTool: tool,
    userMessage,
    locale,
    context: currentContext,
    persistedIntent: ctx.persistedIntent ?? null,
  });

  if (plan.selectedStrategy === 'primary') return null;

  const action =
    plan.selectedStrategy === 'missing_context' ? 'clarify' : 'capability_fallback';

  return {
    success: intakeSuccessFromCapabilityPlan(plan),
    action,
    tool,
    missionId: payload.missionId ?? null,
    parameters: payload,
    reasoning: classification?._reasoning,
    response: plan.userMessage,
    capabilityPlan: plan,
    options: plan.fallbackOptions,
    riskLevel,
  };
}

/** Deploy smoke / health — must return JSON (not SPA HTML). */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    version: 'v2',
    env: process.env.NODE_ENV || 'development',
  });
});

router.post('/', requireUserOrGuest, async (req, res) => {
  try {
  const startMs = Date.now();
  const cardbeyTraceId = getOrCreateCardbeyTraceId(req);
  res.setHeader(CARDBEY_TRACE_HEADER, cardbeyTraceId);

  const payloadGuard = applyIntakePayloadGuard(req.body ?? {});
  if (payloadGuard.rejected) {
    return res.status(413).json({
      success: false,
      action: 'payload_too_large',
      message: 'Request payload is too large. Please retry with a smaller submission.',
      maxBytes: payloadGuard.maxBytes,
      payloadBytes: payloadGuard.rawSize,
      largestKeys: payloadGuard.largestKeys,
    });
  }
  req.body = payloadGuard.body;
  const body = req.body;
  const freshStoreMission = payloadGuard.freshStoreMission;

  const intakeDiag = isIntakeDiagEnabled();
  diagLog(intakeDiag, '===== INTAKE V2 REQUEST =====');
  diagLog(intakeDiag, 'traceId:', cardbeyTraceId);
  diagLog(intakeDiag, 'Body:', {
    text: String(body.userMessage ?? body.text ?? body.goal ?? body.message ?? '').slice(0, 100),
    mode: body.mode ?? req.headers?.['x-performer-mode'] ?? null,
    source: body.source ?? body.intentSource ?? null,
    intent: body.intent ?? null,
    _autoSubmit: body._autoSubmit ?? null,
    freshStoreMission: body.freshStoreMission ?? freshStoreMission ?? null,
    storeCreationDraft: body.storeCreationDraft ?? null,
    storeCreateForm: body.storeCreateForm ?? null,
  });
  diagLog(intakeDiag, 'freshStoreMission (payload guard):', freshStoreMission);
  diagLog(intakeDiag, 'LOG_KERNEL_DISPATCH_DIAGNOSTICS:', process.env.LOG_KERNEL_DISPATCH_DIAGNOSTICS);
  diagLog(intakeDiag, 'BYPASS_KERNEL_FOR_CREATE_STORE:', process.env.BYPASS_KERNEL_FOR_CREATE_STORE);

  // Accept both legacy keys (text/goal/message) and the newer client contract key (userMessage).
  const userMessage = String(body.userMessage ?? body.text ?? body.goal ?? body.message ?? '').trim();
  const locale = resolveIntakeLocale(body.locale ?? req.headers?.['x-locale'], userMessage);

  if (freshStoreMission) {
    diagLog(intakeDiag, '→ handleFreshStoreCreationDraftSubmit (fast path)');
    const fastHandled = await handleFreshStoreCreationDraftSubmit(req, res, {
      body,
      locale,
      cardbeyTraceId,
      resolveActorId: performerIntakeV2ActorId,
      resolveUserLike: performerIntakeV2UserLike,
    });
    diagLog(intakeDiag, 'handleFreshStoreCreationDraftSubmit returned:', fastHandled);
    if (fastHandled) return;
  }

  // (debug) removed after guard verified working
  let currentContext =
    freshStoreMission || !body.currentContext || typeof body.currentContext !== 'object'
      ? {}
      : body.currentContext;

  const earlySelectionStoreId = resolveStoreIdFromIntakeSelection(body.intakeV2Selection);
  if (earlySelectionStoreId) {
    currentContext = {
      ...currentContext,
      activeStoreId: currentContext.activeStoreId ?? earlySelectionStoreId,
      storeId: currentContext.storeId ?? earlySelectionStoreId,
    };
  }

  let contextEngineUserContext = null;
  let missionId = freshStoreMission ? null : resolveIntakeMissionId({ body, currentContext });
  let history = freshStoreMission
    ? []
    : Array.isArray(body.history)
      ? body.history.slice(-getIntakeConversationHistoryLimit())
      : [];
  const storeIdForConversation = freshStoreMission
    ? null
    : String(currentContext.storeId ?? currentContext.activeStoreId ?? body.storeId ?? '').trim() || null;
  const conversationSessionIdHint =
    String(req.headers?.['x-session-id'] ?? body.sessionId ?? body.conversationSessionId ?? '').trim() ||
    null;

  let intakeAssetSessionKey = resolveIntakeAssetSessionKey({
    conversationSessionId: conversationSessionIdHint,
    sessionId: conversationSessionIdHint,
    userId: String(req.user?.id ?? body?.userId ?? '').trim() || null,
    guestSessionId: req.guestSessionId ?? null,
  });

  /** @type {Record<string, unknown> | null} */
  let intakeMemoryBundle = null;
  /** @type {ReturnType<typeof extractMemoryLoadStatus> | null} */
  let memoryLoadStatus = null;

  let conversationState = { session: null, context: null, history: [] };
  if (!freshStoreMission && userMessage && req.user?.id) {
    conversationState = await bootstrapConversationForIntake({
      userId: req.user.id,
      storeId: storeIdForConversation,
      sessionId: conversationSessionIdHint,
      userMessage,
      missionId,
      clientHistory: history,
    });
    if (conversationState.history?.length) {
      history = conversationState.history;
    }
    const sessionStoreId =
      conversationState.session?.storeId && String(conversationState.session.storeId).trim()
        ? String(conversationState.session.storeId).trim()
        : null;
    if (sessionStoreId && !resolveIntakeStoreId(currentContext)) {
      currentContext = {
        ...currentContext,
        activeStoreId: sessionStoreId,
        storeId: sessionStoreId,
      };
    }
    intakeAssetSessionKey = resolveIntakeAssetSessionKey({
      conversationSessionId: conversationState.session?.id ?? conversationSessionIdHint,
      sessionId: conversationState.session?.id ?? conversationSessionIdHint,
      userId: String(req.user?.id ?? body?.userId ?? '').trim() || null,
      guestSessionId: req.guestSessionId ?? null,
    });
  }

  if (!freshStoreMission && isContextEngineEnabled()) {
    try {
      const sessionIdForContext =
        conversationState.session?.id ?? resolveContextSessionId(req, body);
      const contextBootstrap = await bootstrapIntakeContext({
        req,
        body: sessionIdForContext ? { ...body, sessionId: sessionIdForContext } : body,
        conversationSession: conversationState.session,
      });
      if (contextBootstrap) {
        contextEngineUserContext = contextBootstrap.userContext;
        currentContext = contextBootstrap.currentContext;
      }
    } catch (contextBootstrapErr) {
      console.warn(
        '[context] bootstrapIntakeContext failed (non-blocking):',
        contextBootstrapErr?.message ?? contextBootstrapErr,
      );
    }
  }

  if (!freshStoreMission) {
    currentContext = attachIntakeMemoryFields(currentContext);
    missionId = resolveIntakeMissionId({ body, currentContext }) || missionId;
    try {
      intakeMemoryBundle = await loadIntakeMemoryBundle({
        req,
        body: { ...body, currentContext },
        sessionId: intakeAssetSessionKey,
      });
      memoryLoadStatus = extractMemoryLoadStatus(intakeMemoryBundle);
      if (intakeMemoryBundle && typeof intakeMemoryBundle === 'object') {
        const prior =
          currentContext.unifiedMemory && typeof currentContext.unifiedMemory === 'object'
            ? currentContext.unifiedMemory
            : {};
        const suitcaseItems = Array.isArray(intakeMemoryBundle.suitcase) ? intakeMemoryBundle.suitcase : [];
        const highlights = suitcaseItems
          .map((h) => (typeof h?.title === 'string' ? h.title.trim() : ''))
          .filter(Boolean)
          .slice(0, 5);
        currentContext = {
          ...currentContext,
          unifiedMemory: {
            ...prior,
            ...(intakeMemoryBundle.activeSummary
              ? { activeSummary: String(intakeMemoryBundle.activeSummary) }
              : intakeMemoryBundle.store?.summary
                ? { activeSummary: String(intakeMemoryBundle.store.summary) }
                : {}),
            ...(highlights.length ? { keyFacts: highlights } : {}),
            ...(Array.isArray(intakeMemoryBundle.session?.learnedSignals) &&
            intakeMemoryBundle.session.learnedSignals.length
              ? { learnedSignals: intakeMemoryBundle.session.learnedSignals.slice(0, 8) }
              : {}),
            ...(memoryLoadStatus?.partial ? { partial: true } : {}),
          },
        };
        currentContext = hydrateContextFromMemoryBundle(currentContext, intakeMemoryBundle);
      }
    } catch (memoryErr) {
      memoryLoadStatus = extractMemoryLoadStatus(null);
      memoryLoadStatus.error = memoryErr?.message ?? String(memoryErr);
      console.warn('[intake] memory bundle load failed (non-blocking):', memoryErr?.message ?? memoryErr);
    }
  }

  const serviceRequestThreadBlob = collectUserTextsForServiceDraft(history, userMessage).join('\n');
  let intentSourceContext =
    body.intentSourceContext && typeof body.intentSourceContext === 'object'
      ? body.intentSourceContext
      : null;

  intentSourceContext = hydrateIntentSourceFromWorkflow(
    intentSourceContext,
    body.currentContext?.workflowContext,
    intakeAssetSessionKey,
  );
  if (intentSourceContext) {
    body.intentSourceContext = intentSourceContext;
  }

  /** Phase 1: unified belief shadow (read-only; no classification change). */
  let intakeBeliefShadow = null;
  if (!freshStoreMission) {
    intakeBeliefShadow = await runIntakeBeliefShadow({
      req,
      sessionId: conversationSessionIdHint ?? intakeAssetSessionKey,
      sessionKey: intakeAssetSessionKey,
      currentContext,
      intentSourceContext,
      contextEngineUserContext,
      intakeMemoryBundle,
      body,
    });
    if (isDev && intakeBeliefShadow?.summary) {
      diagLog(isIntakeDiagEnabled(), '[intake/belief] shadow', intakeBeliefShadow.summary);
    }
  }

  // Follow-up create-store turns may carry the upload only in handoff context — hydrate body for OCR.
  if (!resolveIntakeImageRefForOcr(body)) {
    const pendingUploadImage = String(
      intentSourceContext?.pendingImageDataUrl ??
        intentSourceContext?.imageDataUrl ??
        '',
    ).trim();
    if (pendingUploadImage.length > 50) {
      body.imageDataUrl = pendingUploadImage;
      if (!Array.isArray(body.attachments) || body.attachments.length === 0) {
        body.attachments = [{ type: 'image', dataUrl: pendingUploadImage, uri: pendingUploadImage }];
      }
    }
  }

  // Multi-agent / campaign orchestration — unified dispatch (no escape hatch)
  if (body.missionType === 'multi_agent') {
    const actorId = performerIntakeV2ActorId(req);
    const result = await unifiedDispatch(
      {
        type: 'multi_agent',
        payload: {
          body,
          currentContext,
          userMessage,
          locale,
          cardbeyTraceId,
          actorId,
          user: req.user,
          goal:
            typeof body.metadataJson?.goal === 'string' && body.metadataJson.goal.trim()
              ? body.metadataJson.goal.trim()
              : userMessage,
          metadata: body.metadataJson,
        },
      },
      { requireConfirmation: false, source: 'agent_orchestration' },
    );
    return res.json(mapUnifiedDispatchToIntakeResponse(result));
  }

  // ── Maintenance pre-check (super_admin only) ─────────────────────────────
  // This runs before the main classifier/planner so operators can type "check for errors" naturally.
  const existingMission = missionId ? await getMissionById(missionId).catch(() => null) : null;
  const context = await buildContext(req, existingMission);
  context.lastKnownError =
    currentContext?.lastKnownError && typeof currentContext.lastKnownError === 'object'
      ? currentContext.lastKnownError
      : null;
  if (conversationState.context) {
    context.conversationHistory = conversationState.context.conversationHistory ?? [];
    context.pendingActions = conversationState.context.pendingActions ?? [];
    context.conversationSessionId = conversationState.session?.id ?? null;
  }

  // Preserve super_admin role from verified headers
  const expectedMaintenanceSecret = String(process.env.PERFORMER_MAINTENANCE_SECRET ?? '').trim();
  const providedMaintenanceToken = String(req.get('x-maintenance-token') ?? '').trim();
  const providedRole = String(req.get('x-performer-role') ?? '').trim();

  // (debug) removed after guard verified working
  if (
    expectedMaintenanceSecret.length > 0 &&
    providedMaintenanceToken.length === expectedMaintenanceSecret.length &&
    crypto.timingSafeEqual(
      Buffer.from(providedMaintenanceToken),
      Buffer.from(expectedMaintenanceSecret),
    ) &&
    providedRole === 'super_admin'
  ) {
    context.userRole = 'super_admin';
    context.operatorSession = true;
  }

  console.log('[intake/v2 guard result]', {
    expectedLength: (process.env.PERFORMER_MAINTENANCE_SECRET ?? '').length,
    providedLength: (req.get('x-maintenance-token') ?? '').length,
    role: req.get('x-performer-role'),
    operatorSession: context?.operatorSession,
    userRole: context?.userRole,
  });

  const actorIdForMemory = performerIntakeV2ActorId(req);
  let hydratedContext = null;
  if (!freshStoreMission) {
    try {
      hydratedContext = await hydrateContext({
        message: userMessage,
        userId: actorIdForMemory || context.userId,
        missionId: context.missionId,
        activeStoreId: context.storeId,
        sessionContext: currentContext,
      });
      Object.assign(context, hydratedContextToPlannerContext(hydratedContext, context));
    } catch (hydrateErr) {
      console.error('[intake/v2] hydrateContext failed (non-fatal):', hydrateErr?.message ?? hydrateErr);
    }
  }

  const maintenanceDecision = await reactPlanner({
    userMessage,
    classification: null,
    context,
    hydratedContext,
    toolRegistry: [],
  });

  if (maintenanceDecision?.kind === 'self_patch') {
    // Ensure executionGateway sees MAINTENANCE context even when using standard POST / handler.
    context.missionType = 'MAINTENANCE';
    context.operatorSession = true;

    const gatewayResult = await executionGateway({
      decision: maintenanceDecision,
      context,
      dispatchTool: maintenanceDispatchTool,
    });
    const response = mapPlannerDecisionToIntakeResponse(gatewayResult, context);
    return res.json(response);
  }

  if (maintenanceDecision?.kind === 'execute' && maintenanceDecision?.toolName === 'multi_agent_orchestration') {
    const actorId = performerIntakeV2ActorId(req);
    const goal = String(maintenanceDecision.parameters?.goal ?? userMessage).trim();
    const result = await unifiedDispatch(
      {
        type: 'multi_agent',
        payload: {
          body,
          currentContext,
          userMessage,
          locale,
          cardbeyTraceId,
          actorId,
          user: req.user,
          goal,
          context: maintenanceDecision.parameters?.context ?? '',
          metadata: body.metadataJson,
        },
      },
      { requireConfirmation: false, source: 'agent_orchestration' },
    );
    return res.json(mapUnifiedDispatchToIntakeResponse(result));
  }

  const isServiceRequestProviderSelect =
    intentSourceContext &&
    typeof intentSourceContext === 'object' &&
    String(intentSourceContext.artifactKind ?? '').trim() === 'capability_bridge:service_request' &&
    String(intentSourceContext.bridgeActionId ?? '').trim().startsWith('select_provider:');

  // ── Image Pre-Processing (runs before everything else) ──
  let imageContext = null;
  let uploadAttachmentGuardCtx = buildUploadAttachmentGuardCtx({
    attachments: body.attachments,
    imageDataUrl:
      resolveIntakeImageRefForOcr(body) ??
      (typeof intentSourceContext?.pendingImageDataUrl === 'string'
        ? intentSourceContext.pendingImageDataUrl
        : body.imageDataUrl),
    intentSourceContext,
    sessionId: intakeAssetSessionKey,
  });
  let attachmentOnlyUpload = isUploadOnlyAskTurn(userMessage, uploadAttachmentGuardCtx);
  const hasAnyImageEarly =
    hasIntakeImageAttachment(body) ||
    (typeof body?.imageDataUrl === 'string' && body.imageDataUrl.length > 50);

  if (hasAnyImageEarly) {
    const imageRef = resolveIntakeImageRefForOcr(body);
    if (imageRef) {
      try {
        const attachmentOnlyOcr =
          shouldRouteToAssetIntentDetection(userMessage, {
            attachments: body.attachments,
            imageDataUrl: body.imageDataUrl,
          }) && !detectExplicitStoreIntent(userMessage);
        console.log('[IntakeV2] Pre-processing image with OCR...');
        const ocrResult = await ocrExtractText({
          imageDataUrl: imageRef,
          context: { purpose: attachmentOnlyOcr ? 'business_card' : 'intake_attachment' },
        });
        console.log('[IntakeV2] OCR raw result:', {
          textLength: (ocrResult.text ?? '').length,
          textPreview: (ocrResult.text ?? '').slice(0, 150),
          provider: ocrResult.provider,
        });
        const extractedText = (ocrResult.text ?? '').trim();
        // Any non-empty OCR text feeds the classifier (was >10 chars, which dropped short cards/labels).
        if (extractedText.length > 0) {
          imageContext = {
            extractedText,
            provider: ocrResult.provider,
            hasText: true,
          };
          console.log('[IntakeV2] Image pre-processed:', {
            textLength: extractedText.length,
            provider: ocrResult.provider,
          });
        } else {
          imageContext = {
            extractedText: '',
            hasText: false,
          };
        }
      } catch (err) {
        console.error('[IntakeV2] Image pre-processing failed:', err?.message ?? err);
      }
    }

    if (imageContext?.hasText && missionId) {
      const imageRefForPersist = resolveIntakeImageRefForOcr(body);
      void persistAttachmentOcrToMission(getPrismaClient(), missionId, {
        rawOcrText: imageContext.extractedText,
        ocrHints: buildOcrHintsFromImageText(imageContext.extractedText),
        imageDataUrl: imageRefForPersist,
        sessionId: intakeAssetSessionKey,
      }).catch(() => {});
    } else if (imageContext?.hasText && intakeAssetSessionKey) {
      const attachmentOnlyForStash = isUploadOnlyAskTurn(
        userMessage,
        buildUploadAttachmentGuardCtx({
          attachments: body.attachments,
          imageDataUrl: resolveIntakeImageRefForOcr(body) ?? body.imageDataUrl,
          intentSourceContext,
          sessionId: intakeAssetSessionKey,
        }),
      );
      const stashArtifact = stashVisionExtractionForSession({
        rawOcrText: imageContext.extractedText,
        imageDataUrl: resolveIntakeImageRefForOcr(body),
        sessionId: intakeAssetSessionKey,
        documentType: attachmentOnlyForStash ? 'business_card' : 'unknown',
      });
      if (stashArtifact) {
        persistUploadedAssetWorkflow(intakeAssetSessionKey, stashArtifact);
        uploadAttachmentGuardCtx = buildCurrentUploadAttachmentGuardCtx();
        attachmentOnlyUpload = isUploadOnlyAskTurn(userMessage, uploadAttachmentGuardCtx);
      }
    }
  }

  // When an image has extractable text and user explicitly asked to create a store,
  // attempt to parse as a business card and spin up the smart store pipeline.
  // Attachment-only uploads must NOT auto-start store creation.
  const enrichedUserMessage = imageContext?.hasText
    ? `${userMessage}\n\n[Attached image content: ${imageContext.extractedText.slice(0, 800)}]`
    : userMessage;

  /** When an image is present but OCR is empty/unusable, nudge classifier + agent loop toward analyze_content / description. */
  let classifierHintForWeakImage = '';
  if (hasAnyImageEarly && !imageContext?.hasText) {
    classifierHintForWeakImage = intakeMessage('weakImageClassifierHint', locale);
  }

  const enrichedUserMessageWithHint = `${enrichedUserMessage}${classifierHintForWeakImage}`;
  /** May gain agent-loop tool observations before classifyIntent. */
  let classifierInputMessage = enrichedUserMessageWithHint;

  const resolveUploadGuardImageRef = () =>
    resolveIntakeImageRefForOcr(body) ??
    (typeof intentSourceContext?.pendingImageDataUrl === 'string'
      ? intentSourceContext.pendingImageDataUrl
      : body.imageDataUrl);

  const buildCurrentUploadAttachmentGuardCtx = () =>
    buildUploadAttachmentGuardCtx({
      attachments: body.attachments,
      imageDataUrl: resolveUploadGuardImageRef(),
      intentSourceContext,
      sessionId: intakeAssetSessionKey,
    });

  uploadAttachmentGuardCtx = buildCurrentUploadAttachmentGuardCtx();
  attachmentOnlyUpload = isUploadOnlyAskTurn(userMessage, uploadAttachmentGuardCtx);

  const pendingIntentFromBodyEarly =
    body.pendingIntent && typeof body.pendingIntent === 'object' && !Array.isArray(body.pendingIntent)
      ? body.pendingIntent
      : null;

  let selection =
    body.intakeV2Selection && typeof body.intakeV2Selection === 'object' ? body.intakeV2Selection : null;
  if (!selection && pendingIntentFromBodyEarly && req.user?.id) {
    const replayedSelection = await tryReplayPendingStoreSelection({
      userMessage,
      pendingIntent: pendingIntentFromBodyEarly,
      userId: req.user.id,
    });
    if (replayedSelection) {
      selection = replayedSelection;
      body.intakeV2Selection = replayedSelection;
    }
  }

  const isSelectionConfirm = Boolean(selection);
  const forcedTool = selection ? String(selection.selectedTool ?? '').trim() : '';
  const forcedParams =
    selection?.selectedParameters && typeof selection.selectedParameters === 'object' && !Array.isArray(selection.selectedParameters)
      ? selection.selectedParameters
      : {};
  const originalGoal = selection ? String(selection.originalGoal ?? userMessage).trim() : '';

  const blackboardContextRaw = body.blackboardContext;
  const blackboardContext =
    blackboardContextRaw && typeof blackboardContextRaw === 'object' && !Array.isArray(blackboardContextRaw)
      ? blackboardContextRaw
      : null;
  const pendingIntentFromBody = pendingIntentFromBodyEarly;
  const pendingSkillContextEarly = readPendingSkillContext({
    currentContext,
    blackboardContext,
    pendingIntent: pendingIntentFromBody,
  });
  const mergedForcedParams = mergePendingDocumentIntoForcedParams(forcedParams, pendingSkillContextEarly);

  let storeId = resolveStoreId(currentContext);
  // DANH: store-disambiguation — replay store pick from clarify chip (intakeV2Selection)
  const selectionStoreId = String(mergedForcedParams?.storeId ?? mergedForcedParams?.activeStoreId ?? '').trim();
  if (!storeId && selectionStoreId) {
    storeId = selectionStoreId;
    currentContext = {
      ...currentContext,
      activeStoreId: selectionStoreId,
      storeId: selectionStoreId,
    };
  }
  const draftId = resolveDraftId(currentContext);
  const tenantKey = String(req.user?.id ?? req.guest?.id ?? 'intake-v2').slice(0, 120);
  const performeeContext =
    intentSourceContext &&
    typeof intentSourceContext === 'object' &&
    intentSourceContext.performeeContext &&
    typeof intentSourceContext.performeeContext === 'object'
      ? intentSourceContext.performeeContext
      : null;
  const performeeStoreId =
    performeeContext && String(performeeContext.spaceType ?? '').trim() === 'business' && String(performeeContext.spaceId ?? '').trim()
      ? String(performeeContext.spaceId).trim()
      : null;
  const runway = await buildRunwayContext({
    missionId: missionId ?? undefined,
    storeId: storeId ?? undefined,
    draftId: draftId ?? undefined,
    userId: String(req.user?.id ?? body?.userId ?? '').trim(),
    locale: locale ?? undefined,
    currentContext,
  });
  const resolvedEditTarget = userMessage ? resolveEditableTarget(runway, userMessage) : null;
  if (resolvedEditTarget) {
    runway.resolvedEditTarget = resolvedEditTarget;
  }

  /** Read-only derived store context: allow Performee spaceId to act as storeId for classification/runtime without writing any client context. */
  let effectiveStoreId = storeId || runway.activeStoreId || performeeStoreId;
  /** Store id used for validation + dispatch (may auto-resolve single-store owners). */
  let dispatchStoreId = effectiveStoreId;
  const intakeActorUserIdEarly = req.user?.id ?? performerIntakeV2ActorId(req) ?? null;

  if (dispatchStoreId && intakeActorUserIdEarly) {
    const clientStoreId = resolveIntakeStoreId(body.currentContext);
    const shouldValidatePersistedStore = !clientStoreId && !selectionStoreId;
    if (shouldValidatePersistedStore) {
      const storeStillValid = await validateUserStoreId(intakeActorUserIdEarly, dispatchStoreId);
      if (!storeStillValid) {
        dispatchStoreId = null;
        storeId = null;
        effectiveStoreId = runway.activeStoreId || performeeStoreId || null;
        currentContext = {
          ...currentContext,
          activeStoreId: null,
          storeId: null,
        };
      }
    }
  }

  if (dispatchStoreId) {
    void persistConversationSessionStoreId({
      sessionId: conversationState.session?.id ?? conversationSessionIdHint,
      storeId: dispatchStoreId,
    });
    if (isContextEngineEnabled()) {
      const contextUserId = resolveContextUserId(req);
      const contextSessionId =
        conversationState.session?.id ?? resolveContextSessionId(req, body);
      if (contextUserId && contextSessionId) {
        void getContextProvider()
          .updateContext(contextUserId, contextSessionId, { activeStoreId: dispatchStoreId })
          .catch((err) => {
            console.warn('[context] early activeStoreId persist failed (non-fatal):', err?.message ?? err);
          });
      }
    }
  }

  /** Appended to Intake V2 JSON when pre-intake agent loop ran. */
  let agentLoopTraceForResponse = null;

  const intakeActorKey = resolveIntakeV2ActorKey(req);
  const intakeTenantKeyForPersistence = resolveIntakeV2TenantKey(req);
  const loadedPersistedIntent =
    intakeActorKey != null
      ? getPersistedIntentResolution({
          actorKey: intakeActorKey,
          tenantKey: intakeTenantKeyForPersistence,
          missionId,
          storeId,
          draftId,
        })
      : null;

  /** Hoisted for safeJson telemetry (must not TDZ before classifier runs). */
  let classification = {
    executionPath: 'clarify',
    tool: 'general_chat',
    confidence: 0,
    parameters: {},
  };

  /** Phase C.2 — dynamic plan bundle for intake responses + blackboard. */
  let dynamicPlanBundle = null;

  const performerMode = resolvePerformerMode(req, body);
  let performerModeMeta = createModeResponseMeta(performerMode);
  let skipReasoningPipeline = false;
  let decisionLoopSkipPlanners = false;
  let intakeShortcutContext = null;

  let heroGenTelemetry = {
    heroAutoGenerateTriggered: false,
    heroGenerationReady: false,
    heroGeneratedPrompt: null,
    heroAutoGenerateSource: null,
  };

  const heroStoreContext = {
    storeId,
    draftId,
    storeLabel:
      (typeof currentContext.storeName === 'string' && currentContext.storeName.trim()) ||
      (typeof currentContext.activeStoreName === 'string' && currentContext.activeStoreName.trim()) ||
      null,
  };

  const safeJson = async (payload, telExtra = {}) => {
    const cls =
      telExtra.classification !== undefined && telExtra.classification !== null
        ? telExtra.classification
        : classification;
    const ir = resolveIntent({
      userMessage,
      classification: cls && typeof cls === 'object' ? cls : classification,
      storeId,
      draftId,
      conversationHistory: history,
      persistedIntentResolution: loadedPersistedIntent,
    });
    maybePersistIntakeIntentResolution(req, {
      missionId,
      storeId,
      draftId,
      ir,
      result: telExtra.result ?? null,
      executionPath:
        cls && typeof cls === 'object' && cls.executionPath != null
          ? cls.executionPath
          : classification.executionPath ?? null,
    });
    const sessionId =
      (typeof req.body?.sessionId === 'string' && req.body.sessionId.trim()) ||
      (req.guestSessionId ? `guest_${req.guestSessionId}` : null);
    const dispatchLogId = await emitIntakeV2Telemetry({
      ...buildTelemetryBase({ userMessage, missionId, storeId, startMs, traceId: cardbeyTraceId, ...telExtra }),
      ...intentResolutionTelemetryFields(ir),
      ...heroGenTelemetry,
      capabilityGapDetected: telExtra.capabilityGapDetected,
      requestedCapability: telExtra.requestedCapability,
      proposalSpawned: telExtra.proposalSpawned,
      proposalType: telExtra.proposalType,
      resolvedFamily: telExtra.resolvedFamily,
      resolvedSubtype: telExtra.resolvedSubtype,
      capabilityAwareV1: telExtra.capabilityAwareV1 ?? null,
      userId: req.user?.id ?? performerIntakeV2ActorId(req) ?? null,
      sessionId,
      query: userMessage,
      intent:
        ir?.family && ir?.subtype
          ? `${ir.family}:${ir.subtype}`
          : cls?.tool ?? classification?.tool ?? 'unknown',
      outcome: telExtra.result ?? null,
    });
    let responsePayload = payload;
    const responseMetadata = {};
    try {
      const clsForCap =
        telExtra.classification !== undefined && telExtra.classification !== null
          ? telExtra.classification
          : classification;
      const resolvedIntentType = String(clsForCap?.tool ?? '').trim();
      if (resolvedIntentType) {
        const requirements = extractRequirements(resolvedIntentType, { text: req.body.text });
        const resolutions = resolveCapabilityGaps(requirements);
        const gapSummary = summarizeGaps(resolutions);
        const role = deriveRole(resolvedIntentType);
        const phase = derivePhase(null, requirements.length > 0, !gapSummary.allReady);
        const premiumPolicy = getDefaultPremiumPolicy(role);
        const choices = selectStrategy(
          resolutions,
          requirements,
          role,
          phase,
          premiumPolicy,
        );
        const strategySummary = summarizeStrategy(choices);
        const acquisitionMap = buildAcquisitionMap(choices);
        responseMetadata.capabilityContext = {
          role,
          phase,
          requirementCount: requirements.length,
          allReady: gapSummary.allReady,
          criticalMissing: gapSummary.criticalMissing,
          fetchable: gapSummary.fetchable,
          optional: gapSummary.optional,
          canProceed: strategySummary.canProceed,
          blockedCount: strategySummary.blockedCount,
          premiumSuggested: strategySummary.premiumSuggested,
          childAgentRecommended: strategySummary.childAgentRecommended,
          userInputRequired: strategySummary.userInputRequired,
          blockedRequirements: strategySummary.blockedRequirements,
          premiumPolicy,
          acquisitionMap,
        };
      }
    } catch (capErr) {
      console.warn('[capabilityAware] enrichment failed (non-blocking):', capErr?.message ?? capErr);
    }
    if (String(process.env.CAPABILITY_AWARE_V1 || '').trim().toLowerCase() === 'true') {
      try {
        const clsForCap =
          telExtra.classification !== undefined && telExtra.classification !== null
            ? telExtra.classification
            : classification;
        const summary = buildCapabilityAssessmentSummary({
          userMessage,
          tool: clsForCap?.tool ?? null,
          executionPath: clsForCap?.executionPath ?? null,
          intentFamily: ir?.family ?? null,
          intentSubtype: ir?.subtype ?? null,
          hasStoreId: Boolean(storeId),
          hasDraftId: Boolean(draftId),
          hasImageAttachment: Boolean(hasAnyImageEarly),
          isGuest: Boolean(req.isGuest),
        });
        telExtra.capabilityAwareV1 = { schemaVersion: summary.schemaVersion, role: summary.role, phase: summary.phase };
        responsePayload =
          payload && typeof payload === 'object' && !Array.isArray(payload)
            ? { ...payload, capabilityAssessmentSummary: summary }
            : payload;
      } catch (capErr) {
        if (isDev) console.warn('[CapabilityAware] buildCapabilityAssessmentSummary failed:', capErr?.message ?? capErr);
      }
    }
    if (
      responsePayload &&
      typeof responsePayload === 'object' &&
      !Array.isArray(responsePayload) &&
      responseMetadata.capabilityContext
    ) {
      responsePayload = {
        ...responsePayload,
        capabilityContext: responseMetadata.capabilityContext,
      };
    }
    if (
      agentLoopTraceForResponse &&
      Array.isArray(agentLoopTraceForResponse) &&
      agentLoopTraceForResponse.length > 0 &&
      responsePayload &&
      typeof responsePayload === 'object' &&
      !Array.isArray(responsePayload) &&
      responsePayload.agentTrace == null
    ) {
      responsePayload = { ...responsePayload, agentTrace: agentLoopTraceForResponse };
    }
    const reasoningResult = cls?._reasoningResult ?? classification?._reasoningResult ?? null;
    const reasoningMeta = cls?._reasoning ?? classification?._reasoning ?? null;
    const learningSessionId =
      conversationState.session?.id ??
      (typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : null);
    if (
      learningSessionId &&
      responsePayload &&
      typeof responsePayload === 'object' &&
      !Array.isArray(responsePayload) &&
      (reasoningResult || (reasoningMeta && typeof reasoningMeta === 'object'))
    ) {
      const intent =
        (typeof reasoningResult?.intent === 'string' && reasoningResult.intent) ||
        (typeof reasoningMeta?.intent === 'string' && reasoningMeta.intent) ||
        (typeof cls?.tool === 'string' && cls.tool) ||
        'unknown';
      const confidence =
        typeof reasoningResult?.confidence === 'number'
          ? reasoningResult.confidence
          : typeof reasoningMeta?.confidence === 'number'
            ? reasoningMeta.confidence
            : typeof cls?.confidence === 'number'
              ? cls.confidence
              : 0;
      responsePayload = {
        ...responsePayload,
        reasoningFeedback: {
          sessionId: learningSessionId,
          intent,
          confidence,
          action: typeof reasoningResult?.action === 'string' ? reasoningResult.action : undefined,
        },
      };
    }
    if (
      dispatchLogId &&
      responsePayload &&
      typeof responsePayload === 'object' &&
      !Array.isArray(responsePayload)
    ) {
      const matchedSkill =
        cls && typeof cls === 'object' && cls.tool != null ? String(cls.tool) : null;
      const classificationIntent =
        ir?.family && ir?.subtype
          ? `${ir.family}:${ir.subtype}`
          : matchedSkill ?? null;
      responsePayload = {
        ...responsePayload,
        dispatchLogId,
        classificationIntent,
        matchedSkill,
      };
    }
    if (
      dynamicPlanBundle?.serialized &&
      responsePayload &&
      typeof responsePayload === 'object' &&
      !Array.isArray(responsePayload) &&
      responsePayload.action !== 'create_store' &&
      responsePayload.action !== 'store_mission_started' &&
      responsePayload.action !== 'campaign_mission_started'
    ) {
      responsePayload = {
        ...responsePayload,
        dynamicPlan: dynamicPlanBundle.serialized,
      };
    }
    if (
      performerModeMeta &&
      responsePayload &&
      typeof responsePayload === 'object' &&
      !Array.isArray(responsePayload) &&
      responsePayload.performerMode == null
    ) {
      responsePayload = {
        ...responsePayload,
        performerMode: {
          ...performerModeMeta,
          reasoningUsed: skipReasoningPipeline ? false : performerModeMeta.reasoningUsed,
        },
      };
    }
    if (
      memoryLoadStatus &&
      responsePayload &&
      typeof responsePayload === 'object' &&
      !Array.isArray(responsePayload)
    ) {
      responsePayload = {
        ...responsePayload,
        memoryLoadStatus,
      };
    }
    if (
      dispatchStoreId &&
      responsePayload &&
      typeof responsePayload === 'object' &&
      !Array.isArray(responsePayload)
    ) {
      responsePayload = {
        ...responsePayload,
        activeStoreId: dispatchStoreId,
        ...(intakeMemoryBundle?._context?.store
          ? { activeStore: intakeMemoryBundle._context.store }
          : {}),
      };
    }
    if (conversationState.session?.id) {
      res.setHeader('X-Session-ID', conversationState.session.id);
      responsePayload = await finalizeConversationIntakeResponse({
        session: conversationState.session,
        context: conversationState.context,
        payload: responsePayload,
        missionId,
      });
    }
    if (
      intakeAssetSessionKey &&
      responsePayload &&
      typeof responsePayload === 'object' &&
      !Array.isArray(responsePayload)
    ) {
      const workflowPatch = workflowPatchFromIntakePayload(responsePayload);
      if (workflowPatch) {
        const artifact = workflowPatch.uploadedAsset?.documentExtraction;
        if (artifact) {
          persistUploadedAssetWorkflow(intakeAssetSessionKey, artifact);
        } else {
          stashIntakeWorkflowContext(intakeAssetSessionKey, workflowPatch);
        }
        responsePayload = {
          ...responsePayload,
          workflowContext: workflowPatch,
        };
      }
    }
    if (isContextEngineEnabled()) {
      const contextUserId = resolveContextUserId(req);
      const contextSessionId =
        conversationState.session?.id ?? resolveContextSessionId(req, body);
      if (contextUserId && contextSessionId) {
        void finalizeIntakeContext({
          userId: contextUserId,
          sessionId: contextSessionId,
          body,
          classification: cls && typeof cls === 'object' ? cls : classification,
          result:
            telExtra.result && typeof telExtra.result === 'object' && !Array.isArray(telExtra.result)
              ? telExtra.result
              : null,
          durationMs: Date.now() - startMs,
        }).catch((contextFinalizeErr) => {
          console.warn(
            '[context] finalizeIntakeContext failed (non-blocking):',
            contextFinalizeErr?.message ?? contextFinalizeErr,
          );
        });
      }
    }
    return res.json(responsePayload);
  };

  // Phase C.3 — execute a persisted dynamic plan via runtime orchestrator (explicit client flag).
  if (body.executeDynamicPlan === true && missionId && req.user?.id) {
    const plannerIntegration = getPlannerIntegration();
    if (plannerIntegration.isEnabled(req) && plannerIntegration.isExecutionEnabled(req)) {
      try {
        const stepNumberRaw = body.stepNumber != null ? Math.floor(Number(body.stepNumber)) : 1;
        const stepNumber = Number.isFinite(stepNumberRaw) && stepNumberRaw >= 1 ? stepNumberRaw : 1;
        const planParameters =
          body.planParameters && typeof body.planParameters === 'object' && !Array.isArray(body.planParameters)
            ? body.planParameters
            : body.parameters && typeof body.parameters === 'object' && !Array.isArray(body.parameters)
              ? body.parameters
              : {};
        const runMode =
          body.runMode === 'all' || body.runMode === 'until_blocked' ? body.runMode : 'next';

        const execution = await plannerIntegration.executeDynamicPlanForIntake({
          missionId,
          user: performerIntakeV2UserLike(req) ?? req.user,
          dynamicPlan: body.dynamicPlan,
          planParameters,
          stepNumber,
          runMode,
          traceId: cardbeyTraceId,
          req,
        });

        if (execution) {
          return safeJson(
            {
              success: execution.ok !== false,
              action: 'plan_execution',
              missionId,
              planId: execution.planId ?? null,
              stepNumber: execution.stepNumber ?? stepNumber,
              orchestrationStatus: execution.orchestration?.orchestrationStatus ?? null,
              code: execution.orchestration?.code ?? execution.code ?? null,
              message: execution.orchestration?.message ?? execution.message ?? null,
              completedStepNumbers: execution.orchestration?.completedStepNumbers ?? [],
              blocked: execution.orchestration?.blocked === true,
              stepResult: execution.orchestration?.stepResult ?? null,
              allStepsComplete: execution.orchestration?.allStepsComplete === true,
            },
            {
              validated: true,
              riskLevel: RISK.STATE_CHANGE,
              result: execution.ok !== false ? 'success' : 'error',
            },
          );
        }
      } catch (executeErr) {
        if (isDev) console.warn('[Phase C.3] executeDynamicPlan failed:', executeErr?.message);
        return safeJson(
          {
            success: false,
            action: 'plan_execution',
            missionId,
            response: 'Plan execution failed. Try again or run the step from the mission panel.',
            error: executeErr?.message ?? 'execution_failed',
          },
          { validated: true, riskLevel: RISK.STATE_CHANGE, result: 'error' },
        );
      }
    }
  }

  /** Silent replan: refresh next-step chips from deterministic facts + policy (optional LLM labels). */
  if (userMessage === '__replan__' && body.silent === true && missionId) {
    try {
      const userLike = performerIntakeV2UserLike(req);
      if (!userLike?.id) {
        return res.status(401).json({ ok: false, nextSteps: [] });
      }
      const access = await resolveAccessibleMission(userLike, missionId);
      if (!access.ok) {
        return res.status(403).json({ ok: false, nextSteps: [] });
      }
      const prisma = getPrismaClient();
      const pipeline = await prisma.missionPipeline.findUnique({
        where: { id: missionId },
        select: { type: true, outputsJson: true, metadataJson: true },
      });
      if (!pipeline) {
        return res.json({ ok: false, nextSteps: [] });
      }
      const outputsJson =
        pipeline.outputsJson && typeof pipeline.outputsJson === 'object' && !Array.isArray(pipeline.outputsJson)
          ? pipeline.outputsJson
          : {};
      const metadataJson =
        pipeline.metadataJson && typeof pipeline.metadataJson === 'object' && !Array.isArray(pipeline.metadataJson)
          ? pipeline.metadataJson
          : {};
      const nextSteps = await planNextSteps({
        missionId,
        outputsJson,
        metadataJson,
      });
      return res.json({ ok: true, nextSteps });
    } catch (e) {
      console.warn('[replan] failed:', e?.message || e);
      return res.json({ ok: false, nextSteps: [] });
    }
  }

  if (selection && !forcedTool) {
    return safeJson(
      {
        success: true,
        action: 'clarify',
        response: intakeMessage('missingToolSelection', locale),
        options: [],
      },
      {
        classification: null,
        validated: false,
        downgraded: true,
        downgradeReason: 'incomplete_selection',
        validationErrors: [],
        riskLevel: null,
        result: 'clarify',
      },
    );
  }

  if (selection && forcedTool && !isRegisteredTool(forcedTool)) {
    return safeJson(
      {
        success: true,
        action: 'clarify',
        response: intakeMessage('invalidToolSelection', locale),
        options: [],
      },
      {
        classification: { tool: forcedTool, executionPath: 'clarify', confidence: 0 },
        validated: false,
        downgraded: true,
        downgradeReason: 'invalid_selection_tool',
        validationErrors: [],
        riskLevel: null,
        result: 'clarify',
      },
    );
  }

  if (!userMessage && !forcedTool) {
    return safeJson(
      {
        success: true,
        action: 'chat',
        response: intakeMessage('whatWouldYouLikeToDo', locale),
      },
      {
        classification: null,
        validated: null,
        downgraded: false,
        downgradeReason: null,
        validationErrors: [],
        riskLevel: null,
        result: 'fallback',
      },
    );
  }

  let storeCreateFormPayload =
    body.storeCreateForm && typeof body.storeCreateForm === 'object' && !Array.isArray(body.storeCreateForm)
      ? body.storeCreateForm
      : undefined;

  const draftConfirmationSubmit = isStoreCreationDraftConfirmationSubmit(body);
  const draftFormEnvelope = resolveStoreCreateFormFromDraftSubmitBody(body.storeCreationDraft, {
    intentMode:
      typeof body.parameters === 'object' && body.parameters && !Array.isArray(body.parameters)
        ? String(body.parameters.intentMode ?? '')
        : undefined,
  });
  if (draftFormEnvelope) {
    storeCreateFormPayload = { ...(storeCreateFormPayload ?? {}), ...draftFormEnvelope };
    if (!body.storeCreateForm) {
      body.storeCreateForm = storeCreateFormPayload;
    }
  }

  if (storeCreateFormPayload) {
    const unknownFormFields = findUnknownStoreCreateFormFields(storeCreateFormPayload);
    if (unknownFormFields.length > 0) {
      return res.status(400).json(
        formatValidationErrorResponse(
          unknownFormFields.map((field) => ({
            field: `storeCreateForm.${field}`,
            message: `Unknown store field: ${field}`,
            code: 'UNKNOWN_STORE_FIELD',
          })),
        ),
      );
    }
  }

  if (draftConfirmationSubmit || body._autoSubmit === true) {
    const intakeSource = body.source ?? body.intentSource ?? body.intentSourceContext?.source;
    const sourceError = validateCreateStoreIntakeSource(intakeSource);
    if (sourceError) {
      return res.status(400).json(formatValidationErrorResponse([sourceError]));
    }
  }

  if ((draftConfirmationSubmit || body._autoSubmit === true) && storeCreateFormPayload) {
    const formValidationErrors = validateCreateStorePayload({
      storeCreateForm: storeCreateFormPayload,
      storeName: storeCreateFormPayload.storeName,
      location: storeCreateFormPayload.location,
      category:
        storeCreateFormPayload.category ??
        storeCreateFormPayload.storeType ??
        storeCreateFormPayload.businessType,
    });
    if (formValidationErrors.length > 0) {
      return res.status(400).json(formatValidationErrorResponse(formValidationErrors));
    }
  }

  if (!forcedTool && performerMode === 'manual') {
    const manualResolved = await resolveManualIntakeRequest({
      req,
      body,
      storeId: effectiveStoreId ?? storeId ?? null,
      draftId: draftId ?? null,
      userId: performerIntakeV2ActorId(req) ?? req.user?.id ?? null,
      isGuest: !req.user?.id && Boolean(req.guestId || req.guest?.id),
    });
    if (manualResolved.meta) performerModeMeta = manualResolved.meta;
    if (manualResolved.handled && manualResolved.blocked) {
      return safeJson(
        {
          success: false,
          action: 'error',
          response: manualResolved.authority?.reason ?? 'Action not authorized',
          performerMode: performerModeMeta,
        },
        {
          classification,
          result: 'mode_authority_denied',
          riskLevel: RISK.STATE_CHANGE,
        },
      );
    }
    if (manualResolved.handled && manualResolved.classification) {
      classification = manualResolved.classification;
      skipReasoningPipeline = Boolean(manualResolved.skipReasoning);
    }
  }

  // ── Decision loop authority (sole classifier) ─────────────────────────────
  if (!forcedTool && !skipReasoningPipeline) {
    const authorityTurn = await runIntakeAuthorityTurn({
      forcedTool,
      freshStoreMission,
      draftConfirmationSubmit,
      storeCreateFormPayload,
      performerMode,
      attachmentOnlyUpload,
      hasAttachment: hasAnyImageEarly || hasIntakeImageAttachment(body),
      imageDataUrl: resolveIntakeImageRefForOcr(body),
      extractedText: imageContext?.extractedText ?? null,
      belief: intakeBeliefShadow?.belief ?? null,
      beliefLoaderOpts: {
        req,
        sessionId: conversationSessionIdHint ?? intakeAssetSessionKey,
        sessionKey: intakeAssetSessionKey,
        currentContext,
        intentSourceContext: {
          ...(intentSourceContext && typeof intentSourceContext === 'object' ? intentSourceContext : {}),
          ...(attachmentOnlyUpload ? { uploadedAssetPending: true } : {}),
        },
        contextEngineUserContext,
        intakeMemoryBundle,
        body,
      },
      advisorInput: {
        userMessage,
        originalUserMessage: userMessage,
        attachments: body.attachments,
        imageDataUrl: resolveIntakeImageRefForOcr(body),
        hasAttachment: hasAnyImageEarly || hasIntakeImageAttachment(body),
        intentSourceContext,
        shortcutContext: intakeShortcutContext,
        storeCreateForm: storeCreateFormPayload,
        forceIntent: body.forceIntent ?? intentSourceContext?.forceIntent ?? null,
        currentFlow: intentSourceContext?.currentFlow ?? null,
        source: body.intentSource ?? intentSourceContext?.source ?? null,
      },
    });

    if (authorityTurn.handled && authorityTurn.httpPayload) {
      return safeJson(authorityTurn.httpPayload, authorityTurn.telExtra ?? {});
    }
    if (authorityTurn.classification) {
      classification = authorityTurn.classification;
      skipReasoningPipeline = true;
      decisionLoopSkipPlanners = Boolean(authorityTurn.skipPlanners);
    }
  }

  // ── 1) System shortcuts ────────────────────────────────────────────────────
  if (!forcedTool && !skipReasoningPipeline) {
    if (isDeviceIntentPreClassifyAllowed()) {
      const deviceIntent = detectDeviceIntent(userMessage);
      if (deviceIntent) {
        const deviceEntry = getToolEntry(deviceIntent.tool);
        return issueApprovalRequired({
          req,
          safeJson,
          tool: deviceIntent.tool,
          cleanedParams: deviceIntent.params,
          storeId: effectiveStoreId,
          userMessage,
          locale,
          classification: {
            executionPath: deviceIntent.executionPath,
            tool: deviceIntent.tool,
            confidence: deviceIntent.confidence,
            parameters: deviceIntent.params,
          },
          riskLevel: deviceEntry?.riskLevel ?? RISK.STATE_CHANGE,
        });
      }
    }

    intakeShortcutContext = resolveIntakeShortcutContext({
      userMessage,
      storeCreateForm: storeCreateFormPayload,
      primaryMode: body.primaryMode,
      primaryModeHint: body.primaryModeHint,
      intentSource: body.intentSource,
      forceIntent: body.forceIntent ?? body.intentSourceContext?.forceIntent,
      currentFlow: body.intentSourceContext?.currentFlow,
      auth: { userId: req.user?.id ?? null, isGuest: !req.user },
    });

    if (intakeShortcutContext?.type === 'clarify_create_runway') {
      const clarifyMsg =
        intakeShortcutContext.message || intakeMessage('clarifyCreateRunway', locale);
      return safeJson(
        {
          success: true,
          action: 'clarify',
          response: clarifyMsg,
          options: [
            {
              label: intakeMessage('optionOnlineStoreCatalog', locale),
              tool: 'create_store',
              parameters: { intentMode: 'store' },
            },
            {
              label: intakeMessage('optionMiniWebsite', locale),
              tool: 'create_store',
              parameters: { intentMode: 'website' },
            },
          ],
        },
        {
          classification: { executionPath: 'clarify', tool: 'create_store', confidence: 0 },
          validated: true,
          downgraded: false,
          validationErrors: [],
          riskLevel: RISK.SAFE_READ,
          result: 'clarify',
        },
      );
    }

    if (intakeShortcutContext?.type === 'create_store') {
      const midForGuard = typeof missionId === 'string' ? missionId.trim() : '';
      if (midForGuard) {
        const prismaGuard = getPrismaClient();
        const missionRow = await prismaGuard.missionPipeline.findUnique({
          where: { id: midForGuard },
          select: { status: true },
        });
        if (blockCreateStoreOnCompletedMission(missionRow?.status, 'create_store')) {
          intakeShortcutContext = null;
        }
      }
    }

    if (areIntakeShortcutsAllowed()) {
    // ── SmartDocument intent (CC-4) — AUTO_RUN, requires auth ──────────────
    const { sdType, sdSubtype } = detectSmartDocumentIntent(userMessage);
    if (sdType) {
      if (!req.user?.id) {
        return safeJson(
          {
            success: true,
            action: 'chat',
            response: intakeMessage('signInSmartDocument', locale),
          },
          {
            classification: { executionPath: 'direct_action', tool: 'create_smart_document', confidence: 1 },
            validated: true,
            downgraded: false,
            validationErrors: [],
            riskLevel: RISK.SAFE_READ,
            result: 'auth_required',
          },
        );
      }

      const prisma = getPrismaClient();
      const tenantId = getTenantId(req.user);
      const { createMissionPipeline } = await import('../lib/missionPipelineService.js');

      // Resolve active store context
      const sid = resolveStoreId(currentContext);
      const activeStore = sid
        ? await prisma.business
            .findFirst({
              where: { id: sid, userId: req.user.id },
              select: { id: true, name: true, type: true, primaryColor: true, avatarImageUrl: true },
            })
            .catch(() => null)
        : null;

      const businessName =
        (activeStore?.name && String(activeStore.name).trim()) ||
        (typeof currentContext.storeName === 'string' && currentContext.storeName.trim()) ||
        'My Business';
      const businessType =
        (activeStore?.type && String(activeStore.type).trim()) ||
        (typeof currentContext.storeType === 'string' && currentContext.storeType.trim()) ||
        'General';

      // Extract contextual fields from message
      const eventDate = extractEventDate(userMessage);
      const eventVenue = extractEventVenue(userMessage);
      const stampThreshold = extractStampThreshold(userMessage);
      const offer = extractOffer(userMessage);

      const pipeline = await createMissionPipeline({
        type: 'create_smart_document',
        title: `Create ${sdSubtype ?? sdType} for ${businessName.slice(0, 80)}`,
        targetType: sid ? 'store' : 'generic',
        targetId: sid || undefined,
        targetLabel: sid ? businessName : undefined,
        metadata: {
          intentType: 'create_smart_document',
          docType: sdType,
          docSubtype: sdSubtype,
          storeId: sid ?? null,
          source: 'intake_v2_shortcut',
        },
        requiresConfirmation: false,
        executionMode: 'AUTO_RUN',
        tenantId,
        createdBy: req.user.id,
      });

      const emitContextUpdate = createEmitContextUpdate(pipeline.id, 'smart_document', {
        prisma,
        mergeMissionContext,
      });

      const result = await buildSmartDocument(
        pipeline.id,
        {
          type: sdType,
          subtype: sdSubtype,
          businessName,
          businessType,
          colorPrimary: activeStore?.primaryColor ?? null,
          logoUrl: activeStore?.avatarImageUrl ?? null,
          eventDate,
          eventVenue,
          stampThreshold,
          offer,
        },
        { emitContextUpdate, userId: req.user.id, tenantId },
      );

      const {
        completeMissionWhenNoSteps,
        failMissionWhenInlineRunFailed,
      } = await import('../lib/missionPipelineService.js');

      if (result?.error || result?.failedStep) {
        await failMissionWhenInlineRunFailed(pipeline.id, result.error ?? 'smart_document_failed');
        await appendMissionBlackboardEvent(pipeline.id, 'mission_failed', {
          tool: 'build_smart_document',
          error: result.error ?? 'smart_document_failed',
          failedStep: result.failedStep ?? 5,
        }).catch(() => {});
        return safeJson(
          {
            success: false,
            action: 'smart_document_failed',
            missionId: pipeline.id,
            error: result.error ?? 'smart_document_failed',
            failedStep: result.failedStep ?? 5,
            response: intakeMessage('smartDocumentStarted', locale, {
              docType: String(sdSubtype ?? sdType ?? 'document'),
            }),
          },
          {
            classification: { executionPath: 'direct_action', tool: 'create_smart_document', confidence: 1, parameters: { docType: sdType, docSubtype: sdSubtype } },
            validated: true,
            downgraded: false,
            validationErrors: [],
            riskLevel: RISK.STATE_CHANGE,
            result: 'failed',
          },
        );
      }

      await completeMissionWhenNoSteps(pipeline.id);

      return safeJson(
        {
          success: true,
          action: 'smart_document_started',
          missionId: pipeline.id,
          documentId: result?.documentId ?? null,
          intentMode: sdType,
          subtype: sdSubtype,
          liveUrl: result?.liveUrl ?? null,
          response: intakeMessage('smartDocumentStarted', locale, {
            docType: String(sdSubtype ?? sdType ?? 'document'),
          }),
        },
        {
          classification: { executionPath: 'direct_action', tool: 'create_smart_document', confidence: 1, parameters: { docType: sdType, docSubtype: sdSubtype } },
          validated: true,
          downgraded: false,
          validationErrors: [],
          riskLevel: RISK.STATE_CHANGE,
          result: 'success',
        },
      );
    }

    // Card System Phase A: create_card shortcut (AUTO_RUN) — requires auth
    if (CREATE_CARD_RE.test(userMessage) && !looksWebsiteCreateIntent(userMessage) && !looksStoreCreateIntent(userMessage)) {
      if (!req.user?.id) {
        return safeJson(
          {
            success: true,
            action: 'chat',
            response: intakeMessage('signInCreateCard', locale),
          },
          {
            classification: { executionPath: 'direct_action', tool: 'create_card', confidence: 1 },
            validated: true,
            downgraded: false,
            validationErrors: [],
            riskLevel: RISK.SAFE_READ,
            result: 'auth_required',
          },
        );
      }

      const prisma = getPrismaClient();
      const tenantId = getTenantId(req.user);
      const { createMissionPipeline } = await import('../lib/missionPipelineService.js');

      const resolvedType = resolveCardTypeFromMessage(userMessage);
      const sid = resolveStoreId(currentContext);
      const activeStore = sid
        ? await prisma.business
            .findFirst({
              where: { id: sid, userId: req.user.id },
              select: {
                id: true,
                name: true,
                type: true,
                primaryColor: true,
                secondaryColor: true,
                avatarImageUrl: true,
              },
            })
            .catch(() => null)
        : null;

      const businessName =
        (activeStore?.name && String(activeStore.name).trim()) ||
        (typeof currentContext.storeName === 'string' && currentContext.storeName.trim()) ||
        (typeof currentContext.activeStoreName === 'string' && currentContext.activeStoreName.trim()) ||
        'My Business';
      const businessType =
        (activeStore?.type && String(activeStore.type).trim()) ||
        (typeof currentContext.storeType === 'string' && currentContext.storeType.trim()) ||
        'General';

      const pipeline = await createMissionPipeline({
        type: 'create_card',
        title: `Create card: ${resolvedType} — ${String(businessName).slice(0, 80)}`,
        targetType: sid ? 'store' : 'generic',
        targetId: sid || undefined,
        targetLabel: sid ? businessName : undefined,
        metadata: {
          intentType: 'create_card',
          cardType: resolvedType,
          storeId: sid ?? null,
          source: 'intake_v2_shortcut',
        },
        requiresConfirmation: false,
        executionMode: 'AUTO_RUN',
        tenantId,
        createdBy: req.user.id,
      });

      const emitContextUpdate = createEmitContextUpdate(pipeline.id, 'cards', {
        prisma,
        mergeMissionContext,
      });

      const preferUserProfile =
        /from\s+my\s+profile|from\s+your\s+profile|from\s+profile\b|profile\s+details/i.test(userMessage);

      const result = await buildCard(
        pipeline.id,
        {
          type: resolvedType,
          businessName,
          businessType,
          colorPrimary: activeStore?.primaryColor ?? undefined,
          colorSecondary: activeStore?.secondaryColor ?? undefined,
          logoUrl: activeStore?.avatarImageUrl ?? undefined,
        },
        { emitContextUpdate, userId: req.user.id, tenantId, preferUserProfile },
      );

      const {
        completeMissionWhenNoSteps,
        failMissionWhenInlineRunFailed,
      } = await import('../lib/missionPipelineService.js');

      if (result?.error || !result?.cardId) {
        const errMsg = result?.error ?? 'card_create_failed';
        await failMissionWhenInlineRunFailed(pipeline.id, errMsg);
        await appendMissionBlackboardEvent(pipeline.id, 'mission_failed', {
          tool: 'build_card',
          error: errMsg,
          failedStep: result?.failedStep ?? 6,
        }).catch(() => {});
        return safeJson(
          {
            success: false,
            action: 'card_mission_failed',
            missionId: pipeline.id,
            error: errMsg,
            failedStep: result?.failedStep ?? 6,
            response: intakeMessage('cardMissionStarted', locale),
          },
          {
            classification: { executionPath: 'direct_action', tool: 'create_card', confidence: 1, parameters: { type: resolvedType } },
            validated: true,
            downgraded: false,
            validationErrors: [],
            riskLevel: RISK.STATE_CHANGE,
            result: 'failed',
          },
        );
      }

      await completeMissionWhenNoSteps(pipeline.id);

      return safeJson(
        {
          success: true,
          action: 'card_mission_started',
          missionId: pipeline.id,
          cardId: result?.cardId ?? null,
          intentMode: 'card',
          response: intakeMessage('cardMissionStarted', locale),
        },
        {
          classification: { executionPath: 'direct_action', tool: 'create_card', confidence: 1, parameters: { type: resolvedType } },
          validated: true,
          downgraded: false,
          validationErrors: [],
          riskLevel: RISK.STATE_CHANGE,
          result: 'success',
        },
      );
    }

    const posterElements = Array.isArray(body.posterElements)
      ? body.posterElements
      : Array.isArray(currentContext?.posterElements)
        ? currentContext.posterElements
        : null;

    const posterEditIntent = detectPosterEditIntent(userMessage, Boolean(posterElements?.length));
    if (posterEditIntent && !forcedTool) {
      try {
        const { toolResult, payload } = await dispatchIntakeV2DirectTool(
          posterEditIntent.tool,
          {
            ...posterEditIntent.params,
            currentElements: posterElements,
            posterId:
              typeof body.posterId === 'string'
                ? body.posterId
                : typeof currentContext?.posterId === 'string'
                  ? currentContext.posterId
                  : null,
          },
          { missionId, storeId: effectiveStoreId, req },
        );

        const toolResponse =
          toolResult?.output?.message ||
          toolResult?.output?.summary ||
          toolResult?.blocker?.message ||
          toolResult?.error?.message ||
          intakeMessage('posterUpdated', locale);

        return safeJson(
          {
            success: true,
            action: 'tool_call',
            tool: 'mutate_poster',
            missionId: payload.missionId ?? missionId ?? null,
            parameters: payload,
            response: toolResponse,
            result: toolResult?.output ?? null,
          },
          {
            classification: {
              executionPath: 'direct_action',
              tool: 'mutate_poster',
              confidence: posterEditIntent.confidence,
              parameters: posterEditIntent.params,
            },
            validated: true,
            downgraded: false,
            validationErrors: [],
            riskLevel: RISK.STATE_CHANGE,
            result: toolResult?.status === 'ok' ? 'success' : 'error',
          },
        );
      } catch (e) {
        if (isDev) console.warn('[IntakeV2] mutate_poster shortcut failed:', e?.message);
      }
    }

    } // areIntakeShortcutsAllowed
  }

  let classifierDowngraded = false;
  let classifierReason = null;
  let intakeHydratedContext = null;

  if (forcedTool && isRegisteredTool(forcedTool)) {
    const fe = getToolEntry(forcedTool);
    classification = {
      executionPath: fe.executionPath,
      tool: forcedTool,
      confidence: 1,
      parameters: { ...mergedForcedParams },
      message: undefined,
      plan: undefined,
      clarifyOptions: undefined,
    };
    if (originalGoal && !String(classification.parameters.description ?? '').trim() && forcedTool === 'code_fix') {
      classification.parameters = { ...classification.parameters, description: originalGoal };
    }
  } else if (!skipReasoningPipeline) {
    // Performee slideshow: narrow deterministic override (still flows through Intake V2 validation + dispatch).
    const msgLower = userMessage.toLowerCase();
    const performeeWantsSlideshow =
      isPerformeeSlideshowOverrideAllowed() &&
      performeeContext &&
      String(performeeContext.entry ?? '').trim() === 'performee' &&
      (msgLower === 'create slideshow' ||
        msgLower === 'create a slideshow' ||
        msgLower === 'make slideshow' ||
        msgLower === 'slideshow' ||
        msgLower.includes('export') && msgLower.includes('slideshow'));
    if (performeeWantsSlideshow) {
      classification = {
        executionPath: 'proactive_plan',
        tool: 'generate_slideshow',
        confidence: 0.95,
        parameters: {
          ...(effectiveStoreId ? { storeId: effectiveStoreId } : {}),
        },
      };
    } else {
    try {
      const skipAgentLoopForActiveMission = shouldSkipAgentLoopForActiveMission(
        existingMission?.status,
        userMessage,
        body,
      );
      void skipAgentLoopForActiveMission;

      try {
        intakeHydratedContext = await hydrateContext({
          message: classifierInputMessage,
          userId: intakeActorKey ?? performerIntakeV2ActorId(req),
          missionId,
          activeStoreId: effectiveStoreId,
          sessionContext: {
            ...currentContext,
            ...(storeCreateFormPayload ? { storeCreateForm: storeCreateFormPayload } : {}),
            ...(body.intentSourceContext && typeof body.intentSourceContext === 'object'
              ? body.intentSourceContext
              : {}),
          },
        });
      } catch (hydrateMainErr) {
        console.error('[intake/v2] hydrateContext (classifier) failed:', hydrateMainErr?.message ?? hydrateMainErr);
      }
      const classifierStoreId =
        intakeHydratedContext?.entities?.store?.id ?? effectiveStoreId ?? null;

      const classifyOpts = {
        userMessage: classifierInputMessage,
        originalUserMessage: userMessage,
        storeContext: { storeId: classifierStoreId, draftId, missionId },
        conversationHistory: history,
        locale,
        tenantKey,
        missionId,
        hydratedContext: intakeHydratedContext,
        runwayContext: runway,
        attachments: body.attachments,
        imageDataUrl: resolveIntakeImageRefForOcr(body),
        currentContext,
        blackboardContext,
        pendingIntent: pendingIntentFromBody,
        isSelectionConfirm,
        intakeV2Selection: selection,
        storeCreateForm: storeCreateFormPayload,
        primaryModeHint: body.primaryModeHint,
        action: body.action,
        parameters:
          body.parameters && typeof body.parameters === 'object' && !Array.isArray(body.parameters)
            ? body.parameters
            : undefined,
        currentFlow:
          body.intentSourceContext?.currentFlow ??
          contextEngineUserContext?.currentWorkflow ??
          currentContext.currentWorkflow ??
          null,
        forceIntent: body.forceIntent ?? body.intentSourceContext?.forceIntent,
        source: body.intentSource ?? body.intentSourceContext?.source,
        intentSource: body.intentSource,
        intentSourceContext: body.intentSourceContext,
        shortcutContext: intakeShortcutContext,
        memorySummary: pickMemorySummary(currentContext),
        unifiedMemory: pickUnifiedMemory(currentContext),
      };

      if (storeCreateFormPayload) {
        const validationErrors = validateCreateStorePayload({
          storeCreateForm: storeCreateFormPayload,
          storeName: storeCreateFormPayload.storeName,
          location: storeCreateFormPayload.location,
          category:
            storeCreateFormPayload.category ??
            storeCreateFormPayload.storeType ??
            storeCreateFormPayload.businessType,
        });
        if (validationErrors.length > 0) {
          return res.status(400).json(formatValidationErrorResponse(validationErrors));
        }
      }

      const intentIntegration = getIntakeIntentIntegration();
      if (performerMode !== 'manual') {
        const contextUserId =
          resolveContextUserId(req) ?? intakeActorKey ?? performerIntakeV2ActorId(req) ?? null;
        const contextSessionId =
          resolveContextSessionId(req, body) ??
          conversationSessionIdHint ??
          (contextUserId ? `intake_${contextUserId}` : null);

        classification = await intentIntegration.processIntake({
          userId: contextUserId,
          sessionId: contextSessionId,
          input: {
            text: classifierInputMessage || userMessage,
            attachments: body.attachments,
            imageDataUrl: resolveIntakeImageRefForOcr(body),
            extractedText: imageContext?.extractedText ?? null,
            hasAttachment: hasAnyImageEarly || hasIntakeImageAttachment(body),
            shortcutContext: intakeShortcutContext,
            storeCreateForm: storeCreateFormPayload,
            primaryModeHint: body.primaryModeHint,
            action: body.action,
            parameters:
              body.parameters && typeof body.parameters === 'object' && !Array.isArray(body.parameters)
                ? body.parameters
                : undefined,
          },
          classifyOpts,
          req,
        });

        if (isDev) {
          console.log('[Phase 3] Intent Reasoning used', {
            userId: contextUserId,
            sessionId: contextSessionId,
            intent: classification._reasoning?.intent,
            confidence: classification._reasoning?.confidence,
            executionPath: classification.executionPath,
            tool: classification.tool,
          });
        }

        uploadAttachmentGuardCtx = buildCurrentUploadAttachmentGuardCtx();
        attachmentOnlyUpload = isUploadOnlyAskTurn(userMessage, uploadAttachmentGuardCtx);
      }
    } catch (e) {
      if (String(e?.message ?? '').includes('IntentReasoner failed')) {
        if (isDev) console.error('[IntakeV2] IntentReasoner failed', e);
        return res.status(500).json({
          status: 'error',
          message: 'Reasoning failed',
          error: e.message,
          stack: process.env.NODE_ENV === 'development' ? e.stack : undefined,
        });
      }

      if (isDev) console.error('[IntakeV2] intent reasoning threw', e);
      classification = {
        executionPath: 'clarify',
        tool: 'general_chat',
        confidence: 0,
        parameters: {},
        message: 'Something went wrong. Please try again or rephrase.',
        clarifyOptions: mergeClarifyOptionsFromResolution(
          resolveIntent({
            userMessage,
            classification: {
              executionPath: 'clarify',
              tool: 'general_chat',
              confidence: 0,
              parameters: {},
            },
            storeId,
            draftId,
            conversationHistory: history,
            persistedIntentResolution: loadedPersistedIntent,
          }),
          userMessage,
          locale,
          [],
        ),
      };
      classifierDowngraded = true;
      classifierReason = 'classifier_exception';
    }
    classifierDowngraded = classifierDowngraded || Boolean(classification._downgraded);
    classifierReason = classification._downgradedReason ?? classifierReason;

    // V1 consolidation: route legacy mini-website creation tools through canonical create_store runway.
    // Keep legacy strings backward-compatible; do not change performer UX (only server dispatch).
    const legacy = String(classification?.tool ?? '').trim();
    if (
      legacy === 'generate_mini_website' ||
      legacy === 'mini_website' ||
      legacy === 'create_mini_website' ||
      legacy === 'create_website'
    ) {
      if (isDev) {
        // eslint-disable-next-line no-console
        console.warn('[legacy-store-path] remap tool -> create_store', { from: legacy, to: 'create_store' });
        // eslint-disable-next-line no-console
        console.log('[store-website-path] selected handler', { tool: 'create_store', intentMode: 'website', legacyTool: legacy });
      }
      classification = {
        ...classification,
        tool: 'create_store',
        parameters: {
          ...(classification.parameters && typeof classification.parameters === 'object' && !Array.isArray(classification.parameters)
            ? classification.parameters
            : {}),
          intentMode: 'website',
          intentLabel: 'create_mini_website',
        },
      };
    } else if (legacy === 'create_store' && isDev) {
      // eslint-disable-next-line no-console
      console.log('[store-website-path] selected handler', {
        tool: 'create_store',
        intentMode:
          classification?.parameters && typeof classification.parameters === 'object'
            ? classification.parameters.intentMode
            : undefined,
      });
    }

    const blockServiceRequestOverride = shouldBlockServiceRequestForStoreCreate(userMessage, {
      storeCreateForm: storeCreateFormPayload,
      forceIntent: body.forceIntent ?? body.intentSourceContext?.forceIntent,
      currentFlow: body.intentSourceContext?.currentFlow,
      source: body.intentSource ?? body.intentSourceContext?.source,
      activeStoreId: storeId,
    });

    if (!forcedTool && signalsServiceRequest(userMessage) && !blockServiceRequestOverride) {
      classification = {
        executionPath: 'service_request',
        tool: 'service_request',
        confidence: Math.max(
          typeof classification.confidence === 'number' && !Number.isNaN(classification.confidence)
            ? classification.confidence
            : 0,
          0.88,
        ),
        parameters:
          classification.parameters && typeof classification.parameters === 'object' && !Array.isArray(classification.parameters)
            ? { ...classification.parameters }
            : {},
        message: undefined,
        plan: undefined,
        clarifyOptions: undefined,
        _reasoning: 'signals_service_request',
        _reasoningClassifier: classification._reasoning,
      };
    }
    }

    if (classification && !skipReasoningPipeline) {
      classification = await enrichClassificationWithMemoryPlan(classification, {
        memoryBundle: intakeMemoryBundle,
        storeId: effectiveStoreId ?? storeId ?? resolveIntakeStoreId(currentContext) ?? null,
      });
    }
  }

  /** Hero / banner image: clarify with executable paths — never UI-only “use the button” guidance. */
  if (!forcedTool && isHeroImageChangeMessage(userMessage)) {
    const hasImg = hasIntakeImageAttachment(body);
    if (!storeId) {
      return safeJson(
        {
          success: true,
          action: 'chat',
          response: intakeMessage('heroImageRequiresStore', locale),
          _requiresStore: true,
        },
        {
          classification: { executionPath: 'chat', tool: 'general_chat', confidence: 0, parameters: {} },
          validated: true,
          downgraded: true,
          downgradeReason: 'hero_image_requires_store',
          validationErrors: [],
          riskLevel: RISK.SAFE_READ,
          result: 'fallback',
        },
      );
    }
    if (!hasImg) {
      const autoHero = tryHeroAutoVisualDirectAction({
        userMessage,
        conversationHistory: history,
        persistedHeroSubtype:
          loadedPersistedIntent?.subtype === 'change_hero_image' ? 'change_hero_image' : null,
        missionId,
        storeContext: heroStoreContext,
      });
      if (autoHero) {
        heroGenTelemetry = autoHero.telemetry;
        classification = {
          ...classification,
          ...autoHero.classification,
          clarifyOptions: undefined,
          plan: undefined,
          message: undefined,
        };
      } else {
        // No image yet: open hero customizer (upload / generate / stock) — asset is chosen inside the UI.
        classification = {
          ...classification,
          tool: 'update_store_hero',
          executionPath: 'proactive_plan',
          /** Skip low-confidence intent recovery — it would revert to improve_hero + extra params and fail validation. */
          confidence: CONFIDENCE_HIGH,
          parameters: {
            ...(classification.parameters && typeof classification.parameters === 'object'
              ? classification.parameters
              : {}),
            focus: userMessage,
          },
          clarifyOptions: undefined,
          plan: undefined,
          message: undefined,
        };
      }
    }
  }

  if (!forcedTool && storeId && !hasIntakeImageAttachment(body) && !isHeroImageChangeMessage(userMessage)) {
    const autoHeroFollowUp = tryHeroAutoVisualDirectAction({
      userMessage,
      conversationHistory: history,
      persistedHeroSubtype:
        loadedPersistedIntent?.subtype === 'change_hero_image' ? 'change_hero_image' : null,
      missionId,
      storeContext: heroStoreContext,
    });
    if (autoHeroFollowUp && classification.tool !== 'smart_visual' && classification.tool !== 'edit_artifact') {
      heroGenTelemetry = autoHeroFollowUp.telemetry;
      classification = {
        ...classification,
        ...autoHeroFollowUp.classification,
        clarifyOptions: undefined,
        plan: undefined,
        message: undefined,
      };
    }
  }

  if (!forcedTool) {
    const conf =
      typeof classification.confidence === 'number' && !Number.isNaN(classification.confidence)
        ? classification.confidence
        : 0;
    const hasImg = hasIntakeImageAttachment(body);
    if (
      conf < CONFIDENCE_MEDIUM ||
      classification.executionPath === 'clarify' ||
      (classification.executionPath === 'chat' &&
        isHeroImageChangeMessage(userMessage) &&
        Boolean(storeId) &&
        hasImg)
    ) {
      const rec = attemptIntentRecovery({
        userMessage,
        classification,
        locale,
        storeId,
        draftId,
        conversationHistory: history,
        persistedIntentResolution: loadedPersistedIntent,
      });
      if (rec.recovered) {
        classification = mergeRecoveredClassification(classification, rec);
      }
    }
  }

  classification = await guardClassificationAgainstCompletedCreateStore(classification, missionId);
  classification = guardClassificationForActiveMission(classification, {
    missionStatus: existingMission?.status,
    missionId,
    userMessage,
    body,
  });

  const sessionPendingExtraction = intakeAssetSessionKey
    ? peekPendingDocumentExtraction(intakeAssetSessionKey)
    : null;
  const uploadedAssetRoutingCtx = {
    userMessage,
    storeId: effectiveStoreId ?? storeId ?? null,
    draftId,
    attachments: body.attachments,
    imageDataUrl:
      resolveIntakeImageRefForOcr(body) ??
      intentSourceContext?.pendingImageDataUrl ??
      sessionPendingExtraction?.imageDataUrl ??
      null,
    intentSourceContext,
    sessionId: intakeAssetSessionKey,
    hasSessionPendingExtraction: Boolean(sessionPendingExtraction),
  };

  if (!forcedTool && !draftConfirmationSubmit && !storeCreateFormPayload) {
    intentSourceContext = clearStaleAssetAction(intentSourceContext, userMessage);
    body.intentSourceContext = intentSourceContext;
  }

  uploadAttachmentGuardCtx = buildCurrentUploadAttachmentGuardCtx();
  attachmentOnlyUpload = isUploadOnlyAskTurn(userMessage, uploadAttachmentGuardCtx);

  if (classification?.tool === 'create_store') {
    const topLevelForm =
      body.storeCreateForm && typeof body.storeCreateForm === 'object' && !Array.isArray(body.storeCreateForm)
        ? body.storeCreateForm
        : null;
    const ctxForm =
      currentContext?.storeCreateForm &&
      typeof currentContext.storeCreateForm === 'object' &&
      !Array.isArray(currentContext.storeCreateForm)
        ? currentContext.storeCreateForm
        : null;
    const storeFormEnvelope = topLevelForm || ctxForm;
    const hasUploadAttachment =
      (Array.isArray(body.attachments) && body.attachments.length > 0) ||
      Boolean(String(resolveIntakeImageRefForOcr(body) ?? body.imageDataUrl ?? '').trim());
    const shouldAutoSubmit = shouldAutoSubmitCreateStoreClassification({
      userMessage,
      hasAttachment: hasUploadAttachment,
      storeFormEnvelope,
    });

    classification = {
      ...classification,
      parameters: {
        ...(storeFormEnvelope
          ? mergeStoreCreateFormIntoParameters(classification.parameters, storeFormEnvelope)
          : classification.parameters),
        _autoSubmit: shouldAutoSubmit,
      },
    };
  }


  const skipDynamicPlannerForDecisionLoop =
    decisionLoopSkipPlanners || shouldSkipPlannersForDecisionLoop(classification);

  const skipDynamicPlannerForCreateStoreCheckpoint =
    classification?.tool === 'create_store' &&
    (shouldForceCreateStoreCheckpointDispatch({
      classification,
      storeCreateForm: storeCreateFormPayload,
      userMessage,
      intentSourceContext,
      imageContext,
    }) ||
      shouldSkipDynamicPlannerForUploadCreateStore({
        classification,
        storeCreateForm: storeCreateFormPayload,
        userMessage,
        intentSourceContext,
        imageContext,
      }));

  classification = normalizeClassificationForKernel(classification);

  try {
    const plannerIntegration = getPlannerIntegration();
    if (
      plannerIntegration.isEnabled(req) &&
      !skipReasoningPipeline &&
      !skipDynamicPlannerForCreateStoreCheckpoint &&
      !skipDynamicPlannerForDecisionLoop
    ) {
      dynamicPlanBundle = await plannerIntegration.maybeGenerateForIntake({
        classification,
        reasoningResult: classification._reasoningResult ?? null,
        context: {
          ...(contextEngineUserContext && typeof contextEngineUserContext === 'object'
            ? contextEngineUserContext
            : {}),
          userId: resolveContextUserId(req) ?? intakeActorKey ?? performerIntakeV2ActorId(req) ?? null,
          activeStoreId: effectiveStoreId ?? storeId ?? null,
          activeDraftId: draftId ?? null,
          activeStoreName:
            (typeof currentContext.storeName === 'string' && currentContext.storeName.trim()) ||
            (typeof currentContext.activeStoreName === 'string' && currentContext.activeStoreName.trim()) ||
            null,
        },
        locale,
        missionId,
        req,
      });
      if (dynamicPlanBundle) {
        classification = applyDynamicPlanToClassification(classification, dynamicPlanBundle);
        if (isDev) {
          console.log('[Phase C.2] Dynamic plan generated', {
            planId: dynamicPlanBundle.plan.planId,
            intent: dynamicPlanBundle.plan.intent,
            steps: dynamicPlanBundle.plan.steps.length,
            executionPath: classification.executionPath,
            blackboardEmitted: dynamicPlanBundle.blackboard?.emitted ?? 0,
          });
        }
      }
    }
  } catch (plannerErr) {
    console.warn('[Phase C.2] Dynamic planner failed (non-blocking):', plannerErr?.message ?? plannerErr);
  }

  const intakeActorUserId = req.user?.id ?? performerIntakeV2ActorId(req) ?? null;

  if (intakeHydratedContext) {
    try {
      intakeHydratedContext = await enrichHydratedContextWithIntentEntities(intakeHydratedContext, {
        message: classifierInputMessage ?? userMessage,
        classification,
        userId: intakeActorUserId,
        missionId,
        activeStoreId: effectiveStoreId,
        sessionContext: {
          ...currentContext,
          ...(storeCreateFormPayload ? { storeCreateForm: storeCreateFormPayload } : {}),
          ...(body.intentSourceContext && typeof body.intentSourceContext === 'object'
            ? body.intentSourceContext
            : {}),
        },
      });
    } catch (enrichErr) {
      if (isDev) {
        console.warn('[intake/v2] enrichHydratedContextWithIntentEntities failed:', enrichErr?.message ?? enrichErr);
      }
    }
  }

  if (!forcedTool) {
    const plannerDecision = await runPostClassifyReactPlanner({
      userMessage: classifierInputMessage ?? userMessage,
      classification,
      context: {
        storeId: dispatchStoreId ?? effectiveStoreId ?? null,
        attachments: body.attachments,
        imageDataUrl: resolveIntakeImageRefForOcr(body),
        runwayContext: runway,
        userId: intakeActorUserId,
        missionId,
      },
      hydratedContext: intakeHydratedContext,
    });

    const uploadPlannerCtx = {
      userMessage,
      attachments: body.attachments,
      imageDataUrl:
        resolveIntakeImageRefForOcr(body) ??
        intentSourceContext?.pendingImageDataUrl ??
        null,
      intentSourceContext,
      sessionId: intakeAssetSessionKey,
      hasSessionPendingExtraction: Boolean(sessionPendingExtraction),
      storeId: effectiveStoreId ?? storeId ?? null,
      draftId,
    };
    const skipReactPlannerAsk =
      decisionLoopSkipPlanners ||
      shouldSkipPlannersForDecisionLoop(classification) ||
      attachmentOnlyUpload ||
      classification?.tool === 'ingest_asset_for_intent_detection' ||
      shouldRouteToAssetIntentDetection(userMessage, uploadPlannerCtx) ||
      shouldAnalyzeUploadedAssetForStoreCreation(uploadPlannerCtx);

    if (isReactPlannerAskDecision(plannerDecision) && !skipReactPlannerAsk) {
      const storeClarifyOptions = buildStoreClarifyOptionsFromHydratedContext(
        intakeHydratedContext,
        classification,
      );
      const pendingIntent = plannerDecision.pendingSkill
        ? enrichPendingIntentForDocumentIngestion(classification, {
            pendingSkill: plannerDecision.pendingSkill,
            pendingInputs: plannerDecision.pendingInputs ?? {},
            ...(plannerDecision.missionContext && typeof plannerDecision.missionContext === 'object'
              ? plannerDecision.missionContext
              : {}),
          })
        : storeClarifyOptions.length > 0
          ? {
              userMessage: String(userMessage ?? '').trim(),
              originalTool: String(classification?.tool ?? plannerDecision.toolName ?? '').trim(),
              clarifyType: 'store_picker',
              storeCandidates: storeClarifyOptions.map((o) => ({
                id: o.parameters?.storeId,
                name: o.label,
              })),
            }
          : null;

      return safeJson(
        {
          success: true,
          action: 'clarify',
          clarifyType: storeClarifyOptions.length > 0 ? 'store_picker' : undefined,
          response: plannerDecision.prompt,
          ...(storeClarifyOptions.length > 0 ? { options: storeClarifyOptions } : {}),
          pendingIntent,
          ...(plannerDecision.pendingSkill
            ? {
                pendingSkill: plannerDecision.pendingSkill,
                pendingInputs: plannerDecision.pendingInputs,
              }
            : {}),
        },
        {
          classification: {
            executionPath: 'clarify',
            tool: plannerDecision.toolName ?? classification.tool ?? 'general_chat',
            confidence: classification.confidence ?? 0.5,
            parameters: {},
            message: plannerDecision.prompt,
          },
          validated: true,
          downgraded: false,
          downgradeReason: null,
          validationErrors: [],
          riskLevel: getToolEntry(plannerDecision.toolName ?? classification.tool)?.riskLevel ?? RISK.SAFE_READ,
          result: 'react_planner_ask',
        },
      );
    }

    if (isReactPlannerConfirmDecision(plannerDecision)) {
      const confirmTool = plannerDecision.toolName ?? classification.tool;
      const mergedParams = mergePlannerParameters(classification, plannerDecision);
      if (dispatchStoreId && !mergedParams.storeId) mergedParams.storeId = dispatchStoreId;
      else if (effectiveStoreId && !mergedParams.storeId) mergedParams.storeId = effectiveStoreId;

      return issueApprovalRequired({
        req,
        safeJson,
        tool: confirmTool,
        cleanedParams: mergedParams,
        storeId: dispatchStoreId ?? effectiveStoreId ?? storeId ?? null,
        userMessage,
        locale,
        classification: {
          ...classification,
          tool: confirmTool,
          parameters: mergedParams,
          _reactPlannerConfirm: true,
          _confirmation: plannerDecision.confirmation,
        },
        riskLevel: getToolEntry(confirmTool)?.riskLevel ?? RISK.STATE_CHANGE,
      });
    }
  }

  // Campaign orchestration intents are classified as proactive_plan — no post-classifier bypass.
  let cleanedParams = {};
  /** @type {{ decision: string, reason?: string }} */
  let policy = { decision: 'execute' };
  let toolEntry = null;
  let riskLevel = RISK.SAFE_READ;
  /** Last validation result (for telemetry / fallback branches). */
  let lastValidation = /** @type {{ ok: boolean, errors?: unknown[], downgradedTo?: string } | null} */ (null);

  // DANH: store-disambiguation — multi-store clarify before validation / skill dispatch
  if (classification?.tool) {
    const toolMetaForStore = getToolEntry(classification.tool);
    const pathNeedsStore =
      classification.executionPath === 'direct_action' || classification.executionPath === 'proactive_plan';
    if (toolMetaForStore?.requiresStore && pathNeedsStore && !dispatchStoreId) {
      const ambiguity = await resolveStoreAmbiguity({
        userId: intakeActorUserId,
        effectiveStoreId: null,
        intentRequiresStore: true,
        userMessage: originalGoal || userMessage,
      });
      if (ambiguity?.needsClarification) {
        const clarifyTool = classification.tool;
        const options = ambiguity.options.map((o) => ({
          label: o.label,
          tool: clarifyTool,
          parameters: {
            storeId: o.value,
            ...(classification.parameters &&
            typeof classification.parameters === 'object' &&
            !Array.isArray(classification.parameters)
              ? classification.parameters
              : {}),
          },
        }));
        const pendingIntent = enrichPendingIntentForDocumentIngestion(classification, {
          ...(ambiguity.pendingIntent && typeof ambiguity.pendingIntent === 'object' ? ambiguity.pendingIntent : {}),
          userMessage: String(ambiguity.pendingIntent?.userMessage ?? userMessage ?? '').trim(),
          originalTool: clarifyTool,
          clarifyType: 'store_picker',
          storeCandidates: ambiguity.options.map((o) => ({ id: o.value, name: o.label })),
        });
        return safeJson(
          {
            success: true,
            action: 'clarify',
            clarifyType: ambiguity.clarifyType,
            response: ambiguity.question,
            options,
            pendingIntent,
            ...(pendingIntent.pendingSkill
              ? {
                  pendingSkill: pendingIntent.pendingSkill,
                  pendingInputs: pendingIntent.pendingInputs,
                }
              : {}),
          },
          {
            classification,
            validated: true,
            downgraded: false,
            downgradeReason: null,
            validationErrors: [],
            riskLevel: toolMetaForStore?.riskLevel ?? RISK.SAFE_READ,
            result: 'clarify_store',
          },
        );
      }
      const autoStoreId = await tryAutoResolveSingleStoreId(intakeActorUserId);
      if (autoStoreId) dispatchStoreId = autoStoreId;
    }
  }

  // ── 3–4) Validate + execution policy with one intent-recovery retry ────────
  const guestProductClarifyEarly = maybeRespondGuestDraftProductClarify({
    req,
    safeJson,
    locale,
    classification,
    runway,
    draftId,
    missionId,
    userMessage,
    hasAttachment: hasAnyImageEarly || hasIntakeImageAttachment(body),
    effectiveStoreId: dispatchStoreId ?? effectiveStoreId,
    forcedTool,
    riskLevel: getToolEntry(classification.tool)?.riskLevel ?? RISK.SAFE_READ,
  });
  if (guestProductClarifyEarly) return guestProductClarifyEarly;

  for (let recoveryAttempt = 0; recoveryAttempt < 2; recoveryAttempt++) {
    toolEntry = getToolEntry(classification.tool);
    riskLevel = toolEntry?.riskLevel ?? RISK.SAFE_READ;

    const validation = validateIntakeClassification(
      {
        executionPath: classification.executionPath,
        tool: classification.tool,
        parameters: classification.parameters,
        plan: classification.plan,
      },
      dispatchStoreId ?? effectiveStoreId,
      { missionId, draftId },
    );
    lastValidation = validation;

    if (!validation.ok && validation.downgradedTo === 'chat') {
      const toolMetaChat = getToolEntry(classification.tool);
      const storeRequired = validation.errors?.some((e) => e?.reason === 'requires_store');
      if (storeRequired && toolMetaChat?.requiresStore && !dispatchStoreId) {
        const ambiguity = await resolveStoreAmbiguity({
          userId: intakeActorUserId,
          effectiveStoreId: null,
          intentRequiresStore: true,
          userMessage: originalGoal || userMessage,
        });
        if (ambiguity?.needsClarification) {
          const options = ambiguity.options.map((o) => ({
            label: o.label,
            tool: classification.tool,
            parameters: {
              storeId: o.value,
              ...(classification.parameters &&
              typeof classification.parameters === 'object' &&
              !Array.isArray(classification.parameters)
                ? classification.parameters
                : {}),
            },
          }));
          const pendingIntent = enrichPendingIntentForDocumentIngestion(classification, {
            ...(ambiguity.pendingIntent && typeof ambiguity.pendingIntent === 'object' ? ambiguity.pendingIntent : {}),
            userMessage: String(ambiguity.pendingIntent?.userMessage ?? originalGoal ?? userMessage ?? '').trim(),
            originalTool: classification.tool,
            clarifyType: 'store_picker',
            storeCandidates: ambiguity.options.map((o) => ({ id: o.value, name: o.label })),
          });
          return safeJson(
            {
              success: true,
              action: 'clarify',
              clarifyType: ambiguity.clarifyType,
              response: ambiguity.question,
              options,
              pendingIntent,
              ...(pendingIntent.pendingSkill
                ? {
                    pendingSkill: pendingIntent.pendingSkill,
                    pendingInputs: pendingIntent.pendingInputs,
                  }
                : {}),
            },
            {
              classification,
              validated: true,
              downgraded: false,
              downgradeReason: null,
              validationErrors: validation.errors,
              riskLevel,
              result: 'clarify_store',
            },
          );
        }
        const autoStoreId = await tryAutoResolveSingleStoreId(intakeActorUserId);
        if (autoStoreId) {
          dispatchStoreId = autoStoreId;
          continue;
        }
      }
      if (
        shouldGateGuestPostDraftStoreAction({
          req,
          effectiveStoreId: dispatchStoreId ?? effectiveStoreId,
          draftId,
          runway,
          missionId,
          tool: classification.tool,
        })
      ) {
        const guestProductClarify = maybeRespondGuestDraftProductClarify({
          req,
          safeJson,
          locale,
          classification,
          runway,
          draftId,
          missionId,
          userMessage,
          hasAttachment: hasAnyImageEarly || hasIntakeImageAttachment(body),
          effectiveStoreId: dispatchStoreId ?? effectiveStoreId,
          forcedTool,
          riskLevel,
        });
        if (guestProductClarify) return guestProductClarify;
        return respondGuestDraftSignInGate({
          req,
          safeJson,
          locale,
          classification,
          runway,
          riskLevel,
          validationErrors: validation.errors,
        });
      }
      const isGuestActor = Boolean(req.isGuest) || !req.user?.id;
      const msg = formatContextGapMessage(runway, locale, { isGuest: isGuestActor });
      return safeJson(
        {
          success: true,
          action: 'chat',
          response: msg,
          _requiresStore: true,
          _requiresSignIn: isGuestActor && Boolean(draftId || runway?.activeDraftId),
          suggestedActions: formatSuggestedActionsForContextGap(runway, { isGuest: isGuestActor }),
          runwayContext: runway,
        },
        {
          classification,
          validated: false,
          downgraded: true,
          downgradeReason: 'requires_store',
          validationErrors: validation.errors,
          riskLevel,
          result: 'fallback',
        },
      );
    }

    if (!validation.ok && validation.downgradedTo === 'clarify') {
      if (recoveryAttempt === 0) {
        const rec = attemptIntentRecovery({
          userMessage,
          classification,
          locale,
          storeId: effectiveStoreId,
          draftId,
          conversationHistory: history,
          persistedIntentResolution: loadedPersistedIntent,
        });
        if (rec.recovered) {
          classification = mergeRecoveredClassification(classification, rec);
          continue;
        }
      }
      const ir = resolveIntent({
        userMessage,
        classification,
        storeId,
        draftId,
        conversationHistory: history,
        persistedIntentResolution: loadedPersistedIntent,
      });
      if (isIntakeV2CapabilityGapEnabled()) {
        const gap = await detectCapabilityGap({
          userMessage,
          classification,
          validationErrors: validation.errors ?? [],
          intentResolution: ir,
        });
        if (gap.isGap) {
          const capabilityProposal = buildCapabilityProposalFromGap(gap, userMessage, {
            storeId,
            storeType: currentContext?.storeType,
            storeName: currentContext?.storeName,
          });
          if (missionId && capabilityProposal.spawnPayload) {
            const tenantIdForSpawn = String(getTenantId(req.user) ?? req.guest?.id ?? '').trim();
            const userIdForSpawn = String(req.user?.id ?? req.guest?.id ?? '').trim();
            spawnChildAgentForMissionTask(
              missionId,
              capabilityProposal.spawnPayload.intent,
              {
                storeId,
                context: capabilityProposal.spawnPayload.storeContext,
                parentProposal: {
                  title: capabilityProposal.title,
                  confidence: capabilityProposal.confidence,
                },
                tenantId: tenantIdForSpawn,
                userId: userIdForSpawn,
              },
            )
              .then((result) => {
                console.log('[CapabilityGap] Child spawn result:', {
                  missionId,
                  ok: result?.ok,
                  childMissionId: result?.childMissionId ?? result?.missionId,
                });
              })
              .catch((err) => {
                console.error('[CapabilityGap] Child spawn failed:', err?.message ?? err);
              });
          }
          return safeJson(
            {
              success: true,
              action: 'capability_proposal_required',
              response: intakeMessage('capabilityGapProposal', locale),
              capabilityProposal,
              validationErrors: validation.errors,
            },
            {
              classification,
              validated: false,
              downgraded: true,
              downgradeReason: 'capability_gap_proposal',
              validationErrors: validation.errors,
              riskLevel,
              result: 'capability_proposal',
              capabilityGapDetected: true,
              requestedCapability: gap.requestedCapability ?? null,
              proposalSpawned: true,
              proposalType: capabilityProposal.proposedImplementation?.patchType ?? null,
              resolvedFamily: ir.family ?? null,
              resolvedSubtype: ir.subtype ?? null,
            },
          );
        }
      }
      const options = mergeClarifyOptionsFromResolution(ir, userMessage, locale, classification.tool ? [classification.tool] : []);
      return safeJson(
        {
          success: true,
          action: 'clarify',
          response: intakeMessage('needMoreDetail', locale),
          options,
          validationErrors: validation.errors,
        },
        {
          classification,
          validated: false,
          downgraded: true,
          downgradeReason: 'validation_failed',
          validationErrors: validation.errors,
          riskLevel,
          result: 'clarify',
        },
      );
    }

    cleanedParams = validation.cleanedParameters ?? {};

    if (classification.executionPath === 'clarify') {
      if (
        !forcedTool &&
        isExplicitCreateStoreFromUploadContext({ userMessage, intentSourceContext }) &&
        hasRecentUploadedAssetInContext(uploadedAssetRoutingCtx)
      ) {
        const handoffImage = String(uploadedAssetRoutingCtx.imageDataUrl ?? '').trim();
        if (handoffImage.length > 100 && !resolveIntakeImageRefForOcr(body)) {
          body.imageDataUrl = handoffImage;
          if (!Array.isArray(body.attachments) || body.attachments.length === 0) {
            body.attachments = [{ type: 'image', dataUrl: handoffImage, uri: handoffImage }];
          }
        }
        classification = {
          ...buildAnalyzeUploadedAssetForStoreCreationClassification(userMessage, {
            attachments: body.attachments,
            imageDataUrl: resolveIntakeImageRefForOcr(body) ?? handoffImage ?? null,
            source: 'uploaded_asset_store_creation',
            currentEntry: 'performer',
          }),
          _classificationOverride: 'clarify_override_upload_create_store',
        };
        intentSourceContext = {
          ...(intentSourceContext && typeof intentSourceContext === 'object' ? intentSourceContext : {}),
          assetAction: 'create_store',
          ...(handoffImage ? { pendingImageDataUrl: handoffImage } : {}),
        };
        body.intentSourceContext = intentSourceContext;
        continue;
      } else {
      if (recoveryAttempt === 0) {
        const rec = attemptIntentRecovery({
          userMessage,
          classification,
          locale,
          storeId,
          draftId,
          conversationHistory: history,
          persistedIntentResolution: loadedPersistedIntent,
        });
        if (rec.recovered) {
          classification = mergeRecoveredClassification(classification, rec);
          continue;
        }
      }
      const opts = Array.isArray(classification.clarifyOptions) ? classification.clarifyOptions : [];
      const mapped = opts
        .filter((o) => o && isRegisteredTool(o.tool))
        .map((o) => ({
          label: o.label,
          tool: o.tool,
          parameters: o.parameters && typeof o.parameters === 'object' ? o.parameters : {},
        }));
      const irClarify = resolveIntent({
        userMessage,
        classification,
        storeId,
        draftId,
        conversationHistory: history,
        persistedIntentResolution: loadedPersistedIntent,
      });
      const options = mapped.length
        ? mapped.slice(0, 3)
        : mergeClarifyOptionsFromResolution(irClarify, userMessage, locale, []);
      return safeJson(
        {
          success: true,
          action: 'clarify',
          response:
            classification.message ||
            intakeMessage('pickAnOption', locale),
          options,
        },
        {
          classification,
          validated: true,
          downgraded: classifierDowngraded,
          downgradeReason: classifierReason,
          validationErrors: [],
          riskLevel,
          result: 'clarify',
        },
      );
      }
    }

    const rawPolicyConfidence =
      typeof classification.confidence === 'number' && !Number.isNaN(classification.confidence)
        ? classification.confidence
        : 0;
    // create_store is STATE_CHANGE: low model confidence would otherwise force clarify even when
    // validation passed and the user (or prompt) set _autoSubmit — same runway as shortcut/mission.
    const policyConfidence =
      classification.tool === 'create_store' &&
      (classification.executionPath === 'direct_action' ||
        classification.executionPath === 'proactive_plan') &&
      riskLevel === RISK.STATE_CHANGE &&
      cleanedParams &&
      cleanedParams._autoSubmit === true
        ? Math.max(rawPolicyConfidence, CONFIDENCE_HIGH)
        : rawPolicyConfidence;

    policy = evaluateExecutionPolicy({
      executionPath: classification.executionPath,
      riskLevel,
      confidence: policyConfidence,
    });

    if (policy.decision === 'clarify') {
      if (recoveryAttempt === 0) {
        const rec = attemptIntentRecovery({
          userMessage,
          classification: {
            ...classification,
            parameters: { ...cleanedParams },
          },
          locale,
          storeId,
          draftId,
          conversationHistory: history,
          persistedIntentResolution: loadedPersistedIntent,
        });
        if (rec.recovered) {
          classification = mergeRecoveredClassification(classification, rec);
          continue;
        }
      }
      const fe = toolEntry;
      const irPolicy = resolveIntent({
        userMessage,
        classification,
        storeId,
        draftId,
        conversationHistory: history,
        persistedIntentResolution: loadedPersistedIntent,
      });
      const options = mergeClarifyOptionsFromResolution(irPolicy, userMessage, locale, [classification.tool].filter(Boolean));
      return safeJson(
        {
          success: true,
          action: 'clarify',
          response:
            classification.message ||
            intakeMessage('confirmPolicyProceed', locale, {
              label: fe?.label ?? classification.tool ?? '',
            }),
          options:
            options.length > 0
              ? options
              : [
                  { label: fe?.label ?? classification.tool, tool: classification.tool, parameters: cleanedParams },
                ],
          policyReason: policy.reason,
        },
        {
          classification: { ...classification, parameters: cleanedParams },
          validated: true,
          downgraded: true,
          downgradeReason: policy.reason,
          validationErrors: [],
          riskLevel,
          result: 'clarify',
        },
      );
    }
    break;
  }

  if (policy.decision === 'approval_required') {
    if (
      shouldGateGuestPostDraftStoreAction({
        req,
        effectiveStoreId: dispatchStoreId ?? effectiveStoreId ?? storeId,
        draftId,
        runway,
        missionId,
        tool: classification.tool,
      })
    ) {
      const guestProductClarify = maybeRespondGuestDraftProductClarify({
        req,
        safeJson,
        locale,
        classification,
        runway,
        draftId,
        missionId,
        userMessage,
        hasAttachment: hasAnyImageEarly || hasIntakeImageAttachment(body),
        effectiveStoreId: dispatchStoreId ?? effectiveStoreId ?? storeId,
        forcedTool,
        riskLevel,
      });
      if (guestProductClarify) return guestProductClarify;
      return respondGuestDraftSignInGate({
        req,
        safeJson,
        locale,
        classification,
        runway,
        riskLevel,
      });
    }
    return issueApprovalRequired({
      req,
      safeJson,
      tool: classification.tool,
      cleanedParams,
      storeId,
      userMessage,
      locale,
      classification,
      riskLevel,
    });
  }

  if (classification.executionPath === 'resume_active_mission') {
    const params =
      classification.parameters && typeof classification.parameters === 'object' && !Array.isArray(classification.parameters)
        ? classification.parameters
        : {};
    return safeJson(
      {
        success: true,
        action: 'resume_active_mission',
        missionId: String(params.missionId ?? missionId ?? existingMission?.id ?? '').trim() || undefined,
        command: String(params.command ?? 'continue').trim() || 'continue',
        stepId: params.stepId ?? null,
        response:
          typeof classification.message === 'string' && classification.message.trim()
            ? classification.message.trim()
            : 'Continuing your active mission.',
      },
      {
        classification,
        validated: true,
        downgraded: false,
        downgradeReason: null,
        validationErrors: [],
        riskLevel: RISK.SAFE_READ,
        result: 'resume_active_mission',
      },
    );
  }

  if (classification.executionPath === 'chat' || classification.executionPath === 'service_request') {
    if (
      classification.executionPath === 'chat' &&
      (classification.tool === 'analyze_content' ||
        (classification.tool === 'general_chat' && hasAnyImageEarly))
    ) {
      const responseText = imageContext?.hasText
        ? `Here's what I found in the image:\n\n${imageContext.extractedText}`
        : classification.message || 'I can see an image was attached. What would you like to do with it?';

      const capabilityResolutionImage = resolveCapability({
        userMessage,
        enrichedMessage: classifierInputMessage,
        locale,
        hasImage: hasAnyImageEarly,
        imageOcrHasText: Boolean(imageContext?.hasText),
        storeId,
        draftId,
        missionId,
        serviceRequestThreadBlob,
        classification: {
          tool: classification.tool,
          executionPath: classification.executionPath,
          confidence: classification.confidence,
          downgradedReason: classifierReason,
        },
      });
      const capabilityBridgeImage = maybeBuildCapabilityBridgeArtifact({
        capabilityResolution: capabilityResolutionImage,
        responseText,
        userMessage,
        locale,
        missionId,
        extractedSnippet: imageContext?.hasText ? imageContext.extractedText : null,
        serviceRequestDraft: mergeServiceRequestDraftFromTurns(userMessage, history, locale),
        conversationHistory: history,
      });

      return safeJson(
        {
          success: true,
          action: 'chat',
          response: responseText,
          capabilityResolution: capabilityResolutionImage,
          ...(capabilityBridgeImage ? { capabilityBridge: capabilityBridgeImage } : {}),
          followUpOptions: imageContext?.hasText
            ? [
                { label: 'Create a campaign from this', tool: 'market_research' },
                { label: 'What can you do?', tool: 'general_chat' },
              ]
            : [{ label: 'What can you do?', tool: 'general_chat' }],
        },
        {
          classification,
          validated: true,
          downgraded: false,
          downgradeReason: null,
          validationErrors: [],
          riskLevel: 'safe_read',
          result: 'chat',
        },
      );
    }

    const defaultChat = intakeMessage('defaultChatUnclear', locale);
    const isIntakeServiceRequestPath =
      classification.executionPath === 'service_request' && classification.tool === 'service_request';
    const rawMsg = isIntakeServiceRequestPath
      ? buildServiceRequestCaptureResponse(userMessage, locale, cleanedParams)
      : typeof classification.message === 'string' && classification.message.trim()
        ? classification.message.trim()
        : defaultChat;

    if (
      isHeroUiInstructionFallback(rawMsg) &&
      isHeroImageChangeMessage(userMessage) &&
      storeId &&
      !hasIntakeImageAttachment(body)
    ) {
      const blackboardContextRaw = body.blackboardContext;
      const blackboardContext =
        blackboardContextRaw && typeof blackboardContextRaw === 'object' && !Array.isArray(blackboardContextRaw)
          ? blackboardContextRaw
          : null;
      const chipResult = await handleUpdateStoreHero({
        blackboardContext,
        storeContext: {
          storeId: effectiveStoreId ?? storeId ?? null,
          draftId,
          missionId,
        },
        missionId,
      });
      if (chipResult?.action === 'message') {
        return safeJson(
          {
            success: true,
            action: 'chat',
            response: String(chipResult.message ?? '').trim() || 'OK.',
          },
          {
            classification: { ...classification, parameters: { ...cleanedParams, focus: userMessage } },
            validated: true,
            downgraded: true,
            downgradeReason: 'hero_open_ui_requires_store_context',
            validationErrors: [],
            riskLevel,
            result: 'fallback',
          },
        );
      }
      const heroParams = { ...cleanedParams, focus: userMessage };
      if (chipResult?.action === 'open_ui') {
        await maybeAppendOpenUiCompletedAction(missionId, 'update_store_hero', heroParams);
      }
      return safeJson(
        {
          success: true,
          action: 'tool_call',
          tool: 'update_store_hero',
          parameters: heroParams,
          missionId,
          response: String(chipResult?.message ?? '').trim() || 'OK.',
          result: {
            action: chipResult?.action,
            ui: chipResult?.ui ?? null,
            storeId: chipResult?.storeId ?? null,
            generationRunId: chipResult?.generationRunId ?? null,
            draftId: chipResult?.draftId ?? null,
            message: chipResult?.message ?? null,
          },
          reasoning: classification._reasoning,
        },
        {
          classification: {
            ...classification,
            tool: 'update_store_hero',
            executionPath: 'direct_action',
            parameters: heroParams,
          },
          validated: true,
          downgraded: false,
          downgradeReason: null,
          validationErrors: [],
          riskLevel,
          result: 'success',
        },
      );
    }

    const responseOut = isHeroUiInstructionFallback(rawMsg)
      ? intakeMessage('heroUpdateGuidance', locale)
      : rawMsg;

    /** Phase 1 capability resolver — before generic chat fallback / refusal text. */
    const capabilityResolution = resolveCapability({
      userMessage,
      enrichedMessage: classifierInputMessage,
      locale,
      hasImage: hasAnyImageEarly,
      imageOcrHasText: Boolean(imageContext?.hasText),
      storeId,
      draftId,
      missionId,
      serviceRequestThreadBlob,
      classification: {
        tool: classification.tool,
        executionPath: classification.executionPath,
        confidence: classification.confidence,
        downgradedReason: classifierReason,
      },
    });
    const serviceRequestDraft = mergeServiceRequestDraftFromTurns(userMessage, history, locale);
    let providerSearchResult = null;
    let selectedServiceProvider = null;
    let adjustedResponseOut = responseOut;
    if (capabilityResolution.family === CAPABILITY_FAMILIES.SERVICE_REQUEST) {
      if (!isServiceRequestDraftComplete(serviceRequestDraft)) {
        adjustedResponseOut = buildServiceRequestCaptureResponse(userMessage, locale, cleanedParams);
      } else {
        providerSearchResult = await searchServiceProviders(serviceRequestDraft, locale);
        // Provider selection via structured capability-bridge action context.
        const sc = intentSourceContext && typeof intentSourceContext === 'object' ? intentSourceContext : null;
        const artifactKind = sc && typeof sc.artifactKind === 'string' ? String(sc.artifactKind).trim() : '';
        const bridgeActionId = sc && typeof sc.bridgeActionId === 'string' ? String(sc.bridgeActionId).trim() : '';
        const providerId =
          artifactKind === 'capability_bridge:service_request' && bridgeActionId.startsWith('select_provider:')
            ? bridgeActionId.slice('select_provider:'.length).trim()
            : '';

        if (providerId) {
          const fromResults =
            providerSearchResult?.providers?.find((p) => String(p?.id ?? '').trim() === providerId) ?? null;
          const seed = resolveSeedProviderCandidateById(providerId);
          const picked = fromResults || seed;
          if (picked) {
            selectedServiceProvider = {
              providerId: picked.id,
              providerName: picked.name,
              providerUrl: picked.url ?? null,
              providerLocationLabel: picked.locationLabel ?? null,
              providerSource: picked.source ?? null,
              providerSearchSource: providerSearchResult?.source ?? null,
              providerSearchQuerySummary: providerSearchResult?.querySummary ?? null,
              providerSearchDisclaimer: providerSearchResult?.dataDisclaimer ?? null,
              serviceRequestDraft,
            };
            adjustedResponseOut = formatSelectedServiceProviderBlock(selectedServiceProvider, locale);
          } else {
            adjustedResponseOut = formatServiceRequestWithProviderSearch(
              serviceRequestDraft,
              locale,
              providerSearchResult,
            );
          }
        } else {
          adjustedResponseOut = formatServiceRequestWithProviderSearch(
            serviceRequestDraft,
            locale,
            providerSearchResult,
          );
        }
      }
    }
    const { response: capabilityEnhancedResponse, applied: capabilityEnhancementApplied } =
      maybeEnhanceGeneralChatResponse({
        resolution: capabilityResolution,
        responseOut: adjustedResponseOut,
        classification,
        locale,
        userMessage,
      });

    const capabilityBridge = maybeBuildCapabilityBridgeArtifact({
      capabilityResolution,
      responseText: capabilityEnhancedResponse,
      userMessage,
      locale,
      missionId,
      extractedSnippet: imageContext?.hasText ? imageContext.extractedText : null,
      serviceRequestDraft,
      providerSearchResult,
      conversationHistory: history,
      selectedServiceProvider,
    });

    // Gap check for commercial intents routed to general_chat (skip registered promo graphic tools)
    if (
      isIntakeV2CapabilityGapEnabled() &&
      classification.tool === 'general_chat' &&
      COMMERCIAL_INTENT_RE.test(userMessage) &&
      !isPromotionGraphicIntent(userMessage)
    ) {
      const irChatGap = resolveIntent({
        userMessage,
        classification,
        storeId,
        draftId,
        conversationHistory: history,
        persistedIntentResolution: loadedPersistedIntent,
      });
      const gap = await detectCapabilityGap({
        userMessage,
        classification,
        validationErrors: [],
        intentResolution: irChatGap ?? null,
      });

      if (gap.isGap) {
        const capabilityProposal = buildCapabilityProposalFromGap(gap, userMessage, {
          storeId,
          storeType: currentContext?.storeType,
          storeName: currentContext?.storeName,
        });

        if (missionId && capabilityProposal.spawnPayload) {
          const tenantIdForSpawn = String(getTenantId(req.user) ?? req.guest?.id ?? '').trim();
          const userIdForSpawn = String(req.user?.id ?? req.guest?.id ?? '').trim();
          spawnChildAgentForMissionTask(
            missionId,
            capabilityProposal.spawnPayload.intent,
            {
              storeId,
              context: capabilityProposal.spawnPayload.storeContext,
              parentProposal: {
                title: capabilityProposal.title,
                confidence: capabilityProposal.confidence,
              },
              tenantId: tenantIdForSpawn,
              userId: userIdForSpawn,
            },
          )
            .then((result) => {
              console.log('[CapabilityGap] Child spawn result:', {
                missionId,
                ok: result?.ok,
                childMissionId: result?.childMissionId ?? result?.missionId,
              });
            })
            .catch((err) => {
              console.error('[CapabilityGap] Child spawn failed:', err?.message ?? err);
            });
        }

        return safeJson(
          {
            success: true,
            action: 'capability_proposal',
            response: capabilityProposal.summary,
            proposal: capabilityProposal,
          },
          {
            classification,
            validated: true,
            downgraded: false,
            downgradeReason: null,
            validationErrors: [],
            riskLevel,
            result: 'capability_proposal',
            capabilityGapDetected: true,
            requestedCapability: gap.requestedCapability ?? null,
            proposalSpawned: true,
            proposalType: capabilityProposal.proposedImplementation?.patchType ?? null,
            resolvedFamily: irChatGap.family ?? null,
            resolvedSubtype: irChatGap.subtype ?? null,
          },
        );
      }
    }

    return safeJson(
      {
        success: true,
        action: 'chat',
        response: capabilityEnhancedResponse,
        capabilityResolution,
        ...(capabilityEnhancementApplied ? { capabilityEnhancementApplied: true } : {}),
        ...(capabilityBridge ? { capabilityBridge } : {}),
      },
      {
        classification: { ...classification, parameters: cleanedParams },
        validated: true,
        downgraded: classifierDowngraded,
        downgradeReason: classifierReason,
        validationErrors: [],
        riskLevel,
        result: 'fallback',
        capabilityResolution,
        capabilityEnhancementApplied,
      },
    );
  }

  classification = normalizeClassificationForKernel(classification);

  if (
    isKernelMandatoryEnabled() &&
    classification?._kernelNormalizedFrom === 'direct_action' &&
    classification.tool &&
    classification.tool !== 'create_store' &&
    isRegisteredTool(classification.tool)
  ) {
    const kernelDispatch = await dispatchIntakeToolViaUnifiedKernel(
      classification.tool,
      cleanedParams,
      {
        missionId,
        storeId: dispatchStoreId ?? effectiveStoreId ?? storeId ?? undefined,
        userId: performerIntakeV2ActorId(req) || req.user?.id || null,
        tenantId: getTenantId(req.user),
        locale,
        source: 'intake_v2_unified',
        confirmed: true,
        context: intakeHydratedContext ? { hydratedContext: intakeHydratedContext } : undefined,
      },
    );
    const { body, telemetryResult } = buildDirectToolDispatchResponse(
      classification.tool,
      kernelDispatch,
      locale,
      { riskLevel, reasoning: classification._reasoning },
    );
    return safeJson(body, {
      classification: { ...classification, parameters: cleanedParams },
      validated: true,
      downgraded: classifierDowngraded,
      downgradeReason: classifierReason,
      validationErrors: [],
      riskLevel,
      result: telemetryResult,
      executionPath: 'kernel_dispatch',
    });
  }

  // ── ingest_asset_for_intent_detection (attachment-only; no auto-mission) ───
  if (classification.tool === 'ingest_asset_for_intent_detection') {
    const { ingestAssetForIntentDetection } = await import('../lib/intake/assetIntentIngestService.js');
    const attachment = Array.isArray(body.attachments) ? body.attachments[0] : null;
    const imageDataUrl =
      cleanedParams.imageDataUrl ?? resolveIntakeImageRefForOcr(body) ?? null;
    const mimeType =
      cleanedParams.mimeType ??
      (attachment && typeof attachment === 'object' ? attachment.mimeType : null) ??
      null;
    const filename =
      cleanedParams.filename ??
      (attachment && typeof attachment === 'object'
        ? attachment.name ?? attachment.filename
        : null) ??
      null;

    let ocrHints = null;
    if (imageContext?.hasText) {
      ocrHints = buildOcrHintsFromImageText(imageContext.extractedText);
    }

    const ingestResult = await ingestAssetForIntentDetection({
      storeId: dispatchStoreId || effectiveStoreId || undefined,
      fileAssetId: cleanedParams.fileAssetId ?? crypto.randomUUID(),
      mimeType,
      filename,
      imageDataUrl,
      source: cleanedParams.source ?? 'performer_composer',
      currentEntry: cleanedParams.currentEntry ?? 'performer',
      userPrompt: cleanedParams.userPrompt ?? (userMessage || null),
      rawOcrText: imageContext?.extractedText ?? ocrHints?.rawText ?? null,
      ocrHints,
    });

    if (missionId && ingestResult.ok && ingestResult.entityContext) {
      try {
        const prisma = getPrismaClient();
        const ingestStoreCandidate = resolveStoreCandidateForHandoff({
          intentSourceContext: { assetIngestResult: ingestResult },
          persistedIngest: ingestResult,
        });
        if (ingestStoreCandidate) {
          const artifact = buildDocumentExtractionArtifact(ingestStoreCandidate, { missionId });
          await persistDocumentExtractionToMission(prisma, missionId, artifact);
        }
        const existing = await prisma.missionPipeline.findUnique({
          where: { id: missionId },
          select: { metadataJson: true },
        });
        if (existing) {
          const baseMeta =
            existing.metadataJson && typeof existing.metadataJson === 'object' && !Array.isArray(existing.metadataJson)
              ? { ...existing.metadataJson }
              : {};
          const priorOutputs =
            baseMeta.stepOutputs && typeof baseMeta.stepOutputs === 'object' && !Array.isArray(baseMeta.stepOutputs)
              ? baseMeta.stepOutputs
              : {};
          await prisma.missionPipeline.update({
            where: { id: missionId },
            data: {
              metadataJson: {
                ...baseMeta,
                assetIntentContext: ingestResult.entityContext,
                stepOutputs: {
                  ...priorOutputs,
                  ingest_asset_for_intent_detection: ingestResult,
                },
              },
            },
          });
        }
      } catch (e) {
        if (isDev) console.warn('[IntakeV2] asset intent context persist failed:', e?.message);
      }
    }

    const explicitCreateFromUpload = isExplicitCreateStoreFromUploadContext({
      userMessage,
      intentSourceContext,
    });
    const persistedAssetIngest = await resolveAssetIngestContextForStoreDraft({
      intentSourceContext,
      missionId,
    });
    let effectiveIngestResult =
      ingestResult.ok !== false ? ingestResult : persistedAssetIngest;
    if (
      (!effectiveIngestResult || effectiveIngestResult.ok === false) &&
      intentSourceContext?.cardExtraction &&
      typeof intentSourceContext.cardExtraction === 'object'
    ) {
      const fromClientCard = buildAssetIngestFromCardExtraction(intentSourceContext.cardExtraction);
      if (fromClientCard) {
        effectiveIngestResult = {
          ...fromClientCard,
          imageDataUrl: imageDataUrl ?? fromClientCard.imageDataUrl ?? null,
        };
      }
    }
    let { storeCandidate: ingestStoreCandidate, assetExtraction } =
      await resolveStoreCandidateForIntakeTurn({
        userMessage,
        intentSourceContext: {
          ...(intentSourceContext && typeof intentSourceContext === 'object' ? intentSourceContext : {}),
          assetIngestResult: effectiveIngestResult,
        },
        sessionId: intakeAssetSessionKey,
        persistedIngest: persistedAssetIngest,
        ingestResult: effectiveIngestResult,
        imageContext,
        imageDataUrl,
        ocrExtractFn: ocrExtractText,
      });
    const websiteFromAsset = assetExtraction?.website ? String(assetExtraction.website) : null;
    if (websiteFromAsset) {
      const webMeta = await resolveWebsiteMetadataForStoreDraft(websiteFromAsset);
      assetExtraction = mergeAssetExtraction(assetExtraction, webMeta);
    }

    const routeToStoreDraft =
      explicitCreateFromUpload &&
      shouldRouteIngestToStoreCreationDraft({
        ingestResult,
        assetExtraction,
        explicitCreateStore: explicitCreateFromUpload,
        userMessage,
      });

    if (ingestResult.ok && routeToStoreDraft && hasMeaningfulAssetExtraction(assetExtraction)) {
      const storeCreationDraftBundle = buildStoreCreationDraft({
        userMessage,
        classification: {
          ...classification,
          tool: 'create_store',
          parameters: {
            ...cleanedParams,
            ...(assetExtraction.name ? { storeName: assetExtraction.name } : {}),
            ...(assetExtraction.location ? { location: assetExtraction.location } : {}),
            ...(assetExtraction.category ? { storeType: assetExtraction.category, category: assetExtraction.category } : {}),
            ...(assetExtraction.phone ? { phone: assetExtraction.phone } : {}),
            ...(assetExtraction.email ? { email: assetExtraction.email } : {}),
            ...(assetExtraction.website ? { website: assetExtraction.website } : {}),
            source: assetExtraction.source ?? 'ocr',
          },
        },
        memoryContext: contextEngineUserContext,
        assetExtraction,
      });
      const draftResponseText = formatStoreCreationDraftResponseForBundle(storeCreationDraftBundle, {
        documentType: assetExtraction.documentType,
        source: assetExtraction.source,
        storeCandidate: ingestStoreCandidate,
      });
      const documentExtractionArtifact = ingestStoreCandidate
        ? buildDocumentExtractionArtifact(ingestStoreCandidate, { missionId: missionId ?? undefined })
        : null;
      return safeJson(
        {
          success: true,
          action: 'create_store',
          intentMode: storeCreationDraftBundle.intentMode,
          storeCreationDraft: storeCreationDraftBundle,
          missingFields: storeCreationDraftBundle.missingFields,
          response: draftResponseText,
          businessName: storeCreationDraftBundle.draft.name ?? undefined,
          businessType: storeCreationDraftBundle.draft.category ?? undefined,
          imageDataUrl: imageDataUrl ?? ingestStoreCandidate?.imageDataUrl ?? undefined,
          ...(ingestStoreCandidate ? { storeCandidate: ingestStoreCandidate } : {}),
          ...(documentExtractionArtifact ? { documentExtraction: documentExtractionArtifact } : {}),
          assetContext: {
            documentType: assetExtraction.documentType ?? ingestResult.entityContext?.documentType,
            entityContextId: ingestResult.entityContext?.id ?? null,
          },
        },
        {
          classification: { executionPath: 'direct_action', tool: 'create_store', confidence: 1 },
          validated: true,
          downgraded: false,
          validationErrors: [],
          riskLevel: RISK.SAFE_READ,
          result: 'success',
        },
      );
    }

    if (ingestResult.ok && shouldAttachDraftToAssetSelection(ingestResult) && hasMeaningfulAssetExtraction(assetExtraction)) {
      const partialBundle = buildStoreCreationDraft({
        userMessage,
        classification: {
          tool: 'create_store',
          parameters: { source: assetExtraction?.source ?? 'flyer' },
        },
        memoryContext: contextEngineUserContext,
        assetExtraction,
      });
      ingestResult.storeCreationDraft = partialBundle;
      const draftSummary = formatStoreCreationDraftResponseForBundle(partialBundle, {
        documentType: assetExtraction?.documentType,
      });
      ingestResult.draftSummary = draftSummary;
      ingestResult.display = `${draftSummary}\n\nWhat would you like to do with this?`;
    }

    const askStepDocumentExtraction = ingestStoreCandidate
      ? buildDocumentExtractionArtifact(ingestStoreCandidate, { missionId: missionId ?? undefined })
      : null;

    return safeJson(
      {
        success: ingestResult.ok !== false,
        action: 'tool_call',
        tool: 'ingest_asset_for_intent_detection',
        missionId: missionId ?? null,
        parameters: cleanedParams,
        response:
          ingestResult.display ??
          ingestResult.entityContext?.contentDisplay ??
          ingestResult.entityContext?.summary ??
          'What would you like to do with this file?',
        result: ingestResult,
        imageDataUrl: imageDataUrl ?? ingestStoreCandidate?.imageDataUrl ?? undefined,
        ...(ingestStoreCandidate ? { storeCandidate: ingestStoreCandidate } : {}),
        ...(askStepDocumentExtraction ? { documentExtraction: askStepDocumentExtraction } : {}),
      },
      {
        classification: { ...classification, parameters: cleanedParams },
        validated: true,
        downgraded: false,
        downgradeReason: null,
        validationErrors: [],
        riskLevel: RISK.SAFE_READ,
        result: ingestResult.ok ? 'success' : 'error',
      },
    );
  }

  // ── proactive_plan ─────────────────────────────────────────────────────────
  if (
    (classification.executionPath === 'kernel_dispatch' && classification.tool === 'create_campaign') ||
    (classification.executionPath === 'proactive_plan' && isCampaignCheckpointKernelTool(classification.tool))
  ) {
    const classifiedActorId = performerIntakeV2ActorId(req);
    const classifiedUser = performerIntakeV2UserLike(req);
    const prismaClassified = getPrismaClient();
    const { createMissionPipeline } = await import('../lib/missionPipelineService.js');
    const classifiedCampaignDispatch = await runCreateCampaignViaUnifiedDispatch(
      {
        res,
        prisma: prismaClassified,
        user: classifiedUser ?? req.user,
        actorId: classifiedActorId,
        locale,
        userMessage,
        cardbeyTraceId,
        auditSource: 'intake_v2_classified_campaign_checkpoint',
        classification,
        storeId: dispatchStoreId ?? effectiveStoreId ?? storeId ?? null,
        safeJson,
        createMissionPipeline,
      },
      'intake_v2_classified_campaign_checkpoint',
    );
    const classifiedCampaignResponded = await respondCreateCampaignCheckpointDispatch(
      res,
      classifiedCampaignDispatch,
      { locale, safeJson },
    );
    if (classifiedCampaignResponded) return classifiedCampaignResponded;
  }

  const forceCreateStoreCheckpoint = shouldForceCreateStoreCheckpointDispatch({
    classification: { ...classification, parameters: cleanedParams },
    storeCreateForm: storeCreateFormPayload,
    userMessage,
    intentSourceContext,
    imageContext,
  });

  if (
    classification.tool === 'create_store' &&
    !forceCreateStoreCheckpoint &&
    isExplicitCreateStoreFromUploadContext({ userMessage, intentSourceContext })
  ) {
    const uploadDraftBody = await buildCreateStoreDraftIntakeResponseFromUpload({
      userMessage,
      intentSourceContext,
      imageContext,
      imageDataUrl: resolveIntakeImageRefForOcr(body) ?? body.imageDataUrl ?? null,
      classification: { ...classification, parameters: cleanedParams },
      storeCreateForm: storeCreateFormPayload,
      memoryContext: contextEngineUserContext,
      sessionId: intakeAssetSessionKey,
      missionId,
      ocrExtractFn: ocrExtractText,
      persistedIngest: await resolveAssetIngestContextForStoreDraft({
        intentSourceContext,
        missionId,
      }),
    });
    if (uploadDraftBody) {
      return safeJson(uploadDraftBody, {
        classification: { executionPath: 'direct_action', tool: 'create_store', confidence: 1 },
        validated: true,
        downgraded: false,
        validationErrors: [],
        riskLevel,
        result: 'success',
      });
    }
  }

  if (
    forceCreateStoreCheckpoint ||
    (classification.executionPath === 'proactive_plan' && classification.tool === 'create_store')
  ) {
    const classifiedActorId = performerIntakeV2ActorId(req);
    const classifiedUser = performerIntakeV2UserLike(req);
    const prismaClassified = getPrismaClient();
    const { createMissionPipeline } = await import('../lib/missionPipelineService.js');
    const classifiedDispatch = await runCreateStoreViaUnifiedDispatch(
      {
        res,
        prisma: prismaClassified,
        user: classifiedUser ?? req.user,
        actorId: classifiedActorId,
        locale,
        userMessage,
        cardbeyTraceId,
        auditSource: 'intake_v2_classified_checkpoint',
        storeCreateForm: storeCreateFormPayload,
        classification,
        intentSourceContext,
        imageContext,
        safeJson,
        formatDuplicateResponse: formatDuplicateStoreIntakeResponse,
        createMissionPipeline,
      },
      'intake_v2_classified_checkpoint',
    );
    const classifiedResponded = await respondCreateStoreCheckpointDispatch(res, classifiedDispatch, {
      locale,
      safeJson,
      formatDuplicateResponse: formatDuplicateStoreIntakeResponse,
      uploadDraftContext: {
        userMessage,
        intentSourceContext,
        imageContext,
        imageDataUrl: resolveIntakeImageRefForOcr(body) ?? body.imageDataUrl ?? null,
        classification: { ...classification, parameters: cleanedParams },
        storeCreateForm: storeCreateFormPayload,
        memoryContext: contextEngineUserContext,
        sessionId: intakeAssetSessionKey,
        missionId,
        ocrExtractFn: ocrExtractText,
        persistedIngest: await resolveAssetIngestContextForStoreDraft({
          intentSourceContext,
          missionId,
        }),
      },
      explainContext: {
        userId: classifiedActorId ?? null,
        activeStoreName:
          typeof storeCreateFormPayload?.storeName === 'string'
            ? storeCreateFormPayload.storeName.trim()
            : undefined,
      },
    });
    if (classifiedResponded) return classifiedResponded;
  }

  if (classification.executionPath === 'proactive_plan') {
    if (forceCreateStoreCheckpoint) {
      return safeJson(
        {
          success: false,
          action: 'create_store_failed',
          message: 'Store setup could not be started automatically. Please try again.',
          error: 'checkpoint_dispatch_failed',
        },
        {
          classification: { ...classification, parameters: cleanedParams },
          validated: true,
          downgraded: false,
          validationErrors: [],
          riskLevel,
          result: 'error',
        },
      );
    }

    const rawPlan = Array.isArray(classification.plan) ? classification.plan : [];
    // TEMP DEBUG — remove after diagnosis
    console.log(
      '[NormalizePlan] rawPlan:',
      JSON.stringify(rawPlan.map((s) => ({ tool: s?.recommendedTool, role: s?.planRole }))),
    );
    const planIr = resolveIntent({
      userMessage,
      classification,
      storeId,
      draftId,
      conversationHistory: history,
      persistedIntentResolution: loadedPersistedIntent,
    });
    const skipHeroPrereq =
      classification.tool === 'improve_hero' &&
      (planIr.subtype === 'change_hero_image' ||
        classification._intentResolution?.subtype === 'change_hero_image');

    const planDestinationTool = (() => {
      if (!rawPlan.length) return classification.tool;
      const finalTool = rawPlan
        .map((s) => s?.recommendedTool)
        .filter(Boolean)
        .find((t) => {
          const e = getToolEntry(t);
          const role = e?.planRole;
          return role === PLAN_ROLE.FINAL || String(role ?? '').toLowerCase() === 'final';
        });
      if (finalTool) return finalTool;
      const lastTool = rawPlan[rawPlan.length - 1]?.recommendedTool;
      return lastTool && isRegisteredTool(lastTool) ? lastTool : classification.tool;
    })();

    const { normalizedPlan, injectedTools, droppedTools } = normalizePlan(planDestinationTool, rawPlan, {
      skipAnalyzeStorePrerequisite: skipHeroPrereq,
    });

    if (normalizedPlan.length === 0) {
      const irPlan = resolveIntent({
        userMessage,
        classification,
        storeId,
        draftId,
        conversationHistory: history,
        persistedIntentResolution: loadedPersistedIntent,
      });
      const planClarifyOptions = mergeClarifyOptionsFromResolution(
        irPlan,
        userMessage,
        locale,
        [classification.tool].filter(Boolean),
      );
      return safeJson(
        {
          success: true,
          action: 'clarify',
          response: intakeMessage('planBuildFailed', locale),
          options:
            planClarifyOptions.length > 0
              ? planClarifyOptions
              : [
                  { label: toolEntry?.label ?? classification.tool, tool: classification.tool, parameters: cleanedParams },
                ],
        },
        {
          classification,
          validated: true,
          downgraded: true,
          downgradeReason: 'empty_normalized_plan',
          validationErrors: [],
          riskLevel,
          result: 'clarify',
          planMeta: {
            destinationTool: planDestinationTool,
            llmPlanLength: rawPlan.length,
            normalizedPlanLength: 0,
            injectedTools,
            droppedTools,
          },
        },
      );
    }

    let createdMissionId = missionId;
    let planParametersOut =
      cleanedParams && typeof cleanedParams === 'object' && !Array.isArray(cleanedParams) ? { ...cleanedParams } : {};
    if (imageContext?.hasText) {
      planParametersOut = {
        ...planParametersOut,
        campaignContext: `Content extracted from uploaded image:\n${imageContext.extractedText}`,
      };
    }

    const normalizedPlanWithParams = mergePlanLevelParametersIntoSteps(
      normalizedPlan,
      planParametersOut,
      planDestinationTool,
    );

    const proactivePlanActorId = performerIntakeV2ActorId(req) || req.user?.id || null;
    if (!createdMissionId && proactivePlanActorId) {
      const { createMissionPipeline } = await import('../lib/missionPipelineService.js');
      const proactivePlanMissionBase = {
        title: userMessage.slice(0, 200),
        targetType: storeId ? 'store' : 'generic',
        targetId: storeId,
        targetLabel: null,
        metadata: mergeProactivePlanBundleIntoMetadata(
          { source: 'intake_v2', tool: classification.tool },
          { planSteps: normalizedPlanWithParams, planParameters: planParametersOut },
        ),
        requiresConfirmation: false,
        executionMode: 'GUIDED_RUN',
        tenantId: getTenantId(req.user),
        createdBy: proactivePlanActorId,
      };
      const proactivePlanMissionTypes = [
        classification.tool === 'create_store' ? 'store' : (classification.tool ?? 'launch_campaign'),
        'generic',
      ];
      for (const missionType of proactivePlanMissionTypes) {
        if (createdMissionId) break;
        try {
          const pipeline = await createMissionPipeline({
            ...proactivePlanMissionBase,
            type: missionType,
          });
          createdMissionId = pipeline.id;
        } catch (e) {
          console.warn('[IntakeV2] proactive plan pipeline creation failed', {
            missionType,
            message: e?.message || String(e),
          });
        }
      }
    } else if (createdMissionId) {
      try {
        const prisma = getPrismaClient();
        const existing = await prisma.missionPipeline.findUnique({
          where: { id: createdMissionId },
          select: { metadataJson: true },
        });
        if (existing) {
          const nextMeta = mergeProactivePlanBundleIntoMetadata(existing.metadataJson, {
            planSteps: normalizedPlanWithParams,
            planParameters: planParametersOut,
          });
          await prisma.missionPipeline.update({
            where: { id: createdMissionId },
            data: { metadataJson: nextMeta },
          });
        }
      } catch (e) {
        if (isDev) console.warn('[IntakeV2] proactive plan metadata persist failed:', e?.message);
      }
    }

    return safeJson(
      {
        success: true,
        action: 'proactive_plan',
        reasoning: classification._reasoning,
        plan: normalizedPlanWithParams,
        suggestedNextAction: 'start_step_1',
        ctaButtons: ['Start Step 1', 'Add special requirements', 'Execute full plan'],
        missionId: createdMissionId,
        parameters: planParametersOut,
      },
      {
        classification: { ...classification, parameters: planParametersOut },
        validated: true,
        downgraded: classifierDowngraded,
        downgradeReason: classifierReason,
        validationErrors: [],
        riskLevel,
        result: 'success',
        planMeta: {
          destinationTool: planDestinationTool,
          llmPlanLength: rawPlan.length,
          normalizedPlanLength: normalizedPlan.length,
          injectedTools,
          droppedTools,
        },
      },
    );
  }

  // ── direct_action (legacy path when kernel mandatory is off) ───────────────
  if (classification.executionPath === 'direct_action' && classification.tool) {
    const legacyDispatch = await dispatchIntakeV2DirectTool(
      classification.tool,
      cleanedParams,
      { missionId, storeId: dispatchStoreId ?? effectiveStoreId ?? storeId, req, hydratedContext: intakeHydratedContext },
    );
    const { body, telemetryResult } = buildDirectToolDispatchResponse(
      classification.tool,
      legacyDispatch,
      locale,
      { riskLevel, reasoning: classification._reasoning },
    );
    return safeJson(body, {
      classification: { ...classification, parameters: cleanedParams },
      validated: true,
      downgraded: classifierDowngraded,
      downgradeReason: classifierReason,
      validationErrors: [],
      riskLevel,
      result: telemetryResult,
    });
  }


  return safeJson(
    {
      success: true,
      action: 'chat',
      response: intakeMessage('rephraseRequest', locale),
    },
    {
      classification,
      validated: Boolean(lastValidation?.ok),
      downgraded: true,
      downgradeReason: 'unhandled_branch',
      validationErrors: [],
      riskLevel,
      result: 'fallback',
    },
  );
  } catch (err) {
    if (res.headersSent) {
      console.error('[PerformerIntakeV2] error after response sent:', err?.message ?? err);
      return;
    }
    if (isMissionCreateBusyError(err)) {
      return respondMissionCreateBusy(res);
    }
    if (isMissionCreateTimeoutError(err)) {
      return respondMissionCreateTimeout(res);
    }
    console.error('[PerformerIntakeV2] unhandled intake error:', err?.message ?? err);
    return res.status(500).json({
      ok: false,
      error: 'intake_error',
      message: 'Something went wrong. Please try again.',
    });
  }
});

router.post('/maintenance', superAdminOnly, async (req, res) => {
  try {
    const { errorMessage, stackTrace, context: errorContext, missionId } = req.body ?? {};

    if (!errorMessage?.trim()) {
      return res.status(400).json({
        error: 'errorMessage is required for maintenance missions.',
      });
    }

    const existingMission = missionId ? await getMissionById(missionId).catch(() => null) : null;

    const context = buildMaintenanceContext(req, {
      missionId: existingMission?.id ?? req.body?.missionId ?? null,
      storeId: existingMission?.storeId ?? req.body?.storeId ?? null,
    });

    const decision = {
      kind: 'self_patch',
      errorMessage,
      stackTrace: stackTrace ?? '',
      context: errorContext ?? '',
    };

    const gatewayResult = await executionGateway({
      decision,
      context,
      dispatchTool: maintenanceDispatchTool,
    });
    const response = mapPlannerDecisionToIntakeResponse(gatewayResult, context);
    return res.json(response);
  } catch (err) {
    console.error('[intake/v2 POST /maintenance] unhandled:', {
      message: err?.message ?? String(err),
      stack: err?.stack ?? null,
      decisionKind: decision?.kind ?? null,
      userRole: context?.userRole ?? null,
      operatorSession: context?.operatorSession ?? null,
      missionType: context?.missionType ?? null,
    });
    return res.status(500).json({
      error: 'Internal server error.',
      ...(process.env.NODE_ENV !== 'production' ? { detail: err.message } : {}),
    });
  }
});

router.post('/maintenance/confirm', superAdminOnly, async (req, res) => {
  try {
    const { file, patch, missionId, storeId, errorType } = req.body ?? {};

    if (!String(file ?? '').trim() || !String(patch ?? '').trim()) {
      return res.status(400).json({
        error: 'file and patch are required.',
      });
    }

    const context = buildMaintenanceContext(req, {
      missionId: missionId ?? null,
      storeId: storeId ?? null,
      errorType: errorType ?? 'unknown',
    });

    const result = await maintenanceDispatchTool(
      'apply_patch',
      { file: String(file).trim(), patch: String(patch) },
      context,
    );

    const normalized =
      result?.status === 'ok' || result?.status === 'failed' || result?.status === 'blocked'
        ? result
        : { status: 'ok', output: result };

    if (normalized?.status === 'ok' && normalized.output?.status === 'applied') {
      return res.json({
        action: 'patch_applied',
        file: normalized.output.file,
        hunksApplied: normalized.output.hunksApplied,
        backupFile: normalized.output.backupFile,
        auditEntry: normalized.output.auditEntry,
      });
    }

    const errCode = normalized?.error?.code ?? normalized?.output?.error ?? 'APPLY_PATCH_FAILED';
    return res.status(422).json({
      error: errCode,
      detail: normalized?.error?.message ?? null,
    });
  } catch (err) {
    console.error('[performerIntakeV2Routes /maintenance/confirm] unhandled error:', err);
    return res.status(500).json({
      error: 'Internal server error.',
      ...(process.env.NODE_ENV !== 'production' ? { detail: err.message } : {}),
    });
  }
});

router.post('/maintenance/health', superAdminOnly, async (req, res) => {
  try {
    const context = buildMaintenanceContext(req);

    const result = await maintenanceDispatchTool('query_control_tower', {}, context);

    const payload =
      result?.status === 'ok' && result.output != null
        ? result.output
        : result?.status != null
          ? result
          : result;

    return res.json({
      action: 'health_report',
      summary: payload,
      message: formatControlTowerSummary(payload, []),
    });
  } catch (err) {
    console.error('[performerIntakeV2Routes /maintenance/health]', err);
    return res.status(500).json({
      error: 'Internal server error.',
      ...(process.env.NODE_ENV !== 'production' ? { detail: err.message } : {}),
    });
  }
});

router.post('/maintenance/error-log', superAdminOnly, async (req, res) => {
  try {
    const body = req.body ?? {};
    const message = typeof body.message === 'string' ? body.message : '';
    const stackTrace = typeof body.stackTrace === 'string' ? body.stackTrace : '';
    const source = typeof body.source === 'string' && body.source.trim() ? body.source.trim() : 'frontend';
    const timestamp =
      typeof body.timestamp === 'string' && body.timestamp.trim()
        ? body.timestamp.trim()
        : new Date().toISOString();

    const entry = {
      id: crypto.randomUUID(),
      timestamp,
      source,
      message,
      stackTrace,
      resolved: false,
      patchId: null,
    };

    const coreRoot = process.env.CARDBEY_MONOREPO_ROOT
      ? path.resolve(process.env.CARDBEY_MONOREPO_ROOT, 'apps/core/cardbey-core')
      : path.resolve(process.cwd());
    const logPath = path.join(coreRoot, 'error.log.json');
    let entries = [];
    try {
      if (fs.existsSync(logPath)) {
        const parsed = JSON.parse(fs.readFileSync(logPath, 'utf8'));
        entries = Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      entries = [];
    }

    if (entries.length >= 500) {
      entries = entries.slice(-400);
    }
    entries.push(entry);

    fs.writeFileSync(logPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');

    return res.json({ logged: true, id: entry.id });
  } catch (err) {
    console.error('[performerIntakeV2Routes /maintenance/error-log]', err);
    return res.status(500).json({
      error: 'Internal server error.',
      ...(process.env.NODE_ENV !== 'production' ? { detail: err.message } : {}),
    });
  }
});

router.post('/confirm', requireUserOrGuest, async (req, res) => {
  const startMs = Date.now();
  const cardbeyTraceId = getOrCreateCardbeyTraceId(req);
  res.setHeader(CARDBEY_TRACE_HEADER, cardbeyTraceId);
  const body = req.body ?? {};
  const previewId = String(body.previewId ?? '').trim();
  const currentContext = body.currentContext && typeof body.currentContext === 'object' ? body.currentContext : {};
  const storeIdNow = resolveStoreId(currentContext);
  const draftIdNow = resolveDraftId(currentContext);
  const missionId = String(body.missionId ?? currentContext.activeMissionId ?? '').trim() || null;
  const locale = String(body.locale ?? 'en');

  const emitConfirm = (extra) => {
    emitIntakeV2Telemetry({
      tag: 'INTAKE_V2',
      message: `confirm:${previewId}`,
      traceId: cardbeyTraceId,
      missionId,
      storeId: storeIdNow,
      executionPath: 'proactive_plan',
      tool: extra.tool ?? null,
      confidence: null,
      validated: extra.validated ?? null,
      downgraded: Boolean(extra.downgraded),
      downgradeReason: extra.downgradeReason ?? null,
      validationErrors: extra.validationErrors ?? [],
      riskLevel: extra.riskLevel ?? null,
      result: extra.result ?? null,
      latencyMs: Date.now() - startMs,
    });
  };

  if (!previewId) {
    emitConfirm({ validated: false, result: 'error', downgradeReason: 'missing_preview_id' });
    return res.json({
      success: false,
      action: 'error',
      response: intakeMessage('missingApprovalReference', locale),
    });
  }

  const record = getIntakeApprovalPreview(previewId);
  if (!record) {
    emitConfirm({ validated: false, result: 'error', downgradeReason: 'preview_expired' });
    return res.json({
      success: false,
      action: 'error',
      error: 'expired_or_missing',
      response: intakeMessage('approvalExpired', locale),
    });
  }

  const actorNow = resolveIntakeV2ActorKey(req);
  const tenantNow = resolveIntakeV2TenantKey(req);
  if (!actorNow || record.actorKey !== actorNow || record.tenantKey !== tenantNow) {
    emitConfirm({ tool: record.tool, validated: false, result: 'error', downgradeReason: 'actor_mismatch' });
    return res.status(403).json({
      success: false,
      action: 'error',
      error: 'forbidden',
      response: intakeMessage('approvalSessionForbidden', locale),
    });
  }

  const tool = record.tool;
  const effectiveStore = storeIdNow || record.resolvedStoreIdAtPreview;
  const merged = { ...record.executionParameters };
  const storeContextFree =
    STORE_CONTEXT_FREE_TOOLS.has(tool) || isContextFreeTool(tool);

  const toolEntry = getToolEntry(tool);
  const confirmExecutionPath = toolEntry?.executionPath ?? 'proactive_plan';

  // No `if (!storeId || !activeStore)` guard here — confirm fails via validateIntakeClassification.
  // Context-free tools (e.g. device.sendInput) must not inject storeId into strict schemas.
  if (effectiveStore && !merged.storeId && !storeContextFree) merged.storeId = effectiveStore;

  const validation = validateIntakeClassification(
    {
      executionPath: confirmExecutionPath,
      tool,
      parameters: merged,
    },
    storeContextFree ? null : effectiveStore,
    { missionId, draftId: draftIdNow },
  );

  if (!validation.ok) {
    if (isDev) {
      console.warn('[IntakeV2] confirm revalidation failed', {
        tool,
        errors: validation.errors,
        mergedKeys: Object.keys(merged),
      });
    }
    emitConfirm({
      tool,
      validated: false,
      result: 'clarify',
      downgradeReason: 'confirm_revalidation_failed',
      validationErrors: validation.errors,
    });
    return res.json({
      success: false,
      action: 'clarify',
      response: intakeMessage('approvalContextFailed', locale),
      validationErrors: validation.errors,
    });
  }

  const cleaned = validation.cleanedParameters ?? {};

  if (
    shouldGateGuestPostDraftStoreAction({
      req,
      effectiveStoreId: effectiveStore,
      draftId: draftIdNow,
      runway: null,
      missionId,
      tool,
    })
  ) {
    emitConfirm({
      tool,
      validated: false,
      result: 'fallback',
      downgradeReason: 'guest_sign_in_required',
    });
    return res.json({
      success: true,
      action: 'chat',
      response: intakeMessage('signInToAddProducts', locale),
      _requiresStore: true,
      _requiresSignIn: true,
    });
  }

  try {
    const actorId = performerIntakeV2ActorId(req);
    const dispatchResult = await unifiedDispatch(
      {
        type: tool,
        payload: {
          toolName: tool,
          input: cleaned,
          parameters: cleaned,
          missionId,
          storeId: storeContextFree ? undefined : effectiveStore,
          userId: actorId || req.user?.id || null,
          tenantId: getTenantId(req.user),
          locale,
        },
      },
      { confirmed: true, requireConfirmation: false, source: 'intake_v2_confirm' },
    );
    deleteIntakeApprovalPreview(previewId);

    if (!dispatchResult.ok || dispatchResult.status === 'blocked') {
      emitConfirm({
        tool,
        validated: true,
        result: 'error',
        downgradeReason: dispatchResult.code ?? 'kernel_required',
      });
      return res.json({
        success: false,
        action: 'error',
        code: dispatchResult.code ?? 'KERNEL_EXECUTION_REQUIRED',
        response:
          dispatchResult.message ??
          'Direct tool execution is disabled. Execution must go through the Runtime Kernel.',
      });
    }

    const mapped = mapUnifiedDispatchToIntakeResponse(dispatchResult, { tool, locale });
    const toolResponse = mapped.response ?? intakeMessage('actionCompleted', locale);

    emitConfirm({ tool, validated: true, result: 'success', riskLevel: getToolEntry(tool)?.riskLevel });
    return res.json({
      ...mapped,
      response: toolResponse,
      riskLevel: getToolEntry(tool)?.riskLevel,
    });
  } catch (e) {
    emitConfirm({ tool, validated: true, result: 'error', downgradeReason: 'dispatch_error' });
    return res.json({
      success: false,
      action: 'error',
      response: intakeMessage('actionFailedRetry', locale),
    });
  }
});

export default router;
