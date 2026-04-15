if (process.env.NODE_ENV !== 'production') {
  console.log('[LOAD] miRoutes.js ownerTenantFix v3');
}
/**
 * MI (Merged Intelligence) Routes
 * Orchestrator endpoints for MI analysis and suggestions
 */

import express from 'express';
import crypto from 'crypto';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { getSignagePlaylistSuggestions, getTemplateSuggestionsForContext, instantiateCreativeTemplateForContext } from '../services/miOrchestratorService.js';
import { generateDraft, getDraftByGenerationRunId, getDraft, patchDraftPreview, createDraftStoreForUser, createDraft } from '../services/draftStore/draftStoreService.js';
import { runBuildStoreJob, createBuildStoreJob, newTraceId } from '../services/draftStore/orchestraBuildStore.js';
import { transitionOrchestratorTaskStatus } from '../kernel/transitions/transitionService.js';
import { getBalance } from '../services/billing/creditsService.js';
import { resolveVertical, resolveAudience, VERTICALS } from '../lib/verticals/verticalTaxonomy.js';
import { selectTemplateId } from '../services/draftStore/selectTemplateId.js';
import { getTemplateItems } from '../services/draftStore/templateItemsData.js';
import { getOrFetchSeedCatalog } from '../services/store/seeds/seedCatalogService.js';
import { classifyBusiness } from '../services/mi/classifyBusinessService.js';
import { classifyBusinessProfile } from '../services/store/classifier/classifyBusinessProfile.js';
import { buildSeedCatalog } from '../services/store/seeds/seedCatalogBuilder.js';
import { runLlmGenerateCopyJob } from '../services/llm/runLlmGenerateCopyJob.js';
import { kimiProvider } from '../lib/llm/kimiProvider.js';
import { LLM_ENTRY_POINT } from '../lib/llm/types.js';
import { getTenantId } from '../lib/tenant.js';
import { getOrCreateMission, mergeMissionContext, mergeMissionPlanStep } from '../lib/mission.js';
import { createEmitContextUpdate } from '../lib/missionPlan/agentMemory.js';
import { createStepReporter } from '../lib/missionPlan/stepReporter.js';
import { planOrchestraJob } from '../lib/missionPlan/planOrchestraJob.js';
import { getUnifiedExecutionPlans } from '../lib/missionPlan/unifiedPlan.js';
import { getPrismaClient } from '../lib/prisma.js';
// MI .ts-only services: no .js on Render. Load dynamically in handlers to avoid ERR_MODULE_NOT_FOUND at boot.
import { prisma } from '../lib/prisma.js';

const router = express.Router();

/**
 * GET /api/mi/orchestrator/signage-playlists/:playlistId/suggestions
 * Get MI-based suggestions for a Signage playlist
 */
router.get('/orchestrator/signage-playlists/:playlistId/suggestions', requireAuth, async (req, res) => {
  try {
    const { playlistId } = req.params;
    
    if (!playlistId) {
      return res.status(400).json({
        ok: false,
        error: 'missing_playlist_id',
        message: 'Playlist ID is required',
      });
    }

    // Use consistent tenant/store context extraction (same pattern as signageRoutes)
    // Import the helper function from signageRoutes
    let tenantId = req.query.tenantId;
    let storeId = req.query.storeId;
    
    // Fall back to auth context
    if (!tenantId && req.userId) {
      tenantId = req.userId; // Use userId as tenantId fallback
    }
    if (!storeId && req.user?.businesses?.[0]?.id) {
      storeId = req.user.businesses?.[0].id;
    }
    
    // Dev mode fallback
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      tenantId = tenantId || process.env.DEV_TENANT_ID || req.userId || 'temp';
      storeId = storeId || process.env.DEV_STORE_ID || req.user?.businesses?.[0]?.id || null;
    }

    if (!tenantId) {
      return res.status(400).json({
        ok: false,
        error: 'missing_tenant_id',
        message: 'tenantId is required (can come from query params or auth context)',
      });
    }

    const suggestions = await getSignagePlaylistSuggestions({
      playlistId,
      tenantId,
      storeId: storeId || null,
    });

    res.json({
      ok: true,
      suggestions,
    });
  } catch (err) {
    console.error('[MI Routes] Failed to get playlist suggestions', err);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: 'Failed to get MI suggestions for this playlist.',
    });
  }
});

/**
 * Shared handler for GET /api/mi/orchestrator/templates/suggestions and GET /api/mi/orchestra/templates/suggestions.
 * Single source of truth; response shape unchanged.
 */
async function handleTemplateSuggestions(req, res) {
  try {
    let tenantId = req.query.tenantId;
    let storeId = req.query.storeId;

    if (!tenantId && req.userId) tenantId = req.userId;
    if (!storeId && req.user?.businesses?.[0]?.id) storeId = req.user.businesses?.[0].id;

    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      tenantId = tenantId || process.env.DEV_TENANT_ID || req.userId || null;
      storeId = storeId || process.env.DEV_STORE_ID || req.user?.businesses?.[0]?.id || null;
    }

    const {
      channel = null,
      role: roleParam = null,
      primaryIntent = null,
      orientation = null,
      limit,
      query: queryParam,
    } = req.query;
    const role = roleParam || (req.user ? null : 'generic');

    const result = await getTemplateSuggestionsForContext({
      tenantId: tenantId || null,
      storeId: storeId || null,
      channel: channel || null,
      role: role || null,
      primaryIntent: primaryIntent || null,
      orientation: orientation || null,
      limit: limit ? Number(limit) : undefined,
      query: queryParam || undefined,
    });

    if (!result.ok) {
      return res.status(500).json({
        ok: false,
        error: result.error || 'Failed to compute template suggestions',
      });
    }

    return res.json({
      ok: true,
      templates: result.templates,
      aiProposals: result.aiProposals,
      debug: result.debug,
    });
  } catch (err) {
    console.error('[MIOrchestrator] Error getting template suggestions', err);
    return res.status(500).json({
      ok: false,
      error: 'Unexpected error while computing template suggestions',
    });
  }
}

/** GET /api/mi/orchestrator/templates/suggestions – query params: tenantId, storeId, channel, role, primaryIntent, orientation, limit, query */
router.get('/orchestrator/templates/suggestions', optionalAuth, handleTemplateSuggestions);

/** GET /api/mi/orchestra/templates/suggestions – alias for /orchestrator/templates/suggestions */
router.get('/orchestra/templates/suggestions', optionalAuth, handleTemplateSuggestions);

/**
 * Helper to extract tenant/store context (reused from creativeTemplates routes)
 */
function requireTenantStoreContext(req) {
  // Try to extract from query params first (highest priority)
  let tenantId = req.query.tenantId;
  let storeId = req.query.storeId;
  
  // Fall back to body params
  if (!tenantId) tenantId = req.body?.tenantId;
  if (!storeId) storeId = req.body?.storeId;
  
  // Fall back to auth context
  if (!tenantId && req.userId) {
    tenantId = req.userId; // Use userId as tenantId
  }
  if (!storeId && req.user?.businesses?.[0]?.id) {
    storeId = req.user.businesses?.[0].id; // Use business.id as storeId
  }
  
  // Legacy fallback
  if (!tenantId) tenantId = req.user?.businesses?.[0]?.tenantId || req.workspace?.tenantId;
  if (!storeId) storeId = req.user?.businesses?.[0]?.storeId || req.workspace?.storeId;
  
  // For dev mode, allow default tenant/store when none is passed
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    tenantId = tenantId || process.env.DEV_TENANT_ID || req.userId || 'temp';
    storeId = storeId || process.env.DEV_STORE_ID || req.user?.businesses?.[0]?.id || 'temp';
  }
  
  // Convert to strings and trim
  tenantId = tenantId ? String(tenantId).trim() : null;
  storeId = storeId ? String(storeId).trim() : null;
  
  return { tenantId, storeId };
}

/**
 * POST /api/mi/orchestrator/templates/:templateId/instantiate
 * Instantiate a CreativeTemplate into a new Content record for Creative Engine
 * 
 * Request body:
 *   - channel (optional, e.g. "cnet_screen")
 *   - orientation (optional, "horizontal" | "vertical")
 *   - tenantId (optional, from context)
 *   - storeId (optional, from context)
 * 
 * Response:
 *   - ok: true
 *   - content: Content object with miEntity attached
 */
router.post('/orchestrator/templates/:templateId/instantiate', requireAuth, async (req, res) => {
  try {
    const { templateId } = req.params;
    
    if (!templateId) {
      return res.status(400).json({
        ok: false,
        error: 'missing_template_id',
        message: 'Template ID is required',
      });
    }

    // Extract tenant/store context using the same pattern as other MI routes
    const { tenantId, storeId } = requireTenantStoreContext(req);

    if (!tenantId) {
      return res.status(400).json({
        ok: false,
        error: 'missing_tenant',
        message: 'Tenant ID is required (can come from query params, body, or auth context)',
      });
    }

    const { channel, orientation, autoFillText } = req.body || {};

    const result = await instantiateCreativeTemplateForContext({
      templateContentId: templateId, // templateId is the CreativeTemplate.id
      tenantId,
      storeId: storeId || null,
      channel: channel || null,
      orientation: orientation || null,
      userId: req.userId || null,
      autoFillText: autoFillText === true, // Explicit boolean check, default false
    });

    return res.json({
      ok: true,
      content: result.content,
      templateId: result.templateId,
      slotValues: result.slotValues,
      businessContextSummary: result.businessContextSummary,
    });
  } catch (err) {
    console.error('[MI Routes] Failed to instantiate creative template', err);
    
    // Handle specific error cases
    if (err.message?.includes('not found')) {
      return res.status(404).json({
        ok: false,
        error: 'template_not_found',
        message: err.message || 'Template not found',
      });
    }

    if (err.message?.includes('baseContentId')) {
      return res.status(400).json({
        ok: false,
        error: 'template_has_no_content',
        message: err.message || 'Template has no base content to instantiate',
      });
    }

    return res.status(500).json({
      ok: false,
      error: 'instantiate_template_failed',
      message: err.message || 'Failed to instantiate template into creative asset.',
    });
  }
});

/**
 * POST /api/mi/orchestrator/templates/generate
 * Generate a new CreativeTemplate from an AI proposal
 * 
 * Request body:
 *   - proposal: AITemplateProposal
 *   - categoryOverride?: string (optional, e.g. "cnet", "storefront", "social")
 *   - channel?: string (optional)
 *   - orientation?: string (optional)
 *   - tenantId?: string (from context)
 *   - storeId?: string (from context)
 *   - autoFillText?: boolean (default false)
 * 
 * Response:
 *   - ok: true
 *   - templateId: string
 *   - contentId: string (instantiated content ready for Creative Engine)
 */
router.post('/orchestrator/templates/generate', requireAuth, async (req, res) => {
  try {
    const { tenantId, storeId } = requireTenantStoreContext(req);
    const { proposal, categoryOverride, channel, orientation, autoFillText } = req.body;

    if (!proposal) {
      return res.status(400).json({
        ok: false,
        error: 'missing_proposal',
        message: 'Proposal is required',
      });
    }

    if (!tenantId) {
      return res.status(400).json({
        ok: false,
        error: 'missing_tenant',
        message: 'Tenant ID is required',
      });
    }

    const { generateTemplateFromProposal } = await import('../services/templateGeneratorService.js');

    const result = await generateTemplateFromProposal({
      proposal,
      categoryOverride,
      channel: channel || null,
      orientation: orientation || null,
      tenantId,
      storeId: storeId || null,
      userId: req.userId || null,
      autoFillText: autoFillText === true,
    });

    if (!result.ok) {
      return res.status(500).json({
        ok: false,
        error: result.error || 'Failed to generate template',
      });
    }

    return res.json({
      ok: true,
      templateId: result.templateId,
      contentId: result.contentId,
    });
  } catch (err) {
    console.error('[MI Routes] Failed to generate template from proposal', err);
    return res.status(500).json({
      ok: false,
      error: 'generate_template_failed',
      message: err.message || 'Failed to generate template from proposal',
    });
  }
});

/**
 * GET /api/mi/health
 * Health check endpoint for MI routes
 */
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'mi-routes',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/mi/stores/temp/draft?generationRunId=...
 * Resolve temp guest draft by generationRunId (no store ownership required).
 * Used by MI Assistant on /app/store/temp/review so scope resolution does not 403 for guests.
 * optionalAuth: guest or signed-in; draft is identified by generationRunId from orchestra job.
 */
router.get('/stores/temp/draft', optionalAuth, async (req, res) => {
  const generationRunId = (req.query?.generationRunId && typeof req.query.generationRunId === 'string')
    ? req.query.generationRunId.trim()
    : null;
  if (!generationRunId) {
    return res.status(400).json({ ok: false, error: 'missing_generation_run_id', message: 'generationRunId is required' });
  }
  try {
    const draft = await getDraftByGenerationRunId(generationRunId);
    if (!draft) {
      return res.status(404).json({ ok: false, error: 'draft_not_found', message: 'Draft not found for this run' });
    }
    res.status(200).json({
      ok: true,
      draftId: draft.id,
      id: draft.id,
      draft,
    });
  } catch (err) {
    console.error('[GET /api/mi/stores/temp/draft]', err);
    res.status(500).json({ ok: false, error: 'server_error', message: 'Failed to load draft' });
  }
});

/**
 * POST /api/mi/resolve
 * Resolve MI intent/actions for an object (dashboard MI flow).
 * Minimal safe response so dashboard does not break or spam errors; full implementation can be wired later.
 */
