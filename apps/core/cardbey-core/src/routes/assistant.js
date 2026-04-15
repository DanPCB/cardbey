/**
 * Assistant API Routes
 * Lightweight endpoints for the assistant widget
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { requireUserOrGuest, canPerformAction } from '../middleware/guestAuth.js';
import { requestLog } from '../middleware/requestLog.js';
import { guestLimit } from '../middleware/guestLimit.js';
import { planMissionFromIntent } from '../lib/agentPlanner.js';
import { createMissionPipeline } from '../lib/missionPipelineService.js';
import { runMissionUntilBlocked } from '../lib/missionPipelineOrchestrator.js';
import { getTenantId } from '../lib/missionAccess.js';
import { llmGateway } from '../lib/llm/llmGateway.ts';
import { canAccessMission } from './agentMessagesRoutes.js';
import { createAgentMessage } from '../orchestrator/lib/agentMessage.js';
import { resolveMissionState } from '../lib/missionPipelineResolver.js';

const router = express.Router();
const USE_LLM_GATEWAY = process.env.USE_LLM_GATEWAY === 'true';
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// Initialize OpenAI client if API key is available
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000, // 30 second timeout
      maxRetries: 2,
    })
  : null;

const HAS_OPENAI = Boolean(openai);

// Apply logging and rate limiting to all assistant routes
router.use(requestLog);
router.use(guestLimit);

// Log that routes are being registered
console.log('[ASSISTANT] Router initialized - routes will be: POST /guest, POST /chat, POST /action, GET /summary');

/**
 * POST /api/assistant/guest
 * Generate guest token (no account needed)
 */
