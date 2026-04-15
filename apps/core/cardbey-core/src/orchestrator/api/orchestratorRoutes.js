/**
 * Orchestrator Routes
 * Express routes for orchestrator API
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { runOrchestrator } from './orchestratorController.js';
import { runOrchestrator as runUnifiedOrchestrator } from '../index.js';
import { requireAuth } from '../../middleware/auth.js';
import { broadcastSse } from '../../realtime/simpleSse.js';
import {
  addClient,
  removeClient,
  broadcast,
  setupHeartbeat,
} from './sseRegistry.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/orchestrator/run
 * Run orchestrator with provided context (legacy endpoint)
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
 *   - message: string
 *   - plan?: OrchestratorPlan
 *   - result?: unknown
 *   - error?: string
 */
router.post('/run', runOrchestrator);

/**
 * POST /api/orchestrator/task
 * POST /api/orchestrator/task/create
 * POST /api/orchestrator/sam3/task
 * POST /api/orchestrator/sam3/task/create
 * Alternative endpoint names for task creation (for frontend compatibility)
 */
// Task creation handler function
async function handleTaskCreation(req, res) {
  try {
    console.log('[Orchestrator] Task creation request:', {
      method: req.method,
      path: req.path,
      originalUrl: req.originalUrl,
      body: req.body,
    });
    
    const { entryPoint = 'content_studio', mode } = req.body;
    
    // Generate a unique task ID
    const taskId = `sam3-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    // Emit initial progress event
    broadcastSse('admin', 'sam3.design_task.progress', {
      taskId,
      status: 'initialized',
      progress: 0,
      message: 'Task initialized, waiting for processing...',
      mode: mode || 'unknown',
      timestamp: Date.now(),
    });
    
    console.log('[Orchestrator] Task created:', { taskId, entryPoint, mode });
    
    res.json({
      ok: true,
      taskId,
      entryPoint,
    });
  } catch (error) {
    console.error('[Orchestrator] task creation error:', error);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: error.message || 'Failed to create task',
    });
  }
}

// Register multiple route variations for frontend compatibility
// IMPORTANT: These routes must be defined BEFORE /design-task to avoid conflicts
router.post('/task', requireAuth, handleTaskCreation);
router.post('/task/create', requireAuth, handleTaskCreation);
router.post('/sam3/task', requireAuth, handleTaskCreation);
router.post('/sam3/task/create', requireAuth, handleTaskCreation);

/**
 * POST /api/orchestrator/loyalty-from-card
 * Unified endpoint for loyalty from card using AI engines
 * 
 * Request body:
 *   - tenantId: string (required)
 *   - storeId: string (required)
 *   - imageUrl: string (required)
 *   - themePreference?: string (optional)
 * 
 * Response:
 *   - Standardized AI result format (LoyaltyFromCardResult)
 */
router.post('/loyalty-from-card', requireAuth, async (req, res, next) => {
  try {
    const { tenantId, storeId, imageUrl, themePreference } = req.body;
    const resolvedTenantId = tenantId || req.user?.tenantId;
    const resolvedStoreId = storeId || req.user?.business?.id;

    if (!resolvedTenantId || !resolvedStoreId || !imageUrl) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields',
        message: 'tenantId, storeId, and imageUrl are required',
      });
    }

    const result = await runUnifiedOrchestrator('loyalty_from_card', {
      tenantId: resolvedTenantId,
      storeId: resolvedStoreId,
      imageUrl,
      themePreference,
    });

    res.json({ ok: true, result });
  } catch (error) {
    console.error('[Orchestrator] loyalty-from-card error:', error);
    next(error);
  }
});

/**
 * POST /api/orchestrator/menu-from-photo
 * Unified endpoint for menu from photo using AI engines
 * 
 * Request body:
 *   - tenantId: string (required)
 *   - storeId: string (required)
 *   - imageUrl: string (required)
 *   - theme?: string (optional)
 * 
 * Response:
 *   - Standardized AI result format (MenuFromPhotoResult)
 */
router.post('/menu-from-photo', requireAuth, async (req, res, next) => {
  try {
    const { tenantId, storeId, imageUrl, theme } = req.body;
    const resolvedTenantId = tenantId || req.user?.tenantId;
    const resolvedStoreId = storeId || req.user?.business?.id;

    if (!resolvedTenantId || !resolvedStoreId || !imageUrl) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields',
        message: 'tenantId, storeId, and imageUrl are required',
      });
    }

    const result = await runUnifiedOrchestrator('menu_from_photo', {
      tenantId: resolvedTenantId,
      storeId: resolvedStoreId,
      imageUrl,
      theme,
    });

    res.json({ ok: true, result });
  } catch (error) {
    console.error('[Orchestrator] menu-from-photo error:', error);
    next(error);
  }
});

/**
 * POST /api/orchestrator/design-task/create
 * Create a new design task and get taskId for progress tracking
 * This endpoint allows the frontend to get a taskId before making the actual request
 * 
 * Request body:
 *   - entryPoint?: "content_studio" (optional, defaults to "content_studio")
 *   - mode?: string (optional, for validation)
 * 
 * Response:
 *   - ok: boolean
 *   - taskId: string - Task identifier for tracking progress
 */
router.post('/design-task/create', requireAuth, async (req, res) => {
  try {
    const { entryPoint = 'content_studio', mode } = req.body;
    
    // Generate a unique task ID
    const taskId = `sam3-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    // Emit initial progress event
    broadcastSse('admin', 'sam3.design_task.progress', {
      taskId,
      status: 'initialized',
      progress: 0,
      message: 'Task initialized, waiting for processing...',
      mode: mode || 'unknown',
      timestamp: Date.now(),
    });
    
    res.json({
      ok: true,
      taskId,
      entryPoint,
    });
  } catch (error) {
    console.error('[Orchestrator] design-task/create error:', error);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: error.message || 'Failed to create task',
    });
  }
});

