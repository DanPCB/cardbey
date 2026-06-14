import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../llm/anthropicProvider.js', () => ({
  postAnthropicMessages: vi.fn(),
}));

import { postAnthropicMessages } from '../../llm/anthropicProvider.js';
import {
  parseVisionIntentJson,
  classifyVisionIntent,
} from '../visionIntentClassifier.js';

describe('visionIntentClassifier', () => {
  beforeEach(() => {
    vi.mocked(postAnthropicMessages).mockReset();
    delete process.env.ANTHROPIC_DISABLED;
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('parseVisionIntentJson handles clean JSON', () => {
    const parsed = parseVisionIntentJson(
      JSON.stringify({
        intent: 'store_sign',
        confidence: 0.92,
        extraction: { businessName: 'Cafe Luna' },
      }),
    );
    expect(parsed.intent).toBe('store_sign');
    expect(parsed.confidence).toBe(0.92);
    expect(parsed.extraction.businessName).toBe('Cafe Luna');
  });

  it('parseVisionIntentJson handles fenced JSON', () => {
    const parsed = parseVisionIntentJson(
      '```json\n{"intent":"flyer_menu","confidence":0.8,"extraction":{}}\n```',
    );
    expect(parsed.intent).toBe('flyer_menu');
    expect(parsed.confidence).toBe(0.8);
  });

  it('parseVisionIntentJson falls back to unknown on garbage', () => {
    const parsed = parseVisionIntentJson('not json at all');
    expect(parsed.intent).toBe('unknown');
    expect(parsed.confidence).toBe(0);
  });

  it('classifyVisionIntent uses QR fast path without calling Anthropic', async () => {
    const result = await classifyVisionIntent({
      decodedPayload: 'https://www.cardbey.com/s/demo-cafe',
    });
    expect(result.intent).toBe('qr_payload');
    expect(result.confidence).toBe(1);
    expect(result.provider).toBe('qr_fast_path');
    expect(postAnthropicMessages).not.toHaveBeenCalled();
  });

  it('classifyVisionIntent calls Anthropic for image classification', async () => {
    vi.mocked(postAnthropicMessages).mockResolvedValue({
      content: [
        {
          text: JSON.stringify({
            intent: 'store_sign',
            confidence: 0.85,
            extraction: { businessName: 'BrayBrook Cafe' },
          }),
        },
      ],
    });

    const result = await classifyVisionIntent({
      imageBuffers: [{ buffer: Buffer.from('jpeg-bytes'), mimetype: 'image/jpeg' }],
      surface: 'feed',
      defaultIntentHint: 'store_sign',
    });

    expect(postAnthropicMessages).toHaveBeenCalledTimes(1);
    expect(result.intent).toBe('store_sign');
    expect(result.provider).toBe('anthropic');
  });
});
