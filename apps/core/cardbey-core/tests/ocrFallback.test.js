/**
 * OCR fallback orchestration — sequential OpenAI → Anthropic → Google.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const validBusinessCardText =
  'HP Services\nHEATING & COOLING & ELECTRICAL\n04 1234 5678\nhp@example.com\nwww.hpservices.com.au';
const refusalText = "I'm sorry, but I can't assist with that.";

const mockOcrExtractText = vi.fn();
const mockGoogleVisionOcrExtractText = vi.fn();
const mockIsGoogleVisionFallbackEnabled = vi.fn();
const mockAnthropicOcrExtractText = vi.fn();
const mockIsAnthropicOcrConfigured = vi.fn();

vi.mock('../src/lib/ocr/ocrProvider.js', () => ({
  ocrExtractText: (...args) => mockOcrExtractText(...args),
}));

vi.mock('../src/lib/ocr/googleVisionOcr.js', () => ({
  googleVisionOcrExtractText: (...args) => mockGoogleVisionOcrExtractText(...args),
  isGoogleVisionFallbackEnabled: () => mockIsGoogleVisionFallbackEnabled(),
}));

vi.mock('../src/modules/vision/runOcr.js', async () => {
  const actual = await vi.importActual('../src/modules/vision/runOcr.js');
  return {
    ...actual,
    anthropicOcrExtractText: (...args) => mockAnthropicOcrExtractText(...args),
    isAnthropicOcrConfigured: () => mockIsAnthropicOcrConfigured(),
  };
});

describe('extractTextWithFallback resilience', () => {
  const prevOpenAi = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'sk-test';
    mockIsGoogleVisionFallbackEnabled.mockReturnValue(false);
    mockIsAnthropicOcrConfigured.mockReturnValue(false);
  });

  afterEach(() => {
    if (prevOpenAi == null) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevOpenAi;
  });

  async function loadFallback() {
    const { resetOcrProviderHealthForTests } = await import('../src/lib/ocr/ocrProviderHealth.js');
    resetOcrProviderHealthForTests();
    return import('../src/lib/ocr/ocrFallback.js');
  }

  it('CASE A: OpenAI success — Anthropic and Google not called', async () => {
    mockIsAnthropicOcrConfigured.mockReturnValue(true);
    mockIsGoogleVisionFallbackEnabled.mockReturnValue(true);
    mockOcrExtractText.mockResolvedValue({
      text: validBusinessCardText,
      provider: 'openai_vision',
    });

    const { extractTextWithFallback } = await loadFallback();
    const result = await extractTextWithFallback({
      imageDataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
      purpose: 'business_card',
    });

    expect(result.classification).toBe('SUCCESS');
    expect(result.providerUsed).toBe('openai_vision');
    expect(result.didFallback).toBe(false);
    expect(mockOcrExtractText).toHaveBeenCalledTimes(1);
    expect(mockAnthropicOcrExtractText).not.toHaveBeenCalled();
    expect(mockGoogleVisionOcrExtractText).not.toHaveBeenCalled();
  });

  it('CASE B: OpenAI quota → Anthropic success — Google not called', async () => {
    mockIsAnthropicOcrConfigured.mockReturnValue(true);
    mockIsGoogleVisionFallbackEnabled.mockReturnValue(true);
    const err = new Error('insufficient_quota: credit_balance_exhausted');
    err.status = 429;
    mockOcrExtractText.mockRejectedValue(err);
    mockAnthropicOcrExtractText.mockResolvedValue({
      text: validBusinessCardText,
      provider: 'anthropic_vision',
    });

    const { extractTextWithFallback } = await loadFallback();
    const result = await extractTextWithFallback({
      imageDataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
      purpose: 'business_card',
    });

    expect(result.classification).toBe('SUCCESS');
    expect(result.providerUsed).toBe('anthropic_vision');
    expect(result.didFallback).toBe(true);
    expect(result.attempts[0].classification).toBe('QUOTA_EXHAUSTED');
    expect(mockGoogleVisionOcrExtractText).not.toHaveBeenCalled();
  });

  it('CASE C: OpenAI timeout → Anthropic provider error → Google success', async () => {
    mockIsAnthropicOcrConfigured.mockReturnValue(true);
    mockIsGoogleVisionFallbackEnabled.mockReturnValue(true);
    mockOcrExtractText.mockRejectedValue(new Error('OCR timeout'));
    mockAnthropicOcrExtractText.mockRejectedValue(new Error('Anthropic provider error 500'));
    mockGoogleVisionOcrExtractText.mockResolvedValue({
      text: validBusinessCardText,
      provider: 'google_vision',
    });

    const { extractTextWithFallback } = await loadFallback();
    const result = await extractTextWithFallback({
      imageDataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
      purpose: 'business_card',
    });

    expect(result.classification).toBe('SUCCESS');
    expect(result.providerUsed).toBe('google_vision');
    expect(result.attempts.map((a) => a.classification)).toEqual([
      'TIMEOUT',
      'PROVIDER_ERROR',
      'SUCCESS',
    ]);
  });

  it('CASE D: OpenAI not configured → Anthropic success', async () => {
    delete process.env.OPENAI_API_KEY;
    mockIsAnthropicOcrConfigured.mockReturnValue(true);
    mockAnthropicOcrExtractText.mockResolvedValue({
      text: validBusinessCardText,
      provider: 'anthropic_vision',
    });

    const { extractTextWithFallback } = await loadFallback();
    const result = await extractTextWithFallback({
      imageDataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
      purpose: 'business_card',
    });

    expect(result.classification).toBe('SUCCESS');
    expect(result.providerUsed).toBe('anthropic_vision');
    expect(mockOcrExtractText).not.toHaveBeenCalled();
  });

  it('CASE E: OpenAI quota → Anthropic off → Google success', async () => {
    mockIsAnthropicOcrConfigured.mockReturnValue(false);
    mockIsGoogleVisionFallbackEnabled.mockReturnValue(true);
    mockOcrExtractText.mockRejectedValue(new Error('insufficient_quota'));
    mockGoogleVisionOcrExtractText.mockResolvedValue({
      text: validBusinessCardText,
      provider: 'google_vision',
    });

    const { extractTextWithFallback } = await loadFallback();
    const result = await extractTextWithFallback({
      imageDataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
      purpose: 'business_card',
    });

    expect(result.classification).toBe('SUCCESS');
    expect(result.providerUsed).toBe('google_vision');
    expect(mockAnthropicOcrExtractText).not.toHaveBeenCalled();
  });

  it('CASE F: all configured providers unavailable → VISION_PROVIDERS_UNAVAILABLE', async () => {
    mockIsAnthropicOcrConfigured.mockReturnValue(true);
    mockIsGoogleVisionFallbackEnabled.mockReturnValue(true);
    mockOcrExtractText.mockRejectedValue(new Error('insufficient_quota credit_balance_exhausted'));
    mockAnthropicOcrExtractText.mockRejectedValue(new Error('rate_limit_exceeded'));
    mockGoogleVisionOcrExtractText.mockRejectedValue(new Error('Google Vision API error: 403'));

    const { extractTextWithFallback } = await loadFallback();
    const result = await extractTextWithFallback({
      imageDataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
      purpose: 'business_card',
    });

    expect(result.classification).toBe('VISION_PROVIDERS_UNAVAILABLE');
    expect(result.text).toBe('');
  });

  it('CASE G: providers return empty text → UNREADABLE', async () => {
    mockIsAnthropicOcrConfigured.mockReturnValue(true);
    mockOcrExtractText.mockResolvedValue({ text: '', provider: 'openai_vision' });
    mockAnthropicOcrExtractText.mockResolvedValue({ text: '', provider: 'anthropic_vision' });

    const { extractTextWithFallback } = await loadFallback();
    const result = await extractTextWithFallback({
      imageDataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
      purpose: 'business_card',
    });

    expect(result.classification).toBe('UNREADABLE');
  });
});
