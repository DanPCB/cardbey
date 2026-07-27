/**
 * OCR fallback selector tests. Mocks providers; no real API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const validBusinessCardText =
  'PTH International Furniture\n1/22 Malibu St, Derrimut VIC 3026\n0413 091 777\npth.aus2023@gmail.com\nhttps://www.pthfurniture.com.au\nFacebook: PTH';
const refusalText = "I'm sorry, but I can't assist with that.";

const mockOcrExtractText = vi.fn();
const mockGoogleVisionOcrExtractText = vi.fn();
const mockIsGoogleVisionFallbackEnabled = vi.fn();

vi.mock('../src/lib/ocr/ocrProvider.js', () => ({
  ocrExtractText: (...args) => mockOcrExtractText(...args),
}));

vi.mock('../src/lib/ocr/googleVisionOcr.js', () => ({
  googleVisionOcrExtractText: (...args) => mockGoogleVisionOcrExtractText(...args),
  isGoogleVisionFallbackEnabled: () => mockIsGoogleVisionFallbackEnabled(),
}));

describe('extractTextWithFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsGoogleVisionFallbackEnabled.mockReturnValue(false);
  });

  it('returns primary text and does not use fallback when OpenAI returns valid text', async () => {
    mockOcrExtractText.mockResolvedValue({
      text: validBusinessCardText,
      provider: 'openai_vision',
      confidence: 0.9,
    });

    const { extractTextWithFallback } = await import('../src/lib/ocr/ocrFallback.js');
    const result = await extractTextWithFallback({
      imageDataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
      purpose: 'business_card',
    });

    expect(result.providerUsed).toBe('openai_vision');
    expect(result.didFallback).toBe(false);
    expect(result.text).toBe(validBusinessCardText);
    expect(mockOcrExtractText).toHaveBeenCalledTimes(1);
    expect(mockGoogleVisionOcrExtractText).not.toHaveBeenCalled();
  });

  it('uses fallback when OpenAI throws (refusal) and fallback is enabled', async () => {
    mockOcrExtractText.mockRejectedValue(new Error('refusal'));
    mockIsGoogleVisionFallbackEnabled.mockReturnValue(true);
    mockGoogleVisionOcrExtractText.mockResolvedValue({
      text: validBusinessCardText,
      provider: 'google_vision',
      confidence: 0.85,
    });

    const { extractTextWithFallback } = await import('../src/lib/ocr/ocrFallback.js');
    const result = await extractTextWithFallback({
      imageDataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
      purpose: 'business_card',
    });

    expect(result.providerUsed).toBe('google_vision');
    expect(result.didFallback).toBe(true);
    expect(result.text).toBe(validBusinessCardText);
    expect(mockOcrExtractText).toHaveBeenCalledTimes(1);
    expect(mockGoogleVisionOcrExtractText).toHaveBeenCalledTimes(1);
  });

  it('uses fallback when OpenAI returns refusal text (no throw) and fallback is enabled', async () => {
    mockOcrExtractText.mockResolvedValue({
      text: refusalText,
      provider: 'openai_vision',
    });
    mockIsGoogleVisionFallbackEnabled.mockReturnValue(true);
    mockGoogleVisionOcrExtractText.mockResolvedValue({
      text: validBusinessCardText,
      provider: 'google_vision',
      confidence: 0.85,
    });

    const { extractTextWithFallback } = await import('../src/lib/ocr/ocrFallback.js');
    const result = await extractTextWithFallback({
      imageDataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
      purpose: 'business_card',
    });

    expect(result.providerUsed).toBe('google_vision');
    expect(result.didFallback).toBe(true);
    expect(result.text).toBe(validBusinessCardText);
    expect(mockGoogleVisionOcrExtractText).toHaveBeenCalledTimes(1);
  });

  it('returns no input when imageDataUrl and imageBuffer are missing', async () => {
    const { extractTextWithFallback } = await import('../src/lib/ocr/ocrFallback.js');
    const result = await extractTextWithFallback({});

    expect(result.text).toBe('');
    expect(result.providerUsed).toBe('none');
    expect(result.didFallback).toBe(false);
    expect(mockOcrExtractText).not.toHaveBeenCalled();
  });
});
