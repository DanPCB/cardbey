import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/toolExecutors/loyalty/loyaltyCardVisionExtract.js', () => ({
  extractLoyaltyCardFromImage: vi.fn(async () => ({
    ok: true,
    preseededDraft: {
      programName: 'Cafe Rewards',
      requiredStamps: 8,
      reward: 'Free coffee',
      confidence: 0.9,
      extractedFromImage: true,
    },
    ocrText: 'Buy 8 get 1 free coffee',
  })),
}));

vi.mock('../../ai/engines/index.js', () => ({
  getTextEngine: () => ({
    generateText: vi.fn(async () => ({ text: '[]' })),
  }),
}));

import { runLoyaltyFromCard } from '../services/loyaltyFromCardService.js';

describe('loyaltyFromCardService extract-only', () => {
  it('does not auto-create LoyaltyProgram — returns preseeded handoff', async () => {
    const result = await runLoyaltyFromCard({
      tenantId: 'tenant-1',
      storeId: 'store-1',
      imageUrl: 'https://example.com/card.jpg',
    });

    expect(result.handoff?.action).toBe('setup_loyalty_program');
    expect(result.preseededDraft?.requiredStamps).toBe(8);
    expect(result.raw?.programId).toBeUndefined();
  });
});
