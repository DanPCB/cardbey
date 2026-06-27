import { describe, expect, it } from 'vitest';
import {
  buildAssetEntityContext,
  classifyUploadedAssetType,
  suggestAssetIntentActions,
  buildAssetIntentDetectionClassification,
} from '../assetIntentIngestService.js';

describe('assetIntentIngestService', () => {
  it('classifies menu filename', () => {
    expect(classifyUploadedAssetType({ filename: 'cafe-menu.pdf' })).toBe('menu');
  });

  it('classifies loyalty card', () => {
    expect(classifyUploadedAssetType({ filename: 'loyalty-stamp-card.jpg' })).toBe('loyalty_card');
  });

  it('invoice does not prioritize create_store in suggestions', () => {
    const ctx = buildAssetEntityContext({ filename: 'invoice-march.pdf' });
    const actions = suggestAssetIntentActions(ctx);
    const primary = actions.find((a) => a.primary);
    expect(primary?.id).not.toBe('create_store');
    expect(actions.some((a) => a.id === 'save_to_suitcase')).toBe(true);
  });

  it('brochure suggests campaign and import', () => {
    const ctx = buildAssetEntityContext({ filename: 'summer-brochure.pdf' });
    const ids = suggestAssetIntentActions(ctx).map((a) => a.id);
    expect(ids).toContain('launch_campaign');
    expect(ids).toContain('import_catalog');
    expect(ids).toContain('save_to_suitcase');
  });

  it('loyalty card suggests setup_loyalty_program first', () => {
    const ctx = buildAssetEntityContext({ filename: 'rewards-card.png' });
    const actions = suggestAssetIntentActions(ctx);
    expect(actions[0]?.id).toBe('setup_loyalty_program');
  });

  it('menu suggests import_catalog', () => {
    const ctx = buildAssetEntityContext({ filename: 'dinner-menu.jpg' });
    const ids = suggestAssetIntentActions(ctx).map((a) => a.id);
    expect(ids).toContain('import_catalog');
  });

  it('buildAssetIntentDetectionClassification uses ingest tool', () => {
    const out = buildAssetIntentDetectionClassification('(Image attached)', {
      attachments: [{ mimeType: 'image/png', name: 'scan.png' }],
      imageDataUrl: 'data:image/png;base64,x',
    });
    expect(out.tool).toBe('ingest_asset_for_intent_detection');
    expect(out.executionPath).toBe('direct_action');
  });
});
