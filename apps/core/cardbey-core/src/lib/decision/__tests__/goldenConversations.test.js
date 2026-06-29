/**
 * Golden conversation fixtures — Phase 0 spec, Phase 1 belief gates, Phase 3 turn results.
 */

import { describe, expect, it, afterEach, vi } from 'vitest';
import { loadBelief } from '../beliefLoader.js';
import { decideTurn } from '../decideTurn.js';
import { turnResultToClassification } from '../turnResultToClassification.js';
import {
  clearIntakeWorkflowContextForTests,
  persistUploadedAssetWorkflow,
} from '../../intake/intakeWorkflowContext.js';
import { buildStoreCandidateFromOcr } from '../../intake/storeCandidate.js';

const BUSINESS_CARD_OCR = `PTH INTERNATIONAL FURNITURE
02 6041 3091
pth.furniture@gmail.com
Unit 5/12 Maitland Drive, Derrimut, Vic 3026`;

afterEach(() => {
  clearIntakeWorkflowContextForTests();
});

/** @param {string} sessionKey */
function seedUpload(sessionKey) {
  const candidate = buildStoreCandidateFromOcr(BUSINESS_CARD_OCR, { documentType: 'business_card' });
  persistUploadedAssetWorkflow(sessionKey, {
    id: 'golden-doc-1',
    artifactType: 'document_extraction',
    documentType: 'business_card',
    storeCandidate: candidate,
    rawOcrText: BUSINESS_CARD_OCR,
    imageDataUrl: 'data:image/png;base64,goldencard',
    confidence: candidate.confidence,
    createdAt: new Date().toISOString(),
  });
}

/** @param {import('../constants.js').BeliefSnapshot} belief */
function uploadBeliefFromSession(sessionKey, belief) {
  return {
    ...belief,
    sessionId: sessionKey,
    sessionKey,
    lastUpload: {
      imageRef: 'data:image/png;base64,goldencard',
      ocrText: BUSINESS_CARD_OCR,
      documentType: 'business_card',
      businessName: 'PTH INTERNATIONAL FURNITURE',
      sessionKey,
    },
    pendingClarify: { type: 'upload_goal', options: [{ id: 'create_store' }] },
    workflow: { status: 'pending_confirmation' },
  };
}

/** @param {string} sessionKey */
async function loadUploadBelief(sessionKey) {
  seedUpload(sessionKey);
  return loadBelief({
    sessionId: sessionKey,
    sessionKey,
    intentSourceContext: { uploadedAssetPending: true },
    currentContext: {},
  });
}

describe('golden conversations — belief layer (Phase 1)', () => {
  it('scenario 1 turn 1: image only → belief has upload + pending clarify', async () => {
    const sessionKey = 'golden-s1-t1';
    seedUpload(sessionKey);

    const belief = await loadBelief({
      sessionId: sessionKey,
      sessionKey,
      intentSourceContext: { uploadedAssetPending: true },
      currentContext: {},
    });

    expect(belief.lastUpload).not.toBeNull();
    expect(belief.lastUpload?.businessName).toMatch(/PTH/i);
    expect(belief.pendingClarify?.type).toBe('upload_goal');
  });

  it('scenario 3 turn 2: create store without re-attach → belief retains upload', async () => {
    const sessionKey = 'golden-s3-t2';
    seedUpload(sessionKey);

    const belief = await loadBelief({
      sessionId: sessionKey,
      sessionKey,
      intentSourceContext: {
        pendingImageDataUrl: 'data:image/png;base64,goldencard',
      },
      currentContext: {},
      body: { message: 'create store' },
    });

    expect(belief.lastUpload).not.toBeNull();
    expect(belief.lastUpload?.ocrText).toContain('FURNITURE');
    expect(belief.lastUpload?.imageRef).toContain('data:image');
  });

  it('scenario 3 turn 2 failure mode: no session handoff → upload still in server stash', async () => {
    const sessionKey = 'golden-s3-server-only';
    seedUpload(sessionKey);

    const belief = await loadBelief({
      sessionId: sessionKey,
      sessionKey,
      intentSourceContext: null,
      currentContext: {},
      body: { message: 'create store' },
    });

    expect(belief.lastUpload).not.toBeNull();
    expect(belief.lastUpload?.businessName).toMatch(/PTH/i);
  });
});

