/**
 * Analytics Service
 * Track journey funnel, conversion, and drop-off
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Journey Analytics Events
 */
const ANALYTICS_EVENTS = {
  JOURNEY_PREVIEW: 'journey_preview',
  OAUTH_CLICKED: 'oauth_clicked',
  JOURNEY_STARTED: 'journey_started',
  STEP_STARTED: 'step_started',
  STEP_COMPLETED: 'step_done',
  STEP_FAILED: 'step_failed',
  JOURNEY_COMPLETED: 'journey_completed',
  JOURNEY_ABANDONED: 'journey_abandoned'
};

/**
 * Track analytics event
 */
export async function trackEvent(userId, event, metadata = {}) {
  console.log(`[Analytics] ${userId}: ${event}`, metadata);
  
  // In production, send to analytics platform (Mixpanel, Amplitude, etc.)
  // For now, we'll store in-memory or log
  
  // Could also save to database for later analysis
  // await prisma.analyticsEvent.create({ ... })
  
  return true;
}

/**
 * Get journey funnel metrics for a template
 */
export async function getJourneyFunnel(templateId, since = null) {
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default 30 days
  
  // Count instances by status
  const instances = await prisma.journeyInstance.findMany({
    where: {
      templateId,
      createdAt: { gte: sinceDate }
    },
    include: {
      steps: {
        select: { status: true }
      }
    }
  });
  
  const started = instances.length;
  const completed = instances.filter(i => i.status === 'COMPLETED').length;
  const active = instances.filter(i => i.status === 'ACTIVE').length;
  const abandoned = instances.filter(i => 
    i.status === 'CANCELLED' || 
    (i.status === 'ACTIVE' && new Date() - new Date(i.updatedAt) > 7 * 24 * 60 * 60 * 1000)
  ).length;
  
  // Calculate drop-off by step
  const stepDropOff = {};
  for (const instance of instances) {
    for (let i = 0; i < instance.steps.length; i++) {
      const step = instance.steps[i];
      const stepIndex = `step_${i}`;
      
      if (!stepDropOff[stepIndex]) {
        stepDropOff[stepIndex] = { started: 0, completed: 0, failed: 0 };
      }
      
      if (step.status !== 'PENDING') {
        stepDropOff[stepIndex].started++;
      }
      if (step.status === 'DONE') {
        stepDropOff[stepIndex].completed++;
      }
      if (step.status === 'FAILED') {
        stepDropOff[stepIndex].failed++;
      }
    }
  }
  
  // Calculate conversion rate
  const conversionRate = started > 0 ? (completed / started) * 100 : 0;
  const abandonmentRate = started > 0 ? (abandoned / started) * 100 : 0;
  
  // Average completion time for completed journeys
  let avgCompletionMinutes = 0;
  const completedJourneys = instances.filter(i => i.status === 'COMPLETED');
  if (completedJourneys.length > 0) {
    const totalMinutes = completedJourneys.reduce((sum, j) => {
      const duration = new Date(j.updatedAt) - new Date(j.createdAt);
      return sum + (duration / 60000);
    }, 0);
    avgCompletionMinutes = Math.round(totalMinutes / completedJourneys.length);
  }
  
  return {
    templateId,
    period: {
      since: sinceDate.toISOString(),
      until: new Date().toISOString()
    },
    funnel: {
      started,
      active,
      completed,
      abandoned,
      conversionRate: Math.round(conversionRate * 10) / 10,
      abandonmentRate: Math.round(abandonmentRate * 10) / 10
    },
    performance: {
      avgCompletionMinutes,
      estimatedMinutes: instances[0]?.steps.length * 10 || 0
    },
    stepDropOff
  };
}

/**
 * Get overall journey system metrics
 */
export async function getSystemMetrics(userId = null, since = null) {
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default 7 days
  
  const where = {
    createdAt: { gte: sinceDate },
    ...(userId && { userId })
  };
  
  const totalJourneys = await prisma.journeyInstance.count({ where });
  const completedJourneys = await prisma.journeyInstance.count({
    where: { ...where, status: 'COMPLETED' }
  });
  const activeJourneys = await prisma.journeyInstance.count({
    where: { ...where, status: 'ACTIVE' }
  });
  
  const totalSteps = await prisma.journeyStep.count({
    where: {
      instance: where
    }
  });
  const completedSteps = await prisma.journeyStep.count({
    where: {
      instance: where,
      status: 'DONE'
    }
  });
  
  return {
    period: {
      since: sinceDate.toISOString(),
      until: new Date().toISOString()
    },
    journeys: {
      total: totalJourneys,
      active: activeJourneys,
      completed: completedJourneys,
      completionRate: totalJourneys > 0 ? Math.round((completedJourneys / totalJourneys) * 100) : 0
    },
    steps: {
      total: totalSteps,
      completed: completedSteps,
      completionRate: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
    }
  };
}

/**
 * Record user achievement/milestone
 */
export async function recordMilestone(userId, milestone, metadata = {}) {
  console.log(`[Analytics] 🏆 Milestone for ${userId}: ${milestone}`, metadata);
  
  // Examples of milestones:
  // - first_journey_started
  // - first_journey_completed
  // - first_store_created
  // - first_campaign_published
  // - 10_journeys_completed
  
  // In production, send to analytics + maybe unlock badges/achievements
  
  return true;
}














