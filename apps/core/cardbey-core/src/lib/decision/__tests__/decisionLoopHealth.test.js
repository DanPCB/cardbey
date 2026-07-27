import { describe, expect, it, beforeEach } from 'vitest';
import {
  getDecisionLoopHealth,
  recordBeliefLoad,
  recordDecisionLoopTurn,
  resetDecisionLoopHealthForTests,
  isDecisionLoopActive,
} from '../decisionLoopHealth.js';

describe('decisionLoopHealth', () => {
  beforeEach(() => {
    resetDecisionLoopHealthForTests();
  });

  it('reports running after startup validation marker', () => {
    recordBeliefLoad();
    recordDecisionLoopTurn({ nextStep: 'present_options' });
    const health = getDecisionLoopHealth();
    expect(health.belief.loadCount).toBe(1);
    expect(health.lastDecision?.summary?.nextStep).toBe('present_options');
  });

  it('isDecisionLoopActive is false when authority off and no startup marker', () => {
    process.env.INTAKE_DECISION_LOOP_AUTHORITY = 'false';
    expect(isDecisionLoopActive()).toBe(false);
  });
});
