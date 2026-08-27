import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  estimateMinimaxCostUsd,
  isMinimaxH3Enabled,
  isMinimaxSelectable,
  MiniMaxConfigError,
  redactMinimaxSecrets,
  resolveMinimaxGenerationSettings,
} from '../minimaxConfig.js';

describe('minimaxConfig', () => {
  const backup = { ...process.env };

  beforeEach(() => {
    delete process.env.ENABLE_MINIMAX_H3_VIDEO_V1;
    delete process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_VIDEO_MODEL;
    delete process.env.MINIMAX_VIDEO_RESOLUTION;
    delete process.env.MINIMAX_VIDEO_DURATION_SECONDS;
    delete process.env.MINIMAX_H3_ALLOW_2K;
  });

  afterEach(() => {
    process.env = { ...backup };
  });

  it('parses valid 768P / 6s defaults', () => {
    process.env.ENABLE_MINIMAX_H3_VIDEO_V1 = 'true';
    process.env.MINIMAX_API_KEY = 'mm-test-key';
    const settings = resolveMinimaxGenerationSettings({});
    expect(settings.model).toBe('MiniMax-H3');
    expect(settings.resolution).toBe('768P');
    expect(settings.durationSeconds).toBe(6);
    expect(settings.aspectRatio).toBe('9:16');
    expect(settings.costEstimate.amountUsd).toBe(0.48);
    expect(settings.costEstimate.label).toBe('Estimated provider cost: US$0.48');
    expect(settings.costEstimate.isEstimate).toBe(true);
  });

  it('makes MiniMax unavailable without API key', () => {
    process.env.ENABLE_MINIMAX_H3_VIDEO_V1 = 'true';
    expect(isMinimaxSelectable()).toBe(false);
    expect(() => resolveMinimaxGenerationSettings({})).toThrow(MiniMaxConfigError);
  });

  it('flag OFF disables MiniMax even with a key', () => {
    process.env.MINIMAX_API_KEY = 'mm-test-key';
    expect(isMinimaxH3Enabled()).toBe(false);
    expect(isMinimaxSelectable()).toBe(false);
  });

  it('maps 9:16 and 16:9', () => {
    process.env.ENABLE_MINIMAX_H3_VIDEO_V1 = 'true';
    process.env.MINIMAX_API_KEY = 'mm-test-key';
    expect(resolveMinimaxGenerationSettings({ aspectRatio: '9:16' }).aspectRatio).toBe('9:16');
    expect(resolveMinimaxGenerationSettings({ aspectRatio: '16:9' }).aspectRatio).toBe('16:9');
    expect(resolveMinimaxGenerationSettings({ aspectRatio: '1:1' }).aspectRatio).toBe('1:1');
  });

  it('rejects unsupported duration and 2K before spend', () => {
    process.env.ENABLE_MINIMAX_H3_VIDEO_V1 = 'true';
    process.env.MINIMAX_API_KEY = 'mm-test-key';
    expect(() => resolveMinimaxGenerationSettings({ duration: 3 })).toThrow(/duration/i);
    expect(() => resolveMinimaxGenerationSettings({ duration: 20 })).toThrow(/duration/i);
    expect(() => resolveMinimaxGenerationSettings({ resolution: '2K' })).toThrow(/2K/);
    expect(() => resolveMinimaxGenerationSettings({ aspectRatio: '32:9' })).toThrow(/ratio/i);
  });

  it('does not default to a more expensive resolution', () => {
    process.env.ENABLE_MINIMAX_H3_VIDEO_V1 = 'true';
    process.env.MINIMAX_API_KEY = 'mm-test-key';
    const settings = resolveMinimaxGenerationSettings({ resolution: undefined });
    expect(settings.resolution).toBe('768P');
    expect(estimateMinimaxCostUsd({ durationSeconds: 6, resolution: '768P' }).amountUsd).toBe(0.48);
  });

  it('redacts the API key from serialized payloads', () => {
    process.env.MINIMAX_API_KEY = 'super-secret-minimax-key';
    const leaked = redactMinimaxSecrets({
      Authorization: 'Bearer super-secret-minimax-key',
      nested: 'used super-secret-minimax-key in a log',
    });
    expect(JSON.stringify(leaked)).not.toContain('super-secret-minimax-key');
    expect(JSON.stringify(leaked)).toContain('[REDACTED_MINIMAX_API_KEY]');
  });
});