describe('golden conversations — turn result (Phase 3 authority flag)', () => {
  it('decideTurn is exported and authority flag defaults off', async () => {
    const prev = process.env.INTAKE_DECISION_LOOP_AUTHORITY;
    delete process.env.INTAKE_DECISION_LOOP_AUTHORITY;
    vi.resetModules();
    const { isIntakeDecisionLoopAuthorityEnabled } = await import('../constants.js');
    expect(typeof decideTurn).toBe('function');
    expect(isIntakeDecisionLoopAuthorityEnabled()).toBe(false);
    if (prev === undefined) delete process.env.INTAKE_DECISION_LOOP_AUTHORITY;
    else process.env.INTAKE_DECISION_LOOP_AUTHORITY = prev;
    vi.resetModules();
  });

  it('scenario 1: nextStep present_options without _classificationOverride', async () => {
    const sessionKey = 'golden-s1-turn';
    const belief = uploadBeliefFromSession(sessionKey, await loadUploadBelief(sessionKey));

    const turn = decideTurn(belief, {
      originalUserMessage: '(image attached)',
      userMessage: '(image attached)',
      hasAttachment: true,
    });
    const classification = turnResultToClassification(turn);

    expect(turn.nextStep).toBe('present_options');
    expect(turn.chosen?.intent).toBe('analyze_asset');
    expect(turn.governance.confirmationState).toBe('not_required');
    expect(turn.tool?.name).not.toBe('create_store');
    expect(turn.tool?.parameters?._autoSubmit).toBeUndefined();
    expect(classification._classificationOverride).toBeUndefined();
    expect(classification.executionPath).toBe('clarify');
    expect(classification.clarifyOptions?.length).toBeGreaterThan(0);
  });

  it('scenario 10: vague creation language must not campaign autoSubmit', async () => {
    const sessionKey = 'golden-s10';
    const belief = uploadBeliefFromSession(sessionKey, await loadUploadBelief(sessionKey));

    const turn = decideTurn(belief, {
      originalUserMessage: 'help me grow my business',
      userMessage: 'help me grow my business',
      hasAttachment: true,
    });
    const classification = turnResultToClassification(turn);

    expect(turn.nextStep).toBe('present_options');
    expect(turn.tool?.name).not.toBe('launch_campaign');
    expect(turn.tool?.parameters?._autoSubmit).not.toBe(true);
    expect(classification.parameters?._autoSubmit).not.toBe(true);
    expect(classification._classificationOverride).toBeUndefined();
  });

  it('scenario 15: campaign requires checkpoint and _autoSubmit false', () => {
    const turn = decideTurn(
      {
        sessionId: 'golden-s15',
        sessionKey: 'golden-s15',
        identity: { guest: false, actorId: 'u:1', userId: '1' },
        anchors: { storeId: 'store-golden', draftId: null, missionId: null },
        workflow: null,
        lastUpload: null,
        activeGoal: null,
        pendingClarify: null,
        blockers: [],
        sourcesLoaded: [],
        divergences: [],
        loadedAt: new Date().toISOString(),
        loaderVersion: '1.0.0',
      },
      { originalUserMessage: 'launch campaign', userMessage: 'launch campaign' },
    );
    const classification = turnResultToClassification(turn);

    expect(turn.nextStep).toBe('checkpoint');
    expect(turn.governance.requiresConfirmation).toBe(true);
    expect(turn.tool?.parameters?._autoSubmit).toBe(false);
    expect(classification.parameters?._autoSubmit).toBe(false);
    expect(classification._classificationOverride).toBeUndefined();
  });
});
