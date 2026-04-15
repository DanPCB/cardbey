/**
 * planIntent pure function tests. No DB; intentType + payload + context → plan shape and checkpoint flags.
 */

import { describe, it, expect } from 'vitest';
import { planIntent } from './planIntent.js';
import { AGENT_TYPE, STEP_STATUS } from './executionPlanTypes.js';

describe('planIntent', () => {
  const context = { missionId: 'm1', intentId: 'ir1' };

  it('returns ExecutionMissionPlan with planId, intentType, intentId, createdAt, steps', () => {
    const plan = planIntent('create_offer', {}, context);
    expect(plan).toHaveProperty('planId');
    expect(plan).toHaveProperty('intentType', 'create_offer');
    expect(plan).toHaveProperty('intentId', 'ir1');
    expect(plan).toHaveProperty('createdAt');
    expect(plan.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Array.isArray(plan.steps)).toBe(true);
  });

  it('create_offer: 3 steps (analyze → copy checkpoint → assign slot)', () => {
    const plan = planIntent('create_offer', {}, context);
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0]).toMatchObject({ order: 1, agentType: 'analyze_store', label: 'Analyze store', checkpoint: false, status: STEP_STATUS.PENDING });
    expect(plan.steps[1]).toMatchObject({ order: 2, agentType: 'generate_copy', label: 'Generate copy', checkpoint: true, status: STEP_STATUS.PENDING });
    expect(plan.steps[2]).toMatchObject({ order: 3, agentType: 'assign_promotion_slot', label: 'Assign promotion slot', checkpoint: false, status: STEP_STATUS.PENDING });
  });

  it('create_qr_for_offer: 2 steps (validate → generate)', () => {
    const plan = planIntent('create_qr_for_offer', {}, context);
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]).toMatchObject({ order: 1, agentType: 'validate_offer', label: 'Validate offer', checkpoint: false, status: STEP_STATUS.PENDING });
    expect(plan.steps[1]).toMatchObject({ order: 2, agentType: 'generate_qr', label: 'Generate QR', checkpoint: false, status: STEP_STATUS.PENDING });
  });

  it('generate_tags: 2 steps (analyze → generate)', () => {
    const plan = planIntent('generate_tags', {}, context);
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]).toMatchObject({ order: 1, agentType: 'analyze_store', label: 'Analyze store', checkpoint: false, status: STEP_STATUS.PENDING });
    expect(plan.steps[1]).toMatchObject({ order: 2, agentType: 'generate_tags', label: 'Generate tags', checkpoint: false, status: STEP_STATUS.PENDING });
  });

  it('rewrite_descriptions: 2 steps (analyze → rewrite)', () => {
    const plan = planIntent('rewrite_descriptions', {}, context);
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]).toMatchObject({ order: 1, agentType: 'analyze_store', label: 'Analyze store', checkpoint: false, status: STEP_STATUS.PENDING });
    expect(plan.steps[1]).toMatchObject({ order: 2, agentType: 'rewrite_descriptions', label: 'Rewrite descriptions', checkpoint: false, status: STEP_STATUS.PENDING });
  });

  it('generate_store_hero: 2 steps (analyze → generate hero checkpoint)', () => {
    const plan = planIntent('generate_store_hero', {}, context);
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]).toMatchObject({ order: 1, agentType: 'analyze_store', label: 'Analyze store', checkpoint: false, status: STEP_STATUS.PENDING });
    expect(plan.steps[1]).toMatchObject({ order: 2, agentType: 'generate_hero', label: 'Generate hero', checkpoint: true, status: STEP_STATUS.PENDING });
  });

  it('unknown intent type: 1 default analyze step', () => {
    const plan = planIntent('unknown_type', {}, context);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      agentType: 'analyze_store',
      label: 'Analyze store',
      checkpoint: false,
      status: STEP_STATUS.PENDING,
    });
  });

  it('uses context.intentId in plan', () => {
    const plan = planIntent('create_offer', {}, { intentId: 'ir99' });
    expect(plan.intentId).toBe('ir99');
  });

  it('handles missing context (defaults)', () => {
    const plan = planIntent('create_offer');
    expect(typeof plan.intentId).toBe('string');
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('handles trimmed intentType', () => {
    const plan = planIntent('  generate_tags  ', {}, context);
    expect(plan.intentType).toBe('  generate_tags  ');
    expect(plan.steps[0].agentType).toBe('analyze_store');
  });
});
