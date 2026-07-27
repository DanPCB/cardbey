import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  SOCIAL_PLATFORMS,
  LLM_PLATFORMS,
  getAllPlatforms,
  getPlatformById,
  isPlatformEnvConfigured,
} from '../../lib/platforms/platformRegistry.js';

describe('platformRegistry', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it('lists all required social platforms including Meta and Zalo', () => {
    const ids = Object.keys(SOCIAL_PLATFORMS);
    expect(ids).toEqual(
      expect.arrayContaining([
        'facebook',
        'instagram',
        'zalo',
        'twitter',
        'linkedin',
        'reddit',
        'telegram',
        'discord',
        'mastodon',
        'pinterest',
      ]),
    );
    expect(ids).toHaveLength(10);
  });

  it('lists all required LLM platforms', () => {
    const ids = Object.keys(LLM_PLATFORMS);
    expect(ids).toEqual(
      expect.arrayContaining(['openai_gpt', 'anthropic_mcp', 'google_gemini', 'perplexity']),
    );
    expect(ids).toHaveLength(4);
  });

  it('getAllPlatforms merges social and llm', () => {
    expect(Object.keys(getAllPlatforms())).toHaveLength(14);
  });

  it('isPlatformEnvConfigured checks required env keys', () => {
    const platform = getPlatformById('telegram');
    expect(platform).toBeTruthy();
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(isPlatformEnvConfigured(platform)).toBe(false);
    process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
    expect(isPlatformEnvConfigured(platform)).toBe(true);
  });
});
