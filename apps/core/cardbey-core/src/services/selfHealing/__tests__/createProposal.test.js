/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findManyMock, createMock, updateMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('../../../lib/prisma.js', () => ({
  getPrismaClient: () => ({
    selfHealingProposal: {
      findMany: findManyMock,
      create: createMock,
      update: updateMock,
    },
  }),
}));

import { createProposal } from '../createProposal.js';

describe('createProposal', () => {
  beforeEach(() => {
    findManyMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
  });

  it('creates a new pending proposal when none exists', async () => {
    findManyMock.mockResolvedValue([]);
    createMock.mockResolvedValue({ id: 'new-1', status: 'pending_approval' });

    const result = await createProposal({
      type: 'intent_pattern_adjustment',
      title: 'Test',
      description: 'Desc',
      suggestedFix: { adjustment: -0.2 },
      metadata: { intent: 'store.edit', matchedSkill: 'analyze_store' },
      autoCreateProposal: true,
      requiresConfirmation: true,
    });

    expect(result.id).toBe('new-1');
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'pending_approval',
          type: 'intent_pattern_adjustment',
        }),
      }),
    );
  });

  it('updates occurrence count for duplicate pending proposal', async () => {
    findManyMock.mockResolvedValue([
      {
        id: 'existing-1',
        metadata: { intent: 'store.edit', matchedSkill: 'analyze_store' },
      },
    ]);
    updateMock.mockResolvedValue({ id: 'existing-1', occurrenceCount: 2 });

    const result = await createProposal({
      type: 'intent_pattern_adjustment',
      title: 'Test',
      description: 'Updated',
      suggestedFix: { adjustment: -0.2 },
      metadata: { intent: 'store.edit', matchedSkill: 'analyze_store' },
      autoCreateProposal: true,
    });

    expect(result.id).toBe('existing-1');
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-1' },
        data: expect.objectContaining({ occurrenceCount: { increment: 1 } }),
      }),
    );
    expect(createMock).not.toHaveBeenCalled();
  });
});
