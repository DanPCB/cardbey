import { describe, expect, it } from 'vitest';
import { detectContentType, extractAssetContent } from '../assetExtraction.js';
import { formatAssetDisplay } from '../assetContentDisplay.js';
import { ingestAssetForIntentDetection } from '../assetIntentIngestService.js';

describe('assetExtraction', () => {
  it('detects event content from golf tour flyer text', () => {
    const text = 'GOLF TOUR IN PERTH\n4 ROUNDS OF GOLF\n1184 AUD per pax';
    expect(detectContentType(text)).toBe('event');
    const extracted = extractAssetContent(text);
    expect(extracted.title).toContain('GOLF TOUR');
    expect(extracted.detectedType).toBe('event');
  });

  it('formats display with title and detected type', () => {
    const extracted = extractAssetContent('Summer Sale\n20% off all items');
    const display = formatAssetDisplay(extracted);
    expect(display).toContain('Summer Sale');
    expect(display).toContain('Detected as:');
  });

  it('handles empty OCR gracefully', () => {
    const extracted = extractAssetContent('');
    const display = formatAssetDisplay(extracted);
    expect(display).toContain('No readable text');
  });
});

describe('assetIntentIngestService read-display-ask', () => {
  it('returns extracted content and display for OCR text', async () => {
    const result = await ingestAssetForIntentDetection({
      filename: 'golf-flyer.jpg',
      mimeType: 'image/jpeg',
      rawOcrText: 'GOLF TOUR IN PERTH\n4 ROUNDS OF GOLF\n1184 AUD per pax',
    });
    expect(result.ok).toBe(true);
    expect(result.phase).toBe('awaiting_intent_selection');
    expect(result.extracted?.detectedType).toBe('event');
    expect(result.display).toContain('GOLF TOUR');
    expect(result.suggestedActions?.some((a) => a.id === 'launch_campaign')).toBe(true);
    const primary = result.suggestedActions?.find((a) => a.primary);
    expect(primary?.id).not.toBe('create_store');
  });

  it('does not mark create_store as primary for business card OCR', async () => {
    const result = await ingestAssetForIntentDetection({
      filename: 'card.jpg',
      mimeType: 'image/jpeg',
      ocrHints: { businessName: 'Joe Bakery', detectedBusinessName: 'Joe Bakery' },
      rawOcrText: 'Joe Bakery\n123 Main St\njoe@bakery.com',
    });
    const primary = result.suggestedActions?.find((a) => a.primary);
    expect(primary?.id).not.toBe('create_store');
    expect(result.suggestedActions?.some((a) => a.id === 'create_store')).toBe(true);
  });
});