router.post('/resolve', (req, res) => {
  const objectId = req.body?.objectId ?? null;
  res.status(200).json({
    ok: true,
    objectId,
    intent: { primary: 'inform', targetAction: 'order', confidence: 0 },
    actions: [],
    renderHints: {
      ctaText: '',
      ctaUrl: '#',
      themeHint: 'auto',
    },
    conversion: undefined,
  });
});

// --- Phase 1 Entity Framework (additive) ---

const VALID_ENTITY_TYPES = ['store', 'product', 'promotion'];

/**
 * GET /api/mi/entity/:entityType/:objectId
 * Read-only Cardbey entity contract for store, product, promotion.
 * Returns 404 for unsupported type or missing object. optionalAuth for public landing use.
 */
router.get('/entity/:entityType/:objectId', optionalAuth, async (req, res) => {
  try {
    const entityType = (req.params.entityType || '').trim().toLowerCase();
    const objectId = (req.params.objectId || '').trim();
    if (!objectId || !VALID_ENTITY_TYPES.includes(entityType)) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Entity type not supported or objectId missing',
      });
    }
    const { buildStoreEntity, buildProductEntity, buildPromotionEntity } = await import('../entity/entityBuilders.js');
    if (entityType === 'store') {
      const store = await prisma.business.findUnique({ where: { id: objectId } });
      if (!store) {
        return res.status(404).json({ ok: false, error: 'not_found', message: 'Store not found' });
      }
      const entity = buildStoreEntity(store);
      return res.status(200).json({ ok: true, entity });
    }
    if (entityType === 'product') {
      const product = await prisma.product.findUnique({ where: { id: objectId } });
      if (!product) {
        return res.status(404).json({ ok: false, error: 'not_found', message: 'Product not found' });
      }
      const entity = buildProductEntity(product, product.businessId);
      return res.status(200).json({ ok: true, entity });
    }
    if (entityType === 'promotion') {
      const promo = await prisma.storePromo.findUnique({ where: { id: objectId } });
      if (!promo) {
        return res.status(404).json({ ok: false, error: 'not_found', message: 'Promotion not found' });
      }
      const entity = buildPromotionEntity(promo);
      return res.status(200).json({ ok: true, entity });
    }
    return res.status(404).json({ ok: false, error: 'not_found', message: 'Entity type not supported' });
  } catch (err) {
    console.error('[GET /api/mi/entity/:entityType/:objectId]', err);
    return res.status(500).json({ ok: false, error: 'server_error', message: 'Failed to load entity' });
  }
});

/**
 * POST /api/mi/chat
 * Object-aware MI chat. Phase 1: minimal handler; returns safe placeholder so frontend does not 404.
 * Frontend sends: { objectId, messages: [{ role, content }], context? }.
 */
router.post('/chat', (req, res) => {
  const body = req.body || {};
  const objectId = body.objectId ?? body.context?.objectId ?? null;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = messages.filter((m) => m.role === 'user').pop();
  const userText = lastUser?.content ? String(lastUser.content).slice(0, 500) : '';
  // Placeholder reply; can be wired to assistant/orchestra later without changing contract.
  const replyContent =
    userText.length > 0
      ? `Thanks for your message. I'm connected to this ${objectId ? 'object' : 'context'} and will help you. (Phase 1 placeholder.)`
      : "What would you like to know? I'm here to help.";
  res.status(200).json({
    ok: true,
    reply: { role: 'assistant', content: replyContent },
    suggestedActions: [],
  });
});

/**
 * POST /api/mi/event
 * Log MI interaction event (view, scan, tap, chat, etc.). Phase 1: acknowledge only; no persistence yet.
 */
router.post('/event', (req, res) => {
  const body = req.body || {};
  const objectId = body.objectId ?? null;
  const kind = body.kind ?? 'view';
  if (objectId && process.env.NODE_ENV !== 'production') {
    console.log('[MI event]', kind, objectId);
  }
  res.status(200).json({ ok: true });
});

/**
 * POST /api/mi/act
 * Execute action against an entity. Phase 1: thin handoff; returns accepted/routed.
 */
router.post('/act', (req, res) => {
  const body = req.body || {};
  const objectId = body.objectId ?? null;
  const action = body.action && typeof body.action === 'object' ? body.action : { type: 'unknown' };
  if (objectId && process.env.NODE_ENV !== 'production') {
    console.log('[MI act]', action.type, objectId);
  }
  res.status(200).json({
    ok: true,
    result: {
      type: 'accepted',
      message: 'Action received. (Phase 1 thin handler.)',
    },
  });
});

// --- End Phase 1 Entity Framework ---

const VALID_OBJECT_TYPES = ['print_bag', 'promo_card', 'sticker', 'other'];

/**
 * Shared handler for POST /api/mi/promo/from-draft (and aliases from-idea, from-product).
 * Body: storeId?, draftId?, jobId?, generationRunId?, productId (or itemId), objectType?, sourceType?, environment?, format?, goal?
 * Returns: { ok: true, promoId, instanceId, jobId? } or { ok: false, code, message }.
 */
async function handlePromoFromDraft(req, res) {
  let resolvedStoreId = null;
  try {
    const {
      storeId: bodyStoreId,
      draftId,
      jobId,
      generationRunId: bodyGenerationRunId,
      productId: bodyProductId,
      itemId,
      objectType,
      sourceType,
      environment,
      format,
      goal,
    } = req.body || {};

    const productId = (bodyProductId != null && typeof bodyProductId === 'string')
      ? bodyProductId.trim()
      : (itemId != null && typeof itemId === 'string')
        ? String(itemId).trim()
        : null;

    if (!productId) {
      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'productId is required',
      });
    }

    const rawObjectType = (objectType != null && typeof objectType === 'string') ? objectType.trim() : 'print_bag';
    if (!VALID_OBJECT_TYPES.includes(rawObjectType)) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_OBJECT_TYPE',
        message: `objectType must be one of: ${VALID_OBJECT_TYPES.join(', ')}`,
      });
    }

    let generationRunId = null;
    if (jobId) {
      const task = await getPrismaClient().orchestratorTask.findUnique({ where: { id: jobId } }).catch(() => null);
      if (task?.request && typeof task.request === 'object' && task.request.generationRunId) {
        generationRunId = task.request.generationRunId;
      }
    }
    if (!generationRunId && bodyGenerationRunId && typeof bodyGenerationRunId === 'string' && bodyGenerationRunId.trim()) {
      generationRunId = bodyGenerationRunId.trim();
    }

    resolvedStoreId = bodyStoreId != null && String(bodyStoreId).trim() ? String(bodyStoreId).trim() : null;
    let draft = null;
    if (generationRunId) {
      draft = await getDraftByGenerationRunId(generationRunId).catch(() => null);
      if (draft && resolvedStoreId == null) {
        const input = (draft.input && typeof draft.input === 'object') ? draft.input : {};
        const preview = (draft.preview && typeof draft.preview === 'object') ? draft.preview : {};
        resolvedStoreId = draft.committedStoreId || input.storeId || preview.storeId || preview.meta?.storeId || null;
      }
    }
    if (!draft && draftId) {
      draft = await prisma.draftStore.findUnique({ where: { id: draftId } }).catch(() => null);
      if (draft && resolvedStoreId == null) {
        const input = (draft.input && typeof draft.input === 'object') ? draft.input : {};
        const preview = (draft.preview && typeof draft.preview === 'object') ? draft.preview : {};
        resolvedStoreId = draft.committedStoreId || input.storeId || preview.storeId || preview.meta?.storeId || null;
      }
    }

    const triedResolution = !!(jobId || draftId || (bodyGenerationRunId && typeof bodyGenerationRunId === 'string' && bodyGenerationRunId.trim()));
    if (triedResolution && !draft) {
      return res.status(404).json({
        ok: false,
        code: 'DRAFT_NOT_FOUND',
        message: 'Draft could not be found for the given jobId, draftId, or generationRunId.',
      });
    }

    if (resolvedStoreId == null) resolvedStoreId = 'temp';

    // userId from requireAuth; Content has only userId FK (no tenantId). P2003 handled below.
    const userId = req.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        ok: false,
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      });
    }

    // Ensure User exists to avoid P2003 on content.create.
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    }).catch(() => null);
    if (!existingUser) {
      const guestEmail = `guest-${userId}@cardbey.guest`;
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: {
          id: userId,
          email: guestEmail,
          passwordHash: 'guest-placeholder-no-login',
          displayName: req.user?.displayName ?? req.user?.name ?? 'Guest',
        },
      });
    }

    // Content model has only userId FK. settings.templateKey and settings.meta.templateId ensure
    // Content Studio editor recognizes promo content and does not show "Template 'unknown' not found".
    const createData = {
      name: 'Smart Object Promo',
      userId,
      elements: [],
      settings: {
        type: 'smart_object_promo',
        templateKey: 'smart_object_promo',
        meta: {
          templateId: 'promotion',
          mode: 'promo',
        },
        storeId: resolvedStoreId,
        productId,
        objectType: rawObjectType,
        sourceType: sourceType || 'store-wide',
        draftId: draft ? draft.id : null,
        generationRunId,
        environment: environment || 'print',
        format: format || 'poster',
        goal: goal || 'visit',
      },
      version: 1,
    };
    const content = await prisma.content.create({
      data: createData,
    });

    const promoId = content.id;
    return res.status(200).json({
      ok: true,
      promoId,
      instanceId: promoId,
      ...(jobId && { jobId }),
    });
  } catch (err) {
    if (err?.code === 'P2003') {
      return res.status(400).json({
        ok: false,
        code: 'FK_VIOLATION',
        message: 'Promo creation failed due to missing related record (user/store).',
        details: {
          userId: req.userId ?? req.user?.id ?? null,
          storeId: resolvedStoreId ?? null,
        },
      });
    }
    console.error('[promo/from-draft] error', err);
    return res.status(500).json({
      ok: false,
      code: 'FAILED',
      message: err?.message || 'Failed to create promo from draft',
    });
  }
}

/** Normalize body for from-idea / from-product so handlePromoFromDraft receives a single contract. */
function normalizePromoAliasBody(body, alias) {
  const b = body && typeof body === 'object' ? { ...body } : {};
  b.productId = b.productId ?? b.itemId ?? (alias === 'from-idea' && b.idea ? `idea-${Date.now()}` : undefined);
  if (alias === 'from-product' && b.storeId == null) b.storeId = 'temp';
  return b;
}

router.post('/promo/from-draft', requireAuth, handlePromoFromDraft);
router.post('/promo/from-idea', requireAuth, (req, res) => {
  req.body = normalizePromoAliasBody(req.body, 'from-idea');
  return handlePromoFromDraft(req, res);
});
router.post('/promo/from-product', requireAuth, (req, res) => {
  req.body = normalizePromoAliasBody(req.body, 'from-product');
  return handlePromoFromDraft(req, res);
});

/**
 * POST /api/mi/orchestra/infer
 * Infer business context from raw input
 * 
 * Request body:
 *   - rawInput: string (required)
 *   - sourceType?: string (optional, e.g. "form", "voice", "ocr", "url")
 *   - businessName?: string (optional)
 *   - location?: string (optional)
 *   - websiteUrl?: string (optional, for sourceType="url")
 * 
 * Response:
 *   - ok: true
 *   - inference: {
 *       businessType: string
 *       templateKey: string
 *       seedCategories: string[]
 *       confidence: number
 *       source: string
 *     }
 */
router.post('/orchestra/infer', optionalAuth, async (req, res) => {
  try {
    const { rawInput, sourceType, businessName, location, websiteUrl } = req.body || {};

    if (!rawInput || typeof rawInput !== 'string' || rawInput.trim().length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'missing_raw_input',
        message: 'rawInput is required',
      });
    }

    // Simple inference logic - can be enhanced later
    // For now, return basic inference based on input
    const normalizedInput = rawInput.toLowerCase().trim();
    
    // Infer business type from common keywords
    let businessType = 'general';
    const businessTypeKeywords = {
      'restaurant': ['restaurant', 'cafe', 'food', 'dining', 'menu', 'eat', 'meal'],
      'retail': ['shop', 'store', 'retail', 'buy', 'sell', 'merchandise'],
      'service': ['service', 'salon', 'spa', 'clinic', 'office'],
      'florist': ['flower', 'florist', 'bouquet', 'plant'],
    };

    for (const [type, keywords] of Object.entries(businessTypeKeywords)) {
      if (keywords.some(keyword => normalizedInput.includes(keyword))) {
        businessType = type;
        break;
      }
    }

    // Use businessName if provided, otherwise infer from input
    const inferredBusinessName = businessName || rawInput.split(',')[0].trim();

    // Default template key based on business type
    const templateKey = `template_${businessType}`;

    // Seed categories based on business type
    const seedCategories = businessType === 'restaurant' 
      ? ['food', 'dining', 'restaurant']
      : businessType === 'retail'
      ? ['retail', 'shopping']
      : [businessType];

    res.json({
      ok: true,
      inference: {
        businessType,
        templateKey,
        seedCategories,
        confidence: 0.7, // Default confidence
        source: sourceType || 'form',
      },
    });
  } catch (err) {
    console.error('[MI Routes] Error in infer endpoint:', err);
    res.status(500).json({
      ok: false,
      error: 'inference_failed',
      message: err instanceof Error ? err.message : 'Failed to perform inference',
    });
  }
});

/**
 * POST /api/mi/classify-business
 * Classify business for Create/QuickStart: verticalSlug (strict taxonomy) + short description.
 * Heuristic first; AI only when confidence < 0.7. Does NOT consume credits or welcome bundle.
 *
 * Request body: { businessName?, businessType?, location?, notes? }
 * Response: { verticalSlug, verticalGroup, confidence, businessDescriptionShort, keywords? }
 */