/**
 * GET /api/orchestrator/design-task/:taskId
 * Get task status by taskId
 * 
 * Response:
 *   - ok: boolean
 *   - taskId: string
 *   - status?: string - Task status if available
 */
router.get('/design-task/:taskId', requireAuth, async (req, res) => {
  try {
    const { taskId } = req.params;
    
    // For now, just return the taskId
    // In the future, this could query a task store/database
    res.json({
      ok: true,
      taskId,
      message: 'Task exists (status tracking not yet implemented)',
    });
  } catch (error) {
    console.error('[Orchestrator] design-task/:taskId error:', error);
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: error.message || 'Failed to get task status',
    });
  }
});

/**
 * POST /api/orchestrator/design-task
 * SAM-3 Design Task endpoint for Content Studio
 * Processes canvas state and user prompts to generate design improvements
 * 
 * Request body:
 *   - entryPoint: "content_studio" (required)
 *   - mode: "new_banner" | "improve_layout" | "fix_copy" | "video_storyboard" (required)
 *   - target: "image" | "layout" | "video" (required)
 *   - canvasState?: unknown - Current canvas JSON state (optional)
 *   - selection?: unknown - Selected element(s) (optional)
 *   - userPrompt: string - User's design request (required)
 *   - taskId?: string - Optional taskId (if not provided, one will be generated)
 * 
 * Response:
 *   - ok: boolean
 *   - taskId: string - Task identifier for tracking
 *   - result: {
 *       updatedCanvas?: unknown - New canvas state or patch
 *       reviewNotes?: string[] - Review notes and suggestions
 *       videoStoryboard?: unknown - Video storyboard (only when target === "video")
 *     }
 *   - error?: string - Error message if ok === false
 */
