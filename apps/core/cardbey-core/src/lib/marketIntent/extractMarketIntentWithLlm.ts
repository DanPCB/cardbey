/**
 * LLM semantic extraction for external market signals (G1).
 * Separate domain from Performer IntentReasoner — shared JSON helpers only.
 */
import { llmGateway } from '../llm/llmGateway.ts';
import { extractJsonFromContent } from '../../multiAgent/utils/validation.ts';
import type { ExternalMarketSignal } from './types.js';
import { parseMarketIntentLlmResponse } from './marketIntentSchema.js';
import { MARKET_INTENT_FAMILIES, HAS_CATEGORIES, WANTS_CATEGORIES } from './constants.js';
import {
  classifySemanticFailure,
  getMarketIntentSemanticHealth,
  type SemanticFailureCode,
} from './marketIntentSemanticHealth.js';

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

Output constraints (critical):
- Return ONE JSON object only. No markdown fences or prose outside JSON.
- Keep each evidence array to at most 1 item.
- Use short labels; avoid long sentences.
- Omit empty arrays when possible.

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

const MAX_OUTPUT_TOKENS = 2048;

export type LlmGenerateFn = (args: {
  purpose: string;
  prompt: string;
  system?: string;
  tenantKey?: string;
  responseFormat?: string;
  maxTokens?: number;
  temperature?: number;
}) => Promise<{ text?: string | null }>;

export type LlmExtractionFailure = {
  ok: false;
  reason: string;
  failureCode: SemanticFailureCode;
};

export type LlmExtractionSuccess = {
  ok: true;
  data: ReturnType<typeof parseMarketIntentLlmResponse>;
};

function parseLlmContent(text: string): ReturnType<typeof parseMarketIntentLlmResponse> {
  const content = extractJsonFromContent(text ?? '');
  return parseMarketIntentLlmResponse(content);
}

async function invokeSemanticExtraction(
  generate: LlmGenerateFn,
  args: {
    system: string;
    prompt: string;
    tenantKey: string;
    purpose: string;
  },
): Promise<string> {
  const { text } = await generate({
    purpose: args.purpose,
    system: args.system,
    prompt: args.prompt,
    tenantKey: args.tenantKey,
    responseFormat: 'json',
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.2,
  });
  return String(text ?? '').trim();
}

export async function extractMarketIntentWithLlm(
  signal: ExternalMarketSignal,
  options: { tenantKey?: string; llmGenerate?: LlmGenerateFn } = {},
): Promise<LlmExtractionSuccess | LlmExtractionFailure> {
  if (!options.llmGenerate) {
    const health = getMarketIntentSemanticHealth();
    if (health.semanticStatus !== 'AVAILABLE') {
      return {
        ok: false,
        reason: health.reason ?? 'no_llm_provider_configured',
        failureCode: 'LLM_PROVIDER_NOT_CONFIGURED',
      };
    }
  }

  const userPrompt = `Analyze this external market signal.

signalId: ${signal.signalId}
language hint: ${signal.language ?? 'unknown'}
sourceType: ${signal.sourceType}

rawText:
"""
${signal.rawText}
"""`;

  const tenantKey = options.tenantKey ?? 'market_intent_g1';
  const generate = options.llmGenerate ?? (async (args) => llmGateway.generate(args));

  try {
    const text = await invokeSemanticExtraction(generate, {
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      tenantKey,
      purpose: 'market_intent_extraction_g1',
    });

    if (!text) {
      return {
        ok: false,
        reason: 'LLM returned empty response',
        failureCode: 'LLM_RESPONSE_INVALID',
      };
    }

    try {
      const data = parseLlmContent(text);
      return { ok: true, data };
    } catch (parseError) {
      const repairPrompt = `Repair invalid JSON for market intent extraction. Return ONLY one valid JSON object matching the schema. No markdown, no prose.

Previous invalid output (truncated):
${text.slice(0, 1200)}

Signal:
"""
${signal.rawText.slice(0, 2000)}
"""`;

      const repairedText = await invokeSemanticExtraction(generate, {
        system: `${SYSTEM_PROMPT}\n\nYou are repairing invalid JSON. Output only valid JSON.`,
        prompt: repairPrompt,
        tenantKey,
        purpose: 'market_intent_extraction_g1_repair',
      });

      if (!repairedText) {
        const message = parseError instanceof Error ? parseError.message : String(parseError);
        return {
          ok: false,
          reason: message,
          failureCode: classifySemanticFailure(message),
        };
      }

      const data = parseLlmContent(repairedText);
      return { ok: true, data };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: message,
      failureCode: classifySemanticFailure(message),
    };
  }
}
