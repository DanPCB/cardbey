import { describe, expect, it } from 'vitest';
import {
  UPLOAD_INTAKE_PHASE,
  buildUploadAttachmentGuardCtx,
  clearStaleAssetAction,
  enforceUploadAskIntentClassification,
  isExplicitCreateFromUpload,
  isUploadOnlyAskTurn,
  resolveUploadIntakePhase,
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

describe('resolveUploadIntakePhase', () => {
  it('Rule 1: upload-only placeholders → ask_intent', () => {
    const cases = ['', '(Image attached)', 'image', 'card', 'business card', '   '];
    for (const message of cases) {
      const result = resolveUploadIntakePhase(withUpload(message));
      expect(result.phase, message).toBe(UPLOAD_INTAKE_PHASE.ASK_INTENT);
    }
  });

  it('Rule 2: explicit create → extract_and_draft', () => {
    const cases = [
      'create a store from this card',
      'create store from uploaded card',
      'create store form uploaded card above',
      'make a store from this business card',
    ];
    for (const message of cases) {
      const result = resolveUploadIntakePhase(withUpload(message));
      expect(result.phase, message).toBe(UPLOAD_INTAKE_PHASE.EXTRACT_AND_DRAFT);
    }
  });

  it('ignores stale assetAction on placeholder messages', () => {
    const result = resolveUploadIntakePhase(
      withUpload('(Image attached)', {
        intentSourceContext: { assetAction: 'create_store' },
      }),
    );
    expect(result.phase).toBe(UPLOAD_INTAKE_PHASE.ASK_INTENT);
  });

  it('respects assetAction when message is explicit', () => {
    const result = resolveUploadIntakePhase(
      withUpload('Create a store from this document', {
        intentSourceContext: { assetAction: 'create_store' },
      }),
    );
    expect(result.phase).toBe(UPLOAD_INTAKE_PHASE.EXTRACT_AND_DRAFT);
  });

  it('respects fromAskSelection', () => {
    const result = resolveUploadIntakePhase(
      withUpload('Create a store from this document', {
        intentSourceContext: { fromAskSelection: 'create_store' },
      }),
    );
    expect(result.phase).toBe(UPLOAD_INTAKE_PHASE.EXTRACT_AND_DRAFT);
  });

  it('no upload evidence → none', () => {
    const result = resolveUploadIntakePhase({
      userMessage: 'create a store',
      intentSourceContext: {},
      attachments: [],
      imageDataUrl: null,
    });
    expect(result.phase).toBe(UPLOAD_INTAKE_PHASE.NONE);
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

describe('enforceUploadAskIntentClassification', () => {
  it('overrides create_store proactive_plan to ingest ask', () => {
    const guardCtx = withUpload('(Image attached)');
    const out = enforceUploadAskIntentClassification({
      userMessage: '(Image attached)',
      classification: {
        tool: 'create_store',
        executionPath: 'proactive_plan',
        confidence: 0.7,
        parameters: {},
      },
      body: { attachments: guardCtx.attachments, imageDataUrl: guardCtx.imageDataUrl },
      intentSourceContext: {},
      uploadAttachmentGuardCtx: guardCtx,
      storeId: null,
      resolveImageRef: () => guardCtx.imageDataUrl,
      reason: 'test',
    });
    expect(out.applied).toBe(true);
    expect(out.classification.tool).toBe('ingest_asset_for_intent_detection');
    expect(out.classification._classificationOverride).toBe('test');
  });
});