router.post('/design-task', requireAuth, async (req, res, next) => {
  try {
    const { entryPoint, mode, target, canvasState, selection, userPrompt, imageUrl, imageBuffer, taskId } = req.body;

    // Validate required fields
    if (entryPoint !== 'content_studio') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid entryPoint',
        message: 'entryPoint must be "content_studio"',
      });
    }

    if (!mode || !['new_banner', 'improve_layout', 'fix_copy', 'video_storyboard', 'product_cutout'].includes(mode)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid mode',
        message: 'mode must be one of: new_banner, improve_layout, fix_copy, video_storyboard, product_cutout',
      });
    }

    if (!target || !['image', 'layout', 'video'].includes(target)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid target',
        message: 'target must be one of: image, layout, video',
      });
    }

    // userPrompt is optional for product_cutout mode
    if (mode !== 'product_cutout' && (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0)) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required field',
        message: 'userPrompt is required and must be a non-empty string',
      });
    }

    // Log request details for debugging
    console.log('[Orchestrator] Design task request', {
      mode,
      target,
      hasCanvasState: !!canvasState,
      hasSelection: !!selection,
      hasImageUrl: !!imageUrl,
      hasImageBuffer: !!imageBuffer,
      hasCanvasPngBuffer: !!req.body.canvasPngBuffer,
      promptPreview: userPrompt?.substring(0, 50),
      canvasStateKeys: canvasState ? Object.keys(canvasState).slice(0, 10) : [],
      selectionType: selection ? (Array.isArray(selection) ? 'array' : typeof selection) : 'null',
    });
    
    // Call unified orchestrator
    const result = await runUnifiedOrchestrator('content_studio', {
      entryPoint: 'content_studio',
      mode,
      target,
      canvasState,
      selection,
      userPrompt: userPrompt?.trim() || '',
      imageUrl,
      imageBuffer: imageBuffer ? Buffer.from(imageBuffer, 'base64') : undefined,
      canvasPngBuffer: req.body.canvasPngBuffer ? Buffer.from(req.body.canvasPngBuffer, 'base64') : undefined,
      taskId: taskId || undefined, // Pass taskId if provided by frontend
    });

    // Return standardized response
    if (result.ok === false) {
      return res.status(500).json({
        ok: false,
        error: result.error || 'Design task failed',
        message: result.message || 'Failed to process design task',
      });
    }

    res.json({
      ok: true,
      taskId: result.taskId,
      result: result.result,
    });
  } catch (error) {
    console.error('[Orchestrator] design-task error:', error);
    
    // Return error response
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: error.message || 'Failed to process design task',
    });
  }
});

// Debug route to catch any unmatched task-related requests
router.use('/task*', (req, res, next) => {
  console.log('[Orchestrator] Unmatched task route:', req.method, req.originalUrl, req.path);
  next();
});

/**
 * POST /api/orchestrator/sam3/menu-photo-extract
 * Extract individual dish photos from a menu image using SAM-3
 * 
 * Request body:
 *   - storeId: string (required) - Store/Business ID
 *   - sourceAssetId: string (required) - Media asset ID of the menu photo
 *   - options?: { enhance?: boolean } - Optional enhancement flag
 * 
 * Response:
 *   - ok: boolean
 *   - taskId: string
 *   - storeId: string
 *   - sourceAssetId: string
 *   - candidates: Array<{
 *       id: string,
 *       cropAssetId: string,
 *       previewUrl: string,
 *       nameGuess: string,
 *       priceGuess: number | null,
 *       confidence: number,
 *       box: { x, y, width, height }
 *     }>
 */
router.post('/sam3/menu-photo-extract', requireAuth, async (req, res, next) => {
  try {
    const { storeId, sourceAssetId, options = {} } = req.body;
    
    // Validate required fields
    if (!storeId || !sourceAssetId) {
      return res.status(400).json({
        ok: false,
        error: 'missing_required_fields',
        message: 'storeId and sourceAssetId are required',
      });
    }
    
    // Import service dynamically
    const { runMenuPhotoExtract } = await import('../services/menuPhotoExtractService.js');
    
    // Run extraction
    const result = await runMenuPhotoExtract(
      { storeId, sourceAssetId, options },
      req
    );
    
    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error('[Orchestrator] menu-photo-extract error:', error);
    res.status(500).json({
      ok: false,
      error: 'extraction_failed',
      message: error.message || 'Failed to extract menu photos',
    });
  }
});

