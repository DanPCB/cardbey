import { describe, expect, it, beforeEach, vi } from 'vitest';

const state = {
  content: null,
  approvals: [],
  versions: [],
};

vi.mock('../repository.js', () => ({
  marketingRepo: {
    content: {
      findUnique: async () => state.content,
      update: async ({ data }) => {
        state.content = { ...state.content, ...data };
        return state.content;
      },
    },
    version: {
      create: async (data) => {
        state.versions.push(data);
        return data;
      },
    },
    approval: {
      updateMany: async ({ data }) => {
        for (const a of state.approvals) {
          if (a.status === 'APPROVED' && !a.invalidatedAt) Object.assign(a, data);
        }
        return { count: state.approvals.length };
      },
      create: async (data) => {
        state.approvals.push(data);
        return data;
      },
    },
  },
}));

vi.mock('../audit.js', () => ({
  appendMarketingAudit: async () => {},
}));

import { updateContent } from '../contentService.js';

describe('marketingOperator/approval invalidation', () => {
  beforeEach(() => {
    state.content = {
      id: 'c1',
      campaignId: 'camp1',
      status: 'APPROVED',
      body: 'Cardbey under development pilot',
      mediaBrief: null,
      destination: null,
      title: 't',
      language: 'en',
      contentType: 'post',
      currentVersion: 1,
      metadata: null,
    };
    state.approvals = [{ contentId: 'c1', status: 'APPROVED', invalidatedAt: null }];
    state.versions = [];
  });

  it('material edit after APPROVED moves to NEEDS_REVISION and clears approval', async () => {
    const updated = await updateContent('c1', { body: 'Edited body under development' }, { actorId: 'u1' });
    expect(updated.status).toBe('NEEDS_REVISION');
    expect(updated.currentVersion).toBe(2);
    expect(state.approvals[0].invalidatedAt).toBeTruthy();
    expect(state.versions).toHaveLength(1);
  });
});
