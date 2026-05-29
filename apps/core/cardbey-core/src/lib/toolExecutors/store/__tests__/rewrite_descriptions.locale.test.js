/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';

const { generateMock } = vi.hoisted(() => ({
  generateMock: vi.fn().mockResolvedValue({ text: '[]' }),
}));

vi.mock('../../../llm/llmGateway.ts', () => ({
  llmGateway: { generate: generateMock },
}));

vi.mock('../../../../lib/prisma.js', () => ({
  getPrismaClient: () => ({
    product: {
      findMany: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Tea', description: 'Hot' }]),
    },
  }),
}));

import { execute } from '../rewrite_descriptions.js';

describe('rewrite_descriptions locale', () => {
  it('appends localeInstruction for vi in LLM prompt', async () => {
    generateMock.mockClear();
    await execute({ storeId: 'store-1' }, { locale: 'vi' });
    const prompt = generateMock.mock.calls[0]?.[0]?.prompt ?? '';
    expect(prompt).toContain('Vietnamese');
    expect(prompt).toContain('IMPORTANT');
  });
});
