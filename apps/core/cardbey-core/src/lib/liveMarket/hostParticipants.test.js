/**
 * Host participant workspace — list/filters/question review (Batch A).
 * No guest/email/SMS/public counts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/features.js', () => ({
  Features: {
    liveMarket: {
      registrationSummaryV1: true,
      hostParticipantsV1: true,
      registrationV1: true,
    },
  },
}));

vi.mock('../prisma.js', () => ({
  getPrismaClient: () => mockPrisma,
}));

vi.mock('./audit.js', () => ({
  appendLiveMarketAudit: vi.fn(async () => null),
}));

const mockPrisma = {
  liveMarketSession: {
    findFirst: vi.fn(),
  },
  liveMarketParticipantRegistration: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  product: {
    findMany: vi.fn(),
  },
};

import { appendLiveMarketAudit } from './audit.js';
import {
  getRegistrationSummaryForSession,
  listSessionParticipantsForOwner,
  updateParticipantQuestionReview,
} from './registration.js';
import { LIVE_QUESTION_REVIEW_STATUS } from './domain.js';

describe('host participant workspace (Batch A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.liveMarketSession.findFirst.mockResolvedValue({
      id: 'sess1',
      storeId: 'store1',
    });
  });

  it('summary distinguishes joining/registered and cancelled; guest stays 0', async () => {
    mockPrisma.liveMarketParticipantRegistration.findMany.mockResolvedValue([
      {
        status: 'REGISTERED',
        preferredLanguage: 'vi',
        interestSubjectId: 'p1',
        interestSubjectType: 'SERVICE',
        questionForHost: 'Hello?',
      },
      {
        status: 'REGISTERED',
        preferredLanguage: 'en',
        interestSubjectId: null,
        interestSubjectType: null,
        questionForHost: null,
      },
      {
        status: 'CANCELLED',
        preferredLanguage: 'vi',
        interestSubjectId: null,
        interestSubjectType: null,
        questionForHost: 'Ignored',
      },
    ]);
    const summary = await getRegistrationSummaryForSession({
      prisma: mockPrisma,
      storeId: 'store1',
      sessionId: 'sess1',
    });
    expect(summary.joiningCount).toBe(2);
    expect(summary.registeredCount).toBe(2);
    expect(summary.guestCount).toBe(0);
    expect(summary.cancelledCount).toBe(1);
    expect(summary.questionCount).toBe(1);
    expect(summary.preferredLanguageTotals).toEqual({ vi: 1, en: 1 });
    expect(summary.interestTotals['SERVICE:p1']).toBe(1);
    expect(summary.label).toBe('Registered participants');
  });

  it('owner list omits email and userId', async () => {
    mockPrisma.liveMarketParticipantRegistration.count.mockResolvedValue(1);
    mockPrisma.liveMarketParticipantRegistration.findMany.mockResolvedValue([
      {
        id: 'reg1',
        preferredLanguage: 'vi',
        status: 'REGISTERED',
        registeredAt: new Date('2026-08-14T00:00:00Z'),
        cancelledAt: null,
        questionForHost: 'Will you cover rates?',
        questionReviewStatus: 'NEW',
        interestSubjectId: 'p1',
        interestSubjectType: 'SERVICE',
        userId: 'user-secret',
      },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-secret', displayName: 'Alex', fullName: null },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Consult' }]);

    const result = await listSessionParticipantsForOwner({
      prisma: mockPrisma,
      storeId: 'store1',
      sessionId: 'sess1',
    });
    expect(result.total).toBe(1);
    expect(result.participants[0].displayName).toBe('Alex');
    expect(result.participants[0].participantType).toBe('ACCOUNT');
    expect(result.participants[0].interestName).toBe('Consult');
    expect(JSON.stringify(result.participants)).not.toMatch(/email|user-secret|phone|userId/i);
  });

  it('question review transition is idempotent and audits without question text', async () => {
    const row = {
      id: 'reg1',
      sessionId: 'sess1',
      storeId: 'store1',
      userId: 'u1',
      preferredLanguage: 'vi',
      status: 'REGISTERED',
      registeredAt: new Date(),
      cancelledAt: null,
      questionForHost: 'Secret question text',
      questionReviewStatus: 'NEW',
      interestSubjectId: null,
      interestSubjectType: null,
    };
    mockPrisma.liveMarketParticipantRegistration.findFirst.mockResolvedValue(row);
    mockPrisma.liveMarketParticipantRegistration.update.mockResolvedValue({
      ...row,
      questionReviewStatus: 'REVIEWED',
    });
    mockPrisma.user.findUnique.mockResolvedValue({ displayName: 'Alex', fullName: null });

    const first = await updateParticipantQuestionReview({
      prisma: mockPrisma,
      storeId: 'store1',
      sessionId: 'sess1',
      registrationId: 'reg1',
      reviewStatus: 'REVIEWED',
      actorId: 'owner1',
    });
    expect(first.idempotent).toBe(false);
    expect(first.participant.questionReviewStatus).toBe('REVIEWED');
    expect(appendLiveMarketAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LIVE_PARTICIPANT_QUESTION_REVIEWED',
        fromStatus: 'NEW',
        toStatus: 'REVIEWED',
        metadata: expect.objectContaining({ hasQuestion: true }),
      }),
    );
    const meta = vi.mocked(appendLiveMarketAudit).mock.calls[0][0].metadata;
    expect(JSON.stringify(meta)).not.toMatch(/Secret question/);

    mockPrisma.liveMarketParticipantRegistration.findFirst.mockResolvedValue({
      ...row,
      questionReviewStatus: 'REVIEWED',
    });
    const second = await updateParticipantQuestionReview({
      prisma: mockPrisma,
      storeId: 'store1',
      sessionId: 'sess1',
      registrationId: 'reg1',
      reviewStatus: LIVE_QUESTION_REVIEW_STATUS.REVIEWED,
      actorId: 'owner1',
    });
    expect(second.idempotent).toBe(true);
  });

  it('rejects invalid review status', async () => {
    await expect(
      updateParticipantQuestionReview({
        prisma: mockPrisma,
        storeId: 'store1',
        sessionId: 'sess1',
        registrationId: 'reg1',
        reviewStatus: 'DONE',
      }),
    ).rejects.toMatchObject({ code: 'LIVE_QUESTION_REVIEW_INVALID' });
  });

  it('rejects cross-store missing session', async () => {
    mockPrisma.liveMarketSession.findFirst.mockResolvedValue(null);
    await expect(
      listSessionParticipantsForOwner({
        prisma: mockPrisma,
        storeId: 'other',
        sessionId: 'sess1',
      }),
    ).rejects.toMatchObject({ code: 'LIVE_SESSION_NOT_FOUND', status: 404 });
  });
});
