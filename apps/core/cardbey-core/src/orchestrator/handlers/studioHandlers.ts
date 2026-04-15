/**
 * Studio/Content Orchestrator Handlers
 * 
 * Handles content studio-related insight actions:
 * - Studio engagement campaigns
 * - Studio training guides
 * - Studio goal planning
 * - Content calendar building
 */

import { PrismaClient } from '@prisma/client';
import { OrchestratorContext } from '../insightTypes.js';
import {
  StudioEngagementCampaignPayload,
  StudioTrainingGuidePayload,
  StudioGoalPlannerPayload,
  ContentCalendarBuilderPayload,
} from '../insightTypes.js';

const prisma = new PrismaClient();

/**
 * Handle studio engagement campaign
 * 
 * Builds engagement campaign plan for content studio
 */
export async function handleStudioEngagementCampaign(
  payload: StudioEngagementCampaignPayload,
  context: OrchestratorContext
) {
  try {
    const { tenantId, goal = 'activate_team', suggestedDurationDays = 7 } = payload;

    // Query existing content to understand current activity
    const recentContent = await prisma.content.findMany({
      where: {
        userId: context.userId, // Content is user-scoped, not tenant-scoped
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });

    // Query campaigns to see what's been created
    const recentCampaigns = await prisma.campaign.findMany({
      where: {
        workflow: {
          tenantId,
        },
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    // Generate campaign suggestions based on goal
    let campaignTheme = '';
    let targetAudience = '';
    let sampleCreatives: Array<{ type: string; description: string }> = [];

    if (goal === 'activate_team') {
      campaignTheme = 'Team Onboarding & Activation';
      targetAudience = 'New team members and existing staff';
      sampleCreatives = [
        { type: 'welcome_banner', description: 'Welcome new team members with branded banner' },
        { type: 'training_schedule', description: 'Display training schedule and key dates' },
        { type: 'team_spotlight', description: 'Highlight team achievements and milestones' },
      ];
    } else if (goal === 'increase_usage') {
      campaignTheme = 'Feature Discovery & Usage';
      targetAudience = 'All users';
      sampleCreatives = [
        { type: 'feature_highlight', description: 'Showcase key features and benefits' },
        { type: 'tutorial_tip', description: 'Quick tips and tutorials for common tasks' },
        { type: 'success_story', description: 'Share success stories from other users' },
      ];
    } else if (goal === 'onboard_new_users') {
      campaignTheme = 'New User Onboarding';
      targetAudience = 'First-time users';
      sampleCreatives = [
        { type: 'getting_started', description: 'Step-by-step getting started guide' },
        { type: 'quick_tour', description: 'Interactive tour of key features' },
        { type: 'first_project', description: 'Templates for first project creation' },
      ];
    }

    // Calculate campaign dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + suggestedDurationDays);

    return {
      ok: true,
      summary: `Engagement campaign plan for ${goal}`,
      goal,
      theme: campaignTheme,
      targetAudience,
      durationDays: suggestedDurationDays,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      sampleCreatives,
      recentActivity: {
        contentCreated: recentContent.length,
        campaignsCreated: recentCampaigns.length,
      },
      message: 'Engagement campaign plan ready',
    };
  } catch (error) {
    console.error('[StudioHandlers] Error in handleStudioEngagementCampaign:', error);
    return {
      ok: false,
      summary: `Failed to create engagement campaign: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Handle studio training guide
 * 
 * Generates training session outline for content studio
 */
export async function handleStudioTrainingGuide(
  payload: StudioTrainingGuidePayload,
  context: OrchestratorContext
) {
  try {
    const { tenantId, audience = 'owners', durationMinutes = 60 } = payload;

    // Query existing content to understand what's been created
    const userContent = await prisma.content.findMany({
      where: {
        userId: context.userId,
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
      },
    });

    // Build agenda based on audience
    let agenda: Array<{ title: string; duration: number; description: string }> = [];
    let demoSteps: Array<{ step: number; action: string; description: string }> = [];
    let requiredAssets: string[] = [];

    if (audience === 'owners') {
      agenda = [
        {
          title: 'Introduction to Cardbey Studio',
          duration: 10,
          description: 'Overview of platform capabilities and business value',
        },
        {
          title: 'Creating Your First Design',
          duration: 15,
          description: 'Step-by-step walkthrough of design creation',
        },
        {
          title: 'Using Templates',
          duration: 15,
          description: 'How to find and customize templates',
        },
        {
          title: 'Publishing Content',
          duration: 10,
          description: 'Publishing workflows and best practices',
        },
        {
          title: 'Q&A and Next Steps',
          duration: 10,
          description: 'Address questions and set up follow-up',
        },
      ];

      demoSteps = [
        { step: 1, action: 'Navigate to Studio', description: 'Show dashboard and navigation' },
        { step: 2, action: 'Select Template', description: 'Browse and select a template' },
        { step: 3, action: 'Customize Design', description: 'Edit text, colors, and layout' },
        { step: 4, action: 'Preview', description: 'Preview on different screen sizes' },
        { step: 5, action: 'Publish', description: 'Publish to devices or schedule' },
      ];

      requiredAssets = [
        'Sample template library',
        'Brand assets (logos, colors)',
        'Device preview mockups',
      ];
    } else if (audience === 'operators') {
      agenda = [
        {
          title: 'Studio Basics',
          duration: 10,
          description: 'Understanding the Studio interface',
        },
        {
          title: 'Quick Edits',
          duration: 20,
          description: 'Making quick changes to existing content',
        },
        {
          title: 'Content Scheduling',
          duration: 15,
          description: 'Scheduling and managing content calendar',
        },
        {
          title: 'Troubleshooting',
          duration: 10,
          description: 'Common issues and solutions',
        },
        {
          title: 'Practice Session',
          duration: 5,
          description: 'Hands-on practice with guidance',
        },
      ];

      demoSteps = [
        { step: 1, action: 'Access Content', description: 'Find and open existing content' },
        { step: 2, action: 'Make Edits', description: 'Update text and images' },
        { step: 3, action: 'Save Changes', description: 'Save and preview changes' },
        { step: 4, action: 'Schedule', description: 'Set up content schedule' },
      ];

      requiredAssets = [
        'Existing content examples',
        'Quick reference guide',
        'Support contact information',
      ];
    } else if (audience === 'designers') {
      agenda = [
        {
          title: 'Advanced Design Tools',
          duration: 15,
          description: 'Using advanced design features',
        },
        {
          title: 'Custom Templates',
          duration: 20,
          description: 'Creating and saving custom templates',
        },
        {
          title: 'Brand Consistency',
          duration: 10,
          description: 'Maintaining brand guidelines',
        },
        {
          title: 'Collaboration',
          duration: 10,
          description: 'Working with team members',
        },
        {
          title: 'Best Practices',
          duration: 5,
          description: 'Design tips and optimization',
        },
      ];

      demoSteps = [
        { step: 1, action: 'Create Blank Design', description: 'Start from scratch' },
        { step: 2, action: 'Add Elements', description: 'Text, images, shapes' },
        { step: 3, action: 'Style & Layout', description: 'Advanced styling options' },
        { step: 4, action: 'Save Template', description: 'Save as reusable template' },
        { step: 5, action: 'Export', description: 'Export for other uses' },
      ];

      requiredAssets = [
        'Design system guidelines',
        'Asset library access',
        'Export formats guide',
      ];
    }

    return {
      ok: true,
      summary: `Training guide for ${audience}`,
      audience,
      durationMinutes,
      agenda,
      demoSteps,
      requiredAssets,
      existingContentCount: userContent.length,
      message: 'Training guide generated',
    };
  } catch (error) {
    console.error('[StudioHandlers] Error in handleStudioTrainingGuide:', error);
    return {
      ok: false,
      summary: `Failed to generate training guide: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Handle studio goal planner
 * 
 * Defines content/studio goals
 */
export async function handleStudioGoalPlanner(
  payload: StudioGoalPlannerPayload,
  context: OrchestratorContext
) {
  try {
    const { tenantId, timeFrame = 'monthly', metrics = ['new_designs'] } = payload;

    // Query existing content to establish baseline
    const now = new Date();
    let startDate: Date;
    if (timeFrame === 'weekly') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeFrame === 'monthly') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }

    const recentContent = await prisma.content.findMany({
      where: {
        userId: context.userId,
        createdAt: { gte: startDate },
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });

    const recentCampaigns = await prisma.campaign.findMany({
      where: {
        workflow: {
          tenantId,
        },
        createdAt: { gte: startDate },
      },
      select: {
        id: true,
        status: true,
      },
    });

    // Calculate current metrics
    const currentMetrics: Record<string, number> = {};
    for (const metric of metrics) {
      if (metric === 'new_designs') {
        currentMetrics[metric] = recentContent.length;
      } else if (metric === 'campaigns') {
        currentMetrics[metric] = recentCampaigns.length;
      } else if (metric === 'publishes') {
        // Count published campaigns
        currentMetrics[metric] = recentCampaigns.filter((c) => c.status === 'RUNNING').length;
      } else if (metric === 'templates_used') {
        // Estimate based on content count (since Content model doesn't have type field)
        currentMetrics[metric] = recentContent.length;
      } else {
        currentMetrics[metric] = 0;
      }
    }

    // Calculate recommended targets (20% increase from current)
    const targets: Record<string, number> = {};
    for (const metric of metrics) {
      const current = currentMetrics[metric] || 0;
      targets[metric] = Math.max(1, Math.ceil(current * 1.2)); // At least 1, or 20% increase
    }

    // Store goals in OrchestratorTask for tracking
    const goalTask = await prisma.orchestratorTask.create({
      data: {
        entryPoint: 'studio_goal_planner',
        tenantId,
        userId: context.userId,
        status: 'completed',
        request: {
          timeFrame,
          metrics,
        },
        result: {
          currentMetrics,
          targets,
          timeFrame,
        },
      },
    });

    const summary = `Goal plan for ${timeFrame}`;
    if (context.taskId) {
      const { createAgentMessage } = await import('../lib/agentMessage.js');
      await createAgentMessage({
        missionId: context.taskId,
        senderType: 'agent',
        senderId: 'planner',
        channel: 'main',
        visibleToUser: true,
        text: summary,
      });
    }

    return {
      ok: true,
      summary,
      timeFrame,
      metrics,
      currentMetrics,
      targets,
      goalTaskId: goalTask.id,
      message: 'Goals set and ready to track',
    };
  } catch (error) {
    console.error('[StudioHandlers] Error in handleStudioGoalPlanner:', error);
    return {
      ok: false,
      summary: `Failed to plan goals: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Handle content calendar builder
 * 
 * Creates content calendar structure
 */
export async function handleContentCalendarBuilder(
  payload: ContentCalendarBuilderPayload,
  context: OrchestratorContext
) {
  try {
    const { tenantId, timeFrameDays = 30, channels = ['cnet'] } = payload;

    // Query existing campaigns to understand current schedule
    const existingCampaigns = await prisma.campaign.findMany({
      where: {
        workflow: {
          tenantId,
        },
        status: { in: ['RUNNING', 'SCHEDULED'] },
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        data: true,
      },
    });

    // Build calendar structure
    const calendar = [];
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    // Identify key dates (holidays, events, etc.)
    const keyDates: Array<{ date: string; label: string; type: string }> = [];
    for (let i = 0; i < timeFrameDays; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dayOfWeek = date.getDay();

      // Mark weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        keyDates.push({
          date: date.toISOString().split('T')[0],
          label: dayOfWeek === 0 ? 'Sunday' : 'Saturday',
          type: 'weekend',
        });
      }

      // Mark first of month
      if (date.getDate() === 1) {
        keyDates.push({
          date: date.toISOString().split('T')[0],
          label: 'Month Start',
          type: 'milestone',
        });
      }
    }

    // Build calendar entries
    for (let i = 0; i < timeFrameDays; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      // Check if there are existing campaigns on this date
      const campaignsOnDate = existingCampaigns.filter((c) => {
        const campaignDate = new Date(c.createdAt).toISOString().split('T')[0];
        return campaignDate === dateStr;
      });

      // Get key date info
      const keyDate = keyDates.find((kd) => kd.date === dateStr);

      calendar.push({
        date: dateStr,
        dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'short' }),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        keyDate: keyDate || null,
        channels: channels.map((ch) => {
          const existingCampaign = campaignsOnDate.find((c) => {
            const data = c.data as any;
            return data?.channel === ch;
          });

          return {
            channel: ch,
            theme: existingCampaign
              ? existingCampaign.title
              : keyDate
                ? `Theme for ${keyDate.label}`
                : 'TBD',
            hasContent: !!existingCampaign,
            campaignId: existingCampaign?.id || null,
            suggestions: keyDate
              ? [`Create content for ${keyDate.label}`]
              : ['Regular content update'],
          };
        }),
        existingCampaigns: campaignsOnDate.length,
      });
    }

    // Generate publishing suggestions
    const publishingSuggestions = [
      'Schedule content 1-2 weeks in advance',
      'Prepare holiday content early',
      'Maintain consistent posting schedule',
      'Review and update existing campaigns weekly',
    ];

    return {
      ok: true,
      summary: `Content calendar for ${timeFrameDays} days`,
      timeFrameDays,
      channels,
      calendar,
      keyDates: keyDates.filter((kd) => kd.type !== 'weekend'),
      publishingSuggestions,
      existingCampaignsCount: existingCampaigns.length,
      message: 'Content calendar generated',
    };
  } catch (error) {
    console.error('[StudioHandlers] Error in handleContentCalendarBuilder:', error);
    return {
      ok: false,
      summary: `Failed to build calendar: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
