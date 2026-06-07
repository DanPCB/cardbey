/**
 * POST /api/performer/intake/v2
 *
 * Layers: system shortcuts → classifier → contract validation → plan normalize → execution policy → response.
 *
 * Error shape (route layer): { error: string, detail?: string }
 */

import express from 'express';
import crypto from 'node:crypto';
import { requireUserOrGuest } from '../middleware/guestAuth.js';
import { classifyIntent } from '../lib/intake/intakeClassifier.js';
import {
  detectIntent,
  validateCreateStorePayload,
  detectPosterIntent,
  detectPosterEditIntent,
  detectDeviceIntent,
  blockCreateStoreOnCompletedMission,
} from '../lib/intake/intakeSystemShortcuts.js';
import {
  classifyStoreWebsiteCreateIntent,
  isGuestAllowedStoreWebsiteIntent,
  messageLooksLikeWebsiteCreate,
  messageLooksLikeStoreCreate,
} from '../lib/intake/storeWebsiteRunwayClassifier.js';
import { resolveIntakeLocale } from '../lib/localePrompt.js';
import {
  validateIntakeClassification,
  mergeStoreCreateFormIntoParameters,
  isContextFreeTool,
  CONTEXT_FREE_TOOLS,
} from '../lib/intake/intakeContractValidate.js';

/** Tools that don't require an active store context (confirm + dispatch). */
const STORE_CONTEXT_FREE_TOOLS = CONTEXT_FREE_TOOLS;
import { normalizePlan } from '../lib/intake/intakeNormalizePlan.js';
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
import { executeStoreMissionPipelineRun } from '../lib/storeMission/executeStoreMissionPipelineRun.js';
import { ensureStructuredStoreCheckpointSteps } from '../lib/storeMission/ensureStructuredStoreCheckpointSteps.js';
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
} from '../lib/intake/resolveStoreAmbiguity.js';
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
import { hydrateContext, hydratedContextToPlannerContext } from '../lib/memory/memoryHydrator.js';
import { formatControlTowerSummary } from '../lib/intake/controlTowerQuery.js';
import { normalizeLocale } from '../lib/localePrompt.js';
import { intakeMessage } from '../lib/intake/performerIntakeMessageCatalog.js';
import {
  buildRunwayContext,
  formatContextGapMessage,
  formatSuggestedActionsForContextGap,
  resolveEditableTarget,
} from '../lib/runwayContext.js';
import fs from 'node:fs';
import path from 'node:path';
import {
  createMissionPipelineForIntakeRoute,
  isMissionCreateBusyError,
  isMissionCreateTimeoutError,
  respondMissionCreateBusy,
  respondMissionCreateTimeout,
} from '../lib/mission/missionCreateWrite.js';

function withPipelineLocale(metadata, locale) {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata } : {};
  return { ...base, locale: normalizeLocale(locale ?? base.locale ?? base.preferredLocale ?? base.lang) };
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
  const result = await dispatchTool(toolName, parameters, toolContext);
  if (result?.status === 'ok' && result.output != null) {
    return typeof result.output === 'object' ? result.output : { value: result.output };
  }
  return result;
}

const router = express.Router();
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

function inferStoreTypeFromText(name, location) {
  const text = `${name ?? ''} ${location ?? ''}`.toLowerCase();
  if (/sign|signage|display|billboard|banner/i.test(text)) return 'Signage';
  if (/hair|beauty|salon|spa|nail|barber/i.test(text)) return 'Beauty';
  if (/cafe|coffee|restaurant|food|pizza|sushi|bakery|bar\b/i.test(text)) return 'Food & drink';
  if (/construction|construct|builder|building|contractor|renovat|carpenter|carpentry|trade|trades/i.test(text)) return 'Construction';
  if (/furniture|sofa|chair|decor|home\s+goods|interior/i.test(text)) return 'Home & garden';
  if (/car\s*wash|auto|mechanic|tyre|detailing/i.test(text)) return 'Automotive';
  if (/gym|fitness|yoga|sport|training|pilates/i.test(text)) return 'Sports';
  if (/fashion|cloth|dress|wear|apparel|boutique/i.test(text)) return 'Fashion';
  if (/health|pharmacy|medical|clinic|dental/i.test(text)) return 'Health';
  if (/tech|software|digital|IT\b|computer/i.test(text)) return 'Technology';
  return 'Other';
}

/**
 * Parse business name + location from NL store-creation phrases.
 * @param {string} raw
 * @returns {{ storeName: string | null, location: string | null, storeType: string }}
 */
