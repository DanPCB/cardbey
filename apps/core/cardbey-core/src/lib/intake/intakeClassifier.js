/**
 * Intake V2 — LLM classifier. Returns normalized shape; never throws to caller.
 * Product intent routing for Performer; not the ReAct `planMission` (see docs/INTAKE_V2_PLANNER_BOUNDARY.md).
 */

import { llmGateway } from '../llm/llmGateway.ts';
import { getBlackboardContextSummary } from '../blackboard/blackboardContextSummary.js';
import { formatHydratedContextForPrompt } from '../memory/plannerResolutionPrompt.js';
import { formatToolRegistryForPrompt, isRegisteredTool, getToolEntry, RISK } from './intakeToolRegistry.js';
import {
  detectDocumentIngestionIntent,
  buildDocumentIngestionClassification,
} from './documentIngestionIntent.js';
import {
  isPendingSkillClarificationReply,
  PENDING_SKILL_DOCUMENT_INGESTION,
  readPendingSkillContext,
  resumeDocumentIngestionClassification,
} from './pendingSkillResume.js';
import { normalizeClassificationForKernel } from '../runtime/kernelMandatory.js';
import { tryStoreCreateFastPath } from './storeCreateIntentFastPath.js';

function asTrimmedString(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

export const CONFIDENCE = {
  HIGH: 0.8,
  MEDIUM: 0.55,
  LOW: 0.0,
};

const CAMPAIGN_ORCHESTRATION_PATTERNS = [
  /\bcreate\s+a?\s*(winter|summer|spring|autumn|seasonal|holiday|flash|sale|launch)\s+campaign/i,
  /\bcampaign\s+for\s+/i,
  /\brun\s+a?\s*campaign/i,
  /\bmulti.?agent/i,
  /\borchestrat/i,
  /\bfull\s+campaign/i,
  /\bpromotional\s+campaign/i,
  /\bmarketing\s+campaign/i,
  /\blaunch\s+campaign\b/i,
  /\bcontent\s+(plan|strategy|calendar)/i,
];

/** @param {string | null | undefined} message */
export function isCampaignOrchestrationIntent(message) {
  return CAMPAIGN_ORCHESTRATION_PATTERNS.some((p) => p.test(message ?? ''));
}

export const FALLBACK_CLARIFY = {
  executionPath: 'clarify',
  tool: 'general_chat',
  confidence: 0,
  parameters: {},
  message: 'I had trouble understanding that. Could you rephrase or pick an option below?',
  clarifyOptions: [
    { label: 'Launch a campaign', tool: 'launch_campaign', parameters: {} },
    { label: 'View sales / orders', tool: 'orders_report', parameters: {} },
  ],
  _downgraded: true,
  _downgradedReason: 'classifier_fallback',
};

/**
 * @param {object} args
 * @param {string} args.userMessage
 * @param {{ storeId?: string | null, draftId?: string | null, missionId?: string | null }} [args.storeContext] — missionId loads recent blackboard context into the prompt when set
 * @param {import('../memory/memoryHydrator.js').HydratedContext} [args.hydratedContext] — memory layer entity + episodic context
 * @param {Array<{ role: string, content: string }>} [args.conversationHistory]
 * @param {string} [args.locale]
 * @param {string} [args.tenantKey]
 * @param {string | null | undefined} [args.missionId] — explicit mission (e.g. req.body); overrides storeContext.missionId
 */
async function buildClassifierPrompt({
  userMessage,
  storeContext,
  conversationHistory,
  locale,
  missionId,
  hydratedContext,
}) {
  const langLine =
    locale === 'vi'
      ? 'Respond in Vietnamese for natural language strings (message, reasoning, clarifyOptions labels).'
      : 'Respond in English.';

  const toolList = formatToolRegistryForPrompt();

  const historyBlock =
    Array.isArray(conversationHistory) && conversationHistory.length > 0
      ? `## Recent conversation\n${conversationHistory
          .slice(-6)
          .map((m) => `${String(m.role || '').toUpperCase()}: ${String(m.content ?? '').slice(0, 300)}`)
          .join('\n')}\n`
      : '';

  const storeBlock = storeContext?.storeId
    ? `## Active store\nstoreId: ${storeContext.storeId}\n`
    : '## Active store\nNone — user has not selected a store.\n';

  const missionBlock = missionId
    ? `## Active mission context\n${await getBlackboardContextSummary(missionId)}\n`
    : '';

  const memoryBlock = hydratedContext
    ? `## Resolved memory context\n${formatHydratedContextForPrompt(hydratedContext)}\n`
    : '';

  return `You are Performer, an AI business assistant for SMBs. Classify the user message.

## Available tools
${toolList}

${storeBlock}
${missionBlock}
${memoryBlock}
${historyBlock}
## Rules
- Output ONE JSON object only (no markdown).
- executionPath must match the chosen tool's path in the registry.
- proactive_plan: include "plan" array (2–4 steps) with recommendedTool matching registry toolName.

## CRITICAL ROUTING RULES — read before selecting any tool

**service_request (executionPath: service_request)**
- Use when the user wants to book, find, schedule, arrange, or hire a **local / personal service provider** (haircut, hair salon, nail salon, massage, barber, beautician, physio, cleaning, tutoring, etc.) — including phrases like "help me to book …".
- Do **NOT** use general_chat to refuse with "I only do business tasks" or "I can't book personal appointments" for these requests. Cardbey captures the request and helps find providers (Phase 1).
- Use tool **service_request** and executionPath **service_request**. Include optional parameters keys only from the registry: serviceType, location, timeWindow, budget when inferable.
- Examples that MUST use service_request:
  - "help me book a haircut this Sunday"
  - "help me to book a hair cut"
  - "Help me to book a Nails service this Sunday"
  - "I need to find a nail salon near me"
  - "book a massage for tomorrow"
  - "book a massage near Melbourne tomorrow"
  - "I need a barber this week"

**create_store (executionPath: direct_action)**
- Use when: owner wants to CREATE a new store that does NOT
  yet exist. Signals: "create a store", "build a store",
  "set up a store", "make a store", "start a store",
  "create a mini website", "build a website for my store",
  "create a website", "create a site", "build a web presence",
  "create a website from attached card".
- NEVER use analyze_store for these phrases.
- No existing storeId required in context.
- For store creation requests — always include
  _autoSubmit: true in the parameters object.
- Parameter keys must match the registry only: use
  storeName (never "name" or "businessName"), storeType,
  location, optional intentMode ("store"|"website"), and
  _autoSubmit.

**analyze_store**
- Use ONLY when: owner has an ACTIVE, existing store AND
  wants performance analysis, improvement, or diagnosis.
- Requires an active storeId in context.
- NEVER use for first-time store creation requests.
- If no storeId is in context → default to create_store.

**market_research**
- Use for competitive research, audience analysis, or
  market sizing for an EXISTING store context.
- NEVER use as a substitute for create_store on new-store
  creation requests.

These rules override all other scoring. When in doubt
between create_store and analyze_store with no storeId
in context → always choose create_store.

- Discovery-first asks (e.g. "find suppliers", "book nails", "compare options", "looking for …") without explicit create-a-new-store wording → service_request (local hire/booking) or general_chat / clarify — not create_store / greenfield store setup unless the user clearly asks to open or create a new store/shop.
REGISTERED TOOL NAMES (use exact strings, no variations):
- "service_request"   — capture local service booking / hire intent; find providers (Phase 1). executionPath MUST be "service_request".
- "market_research"    — research audience and market trends (FIRST step)
- "create_promotion"   — generate promotional content and assets (MIDDLE step)
- "launch_campaign"    — deploy campaign across channels (FINAL step)
- "improve_hero"       — update store hero image or headline (STANDALONE)
- "analyze_store"      — audit store performance (STANDALONE)
- "get_store_analytics" — store performance metrics overview (STANDALONE, direct_action)
- "get_review_summary" — customer reviews, ratings, feedback, or reply drafts (STANDALONE, direct_action)
- "setup_loyalty_program" — loyalty/rewards/points program for repeat customers (STANDALONE, direct_action)
- "generate_mini_website" — create a mini website for the store (STANDALONE)
- "smart_visual"       — generate visual/image assets (STANDALONE)
- "video_generate_multimodal" — legacy multimodal video clip delivery to mission console (STANDALONE)
- "create_video"       — generate AI promotional/store video via video_generation skill (STANDALONE, direct_action, requires store)
- "scan_document"      — extract products/promos/events from uploaded flyer/brochure/document image via document_ingestion skill (STANDALONE, direct_action, requires store)
- "edit_artifact"     — edit or translate DB-backed copy: promotion, business profile, storefront hero, mini-website draft preview; use artifactType sweep for “translate everything” (STANDALONE)
- "publish_to_social" — share or post a campaign to Facebook, Instagram, Zalo, WhatsApp, Telegram, Twitter, or email. Use when user wants to share, post, or distribute their campaign. (STANDALONE)
- "connect_social_account" — connect Facebook, Instagram, or Zalo so Cardbey can post automatically. Use when user wants to link social media or when publish_to_social fails due to missing connection. (STANDALONE)
- "upload_store_asset" — upload a logo, avatar, or hero image to the store (STANDALONE)
- "replace_store_catalog" — replace the store catalog with real menu or product items (STANDALONE)
- "update_store_hero" — change the store hero or banner image (STANDALONE)
- "publish_store" — publish the mini website / store so it is live on the public web (STANDALONE)

Routing examples:
- "share my campaign to Facebook" → publish_to_social (platforms: ["facebook"])
- "post to Instagram" → publish_to_social (platforms: ["instagram"])
- "share everywhere" → publish_to_social (platforms: ["all"])
- "send to WhatsApp" → publish_to_social (platforms: ["whatsapp"])
- "connect my Facebook" → connect_social_account (platform: "facebook")
- "link my social media" → connect_social_account
- "publish my store" / "go live" / "launch my website" / "make my store live" → publish_store
- Mini-website or storefront "go live" / "publish my site" → publish_store (not publish_to_social; that tool is for social campaign posts).
- "create a video for my store" / "generate a promotional video" / "make a store video" → create_video (direct_action, requires storeId).
- "scan this flyer" / "import from this brochure" / "read this document and create products" → scan_document (direct_action, requires storeId + image attachment).

CAMPAIGN SEQUENCE RULE (critical):
When intent is promotion_campaign or the user wants to launch/create/run a
marketing campaign, you MUST use this exact 3-step sequence and no other:
  Step 1: recommendedTool = "market_research"
  Step 2: recommendedTool = "create_promotion"
  Step 3: recommendedTool = "launch_campaign"

Never repeat the same recommendedTool across multiple steps.
Never use "market_research" for step 2 or step 3.
Never invent tool names not listed above.
- direct_action: fill parameters from the user text when possible.
- chat: use tool general_chat and a helpful message field.
- clarify: when ambiguous or confidence < 0.55; include clarifyOptions (max 2) with label + tool + optional parameters.
- code_fix is ALWAYS safe to proceed directly — never return clarify for text/headline/wording fix requests. Return executionPath: "direct_action", tool: "code_fix" with the description parameter. The approval card handles safety.
- edit_artifact: use when the user wants to change stored promotion/business/mini-website draft copy or bulk-translate store copy (sweep), or change the storefront hero photo via stock search (artifactType hero + image wording). Use code_fix for preview/code-path or generic “fix the headline” tied to the editor pipeline — not mutually exclusive; pick the best fit from the user wording.
- Hero photo / banner image / “change hero image to …” → edit_artifact, artifactType hero (Turn 2 confirm is UI-driven with confirmImageSelection, not the classifier).
- Hero/banner image swap (not headline text) → proactive_plan tool improve_hero with a short plan, or direct_action smart_visual if they want AI-generated art; never instruct them to click a UI button.
- User wants an actual video clip / promo reel / TikTok/Reel-style output → create_video when owner wants a store promo video (requires active storeId). Use video_generate_multimodal only for legacy mission-console multimodal delivery without the video_generation skill pipeline.
- Image or moodboard only (no video) → smart_visual (distinct from create_video).
- Sales/orders/revenue/targets → orders_report.
// DANH: skill-runtime-phase7
- Store performance / stats / "how is my store performing" → get_store_analytics (direct_action).
  Requires active storeId. NOT for sales/revenue/orders detail → orders_report.
  NOT for store audit/completeness checklist → analyze_store.
// DANH: review-routing-fix
- Customer reviews / ratings / feedback / "show my reviews" / respond to reviews → get_review_summary (direct_action).
  Requires active storeId. NOT for store performance metrics → get_store_analytics.
  NOT for store health audit → analyze_store or store_health.
// DANH: skill-round4-loyalty
- setup_loyalty_program — use when owner wants to set up a loyalty/rewards/points
  program for repeat customers. NOT for one-off discounts or promotions → use
  create_promotion instead.
// DANH: fix-video-routing
- create_video — use when owner wants to create, generate, or produce a video
  for their store. Includes: promotional video, store video, product video,
  social video. Requires active storeId. NOT for images → use smart_visual.
  NOT for campaigns without video → use create_promotion or launch_campaign.
  executionPath: direct_action.
// DANH: skill-round6-document
- scan_document — use when owner uploads a business document (flyer, brochure, poster, PDF image)
  and wants to extract/import products, promotions, or event info. Requires active storeId.
  Prefer over market_research when the primary goal is document ingestion (not generic campaign research).
  NOT for business card scan → use scan_card. NOT for menu-only import → replace_store_catalog.
  executionPath: direct_action.
- Text/headline fixes → code_fix for editor/preview fixes; edit_artifact for promotion or profile or draft-preview copy and bulk translation (not images).
- confidence: honest 0–1.
- If the user message includes "[Attached image content:" with extracted text, use that text to answer questions about the image — tool "general_chat", executionPath "chat", message field summarizes or quotes the relevant extracted content. Do not say you cannot see the image.
- If the user message includes "[System: an image is attached but OCR" (no usable OCR) and the user asks to see, understand, or describe what is in the photo/image, use tool "analyze_content", executionPath "chat", with parameters extractionGoal or contentType as appropriate.
- If the user asks to CREATE, LAUNCH, or BUILD something from an image (e.g. "create a campaign from this", "make a promotion based on this flyer", "read this and create a campaign"), use tool: "market_research", executionPath: "proactive_plan". Add the image context as campaignContext parameter. This IS a creation request.
- EXCEPTION: when the user explicitly wants to scan/import/extract from a flyer, brochure, or document image (products, prices, events from the doc itself), use scan_document (direct_action) instead of market_research.
- "Read this AND create/launch/make something" = creation intent. Always route to market_research, never to general_chat or capability_gap.
- Use analyze_content only for visual understanding when OCR text is missing or insufficient, or when the user wants structured extraction with NO downstream creation.

## JSON shape
{
  "reasoning": "short",
  "executionPath": "proactive_plan" | "direct_action" | "chat" | "clarify" | "service_request",
  "tool": "<registry toolName>",
  "confidence": 0.9,
  "parameters": {},
  "message": "for chat path",
  "plan": [
    { "step": 1, "title": "Research Target Market", "description": "Identify audience and trends", "recommendedTool": "market_research", "parameters": {} },
    { "step": 2, "title": "Create Promotion", "description": "Generate campaign assets", "recommendedTool": "create_promotion", "parameters": {} },
    { "step": 3, "title": "Launch Campaign", "description": "Deploy across channels", "recommendedTool": "launch_campaign", "parameters": {} }
  ],
  "clarifyOptions": [{ "label": "", "tool": "", "parameters": {} }]
}

## User message
"${userMessage.replace(/"/g, '\\"')}"

${langLine}`;
}

/**
 * @param {object} opts
 * @returns {Promise<object>}
 */
export async function classifyIntent(opts) {
  const {
    userMessage,
    storeContext = null,
    conversationHistory = [],
    locale = 'en',
    tenantKey = 'intake-v2',
    originSurface,
    missionId: missionIdOpt,
    hydratedContext: hydratedContextOpt,
    storeCreateForm,
    forceIntent,
    currentFlow,
    source,
    intentSource,
    intentSourceContext,
  } = opts;

  const msg = String(userMessage ?? '').trim();
  const hasImageAttachment =
    (Array.isArray(opts.attachments) && opts.attachments.length > 0) ||
    Boolean(opts.imageDataUrl);
  if (!msg && !hasImageAttachment) {
    return { ...FALLBACK_CLARIFY, _downgradedReason: 'empty_message' };
  }

  const resolvedStoreId =
    asTrimmedString(opts.storeContext?.storeId) ||
    asTrimmedString(opts.currentContext?.activeStoreId) ||
    asTrimmedString(opts.currentContext?.storeId) ||
    asTrimmedString(opts.runwayContext?.activeStoreId) ||
    asTrimmedString(opts.blackboardContext?.storeId) ||
    asTrimmedString(opts.blackboardContext?.activeStoreId) ||
    '';

  const pendingSkillContext = readPendingSkillContext({
    currentContext: opts.currentContext,
    runwayContext: opts.runwayContext,
    blackboardContext: opts.blackboardContext,
    missionContext: opts.missionContext,
    pendingIntent: opts.pendingIntent,
  });

  const clarificationReply = isPendingSkillClarificationReply({
    isSelectionConfirm: opts.isSelectionConfirm,
    intakeV2Selection: opts.intakeV2Selection,
    pendingSkillContext,
    resolvedStoreId,
  });

  if (
    pendingSkillContext?.pendingSkill === PENDING_SKILL_DOCUMENT_INGESTION &&
    clarificationReply &&
    resolvedStoreId
  ) {
    return resumeDocumentIngestionClassification(pendingSkillContext.pendingInputs, resolvedStoreId);
  }

  const docIntentContext = {
    attachments: opts.attachments,
    runwayContext: opts.runwayContext,
    storeId: storeContext?.storeId ?? null,
    hydratedContext: hydratedContextOpt ?? null,
    currentContext: opts.currentContext,
    imageDataUrl: opts.imageDataUrl ?? null,
    imageUrl: opts.imageUrl ?? null,
  };
  const fastDocIntent = detectDocumentIngestionIntent(msg, docIntentContext);
  if (fastDocIntent && !clarificationReply) {
    return buildDocumentIngestionClassification(msg, docIntentContext);
  }

  if (
    resolvedStoreId &&
    (/activate.*campaign/i.test(msg) ||
      /launch.*campaign/i.test(msg) ||
      /go.*live.*campaign/i.test(msg))
  ) {
    return {
      executionPath: 'direct_action',
      tool: 'activate_campaigns',
      confidence: CONFIDENCE.HIGH,
      parameters: { storeId: resolvedStoreId },
      _fastPath: 'activate_campaigns',
    };
  }

  if (isCampaignOrchestrationIntent(msg)) {
    return {
      intentType: 'campaign_orchestration',
      missionType: 'campaign_orchestration',
      executionPath: 'campaign_orchestration',
      tool: null,
      confidence: 0.85,
      skipPlan: true,
      parameters: {},
      _fastPath: 'campaign_orchestration',
    };
  }

  const storeCreateFastPath = tryStoreCreateFastPath(msg, {
    storeCreateForm: opts.storeCreateForm,
    forceIntent: opts.forceIntent ?? opts.intentSourceContext?.forceIntent,
    currentFlow: opts.currentFlow ?? opts.intentSourceContext?.currentFlow,
    source: opts.source ?? opts.intentSource ?? opts.intentSourceContext?.source,
    activeStoreId: resolvedStoreId || null,
  });
  if (storeCreateFastPath) {
    return normalizeClassificationForKernel(storeCreateFastPath);
  }

  const ctxMid = storeContext?.missionId != null ? String(storeContext.missionId).trim() : '';
  const optMid = missionIdOpt != null ? String(missionIdOpt).trim() : '';
  const missionId = optMid || ctxMid || null;

  const prompt = await buildClassifierPrompt({
    userMessage: msg,
    storeContext,
    conversationHistory,
    locale,
    missionId,
    hydratedContext: hydratedContextOpt ?? null,
  });

  let text = '';
  try {
    const model =
      process.env.INTAKE_V2_MODEL?.trim() ||
      process.env.PERFORMER_INTAKE_LLM_MODEL?.trim() ||
      process.env.OPENAI_CHAT_MODEL?.trim() ||
      'gpt-4o';
    const provider =
      process.env.INTAKE_V2_PROVIDER?.trim() || process.env.PERFORMER_INTAKE_LLM_PROVIDER?.trim() || undefined;

    const result = await llmGateway.generate({
      purpose: 'intake_v2_classify',
      prompt,
      tenantKey,
      model,
      provider,
      maxTokens: 1200,
      responseFormat: 'json',
      temperature: 0.1,
    });
    text = result.text ?? '';
  } catch (e) {
    return {
      ...FALLBACK_CLARIFY,
      _downgradedReason: `llm_error:${String(e?.message ?? e).slice(0, 80)}`,
    };
  }

  if (!text) {
    return { ...FALLBACK_CLARIFY, _downgradedReason: 'empty_llm_response' };
  }

  let parsed;
  try {
    parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...FALLBACK_CLARIFY, _downgradedReason: 'invalid_json_shape' };
    }
  } catch {
    return { ...FALLBACK_CLARIFY, _downgradedReason: 'json_parse_error' };
  }

  const executionPathRaw = String(parsed.executionPath ?? '');
  let executionPath = executionPathRaw;
  let tool = String(parsed.tool ?? '');

  if (tool === 'service_request') {
    executionPath = 'service_request';
  }
  if (executionPath === 'service_request') {
    tool = 'service_request';
  }
  const confidence =
    typeof parsed.confidence === 'number' && !Number.isNaN(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
  const parameters =
    parsed.parameters && typeof parsed.parameters === 'object' && !Array.isArray(parsed.parameters)
      ? parsed.parameters
      : {};
  const plan = Array.isArray(parsed.plan) ? parsed.plan : undefined;
  const message = typeof parsed.message === 'string' ? parsed.message : undefined;
  const clarifyOptions = Array.isArray(parsed.clarifyOptions)
    ? parsed.clarifyOptions.slice(0, 4)
    : Array.isArray(parsed.options)
      ? parsed.options.slice(0, 4)
      : undefined;

  if (executionPath === 'clarify') {
    const options = (clarifyOptions ?? [])
      .map((o) => ({
        label: String(o?.label ?? '').trim(),
        tool: String(o?.tool ?? '').trim(),
        parameters:
          o?.parameters && typeof o.parameters === 'object' && !Array.isArray(o.parameters)
            ? o.parameters
            : undefined,
      }))
      .filter((o) => o.label && o.tool && isRegisteredTool(o.tool));

    return {
      executionPath: 'clarify',
      tool: 'general_chat',
      confidence,
      parameters: {},
      message: message || "I'm not sure — pick an option:",
      clarifyOptions: options.length ? options.slice(0, 2) : FALLBACK_CLARIFY.clarifyOptions,
      plan: undefined,
      _reasoning: String(parsed.reasoning ?? ''),
    };
  }

  if (!isRegisteredTool(tool)) {
    return {
      ...FALLBACK_CLARIFY,
      message: message || FALLBACK_CLARIFY.message,
      _downgradedReason: `unknown_tool:${tool}`,
    };
  }

  const toolEntry = getToolEntry(tool);
  if (toolEntry && toolEntry.executionPath !== executionPath && executionPath !== 'chat' && executionPath !== 'service_request') {
    return {
      executionPath: toolEntry.executionPath,
      tool,
      confidence: confidence * 0.85,
      parameters,
      message,
      plan,
      clarifyOptions: undefined,
      _downgraded: true,
      _downgradedReason: 'path_mismatch_registry',
      _reasoning: String(parsed.reasoning ?? ''),
    };
  }

  if (executionPath === 'proactive_plan' && (!plan || plan.length === 0)) {
    return {
      executionPath: 'clarify',
      tool: 'general_chat',
      confidence: Math.min(confidence, 0.4),
      parameters: {},
      message: 'I can structure that as a plan — which direction should we take?',
      clarifyOptions: [
        { label: toolEntry?.label || tool, tool, parameters: {} },
        { label: 'Something else', tool: 'general_chat', parameters: {} },
      ],
      _downgraded: true,
      _downgradedReason: 'empty_plan',
    };
  }

  if (
    executionPath === 'direct_action' &&
    toolEntry?.riskLevel === RISK.STATE_CHANGE &&
    tool !== 'code_fix' &&
    tool !== 'edit_artifact' &&
    confidence < CONFIDENCE.HIGH
  ) {
    return {
      executionPath: 'clarify',
      tool: 'general_chat',
      confidence,
      parameters: {},
      message: `I think you want "${toolEntry?.label ?? tool}" — please confirm.`,
      clarifyOptions: [
        { label: toolEntry?.label ?? tool, tool, parameters },
        { label: 'Something else', tool: 'general_chat', parameters: {} },
      ],
      _downgraded: true,
      _downgradedReason: `low_confidence_state_change:${confidence.toFixed(2)}`,
    };
  }

  const result = {
    executionPath,
    tool,
    confidence,
    parameters,
    message,
    plan,
    clarifyOptions,
    _reasoning: String(parsed.reasoning ?? ''),
  };

  console.log('[IntakeClassifier] result', {
    path: 'llm', // fast-path removed in Phase 5B
    tool: result.tool,
    executionPath: result.executionPath,
    intentFamily: result.intentFamily,
    confidence: result.confidence,
    originSurface: originSurface ?? 'unknown',
    inputLength: userMessage?.length ?? 0,
  });

  return normalizeClassificationForKernel(result);
}
