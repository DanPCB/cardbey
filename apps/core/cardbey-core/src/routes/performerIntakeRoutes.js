/**
 * Performer Intake — reasoning-first (LLM) with safe fallbacks.
 *
 * This file is mounted at POST /api/performer/intake from `src/createApp.js`.
 * It must be *mount-safe*: no imports of optional/missing helpers.
 *
 * Behavior:
 * - LLM reasoning first (JSON-only contract) → decide tool_call / chat / clarify.
 * - Allowlisted tool_call executes via toolDispatcher (side effects).
 * - Falls through to downstream intake implementation for backward compatibility.
 */

import express from 'express';
import { requireUserOrGuest } from '../middleware/guestAuth.js';
import { getOrCreateCardbeyTraceId, CARDBEY_TRACE_HEADER } from '../lib/trace/cardbeyTraceId.js';
import { llmGateway } from '../lib/llm/llmGateway.ts';
import { planTaskGraphForIntent } from '../lib/agentPlanning/llmTaskPlanner.js';
import { useLlmTaskPlannerEnv, getPipelineForIntent } from '../lib/missionPlan/intentPipelineRegistry.js';
import { taskGraphToProactivePlan } from '../lib/agentPlanning/taskGraphMaterialize.js';
import {
  PROACTIVE_RUNWAY_TOOL_NAMES,
} from '../lib/missionPlan/proactiveRunwayToolAllowlist.js';
import { getToolsForPlanner } from '../lib/toolRegistry.js';
import { parseStoreContentPatchV1 } from '../services/storeContentPatchContract.js';

const router = express.Router();

/** Actor id for MissionPipeline + tool dispatch (signed-in user or guest JWT subject). */
function performerIntakeActorId(req) {
  const raw = req.user?.id ?? req.userId ?? req.guestId;
  if (raw == null) return '';
  const s = String(raw).trim();
  return s;
}

function performerIntakeTenantKey(req) {
  return performerIntakeActorId(req) || 'performer-intake';
}

// Full tool allowlist — must match toolRegistry.js (via proactiveRunwayToolAllowlist.js) +
// performerProactiveStepRoutes.js ALLOWED_TOOLS. When adding a registry tool, it is included automatically.
const ALLOWED_TOOLS = [...new Set([...PROACTIVE_RUNWAY_TOOL_NAMES, 'code_fix'])];
const PLAN_STEP_ALLOWED_TOOLS = [...ALLOWED_TOOLS, 'change_hero_headline', 'code_fix'];
const PROACTIVE_PLAN_MAX_STEPS = 12;

/** Narrow set for proactive campaign runway init metadata only (not step clamping). */
const CAMPAIGN_PLAN_TOOL_SET = new Set([
  'campaign_research',
  'market_research',
  'create_promotion',
  'launch_campaign',
]);

function isProactiveCampaignRunwayEnabled() {
  return String(process.env.ENABLE_PROACTIVE_CAMPAIGN_RUNWAY || '').trim().toLowerCase() === 'true';
}

/** Flatten chat-style messages into one prompt for llmGateway.generate (single user message to the provider). */
function messagesToLlmGatewayPrompt(messages) {
  if (!Array.isArray(messages)) return '';
  return messages
    .map((m) => {
      const role = String(m?.role || 'user');
      const content = String(m?.content ?? '').trim();
      if (!content) return '';
      return `${role.toUpperCase()}:\n${content}`;
    })
    .filter(Boolean)
    .join('\n\n---\n\n');
}