const ALLOWED_VERTICAL_SLUGS = new Set(VERTICALS.map((v) => v.slug));

router.post('/classify-business', optionalAuth, async (req, res) => {
  try {
    const { businessName, businessType, location, notes } = req.body || {};
    const result = await classifyBusiness({
      businessName: businessName ?? '',
      businessType: businessType ?? '',
      location: location ?? '',
      notes: notes ?? '',
    });
    if (process.env.NODE_ENV !== 'production') {
      console.log('[classify]', { businessType: businessType ?? '', verticalSlug: result.verticalSlug, confidence: result.confidence });
    }
    return res.json(result);
  } catch (err) {
    console.error('[MI Routes] classify-business failed', err);
    return res.status(500).json({
      ok: false,
      error: 'classification_failed',
      message: err instanceof Error ? err.message : 'Classification failed',
    });
  }
});

/**
 * POST /api/mi/orchestra/start (and alias POST /api/mi/start)
 * Start a new orchestrator job
 *
 * Request body:
 *   - goal: string (required, e.g. "build_store", "build_store_from_menu", etc.)
 *   - rawInput?: string (optional)
 *   - businessName?: string (optional)
 *   - storeId?: string (optional)
 *   - tenantId?: string (optional)
 *   - generationRunId?: string (optional)
 *   - entryPoint?: string (optional)
 *
 * Response:
 *   - ok: true
 *   - jobId: string
 *   - storeId?: string
 *   - generationRunId?: string
 *   - entryPoint?: string
 */
async function handleOrchestraStart(req, res) {
  const traceId = newTraceId();
  // Diagnostic: route entry (if this does not appear, 403 is from CORS or earlier middleware)
  console.log('[orchestra:start] entry', {
    traceId,
    path: req.originalUrl,
    method: req.method,
    origin: req.headers.origin || '(none)',
    referer: req.headers.referer || '(none)',
    host: req.headers.host || '(none)',
    hasAuth: !!(req.userId ?? req.user),
    userId: req.userId ?? req.user?.id ?? '(none)',
    role: req.user?.role ?? '(none)',
  });
  try {
    const body = req.body || {};
    const bodyRequest = body.request && typeof body.request === 'object' ? body.request : {};
    const quickStart = body.quickStart && typeof body.quickStart === 'object' ? body.quickStart : {};
    const context = body.context && typeof body.context === 'object' ? body.context : {};
    let intent = (bodyRequest.intent ?? quickStart.intent ?? body.intent ?? '').toString().trim();
    // PRIMARY: businessType (quickStart.businessType first); never classify from name-only when businessType present
    const businessType = (bodyRequest.businessType ?? quickStart.businessType ?? bodyRequest.context?.businessType ?? context.businessType ?? body.businessType ?? '').toString().trim();
    const businessName = (bodyRequest.businessName ?? quickStart.businessName ?? bodyRequest.context?.businessName ?? context.businessName ?? body.businessName ?? '').toString().trim();
    const { goal, rawInput, storeType, storeId, tenantId, generationRunId, draftId: bodyDraftId, productIds: bodyProductIds, entryPoint, includeImages, itemId, menuFirstMode, menuOnly, ignoreImages, vertical, priceTier, businessDescription, businessDescriptionShort, verticalGroup, classificationConfidence } = body;

    console.log('[orchestra:start] payload', { traceId, goal: goal || '(empty)', businessName: businessName || '(empty)', businessType: businessType || '(empty)' });

    if (process.env.NODE_ENV !== 'production') {
      console.log('[orchestra:start]', { traceId, goal, businessName: businessName || '(empty)', businessType: businessType || '(empty)' });
    }

    if (!goal || typeof goal !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'missing_goal',
        message: 'goal is required',
      });
    }

    const { tenantId: contextTenantId, storeId: contextStoreId } = requireTenantStoreContext(req);
    const finalTenantId = tenantId || contextTenantId || req.userId;
    const finalStoreId = storeId || contextStoreId;

    if (!finalTenantId) {
      return res.status(400).json({
        ok: false,
        error: 'missing_tenant',
        message: 'tenantId is required (can come from body, query, or auth context)',
      });
    }

    // Dev-admin token user is not in DB; DraftStore.ownerUserId FK requires User to exist (E2E / dev).
    if (process.env.NODE_ENV !== 'production' && (req.user?.isDevAdmin || req.user?.id === 'dev-user-id')) {
      await prisma.user.upsert({
        where: { id: 'dev-user-id' },
        create: {
          id: 'dev-user-id',
          email: 'dev@cardbey.local',
          passwordHash: '',
          displayName: 'Dev User',
        },
        update: {},
      }).catch(() => {});
    }

    // Normalize entryPoint so job runner always sees 'build_store' for any build_store* goal (runner only triggers runBuildStoreJob for entryPoint === 'build_store').
    const PERSONAL_PROFILE_GOALS = new Set(['build_personal_presence', 'create_personal_profile']);
    const isPersonalProfileGoal = PERSONAL_PROFILE_GOALS.has((goal || '').toLowerCase().trim());
    if (isPersonalProfileGoal) {
      intent = 'personal_presence';
    }
    const BUILD_STORE_GOALS = [
      'build_store',
      'build_store_from_menu',
      'build_store_from_website',
      'build_store_from_template',
      'build_personal_presence',
      'create_personal_profile',
    ];
    const isBuildStoreGoal = BUILD_STORE_GOALS.includes((goal || '').toLowerCase());
    const finalEntryPoint = isBuildStoreGoal ? 'build_store' : (entryPoint || goal);

    // Soft guest: limit build_store drafts per guest; require sign-in for more
    // Phase 0: In dev, default 9999 so Create -> Generate flow is unblocked; GUEST_MAX_DRAFTS overrides
    const isGuest = req.user?.role === 'guest';
    if (isGuest && isBuildStoreGoal && req.userId) {
      const defaultMax = process.env.NODE_ENV === 'production' ? 1 : 9999;
      const envMax = process.env.GUEST_MAX_DRAFTS != null ? parseInt(process.env.GUEST_MAX_DRAFTS, 10) : null;
      const maxDrafts = (envMax != null && !Number.isNaN(envMax) && envMax >= 0) ? envMax : defaultMax;
      // Only completed (successful) runs count. Job runner MUST set status to 'failed' when
      // a run fails (e.g. DRAFT_NOT_FOUND); otherwise failed runs are incorrectly counted.
      const count = await prisma.orchestratorTask.count({
        where: {
          userId: req.userId,
          entryPoint: 'build_store',
          status: 'completed',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Per-day window
        },
      });
      if (count >= maxDrafts) {
        console.warn('[orchestra:start] 403 guest_limit_reached', {
          traceId,
          userId: req.userId,
          count,
          maxDrafts,
          entryPoint: 'build_store',
        });
        return res.status(403).json({
          ok: false,
          error: 'guest_limit_reached',
          message: 'Guest limit reached. Please sign in to continue.',
        });
      }
    }

    try {
      const runId = generationRunId || null;
      const requestPayload = {
        goal: goal || finalEntryPoint,
        rawInput: rawInput || null,
        businessName: businessName || null,
        businessType: businessType || null,
        generationRunId: runId,
        storeId: finalStoreId || null,
        draftId: bodyDraftId ?? null,
        productIds: Array.isArray(bodyProductIds) ? bodyProductIds : null,
        includeImages: includeImages,
        itemId: itemId ?? null,
        sourceType: bodyRequest.sourceType ?? null,
        templateKey: bodyRequest.templateKey ?? null,
        websiteUrl: bodyRequest.websiteUrl ?? null,
        ...(intent ? { intent } : {}),
        ...(bodyRequest.location != null ? { location: bodyRequest.location } : {}),
        ...(businessType ? { requestBusinessType: businessType } : {}),
      };
      const job = await prisma.orchestratorTask.create({
        data: {
          tenantId: finalTenantId,
          userId: req.userId || finalTenantId,
          insightId: null,
          entryPoint: finalEntryPoint,
          status: 'queued',
          request: requestPayload,
        },
      });

      // resolvedRunId: client-supplied generationRunId if non-empty string, else job.id. Must match task.request and DraftStore.
      const resolvedRunId = (generationRunId && typeof generationRunId === 'string' && generationRunId.trim())
        ? generationRunId.trim()
        : job.id;
      if (!(generationRunId && typeof generationRunId === 'string' && generationRunId.trim())) {
        await prisma.orchestratorTask.update({
          where: { id: job.id },
          data: {
            request: { ...requestPayload, generationRunId: resolvedRunId },
            updatedAt: new Date(),
          },
        }).catch(() => {});
      }

      const isBuildStore = isBuildStoreGoal;
      const existingDraft = isBuildStore ? (await getDraftByGenerationRunId(resolvedRunId).catch(() => null)) : null;
      const needDraft = isBuildStore && !existingDraft;

      let responseDraftId = existingDraft ? existingDraft.id : null;
      let createdDraftId = null;
      let reason = 'no_draft_needed';
      let draftModeForLog = null;
      if (isBuildStore && existingDraft) reason = 'build_store_existing_draft';
      else if (needDraft) reason = 'build_store_no_draft';

      try {
        if (needDraft) {
          // Fetch balance for generation decision and logging (userId may be guest or real user)
          const userIdForBalance = req.userId || finalTenantId;
          let balance = { aiCreditsBalance: 0, welcomeFullStoreRemaining: 0 };
          if (userIdForBalance) {
            try {
              balance = await getBalance(userIdForBalance);
            } catch (e) {
              if (process.env.NODE_ENV !== 'production') {
                console.warn('[orchestra:start] getBalance failed', e?.message || e);
              }
            }
          }
          const userRole = req.user?.role ?? (req.userId ? 'user' : 'guest');

          // Derive draft mode and input from goal + request (template/ocr/url vs ai).
          const sourceType = bodyRequest.sourceType || (goal === 'build_store_from_template' ? 'template' : goal === 'build_store_from_menu' ? 'ocr' : goal === 'build_store_from_website' ? 'url' : 'form');
          const usePaidAiMenu = menuFirstMode === true || menuOnly === true || ignoreImages === true;
          let draftMode = 'ai';
          if (sourceType === 'template' || (goal || '').toLowerCase() === 'build_store_from_template') draftMode = 'template';
          else if (sourceType === 'ocr' || (goal || '').toLowerCase() === 'build_store_from_menu') draftMode = 'ocr';
          else if ((sourceType === 'form' || sourceType === 'voice') && !usePaidAiMenu) {
            // Prefer AI when user has welcome bundle (free first store); else template with vertical-correct fallback
            if (balance.welcomeFullStoreRemaining > 0) {
              draftMode = 'ai';
            } else {
              draftMode = 'template';
            }
          }

          // If we would use AI but user has no bundle and no credits, use template (correct vertical) instead of failing with 402
          if (draftMode === 'ai' && balance.welcomeFullStoreRemaining === 0 && balance.aiCreditsBalance === 0) {
            draftMode = 'template';
            if (process.env.NODE_ENV !== 'production') {
              console.log('[orchestra:start] no credits/bundle → using template fallback (vertical-correct)');
            }
          }

          if (process.env.NODE_ENV !== 'production') {
            console.log('[orchestra:start] decision', {
              businessName: businessName || '(empty)',
              businessType: businessType || '(empty)',
              sourceType,
              draftMode,
              welcomeFullStoreRemaining: balance.welcomeFullStoreRemaining,
              aiCreditsBalance: balance.aiCreditsBalance,
            });
          }

          // Classify ONCE with businessType primary; persisted profile is source of truth downstream (no re-resolve from name only).
          const locationForClassify = req.body?.location ?? bodyRequest.location ?? '';
          const notesForClassify = bodyRequest.notes ?? '';
          let profile = null;
          try {
            profile = await classifyBusinessProfile({
              businessType: (businessType || storeType || bodyRequest.businessType || '').toString(),
              businessName: (businessName || '').toString(),
              location: locationForClassify,
              notes: notesForClassify,
            });
          } catch (classifyErr) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn('[orchestra:start] classifyBusinessProfile failed', classifyErr?.message || classifyErr);
            }
          }
          const verticalSlug = (profile?.verticalSlug && ALLOWED_VERTICAL_SLUGS.has(profile.verticalSlug))
            ? profile.verticalSlug
            : (() => { const r = resolveVertical({ businessType: businessType || storeType || bodyRequest.businessType, businessName, userNotes: [notesForClassify, locationForClassify].filter(Boolean).join(' '), explicitVertical: null }); return r.slug || 'services.generic'; })();
          const audience = profile?.audience || resolveAudience({ businessType: businessType || storeType || bodyRequest.businessType, businessName });
          const businessDescriptionFromClassify = profile?.businessDescriptionShort;
          const templateIdResolved = draftMode === 'template' ? selectTemplateId(verticalSlug, audience) : null;

          let effectiveMode = draftMode;
          let effectiveTemplateId = templateIdResolved;
          let effectiveSeedItems = null;

          // Phase 3 (safe): personal_presence should bias toward a personal/profile outcome without changing routes/contracts.
          // We do this by forcing a deterministic template profile for form/voice inputs only (no auth required).
          const isPersonalPresence = intent === 'personal_presence';
          const isFormOrVoice = sourceType === 'form' || sourceType === 'voice';
          if (isPersonalPresence && isFormOrVoice) {
            effectiveMode = 'template';
            effectiveTemplateId = 'services_generic';
            if (process.env.NODE_ENV !== 'production') {
              console.log('[orchestra:start] personal_presence → template services_generic', { traceId, sourceType, intent });
            }
          }
          if (draftMode === 'template') {
            const tid = bodyRequest.templateKey != null
              ? (() => { let t = String(bodyRequest.templateKey).trim().toLowerCase(); if (t === 'cafe' && verticalSlug !== 'food.cafe' && verticalSlug !== 'food') t = selectTemplateId(verticalSlug, audience); return t; })()
              : templateIdResolved;
            const templateList = tid ? getTemplateItems(tid) : null;
            if (!templateList || !Array.isArray(templateList) || templateList.length === 0) {
              const seedProfile = profile || { verticalSlug, audience, businessModel: 'services' };
              const seedResult = await buildSeedCatalog(seedProfile, { targetCount: 30 });
              if (seedResult && seedResult.items && seedResult.items.length >= 10) {
                effectiveMode = 'seed';
                effectiveSeedItems = seedResult.items;
                if (process.env.NODE_ENV !== 'production') {
                  console.log('[orchestra:start] template pack not found, using seed builder', { verticalSlug, businessModel: seedProfile.businessModel, itemCount: seedResult.items.length });
                }
              } else {
                effectiveTemplateId = 'services_generic';
                if (process.env.NODE_ENV !== 'production') {
                  console.log('[orchestra:start] template pack not found, seed builder failed → fallback services_generic (never cafe)');
                }
              }
            } else if (bodyRequest.templateKey != null) {
              effectiveTemplateId = tid;
            }
          }

          if (process.env.NODE_ENV !== 'production') {
            const chosenPath = effectiveMode === 'ai' ? 'ai' : effectiveMode === 'template' ? 'template' : effectiveMode === 'seed' ? 'seed' : effectiveMode;
            console.log('[orchestra:start]', {
              businessType: businessType || '(none)',
              businessName: businessName || '(none)',
              sourceType,
              draftMode,
              profileSlug: profile?.verticalSlug ?? verticalSlug,
              profileAudience: profile?.audience ?? audience,
              verticalSlug,
              confidence: profile?.confidence ?? 0.5,
              chosenPath,
              templateId: effectiveMode === 'template' ? (effectiveTemplateId ?? undefined) : undefined,
              seedItemCount: effectiveMode === 'seed' ? (effectiveSeedItems?.length ?? 0) : undefined,
              corrected: false,
            });
          }

          // Pre-validate: AI mode requires OPENAI_API_KEY. Fail fast with 400 instead of starting job.
          if (effectiveMode === 'ai' && !process.env.OPENAI_API_KEY) {
            return res.status(400).json({
              ok: false,
              error: 'MISSING_PROVIDER_KEY',
              errorCode: 'MISSING_PROVIDER_KEY',
              message: 'AI provider is not configured. Set OPENAI_API_KEY in your environment.',
              recommendedAction: 'retry',
            });
          }

          const baseInput = {
            storeId: finalStoreId || null,
            generationRunId: resolvedRunId,
            prompt: rawInput || null,
            businessName: businessName || null,
            businessType: businessType || storeType || bodyRequest.businessType || null,
            storeType: storeType || businessType || bodyRequest.businessType || null,
            includeImages: includeImages,
            menuFirstMode: menuFirstMode === true || menuOnly === true || ignoreImages === true || undefined,
            vertical: vertical || bodyRequest.businessType || null,
            priceTier: priceTier || null,
            location: req.body?.location ?? bodyRequest.location ?? null,
            mode: effectiveMode,
            verticalSlug,
            ...(audience ? { audience } : {}),
            generationProfile: profile ?? undefined,
            ...(profile ? { classificationProfile: profile } : {}),
            ...(intent ? { intent } : {}),
            ...((businessDescriptionFromClassify ?? businessDescription ?? businessDescriptionShort) != null && String(businessDescriptionFromClassify ?? businessDescription ?? businessDescriptionShort).trim() ? { businessDescription: String(businessDescriptionFromClassify ?? businessDescription ?? businessDescriptionShort).trim() } : {}),
            ...(profile?.verticalGroup != null ? { verticalGroup: String(profile.verticalGroup) } : {}),
            ...(classificationConfidence != null && !Number.isNaN(Number(classificationConfidence)) ? { classificationConfidence: Number(classificationConfidence) } : {}),
          };
          if (effectiveMode === 'template') {
            baseInput.templateId = effectiveTemplateId;
          }
          if (effectiveMode === 'seed' && effectiveSeedItems && effectiveSeedItems.length > 0) {
            baseInput.seedItems = effectiveSeedItems;
          }
          if (bodyRequest.websiteUrl != null) baseInput.websiteUrl = bodyRequest.websiteUrl;
          // OCR: photoDataUrl/ocrRawText can be added later via draft update; buildCatalog will fail with clear error if missing.
          draftModeForLog = draftMode;

          // Guest: use createDraft (ownerUserId null) to avoid FK violation — guest users are not in User table.
          // Authed: use createDraftStoreForUser so GET /draft-store/:id/summary returns 200 for owner.
          let createdDraft;
          if (isGuest) {
            createdDraft = await createDraft({
              mode: baseInput.mode,
              input: baseInput,
              meta: {
                generationRunId: resolvedRunId,
                ownerUserId: null,
                guestSessionId: req.guestSessionId ?? undefined,
              },
            });
          } else {
            createdDraft = await createDraftStoreForUser(prisma, {
              user: req.user,
              userId: req.userId,
              tenantKey: getTenantId(req.user) ?? finalTenantId,
              input: baseInput,
              expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
              mode: baseInput.mode,
              status: 'generating',
              generationRunId: resolvedRunId,
              committedStoreId: finalStoreId || null,
            });
          }
          responseDraftId = createdDraft.id;
          createdDraftId = createdDraft.id;
        }
        if (process.env.NODE_ENV !== 'production') {
          console.log('[orchestra:start] draft ensure', {
            reason,
            resolvedRunId,
            foundDraftId: existingDraft?.id ?? null,
            createdDraftId,
            draftMode: draftModeForLog ?? undefined,
            goal,
            includeImages: includeImages,
            costSource: draftModeForLog === 'template' ? 'template' : draftModeForLog === 'ocr' ? 'free_api' : draftModeForLog === 'ai' ? 'paid_ai' : undefined,
          });
        }
      } catch (draftErr) {
        const errMessage = draftErr?.message || String(draftErr);
        const isSchemaMismatch = typeof errMessage === 'string' && errMessage.includes('does not exist') && errMessage.includes('generationRunId');
        const errorCode = isSchemaMismatch ? 'db_schema_out_of_date' : 'draft_create_failed';
        const responseMessage = isSchemaMismatch
          ? 'Run prisma migrate dev/reset to apply DraftStore.generationRunId'
          : errMessage;
        await transitionOrchestratorTaskStatus({
          prisma,
          taskId: job.id,
          toStatus: 'failed',
          fromStatus: 'queued',
          actorType: 'automation',
          correlationId: resolvedRunId,
          reason: 'DRAFT_CREATE_FAILED',
          result: {
            ok: false,
            error: errorCode,
            message: responseMessage,
            ...(isSchemaMismatch ? { details: errMessage } : {}),
          },
        }).catch(() => {});
        return res.status(500).json({
          ok: false,
          error: errorCode,
          message: responseMessage,
          ...(isSchemaMismatch ? { details: errMessage } : {}),
          generationRunId: resolvedRunId,
        });
      }

      // Auto-run build_store: job runs without requiring client to call /run (idempotent with /run)
      // Foundation 2: ensure Mission exists and pass missionContext + emitContextUpdate so catalog step writes agentMemory.
      // Runs whenever we have a draft id (newly created OR existing for this generationRunId) — not only when needDraft.
      if (isBuildStore && (createdDraftId || existingDraft?.id)) {
        const draftIdToUse = createdDraftId || existingDraft?.id;
        const db = getPrismaClient();
        const missionIdForPlan = job.id;
        let reactMissionId = missionIdForPlan;
        console.log('[ReAct DEBUG] block entered', {
          jobId: job.id,
          isBuildStore,
          createdDraftId,
          existingDraftId: existingDraft?.id ?? null,
          draftIdToUse,
          userId: job.userId,
          tenantId: job.tenantId,
        });
        try {
          const user = req.user || { id: job.userId, business: job.tenantId ? { id: job.tenantId } : undefined };
          const title = bodyRequest.businessName || bodyRequest.rawInput || finalEntryPoint || job.id;
          const mission = await getOrCreateMission(missionIdForPlan, user, {
            title: typeof title === 'string' ? title : String(title),
            prisma: db,
          });
          reactMissionId = mission.id;
        } catch (err) {
          console.warn('[MI Routes] getOrCreateMission failed (orchestra/start)', err?.message || err);
          console.log('[ReAct DEBUG] getOrCreateMission error details:', {
            errorMessage: err?.message,
            errorCode: err?.code,
            missionIdForPlan,
            userId: job.userId,
          });
          const uid = job.userId || 'dev-user-id';
          const tid = job.tenantId || uid;
          const fallbackMission = await db.mission.upsert({
            where: { id: missionIdForPlan },
            create: { id: missionIdForPlan, tenantId: tid, createdByUserId: uid, title: null, status: 'active' },
            update: {},
          }).catch(() => null);
          if (fallbackMission?.id) reactMissionId = fallbackMission.id;
        }
        await prisma.orchestratorTask.update({
          where: { id: job.id },
          data: { missionId: reactMissionId },
        }).catch(() => {});
        console.log(
          '[ReAct DEBUG] task update attempted, reactMissionId:',
          reactMissionId,
          'is same as jobId:',
          reactMissionId === job.id,
        );
        console.log('[ReAct] missionId linked:', reactMissionId, 'task:', job.id, 'needDraft:', needDraft);
        const missionRow = await db.mission.findUnique({ where: { id: reactMissionId }, select: { context: true } }).catch(() => null);
        const missionContext = missionRow?.context?.agentMemory ?? null;
        const emitContextUpdate = createEmitContextUpdate(reactMissionId, 'orchestra', { prisma: db, mergeMissionContext });
        const stepReporter = createStepReporter(reactMissionId, job.id, { prisma: db, mergeMissionPlanStep });
        runBuildStoreJob(prisma, job.id, draftIdToUse, resolvedRunId, traceId, {
          missionContext,
          emitContextUpdate,
          stepReporter,
          reactMissionId,
        });
      }

      // build_store must always return non-empty draftId when draft exists or was created
      if (process.env.NODE_ENV !== 'production' && isBuildStore) {
        console.log('[orchestra:start] build_store response', { traceId, draftId: responseDraftId ?? '', generationRunId: resolvedRunId });
      }
      return res.json({
        ok: true,
        jobId: job.id,
        storeId: finalStoreId || 'temp',
        generationRunId: resolvedRunId,
        draftId: responseDraftId ?? '',
        entryPoint: finalEntryPoint,
      });
    } catch (dbError) {
      const msg = dbError?.message || String(dbError);
      const tableMissing = /table .* does not exist|OrchestratorTask.*does not exist/i.test(msg);
      if (tableMissing) {
        console.error('[MI Routes] OrchestratorTask table missing. Apply schema to the DB the server is using:', msg);
        return res.status(503).json({
          ok: false,
          error: 'database_schema_missing',
          message: 'OrchestratorTask table does not exist. Run: DATABASE_URL=file:./prisma/test.db npx prisma db push --schema prisma/sqlite/schema.prisma (then start the API with the same DATABASE_URL).',
        });
      }
      console.warn('[MI Routes] OrchestratorTask create failed, using mock jobId:', msg);
      const mockJobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      return res.json({
        ok: true,
        jobId: mockJobId,
        storeId: finalStoreId || 'temp',
        generationRunId: generationRunId || mockJobId,
        entryPoint: finalEntryPoint,
      });
    }
  } catch (err) {
    console.error('[MI Routes] Error in start endpoint:', err);
    const generationRunId = req.body?.generationRunId ?? null;
    return res.status(500).json({
      ok: false,
      error: 'start_failed',
      message: err instanceof Error ? err.message : 'Failed to start orchestrator job',
      ...(generationRunId != null ? { generationRunId } : {}),
    });
  }
}

