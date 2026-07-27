import { describe, expect, it, vi } from 'vitest';
import {
  enrichMarketReport,
  formatCompetitorBlock,
  findPublishedCompetitors,
} from './marketResearchService.js';

describe('marketResearchService', () => {
  it('formatCompetitorBlock lists competitors with location', () => {
    const block = formatCompetitorBlock([
      { name: 'Rival Cafe', suburb: 'Fitzroy', region: 'VIC', description: 'Great coffee' },
    ]);
    expect(block).toContain('Rival Cafe');
    expect(block).toContain('Fitzroy');
  });

  it('formatCompetitorBlock handles empty list', () => {
    expect(formatCompetitorBlock([])).toContain('no published competitors');
  });

  it('enrichMarketReport includes competitors, trends, opportunities, actionable recommendations', () => {
    const report = enrichMarketReport(
      {
        topProductsToPromote: [{ productId: 'p1', productName: 'Latte', category: 'drinks', price: 5, reason: 'Popular' }],
        audienceProfile: { primarySegment: 'Coffee lovers', interests: ['coffee'], buyingMotivation: 'taste', pricePoint: 'mid-range' },
        marketContext: {
          categoryTrend: 'Specialty coffee growth',
          seasonalOpportunity: 'Winter warm drinks',
          competitorLandscape: 'Crowded local market',
          recommendedCampaignAngle: 'Artisan focus',
        },
        competitorAnalysis: {
          summary: 'Strong local competition',
          strengths: ['brand'],
          weaknesses: ['price'],
          positioning: 'Premium local',
          uniqueOpportunities: ['loyalty'],
        },
        trends: {
          consumer: 'Health-conscious',
          technology: 'Mobile ordering',
          marketing: 'Short video',
          competitiveLandscape: 'Fragmented',
        },
        opportunities: {
          marketGaps: ['late night'],
          underservedSegments: ['students'],
          pricingOpportunities: ['bundle deals'],
          productOpportunities: ['seasonal drinks'],
          confidence: 0.9,
        },
        actionableRecommendations: [
          {
            category: 'marketing',
            action: 'Launch weekend promo',
            expectedImpact: 'Higher foot traffic',
            effort: 'low',
            priority: 'high',
          },
        ],
        targetAudience: 'Local coffee enthusiasts',
        recommendations: ['Run a weekend promo'],
      },
      { storeId: 's1', storeName: 'Test Cafe', productCount: 3 },
      [{ id: 'c1', name: 'Rival', description: 'Competitor', category: 'cafe', suburb: 'CBD', region: 'VIC' }],
    );

    expect(report.reportVersion).toBe(3);
    expect(report.competitors.count).toBe(1);
    expect(report.competitors.analysis.summary).toContain('competition');
    expect(report.trends.consumer).toBe('Health-conscious');
    expect(report.opportunities.marketGaps).toContain('late night');
    expect(report.actionableRecommendations[0].action).toBe('Launch weekend promo');
    expect(report.recommendations).toContain('Run a weekend promo');
  });

  it('findPublishedCompetitors queries published businesses in same category', async () => {
    const findMany = vi.fn(async () => [
      { id: 'c2', name: 'Other', description: null, type: 'cafe', suburb: 'CBD', region: 'VIC' },
    ]);
    const prisma = { business: { findMany } };

    const rows = await findPublishedCompetitors(prisma, {
      id: 's1',
      type: 'cafe',
      suburb: 'CBD',
    });

    expect(rows).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: 's1' },
          publishedAt: { not: null },
          type: 'cafe',
          suburb: 'CBD',
        }),
      }),
    );
  });
});
