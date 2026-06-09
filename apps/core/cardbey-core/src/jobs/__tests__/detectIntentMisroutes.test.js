/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findManyFeedbackMock = vi.fn();
const findManyProposalMock = vi.fn();
const createProposalMock = vi.fn();
const updateProposalMock = vi.fn();

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: () => ({
    skillDispatchFeedback: { findMany: findManyFeedbackMock },
    selfHealingProposal: {
      findMany: findManyProposalMock,
      create: createProposalMock,
      update: updateProposalMock,
    },
  }),
}));

vi.mock('../../services/selfHealing/createProposal.js', () => ({
  createProposal: (...args) => createProposalMock(...args),
}));

import {
  aggregateMisrouteGroups,
  detectIntentMisroutes,
} from '../detectIntentMisroutes.js';

describe('aggregateMisrouteGroups', () => {
  beforeEach(() => {
    findManyFeedbackMock.mockReset();
    createProposalMock.mockReset();
  });

  it('groups negative feedback by intent and matchedSkill', async () => {
    findManyFeedbackMock.mockResolvedValue([
      {
        rating: 1,
        correctionText: 'wanted menu edit',
        dispatchLog: { intent: 'store.edit', matchedSkill: 'analyze_store' },
      },
      {
        rating: 2,
        correctionText: null,
        dispatchLog: { intent: 'store.edit', matchedSkill: 'analyze_store' },
      },
      {
        rating: 1,
        correctionText: 'menu please',
        dispatchLog: { intent: 'store.edit', matchedSkill: 'analyze_store' },
      },
      {
        rating: 2,
        correctionText: null,
        dispatchLog: { intent: 'store.edit', matchedSkill: 'analyze_store' },
      },
    ]);

    const groups = await aggregateMisrouteGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      intent: 'store.edit',
      matchedSkill: 'analyze_store',
      total: 4,
      corrections: 2,
    });
    expect(groups[0].avgRating).toBeCloseTo(1.5);
  });

  it('filters groups with 3 or fewer occurrences', async () => {
    findManyFeedbackMock.mockResolvedValue([
      { rating: 1, correctionText: null, dispatchLog: { intent: 'a', matchedSkill: 'b' } },
      { rating: 1, correctionText: null, dispatchLog: { intent: 'a', matchedSkill: 'b' } },
      { rating: 1, correctionText: null, dispatchLog: { intent: 'a', matchedSkill: 'b' } },
    ]);

    const groups = await aggregateMisrouteGroups();
    expect(groups).toHaveLength(0);
  });
});

describe('detectIntentMisroutes', () => {
  beforeEach(() => {
    findManyFeedbackMock.mockReset();
    createProposalMock.mockReset();
    createProposalMock.mockResolvedValue({ id: 'prop-1' });
  });

  it('creates proposals for misroutes with negative adjustments', async () => {
    findManyFeedbackMock.mockResolvedValue(
      Array.from({ length: 4 }, () => ({
        rating: 1,
        correctionText: 'wrong skill',
        dispatchLog: { intent: 'campaign.launch', matchedSkill: 'general_chat' },
      })),
    );

    const result = await detectIntentMisroutes();
    expect(result.processed).toBe(1);
    expect(result.proposals).toBe(1);
    expect(createProposalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'intent_pattern_adjustment',
        autoCreateProposal: true,
        requiresConfirmation: true,
        suggestedFix: expect.objectContaining({ adjustment: -0.3 }),
      }),
    );
  });
});