function parseStoreCreationFromUserMessage(raw) {
  const userMessage = String(raw ?? '').trim();
  if (!userMessage) return { storeName: null, location: null, storeType: 'Other' };
  const nameMatch = userMessage.match(
    /(?:(?:store|shop)\s+for|(?:store|shop)\s+called)\s+["']?(.+?)["']?(?:\s+in\s+|$)/i,
  );
  const locationMatch = userMessage.match(/\bin\s+(.+)$/i);
  let rawName = nameMatch?.[1]?.trim() ?? null;
  let storeName = rawName ? rawName.replace(/^["']+|["']+$/g, '').trim() : null;
  if (!storeName) {
    const tail = userMessage.match(/\b(?:store|shop)\s+for\s+(.+)$/i)?.[1]?.trim() ?? '';
    const splitIdx = tail.search(/\s+in\s+/i);
    const chunk = splitIdx >= 0 ? tail.slice(0, splitIdx) : tail;
    storeName = chunk.replace(/^["']+|["']+$/g, '').trim() || null;
  }
  const rawLocation = locationMatch?.[1]?.trim() ?? null;
  let location = rawLocation ? rawLocation.replace(/^["']+|["']+$/g, '').trim() : null;
  if (storeName && location && storeName.toLowerCase().endsWith(` in ${location.toLowerCase()}`)) {
    storeName = storeName.slice(0, storeName.length - (` in ${location}`).length).trim();
  }
  const cleanName = stripIntentWrappingQuotes(storeName) || null;
  const cleanLocation = stripIntentWrappingQuotes(location) || null;
  const storeType = inferStoreTypeFromText(cleanName, cleanLocation);
  return {
    storeName: cleanName,
    location: cleanLocation,
    storeType,
  };
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
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  return (
    (typeof c.activeStoreId === 'string' && c.activeStoreId.trim()) ||
    (typeof c.storeId === 'string' && c.storeId.trim()) ||
    null
  );
}

function resolveDraftId(ctx) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  return (typeof c.activeDraftId === 'string' && c.activeDraftId.trim()) || null;
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

async function dispatchIntakeV2DirectTool(tool, cleanedParams, { missionId, storeId, req, hydratedContext = null }) {
  const { isBrokerDirectViaFacadeEnabled } = await import('../lib/broker/brokerFlags.js');
  const { isPerformerRuntimeEnabled } = await import('../lib/runtime/performerRuntime/runtimeFlags.js');
  // Stage D: Block only legacy direct_action bypass. Runtime-owned and facade-owned paths remain allowed.
  if (!isPerformerRuntimeEnabled() && !isBrokerDirectViaFacadeEnabled()) {
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
  }
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
  // DANH: skill-round6-document — pass attached image to document ingestion skill
  const intakeImageRef = resolveIntakeImageRefForOcr(req?.body);
  if (intakeImageRef && !payload.imageUrl && !payload.imageDataUrl) {
    payload.imageUrl = intakeImageRef;
    payload.imageDataUrl = intakeImageRef;
  }
  const performeeContextRaw =
    req?.body?.intentSourceContext &&
    typeof req.body.intentSourceContext === 'object' &&
    req.body.intentSourceContext.performeeContext &&
    typeof req.body.intentSourceContext.performeeContext === 'object'
      ? req.body.intentSourceContext.performeeContext
      : null;
  const entry = String(performeeContextRaw?.entry ?? '').trim().toLowerCase();
  const source = entry === 'performee' ? 'performee' : 'performer';
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
    source: isBrokerDirectViaFacadeEnabled() ? 'performer_intake_facade' : source,
  };

  const intentLabel = typeof tool === 'string' ? tool.trim() : '';

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
  //
  // DANH: skill-runtime-phase7
  // userMessage is not a parameter of this function — derive from req.body using
  // the same field order as the main intake handler (text / goal / message).
  const intakeUserMessage =
    String(
      req?.body?.text ?? req?.body?.goal ?? req?.body?.message ?? req?.body?.userMessage ?? '',
    ).trim() || null;

  const legacyWouldMatch = Boolean(skillRegistry.findByTrigger(intentLabel));
  if (!legacyWouldMatch) {
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
      const ok = execution?.status === 'completed';
      return {
        toolResult: {
          status: ok ? 'ok' : 'failed',
          output: {
            skillExecution: execution,
            dispatchedVia: 'skill',
            skillName: skillRouterResult.skillName,
            executionId: skillRouterResult.executionId,
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

  let toolResult;
  if (isPerformerRuntimeEnabled()) {
    const { performerRuntime } = await import('../lib/runtime/performerRuntime/performerRuntime.js');
    const runtimeResult = await performerRuntime.execute({
      actionType: 'dispatch_tool',
      missionId: dispatchMissionId,
      userId: req.user?.id ?? null,
      tenantId: getTenantId(req.user),
      storeId: storeId ?? undefined,
      source: 'performer_intake_v2_runtime',
      payload: { toolName: tool, input: payload, context: toolCtx },
      skipDirectGuard: true,
    });
    toolResult = {
      status: runtimeResult.status,
      ...(runtimeResult.output !== undefined && { output: runtimeResult.output }),
      ...(runtimeResult.error !== undefined && { error: runtimeResult.error }),
      ...(runtimeResult.blocker !== undefined && { blocker: runtimeResult.blocker }),
    };
  } else if (isBrokerDirectViaFacadeEnabled()) {
    const { incrementRuntimeAuthorityMetric } = await import(
      '../lib/runtime/performerRuntime/runtimeAuthorityStaging.js'
    );
    incrementRuntimeAuthorityMetric('directFacadeExecutions');
    const { executeMissionAction } = await import('../lib/execution/executeMissionAction.js');
    const facade = await executeMissionAction({
      actionType: 'dispatch_tool',
      missionId: dispatchMissionId,
      userId: req.user?.id ?? null,
      tenantId: getTenantId(req.user),
      storeId: storeId ?? undefined,
      source: 'performer_intake_facade',
      payload: { toolName: tool, input: payload, context: toolCtx },
    });
    toolResult = {
      status: facade.status,
      ...(facade.output !== undefined && { output: facade.output }),
      ...(facade.error !== undefined && { error: facade.error }),
      ...(facade.blocker !== undefined && { blocker: facade.blocker }),
    };
    if (toolResult.status === 'failed' || toolResult.status === 'blocked') {
      incrementRuntimeAuthorityMetric('executionFailures');
    }
  } else {
    const { dispatchTool } = await import('../lib/toolDispatcher.js');
    const { recordRuntimeBypass } = await import(
      '../lib/runtime/performerRuntime/runtimeAuthorityStaging.js'
    );
    recordRuntimeBypass('legacy_intake', {
      tool,
      missionId: dispatchMissionId,
      source: toolCtx.source,
      path: 'performer_intake_v2_direct_dispatch',
    });
    toolResult = await dispatchTool(tool, payload, toolCtx);
  }
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
  const body = req.body ?? {};
  // Accept both legacy keys (text/goal/message) and the newer client contract key (userMessage).
  const userMessage = String(body.userMessage ?? body.text ?? body.goal ?? body.message ?? '').trim();
  // (debug) removed after guard verified working
  const currentContext = body.currentContext && typeof body.currentContext === 'object' ? body.currentContext : {};
  const missionId = String(body.missionId ?? currentContext.activeMissionId ?? '').trim() || null;
  const locale = resolveIntakeLocale(body.locale ?? req.headers?.['x-locale'], userMessage);
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const serviceRequestThreadBlob = collectUserTextsForServiceDraft(history, userMessage).join('\n');
  const intentSourceContext =
    body.intentSourceContext && typeof body.intentSourceContext === 'object'
      ? body.intentSourceContext
      : null;

  // Dev escape hatch — bypass planner for explicit mission type dispatch
  if (body.missionType === 'multi_agent') {
    const prisma = getPrismaClient();
    const actorId = performerIntakeV2ActorId(req);
    const tenantId = getTenantId(req.user) ?? actorId;
    const storeId =
      String(currentContext.storeId ?? currentContext.activeStoreId ?? body.storeId ?? '').trim() || null;
    const metaIn =
      body.metadataJson && typeof body.metadataJson === 'object' && !Array.isArray(body.metadataJson)
        ? body.metadataJson
        : {};
    const goalFromMeta = typeof metaIn.goal === 'string' && metaIn.goal.trim() ? metaIn.goal.trim() : '';
    const title = String(body.message ?? goalFromMeta ?? 'Multi-agent mission').trim() || 'Multi-agent mission';
    const metadata = {
      ...metaIn,
      ...(goalFromMeta ? { goal: goalFromMeta } : {}),
      locale,
      source: 'intake_v2_escape_hatch',
      cardbeyTraceId,
    };

    const { createMissionPipeline } = await import('../lib/missionPipelineService.js');
    const pipeline = await createMissionPipeline({
      type: 'multi_agent',
      title: title.slice(0, 180),
      targetType: storeId ? 'store' : 'generic',
      targetId: storeId ?? undefined,
      targetLabel: undefined,
      metadata,
      requiresConfirmation: false,
      executionMode: 'AUTO_RUN',
      tenantId,
      createdBy: actorId || null,
    });

    const { runMissionUntilBlocked } = await import('../lib/missionPipelineOrchestrator.js');
    runMissionUntilBlocked(pipeline.id).catch((err) =>
      console.error('[intake/v2] multi_agent pipeline error:', err),
    );

    return res.json({ success: true, missionId: pipeline.id, action: 'multi_agent_dispatched' });
  }

  // ── Maintenance pre-check (super_admin only) ─────────────────────────────
  // This runs before the main classifier/planner so operators can type "check for errors" naturally.
  const existingMission = missionId ? await getMissionById(missionId).catch(() => null) : null;
  const context = await buildContext(req, existingMission);
  context.lastKnownError =
    currentContext?.lastKnownError && typeof currentContext.lastKnownError === 'object'
      ? currentContext.lastKnownError
      : null;

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
    const prisma = getPrismaClient();
    const actorId = performerIntakeV2ActorId(req);
    const tenantId = getTenantId(req.user) ?? actorId;
    const storeId =
      String(currentContext.storeId ?? currentContext.activeStoreId ?? body.storeId ?? '').trim() || null;
    const goal = String(maintenanceDecision.parameters?.goal ?? userMessage).trim();
    const metaIn =
      body.metadataJson && typeof body.metadataJson === 'object' && !Array.isArray(body.metadataJson)
        ? body.metadataJson
        : {};
    const metadata = {
      ...metaIn,
      goal,
      context: maintenanceDecision.parameters?.context ?? '',
      locale,
      source: 'intake_v2_nlp',
      cardbeyTraceId,
    };

    const { createMissionPipeline } = await import('../lib/missionPipelineService.js');
    const pipeline = await createMissionPipeline({
      type: 'multi_agent',
      title: goal.slice(0, 180),
      targetType: storeId ? 'store' : 'generic',
      targetId: storeId ?? undefined,
      targetLabel: undefined,
      metadata,
      requiresConfirmation: false,
      executionMode: 'AUTO_RUN',
      tenantId,
      createdBy: actorId || null,
    });

    const { runMissionUntilBlocked } = await import('../lib/missionPipelineOrchestrator.js');
    runMissionUntilBlocked(pipeline.id).catch((err) =>
      console.error('[intake/v2] multi_agent nlp pipeline error:', err),
    );

    return res.json({
      success: true,
      missionId: pipeline.id,
      action: 'multi_agent_dispatched',
      reasoning: 'Detected complex multi-step goal — running multi-agent orchestration.',
      plan: [
        { step: 1, agent: 'research', description: 'Research and analyze the topic' },
        { step: 2, agent: 'build', description: 'Build the deliverable' },
        { step: 3, agent: 'qa', description: 'Review and validate' },
      ],
    });
  }

  const isServiceRequestProviderSelect =
    intentSourceContext &&
    typeof intentSourceContext === 'object' &&
    String(intentSourceContext.artifactKind ?? '').trim() === 'capability_bridge:service_request' &&
    String(intentSourceContext.bridgeActionId ?? '').trim().startsWith('select_provider:');

  // ── Image Pre-Processing (runs before everything else) ──
  let imageContext = null;
  const hasAnyImageEarly =
    hasIntakeImageAttachment(body) ||
    (typeof body?.imageDataUrl === 'string' && body.imageDataUrl.length > 100);

  if (hasAnyImageEarly) {
    const imageRef = resolveIntakeImageRefForOcr(body);
    if (imageRef) {
      try {
        console.log('[IntakeV2] Pre-processing image with OCR...');
        const ocrResult = await ocrExtractText({
          imageDataUrl: imageRef,
          context: { purpose: 'promo' },
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
  }

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

  // ── Business Card → Smart Store (fire-and-forget enrichment) ──────────────
  // When an image has extractable text and an authenticated user exists,
  // attempt to parse as a business card and spin up the smart store pipeline.
  // If intake did not already create a mission, create one here so image-only
  // auto-submit can still continue into the normal store build flow.
  // This runs in parallel — it never blocks or changes the intake response.
  if (imageContext?.hasText && req.user?.id) {
    void (async () => {
      try {
        const { parseBusinessCardOCR } = await import('../lib/businessCardParser.js');
        const { extractedEntities } = parseBusinessCardOCR(imageContext.extractedText);
        const bizName = extractedEntities?.businessName;
        if (bizName) {
          let effectiveMissionId = missionId;
          if (!effectiveMissionId) {
            try {
              const { createMissionPipeline } = await import('../lib/missionPipelineService.js');
              const pipeline = await createMissionPipeline({
                type: 'store',
                title: `Create store: ${String(bizName).slice(0, 120)}`,
                targetType: 'generic',
                targetId: undefined,
                targetLabel: undefined,
                metadata: withPipelineLocale(
                  {
                    source: 'intake_v2_business_card',
                    businessName: bizName,
                    businessType: extractedEntities?.businessType ?? null,
                  },
                  locale,
                ),
                requiresConfirmation: true,
                executionMode: 'AUTO_RUN',
                tenantId: getTenantId(req.user) ?? tenantKey,
                createdBy: req.user.id,
              });
              effectiveMissionId = pipeline.id;
            } catch (err) {
              if (isMissionCreateBusyError(err) || isMissionCreateTimeoutError(err)) {
                console.warn('[PerformerIntakeV2] business card mission create deferred (non-fatal)', {
                  code: err?.code,
                });
                return;
              }
              if (isDev) console.warn('[IntakeV2] business-card pipeline creation failed:', err?.message ?? err);
            }
          }
          if (!effectiveMissionId) return;
          const cardData = {
            businessName: bizName,
            businessType: extractedEntities?.businessType ?? null,
            phone: Array.isArray(extractedEntities?.phones) ? (extractedEntities.phones[0] ?? null) : null,
            email: extractedEntities?.email ?? null,
            website: extractedEntities?.website ?? null,
            address: extractedEntities?.address ?? null,
            rawText: imageContext.extractedText,
          };
          const resolvedTenantId = getTenantId(req.user) ?? tenantKey;
          const { buildSmartStoreFromCard } = await import('../lib/smartStore/businessCardToStore.js');
          const smartResult = await buildSmartStoreFromCard(effectiveMissionId, cardData, {
            userId: req.user.id,
            tenantId: resolvedTenantId,
          });
          const { emitHealthProbe: _emitProbe } = await import('../lib/telemetry/healthProbes.js');
          _emitProbe('smart_store_from_card', {
            missionId: effectiveMissionId,
            cardExtracted: true,
            websiteEnriched: Boolean(cardData.website),
            itemCount: smartResult?.summary?.itemCount ?? 0,
            draftId: smartResult?.draftId ?? null,
            ok: !smartResult?.error,
          });
        }
      } catch {
        // Non-fatal — never block intake pipeline
      }
    })();
  }

  // ── Attach-Concierge Upload Flow (CC-4) ──────────────────────────────────
  // When a file/image is attached AND the message signals smart-document intent,
  // detect the document type from extracted text and spin up buildSmartDocument.
  // Runs fire-and-forget — does NOT block the intake response.
  const ATTACH_CONCIERGE_RE = /attach|make.*smart|add.*concierge|smart.*doc/i;
  if (imageContext?.hasText && ATTACH_CONCIERGE_RE.test(userMessage) && req.user?.id) {
    void (async () => {
      try {
        const txt = imageContext.extractedText;
        // Keyword scoring to detect doc type
        const scores = {
          report: ['analysis', 'findings', 'data', 'results', 'methodology'].filter((k) => txt.toLowerCase().includes(k)).length,
          proposal: ['quote', 'proposal', 'pricing', 'total', 'amount', 'services'].filter((k) => txt.toLowerCase().includes(k)).length,
          menu_pdf: ['menu', 'dish', 'price', 'serves', 'ingredients'].filter((k) => txt.toLowerCase().includes(k)).length,
          invoice: ['agreement', 'terms', 'conditions', 'parties', 'clause'].filter((k) => txt.toLowerCase().includes(k)).length,
        };
        const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
        const detectedSubtype = best[1] > 0 ? best[0] : 'business';
        const resolvedTenantId = getTenantId(req.user) ?? tenantKey;
        const { buildSmartDocument: _buildSD } = await import('../lib/smartDocument/buildSmartDocument.js');
        await _buildSD(
          missionId ?? null,
          {
            type: 'report',
            subtype: detectedSubtype,
            artifactText: txt.slice(0, 2000),
            businessName: typeof currentContext?.activeStoreName === 'string' ? currentContext.activeStoreName : 'My Business',
          },
          { userId: req.user.id, tenantId: resolvedTenantId },
        );
      } catch {
        // Non-fatal
      }
    })();
  }

  const selection =
    body.intakeV2Selection && typeof body.intakeV2Selection === 'object' ? body.intakeV2Selection : null;
  const isSelectionConfirm = Boolean(selection);
  const forcedTool = selection ? String(selection.selectedTool ?? '').trim() : '';
  const forcedParams =
    selection?.selectedParameters && typeof selection.selectedParameters === 'object' && !Array.isArray(selection.selectedParameters)
      ? selection.selectedParameters
      : {};
  const originalGoal = selection ? String(selection.originalGoal ?? userMessage).trim() : '';

  let storeId = resolveStoreId(currentContext);
  // DANH: store-disambiguation — replay store pick from clarify chip (intakeV2Selection)
  const selectionStoreId = String(forcedParams?.storeId ?? forcedParams?.activeStoreId ?? '').trim();
  if (!storeId && selectionStoreId) {
    storeId = selectionStoreId;
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
  const effectiveStoreId = storeId || runway.activeStoreId || performeeStoreId;
  /** Store id used for validation + dispatch (may auto-resolve single-store owners). */
  let dispatchStoreId = effectiveStoreId;
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

  const safeJson = (payload, telExtra = {}) => {
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
    emitIntakeV2Telemetry({
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
    return res.json(responsePayload);
  };

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

  // ── 1) System shortcuts ────────────────────────────────────────────────────
  if (!forcedTool) {
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

    let shortcut = detectIntent({
      userMessage,
      auth: { userId: req.user?.id ?? null, isGuest: !req.user },
      primaryMode: body.primaryMode,
      primaryModeHint: body.primaryModeHint,
      intentSource: body.intentSource,
      storeCreateForm:
        body.storeCreateForm && typeof body.storeCreateForm === 'object' && !Array.isArray(body.storeCreateForm)
          ? body.storeCreateForm
          : undefined,
    });

    // Guest / free-text pre-classifier: VI + EN store/website phrases → create_store shortcut
    // (without requiring frontscreen primaryMode handoff).
    if (!shortcut?.type && userMessage && isGuestAllowedStoreWebsiteIntent(userMessage)) {
      const runway = classifyStoreWebsiteCreateIntent(userMessage);
      if (!runway.ambiguous && runway.intentMode) {
        shortcut = {
          type: 'create_store',
          intentMode: runway.intentMode,
          ...(runway.label ? { intentLabel: runway.label } : {}),
        };
      }
    }

    if (shortcut?.type === 'clarify_create_runway') {
      const clarifyMsg =
        shortcut.message || intakeMessage('clarifyCreateRunway', locale);
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

    const posterIntent = detectPosterIntent(userMessage, effectiveStoreId);
    if (posterIntent && !forcedTool) {
      try {
        const { toolResult, payload } = await dispatchIntakeV2DirectTool(
          posterIntent.tool,
          posterIntent.params,
          { missionId, storeId: effectiveStoreId, req },
        );

        const poster = toolResult?.output?.poster ?? null;
        const toolResponse =
          toolResult?.output?.message ||
          (poster?.businessName
            ? intakeMessage('posterCreatedFor', locale, { businessName: poster.businessName })
            : toolResult?.error?.message) || intakeMessage('posterGenerateFailed', locale);

        return safeJson(
          {
            success: true,
            action: 'tool_call',
            tool: 'generate_poster',
            missionId: payload.missionId ?? missionId ?? null,
            parameters: payload,
            response: toolResponse,
            result: toolResult?.output ?? null,
          },
          {
            classification: {
              executionPath: 'direct_action',
              tool: 'generate_poster',
              confidence: posterIntent.confidence,
              parameters: posterIntent.params,
            },
            validated: true,
            downgraded: false,
            validationErrors: [],
            riskLevel: RISK.STATE_CHANGE,
            result: toolResult?.status === 'ok' ? 'success' : 'error',
          },
        );
      } catch (e) {
        if (isDev) console.warn('[IntakeV2] generate_poster shortcut failed:', e?.message);
      }
    }

    if (shortcut?.type === 'create_store') {
      const midForGuard = typeof missionId === 'string' ? missionId.trim() : '';
      if (midForGuard) {
        const prismaGuard = getPrismaClient();
        const missionRow = await prismaGuard.missionPipeline.findUnique({
          where: { id: midForGuard },
          select: { status: true },
        });
        if (blockCreateStoreOnCompletedMission(missionRow?.status, 'create_store')) {
          shortcut = null;
        }
      }
    }

    if (shortcut?.type === 'create_store') {
      const rawForm =
        body.storeCreateForm && typeof body.storeCreateForm === 'object' && !Array.isArray(body.storeCreateForm)
          ? body.storeCreateForm
          : null;

      const ctxIntentMode = shortcut.intentMode === 'website' ? 'website' : 'store';

      let businessName = '';
      let businessType = 'Other';
      let locationTrim = '';

      if (rawForm) {
        const validationErrors = validateCreateStorePayload({
          storeCreateForm: rawForm,
          storeName: rawForm.storeName,
          location: rawForm.location,
          category: rawForm.category ?? rawForm.storeType ?? rawForm.businessType,
        });
        if (validationErrors.length > 0) {
          return res.status(400).json({
            success: false,
            action: 'validation_error',
            errors: validationErrors,
          });
        }
        businessName = stripIntentWrappingQuotes(String(rawForm.storeName ?? '').trim()) || '';
        businessType =
          String(rawForm.storeType ?? rawForm.category ?? rawForm.businessType ?? 'Other').trim() || 'Other';
        locationTrim = stripIntentWrappingQuotes(String(rawForm.location ?? '').trim()) || '';
      } else {
        const { storeName: parsedStoreName, location, storeType } = parseStoreCreationFromUserMessage(userMessage);
        businessName = stripIntentWrappingQuotes(String(parsedStoreName ?? '').trim()) || '';
        businessType = String(storeType ?? 'Other').trim() || 'Other';
        locationTrim = stripIntentWrappingQuotes(location != null ? String(location).trim() : '') || '';

        if (businessName && locationTrim && locationTrim.length < 2) {
          return res.status(400).json({
            success: false,
            action: 'validation_error',
            errors: [
              {
                field: 'location',
                message: 'Please enter a full city or suburb name (e.g. Melbourne)',
              },
            ],
          });
        }
      }

      if (!businessName) {
        return safeJson(
          {
            success: true,
            action: 'create_store',
            intentMode: ctxIntentMode === 'website' ? 'website' : 'store',
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

      const actorId = performerIntakeV2ActorId(req);
      const userLike = performerIntakeV2UserLike(req);
      if (!actorId || !userLike) {
        return safeJson(
          {
            success: true,
            action: 'chat',
            response: intakeMessage('signInAutomatedStore', locale),
          },
          {
            classification: { executionPath: 'direct_action', tool: 'create_store', confidence: 1 },
            validated: true,
            downgraded: false,
            validationErrors: [],
            riskLevel: RISK.SAFE_READ,
            result: 'auth_required',
          },
        );
      }

      const prismaShortcut = getPrismaClient();
      const dupShortcut = await findDuplicateBusinessNameForUser(prismaShortcut, userLike.id, businessName);
      if (dupShortcut) {
        return safeJson(
          {
            success: true,
            action: 'duplicate_store',
            message: `You already have a store called "${businessName}". Use a different name.`,
          },
          {
            classification: { executionPath: 'direct_action', tool: 'create_store', confidence: 1 },
            validated: true,
            downgraded: false,
            validationErrors: [],
            riskLevel: RISK.STATE_CHANGE,
            result: 'duplicate_store',
          },
        );
      }

      const tenantId = getTenantId(req.user) ?? actorId;
      const titlePrefix = ctxIntentMode === 'website' ? 'Create mini website' : 'Create store';
      const { createMissionPipeline } = await import('../lib/missionPipelineService.js');
      const createResult = await createMissionPipelineForIntakeRoute(res, createMissionPipeline, {
        type: 'store',
        title: `${titlePrefix}: ${businessName.slice(0, 120)}`,
        targetType: 'store',
        targetId: undefined,
        targetLabel: undefined,
        metadata: {
          businessName,
          businessType,
          location: locationTrim,
          websiteMode: ctxIntentMode === 'website',
          generateWebsite: ctxIntentMode === 'website',
          intentMode: ctxIntentMode === 'website' ? 'website' : 'store',
          source: 'intake_v2_shortcut',
          cardbeyTraceId,
        },
        requiresConfirmation: true,
        executionMode: 'AUTO_RUN',
        tenantId,
        createdBy: actorId,
      });
      if (createResult.handled) return;
      const pipeline = createResult.pipeline;

      await ensureStructuredStoreCheckpointSteps(prismaShortcut, pipeline.id, { logPrefix: '[PerformerIntakeV2]' });

      const currencyCode =
        inferCurrencyFromLocationText(locationTrim) || inferCurrencyFromLocationText(businessName) || 'AUD';
      const normalizedStoreName =
        classification.parameters?.storeName ??
        classification.parameters?.businessName ??
        businessName ??
        null;
      const runResult = await executeStoreMissionPipelineRun({
        prisma: prismaShortcut,
        user: userLike,
        missionId: pipeline.id,
        body: {
          businessName: normalizedStoreName,
          businessType,
          location: locationTrim,
          currencyCode,
          intentMode: ctxIntentMode === 'website' ? 'website' : 'store',
          rawUserText: userMessage,
          cardbeyTraceId,
        },
        auditSource: 'intake_v2_shortcut_contract',
      });

      if (runResult.ok) {
        if (runResult.mode === 'checkpoint_pipeline' && process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.log(
            '[PerformerIntakeV2] shortcut create_store → Phase 3 checkpoint pipeline (paused for owner; no orchestra build yet)',
            { missionId: runResult.missionId, orchestration: runResult.orchestration },
          );
        }
        const responseText =
          runResult.mode === 'checkpoint_pipeline'
            ? ctxIntentMode === 'website'
              ? intakeMessage('storeCheckpointWebsite', locale, { businessName })
              : intakeMessage('storeCheckpointStore', locale, { businessName })
            : ctxIntentMode === 'website'
              ? intakeMessage('storeBuildingWebsite', locale, { businessName })
              : intakeMessage('storeBuildingStore', locale, { businessName });
        return safeJson(
          {
            success: true,
            action: 'store_mission_started',
            response: responseText,
            missionId: runResult.missionId,
            jobId: runResult.jobId,
            generationRunId: runResult.generationRunId,
            draftId: runResult.draftId,
            intentMode: ctxIntentMode === 'website' ? 'website' : 'store',
            storeMissionSummary: {
              businessName,
              businessType,
              location: locationTrim,
            },
          },
          {
            classification: {
              executionPath: 'direct_action',
              tool: 'create_store',
              confidence: 1,
              parameters: {
                storeName: businessName,
                location: locationTrim || null,
                storeType: businessType,
                intentMode: ctxIntentMode === 'website' ? 'website' : 'store',
                _autoSubmit: true,
              },
            },
            validated: true,
            downgraded: false,
            validationErrors: [],
            riskLevel: RISK.STATE_CHANGE,
            result: 'success',
          },
        );
      }

      console.error('[PerformerIntakeV2] shortcut create_store pipeline failed:', JSON.stringify(runResult));
      return res.status(Math.min(Math.max(Number(runResult.statusCode) || 500, 400), 599)).json({
        success: false,
        action: 'create_store_failed',
        message:
          typeof runResult.message === 'string' && runResult.message.trim()
            ? runResult.message
            : 'Store setup could not be started.',
        error: typeof runResult.error === 'string' ? runResult.error : 'pipeline_run_failed',
      });
    }
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
      parameters: { ...forcedParams },
      message: undefined,
      plan: undefined,
      clarifyOptions: undefined,
    };
    if (originalGoal && !String(classification.parameters.description ?? '').trim() && forcedTool === 'code_fix') {
      classification.parameters = { ...classification.parameters, description: originalGoal };
    }
  } else {
    // Performee slideshow: narrow deterministic override (still flows through Intake V2 validation + dispatch).
    const msgLower = userMessage.toLowerCase();
    const performeeWantsSlideshow =
      performeeContext &&
      String(performeeContext.entry ?? '').trim() === 'performee' &&
      (msgLower === 'create slideshow' ||
        msgLower === 'create a slideshow' ||
        msgLower === 'make slideshow' ||
        msgLower === 'slideshow' ||
        msgLower.includes('export') && msgLower.includes('slideshow'));
    if (performeeWantsSlideshow) {
      classification = {
        executionPath: 'direct_action',
        tool: 'generate_slideshow',
        confidence: 0.95,
        parameters: {
          ...(effectiveStoreId ? { storeId: effectiveStoreId } : {}),
        },
      };
    } else {
    try {
      if (
        process.env.PERFORMER_CHAT_AGENT_LOOP === 'true' &&
        body.agentLoop !== false &&
        !isSelectionConfirm &&
        !isServiceRequestProviderSelect
      ) {
        const { runPerformerPreIntakeAgentLoop } = await import('../lib/performer/performerChatAgentLoop.js');
        const loopOut = await runPerformerPreIntakeAgentLoop({
          userMessage,
          baseEnrichedMessage: enrichedUserMessageWithHint,
          locale,
          conversationHistory: history,
          storeId: effectiveStoreId,
          draftId,
          missionId,
          req,
        });
        agentLoopTraceForResponse = loopOut.trace ?? null;
        const skipPreIntakeDirectChat =
          loopOut.mode === 'direct_chat' &&
          loopOut.response &&
          signalsServiceRequest(userMessage);
        if (loopOut.mode === 'direct_chat' && loopOut.response && !skipPreIntakeDirectChat) {
          const agentLoopCapabilityExtras = await buildIntakeV2AgentLoopChatCapabilityExtras({
            userMessage,
            enrichedMessage: classifierInputMessage,
            locale,
            hasImage: hasAnyImageEarly,
            imageOcrHasText: Boolean(imageContext?.hasText),
            storeId,
            draftId,
            missionId,
            responseText: loopOut.response,
            extractedSnippet: imageContext?.hasText ? imageContext.extractedText : null,
            conversationHistory: history,
          });
          return safeJson(
            {
              success: true,
              action: 'chat',
              response: agentLoopCapabilityExtras.effectiveResponseText,
              reasoning: loopOut.reasoning ?? '',
              agentTrace: loopOut.trace,
              capabilityResolution: agentLoopCapabilityExtras.capabilityResolution,
              ...(agentLoopCapabilityExtras.capabilityBridge
                ? { capabilityBridge: agentLoopCapabilityExtras.capabilityBridge }
                : {}),
            },
            {
              classification: {
                executionPath: 'chat',
                tool: 'general_chat',
                confidence: 0.95,
                parameters: {},
                _reasoning: loopOut.reasoning ?? '',
              },
              validated: true,
              downgraded: false,
              downgradeReason: null,
              validationErrors: [],
              riskLevel: RISK.SAFE_READ,
              result: 'agent_loop_direct_chat',
            },
          );
        }
        classifierInputMessage = loopOut.messageForClassifier ?? classifierInputMessage;
      }

      try {
        intakeHydratedContext = await hydrateContext({
          message: classifierInputMessage,
          userId: intakeActorKey ?? performerIntakeV2ActorId(req),
          missionId,
          activeStoreId: effectiveStoreId,
          sessionContext: currentContext,
        });
      } catch (hydrateMainErr) {
        console.error('[intake/v2] hydrateContext (classifier) failed:', hydrateMainErr?.message ?? hydrateMainErr);
      }
      const classifierStoreId =
        intakeHydratedContext?.entities?.store?.id ?? effectiveStoreId ?? null;

      classification = await classifyIntent({
        userMessage: classifierInputMessage,
        storeContext: { storeId: classifierStoreId, draftId, missionId },
        conversationHistory: history,
        locale,
        tenantKey,
        missionId,
        hydratedContext: intakeHydratedContext,
      });
    } catch (e) {
      if (isDev) console.error('[IntakeV2] classifyIntent threw', e);
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

    if (!forcedTool && signalsServiceRequest(userMessage)) {
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
          executionPath: 'direct_action',
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

    // Always set _autoSubmit: true for create_store —
    // this is a pipeline execution decision, not the LLM's.
    // Form envelope fields are merged when present.
    classification = {
      ...classification,
      parameters: {
        ...(storeFormEnvelope
          ? mergeStoreCreateFormIntoParameters(classification.parameters, storeFormEnvelope)
          : classification.parameters),
        _autoSubmit: true,
      },
    };
  }

  // Deterministic website intentMode detection.
  // The LLM may omit intentMode:'website' even when the
  // user said "mini website" — detect it from the raw
  // message and override so the pipeline uses the correct runway.
  if (classification?.tool === 'create_store') {
    const msgLower = String(userMessage ?? body?.text ?? '').toLowerCase();
    const llmMode = String(classification.parameters?.intentMode ?? '').trim().toLowerCase();
    const isWebsite = llmMode === 'website' || looksWebsiteCreateIntent(msgLower);
    if (isWebsite) {
      classification = {
        ...classification,
        parameters: {
          ...classification.parameters,
          intentMode: 'website',
        },
      };
    }
  }

  let cleanedParams = {};
  /** @type {{ decision: string, reason?: string }} */
  let policy = { decision: 'execute' };
  let toolEntry = null;
  let riskLevel = RISK.SAFE_READ;
  /** Last validation result (for telemetry / fallback branches). */
  let lastValidation = /** @type {{ ok: boolean, errors?: unknown[], downgradedTo?: string } | null} */ (null);

  const intakeActorUserId = req.user?.id ?? performerIntakeV2ActorId(req) ?? null;

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
        return safeJson(
          {
            success: true,
            action: 'clarify',
            clarifyType: ambiguity.clarifyType,
            response: ambiguity.question,
            options,
            pendingIntent: ambiguity.pendingIntent,
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
      { missionId },
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
          return safeJson(
            {
              success: true,
              action: 'clarify',
              clarifyType: ambiguity.clarifyType,
              response: ambiguity.question,
              options,
              pendingIntent: ambiguity.pendingIntent,
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
      const msg = formatContextGapMessage(runway, locale);
      return safeJson(
        {
          success: true,
          action: 'chat',
          response: msg,
          _requiresStore: true,
          suggestedActions: formatSuggestedActionsForContextGap(runway),
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

    const rawPolicyConfidence =
      typeof classification.confidence === 'number' && !Number.isNaN(classification.confidence)
        ? classification.confidence
        : 0;
    // create_store is STATE_CHANGE: low model confidence would otherwise force clarify even when
    // validation passed and the user (or prompt) set _autoSubmit — same runway as shortcut/mission.
    const policyConfidence =
      classification.tool === 'create_store' &&
      classification.executionPath === 'direct_action' &&
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

  if (classification.executionPath === 'chat' || classification.executionPath === 'service_request') {
    if (
      classification.executionPath === 'chat' &&
      (classification.tool === 'analyze_content' ||
        (classification.tool === 'general_chat' && hasAnyImageEarly))
    ) {
      const responseText = imageContext?.hasText
        ? `Here's what I found in the image:\n\n${imageContext.extractedText}`
        : classification.message || 'I can see an image was attached. What would you like to do with it?';

      const isCreationIntent = /creat|launch|build|make|campaign|promot/i.test(enrichedUserMessage);

      if (isCreationIntent && imageContext?.hasText) {
        const planSteps = [
          { step: 1, title: 'Market Research', recommendedTool: 'market_research' },
          { step: 2, title: 'Create Promotional Content', recommendedTool: 'create_promotion' },
          { step: 3, title: 'Launch Campaign', recommendedTool: 'launch_campaign' },
        ];
        return safeJson(
          {
            success: true,
            action: 'proactive_plan',
            response: `I've read your image and extracted the key information. Here's the campaign plan I'll build from it:`,
            plan: planSteps,
            parameters: {
              campaignContext: `Content extracted from uploaded image:\n${imageContext.extractedText}`,
            },
          },
          {
            classification: {
              ...classification,
              tool: 'market_research',
              executionPath: 'proactive_plan',
            },
            validated: true,
            downgraded: false,
            downgradeReason: null,
            validationErrors: [],
            riskLevel: 'safe_read',
            result: 'proactive_plan',
          },
        );
      }

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

    // Gap check for commercial intents routed to general_chat
    if (
      isIntakeV2CapabilityGapEnabled() &&
      classification.tool === 'general_chat' &&
      COMMERCIAL_INTENT_RE.test(userMessage)
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

  // ── proactive_plan ─────────────────────────────────────────────────────────
  if (classification.executionPath === 'proactive_plan') {
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
    if (!createdMissionId && req.user?.id) {
      try {
        const { createMissionPipeline } = await import('../lib/missionPipelineService.js');
        const pipeline = await createMissionPipeline({
          type: classification.tool ?? 'launch_campaign',
          title: userMessage.slice(0, 200),
          targetType: storeId ? 'store' : 'generic',
          targetId: storeId,
          targetLabel: null,
          metadata: { source: 'intake_v2', tool: classification.tool },
          requiresConfirmation: false,
          executionMode: 'GUIDED_RUN',
          tenantId: getTenantId(req.user),
          createdBy: req.user.id,
        });
        createdMissionId = pipeline.id;
      } catch (e) {
        if (isDev) console.warn('[IntakeV2] pipeline creation failed:', e?.message);
      }
    }

    let planParametersOut =
      cleanedParams && typeof cleanedParams === 'object' && !Array.isArray(cleanedParams) ? { ...cleanedParams } : {};
    if (imageContext?.hasText) {
      planParametersOut = {
        ...planParametersOut,
        campaignContext: `Content extracted from uploaded image:\n${imageContext.extractedText}`,
      };
    }

    return safeJson(
      {
        success: true,
        action: 'proactive_plan',
        reasoning: classification._reasoning,
        plan: normalizedPlan,
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

  // ── direct_action ───────────────────────────────────────────────────────────
  if (classification.executionPath === 'direct_action' && classification.tool) {
    const tool = classification.tool;

    if (tool === 'code_fix') {
      const description = String(cleanedParams.description ?? userMessage).trim();
      return safeJson(
        {
          success: true,
          action: 'tool_call',
          tool: 'code_fix',
          parameters: { ...cleanedParams, description },
          reasoning: classification._reasoning,
          requiresConfirmation: true,
          response: 'Analysing and preparing a fix proposal.',
        },
        {
          classification: { ...classification, parameters: { ...cleanedParams, description } },
          validated: true,
          downgraded: classifierDowngraded,
          downgradeReason: classifierReason,
          validationErrors: [],
          riskLevel,
          result: 'success',
        },
      );
    }

    const postBuildHandler = POST_BUILD_CHIP_HANDLERS[tool];
    if (postBuildHandler) {
      const blackboardContextRaw = body.blackboardContext;
      const blackboardContext =
        blackboardContextRaw && typeof blackboardContextRaw === 'object' && !Array.isArray(blackboardContextRaw)
          ? /** @type {Record<string, unknown>} */ (blackboardContextRaw)
          : null;
      const storeContext = {
        storeId: effectiveStoreId ?? storeId ?? null,
        draftId,
        missionId,
      };
      const chipResult = await postBuildHandler({
        blackboardContext,
        storeContext,
        missionId,
        userId: req.user?.id ?? req.userId ?? null,
      });
      if (chipResult?.action === 'message') {
        return safeJson(
          {
            success: true,
            action: 'chat',
            response: String(chipResult.message ?? '').trim() || 'OK.',
          },
          {
            classification: { ...classification, parameters: cleanedParams },
            validated: true,
            downgraded: classifierDowngraded,
            downgradeReason: classifierReason,
            validationErrors: [],
            riskLevel,
            result: 'fallback',
          },
        );
      }
      if (chipResult?.action === 'open_ui') {
        await maybeAppendOpenUiCompletedAction(missionId, tool, cleanedParams);
      }
      if (chipResult?.action === 'published' && missionId) {
        try {
          await appendMissionBlackboardEvent(missionId, 'completed_action', {
            tool: 'publish_store',
            family: 'publishing',
            liveUrl: chipResult.liveUrl ?? null,
            storeId: chipResult.storeId ?? null,
            completedAt: new Date().toISOString(),
          });
        } catch {
          /* non-fatal */
        }
      }
      return safeJson(
        {
          success: true,
          action: 'tool_call',
          tool,
          parameters: cleanedParams,
          missionId,
          response: String(chipResult?.message ?? '').trim() || 'OK.',
          result: {
            action: chipResult.action,
            ui: chipResult.ui ?? null,
            storeId: chipResult.storeId ?? null,
            generationRunId: chipResult.generationRunId ?? null,
            draftId: chipResult.draftId ?? null,
            message: chipResult.message ?? null,
            liveUrl: chipResult.liveUrl ?? null,
            slug: chipResult.slug ?? null,
          },
          reasoning: classification._reasoning,
        },
        {
          classification: { ...classification, parameters: cleanedParams },
          validated: true,
          downgraded: classifierDowngraded,
          downgradeReason: classifierReason,
          validationErrors: [],
          riskLevel,
          result: 'success',
        },
      );
    }

    if (tool === 'create_store' && cleanedParams._autoSubmit === true) {
      const pillLine = parsePillMessage(userMessage);
      if (pillLine?.storeName) {
        const psn = String(pillLine.storeName).trim();
        if (psn) {
          cleanedParams = {
            ...cleanedParams,
            storeName: String(cleanedParams.storeName ?? '').trim() || psn,
            businessName: String(cleanedParams.businessName ?? '').trim() || psn,
            ...(pillLine.location && !String(cleanedParams.location ?? '').trim()
              ? { location: pillLine.location }
              : {}),
            ...(pillLine.category && !String(cleanedParams.storeType ?? '').trim()
              ? { storeType: pillLine.category }
              : {}),
            ...(pillLine.intentMode === 'website' ? { intentMode: 'website' } : {}),
          };
        }
      }

      const fromPill = pillLine?.storeName && String(pillLine.storeName).trim();
      const { storeName: nlStoreName, location: nlLocation, storeType: nlStoreType } = fromPill
        ? {
            storeName: stripIntentWrappingQuotes(String(pillLine.storeName).trim()),
            location: pillLine.location != null ? String(pillLine.location).trim() : null,
            storeType:
              (pillLine.category && String(pillLine.category).trim()) ||
              inferStoreTypeFromText(pillLine.storeName, pillLine.location),
          }
        : parseStoreCreationFromUserMessage(userMessage);
      const paramStoreType = String(cleanedParams.storeType ?? '').trim();
      const storeType =
        paramStoreType && paramStoreType.toLowerCase() !== 'other'
          ? paramStoreType
          : nlStoreType || 'Other';
      const cleanedParamsStoreName = stripIntentWrappingQuotes(String(cleanedParams.storeName ?? '').trim());
      const cleanedParamsBusinessName = stripIntentWrappingQuotes(String(cleanedParams.businessName ?? '').trim());
      const fromNlStoreName =
        nlStoreName != null ? stripIntentWrappingQuotes(String(nlStoreName).trim()) : '';
      /** Log / NL fallback only — resolved name must NOT use currentContext (previous mission / surface store). */
      const storeNameFromParams = cleanedParamsStoreName || fromNlStoreName || '';
      const location =
        cleanedParams.location != null && String(cleanedParams.location).trim()
          ? String(cleanedParams.location).trim()
          : nlLocation != null
            ? nlLocation
            : '';

      const actorId = performerIntakeV2ActorId(req);
      const userLike = performerIntakeV2UserLike(req);
      if (!actorId || !userLike) {
        return safeJson(
          {
            success: true,
            action: 'chat',
            response: intakeMessage('signInAutomatedStore', locale),
          },
          {
            classification: { ...classification, parameters: cleanedParams },
            validated: true,
            downgraded: false,
            downgradeReason: null,
            validationErrors: [],
            riskLevel,
            result: 'fallback',
          },
        );
      }

      const prisma = getPrismaClient();
      const ctxIntentMode =
        cleanedParams.intentMode != null ? String(cleanedParams.intentMode).trim().toLowerCase() : 'store';
      const locationTrim = stripIntentWrappingQuotes(String(location ?? '').trim()) || '';

      /** New-store name: classifier + NL parse only — never currentContext / Business row name (stale prior store). */
      let businessName =
        cleanedParamsStoreName || cleanedParamsBusinessName || fromNlStoreName || '';
      let businessType = String(storeType ?? 'Other').trim() || 'Other';

      if (ctxIntentMode === 'website' && currentContext && typeof currentContext === 'object') {
        const sid = resolveStoreId(currentContext);
        let storeRow = null;
        if (sid) {
          storeRow = await prisma.business
            .findFirst({
              where: { id: sid, userId: userLike.id },
              select: { type: true },
            })
            .catch(() => null);
        }
        if (
          storeRow?.type &&
          (!String(storeType ?? '').trim() || String(storeType ?? '').trim().toLowerCase() === 'other')
        ) {
          businessType = String(storeRow.type).trim() || businessType;
        }
      }

      if (!businessName) {
        return safeJson(
          {
            success: true,
            action: 'create_store',
            intentMode: ctxIntentMode === 'website' ? 'website' : 'store',
          },
          {
            classification: { ...classification, parameters: cleanedParams },
            validated: true,
            downgraded: true,
            downgradeReason: 'missing_name',
            validationErrors: [],
            riskLevel,
            result: 'fallback',
          },
        );
      }

      const hasStructuredStoreForm =
        body.storeCreateForm && typeof body.storeCreateForm === 'object' && !Array.isArray(body.storeCreateForm);
      if (hasStructuredStoreForm) {
        const preSubmitErrs = validateCreateStorePayload({
          storeName: businessName,
          location: locationTrim,
          category: businessType,
          storeCreateForm: body.storeCreateForm,
        });
        if (preSubmitErrs.length > 0) {
          return res.status(400).json({
            success: false,
            action: 'validation_error',
            errors: preSubmitErrs,
          });
        }
      } else if (locationTrim && locationTrim.length < 2) {
        return res.status(400).json({
          success: false,
          action: 'validation_error',
          errors: [
            {
              field: 'location',
              message: 'Please enter a full city or suburb name (e.g. Melbourne)',
            },
          ],
        });
      }

      const dupAuto = await findDuplicateBusinessNameForUser(prisma, userLike.id, businessName);
      if (dupAuto) {
        return safeJson(
          {
            success: true,
            action: 'duplicate_store',
            message: `You already have a store called "${businessName}". Use a different name.`,
          },
          {
            classification: { ...classification, parameters: cleanedParams },
            validated: true,
            downgraded: false,
            downgradeReason: null,
            validationErrors: [],
            riskLevel,
            result: 'duplicate_store',
          },
        );
      }

      const tenantId = getTenantId(req.user) ?? actorId;
      const titlePrefix = ctxIntentMode === 'website' ? 'Create mini website' : 'Create store';
      const pipelineTitle = `${titlePrefix}: ${businessName.slice(0, 120)}`;

      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log('[PerformerIntakeV2] create_store autosubmit name trace', {
          missionIdFromBody: missionId,
          storeNameFromParams,
          cleanedParamsStoreName,
          cleanedParamsBusinessName,
          businessNameResolved: businessName,
          ctxIntentMode,
        });
      }

      const { createMissionPipeline } = await import('../lib/missionPipelineService.js');

      const patchableStatuses = new Set([
        'requested',
        'planned',
        'awaiting_confirmation',
        'queued',
        'executing',
        'awaiting_input',
      ]);
      const existingMissionId = typeof missionId === 'string' ? missionId.trim() : '';
      const forceNewStoreMission =
        body.freshStoreMission === true ||
        body.freshStore === true ||
        body.newStore === true;
      let pipeline = null;
      if (existingMissionId && !forceNewStoreMission) {
        const access = await resolveAccessibleMission(userLike, existingMissionId);
        if (access.ok && access.kind === 'mission_pipeline') {
          const existing = await prisma.missionPipeline.findUnique({
            where: { id: existingMissionId },
            select: { id: true, type: true, status: true, metadataJson: true },
          });
          if (
            existing &&
            String(existing.type || '').toLowerCase() === 'store' &&
            patchableStatuses.has(String(existing.status || '').trim())
          ) {
            const prevMeta =
              existing.metadataJson && typeof existing.metadataJson === 'object' && !Array.isArray(existing.metadataJson)
                ? existing.metadataJson
                : {};
            const mergedMeta = {
              ...prevMeta,
              businessName,
              businessType,
              location: locationTrim,
              websiteMode: ctxIntentMode === 'website',
              generateWebsite: ctxIntentMode === 'website',
              intentMode: ctxIntentMode === 'website' ? 'website' : 'store',
              cardbeyTraceId: cardbeyTraceId ?? prevMeta.cardbeyTraceId,
            };
            await prisma.missionPipeline.update({
              where: { id: existingMissionId },
              data: {
                title: pipelineTitle,
                metadataJson: mergedMeta,
              },
            });
            pipeline = { id: existingMissionId };
            if (process.env.NODE_ENV !== 'production') {
              // eslint-disable-next-line no-console
              console.log('[PerformerIntakeV2] patched existing store pipeline title/metadata', {
                missionId: existingMissionId,
                title: pipelineTitle,
              });
            }
          }
        }
      }

      if (!pipeline) {
        const createResult = await createMissionPipelineForIntakeRoute(res, createMissionPipeline, {
          type: 'store',
          title: pipelineTitle,
          targetType: 'store',
          targetId: undefined,
          targetLabel: undefined,
          metadata: withPipelineLocale(
            {
              businessName,
              businessType,
              location: locationTrim,
              websiteMode: ctxIntentMode === 'website',
              generateWebsite: ctxIntentMode === 'website',
              intentMode: ctxIntentMode === 'website' ? 'website' : 'store',
              source: 'intake_v2_autosubmit',
              cardbeyTraceId,
            },
            locale,
          ),
          requiresConfirmation: true,
          executionMode: 'AUTO_RUN',
          tenantId,
          createdBy: actorId,
        });
        if (createResult.handled) return;
        pipeline = createResult.pipeline;
      }

      await ensureStructuredStoreCheckpointSteps(prisma, pipeline.id, { logPrefix: '[PerformerIntakeV2]' });

      const currencyCode =
        inferCurrencyFromLocationText(locationTrim) || inferCurrencyFromLocationText(businessName) || 'AUD';
      const runResult = await executeStoreMissionPipelineRun({
        prisma,
        user: userLike,
        missionId: pipeline.id,
        body: {
          businessName,
          businessType,
          location: locationTrim,
          currencyCode,
          intentMode: ctxIntentMode === 'website' ? 'website' : 'store',
          rawUserText: userMessage,
          cardbeyTraceId,
        },
        auditSource: 'intake_v2_autosubmit_contract',
      });

      if (!runResult.ok) {
        console.error('[PerformerIntakeV2] autosubmit create_store pipeline failed:', JSON.stringify(runResult));
        return res.status(Math.min(Math.max(Number(runResult.statusCode) || 500, 400), 599)).json({
          success: false,
          action: 'create_store_failed',
          message:
            typeof runResult.message === 'string' && runResult.message.trim()
              ? runResult.message
              : 'Store setup could not be started.',
          error: typeof runResult.error === 'string' ? runResult.error : 'pipeline_run_failed',
        });
      }

      if (runResult.mode === 'checkpoint_pipeline' && process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log(
          '[PerformerIntakeV2] autosubmit create_store → Phase 3 checkpoint pipeline (paused for owner; no orchestra build yet)',
          { missionId: runResult.missionId, orchestration: runResult.orchestration },
        );
      }
      const responseText =
        runResult.mode === 'checkpoint_pipeline'
          ? ctxIntentMode === 'website'
            ? intakeMessage('storeCheckpointWebsite', locale, { businessName })
            : intakeMessage('storeCheckpointStore', locale, { businessName })
          : ctxIntentMode === 'website'
            ? intakeMessage('storeBuildingWebsite', locale, { businessName })
            : intakeMessage('storeBuildingStore', locale, { businessName });
      return safeJson(
        {
          success: true,
          action: 'store_mission_started',
          intentMode: ctxIntentMode === 'website' ? 'website' : 'store',
          response: responseText,
          missionId: runResult.missionId,
          jobId: runResult.jobId,
          generationRunId: runResult.generationRunId,
          draftId: runResult.draftId,
          storeMissionSummary: {
            businessName,
            businessType,
            location: locationTrim,
          },
        },
        {
          classification: { ...classification, parameters: cleanedParams },
          validated: true,
          downgraded: classifierDowngraded,
          downgradeReason: classifierReason,
          validationErrors: [],
          riskLevel,
          result: 'success',
        },
      );
    }

    if (tool === 'create_store') {
      const outIntent =
        cleanedParams.intentMode != null && String(cleanedParams.intentMode).trim().toLowerCase() === 'website'
          ? 'website'
          : 'store';
      return safeJson(
        {
          success: true,
          action: 'create_store',
          intentMode: outIntent,
        },
        {
          classification: { ...classification, parameters: cleanedParams },
          validated: true,
          downgraded: classifierDowngraded,
          downgradeReason: classifierReason,
          validationErrors: [],
          riskLevel,
          result: 'success',
        },
      );
    }

    const editArtifactHeroImageQuick =
      tool === 'edit_artifact' &&
      String(cleanedParams.artifactType ?? '').toLowerCase() === 'hero' &&
      /image|photo|picture|banner|visual|stock|pexels|professional\s+photo/i.test(
        String(cleanedParams.instruction ?? cleanedParams.description ?? userMessage ?? ''),
      );

    if (toolEntry?.approvalRequired && tool !== 'code_fix' && !isSelectionConfirm && !editArtifactHeroImageQuick) {
      return issueApprovalRequired({
        req,
        safeJson,
        tool,
        cleanedParams,
        storeId,
        userMessage,
        locale,
        classification,
        riskLevel,
      });
    }

    // Hero edit_artifact Turn 2 uses POST /api/performer/proactive-step, which requires a real MissionPipeline row.
    let directToolMissionId = missionId;
    if (
      !directToolMissionId &&
      req.user?.id &&
      tool === 'edit_artifact' &&
      String(cleanedParams.artifactType ?? '').toLowerCase() === 'hero'
    ) {
      try {
        const { createMissionPipeline } = await import('../lib/missionPipelineService.js');
        const pipeline = await createMissionPipeline({
          type: 'edit_artifact',
          title: userMessage.slice(0, 200) || 'Hero image',
          targetType: storeId ? 'store' : 'generic',
          targetId: storeId,
          targetLabel: null,
          metadata: { source: 'intake_v2', tool: 'edit_artifact', artifactType: 'hero' },
          requiresConfirmation: true,
          executionMode: 'GUIDED_RUN',
          tenantId: getTenantId(req.user),
          createdBy: req.user.id,
        });
        directToolMissionId = pipeline.id;
      } catch (e) {
        if (isDev) console.warn('[IntakeV2] mission pipeline for edit_artifact hero failed:', e?.message);
      }
    }

    const capabilityResolvedBody = buildCapabilityResolvedDirectToolBody(tool, cleanedParams, {
      userMessage,
      locale,
      missionId: directToolMissionId,
      storeId,
      currentContext,
      classification,
      riskLevel,
      persistedIntent: loadedPersistedIntent ?? null,
    });

    if (capabilityResolvedBody) {
      return safeJson(capabilityResolvedBody, {
        classification: { ...classification, parameters: cleanedParams },
        validated: true,
        downgraded: classifierDowngraded,
        downgradeReason: classifierReason,
        validationErrors: [],
        riskLevel,
        result: capabilityResolvedBody.success ? 'success' : 'deferred',
      });
    }

    try {
      const { toolResult, payload } = await dispatchIntakeV2DirectTool(tool, cleanedParams, {
        missionId: directToolMissionId,
        storeId: dispatchStoreId ?? effectiveStoreId ?? storeId,
        req,
        hydratedContext: intakeHydratedContext,
      });

      const { body: intakeBody, telemetryResult } = buildDirectToolIntakeResponse(tool, toolResult, payload, locale, {
        riskLevel,
        reasoning: classification._reasoning,
      });

      return safeJson(intakeBody, {
        classification: { ...classification, parameters: cleanedParams },
        validated: true,
        downgraded: classifierDowngraded,
        downgradeReason: classifierReason,
        validationErrors: [],
        riskLevel,
        result: telemetryResult,
      });
    } catch (e) {
      return safeJson(
        {
          success: true,
          action: 'chat',
          response: intakeMessage('dispatchActionFailed', locale),
        },
        {
          classification,
          validated: true,
          downgraded: true,
          downgradeReason: 'dispatch_error',
          validationErrors: [],
          riskLevel,
          result: 'error',
        },
      );
    }
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

    const result = await dispatchTool(
      'apply_patch',
      { file: String(file).trim(), patch: String(patch) },
      context,
    );

    if (result?.status === 'ok' && result.output?.status === 'applied') {
      return res.json({
        action: 'patch_applied',
        file: result.output.file,
        hunksApplied: result.output.hunksApplied,
        backupFile: result.output.backupFile,
        auditEntry: result.output.auditEntry,
      });
    }

    const errCode = result?.error?.code ?? result?.output?.error ?? 'APPLY_PATCH_FAILED';
    return res.status(422).json({
      error: errCode,
      detail: result?.error?.message ?? null,
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

    const result = await dispatchTool('query_control_tower', {}, context);

    return res.json({
      action: 'health_report',
      summary: result,
      message: formatControlTowerSummary(result, []),
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
  const missionId = String(body.missionId ?? currentContext.activeMissionId ?? '').trim() || null;
  const locale = String(body.locale ?? 'en');

  const emitConfirm = (extra) => {
    emitIntakeV2Telemetry({
      tag: 'INTAKE_V2',
      message: `confirm:${previewId}`,
      traceId: cardbeyTraceId,
      missionId,
      storeId: storeIdNow,
      executionPath: 'direct_action',
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

  // No `if (!storeId || !activeStore)` guard here — confirm fails via validateIntakeClassification.
  // Context-free tools (e.g. device.sendInput) must not inject storeId into strict schemas.
  if (effectiveStore && !merged.storeId && !storeContextFree) merged.storeId = effectiveStore;

  const validation = validateIntakeClassification(
    {
      executionPath: 'direct_action',
      tool,
      parameters: merged,
    },
    storeContextFree ? null : effectiveStore,
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

  try {
    const { toolResult, payload } = await dispatchIntakeV2DirectTool(tool, cleaned, {
      missionId,
      storeId: storeContextFree ? undefined : effectiveStore,
      req,
    });
    deleteIntakeApprovalPreview(previewId);

    const toolResponse =
      toolResult?.output?.message ||
      toolResult?.blocker?.message ||
      toolResult?.error?.message ||
      intakeMessage('actionCompleted', locale);

    emitConfirm({ tool, validated: true, result: 'success', riskLevel: getToolEntry(tool)?.riskLevel });
    return res.json({
      success: true,
      action: 'tool_call',
      tool,
      parameters: payload,
      response: toolResponse,
      result: toolResult?.output ?? null,
      artifacts: toolResult?.output?.artifacts ?? [],
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
