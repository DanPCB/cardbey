import { describe, expect, it } from 'vitest';
import {
  detectExplicitAssetIntent,
  detectExplicitStoreIntent,
  detectCreateStoreFromUploadedAssetIntent,
  hasExplicitUploadCreateStoreOrWebsiteIntent,
  isExplicitCreateStoreFromUploadContext,
  isExplicitLoyaltyFromUploadContext,
  isUploadWithoutClearUserIntent,
  isAttachmentOnlyPlaceholderMessage,
  shouldAnalyzeUploadedAssetForStoreCreation,
  shouldAutoSubmitCreateStoreClassification,
  shouldBlockStoreCheckWithoutContext,
  shouldDeferCreateStoreDraftForAssetIngest,
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

  it('routes ambiguous upload text to ask step (rule 1)', () => {
    expect(
      shouldRouteToAssetIntentDetection('here is my business card', {
        imageDataUrl: 'data:image/png;base64,abc',
      }),
    ).toBe(true);
    expect(isUploadWithoutClearUserIntent('here is my business card', { imageDataUrl: 'data:image/png;base64,abc' })).toBe(
      true,
    );
  });

  it('does not route to ask when user explicitly requests store creation with upload (rule 2)', () => {
    expect(
      shouldRouteToAssetIntentDetection('Create a store from this', {
        imageDataUrl: 'data:image/png;base64,abc',
      }),
    ).toBe(false);
    expect(hasExplicitUploadCreateStoreOrWebsiteIntent('Create a store from this')).toBe(true);
    expect(
      shouldAnalyzeUploadedAssetForStoreCreation({
        userMessage: 'Create a store from this',
        imageDataUrl: 'data:image/png;base64,' + 'a'.repeat(120),
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

  it('prefers loyalty setup over generic campaign for loyalty card phrases', () => {
    expect(detectExplicitAssetIntent('create a loyalty campaign from this card')).toBe(
      'setup_loyalty_program',
    );
    expect(
      isExplicitLoyaltyFromUploadContext({
        userMessage: 'create a loyalty campaign from this card',
        attachmentAnalysis: { artifactType: 'loyalty_card' },
      }),
    ).toBe(true);
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

  it('detectCreateStoreFromUploadedAssetIntent matches upload-card phrasing', () => {
    expect(detectCreateStoreFromUploadedAssetIntent('create a store from upload card')).toBe(true);
    expect(detectCreateStoreFromUploadedAssetIntent('create store from this image')).toBe(true);
    expect(detectCreateStoreFromUploadedAssetIntent('create a store')).toBe(false);
  });

  it('shouldAnalyzeUploadedAssetForStoreCreation requires explicit create intent and recent asset', () => {
    expect(
      shouldAnalyzeUploadedAssetForStoreCreation({
        userMessage: 'create a store from upload card',
        imageDataUrl: 'data:image/png;base64,' + 'a'.repeat(120),
      }),
    ).toBe(true);
    expect(
      shouldAnalyzeUploadedAssetForStoreCreation({
        userMessage: 'create a store',
        imageDataUrl: 'data:image/png;base64,' + 'a'.repeat(120),
      }),
    ).toBe(true);
    expect(
      shouldAnalyzeUploadedAssetForStoreCreation({
        userMessage: '(Image attached)',
        imageDataUrl: 'data:image/png;base64,' + 'a'.repeat(120),
      }),
    ).toBe(false);
    expect(
      shouldAnalyzeUploadedAssetForStoreCreation({
        userMessage: 'create a store from upload card',
      }),
    ).toBe(false);
    expect(
      shouldBlockStoreCheckWithoutContext('analyze_store', {
        userMessage: 'create a store from upload card',
        imageDataUrl: 'data:image/png;base64,' + 'a'.repeat(120),
      }),
    ).toBe(true);
    expect(
      shouldBlockStoreCheckWithoutContext('analyze_store', {
        userMessage: 'create a store from upload card',
        storeId: 'store-1',
        imageDataUrl: 'data:image/png;base64,' + 'a'.repeat(120),
      }),
    ).toBe(false);
  });

  it('shouldDeferCreateStoreDraftForAssetIngest defers attachment-only and empty create_store', () => {
    const ctx = {
      userMessage: '(Image attached)',
      imageDataUrl: 'data:image/png;base64,' + 'a'.repeat(120),
    };
    expect(
      shouldDeferCreateStoreDraftForAssetIngest({
        ...ctx,
        classificationTool: 'create_store',
        hasMeaningfulExtraction: false,
      }),
    ).toBe(true);
    expect(
      shouldDeferCreateStoreDraftForAssetIngest({
        ...ctx,
        classificationTool: 'create_store',
        hasMeaningfulExtraction: true,
      }),
    ).toBe(true);
    expect(
      shouldDeferCreateStoreDraftForAssetIngest({
        ...ctx,
        classificationTool: 'create_store',
        hasMeaningfulExtraction: true,
        storeFormSubmit: true,
      }),
    ).toBe(false);
    expect(
      shouldDeferCreateStoreDraftForAssetIngest({
        userMessage: 'create a store from upload card',
        imageDataUrl: 'data:image/png;base64,' + 'a'.repeat(120),
        classificationTool: 'create_store',
        hasMeaningfulExtraction: false,
      }),
    ).toBe(true);
  });

  it('detects colloquial uploaded-card-above create store wording', () => {
    expect(detectCreateStoreFromUploadedAssetIntent('create store form uploaded card above')).toBe(true);
    expect(
      shouldAnalyzeUploadedAssetForStoreCreation({
        userMessage: 'create store form uploaded card above',
        intentSourceContext: { pendingImageDataUrl: 'data:image/png;base64,' + 'a'.repeat(120) },
      }),
    ).toBe(true);
  });

  it('detects Ask-panel assetAction as explicit create-store from upload', () => {
    expect(
      isExplicitCreateStoreFromUploadContext({
        userMessage: '(Image attached)',
        intentSourceContext: { assetAction: 'create_store' },
      }),
    ).toBe(false);
    expect(
      isExplicitCreateStoreFromUploadContext({
        userMessage: 'Create a store from this document',
        intentSourceContext: { assetAction: 'create_store' },
      }),
    ).toBe(true);
    expect(
      shouldAnalyzeUploadedAssetForStoreCreation({
        userMessage: 'Create a store from this document',
        intentSourceContext: { assetAction: 'create_store', pendingImageDataUrl: 'data:image/png;base64,' + 'a'.repeat(120) },
      }),
    ).toBe(true);
  });

  it('plain Create store without upload evidence is NOT upload-from-card (avoids ATTACHMENT_NOT_READY)', () => {
    expect(
      isExplicitCreateStoreFromUploadContext({
        userMessage: 'Create a store for my business',
      }),
    ).toBe(false);
    expect(
      isExplicitCreateStoreFromUploadContext({
        userMessage: 'Create store',
      }),
    ).toBe(false);
    expect(
      isExplicitCreateStoreFromUploadContext({
        userMessage: 'Create a store for my business',
        imageDataUrl: 'data:image/png;base64,' + 'a'.repeat(120),
      }),
    ).toBe(true);
    expect(
      isExplicitCreateStoreFromUploadContext({
        userMessage: 'Create store from the card',
      }),
    ).toBe(true);
  });

  it('routes upload-only when image is only in intentSourceContext handoff', () => {
    expect(
      shouldRouteToAssetIntentDetection('(Image attached)', {
        intentSourceContext: { pendingImageDataUrl: 'data:image/png;base64,' + 'a'.repeat(120) },
      }),
    ).toBe(true);
  });

  it('does not route casual greeting with stale upload handoff', () => {
    expect(
      shouldRouteToAssetIntentDetection('hi', {
        intentSourceContext: { pendingImageDataUrl: 'data:image/png;base64,' + 'a'.repeat(120) },
        hasSessionPendingExtraction: true,
      }),
    ).toBe(false);
    expect(
      isUploadWithoutClearUserIntent('hello', {
        imageDataUrl: 'data:image/png;base64,' + 'a'.repeat(120),
      }),
    ).toBe(false);
  });
});
