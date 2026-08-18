import { describe, expect, it } from 'vitest';
import { buildIntakeResponse, buildUploadAskResponseFromBelief } from '../responseBuilder.js';
import { hydrateBeliefForDecisionLoop } from '../../decision/hydrateBeliefForDecisionLoop.js';

/** @returns {import('../../decision/constants.js').BeliefSnapshot} */
function baseBelief(overrides = {}) {
  return {
    sessionId: 'sess-rb',
    sessionKey: 'sess-rb',
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

describe('responseBuilder', () => {
  it('builds upload ask clarify panel for attachment-only upload', () => {
    const belief = hydrateBeliefForDecisionLoop(baseBelief(), {
      imageDataUrl: 'data:image/png;base64,abc',
      extractedText: 'JOE BAKERY\n123 Main St',
      attachmentOnlyUpload: true,
      hasAttachment: true,
    });

    const payload = buildUploadAskResponseFromBelief(belief);
    expect(payload.action).toBe('clarify');
    expect(payload.clarifyType).toBe('observe_first_upload');
    expect(payload.response).toMatch(/JOE BAKERY|read/i);
    expect(payload.options?.length).toBeGreaterThan(0);
    expect(payload.options?.some((o) => /Create store/i.test(o.label))).toBe(true);
    expect(payload.storeCreationDraft).toBeNull();
    expect(payload.turnBelief).toBeTruthy();
  });

  it('builds create_store draft when execute + upload belief', () => {
    const belief = hydrateBeliefForDecisionLoop(baseBelief(), {
      imageDataUrl: 'data:image/png;base64,abc',
      extractedText: 'PTH INTERNATIONAL FURNITURE\nMelbourne',
      attachmentOnlyUpload: false,
      hasAttachment: true,
    });

    const turnResult = {
      nextStep: 'execute',
      rationale: 'Creating store draft',
      tool: { name: 'create_store', parameters: { source: 'upload' } },
      governance: {},
      belief,
    };

    const payload = buildIntakeResponse(turnResult, belief);
    expect(payload.action).toBe('create_store');
    expect(payload.storeCreationDraft?.draft?.name).toMatch(/PTH/i);
    expect(payload.missingFields).toBeDefined();
  });

  it('uses upload ask question when clarify falls back to default upload options', () => {
    const belief = hydrateBeliefForDecisionLoop(baseBelief(), {
      imageDataUrl: 'data:image/png;base64,abc',
      attachmentOnlyUpload: true,
      hasAttachment: true,
    });
    const turnResult = {
      nextStep: 'clarify',
      rationale: 'Could you clarify what you would like to do?',
      options: undefined,
      tool: { name: 'general_chat', parameters: {} },
      governance: {},
      belief,
    };
    const payload = buildIntakeResponse(turnResult, belief);
    expect(payload.response).toMatch(/I see your upload/i);
    expect(payload.options?.some((o) => o.label === 'Create store')).toBe(true);
  });
});
