import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

const generateMock = vi.fn();

vi.mock('../../../lib/llm/llmGateway.ts', () => ({
  llmGateway: {
    generate: (...args) => generateMock(...args),
  },
}));

import { generatePostDraft, PROMPT_VERSION } from '../aiGeneration.js';

describe('marketingOperator/aiGeneration', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    generateMock.mockReset();
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it('parses structured model output when aiGenerationV1 on', async () => {
    process.env.ENABLE_MARKETING_AI_GENERATION_V1 = 'true';
    generateMock.mockResolvedValue({
      content: JSON.stringify({
        title: 'T',
        body: 'Cardbey under development pilot',
        language: 'en',
        contentType: 'post',
        structured: { hook: 'Build with us', ctaLabel: 'Join', hashtags: ['#Cardbey'] },
      }),
      provider: 'mock-llm',
      model: 'test',
    });

    const result = await generatePostDraft({ language: 'en' });
    expect(result.ok).toBe(true);
    expect(result.generationMeta.mode).toBe('model');
    expect(result.generationMeta.promptVersion).toBe(PROMPT_VERSION);
    expect(result.draft.body).toContain('under development');
    expect(generateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'marketing_content_generation',
        responseFormat: 'json',
      }),
    );
  });

  it('labels deterministic_fallback when provider fails', async () => {
    process.env.ENABLE_MARKETING_AI_GENERATION_V1 = 'true';
    generateMock.mockRejectedValue(new Error('no provider'));

    const result = await generatePostDraft({ language: 'en' });
    expect(result.ok).toBe(true);
    expect(result.generationMeta.mode).toBe('deterministic_fallback');
    expect(result.draft.body).toBeTruthy();
  });

  it('uses deterministic_fallback when ai flag off (never claims model)', async () => {
    delete process.env.ENABLE_MARKETING_AI_GENERATION_V1;
    const result = await generatePostDraft({ language: 'vi' });
    expect(result.generationMeta.mode).toBe('deterministic_fallback');
    expect(generateMock).not.toHaveBeenCalled();
  });
});
