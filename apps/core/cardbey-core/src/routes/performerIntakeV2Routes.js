/**
 * POST /api/performer/intake/v2
 *
 * Layers: system shortcuts → classifier → contract validation → plan normalize → execution policy → response.
 */

import express from 'express';
import { requireUserOrGuest } from '../middleware/guestAuth.js';
import { classifyIntent } from '../lib/intake/intakeClassifier.js';
import { detectIntent } from '../lib/intake/intakeSystemShortcuts.js';
import {
  validateIntakeClassification,
  mergeStoreCreateFormIntoParameters,
} from '../lib/intake/intakeContractValidate.js';
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
  buildHeroImageClarifyOptions,
  isHeroUiInstructionFallback,
  tryHeroAutoVisualDirectAction,
} from '../lib/intake/intakeHeroImageClarify.js';
import { getTenantId } from '../lib/missionAccess.js';
import { getPrismaClient } from '../lib/prisma.js';
import { executeStoreMissionPipelineRun } from '../lib/storeMission/executeStoreMissionPipelineRun.js';
import { ensureStructuredStoreCheckpointSteps } from '../lib/storeMission/ensureStructuredStoreCheckpointSteps.js';
import { inferCurrencyFromLocationText } from '../services/draftStore/currencyInfer.js';
import { buildCard } from '../lib/cards/buildCard.js';
import { createEmitContextUpdate } from '../lib/missionPlan/agentMemory.js';
import { mergeMissionContext } from '../lib/mission.js';
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
} from '../lib/capabilityResolver/resolveCapability.js';
import { maybeBuildCapabilityBridgeArtifact } from '../lib/capabilityResolver/maybeBuildCapabilityBridgeArtifact.js';
import { buildIntakeV2AgentLoopChatCapabilityExtras } from '../lib/capabilityResolver/buildIntakeV2AgentLoopChatCapabilityExtras.js';
import {
  buildServiceRequestMissingPrompt,
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
  const msgLower = String(raw ?? '').toLowerCase();
  return (
    msgLower.includes('mini website') ||
    msgLower.includes('mini-website') ||
    msgLower.includes('mini-site') ||
    msgLower.includes('microsite') ||
    msgLower.includes('micro-site') ||
    msgLower.includes('web presence') ||
    msgLower.includes('build a website') ||
    msgLower.includes('build website') ||
    msgLower.includes('create a website') ||
    msgLower.includes('create website') ||
    msgLower.includes('create my website') ||
    msgLower.includes('make a website') ||
    msgLower.includes('set up a website') ||
    msgLower.includes('create a site') ||
    msgLower.includes('build a site') ||
    msgLower.includes('make a site') ||
    msgLower.includes('set up a site') ||
    msgLower.includes('create a web presence') ||
    msgLower.includes('build a web presence') ||
    msgLower.includes('website from card') ||
    msgLower.includes('website from attached card') ||
    msgLower.includes('site from card') ||
    msgLower.includes('site from attached card') ||
    msgLower.includes('website for my store') ||
    msgLower.includes('website for my business')
  );
}

