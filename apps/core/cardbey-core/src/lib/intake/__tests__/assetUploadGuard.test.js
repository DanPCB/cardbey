import { describe, expect, it } from 'vitest';
import {
  detectExplicitAssetIntent,
  detectExplicitStoreIntent,
  isAttachmentOnlyPlaceholderMessage,
  shouldAutoSubmitCreateStoreClassification,
  shouldRouteToAssetIntentDetection,
} from '../assetUploadGuard.js';

describe('assetUploadGuard', () => {
  it('routes attachment-only uploads to asset intent detection', () => {
    expect(
      shouldRouteToAssetIntentDetection('(Image attached)', {
        attachments: [{ type: 'image', dataUrl: 'data:image/png;base64,abc' }],
      }),
    ).toBe(true);
  });

  it('does not route when user explicitly asks to create a store', () => {
    expect(
      shouldRouteToAssetIntentDetection('Create a store from this', {
        imageDataUrl: 'data:image/png;base64,abc',
      }),
    ).toBe(false);
    expect(detectExplicitAssetIntent('Create a store from this')).toBe('create_store');
  });

  it('detects import catalog explicit intent', () => {
    expect(detectExplicitAssetIntent('Import these products')).toBe('import_catalog');
  });

  it('treats placeholder messages as attachment-only', () => {
    expect(isAttachmentOnlyPlaceholderMessage('(files attached)')).toBe(true);
    expect(isAttachmentOnlyPlaceholderMessage('')).toBe(true);
  });

  it('detectExplicitStoreIntent matches explicit store wording', () => {
    expect(detectExplicitStoreIntent('Create store')).toBe(true);
    expect(detectExplicitStoreIntent('set up a store for my salon')).toBe(true);
    expect(detectExplicitStoreIntent('launch store')).toBe(true);
    expect(detectExplicitStoreIntent('(Image attached)')).toBe(false);
    expect(detectExplicitStoreIntent('import these products')).toBe(false);
  });

  it('shouldAutoSubmitCreateStoreClassification gates uploads without explicit store intent', () => {
    expect(
      shouldAutoSubmitCreateStoreClassification({
        userMessage: '(Image attached)',
        hasAttachment: true,
      }),
    ).toBe(false);
    expect(
      shouldAutoSubmitCreateStoreClassification({
        userMessage: 'Create store',
        hasAttachment: true,
      }),
    ).toBe(true);
    expect(
      shouldAutoSubmitCreateStoreClassification({
        userMessage: '(Image attached)',
        hasAttachment: true,
        storeFormEnvelope: { storeName: 'Bakery' },
      }),
    ).toBe(true);
    expect(
      shouldAutoSubmitCreateStoreClassification({
        userMessage: 'hello',
        hasAttachment: false,
      }),
    ).toBe(true);
  });
});
