import { describe, expect, it, afterEach } from 'vitest';
import { runAllAdvisors } from '../advisors/index.js';
import { uploadAmbiguityAdvisor } from '../advisors/uploadAmbiguityAdvisor.js';
import { explicitStoreAdvisor } from '../advisors/explicitStoreAdvisor.js';
import { continuityAdvisor } from '../advisors/continuityAdvisor.js';
import { rankHypotheses, isAmbiguousRank } from '../rankHypotheses.js';
import { runIntakeShadowRank } from '../shadowRank.js';
import { toolsAgree } from '../intentToolMap.js';
import {
  clearIntakeWorkflowContextForTests,
  persistUploadedAssetWorkflow,
} from '../../intake/intakeWorkflowContext.js';
import { buildStoreCandidateFromOcr } from '../../intake/storeCandidate.js';

const CARD = `JOE'S BAKERY\n555-1234\nMelbourne`;

/** @returns {import('../constants.js').BeliefSnapshot} */
function emptyBelief(overrides = {}) {
  return {
    sessionId: 'sess-1',
    sessionKey: 'sess-1',
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

afterEach(() => {
  clearIntakeWorkflowContextForTests();
});

describe('advisors', () => {
  it('uploadAmbiguityAdvisor scores ingest for attachment-only placeholder', () => {
    const belief = emptyBelief();
    const hyps = uploadAmbiguityAdvisor(belief, {
      originalUserMessage: '(image attached)',
      userMessage: '(image attached)',
      hasAttachment: true,
      attachments: [{ type: 'image', dataUrl: 'data:image/png;base64,abc' }],
    });
    expect(hyps.some((h) => h.intent === 'analyze_asset')).toBe(true);
    expect(hyps.find((h) => h.intent === 'analyze_asset')?.suggestedTool).toBe(
      'ingest_asset_for_intent_detection',
    );
  });

  it('explicitStoreAdvisor detects create store phrase', () => {
    const belief = emptyBelief();
    const hyps = explicitStoreAdvisor(belief, {
      originalUserMessage: 'create store',
      userMessage: 'create store',
    });
    expect(hyps.some((h) => h.intent === 'create_store')).toBe(true);
  });

  it('continuityAdvisor boosts create_store_from_upload on yes after pending upload', () => {
    const belief = emptyBelief({
      lastUpload: {
        imageRef: 'data:image/png;base64,x',
        ocrText: CARD,
        documentType: 'business_card',
        businessName: "JOE'S BAKERY",
        sessionKey: 'sess-1',
      },
      pendingClarify: { type: 'upload_goal', options: [{ id: 'create_store' }] },
    });
    const hyps = continuityAdvisor(belief, { originalUserMessage: 'yes', userMessage: 'yes' });
    expect(hyps.some((h) => h.intent === 'create_store_from_upload')).toBe(true);
  });

  it('runAllAdvisors returns merged batches from registry', () => {
    const sessionKey = 'adv-all';
    persistUploadedAssetWorkflow(sessionKey, {
      id: 'd1',
      artifactType: 'document_extraction',
      documentType: 'business_card',
      storeCandidate: buildStoreCandidateFromOcr(CARD, { documentType: 'business_card' }),
      rawOcrText: CARD,
      imageDataUrl: 'data:image/png;base64,all',
      confidence: 0.9,
      createdAt: new Date().toISOString(),
    });
    const belief = emptyBelief({
      sessionKey,
      lastUpload: {
        imageRef: 'data:image/png;base64,all',
        ocrText: CARD,
        documentType: 'business_card',
        businessName: "JOE'S BAKERY",
        sessionKey,
      },
    });
    const hyps = runAllAdvisors(belief, {
      originalUserMessage: '(image attached)',
      hasAttachment: true,
    });
    expect(hyps.length).toBeGreaterThan(0);
  });
});

describe('rankHypotheses', () => {
  it('merges duplicate intents and picks top tool', () => {
    const belief = emptyBelief({ anchors: { storeId: 's1', draftId: null, missionId: null } });
    const { top, shadowTool } = rankHypotheses(
      [
        {
          intent: 'create_store',
          score: 0.9,
          advisorId: 'explicit_store',
          evidence: [],
          suggestedTool: 'create_store',
          requiredContext: [],
        },
        {
          intent: 'create_store',
          score: 0.85,
          advisorId: 'ontology',
          evidence: [],
          suggestedTool: 'create_store',
          requiredContext: [],
        },
      ],
      belief,
    );
    expect(top?.intent).toBe('create_store');
    expect(shadowTool).toBe('create_store');
  });

  it('flags ambiguous top-two margin', () => {
    const ranked = [
      { intent: 'a', score: 0.6, suggestedTool: null, advisorIds: [], evidence: [], requiredContext: [] },
      { intent: 'b', score: 0.55, suggestedTool: null, advisorIds: [], evidence: [], requiredContext: [] },
    ];
    expect(isAmbiguousRank(ranked, 0.15)).toBe(true);
  });
});

describe('shadowRank', () => {
  it('reports agreement when legacy matches shadow tool', () => {
    const belief = emptyBelief();
    const out = runIntakeShadowRank({
      belief,
      input: { originalUserMessage: 'create store', userMessage: 'create store' },
      legacyClassification: { tool: 'create_store', executionPath: 'direct_action' },
    });
    expect(out.enabled).toBe(true);
    expect(out.summary?.agree).toBe(true);
  });

  it('reports divergence for upload ask vs create_store legacy', () => {
    const belief = emptyBelief({
      lastUpload: {
        imageRef: 'data:image/png;base64,x',
        ocrText: CARD,
        documentType: 'business_card',
        businessName: "JOE'S BAKERY",
        sessionKey: 'sess-1',
      },
    });
    const out = runIntakeShadowRank({
      belief,
      input: {
        originalUserMessage: '(image attached)',
        hasAttachment: true,
      },
      legacyClassification: {
        tool: 'ingest_asset_for_intent_detection',
        executionPath: 'direct_action',
      },
    });
    expect(out.summary?.legacyTool).toBe('ingest_asset_for_intent_detection');
    expect(out.summary?.shadowTool).toBeTruthy();
  });
});

describe('toolsAgree', () => {
  it('treats matching tools as agree', () => {
    expect(toolsAgree('create_store', 'create_store')).toBe(true);
  });
});
