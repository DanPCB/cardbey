/**
 * Builds a structured mission hypothesis from intent + domain context (single LLM call).
 */

import { llmGateway } from '../lib/llm/llmGateway.ts';
import { readEflFeedback } from './eflRagReader.js';

const SYSTEM_PROMPT = `
You are a mission planner for a small business AI assistant.
Given a user's intent and their store context, analyze what the user
is most likely trying to achieve and produce a structured hypothesis.

Return ONLY valid JSON in this exact shape — no preamble, no markdown:
{
  "userGoalSentence": "one sentence describing what the user wants to achieve",
  "assumedConstraints": ["constraint1", "constraint2"],
  "expectedOutcome": "what success looks like for this mission",
  "confidenceScore": 0.75,
  "alternativeReads": [
    { "intent": "alternative interpretation", "probability": 0.2 }
  ],
  "planningHints": ["hint for the task planner to improve execution"]
}
`.trim();

function stripJsonFences(raw) {
  let t = String(raw ?? '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return t;
}

function buildFallback(rawIntent) {
  return {
    userGoalSentence: rawIntent != null ? String(rawIntent) : '',
    assumedConstraints: [],
    expectedOutcome: 'Complete the requested task successfully',
    confidenceScore: 0.5,
    alternativeReads: [],
    planningHints: [],
    builtBy: 'fallback',
    ragSourceCount: 0,
  };
}

function isValidHypothesisParsed(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const goal = obj.userGoalSentence;
  if (typeof goal !== 'string' || !goal.trim()) return false;
  const conf = obj.confidenceScore;
  if (typeof conf !== 'number' || Number.isNaN(conf)) return false;
  return true;
}

/**
 * @param {string} missionId
 * @param {string} rawIntent
 * @param {object|null|undefined} domainContext
 * @returns {Promise<object>}
 */
export async function buildHypothesis(missionId, rawIntent, domainContext) {
  try {
    const eflQuery = `${domainContext?.storeProfile?.storeType ?? 'unknown'} store ${rawIntent}`;
    const eflFeedback = await readEflFeedback(eflQuery, {
      storeType: domainContext?.storeProfile?.storeType,
      intent: rawIntent,
      limit: 5,
      minWeight: 0.5,
    }).catch(() => []);

    const eflSummary =
      eflFeedback.length > 0
        ? `Past mission learnings for similar stores:\n${eflFeedback
            .map((f) => `- [${f.type}] ${f.observation}`)
            .join('\n')}`
        : '';

    const userPrompt = `
Intent: ${rawIntent}
Store type: ${domainContext?.storeProfile?.storeType ?? 'unknown'}
Store name: ${domainContext?.storeProfile?.storeName ?? 'unknown'}
Recent mission outcomes: ${JSON.stringify(domainContext?.recentMissions ?? [])}
Available products: ${JSON.stringify((domainContext?.productCatalog ?? []).slice(0, 5))}
${eflSummary}
`.trim();

    // llmGateway accepts a single prompt string (same pattern as promotionContentGenerator.js).
    const prompt = `${SYSTEM_PROMPT}

[User]
${userPrompt}`.trim();

    const tenantKey =
      (domainContext?.storeId != null && String(domainContext.storeId).trim()) ||
      (missionId != null && String(missionId).trim()) ||
      'default';

    const llmResult = await llmGateway.generate({
      purpose: 'mission_hypothesis',
      prompt,
      provider: 'anthropic',
      maxTokens: 500,
      tenantKey,
      temperature: 0.3,
    });

    const raw = stripJsonFences(llmResult?.text ?? '');
    if (!raw) {
      return buildFallback(rawIntent);
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return buildFallback(rawIntent);
    }

    if (!isValidHypothesisParsed(parsed)) {
      return buildFallback(rawIntent);
    }

    const result = {
      ...parsed,
      assumedConstraints: Array.isArray(parsed.assumedConstraints) ? parsed.assumedConstraints : [],
      alternativeReads: Array.isArray(parsed.alternativeReads) ? parsed.alternativeReads : [],
      planningHints: Array.isArray(parsed.planningHints) ? parsed.planningHints : [],
      expectedOutcome:
        typeof parsed.expectedOutcome === 'string' && parsed.expectedOutcome.trim()
          ? parsed.expectedOutcome
          : 'Complete the requested task successfully',
      builtBy: 'llm',
      ragSourceCount:
        (domainContext?.recentMissions?.length ?? 0) + eflFeedback.length,
      missionId,
    };

    return result;
  } catch (err) {
    console.error('[HypothesisEngine] error:', err?.message ?? String(err));
    return buildFallback(rawIntent);
  }
}