// Note: menu-photo-extract route must be before this catch-all
router.use('/sam3*', (req, res, next) => {
  console.log('[Orchestrator] Unmatched sam3 route:', req.method, req.originalUrl, req.path);
  next();
});

/**
 * POST /api/orchestrator/insights/execute
 * Execute AI button action from insights, reports, or PDFs
 * 
 * Request body:
 *   {
 *     entryPoint: string,  // e.g. "device_health_check", "campaign_strategy_review"
 *     payload: any,         // Entry point specific payload
 *     context: {            // Shared metadata
 *       tenantId: string,
 *       userId: string,
 *       source: "insight_card" | "report" | "pdf_preview",
 *       insightId?: string,
 *       locale?: string
 *     }
 *   }
 * 
 * Response:
 *   {
 *     ok: boolean,
 *     taskId: string,
 *     status: "queued" | "running" | "completed" | "failed",
 *     message?: string
 *   }
 */
router.post('/insights/execute', requireAuth, async (req, res, next) => {
  try {
    const { entryPoint, payload, context: contextInput, useRag, runOptions: runOptionsBody } = req.body;

    // Validate required fields
    if (!entryPoint || !payload) {
      return res.status(400).json({
        ok: false,
        error: 'missing_fields',
        message: 'entryPoint and payload are required',
      });
    }

    // Get tenantId and userId from authenticated user if not provided in context
    const userId = contextInput?.userId || req.userId || req.user?.id;
    let tenantId = contextInput?.tenantId;
    
    // If tenantId not in context, try to get it from user
    if (!tenantId) {
      // Try to get tenantId from user's business
      if (req.user?.business?.id) {
        tenantId = req.user.business.id;
      } else if (req.userId) {
        // Fallback: use userId as tenantId (for dev/admin scenarios)
        tenantId = req.userId;
      }
    }

    // Build context object with tenantId and userId populated
    const context = {
      ...contextInput,
      tenantId: tenantId || contextInput?.tenantId,
      userId: userId || contextInput?.userId,
      source: contextInput?.source || 'report',
    };

    // Validate that we have both tenantId and userId
    if (!context.tenantId || !context.userId) {
      return res.status(400).json({
        ok: false,
        error: 'missing_context',
        message: 'context.tenantId and context.userId are required. Unable to determine from authenticated user.',
      });
    }

    // Validate entry point
    const { VALID_ENTRY_POINTS } = await import('./insightsOrchestrator.js');
    if (!VALID_ENTRY_POINTS.includes(entryPoint)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_entry_point',
        message: `Invalid entryPoint. Must be one of: ${VALID_ENTRY_POINTS.join(', ')}`,
      });
    }

    const runOptions = typeof runOptionsBody === 'object' && runOptionsBody !== null
      ? { useRag: runOptionsBody.useRag }
      : typeof useRag === 'boolean'
        ? { useRag }
        : {};

    // Create task record
    const task = await prisma.orchestratorTask.create({
      data: {
        entryPoint,
        tenantId: context.tenantId,
        userId: context.userId,
        insightId: context.insightId || null,
        status: 'queued',
        request: {
          entryPoint,
          payload,
          context,
          ...(typeof runOptions.useRag === 'boolean' && { useRag: runOptions.useRag }),
        },
      },
    });

    console.log(`[Orchestrator] Task created: ${task.id} (${entryPoint})`);

    // Broadcast queued status
    broadcast(context.tenantId, {
      taskId: task.id,
      status: 'queued',
      updatedAt: task.createdAt.toISOString(),
    });

    // Execute task asynchronously (pass taskId as missionId for agent messages). toolSteps array records each callTool for result.toolSteps.
    const contextWithTask = { ...context, taskId: task.id, toolSteps: [] };
    const { executeTask } = await import('./insightsOrchestrator.js');
    
    // Update status to running
    await prisma.orchestratorTask.update({
      where: { id: task.id },
      data: { status: 'running' },
    });

    // Broadcast running status
    broadcast(context.tenantId, {
      taskId: task.id,
      status: 'running',
      updatedAt: new Date().toISOString(),
    });

    // Execute task (non-blocking for response, but we'll wait for initial result)
    executeTask(entryPoint, payload, contextWithTask, runOptions)
      .then(async (result) => {
        // Merge toolSteps from context into result, then ensure serializable
        const resultWithSteps =
          typeof result === 'object' && result !== null
            ? { ...result, toolSteps: contextWithTask.toolSteps ?? [] }
            : { toolSteps: contextWithTask.toolSteps ?? [] };
        const serializableResult =
          typeof resultWithSteps === 'object' && resultWithSteps !== null
            ? JSON.parse(JSON.stringify(resultWithSteps))
            : resultWithSteps;

        const updatedTask = await prisma.orchestratorTask.update({
          where: { id: task.id },
          data: {
            status: 'completed',
            result: serializableResult,
          },
        });
        console.log(`[Orchestrator] Task completed: ${task.id}`);

        // Compute and save reward (non-blocking; never fail the run)
        const { computeAndSaveReward } = await import('../orchestratorRewardService.js');
        computeAndSaveReward({
          orchestratorTaskId: task.id,
          missionId: task.request?.payload?.missionId ?? task.request?.missionId ?? task.id,
          tenantId: context.tenantId,
          result: serializableResult,
          missionType: entryPoint,
        }).catch((err) => console.warn('[Orchestrator] Reward computation failed:', err?.message || err));

        // Broadcast completed status
        broadcast(context.tenantId, {
          taskId: task.id,
          status: 'completed',
          updatedAt: updatedTask.updatedAt.toISOString(),
          result: serializableResult,
        });
      })
      .catch(async (error) => {
        console.error(`[Orchestrator] Task failed: ${task.id}`, error);
        
        // Ensure error message is safe for JSON
        const errorMessage = error instanceof Error 
          ? error.message 
          : String(error);
        
        const errorResult = {
          ok: false,
          error: error.name || 'task_execution_failed',
          message: errorMessage,
        };

        const updatedTask = await prisma.orchestratorTask.update({
          where: { id: task.id },
          data: {
            status: 'failed',
            result: errorResult,
          },
        });

        // Broadcast failed status
        broadcast(context.tenantId, {
          taskId: task.id,
          status: 'failed',
          updatedAt: updatedTask.updatedAt.toISOString(),
          result: errorResult,
        });
      });

    // Return immediate response
    res.json({
      ok: true,
      taskId: task.id,
      status: 'queued',
      message: `Task queued: ${entryPoint}`,
    });
  } catch (error) {
    console.error('[Orchestrator] insights/execute error:', error);
    
    // Return error response instead of calling next() to avoid unhandled errors
    res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: error.message || 'Failed to execute task',
    });
  }
});

