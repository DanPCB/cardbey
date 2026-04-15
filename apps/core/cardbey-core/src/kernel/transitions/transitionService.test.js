/**
 * Integration tests for DraftStore status transitions and WorkflowRun sync (store_creation).
 * Requires: NODE_ENV=test, DATABASE_URL=file:./prisma/test.db (see package.json pretest + test).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { transitionDraftStoreStatus } from './transitionService.js';

describe('transitionDraftStoreStatus / WorkflowRun sync', () => {
  let draftId;

  beforeAll(async () => {
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const draft = await prisma.draftStore.create({
      data: {
        mode: 'template',
        status: 'draft',
        input: { prompt: 'Test store', templateId: 'cafe' },
        expiresAt,
      },
    });
    draftId = draft.id;
  });

  afterAll(async () => {
    if (draftId) {
      await prisma.workflowRun.deleteMany({ where: { draftStoreId: draftId } });
      await prisma.auditEvent.deleteMany({
        where: { entityType: 'DraftStore', entityId: draftId },
      });
      await prisma.draftStore.delete({ where: { id: draftId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('creates a running WorkflowRun when transitioning draft → generating', async () => {
    const result = await transitionDraftStoreStatus({
      prisma,
      draftId,
      toStatus: 'generating',
      fromStatus: 'draft',
      actorType: 'automation',
      reason: 'GENERATE_DRAFT_START',
    });
    expect(result.ok).toBe(true);
    expect(result.beforeStatus).toBe('draft');
    expect(result.afterStatus).toBe('generating');

    const run = await prisma.workflowRun.findFirst({
      where: {
        draftStoreId: draftId,
        workflowKey: 'store_creation',
        status: 'running',
      },
    });
    expect(run).not.toBeNull();
    expect(run.startedAt).toBeDefined();
    expect(run.endedAt).toBeNull();
  });

  it('marks WorkflowRun completed when transitioning generating → ready', async () => {
    const result = await transitionDraftStoreStatus({
      prisma,
      draftId,
      toStatus: 'ready',
      fromStatus: 'generating',
      actorType: 'automation',
      reason: 'GENERATE_DRAFT_SUCCESS',
      extraData: { preview: {}, error: null },
    });
    expect(result.ok).toBe(true);
    expect(result.beforeStatus).toBe('generating');
    expect(result.afterStatus).toBe('ready');

    const run = await prisma.workflowRun.findFirst({
      where: {
        draftStoreId: draftId,
        workflowKey: 'store_creation',
      },
      orderBy: { updatedAt: 'desc' },
    });
    expect(run).not.toBeNull();
    expect(run.status).toBe('completed');
    expect(run.endedAt).not.toBeNull();
  });
});