/** Rate limit: 2/min per IP for draft generation start */
const orchestraStartLimiter = (req, res, next) => {
  if (process.env.NODE_ENV === 'test') return next();
  const max = parseInt(process.env.GUEST_RATE_LIMIT_DRAFT_PER_MIN || '2', 10) || 2;
  return rateLimit({ windowMs: 60 * 1000, max, keyGenerator: (r) => `orchestra-start:${r.ip || 'unknown'}` })(req, res, next);
};
router.post('/orchestra/start', orchestraStartLimiter, requireAuth, handleOrchestraStart);
router.post('/start', orchestraStartLimiter, requireAuth, (req, res) => {
  console.warn('[DEPRECATED] /api/mi/start called; use /api/mi/orchestra/start');
  handleOrchestraStart(req, res);
}); // defensive alias; prefer /api/mi/orchestra/start

/**
 * POST /api/mi/llm/generate-copy
 * Create an LLM_GENERATE_COPY task and run it in the background. Does not block store creation.
 * Body: { prompt: string }
 * Returns: { ok: true, taskId, status: 'queued' }
 */
router.post('/llm/generate-copy', requireAuth, async (req, res) => {
  try {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt) {
      return res.status(400).json({ ok: false, error: 'missing_prompt', message: 'prompt is required' });
    }
    const userId = req.userId || req.user?.id;
    const tenantId = req.userId || req.user?.businesses?.[0]?.id || userId;
    if (!userId || !tenantId) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Authentication required' });
    }
    const task = await prisma.orchestratorTask.create({
      data: {
        entryPoint: LLM_ENTRY_POINT,
        tenantId,
        userId,
        status: 'queued',
        request: { prompt, provider: 'kimi' },
      },
    });
    setImmediate(() => {
      runLlmGenerateCopyJob(prisma, task.id, task.request, kimiProvider).catch((err) => {
        console.error('[LLM] runLlmGenerateCopyJob failed', { taskId: task.id, error: err?.message || err });
      });
    });
    return res.status(201).json({ ok: true, taskId: task.id, status: 'queued' });
  } catch (err) {
    console.error('[MI Routes] POST /llm/generate-copy failed', err);
    return res.status(500).json({ ok: false, error: 'internal_error', message: err?.message || 'Failed to create LLM task' });
  }
});