/**
 * GET /api/orchestrator/insights/task/:taskId
 * Get task status and result
 * 
 * Response:
 *   {
 *     ok: boolean,
 *     task: {
 *       id: string,
 *       entryPoint: string,
 *       status: "queued" | "running" | "completed" | "failed",
 *       result?: any,
 *       createdAt: string,
 *       updatedAt: string
 *     }
 *   }
 */
router.get('/insights/task/:taskId', requireAuth, async (req, res, next) => {
  try {
    const { taskId } = req.params;
    
    // Get tenantId for authorization
    const tenantId = req.userId || req.user?.tenantId;
    
    if (!tenantId) {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized',
        message: 'Unable to determine tenantId',
      });
    }

    const task = await prisma.orchestratorTask.findFirst({
      where: {
        id: taskId,
        tenantId, // Ensure user can only access their own tasks
      },
    });

    if (!task) {
      return res.status(404).json({
        ok: false,
        error: 'not_found',
        message: 'Task not found',
      });
    }

    res.json({
      ok: true,
      task: {
        id: task.id,
        entryPoint: task.entryPoint,
        status: task.status,
        result: task.result,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
    });
  } catch (error) {
    console.error('[Orchestrator] insights/task/:taskId error:', error);
    next(error);
  }
});

/**
 * GET /api/orchestrator/insights/stream
 * SSE endpoint for real-time task status updates
 * 
 * Query parameters:
 *   - tenantId: string (required) - Tenant ID to receive updates for
 * 
 * Events sent:
 *   - task_update: { taskId, status, updatedAt, result? }
 *   - ping: "ok" (heartbeat every 25 seconds)
 * 
 * Example client usage:
 *   const evtSource = new EventSource('/api/orchestrator/insights/stream?tenantId=t_123');
 *   evtSource.addEventListener('task_update', (event) => {
 *     const data = JSON.parse(event.data);
 *     console.log('Task update:', data);
 *   });
 */