function looksStoreCreateIntent(raw) {
  const msgLower = String(raw ?? '').toLowerCase();
  return (
    msgLower.includes('create a store') ||
    msgLower.includes('create store') ||
    msgLower.includes('create my store') ||
    msgLower.includes('build a store') ||
    msgLower.includes('build store') ||
    msgLower.includes('make a store') ||
    msgLower.includes('set up a store') ||
    msgLower.includes('open store') ||
    msgLower.includes('new store')
  );
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
  if (storeId && !execParams.storeId) execParams.storeId = storeId;
  const actorKey = resolveIntakeV2ActorKey(req);
  const scopeTenantKey = resolveIntakeV2TenantKey(req);
  if (!actorKey) {
    return safeJson(
      {
        success: true,
        action: 'chat',
        response: locale === 'vi' ? 'Cần đăng nhập để tiếp tục.' : 'Please sign in to continue.',
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
      response:
        locale === 'vi'
          ? 'Xem lại bên dưới và xác nhận trước khi chạy.'
          : 'Review the preview below, then confirm to run.',
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

async function dispatchIntakeV2DirectTool(tool, cleanedParams, { missionId, storeId, req }) {
  const { dispatchTool } = await import('../lib/toolDispatcher.js');
  const dispatchMissionId = missionId ?? `intake-v2-${Date.now()}`;
  const payload = { ...cleanedParams, missionId: dispatchMissionId };
  if (storeId && !payload.storeId) payload.storeId = storeId;
  const performeeContextRaw =
    req?.body?.intentSourceContext &&
    typeof req.body.intentSourceContext === 'object' &&
    req.body.intentSourceContext.performeeContext &&
    typeof req.body.intentSourceContext.performeeContext === 'object'
      ? req.body.intentSourceContext.performeeContext
      : null;
  const entry = String(performeeContextRaw?.entry ?? '').trim().toLowerCase();
  const source = entry === 'performee' ? 'performee' : 'performer';
  const toolResult = await dispatchTool(tool, payload, {
    missionId: dispatchMissionId,
    userId: req.user?.id ?? null,
    createdBy: req.user?.id ?? null,
    tenantId: getTenantId(req.user),
    storeId: storeId ?? undefined,
    source,
  });
  return { toolResult, payload };
}

router.post('/', requireUserOrGuest, async (req, res) => {
  const startMs = Date.now();
  const cardbeyTraceId = getOrCreateCardbeyTraceId(req);
  res.setHeader(CARDBEY_TRACE_HEADER, cardbeyTraceId);
  const body = req.body ?? {};
  const userMessage = String(body.text ?? body.goal ?? body.message ?? '').trim();
  const currentContext = body.currentContext && typeof body.currentContext === 'object' ? body.currentContext : {};
  const missionId = String(body.missionId ?? currentContext.activeMissionId ?? '').trim() || null;
  const locale = String(body.locale ?? 'en');
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const serviceRequestThreadBlob = collectUserTextsForServiceDraft(history, userMessage).join('\n');
  const intentSourceContext =
    body.intentSourceContext && typeof body.intentSourceContext === 'object'
      ? body.intentSourceContext
      : null;

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
    classifierHintForWeakImage =
      locale === 'vi'
        ? '\n\n[Hệ thống: có ảnh đính kèm nhưng OCR không đọc được chữ (hoặc không có ảnh hợp lệ). Ưu tiên executionPath chat với tool analyze_content nếu người dùng muốn hiểu nội dung hình; hoặc mời họ mô tả ảnh. Đừng trả lời như thể không có ảnh.]'
        : '\n\n[System: an image is attached but OCR extracted no readable text (or the image could not be decoded). Prefer executionPath chat with tool analyze_content when the user asks what is in the image; otherwise invite them to describe it. Do not reply as if no image was provided.]';
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
                metadata: {
                  source: 'intake_v2_business_card',
                  businessName: bizName,
                  businessType: extractedEntities?.businessType ?? null,
                },
                requiresConfirmation: true,
                executionMode: 'AUTO_RUN',
                tenantId: getTenantId(req.user) ?? tenantKey,
                createdBy: req.user.id,
              });
              effectiveMissionId = pipeline.id;
            } catch (err) {
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

  const storeId = resolveStoreId(currentContext);
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
  /** Read-only derived store context: allow Performee spaceId to act as storeId for classification/runtime without writing any client context. */
  const effectiveStoreId = storeId || performeeStoreId;
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

  if (selection && !forcedTool) {
    return safeJson(
      {
        success: true,
        action: 'clarify',
        response: locale === 'vi' ? 'Thiếu lựa chọn công cụ.' : 'Missing tool selection.',
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
        response: locale === 'vi' ? 'Lựa chọn không hợp lệ.' : 'That selection is no longer valid.',
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
        response: locale === 'vi' ? 'Bạn muốn làm gì?' : 'What would you like to do?',
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
    const shortcut = detectIntent({ userMessage, auth: { userId: req.user?.id ?? null, isGuest: !req.user } });

    // ── SmartDocument intent (CC-4) — AUTO_RUN, requires auth ──────────────
    const { sdType, sdSubtype } = detectSmartDocumentIntent(userMessage);
    if (sdType) {
      if (!req.user?.id) {
        return safeJson(
          {
            success: true,
            action: 'chat',
            response:
              locale === 'vi'
                ? 'Đăng nhập để tạo tài liệu thông minh.'
                : 'Please sign in to create a smart document.',
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
          response:
            locale === 'vi'
              ? `Đang tạo ${sdSubtype ?? sdType} của bạn…`
              : `Started creating your ${sdSubtype ?? sdType}…`,
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
            response:
              locale === 'vi'
                ? 'Đăng nhập để tạo thẻ thông minh.'
                : 'Please sign in to create an intelligent card.',
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
          response:
            locale === 'vi'
              ? 'Đang tạo thẻ của bạn…'
              : 'Started creating your card…',
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

    if (shortcut?.type === 'create_store') {
      if (shortcut.intentMode === 'website') {
        return safeJson(
          {
            success: true,
            action: 'create_store',
            intentMode: shortcut.intentMode,
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

      const { storeName: parsedStoreName, location, storeType } = parseStoreCreationFromUserMessage(userMessage);
      const businessName = stripIntentWrappingQuotes(String(parsedStoreName ?? '').trim()) || '';
      const businessType = String(storeType ?? 'Other').trim() || 'Other';
      const locationTrim = stripIntentWrappingQuotes(location != null ? String(location).trim() : '') || '';

      if (!businessName) {
        return safeJson(
          {
            success: true,
            action: 'create_store',
            intentMode: 'store',
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
            response:
              locale === 'vi'
                ? 'Đăng nhập để tự động tạo cửa hàng từ tin nhắn của bạn.'
                : 'Please sign in to start an automated store build from your message.',
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

      const tenantId = getTenantId(req.user) ?? actorId;
      const { createMissionPipeline } = await import('../lib/missionPipelineService.js');
      const pipeline = await createMissionPipeline({
        type: 'store',
        title: `Create store: ${businessName.slice(0, 120)}`,
        targetType: 'store',
        targetId: undefined,
        targetLabel: undefined,
        metadata: {
          businessName,
          businessType,
          location: locationTrim,
          websiteMode: false,
          generateWebsite: false,
          intentMode: 'store',
          source: 'intake_v2_shortcut',
          cardbeyTraceId,
        },
        requiresConfirmation: true,
        executionMode: 'AUTO_RUN',
        tenantId,
        createdBy: actorId,
      });

      const prismaShortcut = getPrismaClient();
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
          intentMode: 'store',
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
            ? locale === 'vi'
              ? `Một vài lựa chọn nhanh trước khi tạo cửa hàng cho "${businessName}"…`
              : `A few quick choices before we build "${businessName}"…`
            : locale === 'vi'
              ? `Đang tạo cửa hàng cho "${businessName}"…`
              : `Started building your store for "${businessName}"…`;
        return safeJson(
          {
            success: true,
            action: 'store_mission_started',
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
            classification: {
              executionPath: 'direct_action',
              tool: 'create_store',
              confidence: 1,
              parameters: {
                storeName: businessName,
                location: locationTrim || null,
                storeType: businessType,
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

      return safeJson(
        {
          success: true,
          action: 'create_store',
          intentMode: 'store',
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
  }

  let classifierDowngraded = false;
  let classifierReason = null;

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
        if (loopOut.mode === 'direct_chat' && loopOut.response) {
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

      classification = await classifyIntent({
        userMessage: classifierInputMessage,
        storeContext: { storeId: effectiveStoreId, draftId },
        conversationHistory: history,
        locale,
        tenantKey,
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
          response:
            locale === 'vi'
              ? 'Chọn cửa hàng trước, rồi mình có thể cập nhật ảnh hero cho bạn.'
              : 'Select a store first — then I can update your hero image.',
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
        return safeJson(
          {
            success: true,
            action: 'clarify',
            response:
              locale === 'vi'
                ? 'Tôi có thể cập nhật ảnh hero. Bạn muốn dùng ảnh nào?'
                : 'I can update your hero image. What would you like to use?',
            options: buildHeroImageClarifyOptions(locale, userMessage),
          },
          {
            classification: {
              executionPath: 'clarify',
              tool: 'improve_hero',
              confidence: typeof classification.confidence === 'number' ? classification.confidence : 0,
              parameters: { focus: userMessage },
            },
            validated: true,
            downgraded: false,
            downgradeReason: 'hero_image_missing_asset',
            validationErrors: [],
            riskLevel: RISK.STATE_CHANGE,
            result: 'clarify',
          },
        );
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
      effectiveStoreId,
    );
    lastValidation = validation;

    if (!validation.ok && validation.downgradedTo === 'chat') {
      return safeJson(
        {
          success: true,
          action: 'chat',
          response:
            locale === 'vi'
              ? 'Vui lòng chọn hoặc tạo cửa hàng trước.'
              : 'Please select or create a store first so I can help you with that.',
          _requiresStore: true,
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
              response:
                locale === 'vi'
                  ? 'Yêu cầu này có thể cần mở rộng sản phẩm. Xem đề xuất bên dưới (chỉ xem trước — chưa thay đổi gì).'
                  : 'This may need a small product extension. Review the proposal below — nothing has been applied yet.',
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
          response:
            locale === 'vi'
              ? 'Tôi cần thêm chi tiết để tiếp tục.'
              : 'I need a bit more detail to run that safely.',
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
            (locale === 'vi' ? 'Bạn muốn chọn hướng nào?' : "I'm not sure — pick an option:"),
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
            (locale === 'vi'
              ? 'Xác nhận giúp mình nhé?'
              : `Should I go ahead with "${fe?.label ?? classification.tool}"?`),
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

  if (classification.executionPath === 'chat') {
    if (
      classification.tool === 'analyze_content' ||
      (classification.tool === 'general_chat' && hasAnyImageEarly)
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

    const defaultChat =
      locale === 'vi'
        ? 'Bạn có thể mô tả thêm không?'
        : "I'm not sure how to help with that. Could you give me more details?";
    const rawMsg =
      typeof classification.message === 'string' && classification.message.trim()
        ? classification.message.trim()
        : defaultChat;

    if (
      isHeroUiInstructionFallback(rawMsg) &&
      isHeroImageChangeMessage(userMessage) &&
      storeId &&
      !hasIntakeImageAttachment(body)
    ) {
      return safeJson(
        {
          success: true,
          action: 'clarify',
          response:
            locale === 'vi'
              ? 'Tôi có thể cập nhật ảnh hero. Bạn muốn dùng ảnh nào?'
              : 'I can update your hero image. What would you like to use?',
          options: buildHeroImageClarifyOptions(locale, userMessage),
        },
        {
          classification: {
            ...classification,
            executionPath: 'clarify',
            tool: 'improve_hero',
            parameters: { ...cleanedParams, focus: userMessage },
          },
          validated: true,
          downgraded: true,
          downgradeReason: 'hero_ui_instruction_replaced',
          validationErrors: [],
          riskLevel,
          result: 'clarify',
        },
      );
    }

    const responseOut = isHeroUiInstructionFallback(rawMsg)
      ? locale === 'vi'
        ? 'Mình có thể cập nhật ảnh hero qua các bước cụ thể — hãy chọn cửa hàng hoặc mô tả ảnh bạn muốn.'
        : 'I can help update your hero image with a concrete step — select a store or describe the image you want.'
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
        adjustedResponseOut = buildServiceRequestMissingPrompt(serviceRequestDraft, userMessage, locale);
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
          response: locale === 'vi' ? 'Chưa đủ bước cho kế hoạch.' : 'I could not build a valid plan from that.',
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

    if (tool === 'create_store' && cleanedParams._autoSubmit === true) {
      // Phase 4C: route through normalized contract instead of calling
      // startAutomatedStoreBuildFromIntake directly.
      // executeStoreMissionPipelineRun is the shared helper that keeps store-run behavior identical.
      const { storeName: nlStoreName, location: nlLocation, storeType: nlStoreType } =
        parseStoreCreationFromUserMessage(userMessage);
      const paramStoreType = String(cleanedParams.storeType ?? '').trim();
      const storeType =
        paramStoreType && paramStoreType.toLowerCase() !== 'other'
          ? paramStoreType
          : nlStoreType || 'Other';
      const storeNameFromParams =
        String(cleanedParams.storeName ?? '').trim() || (nlStoreName != null ? nlStoreName : '');
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
            response:
              locale === 'vi'
                ? 'Đăng nhập để tự động tạo cửa hàng từ tin nhắn của bạn.'
                : 'Please sign in to start an automated store build from your message.',
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

      let businessName = stripIntentWrappingQuotes(String(storeNameFromParams ?? '').trim()) || '';
      let businessType = String(storeType ?? 'Other').trim() || 'Other';

      if (ctxIntentMode === 'website' && currentContext && typeof currentContext === 'object') {
        const sid = resolveStoreId(currentContext);
        let storeRow = null;
        if (sid) {
          storeRow = await prisma.business
            .findFirst({
              where: { id: sid, userId: userLike.id },
              select: { name: true, type: true },
            })
            .catch(() => null);
        }
        if (!businessName) {
          const fromCtx =
            (typeof currentContext.storeName === 'string' && currentContext.storeName.trim()) ||
            (typeof currentContext.activeStoreName === 'string' && currentContext.activeStoreName.trim()) ||
            '';
          businessName = stripIntentWrappingQuotes(fromCtx) || businessName;
          if (storeRow?.name) {
            businessName = stripIntentWrappingQuotes(String(storeRow.name).trim()) || businessName;
          }
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

      const tenantId = getTenantId(req.user) ?? actorId;
      const { createMissionPipeline } = await import('../lib/missionPipelineService.js');
      const pipeline = await createMissionPipeline({
        type: 'store',
        title: `Create store: ${businessName.slice(0, 120)}`,
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
          source: 'intake_v2_autosubmit',
          cardbeyTraceId,
        },
        requiresConfirmation: true,
        executionMode: 'AUTO_RUN',
        tenantId,
        createdBy: actorId,
      });

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
            downgradeReason: runResult.error ?? 'store_auto_failed',
            validationErrors: [],
            riskLevel,
            result: 'fallback',
          },
        );
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
            ? locale === 'vi'
              ? `Một vài lựa chọn nhanh trước khi tạo trang web mini cho "${businessName}"…`
              : `A few quick choices before we build your mini website for "${businessName}"…`
            : locale === 'vi'
              ? `Một vài lựa chọn nhanh trước khi tạo cửa hàng cho "${businessName}"…`
              : `A few quick choices before we build "${businessName}"…`
          : ctxIntentMode === 'website'
            ? locale === 'vi'
              ? `Đang tạo trang web mini cho "${businessName}"…`
              : `Started building your mini website for "${businessName}"…`
            : locale === 'vi'
              ? `Đang tạo cửa hàng cho "${businessName}"…`
              : `Started building your store for "${businessName}"…`;
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

    try {
      const { toolResult, payload } = await dispatchIntakeV2DirectTool(tool, cleanedParams, {
        missionId: directToolMissionId,
        storeId,
        req,
      });

      const toolResponse =
        toolResult?.output?.message ||
        toolResult?.blocker?.message ||
        toolResult?.error?.message ||
        (locale === 'vi' ? 'Đã hoàn tất.' : 'Completed.');

      return safeJson(
        {
          success: true,
          action: 'tool_call',
          tool,
          // Synthetic id from dispatch when body had none — required for Turn 2 (e.g. edit_artifact hero Pexels confirm).
          missionId: payload.missionId ?? missionId ?? null,
          parameters: payload,
          reasoning: classification._reasoning,
          response: toolResponse,
          result: toolResult?.output ?? null,
          artifacts: toolResult?.output?.artifacts ?? [],
          riskLevel,
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
    } catch (e) {
      return safeJson(
        {
          success: true,
          action: 'chat',
          response:
            locale === 'vi'
              ? 'Không thể thực hiện. Thử lại sau.'
              : 'I could not complete that action. Please try again.',
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
      response: locale === 'vi' ? 'Thử mô tả khác nhé?' : 'Could you rephrase that?',
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
      response: locale === 'vi' ? 'Thiếu mã xác nhận.' : 'Missing approval reference.',
    });
  }

  const record = getIntakeApprovalPreview(previewId);
  if (!record) {
    emitConfirm({ validated: false, result: 'error', downgradeReason: 'preview_expired' });
    return res.json({
      success: false,
      action: 'error',
      error: 'expired_or_missing',
      response:
        locale === 'vi'
          ? 'Xác nhận đã hết hạn. Hãy thử lại từ đầu.'
          : 'This approval expired. Please run the request again.',
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
      response: locale === 'vi' ? 'Không thể xác nhận với phiên này.' : 'You cannot confirm this approval in this session.',
    });
  }

  const tool = record.tool;
  const effectiveStore = storeIdNow || record.resolvedStoreIdAtPreview;
  const merged = { ...record.executionParameters };
  if (effectiveStore && !merged.storeId) merged.storeId = effectiveStore;

  const validation = validateIntakeClassification(
    {
      executionPath: 'direct_action',
      tool,
      parameters: merged,
    },
    effectiveStore,
  );

  if (!validation.ok) {
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
      response:
        locale === 'vi'
          ? 'Không thể xác nhận với ngữ cảnh hiện tại. Kiểm tra cửa hàng hoặc thử lại.'
          : 'We could not confirm with the current context. Check your store selection or try again.',
      validationErrors: validation.errors,
    });
  }

  const cleaned = validation.cleanedParameters ?? {};

  try {
    const { toolResult, payload } = await dispatchIntakeV2DirectTool(tool, cleaned, {
      missionId,
      storeId: effectiveStore,
      req,
    });
    deleteIntakeApprovalPreview(previewId);

    const toolResponse =
      toolResult?.output?.message ||
      toolResult?.blocker?.message ||
      toolResult?.error?.message ||
      (locale === 'vi' ? 'Đã hoàn tất.' : 'Completed.');

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
      response:
        locale === 'vi'
          ? 'Không thể hoàn tất. Thử lại sau.'
          : 'Could not complete the action. Please try again.',
    });
  }
});

export default router;
