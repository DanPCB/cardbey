/**
 * Orchestrator Controller
 * Handles HTTP requests for orchestrator API
 */

/**
 * Derive intent from entry point
 * Maps entry point identifiers to orchestrator intents
 * 
 * @param {string} [entryPoint] - Entry point identifier
 * @returns {Object} Orchestrator intent
 */
function deriveIntentFromEntryPoint(entryPoint) {
  const goalMap = {
    loyalty_from_card: 'create_loyalty_program',
    shopfront_signage: 'preview_shopfront_sign',
    menu_from_photo: 'create_menu_from_image',
    campaign_setup: 'setup_campaign',
    promo_from_dashboard: 'create_promo',
  };
  
  const goal = entryPoint && goalMap[entryPoint] ? goalMap[entryPoint] : 'generic_assist';
  
  // Determine category based on goal
  let category = 'other';
  if (goal.includes('loyalty') || goal.includes('campaign') || goal.includes('promo')) {
    category = 'business';
  } else if (goal.includes('menu') || goal.includes('content') || goal.includes('signage')) {
    category = 'content';
  } else if (goal.includes('workflow')) {
    category = 'workflow';
  }
  
  return {
    type: goal,
    confidence: 0.7,
    category,
    parameters: { entryPoint },
  };
}

/**
 * POST /api/orchestrator/run
 * Run orchestrator with provided context
 * 
 * Request body:
 *   - imageUrl?: string (optional)
 *   - text?: string (optional)
 *   - storeId: string (required)
 *   - userId: string (required)
 *   - entryPoint?: string (optional)
 * 
 * Response:
 *   - ok: boolean
 *   - result?: OrchestratorRunResult (includes context, intent, plan, creativeProposals)
 *   - error?: string
 */
export async function runOrchestrator(req, res, next) {
  try {
    const { imageUrl, text, storeId, userId, entryPoint, tenantId, ...rest } = req.body ?? {};
    
    // Validate required fields
    if (!storeId || !userId) {
      res.status(400).json({
        ok: false,
        error: 'BAD_REQUEST',
        message: 'storeId and userId are required',
      });
      return;
    }
    
    // Handle specific entry points with dedicated handlers
    if (entryPoint === 'shopfront_signage') {
      const { handleShopfrontSignage } = await import('../handlers/shopfrontSignageHandler.js');
      const handlerResult = await handleShopfrontSignage(
        {
          tenantId: tenantId || userId, // Fallback to userId if tenantId not provided
          storeId,
          theme: rest.theme,
          filterCategoryIds: rest.filterCategoryIds,
          autoPublish: rest.autoPublish,
          deviceIds: rest.deviceIds,
        },
        {
          services: {
            // Context will be built by tool executor
          },
        }
      );
      
      return res.json({
        ok: handlerResult.ok,
        result: handlerResult,
        error: handlerResult.error,
      });
    }
    
    if (entryPoint === 'promo_from_dashboard') {
      const { handlePromoFromDashboard } = await import('../handlers/promoFromDashboardHandler.js');
      
      if (!rest.promoConfig) {
        return res.status(400).json({
          ok: false,
          error: 'BAD_REQUEST',
          message: 'promoConfig is required for promo_from_dashboard entry point',
        });
      }
      
      const handlerResult = await handlePromoFromDashboard(
        {
          tenantId: tenantId || userId, // Fallback to userId if tenantId not provided
          storeId,
          promoConfig: rest.promoConfig,
          triggerQrCreation: rest.triggerQrCreation !== false,
        },
        {
          services: {
            // Context will be built by tool executor
          },
        }
      );
      
      return res.json({
        ok: handlerResult.ok,
        result: handlerResult,
        error: handlerResult.error,
      });
    }
    
    // Default orchestrator flow for other entry points
    // Import required modules
    const { generateCreativeProposalsForPlan } = await import('../creative/creativeOrchestratorService.js');
    
    // Build OrchestratorContext
    // TODO: Enhance context with better metadata enrichment
    // TODO: Parse vision/text inputs to extract structured data
    const context = {
      userId,
      storeId, // Make storeId required in the context we build
      imageUrl,
      text,
      metadata: {
        extractedData: {}, // TODO: Populate with OCR/vision results
        businessType: undefined, // TODO: Fetch from store profile
        country: undefined, // TODO: Fetch from store profile
      },
      timestamp: new Date(),
    };
    
    // Derive intent from entry point
    // TODO: Implement more robust intent detection (e.g., from text/image analysis)
    const intent = deriveIntentFromEntryPoint(entryPoint);
    
    // Build initial plan (simple stub implementation)
    // TODO: Replace with proper plan building logic from planBuilder
    const plan = {
      id: `plan-${Date.now()}`,
      steps: [],
      metadata: {
        version: '0.1',
        tags: [intent.type, intent.category],
      },
    };
    
    // Generate creative proposals
    // TODO: Consider executing plan steps before generating proposals for better context
    const creativeResponse = await generateCreativeProposalsForPlan(
      context,
      intent,
      plan,
      entryPoint
    );
    
    // Construct result
    const result = {
      context,
      intent,
      plan,
      creativeProposals: creativeResponse.proposals,
    };
    
    res.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error('[Orchestrator] run error', error);
    res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to run orchestrator',
    });
  }
}

