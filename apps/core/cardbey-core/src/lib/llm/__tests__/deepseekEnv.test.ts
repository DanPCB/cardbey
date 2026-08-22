import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveDeepSeekBaseUrl, resolveDeepSeekModel } from '../deepseekEnv.js';

describe('deepseekEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers DEEPSEEK_BASE_URL over localhost DEEPSEEK_ENDPOINT', () => {
    vi.stubEnv('DEEPSEEK_ENDPOINT', 'http://localhost:8000/v1');
    vi.stubEnv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com');
    expect(resolveDeepSeekBaseUrl()).toBe('https://api.deepseek.com/v1');
  });

  it('rejects local HF model ids for cloud', () => {
    vi.stubEnv('DEEPSEEK_MODEL', 'deepseek-ai/DeepSeek-V2-Lite-Chat');
    expect(resolveDeepSeekModel()).toBe('deepseek-v4-flash');
  });
});
