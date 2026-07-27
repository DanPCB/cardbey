/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  allTopologyNodesTerminal,
  computeTerminalMissionOutcome,
  hasLoyaltyProgramDraftArtifactInMetadata,
} from '../missionOutcomeResolution.js';

describe('missionOutcomeResolution', () => {
  it('detects loyalty draft artifact in metadata', () => {
    expect(
      hasLoyaltyProgramDraftArtifactInMetadata({
        loyaltyProgramDraftArtifact: { type: 'generated_loyalty_program' },
      }),
    ).toBe(true);
  });

  it('reconciles false pipeline failure to completed when draft and nodes are healthy', () => {
    const outcome = computeTerminalMissionOutcome({
      missionOutcome: {
        status: 'failed',
        completedNodes: ['a'],
        failedNodes: [],
        artifacts: [{ id: 'art_1', type: 'generated_loyalty_program' }],
        persistedEntities: [],
        warnings: [],
        errors: [{ code: 'MANDATORY_ARTIFACT_MISSING', message: 'missing' }],
      },
      metadata: {
        loyaltyProgramDraftArtifact: { type: 'generated_loyalty_program' },
      },
      nodeStatuses: {
        loyalty_load_store: 'completed',
        loyalty_present_review: 'skipped',
      },
      missionFamily: 'loyalty',
      pipelineStatus: 'failed',
    });

    expect(outcome.status).toBe('completed');
    expect(outcome.reconciled).toBe(true);
    expect(outcome.rationale).toMatch(/Draft artifact exists/i);
  });

  it('marks partial when draft exists but nodes incomplete', () => {
    const outcome = computeTerminalMissionOutcome({
      missionOutcome: {
        status: 'failed',
        completedNodes: [],
        failedNodes: ['b'],
        artifacts: [{ id: 'art_1', type: 'generated_loyalty_program' }],
        persistedEntities: [],
        warnings: [],
        errors: [{ code: 'NODE_FAILED', message: 'failed' }],
      },
      metadata: {
        loyaltyProgramDraftArtifact: { type: 'generated_loyalty_program' },
      },
      nodeStatuses: { a: 'completed', b: 'failed' },
      missionFamily: 'loyalty',
      pipelineStatus: 'failed',
    });

    expect(outcome.status).toBe('partial');
  });

  it('allTopologyNodesTerminal requires completed or skipped', () => {
    expect(allTopologyNodesTerminal({ a: 'completed', b: 'skipped' })).toBe(true);
    expect(allTopologyNodesTerminal({ a: 'completed', b: 'failed' })).toBe(false);
  });
});
