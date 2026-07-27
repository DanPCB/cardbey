import { describe, expect, it, vi } from 'vitest';
import { buildEcosystemGraph } from './buildEcosystemGraph.js';

vi.mock('../businessIngestion/IngestionRepository.js', () => ({
  listSeedRecords: vi.fn().mockResolvedValue([
    {
      qaStatus: 'pending',
      verificationStatus: 'seeded_pending_qa',
      normalized: { country: 'Australia' },
    },
    {
      qaStatus: 'approved',
      verificationStatus: 'seeded_claimable',
      normalized: { country: 'Australia' },
    },
  ]),
}));

function mockPrisma() {
  return {
    user: { count: vi.fn().mockResolvedValue(0) },
    business: { count: vi.fn().mockResolvedValue(0) },
    draftStore: { count: vi.fn().mockResolvedValue(0) },
    device: { count: vi.fn().mockResolvedValue(0) },
    missionRun: { count: vi.fn().mockResolvedValue(0) },
    contentLibraryAsset: { count: vi.fn().mockResolvedValue(0) },
    content: { count: vi.fn().mockResolvedValue(0) },
    campaign: { count: vi.fn().mockResolvedValue(0) },
    campaignV2: { count: vi.fn().mockResolvedValue(0) },
    promoRuleRedemption: { count: vi.fn().mockResolvedValue(0) },
    orchestratorRunReward: { count: vi.fn().mockResolvedValue(0) },
  };
}

describe('buildEcosystemGraph', () => {
  it('returns safe platform graph DTO with default lifecycle nodes', async () => {
    const prisma = mockPrisma();
    prisma.user.count.mockResolvedValue(42);
    prisma.business.count.mockResolvedValue(10);
    prisma.device.count.mockResolvedValue(5);
    prisma.campaign.count.mockResolvedValue(2);

    const graph = await buildEcosystemGraph(prisma);

    expect(graph.nodes.length).toBeGreaterThanOrEqual(9);
    expect(graph.edges.length).toBeGreaterThanOrEqual(8);

    const ids = graph.nodes.map((n) => n.id);
    expect(ids).toContain('discovery');
    expect(ids).toContain('businesses');
    expect(ids).toContain('claims');
    expect(ids).toContain('verification');
    expect(ids).toContain('stores');
    expect(ids).toContain('performer');
    expect(ids).toContain('users');
    expect(ids).toContain('devices');

    for (const node of graph.nodes) {
      expect(node).toMatchObject({
        id: expect.any(String),
        type: expect.any(String),
        label: expect.any(String),
        status: expect.any(String),
        count: expect.any(Number),
        route: expect.any(String),
      });
      expect(node.label.toLowerCase()).not.toContain('seed');
    }

    const users = graph.nodes.find((n) => n.id === 'users');
    expect(users?.count).toBe(42);

    const flowEdge = graph.edges.find((e) => e.source === 'discovery' && e.target === 'businesses');
    expect(flowEdge?.type).toBe('flow');
    expect(flowEdge?.weight).toBeGreaterThan(0);
  });

  it('marks verification critical when claimable but none verified', async () => {
    const prisma = mockPrisma();
    const graph = await buildEcosystemGraph(prisma);
    const verification = graph.nodes.find((n) => n.id === 'verification');
    expect(verification?.status).toBe('critical');
  });
});