/** Parse JSON object from LLM text (llmGateway has no parse helper — keep local). */
function parseJsonObjectFromLlmText(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  const stripFences = t
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const o = JSON.parse(stripFences);
    return o != null && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch {
    const start = stripFences.indexOf('{');
    const end = stripFences.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const o = JSON.parse(stripFences.slice(start, end + 1));
        return o != null && typeof o === 'object' && !Array.isArray(o) ? o : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Ensure a MissionPipeline id exists for proactive runway (POST /api/performer/proactive-step).
 * @param {import('express').Request} req
 * @param {{ userPrompt: string, currentContext: object, existingMissionId: string|null }} args
 * @returns {Promise<string>}
 */
async function ensureCampaignPipelineMissionId(req, { userPrompt, currentContext, existingMissionId }) {
  const existing = typeof existingMissionId === 'string' ? existingMissionId.trim() : '';
  if (existing) return existing;
  const actorId = performerIntakeActorId(req);
  if (!actorId) return '';
  try {
    const { createMissionPipeline } = await import('../lib/missionPipelineService.js');
    const { getTenantId } = await import('../lib/missionAccess.js');
    const ctx = currentContext && typeof currentContext === 'object' ? currentContext : {};
    const storeId =
      typeof ctx.activeStoreId === 'string' && ctx.activeStoreId.trim() ? ctx.activeStoreId.trim() : null;
    const tenantId = getTenantId(req.user) ?? (req.isGuest ? actorId : null);
    const created = await createMissionPipeline({
      type: 'launch_campaign',
      title: (userPrompt || 'Campaign').slice(0, 200),
      targetType: storeId ? 'store' : 'generic',
      targetId: storeId,
      targetLabel: null,
      metadata: { source: 'performer_intake_proactive_plan' },
      requiresConfirmation: false,
      tenantId,
      createdBy: actorId,
    });
    return created.id || '';
  } catch (e) {
    console.warn('[PerformerIntake] ensureCampaignPipelineMissionId failed:', e?.message || e);
    return '';
  }
}

function safeClarification(locale = 'en') {
  const en = 'What would you like to do? Create a store, launch a campaign, or generate content?';
  const vi = 'Bạn muốn làm gì? Tạo cửa hàng, khởi chạy chiến dịch, hay tạo nội dung?';
  const q = locale === 'vi' ? vi : en;
  return {
    success: true,
    action: 'clarify',
    mode: 'clarification',
    intent: 'unknown',
    confidence: 0,
    suggestedFlow: 'ask_clarification',
    needsClarification: true,
    clarificationQuestion: q,
    extractedEntities: {},
    payload: { question: q },
    response: q,
  };
}

function normalizeToolName(tool) {
  if (typeof tool !== 'string') return '';
  return tool.trim().toLowerCase();
}

/** Map LLM tool names to runway steps (no smart_visual executor in mission pipeline). */
function normalizeProactivePlanStepTool(tool) {
  const t = normalizeToolName(tool);
  if (t === 'smart_visual') return 'create_promotion';
  if (
    t === 'show_promotion' ||
    t === 'display_promotion' ||
    t === 'publish_promotion' ||
    t === 'show_promo'
  ) {
    return 'activate_promotion';
  }
  return t;
}

function pickString(...candidates) {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
}

async function getMissionThreadHistory(missionId, { maxMessages = 30 } = {}) {
  if (!missionId || typeof missionId !== 'string') return [];
  const mid = missionId.trim();
  if (!mid) return [];
  try {
    const { getPrismaClient } = await import('../lib/prisma.js');
    const prisma = getPrismaClient();
    const rows = await prisma.agentMessage.findMany({
      where: { missionId: mid, visibleToUser: true, channel: 'main' },
      orderBy: { createdAt: 'asc' },
      take: Math.min(80, Math.max(5, Number(maxMessages) || 30)),
      select: { senderType: true, content: true },
    });
    const out = [];
    for (const row of rows || []) {
      const text =
        row.content && typeof row.content === 'object' && typeof row.content.text === 'string'
          ? row.content.text
          : '';
      const trimmed = String(text || '').trim();
      if (!trimmed) continue;
      const role = row.senderType === 'user' ? 'user' : 'assistant';
      out.push({ role, content: trimmed.slice(0, 1200) });
    }
    return out.slice(-Math.min(60, maxMessages));
  } catch {
    return [];
  }
}

function buildSystemPrompt({ locale = 'en' } = {}) {
  const langLine =
    locale === 'vi'
      ? 'Language: respond in Vietnamese for any natural language strings.'
      : 'Language: respond in English for any natural language strings.';
  const tools = getToolsForPlanner();
  const toolList = tools
    .map(
      (t, i) =>
        `${i + 1}) ${t.toolName}\n   - ${t.label}${t.description ? `: ${t.description}` : ''}`,
    )
    .join('\n\n');
  return `You are Performer Intake — a routing and tool-selection agent.

You MUST choose the single best next action based on:
- the latest user prompt
- the current mission context (JSON)
- the conversation history

CRITICAL: Output MUST be ONLY valid JSON. No markdown. No code fences. No extra keys. No trailing text.

## Allowed tools (choose the best match by toolName; one tool_call = one step)
${toolList}

Also available for tool_call when the user wants visuals without a full promotion flow:
- smart_visual — images, moodboards, brand visuals; parameters: { "prompt", "campaignContext" } as strings.

When the user wants to fix, correct, or change specific text, wording, headlines, \
titles, labels, or spelling in their store or website — including hero section text, \
section headings, product names, or any visible copy — use:
- code_fix — Propose a targeted content/text fix with approval before applying; \
parameters: { "description": "what to fix and the new value", \
"filePaths": [], "repoContext": "store content fix", \
"storeContentPatch": { "kind": "store_content_patch", "version": 1, \
"targetField": "heroTitle" | "heroSubtitle" | "bannerText" | "storeName", \
"newText": "final visible text", "sourceDescription": "optional short note" } }
  For store/website visible text fixes you MUST include storeContentPatch with the correct targetField and newText. \
  Omit storeContentPatch when fixing application source code — use non-empty filePaths with real repo paths instead.
  Use code_fix (NOT change_hero_headline) whenever the user says \
"fix X to Y", "change headline to", "update the title", "fix the wording", \
"correct the spelling", or similar targeted text corrections. \
code_fix always shows an approval card before applying — change_hero_headline does not.
// Add after the code_fix description block:
Do NOT use code_fix for image changes, photo swaps, or hero image updates — 
those are handled by the website editing pipeline. 
Use code_fix ONLY for text, wording, headline, title, or label corrections.
// In buildSystemPrompt, add to the rules section:
When the user wants to change, swap, or update the hero image or any photo:
- Do NOT invent a tool name like change_hero_image or update_hero_image
- Use action: "chat" with a response directing them to the "Change hero image" 
  button in the Website Preview panel; \
  When the user asks to change, swap, update, or replace a hero image or photo:
- Return action: "chat" with response: "To change your hero image, use the 
  'Change hero image' button in the Website Preview panel on the right."
- Do NOT use code_fix, change_hero_image, or any invented tool name.\

When the user reports a software bug, broken behavior, regression, or asks to \
debug / patch application code (not store content):
- code_fix — same tool, same approval flow; \
parameters: { "description": "bug description", "filePaths": ["optional"], \
"repoContext": "optional extra context" }


C-Net screen management (when the user asks to push playlists to store screens, TVs, or displays):
- signage.list-devices — list paired physical screens; parameters: { "status": "online" | "all" } optional (default all). tenantId/storeId come from session context when omitted.
- signage.publish-to-devices — push an existing SIGNAGE playlist to screens; parameters: { "playlistId": string, "pushToAll": boolean optional, "deviceIds": string[] optional }. Use pushToAll: true to reach every non-archived screen in the store, or deviceIds for specific screens.

When the user asks to push content to screens or displays:
1) Prefer signage.list-devices first unless targets are already clear.
2) Then signage.publish-to-devices with playlistId and pushToAll and/or deviceIds.

Playlist authoring (creating playlists or adding assets) is done in the dashboard Signage flows; from chat you list screens and push an existing SIGNAGE playlist.

Always available when no registered tool should run yet:
- general_chat — guidance only; parameters: { "response": string }

## Output JSON schema (STRICT)
{
  "reasoning": "brief but useful explanation (1-2 sentences)",
  "action": "tool_call" | "clarify" | "chat",
  "tool": "<exact toolName from the numbered list, or smart_visual, or general_chat, or null>",
  "parameters": { }
}

## Rules
- Always include a non-empty "reasoning".
- If action is "tool_call":
  - tool MUST be one of the toolName values listed above, or smart_visual, or code_fix, or general_chat.
  - parameters MUST be an object. Derive productContext, campaignContext, storeId, prompt, etc. from the user message when relevant. Do not hallucinate productId.
- If action is "clarify":
  - tool MUST be null.
  - parameters.question MUST be a single short question that unlocks the next step.
- If action is "chat":
  - tool MUST be null.
  - parameters.response MUST be a helpful response to the user.
- ${langLine}`;
}

function looksHighLevelGoal(userPrompt) {
  const t = String(userPrompt || '').trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  // Heuristic: multi-part goals / timelines / execution requests.
  const hasTimeHorizon =
    /\b\d+\s*(day|days|week|weeks|month|months)\b/.test(lower) || lower.includes('2 weeks') || lower.includes('two weeks');
  const hasMultiStepVerb =
    /\b(create|plan|execute|launch|run|schedule|research|design|generate|publish)\b/.test(lower) &&
    (lower.includes(' and ') || lower.includes(' then ') || lower.includes(' week') || lower.includes('2 ') || lower.includes('two '));
  const longEnough = t.split(/\s+/).length >= 10;
  const notJustImages =
    !(lower.includes('generate images') || lower.includes('smart_visual') || (lower.includes('images') && lower.length < 60));
  // Keep store creation as legacy path (do not route through proactive planner).
  const isCreateStore =
    lower.includes('create store') ||
    lower.includes('create a store') ||
    lower.includes('new store') ||
    lower.includes('open store');
  const storeImprovementGoals = [
    'improve my store',
    'improve this store',
    'improve my',
    'analyze my store',
    'analyse my store',
    'rewrite my',
    'generate tags',
    'improve hero',
    'social content',
    'social posts',
    'show this promo',
    'show promo on',
    'get my store ready',
    'store ready for',
  ];
  const isStoreImprovementGoal = storeImprovementGoals.some((kw) => lower.includes(kw));
  return (
    (hasTimeHorizon || hasMultiStepVerb || longEnough || isStoreImprovementGoal) && notJustImages && !isCreateStore
  );
}

function isLegacyStoreCreationIntent(userPrompt) {
  const lower = String(userPrompt || '').toLowerCase();
  return (
    lower.includes('create store') ||
    lower.includes('create a store') ||
    lower.includes('new store') ||
    lower.includes('open store')
  );
}

function looksMiniWebsiteGoal(userPrompt) {
  const lower = String(userPrompt || '').toLowerCase();
  const hasWebsiteCreateVerb =
    lower.includes('create a website') ||
    lower.includes('create website') ||
    lower.includes('create my website') ||
    lower.includes('build a website') ||
    lower.includes('build website') ||
    lower.includes('make a website') ||
    lower.includes('set up a website') ||
    lower.includes('create a site') ||
    lower.includes('build a site') ||
    lower.includes('make a site') ||
    lower.includes('set up a site') ||
    lower.includes('create a web presence') ||
    lower.includes('build a web presence');
  return (
    lower.includes('mini website') ||
    lower.includes('mini-site') ||
    lower.includes('microsite') ||
    lower.includes('micro-site') ||
    lower.includes('web presence') ||
    lower.includes('website from card') ||
    lower.includes('website from attached card') ||
    lower.includes('site from card') ||
    lower.includes('site from attached card') ||
    hasWebsiteCreateVerb
  );
}

/**
 * Website creation aliases that must route to create_store (legacy store runway),
 * NOT proactive campaign planning.
 */
function looksWebsiteCreateStoreAlias(userPrompt) {
  const lower = String(userPrompt || '').toLowerCase();
  return (
    lower.includes('create a website') ||
    lower.includes('create my website') ||
    lower.includes('create a mini website') ||
    lower.includes('build a website') ||
    lower.includes('build me a website') ||
    lower.includes('make a website') ||
    lower.includes('create a web presence') ||
    lower.includes('create a site') ||
    lower.includes('create a website from card') ||
    lower.includes('website from card')
  );
}

function isStoreOrMiniWebsiteIntentText(userPrompt) {
  const lower = String(userPrompt || '').toLowerCase();
  const isStore =
    lower.includes('create store') ||
    lower.includes('create a store') ||
    lower.includes('create my store') ||
    lower.includes('new store') ||
    lower.includes('open store');
  const isWebsite =
    looksMiniWebsiteGoal(userPrompt) ||
    lower.includes('refine (website):') ||
    lower.includes('refine (store):');
  return isStore || isWebsite;
}

/** User wants an existing promo surfaced on the storefront — not a full new campaign. */
function isShowPromoOnStoreIntentText(userPrompt) {
  const lower = String(userPrompt || '').toLowerCase();
  const hasSurface =
    lower.includes('show') ||
    lower.includes('display') ||
    lower.includes('surface') ||
    lower.includes('put') ||
    lower.includes('feature');
  const hasPromo = lower.includes('promo') || lower.includes('promotion');
  const hasStoreContext =
    lower.includes('store') ||
    lower.includes('shop') ||
    lower.includes('website') ||
    lower.includes('web site') ||
    lower.includes('homepage') ||
    lower.includes('home page') ||
    /\bon\s+my\s+site\b/.test(lower);
  return hasSurface && hasPromo && hasStoreContext;
}

/**
 * Core Function #1 vs #2 gate:
 * - proactive_plan: Researcher + Planner (for high-level strategic goals)
 * - action_flow: run/suggest next actionable step (tool call or CTA suggestion)
 */
function decideCoreFunction({ userPrompt, llmAction, llmTool, llmReasoning, llmParameters }) {
  if (isLegacyStoreCreationIntent(userPrompt)) return 'legacy_store';
  if (looksWebsiteCreateStoreAlias(userPrompt)) return 'legacy_store';
  if (looksMiniWebsiteGoal(userPrompt)) return 'proactive_plan';

  const prompt = String(userPrompt || '').toLowerCase();
  const toolNorm = String(llmTool || '').trim().toLowerCase();
  // code_fix must always go to action_flow — never proactive_plan
  // REPLACE the existing code_fix guard block
// Route to action_flow for specific direct-action intents only.
  // Keep this guard NARROW — anything too broad will swallow campaign/proactive requests.
  const isImageChangeRequest =
    prompt.includes('hero image') ||
    (prompt.includes('image') && (
      prompt.includes('change the image') ||
      prompt.includes('swap the image') ||
      prompt.includes('replace the image') ||
      prompt.includes('different photo') ||
      prompt.includes('another photo') ||
      prompt.includes('new photo')
    ));

  const isContentTextFix =
    (prompt.includes('fix') || prompt.includes('correct')) && (
      prompt.includes('headline') ||
      prompt.includes('tagline') ||
      prompt.includes('subheadline') ||
      prompt.includes('wording') ||
      prompt.includes('spelling') ||
      prompt.includes('typo')
    );

  const isChangeContentField =
    (prompt.includes('change') || prompt.includes('update') || prompt.includes('replace')) && (
      prompt.includes('headline') ||
      prompt.includes('tagline') ||
      prompt.includes('subheadline')
    ) &&
    !prompt.includes('campaign') &&
    !prompt.includes('promotion') &&
    !prompt.includes('store');

  if (
    prompt.includes('fix bug') ||
    prompt.includes('fix issue') ||
    toolNorm === 'code_fix' ||
    isImageChangeRequest ||
    isContentTextFix ||
    isChangeContentField
  ) {
    return 'action_flow';
  }
  const reason = String(llmReasoning || '').toLowerCase();
  const paramMode = String(llmParameters?.mode || llmParameters?.nextMode || '').toLowerCase();

  // Step 1: keyword / heuristic proactive signals first (before LLM action_flow routing).
  const proactiveKeywords = [
    'improve',
    'improve my',
    'improve this',
    'show this promo',
    'show promo',
    'show on store',
    'generate social',
    'social content',
    'social posts',
    'rewrite',
    'rewrite my',
    'rewrite descriptions',
    'generate tags',
    'tags for my',
    'hero image not',
'improve hero image',
    'get my store ready',
    'get ready for',
    'store ready',
    'prepare my store',
    'analyze my store',
    'analyse my store',
    'store improvement',
    'store analysis',
  ];
  const matchesProactiveKeyword = proactiveKeywords.some((kw) => prompt.includes(kw));

  const isQuickPillStyleGoal =
    prompt === 'launch campaign' ||
    prompt.includes('launch a marketing campaign') ||
    prompt === 'create promotion' ||
    prompt.includes('promotion campaign') ||
    prompt.includes('setup loyalty campaign') ||
    prompt.includes('loyalty campaign') ||
    prompt.includes('generate social content') ||
    prompt.includes('social content plan') ||
    prompt.includes('deploy a c-net campaign') ||
    prompt.includes('analyze performance');
  const highLevelByLlmOrPrompt =
    paramMode.includes('proactive_plan') ||
    paramMode.includes('plan') ||
    reason.includes('high-level') ||
    reason.includes('multi-step') ||
    reason.includes('strategy') ||
    reason.includes('plan') ||
    prompt.includes('campaign') ||
    prompt.includes('promotion') ||
    prompt.includes('content strategy') ||
    prompt.includes('loyalty') ||
    prompt.includes('2 weeks') ||
    prompt.includes('two weeks') ||
    (prompt.includes('show') && prompt.includes('promo')) ||
    prompt.includes('improve') ||
    (prompt.includes('generate') && prompt.includes('social')) ||
    prompt.includes('rewrite') ||
    prompt.includes('tags') ||
    prompt.includes('hero');

  if (
    isQuickPillStyleGoal ||
    matchesProactiveKeyword ||
    highLevelByLlmOrPrompt ||
    looksHighLevelGoal(userPrompt)
  ) {
    return 'proactive_plan';
  }

  // Step 2: LLM / prompt direct-action routing only if no proactive signal matched.
  const directActionByLlm = llmAction === 'tool_call' && !!llmTool;
  const directActionByPrompt =
    /\b(generate|create|run|launch|schedule|write|make)\b/.test(prompt) &&
    !/\bstrategy|plan|roadmap|2 weeks|two weeks|for next|for this month\b/.test(prompt);

  if (directActionByLlm || directActionByPrompt) return 'action_flow';
  if (llmAction === 'tool_call' || (llmTool && ALLOWED_TOOLS.includes(llmTool))) return 'action_flow';
  return 'action_flow';
}

/**
 * Core Function #2 helper:
 * suggest the next logical approval-driven CTAs for action-oriented turns.
 */
function buildActionCtaButtons(tool) {
  if (tool === 'smart_visual') return ['Generate visuals', 'Create promotion assets', 'Add special requirements'];
  if (tool === 'create_promotion') return ['Generate promotion', 'Launch campaign', 'Add special requirements'];
  if (tool === 'launch_campaign') return ['Launch campaign', 'Review plan first', 'Add special requirements'];
  return ['Run next step', 'Add special requirements'];
}

function buildPlannerSystemPrompt({ locale = 'en' } = {}) {
  const langLine =
    locale === 'vi'
      ? 'Language: write titles/descriptions in Vietnamese.'
      : 'Language: write titles/descriptions in English.';
  return `You are PlannerAgent for Performer.
Return ONLY valid JSON. No markdown. No extra text.

Goal: produce a simple 2-4 step plan for the user's high-level goal.

Rules for the plan:
- Each tool may only appear ONCE across all steps
- Do not repeat the same tool in multiple steps
- For any goal that involves research + creation + deployment, always include at minimum 3 steps
- Never collapse a multi-phase goal into a single step
- If the user mentions "campaign", "launch", "promote", or "deploy", the plan must have at least 3 steps
- Choose the most appropriate tools from the registry for each phase — do not assume a fixed tool sequence; match tools to the user's actual goal
- For simpler single-action goals, fewer steps are OK when the user clearly asks for only one kind of work

IMPORTANT — match tools to the actual goal, not the campaign sequence. Examples:
- "improve store" or "store improvement":
    step 1: analyze_store
    step 2: rewrite_descriptions
    step 3: improve_hero
- "social content" or "generate posts":
    step 1: analyze_store
    step 2: generate_social_posts
- "show promo on store", "show this promo", "display promo", "deploy promo" (surface existing promo on public menu/feed):
    step 1: analyze_store — review current store layout
    step 2: assign_promotion_slot — place promo in store slot
    step 3: activate_promotion — deploy and make live to buyers
    NEVER use general_chat for the final deploy/activate step
- "launch campaign" or "marketing campaign":
    step 1: market_research
    step 2: create_promotion
    step 3: launch_campaign
- "Valentine's Day promotion", "seasonal promotion", "holiday promotion", "promotion for my products" (creating new themed marketing, not surfacing an existing promo on the store):
    step 1: market_research — research seasonal audience
    step 2: create_promotion — generate themed content
    step 3: launch_campaign — deploy across channels

Only use the campaign sequence (market_research → create_promotion → launch_campaign) when the user explicitly mentions campaign, launch, or marketing in a campaign sense, or seasonal/holiday/product promotions (examples above) where they are creating new marketing — not when they only want to show an existing promo on the store (use the assign_promotion_slot sequence for that). Phrases like "improve my store" must use store tools (analyze_store, rewrite_descriptions, improve_hero), not campaign_research or create_promotion.

Examples of tool selection by goal (illustrative — adapt to the user's wording):
- "improve store" → analyze_store, rewrite_descriptions, improve_hero
- "social content" → analyze_store, generate_social_posts
- "show promo on store" / "show this promo" / "display promo" / "deploy promo" → analyze_store, assign_promotion_slot, activate_promotion — step 3 must be activate_promotion (never general_chat for deploy/activate)
- "rewrite descriptions" → analyze_store, rewrite_descriptions
- "generate tags" → analyze_store, generate_tags
- "launch campaign" → market_research, create_promotion, launch_campaign
- Valentine's / seasonal / holiday / "promotion for my products" (new themed marketing, not showing an existing promo) → market_research, create_promotion, launch_campaign

CRITICAL: general_chat must NEVER appear as a step in any multi-step plan. If you are unsure what tool to use for a step, pick the closest registry tool. general_chat is only for single-turn responses, never for plan steps.

Hard rule: If the user is surfacing an existing promotion on their store (show/display/deploy promo), every step must use registry promotion tools (assign_promotion_slot, activate_promotion) or analyze_store — never use general_chat for activation or deploy; step 3 must be activate_promotion.

Each step must include:
- step (number)
- title (short)
- description (short)
- recommendedTool (string: the single best registered tool name for that step — e.g. campaign_research, market_research, analyze_store, create_promotion, assign_promotion_slot, activate_promotion (use activate_promotion to deploy/show/activate a promotion on the store — never general_chat for deploy or activation steps), launch_campaign, generate_social_posts, improve_hero, rewrite_descriptions, generate_tags, content_creator, crm, etc.; use smart_visual / general_chat only when no registry tool fits)
- parameters (object)

Supported scenarios include campaign/promotion planning and mini website creation.
If input is short (e.g., from quick pills like "Launch campaign" or "Create promotion"), still produce a useful 2-4 step plan.
For mini website/microsite, include parameters:
{ "mode": "mini_website", "intentMode": "website", "template": "prebuilt" | "ai_generated" | "custom_brand_kit" }.

Return exactly:
{
  "action": "proactive_plan",
  "plan": [
    { "step": 1, "title": "...", "description": "...", "recommendedTool": "<best tool for this step>", "parameters": {} }
  ],
  "suggestedNextAction": "start_step_1" | "ask_for_requirements",
  "ctaButtons": ["Start Step 1", "Add special requirements", "Execute full plan"]
}

${langLine}`;
}

function buildLightweightFallbackPlan({ userPrompt, reasoning }) {
  const baseReasoning = pickString(
    reasoning,
    'Planner timed out. Returning a lightweight plan so you can approve and continue.',
  );
  const isMiniWebsite = looksMiniWebsiteGoal(userPrompt);
  if (isMiniWebsite) {
    return {
      action: 'proactive_plan',
      reasoning: baseReasoning,
      plan: [
        {
          step: 1,
          title: 'Define mini website direction',
          description: 'Confirm audience, tone, and key message.',
          recommendedTool: 'campaign_research',
          parameters: { mode: 'mini_website', intentMode: 'website', template: 'prebuilt' },
        },
        {
          step: 2,
          title: 'Generate website content and visuals',
          description: 'Prepare hero copy, sections, and visual style.',
          recommendedTool: 'create_promotion',
          parameters: { mode: 'mini_website', intentMode: 'website', template: 'prebuilt' },
        },
        {
          step: 3,
          title: 'Build and review mini website',
          description: 'Create the draft website and review before publishing.',
          recommendedTool: 'general_chat',
          parameters: { mode: 'mini_website', intentMode: 'website', template: 'prebuilt' },
        },
      ],
      suggestedNextAction: 'start_step_1',
      ctaButtons: ['Start Step 1', 'Add special requirements', 'Execute full plan'],
    };
  }

  const lowerFallback = String(userPrompt || '').toLowerCase();
  const isStoreImprovementFallback =
    (lowerFallback.includes('improve') && lowerFallback.includes('store')) ||
    lowerFallback.includes('store improvement') ||
    (lowerFallback.includes('better') && lowerFallback.includes('store'));
  if (isStoreImprovementFallback) {
    return {
      action: 'proactive_plan',
      reasoning: baseReasoning,
      plan: [
        {
          step: 1,
          title: 'Analyze your store',
          description: 'Review catalog, tone, and gaps before changes.',
          recommendedTool: 'analyze_store',
          parameters: {},
        },
        {
          step: 2,
          title: 'Refresh product descriptions',
          description: 'Rewrite copy for clarity and conversion.',
          recommendedTool: 'rewrite_descriptions',
          parameters: {},
        },
        {
          step: 3,
          title: 'Elevate hero and visuals',
          description: 'Improve the hero section and key imagery.',
          recommendedTool: 'improve_hero',
          parameters: {},
        },
      ],
      suggestedNextAction: 'start_step_1',
      ctaButtons: ['Start Step 1', 'Add special requirements', 'Execute full plan'],
    };
  }

  return {
    action: 'proactive_plan',
    reasoning: baseReasoning,
    plan: [
      {
        step: 1,
        title: 'Research and plan',
        description: 'Outline audience, objective, and campaign approach.',
        recommendedTool: 'campaign_research',
        parameters: {},
      },
      {
        step: 2,
        title: 'Generate creative materials',
        description: 'Create visuals and promotion assets.',
        recommendedTool: 'create_promotion',
        parameters: { campaignContext: userPrompt },
      },
      {
        step: 3,
        title: 'Launch and optimize',
        description: 'Run the campaign and iterate based on results.',
        recommendedTool: 'launch_campaign',
        parameters: { campaignContext: userPrompt },
      },
    ],
    suggestedNextAction: 'start_step_1',
    ctaButtons: ['Start Step 1', 'Add special requirements', 'Execute full plan'],
  };
}

async function persistProactivePlan(missionId, planPayload) {
  if (!missionId || typeof missionId !== 'string') return;
  const mid = missionId.trim();
  if (!mid) return;
  try {
    const { getPrismaClient } = await import('../lib/prisma.js');
    const prisma = getPrismaClient();
    const row = await prisma.mission.findUnique({ where: { id: mid }, select: { context: true } }).catch(() => null);
    if (!row) return;
    const ctx = row.context && typeof row.context === 'object' && !Array.isArray(row.context) ? row.context : {};
    const agentMemory =
      ctx.agentMemory && typeof ctx.agentMemory === 'object' && !Array.isArray(ctx.agentMemory) ? ctx.agentMemory : {};
    const next = {
      ...ctx,
      agentMemory: {
        ...agentMemory,
        proactivePlan: planPayload,
        proactivePlanUpdatedAt: new Date().toISOString(),
      },
    };
    await prisma.mission.update({ where: { id: mid }, data: { context: next } }).catch(() => null);
  } catch {
    // best-effort only
  }
}

/** Persist LLM/registry task graph for step executors (Mission.context.agentMemory.taskGraph). */
async function persistTaskGraphOnMission(missionId, taskGraph) {
  if (!missionId || !taskGraph) return;
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return;
  try {
    const { getPrismaClient } = await import('../lib/prisma.js');
    const prisma = getPrismaClient();
    const row = await prisma.mission.findUnique({ where: { id: mid }, select: { context: true } }).catch(() => null);
    if (!row) return;
    const ctx = row.context && typeof row.context === 'object' && !Array.isArray(row.context) ? row.context : {};
    const agentMemory =
      ctx.agentMemory && typeof ctx.agentMemory === 'object' && !Array.isArray(ctx.agentMemory) ? ctx.agentMemory : {};
    await prisma.mission
      .update({
        where: { id: mid },
        data: {
          context: {
            ...ctx,
            agentMemory: {
              ...agentMemory,
              taskGraph,
              taskGraphPersistedAt: new Date().toISOString(),
            },
          },
        },
      })
      .catch(() => null);
  } catch {
    // best-effort
  }
}

function buildStoreContextFromCurrentContext(currentContext) {
  const ctx = currentContext && typeof currentContext === 'object' ? currentContext : {};
  const mem =
    ctx.memorySummary && typeof ctx.memorySummary === 'object' && !Array.isArray(ctx.memorySummary)
      ? ctx.memorySummary
      : {};
  const memStoreRaw = mem.storeId;
  const memStoreStr =
    memStoreRaw != null && String(memStoreRaw).trim() ? String(memStoreRaw).trim() : '';
  const rawCount = ctx.productCount ?? ctx.catalogSize ?? ctx.activeProductCount;
  let productCount;
  if (typeof rawCount === 'number' && Number.isFinite(rawCount)) productCount = rawCount;
  else if (typeof rawCount === 'string' && /^\d+$/.test(rawCount.trim())) productCount = parseInt(rawCount.trim(), 10);
  return {
    /** Dashboard sends memorySummary.storeId when activeStoreId is unset — promotion tools need a store. */
    storeId: pickString(ctx.activeStoreId, ctx.storeId, memStoreStr),
    storeName: pickString(ctx.storeName, ctx.activeStoreName, ctx.currentStoreName),
    industry: pickString(ctx.industry, ctx.vertical, ctx.businessType, ctx.category),
    ...(productCount != null ? { productCount } : {}),
  };
}

function parseLegacyStoreCreateIntent(userPrompt, currentContext) {
  const ctx = currentContext && typeof currentContext === 'object' ? currentContext : {};
  const prompt = String(userPrompt ?? '').trim();
  const match =
    prompt.match(/create\s+(?:a\s+)?store\s+for\s+(.+?)(?:\s+in\s+(.+))?$/i) ||
    prompt.match(/make\s+(?:a\s+)?store\s+for\s+(.+?)(?:\s+in\s+(.+))?$/i);

  const parsedName = match?.[1] ? String(match[1]).trim().replace(/^["']+|["']+$/g, '') : '';
  const parsedLocation = match?.[2] ? String(match[2]).trim().replace(/^["']+|["']+$/g, '') : '';
  const businessName = pickString(parsedName, ctx.storeName, ctx.activeStoreName, ctx.currentStoreName, 'My Business');
  const businessType = pickString(ctx.businessType, ctx.storeType, ctx.vertical, ctx.category, 'Other');
  const location = pickString(parsedLocation, ctx.location, ctx.suburb, ctx.city);

  return {
    businessName,
    businessType,
    location,
  };
}

/**
 * Registry key for planTaskGraphForIntent (LLM + registry fallback). Prefer explicit params from intake LLM, else heuristics from prompt/tool.
 */
function resolveIntentTypeForPlanner({ userPrompt, tool, parameters, reasoning }) {
  const params = parameters && typeof parameters === 'object' && !Array.isArray(parameters) ? parameters : {};
  const pIntent = pickString(params.intent, params.missionType, params.workflowType, params.intentType);
  if (pIntent) {
    const pipe = getPipelineForIntent(pIntent);
    const st = Array.isArray(pipe.stepToolNames) ? pipe.stepToolNames : [];
    if (st.length > 0) return pIntent.trim();
  }
  const t = normalizeToolName(tool);
  if (t === 'launch_campaign') return 'launch_campaign';
  if (t === 'create_promotion') return 'create_promotion';
  if (t === 'code_fix') return 'code_fix';
  const lower = String(userPrompt || '').toLowerCase();
  const reason = String(reasoning || '').toLowerCase();
  const blob = `${lower} ${reason}`;
  if (
    blob.includes('social') &&
    (blob.includes('content') ||
      blob.includes('post') ||
      blob.includes('generat') ||
      blob.includes('media'))
  ) {
    return 'generate_social_posts';
  }
  if (blob.includes('improve') && blob.includes('store')) return 'store_improvement';
  if (
    blob.includes('weekend') ||
    blob.includes('get my store ready') ||
    blob.includes('store ready for') ||
    blob.includes('prepare my store') ||
    (blob.includes('get ready for') && blob.includes('store'))
  ) {
    return 'store_publish_preparation';
  }
  if (blob.includes('performance')) return 'store_improvement';
  if (blob.includes('tag') && blob.includes('generat')) return 'generate_tags';
  if (blob.includes('hero')) return 'improve_hero';
  if (blob.includes('rewrite') || blob.includes('description')) return 'rewrite_descriptions';
  // Before broad "promotion" → campaign: surface existing promo on store (assign slot + activate).
  if (isShowPromoOnStoreIntentText(userPrompt)) return 'promotion_slot_assignment';
  if (
    blob.includes('campaign') ||
    blob.includes('promotion') ||
    blob.includes('valentine') ||
    (blob.includes('launch') && (blob.includes('marketing') || blob.includes('campaign')))
  ) {
    return 'launch_campaign';
  }
  return 'default';
}

function applyIntakeProactivePlanStepPatches(normalizedPlan, userPrompt) {
  if (!Array.isArray(normalizedPlan)) return;
  const promptRaw = String(userPrompt || '');
  const promptLower = promptRaw.toLowerCase();
  const headlineMatch =
    promptRaw.match(/\bheadline\b[^"'\\n]*["']([^"']+)["']/i) ||
    promptRaw.match(/\bheadline\b[^\\n]*to\\s+([^\\n.]+)/i);
  const subheadlineMatch =
    promptRaw.match(/\bsubheadline\b[^"'\\n]*["']([^"']+)["']/i) ||
    promptRaw.match(/\bsubheadline\b[^\\n]*to\\s+([^\\n.]+)/i);
  const extractedHeadline = headlineMatch && headlineMatch[1] ? String(headlineMatch[1]).trim() : '';
  const extractedSubheadline = subheadlineMatch && subheadlineMatch[1] ? String(subheadlineMatch[1]).trim() : '';

  for (let i = 0; i < normalizedPlan.length; i += 1) {
    const step = normalizedPlan[i];
    const toolAllowed = PLAN_STEP_ALLOWED_TOOLS.includes(step.recommendedTool) ? step.recommendedTool : 'general_chat';
    if (toolAllowed !== step.recommendedTool) step.recommendedTool = toolAllowed;

    // Patch: hero headline/subheadline steps should use the dedicated hero tool.
    try {
      const title = String(step?.title || '').toLowerCase();
      const desc = String(step?.description || '').toLowerCase();
      const looksLikeHeroTextStep =
        title.includes('hero headline') ||
        title.includes('hero subheadline') ||
        (title.includes('rewrite') && title.includes('hero')) ||
        (desc.includes('hero headline') || desc.includes('hero subheadline'));
      if (looksLikeHeroTextStep) {
        step.recommendedTool = 'change_hero_headline';
        const p = step.parameters && typeof step.parameters === 'object' ? step.parameters : {};
        step.parameters = {
          ...p,
          ...(extractedHeadline ? { headline: extractedHeadline } : {}),
          ...(extractedSubheadline ? { subheadline: extractedSubheadline } : {}),
          // Keep a copy of the original prompt for debugging/runner context.
          prompt: typeof p.prompt === 'string' && p.prompt.trim() ? p.prompt : promptRaw,
        };
      }
    } catch {
      // non-fatal
    }

    if (isShowPromoOnStoreIntentText(userPrompt) && step.recommendedTool === 'general_chat') {
      const prior = normalizedPlan.slice(0, i).map((s) => s.recommendedTool);
      step.recommendedTool = prior.includes('assign_promotion_slot') ? 'activate_promotion' : 'assign_promotion_slot';
    }
    if (looksMiniWebsiteGoal(userPrompt)) {
      const p = step.parameters && typeof step.parameters === 'object' ? step.parameters : {};
      const template = pickString(p.template);
      step.parameters = {
        ...p,
        mode: 'mini_website',
        intentMode: 'website',
        template:
          template === 'ai_generated' || template === 'custom_brand_kit' || template === 'prebuilt'
            ? template
            : 'prebuilt',
      };
    }
    if (step.recommendedTool === 'create_promotion') {
      const p = step.parameters && typeof step.parameters === 'object' ? step.parameters : {};
      const ctx = pickString(p.productContext, p.campaignContext, p.product, p.prompt, userPrompt);
      step.parameters = {
        ...p,
        productContext: pickString(p.productContext, ctx),
        campaignContext: pickString(p.campaignContext, ctx),
        ...(pickString(p.productId, p.product_id) ? { productId: pickString(p.productId, p.product_id) } : {}),
      };
    }
  }

  // Patch: replace general_chat in multi-step plans (LLM often picks it for "deploy" — force registry tools).
  if (looksMiniWebsiteGoal(userPrompt) || normalizedPlan.length <= 1) return;

  const GENERAL_CHAT_REPLACEMENTS = {
    assign_promotion_slot: 'activate_promotion',
    analyze_store: 'rewrite_descriptions',
    default: 'activate_promotion',
  };

  for (let i = 0; i < normalizedPlan.length; i += 1) {
    const step = normalizedPlan[i];
    if (step.recommendedTool !== 'general_chat') continue;

    const prevTool = i > 0 ? normalizedPlan[i - 1].recommendedTool : null;
    const replacement =
      prevTool && Object.prototype.hasOwnProperty.call(GENERAL_CHAT_REPLACEMENTS, prevTool)
        ? GENERAL_CHAT_REPLACEMENTS[prevTool]
        : GENERAL_CHAT_REPLACEMENTS.default;

    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log(`[intake] patching general_chat step ${i + 1} → ${replacement}`, {
        prevTool,
        title: step.title,
      });
    }

    step.recommendedTool = replacement;
  }
}

/**
 * When USE_LLM_TASK_PLANNER=true, planTaskGraphForIntent runs first (LLM or registry_fallback inside planner).
 * @returns {Promise<{ payload: object, taskGraph: object }|null>}
 */
async function tryBuildProactivePlanFromLlmTaskGraph({
  intentType,
  userPrompt,
  reasoning,
  storeContext,
  tenantKey,
  missionId,
}) {
  if (!useLlmTaskPlannerEnv()) return null;
  try {
    const intentKey = String(intentType || '').trim();
    const result = await planTaskGraphForIntent({
      intentType,
      context: {
        userPrompt,
        storeId: storeContext?.storeId,
        storeName: storeContext?.storeName,
        industry: storeContext?.industry,
        ...(storeContext?.productCount != null ? { productCount: storeContext.productCount } : {}),
      },
      tenantKey: tenantKey || missionId || 'intake',
    });
    if (!result.ok || !result.taskGraph?.tasks?.length) return null;
    let plan = taskGraphToProactivePlan(result.taskGraph);
    plan = plan.slice(0, PROACTIVE_PLAN_MAX_STEPS);
    if (plan.length < 2) return null;
    applyIntakeProactivePlanStepPatches(plan, userPrompt);
    const registryFallback = result.source === 'registry_fallback';
    const reasoningLine = registryFallback
      ? pickString(
          reasoning,
          intentKey === 'generate_social_posts' || intentKey === 'generate_social'
            ? `Planned ${plan.length} steps for social content from your store context.`
            : `Planned ${plan.length} steps from the standard playbook for this intent.`,
        )
      : result.source === 'llm'
        ? `AI-planned ${plan.length}-step sequence for this goal.`
        : pickString(reasoning, 'Plan ready.');
    return {
      payload: {
        action: 'proactive_plan',
        reasoning: reasoningLine,
        plan,
        taskGraphSource: result.source,
        suggestedNextAction: 'start_step_1',
        ctaButtons: ['Start Step 1', 'Add special requirements', 'Execute full plan'],
      },
      taskGraph: result.taskGraph,
    };
  } catch (e) {
    console.warn('[intake] planTaskGraphForIntent failed, skipping task-graph proactive path:', e?.message || e);
    return null;
  }
}

/** LLM task graph (if enabled) then {@link buildLightweightFallbackPlan}. */
async function buildProactivePlanForIntent(opts) {
  const tg = await tryBuildProactivePlanFromLlmTaskGraph(opts);
  if (tg) return { payload: tg.payload, taskGraph: tg.taskGraph };
  return {
    payload: buildLightweightFallbackPlan({ userPrompt: opts.userPrompt, reasoning: opts.reasoning }),
    taskGraph: null,
  };
}

async function sendProactivePlanSuccess(res, req, payload, { userPrompt, currentContext, missionId, taskGraph }) {
  const ensuredMid = await ensureCampaignPipelineMissionId(req, {
    userPrompt,
    currentContext,
    existingMissionId: missionId,
  });
  const mid = (ensuredMid || missionId || '').trim();
  if (mid) {
    payload.missionId = mid;
    if (taskGraph) await persistTaskGraphOnMission(mid, taskGraph);
  }
  const proactivePlan = isProactivePlanPayload(payload);
  payload.runMode = proactivePlan && isProactiveCampaignRunwayEnabled() ? 'PROACTIVE_GUIDED' : 'PIPELINE_AUTOMATED';
  if (mid) {
    if (proactivePlan) {
      const stepTools = (payload.plan || []).map((s) => ({
        stepNumber: Number(s?.step) || null,
        recommendedTool: s?.recommendedTool,
      }));
      await initProactiveCampaignRun(mid, stepTools);
    }
    await persistProactivePlan(mid, payload);
  }
  return res.json(payload);
}

function asPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

function safeIso(d = new Date()) {
  try {
    return d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function isProactivePlanPayload(planPayload) {
  const obj = asPlainObject(planPayload) || {};
  return obj.action === 'proactive_plan' && Array.isArray(obj.plan) && obj.plan.length > 0;
}

/**
 * Initialize Mission.context.agentMemory.proactiveCampaignRun once, when a campaign proactive plan
 * is first persisted/returned.
 *
 * Must be feature-flagged and idempotent.
 *
 * @param {string} missionId
 * @param {{ stepNumber?: number, recommendedTool?: string }[]} stepTools
 */
async function initProactiveCampaignRun(missionId, stepTools) {
  if (!isProactiveCampaignRunwayEnabled()) return;
  if (!missionId || typeof missionId !== 'string') return;
  const mid = missionId.trim();
  if (!mid) return;

  const toolsArr = Array.isArray(stepTools) ? stepTools : [];
  const normalizedTools = toolsArr
    .map((x) => ({
      stepNumber: Number(x?.stepNumber) || null,
      recommendedTool: normalizeToolName(x?.recommendedTool),
    }))
    .filter((x) => x.recommendedTool && CAMPAIGN_PLAN_TOOL_SET.has(x.recommendedTool));
  if (!normalizedTools.length) return;

  try {
    const { getPrismaClient } = await import('../lib/prisma.js');
    const prisma = getPrismaClient();
    const row = await prisma.mission.findUnique({
      where: { id: mid },
      select: { context: true },
    });
    if (!row) return;
    const ctx = asPlainObject(row.context) || {};
    const agentMemory = asPlainObject(ctx.agentMemory) || {};

    // "first persisted/returned": only initialize if mission has never had a proactive plan yet.
    if (asPlainObject(agentMemory.proactivePlan)) return;

    const existing = asPlainObject(agentMemory.proactiveCampaignRun);
    if (existing && typeof existing.runMode === 'string' && existing.runMode.trim() === 'PROACTIVE_GUIDED') {
      return; // idempotent
    }

    const nowIso = safeIso();
    const steps = {};
    for (const t of normalizedTools) {
      const key = String(t.stepNumber || '');
      if (!key || steps[key]) continue;
      steps[key] = {
        stepNumber: Number(t.stepNumber) || null,
        tool: t.recommendedTool,
        status: 'pending',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    }

    const nextContext = {
      ...ctx,
      agentMemory: {
        ...agentMemory,
        proactiveCampaignRun: {
          runMode: 'PROACTIVE_GUIDED',
          steps,
          createdAt: nowIso,
          updatedAt: nowIso,
          source: 'performerIntakeRoutes',
        },
      },
    };

    await prisma.mission.update({
      where: { id: mid },
      data: { context: nextContext, updatedAt: new Date() },
    });
  } catch {
    // best-effort only
  }
}

router.post('/', requireUserOrGuest, async (req, res, next) => {
  try {
    const cardbeyTraceId = getOrCreateCardbeyTraceId(req);
    res.setHeader(CARDBEY_TRACE_HEADER, cardbeyTraceId);

    const body = req.body ?? {};
    const rawMessage = body.message || body.prompt || body.text || body.intent || '';
    const userPrompt = String(rawMessage || '').trim();
    if (!userPrompt) return next();

    const locale = req.locale === 'vi' ? 'vi' : 'en';
    const missionIdRaw = pickString(body.missionId, body.currentContext?.activeMissionId);
    const missionId = missionIdRaw || null;
    const currentContext = body.currentContext && typeof body.currentContext === 'object' ? body.currentContext : {};

    if (process.env.EXECUTE_INTENT_SHADOW === 'true') {
      const shadowPrompt = userPrompt;
      const ctxShadow = { ...currentContext };
      const corr = missionId ? String(missionId) : null;
      setImmediate(() => {
        import('../lib/orchestrator/executeIntent.js')
          .then(({ executeIntent }) =>
            executeIntent(
              {
                source: 'performer',
                rawInput: shadowPrompt,
                context: ctxShadow,
                correlationId: corr,
              },
              { shadow: true },
            ),
          )
          .catch(() => {});
      });
    }
    const threadHistory = missionId ? await getMissionThreadHistory(missionId, { maxMessages: 30 }) : [];

    // --- LLM Reasoning first ---
    // eslint-disable-next-line no-console
    console.log('[PerformerIntake] LLM Reasoning started', {
      missionId: missionId ? String(missionId).slice(0, 10) : null,
      hasHistory: threadHistory.length > 0,
    });

    let decision = null;
    let llmRaw = '';
    let reasoningTimedOut = false;
    try {
      const system = buildSystemPrompt({ locale });
      const contextBlob = {
        missionId,
        currentContext,
        now: new Date().toISOString(),
      };
      const messages = [
        { role: 'system', content: system },
        ...(threadHistory || []).map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: String(m.content || '').slice(0, 1200),
        })),
        {
          role: 'user',
          content:
            `User prompt:\n${userPrompt}\n\n` +
            `Mission context (JSON):\n${JSON.stringify(contextBlob).slice(0, 4000)}`,
        },
      ];

      const tenantKey = String(performerIntakeTenantKey(req)).slice(0, 120);
      const prompt = messagesToLlmGatewayPrompt(messages);
      const timeoutMs = 15000;
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`llm_timeout_${timeoutMs}ms`)), timeoutMs),
      );
      const intakeModel = process.env.PERFORMER_INTAKE_LLM_MODEL?.trim() || 'gpt-4o-mini';
      const intakeProvider = intakeModel.startsWith('gpt-')
        ? 'openai'
        : process.env.PERFORMER_INTAKE_LLM_PROVIDER?.trim() || undefined;
      const generatePromise = llmGateway.generate({
        purpose: 'performer_intake_reasoning',
        prompt,
        tenantKey,
        model: intakeModel,
        ...(intakeProvider ? { provider: intakeProvider } : {}),
        maxTokens: 550,
        temperature: 0.2,
        responseFormat: 'json',
      });
      const llmRes = await Promise.race([generatePromise, timeout]);

      llmRaw = String(llmRes?.text ?? '').trim();
      const parsed = parseJsonObjectFromLlmText(llmRaw);
      decision = parsed && typeof parsed === 'object' ? parsed : null;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[PerformerIntake] LLM Reasoning failed', err?.message || err);
      const msg = String(err?.message || err || '');
      if (msg.includes('llm_timeout_')) reasoningTimedOut = true;
      decision = null;
    }

    const action = decision && typeof decision.action === 'string' ? decision.action.trim().toLowerCase() : '';
    const tool = normalizeToolName(decision?.tool);
    const reasoning = typeof decision?.reasoning === 'string' ? decision.reasoning.trim() : '';
    const parameters =
      decision?.parameters && typeof decision.parameters === 'object' && !Array.isArray(decision.parameters)
        ? decision.parameters
        : {};

    if (!decision && llmRaw) {
      // eslint-disable-next-line no-console
      console.warn('[PerformerIntake] LLM parse failed; raw response (truncated):', llmRaw.slice(0, 800));
    }

    // eslint-disable-next-line no-console
    console.log('[PerformerIntake] LLM Reasoning → decided action:', {
      action: action || '(empty)',
      tool: tool || null,
      reasoning: reasoning ? reasoning.slice(0, 180) : '',
    });

    // If first reasoning call timed out, keep UX stable by returning a lightweight plan for high-level goals.
    if (!decision && reasoningTimedOut && (looksHighLevelGoal(userPrompt) || looksMiniWebsiteGoal(userPrompt))) {
      const { payload: timeoutPayload, taskGraph: timeoutTaskGraph } = await buildProactivePlanForIntent({
        intentType: resolveIntentTypeForPlanner({ userPrompt, tool, parameters, reasoning }),
        userPrompt,
        reasoning: 'Reasoning timed out; returning a lightweight proactive plan.',
        storeContext: buildStoreContextFromCurrentContext(currentContext),
        tenantKey: String(performerIntakeTenantKey(req)).slice(0, 120),
        missionId,
      });
      return sendProactivePlanSuccess(res, req, timeoutPayload, {
        userPrompt,
        currentContext,
        missionId,
        taskGraph: timeoutTaskGraph,
      });
    }

    // --- Core Function Gate: Plan vs Act ---
    const coreFunction = decideCoreFunction({
      userPrompt,
      llmAction: action,
      llmTool: tool,
      llmReasoning: reasoning,
      llmParameters: parameters,
    });
    // eslint-disable-next-line no-console
    console.log(`[PerformerIntake] Intent classified as ${coreFunction}`);

    // Keep store creation as the ONLY legacy default workflow.
    if (coreFunction === 'legacy_store') {
      try {
        const actorId = performerIntakeActorId(req);
        const actorUser =
          req.user?.id === actorId && req.user
            ? req.user
            : {
                ...(req.user && typeof req.user === 'object' ? req.user : {}),
                id: actorId,
                role: req.user?.role || (req.isGuest ? 'guest' : 'user'),
              };
        const sendLegacyStorePayload = (payload) => {
          console.log('[PerformerIntake] legacy_store response payload:', payload);
          return res.json(payload);
        };

        if (!actorId) {
          return sendLegacyStorePayload({
            success: false,
            action: 'chat',
            reasoning: 'Store mission creation requires an authenticated or guest actor id.',
            response:
              locale === 'vi'
                ? 'Vui lòng đăng nhập hoặc bắt đầu phiên khách để tạo cửa hàng từ ảnh danh thiếp.'
                : 'Please sign in or start a guest session to create a store from a business card image.',
            payload: {
              code: 'AUTH_REQUIRED',
              message:
                locale === 'vi'
                  ? 'Vui lòng đăng nhập để tiếp tục.'
                  : 'Please sign in to continue.',
            },
          });
        }

        const { getPrismaClient } = await import('../lib/prisma.js');
        const { getTenantId } = await import('../lib/missionAccess.js');
        const { createMissionPipeline } = await import('../lib/missionPipelineService.js');
        const { ensureStructuredStoreCheckpointSteps } = await import('../lib/storeMission/ensureStructuredStoreCheckpointSteps.js');
        const { executeStoreMissionPipelineRun } = await import('../lib/storeMission/executeStoreMissionPipelineRun.js');
        const prisma = getPrismaClient();
        const storeInput = parseLegacyStoreCreateIntent(userPrompt, currentContext);
        const websiteAlias = looksWebsiteCreateStoreAlias(userPrompt);

        const existingStoreMissionId =
          missionId &&
          (await prisma.missionPipeline
            .findFirst({
              where: {
                id: missionId,
                type: 'store',
                status: { in: ['awaiting_confirmation', 'queued', 'executing'] },
              },
              select: { id: true },
            })
            .catch(() => null))?.id;

        const ensuredMissionId =
          existingStoreMissionId ||
          (
            await createMissionPipeline({
              type: 'store',
              title: `Create store: ${storeInput.businessName.slice(0, 120)}`,
              targetType: 'store',
              targetId: undefined,
              targetLabel: undefined,
              metadata: {
                businessName: storeInput.businessName,
                businessType: storeInput.businessType,
                location: storeInput.location,
                websiteMode: websiteAlias,
                generateWebsite: websiteAlias,
                intentMode: websiteAlias ? 'website' : 'store',
                source: 'performer_intake_legacy_store',
                cardbeyTraceId,
              },
              requiresConfirmation: true,
              executionMode: 'AUTO_RUN',
              tenantId: getTenantId(actorUser) || actorId,
              createdBy: actorId,
            })
          ).id;

        if (existingStoreMissionId) {
          await prisma.missionPipeline.updateMany({
            where: {
              id: ensuredMissionId,
              status: 'executing',
            },
            data: {
              status: 'queued',
              runState: 'idle',
            },
          });
        }

        await ensureStructuredStoreCheckpointSteps(prisma, ensuredMissionId, { logPrefix: '[PerformerIntake]' });

        const runResult = await executeStoreMissionPipelineRun({
          prisma,
          user: actorUser,
          missionId: ensuredMissionId,
          body: {
            businessName: storeInput.businessName,
            businessType: storeInput.businessType,
            location: storeInput.location,
            intentMode: websiteAlias ? 'website' : 'store',
            rawUserText: userPrompt,
            cardbeyTraceId,
          },
          auditSource: 'performer_intake_legacy_store',
        });

        if (!runResult.ok) {
          throw new Error(runResult.message || runResult.error || 'store_mission_start_failed');
        }

        if (runResult.mode === 'checkpoint_pipeline' && process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.log(
            '[PerformerIntake] legacy_store intake → Phase 3 checkpoint pipeline (paused for owner; no orchestra build yet)',
            { missionId: runResult.missionId, orchestration: runResult.orchestration },
          );
        }

        return sendLegacyStorePayload({
          success: true,
          action: 'store_mission_started',
          missionId: runResult.missionId,
          jobId: runResult.jobId,
          generationRunId: runResult.generationRunId,
          draftId: runResult.draftId,
          intentMode: websiteAlias ? 'website' : 'store',
          reasoning: 'Store creation mission started from performer intake.',
          response:
            runResult.mode === 'checkpoint_pipeline'
              ? locale === 'vi'
                ? `Một vài lựa chọn nhanh trước khi tạo cửa hàng cho "${storeInput.businessName}"…`
                : `A few quick choices before we build "${storeInput.businessName}"…`
              : locale === 'vi'
                ? websiteAlias
                  ? `Đang tạo trang web mini cho "${storeInput.businessName}"…`
                  : `Đang tạo cửa hàng cho "${storeInput.businessName}"…`
                : websiteAlias
                  ? `Started building your mini website for "${storeInput.businessName}"…`
                  : `Started building your store for "${storeInput.businessName}"…`,
          storeMissionSummary: {
            businessName: storeInput.businessName,
            businessType: storeInput.businessType,
            location: storeInput.location,
          },
        });
      } catch (legacyStoreErr) {
        console.warn('[PerformerIntake] legacy_store mission start failed:', legacyStoreErr?.message || legacyStoreErr);
        const payload = {
          success: false,
          action: 'chat',
          reasoning: 'Legacy store mission start failed.',
          response:
            locale === 'vi'
              ? 'Không thể khởi động tiến trình tạo cửa hàng ngay bây giờ. Vui lòng thử lại.'
              : 'I could not start the store build right now. Please try again.',
        };
        console.log('[PerformerIntake] legacy_store response payload:', payload);
        return res.json(payload);
      }
    }

    // Guardrail: when intake already selected a specific single-step tool, do not
    // convert it into a proactive plan (which can rewrite tools and route the user
    // into the wrong surface, e.g. product/description editing).
    const _forceActionFlow =
      action === 'tool_call' &&
      typeof tool === 'string' &&
      tool.trim().toLowerCase() === 'change_hero_headline';

    /**
     * Guest rule:
     * - Store creation + mini website can stay open for guests (draft/preview stage).
     * - All other intents require sign-in at Gate 1 (before planning or tool execution).
     */
    if (req.isGuest && !isStoreOrMiniWebsiteIntentText(userPrompt)) {
      // eslint-disable-next-line no-console
      console.warn('[AuthGate] Blocked non-store action for guest user.');
      return res.json({
        success: false,
        action: 'auth_gate',
        reasoning: 'This action requires a signed-in account.',
        response: locale === 'vi'
          ? 'Vui lòng đăng nhập để chạy chiến dịch, khuyến mãi và nội dung.'
          : 'Sign in to launch campaigns, promotions, and content generation.',
        payload: {
          code: 'AUTH_REQUIRED',
          message: locale === 'vi'
            ? 'Vui lòng đăng nhập để tiếp tục.'
            : 'Please sign in to continue.',
        },
      });
    }

    // When USE_LLM_TASK_PLANNER=true, try task-graph planner first for every intent
    // (registry/lightweight fallback inside). Skip when we force a single-step tool call.
    if (useLlmTaskPlannerEnv() && !_forceActionFlow) {
      const plannerIntentEarly = resolveIntentTypeForPlanner({
        userPrompt,
        tool,
        parameters,
        reasoning,
      });
      const storeCtxEarly = buildStoreContextFromCurrentContext(currentContext);
      const { payload: earlyPlanPayload, taskGraph: earlyTaskGraph } = await buildProactivePlanForIntent({
        intentType: plannerIntentEarly,
        userPrompt,
        reasoning,
        storeContext: storeCtxEarly,
        tenantKey: String(performerIntakeTenantKey(req)).slice(0, 120),
        missionId,
      });
      if (Array.isArray(earlyPlanPayload?.plan) && earlyPlanPayload.plan.length >= 2) {
        return sendProactivePlanSuccess(res, req, earlyPlanPayload, {
          userPrompt,
          currentContext,
          missionId,
          taskGraph: earlyTaskGraph,
        });
      }
    }

    // Core Function #1: high-level goal -> force proactive planner.
    if (coreFunction === 'proactive_plan' && !_forceActionFlow) {
      try {
        const tenantKeyPlan = String(performerIntakeTenantKey(req)).slice(0, 120);
        const storeCtx = buildStoreContextFromCurrentContext(currentContext);
        if (!useLlmTaskPlannerEnv()) {
          const fromTaskGraph = await tryBuildProactivePlanFromLlmTaskGraph({
            intentType: resolveIntentTypeForPlanner({
              userPrompt,
              tool,
              parameters,
              reasoning,
            }),
            userPrompt,
            reasoning,
            storeContext: storeCtx,
            tenantKey: tenantKeyPlan,
            missionId,
          });
          if (fromTaskGraph?.payload?.plan?.length >= 2) {
            return sendProactivePlanSuccess(res, req, fromTaskGraph.payload, {
              userPrompt,
              currentContext,
              missionId,
              taskGraph: fromTaskGraph.taskGraph,
            });
          }
        }

        const plannerSystem = buildPlannerSystemPrompt({ locale });
        const plannerMessages = [
          { role: 'system', content: plannerSystem },
          ...(threadHistory || []).slice(-12).map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: String(m.content || '').slice(0, 1000),
          })),
          { role: 'user', content: `User goal:\n${userPrompt}` },
        ];

        const plannerPrompt = messagesToLlmGatewayPrompt(plannerMessages);
        const timeoutMs = Number(process.env.PLANNER_TIMEOUT_MS) || 20000;
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`planner_timeout_${timeoutMs}ms`)), timeoutMs),
        );
        const plannerModel = process.env.PERFORMER_INTAKE_PLANNER_MODEL?.trim() || process.env.PERFORMER_INTAKE_LLM_MODEL?.trim() || 'gpt-4o-mini';
        const plannerProvider = plannerModel.startsWith('gpt-') ? 'openai' : undefined; // let llmGateway use default xai
        const plannerGenerate = llmGateway.generate({
          purpose: 'performer_intake_proactive_planner',
          prompt: plannerPrompt,
          tenantKey: tenantKeyPlan,
          model: plannerModel,
          ...(plannerProvider ? { provider: plannerProvider } : {}),
          maxTokens: 800,
          temperature: 0.25,
          responseFormat: 'json',
        });
        const plannerRes = await Promise.race([plannerGenerate, timeout]);
        const raw = String(plannerRes?.text ?? '').trim();
        const parsed = parseJsonObjectFromLlmText(raw);
        const planObj = parsed && typeof parsed === 'object' ? parsed : null;
        const planArr = Array.isArray(planObj?.plan) ? planObj.plan : [];
        const normalizedPlan = planArr
          .filter((x) => x && typeof x === 'object')
          .slice(0, PROACTIVE_PLAN_MAX_STEPS)
          .map((x, idx) => ({
            step: Number(x.step) || idx + 1,
            title: pickString(x.title) || `Step ${idx + 1}`,
            description: pickString(x.description) || '',
            recommendedTool: normalizeProactivePlanStepTool(x.recommendedTool) || 'general_chat',
            parameters:
              x.parameters && typeof x.parameters === 'object' && !Array.isArray(x.parameters) ? x.parameters : {},
          }))
          .filter((x) => x.title);

        applyIntakeProactivePlanStepPatches(normalizedPlan, userPrompt);
        for (const step of normalizedPlan) {
          // eslint-disable-next-line no-console
          console.log(`[ProactivePlan] Generated step ${step.step}: ${step.title} → tool: ${step.recommendedTool}`);
        }

        if (normalizedPlan.length >= 2) {
          // eslint-disable-next-line no-console
          console.log(`[CampaignFlow] Using proactive plan with ${normalizedPlan.length} steps`);
          const payload = {
            action: 'proactive_plan',
            reasoning: reasoning || 'User provided a high-level goal; proposing a short plan.',
            plan: normalizedPlan,
            suggestedNextAction:
              planObj?.suggestedNextAction === 'ask_for_requirements' ? 'ask_for_requirements' : 'start_step_1',
            ctaButtons: Array.isArray(planObj?.ctaButtons) && planObj.ctaButtons.length
              ? planObj.ctaButtons.slice(0, 4).map((s) => String(s))
              : ['Start Step 1', 'Add special requirements', 'Execute full plan'],
          };
          return sendProactivePlanSuccess(res, req, payload, {
            userPrompt,
            currentContext,
            missionId,
            taskGraph: null,
          });
        }
      } catch (err) {
        const msg = String(err?.message || err || '');
        if (msg.includes('planner_timeout_')) {
          // eslint-disable-next-line no-console
          console.warn('[Planner] Timeout occurred — returning lightweight fallback plan');
        } else {
          // eslint-disable-next-line no-console
          console.warn('[PerformerIntake] PlannerAgent failed; returning lightweight fallback plan:', msg);
        }
        const { payload: fallbackPayload, taskGraph: fallbackTaskGraph } = await buildProactivePlanForIntent({
          intentType: resolveIntentTypeForPlanner({
            userPrompt,
            tool,
            parameters,
            reasoning,
          }),
          userPrompt,
          reasoning: msg.includes('planner_timeout_')
            ? pickString(reasoning, 'Planner timed out; using fallback plan.')
            : pickString(reasoning, 'Planner failed; using fallback plan.'),
          storeContext: buildStoreContextFromCurrentContext(currentContext),
          tenantKey: String(performerIntakeTenantKey(req)).slice(0, 120),
          missionId,
        });
        return sendProactivePlanSuccess(res, req, fallbackPayload, {
          userPrompt,
          currentContext,
          missionId,
          taskGraph: fallbackTaskGraph,
        });
      }
    }

    // Core Function #2: action-oriented flow (tool_call or CTA-driven clarify/chat).
    if (action === 'clarify') {
      const q = pickString(parameters.question, parameters.clarificationQuestion);
      if (q) {
        return res.json({
          success: true,
          action: 'clarify',
          reasoning,
          response: q,
          ctaButtons: buildActionCtaButtons(tool),
          payload: { question: q },
        });
      }
      return res.json(safeClarification(locale));
    }

    if (action === 'chat') {
      const text = pickString(parameters.response, parameters.text, parameters.message);
      if (text) {
        return res.json({
          success: true,
          action: 'chat',
          reasoning,
          response: text,
          ctaButtons: buildActionCtaButtons(tool),
          payload: { response: text },
        });
      }
      return res.json(safeClarification(locale));
    }

    if (action === 'tool_call') {
      if (!tool || !ALLOWED_TOOLS.includes(tool)) {
        // Avoid falling through to an unmounted handler (can become a 404).
        // For non-allowlisted tools, keep the UX stable by asking a clarification question.
        return res.json(safeClarification(locale));
      }

      // Intake chat: route launch_campaign to mission execution (proactive runway uses toolDispatcher).
      if (tool === 'launch_campaign') {
        return res.json({
          success: true,
          action: 'process',
          mode: 'execution',
          intent: 'launch_campaign',
          confidence: 0.9,
          reasoning,
          suggestedFlow: 'run_mission',
          needsClarification: false,
          extractedEntities: { businessAction: 'launch_campaign' },
          payload: {
            intent: 'launch_campaign',
            entities: { businessAction: 'launch_campaign' },
            ...(parameters && typeof parameters === 'object' ? { parameters } : {}),
          },
          escalateToProcess: true,
          needsPlan: false,
        });
      }
      if (tool === 'code_fix') {
        const description = pickString(
          parameters?.description,
          parameters?.prompt,
          parameters?.message,
          userPrompt,
        );
        const parsedScp = parseStoreContentPatchV1(parameters?.storeContentPatch);
        const outParameters = {
          ...parameters,
          description: description || userPrompt,
        };
        if (parsedScp.valid) {
          outParameters.storeContentPatch = parsedScp.patch;
        }
        return res.json({
          success: true,
          action: 'tool_call',
          tool: 'code_fix',
          parameters: outParameters,
          ...(parsedScp.valid ? { storeContentPatch: parsedScp.patch } : {}),
          reasoning,
          response:
            'Analyzing the bug and preparing a fix proposal. Review the patch in the Execution panel.',
          intentType: 'code_fix',
          requiresConfirmation: true,
        });
      }

      if (tool === 'general_chat') {
        const text =
          pickString(parameters.response, parameters.text) ||
          (locale === 'vi' ? 'Bạn muốn làm gì tiếp theo?' : 'What would you like to do next?');
        return res.json({ success: true, action: 'chat', reasoning, response: text, payload: { response: text } });
      }

      // smart_visual / create_promotion execute via toolDispatcher.
      const { dispatchTool } = await import('../lib/toolDispatcher.js');
      const { getTenantId } = await import('../lib/missionAccess.js');
      const missionKey = missionId || `intake-${tool}-${Date.now()}`;
      const payload = { ...(parameters || {}) };

      // Helper: extract hero text values from user prompt when parameters omitted.
      const extractHeroText = () => {
        const raw = String(userPrompt || '');
        const headlineMatch =
          raw.match(/\bheadline\b[^"'\\n]*["']([^"']+)["']/i) ||
          raw.match(/\bheadline\b[^\\n]*to\\s+([^\\n.]+)/i);
        const subheadlineMatch =
          raw.match(/\bsubheadline\b[^"'\\n]*["']([^"']+)["']/i) ||
          raw.match(/\bsubheadline\b[^\\n]*to\\s+([^\\n.]+)/i);
        return {
          headline: headlineMatch && headlineMatch[1] ? String(headlineMatch[1]).trim() : '',
          subheadline: subheadlineMatch && subheadlineMatch[1] ? String(subheadlineMatch[1]).trim() : '',
        };
      };

      // Ensure a stable prompt/campaignContext surface for visual tools
      if (tool === 'smart_visual') {
        payload.prompt = pickString(payload.prompt, payload.message, userPrompt);
        payload.campaignContext = pickString(payload.campaignContext, payload.prompt, userPrompt);
        payload.missionId = payload.missionId || missionId || null;
      }

      // Ensure storeId + hero text inputs for change_hero_headline.
      if (tool === 'change_hero_headline') {
        const ctx = currentContext && typeof currentContext === 'object' ? currentContext : {};
        const ctxStoreId = pickString(ctx.activeStoreId, ctx.storeId);
        if (!payload.storeId && ctxStoreId) payload.storeId = ctxStoreId;
        const ctxDraftId = pickString(ctx.activeDraftId, ctx.draftId);
        if (!payload.draftId && ctxDraftId) payload.draftId = ctxDraftId;
        const hasHeadline = typeof payload.headline === 'string' && payload.headline.trim();
        const hasSubheadline = typeof payload.subheadline === 'string' && payload.subheadline.trim();
        if (!hasHeadline || !hasSubheadline) {
          const extracted = extractHeroText();
          if (!hasHeadline && extracted.headline) payload.headline = extracted.headline;
          if (!hasSubheadline && extracted.subheadline) payload.subheadline = extracted.subheadline;
        }
      }

      // Ensure context keys for create_promotion
      if (tool === 'create_promotion') {
        const product =
          pickString(payload.product, payload.productContext) ||
          pickString(payload.campaignContext, payload.prompt, payload.message, userPrompt);
        const campaignCtxText = pickString(payload.campaignContext, payload.prompt, payload.message, userPrompt);
        const productId = pickString(payload.productId, payload.product_id);
        payload.product = payload.product || product;
        payload.productContext = payload.productContext || product || campaignCtxText;
        payload.campaignContext = payload.campaignContext || campaignCtxText || payload.productContext;
        if (productId) payload.productId = productId;
        payload.missionId = payload.missionId || missionId || null;
        if (!pickString(payload.storeId)) {
          const surf = currentContext && typeof currentContext === 'object' ? currentContext : {};
          const memSum =
            surf.memorySummary && typeof surf.memorySummary === 'object' && !Array.isArray(surf.memorySummary)
              ? surf.memorySummary
              : {};
          const memSid = memSum.storeId;
          const memSidStr = memSid != null && String(memSid).trim() ? String(memSid).trim() : '';
          const inferredStore = pickString(surf.activeStoreId, surf.storeId, memSidStr);
          if (inferredStore) payload.storeId = inferredStore;
        }
      }

      if (tool === 'signage.list-devices' || tool === 'signage.publish-to-devices') {
        const ctx = currentContext && typeof currentContext === 'object' ? currentContext : {};
        const ctxStoreId = pickString(ctx.activeStoreId, ctx.storeId);
        if (!payload.storeId && ctxStoreId) payload.storeId = ctxStoreId;
      }

      const storeCtxForTools = buildStoreContextFromCurrentContext(currentContext);
      const actorId = performerIntakeActorId(req);
      const toolResult = await dispatchTool(tool, payload, {
        missionId: missionKey,
        userId: actorId || undefined,
        createdBy: actorId || undefined,
        tenantId: getTenantId(req.user) ?? (req.isGuest && actorId ? actorId : null),
        storeId: storeCtxForTools?.storeId || undefined,
      });
      return res.json({
        success: true,
        action: 'tool_call',
        tool,
        parameters: payload,
        reasoning,
        response:
          toolResult?.output?.message ||
          toolResult?.blocker?.message ||
          toolResult?.error?.message ||
          (locale === 'vi' ? 'Đã hoàn tất.' : 'Completed.'),
        ctaButtons: buildActionCtaButtons(tool),
        result: toolResult?.output ?? null,
        artifacts: toolResult?.output?.artifacts || [],
        kind: tool,
      });
    }

    // Unknown / invalid decision: keep two-function flow (except store creation handled above).
    return res.json({
      ...safeClarification(locale),
      ctaButtons: buildActionCtaButtons(''),
    });
  } catch (err) {
    console.warn(
      '[performerIntakeRoutes] reasoning-first intake error; falling through to next handler:',
      err?.message || err,
    );
    return next();
  }
});

export default router;