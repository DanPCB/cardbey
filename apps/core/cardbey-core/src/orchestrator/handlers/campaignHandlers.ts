/**
 * Campaign Orchestrator Handlers
 * 
 * Handles campaign-related insight actions:
 * - Campaign strategy reviews
 * - Screen distribution optimization
 * - Campaign targeting planning
 * - A/B test suggestions
 * - Campaign review scheduling
 */

import { PrismaClient } from '@prisma/client';
import { OrchestratorContext } from '../insightTypes.js';
import {
  CampaignStrategyReviewPayload,
  ScreenDistributionOptimizerPayload,
  CampaignTargetingPlannerPayload,
  CampaignAbSuggesterPayload,
  CampaignReviewSchedulerPayload,
} from '../insightTypes.js';
import { ActivityEventType } from '../../services/activityEventService.js';

const prisma = new PrismaClient();

/**
 * Handle campaign strategy review
 * 
 * Analyzes past campaigns and returns insights
 */
export async function handleCampaignStrategyReview(
  payload: CampaignStrategyReviewPayload,
  context: OrchestratorContext
) {
  try {
    const { tenantId, lookbackDays = 30, limit = 10 } = payload;

    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

    // Query campaigns created in the lookback period
    // Note: Campaign model doesn't have tenantId, so we'll query all and filter by workflow if needed
    const campaigns = await prisma.campaign.findMany({
      where: {
        createdAt: { gte: lookbackDate },
      },
      take: limit * 2, // Get more to filter by tenant later
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        data: true,
        workflow: {
          select: {
            id: true,
            tenantId: true,
          },
        },
      },
    });

    // Filter by tenantId through workflow (if workflow exists)
    const tenantCampaigns = campaigns.filter((c) => {
      if (!c.workflow) return false;
      return c.workflow.tenantId === tenantId;
    }).slice(0, limit);

    // Query activity events for campaign performance
    const campaignEvents = await prisma.activityEvent.findMany({
      where: {
        tenantId,
        occurredAt: { gte: lookbackDate },
        type: {
          in: [ActivityEventType.PLAYLIST_ASSIGNED, 'campaign_impression', 'campaign_click'],
        },
      },
      select: {
        id: true,
        type: true,
        occurredAt: true,
        payload: true,
      },
    });

    // Analyze campaign performance
    const campaignPerformance = new Map<string, {
      campaignId: string;
      title: string;
      status: string;
      eventCount: number;
      lastActivity: Date | null;
    }>();

    for (const campaign of tenantCampaigns) {
      const events = campaignEvents.filter((e) => {
        const payload = e.payload as any;
        return payload?.campaignId === campaign.id || payload?.campaign?.id === campaign.id;
      });

      campaignPerformance.set(campaign.id, {
        campaignId: campaign.id,
        title: campaign.title,
        status: campaign.status,
        eventCount: events.length,
        lastActivity: events.length > 0
          ? events.reduce((latest, e) => (e.occurredAt > latest ? e.occurredAt : latest), events[0].occurredAt)
          : null,
      });
    }

    const performanceArray = Array.from(campaignPerformance.values());
    const sortedByPerformance = [...performanceArray].sort((a, b) => b.eventCount - a.eventCount);

    const bestPerformers = sortedByPerformance.slice(0, 3);
    const poorPerformers = sortedByPerformance.slice(-3).reverse();

    // Generate insights
    const insights = {
      totalCampaigns: tenantCampaigns.length,
      activeCampaigns: tenantCampaigns.filter((c) => c.status === 'RUNNING').length,
      bestPerformers: bestPerformers.map((p) => ({
        campaignId: p.campaignId,
        title: p.title,
        eventCount: p.eventCount,
      })),
      poorPerformers: poorPerformers.map((p) => ({
        campaignId: p.campaignId,
        title: p.title,
        eventCount: p.eventCount,
      })),
    };

    // Generate recommended next steps
    const recommendedActions: string[] = [];
    if (poorPerformers.length > 0 && poorPerformers[0].eventCount === 0) {
      recommendedActions.push('Pause or optimize campaigns with zero activity');
    }
    if (bestPerformers.length > 0) {
      recommendedActions.push(`Scale successful campaigns: ${bestPerformers.map((p) => p.title).join(', ')}`);
    }
    if (insights.activeCampaigns === 0 && tenantCampaigns.length > 0) {
      recommendedActions.push('Activate paused campaigns or create new ones');
    }

    const summary = `Reviewed ${tenantCampaigns.length} campaign(s) from the last ${lookbackDays} days`;
    if (context.taskId) {
      const { createAgentMessage } = await import('../lib/agentMessage.js');
      await createAgentMessage({
        missionId: context.taskId,
        senderType: 'agent',
        senderId: 'research-agent',
        channel: 'research',
        visibleToUser: true,
        text: summary,
      });
    }

    return {
      ok: true,
      summary,
      lookbackDays,
      insights,
      campaigns: tenantCampaigns.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        createdAt: c.createdAt,
        performance: campaignPerformance.get(c.id)?.eventCount || 0,
      })),
      recommendedActions,
      message: 'Campaign strategy review completed',
    };
  } catch (error) {
    console.error('[CampaignHandlers] Error in handleCampaignStrategyReview:', error);
    return {
      ok: false,
      summary: `Failed to review campaigns: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Handle screen distribution optimizer
 * 
 * Optimizes screen distribution for campaigns
 */
export async function handleScreenDistributionOptimizer(
  payload: ScreenDistributionOptimizerPayload,
  context: OrchestratorContext
) {
  try {
    const { tenantId, campaignId, objective = 'balance' } = payload;

    // Get all devices for tenant
    const devices = await prisma.device.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        location: true,
        status: true,
        lastSeenAt: true,
      },
    });

    // Get playlist bindings to understand current distribution
    const playlistBindings = await prisma.devicePlaylistBinding.findMany({
      where: {
        device: {
          tenantId,
        },
      },
      select: {
        deviceId: true,
        playlistId: true,
        lastPushedAt: true,
        status: true,
      },
    });

    // Group bindings by device
    const deviceBindings = new Map<string, number>();
    for (const binding of playlistBindings) {
      deviceBindings.set(binding.deviceId, (deviceBindings.get(binding.deviceId) || 0) + 1);
    }

    // Calculate device performance scores (based on online status and binding count)
    const deviceScores = devices.map((device) => {
      const isOnline = device.status === 'online' && device.lastSeenAt
        ? (Date.now() - new Date(device.lastSeenAt).getTime()) < 5 * 60 * 1000
        : false;
      const bindingCount = deviceBindings.get(device.id) || 0;

      return {
        deviceId: device.id,
        name: device.name || device.id,
        location: device.location,
        isOnline,
        bindingCount,
        score: isOnline ? (bindingCount + 1) : 0, // Higher score for online devices with more bindings
      };
    });

    // Sort by score
    const sortedDevices = [...deviceScores].sort((a, b) => b.score - a.score);

    // Optimize distribution based on objective
    let recommendations: Array<{ deviceId: string; action: string; reason: string }> = [];

    if (objective === 'balance') {
      // Balance distribution across all devices
      const avgBindings = deviceBindings.size > 0
        ? Array.from(deviceBindings.values()).reduce((a, b) => a + b, 0) / deviceBindings.size
        : 0;

      for (const device of sortedDevices) {
        if (device.isOnline) {
          if (device.bindingCount < avgBindings * 0.5) {
            recommendations.push({
              deviceId: device.deviceId,
              action: 'increase',
              reason: `Low playlist count (${device.bindingCount}), below average`,
            });
          } else if (device.bindingCount > avgBindings * 1.5) {
            recommendations.push({
              deviceId: device.deviceId,
              action: 'decrease',
              reason: `High playlist count (${device.bindingCount}), above average`,
            });
          }
        }
      }
    } else if (objective === 'maximize_reach') {
      // Focus on top-performing devices
      const topDevices = sortedDevices.slice(0, Math.ceil(sortedDevices.length * 0.3));
      recommendations = topDevices.map((device) => ({
        deviceId: device.deviceId,
        action: 'prioritize',
        reason: 'Top-performing device for maximum reach',
      }));
    } else if (objective === 'minimize_cost') {
      // Focus on devices with fewer bindings
      const efficientDevices = sortedDevices
        .filter((d) => d.isOnline && d.bindingCount > 0)
        .slice(0, Math.ceil(sortedDevices.length * 0.5));
      recommendations = efficientDevices.map((device) => ({
        deviceId: device.deviceId,
        action: 'maintain',
        reason: 'Efficient device with good performance',
      }));
    }

    return {
      ok: true,
      summary: `Screen distribution analysis for ${devices.length} device(s)`,
      objective,
      totalDevices: devices.length,
      onlineDevices: sortedDevices.filter((d) => d.isOnline).length,
      devices: sortedDevices,
      recommendations,
      message: `Optimized distribution for ${objective} objective`,
    };
  } catch (error) {
    console.error('[CampaignHandlers] Error in handleScreenDistributionOptimizer:', error);
    return {
      ok: false,
      summary: `Failed to optimize distribution: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Handle campaign targeting planner
 * 
 * Proposes targeting configuration for campaigns
 */
export async function handleCampaignTargetingPlanner(
  payload: CampaignTargetingPlannerPayload,
  context: OrchestratorContext
) {
  try {
    const { tenantId, baseCampaignId, goal = 'awareness' } = payload;

    // Get all devices
    const devices = await prisma.device.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        location: true,
        status: true,
        lastSeenAt: true,
      },
    });

    // Get activity events to understand device performance
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const deviceEvents = await prisma.activityEvent.findMany({
      where: {
        tenantId,
        deviceId: { in: devices.map((d) => d.id) },
        occurredAt: { gte: last30Days },
      },
      select: {
        deviceId: true,
        occurredAt: true,
        type: true,
      },
    });

    // Calculate device activity scores
    const deviceActivity = new Map<string, number>();
    for (const event of deviceEvents) {
      if (event.deviceId) {
        deviceActivity.set(event.deviceId, (deviceActivity.get(event.deviceId) || 0) + 1);
      }
    }

    // Select best devices based on goal
    let recommendedDevices: string[] = [];
    if (goal === 'awareness') {
      // For awareness, prioritize devices with high activity and good online status
      const scoredDevices = devices
        .filter((d) => d.status === 'online')
        .map((d) => ({
          deviceId: d.id,
          score: (deviceActivity.get(d.id) || 0) + (d.lastSeenAt ? 10 : 0),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.min(10, devices.length))
        .map((d) => d.deviceId);
      recommendedDevices = scoredDevices;
    } else if (goal === 'engagement') {
      // For engagement, focus on devices with consistent activity
      const consistentDevices = devices
        .filter((d) => {
          const activity = deviceActivity.get(d.id) || 0;
          return activity > 5 && d.status === 'online';
        })
        .slice(0, 8)
        .map((d) => d.id);
      recommendedDevices = consistentDevices;
    } else if (goal === 'conversion') {
      // For conversion, prioritize high-traffic locations
      const locationDevices = devices
        .filter((d) => d.location && d.status === 'online')
        .slice(0, 5)
        .map((d) => d.id);
      recommendedDevices = locationDevices;
    }

    // Analyze best hours (simplified - would use actual event timestamps)
    const hourActivity = new Array(24).fill(0);
    for (const event of deviceEvents) {
      const hour = new Date(event.occurredAt).getHours();
      hourActivity[hour]++;
    }
    const bestHours = hourActivity
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((h) => h.hour);

    // Calculate recommended impressions
    const recommendedImpressions = goal === 'awareness' ? 1000 : goal === 'engagement' ? 500 : 200;

    if (context.taskId) {
      const { createAgentMessage } = await import('../lib/agentMessage.js');
      const planSummary = `Targeting strategy planned for ${goal} goal`;
      await createAgentMessage({
        missionId: context.taskId,
        senderType: 'agent',
        senderId: 'planner',
        channel: 'main',
        visibleToUser: true,
        text: planSummary,
      });
      await createAgentMessage({
        missionId: context.taskId,
        senderType: 'agent',
        senderId: 'planner',
        channel: 'main',
        performative: 'critique',
        visibleToUser: false,
        text: `Internal: targeting plan for goal=${goal}, devices=${recommendedDevices.length}, peak hours applied.`,
      });
    }

    return {
      ok: true,
      summary: `Targeting strategy planned for ${goal} goal`,
      goal,
      baseCampaignId,
      targeting: {
        recommendedDevices,
        recommendedHours: bestHours,
        recommendedImpressions,
        deviceCount: recommendedDevices.length,
      },
      message: 'Targeting plan ready for campaign creation',
    };
  } catch (error) {
    console.error('[CampaignHandlers] Error in handleCampaignTargetingPlanner:', error);
    return {
      ok: false,
      summary: `Failed to plan targeting: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Handle campaign A/B suggester
 * 
 * Suggests A/B test variants for campaigns
 */
export async function handleCampaignAbSuggester(
  payload: CampaignAbSuggesterPayload,
  context: OrchestratorContext
) {
  try {
    const { tenantId, campaignId, variants = 2 } = payload;

    // If campaignId provided, fetch campaign to base variants on
    let baseCampaign = null;
    if (campaignId) {
      baseCampaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
          id: true,
          title: true,
          data: true,
        },
      });
    }

    // Get devices for device group variants
    const devices = await prisma.device.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
      },
    });

    // Split devices into groups for A/B testing
    const deviceGroups = [];
    const groupSize = Math.ceil(devices.length / variants);
    for (let i = 0; i < variants; i++) {
      const start = i * groupSize;
      const end = Math.min(start + groupSize, devices.length);
      deviceGroups.push(devices.slice(start, end).map((d) => d.id));
    }

    // Generate variant suggestions
    const variantSuggestions = Array.from({ length: variants }, (_, i) => {
      const variantLetter = String.fromCharCode(65 + i); // A, B, C, etc.
      return {
        variant: variantLetter,
        name: `Variant ${variantLetter}`,
        description: `Test variant ${variantLetter} configuration`,
        deviceGroup: deviceGroups[i] || [],
        creativeVariations: baseCampaign
          ? [
              { type: 'title', value: `${baseCampaign.title} (${variantLetter})` },
              { type: 'timing', value: 'Peak hours' },
            ]
          : [
              { type: 'creative_style', value: 'Bold' },
              { type: 'call_to_action', value: 'Learn More' },
            ],
        timeWindow: {
          start: '09:00',
          end: '17:00',
        },
      };
    });

    return {
      ok: true,
      summary: `A/B test plan with ${variants} variant(s)`,
      campaignId,
      baseCampaign: baseCampaign
        ? {
            id: baseCampaign.id,
            title: baseCampaign.title,
          }
        : null,
      variants: variantSuggestions,
      message: 'A/B test configuration ready',
    };
  } catch (error) {
    console.error('[CampaignHandlers] Error in handleCampaignAbSuggester:', error);
    return {
      ok: false,
      summary: `Failed to suggest A/B variants: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Handle campaign review scheduler
 * 
 * Defines recurring review schedule for campaigns
 */
export async function handleCampaignReviewScheduler(
  payload: CampaignReviewSchedulerPayload,
  context: OrchestratorContext
) {
  try {
    const { tenantId, cadence = 'weekly', dayOfWeek } = payload;

    // Calculate next review date
    const nextReview = new Date();
    if (cadence === 'weekly' && dayOfWeek !== undefined) {
      const currentDay = nextReview.getDay();
      const daysUntil = (dayOfWeek - currentDay + 7) % 7 || 7;
      nextReview.setDate(nextReview.getDate() + daysUntil);
      nextReview.setHours(9, 0, 0, 0); // Default to 9 AM
    } else if (cadence === 'monthly') {
      nextReview.setMonth(nextReview.getMonth() + 1);
      nextReview.setDate(1); // First day of next month
      nextReview.setHours(9, 0, 0, 0);
    }

    // Store review schedule in OrchestratorTask with a special entryPoint
    // We'll use a JSON field to store the schedule configuration
    const scheduleConfig = {
      tenantId,
      cadence,
      dayOfWeek,
      nextReview: nextReview.toISOString(),
      createdAt: new Date().toISOString(),
    };

    // Create a task record to track the schedule
    const scheduleTask = await prisma.orchestratorTask.create({
      data: {
        entryPoint: 'campaign_review_scheduler',
        tenantId,
        userId: context.userId,
        status: 'completed',
        request: scheduleConfig,
        result: {
          schedule: scheduleConfig,
          message: `Review schedule created: ${cadence}`,
        },
      },
    });

    return {
      ok: true,
      summary: `Review schedule created: ${cadence}`,
      cadence,
      dayOfWeek,
      nextReview: nextReview.toISOString(),
      nextReviewDate: nextReview.toLocaleDateString(),
      scheduleTaskId: scheduleTask.id,
      message: `Next review scheduled for ${nextReview.toLocaleDateString()}`,
    };
  } catch (error) {
    console.error('[CampaignHandlers] Error in handleCampaignReviewScheduler:', error);
    return {
      ok: false,
      summary: `Failed to create review schedule: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
