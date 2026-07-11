/**
 * Fix generator tests.
 */

import { describe, it, expect } from 'vitest';
import { generateFixPlans } from '../fixGenerators/index.js';
import type { AuditIssue } from '../detectors/base.detector.js';

describe('fixGenerators', () => {
  it('generates UI form stuck fix plan', () => {
    const issue: AuditIssue = {
      id: 'ui-ui-form-stuck-abc12345',
      category: 'ui',
      severity: 'critical',
      title: 'UI stuck',
      description: 'Static form shown',
      location: 'useIntakeV2.ts',
      evidence: {},
      suggestedFix: 'Route responses',
      autoFixable: true,
    };
    const plans = generateFixPlans([issue]);
    expect(plans.length).toBe(1);
    expect(plans[0]?.guardrails.proposalOnly).toBe(true);
    expect(plans[0]?.files[0]?.path).toContain('useIntakeV2');
  });

  it('generates multi-store fix plan', () => {
    const issue: AuditIssue = {
      id: 'agent-multi-store-incomplete-abc12345',
      category: 'agent',
      severity: 'high',
      title: 'Multi-store incomplete',
      description: 'Missing fields',
      location: 'planner.agent.ts',
      evidence: {},
      suggestedFix: 'Clarification',
      autoFixable: true,
    };
    const plans = generateFixPlans([issue]);
    expect(plans.length).toBe(1);
    expect(plans[0]?.description).toContain('multiStorePlanHelpers');
  });
});
