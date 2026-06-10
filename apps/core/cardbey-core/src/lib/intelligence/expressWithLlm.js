/**

 * Layer 4 — LLM expression (server-side only; OPENAI_API_KEY never exposed to client).

 */

import OpenAI from 'openai';

import { recordLlmExpressEvent } from './llmMonitor.js';



const LLM_TIMEOUT_MS = 8000;

const MAX_ATTEMPTS = 2;

const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

const RATE_LIMIT_PER_HOUR = 6;



/** @type {OpenAI | null} */
let openaiClient = null;

function getOpenAiClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

const rateLimitStore = new Map();



const FORBIDDEN_TERMS = [

  'detected',

  'detection',

  'signal',

  'scoring',

  'backend',

  'pil',

  'pipeline',

  'instrumentation',

];



function isLlmExpressionEnabled() {

  const v = process.env.INTELLIGENCE_LLM_EXPRESSION;

  if (v === 'false') return false;

  return Boolean(getOpenAiClient());

}



function checkRateLimit(key) {

  const now = Date.now();

  const record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {

    rateLimitStore.set(key, { count: 1, resetAt: now + 3600000 });

    return { allowed: true };

  }

  if (record.count >= RATE_LIMIT_PER_HOUR) return { allowed: false };

  record.count += 1;

  rateLimitStore.set(key, record);

  return { allowed: true };

}



/**
 * Accept exact labels or common "Label: value" strings the model returns.
 * @param {Array<{ label?: string, value?: string|number }>} facts
 */
function buildAllowedKeyFactSet(facts) {
  const allowed = new Set();
  for (const f of facts) {
    const label = String(f.label ?? '').trim();
    const value = String(f.value ?? '').trim();
    if (label) allowed.add(label);
    if (label && value) {
      allowed.add(`${label}: ${value}`);
      allowed.add(`${label}:${value}`);
    }
  }
  return allowed;
}

function matchesAssessmentFactLoosely(keyFact, facts) {
  const lower = String(keyFact).trim().toLowerCase();
  return facts.some((f) => {
    const label = String(f.label ?? '').trim().toLowerCase();
    if (!label) return false;
    return lower === label || lower.startsWith(`${label}:`);
  });
}

function isDiagnostic(text) {

  const lower = String(text ?? '').toLowerCase();

  return FORBIDDEN_TERMS.some((term) => lower.includes(term));

}



function recordFallback(surface, latencyMs, failureReason, validationErrors) {

  recordLlmExpressEvent({

    surface,

    outcome: 'fallback',

    failureReason,

    validationErrors,

    latencyMs,

    timestamp: Date.now(),

  });

}



function recordSuccess(surface, latencyMs) {

  recordLlmExpressEvent({

    surface,

    outcome: 'llm_success',

    latencyMs,

    timestamp: Date.now(),

  });

}



/**

 * @param {any} response

 * @param {{ suggestions: any[]; assessment: any; context: any }} input

 */

function validateExpressionResponse(response, input) {

  const errors = [];

  if (!response?.title || typeof response.title !== 'string') errors.push('title required');

  if (!response?.message || typeof response.message !== 'string') errors.push('message required');

  if (!response?.primarySuggestionId) errors.push('primarySuggestionId required');



  const suggestionIds = new Set((input.suggestions ?? []).map((s) => s.id));

  if (!suggestionIds.has(response.primarySuggestionId)) {

    errors.push('primarySuggestionId not in suggestions');

  }

  for (const id of response.secondarySuggestionIds ?? []) {

    if (!suggestionIds.has(id)) errors.push(`secondarySuggestionId ${id} not in suggestions`);

  }



  if (response.keyFacts) {

    const allowed = buildAllowedKeyFactSet(input.assessment?.facts ?? []);

    for (const fact of response.keyFacts) {

      const normalized = String(fact ?? '').trim();

      if (!normalized) continue;

      if (!allowed.has(normalized) && !matchesAssessmentFactLoosely(normalized, input.assessment?.facts ?? [])) {

        errors.push(`keyFact not in assessment: ${fact}`);

      }

    }

  }



  if (isDiagnostic(`${response.title} ${response.message}`)) {

    errors.push('diagnostic language');

  }



  return { valid: errors.length === 0, errors };

}



