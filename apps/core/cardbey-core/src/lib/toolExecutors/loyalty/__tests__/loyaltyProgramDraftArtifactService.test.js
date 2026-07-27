/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  writeMetadata: vi.fn(async () => ({})),
  readMetadata: vi.fn(async () => ({})),
  broadcastMissionArtifact: vi.fn(),
  findUnique: vi.fn(async () => null),
  createSuitcaseItem: vi.fn(async () => ({ item: { id: 'suit_1' }, created: true, skipped: false })),
}));

vi.mock('../../../persistence/metadataWriter.js', () => ({
  writeMetadata: (...args) => mocks.writeMetadata(...args),
  readMetadata: (...args) => mocks.readMetadata(...args),
}));

vi.mock('../../../../realtime/simpleSse.js', () => ({
  broadcastMissionArtifact: (...args) => mocks.broadcastMissionArtifact(...args),
}));

vi.mock('../../../prisma.js', () => ({
  getPrismaClient: () => ({
    business: { findUnique: (...args) => mocks.findUnique(...args) },
  }),
}));

vi.mock('../saveGeneratedLoyaltyToSuitcase.js', () => ({
  saveGeneratedLoyaltyToSuitcase: vi.fn(async () => ({
    ok: true,
    item: { id: 'suit_1' },
    created: true,
    skipped: false,
  })),
}));

import {
  buildLoyaltyProgramDraftMissionArtifact,
  persistAndEmitLoyaltyProgramDraftArtifact,
  extractLoyaltyDraftArtifactFromNodeRun,
} from '../loyaltyProgramDraftArtifactService.js';

describe('loyaltyProgramDraftArtifactService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readMetadata.mockResolvedValue({ missionDeliveredArtifacts: [] });
    mocks.findUnique.mockResolvedValue({
      id: 'store_1',
      name: 'Demo Café',
      tagline: null,
      type: 'cafe',
      primaryColor: '#6F4E37',
      secondaryColor: '#F5E6D3',
      avatarImageUrl: null,
      heroImageUrl: null,
      logo: null,
    });
  });

  it('buildLoyaltyProgramDraftMissionArtifact includes reward, branding theme, and QR', async () => {
    const artifact = await buildLoyaltyProgramDraftMissionArtifact({
      missionId: 'mission_1',
      storeId: 'store_1',
      storeName: 'Demo Café',
      draft: {
        programName: 'Demo Rewards',
        reward: 'Free coffee',
        requiredStamps: 6,
        rewardRule: 'Buy 6, get Free coffee',
      },
    });
    expect(artifact.type).toBe('generated_loyalty_program');
    expect(artifact.subtype).toBe('loyalty');
    expect(artifact.status).toBe('awaiting_owner_review');
    expect(artifact.payload.reward).toBe('Free coffee');
    expect(artifact.payload.stampThreshold).toBe(6);
    expect(artifact.storeName).toBe('Demo Café');
    expect(artifact.payload.qr?.url).toContain('/l/');
    expect(artifact.payload.theme?.primaryColor).toBeTruthy();
  });

  it('buildLoyaltyProgramDraftMissionArtifact includes rule and cardTopology in payload', async () => {
    const rule = {
      programType: 'STAMP_CARD',
      purchaseItem: 'Coffee',
      purchasesRequired: 7,
      rewardQuantity: 1,
      rewardItem: 'free coffee',
      repeatMode: 'INDEFINITE',
    };
    const cardTopology = {
      source: 'APPROVED',
      documentType: 'LOYALTY_CARD',
      rows: 4,
      columns: 8,
      cells: Array.from({ length: 32 }, (_, i) => ({
        row: Math.floor(i / 8),
        column: i % 8,
        role: (i + 1) % 8 === 0 ? 'REWARD' : 'PURCHASE',
      })),
      cycles: [],
      confidence: 0.9,
      reviewRequired: false,
    };
    const artifact = await buildLoyaltyProgramDraftMissionArtifact({
      missionId: 'mission_1',
      storeId: 'store_1',
      storeName: 'Bellamy Cafe',
      draft: {
        programName: 'Bellamy Rewards',
        reward: 'free coffee',
        stampThreshold: 7,
        rule,
        cardTopology,
        cardFooterText: 'Buy 7 · GET 1 FREE COFFEE',
      },
    });
    expect(artifact.payload.rule).toEqual(rule);
    expect(artifact.payload.cardTopology).toEqual(cardTopology);
    expect(artifact.payload.program?.rule).toEqual(rule);
    expect(artifact.payload.program?.cardTopology).toEqual(cardTopology);
    expect(artifact.payload.stampThreshold).toBe(7);
    expect(artifact.payload.rules).toContain('7');
    expect(artifact.payload.rules).not.toContain('Buy 20');
  });

  it('persistAndEmitLoyaltyProgramDraftArtifact writes metadata and emits SSE', async () => {
    mocks.readMetadata.mockResolvedValue({ missionDeliveredArtifacts: [], userId: 'user_1' });
    const artifact = await persistAndEmitLoyaltyProgramDraftArtifact('mission_1', {
      storeId: 'store_1',
      storeName: 'Demo Café',
      userId: 'user_1',
      draft: { reward: 'Free coffee', stampThreshold: 6, programName: 'Demo Rewards' },
    });
    expect(mocks.writeMetadata).toHaveBeenCalledWith(
      'mission_1',
      expect.objectContaining({
        loyaltyProgramDraftArtifact: expect.objectContaining({ type: 'generated_loyalty_program' }),
        multiAgentCompletionMessage: 'Loyalty program ready.',
      }),
    );
    expect(mocks.broadcastMissionArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: 'mission_1',
        subtype: 'generated_loyalty_program',
        payload: expect.objectContaining({ type: 'generated_loyalty_program' }),
      }),
    );
    expect(artifact.suitcaseItem).toEqual({ id: 'suit_1' });
  });

  it('extractLoyaltyDraftArtifactFromNodeRun reads present_review output', () => {
    const artifact = { id: 'a1', type: 'generated_loyalty_program' };
    const found = extractLoyaltyDraftArtifactFromNodeRun({
      status: 'completed',
      toolOutputs: {
        'loyalty.present_review': { artifact, artifacts: [artifact] },
      },
    });
    expect(found).toEqual(artifact);
  });
});