router.post('/guest', (req, res) => {
  console.log('[ASSISTANT] /guest hit');
  
  const guestId = `guest_${crypto.randomUUID()}`;
  
  const token = jwt.sign(
    { 
      guestId,
      role: 'guest',
      createdAt: Date.now()
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  console.log('[Assistant] Guest token created:', guestId);
  
  res.json({
    guestId,
    token,
    expiresIn: 86400,
    limitations: {
      rateLimit: '20 requests per day',
      allowedActions: ['show_trending', 'design_flyer', 'chat']
    }
  });
});

/**
 * Extract page context from request header
 * Supports both JSON string format: {"mode":"screens","pageId":"..."}
 * and simple string format: "screens" (treated as mode)
 */
function extractContext(req) {
  try {
    const contextHeader = req.headers['x-cardbey-context'];
    if (!contextHeader) return null;
    
    // Try parsing as JSON first
    try {
      const parsed = JSON.parse(contextHeader);
      return parsed;
    } catch (jsonError) {
      // If not JSON, treat as simple mode string
      return { mode: contextHeader };
    }
  } catch (err) {
    return null;
  }
}

/**
 * Generate mode-specific system hint for context-aware responses
 */
function getModeSystemHint(mode) {
  const hints = {
    home: "Homepage - focus on discovery and getting started",
    store: "Store Builder - help with products, pricing, and OCR upload",
    screens: "C-Net Displays - assist with pairing, playlists, and previews",
    marketing: "Marketing Dashboard - support campaigns, assets, and analytics",
    performer: "Performer Mode - show metrics and next-step tasks",
    explore: "Browse Mode - suggest nearby stores and trending items",
  };
  return hints[mode] || hints.home;
}

/**
 * Safe JSON parser that attempts multiple strategies
 * Returns parsed JSON or null if all attempts fail
 */
function safeJsonParse(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // Strategy 1: Try direct parse
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    // Continue to next strategy
  }

  // Strategy 2: Remove markdown code fences
  try {
    const cleaned = text.trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/```\s*$/, '')
      .trim();
    return JSON.parse(cleaned);
  } catch (e) {
    // Continue to next strategy
  }

  // Strategy 3: Extract first JSON object block
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // Continue to next strategy
  }

  // Strategy 4: Try to find JSON array
  try {
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0]);
    }
  } catch (e) {
    // All strategies failed
  }

  return null;
}

/**
 * Detect business builder mode from request body
 * Checks for business_builder_v1, fill_ tasks, schema, or field context
 */
function detectBusinessBuilder(reqBody) {
  if (!reqBody || typeof reqBody !== 'object') {
    return false;
  }

  const mode = reqBody.mode || '';
  const task = reqBody.task || '';
  const hasSchema = !!reqBody.schema && typeof reqBody.schema === 'object';
  const hasField = !!reqBody.context?.field;

  return (
    mode === 'business_builder_v1' ||
    mode.startsWith('business_builder') ||
    task.startsWith('fill_') ||
    hasSchema ||
    hasField
  );
}

/**
 * Check if context is business builder mode (legacy header-based detection)
 */
function isBusinessBuilderMode(context) {
  const mode = context?.mode || '';
  return mode === 'store' || mode === 'business_builder' || mode === 'business';
}

/**
 * Build context-aware system prompt for OpenAI
 */
function buildSystemPrompt(context, isGuest, requireJson = false) {
  const mode = context?.mode || 'home';
  const modeHint = getModeSystemHint(mode);
  
  let systemPrompt = `You are the Cardbey Assistant, a helpful AI assistant for the Cardbey digital signage and marketing platform.

Current Context: ${modeHint}

Your role:
- Provide helpful, concise, and friendly responses
- Guide users through Cardbey features and workflows
- Suggest relevant actions based on the current page/context
- Use emojis sparingly but appropriately
- Keep responses conversational and under 200 words unless detailed explanation is needed

Available features you can help with:
- 🔥 Show trending items and campaigns
- 🏪 Create and manage stores
- 🎨 Design marketing materials (flyers, posters)
- 📺 Connect and manage digital screens (C-Net displays)
- 📈 View analytics and performance metrics
- 📊 Performer mode features`;

  if (requireJson) {
    systemPrompt += `\n\nCRITICAL: You MUST return ONLY a single JSON object. Do not include markdown, code fences, or additional text. Return ONLY the JSON object.`;
  }

  if (isGuest) {
    systemPrompt += `\n\nNote: The user is in guest mode. Some features require signing in. Gently encourage sign-in for restricted features.`;
  }

  if (context?.pageId) {
    systemPrompt += `\n\nCurrent page: ${context.pageId}`;
  }

  if (context?.screenId) {
    systemPrompt += `\n\nUser is working with screen ID: ${context.screenId}`;
  }

  return systemPrompt;
}

/**
 * Simplified JSON Schema for business builder assistant structured output
 * Used with OpenAI's structured outputs feature
 */
const BUSINESS_BUILDER_STRUCTURED_SCHEMA = {
  type: 'object',
  properties: {
    field: {
      type: ['string', 'null'],
      description: 'The field name being addressed, or null for general suggestions'
    },
    patch: {
      type: 'object',
      description: 'Object containing field name and suggested value (e.g., { businessDescription: "..." })',
      additionalProperties: {
        type: 'string'
      }
    },
    content: {
      type: 'string',
      description: 'Optional human-readable explanation or content'
    },
    suggestions: {
      type: 'array',
      description: 'Array of suggestion strings',
      items: {
        type: 'string'
      }
    }
  },
  required: ['patch'],
  additionalProperties: false
};

/**
 * Build business builder specific system prompt with JSON schema
 */
function buildBusinessBuilderSystemPrompt(context, isGuest, isRetry = false) {
  const field = context?.requestField || null;
  const task = context?.task || null;
  const mode = context?.mode || 'business_builder_v1';
  const schema = context?.schema || {};
  
  let fieldContext = '';
  if (field) {
    const fieldLabel = schema[field] || field;
    fieldContext = `\n\nCRITICAL: The user is asking about field "${field}". You MUST:
- Set "field" to exactly "${field}" (string)
- Set "patch" to exactly {"${field}": "<your suggested text>"}
- Set "meta.field" to exactly "${field}"
- Set "meta.task" to exactly "${task || 'fill_business_basics'}"
- Set "meta.mode" to exactly "${mode}"`;
  } else if (task) {
    fieldContext = `\n\nCurrent task: "${task}"\nHelp the user complete this task. Set "meta.task" to "${task}".`;
  }
  
  const basePrompt = `You are the Cardbey Business Builder Assistant. Help users fill out business information fields.

CRITICAL: Return ONLY valid minified JSON. No markdown. No code fences. No extra text. No explanations. Return ONLY the JSON object.

Response format (JSON only, must match this exact structure):
{
  "ok": true,
  "patch": { "<fieldName>": "<suggested text>" },
  "meta": { "mode": "business_builder_v1", "task": "<task>", "field": "<fieldName>" }
}

Example response:
{
  "ok": true,
  "patch": { "businessDescription": "A cozy neighborhood cafe serving artisanal coffee and fresh pastries." },
  "meta": { "mode": "business_builder_v1", "task": "fill_business_basics", "field": "businessDescription" }
}

Rules:
- "ok" must be exactly true (boolean)
- "patch" must be an object with exactly ONE key matching the field name from "meta.field"
- "meta" must be an object with:
  - "mode": exactly "business_builder_v1" (string)
  - "task": the task name (string, e.g., "fill_business_basics", "suggest_industry", etc.)
  - "field": the field name being addressed (string, e.g., "businessDescription", "storeSlug", etc.)

If the field is missing from the request, return:
{
  "ok": false,
  "error": "missing_field",
  "meta": { "mode": "business_builder_v1", "task": "${task || 'unknown'}", "field": null }
}${fieldContext}

Return ONLY the JSON object, no other text. No markdown. No code fences.`;

  if (isRetry) {
    return basePrompt + `\n\nIMPORTANT: This is a retry. You MUST return valid minified JSON that matches the schema exactly. No markdown, no code fences, no explanations, no whitespace outside the JSON - ONLY the JSON object.`;
  }

  return basePrompt;
}

/**
 * Validate response against schema
 */
function validateBusinessBuilderResponse(response) {
  if (!response || typeof response !== 'object') {
    return { valid: false, error: 'Response is not an object' };
  }

  // Check required fields
  const required = ['ok', 'intent', 'field', 'patch', 'suggestions', 'meta'];
  for (const field of required) {
    if (!(field in response)) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  // Validate types
  if (typeof response.ok !== 'boolean') {
    return { valid: false, error: 'Field "ok" must be a boolean' };
  }

  if (response.intent !== 'business_builder_help') {
    return { valid: false, error: 'Field "intent" must be "business_builder_help"' };
  }

  if (response.field !== null && typeof response.field !== 'string') {
    return { valid: false, error: 'Field "field" must be a string or null' };
  }

  if (!response.patch || typeof response.patch !== 'object' || Array.isArray(response.patch)) {
    return { valid: false, error: 'Field "patch" must be an object' };
  }

  if (!Array.isArray(response.suggestions)) {
    return { valid: false, error: 'Field "suggestions" must be an array' };
  }

  // content is optional, but if present must be string
  if (response.content !== undefined && typeof response.content !== 'string') {
    return { valid: false, error: 'Field "content" must be a string if provided' };
  }

  if (!response.meta || typeof response.meta !== 'object' || Array.isArray(response.meta)) {
    return { valid: false, error: 'Field "meta" must be an object' };
  }

  if (!response.meta.language || !['en', 'vi'].includes(response.meta.language)) {
    return { valid: false, error: 'Field "meta.language" must be "en" or "vi"' };
  }

  return { valid: true };
}

/**
 * Parse AI JSON response with fallback to wrap plain text
 * Converts plain text responses into valid JSON structure
 */
function parseAiJson(rawText, context = {}) {
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }

  // Strategy 1: Try direct JSON parse
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (e) {
    // Continue to next strategy
  }

  // Strategy 2: Strip markdown code fences and try again
  try {
    const cleaned = trimmed
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/```\s*$/, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (e) {
    // Continue to next strategy
  }

  // Strategy 3: Extract first JSON object block
  try {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch (e) {
    // Continue to fallback
  }

  // Strategy 4: Fallback - wrap plain text into valid JSON structure
  // Use field from request context if available, otherwise try to detect
  let detectedField = context?.requestField || null;
  
  if (!detectedField) {
    // Try to detect if user was asking about a specific field
    const lowerText = trimmed.toLowerCase();
    const fieldKeywords = {
      name: ['name', 'business name', 'store name'],
      businessDescription: ['description', 'describe', 'about', 'what is'],
      tagline: ['tagline', 'slogan', 'catchphrase'],
      location: ['location', 'address', 'where'],
    };

    for (const [field, keywords] of Object.entries(fieldKeywords)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        detectedField = field;
        break;
      }
    }
  }

  // Build valid JSON response from plain text
  return {
    ok: true,
    intent: 'business_builder_help',
    field: detectedField,
    patch: detectedField ? { [detectedField]: trimmed } : {},
    suggestions: [],
    content: trimmed, // Include the original text as content
    meta: {
      language: context?.locale || 'en',
    },
  };
}

/**
 * Generate mock reply - context-aware!
 */
function generateMockReply(message, context, isGuest = false) {
  const mode = context.mode || 'home';
  
  // Mode-specific greetings for short messages
  if (message.length < 20 && (message.includes('hi') || message.includes('hello') || message.includes('help'))) {
    const modeGreetings = {
      home: "👋 Welcome! I can help you discover trending stores, create your business, or design marketing materials.",
      store: "🏪 Store Mode! I can help you add products, set pricing, or generate QR codes.",
      screens: "📺 Screens Mode! Need help pairing displays, managing playlists, or scheduling content?",
      marketing: "📈 Marketing Dashboard! I can assist with campaigns, analytics, or designing assets.",
      performer: "📊 Performer Mode! Check your daily metrics, view top items, or get action suggestions.",
      explore: "🔍 Browse Mode! I can show you trending stores, nearby services, or help you find products.",
    };
    return modeGreetings[mode] || modeGreetings.home;
  }
  
  if (message.includes('trending') || message.includes('popular')) {
    return "🔥 Here are today's trending items on Cardbey:\n\n• 🥖 Bánh mì Saigon - 1.2K views\n• 🍜 Phở specials - 890 views\n• 💅 Nail spa services - 650 views\n\nClick 'Show Trending' above for more!";
  }
  
  if (message.includes('store') || message.includes('business')) {
    if (isGuest) {
      return "I can help you set up a store! 🏪\n\nFirst, create an account to get started with your business on Cardbey.";
    }
    return "I can help you set up your store!\n\nYou'll need:\n• Business name & category\n• Location & hours\n• Logo & description\n\nClick 'Create Store' above to begin!";
  }
  
  if (message.includes('screen') || message.includes('display')) {
    if (isGuest) {
      return "Digital screens help you reach more customers! 📺\n\nSign in to connect and manage your displays.";
    }
    return "To connect screens:\n1. Settings → C-Net\n2. Add device code\n3. Configure playlists\n\nClick 'Connect Screens' above!";
  }
  
  if (message.includes('flyer') || message.includes('design') || message.includes('marketing')) {
    return "I can create professional marketing materials! 🎨\n\nClick 'Design Flyer' above and I'll generate a custom design.";
  }
  
  // Generic mode-aware response
  const modeHint = getModeSystemHint(mode);
  const greeting = isGuest ? "Hi! I'm the Cardbey Assistant (Guest Mode). 🤖" : "Hi! I'm here to help! 🤖";
  return `${greeting}\n\n💡 **${modeHint}**\n\nTry:\n• 🔥 Show trending items\n• 🏪 Create your store${isGuest ? ' (sign in required)' : ''}\n• 🎨 Design flyers\n• 📺 Connect screens${isGuest ? ' (sign in required)' : ''}\n\nWhat would you like to try?`;
}

/**
 * Build system prompt for MI when helping with a specific mission (context.missionId present).
 */
function buildMissionSystemPrompt(context) {
  const intentType = context.intentType || 'mission';
  const missionStatus = context.missionStatus || 'unknown';
  const storeId = context.storeId || '';
  const lastResult = context.lastResult;
  const missionPlan = context.missionPlan;
  let block = `You are MI, an AI assistant for Cardbey — a platform that helps small businesses manage their store and marketing.

You are currently helping with this mission:
- Mission type: ${intentType}
- Status: ${missionStatus}
${context.currentStepName ? `- Currently executing step: ${context.currentStepName}` : ''}
- Store ID: ${storeId || '(none)'}
`;
  if (lastResult != null && typeof lastResult === 'object') {
    try {
      block += `- Last result: ${JSON.stringify(lastResult)}\n`;
    } catch (_) {
      block += '- Last result: (available)\n';
    }
  }
  if (missionPlan != null && typeof missionPlan === 'object') {
    try {
      block += `- Plan: ${JSON.stringify(missionPlan)}\n`;
    } catch (_) {
      block += '- Plan: (available)\n';
    }
  }
  block += `
When the user asks about mission status, summarise what has happened and what comes next based on the context above.
When the user asks to improve results, suggest the next most relevant intent from: rewrite_descriptions, generate_tags, create_offer, improve_hero, analyze_store.
Keep replies concise — 2-3 sentences maximum.
Never say you don't have access to the mission — use the context provided above.`;
  return block;
}

/**
 * Return context-aware nextSuggestions for MI chat response (when context.missionId is present).
 */
function getMissionNextSuggestions(context) {
  const status = (context.missionStatus || '').toLowerCase();
  const intentType = (context.intentType || '').toLowerCase();

  if (status === 'running') {
    return ['Check status', 'What is running?', 'Can I cancel?'];
  }

  if (status === 'completed') {
    switch (intentType) {
      case 'rewrite_descriptions':
        return ['Generate tags', 'Create a promotion', 'Improve hero', 'Analyze performance'];
      case 'generate_tags':
        return ['Rewrite descriptions', 'Create a promotion', 'Publish store'];
      case 'create_offer':
      case 'create_promotion':
      case 'promotion_launch':
        return ['Show promo on my store', 'Generate social posts', 'Create QR code'];
      default:
        return ['Improve results', 'Start follow-up', 'What can you do?'];
    }
  }

  return ['Improve results', 'Start follow-up', 'What can you do?'];
}

/**
 * POST /api/assistant/chat
 * Send message to assistant with journey detection
 */
router.post('/chat', requireUserOrGuest, async (req, res, next) => {
  console.log('[ASSISTANT] /chat hit');
  
  try {
    const { message } = req.body;
    const context = extractContext(req);
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const bodyContext = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
    const missionId = bodyContext.missionId && typeof bodyContext.missionId === 'string' ? bodyContext.missionId.trim() : null;

    // Mission-scoped MI chat: respond with mission context and persist user + agent messages
    if (missionId) {
      const allowed = await canAccessMission(missionId, req.user);
      if (!allowed) {
        return res.status(403).json({ error: 'You do not have access to this mission.' });
      }
      const pathname = bodyContext.pathname || '';
      let missionContext = {
        missionId,
        intentType: bodyContext.intentType || '',
        storeId: bodyContext.storeId || '',
        lastResult: bodyContext.lastResult ?? null,
        missionStatus: bodyContext.missionStatus || '',
        missionPlan: bodyContext.missionPlan ?? null,
        pathname,
      };
      // Enrich from pipeline state if not provided
      let currentStepName = bodyContext.currentStepName || '';
      if (!missionContext.intentType || !missionContext.missionStatus) {
        const pipelineState = await resolveMissionState(missionId).catch(() => null);
        if (pipelineState) {
          if (!missionContext.intentType) missionContext.intentType = pipelineState.type || '';
          if (!missionContext.missionStatus) missionContext.missionStatus = pipelineState.status || '';
          if (missionContext.lastResult == null && pipelineState.lastResult) missionContext.lastResult = pipelineState.lastResult;
          if (pipelineState.currentStep?.label) currentStepName = pipelineState.currentStep.label;
          if (!missionContext.storeId && pipelineState.target?.id && pipelineState.target?.type === 'store') missionContext.storeId = pipelineState.target.id;
        }
      }
      missionContext.currentStepName = currentStepName;
      const systemPrompt = buildMissionSystemPrompt(missionContext);
      const nextSuggestions = getMissionNextSuggestions(missionContext);

      // Create user message in agent_messages so thread shows it
      await createAgentMessage({
        missionId,
        senderType: 'user',
        senderId: 'user',
        channel: 'main',
        text: message.trim(),
        messageType: 'text',
        payload: null,
        visibleToUser: true,
      });

      let text = "I'm here to help. Use the context above to answer.";
      if (HAS_OPENAI || USE_LLM_GATEWAY) {
        try {
          const userPrompt = message.trim();
          if (USE_LLM_GATEWAY) {
            const promptForGateway = `${systemPrompt}\n\n---\n\nUser: ${userPrompt}`;
            const result = await llmGateway.generate({
              purpose: 'assistant_chat',
              prompt: promptForGateway,
              tenantKey: req.user?.id ?? 'guest',
              model: 'gpt-4o-mini',
              maxTokens: 400,
              responseFormat: 'text',
              temperature: 0.3,
            });
            text = result.text ?? text;
          } else {
            const completion = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              temperature: 0.3,
              max_tokens: 400,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
            });
            text = completion.choices[0]?.message?.content?.trim() || text;
          }
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') console.warn('[Assistant] Mission chat LLM error:', err?.message || err);
        }
      }

      const agentMsg = await createAgentMessage({
        missionId,
        senderType: 'agent',
        senderId: 'mi',
        channel: 'main',
        text,
        messageType: 'text',
        payload: null,
        visibleToUser: true,
      });
      if (agentMsg && process.env.NODE_ENV !== 'production') {
        console.log('[Assistant] Mission-scoped reply created:', missionId);
      }

      return res.json({
        text,
        nextSuggestions,
        result: {
          missionId,
          type: missionContext.intentType || null,
          intentType: missionContext.intentType || null,
          title:
            (typeof bodyContext.title === 'string' && bodyContext.title.trim()) ||
            null,
        },
      });
    }

    const isAgentMode = bodyContext.pathname != null || bodyContext.lastResult != null || bodyContext.storeId != null;

    // Phase 3: Backend agent — classify intent, optionally create mission, return text + result + nextSuggestions
    if (isAgentMode && !detectBusinessBuilder(req.body)) {
      const getNextSuggestions = async (storeId, fallback) => {
        if (!storeId || typeof storeId !== 'string') return fallback;
        try {
          const opportunities = await prisma.intentOpportunity.findMany({
            where: { storeId, status: 'open', source: 'llm_inference' },
            orderBy: { createdAt: 'asc' },
            take: 4,
          });
          return opportunities.length > 0
            ? opportunities.map((o) => o.recommendedIntentType.replace(/_/g, ' '))
            : fallback;
        } catch {
          return fallback;
        }
      };
      try {
        const intent = String(message).trim();
        const planResult = planMissionFromIntent({ intent, context: bodyContext });
        if (planResult.ok && planResult.missionPlan) {
          const plan = planResult.missionPlan;
          const isStoreType = plan.missionType === 'store';
          if (!req.user?.id && !isStoreType) {
            return res.json({
              text: 'Sign in to run this mission.',
              nextSuggestions: await getNextSuggestions(bodyContext.storeId, ['Create a store', 'Sign in', 'Describe what you want']),
            });
          }
          const created = await createMissionPipeline({
            type: plan.missionType,
            title: plan.title,
            targetType: plan.targetType || 'generic',
            targetId: plan.targetId,
            targetLabel: plan.targetLabel,
            metadata: plan.metadata || {},
            requiresConfirmation: Boolean(plan.requiresConfirmation),
            tenantId: req.user ? getTenantId(req.user) : null,
            createdBy: req.user?.id ?? null,
          });
          if (created.status === 'queued') {
            await runMissionUntilBlocked(created.id);
          }
          if (process.env.NODE_ENV !== 'production') {
            console.log('[Assistant] Agent created mission:', created.id, plan.title);
          }
          return res.json({
            text: `Mission created: ${plan.title}. Open it to continue or stay here to try something else.`,
            result: { type: 'mission_created', missionId: created.id, title: plan.title },
            nextSuggestions: await getNextSuggestions(bodyContext.storeId, ['Open mission', 'Start another', 'Describe what you want below']),
          });
        }
        const staticText = generateMockReply(message.toLowerCase(), { mode: bodyContext.pathname?.startsWith('/app') ? 'performer' : 'home', ...bodyContext }, req.isGuest);
        return res.json({ text: staticText, nextSuggestions: await getNextSuggestions(bodyContext.storeId, ['Create a store', 'Find products', 'What\'s trending']) });
      } catch (agentErr) {
        if (process.env.NODE_ENV !== 'production') console.warn('[Assistant] Agent flow error:', agentErr?.message || agentErr);
        const fallbackText = generateMockReply(message.toLowerCase(), bodyContext, req.isGuest);
        return res.json({ text: fallbackText, nextSuggestions: await getNextSuggestions(bodyContext.storeId, ['Create a store', 'Describe what you want']) });
      }
    }

    console.log(`[Assistant] Chat from ${req.isGuest ? 'guest' : 'user'} ${req.userId}:`, message);
    console.log('[Assistant] Context:', context);
    console.log('[Assistant] Request body:', JSON.stringify(req.body, null, 2));
    
    // Detect business builder mode from request body (primary) or context header (fallback)
    const isBusinessBuilder = detectBusinessBuilder(req.body) || isBusinessBuilderMode(context);
    const requiresJson = isBusinessBuilder;
    
    console.log('[Assistant] Mode detection:', {
      mode: req.body?.mode || context?.mode,
      task: req.body?.task,
      hasSchema: !!req.body?.schema,
      hasField: !!req.body?.context?.field,
      isBusinessBuilder,
      requiresJson: requiresJson, // Log requiresJson for business_builder_v1
      usesStructuredOutput: isBusinessBuilder
    });
    
    // Enhanced logging for Business Builder mode
    if (isBusinessBuilder) {
      console.log('[Assistant] Business Builder request detected:', {
        requiresJson: true,
        mode: req.body?.mode || 'business_builder_v1',
        task: req.body?.task || null,
        field: req.body?.context?.field || null,
        hasSchema: !!req.body?.schema
      });
    }
    
    const lowerMessage = message.toLowerCase();
    
    // Detect journey-related intents (skip if business builder mode)
    if (!isBusinessBuilder) {
      const journeyIntent = detectJourneyIntent(lowerMessage);
      
      if (journeyIntent) {
        console.log(`[Assistant] Detected journey intent: ${journeyIntent.slug}`);
        
        // Get template
        const template = await prisma.journeyTemplate.findUnique({
          where: { slug: journeyIntent.slug },
          include: {
            steps: {
              orderBy: { orderIndex: 'asc' },
              select: { title: true, kind: true }
            }
          }
        });
        
        if (template) {
          const journeyCard = {
            templateId: template.id,
            slug: template.slug,
            title: template.title,
            summary: template.summary,
            stepCount: template.steps.length,
            estimatedMinutes: template.steps.length * 10,
            steps: template.steps.map(s => s.title),
            previewOnly: req.isGuest,
            action: req.isGuest ? 'preview' : 'start'
          };
          
          const response = {
            ok: true,
            reply: journeyIntent.reply,
            journeyCard
          };
          
          console.log('[Assistant] Returning journey card:', JSON.stringify(journeyCard, null, 2));
          
          return res.json(response);
        } else {
          console.warn('[Assistant] Template not found for slug:', journeyIntent.slug);
        }
      }
    }
    
    // Try OpenAI if available, otherwise fall back to mock
    let reply;
    let aiResponseRaw = null;
    
    if (HAS_OPENAI) {
      try {
        let systemPrompt;
        let openaiConfig = {
          model: 'gpt-4o-mini',
          temperature: 0.7,
          max_tokens: 500,
        };

        if (isBusinessBuilder && requiresJson) {
          // Business builder mode: use structured outputs with JSON schema
          // Enhance context with request body info for better prompts
          const enhancedContext = {
            ...context,
            requestField: req.body?.context?.field,
            schema: req.body?.schema,
            task: req.body?.task,
            mode: req.body?.mode,
          };
          systemPrompt = buildBusinessBuilderSystemPrompt(enhancedContext, req.isGuest, false);
          
          // Use structured outputs with JSON schema (supported by gpt-4o-mini and newer models)
          // This ensures the model returns valid JSON matching our schema
          try {
            openaiConfig.response_format = {
              type: 'json_schema',
              json_schema: {
                name: 'business_builder_response',
                strict: true,
                schema: BUSINESS_BUILDER_STRUCTURED_SCHEMA,
              },
            };
            console.log('[Assistant] Using structured output with JSON schema');
          } catch (schemaError) {
            // Fallback to json_object if schema format not supported
            console.warn('[Assistant] Structured output schema not supported, falling back to json_object');
            openaiConfig.response_format = { type: 'json_object' };
          }
          openaiConfig.temperature = 0.2; // Lower temperature for more consistent structured output
        } else {
          // Regular chat mode
          systemPrompt = buildSystemPrompt(context, req.isGuest, false);
        }
        
        const userPrompt = message;
        
        console.log('[Assistant] Calling OpenAI with context:', { 
          mode: req.body?.mode || context?.mode, 
          task: req.body?.task,
          isGuest: req.isGuest,
          isBusinessBuilder,
          requiresJson,
          usesStructuredOutput: isBusinessBuilder
        });
        
        // Attempt OpenAI call with retry logic for business builder
        let completion;
        let attemptCount = 0;
        const maxAttempts = isBusinessBuilder ? 2 : 1;
        let lastError = null;
        
        while (attemptCount < maxAttempts) {
          try {
            // On retry, use stricter prompt
            if (attemptCount > 0 && isBusinessBuilder) {
              const enhancedContext = {
                ...context,
                requestField: req.body?.context?.field,
                schema: req.body?.schema,
                task: req.body?.task,
                mode: req.body?.mode,
              };
              systemPrompt = buildBusinessBuilderSystemPrompt(enhancedContext, req.isGuest, true);
              console.log('[Assistant] Retrying with stricter prompt (attempt', attemptCount + 1, ')');
            }

            if (USE_LLM_GATEWAY) {
              const promptForGateway = `${systemPrompt}\n\n---\n\nUser: ${userPrompt}`;
              const result = await llmGateway.generate({
                purpose: 'assistant_chat',
                prompt: promptForGateway,
                tenantKey: req.user?.id ?? 'guest',
                model: 'gpt-4o-mini',
                maxTokens: openaiConfig.max_tokens ?? 1000,
                responseFormat: isBusinessBuilder && requiresJson ? 'json' : 'text',
                temperature: openaiConfig.temperature ?? 0.3,
              });
              aiResponseRaw = result.text ?? '';
            } else {
              completion = await openai.chat.completions.create({
                ...openaiConfig,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt },
                ],
              });
              aiResponseRaw = completion.choices[0]?.message?.content || '';
            }
            
            // Log raw response in dev mode (truncated to 500 chars)
            if (process.env.NODE_ENV !== 'production') {
              const truncated = aiResponseRaw.substring(0, 500);
              console.log('[Assistant] Raw AI response (truncated):', truncated);
              if (aiResponseRaw.length > 500) {
                console.log('[Assistant] ... (truncated, total length:', aiResponseRaw.length, ')');
              }
            }
            
            if (isBusinessBuilder && requiresJson) {
              // Get field from request body context - REQUIRED for Business Builder
              const requestField = req.body?.context?.field || null;
              const requestTask = req.body?.task || null;
              const requestMode = req.body?.mode || 'business_builder_v1';
              
              // Validate that field is present
              if (!requestField) {
                console.warn('[Assistant] Business Builder request missing field:', {
                  mode: requestMode,
                  task: requestTask,
                  context: req.body?.context
                });
                return res.json({
                  ok: false,
                  error: 'missing_field',
                  meta: {
                    mode: requestMode,
                    task: requestTask || null,
                    field: null
                  }
                });
              }
              
              // Try to parse JSON response - STRICT parsing only
              let parsed = null;
              let parseError = null;
              
              try {
                // Strategy 1: Direct JSON parse (remove any markdown code fences first)
                let cleanedResponse = aiResponseRaw.trim();
                
                // Remove markdown code fences if present
                const codeFenceMatch = cleanedResponse.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
                if (codeFenceMatch) {
                  cleanedResponse = codeFenceMatch[1];
                  console.log('[Assistant] Removed markdown code fences');
                }
                
                // Parse JSON
                parsed = JSON.parse(cleanedResponse);
                
                // Validate parsed response structure
                if (!parsed || typeof parsed !== 'object') {
                  throw new Error('Response is not an object');
                }
                
                // Validate required fields
                if (parsed.ok === undefined) {
                  throw new Error('Missing required field: ok');
                }
                
                if (!parsed.patch || typeof parsed.patch !== 'object') {
                  throw new Error('Missing or invalid field: patch');
                }
                
                // Enforce that patch key matches requestField
                const patchKeys = Object.keys(parsed.patch);
                if (patchKeys.length === 0) {
                  throw new Error('Patch object is empty');
                }
                
                // If patch has a key that doesn't match requestField, use requestField
                if (!parsed.patch[requestField] && patchKeys.length > 0) {
                  // Use the first key's value but rename it to requestField
                  const firstKey = patchKeys[0];
                  parsed.patch = { [requestField]: parsed.patch[firstKey] };
                  console.warn('[Assistant] Patch key mismatch, corrected:', firstKey, '->', requestField);
                }
                
                // Ensure meta object exists and has correct structure
                if (!parsed.meta || typeof parsed.meta !== 'object') {
                  parsed.meta = {};
                }
                
                // Enforce meta fields
                parsed.meta.mode = requestMode;
                parsed.meta.task = requestTask || null;
                parsed.meta.field = requestField;
                
                // Ensure ok is boolean true for success
                if (parsed.ok === true) {
                  console.log('[Assistant] Business Builder JSON parsed successfully:', {
                    ok: parsed.ok,
                    patchKeys: Object.keys(parsed.patch),
                    meta: parsed.meta
                  });
                  
                  // Return validated response
                  return res.json({
                    ok: true,
                    patch: parsed.patch,
                    meta: parsed.meta
                  });
                } else {
                  // Response indicates error
                  return res.json({
                    ok: false,
                    error: parsed.error || 'unknown_error',
                    meta: parsed.meta || {
                      mode: requestMode,
                      task: requestTask || null,
                      field: requestField
                    }
                  });
                }
                
              } catch (jsonError) {
                parseError = jsonError;
                console.error('[Assistant] JSON parse error:', jsonError.message);
                
                // Log raw response (truncated) for debugging
                const rawTruncated = aiResponseRaw.substring(0, 2000);
                console.error('[Assistant] Raw response (truncated):', rawTruncated);
                
                // Retry if we haven't exhausted attempts
                if (attemptCount < maxAttempts - 1) {
                  attemptCount++;
                  console.warn('[Assistant] Retrying with stricter prompt (attempt', attemptCount + 1, ')');
                  continue; // Retry with stricter prompt
                }
                
                // All attempts exhausted - return error JSON
                return res.json({
                  ok: false,
                  error: 'model_invalid_json',
                  meta: {
                    mode: requestMode,
                    task: requestTask || null,
                    field: requestField
                  },
                  raw: rawTruncated
                });
              }
            } else {
              // Regular chat mode - return text reply
              reply = aiResponseRaw || 'I apologize, but I couldn\'t generate a response. Please try again.';
              
              if (process.env.NODE_ENV !== 'production') {
                console.log('[Assistant] OpenAI response received:', reply.substring(0, 100) + '...');
              }
              
              break; // Exit retry loop for regular chat
            }
          } catch (apiError) {
            lastError = apiError.message || 'OpenAI API error';
            console.error('[Assistant] OpenAI API error (attempt', attemptCount + 1, '):', lastError);
            
            // If it's a structured output error and we can retry, fall back to json_object
            if (isBusinessBuilder && attemptCount < maxAttempts - 1) {
              const errorMsg = apiError.message?.toLowerCase() || '';
              if (errorMsg.includes('json_schema') || errorMsg.includes('schema') || 
                  errorMsg.includes('response_format') || errorMsg.includes('not supported')) {
                // Fall back to json_object mode on retry if structured outputs failed
                console.warn('[Assistant] Structured outputs not supported, falling back to json_object mode');
                openaiConfig.response_format = { type: 'json_object' };
                attemptCount++;
                continue;
              }
            }
            
            // If we've exhausted retries for business builder, return error JSON with proper structure
            if (isBusinessBuilder && attemptCount >= maxAttempts - 1) {
              return res.json({
                ok: false,
                error: 'ai_service_error',
                meta: {
                  mode: req.body?.mode || 'business_builder_v1',
                  task: req.body?.task || null,
                  field: req.body?.context?.field || null
                },
                ...(process.env.NODE_ENV !== 'production' && { raw: lastError?.substring(0, 2000) }), // Dev only, max 2000 chars
              });
            }
            
            // Re-throw for regular chat mode or if we can't handle it
            throw apiError;
          }
        }
      } catch (openaiError) {
        console.error('[Assistant] OpenAI error:', openaiError.message);
        
        if (isBusinessBuilder) {
          // Return error JSON for business builder with proper structure
          return res.json({
            ok: false,
            error: 'ai_service_error',
            meta: {
              mode: req.body?.mode || 'business_builder_v1',
              task: req.body?.task || null,
              field: req.body?.context?.field || null
            },
            ...(process.env.NODE_ENV !== 'production' && { raw: openaiError.message?.substring(0, 2000) }), // Dev only, max 2000 chars
          });
        }
        
        // Fall back to mock reply on OpenAI error for regular chat
        reply = generateMockReply(lowerMessage, context, req.isGuest);
        console.log('[Assistant] Falling back to mock reply due to OpenAI error');
      }
    } else {
      // No OpenAI available
      if (isBusinessBuilder) {
        // Return error JSON for business builder with proper structure
        return res.json({
          ok: false,
          error: 'ai_not_configured',
          meta: {
            mode: req.body?.mode || 'business_builder_v1',
            task: req.body?.task || null,
            field: req.body?.context?.field || null
          }
        });
      }
      
      // Use mock reply for regular chat
      reply = generateMockReply(lowerMessage, context, req.isGuest);
      console.log('[Assistant] Using mock reply (OpenAI not configured)');
    }
    
    // Add upgrade prompt for guests on restricted topics (only for regular chat)
    if (!isBusinessBuilder && req.isGuest && (lowerMessage.includes('store') || lowerMessage.includes('screen') || lowerMessage.includes('campaign'))) {
      reply += '\n\n💡 *Sign in to unlock full features!*';
    }
    
    // Return regular chat response
    res.json({ ok: true, reply });
  } catch (error) {
    next(error);
  }
});

