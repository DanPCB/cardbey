/**
 * @vitest-environment node
 */
import { describe, expect, it, afterEach } from 'vitest';
import { normalizeToUnifiedGraph } from '../../evidence/missionEvidenceGraphService.js';
import { selectNextCapability } from '../reasoningCapabilityRegistry.js';
import { scoreFullCardProcessing } from '../loyaltyFullCardProcessing.js';
import {
  isReasoningPrimaryEnabledForMission,
  shouldSkipDagAfterReasoning,
  isLoyaltyCardMission,
} from '../reasoningPrimaryExecution.js';

describe('reasoningPrimaryExecution', () => {
  const prevPrimary = process.env.PHASE2_REASONING_PRIMARY;
  const prevActive = process.env.PHASE2_ACTIVE_REASONING;
  const prevRollout = process.env.PHASE2_REASONING_ROLLOUT_PERCENT;

  afterEach(() => {
    if (prevPrimary === undefined) delete process.env.PHASE2_REASONING_PRIMARY;
    else process.env.PHASE2_REASONING_PRIMARY = prevPrimary;
    if (prevActive === undefined) delete process.env.PHASE2_ACTIVE_REASONING;
    else process.env.PHASE2_ACTIVE_REASONING = prevActive;
    if (prevRollout === undefined) delete process.env.PHASE2_REASONING_ROLLOUT_PERCENT;
    else process.env.PHASE2_REASONING_ROLLOUT_PERCENT = prevRollout;
  });

  it('requires PHASE2_REASONING_PRIMARY and active reasoning rollout', () => {
    process.env.PHASE2_ACTIVE_REASONING = 'true';
    process.env.PHASE2_REASONING_ROLLOUT_PERCENT = '100';
    process.env.PHASE2_REASONING_PRIMARY = 'false';
    expect(isReasoningPrimaryEnabledForMission('m1').enabled).toBe(false);

    process.env.PHASE2_REASONING_PRIMARY = 'true';
    expect(isReasoningPrimaryEnabledForMission('m1').enabled).toBe(true);
  });

  it('detects loyalty card missions', () => {
    expect(isLoyaltyCardMission('setup_loyalty_program', {})).toBe(true);
    expect(isLoyaltyCardMission('launch_campaign', {})).toBe(false);
  });

  it('skips DAG when primary loop completes without deferTopology', () => {
    expect(
      shouldSkipDagAfterReasoning({
        reasoningPrimary: true,
        deferTopology: false,
        actionResult: { status: 'ok', capabilityId: 'loyalty.present_review' },
      }),
    ).toBe(true);
    expect(
      shouldSkipDagAfterReasoning({
        reasoningPrimary: true,
        deferTopology: true,
        topology: { nodes: [] },
      }),
    ).toBe(false);
  });
});

describe('loyalty.full_card_processing capability', () => {
  const prevPrimary = process.env.PHASE2_REASONING_PRIMARY;

  afterEach(() => {
    if (prevPrimary === undefined) delete process.env.PHASE2_REASONING_PRIMARY;
    else process.env.PHASE2_REASONING_PRIMARY = prevPrimary;
  });

  it('ranks above analyze_attachment when primary mode and image present', () => {
    process.env.PHASE2_REASONING_PRIMARY = 'true';
    const graph = normalizeToUnifiedGraph({
      graphId: 'g-primary',
      missionId: 'm-primary',
      nodes: [],
      decisions: [],
      conflicts: [],
      phase: 'observe',
      attachments: [{ attachmentId: 'att-1', mimeType: 'image/jpeg' }],
    });
    expect(scoreFullCardProcessing(graph)).toBe(120);
    const next = selectNextCapability(graph);
    expect(next?.id).toBe('loyalty.full_card_processing');
  });
});
