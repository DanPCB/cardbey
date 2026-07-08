/**
 * Unit tests for deferred store pipeline helpers (logic without Prisma execute).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  resetDeferredStorePipelineInFlightForTests,
  persistDeferredStorePipelineRequest,
} from '../deferredStorePipelineRunner.js';

describe('deferredStorePipelineRunner helpers', () => {
  beforeEach(() => {
    resetDeferredStorePipelineInFlightForTests();
  });

  it('persistDeferredStorePipelineRequest writes deferredStorePipeline metadata', async () => {
    let saved = null;
    const prisma = {
      missionPipeline: {
        findUnique: async () => ({ metadataJson: { businessName: 'Acme' } }),
        update: async ({ data }) => {
          saved = data.metadataJson;
          return { id: 'm1' };
        },
      },
    };

    await persistDeferredStorePipelineRequest(prisma, 'm1', {
      body: { businessName: 'Acme', location: 'Melbourne' },
      auditSource: 'intake_v2_unified',
      userId: 'u1',
    });

    expect(saved?.deferredStorePipeline?.status).toBe('requested');
    expect(saved?.deferredStorePipeline?.body?.businessName).toBe('Acme');
    expect(saved?.deferredStorePipeline?.userId).toBe('u1');
    expect(saved?.businessName).toBe('Acme');
  });

  it('persistDeferredStorePipelineRequest no-ops without missionId', async () => {
    let called = false;
    const prisma = {
      missionPipeline: {
        findUnique: async () => {
          called = true;
          return null;
        },
        update: async () => {
          called = true;
        },
      },
    };
    await persistDeferredStorePipelineRequest(prisma, '', { body: {} });
    expect(called).toBe(false);
  });
});