/**
 * Detect journey intent from natural language
 */
function detectJourneyIntent(message) {
  const intents = [
    {
      patterns: ['launch store', 'create store', 'set up store', 'open store', 'start selling'],
      slug: 'launch-store-60',
      reply: '🚀 Great! Let me help you launch your store. I have a guided journey that takes about 60 minutes.'
    },
    {
      patterns: ['weekend promo', 'promotion', 'campaign', 'marketing campaign', 'run promo'],
      slug: 'weekend-promo',
      reply: '📅 Perfect timing for a promotional campaign! I can guide you through designing, publishing, and tracking it.'
    },
    {
      patterns: ['connect screen', 'pair screen', 'set up screen', 'add display', 'c-net'],
      slug: 'connect-screens',
      reply: '📺 Let\'s get your C-Net screens connected! I have a step-by-step journey ready.'
    }
  ];
  
  for (const intent of intents) {
    if (intent.patterns.some(pattern => message.includes(pattern))) {
      return intent;
    }
  }
  
  return null;
}

/**
 * POST /api/assistant/action
 * Execute quick action
 */
router.post('/action', requireUserOrGuest, async (req, res, next) => {
  try {
    const { intent, payload } = req.body;
    const context = extractContext(req);
    
    if (!intent) {
      return res.status(400).json({ error: 'Intent is required' });
    }
    
    // Check permissions (guests have limitations)
    // For restricted intents, let them through to show teaser carousel
    // (The intent handler will return proper locked response with teaser)
    if (!canPerformAction(req, intent)) {
      // Don't block here - let intent handler show teaser!
      // Only block unknown/dangerous intents
      const allowedForTeaser = ['create_store', 'connect_screens', 'add_product', 'show_metrics'];
      if (!allowedForTeaser.includes(intent)) {
        console.log('[Assistant] Blocking unknown intent:', intent);
        return res.status(403).json({
          status: 'locked',
          reason: 'signin_required',
          error: 'This action requires a full account',
          message: 'Sign in to unlock this feature',
          upgradeUrl: '/signup'
        });
      }
      console.log('[Assistant] Allowing restricted intent to pass through:', intent);
    }
    
    console.log(`[Assistant] Action from ${req.isGuest ? 'guest' : 'user'} ${req.userId}: ${intent}`);
    
    // Handle intents
    switch (intent) {
      case 'show_trending':
        return res.json({
          status: 'ok',
          cards: [
            {
              title: 'Pumpkin Spice Latte Promo',
              kind: 'campaign',
              subtitle: 'Running now • 1.2K views',
              cta: req.isGuest ? null : '/dashboard/campaigns/123',
              icon: '🎃'
            },
            {
              title: 'Top 10 Flyers Trending',
              kind: 'flyer-list',
              subtitle: 'This week\'s most viewed',
              cta: '/designer/templates?sort=trending',
              icon: '🔥'
            },
            {
              title: 'Nail Spa Services',
              kind: 'service',
              subtitle: 'Sydney • $35',
              cta: '/services/nail-spa-123',
              icon: '💅'
            }
          ]
        });
      
      case 'create_store':
        if (req.isGuest) {
          // Return teaser carousel for guests; signinReturnTo so frontend can send users to login with correct return (create-store flow, not /app).
          const createStoreReturnTo = '/app/store/temp/review';
          if (process.env.NODE_ENV !== 'production') {
            console.log('[Assistant] create_store guest: signinReturnTo', { signinReturnTo: createStoreReturnTo, authState: 'guest' });
          }
          console.log('[Assistant] Returning teaser carousel for guest');
          return res.json({
            status: 'locked',
            reason: 'signin_required',
            message: 'Create a store in 60 seconds',
            signinReturnTo: createStoreReturnTo,
            teaser: [
              {
                title: 'Scan Your Menu with AI',
                image: 'https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?w=400&q=80',
                caption: 'OCR extracts products → instant live store'
              },
              {
                title: 'Auto-Publish to Screens',
                image: 'https://images.unsplash.com/photo-1551721434-8b94ddff0e6d?w=400&q=80',
                caption: 'Connect C-Net displays and play immediately'
              },
              {
                title: 'Track Performance Live',
                image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&q=80',
                caption: 'Real-time views, clicks, and conversions'
              }
            ]
          });
        }
        
        // Check if user has business
        if (req.user && req.user.hasBusiness) {
          return res.json({
            status: 'ok',
            next: {
              type: 'open-url',
              href: '/dashboard/store/settings',
              label: 'Open Store Settings'
            }
          });
        }
        
        return res.json({
          status: 'ok',
          next: {
            type: 'open-url',
            href: '/store/setup',
            label: 'Set Up Your Store'
          }
        });
      
      case 'design_flyer':
        const { title, offer, brandColor } = payload || {};
        const draftId = crypto.randomUUID().split('-')[0];
        
        // Guests get preview only
        if (req.isGuest) {
          return res.json({
            status: 'ok',
            assetPreview: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80',
            message: 'Here\'s a preview! Sign in to customize and download.',
            next: {
              type: 'open-url',
              href: '/signup?intent=design_flyer',
              label: 'Sign In to Customize'
            }
          });
        }
        
        return res.json({
          status: 'ok',
          assetPreview: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80',
          next: {
            type: 'open-url',
            href: `/designer?draft=${draftId}${title ? `&title=${encodeURIComponent(title)}` : ''}`,
            label: 'Open in Designer'
          }
        });
      
      case 'connect_screens':
        if (req.isGuest) {
          // Return teaser carousel for guests; signinReturnTo so frontend preserves seller intent after login.
          const screensReturnTo = '/screens/setup';
          if (process.env.NODE_ENV !== 'production') {
            console.log('[Assistant] connect_screens guest: signinReturnTo', { signinReturnTo: screensReturnTo, authState: 'guest' });
          }
          return res.json({
            status: 'locked',
            reason: 'signin_required',
            message: 'Connect screens and go live instantly',
            signinReturnTo: screensReturnTo,
            teaser: [
              {
                title: 'Pair with QR Code',
                image: 'https://images.unsplash.com/photo-1618044733300-9472054094ee?w=400&q=80',
                caption: 'Scan pairing code → screen connects in seconds'
              },
              {
                title: 'Manage Playlists',
                image: 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=400&q=80',
                caption: 'Schedule content, set loops, preview remotely'
              }
            ]
          });
        }
        
        // TODO: Query actual devices
        const hasScreens = false;
        
        if (hasScreens) {
          return res.json({
            status: 'ok',
            devices: [
              { id: '1', name: 'Store Front Display', status: 'online' },
              { id: '2', name: 'Window Screen', status: 'online' }
            ]
          });
        }
        
        return res.json({
          status: 'ok',
          next: {
            type: 'open-url',
            href: '/screens/setup',
            label: 'Set Up C-Net Screens'
          }
        });
      
      default:
        return res.status(400).json({ error: `Unknown intent: ${intent}` });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/assistant/summary
 * Get quick metrics for mini dashboard
 */
router.get('/summary', requireUserOrGuest, async (req, res, next) => {
  try {
    console.log(`[Assistant] Summary for ${req.isGuest ? 'guest' : 'user'} ${req.userId}`);
    
    // Guests see zeros (no access to real metrics)
    const summary = {
      campaigns: req.isGuest ? 0 : 12,
      reach7d: req.isGuest ? 0 : 1240,
      spend7d: req.isGuest ? 0 : 430,
      screensOnline: req.isGuest ? 0 : 5
    };
    
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

export default router;

