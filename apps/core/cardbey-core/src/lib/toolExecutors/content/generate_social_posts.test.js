import { describe, expect, it, vi, beforeEach } from 'vitest';
import { execute } from '../content/generate_social_posts.js';

vi.mock('../../llm/llmGateway.ts', () => ({
  llmGateway: {
    generate: vi.fn(async () => ({
      text: JSON.stringify({
        posts: [
          { platform: 'instagram', caption: 'Hello world', hashtags: ['#shop'] },
        ],
        suggestedHashtags: ['#shop', '#local'],
      }),
    })),
  },
}));

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => ({
    business: {
      findFirst: vi.fn(async () => ({ name: 'Test Cafe', type: 'cafe', brandTone: 'friendly' })),
    },
    product: {
      findMany: vi.fn(async () => [{ name: 'Latte' }]),
    },
  }),
}));

describe('generate_social_posts executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns posts from LLM payload', async () => {
    const result = await execute({ storeId: 'store-1', context: 'weekend promo' }, { storeId: 'store-1' });
    expect(result.status).toBe('ok');
    expect(result.output?.ok).toBe(true);
    expect(Array.isArray(result.output?.posts)).toBe(true);
    expect(result.output?.posts.length).toBeGreaterThan(0);
    expect(result.output?.suggestedHashtags).toContain('#shop');
  });

  it('falls back when storeId is missing', async () => {
    const result = await execute({ context: 'launch' }, {});
    expect(result.status).toBe('ok');
    expect(result.output?.posts?.length).toBeGreaterThan(0);
  });
});
