/**
 * Journeys API Routes
 * Templates, instances, steps, planner, and suggestions
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { requireUserOrGuest, requireUser } from '../middleware/guestAuth.js';
import { buildSuggestions } from '../services/suggestions.js';
import { runAction } from '../services/actions.js';
import { trackEvent, recordMilestone, getJourneyFunnel, getSystemMetrics } from '../services/analytics.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/journeys/templates
 * List all journey templates (public)
 */
router.get('/templates', async (req, res, next) => {
  try {
    const { category } = req.query;
    
    const where = category ? { category } : {};
    
    const templates = await prisma.journeyTemplate.findMany({
      where,
      include: {
        steps: {
          orderBy: { orderIndex: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Parse JSON strings for frontend
    const formatted = templates.map(t => ({
      ...t,
      tags: JSON.parse(t.tags || '[]'),
      steps: t.steps.map(s => ({
        ...s,
        paramsJson: s.paramsJson ? JSON.parse(s.paramsJson) : null
      }))
    }));
    
    console.log(`[Journeys] Listed ${formatted.length} templates`);
    
    res.json({ templates: formatted });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/journeys/templates/:slug
 * Get single template by slug (public)
 */
router.get('/templates/:slug', async (req, res, next) => {
  try {
    const template = await prisma.journeyTemplate.findUnique({
      where: { slug: req.params.slug },
      include: {
        steps: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const formatted = {
      ...template,
      tags: JSON.parse(template.tags || '[]'),
      steps: template.steps.map(s => ({
        ...s,
        paramsJson: s.paramsJson ? JSON.parse(s.paramsJson) : null
      }))
    };
    
    res.json(formatted);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/journeys/start
 * Start a new journey instance (requires auth)
 */
router.post('/start', requireUser, async (req, res, next) => {
  try {
    const { templateId, title, overrides = {} } = req.body;
    
    if (!templateId) {
      return res.status(400).json({ error: 'templateId is required' });
    }
    
    // Get template with steps
    const template = await prisma.journeyTemplate.findUnique({
      where: { id: templateId },
      include: {
        steps: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Create instance
    const instance = await prisma.journeyInstance.create({
      data: {
        userId: req.userId,
        templateId,
        title: title || template.title,
        status: 'ACTIVE',
        steps: {
          create: template.steps.map(stepTemplate => {
            const params = stepTemplate.paramsJson ? JSON.parse(stepTemplate.paramsJson) : {};
            const overrideParams = overrides[stepTemplate.id] || {};
            
            return {
              stepTemplateId: stepTemplate.id,
              orderIndex: stepTemplate.orderIndex,
              status: stepTemplate.orderIndex === 0 ? 'READY' : 'PENDING',
              kind: stepTemplate.kind,
              action: stepTemplate.action,
              paramsJson: JSON.stringify({ ...params, ...overrideParams })
            };
          })
        }
      },
      include: {
        steps: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    });
    
    // Track analytics: journey started
    await trackEvent(req.userId, 'journey_started', {
      templateId,
      instanceId: instance.id,
      title: instance.title
    });
    
    // Check for first journey milestone
    const journeyCount = await prisma.journeyInstance.count({
      where: { userId: req.userId }
    });
    
    if (journeyCount === 1) {
      await recordMilestone(req.userId, 'first_journey_started', {
        templateId,
        title: instance.title
      });
    }
    
    console.log(`[Journeys] Started instance ${instance.id} for user ${req.userId}`);
    
    res.json({
      instance: {
        ...instance,
        steps: instance.steps.map(s => ({
          ...s,
          paramsJson: s.paramsJson ? JSON.parse(s.paramsJson) : null,
          resultJson: s.resultJson ? JSON.parse(s.resultJson) : null
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/journeys/instances/:id
 * Get journey instance status
 */
router.get('/instances/:id', requireUserOrGuest, async (req, res, next) => {
  try {
    const instance = await prisma.journeyInstance.findUnique({
      where: { id: req.params.id },
      include: {
        template: true,
        steps: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    });
    
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    // Check ownership (guests can't view instances)
    if (req.isGuest || instance.userId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    const formatted = {
      ...instance,
      steps: instance.steps.map(s => ({
        ...s,
        paramsJson: s.paramsJson ? JSON.parse(s.paramsJson) : null,
        resultJson: s.resultJson ? JSON.parse(s.resultJson) : null
      }))
    };
    
    res.json(formatted);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/journeys/instances
 * List user's journey instances
 */
router.get('/instances', requireUser, async (req, res, next) => {
  try {
    const { status } = req.query;
    
    const where = {
      userId: req.userId,
      ...(status && { status: status.toUpperCase() })
    };
    
    const instances = await prisma.journeyInstance.findMany({
      where,
      include: {
        template: true,
        steps: {
          orderBy: { orderIndex: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    const formatted = instances.map(instance => ({
      ...instance,
      steps: instance.steps.map(s => ({
        ...s,
        paramsJson: s.paramsJson ? JSON.parse(s.paramsJson) : null,
        resultJson: s.resultJson ? JSON.parse(s.resultJson) : null
      }))
    }));
    
    res.json({ instances: formatted });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/journeys/instances/:id
 * Update instance status (pause, resume, cancel)
 */
router.patch('/instances/:id', requireUser, async (req, res, next) => {
  try {
    const { status } = req.body;
    
    if (!status || !['ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const instance = await prisma.journeyInstance.findUnique({
      where: { id: req.params.id }
    });
    
    if (!instance || instance.userId !== req.userId) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const updated = await prisma.journeyInstance.update({
      where: { id: req.params.id },
      data: { status }
    });
    
    console.log(`[Journeys] Instance ${updated.id} status: ${updated.status}`);
    
    res.json({ instance: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/journeys/instances/:id/steps/:stepId/action
 * Execute or schedule a step action
 */
router.post('/instances/:instanceId/steps/:stepId/action', requireUser, async (req, res, next) => {
  try {
    const { actionParams, when } = req.body;
    const { instanceId, stepId } = req.params;
    
    // Get step and verify ownership
    const step = await prisma.journeyStep.findUnique({
      where: { id: stepId },
      include: {
        instance: true,
        stepTemplate: true
      }
    });
    
    if (!step || step.instance.userId !== req.userId) {
      return res.status(404).json({ error: 'Step not found' });
    }
    
    if (step.status !== 'READY' && step.status !== 'FAILED') {
      return res.status(400).json({ error: 'Step not ready for execution' });
    }
    
    // If scheduled for later, create planner task
    if (when) {
      const runAt = new Date(when);
      
      if (runAt <= new Date()) {
        return res.status(400).json({ error: 'Schedule time must be in the future' });
      }
      
      const task = await prisma.plannerTask.create({
        data: {
          userId: req.userId,
          journeyId: instanceId,
          stepId,
          runAt,
          status: 'queued'
        }
      });
      
      // Update step status
      await prisma.journeyStep.update({
        where: { id: stepId },
        data: {
          status: 'PENDING',
          scheduledAt: runAt,
          paramsJson: JSON.stringify(actionParams || {})
        }
      });
      
      console.log(`[Journeys] Scheduled step ${stepId} for ${runAt}`);
      
      return res.json({
        scheduled: true,
        task,
        message: `Step scheduled for ${runAt.toLocaleString()}`
      });
    }
    
    // Execute immediately
    console.log(`[Journeys] Executing step ${stepId} (${step.action})`);
    
    // Update to RUNNING
    await prisma.journeyStep.update({
      where: { id: stepId },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        paramsJson: JSON.stringify(actionParams || {})
      }
    });
    
    // Execute action (will implement action adapters next)
    const result = await executeStepAction(step.action, req.userId, actionParams || {});
    
    // Update to DONE
    const updated = await prisma.journeyStep.update({
      where: { id: stepId },
      data: {
        status: result.success ? 'DONE' : 'FAILED',
        finishedAt: new Date(),
        resultJson: JSON.stringify(result)
      }
    });
    
    // Track analytics: step completed
    await trackEvent(req.userId, result.success ? 'step_done' : 'step_failed', {
      instanceId,
      stepId,
      action: step.action,
      success: result.success
    });
    
    // Activate next step if current succeeded
    if (result.success) {
      const nextStep = await prisma.journeyStep.findFirst({
        where: {
          instanceId,
          orderIndex: step.orderIndex + 1,
          status: 'PENDING'
        }
      });
      
      if (nextStep) {
        await prisma.journeyStep.update({
          where: { id: nextStep.id },
          data: { status: 'READY' }
        });
      } else {
        // No more steps - journey is complete!
        const completedJourney = await prisma.journeyInstance.update({
          where: { id: instanceId },
          data: { status: 'COMPLETED' },
          include: { template: true }
        });
        
        // Trigger completion flow
        const { triggerCompletionSuggestions } = await import('../services/journey-completion.js');
        const completion = await triggerCompletionSuggestions(completedJourney, req.userId);
        
        // Track analytics: journey completed
        await trackEvent(req.userId, 'journey_completed', {
          instanceId,
          templateId: completedJourney.templateId,
          completionTime: new Date() - new Date(completedJourney.createdAt)
        });
        
        // Check for milestones
        const completedCount = await prisma.journeyInstance.count({
          where: { userId: req.userId, status: 'COMPLETED' }
        });
        
        if (completedCount === 1) {
          await recordMilestone(req.userId, 'first_journey_completed');
        } else if (completedCount === 10) {
          await recordMilestone(req.userId, '10_journeys_completed');
        }
        
        // Return completion message + suggestions
        return res.json({
          step: { ...updated, resultJson: result },
          message: completion.message,
          journeyCompleted: true,
          suggestions: completion.suggestions
        });
      }
    }
    
    res.json({
      step: {
        ...updated,
        resultJson: result
      },
      message: result.success ? 'Step completed' : 'Step failed'
    });
  } catch (error) {
    console.error('[Journeys] Step action error:', error);
    next(error);
  }
});

/**
 * GET /api/journeys/planner
 * List user's scheduled tasks
 */
router.get('/planner', requireUser, async (req, res, next) => {
  try {
    const { status = 'queued' } = req.query;
    
    const tasks = await prisma.plannerTask.findMany({
      where: {
        userId: req.userId,
        status
      },
      orderBy: { runAt: 'asc' }
    });
    
    res.json({ tasks });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/journeys/suggestions
 * Get context-aware journey suggestions (PUBLIC - no auth required)
 */
router.get('/suggestions', async (req, res, next) => {
  try {
    // Extract context from header (set by frontend)
    let context = { mode: 'home' };
    try {
      const ctxHeader = req.headers['x-cardbey-context'];
      if (ctxHeader) {
        context = JSON.parse(ctxHeader);
      }
    } catch (e) {
      console.warn('[Journeys] Failed to parse context:', e.message);
    }
    
    // Try to get user if authenticated (optional)
    let user = null;
    try {
      // Check cookie token
      const cookieToken = req.cookies?.cardbey_auth_token;
      if (cookieToken) {
        const decoded = jwt.verify(cookieToken, process.env.JWT_SECRET || 'change-me-in-production');
        user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { id: true, hasBusiness: true, email: true }
        });
      }
    } catch (e) {
      // No auth is fine for suggestions
    }
    
    const suggestions = await buildSuggestions({
      user,
      mode: context.mode || 'home'
    });
    
    console.log(`[Journeys] Returning ${suggestions.length} suggestions for ${user?.email || 'anonymous'}`);
    
    res.json({ suggestions });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/journeys/analytics/funnel/:templateId
 * Get funnel metrics for a specific template
 */
router.get('/analytics/funnel/:templateId', requireUser, async (req, res, next) => {
  try {
    const { since } = req.query;
    const funnel = await getJourneyFunnel(req.params.templateId, since);
    
    res.json({ funnel });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/journeys/analytics/metrics
 * Get overall system metrics for user
 */
router.get('/analytics/metrics', requireUser, async (req, res, next) => {
  try {
    const { since } = req.query;
    const metrics = await getSystemMetrics(req.userId, since);
    
    res.json({ metrics });
  } catch (error) {
    next(error);
  }
});

/**
 * Execute step action using action adapters
 */
async function executeStepAction(action, userId, params) {
  return await runAction(action, userId, params);
}

export default router;

