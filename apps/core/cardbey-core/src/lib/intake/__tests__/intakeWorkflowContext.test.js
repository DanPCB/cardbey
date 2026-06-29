import { describe, expect, it, afterEach } from 'vitest';
import {
  clearIntakeWorkflowContextForTests,
  extractEntitiesFromStoreCandidate,
  hydrateIntentSourceFromWorkflow,
  persistUploadedAssetWorkflow,
  resolveIntakeAssetSessionKey,
  stashIntakeWorkflowContext,
} from '../intakeWorkflowContext.js';
import { buildStoreCandidateFromOcr } from '../storeCandidate.js';

const SAMPLE_CARD = `PTH INTERNATIONAL FURNITURE
02 6041 3091
pth.furniture@gmail.com
www.pthfurniture.com.au
Unit 5/12 Maitland Drive, Derrimut, Vic 3026`;

afterEach(() => {
  clearIntakeWorkflowContextForTests();
});

describe('intakeWorkflowContext', () => {
  it('resolveIntakeAssetSessionKey falls back to user id', () => {
    expect(resolveIntakeAssetSessionKey({ userId: 'user-1' })).toBe('user:user-1');
    expect(resolveIntakeAssetSessionKey({ conversationSessionId: 'sess-1', userId: 'user-1' })).toBe(
      'sess-1',
    );
  });

  it('hydrates intent source from persisted workflow', () => {
    const candidate = buildStoreCandidateFromOcr(SAMPLE_CARD, { documentType: 'business_card' });
    const sessionKey = 'user:test-1';
    persistUploadedAssetWorkflow(sessionKey, {
      id: 'doc-1',
      artifactType: 'document_extraction',
      documentType: 'business_card',
      storeCandidate: candidate,
      confidence: candidate.confidence,
      createdAt: new Date().toISOString(),
    });

    const hydrated = hydrateIntentSourceFromWorkflow(null, null, sessionKey);
    expect(hydrated?.uploadedAssetPending).toBe(true);
    expect(hydrated?.assetAction).toBeUndefined();
    expect(hydrated?.storeCandidate?.businessName).toMatch(/PTH/i);
    expect(hydrated?.pendingImageDataUrl).toBeFalsy();
  });

  it('extractEntitiesFromStoreCandidate maps review fields', () => {
    const candidate = buildStoreCandidateFromOcr(SAMPLE_CARD, { documentType: 'business_card' });
    const entities = extractEntitiesFromStoreCandidate(candidate);
    expect(entities.storeName).toMatch(/PTH/i);
    expect(entities.phone).toBeTruthy();
  });

  it('stashIntakeWorkflowContext round-trips through hydrate', () => {
    const sessionKey = 'user:abc';
    stashIntakeWorkflowContext(sessionKey, {
      pendingIntents: ['create_store'],
      entities: { storeName: 'Morning Bakery' },
    });
    const hydrated = hydrateIntentSourceFromWorkflow({}, null, sessionKey);
    expect(hydrated?.workflowEntities?.storeName).toBe('Morning Bakery');
    expect(hydrated?.pendingIntents).toContain('create_store');
  });
});
