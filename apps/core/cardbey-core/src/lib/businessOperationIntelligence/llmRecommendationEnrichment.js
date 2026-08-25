/**
 * Optional LLM wording enrichment for D6 recommendations.
 * Structured evidence in → wording out. Deterministic path is the default.
 */

import { resolveAnthropicModel } from '../llm/anthropicModelConfig.js';

/**
 * Enrich recommendation wording via Anthropic when configured.
 * Returns null-shaped fallback object on skip/failure (caller keeps deterministic text).
 *
 * @param {{
 *   recommendations: object[],
 *   signals: object[],
 *   vertical: object,
 *   businessName?: string | null,
 *   location?: string | null,
 *   mode?: string,
 * }} input
 */
export async function enrichRecommendationWording(input) {
  if (String(process.env.ENABLE_BOI_D6_LLM_ENRICHMENT || '').toLowerCase() !== 'true') {
    return {
      recommendations: input.recommendations,
      llmCalls: 0,
      approximateTokens: 0,
      provider: null,
      model: null,
      skipped: true,
    };
  }

  let postAnthropicMessages;
  try {
    ({ postAnthropicMessages } = await import('../llm/anthropicProvider.js'));
  } catch {
    return {
      recommendations: input.recommendations,
      llmCalls: 0,
      approximateTokens: 0,
      provider: null,
      model: null,
      skipped: true,
      reason: 'provider_unavailable',
    };
  }

  const model = resolveAnthropicModel();
  const payload = {
    vertical: input.vertical?.id,
    businessName: input.businessName,
    location: input.location,
    mode: input.mode,
    signals: (input.signals || []).map((s) => ({
      type: s.type,
      observation: s.observation,
      metrics: s.metrics,
      knowledgeState: s.knowledgeState,
    })),
    recommendations: (input.recommendations || []).map((r) => ({
      id: r.id,
      businessSpecificObservation: r.businessSpecificObservation,
      whyItMatters: r.whyItMatters,
      recommendedAction: r.recommendedAction,
      evidenceRefs: r.evidenceRefs,
      signal: r.signal,
      priority: r.priority,
    })),
  };

  const system = `You refine business recommendation wording ONLY.
Rules:
- Keep the same recommendation ids.
- Do not invent facts, numbers, websites, offerings, demand, revenue, or competitors.
- Do not add TAM/SAM/SOM, success probability, or financial forecasts.
- Preserve evidenceRefs and signal meaning.
- Allowed claim types: observation restatement, implication, recommended action, limitations.
- Return JSON: { "recommendations": [ { "id", "businessSpecificObservation", "whyItMatters", "recommendedAction" } ] }`;

  const user = `Refine wording for these structured recommendations:\n${JSON.stringify(payload)}`;

  const t0 = Date.now();
  const result = await postAnthropicMessages({
    model,
    max_tokens: 1800,
    messages: [
      { role: 'user', content: user },
    ],
    system,
  });

  const text = extractText(result);
  const parsed = safeJson(text);
  const approxIn = Math.ceil((system.length + user.length) / 4);
  const approxOut = Math.ceil(String(text || '').length / 4);

  return {
    recommendations: Array.isArray(parsed?.recommendations) ? parsed.recommendations : [],
    llmCalls: 1,
    approximateTokens: approxIn + approxOut,
    provider: 'anthropic',
    model,
    latencyMs: Date.now() - t0,
    skipped: false,
  };
}

function extractText(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  const content = result.content || result.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => c.text || c.content || '').join('\n');
  }
  return '';
}

function safeJson(text) {
  try {
    const start = String(text).indexOf('{');
    const end = String(text).lastIndexOf('}');
    if (start < 0 || end < 0) return null;
    return JSON.parse(String(text).slice(start, end + 1));
  } catch {
    return null;
  }
}