router.get('/insights/stream', requireAuth, async (req, res) => {
  try {
    // Get tenantId from query param or user context
    const queryTenantId = req.query.tenantId;
    const userTenantId = req.userId || req.user?.tenantId;

    if (!queryTenantId && !userTenantId) {
      return res.status(400).json({
        ok: false,
        error: 'missing_tenant_id',
        message: 'tenantId is required (query param or user context)',
      });
    }

    const tenantId = String(queryTenantId || userTenantId);

    // Verify tenant access (user can only stream their own tenant's tasks)
    if (queryTenantId && userTenantId && queryTenantId !== userTenantId) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'Cannot stream tasks for a different tenant',
      });
    }

    const origin = req.headers.origin || '*';

    // Set SSE headers
    res.status(200);
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'false');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Configure socket for long-lived connection
    if (req.socket) {
      req.socket.setKeepAlive(true);
      req.socket.setTimeout(0);
    }

    // Flush headers immediately
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    } else if (typeof res.flush === 'function') {
      res.flush();
    }

    // Send initial connection message
    try {
      res.write(`: connected ${Date.now()}\n\n`);
      if (typeof res.flush === 'function') {
        res.flush();
      }
    } catch (error) {
      console.error('[OrchestratorSSE] Error writing initial message:', error);
      return;
    }

    // Register client
    addClient(tenantId, res);

    // Set up heartbeat
    setupHeartbeat(tenantId, res, 25000);

    // Cleanup function
    let cleanupCalled = false;
    const cleanup = (reason) => {
      if (cleanupCalled) {
        return;
      }
      cleanupCalled = true;

      console.log(`[OrchestratorSSE] Client disconnected (tenant: ${tenantId}, reason: ${reason})`);

      removeClient(tenantId, res);
    };

    // Handle connection close
    req.once('close', () => cleanup('req.close'));
    req.once('aborted', () => cleanup('req.aborted'));
    res.once('close', () => cleanup('res.close'));

    // Error handlers
    req.on('error', (err) => {
      if (!cleanupCalled) {
        console.warn('[OrchestratorSSE] Request error:', err.message);
      }
    });

    res.on('error', (err) => {
      if (!cleanupCalled) {
        console.warn('[OrchestratorSSE] Response error:', err.message);
      }
    });

    console.log(`[OrchestratorSSE] Stream opened for tenant: ${tenantId}`);
  } catch (error) {
    console.error('[OrchestratorSSE] Stream setup error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: 'stream_setup_failed',
        message: error.message,
      });
    }
  }
});

export default router;