/**
 * Map OrchestratorTask (or stub) to orchestra job shape expected by dashboard.
 */
function toOrchestraJob(record) {
  if (!record) return null;
  const request = (record.request && typeof record.request === 'object') ? record.request : {};
  const result = (record.result && typeof record.result === 'object') ? record.result : null;
  return {
    id: record.id,
    status: (record.status || 'queued').toLowerCase(),
    request: request.goal ? { goal: request.goal, rawInput: request.rawInput, generationRunId: request.generationRunId, businessName: request.businessName, storeId: request.storeId } : request,
    result: result || undefined,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt,
    progressPct: result?.progressPct ?? (record.status === 'completed' ? 100 : record.status === 'running' ? 50 : 0),
    currentStage: result?.currentStage ?? null,
  };
}

const POLL_AFTER_MS = 1000;

/**
 * Build stable job contract for GET /api/mi/orchestra/job/:jobId.
 * { ok, jobId, status, generationRunId?, storeId?, result?, error?, errorCode?, updatedAt, meta: { pollAfterMs } }
 * OrchestratorTask has no error column; derive error/errorCode from result when status is 'failed'.
 */
function toJobContract(record, overrides = {}) {
  if (!record) return null;
  const req = (record.request && typeof record.request === 'object') ? record.request : (record.input && typeof record.input === 'object') ? record.input : {};
  const result = (record.result && typeof record.result === 'object') ? record.result : null;
  let status = (record.status || 'queued').toLowerCase();
  if (overrides.status) status = overrides.status;
  const updatedAt = record.updatedAt instanceof Date ? record.updatedAt.toISOString() : (record.updatedAt || new Date().toISOString());
  const effectiveResult = overrides.result !== undefined ? overrides.result : (result || null);
  const isFailed = status === 'failed';
  const errorFromResult = isFailed && effectiveResult
    ? (effectiveResult.error ?? effectiveResult.message ?? effectiveResult.summary)
    : null;
  const errorCodeFromResult = isFailed && effectiveResult ? (effectiveResult.errorCode ?? effectiveResult.code) : null;
  const rawMissionId = record.missionId ?? null;
  const missionId = rawMissionId == null ? null : (typeof rawMissionId === 'string' ? rawMissionId : (rawMissionId?.id ?? String(rawMissionId)));
  return {
    ok: true,
    jobId: record.id,
    missionId,
    status,
    generationRunId: req.generationRunId ?? null,
    storeId: req.storeId ?? record.storeId ?? null,
    result: effectiveResult,
    error: overrides.error ?? record.error ?? errorFromResult,
    errorCode: overrides.errorCode ?? errorCodeFromResult,
    updatedAt,
    meta: { pollAfterMs: POLL_AFTER_MS },
  };
}

/**
 * GET /api/mi/orchestra/job/:jobId
 * Stable contract so frontend can stop polling when status is 'completed' or 'failed'.
 * Job result contract: when status is 'completed', the response MUST include generationRunId
 * (from task.request) so the UI can resolve the draft via GET /stores/temp/draft?generationRunId=...
 * Backend must only set status to 'completed' after the draft is persisted (see build_store in run handler).
 * - DB task: return { ok, jobId, status, generationRunId?, storeId?, result?, error?, updatedAt, meta: { pollAfterMs: 1000 } }.
 * - Mock job_*: return status 'completed' with minimal result so polling stops immediately.
 * - Unknown jobId: 200 { ok: true, status: 'failed', error: 'job_not_found' } so UI can exit spinner.
 */
router.get('/orchestra/job/:jobId', optionalAuth, async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({ ok: false, error: { code: 'MISSING_JOB_ID', message: 'jobId is required' } });
    }
    const task = await prisma.orchestratorTask.findUnique({ where: { id: jobId } }).catch((e) => {
      console.warn('[Orchestra:JOB:GET] findUnique error', { jobId, err: e?.message || e });
      return null;
    });
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Orchestra:JOB:GET]', { jobId, found: !!task, status: task?.status });
    }
    if (task) {
      // Backfill missionId so every response path can return it (run may have hit "already running" or update failed)
      let taskForResponse = task;
      if (!task.missionId) {
        await prisma.orchestratorTask.update({ where: { id: jobId }, data: { missionId: jobId } }).catch(() => {});
        taskForResponse = { ...task, missionId: jobId };
      }
      const status = (taskForResponse.status || 'queued').toLowerCase();
      const STALE_MS = 5 * 60 * 1000; // 5 min: running or queued too long -> fail so client stops polling
      const updatedAtMs = taskForResponse.updatedAt ? new Date(taskForResponse.updatedAt).getTime() : new Date(taskForResponse.createdAt).getTime() || 0;
      const ageMs = Date.now() - updatedAtMs;
      if (status === 'running' && ageMs > STALE_MS) {
        await transitionOrchestratorTaskStatus({
          prisma,
          taskId: jobId,
          toStatus: 'failed',
          fromStatus: 'running',
          actorType: 'system',
          reason: 'STALE_JOB_TIMEOUT',
          result: { ok: false, error: 'stale_job_timeout', errorCode: 'INTERNAL_ERROR', summary: 'Job timed out (server restarted or worker stalled)' },
        }).catch(() => {});
        const staleContract = toJobContract({
          ...taskForResponse,
          status: 'failed',
          result: { ok: false, error: 'stale_job_timeout', summary: 'Job timed out (server restarted or worker stalled)' },
          error: 'stale_job_timeout',
          updatedAt: new Date(),
        });
        if (staleContract) return res.json(staleContract);
      }
      // Queued too long: never ran or /run never called -> fail so frontend stops infinite polling
      if (status === 'queued' && ageMs > STALE_MS) {
        await transitionOrchestratorTaskStatus({
          prisma,
          taskId: jobId,
          toStatus: 'failed',
          fromStatus: 'queued',
          actorType: 'system',
          reason: 'STALE_QUEUED',
          result: { ok: false, error: 'stale_queued', errorCode: 'INTERNAL_ERROR', summary: 'Job was queued too long and did not start' },
        }).catch(() => {});
        const staleContract = toJobContract({
          ...taskForResponse,
          status: 'failed',
          result: { ok: false, error: 'stale_queued', summary: 'Job was queued too long and did not start' },
          error: 'stale_queued',
          updatedAt: new Date(),
        });
        if (staleContract) return res.json(staleContract);
      }
      // Reconciliation: when task is still running/queued but draft is already ready, mark completed so frontend stops "Still generating..."
      const req = (taskForResponse.request && typeof taskForResponse.request === 'object') ? taskForResponse.request : {};
      const generationRunIdFromTask = req.generationRunId ?? (taskForResponse.result && typeof taskForResponse.result === 'object' ? taskForResponse.result.generationRunId : null) ?? null;
      const entryPoint = (taskForResponse.entryPoint || '').toLowerCase();
      const goal = (req.goal || '').toLowerCase();
      const isBuildStoreJob = entryPoint === 'build_store' || goal === 'build_store';
      if ((status === 'running' || status === 'queued') && generationRunIdFromTask && isBuildStoreJob) {
        const draft = await getDraftByGenerationRunId(generationRunIdFromTask).catch(() => null);
        const draftReady = draft && (draft.status === 'ready' || (draft.status || '').toLowerCase() === 'succeeded');
        if (draftReady) {
          const resultPayload = { ok: true, generationRunId: generationRunIdFromTask, draftId: draft.id };
          await transitionOrchestratorTaskStatus({
            prisma,
            taskId: jobId,
            toStatus: 'completed',
            actorType: 'system',
            correlationId: generationRunIdFromTask,
            reason: 'DRAFT_READY_SHORTCUT',
            result: resultPayload,
          }).catch(() => {});
          const completedContract = {
            ok: true,
            jobId: taskForResponse.id,
            missionId: taskForResponse.missionId ?? jobId,
            status: 'completed',
            generationRunId: generationRunIdFromTask,
            storeId: req.storeId ?? taskForResponse.storeId ?? null,
            result: resultPayload,
            error: null,
            updatedAt: new Date().toISOString(),
            meta: { pollAfterMs: POLL_AFTER_MS },
          };
          return res.json(completedContract);
        }
      }
      const contract = toJobContract(taskForResponse);
      if (contract) return res.json(contract);
      return res.json({
        ok: true,
        jobId: taskForResponse.id,
        missionId: taskForResponse.missionId ?? jobId,
        status: status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : status,
        generationRunId: (taskForResponse.request && typeof taskForResponse.request === 'object' ? taskForResponse.request.generationRunId : null) ?? null,
        storeId: (taskForResponse.request && typeof taskForResponse.request === 'object' ? taskForResponse.request.storeId : null) ?? null,
        result: taskForResponse.result ?? null,
        error: taskForResponse.error ?? null,
        updatedAt: taskForResponse.updatedAt instanceof Date ? taskForResponse.updatedAt.toISOString() : new Date().toISOString(),
        meta: { pollAfterMs: POLL_AFTER_MS },
      });
    }
    if (String(jobId).startsWith('job_')) {
      // Mock job: return completed with minimal result so frontend stops polling
      return res.status(200).json({
        ok: true,
        jobId,
        status: 'completed',
        generationRunId: null,
        storeId: 'temp',
        result: { done: true },
        error: null,
        updatedAt: new Date().toISOString(),
        meta: { pollAfterMs: POLL_AFTER_MS },
      });
    }
    // Unknown jobId: 200 so UI can exit spinner (do not 404)
    return res.status(200).json({
      ok: true,
      jobId,
      status: 'failed',
      generationRunId: null,
      storeId: null,
      result: null,
      error: 'job_not_found',
      errorCode: 'STORE_NOT_FOUND',
      updatedAt: new Date().toISOString(),
      meta: { pollAfterMs: POLL_AFTER_MS },
    });
  } catch (err) {
    console.error('[MI Routes] GET /orchestra/job/:jobId error:', err);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: err?.message || 'Failed to fetch job' },
    });
  }
});

/**
 * GET /api/mi/missions/:missionId
 * Returns mission by id with unified executionPlans (orchestra + chain). executionPlans is always an array.
 */
router.get('/missions/:missionId', optionalAuth, async (req, res) => {
  try {
    const { missionId } = req.params;
    if (!missionId) {
      return res.status(400).json({ ok: false, error: { code: 'MISSING_MISSION_ID', message: 'missionId is required' } });
    }
    const db = getPrismaClient();
    const mission = await db.mission.findUnique({
      where: { id: missionId },
      select: { id: true, tenantId: true, createdByUserId: true, title: true, status: true, context: true, createdAt: true, updatedAt: true },
    }).catch(() => null);
    if (!mission) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Mission not found' } });
    }
    const context = mission.context ?? {};
    const executionPlans = getUnifiedExecutionPlans(context);
    return res.status(200).json({
      ok: true,
      mission: {
        ...mission,
        context,
        executionPlans,
      },
    });
  } catch (err) {
    console.error('[MI Routes] GET /missions/:missionId error:', err);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: err?.message || 'Failed to fetch mission' },
    });
  }
});

/**
 * GET /api/mi/orchestra/job/:jobId/mission-context
 * Returns Mission.context for the job's mission (same DB as API). Use from E2E so test reads from API process.
 */
router.get('/orchestra/job/:jobId/mission-context', optionalAuth, async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({ ok: false, error: { code: 'MISSING_JOB_ID', message: 'jobId is required' } });
    }
    const db = getPrismaClient();
    const task = await db.orchestratorTask.findUnique({ where: { id: jobId }, select: { missionId: true } }).catch(() => null);
    const missionId = task?.missionId ?? jobId;
    const mission = await db.mission.findUnique({
      where: { id: missionId },
      select: { context: true },
    }).catch(() => null);
    return res.status(200).json({
      ok: true,
      missionId,
      context: mission?.context ?? null,
    });
  } catch (err) {
    console.error('[MI Routes] GET /orchestra/job/:jobId/mission-context error:', err);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: err?.message || 'Failed to fetch mission context' },
    });
  }
});

/**
 * Internal MI workers: run in background (setImmediate). Each updates orchestrator task on completion/failure.
 */
