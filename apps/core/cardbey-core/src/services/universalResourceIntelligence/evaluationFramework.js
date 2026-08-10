/**
 * Phase 3 evaluation framework — measure usefulness, not candidate count.
 */

const memEvents = [];

export function resetEvaluationForTests() {
  memEvents.length = 0;
}

/**
 * @param {object} event
 */
export function recordEvaluationEvent(event = {}) {
  const row = {
    id: `urieval_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    ...event,
  };
  memEvents.push(row);
  return row;
}

export function attachEvaluationEvent(workspaceEvaluation, event) {
  const base = workspaceEvaluation && typeof workspaceEvaluation === 'object'
    ? workspaceEvaluation
    : { events: [] };
  const events = Array.isArray(base.events) ? [...base.events] : [];
  const row = recordEvaluationEvent(event);
  events.push(row);
  return { ...base, events };
}

/**
 * Summarize metrics for a workspace or global buffer.
 */
export function summarizeEvaluation(evaluationOrEvents) {
  const events = Array.isArray(evaluationOrEvents)
    ? evaluationOrEvents
    : evaluationOrEvents?.events || memEvents;

  const byType = {};
  for (const e of events) {
    byType[e.type] = (byType[e.type] || 0) + 1;
  }

  const rejections = events.filter((e) => e.type === 'user_rejection');
  const rejectionReasons = {};
  for (const r of rejections) {
    const reason = r.reason || 'unspecified';
    rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
  }

  const reuseSuccess = events.filter((e) => e.type === 'reuse_success');
  const rightsChecks = events.filter((e) => e.type === 'rights_check');
  const rightsCorrect = rightsChecks.filter((e) => e.correct !== false);
  const retrievals = events.filter((e) => e.type === 'retrieval');
  const retrievalOk = retrievals.filter((e) => e.ok);
  const unavailable = events.filter((e) => e.type === 'resource_unavailable');
  const attributions = events.filter((e) => e.type === 'attribution');
  const attributionOk = attributions.filter((e) => e.ok !== false);

  const intentStarted = events.find((e) => e.type === 'intent_started');
  const draftReady = events.find((e) => e.type === 'draft_ready');
  let timeToDraftMs = null;
  if (intentStarted?.at && draftReady?.at) {
    timeToDraftMs = new Date(draftReady.at).getTime() - new Date(intentStarted.at).getTime();
  }

  const relevanceScores = events
    .filter((e) => e.type === 'relevance' && typeof e.score === 'number')
    .map((e) => e.score);
  const avgRelevance = relevanceScores.length
    ? relevanceScores.reduce((a, b) => a + b, 0) / relevanceScores.length
    : null;

  return {
    ok: true,
    totals: byType,
    metrics: {
      relevanceAvg: avgRelevance,
      rightsCorrectness:
        rightsChecks.length === 0 ? null : rightsCorrect.length / rightsChecks.length,
      successfulReuseCount: reuseSuccess.length,
      userRejectionReasons: rejectionReasons,
      unavailableResourceRate:
        events.length === 0 ? null : unavailable.length / Math.max(1, events.filter((e) => e.type === 'candidate_shown').length || events.length),
      retrievalReliability:
        retrievals.length === 0 ? null : retrievalOk.length / retrievals.length,
      attributionCorrectness:
        attributions.length === 0 ? null : attributionOk.length / attributions.length,
      timeFromIntentToDraftMs: timeToDraftMs,
    },
    note: 'Do not optimize solely for candidate count',
    candidateCountIsNotSuccessMetric: true,
  };
}
