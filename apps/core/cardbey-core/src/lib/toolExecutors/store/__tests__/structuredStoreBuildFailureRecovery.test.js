import { describe, expect, it, vi } from 'vitest';
import {
  draftErrorCodeFromFailureClassified,
  ensureDraftFailedAfterGenerateError,
} from '../structuredStoreBuildFailureRecovery.js';
import { DraftErrorCode } from '../../../../services/errors/draftErrorCodes.js';

describe('structuredStoreBuildFailureRecovery', () => {
  it('maps classifyGenerateDraftFailure codes to DraftErrorCode', () => {
    expect(
      draftErrorCodeFromFailureClassified({ code: 'GENERATE_DRAFT_FAILED' }),
    ).toBe(DraftErrorCode.GENERATE_DRAFT_FAILED);
    expect(
      draftErrorCodeFromFailureClassified({ code: 'STORE_BUILD_RUNTIME_DEPENDENCY_MISSING' }),
    ).toBe(DraftErrorCode.STORE_BUILD_RUNTIME_DEPENDENCY_MISSING);
    expect(draftErrorCodeFromFailureClassified({ code: 'OTHER' })).toBe(
      DraftErrorCode.INTERNAL_ERROR,
    );
  });

  it('ensureDraftFailedAfterGenerateError transitions generating draft to failed', async () => {
    const update = vi.fn().mockResolvedValue({});
    const create = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const prisma = {
      draftStore: {
        findUnique: vi.fn().mockResolvedValue({ status: 'generating', errorCode: null }),
        update,
      },
      auditEvent: { create },
    };

    await ensureDraftFailedAfterGenerateError(
      prisma,
      'draft-1',
      {
        code: 'GENERATE_DRAFT_FAILED',
        message: "We couldn't finish preparing your store draft.",
      },
      'run-1',
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'draft-1' },
        data: expect.objectContaining({
          status: 'failed',
          errorCode: DraftErrorCode.GENERATE_DRAFT_FAILED,
        }),
      }),
    );
  });

  it('ensureDraftFailedAfterGenerateError is idempotent when draft already failed', async () => {
    const update = vi.fn();
    const prisma = {
      draftStore: {
        findUnique: vi.fn().mockResolvedValue({ status: 'failed', errorCode: 'GENERATE_DRAFT_FAILED' }),
        update,
      },
      auditEvent: { create: vi.fn() },
    };

    await ensureDraftFailedAfterGenerateError(prisma, 'draft-1', { code: 'GENERATE_DRAFT_FAILED' }, 'run-1');
    expect(update).not.toHaveBeenCalled();
  });
});