async function runAutofillImages(draft, jobId) {
  try {
    let generateImageForDraftItem;
    try {
      const mod = await import('../services/menuVisualAgent/menuVisualAgent.js');
      generateImageForDraftItem = mod.generateImageForDraftItem;
    } catch (err) {
      if (err?.code === 'ERR_MODULE_NOT_FOUND') {
        await transitionOrchestratorTaskStatus({
          prisma,
          taskId: jobId,
          toStatus: 'failed',
          fromStatus: 'running',
          actorType: 'worker',
          reason: 'MI_WORKER',
          result: { ok: false, error: 'menuVisualAgent_module_missing', summary: 'Image generation module not available (TS build or path)' },
        }).catch(() => {});
        return;
      }
      throw err;
    }
    if (typeof generateImageForDraftItem !== 'function') {
      await transitionOrchestratorTaskStatus({
        prisma,
        taskId: jobId,
        toStatus: 'failed',
        fromStatus: 'running',
        actorType: 'worker',
        reason: 'MI_WORKER',
        result: { ok: false, error: 'menuVisualAgent_not_implemented', summary: 'generateImageForDraftItem not available' },
      }).catch(() => {});
      return;
    }
    const preview = (draft.preview && typeof draft.preview === 'object') ? draft.preview : {};
    const items = Array.isArray(preview.items) ? [...preview.items] : [];
    const categories = Array.isArray(preview.categories) ? preview.categories : [];
    items.forEach((item, i) => {
      if (item && typeof item === 'object' && (!item.id || typeof item.id !== 'string' || !String(item.id).trim())) {
        item.id = `item_${draft.id}_${i}`;
      }
    });
    const hasValidName = (i) => (i && typeof i.name === 'string' && i.name.trim().length >= 2);
    const hasInternalImage = (i) => {
      if (i.imageUrl && typeof i.imageUrl === 'string' && i.imageUrl.trim().startsWith('http')) return true;
      const first = Array.isArray(i.images) && i.images[0];
      return typeof first === 'string' && first.trim().startsWith('http');
    };
    const toEnrich = items.filter((i) => !hasInternalImage(i) && hasValidName(i)).slice(0, 30);
    const profile = draft.input?.generationProfile ?? draft.input?.classificationProfile ?? null;
    const imageFillProfile = profile ? {
      verticalSlug: profile.verticalSlug || '',
      keywords: profile.keywords,
      forbiddenKeywords: profile.forbiddenKeywords,
      audience: profile.audience,
      categoryHints: profile.categoryHints,
    } : null;
    const styleName = 'modern';
    const BATCH = 5;
    const usedUrls = new Set();
    const businessType = (preview.storeType || preview.meta?.storeType || '').toString().trim() || null;
    for (let offset = 0; offset < toEnrich.length; offset += BATCH) {
      const batch = toEnrich.slice(offset, offset + BATCH);
      const results = await Promise.allSettled(
        batch.map((i) => {
          const categoryHint = i.categoryId && categories.length ? categories.find((c) => c.id === i.categoryId)?.name : null;
          const categoryName = categoryHint;
          const opts = imageFillProfile ? { profile: imageFillProfile, categoryHint, categoryName, businessType, usedUrls } : { categoryName, businessType, usedUrls };
          return generateImageForDraftItem(i.name, i.description, styleName, opts);
        })
      );
      batch.forEach((item, idx) => {
        const r = results[idx];
        if (r.status === 'fulfilled' && r.value && r.value.url) {
          const img = r.value;
          item.imageUrl = img.url;
          item.imageSource = img.source;
          item.imageQuery = img.query;
          item.imageConfidence = img.confidence;
          usedUrls.add(img.url);
        }
      });
    }
    await patchDraftPreview(draft.id, { items });
    const filled = toEnrich.filter((i) => i.imageUrl).length;
    await transitionOrchestratorTaskStatus({
      prisma,
      taskId: jobId,
      toStatus: 'completed',
      fromStatus: 'running',
      actorType: 'worker',
      reason: 'MI_WORKER',
      result: { ok: true, inferredGoal: 'autofill_product_images', draftUpdated: true, summary: `Filled ${filled} images` },
    }).catch(() => {});
  } catch (err) {
    console.warn('[MI Routes] autofill_product_images failed:', err?.message || err);
    await transitionOrchestratorTaskStatus({
      prisma,
      taskId: jobId,
      toStatus: 'failed',
      fromStatus: 'running',
      actorType: 'worker',
      reason: 'MI_WORKER',
      result: { ok: false, error: err?.message || String(err) },
    }).catch(() => {});
  }
}

/** Repair wrong images: replace items whose imageUrl looks like placeholder/template with a better match. Only high-confidence replacements are applied. */
async function runRepairProductImages(draft, jobId) {
  try {
    let generateImageForDraftItem;
    try {
      const mod = await import('../services/menuVisualAgent/menuVisualAgent.js');
      generateImageForDraftItem = mod.generateImageForDraftItem;
    } catch (err) {
      if (err?.code === 'ERR_MODULE_NOT_FOUND') {
        await transitionOrchestratorTaskStatus({
          prisma,
          taskId: jobId,
          toStatus: 'failed',
          fromStatus: 'running',
          actorType: 'worker',
          reason: 'MI_WORKER',
          result: { ok: false, error: 'menuVisualAgent_module_missing', summary: 'Image generation module not available' },
        }).catch(() => {});
        return;
      }
      throw err;
    }
    if (typeof generateImageForDraftItem !== 'function') {
      await transitionOrchestratorTaskStatus({
        prisma,
        taskId: jobId,
        toStatus: 'failed',
        fromStatus: 'running',
        actorType: 'worker',
        reason: 'MI_WORKER',
        result: { ok: false, error: 'menuVisualAgent_not_implemented' },
      }).catch(() => {});
      return;
    }
    const preview = (draft.preview && typeof draft.preview === 'object') ? draft.preview : {};
    const items = Array.isArray(preview.items) ? [...preview.items] : [];
    const categories = Array.isArray(preview.categories) ? preview.categories : [];
    const isPlaceholderOrTemplate = (url) => {
      if (!url || typeof url !== 'string') return false;
      const u = url.trim().toLowerCase();
      return /placeholder|via\.placeholder|placehold\.co/i.test(u);
    };
    items.forEach((item, i) => {
      if (item && typeof item === 'object' && (!item.id || typeof item.id !== 'string' || !String(item.id).trim())) {
        item.id = `item_${draft.id}_${i}`;
      }
    });
    const hasValidName = (i) => (i && typeof i.name === 'string' && i.name.trim().length >= 2);
    const toRepair = items.filter((i) => hasValidName(i) && isPlaceholderOrTemplate(i.imageUrl || (Array.isArray(i.images) && i.images[0]) || '')).slice(0, 30);
    const profile = draft.input?.generationProfile ?? draft.input?.classificationProfile ?? null;
    const imageFillProfile = profile ? {
      verticalSlug: profile.verticalSlug || '',
      keywords: profile.keywords,
      forbiddenKeywords: profile.forbiddenKeywords,
      audience: profile.audience,
      categoryHints: profile.categoryHints,
    } : null;
    const styleName = 'modern';
    const BATCH = 5;
    const usedUrls = new Set();
    const businessType = (preview.storeType || preview.meta?.storeType || '').toString().trim() || null;
    let updatedCount = 0;
    for (let offset = 0; offset < toRepair.length; offset += BATCH) {
      const batch = toRepair.slice(offset, offset + BATCH);
      const results = await Promise.allSettled(
        batch.map((i) => {
          const categoryHint = i.categoryId && categories.length ? categories.find((c) => c.id === i.categoryId)?.name : null;
          const categoryName = categoryHint;
          const opts = imageFillProfile ? { profile: imageFillProfile, categoryHint, categoryName, businessType, usedUrls } : { categoryName, businessType, usedUrls };
          return generateImageForDraftItem(i.name, i.description, styleName, opts);
        })
      );
      batch.forEach((item, idx) => {
        const r = results[idx];
        if (r.status === 'fulfilled' && r.value && r.value.url && (r.value.confidence == null || r.value.confidence >= 0.45)) {
          const img = r.value;
          item.imageUrl = img.url;
          item.imageSource = img.source;
          item.imageQuery = img.query;
          item.imageConfidence = img.confidence;
          usedUrls.add(img.url);
          updatedCount += 1;
        }
      });
    }
    await patchDraftPreview(draft.id, { items });
    await transitionOrchestratorTaskStatus({
      prisma,
      taskId: jobId,
      toStatus: 'completed',
      fromStatus: 'running',
      actorType: 'worker',
      reason: 'MI_WORKER',
      result: {
        ok: true,
        inferredGoal: 'repair_product_images',
        draftUpdated: updatedCount > 0,
        updatedCount,
        skippedCount: toRepair.length - updatedCount,
        summary: `Repaired ${updatedCount} image(s); ${toRepair.length - updatedCount} skipped (low confidence or no match).`,
      },
    }).catch(() => {});
  } catch (err) {
    console.warn('[MI Routes] repair_product_images failed:', err?.message || err);
    await transitionOrchestratorTaskStatus({
      prisma,
      taskId: jobId,
      toStatus: 'failed',
      fromStatus: 'running',
      actorType: 'worker',
      reason: 'MI_WORKER',
      result: { ok: false, error: err?.message || String(err) },
    }).catch(() => {});
  }
}

async function runGenerateTags(draft, jobId, agentContext = {}) {
  const generationRunId = (draft.input && typeof draft.input === 'object' ? draft.input.generationRunId : null) ?? null;
  try {
    let generateTagsForItems;
    try {
      const mod = await import('../services/mi/tagGenerationService.js');
      generateTagsForItems = mod.generateTagsForItems;
    } catch (err) {
      if (err?.code === 'ERR_MODULE_NOT_FOUND') {
        await transitionOrchestratorTaskStatus({
          prisma,
          taskId: jobId,
          toStatus: 'failed',
          fromStatus: 'running',
          actorType: 'worker',
          reason: 'MI_WORKER',
          result: { ok: false, error: 'tagGenerationService_module_missing' },
        }).catch(() => {});
        return;
      }
      throw err;
    }
    if (typeof generateTagsForItems !== 'function') {
      await transitionOrchestratorTaskStatus({
        prisma,
        taskId: jobId,
        toStatus: 'failed',
        fromStatus: 'running',
        actorType: 'worker',
        reason: 'MI_WORKER',
        result: { ok: false, error: 'tagGenerationService_not_implemented' },
      }).catch(() => {});
      return;
    }
    const preview = (draft.preview && typeof draft.preview === 'object') ? draft.preview : {};
    const items = Array.isArray(preview.items) ? [...preview.items] : [];
    items.forEach((item, i) => {
      if (item && typeof item === 'object' && (!item.id || typeof item.id !== 'string' || !String(item.id).trim())) {
        item.id = `item_${draft.id}_${i}`;
      }
    });
    const storeName = preview.storeName ?? (draft.input && typeof draft.input === 'object' ? draft.input.businessName : null) ?? null;
    const businessType = (preview.storeType ?? (draft.input && typeof draft.input === 'object' ? draft.input.businessType : null) ?? null) ?? null;
    const verticalSlug = (draft.input && typeof draft.input === 'object' ? draft.input.verticalSlug : null) ?? null;
    const audience = (draft.input && typeof draft.input === 'object' ? draft.input.audience : null) ?? null;
    const productRefs = (agentContext.missionContext?.entities?.products ?? []).slice(0, 500).map((p) => ({ id: p?.id, productId: p?.productId, name: p?.name ?? p?.title }));
    const { updatedItems: outItems, counts } = await generateTagsForItems({ items, storeName, businessType, verticalSlug, audience, productRefs });
    const taggedCount = outItems.filter((i) => Array.isArray(i.tags) && i.tags.length > 0).length;
    await patchDraftPreview(draft.id, { items: outItems });
    const resultPayload = {
      ok: true,
      inferredGoal: 'generate_tags',
      draftUpdated: true,
      counts,
      summary: `Tagged ${taggedCount}/${items.length} items`,
      ...(taggedCount === 0 ? { warning: 'no_tags_generated' } : {}),
    };
    await transitionOrchestratorTaskStatus({
      prisma,
      taskId: jobId,
      toStatus: 'completed',
      fromStatus: 'running',
      actorType: 'worker',
      reason: 'MI_WORKER',
      result: resultPayload,
    }).catch(() => {});
  } catch (err) {
    await transitionOrchestratorTaskStatus({
      prisma,
      taskId: jobId,
      toStatus: 'failed',
      fromStatus: 'running',
      actorType: 'worker',
      reason: 'MI_WORKER',
      result: { ok: false, error: err?.message || String(err) },
    }).catch(() => {});
  }
}