function buildSystemPrompt() {

  return `You are Cardbey's Contextual AI Concierge.

NEVER mention: detected, signal, scoring, backend, PIL, pipeline, instrumentation.

NEVER invent metrics or actions outside the provided suggestions list.

Return strict JSON:

{ "title": "...", "message": "...", "primarySuggestionId": "...", "secondarySuggestionIds": [], "keyFacts": [], "memoryReference": null }

keyFacts must use assessment fact labels exactly (e.g. "Store Health") OR "Label: value" (e.g. "Store Health: 33").`;

}



function buildUserPrompt(input) {

  return JSON.stringify({

    surface: input.surface,

    actor: input.context?.actor,

    entity: input.context?.entity,

    facts: input.assessment?.facts,

    issues: input.assessment?.issues,

    suggestions: (input.suggestions ?? []).map((s) => ({ id: s.id, label: s.label })),

    suitcase: input.context?.memory?.suitcase ?? [],

  });

}



/**

 * @param {object} input

 * @param {number} [attempt]

 * @returns {Promise<{ parsed: object|null, failureReason?: string }>}

 */

async function callOpenAiJson(input, attempt = 0) {

  const openai = getOpenAiClient();

  if (!openai) return { parsed: null, failureReason: 'disabled' };



  const controller = new AbortController();

  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);



  try {

    const completion = await openai.chat.completions.create(

      {

        model: process.env.INTELLIGENCE_EXPRESS_MODEL || process.env.PIL_CONCIERGE_MODEL || 'gpt-4o-mini',

        temperature: Math.min(Number(input.options?.temperature ?? 0.4), 0.7),

        max_tokens: Math.min(Number(input.options?.maxTokens ?? 400), 600),

        response_format: { type: 'json_object' },

        messages: [

          { role: 'system', content: buildSystemPrompt() },

          { role: 'user', content: buildUserPrompt(input) },

        ],

      },

      { signal: controller.signal },

    );



    clearTimeout(timeoutId);

    const raw = completion.choices?.[0]?.message?.content;

    if (!raw) return { parsed: null, failureReason: 'http_error' };

    try {

      return { parsed: JSON.parse(raw) };

    } catch {

      return { parsed: null, failureReason: 'invalid_json' };

    }

  } catch (err) {

    clearTimeout(timeoutId);

    const status = err?.status ?? err?.response?.status;

    if (status === 429) {

      return { parsed: null, failureReason: 'rate_limited' };

    }

    if (err?.name === 'AbortError') {

      return { parsed: null, failureReason: 'timeout' };

    }

    if (RETRYABLE_STATUS_CODES.has(status) && attempt < MAX_ATTEMPTS - 1) {

      await new Promise((r) => setTimeout(r, 500));

      return callOpenAiJson(input, attempt + 1);

    }

    console.warn('[intelligence/express] LLM call failed:', err?.message ?? err);

    return { parsed: null, failureReason: 'http_error' };

  }

}



/**

 * @param {object} input

 * @returns {Promise<object|null>}

 */

export async function expressWithLlm(input) {

  const started = Date.now();

  const surface = input.surface ?? 'pil';



  if (!isLlmExpressionEnabled()) {

    recordFallback(surface, Date.now() - started, 'disabled');

    return null;

  }



  const rateKey =

    input.context?.actor?.id ??

    input.context?.session?.sessionId ??

    'anonymous';

  const rate = checkRateLimit(String(rateKey));

  if (!rate.allowed) {

    recordFallback(surface, Date.now() - started, 'rate_limited');

    return null;

  }



  const { parsed, failureReason } = await callOpenAiJson(input);

  if (!parsed) {

    recordFallback(surface, Date.now() - started, failureReason ?? 'unknown');

    return null;

  }



  const validation = validateExpressionResponse(parsed, input);

  if (!validation.valid) {

    console.warn('[intelligence/express] validation failed:', validation.errors);

    const reason = validation.errors.some((e) => e.includes('diagnostic'))

      ? 'diagnostic_language'

      : 'validation_failed';

    recordFallback(surface, Date.now() - started, reason, validation.errors);

    return null;

  }



  recordSuccess(surface, Date.now() - started);



  return {

    title: String(parsed.title).trim().slice(0, 60),

    message: String(parsed.message).trim().slice(0, 600),

    primarySuggestionId: parsed.primarySuggestionId,

    secondarySuggestionIds: (parsed.secondarySuggestionIds ?? []).slice(0, 2),

    keyFacts: parsed.keyFacts?.slice(0, 6),

    memoryReference: parsed.memoryReference ?? undefined,

  };

}



export function isIntelligenceLlmAvailable() {

  return isLlmExpressionEnabled();

}


