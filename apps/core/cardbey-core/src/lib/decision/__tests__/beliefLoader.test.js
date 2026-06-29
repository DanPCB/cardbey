import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { loadBelief, summarizeBeliefForShadow } from '../beliefLoader.js';
import { persistBeliefDelta } from '../persistBeliefDelta.js';
import { noteDivergence, hasMaterialDivergence } from '../beliefDivergence.js';
import {
  clearIntakeWorkflowContextForTests,
  persistUploadedAssetWorkflow,
} from '../../intake/intakeWorkflowContext.js';
import { buildStoreCandidateFromOcr } from '../../intake/storeCandidate.js';
import {
  clearPersistedIntentStoreForTests,
  setPersistedIntentResolution,
} from '../../intake/intakePersistedIntentStore.js';

const SAMPLE_CARD = `JOE'S BAKERY
555-1234
joe@bakery.com
123 Main St, Melbourne`;

afterEach(() => {
  clearIntakeWorkflowContextForTests();
  clearPersistedIntentStoreForTests();
});

describe('beliefLoader', () => {
  it('returns empty upload state when no session evidence', async () => {
    const belief = await loadBelief({
      sessionId: 'sess-1',
      sessionKey: 'sess-1',
      currentContext: {},
    });
    expect(belief.lastUpload).toBeNull();
    expect(belief.pendingClarify).toBeNull();
    expect(belief.loaderVersion).toBeTruthy();
  });

  it('merges workflow stash into lastUpload', async () => {
    const sessionKey = 'sess-upload-1';
    const candidate = buildStoreCandidateFromOcr(SAMPLE_CARD, { documentType: 'business_card' });
    persistUploadedAssetWorkflow(sessionKey, {
      id: 'doc-1',
      artifactType: 'document_extraction',
      documentType: 'business_card',
      storeCandidate: candidate,
      rawOcrText: SAMPLE_CARD,
      imageDataUrl: 'data:image/png;base64,abc',
      confidence: candidate.confidence,
      createdAt: new Date().toISOString(),
    });

    const belief = await loadBelief({
      sessionId: sessionKey,
      sessionKey,
      currentContext: {},
    });

    expect(belief.lastUpload).not.toBeNull();
    expect(belief.lastUpload?.businessName).toMatch(/JOE/i);
    expect(belief.lastUpload?.ocrText).toContain('BAKERY');
    expect(belief.lastUpload?.imageRef).toContain('data:image');
    expect(belief.sourcesLoaded).toContain('workflow_map');
  });

  it('infers pendingClarify for upload awaiting goal', async () => {
    const sessionKey = 'sess-upload-2';
    const candidate = buildStoreCandidateFromOcr(SAMPLE_CARD, { documentType: 'business_card' });
    persistUploadedAssetWorkflow(sessionKey, {
      id: 'doc-2',
      artifactType: 'document_extraction',
      documentType: 'business_card',
      storeCandidate: candidate,
      rawOcrText: SAMPLE_CARD,
      imageDataUrl: 'data:image/png;base64,xyz',
      confidence: candidate.confidence,
      createdAt: new Date().toISOString(),
    });

    const belief = await loadBelief({
      sessionId: sessionKey,
      sessionKey,
      intentSourceContext: { uploadedAssetPending: true },
      currentContext: {},
    });

    expect(belief.pendingClarify?.type).toBe('upload_goal');
  });

  it('detects storeId divergence between client and context engine', async () => {
    const divergences = [];
    noteDivergence(divergences, 'storeId', 'store-a', 'context_engine', 'store-b', 'client_context');
    expect(hasMaterialDivergence(divergences)).toBe(true);
  });

  it('loads persisted intent into activeGoal', async () => {
    setPersistedIntentResolution({
      actorKey: 'u:user-1',
      tenantKey: 't:user-1',
      missionId: 'm-1',
      storeId: null,
      draftId: null,
      family: 'promotion_campaign',
      subtype: 'launch_campaign',
      chosenTool: 'launch_campaign',
      source: 'test',
    });

    const belief = await loadBelief({
      sessionId: 'sess-1',
      sessionKey: 'sess-1',
      req: {
        user: { id: 'user-1' },
      },
      body: { missionId: 'm-1' },
      currentContext: {},
    });

    expect(belief.activeGoal?.intent).toBe('launch_campaign');
    expect(belief.sourcesLoaded).toContain('persisted_intent');
  });

  it('summarizeBeliefForShadow exposes upload continuity fields', async () => {
    const sessionKey = 'sess-summary';
    persistUploadedAssetWorkflow(sessionKey, {
      id: 'doc-3',
      artifactType: 'document_extraction',
      documentType: 'business_card',
      storeCandidate: buildStoreCandidateFromOcr(SAMPLE_CARD, { documentType: 'business_card' }),
      rawOcrText: SAMPLE_CARD,
      imageDataUrl: 'data:image/png;base64,sum',
      confidence: 0.9,
      createdAt: new Date().toISOString(),
    });

    const belief = await loadBelief({ sessionId: sessionKey, sessionKey, currentContext: {} });
    const summary = summarizeBeliefForShadow(belief);
    expect(summary.hasLastUpload).toBe(true);
    expect(summary.uploadBusinessName).toMatch(/JOE/i);
  });
});

describe('persistBeliefDelta', () => {
  it('writes workflow patch when sessionKey present', async () => {
    const result = await persistBeliefDelta({
      sessionKey: 'sess-delta-1',
      workflow: { type: 'store_creation', status: 'pending_confirmation', source: 'test' },
      pendingClarify: {
        type: 'upload_goal',
        options: [{ id: 'create_store' }],
      },
    });
    expect(result.applied).toContain('workflow_map');

    const belief = await loadBelief({
      sessionId: 'sess-delta-1',
      sessionKey: 'sess-delta-1',
      currentContext: {},
    });
    expect(belief.workflow?.type).toBe('store_creation');
  });
});
