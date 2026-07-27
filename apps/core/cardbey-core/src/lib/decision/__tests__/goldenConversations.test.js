/**
 * Golden conversation fixtures — Phase 0 spec, Phase 1 belief gates, Phase 3 turn results.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { loadBelief } from '../beliefLoader.js';
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
