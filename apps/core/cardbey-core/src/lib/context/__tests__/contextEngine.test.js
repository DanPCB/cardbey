import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ContextStore } from '../contextStore.js';
import { ContextProvider } from '../contextProvider.js';
import { ContextQueries } from '../contextQueries.js';
import { contextExtractor } from '../contextExtractor.js';
import { mergePersistedWithClientContext } from '../contextIntakeBridge.js';
import { deepMergeContext, detectInteractionType } from '../contextUtils.js';
import {
  extractDraftIdFromMission,
  extractStoreIdFromMission,
  sessionIdFromMissionMetadata,
} from '../contextMissionExtract.js';
import { clearContextCacheForTests } from '../contextCache.js';

function createMockDb() {
  /** @type {Map<string, { userId: string; sessionId: string; active: boolean; contextJson: string }>} */
  const rows = new Map();

  return {
    performerSessionContext: {
      findFirst: vi.fn(async ({ where }) => {
        const key = `${where.userId}:${where.sessionId}`;
        const row = rows.get(key);
        if (!row || where.active === false) return null;
        if (where.active && !row.active) return null;
        return row;
      }),
      upsert: vi.fn(async ({ where, update, create }) => {
        const userId = where.userId_sessionId.userId;
        const sessionId = where.userId_sessionId.sessionId;
        const key = `${userId}:${sessionId}`;
        const existing = rows.get(key);
        const next = {
          userId,
          sessionId,
          active: update?.active ?? create?.active ?? true,
          contextJson: update?.contextJson ?? create?.contextJson ?? '{}',
        };
        rows.set(key, next);
        return next;
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        const key = `${where.userId}:${where.sessionId}`;
        const row = rows.get(key);
        if (row) {
          rows.set(key, {
            ...row,
            active: data.active ?? row.active,
          });
        }
        return { count: row ? 1 : 0 };
      }),
    },
    _rows: rows,
  };
}

describe('contextUtils', () => {
  it('deepMergeContext replaces arrays and merges nested objects', () => {
    const merged = deepMergeContext(
      { preferences: { language: 'en', skippedSteps: ['a'] }, interactions: [{ id: '1' }] },
      { preferences: { skippedSteps: ['b'] }, activeStoreId: 'store-1' },
    );
    expect(merged.preferences.language).toBe('en');
    expect(merged.preferences.skippedSteps).toEqual(['b']);
    expect(merged.activeStoreId).toBe('store-1');
  });

  it('detectInteractionType recognizes uploads and missions', () => {
    expect(detectInteractionType({ attachments: [{}] })).toBe('file_upload');
    expect(detectInteractionType({ type: 'mission_created' })).toBe('mission_created');
    expect(detectInteractionType({ text: 'hello' })).toBe('text_input');
  });
});

describe('ContextStore', () => {
  beforeEach(() => {
    clearContextCacheForTests();
  });

  it('creates, updates, and retrieves persisted context', async () => {
    const db = createMockDb();
    const store = new ContextStore({ db, ttl: 60 });

    const created = await store.updateContext('user-1', 'session-1', { activeStoreId: 'store-abc' });
    expect(created.activeStoreId).toBe('store-abc');

    const loaded = await store.getContext('user-1', 'session-1');
    expect(loaded?.activeStoreId).toBe('store-abc');
    expect(loaded?.userId).toBe('user-1');
  });

  it('records interactions and trims history', async () => {
    const db = createMockDb();
    const store = new ContextStore({ db, ttl: 60 });
    await store.updateContext('user-1', 'session-1', {});

    for (let i = 0; i < 105; i += 1) {
      await store.addInteraction('user-1', 'session-1', {
        id: `i-${i}`,
        timestamp: new Date().toISOString(),
        type: 'text_input',
        input: { text: `msg-${i}` },
        output: null,
        intent: null,
        confidence: null,
        durationMs: 0,
      });
    }

    const loaded = await store.getContext('user-1', 'session-1');
    expect(loaded?.interactions.length).toBeLessThanOrEqual(100);
    expect(loaded?.metadata.totalInteractions).toBe(105);
    expect(loaded?.currentInputContext?.rawText).toBe('msg-104');
  });

  it('clears session context', async () => {
    const db = createMockDb();
    const store = new ContextStore({ db, ttl: 60 });
    await store.updateContext('user-1', 'session-1', { activeStoreId: 'store-abc' });
    await store.clearSession('user-1', 'session-1');
    const loaded = await store.getContext('user-1', 'session-1');
    expect(loaded).toBeNull();
  });
});

describe('ContextProvider', () => {
  beforeEach(() => {
    clearContextCacheForTests();
  });

  it('getOrCreateContext initializes empty context', async () => {
    const db = createMockDb();
    const provider = new ContextProvider({ store: new ContextStore({ db, ttl: 60 }) });
    const ctx = await provider.getOrCreateContext('user-2', 'session-2');
    expect(ctx.userId).toBe('user-2');
    expect(ctx.sessionId).toBe('session-2');
    expect(ContextQueries.isFirstTimeUser(ctx)).toBe(true);
  });
});

