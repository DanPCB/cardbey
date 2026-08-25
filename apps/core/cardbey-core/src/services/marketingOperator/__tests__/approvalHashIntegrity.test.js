import { describe, expect, it, beforeEach, vi } from 'vitest';

const state = {
  content: null,
  approvals: [],
  versions: [],
  publications: [],
};

vi.mock('../repository.js', () => ({
  marketingRepo: {
    campaign: {
      update: async ({ data }) => data,
      findUnique: async () => ({ id: 'camp1', metadata: {} }),
    },
    content: {
      findUnique: async ({ include } = {}) => {
        if (!state.content) return null;
        if (include?.versions) {
          return { ...state.content, versions: state.versions.slice().reverse() };
        }
        return state.content;
      },
      update: async ({ data }) => {
        state.content = { ...state.content, ...data };
        return state.content;
      },
    },
    version: {
      create: async (data) => {
        const row = { id: `v_${state.versions.length + 1}`, ...data };
        state.versions.push(row);
        return row;
      },
    },
    approval: {
      findFirst: async ({ where }) => {
        return (
          state.approvals.find(
            (a) =>
              a.contentId === where.contentId &&
              a.status === where.status &&
              a.invalidatedAt == null,
          ) || null
        );
      },
      updateMany: async ({ data }) => {
        for (const a of state.approvals) {
          if (a.status === 'APPROVED' && !a.invalidatedAt) Object.assign(a, data);
        }
        return { count: 1 };
      },
      create: async (data) => {
        const row = { id: `a_${state.approvals.length + 1}`, ...data };
        state.approvals.push(row);
        return row;
      },
    },
    publication: {
      findUnique: async () => null,
      create: async (data) => {
        const row = { id: 'p1', ...data };
        state.publications.push(row);
        return row;
      },
    },
  },
}));

vi.mock('../audit.js', () => ({ appendMarketingAudit: async () => {} }));
vi.mock('../publishing/index.js', () => ({
  getPublishingProvider: () => ({
    name: 'mock',
    schedule: async () => ({ ok: true, code: 'SCHEDULE_OK', meta: { mock: true } }),
    publish: async () => ({ ok: true, code: 'MOCK_SUCCESS', externalPostId: 'x', meta: { mock: true } }),
  }),
}));

import { approveContent, scheduleContent, updateContent } from '../contentService.js';

describe('marketingOperator/approval hash integrity', () => {
  beforeEach(() => {
    process.env.ENABLE_MARKETING_APPROVAL_WORKFLOW_V1 = 'true';
    delete process.env.MARKETING_PILOT_ALLOW_SELF_APPROVE;
    state.content = {
      id: 'c1',
      campaignId: 'camp1',
      status: 'READY_FOR_APPROVAL',
      body: 'Cardbey under development pilot for Vietnamese SME',
      mediaBrief: null,
      destination: null,
      title: 'Pilot',
      language: 'en',
      contentType: 'post',
      structured: null,
      currentVersion: 1,
      metadata: null,
      createdBy: 'author1',
    };
    state.approvals = [];
    state.versions = [{ id: 'v1', contentId: 'c1', version: 1 }];
    state.publications = [];
  });

  it('denies self-approve when actor is createdBy', async () => {
    const result = await approveContent('c1', { actorId: 'author1' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('self_approve_denied');
  });

  it('binds contentHash on approve and blocks schedule when hash no longer matches', async () => {
    const approved = await approveContent('c1', { actorId: 'approver2' });
    expect(approved.ok).toBe(true);
    expect(approved.contentHash).toBeTruthy();
    expect(state.approvals[0].contentHash).toBe(approved.contentHash);

    // Simulate drift: body changed but status still APPROVED (hash mismatch path)
    state.content.body = 'Silently edited under development copy';
    state.content.status = 'APPROVED';
    const scheduled = await scheduleContent('c1', { actorId: 'pub1' });
    expect(scheduled.ok).toBe(false);
    expect(scheduled.error).toBe('approval_invalidated');
  });

  it('material edit invalidates approval and moves to NEEDS_REVISION', async () => {
    await approveContent('c1', { actorId: 'approver2' });
    await updateContent('c1', { body: 'Edited under development copy' }, { actorId: 'author1' });
    expect(state.content.status).toBe('NEEDS_REVISION');
    expect(state.approvals[0].invalidatedAt).toBeTruthy();
    const scheduled = await scheduleContent('c1', { actorId: 'pub1' });
    expect(scheduled.ok).toBe(false);
    expect(scheduled.error).toBe('not_approved');
  });
});
