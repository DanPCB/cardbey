import { describe, it, expect } from 'vitest';
import {
  analyzeMarketIntentForAdmin,
  MarketIntentAdminError,
  mapAdminSourceType,
} from '../marketIntentAdminService.js';
import { createMockLlmGenerate } from '../../__tests__/mockMarketIntentLlm.js';

const mockLlm = createMockLlmGenerate();

const baseInput = {
  sourceType: 'social_post' as const,
  permitted: true as const,
  skipNetwork: true,
  llmGenerate: mockLlm,
};

describe('marketIntentAdminService', () => {
  it('rejects when permitted is false', async () => {
    await expect(
      analyzeMarketIntentForAdmin({
        ...baseInput,
        rawText: 'test signal',
        permitted: false,
      }),
    ).rejects.toThrow(MarketIntentAdminError);
  });

  it('rejects empty rawText', async () => {
    await expect(
      analyzeMarketIntentForAdmin({
        ...baseInput,
        rawText: '   ',
      }),
    ).rejects.toThrow(/rawText is required/);
  });

  it('maps admin source types to canonical G1 types', () => {
    expect(mapAdminSourceType('social_post')).toBe('social_post_copy');
    expect(mapAdminSourceType('website')).toBe('website_snippet');
  });

  it('runs G1-G4 for used vehicle — commercial but low fit', async () => {
    const result = await analyzeMarketIntentForAdmin({
      ...baseInput,
      rawText: 'Selling my used Toyota Camry 2018, $5,500, low kms.',
    });
    expect(result.stageStatus.g1).toBe('ok');
    expect(result.analysis?.classification).toBe('COMMERCIAL');
    expect(['LOW_FIT', 'NOT_A_CARDBEY_OPPORTUNITY']).toContain(
      result.opportunityAssessment?.overallFitBand,
    );
  });

  it('runs G1-G4 for non-commercial signal', async () => {
    const result = await analyzeMarketIntentForAdmin({
      ...baseInput,
      rawText: 'Happy birthday to my sister!',
    });
    expect(result.analysis?.classification).toBe('NON_COMMERCIAL');
  });

  it('runs G1-G4 for manufacturer signal with capability matches', async () => {
    const result = await analyzeMarketIntentForAdmin({
      ...baseInput,
      rawText:
        'Chúng tôi là nhà sản xuất bao bì thực phẩm bền vững tại Việt Nam và đang tìm nhà phân phối tại Australia.',
    });
    expect(result.stageStatus.g1).toBe('ok');
    expect(result.stageStatus.g3).toBe('ok');
    expect(result.opportunityAssessment?.primaryMatches?.length).toBeGreaterThan(0);
    expect(result.brief?.sections).toBeDefined();
  });

  it('preserves partial status when g4 fails gracefully', async () => {
    const result = await analyzeMarketIntentForAdmin({
      ...baseInput,
      rawText: 'EcoPack Vietnam seeking Australian distributors for sustainable packaging.',
    });
    expect(result.signal).not.toBeNull();
    expect(result.analysis).not.toBeNull();
    expect(['READY', 'PARTIAL']).toContain(result.status);
    expect(result.timingsMs?.total).toBeGreaterThanOrEqual(0);
  });

  it('aborts when abortSignal is triggered mid-pipeline', async () => {
    const controller = new AbortController();
    const promise = analyzeMarketIntentForAdmin({
      ...baseInput,
      rawText: 'EcoPack Vietnam seeking Australian distributors for sustainable packaging.',
      abortSignal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'request_aborted' });
  });
});
