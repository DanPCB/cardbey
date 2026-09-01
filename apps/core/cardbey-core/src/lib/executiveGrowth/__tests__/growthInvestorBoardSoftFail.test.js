import { describe, expect, it, beforeEach } from 'vitest';
import { __resetFundraisingCampaignMemory } from '../../fundraisingCampaign/fundraisingCampaignService.js';
import { buildInvestorGrowthBoard } from '../growthInvestorService.js';

describe('buildInvestorGrowthBoard without MarketingCampaign', () => {
  beforeEach(() => {
    __resetFundraisingCampaignMemory();
  });

  it('returns Cardbey Seed 2026 objective without throwing when legacy pipeline unavailable', async () => {
    const board = await buildInvestorGrowthBoard();
    if (board.error === 'flag_off') {
      // Flags off in some CI envs — still a valid soft response
      expect(board.sends).toBe(false);
      return;
    }
    expect(board.ok).toBe(true);
    expect(board.fundraising?.objectiveId || board.fundraising?.name).toBeTruthy();
    expect(board.fundraising?.name).toMatch(/Cardbey Seed 2026/i);
    expect(board.sends).toBe(false);
    // Either legacy rows or graceful empty with campaign seeded
    expect(Array.isArray(board.engagements)).toBe(true);
  });
});
