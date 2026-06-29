import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { decideTurn } from '../decideTurn.js';
import { turnResultToClassification } from '../turnResultToClassification.js';
import { runDecisionLoopAuthority } from '../runDecisionLoopAuthority.js';
import { evaluateToolGovernance } from '../governancePolicy.js';
import { clearIntakeWorkflowContextForTests } from '../../intake/intakeWorkflowContext.js';

/** @returns {import('../constants.js').BeliefSnapshot} */
function belief(overrides = {}) {
  return {
    sessionId: 'sess-dt',
    sessionKey: 'sess-dt',
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

describe('decideTurn', () => {
  it('returns present_options for placeholder upload without prior belief stash', () => {
    const result = decideTurn(belief(), {
      originalUserMessage: '(image attached)',
      userMessage: '(image attached)',
      hasAttachment: true,
      imageDataUrl: 'data:image/png;base64,x',
    });

    expect(result.nextStep).toBe('present_options');
    expect(result.options?.some((o) => o.label === 'Create store')).toBe(true);
    expect(result.rationale).toMatch(/upload|next/i);
  });

  it('returns present_options for upload awaiting goal', () => {
    const result = decideTurn(
      belief({
        lastUpload: {
          imageRef: 'data:image/png;base64,x',
          ocrText: 'JOE BAKERY',
          documentType: 'business_card',
          businessName: 'JOE BAKERY',
          sessionKey: 'sess-dt',
        },
        pendingClarify: { type: 'upload_goal', options: [{ id: 'create_store' }] },
      }),
      { originalUserMessage: '(image attached)', hasAttachment: true },
    );

    expect(result.nextStep).toBe('present_options');
    expect(result.tool?.name).toBe('ingest_asset_for_intent_detection');
    expect(result.options?.length).toBeGreaterThan(0);
    expect(result.rationale).toMatch(/upload/i);
  });

  it('executes create_store for explicit phrase', () => {
    const result = decideTurn(belief(), {
      originalUserMessage: 'create store',
      userMessage: 'create store',
    });

    expect(result.nextStep).toBe('execute');
    expect(result.tool?.name).toBe('create_store');
    expect(result.chosen?.intent).toBe('create_store');
  });

  it('executes create_store_from_upload with business name prefill', () => {
    const result = decideTurn(
      belief({
        lastUpload: {
          imageRef: 'data:image/png;base64,x',
          ocrText: 'JOE BAKERY',
          documentType: 'business_card',
          businessName: 'JOE BAKERY',
          sessionKey: 'sess-dt',
        },
      }),
      { originalUserMessage: 'create store from this card', hasAttachment: true },
    );

    expect(['execute', 'checkpoint']).toContain(result.nextStep);
    expect(result.tool?.name).toBe('create_store');
    expect(result.tool?.parameters?.storeName).toBe('JOE BAKERY');
    expect(result.tool?.parameters?._autoSubmit).toBe(false);
  });

  it('checkpoint for campaign when store present', () => {
    const result = decideTurn(
      belief({ anchors: { storeId: 'store-1', draftId: null, missionId: null } }),
      { originalUserMessage: 'launch a marketing campaign', userMessage: 'launch a marketing campaign' },
    );

    expect(result.nextStep).toBe('checkpoint');
    expect(result.governance.requiresConfirmation).toBe(true);
    expect(result.tool?.parameters?._autoSubmit).toBe(false);
  });
});

describe('turnResultToClassification', () => {
  it('maps present_options to clarify executionPath', () => {
    const turn = decideTurn(
      belief({
        lastUpload: {
          imageRef: 'data:image/png;base64,x',
          ocrText: 'X',
          documentType: 'business_card',
          businessName: 'X',
          sessionKey: 'sess-dt',
        },
        pendingClarify: { type: 'upload_goal' },
      }),
      { originalUserMessage: '(image attached)', hasAttachment: true },
    );
    const cls = turnResultToClassification(turn);
    expect(cls.executionPath).toBe('clarify');
    expect(cls._decisionLoop).toBe(true);
    expect(cls._classificationOverride).toBeUndefined();
  });
});

describe('governancePolicy', () => {
  it('requires confirmation for launch_campaign', () => {
    const gov = evaluateToolGovernance('launch_campaign');
    expect(gov.requiresConfirmation).toBe(true);
    expect(gov.confirmationState).toBe('pending');
  });

  it('does not require confirmation for ingest_asset', () => {
    const gov = evaluateToolGovernance('ingest_asset_for_intent_detection');
    expect(gov.requiresConfirmation).toBe(false);
  });
});

describe('runDecisionLoopAuthority', () => {
  const prev = process.env.INTAKE_DECISION_LOOP_AUTHORITY;

  beforeEach(() => {
    process.env.INTAKE_DECISION_LOOP_AUTHORITY = 'false';
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.INTAKE_DECISION_LOOP_AUTHORITY;
    else process.env.INTAKE_DECISION_LOOP_AUTHORITY = prev;
  });

  it('returns authority false when flag off', async () => {
    const out = await runDecisionLoopAuthority({
      belief: belief(),
      input: { originalUserMessage: 'create store' },
    });
    expect(out.authority).toBe(false);
  });
});
