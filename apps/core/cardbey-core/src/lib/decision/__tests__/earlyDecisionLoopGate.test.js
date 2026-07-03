import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { hydrateBeliefForDecisionLoop } from '../hydrateBeliefForDecisionLoop.js';
import {
  tryEarlyDecisionLoopGate,
  buildClarifyPayloadFromTurnResult,
  buildUploadAskClarifyFromBelief,
  shouldRequireUploadAskPanel,
  shouldSkipCreateStoreEarlyDraftForDecisionLoop,
} from '../earlyDecisionLoopGate.js';
import { UPLOAD_INTAKE_PHASE } from '../../intake/uploadIntakePhase.js';
import { decideTurn } from '../decideTurn.js';
import { turnResultToClassification } from '../turnResultToClassification.js';

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
  const prevAuthority = process.env.INTAKE_DECISION_LOOP_AUTHORITY;

  beforeEach(() => {
    process.env.INTAKE_DECISION_LOOP_AUTHORITY = 'true';
  });

  afterEach(() => {
    if (prevAuthority === undefined) delete process.env.INTAKE_DECISION_LOOP_AUTHORITY;
    else process.env.INTAKE_DECISION_LOOP_AUTHORITY = prevAuthority;
  });

  it('returns clarify payload for upload-only attachment', async () => {
    const belief = hydrateBeliefForDecisionLoop(baseBelief(), {
      imageDataUrl: 'data:image/png;base64,abc',
      extractedText: 'PTH INTERNATIONAL FURNITURE',
      attachmentOnlyUpload: true,
      hasAttachment: true,
    });

    const gate = await tryEarlyDecisionLoopGate({
      attachmentOnlyUpload: true,
      hasImageAttachment: true,
      classification: { tool: 'create_store', executionPath: 'direct_action', confidence: 0.8 },
      belief,
      imageDataUrl: 'data:image/png;base64,abc',
      extractedText: 'PTH INTERNATIONAL FURNITURE',
      advisorInput: {
        originalUserMessage: '(image attached)',
        userMessage: '(image attached)',
        hasAttachment: true,
        imageDataUrl: 'data:image/png;base64,abc',
      },
    });

    expect(gate).not.toBeNull();
    expect(gate?.clarifyPayload?.action).toBe('clarify');
    expect(gate?.clarifyPayload?.options?.length).toBeGreaterThan(0);
    expect(gate?.clarifyPayload?.options?.some((o) => o.label === 'Create store')).toBe(true);
    expect(gate?.clarifyPayload?.response).toMatch(/upload|next/i);
    expect(gate?.classification?._decisionLoop).toBe(true);
    expect(gate?.summary?.event).toBe('upload_ask_rule1_early_gate');
  });

  it('returns upload ask panel without prior belief loader row', async () => {
    const gate = await tryEarlyDecisionLoopGate({
      attachmentOnlyUpload: true,
      hasImageAttachment: true,
      imageDataUrl: 'data:image/png;base64,xyz',
      classification: { tool: 'general_chat', executionPath: 'chat', confidence: 0.2 },
      belief: null,
      advisorInput: {
        originalUserMessage: '(Image attached)',
        userMessage: '(Image attached)',
        hasAttachment: true,
        imageDataUrl: 'data:image/png;base64,xyz',
      },
    });

    expect(gate?.clarifyPayload?.response).toMatch(/I see your upload/i);
    expect(gate?.clarifyPayload?.options?.some((o) => o.label === 'Create store')).toBe(true);
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

  it('skips gate for confirm affirmation even with stale uploadedAssetPending', async () => {
    const gate = await tryEarlyDecisionLoopGate({
      attachmentOnlyUpload: false,
      hasImageAttachment: false,
      intentSourceContext: { uploadedAssetPending: true, pendingImageDataUrl: 'data:image/png;base64,abc' },
      classification: { tool: 'create_campaign', executionPath: 'checkpoint', confidence: 0.9 },
      belief: baseBelief({
        lastUpload: {
          imageRef: 'data:image/png;base64,abc',
          ocrText: 'GOLF TOUR',
          documentType: 'flyer',
          businessName: 'Golf Tour',
          sessionKey: 'sess-early',
        },
        activeGoal: { intent: 'create_campaign', confidence: 0.9 },
      }),
      advisorInput: {
        originalUserMessage: 'confirm',
        userMessage: 'confirm',
        hasAttachment: false,
      },
      conversationHistory: [
        { role: 'user', content: 'Create a promotion campaign for my store' },
        { role: 'assistant', content: 'Please confirm before proceeding: create_campaign' },
      ],
    });

    expect(gate).toBeNull();
  });

  it('skips gate for casual greeting even with stale lastUpload belief', async () => {
    const gate = await tryEarlyDecisionLoopGate({
      attachmentOnlyUpload: false,
      hasImageAttachment: false,
      intentSourceContext: { uploadedAssetPending: true, pendingImageDataUrl: 'data:image/png;base64,abc' },
      classification: { tool: 'general_chat', executionPath: 'chat', confidence: 0.2 },
      belief: baseBelief({
        lastUpload: {
          imageRef: 'data:image/png;base64,abc',
          ocrText: 'JOE BAKERY',
          documentType: 'business_card',
          businessName: 'JOE BAKERY',
          sessionKey: 'sess-early',
        },
        pendingClarify: { type: 'upload_goal', options: [{ id: 'create_store' }] },
      }),
      beliefLoaderOpts: { sessionKey: 'sess-early', sessionId: 'sess-early', currentContext: {} },
      advisorInput: {
        originalUserMessage: 'hi',
        userMessage: 'hi',
        hasAttachment: false,
      },
    });

    expect(gate).toBeNull();
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

  it('returns upload ask when gate opens via uploadedAssetPending only', async () => {
    const gate = await tryEarlyDecisionLoopGate({
      attachmentOnlyUpload: false,
      hasImageAttachment: true,
      imageDataUrl: 'data:image/png;base64,abc',
      intentSourceContext: { uploadedAssetPending: true },
      classification: { tool: 'general_chat', executionPath: 'clarify', confidence: 0.2 },
      belief: null,
      advisorInput: {
        originalUserMessage: '(Image attached)',
        userMessage: '(Image attached)',
        hasAttachment: true,
        imageDataUrl: 'data:image/png;base64,abc',
      },
    });

    expect(gate?.clarifyPayload?.response).toMatch(/I see your upload/i);
    expect(gate?.summary?.event).toBe('upload_ask_rule1_early_gate');
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

  it('skips planners for explicit create from upload turn', async () => {
    const belief = hydrateBeliefForDecisionLoop(baseBelief(), {
      imageDataUrl: 'data:image/png;base64,abc',
      extractedText: 'PTH INTERNATIONAL FURNITURE\nDerrimut',
      hasAttachment: true,
    });

    const gate = await tryEarlyDecisionLoopGate({
      attachmentOnlyUpload: false,
      hasImageAttachment: false,
      intentSourceContext: { uploadedAssetPending: true, pendingImageDataUrl: 'data:image/png;base64,abc' },
      classification: { tool: 'general_chat', executionPath: 'chat', confidence: 0.5 },
      belief,
      advisorInput: {
        originalUserMessage: 'create store from uploaded card above',
        userMessage: 'create store from uploaded card above',
        hasAttachment: false,
        intentSourceContext: { uploadedAssetPending: true },
      },
    });

    expect(gate).not.toBeNull();
    expect(gate?.skipPlanners).toBe(true);
    expect(gate?.classification?.tool).toBe('create_store');
    expect(gate?.clarifyPayload).toBeNull();
  });

  it('skips gate when authority flag is off', async () => {
    process.env.INTAKE_DECISION_LOOP_AUTHORITY = 'false';
    const gate = await tryEarlyDecisionLoopGate({
      attachmentOnlyUpload: true,
      hasImageAttachment: true,
      classification: { tool: 'create_store' },
      belief: baseBelief(),
    });
    expect(gate).toBeNull();
  });

  it('buildClarifyPayloadFromTurnResult maps registered tools only', () => {
    const turn = decideTurn(
      baseBelief({
        lastUpload: {
          imageRef: 'data:image/png;base64,x',
          ocrText: 'X SHOP',
          documentType: 'business_card',
          businessName: 'X SHOP',
          sessionKey: 'sess-early',
        },
        pendingClarify: { type: 'upload_goal' },
      }),
      { originalUserMessage: '(image attached)', hasAttachment: true },
    );
    const cls = turnResultToClassification(turn);
    const payload = buildClarifyPayloadFromTurnResult(turn, cls);
    expect(payload.action).toBe('clarify');
    expect(payload.options?.some((o) => o.label === 'Create store')).toBe(true);
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

  it('shouldSkipCreateStoreEarlyDraftForDecisionLoop guards ingest reroute', () => {
    expect(
      shouldSkipCreateStoreEarlyDraftForDecisionLoop({
        _decisionLoop: true,
        tool: 'ingest_asset_for_intent_detection',
        executionPath: 'clarify',
        _decisionNextStep: 'present_options',
      }),
    ).toBe(true);
  });
});
