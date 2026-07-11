/**
 * Orchestrator integration tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SelfAuditOrchestrator } from '../orchestrator.js';
import type { AuditContext } from '../detectors/base.detector.js';

const context: AuditContext = {
  logs: ['DeepSeek multiAgent', 'Set up 3 stores in different cities', 'needs_clarification'],
  errors: [],
  metrics: { latency_p95: 10000 },
  codebase: {},
  uiState: {
    isStaticForm: true,
    hasDeepSeekResponse: false,
    userMessage: 'Set up 3 stores in different cities',
  },
  frontendEvents: [
    { type: 'user_message', payload: { message: 'Set up 3 stores in different cities' } },
    { type: 'form_render', payload: { formType: 'store_creation_draft' } },
  ],
};

describe('SelfAuditOrchestrator', () => {
  beforeEach(() => {
    process.env.SELF_AUDIT_AUTO_FIX = 'false';
  });

  it('runs detectors in parallel and finds UI form stuck', async () => {
    const orchestrator = new SelfAuditOrchestrator();
    const issues = await orchestrator.audit(context);
    const uiIssue = issues.find((i) => i.id.includes('ui-form-stuck'));
    expect(uiIssue).toBeDefined();
  });

  it('generates governed fix proposals', async () => {
    const orchestrator = new SelfAuditOrchestrator();
    const issues = await orchestrator.audit(context);
    const fixes = await orchestrator.generateFixes(issues);
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes[0]?.guardrails.noAutoApply).toBe(true);
    expect(fixes[0]?.guardrails.humanApprovalRequired).toBe(true);
  });

  it('rejects apply without confirmation', async () => {
    const orchestrator = new SelfAuditOrchestrator();
    const issues = await orchestrator.audit(context);
    const fixes = await orchestrator.generateFixes(issues);
    const result = await orchestrator.applyFixes(fixes, { confirmed: false });
    expect(result.success).toBe(false);
  });

  it('autoHeal returns structured result', async () => {
    const orchestrator = new SelfAuditOrchestrator();
    const result = await orchestrator.autoHeal(context);
    expect(result.issues).toBeDefined();
    expect(result.results.success).toBe(true);
  });
});
