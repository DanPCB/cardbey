/**
 * @vitest-environment node
 *
 * OQ-002: Store identity drift after owner-input resume.
 * Resolved topology store must win over stale ambient context.storeId.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  writeMetadata: vi.fn(async () => ({})),
  persistLoyaltyProgramDraftToStore: vi.fn(async ({ storeId, draft }) => ({
    ok: true,
    loyaltyProgramId: 'lp_abc',
    loyaltyProgramDraft: { ...draft, storeId, loyaltyProgramId: 'lp_abc' },
  })),
  persistAndEmitLoyaltyProgramDraftArtifact: vi.fn(async (_missionId, params) => ({
    id: 'artifact_abc',
    type: 'generated_loyalty_program',
    storeId: params.storeId,
    storeName: params.storeName,
    data: { ...params.draft, storeId: params.storeId },
    payload: { storeId: params.storeId },
    suggestedActions: [],
  })),
  saveGeneratedLoyaltyToSuitcase: vi.fn(async ({ storeId }) => ({
    ok: true,
    item: { id: 'suitcase_abc', storeId },
    created: true,
    skipped: false,
  })),
}));

vi.mock('../../../persistence/metadataWriter.js', () => ({
  writeMetadata: (...args) => mocks.writeMetadata(...args),
  readMetadata: vi.fn(async () => ({})),
}));

vi.mock('../persistLoyaltyProgramDraftToStore.js', () => ({
  persistLoyaltyProgramDraftToStore: (...args) => mocks.persistLoyaltyProgramDraftToStore(...args),
}));

vi.mock('../loyaltyProgramDraftArtifactService.js', () => ({
  persistAndEmitLoyaltyProgramDraftArtifact: (...args) =>
    mocks.persistAndEmitLoyaltyProgramDraftArtifact(...args),
}));

vi.mock('../saveGeneratedLoyaltyToSuitcase.js', () => ({
  saveGeneratedLoyaltyToSuitcase: (...args) => mocks.saveGeneratedLoyaltyToSuitcase(...args),
}));

vi.mock('../loyaltyProgressiveArtifact.js', () => ({
  emitLoyaltyProgressiveArtifact: vi.fn(async () => {}),
  progressivePartialFromDraft: vi.fn(() => ({})),
  progressivePartialFromStoreContext: vi.fn(() => ({})),
}));

import {
  resolveLoyaltyTopologyStoreId,
  executePersistDraft,
  executePresentReview,
} from '../loyaltyStageHandlers.js';

const TOPOLOGY_STORE_ID = 'abc';
const STALE_AMBIENT_STORE_ID = 'cmqognxad004yjvt0i1z7kn2n';

function ownerInputResumeContext(stepOutputs = {}) {
  return {
    missionId: 'mission_oq002',
    userId: 'user_1',
    tenantId: 'user_1',
    storeId: STALE_AMBIENT_STORE_ID,
    ownerInput: { reward: 'Free coffee', stampThreshold: 10 },
    stepOutputs: {
      loyalty_load_store_context: {
        storeContext: {
          storeId: TOPOLOGY_STORE_ID,
          name: 'ABC Store',
          storeName: 'ABC Store',
        },
      },
      ...stepOutputs,
    },
  };
}

describe('loyalty store resolution (OQ-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('resolveLoyaltyTopologyStoreId prefers topology storeContext over ambient context.storeId', () => {
    const resolved = resolveLoyaltyTopologyStoreId({
      priors: {
        storeContext: { storeId: TOPOLOGY_STORE_ID, name: 'ABC Store' },
      },
      input: {},
      context: { storeId: STALE_AMBIENT_STORE_ID },
      rawDraft: { storeId: 'draft_store' },
    });

    expect(resolved).toBe(TOPOLOGY_STORE_ID);
    expect(console.warn).toHaveBeenCalledWith(
      `[loyalty.store_resolution] stale context.storeId ignored preferred=${TOPOLOGY_STORE_ID} ambient=${STALE_AMBIENT_STORE_ID}`,
    );
  });

  it('executePersistDraft persists under topology store after owner-input resume', async () => {
    const result = await executePersistDraft(
      {
        loyaltyDraft: {
          programName: 'ABC Rewards',
          reward: 'Free coffee',
          requiredStamps: 10,
        },
      },
      ownerInputResumeContext(),
    );

    expect(result.status).toBe('ok');
    expect(mocks.persistLoyaltyProgramDraftToStore).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: TOPOLOGY_STORE_ID }),
    );
    expect(result.output.loyaltyProgramDraft.storeId).toBe(TOPOLOGY_STORE_ID);
    expect(result.output.draftRecord.storeId).toBe(TOPOLOGY_STORE_ID);
    expect(mocks.writeMetadata).toHaveBeenCalledWith(
      'mission_oq002',
      expect.objectContaining({ storeId: TOPOLOGY_STORE_ID }),
    );
    expect(console.warn).toHaveBeenCalledWith(
      `[loyalty.store_resolution] stale context.storeId ignored preferred=${TOPOLOGY_STORE_ID} ambient=${STALE_AMBIENT_STORE_ID}`,
    );
  });

  it('executePresentReview targets topology store for review artifact and suitcase', async () => {
    const result = await executePresentReview(
      {
        loyaltyProgramDraft: {
          programName: 'ABC Rewards',
          reward: 'Free coffee',
          requiredStamps: 10,
          storeId: STALE_AMBIENT_STORE_ID,
        },
      },
      ownerInputResumeContext({
        loyalty_persist_draft: {
          loyaltyProgramDraft: {
            programName: 'ABC Rewards',
            reward: 'Free coffee',
            requiredStamps: 10,
            storeId: STALE_AMBIENT_STORE_ID,
          },
        },
      }),
    );

    expect(result.status).toBe('ok');
    expect(mocks.persistAndEmitLoyaltyProgramDraftArtifact).toHaveBeenCalledWith(
      'mission_oq002',
      expect.objectContaining({ storeId: TOPOLOGY_STORE_ID }),
    );
    expect(result.output.ownerReviewArtifact.storeId).toBe(TOPOLOGY_STORE_ID);
    expect(result.output.loyaltyProgramDraft.storeId).toBe(TOPOLOGY_STORE_ID);
    expect(console.warn).toHaveBeenCalledWith(
      `[loyalty.store_resolution] stale context.storeId ignored preferred=${TOPOLOGY_STORE_ID} ambient=${STALE_AMBIENT_STORE_ID}`,
    );
  });
});
