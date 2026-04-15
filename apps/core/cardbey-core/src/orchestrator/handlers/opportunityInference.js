/**
 * Foundation 3: LLM-inferred opportunities.
 * Infers IntentOpportunity rows with source: 'llm_inference' via existing LLM path (cache + budget + provider).
 * Rule-based flow and accept → IntentRequest are untouched.
 */

const LOG_PREFIX = '[OpportunityInference]';
const OPPORTUNITY_INFERENCE_PURPOSE = 'opportunity_inference';
const PROVIDER_NAME = 'kimi';
const DEFAULT_WINDOW_DAYS = 30;

/**
 * Build input for opportunity inference from store + signals.
 * @param {object} prisma
 * @param {string} storeId
 * @param {{ windowDays?: number, signalSummary?: string, existingOpportunityTypes?: string[] }} [opts]
 * @returns {Promise<{ storeId: string, storeContext: object, windowDays: number, signalSummary: string, existingOpportunityTypes: string[] } | null>}
 */
export async function buildOpportunityInferenceInput(prisma, storeId, opts = {}) {
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, type: true, slug: true },
  });
  if (!store) return null;

  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const signalSummary = opts.signalSummary ?? '';
  const existingOpportunityTypes = opts.existingOpportunityTypes ?? [];

  const existing = await prisma.intentOpportunity.findMany({
    where: { storeId },
    select: { type: true },
    distinct: ['type'],
  });
  const existingTypes = [...new Set([...existingOpportunityTypes, ...existing.map((o) => o.type)])];

  return {
    storeId,
    storeContext: {
      businessName: store.name,
      businessType: store.type,
      storeType: store.type,
    },
    windowDays,
    signalSummary,
    existingOpportunityTypes: existingTypes,
  };
}

/**
 * Check LLM budget for tenant. Returns false if budget would be exceeded (do not throw).
 * Used to skip inference before building prompt / calling LLM.
 * @param {object} prisma
 * @param {string} tenantKey
 * @returns {Promise<boolean>} true if within budget or budget disabled, false to skip
 */
export async function checkLlmBudget(prisma, tenantKey) {
  try {
    const { checkAndReserveBudget, isBudgetEnabled } = await import('../../lib/llm/llmBudget.js');
    if (!isBudgetEnabled()) return true;
    const result = await checkAndReserveBudget(prisma, {
      tenantKey,
      purpose: OPPORTUNITY_INFERENCE_PURPOSE,
      provider: PROVIDER_NAME,
      prompt: 'opportunity_inference_check',
    });
    return result?.allowed === true;
  } catch (e) {
    console.warn(LOG_PREFIX, 'Budget check failed (treat as skip):', e?.message);
    return false;
  }
}

/**
 * Build system + user prompt for JSON-only array of opportunities (no markdown fences).
 * Exported for unit tests.
 */
export function buildOpportunityPrompt(input) {
  const system = `You are an opportunity analyst for small businesses. Return ONLY a valid JSON array of opportunity objects. No explanation, no markdown code fences.`;
  const user = [
    'Store context:',
    JSON.stringify(input.storeContext),
    `Signal summary (last ${input.windowDays} days):`,
    input.signalSummary || '(none)',
    'Existing opportunity types to avoid duplicating:',
    JSON.stringify(input.existingOpportunityTypes),
    '',
    'Return a JSON array. Each object must have: type (string), title (string), description (string), suggestedIntentType (string), suggestedPayload (object or null), confidence (number 0-1), reasoning (string).',
  ].join('\n');
  return { system, user, full: `${system}\n\n${user}` };
}

/**
 * Call LLM using same path as interpretMissionIntentWithLlm (cache + budget + provider).
 * @returns {{ text: string | null, skippedReason?: 'budget_exceeded' | 'llm_unavailable' }}
 */
async function callLlmForOpportunities(prisma, promptFull, tenantKey) {
  try {
    const { hashPrompt, getCached, setCached, shouldSkipCacheForPrompt } = await import('../../lib/llm/llmCache.js');
    const { checkAndReserveBudget, commitBudget, estimateTokens, isBudgetEnabled, isFailOpen } = await import('../../lib/llm/llmBudget.js');

    if (!shouldSkipCacheForPrompt(promptFull)) {
      const promptHash = hashPrompt(promptFull);
      const cached = await getCached(prisma, promptHash, PROVIDER_NAME, '', tenantKey, OPPORTUNITY_INFERENCE_PURPOSE);
      if (cached?.text) return { text: cached.text };
    }

    let kimi = await import('../../lib/llm/kimiProvider.js');
    const providerClient = kimi.kimiProvider?.generateText ? { generateText: kimi.kimiProvider.generateText.bind(kimi.kimiProvider) } : kimi.generateText ? { generateText: kimi.generateText } : null;
    if (!providerClient?.generateText) return { text: null, skippedReason: 'llm_unavailable' };

    let budgetReservation = null;
    if (isBudgetEnabled()) {
      const result = await checkAndReserveBudget(prisma, {
        tenantKey,
        purpose: OPPORTUNITY_INFERENCE_PURPOSE,
        provider: PROVIDER_NAME,
        prompt: promptFull,
      });
      if (!result.allowed) return { text: null, skippedReason: 'budget_exceeded' };
      budgetReservation = result;
    }

    const result = await providerClient.generateText(promptFull, { timeoutMs: 20000, maxRetries: 1 });
    const text = result?.text ?? null;

    if (budgetReservation && text != null) {
      try {
        const actualTokensOut = result?.usage?.outputTokens ?? estimateTokens(promptFull, text).tokensOut;
        await commitBudget(prisma, {
          tenantKey,
          purpose: OPPORTUNITY_INFERENCE_PURPOSE,
          provider: PROVIDER_NAME,
          model: result?.model ?? '',
          day: budgetReservation.day,
          actualTokensOut,
          reservedTokensOut: budgetReservation.reservedTokensOut,
        });
      } catch (_) {}
    }
    if (text != null && !shouldSkipCacheForPrompt(promptFull)) {
      const promptHash = hashPrompt(promptFull);
      await setCached(prisma, promptHash, text, PROVIDER_NAME, result?.model ?? '', tenantKey, OPPORTUNITY_INFERENCE_PURPOSE);
    }
    return { text };
  } catch (e) {
    console.warn(LOG_PREFIX, 'LLM call failed:', e?.message);
    return { text: null, skippedReason: 'llm_unavailable' };
  }
}

