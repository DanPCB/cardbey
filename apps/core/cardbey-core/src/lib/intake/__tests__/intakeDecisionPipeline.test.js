import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { runIntakeDecisionPipeline } from '../intakeDecisionPipeline.js';
import { hydrateBeliefForDecisionLoop } from '../../decision/hydrateBeliefForDecisionLoop.js';
import { resetDecisionLoopHealthForTests } from '../../decision/decisionLoopHealth.js';

/** @returns {import('../../decision/constants.js').BeliefSnapshot} */
function baseBelief(overrides = {}) {
  return {
    sessionId: 'sess-pipe',
    sessionKey: 'sess-pipe',
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

describe('intakeDecisionPipeline', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    resetDecisionLoopHealthForTests();
    process.env.INTAKE_DECISION_LOOP_AUTHORITY = 'true';
  });

  afterEach(() => {
    process.env = envBackup;
    resetDecisionLoopHealthForTests();
  });

  it('returns upload ask clarify for attachment-only turn', async () => {
    const belief = hydrateBeliefForDecisionLoop(baseBelief(), {
      imageDataUrl: 'data:image/png;base64,abc',
      extractedText: 'JOE BAKERY',
      attachmentOnlyUpload: true,
      hasAttachment: true,
    });

    const result = await runIntakeDecisionPipeline({
      attachmentOnlyUpload: true,
      hasAttachment: true,
      imageDataUrl: 'data:image/png;base64,abc',
      extractedText: 'JOE BAKERY',
      beliefLoaderOpts: {
        sessionId: 'sess-pipe',
        sessionKey: 'sess-pipe',
        body: {},
        intentSourceContext: { uploadedAssetPending: true },
        currentContext: {},
      },
      advisorInput: {
        originalUserMessage: '(image attached)',
        userMessage: '(image attached)',
        hasAttachment: true,
        imageDataUrl: 'data:image/png;base64,abc',
      },
      belief,
    });

    expect(result.skipped).toBe(false);
    expect(result.httpPayload?.action).toBe('clarify');
    expect(result.httpPayload?.options?.length).toBeGreaterThan(0);
  });

  it('skips when decision loop authority is off', async () => {
    process.env.INTAKE_DECISION_LOOP_AUTHORITY = 'false';
    const result = await runIntakeDecisionPipeline({});
    expect(result.skipped).toBe(true);
  });
});
