/**
 * LLM semantic extraction for external market signals (G1).
 * Separate domain from Performer IntentReasoner — shared JSON helpers only.
 */
import { extractJsonFromContent } from '../../multiAgent/utils/validation.ts';
import type { ExternalMarketSignal } from './types.js';
import type { MarketIntentSemanticFailureCode } from './types.js';
import { parseMarketIntentLlmResponse } from './marketIntentSchema.js';
import { MARKET_INTENT_FAMILIES, HAS_CATEGORIES, WANTS_CATEGORIES } from './constants.js';
import {
  classifyMarketIntentLlmFailure,
  isMarketIntentLlmProviderConfigured,
} from './resolveMarketIntentSemanticRuntime.js';

const G1_MAX_TOKENS = 4096;

const SYSTEM_PROMPT = `You analyze external market signals for Cardbey — copied posts, manual entries, community text.
Your job is semantic commercial-intent extraction. Do NOT invent business identity, websites, or facts not supported by the text.

Classify each signal:
- COMMERCIAL: genuine business/commercial objective (sell, buy, partner, invest, hire, distribute, promote, launch, expand, solve business problem)
- NON_COMMERCIAL: social chat, news, personal discussion without actionable commercial objective
- AMBIGUOUS: insufficient context to decide

Intent families (use only these): ${MARKET_INTENT_FAMILIES.join(', ')}
HAS categories: ${HAS_CATEGORIES.join(', ')}
WANTS categories: ${WANTS_CATEGORIES.join(', ')}

Rules:
1. Support English and Vietnamese naturally — no keyword-only classification.
2. Multiple intents allowed; rank by confidence.
3. Every HAS/WANTS item needs basis EXPLICIT (stated) or INFERRED (reasonably implied).
4. Never present INFERRED as EXPLICIT.
5. Include evidence statements and optional verbatim span from raw text.
6. actorHint/businessHint: only if explicitly named or clearly implied (e.g. "our spa chain"); use null if unknown.
7. locationHint: only explicit geography; do not invent.
8. Used vehicle sale = COMMERCIAL + SELL (valid commercial intent even if low strategic value).
9. Do not score Cardbey fit or recommend outreach.
10. Keep JSON compact: max 2 evidence items per array; omit null spans; no markdown fences.

Return strict JSON only:
{
  "classification": "COMMERCIAL|NON_COMMERCIAL|AMBIGUOUS",
  "classificationConfidence": 0.0-1.0,
  "classificationReason": "string",
  "classificationEvidence": [{"statement":"...","span":"...","basis":"EXPLICIT|INFERRED","confidence":0.0-1.0}],
  "intents": [{"family":"DISTRIBUTE","confidence":0.9,"basis":"EXPLICIT","evidence":[...]}],
  "has": [{"type":"PRODUCT","label":"...","confidence":0.9,"basis":"EXPLICIT","evidence":[...]}],
  "wants": [{"type":"DISTRIBUTOR","label":"...","confidence":0.9,"basis":"EXPLICIT","evidence":[...]}],
  "actorHint": null,
  "businessHint": null,
  "locationHint": null
}`;

export type LlmGenerateFn = (args: {
  purpose: string;
  prompt: string;
  systemPrompt?: string;
  tenantKey?: string;
  responseFormat?: string;
  maxTokens?: number;
}) => Promise<{ text?: string | null }>;

export type MarketIntentLlmExtractionFailure = {
  ok: false;
  code: MarketIntentSemanticFailureCode;
  reason: string;
};

export type MarketIntentLlmExtractionSuccess = {
  ok: true;
  data: ReturnType<typeof parseMarketIntentLlmResponse>;
};

export async function extractMarketIntentWithLlm(
  signal: ExternalMarketSignal,
  options: { tenantKey?: string; llmGenerate?: LlmGenerateFn } = {},
): Promise<MarketIntentLlmExtractionSuccess | MarketIntentLlmExtractionFailure> {
  if (!options.llmGenerate && !isMarketIntentLlmProviderConfigured()) {
    return {
      ok: false,
      code: 'LLM_PROVIDER_NOT_CONFIGURED',
      reason: 'No LLM provider is configured for semantic extraction.',
    };
  }

  const userPrompt = `Analyze this external market signal.

signalId: ${signal.signalId}
language hint: ${signal.language ?? 'unknown'}
sourceType: ${signal.sourceType}

rawText:
"""
${signal.rawText}
"""`;

  const generate =
    options.llmGenerate ??
    (async (args) => {
      const { llmGateway } = await import('../llm/llmGateway.ts');
      return llmGateway.generate({
        purpose: args.purpose,
        systemPrompt: args.systemPrompt,
        prompt: args.prompt,
        tenantKey: args.tenantKey,
        responseFormat: args.responseFormat as 'json' | 'text' | undefined,
        maxTokens: args.maxTokens,
      });
    });

  let text: string | null | undefined;
  try {
    const response = await generate({
      purpose: 'market_intent_extraction_g1',
      systemPrompt: SYSTEM_PROMPT,
      prompt: userPrompt,
      tenantKey: options.tenantKey ?? 'market_intent_g1',
      responseFormat: 'json',
      maxTokens: G1_MAX_TOKENS,
    });
    text = response.text;

    if (!text?.trim()) {
      const failure = classifyMarketIntentLlmFailure(new Error('Empty LLM response'), text);
      return { ok: false, code: failure.code, reason: failure.reason };
    }

    const content = extractJsonFromContent(text);
    const data = parseMarketIntentLlmResponse(content);
    return { ok: true, data };
  } catch (error) {
    const failure = classifyMarketIntentLlmFailure(error, text);
    return { ok: false, code: failure.code, reason: failure.reason };
  }
}
