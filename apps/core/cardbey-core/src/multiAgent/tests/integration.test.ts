/**
 * Integration tests for Cardbey multi-agent pipeline.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import { Intent } from '../types/agent.types.js';
import { IntentClassifier } from '../agents/intent.classifier.js';
import { Planner } from '../agents/planner.agent.js';
import { Critic } from '../agents/critic.agent.js';
import { Refiner } from '../agents/refiner.agent.js';
import { Specialist } from '../agents/specialist.agent.js';
import { resetMissionHistoryForTests } from '../telemetry/metrics.js';

describe('Cardbey Multi-Agent Integration Tests', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    resetMissionHistoryForTests();
    vi.restoreAllMocks();
    process.env.MULTI_AGENT_ENABLED = 'true';
    process.env.HITL_REVIEW_ENABLED = 'true';
    process.env.MULTI_AGENT_SHADOW = 'false';
    process.env.AGENT_TELEMETRY_ENABLED = 'true';
    process.env.MULTI_AGENT_MAX_REFINEMENTS = '1';

    const intentClassifier = new IntentClassifier();
    const planner = new Planner();
    const critic = new Critic();
    const refiner = new Refiner();

    const intentMap: Array<{ match: RegExp; intent: Intent; confidence: number }> = [
      { match: /Glow Beauty/i, intent: Intent.STORE_SETUP, confidence: 0.96 },
      { match: /3 stores/i, intent: Intent.MISSION_PLANNING, confidence: 0.94 },
      { match: /category/i, intent: Intent.GENERAL_QUERY, confidence: 0.9 },
      { match: /Change my store/i, intent: Intent.STORE_UPDATE, confidence: 0.91 },
      { match: /help with my store/i, intent: Intent.SUPPORT, confidence: 0.89 },
      { match: /invalid parameters/i, intent: Intent.STORE_SETUP, confidence: 0.75 },
    ];

    vi.spyOn(intentClassifier, 'process').mockImplementation(async (msg) => {
      const hit = intentMap.find((entry) => entry.match.test(msg));
      return {
        intent: hit?.intent ?? Intent.GENERAL_QUERY,
        confidence: hit?.confidence ?? 0.8,
        entities: {},
      };
    });

    vi.spyOn(planner, 'process').mockImplementation(async ({ message }) => {
      const multiStore = message.includes('3 stores');
      const steps = multiStore
        ? Array.from({ length: 5 }, (_, i) => ({
            id: `step-${i}`,
            action: `setup_store_${i}`,
            parameters: {},
          }))
        : [
            { id: 's1', action: 'validate', parameters: {} },
            { id: 's2', action: 'create_store', parameters: { name: 'Glow Beauty' } },
          ];

      return {
        steps,
        requiredTools: ['create_store'],
        estimatedComplexity: multiStore ? 'high' : 'medium',
        dependencies: {},
      };
    });

    vi.spyOn(critic, 'process').mockImplementation(async ({ originalMessage }) => {
      if (originalMessage?.includes('invalid')) {
        return {
          approved: false,
          issues: ['Invalid parameters', 'Missing location'],
          suggestions: ['Provide valid city'],
          confidence: 0.82,
        };
      }
      return {
        approved: true,
        issues: [],
        suggestions: ['Looks good'],
        confidence: 0.93,
      };
    });

    vi.spyOn(refiner, 'process').mockImplementation(
      async (draft) => `Here's your update: ${draft}`,
    );

    vi.spyOn(Specialist.prototype, 'process').mockImplementation(async function (this: Specialist) {
      return `Specialist response for ${this.getDomain()}`;
    });

    orchestrator = new Orchestrator({
      intentClassifier,
      planner,
      critic,
      refiner,
    });
  });

  it('should handle store setup mission', async () => {
    const result = await orchestrator.processMission(
      "I want to open a beauty store called 'Glow Beauty' in Melbourne",
    );

    expect(result.status).toBe('completed');
    expect(result.intent).toBe(Intent.STORE_SETUP);
    expect(result.plan).toBeDefined();
    expect(result.plan!.steps.length).toBeGreaterThan(0);
    expect(result.execution).toBeDefined();
    expect(result.finalResponse).toBeDefined();
    expect(result.telemetry.agentsUsed).toContain('intent_classifier');
    expect(result.telemetry.agentsUsed).toContain('planner');
    expect(result.telemetry.duration).toBeGreaterThanOrEqual(0);
  });

  it('should handle complex mission planning', async () => {
    const result = await orchestrator.processMission(
      'Set up 3 stores: Beauty in Melbourne, Fashion in Sydney, Electronics in Brisbane',
    );

    expect(result.status).toBe('completed');
    expect(result.intent).toBe(Intent.MISSION_PLANNING);
    expect(result.plan!.estimatedComplexity).toBe('high');
    expect(result.plan!.steps.length).toBeGreaterThan(3);
  });

  it('should handle general queries', async () => {
    const result = await orchestrator.processMission(
      "What's the best category for a home decor business?",
    );

    expect(result.status).toBe('completed');
    expect(result.intent).toBe(Intent.GENERAL_QUERY);
    expect(result.plan).toBeUndefined();
    expect(result.finalResponse).toBeDefined();
  });

  it('should handle store update queries via setup pipeline', async () => {
    const result = await orchestrator.processMission(
      'Change my store location from Melbourne to Sydney',
    );

    expect(result.status).toBe('completed');
    expect(result.intent).toBe(Intent.STORE_UPDATE);
    expect(result.plan).toBeDefined();
  });

  it('should handle support queries', async () => {
    const result = await orchestrator.processMission(
      'I need help with my store setup',
    );

    expect(result.status).toBe('completed');
    expect(result.intent).toBe(Intent.SUPPORT);
    expect(result.finalResponse).toBeDefined();
  });

  it('should trigger HITL when plan needs review', async () => {
    const result = await orchestrator.processMission(
      'Create a store with invalid parameters',
    );

    expect(result.status).toBe('pending_human_review');
    expect(result.review).toBeDefined();
    expect(result.review!.approved).toBe(false);
    expect(result.review!.issues.length).toBeGreaterThan(0);
  });

  it('should capture telemetry data', async () => {
    const result = await orchestrator.processMission(
      "I want to open a beauty store called 'Glow Beauty' in Melbourne",
    );

    expect(result.telemetry.missionId).toBeTruthy();
    expect(result.telemetry.tokenUsage.total).toBeGreaterThan(0);
    expect(result.telemetry.qualityMetrics?.intentConfidence).toBeGreaterThan(0.9);
  });
});
