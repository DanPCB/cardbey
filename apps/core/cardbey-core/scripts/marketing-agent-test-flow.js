#!/usr/bin/env node
/**
 * Internal Marketing Agent Test (End-to-End)
 *
 * Scenario: French Baguette Café – Weekend Coffee Promo
 * 1) Generate campaign draft via internal agent (stub)
 * 2) Generate 3 social posts (caption + hashtags)
 * 3) Generate 1 promo banner image prompt
 * 4) Schedule posts for Sat 9AM, Sun 9AM
 * 5) Create loyalty reward (Buy 5 get 1 free)
 * 6) Transition campaign status DRAFT → SCHEDULED → RUNNING
 * 7) Log all transitions via AuditEvent
 *
 * Debug logs: Agent input, Agent output, OrchestratorTask status, Final scheduled state.
 *
 * Run from apps/core/cardbey-core: node scripts/marketing-agent-test-flow.js
 * Env: DATABASE_URL (required), optional DEV_TENANT_ID, DEV_STORE_ID.
 */

import { PrismaClient } from '@prisma/client';
import { transitionOrchestratorTaskStatus } from '../src/kernel/transitions/transitionService.js';

const prisma = new PrismaClient();

const TENANT_ID = process.env.DEV_TENANT_ID || 'test-tenant-marketing-agent';
const STORE_ID = process.env.DEV_STORE_ID || 'test-store-marketing-agent';
const ACTOR = 'automation';
const REASON_PREFIX = 'MARKETING_AGENT_TEST';

