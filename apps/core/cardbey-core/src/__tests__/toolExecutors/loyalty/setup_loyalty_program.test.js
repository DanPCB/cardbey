import { describe, expect, it, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  business: { findFirst: vi.fn() },
  loyaltyProgram: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  storePromo: { findMany: vi.fn(), create: vi.fn() },
  booking: { findMany: vi.fn() },
  product: { findMany: vi.fn() },
  missionPipeline: { findUnique: vi.fn(), update: vi.fn() },
}));

vi.mock('../../../lib/prisma.js', () => ({
  getPrismaClient: () => prismaMock,
}));

vi.mock('../../../../services/suitcase/suitcaseItemService.js', () => ({
  createSuitcaseItem: vi.fn(async () => ({ item: { id: 'suitcase-1' } })),
}));

vi.mock('../../../lib/orchestrator/advanceProactivePipelineStep.js', () => ({
  advanceProactivePipelineStep: vi.fn(async () => ({ ok: true })),
}));

import { execute as setupLoyaltyProgram } from '../../../lib/toolExecutors/loyalty/setup_loyalty_program.js';
import { PROACTIVE_RUNWAY_TOOL_SET, resolveRunwayDispatchToolName } from '../../../lib/missionPlan/proactiveRunwayToolAllowlist.js';
import { getExecutor } from '../../../lib/toolExecutors/index.js';
import { advanceProactivePipelineStep } from '../../../lib/orchestrator/advanceProactivePipelineStep.js';

const runtimeCtx = { runtimeOwned: true, performerRuntimeOwned: true, userId: 'user-1' };

describe('setup_loyalty_program executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.business.findFirst.mockResolvedValue({
      id: 'store-1',
      name: 'Moc Vietnamese Restaurant',
      type: 'food',
      slug: 'moc-vietnamese',
    });
    prismaMock.booking.findMany.mockResolvedValue([]);
    prismaMock.product.findMany.mockResolvedValue([{ name: 'Pho', category: 'food', itemType: 'product' }]);
    prismaMock.storePromo.findMany.mockResolvedValue([]);
    prismaMock.loyaltyProgram.findFirst.mockResolvedValue(null);
    prismaMock.loyaltyProgram.create.mockResolvedValue({
      id: 'prog-1',
      name: 'Moc Vietnamese Restaurant Rewards',
      stampsRequired: 9,
      reward: '1 free item',
    });
    prismaMock.storePromo.create.mockResolvedValue({ id: 'promo-1', title: 'Loyalty program launch' });
    prismaMock.missionPipeline.findUnique.mockResolvedValue({ metadataJson: {}, executionMode: 'GUIDED_RUN' });
  });

  it('is registered on proactive runway allowlist with scanner aliases', () => {
    expect(PROACTIVE_RUNWAY_TOOL_SET.has('setup_loyalty_program')).toBe(true);
    expect(resolveRunwayDispatchToolName('setup_loyalty_campaign')).toBe('setup_loyalty_program');
    expect(resolveRunwayDispatchToolName('create_loyalty_program')).toBe('setup_loyalty_program');
    expect(resolveRunwayDispatchToolName('loyalty_from_card')).toBe('setup_loyalty_program');
    expect(resolveRunwayDispatchToolName('loyalty.configure-program')).toBe('setup_loyalty_program');
    expect(getExecutor('setup_loyalty_program')).toBeTruthy();
  });

  it('blocks when storeId is missing', async () => {
    const result = await setupLoyaltyProgram({}, { userId: 'user-1' });
    expect(result.status).toBe('blocked');
    expect(result.blocker?.message).toMatch(/Choose a store/i);
  });

  it('creates loyalty_program_draft artifact for valid store', async () => {
    const result = await setupLoyaltyProgram(
      { storeId: 'store-1', requirements: 'Buy 9 get 1 free' },
      { userId: 'user-1', missionId: 'mission-1' },
    );
    expect(result.status).toBe('ok');
    expect(result.output?.phase).toBe('awaiting_owner_review');
    expect(result.output?.loyaltyProgramDraft?.programName).toContain('Moc Vietnamese Restaurant');
    expect(result.output?.artifacts?.[0]?.type).toBe('loyalty_program_draft');
    expect(result.output?.evidence).toBeTruthy();
  });

  it('accepts preseededDraft from scanner extraction', async () => {
    const result = await setupLoyaltyProgram(
      {
        storeId: 'store-1',
        preseededDraft: {
          programName: 'Punch Card',
          requiredStamps: 8,
          reward: 'Free coffee',
          extractedFromImage: true,
          confidence: 0.9,
        },
      },
      { userId: 'user-1', missionId: 'mission-1' },
    );
    expect(result.status).toBe('ok');
    expect(result.output?.loyaltyProgramDraft?.requiredStamps).toBe(8);
    expect(result.output?.loyaltyProgramDraft?.reward).toMatch(/coffee/i);
    expect(result.output?.evidence).toContain('preseeded_scanner_data');
  });

  it('returns improvement path when loyalty program already exists', async () => {
    prismaMock.loyaltyProgram.findFirst.mockResolvedValue({
      id: 'existing-1',
      name: 'Old Rewards',
      stampsRequired: 10,
      reward: 'Free item',
    });
    const result = await setupLoyaltyProgram({ storeId: 'store-1' }, { userId: 'user-1' });
    expect(result.status).toBe('ok');
    expect(result.output?.loyaltyProgramDraft?.mode).toBe('improvement');
    expect(result.output?.loyaltyProgramDraft?.priorProgram?.id).toBe('existing-1');
  });

  it('applies approved draft through mission-write helper with runtime authority', async () => {
    const draft = {
      programName: 'Moc Rewards',
      requiredStamps: 9,
      reward: '1 free pho',
      artifactId: 'loyalty-draft-abc',
      offers: [{ headline: 'Join Moc Rewards', rewardDescription: '1 free pho' }],
    };
    const result = await setupLoyaltyProgram(
      { storeId: 'store-1', confirmed: true, draft },
      { ...runtimeCtx, missionId: 'mission-1', tenantId: 'user-1' },
    );
    expect(result.status).toBe('ok');
    expect(result.output?.phase).toBe('applied');
    expect(result.output?.writeResult?.toolKey).toBe('setup_loyalty_program');
    expect(result.output?.writeResult?.loyaltyProgramId).toBe('prog-1');
    expect(prismaMock.loyaltyProgram.create).toHaveBeenCalled();
    expect(advanceProactivePipelineStep).toHaveBeenCalled();
  });
});
