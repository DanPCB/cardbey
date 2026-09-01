/**
 * Market Intent G1 semantic runtime health — uses canonical Features.llm + gateway flags.
 */
import { Features } from '../../config/features.js';

export type MarketIntentSemanticStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'FAILED';

export type MarketIntentSemanticFailureCode =
  | 'LLM_PROVIDER_NOT_CONFIGURED'
  | 'LLM_PROVIDER_UNAVAILABLE'
  | 'LLM_REQUEST_FAILED'
  | 'LLM_RESPONSE_INVALID'
  | 'LLM_TIMEOUT'
  | 'SEMANTIC_EXTRACTION_FAILED';

export type MarketIntentSemanticHealth = {
  semanticStatus: MarketIntentSemanticStatus;
  providerConfigured: boolean;
  gatewayEnabled: boolean;
  llmEnabled: boolean;
  message: string;
};

export function isMarketIntentLlmProviderConfigured(): boolean {
  if (String(process.env.LLM_ENABLED ?? '').trim().toLowerCase() === 'false') {
    return false;
  }
  if (!Features.llm.useGateway) {
    return false;
  }
  return Features.llm.available;
}

export function getMarketIntentSemanticHealth(): MarketIntentSemanticHealth {
  const llmEnabled = String(process.env.LLM_ENABLED ?? '').trim().toLowerCase() !== 'false';
  const gatewayEnabled = Features.llm.useGateway;
  const providerConfigured = Features.llm.available;

  if (!llmEnabled) {
    return {
      semanticStatus: 'UNAVAILABLE',
      providerConfigured,
      gatewayEnabled,
      llmEnabled: false,
      message: 'LLM execution is disabled (LLM_ENABLED=false).',
    };
  }

  if (!gatewayEnabled) {
    return {
      semanticStatus: 'UNAVAILABLE',
      providerConfigured,
      gatewayEnabled: false,
      llmEnabled,
      message: 'LLM gateway is disabled (USE_LLM_GATEWAY=false).',
    };
  }

  if (!providerConfigured) {
    return {
      semanticStatus: 'UNAVAILABLE',
      providerConfigured: false,
      gatewayEnabled,
      llmEnabled,
      message: 'No LLM provider API key is configured for the gateway.',
    };
  }

  return {
    semanticStatus: 'AVAILABLE',
    providerConfigured: true,
    gatewayEnabled,
    llmEnabled,
    message: 'Semantic analysis ready via canonical LLM gateway.',
  };
}

export function classifyMarketIntentLlmFailure(
  error: unknown,
  text?: string | null,
): { code: MarketIntentSemanticFailureCode; reason: string } {
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (String(process.env.LLM_ENABLED ?? '').trim().toLowerCase() === 'false') {
    return {
      code: 'LLM_PROVIDER_UNAVAILABLE',
      reason: 'LLM execution is disabled (LLM_ENABLED=false).',
    };
  }

  const lower = message.toLowerCase();
  if (lower.includes('daily cap')) {
    return { code: 'LLM_PROVIDER_UNAVAILABLE', reason: message };
  }
  if (lower.includes('timeout') || lower.includes('etimedout') || lower.includes('timed out')) {
    return { code: 'LLM_TIMEOUT', reason: message };
  }
  if (lower.includes('invalid json') || lower.includes('schema validation failed')) {
    return { code: 'LLM_RESPONSE_INVALID', reason: message };
  }
  if (!text?.trim()) {
    return {
      code: 'LLM_REQUEST_FAILED',
      reason: message || 'LLM returned an empty response.',
    };
  }

  return {
    code: 'SEMANTIC_EXTRACTION_FAILED',
    reason: message || 'Semantic extraction failed.',
  };
}
