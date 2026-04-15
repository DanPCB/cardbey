/**
 * Planner Runner - Automated Task Execution
 * Polls for due tasks and executes them via action adapters
 */

import { PrismaClient } from '@prisma/client';
import { runAction } from './actions.js';

const prisma = new PrismaClient();

// SSE client connections (for real-time updates)
const sseClients = new Map(); // userId -> res

/**
 * Register SSE client for real-time updates
 */
export function registerSSEClient(userId, res) {
  console.log(`[Planner] SSE client registered: ${userId}`);
  sseClients.set(userId, res);
  
  // Send initial connection event
  sendSSE(userId, {
    type: 'connection.established',
    timestamp: new Date().toISOString()
  });
  
  // Cleanup on disconnect
  res.on('close', () => {
    console.log(`[Planner] SSE client disconnected: ${userId}`);
    sseClients.delete(userId);
  });
}

/**
 * Send SSE event to user
 */
function sendSSE(userId, data) {
  const client = sseClients.get(userId);
  if (client) {
    try {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error(`[Planner] SSE send error for ${userId}:`, error.message);
      sseClients.delete(userId);
    }
  }
}

/**
 * Execute a planner task
 */
async function executeTask(task) {
  console.log(`[Planner] Executing task ${task.id} for step ${task.stepId}`);
  
  try {
    // Update task status to running
    await prisma.plannerTask.update({
      where: { id: task.id },
      data: { status: 'running' }
    });
    
    // Get the step
    const step = await prisma.journeyStep.findUnique({
      where: { id: task.stepId },
      include: { instance: true }
    });
    
    if (!step) {
      throw new Error('Step not found');
    }
    
    // Update step to RUNNING
    await prisma.journeyStep.update({
      where: { id: task.stepId },
      data: {
        status: 'RUNNING',
        startedAt: new Date()
      }
    });
    
    // Emit SSE: step started
    sendSSE(task.userId, {
      type: 'journey.step.started',
      journeyId: task.journeyId,
      stepId: task.stepId,
      timestamp: new Date().toISOString()
    });
    
    // Parse params
    const params = step.paramsJson ? JSON.parse(step.paramsJson) : {};
    
    // Execute action
    const result = await runAction(step.action, task.userId, params);
    
    // Update step with result
    await prisma.journeyStep.update({
      where: { id: task.stepId },
      data: {
        status: result.success ? 'DONE' : 'FAILED',
        resultJson: JSON.stringify(result),
        finishedAt: new Date()
      }
    });
    
    // Update task
    await prisma.plannerTask.update({
      where: { id: task.id },
      data: {
        status: result.success ? 'done' : 'failed',
        lastError: result.success ? null : result.error
      }
    });
    
    // Emit SSE: step completed
    sendSSE(task.userId, {
      type: result.success ? 'journey.step.completed' : 'journey.step.failed',
      journeyId: task.journeyId,
      stepId: task.stepId,
      result,
      timestamp: new Date().toISOString()
    });
    
    // If successful, activate next step
    if (result.success) {
      const nextStep = await prisma.journeyStep.findFirst({
        where: {
          instanceId: step.instanceId,
          orderIndex: step.orderIndex + 1,
          status: 'PENDING'
        }
      });
      
      if (nextStep) {
        await prisma.journeyStep.update({
          where: { id: nextStep.id },
          data: { status: 'READY' }
        });
        
        sendSSE(task.userId, {
          type: 'journey.step.ready',
          journeyId: task.journeyId,
          stepId: nextStep.id,
          stepTitle: nextStep.stepTemplate?.title,
          timestamp: new Date().toISOString()
        });
      } else {
        // No more steps - mark journey as COMPLETED
        const completedJourney = await prisma.journeyInstance.update({
          where: { id: step.instanceId },
          data: { status: 'COMPLETED' },
          include: { template: true }
        });
        
        // Trigger completion flow (suggestions, analytics)
        const { triggerCompletionSuggestions } = await import('./journey-completion.js');
        const completion = await triggerCompletionSuggestions(completedJourney, task.userId);
        
        sendSSE(task.userId, {
          type: 'journey.completed',
          journeyId: task.journeyId,
          message: completion.message,
          suggestions: completion.suggestions,
          timestamp: new Date().toISOString()
        });
        
        console.log(`[Planner] ✅ Journey ${task.journeyId} COMPLETED with ${completion.suggestions.length} follow-ups!`);
      }
    }
    
    console.log(`[Planner] ✅ Task ${task.id} executed: ${result.success ? 'success' : 'failed'}`);
    
    return result;
    
  } catch (error) {
    console.error(`[Planner] Task execution error:`, error);
    
    // Mark task as failed
    await prisma.plannerTask.update({
      where: { id: task.id },
      data: {
        status: 'failed',
        lastError: error.message
      }
    });
    
    // Emit SSE: error
    sendSSE(task.userId, {
      type: 'journey.step.failed',
      journeyId: task.journeyId,
      stepId: task.stepId,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Main runner loop - polls for due tasks
 */
export async function startPlannerRunner(intervalMs = 60000) {
  console.log(`[Planner] 🚀 Runner started (polling every ${intervalMs / 1000}s)`);
  
  // Initialize global scheduler object for health checks
  if (typeof global !== 'undefined') {
    global.scheduler = {
      running: true,
      startedAt: new Date().toISOString(),
      intervalMs,
      nextRun: new Date(Date.now() + intervalMs).toISOString(),
    };
    console.log('[Planner] ✅ Global scheduler object initialized');
  }
  
  async function pollAndExecute() {
    try {
      // Update next run time
      if (global.scheduler) {
        global.scheduler.nextRun = new Date(Date.now() + intervalMs).toISOString();
        global.scheduler.lastRun = new Date().toISOString();
      }
      
      // Find tasks that are due
      const dueTasks = await prisma.plannerTask.findMany({
        where: {
          status: 'queued',
          runAt: {
            lte: new Date()
          }
        },
        orderBy: { runAt: 'asc' },
        take: 10 // Process max 10 at a time
      });
      
      if (dueTasks.length > 0) {
        console.log(`[Planner] Found ${dueTasks.length} due tasks`);
        
        // Execute tasks in parallel (with concurrency limit)
        const promises = dueTasks.map(task => executeTask(task));
        await Promise.allSettled(promises);
        
        console.log(`[Planner] ✅ Processed ${dueTasks.length} tasks`);
      }
    } catch (error) {
      console.error('[Planner] Poll error:', error);
    }
  }
  
  // Initial poll
  await pollAndExecute();
  
  // Set up interval
  const interval = setInterval(pollAndExecute, intervalMs);
  
  return () => {
    console.log('[Planner] Stopping runner...');
    clearInterval(interval);
    // Mark scheduler as stopped
    if (global.scheduler) {
      global.scheduler.running = false;
    }
  };
}

/**
 * Send notification before step runs (10 min warning)
 */
export async function sendUpcomingNotifications() {
  const in10min = new Date(Date.now() + 10 * 60 * 1000);
  const now = new Date();
  
  const upcomingTasks = await prisma.plannerTask.findMany({
    where: {
      status: 'queued',
      runAt: {
        gte: now,
        lte: in10min
      }
    }
  });
  
  for (const task of upcomingTasks) {
    sendSSE(task.userId, {
      type: 'planner.reminder',
      taskId: task.id,
      journeyId: task.journeyId,
      stepId: task.stepId,
      runAt: task.runAt,
      minutesUntil: Math.round((new Date(task.runAt) - now) / 60000),
      message: '⏰ You have a journey step starting soon',
      timestamp: new Date().toISOString()
    });
  }
  
  if (upcomingTasks.length > 0) {
    console.log(`[Planner] Sent ${upcomingTasks.length} upcoming notifications`);
  }
}

