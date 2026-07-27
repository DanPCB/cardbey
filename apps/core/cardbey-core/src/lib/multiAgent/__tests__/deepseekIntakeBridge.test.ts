/**
 * Tests for DeepSeek intake bridge.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Intent } from '../../../multiAgent/types/agent.types.js';
import {
  integrateDeepSeekMultiAgentIntake,
  mergeDeepSeekShadowIntoClassification,
  buildShowExecutionPlanFromDeepSeek,
  resetDeepSeekIntakeBridgeForTests,
} from '../deepseekIntakeBridge.js';

vi.mock('../../../multiAgent/orchestrator/orchestrator.js', () => ({
  Orchestrator: class {
    async processMission(message: string) {
      if (message.includes('invalid')) {
        return {
          missionId: 'MISSION_test',
          status: 'pending_human_review',
          intent: Intent.STORE_SETUP,
          plan: {
            steps: [{ id: 's1', action: 'create_store', parameters: {} }],
            requiredTools: ['create_store'],
            estimatedComplexity: 'medium',
            dependencies: {},
          },
          review: { approved: false, issues: ['bad params'], suggestions: [], confidence: 0.7 },
          finalResponse: 'Needs review',
          telemetry: {
            missionId: 'MISSION_test',
            timestamp: new Date(),
            duration: 10,
            agentsUsed: [],
            tokenUsage: { total: 100, byAgent: {} },
            thinkingMode: { type: 'enabled', reasoningEffort: 'medium' },
            parallelLimit: 5,
            hitlEnabled: true,
            retries: 0,
            errors: [],
          },
        };
      }

      if (message.includes('category')) {
        return {
          missionId: 'MISSION_query',
          status: 'completed',
          intent: Intent.GENERAL_QUERY,
          finalResponse: 'Use Home & Living category.',
          telemetry: {
            missionId: 'MISSION_query',
            timestamp: new Date(),
            duration: 5,
            agentsUsed: [],
            tokenUsage: { total: 50, byAgent: {} },
            thinkingMode: { type: 'enabled', reasoningEffort: 'medium' },
            parallelLimit: 5,
            hitlEnabled: true,
            retries: 0,
            errors: [],
          },
        };
      }

      return {
        missionId: 'MISSION_setup',
        status: 'completed',
        intent: Intent.STORE_SETUP,
        plan: {
          steps: [
            { id: 's1', action: 'validate_name', parameters: {} },
            { id: 's2', action: 'create_store', parameters: { name: 'Glow' } },
          ],
          requiredTools: ['create_store'],
          estimatedComplexity: 'medium',
          dependencies: {},
        },
        review: { approved: true, issues: [], suggestions: [], confidence: 0.9 },
        finalResponse: 'Store plan ready.',
        telemetry: {
          missionId: 'MISSION_setup',
          timestamp: new Date(),
          duration: 20,
          agentsUsed: [],
          tokenUsage: { total: 200, byAgent: {} },
          thinkingMode: { type: 'enabled', reasoningEffort: 'high' },
          parallelLimit: 5,
          hitlEnabled: true,
          retries: 0,
          errors: [],
          qualityMetrics: { intentConfidence: 0.95 },
        },
      };
    }
  },
}));

describe('deepseekIntakeBridge', () => {
  beforeEach(() => {
    resetDeepSeekIntakeBridgeForTests();
    process.env.MULTI_AGENT_ENABLED = 'true';
    process.env.MULTI_AGENT_SHADOW = 'false';
  });

  it('merges shadow metadata into classification', () => {
    const merged = mergeDeepSeekShadowIntoClassification(
      { tool: 'create_store', confidence: 0.8 },
      {
        missionId: 'M1',
        status: 'completed',
        intent: Intent.STORE_SETUP,
        finalResponse: 'ok',
        telemetry: {
          missionId: 'M1',
          timestamp: new Date(),
          duration: 1,
          agentsUsed: [],
          tokenUsage: { total: 0, byAgent: {} },
          thinkingMode: { type: 'enabled', reasoningEffort: 'medium' },
          parallelLimit: 5,
          hitlEnabled: false,
          retries: 0,
          errors: [],
        },
      },
    );

    expect(merged._deepSeekMultiAgent).toBeDefined();
    expect(merged._deepSeekMultiAgent.intent).toBe(Intent.STORE_SETUP);
  });

  it('handles primary store setup with execution plan response', async () => {
    const result = await integrateDeepSeekMultiAgentIntake({
      userMessage: "Open beauty store 'Glow Beauty' in Melbourne",
      classification: { tool: 'create_store', executionPath: 'proactive_plan' },
      missionId: 'mission-1',
    });

    expect(result.handled).toBe(true);
    expect(result.response?.action).toBe('show_execution_plan');
    expect(result.response?.executionPath).toBe('deepseek_multi_agent');
  });

  it('handles general query with chat response', async () => {
    const result = await integrateDeepSeekMultiAgentIntake({
      userMessage: 'What category for home decor?',
      classification: { tool: 'general_chat' },
    });

    expect(result.handled).toBe(true);
    expect(result.response?.action).toBe('chat');
    expect(result.response?.response).toContain('Home');
  });

  it('returns HITL response when plan rejected', async () => {
    const result = await integrateDeepSeekMultiAgentIntake({
      userMessage: 'Create a store with invalid parameters',
      classification: { tool: 'create_store' },
    });

    expect(result.handled).toBe(true);
    expect(result.response?.action).toBe('approval_required');
    expect(result.response?.hitlReview?.issues).toContain('bad params');
  });

  it('does not short-circuit loyalty campaign messages to compiler spine', async () => {
    const result = await integrateDeepSeekMultiAgentIntake({
      userMessage: 'Create a loyalty campaign',
      classification: { tool: 'general_chat', executionPath: 'proactive_plan' },
      missionId: 'mission-loyalty',
    });

    expect(result.handled).toBe(false);
  });

  it('skips pipeline entirely for compiler spine when not in shadow mode', async () => {
    const result = await integrateDeepSeekMultiAgentIntake({
      userMessage: 'Create a loyalty campaign',
      classification: { _compilerEligible: true, tool: 'create_campaign' },
    });

    expect(result.handled).toBe(false);
    expect(result.classification?._deepSeekMultiAgent).toBeUndefined();
  });

  it('shadow mode does not short-circuit intake', async () => {
    process.env.MULTI_AGENT_SHADOW = 'true';
    const result = await integrateDeepSeekMultiAgentIntake({
      userMessage: "Open beauty store 'Glow Beauty' in Melbourne",
      classification: { tool: 'create_store' },
    });

    expect(result.handled).toBe(false);
    expect(result.classification?._deepSeekMultiAgent?.shadowMode).toBe(true);
  });

  it('builds topology from plan steps', () => {
    const response = buildShowExecutionPlanFromDeepSeek({
      missionId: 'M2',
      status: 'completed',
      intent: Intent.STORE_SETUP,
      plan: {
        steps: [{ id: 'a', action: 'step_a', parameters: {} }],
        requiredTools: [],
        estimatedComplexity: 'low',
        dependencies: {},
      },
      finalResponse: 'done',
      telemetry: {
        missionId: 'M2',
        timestamp: new Date(),
        duration: 1,
        agentsUsed: [],
        tokenUsage: { total: 0, byAgent: {} },
        thinkingMode: { type: 'enabled', reasoningEffort: 'low' },
        parallelLimit: 5,
        hitlEnabled: false,
        retries: 0,
        errors: [],
      },
    });

    expect(response.executionPlan?.topology?.nodes?.length).toBe(1);
  });
});
