/**
 * Reviewer Agent (v0) checklist tests.
 * - duplicate steps -> changes_requested (HIGH)
 * - R3 without approval -> changes_requested (HIGH)
 * - stale businessProfileSource -> changes_requested (HIGH)
 * - clean plan -> approved
 * Gating: only HIGH issues block; MED/LOW allow execution with banner.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAgentMessageFindFirst = vi.fn();
const mockMissionFindUnique = vi.fn();
vi.mock('../src/db/prisma.js', () => ({
  getPrismaClient: () => ({
    agentMessage: { findFirst: mockAgentMessageFindFirst },
    mission: { findUnique: mockMissionFindUnique },
  }),
}));

const MISSION_ID = 'mission-reviewer-test';
const PLAN_MSG_ID = 'plan-msg-1';

describe('reviewerExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function runReviewer(planPayload, missionContext = {}, opts = {}) {
    mockAgentMessageFindFirst.mockResolvedValue({
      id: PLAN_MSG_ID,
      payload: planPayload,
      content: { text: planPayload?.title || '' },
    });
    mockMissionFindUnique.mockResolvedValue({
      context: missionContext,
    });
    const { runReviewerInProcess } = await import('../src/lib/reviewerExecutor.js');
    return runReviewerInProcess(MISSION_ID, PLAN_MSG_ID, opts);
  }

  it('duplicate steps -> changes_requested', async () => {
    const result = await runReviewer({
      title: 'Test plan',
      steps: [
        { id: 's0', label: 'Research market', status: 'todo' },
        { id: 's1', label: 'research market', status: 'todo' },
      ],
    });
    expect(result.status).toBe('changes_requested');
    const dup = result.issues.find((i) => i.code === 'DUPLICATE_STEP');
    expect(dup).toBeDefined();
    expect(dup.severity).toBe('high');
    expect(dup.suggestedFix).toBeDefined();
  });

  it('R3 without approval -> changes_requested', async () => {
    // Reviewer checks payload.suggestions when present (e.g. from execution_suggestions). Pass
    // a suggestion with risk R3 and requiresApproval false to trigger the blocker.
    const result = await runReviewer({
      title: 'Plan',
      steps: [{ id: 's0', label: 'High-risk step', status: 'todo' }],
      suggestions: [
        { id: 's0', label: 'High-risk step', agentKey: 'planner', intent: 'follow_up', risk: 'R3', requiresApproval: false },
      ],
    });
    expect(result.status).toBe('changes_requested');
    const r3Issue = result.issues.find((i) => i.code === 'R3_WITHOUT_APPROVAL');
    expect(r3Issue).toBeDefined();
    expect(r3Issue.severity).toBe('high');
    expect(r3Issue.suggestedFix).toBeDefined();
  });

  it('stale businessProfileSource -> changes_requested', async () => {
    const result = await runReviewer(
      {
        title: 'Plan',
        steps: [{ id: 's0', label: 'Research market', status: 'todo' }],
        triggerMessageId: 'trigger-A',
      },
      {
        businessProfileSource: { triggerMessageId: 'trigger-B', researchMessageId: 'ocr-msg-1' },
      },
      { triggerMessageId: 'trigger-A' }
    );
    expect(result.status).toBe('changes_requested');
    const stale = result.issues.find((i) => i.code === 'STALE_BUSINESS_PROFILE_SOURCE');
    expect(stale).toBeDefined();
    expect(stale.severity).toBe('high');
  });

  it('clean plan -> approved', async () => {
    const result = await runReviewer(
      {
        title: 'Marketing plan',
        steps: [
          { id: 's0', label: 'Research market', status: 'todo' },
          { id: 's1', label: 'Define target customers', status: 'todo' },
        ],
      },
      {}
    );
    expect(result.status).toBe('approved');
    expect(result.issues.length).toBe(0);
    expect(result.summary).toContain('passed');
  });

  it('MED-only issues -> approved with banner', async () => {
    // MISSING_DELIVERABLES is medium when plan text mentions "deliverables" but payload has no deliverables array.
    const res = await runReviewer(
      {
        title: 'Plan with deliverables but none listed',
        steps: [{ id: 's0', label: 'Research', status: 'todo' }],
      },
      {}
    );
    expect(res.status).toBe('approved');
    const missingDel = res.issues.find((i) => i.code === 'MISSING_DELIVERABLES');
    expect(missingDel).toBeDefined();
    expect(missingDel.severity).toBe('medium');
  });
});
