import { describe, expect, it } from 'vitest';
import { hydrateBeliefForDecisionLoop } from '../hydrateBeliefForDecisionLoop.js';
import {
  tryEarlyDecisionLoopGate,
  buildUploadAskClarifyFromBelief,
  shouldRequireUploadAskPanel,
  shouldSkipCreateStoreEarlyDraftForDecisionLoop,
} from '../earlyDecisionLoopGate.js';
import { UPLOAD_INTAKE_PHASE } from '../../intake/uploadIntakePhase.js';

/** @returns {import('../constants.js').BeliefSnapshot} */
function baseBelief(overrides = {}) {
  return {
    sessionId: 'sess-early',
    sessionKey: 'sess-early',
    identity: { guest: false, actorId: 'u:1', userId: '1' },
    anchors: { storeId: null, draftId: null, missionId: null },
    workflow: null,
    lastUpload: null,
    activeGoal: null,
    pendingClarify: null,
    blockers: [],
    sourcesLoaded: [],
    divergences: [],
    loadedAt: new Date().toISOString(),
    loaderVersion: '1.0.0',
    ...overrides,
  };
}

describe('hydrateBeliefForDecisionLoop', () => {
  it('hydrates lastUpload and pendingClarify for attachment-only turn', () => {
    const hydrated = hydrateBeliefForDecisionLoop(baseBelief(), {
      imageDataUrl: 'data:image/png;base64,abc',
      extractedText: 'JOE BAKERY\n123 Main St',
      attachmentOnlyUpload: true,
      hasAttachment: true,
    });

    expect(hydrated?.lastUpload?.imageRef).toContain('data:image');
    expect(hydrated?.lastUpload?.businessName).toMatch(/JOE/i);
    expect(hydrated?.pendingClarify?.type).toBe('upload_goal');
    expect(hydrated?.workflow?.status).toBe('pending_confirmation');
  });

  it('creates ephemeral belief when loader has not run yet', () => {
    const hydrated = hydrateBeliefForDecisionLoop(null, {
      imageDataUrl: 'data:image/png;base64,abc',
      attachmentOnlyUpload: true,
      hasAttachment: true,
      sessionKey: 'sess-upload',
    });
    expect(hydrated?.sessionKey).toBe('sess-upload');
    expect(hydrated?.lastUpload?.imageRef).toContain('data:image');
    expect(hydrated?.pendingClarify?.type).toBe('upload_goal');
  });
});

describe('earlyDecisionLoopGate', () => {
  it('tryEarlyDecisionLoopGate is retired (always null)', async () => {
    const gate = await tryEarlyDecisionLoopGate({
      attachmentOnlyUpload: true,
      hasImageAttachment: true,
      classification: { tool: 'create_store' },
      belief: baseBelief(),
    });
    expect(gate).toBeNull();
  });

  it('shouldRequireUploadAskPanel false when uploadedAssetPending is stale without attachment', () => {
    expect(
      shouldRequireUploadAskPanel({
        attachmentOnlyUpload: false,
        intentSourceContext: { uploadedAssetPending: true },
        userMessage: 'confirm',
      }),
    ).toBe(false);
  });

  it('shouldRequireUploadAskPanel when uploadedAssetPending with live attachment', () => {
    expect(
      shouldRequireUploadAskPanel({
        attachmentOnlyUpload: false,
        hasImageAttachment: true,
        imageDataUrl: 'data:image/png;base64,abc',
        intentSourceContext: { uploadedAssetPending: true },
        userMessage: '(Image attached)',
      }),
    ).toBe(true);
  });

  it('shouldRequireUploadAskPanel false for casual greeting', () => {
    expect(
      shouldRequireUploadAskPanel({
        attachmentOnlyUpload: false,
        intentSourceContext: { uploadedAssetPending: true },
        userMessage: 'hi',
      }),
    ).toBe(false);
  });

  it('shouldRequireUploadAskPanel false for explicit create from upload', () => {
    expect(
      shouldRequireUploadAskPanel({
        attachmentOnlyUpload: true,
        userMessage: 'create store from uploaded card above',
        advisorInput: {
          userMessage: 'create store from uploaded card above',
        },
      }),
    ).toBe(false);
  });

  it('shouldRequireUploadAskPanel true for ASK_INTENT phase', () => {
    expect(
      shouldRequireUploadAskPanel({
        attachmentOnlyUpload: false,
        uploadIntakePhase: UPLOAD_INTAKE_PHASE.ASK_INTENT,
        userMessage: '(Image attached)',
      }),
    ).toBe(true);
  });

  it('buildUploadAskClarifyFromBelief returns Create store option', () => {
    const belief = hydrateBeliefForDecisionLoop(baseBelief(), {
      imageDataUrl: 'data:image/png;base64,abc',
      extractedText: 'PTH SHOP',
      attachmentOnlyUpload: true,
      hasAttachment: true,
    });
    const payload = buildUploadAskClarifyFromBelief(belief);
    expect(payload.action).toBe('clarify');
    expect(payload.options?.some((o) => o.label === 'Create store')).toBe(true);
    expect(payload.response).toMatch(/upload|next/i);
  });

  it('shouldSkipCreateStoreEarlyDraftForDecisionLoop always false after fork collapse', () => {
    expect(
      shouldSkipCreateStoreEarlyDraftForDecisionLoop({
        _decisionLoop: true,
        tool: 'ingest_asset_for_intent_detection',
      }),
    ).toBe(false);
  });
});
