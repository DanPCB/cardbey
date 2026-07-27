import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../services/vision/ocrService.js', () => ({
  extractText: vi.fn(async () => ({
    text: 'Acme Widgets\nhello@acme.com\n0400111222',
    confidence: 0.9,
    provider: 'openai_vision',
    lowConfidence: false,
  })),
}));

vi.mock('../../services/vision/entityExtractor.js', () => ({
  extractEntities: vi.fn(async () => ({
    name: 'Acme Widgets',
    email: 'hello@acme.com',
    phone: '0400111222',
    confidence: 0.88,
  })),
}));

import { runCardScanPipeline } from './cardScanPipeline.js';

describe('runCardScanPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns preview on successful OCR', async () => {
    const result = await runCardScanPipeline({
      buffer: Buffer.from('fake'),
      mimeType: 'image/jpeg',
    });
    expect(result.ok).toBe(true);
    expect(result.preview?.name).toBe('Acme Widgets');
    expect(result.extractedData?.email).toBe('hello@acme.com');
  });

  it('rejects missing image', async () => {
    const result = await runCardScanPipeline({});
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NO_IMAGE');
  });
});