async function runRewriteDescriptions(draft, jobId, options = null, agentContext = {}) {
  try {
    let rewriteDescriptionsForItems;
    try {
      const mod = await import('../services/mi/descriptionRewriteService.js');
      rewriteDescriptionsForItems = mod.rewriteDescriptionsForItems;
    } catch (err) {
      if (err?.code === 'ERR_MODULE_NOT_FOUND') {
        await transitionOrchestratorTaskStatus({
          prisma,
          taskId: jobId,
          toStatus: 'failed',
          fromStatus: 'running',
          actorType: 'worker',
          reason: 'MI_WORKER',
          result: { ok: false, error: 'descriptionRewriteService_module_missing' },
        }).catch(() => {});
        return;
      }
      throw err;
    }
    if (typeof rewriteDescriptionsForItems !== 'function') {
      await transitionOrchestratorTaskStatus({
        prisma,
        taskId: jobId,
        toStatus: 'failed',
        fromStatus: 'running',
        actorType: 'worker',
        reason: 'MI_WORKER',
        result: { ok: false, error: 'descriptionRewriteService_not_implemented' },
      }).catch(() => {});
      return;
    }
    const preview = (draft.preview && typeof draft.preview === 'object') ? draft.preview : {};
    const items = Array.isArray(preview.items) ? preview.items.map((it) => (it && typeof it === 'object' ? { ...it } : it)) : [];
    items.forEach((item, i) => {
      if (item && typeof item === 'object' && (!item.id || typeof item.id !== 'string' || !String(item.id).trim())) {
        item.id = `item_${draft.id}_${i}`;
      }
    });
    const storeName = preview.storeName ?? (preview.store && preview.store.name) ?? (draft.input && typeof draft.input === 'object' ? draft.input.businessName : null) ?? null;
    const businessType = (preview.storeType ?? (draft.input && typeof draft.input === 'object' ? (draft.input.businessType ?? draft.input.storeType) : null) ?? null) ?? null;
    const productRefs = (agentContext.missionContext?.entities?.products ?? []).slice(0, 500).map((p) => ({ id: p?.id, productId: p?.productId, name: p?.name ?? p?.title }));
    const ctx = {
      storeName,
      businessType,
      tone: (options && options.tone) ?? null,
      length: (options && options.length) ?? 'medium',
      style: (options && options.style) ?? null,
      overwrite: (options && options.overwrite) ?? false,
      productRefs,
    };
    const { updatedItems: outItems, counts } = await rewriteDescriptionsForItems({ items, ...ctx });
    const byId = new Map();
    outItems.forEach((it) => {
      if (it && it.id != null && it.description != null && String(it.description).trim()) {
        byId.set(String(it.id), String(it.description).trim());
      }
    });
    const fullItems = items.map((orig) => {
      const updatedDesc = byId.get(String(orig?.id));
      if (updatedDesc) return { ...orig, description: updatedDesc };
      return orig;
    });
    await patchDraftPreview(draft.id, { items: fullItems });
    const summary = `Rewrote ${counts.updated} descriptions (of ${items.length} items)`;
    await transitionOrchestratorTaskStatus({
      prisma,
      taskId: jobId,
      toStatus: 'completed',
      fromStatus: 'running',
      actorType: 'worker',
      reason: 'MI_WORKER',
      result: {
        ok: true,
        inferredGoal: 'rewrite_descriptions',
        draftUpdated: true,
        counts,
        summary,
        optionsUsed: options ? { tone: ctx.tone, length: ctx.length, style: ctx.style, overwrite: ctx.overwrite } : undefined,
      },
    }).catch(() => {});
  } catch (err) {
    await transitionOrchestratorTaskStatus({
      prisma,
      taskId: jobId,
      toStatus: 'failed',
      fromStatus: 'running',
      actorType: 'worker',
      reason: 'MI_WORKER',
      result: { ok: false, error: err?.message || String(err) },
    }).catch(() => {});
  }
}

async function runGenerateHero(draft, jobId) {
  try {
    let generateHeroForDraft;
    try {
      const mod = await import('../services/mi/heroGenerationService.js');
      generateHeroForDraft = mod.generateHeroForDraft;
    } catch (err) {
      if (err?.code === 'ERR_MODULE_NOT_FOUND') {
        await transitionOrchestratorTaskStatus({
          prisma,
          taskId: jobId,
          toStatus: 'failed',
          fromStatus: 'running',
          actorType: 'worker',
          reason: 'MI_WORKER',
          result: { ok: false, error: 'heroGenerationService_module_missing' },
        }).catch(() => {});
        return;
      }
      throw err;
    }
    if (typeof generateHeroForDraft !== 'function') {
      await transitionOrchestratorTaskStatus({
        prisma,
        taskId: jobId,
        toStatus: 'failed',
        fromStatus: 'running',
        actorType: 'worker',
        reason: 'MI_WORKER',
        result: { ok: false, error: 'heroGenerationService_not_implemented' },
      }).catch(() => {});
      return;
    }
    const preview = (draft.preview && typeof draft.preview === 'object') ? draft.preview : {};
    const input = (draft.input && typeof draft.input === 'object') ? draft.input : {};
    const storeName = preview.storeName ?? input.businessName ?? null;
    const businessType = (preview.storeType ?? input.businessType ?? null) ?? null;
    const storeType = (preview.storeType ?? input.storeType ?? input.businessType ?? null) ?? null;
    const { hero } = await generateHeroForDraft({ storeName, businessType, storeType });
    const heroPayload = {
      hero: {
        imageUrl: hero.imageUrl ?? null,
        ...(hero.headline != null && { headline: hero.headline }),
        ...(hero.subheadline != null && { subheadline: hero.subheadline }),
      },
      heroImageUrl: hero.imageUrl ?? undefined,
    };
    await patchDraftPreview(draft.id, heroPayload);
    await transitionOrchestratorTaskStatus({
      prisma,
      taskId: jobId,
      toStatus: 'completed',
      fromStatus: 'running',
      actorType: 'worker',
      reason: 'MI_WORKER',
      result: {
        ok: true,
        inferredGoal: 'generate_store_hero',
        draftUpdated: true,
        summary: hero.imageUrl ? 'Hero image generated' : 'Hero generation completed (no image)',
      },
    }).catch(() => {});
  } catch (err) {
    await transitionOrchestratorTaskStatus({
      prisma,
      taskId: jobId,
      toStatus: 'failed',
      fromStatus: 'running',
      actorType: 'worker',
      reason: 'MI_WORKER',
      result: { ok: false, error: err?.message || String(err) },
    }).catch(() => {});
  }
}

async function runSetHeroFromItem(draft, jobId) {
  const task = await getPrismaClient().orchestratorTask.findUnique({ where: { id: jobId } }).catch(() => null);
  const request = (task?.request && typeof task.request === 'object') ? task.request : {};
  const itemId = request.itemId ?? null;
  if (!itemId) {
    await transitionOrchestratorTaskStatus({
      prisma,
      taskId: jobId,
      toStatus: 'completed',
      fromStatus: 'running',
      actorType: 'worker',
      reason: 'MI_WORKER',
      result: {
        ok: true,
        inferredGoal: 'set_store_hero_from_item',
        draftUpdated: false,
        summary: 'Select a product first, then run "use as hero".',
      },
    }).catch(() => {});
    return;
  }
  try {
    const preview = (draft.preview && typeof draft.preview === 'object') ? draft.preview : {};
    const items = Array.isArray(preview.items) ? preview.items : [];
    const item = items.find((i) => String(i?.id) === String(itemId));
    if (!item) {
      await transitionOrchestratorTaskStatus({
        prisma,
        taskId: jobId,
        toStatus: 'failed',
        fromStatus: 'running',
        actorType: 'worker',
        reason: 'MI_WORKER',
        result: { ok: false, error: 'hero_item_not_found', itemId },
      }).catch(() => {});
      return;
    }
    const imageUrl = item.imageUrl ?? item.images?.[0] ?? null;
    if (!imageUrl) {
      await transitionOrchestratorTaskStatus({
        prisma,
        taskId: jobId,
        toStatus: 'failed',
        fromStatus: 'running',
        actorType: 'worker',
        reason: 'MI_WORKER',
        result: { ok: false, error: 'hero_source_image_missing', itemId },
      }).catch(() => {});
      return;
    }
    const hero = {
      imageUrl,
      source: 'item',
      sourceItemId: itemId,
      updatedAt: new Date().toISOString(),
    };
    const patch = {
      hero,
      heroImageUrl: imageUrl,
      store: { ...(preview.store && typeof preview.store === 'object' ? preview.store : {}), heroImageUrl: imageUrl },
    };
    await patchDraftPreview(draft.id, patch);
    await transitionOrchestratorTaskStatus({
      prisma,
      taskId: jobId,
      toStatus: 'completed',
      fromStatus: 'running',
      actorType: 'worker',
      reason: 'MI_WORKER',
      result: {
        ok: true,
        inferredGoal: 'set_store_hero_from_item',
        draftUpdated: true,
        summary: 'Hero updated from product image',
      },
    }).catch(() => {});
  } catch (err) {
    await transitionOrchestratorTaskStatus({
      prisma,
      taskId: jobId,
      toStatus: 'failed',
      fromStatus: 'running',
      actorType: 'worker',
      reason: 'MI_WORKER',
      result: { ok: false, error: err?.message || String(err) },
    }).catch(() => {});
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll until draft is ready or timeout/terminal state. Used inside background workers so MI improve goals don't fail immediately when draft is still generating.
 */
async function waitForDraftReady(generationRunId, { timeoutMs = 45000, intervalMs = 1000 } = {}) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    const d = await getDraftByGenerationRunId(generationRunId).catch(() => null);
    if (!d) return null;
    last = d;
    if (d.status === 'ready') return d;
    if (['failed', 'expired'].includes(String(d.status || '').toLowerCase())) return d;
    await sleep(intervalMs);
  }
  return last;
}

/**
 * Infer MI intent from command text (for mi_command entry point).
 * Returns string goal (e.g. 'generate_tags') or { goal: 'rewrite_descriptions', options: { tone, length, style, overwrite } }.
 */
function inferMiCommandIntent(rawInput) {
  const cmd = String(rawInput || '').toLowerCase().trim();
  if (/\b(use as hero|set hero|hero background|use this as hero|use .+ image as hero)\b/.test(cmd)) return 'set_store_hero_from_item';
  if (/\btag(s)?\b/.test(cmd)) return 'generate_tags';
  // Rewrite descriptions: return object with parsed options
  if (/\b(rewrite\s+description(s)?|improve\s+description(s)?|make\s+description(s)?|update\s+description(s)?)\b/.test(cmd) ||
      /\b(description(s)?\s+(more\s+)?(friendly|professional|premium|shorter|longer|warm))\b/.test(cmd) ||
      /\b(rewrite\s+all\s+product\s+description|make\s+descriptions\s+more)\b/.test(cmd)) {
    const options = {};
    const toneKeywords = ['friendly', 'warm', 'casual', 'professional', 'premium', 'luxury', 'formal', 'playful'];
    for (const t of toneKeywords) {
      if (new RegExp(`\\b${t}\\b`).test(cmd)) {
        options.tone = t;
        break;
      }
    }
    if (/\b(shorter|short|concise)\b/.test(cmd)) options.length = 'short';
    else if (/\b(longer|detailed)\b/.test(cmd)) options.length = 'long';
    else options.length = 'medium';
    if (/\b(rewrite\s+all|overwrite)\b/.test(cmd)) options.overwrite = true;
    else options.overwrite = false;
    return { goal: 'rewrite_descriptions', options };
  }
  if (/\b(description|rewrite)\b/.test(cmd)) return 'rewrite_descriptions';
  if (/\b(hero|banner)\b/.test(cmd)) return 'generate_store_hero';
  if (/\b(repair|fix)\s*(wrong\s*)?(product\s*)?images?\b/.test(cmd) || /\brepair\s*images?\b/.test(cmd)) return 'repair_product_images';
  if (/\b(fill|autofill|auto-fill)\s*(missing\s*)?images?\b/.test(cmd)) return 'fill_missing_images';
  if (/\b(image|photo)s?\b/.test(cmd)) return 'autofill_product_images';
  return null;
}

/**
 * POST /api/mi/orchestra/job/:jobId/run
 * Run/trigger a job. Handles both DB tasks and mock job_* ids so dashboard does not get 404.
 * For build_store jobs: finds DraftStore by generationRunId and runs generateDraft in background.
 */
