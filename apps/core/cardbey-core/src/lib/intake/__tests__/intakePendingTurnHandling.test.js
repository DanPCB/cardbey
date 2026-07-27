import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  maybeClearStaleUploadOnTextOnlyIntent,
  maybeRespondUploadAskBeforeClassifier,
} from '../intakePendingTurnHandling.js';
import * as persistBeliefDelta from '../../decision/persistBeliefDelta.js';

describe('intakePendingTurnHandling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears stale upload on text-only explicit store intent', async () => {
    const clearSpy = vi
      .spyOn(persistBeliefDelta, 'clearStaleUploadBeliefContext')
      .mockResolvedValue(undefined);

    await maybeClearStaleUploadOnTextOnlyIntent({
      userMessage: 'Create a store for my business',
      sessionKey: 'sess-1',
      hasAttachment: false,
    });

    expect(clearSpy).toHaveBeenCalledWith('sess-1');
  });

  it('does not clear when message has attachment', async () => {
    const clearSpy = vi
      .spyOn(persistBeliefDelta, 'clearStaleUploadBeliefContext')
      .mockResolvedValue(undefined);

    await maybeClearStaleUploadOnTextOnlyIntent({
      userMessage: 'Create my first store',
      sessionKey: 'sess-1',
      hasAttachment: true,
    });

    expect(clearSpy).not.toHaveBeenCalled();
  });

  it('maybeRespondUploadAskBeforeClassifier skips loyalty selection replay', async () => {
    const result = await maybeRespondUploadAskBeforeClassifier({
      userMessage: '(Image attached)',
      attachmentOnlyUpload: true,
      hasAttachment: true,
      body: {
        intakeV2Selection: {
          selectedTool: 'setup_loyalty_program',
          selectedParameters: {
            storeId: 'store_abc',
            confirmedActiveSpace: true,
            selectionMethod: 'active-space',
            evidenceId: 'evidence_123',
          },
        },
      },
    });
    expect(result).toBeNull();
  });

  it('maybeRespondUploadAskBeforeClassifier skips Ask Create store selection', async () => {
    const result = await maybeRespondUploadAskBeforeClassifier({
      userMessage: 'Create store from uploaded card',
      attachmentOnlyUpload: false,
      hasAttachment: true,
      imageDataUrl: `data:image/png;base64,${'C'.repeat(120)}`,
      body: {
        intentSourceContext: {
          fromAskSelection: 'create_store',
          assetAction: 'create_store',
          type: 'CREATE_STORE_FROM_UPLOAD',
        },
        intakeV2Selection: {
          selectedTool: 'create_store',
          selectedParameters: {
            source: 'upload_ask_selection',
            type: 'CREATE_STORE_FROM_UPLOAD',
          },
        },
      },
    });
    expect(result).toBeNull();
  });
});
