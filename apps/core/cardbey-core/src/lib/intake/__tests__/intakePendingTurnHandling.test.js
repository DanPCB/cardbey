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

  it('does not clear on Create store from uploaded card (preserve OCR)', async () => {
    const clearSpy = vi
      .spyOn(persistBeliefDelta, 'clearStaleUploadBeliefContext')
      .mockResolvedValue(undefined);

    await maybeClearStaleUploadOnTextOnlyIntent({
      userMessage: 'Create store from uploaded card',
      sessionKey: 'sess-1',
      hasAttachment: false,
    });

    expect(clearSpy).not.toHaveBeenCalled();
  });

  it('maybeRespondUploadAskBeforeClassifier still Asks on (Image attached) even with leftover selection', async () => {
    const result = await maybeRespondUploadAskBeforeClassifier({
      userMessage: '(Image attached)',
      attachmentOnlyUpload: true,
      hasAttachment: true,
      imageDataUrl: `data:image/png;base64,${'C'.repeat(120)}`,
      attachmentAnalysis: { ocrText: 'Coffee\nYOUR CREATIVE SLOGAN' },
      body: {
        intakeV2Selection: {
          selectedTool: 'create_store',
          selectedParameters: {
            source: 'upload_ask_selection',
            type: 'CREATE_STORE_FROM_UPLOAD',
            storeName: 'CA HANDYMAN SERVICES',
          },
        },
      },
    });
    expect(result?.payload?.response).toMatch(/Coffee/i);
    expect(result?.payload?.response).not.toMatch(/HANDYMAN/i);
  });

  it('maybeRespondUploadAskBeforeClassifier skips loyalty selection replay', async () => {
    const result = await maybeRespondUploadAskBeforeClassifier({
      userMessage: 'Setup loyalty program from uploaded card',
      attachmentOnlyUpload: false,
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

  it('sequential (Image attached) Asks follow this-turn OCR (Handyman → Mộc → NOODLE)', async () => {
    const turns = [
      { ocr: 'CA HANDYMAN SERVICES', expectName: /HANDYMAN/i },
      { ocr: 'Mộc\nVIETNAMESE RESTAURANT', expectName: /Mộc|Moc/i },
      { ocr: 'NOODLE\nhut\n136 Station Street', expectName: /NOODLE/i },
    ];
    /** @type {string[]} */
    const responses = [];
    for (const turn of turns) {
      const result = await maybeRespondUploadAskBeforeClassifier({
        userMessage: '(Image attached)',
        attachmentOnlyUpload: true,
        hasAttachment: true,
        imageDataUrl: `data:image/png;base64,${Buffer.from(turn.ocr).toString('base64')}`,
        attachmentAnalysis: { ocrText: turn.ocr },
      });
      expect(result?.payload?.response).toMatch(turn.expectName);
      responses.push(String(result?.payload?.response ?? ''));
    }
    expect(responses[2]).toMatch(/NOODLE/i);
    expect(responses[2]).not.toMatch(/HANDYMAN/i);
    expect(responses[2]).not.toMatch(/Mộc|VIETNAMESE/i);
  });
});
