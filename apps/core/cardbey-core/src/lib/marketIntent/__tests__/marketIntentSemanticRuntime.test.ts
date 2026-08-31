import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  classifySemanticFailure,
  getMarketIntentSemanticHealth,
  isMarketIntentSemanticProviderConfigured,
} from '../marketIntentSemanticHealth.js';
import { analyzeMarketSignal } from '../analyzeMarketSignal.js';
import { normalizeMarketSignal } from '../normalizeMarketSignal.js';
import { createMockLlmGenerate } from './mockMarketIntentLlm.js';

const ORIGINAL_ENV = { ...process.env };

describe('marketIntent semantic runtime', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.resetModules();
  });

  it('reports UNAVAILABLE when LLM gateway is disabled', async () => {
    process.env.USE_LLM_GATEWAY = 'false';
    const { getMarketIntentSemanticHealth: health } = await import('../marketIntentSemanticHealth.js');
    const result = health();
    expect(result.semanticStatus).toBe('UNAVAILABLE');
    expect(result.gatewayEnabled).toBe(false);
    expect(result.reason).toMatch(/gateway disabled/i);
  });

  it('reports UNAVAILABLE when no provider credentials exist', async () => {
    process.env.USE_LLM_GATEWAY = 'true';
    process.env.LLM_ENABLED = 'true';
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.KIMI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.XAI_API_KEY;
    const { getMarketIntentSemanticHealth: health, isMarketIntentSemanticProviderConfigured: configured } =
      await import('../marketIntentSemanticHealth.js');
    const result = health();
    expect(result.semanticStatus).toBe('UNAVAILABLE');
    expect(configured()).toBe(false);
  });

  it('classifies semantic failure codes from error messages', () => {
    expect(classifySemanticFailure('')).toBe('LLM_PROVIDER_NOT_CONFIGURED');
    expect(classifySemanticFailure('Request timed out after 30s')).toBe('LLM_TIMEOUT');
    expect(classifySemanticFailure('Invalid JSON at position 4')).toBe('LLM_RESPONSE_INVALID');
    expect(classifySemanticFailure('LLM gateway disabled')).toBe('LLM_PROVIDER_UNAVAILABLE');
    expect(classifySemanticFailure('unexpected provider fault')).toBe('SEMANTIC_EXTRACTION_FAILED');
  });

  it('uses mock LLM gateway contract for successful G1 analysis', async () => {
    const signal = normalizeMarketSignal({
      rawText: 'Chúng tôi là nhà sản xuất bao bì và đang tìm nhà phân phối tại Australia.',
      sourceType: 'social_post_copy',
    });
    const analysis = await analyzeMarketSignal(signal, {
      llmGenerate: createMockLlmGenerate(),
    });
    expect(analysis.classification).toBe('COMMERCIAL');
    expect(analysis.semanticStatus).toBe('AVAILABLE');
    expect(analysis.analysisStatus).toBe('READY');
    expect(analysis.intents.primary).toBeTruthy();
  });

  it('returns degraded analysis when semantic extraction unavailable', async () => {
    const signal = normalizeMarketSignal({
      rawText: 'Manufacturer seeking distributors in Australia for sustainable packaging.',
      sourceType: 'social_post_copy',
    });
    const analysis = await analyzeMarketSignal(signal, {
      llmGenerate: async () => {
        throw new Error('no_llm_provider_configured');
      },
    });
    expect(analysis.analysisStatus).toBe('DEGRADED');
    expect(analysis.semanticStatus).toBe('UNAVAILABLE');
    expect(analysis.semanticFailureCode).toBe('LLM_PROVIDER_NOT_CONFIGURED');
    expect(analysis.classification).toBe('UNKNOWN');
    expect(analysis.outcome).toBe('CLASSIFICATION_FAILED');
  });
});