router.post('/orchestra/job/:jobId/run', optionalAuth, async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({ ok: false, error: { code: 'MISSING_JOB_ID', message: 'jobId is required' } });
    }
    const task = await getPrismaClient().orchestratorTask.findUnique({ where: { id: jobId } }).catch(() => null);
    if (task) {
      const entryPoint = (task.entryPoint || '').toLowerCase();
      const request = (task.request && typeof task.request === 'object') ? task.request : {};
      const generationRunId = request.generationRunId || null;

      // Foundation 1: always ensure mission + plan exist before any early return (so /run after async start still writes plan)
      const missionIdForPlan = task.missionId || jobId;
      const db = getPrismaClient();
      if (process.env.NODE_ENV === 'test') {
        const dbUrl = (process.env.DATABASE_URL || '').slice(0, 60);
        console.log('[E2E /run] Foundation 1 block', { jobId, missionIdForPlan, dbUrl: dbUrl + (process.env.DATABASE_URL?.length > 60 ? '...' : '') });
      }
      if (!task.missionId) {
        const user = req.user || { id: task.userId, business: task.tenantId ? { id: task.tenantId } : undefined };
        const title = request.businessName || request.rawInput || entryPoint || jobId;
        try {
          if (process.env.NODE_ENV !== 'production' && (user?.isDevAdmin || user?.id === 'dev-user-id')) {
            await db.user.upsert({
              where: { id: 'dev-user-id' },
              create: {
                id: 'dev-user-id',
                email: 'dev@cardbey.local',
                passwordHash: '',
                displayName: 'Dev User',
              },
              update: {},
            }).catch(() => {});
          }
          await getOrCreateMission(jobId, user, {
            title: typeof title === 'string' ? title : String(title),
            prisma: db,
          });
        } catch (err) {
          console.warn('[MI Routes] getOrCreateMission failed (will still set task.missionId)', err?.message || err);
          // Ensure Mission row exists with same client so mergeMissionContext can update it (E2E / two-client fix)
          const uid = user?.id || task.userId || 'dev-user-id';
          const tid = task.tenantId || uid;
          await db.mission.upsert({
            where: { id: missionIdForPlan },
            create: {
              id: missionIdForPlan,
              tenantId: tid,
              createdByUserId: uid,
              title: typeof title === 'string' ? title : null,
              status: 'active',
            },
            update: {},
          }).catch(() => {});
        }
        await db.orchestratorTask.update({
          where: { id: jobId },
          data: { missionId: jobId },
        }).catch((err) => {
          console.warn('[MI Routes] orchestratorTask.update missionId failed', err?.message || err);
        });
      }
      try {
        const plan = planOrchestraJob(entryPoint, request, jobId);
        const planPatch = { missionPlan: { [jobId]: plan } };
        let merged = await mergeMissionContext(missionIdForPlan, planPatch, { prisma: db });
        if (merged === null) {
          const uid = task.userId || 'dev-user-id';
          const tid = task.tenantId || uid;
          if (process.env.NODE_ENV !== 'production' && uid === 'dev-user-id') {
            await db.user.upsert({
              where: { id: 'dev-user-id' },
              create: {
                id: 'dev-user-id',
                email: 'dev@cardbey.local',
                passwordHash: '',
                displayName: 'Dev User',
              },
              update: {},
            }).catch(() => {});
          }
          await db.mission.upsert({
            where: { id: missionIdForPlan },
            create: {
              id: missionIdForPlan,
              tenantId: tid,
              createdByUserId: uid,
              status: 'active',
              context: planPatch,
            },
            update: { context: planPatch, updatedAt: new Date() },
          }).catch(() => {});
          merged = planPatch;
        }
        // Force context.missionPlan into Mission row (same client) so E2E and readers always see it
        const row = await db.mission.findUnique({ where: { id: missionIdForPlan }, select: { context: true } }).catch(() => null);
        if (row && (!row.context || typeof row.context !== 'object' || !row.context.missionPlan?.[jobId])) {
          const existing = (row.context && typeof row.context === 'object') ? row.context : {};
          const mergedContext = { ...existing, missionPlan: { ...(existing.missionPlan || {}), [jobId]: plan } };
          await db.mission.update({
            where: { id: missionIdForPlan },
            data: { context: mergedContext, updatedAt: new Date() },
          }).catch((e) => console.warn('[MI Routes] mission context force-update failed', e?.message || e));
        }
        await db.missionEvent.create({
          data: {
            missionId: missionIdForPlan,
            agent: 'orchestra',
            type: 'plan_created',
            payload: { planId: plan.planId, intentId: jobId, stepCount: plan.steps?.length ?? 0 },
          },
        });
        if (process.env.NODE_ENV === 'test') {
          console.log('[E2E /run] Foundation 1 done: mission plan + plan_created written', { jobId, missionId: missionIdForPlan });
        }
      } catch (err) {
        console.warn('[MI Routes] mission plan / plan_created failed (job continues)', err?.message || err);
      }

      if (task.status === 'running' || task.status === 'completed') {
        const job = toOrchestraJob(task);
        return res.json({ ok: true, job, message: `Job already ${task.status}` });
      }

      // build_store: use shared helper (atomic queued→running + generateDraft); no prior status update so helper can win race with auto-run
      if (entryPoint === 'build_store' && generationRunId) {
        const draft = await getDraftByGenerationRunId(generationRunId);
        if (!draft) {
          await transitionOrchestratorTaskStatus({
            prisma,
            taskId: jobId,
            toStatus: 'failed',
            fromStatus: 'queued',
            actorType: 'automation',
            correlationId: generationRunId,
            reason: 'JOB_RUN',
            result: { ok: false, error: 'draft_not_found', generationRunId },
          }).catch(() => {});
          return res.json({ ok: true, job: toOrchestraJob(task), message: 'Job started' });
        }
        if (draft.status === 'ready') {
          await transitionOrchestratorTaskStatus({
            prisma,
            taskId: jobId,
            toStatus: 'completed',
            fromStatus: 'queued',
            actorType: 'automation',
            correlationId: generationRunId,
            reason: 'JOB_RUN',
            result: { ok: true, generationRunId },
          }).catch(() => {});
          return res.json({ ok: true, job: toOrchestraJob(task), message: 'Job already completed' });
        }
        if (draft.status !== 'generating') {
          await transitionOrchestratorTaskStatus({
            prisma,
            taskId: jobId,
            toStatus: 'failed',
            fromStatus: 'queued',
            actorType: 'automation',
            correlationId: generationRunId,
            reason: 'JOB_RUN',
            result: { ok: false, error: 'draft_invalid_status', generationRunId, status: draft.status },
          }).catch(() => {});
          return res.json({ ok: true, job: toOrchestraJob(task), message: 'Job started' });
        }
        // Foundation 2: pass mission context and emitContextUpdate so catalog step can read/write agentMemory
        const missionRow = await db.mission.findUnique({ where: { id: missionIdForPlan }, select: { context: true } }).catch(() => null);
        const missionContext = missionRow?.context?.agentMemory ?? null;
        const emitContextUpdate = createEmitContextUpdate(missionIdForPlan, 'orchestra', { prisma: db, mergeMissionContext });
        const stepReporter = createStepReporter(missionIdForPlan, jobId, { prisma: db, mergeMissionPlanStep });
        runBuildStoreJob(prisma, jobId, draft.id, generationRunId, newTraceId(), {
          missionContext,
          emitContextUpdate,
          stepReporter,
          reactMissionId: missionIdForPlan,
        });
        return res.json({ ok: true, job: toOrchestraJob(task), message: 'Job started' });
      }

      // Non-build_store: set running then run MI goals (atomic queued->running)
      const tr = await transitionOrchestratorTaskStatus({
        prisma,
        taskId: jobId,
        toStatus: 'running',
        fromStatus: 'queued',
        actorType: 'automation',
        correlationId: generationRunId,
        reason: 'JOB_RUN',
      });
      if (!tr.ok) {
        return res.json({ ok: true, job: toOrchestraJob(task), message: 'Job already running or completed' });
      }
      const updated = await prisma.orchestratorTask.findUnique({ where: { id: jobId } }).catch(() => task);
      // Phase 0: fix_catalog not implemented — fail job so UI shows "Not available yet", not fake success
      if (entryPoint === 'fix_catalog') {
        await transitionOrchestratorTaskStatus({
          prisma,
          taskId: jobId,
          toStatus: 'failed',
          fromStatus: 'running',
          actorType: 'automation',
          reason: 'JOB_RUN',
          result: { ok: false, error: 'not_implemented', summary: 'Power Fix (fix_catalog) not available yet' },
        }).catch(() => {});
        return res.json({ ok: true, job: toOrchestraJob(updated || task), message: 'Job started' });
      }
      // MI improve goals: autofill_product_images, fill_missing_images, repair_product_images, generate_tags, rewrite_descriptions, generate_store_hero, set_store_hero_from_item, mi_command
      const MI_DRAFT_GOALS = ['autofill_product_images', 'fill_missing_images', 'repair_product_images', 'generate_tags', 'rewrite_descriptions', 'generate_store_hero', 'set_store_hero_from_item', 'mi_command'];
        if (MI_DRAFT_GOALS.includes(entryPoint) && (generationRunId || request.draftId)) {
          const itemIdForHero = request.itemId ?? null;
          if (entryPoint === 'set_store_hero_from_item' && !itemIdForHero) {
            await transitionOrchestratorTaskStatus({
              prisma,
              taskId: jobId,
              toStatus: 'completed',
              fromStatus: 'running',
              actorType: 'automation',
              reason: 'JOB_RUN',
              result: {
                ok: true,
                draftUpdated: false,
                summary: 'Select a product first, then run "use as hero".',
              },
            }).catch(() => {});
            return res.json({ ok: true, job: toOrchestraJob(updated || task), message: 'Job started' });
          }
          const draft = generationRunId
            ? await getDraftByGenerationRunId(generationRunId)
            : await getDraft(request.draftId).catch(() => null);

          if (!draft) {
            await transitionOrchestratorTaskStatus({
              prisma,
              taskId: jobId,
              toStatus: 'failed',
              fromStatus: 'running',
              actorType: 'automation',
              correlationId: generationRunId || request.draftId,
              reason: 'JOB_RUN',
              result: { ok: false, error: 'draft_not_found', generationRunId, draftId: request.draftId },
            }).catch(() => {});
            return res.json({ ok: true, job: toOrchestraJob(updated || task), message: 'Job started' });
          }

          const runIdForWait = generationRunId || (draft.input && typeof draft.input === 'object' ? draft.input.generationRunId : null);

          // Foundation 2 Session 2: pass agentMemory so CopyAgent-equivalent (tags, descriptions) can use product context
          const missionRowForGoals = await db.mission.findUnique({ where: { id: missionIdForPlan }, select: { context: true } }).catch(() => null);
          const missionContextForGoals = missionRowForGoals?.context?.agentMemory ?? null;
          const emitContextUpdateForGoals = createEmitContextUpdate(missionIdForPlan, 'orchestra', { prisma: db, mergeMissionContext });
          const agentContext = { missionContext: missionContextForGoals, emitContextUpdate: emitContextUpdateForGoals };

          const failDraftNotReadyInWorker = async (waitedDraft, hasItems = false) => {
            await transitionOrchestratorTaskStatus({
              prisma,
              taskId: jobId,
              toStatus: 'failed',
              fromStatus: 'running',
              actorType: 'automation',
              correlationId: runIdForWait || generationRunId,
              reason: 'JOB_RUN',
              result: {
                ok: false,
                error: 'draft_not_ready',
                generationRunId,
                status: waitedDraft?.status ?? null,
                hasItems,
              },
            }).catch(() => {});
          };

          const runWithWait = async (runWorker) => {
            let d = draft;
            if (d.status !== 'ready' && runIdForWait) {
              d = await waitForDraftReady(runIdForWait, { timeoutMs: 45000, intervalMs: 1000 });
            }
            const preview = (d?.preview && typeof d.preview === 'object') ? d.preview : {};
            const hasItems = Array.isArray(preview.items) && preview.items.length > 0;
            if (d) {
              if (d.status === 'ready') {
                await runWorker(d);
                return;
              }
              // Safety net: allow MI work when preview.items exist even if status isn't ready yet
              if (hasItems) {
                await runWorker(d);
                return;
              }
            }
            await failDraftNotReadyInWorker(d, hasItems);
          };

          if (entryPoint === 'autofill_product_images' || entryPoint === 'fill_missing_images') {
            setImmediate(() => runWithWait((d) => runAutofillImages(d, jobId)));
          } else if (entryPoint === 'repair_product_images') {
            setImmediate(() => runWithWait((d) => runRepairProductImages(d, jobId)));
          } else if (entryPoint === 'generate_tags') {
            setImmediate(() => runWithWait((d) => runGenerateTags(d, jobId, agentContext)));
          } else if (entryPoint === 'rewrite_descriptions') {
            setImmediate(() => runWithWait((d) => runRewriteDescriptions(d, jobId, null, agentContext)));
          } else if (entryPoint === 'generate_store_hero') {
            setImmediate(() => runWithWait((d) => runGenerateHero(d, jobId)));
          } else if (entryPoint === 'set_store_hero_from_item') {
            setImmediate(() => runWithWait((d) => runSetHeroFromItem(d, jobId)));
          } else if (entryPoint === 'mi_command') {
            const rawInput = (request.rawInput ?? request.commandText ?? '').toString().trim();
            const inferred = inferMiCommandIntent(rawInput);
            const inferredGoal = typeof inferred === 'object' && inferred?.goal ? inferred.goal : inferred;
            const rewriteOptions = typeof inferred === 'object' && inferred?.goal === 'rewrite_descriptions' ? inferred.options : undefined;
            if (!inferred || !inferredGoal) {
              await transitionOrchestratorTaskStatus({
                prisma,
                taskId: jobId,
                toStatus: 'completed',
                fromStatus: 'running',
                actorType: 'automation',
                reason: 'JOB_RUN',
                result: {
                  ok: true,
                  inferredGoal: 'mi_command',
                  draftUpdated: false,
                  summary: 'Command not recognized yet',
                },
              }).catch(() => {});
              return res.json({ ok: true, job: toOrchestraJob(updated || task), message: 'Job started' });
            }
            if (inferredGoal === 'set_store_hero_from_item' && !request.itemId) {
              await transitionOrchestratorTaskStatus({
                prisma,
                taskId: jobId,
                toStatus: 'completed',
                fromStatus: 'running',
                actorType: 'automation',
                reason: 'JOB_RUN',
                result: {
                  ok: true,
                  draftUpdated: false,
                  summary: 'Select a product first, then run "use as hero".',
                },
              }).catch(() => {});
              return res.json({ ok: true, job: toOrchestraJob(updated || task), message: 'Job started' });
            }
            setImmediate(() =>
              runWithWait((d) => {
                if (inferredGoal === 'autofill_product_images' || inferredGoal === 'fill_missing_images') return runAutofillImages(d, jobId);
                if (inferredGoal === 'repair_product_images') return runRepairProductImages(d, jobId);
                if (inferredGoal === 'generate_tags') return runGenerateTags(d, jobId, agentContext);
                if (inferredGoal === 'rewrite_descriptions') return runRewriteDescriptions(d, jobId, rewriteOptions, agentContext);
                if (inferredGoal === 'generate_store_hero') return runGenerateHero(d, jobId);
                if (inferredGoal === 'set_store_hero_from_item') return runSetHeroFromItem(d, jobId);
              })
            );
          } else {
            await transitionOrchestratorTaskStatus({
              prisma,
              taskId: jobId,
              toStatus: 'completed',
              fromStatus: 'running',
              actorType: 'automation',
              reason: 'JOB_RUN',
              result: {
                ok: true,
                inferredGoal: entryPoint,
                draftUpdated: false,
                notImplemented: true,
                summary: 'Completed (logic coming soon)',
              },
            }).catch(() => {});
          }
        }
      return res.json({ ok: true, job: toOrchestraJob(updated || task), message: 'Job started' });
    }
    if (String(jobId).startsWith('job_')) {
      return res.json({
        ok: true,
        job: toOrchestraJob({
          id: jobId,
          status: 'running',
          request: req.body || {},
          result: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        message: 'Job acknowledged (mock id)',
      });
    }
    return res.status(404).json({
      ok: false,
      error: { code: 'JOB_NOT_FOUND', message: 'Job not found' },
    });
  } catch (err) {
    console.error('[MI Routes] POST /orchestra/job/:jobId/run error:', err);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: err?.message || 'Failed to run job' },
    });
  }
});

export default router;