function debugLog(label, data) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${label}]`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
}

/** Stub internal agent: campaign draft payload */
function stubAgentCampaignDraft(input) {
  debugLog('Agent input', { step: 'campaign_draft', input });
  const output = {
    title: 'Weekend Coffee Promo',
    scenario: input.scenario || 'French Baguette Café – Weekend Coffee Promo',
    storeName: 'French Baguette Café',
    startDate: input.startDate || new Date().toISOString().split('T')[0],
    endDate: input.endDate || null,
  };
  debugLog('Agent output', { step: 'campaign_draft', output });
  return output;
}

/** Stub internal agent: 3 social posts (caption + hashtags) */
function stubAgentSocialPosts(input) {
  debugLog('Agent input', { step: 'social_posts', input });
  const output = [
    { caption: 'Weekend vibes at French Baguette Café! Enjoy 20% off your favorite coffee this Saturday.', hashtags: ['#WeekendCoffee', '#FrenchBaguetteCafe', '#CoffeeDeal'] },
    { caption: 'Sunrise and espresso – the perfect combo. Visit us this weekend for a treat.', hashtags: ['#SundayBrunch', '#CoffeeLovers', '#FrenchBaguetteCafe'] },
    { caption: 'Buy 5 coffees, get 1 free. Our loyalty reward is here. See you at the café!', hashtags: ['#LoyaltyReward', '#FreeCoffee', '#FrenchBaguetteCafe'] },
  ];
  debugLog('Agent output', { step: 'social_posts', posts: output });
  return output;
}

/** Stub internal agent: 1 promo banner image prompt */
function stubAgentBannerPrompt(input) {
  debugLog('Agent input', { step: 'banner_prompt', input });
  const output = {
    prompt: 'Warm café interior, coffee cup and croissant on wooden table, soft morning light, cozy weekend brunch atmosphere, minimal text space for "Weekend Coffee Promo"',
  };
  debugLog('Agent output', { step: 'banner_prompt', output });
  return output;
}

/** Schedule: Sat 9AM, Sun 9AM (next weekend) */
function computeScheduledTimes() {
  const now = new Date();
  const nextSat = new Date(now);
  nextSat.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7));
  nextSat.setHours(9, 0, 0, 0);
  const nextSun = new Date(nextSat);
  nextSun.setDate(nextSat.getDate() + 1);
  return [
    { slot: 1, scheduledAt: nextSat.toISOString(), label: 'Sat 9AM' },
    { slot: 2, scheduledAt: nextSun.toISOString(), label: 'Sun 9AM' },
  ];
}

async function createCampaignAuditEvent(prisma, campaignId, fromStatus, toStatus, reason, metadata = null) {
  await prisma.auditEvent.create({
    data: {
      entityType: 'Campaign',
      entityId: campaignId,
      action: 'status_transition',
      fromStatus,
      toStatus,
      actorType: ACTOR,
      actorId: null,
      correlationId: null,
      reason: reason || null,
      metadata: metadata || undefined,
    },
  });
}

async function run() {
  const executionLog = [];
  const log = (msg, detail) => {
    executionLog.push({ ts: new Date().toISOString(), msg, ...(detail && { detail }) });
    console.log(`[E2E] ${msg}`, detail ? JSON.stringify(detail) : '');
  };

  log('Starting Internal Marketing Agent Test (French Baguette Café – Weekend Coffee Promo)');

  try {
    // ─── Step 0: Create OrchestratorTask (queued) ─────────────────────────────
    const agentInput = {
      scenario: 'French Baguette Café – Weekend Coffee Promo',
      storeName: 'French Baguette Café',
    };
    const task = await prisma.orchestratorTask.create({
      data: {
        entryPoint: 'marketing_agent_test',
        tenantId: TENANT_ID,
        userId: 'system-marketing-test',
        status: 'queued',
        request: { scenario: agentInput.scenario, storeName: agentInput.storeName },
      },
    });
    log('OrchestratorTask created', { taskId: task.id, status: task.status, entryPoint: task.entryPoint });
    debugLog('OrchestratorTask status', { taskId: task.id, status: task.status });

    // ─── Transition queued → running ────────────────────────────────────────
    const trRun = await transitionOrchestratorTaskStatus({
      prisma,
      taskId: task.id,
      toStatus: 'running',
      fromStatus: 'queued',
      actorType: ACTOR,
      reason: `${REASON_PREFIX}_START`,
      correlationId: task.id,
    });
    if (!trRun.ok) {
      throw new Error(`Transition to running failed: ${trRun.code} ${trRun.message}`);
    }
    log('OrchestratorTask transition', { from: 'queued', to: 'running', auditEventId: trRun.auditEventId });
    debugLog('OrchestratorTask status', { taskId: task.id, status: 'running' });

    // ─── Step 1: Campaign draft (stub agent) ─────────────────────────────────
    const campaignDraft = stubAgentCampaignDraft(agentInput);

    // ─── Step 2: 3 social posts ─────────────────────────────────────────────
    const socialPosts = stubAgentSocialPosts(agentInput);

    // ─── Step 3: 1 promo banner prompt ───────────────────────────────────────
    const bannerPrompt = stubAgentBannerPrompt(agentInput);

    // ─── Step 4: Schedule (Sat 9AM, Sun 9AM) ──────────────────────────────────
    const scheduledTimes = computeScheduledTimes();
    debugLog('Scheduled state', { scheduledTimes });

    // ─── Step 5: Loyalty reward (Buy 5 get 1 free) ───────────────────────────
    const loyaltyProgram = await prisma.loyaltyProgram.create({
      data: {
        tenantId: TENANT_ID,
        storeId: STORE_ID,
        name: 'Weekend Coffee – Buy 5 Get 1 Free',
        stampsRequired: 5,
        reward: '1 free coffee',
      },
    });
    log('LoyaltyProgram created', { id: loyaltyProgram.id, name: loyaltyProgram.name, stampsRequired: loyaltyProgram.stampsRequired });

    // ─── Create Campaign (DRAFT) ─────────────────────────────────────────────
    const campaignData = {
      scenario: campaignDraft.scenario,
      storeName: campaignDraft.storeName,
      socialPosts,
      bannerPrompt: bannerPrompt.prompt,
      scheduledTimes,
      loyaltyProgramId: loyaltyProgram.id,
    };
    const campaign = await prisma.campaign.create({
      data: {
        title: campaignDraft.title,
        productId: null,
        data: campaignData,
        status: 'DRAFT',
      },
    });
    log('Campaign created (DRAFT)', { campaignId: campaign.id, title: campaign.title });
    await createCampaignAuditEvent(prisma, campaign.id, null, 'DRAFT', `${REASON_PREFIX}_CREATE`);

    // ─── Step 6a: DRAFT → SCHEDULED ─────────────────────────────────────────
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'SCHEDULED', updatedAt: new Date() },
    });
    await createCampaignAuditEvent(prisma, campaign.id, 'DRAFT', 'SCHEDULED', `${REASON_PREFIX}_SCHEDULE`);
    log('Campaign transition', { from: 'DRAFT', to: 'SCHEDULED' });

    // ─── Step 6b: SCHEDULED → RUNNING ────────────────────────────────────────
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'RUNNING', updatedAt: new Date() },
    });
    await createCampaignAuditEvent(prisma, campaign.id, 'SCHEDULED', 'RUNNING', `${REASON_PREFIX}_GO_LIVE`);
    log('Campaign transition', { from: 'SCHEDULED', to: 'RUNNING' });

    // ─── Step 7: OrchestratorTask running → completed ─────────────────────────
    const result = {
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      campaignStatus: 'RUNNING',
      loyaltyProgramId: loyaltyProgram.id,
      socialPostsCount: socialPosts.length,
      scheduledTimes,
      bannerPrompt: bannerPrompt.prompt,
    };
    const trComplete = await transitionOrchestratorTaskStatus({
      prisma,
      taskId: task.id,
      toStatus: 'completed',
      fromStatus: 'running',
      actorType: ACTOR,
      reason: `${REASON_PREFIX}_COMPLETE`,
      correlationId: task.id,
      result,
    });
    if (!trComplete.ok) {
      throw new Error(`Transition to completed failed: ${trComplete.code} ${trComplete.message}`);
    }
    log('OrchestratorTask transition', { from: 'running', to: 'completed', auditEventId: trComplete.auditEventId });

    debugLog('OrchestratorTask status', { taskId: task.id, status: 'completed' });
    debugLog('Final scheduled state', result);

    log('Internal Marketing Agent Test completed successfully.', {
      taskId: task.id,
      campaignId: campaign.id,
      loyaltyProgramId: loyaltyProgram.id,
      finalScheduledState: result,
    });

    // Print execution log for output
    console.log('\n--- Execution log (summary) ---');
    executionLog.forEach((e) => console.log(JSON.stringify(e)));

    return { ok: true, taskId: task.id, campaignId: campaign.id, executionLog };
  } catch (err) {
    console.error('[E2E] Error:', err);
    executionLog.push({ ts: new Date().toISOString(), msg: 'FAILED', error: err.message });
    console.log('\n--- Execution log (summary) ---');
    executionLog.forEach((e) => console.log(JSON.stringify(e)));
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

run()
  .then((out) => {
    if (out) process.exit(0);
  })
  .catch(() => {
    process.exit(1);
  });
