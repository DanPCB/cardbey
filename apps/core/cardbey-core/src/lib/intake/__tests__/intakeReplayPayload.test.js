import { describe, expect, it } from 'vitest';
import { applyIntakePayloadGuard } from '../intakePayloadGuard.js';
import {
  buildIntakeReplayPayloadFromSelection,
  estimateIntakeReplayPayloadBytes,
  shouldSkipUploadAskForIntakeSelectionReplay,
  stripHeavyUploadFieldsDeep,
} from '../intakeReplayPayload.js';

const heavyImage = `data:image/png;base64,${'A'.repeat(190_000)}`;

describe('intakeReplayPayload', () => {
  it('strips base64 image fields recursively', () => {
    const slim = stripHeavyUploadFieldsDeep({
      imageDataUrl: heavyImage,
      attachmentAnalysis: {
        artifactType: 'loyalty_card',
        preseededDraft: {
          programName: 'Coffee Rewards',
          imageAssetId: heavyImage,
        },
      },
      attachments: [{ type: 'image', dataUrl: heavyImage, mimeType: 'image/png' }],
    });
    expect(slim).not.toHaveProperty('imageDataUrl');
    expect(slim.attachmentAnalysis.preseededDraft).not.toHaveProperty('imageAssetId');
    expect(slim.attachmentAnalysis.artifactType).toBe('loyalty_card');
    expect(slim.attachments[0]).not.toHaveProperty('dataUrl');
    expect(slim.attachments[0].mimeType).toBe('image/png');
  });

  it('builds lightweight store-selection replay payload', () => {
    const payload = buildIntakeReplayPayloadFromSelection({
      text: 'create a loyalty program from this card',
      sessionId: 'session_1',
      conversationSessionId: 'session_1',
      evidenceId: 'evidence_123',
      streamId: 'stream_456',
      intakeV2Selection: {
        selectedTool: 'setup_loyalty_program',
        originalGoal: 'create a loyalty program from this card',
        selectedParameters: {
          storeId: 'store_abc',
          activeStoreId: 'store_abc',
          evidenceId: 'evidence_123',
          streamId: 'stream_456',
          attachmentAnalysis: {
            artifactType: 'loyalty_card',
            confidence: 0.88,
            preseededDraft: {
              programName: 'Coffee Rewards',
              imageAssetId: heavyImage,
            },
          },
          imageDataUrl: heavyImage,
        },
      },
    });

    expect(payload.imageDataUrl).toBeUndefined();
    expect(payload.attachments).toBeUndefined();
    expect(payload.evidenceId).toBe('evidence_123');
    expect(payload.streamId).toBe('stream_456');
    expect(payload.intakeV2Selection.selectedTool).toBe('setup_loyalty_program');
    expect(payload.intakeV2Selection.selectedParameters.storeId).toBe('store_abc');
    expect(payload.intakeV2Selection.selectedParameters.attachmentAnalysis.artifactType).toBe(
      'loyalty_card',
    );
    expect(
      payload.intakeV2Selection.selectedParameters.attachmentAnalysis.preseededDraft,
    ).not.toHaveProperty('imageAssetId');
    expect(estimateIntakeReplayPayloadBytes(payload)).toBeLessThan(50 * 1024);
  });

  it('shouldSkipUploadAskForIntakeSelectionReplay is true for loyalty store confirm', () => {
    expect(
      shouldSkipUploadAskForIntakeSelectionReplay({
        intakeV2Selection: {
          selectedTool: 'setup_loyalty_program',
          selectedParameters: {
            storeId: 'store_abc',
            confirmedActiveSpace: true,
            selectionMethod: 'active-space',
          },
        },
      }),
    ).toBe(true);
    expect(
      shouldSkipUploadAskForIntakeSelectionReplay({
        text: '(Image attached)',
        pendingIntent: { clarifyType: 'active_space_confirm', lockedTool: 'setup_loyalty_program' },
      }),
    ).toBe(false);
  });

  it('applyIntakePayloadGuard accepts replay payload after stripping heavy upload blobs', () => {
    const heavy = {
      text: 'create a loyalty program from this card',
      imageDataUrl: heavyImage,
      attachments: [{ type: 'image', dataUrl: heavyImage }],
      intakeV2Selection: {
        selectedTool: 'setup_loyalty_program',
        originalGoal: 'create a loyalty program from this card',
        selectedParameters: {
          storeId: 'store_abc',
          activeStoreId: 'store_abc',
          evidenceId: 'evidence_123',
          attachmentAnalysis: {
            artifactType: 'loyalty_card',
            confidence: 0.88,
            preseededDraft: { programName: 'Coffee Rewards', imageAssetId: heavyImage },
          },
          imageDataUrl: heavyImage,
        },
      },
    };
    const guard = applyIntakePayloadGuard(heavy);
    expect(guard.rejected).toBe(false);
    expect(guard.body.imageDataUrl).toBeUndefined();
    expect(guard.body.attachments).toBeUndefined();
    expect(guard.body.intakeV2Selection.selectedParameters.storeId).toBe('store_abc');
    expect(guard.finalSize).toBeLessThan(50 * 1024);
  });
});
