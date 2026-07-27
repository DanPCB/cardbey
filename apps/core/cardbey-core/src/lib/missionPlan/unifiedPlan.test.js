/**
 * Unit tests for getUnifiedExecutionPlans (M2 Unification). No server.
 */

import { describe, it, expect } from 'vitest';
import { getUnifiedExecutionPlans } from './unifiedPlan.js';

describe('getUnifiedExecutionPlans', () => {
  it('1. returns [] for empty/null context', () => {
    expect(getUnifiedExecutionPlans(null)).toEqual([]);
    expect(getUnifiedExecutionPlans(undefined)).toEqual([]);
    expect(getUnifiedExecutionPlans({})).toEqual([]);
  });

  it('2. returns orchestra plans from context.missionPlan map', () => {
    const plan1 = {
      planId: 'orchestra_j1',
      intentType: 'build_store',
      intentId: 'j1',
      createdAt: '2025-01-01T12:00:00.000Z',
      steps: [{ stepId: 'research', order: 1, agentType: 'ResearchAgent', label: 'Research', dependsOn: [], checkpoint: false, status: 'completed' }],
    };
    const context = { missionPlan: { j1: plan1 } };
    const plans = getUnifiedExecutionPlans(context);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toEqual(plan1);
    expect(plans[0].planId).toBe('orchestra_j1');
    expect(Array.isArray(plans[0].steps)).toBe(true);
  });

  it('3. returns chain plan adapted via chainPlanToExecutionPlan', () => {
    const chainPlan = {
      chainId: 'c1',
      suggestions: [
        { id: 's1', agentKey: 'research', intent: 'Research', requiresApproval: false },
        { id: 's2', agentKey: 'planner', intent: 'Plan', requiresApproval: true },
      ],
      cursor: 0,
    };
    const context = { chainPlan };
    const plans = getUnifiedExecutionPlans(context);
    expect(plans).toHaveLength(1);
    expect(plans[0].planId).toBe('chain_c1');
    expect(plans[0].intentType).toBe('chain_plan');
    expect(plans[0].intentId).toBe('c1');
    expect(plans[0].createdAt).toBe('');
    expect(Array.isArray(plans[0].steps)).toBe(true);
    expect(plans[0].steps.length).toBe(2);
  });

  it('4. returns both when both present — sorted most recent first', () => {
    const oldOrchestra = {
      planId: 'orchestra_old',
      intentType: 'build_store',
      intentId: 'old',
      createdAt: '2025-01-01T10:00:00.000Z',
      steps: [{ stepId: 'research', order: 1, agentType: 'ResearchAgent', label: 'R', dependsOn: [], checkpoint: false, status: 'pending' }],
    };
    const chainPlan = {
      chainId: 'ch',
      suggestions: [{ id: 's1', agentKey: 'research', intent: 'R', requiresApproval: false }],
      cursor: 0,
    };
    const context = { missionPlan: { old: oldOrchestra }, chainPlan };
    const plans = getUnifiedExecutionPlans(context);
    expect(plans).toHaveLength(2);
    expect(plans[0].planId).toBe('orchestra_old');
    expect(plans[1].planId).toBe('chain_ch');
  });

  it('5. each plan has valid ExecutionMissionPlan shape (planId, intentType, intentId, createdAt, steps[])', () => {
    const context = {
      missionPlan: {
        j1: {
          planId: 'orchestra_j1',
          intentType: 'build_store',
          intentId: 'j1',
          createdAt: '2025-01-02T00:00:00.000Z',
          steps: [{ stepId: 'research', order: 1, agentType: 'ResearchAgent', label: 'R', dependsOn: [], checkpoint: false, status: 'pending' }],
        },
      },
      chainPlan: { chainId: 'c1', suggestions: [{ id: 's1', agentKey: 'research', intent: 'R', requiresApproval: false }], cursor: 0 },
    };
    const plans = getUnifiedExecutionPlans(context);
    for (const plan of plans) {
      expect(plan).toHaveProperty('planId');
      expect(plan).toHaveProperty('intentType');
      expect(plan).toHaveProperty('intentId');
      expect(plan).toHaveProperty('createdAt');
      expect(Array.isArray(plan.steps)).toBe(true);
    }
  });

  it('6. chain plan with requiresApproval=true has checkpoint:true on the relevant step', () => {
    const chainPlan = {
      chainId: 'c1',
      suggestions: [
        { id: 's1', agentKey: 'research', intent: 'R', requiresApproval: false },
        { id: 's2', agentKey: 'planner', intent: 'P', requiresApproval: true },
      ],
      cursor: 0,
    };
    const context = { chainPlan };
    const plans = getUnifiedExecutionPlans(context);
    expect(plans).toHaveLength(1);
    expect(plans[0].steps[0].checkpoint).toBe(false);
    expect(plans[0].steps[1].checkpoint).toBe(true);
  });
});