describe('ContextQueries', () => {
  const sampleContext = {
    sessionId: 's1',
    userId: 'u1',
    currentWorkflow: 'store_creation',
    activeMissionId: 'm1',
    currentStepId: 'step-1',
    activeStoreId: 'store-1',
    activeCampaignId: null,
    interactions: [
      { id: '1', timestamp: new Date().toISOString(), type: 'text_input', input: {}, output: null, intent: null, confidence: null, durationMs: 0 },
      { id: '2', timestamp: new Date().toISOString(), type: 'file_upload', input: {}, output: null, intent: null, confidence: null, durationMs: 0 },
    ],
    completedActions: [
      {
        id: 'a1',
        timestamp: new Date().toISOString(),
        type: 'store_created',
        tool: 'create_store',
        result: {},
        success: true,
      },
    ],
    pendingCheckpoints: [{ stepId: 'cp-1', type: 'upload', prompt: 'Upload logo', timestamp: new Date().toISOString() }],
    preferences: {
      preferredWorkflowOrder: [],
      skippedSteps: [],
      language: 'en',
      notificationPreferences: {},
      defaultAction: null,
      frequentlyUsedTools: [],
    },
    behaviorPatterns: [],
    systemCapabilities: [],
    currentInputContext: {
      rawText: '',
      hasAttachment: true,
      hasImage: false,
      attachmentTypes: ['application/pdf'],
      extractedText: null,
      detectedType: null,
    },
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: '1.0.0',
      lastActivityAt: new Date().toISOString(),
      totalInteractions: 2,
    },
  };

  it('answers workflow and store queries', () => {
    expect(ContextQueries.hasActiveStore(sampleContext)).toBe(true);
    expect(ContextQueries.isInWorkflow(sampleContext, 'store_creation')).toBe(true);
    expect(ContextQueries.hasPendingCheckpoints(sampleContext)).toBe(true);
    expect(ContextQueries.getRecentInteractions(sampleContext, 1)).toHaveLength(1);
    expect(ContextQueries.isCurrentInputAttachmentOnly(sampleContext)).toBe(true);
    expect(ContextQueries.hasCompletedAction(sampleContext, 'store_created', 60)).toBe(true);
  });
});

describe('ContextExtractor', () => {
  it('extracts workflow from intake create_store intent', () => {
    const update = contextExtractor.extractFromIntake(
      { text: 'create my store', tool: 'create_store' },
      null,
    );
    expect(update.currentWorkflow).toBe('store_creation');
    expect(update.currentInputContext?.rawText).toBe('create my store');
  });

  it('extracts store id from successful tool execution', () => {
    const update = contextExtractor.extractFromToolExecution(
      { tool: 'create_store', success: true, result: { storeId: 'store-99' } },
      { completedActions: [] },
    );
    expect(update.activeStoreId).toBe('store-99');
    expect(update.completedActions?.[0]?.type).toBe('store_created');
  });

  it('tracks skipped steps from user feedback', () => {
    const update = contextExtractor.extractFromUserFeedback(
      { type: 'skipped_step', stepId: 'logo_upload' },
      {
        preferences: {
          preferredWorkflowOrder: [],
          skippedSteps: [],
          language: 'en',
          notificationPreferences: {},
          defaultAction: null,
          frequentlyUsedTools: [],
        },
      },
    );
    expect(update.preferences?.skippedSteps).toEqual(['logo_upload']);
  });
});

describe('contextMissionExtract', () => {
  it('extracts storeId from outputsJson and structured_store_build', () => {
    expect(
      extractStoreIdFromMission(
        { type: 'store', targetId: 'temp', targetType: 'store' },
        { structured_store_build: { storeId: 'store-abc' } },
      ),
    ).toBe('store-abc');
  });

  it('prefers real targetId over temp', () => {
    expect(
      extractStoreIdFromMission(
        { type: 'store', targetId: 'store-real', targetType: 'store' },
        {},
      ),
    ).toBe('store-real');
  });

  it('reads conversationSessionId from metadata', () => {
    expect(sessionIdFromMissionMetadata({ conversationSessionId: 'sess-1' })).toBe('sess-1');
  });

  it('extracts draftId from mission outputs', () => {
    expect(
      extractDraftIdFromMission(
        {},
        { draftId: 'draft-1', structured_store_build: { draftStoreId: 'draft-2' } },
      ),
    ).toBe('draft-1');
  });
});

describe('contextIntakeBridge', () => {
  it('merges persisted workflow state over client context', () => {
    const merged = mergePersistedWithClientContext(
      {
        sessionId: 's1',
        userId: 'u1',
        currentWorkflow: 'campaign_creation',
        activeMissionId: null,
        currentStepId: null,
        activeStoreId: 'store-1',
        activeCampaignId: 'camp-1',
        interactions: [],
        completedActions: [],
        pendingCheckpoints: [],
        preferences: {
          preferredWorkflowOrder: [],
          skippedSteps: [],
          language: 'en',
          notificationPreferences: {},
          defaultAction: null,
          frequentlyUsedTools: [],
        },
        behaviorPatterns: [],
        systemCapabilities: [],
        currentInputContext: null,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: '1.0.0',
          lastActivityAt: new Date().toISOString(),
          totalInteractions: 0,
        },
      },
      { currentWorkflow: 'store_creation', storeId: null },
    );

    expect(merged.currentWorkflow).toBe('campaign_creation');
    expect(merged.activeStoreId).toBe('store-1');
    expect(merged.contextEngine?.hasActiveStore).toBe(true);
  });

  it('hasActiveStore treats guest draft as active store context', () => {
    expect(
      ContextQueries.hasActiveStore({
        userId: 'guest_abc',
        activeStoreId: null,
        activeDraftId: 'draft-1',
      }),
    ).toBe(true);
    expect(
      ContextQueries.hasActiveStore({
        userId: 'user-1',
        activeStoreId: null,
        activeDraftId: 'draft-1',
      }),
    ).toBe(false);
  });
});
