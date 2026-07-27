/**
 * LLM task planner gating: when USE_LLM_TASK_PLANNER=true, every registered intent type may use the planner
 * (llmTaskPlanner → LLM or registry_fallback). No per-intent allowlist in the registry.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  useLlmTaskPlannerEnv,
  isLlmPlannerEnabledForIntent,
  shouldOfferLlmTaskGraph,
} from './intentPipelineRegistry.js';

describe('intentPipelineRegistry LLM planner — all intent types', () => {
  let prevPlanner;

  beforeEach(() => {
    prevPlanner = process.env.USE_LLM_TASK_PLANNER;
  });

  afterEach(() => {
    if (prevPlanner === undefined) delete process.env.USE_LLM_TASK_PLANNER;
    else process.env.USE_LLM_TASK_PLANNER = prevPlanner;
  });

  it('isLlmPlannerEnabledForIntent is true for diverse intents when USE_LLM_TASK_PLANNER=true', () => {
    process.env.USE_LLM_TASK_PLANNER = 'true';
    expect(useLlmTaskPlannerEnv()).toBe(true);
    for (const t of [
      'launch_campaign',
      'generate_social_posts',
      'store_publish_preparation',
      'rewrite_descriptions',
      'code_fix',
      'screen_content_deployment',
      'store',
      'unknown_intent_xyz',
    ]) {
      expect(isLlmPlannerEnabledForIntent(t), t).toBe(true);
    }
  });

  it('isLlmPlannerEnabledForIntent is false when USE_LLM_TASK_PLANNER is unset', () => {
    delete process.env.USE_LLM_TASK_PLANNER;
    expect(useLlmTaskPlannerEnv()).toBe(false);
    expect(isLlmPlannerEnabledForIntent('launch_campaign')).toBe(false);
  });

  it('shouldOfferLlmTaskGraph is true for any non-empty missionType when planner env is on', () => {
    process.env.USE_LLM_TASK_PLANNER = 'true';
    expect(shouldOfferLlmTaskGraph('create_offer')).toBe(true);
    expect(shouldOfferLlmTaskGraph('improve_hero')).toBe(true);
    expect(shouldOfferLlmTaskGraph('')).toBe(false);
    expect(shouldOfferLlmTaskGraph(undefined)).toBe(false);
  });
});
