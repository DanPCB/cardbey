import { describe, it, expect, vi, beforeEach } from 'vitest';

const { groqReason, prismaMock } = vi.hoisted(() => ({
  groqReason: vi.fn(),
  prismaMock: {
    missionPipeline: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    missionContext: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('../../lib/llm/groqAdapter.js', () => ({
  default: { reason: groqReason },
}));

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: vi.fn(() => prismaMock),
}));

import activeSummary from './activeSummary.js';

describe('activeSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.missionPipeline.findUnique.mockResolvedValue({
      metadataJson: { foo: 'bar' },
    });
    prismaMock.missionPipeline.update.mockResolvedValue({ id: 'm1' });
  });

  it('parses groq JSON summary', async () => {
    groqReason.mockResolvedValue({
      reasoning: '{"summary":"Published store successfully.","keyFacts":["store live"]}',
    });

    const summary = await activeSummary.generate(
      { type: 'store_mission', primaryAction: 'publish_store' },
      { success: true },
      { storeId: 'st1' },
    );

    expect(summary.gist).toBe('Published store successfully.');
    expect(summary.keyFacts).toEqual(['store live']);
  });

  it('falls back when groq fails', async () => {
    groqReason.mockRejectedValue(new Error('llm unavailable'));

    const summary = await activeSummary.generate(
      { type: 'store_mission', primaryAction: 'publish_store' },
      { success: false },
    );

    expect(summary.gist).toContain('publish_store');
    expect(summary.keyFacts[0]).toContain('publish_store');
  });

  it('persists gist on mission pipeline metadata', async () => {
    await activeSummary.updateActiveSummary('m1', {
      gist: 'Mission done',
      keyFacts: ['fact-a'],
    });

    expect(prismaMock.missionPipeline.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: {
        metadataJson: expect.objectContaining({
          foo: 'bar',
          activeSummary: 'Mission done',
          keyFacts: ['fact-a'],
        }),
      },
    });
  });
});
