/**
 * Task B — chainPlanToExecutionPlan adapter tests. Pure function; cursor → step status.
 */

import { describe, it, expect } from 'vitest';
import { chainPlanToExecutionPlan } from './chainPlanToExecutionPlan.js';
import { STEP_STATUS } from './executionPlanTypes.js';

describe('chainPlanToExecutionPlan', () => {
  it('returns empty plan for null or missing input', () => {
    expect(chainPlanToExecutionPlan(null)).toEqual({
      planId: '',
      intentType: 'chain_plan',
      intentId: '',
      createdAt: '',
      steps: [],
    });
    expect(chainPlanToExecutionPlan(undefined)).toEqual({
      planId: '',
      intentType: 'chain_plan',
      intentId: '',
      createdAt: '',
      steps: [],
    });
  });

  it('returns empty steps when suggestions is not an array', () => {
    expect(chainPlanToExecutionPlan({ chainId: 'c1', suggestions: {} }).steps).toEqual([]);
    expect(chainPlanToExecutionPlan({ suggestions: null }).steps).toEqual([]);
  });

  it('maps suggestions to steps with cursor 0: first running, rest pending', () => {
    const chainPlan = {
      chainId: 'msg_123',
      suggestions: [
        { id: 's1', agentKey: 'research', intent: 'Research market', requiresApproval: false },
        { id: 's2', agentKey: 'planner', intent: 'Create plan', requiresApproval: true },
      ],
      cursor: 0,
    };
    const plan = chainPlanToExecutionPlan(chainPlan);
    expect(plan.planId).toBe('chain_msg_123');
    expect(plan.intentId).toBe('msg_123');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]).toMatchObject({
      stepId: 's1',
      order: 1,
      agentType: 'ResearchAgent',
      label: 'Research market',
      checkpoint: false,
      status: STEP_STATUS.RUNNING,
    });
    expect(plan.steps[1]).toMatchObject({
      stepId: 's2',
      order: 2,
      agentType: 'PlannerAgent',
      label: 'Create plan',
      checkpoint: true,
      status: STEP_STATUS.PENDING,
    });
  });

  it('cursor mid-sequence: before completed, at cursor running, after pending', () => {
    const chainPlan = {
      chainId: 'msg_456',
      suggestions: [
        { id: 'a', agentKey: 'research', intent: 'Step 1' },
        { id: 'b', agentKey: 'planner', intent: 'Step 2' },
        { id: 'c', agentKey: 'planner', intent: 'Step 3' },
      ],
      cursor: 1,
    };
    const plan = chainPlanToExecutionPlan(chainPlan);
    expect(plan.steps[0].status).toBe(STEP_STATUS.COMPLETED);
    expect(plan.steps[1].status).toBe(STEP_STATUS.RUNNING);
    expect(plan.steps[2].status).toBe(STEP_STATUS.PENDING);
  });

  it('cursor at end: all steps completed', () => {
    const chainPlan = {
      chainId: 'msg_789',
      suggestions: [
        { id: 'x', agentKey: 'research', intent: 'Done 1' },
        { id: 'y', agentKey: 'planner', intent: 'Done 2' },
      ],
      cursor: 2,
    };
    const plan = chainPlanToExecutionPlan(chainPlan);
    expect(plan.steps[0].status).toBe(STEP_STATUS.COMPLETED);
    expect(plan.steps[1].status).toBe(STEP_STATUS.COMPLETED);
  });

  it('blocked_error: step at cursor has status failed', () => {
    const chainPlan = {
      chainId: 'msg_blocked',
      suggestions: [
        { id: 'p', agentKey: 'research', intent: 'Step 1' },
        { id: 'q', agentKey: 'planner', intent: 'Step 2' },
      ],
      cursor: 1,
      status: 'blocked_error',
    };
    const plan = chainPlanToExecutionPlan(chainPlan);
    expect(plan.steps[0].status).toBe(STEP_STATUS.COMPLETED);
    expect(plan.steps[1].status).toBe(STEP_STATUS.FAILED);
  });

  it('maps agentKey to agentType (research, planner, catalog, media)', () => {
    const chainPlan = {
      chainId: 'msg_map',
      suggestions: [
        { id: '1', agentKey: 'research', intent: 'R' },
        { id: '2', agentKey: 'planner', intent: 'P' },
        { id: '3', agentKey: 'catalog', intent: 'C' },
        { id: '4', agentKey: 'media', intent: 'M' },
        { id: '5', agentKey: 'unknown', intent: 'U' },
      ],
      cursor: 5,
    };
    const plan = chainPlanToExecutionPlan(chainPlan);
    expect(plan.steps[0].agentType).toBe('ResearchAgent');
    expect(plan.steps[1].agentType).toBe('PlannerAgent');
    expect(plan.steps[2].agentType).toBe('CatalogAgent');
    expect(plan.steps[3].agentType).toBe('MediaAgent');
    expect(plan.steps[4].agentType).toBe('PlannerAgent'); // fallback
  });

  it('uses step id when present, else step_N', () => {
    const chainPlan = {
      suggestions: [
        { id: 'suggest_1', agentKey: 'research', intent: 'A' },
        { agentKey: 'planner', intent: 'B' }, // no id
      ],
      cursor: 0,
    };
    const plan = chainPlanToExecutionPlan(chainPlan);
    expect(plan.steps[0].stepId).toBe('suggest_1');
    expect(plan.steps[1].stepId).toBe('step_1');
  });
});
