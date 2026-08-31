/**

 * Canonical semantic-engine availability for Market Intent G1.

 * Mirrors llmGateway provider resolution — does not duplicate provider clients.

 */

import { Features } from '../../config/features.js';

import { PROVIDER_NAMES } from '../llm/llmGateway.ts';



export type SemanticStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'FAILED';



export type SemanticFailureCode =

  | 'LLM_PROVIDER_NOT_CONFIGURED'

  | 'LLM_PROVIDER_UNAVAILABLE'

  | 'LLM_REQUEST_FAILED'

  | 'LLM_RESPONSE_INVALID'

  | 'LLM_TIMEOUT'

  | 'SEMANTIC_EXTRACTION_FAILED';



export type MarketIntentSemanticHealth = {

  semanticStatus: SemanticStatus;

  provider: string | null;

  gatewayEnabled: boolean;

  reason: string | null;

};



function providerHasCredential(provider: string): boolean {

  switch (provider) {

    case 'anthropic':

      return (

        Boolean(process.env.ANTHROPIC_API_KEY?.trim()) &&

        String(process.env.ANTHROPIC_DISABLED ?? '0').trim() !== '1'

      );

    case 'openai':

      return Boolean(process.env.OPENAI_API_KEY?.trim());

    case 'deepseek':

      return Boolean(process.env.DEEPSEEK_API_KEY?.trim());

    case 'xai':

      return Boolean(process.env.XAI_API_KEY?.trim());

    case 'kimi':

      return (

        Boolean(process.env.KIMI_API_KEY?.trim()) &&

        String(process.env.KIMI_DISABLED ?? '0').trim() !== '1'

      );

    case 'groq':

      return Boolean(process.env.GROQ_API_KEY?.trim());

    default:

      return false;

  }

}



function resolvePrimaryProvider(): string | null {

  const explicit = process.env.LLM_DEFAULT_PROVIDER?.trim().toLowerCase();

  if (explicit && (PROVIDER_NAMES as readonly string[]).includes(explicit)) {

    return explicit;

  }

  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';

  if (process.env.OPENAI_API_KEY) return 'openai';

  if (process.env.KIMI_API_KEY) return 'kimi';

  if (process.env.GROQ_API_KEY) return 'groq';

  if (process.env.DEEPSEEK_API_KEY) return 'deepseek';

  if (process.env.XAI_API_KEY) return 'xai';

  return explicit || null;

}



function resolveFallbackProvider(primary: string): string | null {

  const configured = String(process.env.LLM_FALLBACK_PROVIDER ?? '').trim().toLowerCase();

  if (configured && configured !== primary && providerHasCredential(configured)) {

    return configured;

  }

  if (primary === 'anthropic' && providerHasCredential('openai')) return 'openai';

  if (primary === 'openai' && providerHasCredential('anthropic')) return 'anthropic';

  if ((primary === 'kimi' || primary === 'groq') && providerHasCredential('openai')) {

    return 'openai';

  }

  if ((primary === 'kimi' || primary === 'groq') && providerHasCredential('anthropic')) {

    return 'anthropic';

  }

  return null;

}



export function isMarketIntentSemanticProviderConfigured(): boolean {

  const health = getMarketIntentSemanticHealth();

  return health.semanticStatus === 'AVAILABLE';

}



export function getMarketIntentSemanticHealth(): MarketIntentSemanticHealth {

  const gatewayEnabled = Features.llm.useGateway;

  if (!gatewayEnabled) {

    return {

      semanticStatus: 'UNAVAILABLE',

      provider: null,

      gatewayEnabled: false,

      reason: 'LLM gateway disabled (USE_LLM_GATEWAY=false)',

    };

  }



  if (String(process.env.LLM_ENABLED ?? '').trim().toLowerCase() === 'false') {

    return {

      semanticStatus: 'UNAVAILABLE',

      provider: null,

      gatewayEnabled: true,

      reason: 'LLM_ENABLED=false',

    };

  }



  const primary = resolvePrimaryProvider();

  if (!primary) {

    return {

      semanticStatus: 'UNAVAILABLE',

      provider: null,

      gatewayEnabled: true,

      reason: 'No LLM provider credentials configured',

    };

  }



  if (providerHasCredential(primary)) {

    return {

      semanticStatus: 'AVAILABLE',

      provider: primary,

      gatewayEnabled: true,

      reason: null,

    };

  }



  const fallback = resolveFallbackProvider(primary);

  if (fallback) {

    return {

      semanticStatus: 'AVAILABLE',

      provider: fallback,

      gatewayEnabled: true,

      reason: `Primary provider "${primary}" unavailable; fallback "${fallback}" configured`,

    };

  }



  return {

    semanticStatus: 'UNAVAILABLE',

    provider: primary,

    gatewayEnabled: true,

    reason: `Provider "${primary}" has no API credentials`,

  };

}



export function classifySemanticFailure(reason: string): SemanticFailureCode {

  const normalized = String(reason ?? '').trim();

  if (!normalized || normalized === 'no_llm_provider_configured') {

    return 'LLM_PROVIDER_NOT_CONFIGURED';

  }

  if (/timeout|timed out|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(normalized)) {

    return 'LLM_TIMEOUT';

  }

  if (/Invalid JSON|Schema validation failed|JSON at position/i.test(normalized)) {

    return 'LLM_RESPONSE_INVALID';

  }

  if (/daily cap|API error|provider|unauthorized|401|403|429/i.test(normalized)) {

    return 'LLM_REQUEST_FAILED';

  }

  if (/gateway disabled|LLM_ENABLED|credentials configured/i.test(normalized)) {

    return 'LLM_PROVIDER_UNAVAILABLE';

  }

  return 'SEMANTIC_EXTRACTION_FAILED';

}

