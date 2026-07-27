/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const ensureMock = vi.fn();

vi.mock('../../intake/intakeAttachmentBinding.js', () => ({
  ensureLoyaltyAttachmentAnalysisWithTopology: (...args) => ensureMock(...args),
  resolveLoyaltyMissionImageRef: (meta = {}, hints = {}) => ({
    imageRef: hints.imageRef ?? meta.intakeEvidence?.imageRef ?? null,
    evidenceId:
      hints.evidenceId ??
      meta.evidenceId ??
      meta.attachmentAnalysis?.evidenceId ??
      null,
    streamId: meta.intakeEvidence?.streamId ?? null,
    sessionId: meta.conversationSessionId ?? null,
  }),
}));

vi.mock('../../evidence/missionEvidenceGraphService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    seedMissionGraphFromLoyaltyMetadata: vi.fn(async () => null),
    loadGraphByMission: vi.fn(async () => null),
  };
});

vi.mock('../../kernel/missionContract.js', () => ({
  readMissionContract: vi.fn(async () => ({ evidenceId: 'ev_1' })),
}));

vi.mock('../../persistence/metadataWriter.js', () => ({
  writeMetadata: vi.fn(async (_missionId, patch) => ({ ...patch })),
}));

import { persistLoyaltyContractFromTopologyApproval } from '../loyaltyContractApproval.js';
import { buildLoyaltyCardTopologyFromDetected } from '../loyaltyTopologyBuild.js';

function coffeeTopology() {
  const cells = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      cells.push({
        row,
        column: col,
        role: col < 7 ? 'PURCHASE' : 'REWARD',
        text: col < 7 ? 'Coffee' : 'Free',
        confidence: 0.95,
      });
    }
  }
  return buildLoyaltyCardTopologyFromDetected(
    {
      rows: 4,
      columns: 8,
      cells,
      repeatedPattern: {
        direction: 'ROW',
        roles: [...Array(7).fill('PURCHASE'), 'REWARD'],
        repetitions: 4,
        confidence: 0.95,
      },
      overallConfidence: 0.95,
    },
    { source: 'VISION_EXTRACTED' },
  );
}

describe('persistLoyaltyContractFromTopologyApproval', () => {
  beforeEach(() => {
    ensureMock.mockReset();
  });

  it('re-hydrates topology from evidence before rejecting source-driven approval', async () => {
    const topology = coffeeTopology();
    ensureMock.mockResolvedValue({
      artifactType: 'loyalty_card',
      evidenceId: 'ev_1',
      preseededDraft: {
        extractedFromImage: true,
        sourceMode: 'SOURCE_DRIVEN',
        cardTopology: topology,
        rule: {
          programType: 'STAMP_CARD',
          purchasesRequired: 7,
          purchaseItem: 'Coffee',
          rewardItem: 'Free Coffee',
        },
        reward: 'Free Coffee',
        purchaseItem: 'Coffee',
      },
    });

    const result = await persistLoyaltyContractFromTopologyApproval(
      'mission_1',
      {
        storeId: 'store_1',
        goal: 'create a loyalty program from this card',
        evidenceId: 'ev_1',
        attachmentAnalysis: {
          artifactType: 'loyalty_card',
          evidenceId: 'ev_1',
          preseededDraft: { evidenceId: 'ev_1' },
        },
      },
      { storeId: 'store_1', userMessage: 'create a loyalty program from this card' },
    );

    expect(ensureMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.contract?.cardTopology?.rows).toBe(4);
    expect(result.contract?.cardTopology?.columns).toBe(8);
    expect(result.contract?.rule?.purchasesRequired).toBe(7);
  });

  it('returns incomplete when hydration still lacks topology for source-driven card', async () => {
    ensureMock.mockResolvedValue({
      artifactType: 'loyalty_card',
      evidenceId: 'ev_1',
      preseededDraft: { evidenceId: 'ev_1', extractedFromImage: true },
    });

    const result = await persistLoyaltyContractFromTopologyApproval(
      'mission_2',
      {
        storeId: 'store_1',
        goal: 'create a loyalty program from this card',
        evidenceId: 'ev_1',
      },
      { storeId: 'store_1', userMessage: 'create a loyalty program from this card' },
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe('LOYALTY_CREATION_CONTRACT_INCOMPLETE');
  });
});
