import { describe, expect, it } from 'vitest';
import {
  UPLOAD_INTAKE_PHASE,
  buildUploadAttachmentGuardCtx,
  clearStaleAssetAction,
  enforceUploadAskIntentClassification,
  isUploadOnlyAskTurn,
  resolveUploadIntakePhase,
  applyUploadPhaseRouting,
} from '../uploadIntakePhase.js';
import { isAttachmentOnlyPlaceholderMessage } from '../assetUploadGuard.js';

const IMAGE = 'data:image/png;base64,' + 'a'.repeat(120);

function withUpload(message, extra = {}) {
  return {
    userMessage: message,
    intentSourceContext: extra.intentSourceContext ?? {},
    attachments: [{ type: 'image', dataUrl: IMAGE }],
    imageDataUrl: IMAGE,
    sessionId: 'sess-1',
    ...extra,
  };
}

describe('resolveUploadIntakePhase (deprecated)', () => {
  it('always returns none — decision loop is sole authority', () => {
    expect(resolveUploadIntakePhase(withUpload('(Image attached)')).phase).toBe(UPLOAD_INTAKE_PHASE.NONE);
    expect(resolveUploadIntakePhase(withUpload('create a store from this card')).phase).toBe(
      UPLOAD_INTAKE_PHASE.NONE,
    );
  });
});

describe('applyUploadPhaseRouting (deprecated)', () => {
  it('passes classification through unchanged', () => {
    const classification = { tool: 'create_store', executionPath: 'direct_action' };
    const out = applyUploadPhaseRouting({
      phase: UPLOAD_INTAKE_PHASE.ASK_INTENT,
      userMessage: '(Image attached)',
      classification,
      body: {},
      intentSourceContext: {},
      uploadedAssetRoutingCtx: {},
    });
    expect(out.classification).toEqual(classification);
    expect(out.skipCreateStoreEarlyDraft).toBe(false);
  });
});

describe('clearStaleAssetAction', () => {
  it('clears assetAction on placeholder', () => {
    const cleared = clearStaleAssetAction({ assetAction: 'create_store' }, '(Image attached)');
    expect(cleared.assetAction).toBeUndefined();
    expect(cleared.uploadedAssetPending).toBe(true);
  });

  it('preserves assetAction on explicit message', () => {
    const preserved = clearStaleAssetAction(
      { assetAction: 'create_store' },
      'create a store from this card',
    );
    expect(preserved.assetAction).toBe('create_store');
  });
});

describe('isAttachmentOnlyPlaceholderMessage', () => {
  it('recognizes common placeholders', () => {
    expect(isAttachmentOnlyPlaceholderMessage('(Image attached)')).toBe(true);
    expect(isAttachmentOnlyPlaceholderMessage('image attached')).toBe(true);
    expect(isAttachmentOnlyPlaceholderMessage('create a store')).toBe(false);
  });
});

describe('buildUploadAttachmentGuardCtx', () => {
  it('detects session stash as upload evidence', () => {
    const ctx = buildUploadAttachmentGuardCtx({
      sessionId: 'sess-1',
      hasSessionPendingExtraction: true,
    });
    expect(isUploadOnlyAskTurn('(Image attached)', ctx)).toBe(true);
  });
});

describe('enforceUploadAskIntentClassification (deprecated)', () => {
  it('never applies — decision loop owns upload ask', () => {
    const guardCtx = withUpload('(Image attached)');
    const classification = {
      tool: 'create_store',
      executionPath: 'proactive_plan',
      confidence: 0.7,
      parameters: {},
    };
    const out = enforceUploadAskIntentClassification({
      userMessage: '(Image attached)',
      classification,
      body: { attachments: guardCtx.attachments, imageDataUrl: guardCtx.imageDataUrl },
      intentSourceContext: {},
      uploadAttachmentGuardCtx: guardCtx,
      storeId: null,
      resolveImageRef: () => guardCtx.imageDataUrl,
      reason: 'test',
    });
    expect(out.applied).toBe(false);
    expect(out.classification).toEqual(classification);
  });
});
