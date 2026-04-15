/**
 * Heuristic alignment of step output vs mission hypothesis (Sprint 3). No LLM.
 */

function computeHeuristicAlignment(hypothesis, stepKey, outputState) {
  if (!outputState) return 0.5;
  // hypothesis may be null if not yet built — score on outputState alone

  let score = 0.5;
  const out = outputState ?? {};

  if (stepKey === 'create_promotion') {
    if (out.promotionId && String(out.promotionId).trim()) score += 0.2;
    if (out.copy && out.copy.headline) score += 0.1;
    if (out.instanceId && String(out.instanceId).trim()) score += 0.1;
    if (out.product && out.product.name) score += 0.1;
  }
  if (stepKey === 'campaign_research') {
    if (out.marketReport || out.summary) score += 0.3;
    if (out.targetAudience) score += 0.2;
  }
  if (stepKey === 'launch_campaign') {
    if (out.promotionId && String(out.promotionId).trim()) score += 0.2;
    if (out.landingPageUrl || out.phase) score += 0.2;
  }

  return Math.min(1.0, score);
}

export async function scoreAlignment(hypothesis, stepKey, inputState, outputState) {
  void inputState;
  try {
    const heuristic = computeHeuristicAlignment(hypothesis, stepKey, outputState);
    return {
      hypothesisAlignment: heuristic,
      deviation: heuristic < 0.4
        ? `Step ${stepKey} output did not match expected outcome: ${hypothesis?.expectedOutcome ?? 'unknown'}`
        : null,
      scoredBy: 'heuristic',
      stepKey,
      scoredAt: new Date().toISOString(),
    };
  } catch {
    return {
      hypothesisAlignment: 0.5,
      deviation: null,
      scoredBy: 'fallback',
    };
  }
}