/**
 * Parse and validate LLM response: strip fences, must be array; each item must have type, title, suggestedIntentType; drop malformed with warning.
 * @param {string} raw
 * @returns {{ valid: object[], dropped: number }}
 */
export function parseOpportunitiesResponse(raw) {
  const valid = [];
  let dropped = 0;
  if (!raw || typeof raw !== 'string') return { valid, dropped };
  const clean = raw.replace(/```json|```/g, '').trim();
  let arr;
  try {
    arr = JSON.parse(clean);
  } catch (e) {
    console.warn(LOG_PREFIX, 'Parse failed:', e?.message);
    return { valid, dropped };
  }
  if (!Array.isArray(arr)) {
    console.warn(LOG_PREFIX, 'Response is not a JSON array');
    return { valid, dropped };
  }
  for (const item of arr) {
    if (item && typeof item === 'object' && typeof item.type === 'string' && typeof item.title === 'string' && typeof item.suggestedIntentType === 'string') {
      valid.push({
        type: String(item.type).trim(),
        title: String(item.title).trim(),
        description: typeof item.description === 'string' ? item.description.trim() : '',
        suggestedIntentType: String(item.suggestedIntentType).trim(),
        suggestedPayload: item && typeof item.suggestedPayload === 'object' && item.suggestedPayload !== null ? item.suggestedPayload : {},
        confidence: typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 0.5,
        reasoning: typeof item.reasoning === 'string' ? item.reasoning.trim() : '',
      });
    } else {
      dropped++;
      console.warn(LOG_PREFIX, 'Dropped malformed opportunity item:', typeof item === 'object' ? JSON.stringify(item).slice(0, 100) : item);
    }
  }
  return { valid, dropped };
}

/**
 * Run opportunity inference: build input, check budget, prompt, LLM, parse, write IntentOpportunity with source 'llm_inference'.
 * @param {object} task - { entryPoint: 'opportunity_inference', request?: { storeId, windowDays?, signalSummary?, tenantKey? }, ... }
 * @param {object} context - { prisma }
 * @returns {Promise<{ skipped?: boolean, reason?: string, created?: number, opportunities?: object[] }>}
 */
export async function runOpportunityInference(task, context = {}) {
  const prisma = context.prisma;
  if (!prisma) throw new Error('prisma required in context');

  const request = task?.request ?? {};
  const storeId = request.storeId ?? task.storeId;
  if (!storeId) {
    return { skipped: true, reason: 'store_id_required' };
  }

  const tenantKey = request.tenantKey ?? task.tenantId ?? storeId;

  const input = await buildOpportunityInferenceInput(prisma, storeId, {
    windowDays: request.windowDays,
    signalSummary: request.signalSummary,
    existingOpportunityTypes: request.existingOpportunityTypes,
  });
  if (!input) {
    return { skipped: true, reason: 'store_not_found' };
  }

  const withinBudget = await checkLlmBudget(prisma, tenantKey);
  if (!withinBudget) {
    console.warn(LOG_PREFIX, 'LLM budget exceeded, skipping inference for store:', storeId);
    return { skipped: true, reason: 'budget_exceeded' };
  }

  const { full: promptFull } = buildOpportunityPrompt(input);
  let rawText;
  let skippedReason;
  try {
    const llmResult = await callLlmForOpportunities(prisma, promptFull, tenantKey);
    rawText = llmResult?.text ?? null;
    skippedReason = llmResult?.skippedReason;
  } catch (e) {
    console.warn(LOG_PREFIX, 'LLM unavailable:', e?.message);
    return { skipped: true, reason: 'llm_unavailable' };
  }

  if (rawText == null || rawText === '') {
    return { skipped: true, reason: skippedReason ?? 'llm_no_response' };
  }

  const { valid: validatedOpportunities } = parseOpportunitiesResponse(rawText);
  let created = 0;

  for (const opp of validatedOpportunities) {
    await prisma.intentOpportunity.create({
      data: {
        storeId,
        type: opp.type,
        summary: opp.title,
        evidence: { description: opp.description, confidence: opp.confidence, reasoning: opp.reasoning },
        recommendedIntentType: opp.suggestedIntentType,
        payload: opp.suggestedPayload ?? {},
        source: 'llm_inference',
      },
    });
    created++;
  }

  return { created, opportunities: validatedOpportunities };
}
