/**
 * Orchestrator unit tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import { IntentClassifier } from '../agents/intent.classifier.js';
import { Planner } from '../agents/planner.agent.js';
import { Critic } from '../agents/critic.agent.js';
import { Refiner } from '../agents/refiner.agent.js';
import { Specialist } from '../agents/specialist.agent.js';
import { Intent } from '../types/agent.types.js';
import { resetMissionHistoryForTests } from '../telemetry/metrics.js';

describe('Orchestrator', () => {
  beforeEach(() => {
    resetMissionHistoryForTests();
    vi.restoreAllMocks();
    process.env.MULTI_AGENT_ENABLED = 'true';
    process.env.HITL_REVIEW_ENABLED = 'true';
    process.env.MULTI_AGENT_SHADOW = 'false';
    process.env.AGENT_TELEMETRY_ENABLED = 'true';
  });

  function buildMockOrchestrator() {
    const intentClassifier = new IntentClassifier();
    const planner = new Planner();
    const critic = new Critic();
    const refiner = new Refiner();

    vi.spyOn(intentClassifier, 'process').mockImplementation(async (msg: string) => {
      if (msg.includes('3 stores')) {
        return { intent: Intent.MISSION_PLANNING, confidence: 0.93, entities: {} };
      }
      if (msg.includes('Change my store')) {
        return { intent: Intent.STORE_UPDATE, confidence: 0.9, entities: {} };
      }
      if (msg.includes('help')) {
        return { intent: Intent.SUPPORT, confidence: 0.88, entities: {} };
      }
      if (msg.includes('category')) {
        return { intent: Intent.GENERAL_QUERY, confidence: 0.91, entities: {} };
      }
      if (msg.includes('invalid')) {
        return { intent: Intent.STORE_SETUP, confidence: 0.7, entities: {} };
      }
      return { intent: Intent.STORE_SETUP, confidence: 0.95, entities: { storeName: 'Glow Beauty' } };
    });

    vi.spyOn(planner, 'process').mockResolvedValue({
      steps: [
        { id: 's1', action: 'validate', parameters: {}, validation: 'ok' },
        { id: 's2', action: 'create_store', parameters: {}, validation: 'ok' },
      ],
      requiredTools: ['create_store'],
      estimatedComplexity: 'medium',
      dependencies: {},
    });

    vi.spyOn(critic, 'process').mockImplementation(async ({ originalMessage }) => {
      if (originalMessage?.includes('invalid')) {
        return {
          approved: false,
          issues: ['Missing location'],
          suggestions: ['Add city'],
          confidence: 0.8,
        };
      }
      return {
        approved: true,
        issues: [],
        suggestions: [],
        confidence: 0.92,
      };
    });

    vi.spyOn(refiner, 'process').mockImplementation(async (draft) => `✨ ${draft}`);

    vi.spyOn(Specialist.prototype, 'process').mockResolvedValue(
      'Home decor works best in Home & Living category.',
    );

    return new Orchestrator({
      intentClassifier,
      planner,
      critic,
      refiner,
    });
  }

  it('processes store setup mission end-to-end', async () => {
    const orchestrator = buildMockOrchestrator();
    const result = await orchestrator.processMission(
      "I want to open a beauty store called 'Glow Beauty' in Melbourne",
    );

    expect(result.status).toBe('completed');
    expect(result.intent).toBe(Intent.STORE_SETUP);
    expect(result.plan).toBeDefined();
    expect(result.plan!.steps.length).toBeGreaterThan(0);
    expect(result.execution).toBeDefined();
    expect(result.finalResponse).toContain('✨');
    expect(result.telemetry.agentsUsed).toContain('intent_classifier');
    expect(result.telemetry.agentsUsed).toContain('planner');
    expect(result.telemetry.agentsUsed).toContain('critic');
  });

  it('triggers HITL when critic rejects plan', async () => {
    const orchestrator = buildMockOrchestrator();
    const result = await orchestrator.processMission(
      'Create a store with invalid parameters',
    );

    expect(result.status).toBe('pending_human_review');
    expect(result.review?.approved).toBe(false);
    expect(result.review!.issues.length).toBeGreaterThan(0);
  });

  it('routes general queries to specialist', async () => {
    const orchestrator = buildMockOrchestrator();
    const result = await orchestrator.processMission(
      "What's the best category for a home decor business?",
    );

    expect(result.status).toBe('completed');
    expect(result.intent).toBe(Intent.GENERAL_QUERY);
    expect(result.plan).toBeUndefined();
    expect(result.finalResponse).toBeDefined();
  });
});
